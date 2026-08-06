# 修复：Undo/Redo 状态标志滞后 + SelectionOverlay 首帧缺失

> 状态：`DONE`（2026-08-06 全部步骤通过）
> 变更文件：`apps/frontend-editor/src/canvas/editor/controller.ts`、`apps/frontend-editor/src/canvas/CanvasView.tsx`。

## 关联需求

阶段目标（用户口头确认）：在启动 M2（拖拽与落点）之前，先修复已定位的画布 bug，再做 UX 细节增强。

本次范围仅包含两个已确认 bug 的修复，不包含 UX 增强（作为后续独立计划）。

## 当前状态与影响范围

### Bug A：Undo/Redo 状态标志滞后一步

**现象**：第一次 `execute()` 后，Inspector 的 Undo/Redo 历史指示（`apps/frontend-editor/src/editor/views/InspectorView.tsx:64-66` 读取 `snapshot.canUndo/canRedo`）仍显示 "empty"，直到下一次操作才变为 "available"。

**根因（证据）**：

- `apps/frontend-editor/src/canvas/editor/controller.ts:48-57`：`execute()` 先调 `this.apply(command)`，之后才 `pushHistory`。而 `apply()` 内部在 `controller.ts:95` 无条件调用 `this.emit()`。
- 因此首次 execute 的 `emit()` 发生在 `pushHistory` **之前**，快照里的 `canUndo` 读到的是 `past.length === 0`（`controller.ts:103`）。
- `controller.ts:87-88` 传入 `applyCanvasCommand` 的 `canUndo/canRedo` 也是 push 前的值，经 `commands.ts:229-244` 的 `committed()` 写入返回结果 `CommittedResult.canUndo/canRedo`（`commands.ts:54-55`），对 `execute()` 而言该返回值恒滞后一步。
- `pushHistory` 同时清空 future（`history.ts:21`）：在 undo 后紧跟 execute 时，`canRedo` 也滞后一次 emit。
- `undo()`/`redo()`（`controller.ts:59-71`）先 pop 再 apply，顺序正确，不受此 bug 影响。

**消费者确认**：grep 显示只有 `InspectorView.tsx:64-66` 消费 `canUndo/canRedo`（读的是 snapshot），暂无任何代码读取 `CommittedResult.canUndo/canRedo` 返回值。

### Bug B：SelectionOverlay 首帧无选择框

**现象**：通过命令新增节点（或 undo/redo 使节点集合变化）后，新节点的选择框/hover 框第一帧不出现，直到用户移动鼠标触发下一次渲染才出现。

**根因（证据）**：

- `apps/frontend-editor/src/canvas/runtime/DocumentRuntime.tsx:26-35`：节点 ref 通过 `registerRef` 回调注册进 `registry`，而 React 的 ref 回调在 **commit 阶段**（DOM 挂载后）才执行。
- `apps/frontend-editor/src/canvas/overlay/SelectionOverlay.tsx:28-33`：渲染期间直接调用 `rectFor()` → `registry.get(nodeId)`（`SelectionOverlay.tsx:61-77`）。
- 新节点首次出现的这次渲染发生在 ref 附加**之前**，`registry.get` 返回 undefined → 无矩形。commit 后 ref 附加、registry 已就绪，但**没有任何状态变化触发重渲染**（registry 是可变 Map，不驱动 React 更新）。
- 已有节点（点击选中）不受影响，因为其 ref 早已注册；这正是该 bug 只在"新增/undo/redo 后首帧"暴露的原因。

### 影响地图

```text
Bug A + Bug B
├─ 用户界面或交互      ✓ Inspector 历史指示滞后；新增/撤销后选择框首帧缺失
├─ 业务规则和状态      ✓ controller 历史 emit 时序（本修复变更点）
├─ 前后端接口或消息协议 ✗ 无（纯前端单应用，无协议）
├─ 数据库/文件/缓存    ✗ 无持久化
├─ 权限与安全          ✗ 无
├─ 测试与验收          ✓ 冒烟脚本 + 浏览器人工验收
├─ 监控、日志与告警    ✗ 无
└─ 发布与回滚          ✓ 无发布流程；回滚=还原两个文件
```

## 方案与边界

### Bug A：controller 统一"先改历史、后 emit"

变更点：仅 `apps/frontend-editor/src/canvas/editor/controller.ts`。

1. `apply()`（`controller.ts:79-97`）**移除内部 `this.emit()`**，只负责执行命令并更新 `document/revision/selection`，返回 `{ result, inverse? }`。
2. `execute()` / `undo()` / `redo()` 各自在**完成历史变更之后**统一调用 `this.emit()`，并通过 `withFreshHistoryFlags()` 覆写返回结果中的 `canUndo/canRedo`。
3. `buildSnapshot()` 不变（本就读取 `this.history`），emit 时机修正后自动携带最新标志。
4. **核心层 `commands.ts` 不改**：`applyCanvasCommand` 的 `canUndo/canRedo` 参数保留。其语义是"进入本次操作前"的历史状态，保证核心纯函数自包含、可直接独立测试；controller 负责在返回前覆写为最新值。

边界：

- 不动 `commands.ts`、`history.ts`、`document.ts`、`canvas-node.ts`（核心层零变更，19 项冒烟断言继续有效）。
- 不动 `InspectorView.tsx`（它读 snapshot，修复后自动正确）。
- rejected / no-op 结果不含 history 标志，`withFreshHistoryFlags` 原样返回；`emit()` 在 reject/no-op 时仍执行（与现状一致，代价仅一次多余渲染，不改）。

### Bug B：CanvasView 在 commit 后触发 Overlay 重渲染

变更点：仅 `apps/frontend-editor/src/canvas/CanvasView.tsx`。

新增一个 overlay tick 状态，用 `useLayoutEffect` 在文档 revision 变化后（此时 ref 已附加、registry 已就绪）强制一次额外渲染。不使用被动 `useEffect`（绘制后才跑会闪烁一帧）。不把 tick 并入既有 `setResizeTick`（ResizeObserver 是另一个外部生命周期，按编码规范 §5.2 不混用）。

## 数据、状态和接口契约

- `CanvasCommandResult`（含 `CommittedResult.canUndo/canRedo`）形状**不变**，仅语义从"apply 时点"变为"命令完成后的最新历史状态"。
- `CanvasEditorSnapshot` 形状不变；`canUndo/canRedo` 语义不变（当前历史状态），只是 emit 时机修正。
- 无持久化、无网络、无跨包契约变化；`editor-shell` 不受影响。
- 状态唯一 owner：历史（`CanvasHistory`）仅由 `CanvasEditorController` 写入；核心层不再承担"返回权威历史标志"的职责（标志由 controller 覆写）。

## 失败、重试和兼容策略

- 失败路径：`undo/redo` 无 entry 时返回 null（`controller.ts:60-63`、`66-69`），行为不变；`execute` 的 rejected/no-op 路径行为不变。
- 假设（不变量）：history 中已提交命令的 inverse 对当前 document 总是合法（由 `commands.ts` 的构造保证：add⇄remove、move⇄move 回原位置）。undo/redo 先 pop 后 apply 的既有顺序保持不变，不引入新风险。
- 兼容性：无旧数据、无旧消费者、无外部接口，无需迁移。
- 回滚：还原 `controller.ts` 与 `CanvasView.tsx` 两文件即可，无残留状态。

## 安全、性能和可观测性

- 安全：无权限/隐私/安全边界变化。
- 性能：Bug A 不增加渲染次数（emit 次数不变，仅时机后移）；Bug B 每次文档变更多一次 Overlay 重渲染（渲染期两次 `getBoundingClientRect`），量级可忽略，且仅在有选/hover 节点时才有实际绘制。
- 可观测性：无日志/监控新增。

## 详细步骤分解（每一步独立可验证）

> 执行顺序：S1 组（Bug A）→ S2 组（Bug B）→ S3 组（回归门禁）。
> S1 与 S2 无相互依赖，但 S3 必须在两者都完成后统一执行。
> 每个 S 完成后回写本文件 `状态` 字段并记录验证输出。

### S1-1 修改 controller.ts：移除 apply() 内的 emit

**改动**：`apps/frontend-editor/src/canvas/editor/controller.ts`

将 `apply()` 末尾的 `this.emit()`（原 `controller.ts:95`）删除，使 `apply()` 只返回 `{ result, inverse? }`，不触发任何通知。

**验证**：
- `pnpm --filter frontend-editor typecheck` 通过
- `pnpm --filter frontend-editor lint` 通过

### S1-2 修改 controller.ts：execute/undo/redo 在历史变更后 emit

**改动**：`apps/frontend-editor/src/canvas/editor/controller.ts`

三个公共方法改为：

```ts
execute(command: CanvasCommand): CanvasCommandResult {
  const applied = this.apply(command)
  if (applied.result.status === 'committed' && applied.inverse !== undefined) {
    this.history = pushHistory(this.history, {
      forward: command,
      inverse: applied.inverse,
    })
  }
  this.emit()
  return this.withFreshHistoryFlags(applied.result)
}

undo(): CanvasCommandResult | null {
  const { history, entry } = popUndo(this.history)
  if (!entry) return null
  this.history = history
  const applied = this.apply(entry.inverse)
  this.emit()
  return this.withFreshHistoryFlags(applied.result)
}

redo(): CanvasCommandResult | null {
  const { history, entry } = popRedo(this.history)
  if (!entry) return null
  this.history = history
  const applied = this.apply(entry.forward)
  this.emit()
  return this.withFreshHistoryFlags(applied.result)
}
```

**验证**：同 S1-1。

### S1-3 新增 withFreshHistoryFlags 私有方法

**改动**：`apps/frontend-editor/src/canvas/editor/controller.ts`

在 `apply()` 与 `buildSnapshot()` 之间新增：

```ts
private withFreshHistoryFlags(
  result: CanvasCommandResult,
): CanvasCommandResult {
  if (result.status !== 'committed') return result
  return {
    ...result,
    canUndo: this.history.past.length > 0,
    canRedo: this.history.future.length > 0,
  }
}
```

**验证**：同 S1-1。

### S1-4 冒烟断言：controller 历史标志时序

**改动**：`/tmp/opencode/core-smoke.test.ts` 追加断言（不入库），`pnpm dlx tsx /tmp/opencode/core-smoke.test.ts` 运行：

1. 首次 `execute(addNode)` 后：`controller.getSnapshot().canUndo === true`，且返回结果 `.canUndo === true`；
2. `undo()` 后：`canRedo === true`，`canUndo === false`（仅一条历史时）；
3. `redo()` 后：`canUndo === true`，`canRedo === false`；
4. undo 后再次 execute（pushHistory 清空 future）：`canRedo === false`；
5. 原 19 项断言仍全部通过（核心层未被误改）。

### S2-1 修改 CanvasView.tsx：新增 overlay tick 状态

**改动**：`apps/frontend-editor/src/canvas/CanvasView.tsx`

1. 顶部 import 增加 `useLayoutEffect`（现有第 1 行 `import { useEffect, useRef, useState } from 'react'`）；
2. 在 `const [, setResizeTick] = useState(0)`（原第 33 行）附近新增：

```tsx
const [, setOverlayTick] = useState(0)
```

### S2-2 修改 CanvasView.tsx：revision 变化后强制重渲染

**改动**：`apps/frontend-editor/src/canvas/CanvasView.tsx`

在 `useEffect`（ResizeObserver）之后新增：

```tsx
useLayoutEffect(() => {
  setOverlayTick((tick) => tick + 1)
}, [snapshot.revision])
```

**验证**：`pnpm --filter frontend-editor typecheck && pnpm --filter frontend-editor lint` 通过。

### S2-3 浏览器人工验收（Bug B 关键场景）

dev server 启动后逐项检查：

1. 新增一个节点 → **不移动鼠标**，选择框与标签立即出现；
2. 指针移入新节点 → hover 框立即出现；
3. Ctrl+Z 撤销新增、Ctrl+Shift+Z 重做 → 每帧选择框即时正确；
4. 删除选中节点 → 选择框立即切到父节点，无残留；
5. 缩放/平移过程中选择框随视口即时跟随（既有行为不回归）。

### S3-1 全量回归门禁

1. `pnpm --filter frontend-editor build` 成功；
2. dev server 启动后复验 S1-4 的浏览器场景（Inspector 历史指示即时正确）；
3. 复验 S2-3 全部场景；
4. 输出：typecheck/lint/build 结果、浏览器验收记录（环境与版本、操作步骤、通过/未通过、已知限制）。

## 执行记录（2026-08-06）

- S1-1~S1-3：controller.ts 三处修改完成；`pnpm --filter frontend-editor typecheck && lint` 通过（0/0）。
- S1-4：`/tmp/opencode/core-smoke.test.ts` 追加 11 项时序断言，共 30 项全部通过。
- S2-1~S2-2：CanvasView.tsx 修改完成；typecheck/lint/build 通过（dist 366.50 kB JS / 152.37 kB CSS）。
- S2-3/S3-1：`/tmp/opencode/browser-smoke.test.js`（Chrome headless + CDP，窗口 1600×1000）10 项全部通过，覆盖：点击选中出框、Delete 后 Undo 指示即时 available、撤销恢复节点首帧出选择框、hover 框、重做状态。

## 发布与回滚

- 本仓库为开发期应用，无正式发布管道；S3-1 通过即视为发布验证。
- 回滚：还原两个变更文件；无数据迁移，无 feature flag 需求。

## 取舍和未决问题

| 取舍点 | 选择 | 原因 | 未来重估条件 |
| --- | --- | --- | --- |
| 核心 `CommittedResult` 是否移除 `canUndo/canRedo` | 保留，controller 覆写（Option 1） | 改动最小、核心纯函数自包含、19 项冒烟断言零变更；历史 owner 已是 controller | `CommittedResult.canUndo/canRedo` 出现首个真实消费方时，改为从核心移除并由 controller 单独提供 |
| Overlay 是否把 DOM 读取移出渲染期 | 本次不移，用 tick 保证读时点正确（Approach A） | 修复行数最少，直接命中"首帧缺失"根因；读 DOM 于渲染期在 M3/M4 拖拽/多选叠加前属于可接受快照式读取 | M3 引入拖拽句柄/多选框且 Overlay 尺寸计算复杂化时，改为 `useLayoutEffect` + state 承载 rect 的 Approach B |
| tick 是否并入既有 `setResizeTick` | 否，独立状态 | 编码规范 §5.2：一个 Effect 只同步一个外部生命周期 | 无 |

未决问题：无阻断性问题。UX 细节增强（用户要求的"提升 UX 的细节"）不在本次范围，作为下一个独立计划，建议包含：hover 框与选择框同帧联动、缩放时悬停反馈、以及 Inspector 历史指示的可访问性名称。
