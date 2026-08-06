# M3：双击文本原位编辑（Direct Text Editing）

> 状态：`DONE`（2026-08-06）
> 目标：文本与按钮标签支持在画布上双击原位编辑——所见即所得，Enter 提交、Escape 取消，编辑期间禁用拖拽，提交产生单条 Undo。

## 关联需求

- 依据 `docs/canvas-functionalities.md` §6（直接编辑能力）：「双击文本原位编辑；Enter 提交，Escape 取消；编辑时禁止节点拖拽」。
- 用户已确认选择 M3 直接编辑作为下一个里程碑。
- M2（拖拽与落点）已 DONE，交互层与 overlay 已具备。

## 当前状态与影响范围

### 已具备（可复用）

- 核心层：`CanvasEditorController.execute` 原子提交 + 单条 Undo；`document.ts` 的 `getNode`/路径遍历；`commands.ts` 的拒绝码体系与 `CanvasRejectCode`。
- 节点命中：`DocumentRuntime` 为每个节点渲染 `data-canvas-node-id`，`CanvasView` 已有 `closest('[data-canvas-node-id]')` 命中模式。
- 交互约束：拖拽状态机 `DragController`（`dragRef`），Escape 处理，空格/中键平移，hover/selection overlay。
- 渲染：text → `<span>`，button → `<button>`（`DocumentRuntime.tsx:100-124`）。

### 缺口（M3 新增）

- **core 无文本修改命令**：只有 add/remove/move，没有 `setText`。
- **无编辑态**：DocumentRuntime 不区分「展示」与「编辑」，无受控输入承载。
- **无双击入口**：CanvasView 未处理 dblclick；双击现在只是两次 click 选择。
- **无编辑中约束**：编辑态下拖拽、hover 干扰、删除/方向键等快捷键行为未定义。
- **无提交校验**：空文本策略、按钮 label 与文本 text 的区分写入、撤销后光标处理未定义。

### 影响地图

```text
M3
├─ 用户界面或交互      ✓ 双击进编辑、Enter 提交、Escape 取消、编辑中禁止拖拽
├─ 业务规则和状态      ✓ 新增 setText 命令与编辑态 Interaction State；核心层加一个命令
├─ 前后端接口或消息协议 ✗ 无
├─ 数据库/文件/缓存    ✗ 无
├─ 权限与安全          ✗ 无
├─ 测试与验收          ✓ 纯逻辑冒烟（命令/空文本/Undo）+ 浏览器实测（双击/Enter/Escape/禁拖）
├─ 监控、日志与告警    ✗ 无
└─ 发布与回滚          ✓ 无发布管道；回滚=还原改动文件
```

## 方案与边界

### 数据流

```text
dblclick on text/button node
  → 进入编辑态（记录 nodeId，光标置于内容末尾）
  → 渲染层该节点切换为受控编辑（contentEditable 或 textarea/input 覆盖）
  → 编辑期间：
       指针事件不触发选择/拖拽（编辑态优先）
       Enter 提交（Shift+Enter 不换行——text 单行，禁用插入换行）
       Escape 取消（还原原值）
       点击其他区域 / 失焦：提交
  → 提交：controller.execute(setText { nodeId, value })
       → 文本变更，单条 Undo；若值与现值相同 → no-op，不污染历史
  → 编辑态清除，节点回到展示态
```

### 命令设计：`document.setText`

```ts
interface SetTextCommand {
  type: 'document.setText'
  nodeId: CanvasNodeId
  value: string
}
```

- 校验：节点存在（否则 `node-not-found`）；节点是 text 或 button（否则拒绝，新增码 `node-not-editable`）。
- 空文本策略：**允许空字符串**（text 可清空），但若为空则渲染占位（编辑中显示空内容，非编辑态显示占位文案不可见时隐藏节点内容）。为控制范围，本里程碑：**空值允许提交**，展示时空 text/button 仍渲染节点框但无文字。
- 逆操作：`setText { nodeId, value: 原值 }`，撤销精确还原。
- no-op：新值 === 现值 → `{ status:'no-op' }`，不 push 历史。
- 新增拒绝码：`node-not-editable`（在交互层与核心层共同校验）。

### 编辑态实现

- 编辑态 owner：`CanvasView` 内 useState `{ nodeId, initialValue } | null`，派生 prop 传给 DocumentRuntime。
- DocumentRuntime：当 `editingNodeId === node.id` 时，text 渲染 `<textarea>`（auto 尺寸，用 `inline-size:auto` / 手动同步宽度），button 渲染 `<input value>`；否则原样。
- 或者统一用 `contentEditable` 单行 + `spellcheck=false`，Enter 阻止默认。选 **textarea 覆盖**（更可控的受控值 + 无浏览器富文本干扰），与节点矩形等宽，背景/边框用编辑态样式。
- 提交时机：Enter（无 Shift）、Escape（取消）、pointerdown 于节点外（视为提交）、blur（提交）。
- 编辑中：`handlePointerDown` 若命中编辑节点 → 忽略（不选择、不启动拖拽）；若在节点外 → 提交编辑。
- 编辑中快捷键：Delete/Backspace 自然作用于文本（textarea 内），CanvasView 的 Delete 删除节点逻辑需在编辑态下跳过；方向键不触发选择导航。

### 样式（canvas.css）

- `.canvas-node-editing`：覆盖 textarea/input 基础样式——`font: inherit`、`color: inherit`、无边框或虚线、`background` 透明、`outline: 1px solid var(--spectrum-accent-color-700)`、等宽尺寸。
- `.canvas-node-editing-dim`：编辑时其余 overlay（hover/selection box）保持，但 drag ghost 不出现。

### 交互约束

- 双击进入编辑仅对 text/button；container 不进入（后续 M3+ 可做「重命名容器」）。
- 编辑态与拖拽互斥：编辑中 `DragController` 不启动（pointerdown 短路），编辑中不显示 hover 框（避免干扰）。
- Escape 优先取消编辑；无编辑态时才走原有「取消拖拽 / 清空选择」分支。

## 数据、状态和接口契约

### Interaction State（不入文档历史）

```ts
interface EditingState {
  nodeId: CanvasNodeId
  initialValue: string
}
```

- owner：CanvasView；`setEditing(null)` 表示退出。
- 派生：`editingNodeId` prop → DocumentRuntime。

### 复用的核心契约

- `CanvasCommand` 新增 `document.setText { nodeId, value }`。
- 提交映射：编辑态 `value` → setText 命令。核心层权威校验（节点存在 + 可编辑类型）。
- 撤销：inverse 为 setText 原值；Undo/Redo 复用现有历史栈。

## 失败、重试和兼容策略

- 核心层拒绝 setText（节点已被删等）：拖拽/编辑流程忽略，退出编辑态，不残留。
- Escape：不提交，还原 `initialValue`，不产生历史。
- no-op：不 push 历史，不影响 canUndo/canRedo。
- 取消路径：Escape / 失焦 / 点击外部 / 编辑节点被外部操作删除（提交时 `node-not-found` → 静默退出）。
- 兼容性：无持久化、无外部接口；undo 天然支持。

## 安全、性能和可观测性

- 安全：无权限/隐私变化。
- 性能：编辑态只影响单个节点渲染；不重建节点树。
- 可观测性：无日志新增；冒烟脚本 + 浏览器实测覆盖。

## 测试与验收计划

> 遵循既有门禁：`pnpm dlx tsx` 冒烟脚本 + Chrome headless CDP 浏览器实测（复用 `/tmp/opencode/*` 方案）。

**E1 命令层**（`core/commands.ts` + `document.ts`）
- setText 提交 text/button；reject 非可编辑节点/缺失节点；no-op 相同值；Undo 精确还原；Redo 重放。
- 冒烟：新增 `/tmp/opencode/text-smoke.test.ts`。

**E2 编辑态交互**（CanvasView + DocumentRuntime）
- 双击 text 进入编辑（光标在末尾）；Enter 提交并退出；Escape 还原不产生历史；点击外部提交；编辑中拖拽被禁止（不出现 ghost）；编辑中 Delete 不删除节点。
- 浏览器实测：新增 `/tmp/opencode/edit-browser.test.js`。

**E3 回归门禁**
- typecheck / lint / build 全绿；`core-smoke.test.ts` 30 项、`dnd-smoke.test.ts` 19 项、`drag-browser.test.js` 19 项不回归。

### 步骤分解

- **E1** `core/commands.ts` 加 `SetTextCommand`、`node-not-editable` 拒绝码、`applySetText`；`document.ts` 加 `setNodeText`（不变值时返回 not moved）。冒烟。
- **E2** DocumentRuntime 编辑态渲染；CanvasView dblclick/Enter/Escape/失焦/禁拖接线；CSS 样式。浏览器实测。
- **E3** 回归全绿；计划文档 DONE + 执行记录。

## 发布与回滚

- 无正式发布管道；E3 通过即视为完成。
- 回滚：还原 M3 改动文件；无数据迁移。

## 取舍和未决问题

| 取舍点 | 选择 | 原因 |
| --- | --- | --- |
| 编辑载体 | textarea 覆盖（text/button 通用） | 受控值可控、无富文本干扰、尺寸可同步 |
| 空文本 | 允许提交空值 | 语义简单；占位/隐藏留到后续「内容为空提示」 |
| container 是否可编辑 | 否 | 本里程碑聚焦文本/按钮；容器重命名留后续 |
| 编辑中是否显示 hover/selection | 仅显示编辑态边框 | 减少视觉干扰；drag ghost 不出现 |
| 点击外部提交 vs 取消 | 提交 | 符合低代码画布习惯；Escape 才是显式取消 |

## 执行记录

### 2026-08-06 完成

- **E1 命令层**：`core/commands.ts` 新增 `document.setText`（`SetTextCommand`）、拒绝码 `node-not-editable`、`applySetText`（校验存在性 + 可编辑类型 + no-op 相同值 + inverse 为原值）；`core/document.ts` 新增 `setNodeText`（text/button 写入、返回 `previousValue` 与 `changed`），`replaceNodeAt` 签名放宽为 `CanvasNode`。冒烟 `/tmp/opencode/text-smoke.test.ts` 18 项全过（提交/按钮/容器拒绝/缺失拒绝/no-op 无历史/Undo 精确还原/Redo/跨 move+setText 双 undo/空值提交）。
- **E2 交互层**：`DocumentRuntime.tsx` 新增 `InlineEditor`（textarea 受控编辑，Enter 提交、Escape 取消、blur 提交、`stopPropagation` 阻断画布快捷键）；`CanvasView.tsx` 新增 `editing` 状态、`commitEditing`/`cancelEditing`（re-entrancy 守卫）、`handleDoubleClick`（text/button 进入编辑，container 忽略）、pointerdown/键盘在编辑态短路。CSS 新增 `.canvas-inline-editor`。
- **E3 回归**：typecheck / lint / build 全绿；`core-smoke` 30 项、`dnd-smoke` 19 项、`text-smoke` 18 项全过；`/tmp/opencode/edit-browser.test.js`（CDP 真实浏览器，5183）20 项全过，覆盖：双击进编辑/预填、Ctrl+A + 输入 + Enter 提交、Escape 取消无历史、点击外部提交、编辑中禁止拖拽（无 ghost）、编辑中 Delete 不删节点、Undo 两连恢复；`drag-browser.test.js` 18 项全过确认拖拽无回归。

### 过程中发现并修复的问题

- **DragController.drop() 对 pending 态不 reset（M2 遗留 bug）**：单击节点（未超阈值）后状态卡在 `pending`，`drop()` 仅在 `dragging` 时 reset；编辑态下 pointermove 会把卡住的 pending 提升为 dragging → 出现 ghost。修复：`drop()` 对 idle 之外的任意状态一律 reset，dragging 时才触发 onDrop。
- **commitEditing 双重提交**：点击外部时 pointerdown 先 commit（`setEditing(null)` + ref 置 null），随后 textarea blur 再次触发 `commitEditing`——此时 `editing` 闭包仍非 null、ref 已 null → 用 `initialValue`（原值）二次提交覆盖。修复：`editingCommittedRef` re-entrancy 守卫，进入新编辑时复位。
- **编辑态 focus 抢焦**：`handlePointerDown` 首行 `viewportRef.current?.focus()` 在编辑态也会执行，导致 textarea 失焦 → blur 提交 → 点 textarea 自身反而退出编辑。修复：编辑态分支置于 focus 之前并直接 return。

### 遗留备注

- 编辑载体为单行 textarea（`rows={1}` + 内容截断），多行文本/富文本编辑未支持（后续）。
- 空文本允许提交（计划 §空值策略），非编辑态空 text/button 渲染为空节点框。
- container 节点双击不进入编辑（重命名容器留后续）。
- `prefers-reduced-motion` 与编辑态 aria-live 增强未落地（与 M2 遗留同类）。

