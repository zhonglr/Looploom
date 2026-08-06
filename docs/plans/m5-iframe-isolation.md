# M5：iframe 渲染隔离架构

> 状态：`PLANNED`（2026-08-06）
> 目标：
> 1. 将画布页面渲染隔离进 iframe，实现样式隔离（用户组件与编辑器 CSS 互不污染）；
> 2. **修复缩放文字模糊**：缩放改用布局级缩放（iframe 内按缩放后像素 reflow 渲染），替代 Host 的 `transform: scale()` 位图重采样；
> 3. 文档/命令/历史保持单一 owner，无第二个历史栈；同进程通信保证无延迟不卡。

## 关联需求

- 依据 `docs/canvas-functionalities.md` §8（Design 与 Preview 的严格边界）、§11（Overlay 必须独立于用户组件）。
- 用户已确认：
  - M5 = iframe 隔离架构；
  - **完全隔离**：Host/iframe 内容划分由实施者定；
  - **样式隔离为主**（本次核心目标）；
  - **硬约束**：不能出现延迟、不能卡、不能同时维护两个历史栈。
  - 用户反馈：画布放大后字体模糊（缩放精度问题），纳入本次一并处理。
- 前置里程碑 M2（拖拽与落点）、M3（双击原位编辑）已 DONE。

## 当前状态与影响范围

### 已具备（可复用）

- `CanvasEditorController`：文档模型 + 命令（add/remove/move/setText）+ 历史栈 + 选择 + revision（`canvas/editor/controller.ts`），**目前是唯一 owner**。
- `CanvasView`：视口变换、拖拽状态机、overlay 渲染、键盘/指针交互，全部读 `registry`（`Map<nodeId, HTMLElement>`）做几何计算。
- `DocumentRuntime`：从 `document` 纯函数式渲染节点树（无状态、无副作用），是理想的可投影渲染单元。
- `editor-shell` 的 popout 已存在（flexlayout 内置，非自建 iframe）。

### 缺口（M5 新增）

- **无 iframe 承载**：需要独立的 iframe 文档入口（HTML + 挂载点 + 样式作用域）。
- **跨帧投影**：Host→iframe 传递文档快照；iframe 渲染 + 回报节点几何。
- **几何跨帧**：`registry` 现在持有 iframe 内 DOM 元素，overlay/拖拽的 `getBoundingClientRect` 需跨帧换算。
- **样式隔离**：global.css 的 token 导入目前全局生效；iframe 内需独立 CSS 作用域。
- **缩放文字模糊**：现状 `canvas-world` 用 `transform: translate() scale()`（`CanvasView.tsx`），对已栅格化的位图做重采样，非整数倍（如 125%、133%）时文字插值模糊。iframe 不会自动改善——若 iframe 仍被 `transform: scale()` 包裹，模糊依旧。改善必须在 iframe 内改用**布局级缩放**。
- **DocumentRuntime 与交互耦合**：`DocumentRuntime`（`runtime/DocumentRuntime.tsx`）现接受 `registry`、`draggingNodeId`、`editingNodeId`、`editingValueRef`、`onEditCommit/Cancel`，直接依赖 Host 的 ref 模式。投射进 iframe 前抽出**纯投影变体**（只吃 `document` + `draggingNodeId` + `editing` + 编辑回调），iframe 用它渲染，避免 iframe 依赖 Host 的 `registry`/`editingValueRef`。降透明用 `draggingNodeId` prop、编辑用受控 `editing` 回调 —— 与 Host 原先逻辑等价，仅把状态改为经 bridge 下发。

### 影响地图

```text
M5
├─ 用户界面或交互      ✓ 画布渲染迁入 iframe；视觉不变（投影语义），交互（overlay/拖拽）留在 Host；CanvasView 拆分（C1）
├─ 业务规则和状态      ✓ 无领域层改动；controller 仍是唯一可写 owner
├─ 前后端接口或消息协议 ✓ 新增 Host↔iframe postMessage 协议（文档投影 / 几何回报）
├─ 数据库/文件/缓存    ✗ 无
├─ 权限与安全          ✗ 同源 iframe；无跨域
├─ 测试与验收          ✓ 冒烟 + 浏览器实测（样式隔离、无第二个历史栈、投影正确）
├─ 监控、日志与告警    ✗ 无
└─ 发布与回滚          ✓ 无发布管道；回滚=还原改动文件
```

## 方案与边界

### 核心架构决策：单一可写 owner + 纯渲染投影

**原则**：文档、命令、历史、选择、视口、拖拽状态全部留在 Host。iframe 是一个**无状态渲染投影器**：
- 从 Host 接收不可变文档快照（`CanvasDocument`）+ 视口变换（scale/pan）；
- 渲染 `DocumentRuntime`（纯函数投影）；
- 把每个节点的几何（DOM rect）回报 Host；
- 不持有任何可写编辑状态 → **不可能出现第二个历史栈**；
- 同进程 `postMessage`（同步消息队列，无网络往返）→ **无延迟**；渲染走 React 协调（只在节点变化时更新 DOM）→ **不卡**。

### 缩放实现：布局级缩放（reflow 渲染），替代 transform scale

**现状根因**：`transform: translate() scale()` 是对渲染结果（位图）做重采样。非整数倍缩放时，浏览器对文字做像素插值，必然模糊。这是 transform 缩放的通病，与 iframe 无关。

**现实约束（实施勘误）**：计划初稿假设节点带 world 坐标（`left = x*scale`）。实际 `DocumentRuntime` 是**纯 flex 流式布局**（`canvas-node-container` 用 flex，节点无 x/y 坐标），无法直接按 world 坐标定位。因此"布局级缩放"落地为对**页面容器**施加 `zoom: scale`：浏览器按缩放后的实际像素 reflow 整棵节点树（字体按目标尺寸重新栅格化/重新 hint，非整数倍也清晰），同时 `zoom` 会同步缩放容器与子节点的布局尺寸，等效于"按更大尺寸重画"。

- Host 通过协议下发 `{ scale, panX, panY }`；
- iframe 内 `.canvas-frame-page` 应用 `zoom: scale`，页面定位用 `translate(panX, panY)`（平移不改变栅格尺寸，不产生模糊）；
- 子节点尺寸（宽高、字体、gap、padding）随 zoom 按比例 reflow，`getBoundingClientRect` 天然返回已缩放的屏幕坐标；
- 相比在 Host 保留 `transform: scale()`，`zoom` 不做位图重采样，文字保持清晰；这是 iframe 隔离带来的真实收益之一。

> 备选：逐属性 `calc()`（font-size * scale / gap * scale）也能实现 reflow，但需改写全部节点样式且易漏；`zoom` 一次覆盖整棵页面树，是当前 flex 布局下的最小实现。`zoom` 已 Baseline（Chrome/Safari/Edge 原生，Firefox 126+）。

**坐标流**：world（文档坐标）→ `screenToWorld`/`worldToScreen` 仍在 Host 用于指针换算；iframe 返回的屏幕 rect → Host `rectToWorld` 转世界坐标缓存 → overlay/落点消费。

### 内容划分

| 能力 | Owner | 说明 |
| --- | --- | --- |
| 文档模型 / 命令 / 历史 / Undo·Redo | Host | `CanvasEditorController` 原样，唯一 owner |
| 选区 / hover | Host | controller.selection + CanvasView 状态 |
| 视口变换 / 缩放 / 平移 / fit | Host | 状态在 Host，scale/pan 经协议下发 iframe 做布局级缩放 |
| 拖拽状态机 / auto-pan / drop 判定 | Host | 不变，几何来源改为 iframe 回报 |
| Overlay（hover/selection/drag ghost/插入线/高亮/编辑框） | Host | 绘制在 Host 层，依据 iframe 回报的几何 |
| 页面渲染（DocumentRuntime） | iframe | 纯投影，无状态；按 scale 布局级渲染（文字清晰） |
| 节点几何测量 | iframe | 渲染后测量并回报（ResizeObserver 驱动） |
| 样式 | 分域 | Host 用 editor 样式；iframe 内注入页面所需 token 与节点样式 |

### 通信协议

协议必须覆盖**文档投影、视口、几何回报、编辑、拖拽降透明**五类消息，否则 iframe 下的双击编辑与被拖节点降透明（`.canvas-node-dragging`）会断开。修订后：

```ts
// Host → iframe
type HostToFrame =
  | { type: 'document'; revision: number; document: CanvasDocument }
  | { type: 'viewport'; transform: ViewportTransform } // scale/pan，layout scale 用 zoom reflow
  | { type: 'interaction'; draggingNodeId: CanvasNodeId | null; editing: { nodeId: CanvasNodeId; initialValue: string } | null }
  // 编辑时值仍存 Host：可再加一条 { type:'editValue'; value: string }，用于外部同步（若需要）

// iframe → Host
type FrameToHost =
  | { type: 'ready' } // 帧加载完成，Host 重发当前文档+视口+交互
  | { type: 'geometry'; revision: number; rects: Record<CanvasNodeId, Rect>; pageSize: { width: number; height: number } } // iframe-viewport 相对（screen 坐标，已含 zoom/pan）；pageSize 供 Host Fit 用
  | { type: 'editCommit'; nodeId: CanvasNodeId; value: string } // textarea 内 Enter/失焦
  | { type: 'editCancel'; nodeId: CanvasNodeId } // Escape
```

- **文档投影**：`controller.subscribe` 已有；revision 变化时 postMessage 最新文档（结构化克隆，文档为纯数据，代价小）。
- **视口下发**：scale/pan 变化时发送；iframe 用其做布局级缩放（见 §布局级缩放，用 `zoom` reflow 而非 transform scale）。
- **状态下发**：`editing`/`draggingNodeId` 变化时发送；iframe 据此渲染 InlineEditor（受控，值经 Host）与被拖节点降透明。
- **几何回报**：iframe 渲染完成后测量所有节点 rect（相对 iframe viewport，即已按 zoom/pan 换算后的屏幕坐标），postMessage 回报；配合 `ResizeObserver` 在布局变化时增量回报。Host 侧把回报的屏幕 rect **再 `rectToWorld` 转回世界坐标**缓存，overlay/拖拽消费（见 §几何跨帧换算）。
- **编辑回报**：iframe 内 InlineEditor 的 Enter/失焦→`editCommit`、Escape→`editCancel`，由 bridge 递给 Host controller（`setText` / 退出编辑态）。
- **ready 握手**：iframe 加载后回报 ready，Host 重发当前文档、视口与交互状态，避免初始化竞态。

### 几何跨帧换算

- iframe 内节点以**布局级缩放**渲染：页面容器应用 `zoom: scale`（reflow 布局，见 §布局级缩放），页面位置用 `translate(panX, panY)`。节点的 `getBoundingClientRect` 因此返回已含缩放与平移的**屏幕坐标**（相对 iframe 视口）。
- **坐标空间约定（修正）**：`computeDropTarget`（`drop-target.ts`）当前输入几何快照为**世界坐标**。为保持该算法零改动（refactor without behavior change），Host 侧对 iframe 回报的屏幕 rect 统一执行 `rectToWorld(screenRect, viewport)` 再缓存；overlay 与拖拽命中继续在世界坐标上运行。§交互坐标一致性中"命中判定直接用屏幕 rect、无需 world 换算"仅适用于**指针命中测试**（用屏幕坐标与回报 rect 对比，供 hover/选择），落点推断仍走 world 几何。
- Host 侧 overlay 绘制：`SelectionOverlay` 直接用回报的屏幕 rect（view-relative）；`DragOverlay` 的 `worldRectStyle`/`insertionStyle` 仍做 world→screen 换算（输入为世界几何快照）。
- 拖拽几何快照：`captureGeometry` 改用最新回报 rect（不再直接读 iframe DOM）。
- `worldToScreen`/`screenToWorld`（`viewport/viewport.ts`）继续由 Host 持有，用于指针坐标换算；iframe 侧只在渲染投影时应用 scale。

### 交互坐标一致性

- 透明命中层的 pointer 坐标（相对 Host canvas-viewport）与 iframe 回报 rect（相对 iframe 视口）同属"画布面板屏幕坐标"，在面板内可直接对齐（iframe 填满面板、无边框无偏移）。命中判定用屏幕坐标对比回报 rect，无需 world 换算，减少跨帧误差源。

### 样式隔离

- **token 注入**：iframe 文档内建 `<style>` 或 link 引入 tokens-v2 变量（global.css 的前 3 行 @import），但**限定作用域**——节点容器 `.canvas-frame-page` 下生效，避免影响 iframe 外。
- **节点样式**：`canvas.css` 中属于"页面节点"的规则（`.canvas-node*`、`.canvas-page`）移入 iframe 侧；overlay/拖拽/编辑器 UI 样式保留在 Host 侧。
- **互不污染**：Host 的 editor CSS（toolbar、overlay）不进入 iframe；iframe 的页面样式不反向影响 Host。
- 目标（§11）：真实组件渲染层与编辑器 overlay 层物理分离。

### iframe 承载

- 独立入口：在**应用根**新增 `canvas-frame.html`（MPA 第二入口，非 `public/` —— `public/` 是纯静态目录，不经过 vite 构建/编译，无法挂载 TSX 入口）。内容：`#root` + `<script type="module" src="/src/canvas/frame/canvasFrame.tsx" />`。
- `vite.config.ts` 增加 `build.rollupOptions.input`（`{ main: 'canvas-frame.html', frame: 'canvas-frame.html' }`），复用构建管线、类型与 HMR。
- `canvasFrame.tsx`：独立 React 根，`import` 同一份 `DocumentRuntime`（投影变体）与 tokens，挂载到 `#root`。
- Host `CanvasView` 渲染 `<iframe src="/canvas-frame.html" />`，100% 填充，`sandbox` 允许 `allow-scripts` + `allow-same-origin`（同源仍需 same-origin 才能读 DOM）。

### 拖拽/编辑在 iframe 下的行为

- **拖拽**：iframe 内 DocumentRuntime 的节点元素对 Host 不可直接 pointer 命中（跨 frame 事件）。方案：Host 在 iframe 上层放透明捕获层（overlay）做命中。
  - 选**透明命中层**：Host 的 canvas-viewport 上保留一个覆盖 iframe 的透明 div（`pointer-events: auto` 仅在需要时，如拖拽/选择），把 pointer 坐标换算后命中几何快照（不依赖 iframe DOM）。双击编辑同理：Host 依据回报几何定位节点，进入编辑态后经协议下发 `editing`，iframe 渲染 textarea 编辑控件（受控，值存 Host，Enter/失焦回报 `editCommit`、Escape 回报 `editCancel`）。
  - 备选（iframe 事件转发）：更接近"组件真实交互"，但需协议化 pointer 事件流，复杂度高。本轮选透明命中层，把 iframe 当"画布表面"。
- **编辑**：双击由 Host 判定（几何命中）→ Host 设 editing 态 → iframe 投影渲染 InlineEditor（值经 Host 控制）。
- **缩放/平移触发的重投影**：scale 或 pan 变化时，Host 下发新 viewport，iframe 重新按布局级缩放渲染并回报几何；overlay 跟随新 rect。缩放交互（wheel/按钮）仍由 Host 处理。

### CanvasView 拆分（随本次一并完成）

`CanvasView.tsx` 目前 578 行，远超 §3 审查线（TSX > 250 行触发职责审查），是 code review 中最严重遗留项（C1，标为 P0）。原计划"随 M5 一并拆分"，现正式纳入 M5 范围：

- 拆分目标：让 `CanvasView` 只负责"装配"——组合 Toolbar、视口、Overlay、iframe 与事件接线，保留在 Host。
- 拆分出独立模块（建议）：
  - `canvas/viewport/`：视口变换逻辑与缩放/平移事件处理（现内联在 CanvasView 的 wheel/zoom/pan 处理，含 `normalizeWheelDelta`、`viewportCenter`、`handleZoomIn/Out/Reset`、`fitPageToViewport`）。
  - `canvas/interaction/`：指针/键盘语义（`handlePointerDown/Move/Up/Cancel`、`handleKeyDown`、`captureGeometry`、`runAutoPan`）——纯逻辑，不依赖 JSX。
  - `canvas/overlay/`：overlay 装配（SelectionOverlay/DragOverlay）抽为独立组件或 Hook。
- 拆分时点：在 iframe 迁移中同步进行，避免对 578 行文件做两轮破坏性改造（先拆再加 iframe 会重复触碰同一区域）。
- 验收：拆分后 `CanvasView.tsx` 显著低于 250 行审查线；现有交互（选择/拖拽/编辑/缩放/平移/auto-pan）行为不变；`drag-browser`/`edit-browser` 回归全过。

> 注意：`CanvasView` 拆分是结构调整，须保证行为不变（refactor without behavior change），与 iframe 协议改造解耦验证。

## 数据、状态和接口契约

- 文档/历史/选择：不变（Host controller）。
- 新增跨帧投影协议：见 §通信协议。
- 几何：新增 `FrameGeometryReport`（iframe → Host），Host 缓存为 `Record<nodeId, Rect>`，替代直接 DOM 读取。

## 失败、重试和兼容策略

- iframe 加载失败 / 断开：Host 保留最后几何，显示占位；`ready` 重发文档可恢复（§性能:iframe 断开后可恢复连接）。
- 文档投影失败：幂等（revision 单调，Host 重发当前文档）。
- 兼容性：无持久化；同源 iframe 无跨域问题。

## 安全、性能和可观测性

- 安全：同源 iframe，`sandbox` 最小权限；无外部输入。
- 性能（硬约束）：
  - **无延迟**：postMessage 同进程、同步消息队列；文档投影仅 revision 变更时发送；
  - **不卡**：React 协调局部更新 DOM；几何回报用 ResizeObserver 增量触发，不每帧全量；渲染与 overlay 分离。
  - 60fps 拖拽目标：拖拽中不投影文档（文档未变），overlay 只消费缓存几何。
- 可观测性：无日志新增；浏览器实测覆盖。

## 测试与验收计划

> 遵循既有门禁：`pnpm dlx tsx` 冒烟 + Chrome headless CDP 浏览器实测。

**I1 承载与投影**（iframe 入口 + 协议）
- iframe 加载回报 ready；Host 发文档后 iframe 渲染出全部节点；revision 更新后增量更新。
- 冒烟：协议编解码纯逻辑 + 浏览器实测 iframe 内节点存在。

**I2 几何回报**（iframe → Host）
- 节点 rect 回报正确（含缩放/平移后）；ResizeObserver 触发增量回报；初始与更新一致。
- 浏览器实测：Host 收到 rects 与 iframe 内元素实际位置一致。

**I3 样式隔离**
- iframe 内节点应用 tokens 与节点样式；Host editor 样式不影响 iframe 内渲染；overlay 仍正确绘制。
- 浏览器实测：iframe 内 computed style 正确；Host 侧无污染（对比前后 background/color）。

**I3b 缩放文字清晰度**（本次新增，用户反馈）
- 非整数缩放（125%、133%、150%）下，iframe 内文字清晰不模糊；与 transform scale 对比验证。
- 浏览器实测：截取 iframe 内节点文字像素，验证非整数倍下无位图重采样伪影（对比宿主 transform 方案）。缩放后 overlay 几何与节点一致。

**I4 交互适配**（透明命中层 + 拖拽 + 编辑）
- 选择/拖拽/双击编辑在 iframe 投影上正常工作；拖拽几何用回报 rect；缩放后仍可正确命中。
- 浏览器实测：复用 drag-browser/edit-browser 场景在 iframe 下通过；含缩放后（如 133%）拖拽落点正确。

**I4b CanvasView 拆分**（C1，纳入 M5）
- `CanvasView.tsx` 拆分后明显低于 250 行审查线；viewport 逻辑入 `canvas/viewport/`、指针/键盘语义入 `canvas/interaction/`、overlay 装配独立。
- 行为不变（refactor without behavior change）：选择/拖拽/编辑/缩放/平移/auto-pan 与拆分前一致；与 iframe 协议改造解耦验证。

**I5 回归门禁**
- typecheck / lint / build 全绿；`core-smoke` 30、`dnd-smoke` 19、`text-smoke` 18；`drag-browser`、`edit-browser` 在 iframe 架构下复跑全过；**验证无第二个历史栈**（iframe 内无 controller 实例）。

### 步骤分解

- **I1** `public/canvas-frame.html` + vite 多页入口 + `CanvasFrameBridge`（消息协议类）+ Host 侧 iframe 挂载。冒烟 + 浏览器。
- **I2** iframe 内几何测量 + ResizeObserver 回报；Host 缓存 rects。
- **I3** 样式作用域切分：节点样式/token 入 iframe，overlay/editor 样式留 Host。
- **I3b** 布局级缩放实现：DocumentRuntime 投影应用 scale（world*scale + pan），替换 Host 的 transform scale；验证缩放清晰度。
- **I4** 透明命中层 + 拖拽/编辑适配（captureGeometry 改用回报 rect）。
- **I4b** CanvasView 拆分：viewport 逻辑、interaction 语义、overlay 装配独立；行为不变。
- **I5** 回归全绿；计划 DONE。

## 发布与回滚

- 无发布管道；I5 通过即完成。
- 回滚：还原改动文件；无迁移。

## 取舍和未决问题

| 取舍点 | 选择 | 原因 |
| --- | --- | --- |
| iframe 是否持有可写状态 | 否，纯渲染投影 | 满足"单一历史栈 + 无延迟"硬约束 |
| 跨帧交互方式 | Host 透明命中层（非 iframe 事件转发） | 避免协议化 pointer 流，复杂度可控；本轮样式隔离为主 |
| iframe 承载 | vite 多页入口 | 复用构建/HMR/类型 |
| 样式隔离 | 节点样式与 tokens 入 iframe 作用域 | 达成 §11 overlay 独立性 |
| 缩放实现 | iframe 内页面容器 `zoom: scale`（reflow，非 transform） | 节点为 flex 流式布局无 world 坐标；`zoom` 一次性按目标尺寸重排整棵页面树，文字非整数倍清晰 |
| 落点几何坐标空间 | Host 将回报屏幕 rect `rectToWorld` 转世界坐标缓存 | `computeDropTarget` 算法零改动（行为不变） |
| 编辑控件渲染位置 | iframe 内渲染 InlineEditor（受控，值存 Host） | 满足 §内容划分；Enter/失焦→`editCommit`、Escape→`editCancel` 经 bridge |

未决问题：
- 透明命中层在 iframe 上叠加时，用户组件的真实交互（表单、链接）本轮不启用（无 Preview 模式）；Preview 切换留后续。
- 拖拽几何用缓存 rect 而非实时 DOM，理论上极端动态内容下可能滞后一个 frame——可接受（文档未变，rect 稳定）。
- 布局级缩放每帧 reflow 的代价：缩放是离散操作（wheel 步进/按钮），非连续动画，每帧一次 reflow 可接受；60fps 拖拽为平移（纯 translate，不触发 reflow）。
