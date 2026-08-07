# Canvas 术语表

本文是 Looploom 前端画布（`apps/frontend-editor/src/canvas`）的统一术语表。需求、方案、Code Review、测试和日常沟通都应使用本表用词，避免同一概念出现多个名字。

每个条目给出：统一中文术语、对应英文/代码名、定义，以及「不要混用」的提示。

## 1. 画布空间与表面

| 术语 | 英文 / 代码名 | 定义 | 不要混用 |
| --- | --- | --- | --- |
| 画布 | canvas | 被编辑的白色页面区域，即页面容器（`.canvas-frame-page`）。画布的尺寸取决于页面容器的大小。 | 画布 ≠ 视口；画布 ≠ iframe 表面 |
| 页面容器 | page container | 整个画布容器（`.canvas-frame-page`），白底 + 边框 + padding + min-height。它承载文档根节点。页面容器是特殊的布局容器，不与普通容器混用。 | 页面容器 ≠ 容器（container）；页面容器 ≠ 页面节点 |
| 页面节点 | page node | 文档根节点（`CanvasPageNode`，`kind: 'page'`），被渲染为 `.canvas-node-page`。几何上报时以页面容器的完整矩形覆盖页面节点矩形。 | 页面节点 ≠ 页面容器 |
| 画布表面 | canvas frame surface | iframe 内的背景层（`.canvas-frame-surface`），显示点阵底纹，不含页面内容。 | 表面 ≠ 画布 |
| 画布舞台 | canvas frame stage | iframe 内承载页面的平移层（`.canvas-frame-stage`），只做 `translate(panX, panY)`。 | 舞台 ≠ 画布 |
| 视口 | viewport | 观察、平移、缩放画布的空间（`.canvas-viewport`）。缩放和平移作用于视口，不影响文档本身。 | 视口 ≠ 画布；视口 ≠ iframe |
| 命中层 | hit layer | 覆盖在视口上的透明指针捕获层（`.canvas-hit-layer`），接收 pointer 输入。 | — |
| 画布框架 | canvas frame | 承载用户内容的 iframe（`iframe[title="Canvas frame"]`）。 | 框架 ≠ 画布 |

## 2. 文档与节点

| 术语 | 英文 / 代码名 | 定义 | 不要混用 |
| --- | --- | --- | --- |
| 节点 | node | 文档树的基本单位（`CanvasNode`）：text、button、container、page 四种。 | — |
| 容器 | container | 布局容器（`CanvasContainerNode`，`kind: 'container'`），带 padding 与虚线轮廓。 | 容器 ≠ 页面容器 |
| 布局 | layout | 容器的排布方向（`CanvasLayoutKind`）：`row`（横向）、`column`（纵向）、`block`。 | 布局 ≠ 落点位置 |
| 文本节点 | text node | 文字节点（`CanvasTextNode`）。 | — |
| 按钮节点 | button node | 按钮节点（`CanvasButtonNode`）。 | — |
| 父节点 / 子节点 / 兄弟节点 | parent / child / sibling | 文档树的相对关系。 | — |
| 子树 | subtree | 某节点及其所有后代。拖拽时禁止把节点移入自己的子树（cycle）。 | — |

## 3. 坐标系与视图变换

| 术语 | 英文 / 代码名 | 定义 | 不要混用 |
| --- | --- | --- | --- |
| 客户端坐标 | client | 浏览器视口坐标，来自 pointer 事件的 `clientX/clientY`。 | — |
| 宿主屏幕坐标 | host screen | 相对 `.canvas-viewport` 左上角的坐标，等于 client − viewport 原点。 | — |
| 框架屏幕坐标 | frame screen | iframe 内 `getBoundingClientRect()` 的结果，包含 CSS `zoom`，未除缩放。 | 不要当作世界坐标使用 |
| 世界坐标 | world | 未缩放的页面坐标：`(screen − pan) / scale`。Drop 目标、插入几何都使用世界坐标。 | 世界坐标 ≠ 屏幕坐标 |
| 覆盖层坐标 | overlay | 宿主覆盖层的 CSS 像素：`world × scale + pan`。Selection/Drag Overlay 使用。 | 覆盖层坐标 ≠ 客户端坐标 |
| 视图变换 | viewport transform | `ViewportTransform { scale, panX, panY }`，描述世界 → 屏幕的映射。 | — |
| 自适应 / 适应视口 | fit viewport | 按页面容器尺寸与视口尺寸计算初始 transform（`fitViewport`）。 | — |
| 自动平移 | auto pan | 拖拽靠近视口边缘时自动滚动视口。 | — |

## 4. 指针交互与状态机

交互状态由 `interaction-reducer` 统一管理，任一时刻只有一种状态（INV-04）。

| 术语 | 英文 / 代码名 | 定义 | 不要混用 |
| --- | --- | --- | --- |
| 空闲 | idle | 无指针交互，仅维护 hover。 | — |
| 按下中 | pressing | 指针按下但未超过拖拽激活阈值，仍可能是点击。 | pressing ≠ dragging |
| 拖拽中 | dragging | 已超过激活阈值（距离 + 最短时长），节点跟随指针。 | — |
| 平移中 | panning | 空格或中键平移视口。 | — |
| 编辑中 | editing | 双击文本/按钮进入原位编辑会话。 | — |
| 落位反馈中 | settling | 松手后的短暂反馈状态（放置成功或拒绝），结束后回到 idle。 | — |
| 拖拽控制器 | drag controller | 管理 `DragState`（idle/pending/dragging）与幽灵坐标的命令式对象。 | — |
| 拖拽激活阈值 | drag threshold | 由 `DRAG_THRESHOLD`（距离）与最小时长共同决定何时从 pressing 进入 dragging。 | — |
| 指针会话 | pointer session | 统一持有 pointer capture 与取消生命周期。 | — |

## 5. 拖拽与落点反馈

| 术语 | 英文 / 代码名 | 定义 | 不要混用 |
| --- | --- | --- | --- |
| 拖拽 | drag | 按住并移动节点的指针手势。 | 拖拽 ≠ 平移（pan） |
| 松手 / 释放 | release | 指针抬起，结束一次拖拽。 | 释放 ≠ 放置（drop） |
| 放置 | drop | 松手后提交放置动作：对有效落点执行移动命令。 | — |
| 落点目标 | drop target | 指针当前对应的落点（`DropTarget`）：有效（parentId/index/placement）或拒绝（原因）。 | 落点 ≠ 放置位置 |
| 放置位置 | placement | `inside`（容器内部）、`before`（之前）、`after`（之后）。 | — |
| 原位落点 | no-op drop | 落回原位置，放置不会改变文档。 | — |
| 拒绝落点 | rejected drop | 非法落点，携带原因（cycle / cannot-drag-root / target-not-container 等）。 | — |
| 拖拽节点 | dragged node | 正在被拖拽的源节点（`.canvas-node-dragging`，原位置降透明度）。 | — |
| drag image（拖拽跟随元素） | drag image | 跟随指针移动的组件副本（代码类名 `.canvas-drag-image`），从源节点原位平滑过渡到指针位置。统一使用英文名「drag image」。 | drag image ≠ 预览；drag image ≠ 插入槽 |
| 插入线 | insertion line | 实线指示器（`.canvas-insertion-line`），标记精确插入位置。 | 插入线 ≠ 插入条带 |
| 插入条带 | insertion band | 区域性指示器（`.canvas-insertion-band`），标记插入占用的槽位区域。 | — |
| 落点高亮 | drop highlight | 目标容器整体高亮（`.canvas-drop-highlight`），表示「放进容器」。 | — |
| 插入几何 | insertion metrics | 纯函数计算的 line/band/highlight 世界坐标矩形（`computeInsertionMetrics`）。 | — |

## 6. 投影协议（Host ⇄ Frame）

| 术语 | 英文 / 代码名 | 定义 | 不要混用 |
| --- | --- | --- | --- |
| 宿主 | host | 编辑器主应用，拥有文档、选择、历史与交互状态。 | — |
| 框架 | frame | iframe 中的 `FrameRoot`，只读投影用户内容并上报几何。 | — |
| 投影 | projection | 宿主下发到框架的文档/视口/交互状态组合。 | — |
| 投影版本 | projection version | `ProjectionVersion`：`frameSessionId`、`documentRevision`、`viewportRevision`、`interactionRevision`，几何上报必须匹配当前版本。 | — |
| 帧会话 | frame session | iframe 每次 ready 产生的新会话 ID，用于拒绝过期消息。 | — |
| 几何快照 | geometry snapshot | `NodeGeometrySnapshot`，节点 id → 世界坐标矩形的映射，拖拽期间冻结。 | — |
| 实时预览插槽 | frame preview slot | 框架实测的插入槽位矩形（`FramePreviewSlot`），用于跟踪真实目标尺寸。 | — |
| 页面尺寸 | page size | 页面容器的世界尺寸（`FramePageSize`），用于自适应视口。 | — |

## 7. 领域模型（命令 / 结果 / 历史）

| 术语 | 英文 / 代码名 | 定义 | 不要混用 |
| --- | --- | --- | --- |
| 文档 | document | 不可变文档树（`CanvasDocument`），根为页面节点。 | — |
| 命令 | command | 原子领域操作（`CanvasCommand`），如 `document.moveNode`。 | — |
| 命令结果 | command result | 结果信封（`CanvasCommandResult`）：`committed` / `rejected` / `no-op` / `cancelled`。 | 结果 ≠ 发送命令本身 |
| 提交 | committed | 命令成功并改变文档。 | — |
| 历史 | history | Undo/Redo 栈，只有 committed 才入栈。 | — |
| 修订 | revision | 文档变更的单调计数，用于版本匹配。 | — |
| 选择 | selection | 当前选中的节点 id（`CanvasEditorSnapshot.selection`）。 | — |
| 编辑会话 | editing session | 原位编辑的身份与草稿（`FrameEditingState`），草稿由宿主持有。 | — |
| 草稿 | draft | 编辑中的未提交文本。 | — |

## 8. 统一用词建议

描述功能与交互时，使用以下动词/名词搭配：

- 指针「按下」「移动」「抬起」，不要混用「点击」「拖动」描述中间状态。
- 「拖拽」是节点的指针手势；「平移」是视口的指针手势；两者不要混用。
- 「松手」后系统才「放置」；「放置」是提交动作，不是预览。
- 跟随指针的组件副本统一叫「drag image」（代码类名 `.canvas-drag-image`），不叫「影子」「预览」「副本」。
- 精确插入位置用「插入线」（实线指示器），插入占用的区域用「插入条带」（区域性指示器），目标容器整体用「落点高亮」。
- 「页面容器」特指整个画布容器（`.canvas-frame-page`）；「容器」特指文档中的布局容器（`.canvas-node-container`）；两者不要混用。
- 「画布」是被编辑的白色区域；「视口」是观察它的窗口；不要混用。
- 「落点目标」（drop target）是计算结果的抽象；「放置位置」（placement）是其 inside/before/after 属性。
- 成功反馈只能来自 authoritative 的 `committed` 结果，不能用发送命令代替。
