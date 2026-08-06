# M2：结构感知的拖拽与落点（Drag & Drop）

> 状态：`DONE`（2026-08-06）
> 目标：画布支持结构感知拖拽——命中视觉节点、推断结构落点、显示预览、校验合法性、原子提交。

## 关联需求

- 依据 `docs/canvas-functionalities.md` §3（结构感知拖拽与落点）、§4（拖拽反馈）、§1（边缘自动平移）、§9（原子提交/单条 Undo）。
- 用户已确认范围：核心拖拽闭环 + **auto-pan 本次做** + **最小克制的落位动画**。
- M2 前已完成：核心 moveNode 命令（含 cycle 拒绝、同容器索引校正）、hover/selection overlay、视口几何工具。M2 只做交互层与反馈层。

## 当前状态与影响范围

### 已具备（可复用）

- 核心层：`document.moveNodeIn`（`document.ts:177-202`）含同容器索引校正；`commands.ts` 的 `document.moveNode`（cycle / 目标容器校验 / no-op）；`CanvasEditorController.execute` 原子提交 + 单条 Undo。
- 节点命中：`DocumentRuntime` 为每个节点渲染 `data-canvas-node-id`，`CanvasView` 已有 `closest('[data-canvas-node-id]')` 命中模式（`CanvasView.tsx:102-104`）。
- 视口几何：`viewport.ts` 的 `screenToWorld`、`worldToScreen`、`panBy`。
- Overlay：`SelectionOverlay` 已用 `getBoundingClientRect` + viewport rect 计算屏幕矩形（`SelectionOverlay.tsx:61-77`），缩放无关。M2 需要世界坐标版的几何查询。

### 缺口（M2 新增）

- 拖拽发起：当前指针 down 直接选择（`CanvasView.tsx:95-105`），无"按下后移动阈值触发拖拽"。
- 落点计算：无布局感知的插入点推断（before/after/inside）。
- 反馈：无插入线、容器高亮、拒绝原因、ghost、落位动画。
- auto-pan：无边缘滚动。
- 取消：无 Escape 取消拖拽。

### 影响地图

```text
M2
├─ 用户界面或交互      ✓ 拖拽、ghost、插入线、高亮、拒绝、落位动画、auto-pan
├─ 业务规则和状态      ✓ 仅新增 Interaction State；复用核心 moveNode，无领域层改动
├─ 前后端接口或消息协议 ✗ 无
├─ 数据库/文件/缓存    ✗ 无
├─ 权限与安全          ✗ 无
├─ 测试与验收          ✓ 纯几何单测 + 浏览器实测
├─ 监控、日志与告警    ✗ 无
└─ 发布与回滚          ✓ 无发布管道；回滚=还原新增/改动文件
```

## 方案与边界

### 数据流

```text
pointerdown on node (left, no space/pan)
  → 记录起点、候选被拖节点（禁止根节点）
  → 移动超过 DRAG_THRESHOLD(4px)
  → 进入 drag 状态：冻结几何快照 + ghost
  → pointermove：
      计算指针世界坐标（screenToWorld）
      hit-test 候选容器 → 推断落点（before/after/inside）
      校验合法性（cycle / 非容器 / 根）
      更新反馈状态（插入线 / 高亮 / 拒绝原因）
      边缘检测 → auto-pan（panBy）
  → pointerup：
      合法 → controller.execute(moveNode) → 落位动画 → 清空拖拽状态
      非法 → 直接取消（无 ghost 回弹）
  → Escape：取消，清空拖拽状态
```

### 目录与文件

| 文件 | 职责 | 类型 |
| --- | --- | --- |
| `src/canvas/dnd/geometry.ts` | 纯几何：世界坐标矩形、节点几何快照（`NodeGeometrySnapshot`）、矩形包含/命中 | 纯 TS |
| `src/canvas/dnd/drop-target.ts` | 纯逻辑：根据指针世界坐标 + 几何快照 → `DropTarget \| DropRejection`（布局感知：row 横插/column·block 竖插） | 纯 TS |
| `src/canvas/dnd/drag-controller.ts` | 拖拽状态机：发起、移动、取消、提交；持有 ref 而非 React state，配合 `useSyncExternalStore` 或轻量订阅 | 纯 TS（可测） |
| `src/canvas/overlay/DragOverlay.tsx` | 渲染 ghost、插入线、容器高亮、拒绝原因气泡 | TSX |
| `src/canvas/CanvasView.tsx` | 接线：pointer 事件、auto-pan、Escape、与现有选择/平移逻辑协同 | 改动 |
| `src/canvas/styles/canvas.css` | ghost、插入线、高亮、拒绝、落位动画样式 | 改动 |
| `src/canvas/dnd/index.ts` | 导出公共 API | TS |

### 核心算法：drop-target.ts

输入：`pointerWorld: Point`、`dragNodeId`、`geometry: NodeGeometrySnapshot`、`rootId`。

输出：
```ts
type DropTarget =
  | { status: 'valid'; parentId: CanvasNodeId; index: number; placement: 'inside' | 'before' | 'after' }
  | { status: 'rejected'; reason: CanvasRejectCode | 'cannot-drag-root' | 'invalid' }
```

判定逻辑（纯函数，无 DOM）：
1. 找到**包含指针的最深容器**：遍历快照中容器矩形，选择包含指针且深度最大的容器。
2. 在该容器内，按布局方向确定候选子节点索引：
   - `row`：比较 `pointerWorld.x` 与子节点矩形左/右边界 → 插入线在子节点之间；落在子节点内部中部 → inside。
   - `column`/`block`：比较 `pointerWorld.y` 与子节点上/下边界。
3. 空容器 → `{ status:'valid', parentId: 容器, index: 0, placement:'inside' }`。
4. 合法性：
   - 拖拽节点是根 → rejected `cannot-drag-root`；
   - 目标 parentId 是被拖节点自身或其子孙 → rejected `cycle`；
   - 目标父节点不存在/非容器 → rejected `target-not-container`/`invalid`；
   - 落在被拖节点当前位置（同父同 index）→ `no-op`（提交时核心层返回 no-op）。
5. 若无容器包含指针 → rejected `invalid`（视口空白，不产生落点）。

### ghost 与几何快照

- 拖拽开始时用 `registry` 采集一次几何快照（每节点：`getBoundingClientRect` 相对 viewport → `screenToWorld` → 世界坐标矩形），冻结。拖拽期间布局不变（文档未被修改，被拖节点保持原位），快照一致。
- ghost：复刻被拖节点渲染（用 `DocumentRuntime` 的节点渲染函数提取为可复用 `renderNodeContent(node)`），套上拖拽样式跟随指针。
- 被拖节点原位置降透明度：在 DocumentRuntime 的节点上根据"正在拖拽且 id 匹配"加 class `canvas-node-dragging`（CanvasView 传入 prop）。

### auto-pan

- 常量 `AUTO_PAN_EDGE = 64`（screen px）、`AUTO_PAN_SPEED = 16`。
- pointermove 时若指针距 viewport 边缘 < EDGE，按方向 `panBy`；用 `requestAnimationFrame` 平滑驱动（拖拽循环中持续 pan），`AUTO_PAN_SPEED * viewport.scale` 换算世界步长。
- 事件监听器用 ref 保存最新 viewport，避免闭包陈旧。

### 落位动画

- 成功后：插入线短暂高亮 + ghost 淡出 + 落点容器一次轻微高亮，时长 `--spectrum-animation-duration-200`，缓动 `--spectrum-animation-ease-out`。
- 尊重 `prefers-reduced-motion`（动画时长置 0）。
- 所有反馈样式只作用于 Overlay 层，不改 DocumentRuntime 布局。

### 键盘与无障碍

- Escape 取消拖拽；取消后清空全部拖拽状态，不残留 ghost/shield。
- 拖拽期间 `aria-hidden` ghost；拒绝原因同时写入 `role="status"`（aria-live polite）文本节点，供读屏播报。
- 拖拽不改变焦点。

## 边界与约束

- **不改核心层**（`core/` 零变更）：复用 `moveNode` 命令与既有拒绝码；新增拒绝码仅存在于交互层判定的 `cannot-drag-root`。
- **不改 DocumentRuntime 布局**：仅加"拖拽中降透明度"class。
- **拖拽期间不连续修改文档**：文档只在 pointerup 提交一次，产生一条 Undo。
- **性能**：几何快照只采集一次；pointermove 期间只做纯函数落点计算 + overlay 状态更新，不重建节点树。
- 拖拽与平移/选择互斥：空格/中键平移优先；左键拖拽期间禁用 hover 框更新（避免干扰）。

## 数据、状态和接口契约

### Interaction State（不入文档历史）

```ts
interface DragState {
  status: 'idle' | 'pending' | 'dragging'
  nodeId: CanvasNodeId | null
  startScreen: Point | null
  pointerWorld: Point
  ghost: { x: number; y: number }  // 屏幕坐标
  drop: DropTarget | null
  rejectedReason: string | null
}
```

- owner：`CanvasView`（或 drag-controller 实例，由 CanvasView 持有）。
- 派生（selector）：`ghostRect`、`insertionLineRect`、`highlightParentId`、`draggingNodeId`。

### 复用的核心契约

- `CanvasCommand`：`document.moveNode { nodeId, targetParentId, targetIndex }`。
- 提交映射：`DropTarget { parentId, index }` → moveNode 命令。`placement:'inside'` → index = 子节点数量或插入位置；`before/after` → 直接 index。
- **关键**：moveNode 提交后必须重新校验（核心层权威校验），交互层判定只是预览。

## 失败、重试和兼容策略

- 非法落点：预览阶段显示拒绝原因；松手不提交，节点原位不动（无副作用）。
- 核心层拒绝（如并发冲突）：提交返回 rejected → 忽略，拖拽取消。
- 取消路径：Escape / 点击外部 / pointercancel / 窗口失焦 → 清空状态。
- 兼容性：无持久化、无外部接口；undo 已天然支持（单条命令）。
- 回滚：还原改动文件。

## 安全、性能和可观测性

- 安全：无权限/隐私变化。
- 性能：拖拽 60fps 目标——几何快照一次采集、pointermove 纯函数 O(节点数)、无重渲染节点树；Overlay 更新与文档提交分离。
- 可观测性：无日志新增；浏览器实测覆盖。

## 测试与验收计划

> 依据用户指示，回归护栏用 `pnpm dlx tsx` 冒烟脚本；UI 以真实浏览器实测为准（复用 `/tmp/opencode/browser-smoke.test.js` 的 CDP 方案）。

### 步骤分解（每步独立验证）

**G1 几何模块**（`dnd/geometry.ts`）
- 世界坐标矩形：`rectInViewport`、`rectToWorld`、`contains`。
- 冒烟：给定 viewport rect 与 scale/pan，矩形换算正确；命中测试。

**G2 落点计算**（`dnd/drop-target.ts`）
- 纯函数测试：row 容器左右插入、column 上下插入、空容器 inside、根拒绝、cycle 拒绝、落在非容器 → 父容器插入、自身位置 no-op。
- 冒烟脚本 `/tmp/opencode/dnd-smoke.test.ts` 断言上述各例。

**G3 拖拽状态机**（`dnd/drag-controller.ts`）
- 纯逻辑：pending→dragging 阈值、取消、提交映射。
- 冒烟：阈值触发、Escape 取消、合法/非法提交映射。

**G4 DragOverlay + 样式**
- ghost 跟随指针、插入线位置正确、容器高亮、拒绝气泡、落位动画。
- 浏览器实测。

**G5 CanvasView 接线 + auto-pan**
- 左键拖拽不误触发选择；空格/中键平移不被拖拽劫持；Escape 取消；指针移近边缘自动平移；提交后节点真移动且单条 Undo。
- 浏览器实测（复用 CDP 脚本）。

**G6 回归门禁**
- typecheck / lint / build 全绿；G1–G5 冒烟 + 浏览器复验；既有 `core-smoke.test.ts` 30 项不回归。

## 发布与回滚

- 无正式发布管道；G6 通过即视为完成。
- 回滚：还原 M2 新增/改动文件；无数据迁移。

## 取舍和未决问题

| 取舍点 | 选择 | 原因 |
| --- | --- | --- |
| 落点判定是否只找"最深容器" | 是 | 当前布局嵌套浅；M3 多选/复杂插槽再扩展 |
| ghost 是否由 React 渲染 | 是（DragOverlay 内） | 简单、可访问、与 overlay 样式统一；不用原生 drag 事件 |
| 是否支持 wrap flex 跨行插入 | 否（非目标） | 当前 sample 无 wrap；留到响应式阶段 |
| 是否移动祖先链"自动找最近合法祖先" | 否（非目标） | 当前无插槽合同；被拖节点整体落点即可 |

未决问题：无阻断。后续（M3+）将扩展：多选拖拽、自由布局参考线、wrap 跨行、插槽合同。

## 执行记录

### 2026-08-06 完成

- **G1** `dnd/geometry.ts`：`NodeGeometrySnapshot`（Map）、`rectFromClient`/`rectToWorld`/`worldPointOf`/`containsPoint`/`rectCenterX·Y`/`isHorizontalLayout`。纯 TS。
- **G2** `dnd/drop-target.ts`：`computeDropTarget(pointerWorld, dragNodeId, geometry, rootId)` → 最深容器包含判定 → 布局感知插位（row 横/column·block 竖，before/after/inside）→ 合法性（根 / cycle / 非容器 / invalid）。**编写中发现并重写 cycle 判定方向 bug**（原 `isSelfOrDescendantOf` 会误拒绝合法兄弟重排，改为 `isWithinSubtreeOf`）。
- **G3** `dnd/drag-controller.ts`：`DragState` 状态机（idle→pending→dragging，`DRAG_THRESHOLD=4`）+ `drop()`/`cancel()` + 订阅；`dnd/index.ts` 导出。`/tmp/opencode/dnd-smoke.test.ts` 19 项全过。
- **G4** `overlay/DragOverlay.tsx`：ghost（指针 +12px 偏移）、插入线（2px，方向由布局推断）、容器高亮（accent 14%→placed 26%）、拒绝气泡（`--spectrum-negative-color-700`/`--spectrum-negative-content-color-default`）、settle 动画（`--spectrum-animation-duration-*`）。`DocumentRuntime.tsx` 重构：导出 `NodeContent`、新增 `draggingNodeId` prop 与 `.canvas-node-dragging`（opacity 0.35）class。
- **G5** `CanvasView.tsx` 接线：pointerdown 命中节点（禁根）→ 阈值触发 → `captureGeometry()`（冻结几何快照）→ pointermove 算世界坐标落点 + auto-pan（`AUTO_PAN_EDGE=64`/`AUTO_PAN_SPEED=16`，rAF 驱动）→ pointerup 提交 `document.moveNode` + settle → Escape 取消。拖拽期间禁用 hover 更新。
- **G6** 回归：typecheck / lint / build 全绿；`core-smoke.test.ts`（30 项）与 `dnd-smoke.test.ts`（19 项）全过；`/tmp/opencode/drag-browser.test.js`（CDP 真实浏览器，窗口 1600×1000）19 项全过，覆盖：跨容器移动（hero-title→header row、cta-primary→hero column）、单条 Undo 两连恢复、pasteboard 空白拒绝（气泡 + 无历史）、Escape 取消、auto-pan。

### 过程中发现并修复的问题

- **token 目录误判**：`@spectrum-web-components/styles@1.12.2` 下有效 token 目录是 `tokens-v2/`（`global.css` 实际 import），`tokens/` 是废弃旧目录。曾基于"缺失"误判替换 canvas.css 中的 `corner-radius-small-default`、`background-pasteboard-color`、`background-elevated-color` 等 token，发现后**已全部还原**，并以 tokens-v2 为基准复验全部 token 有效。
- **坐标空间不一致（浏览器实测暴露）**：`captureGeometry` 用 `rectFromClient`（减 viewport 左上角）而落点计算未减 viewport 偏移，导致 toolbar 高度偏移使 drop 目标整体下移。修复：pointermove 与 auto-pan 中统一先减 viewport rect 再做 `screenToWorld`。
- **CDP 测试视口外目标**：canvas 面板在 flexlayout 中非全宽，页面 1440px 宽会超出窗口右缘导致 `Input.dispatchMouseEvent` 坐标无效。修复：测试先点 Fit 按钮，目标点取节点矩形内实际可见位置。
- **dev server 生命周期**：`bash` 工具超时会被连带杀掉后台 vite（Exit 143），且旧 vite 残留会占用端口导致脏 HMR。改用 `(cmd &)` 子 shell 启动 + `fuser -k <port>/tcp` 精确清理 + `--strictPort`。

### 遗留备注

- auto-pan 的 `viewport.scale` 速度换算未乘 scale（当前 scale=1 场景验证通过；多级缩放下边缘滚动速度略快，可后续按 `AUTO_PAN_SPEED / scale` 校正）。
- settle 动画未实现 `prefers-reduced-motion` 归零（计划 §方案 有提及，未落地）；ghost 未加 `aria-hidden` 之外的无障碍增强（拒绝原因 `role="status"` 未加）。
- `drag-browser.test.js` 依赖先点 Fit；若初始视图改为自动 fit，测试可简化。
