# Looploom 前端编码规范

本文是 Looploom 前端代码的正式编码规范，仅适用于前端应用和前端共享包，例如 `apps/frontend-editor` 与 `packages/editor-shell`。

本文不约束后端代码，也不代表 workspace 的通用工程规范。后端代码应在建立对应目录后，使用独立的语言、框架、接口和测试规范；跨前后端的协作要求以 [`development-workflow.md`](../development-workflow.md) 为准。

规范中的用词含义如下：

- **必须**：强制要求；除非记录并批准例外，不得违反。
- **应该**：默认要求；确有理由时可以偏离，但应在 Code Review 中说明。
- **可以**：可选建议。

## 1. 总体原则

### 1.1 按变化原因划分职责

拆分的目的不是追求小文件，而是让每个模块拥有一个主要职责、一个权威状态源和一个主要变化原因。

判断是否应该拆分时，优先问：

1. 这段代码是否有独立的业务含义？
2. 它是否可以脱离 React 和浏览器单独测试？
3. 它是否管理独立的外部生命周期？
4. 它是否会因不同需求而单独变化？
5. 它是否拥有自己的状态或不变量？
6. 当前文件是否必须同时理解多个领域才能安全修改？

如果有两到三个问题的答案为“是”，通常应该拆分。拆分后必须使依赖方向更清晰、公共 API 更小、状态 owner 更明确或测试更容易；如果只是增加文件和跳转，就不应该拆分。

### 1.2 平台 UI 与用户内容隔离

平台 UI 包括 Project Shell、Editor Chrome、Canvas Host、Editor Overlay 和平台级组件。Canvas 中的用户内容及其第三方组件属于另一条边界。

平台 UI 与用户内容不得混用以下内容：

- 组件和图标体系；
- 字体、颜色、间距、圆角和阴影；
- CSS 选择器和 Design Token；
- 第三方 Theme 和 CSS-in-JS 实现。

第三方组件只能通过明确的 Adapter 接入。平台代码不得直接依赖用户组件库的实现细节。

### 1.3 依赖方向

推荐保持以下单向依赖：

```text
TSX View → Application → Domain Core
TSX View → Integration
Integration → Domain contracts
Domain Core → 无外部运行时依赖
```

Domain Core 不得反向依赖 React、DOM、浏览器 API、网络、Local Storage、组件库或 CSS。

## 2. 功能模块分层

推荐的功能流如下：

```text
用户输入
  ↓
TSX View
  ↓
Application Controller / Command
  ↓
Domain Core
  ↓
Adapter / Protocol / Persistence
```

### 2.1 Domain Core：纯 TypeScript

Domain Core 负责领域状态、业务规则、合法性校验、状态转换、Command、Selector 和纯算法。

Domain Core 不得依赖 React、DOM、浏览器 API、网络、Local Storage、MUI、Ant Design、CSS class 或 Toast 文案，并且必须能够直接在 Node/Vitest 中测试。

```ts
export function moveNode(
  document: CanvasDocument,
  command: MoveNodeCommand,
): EditResult {
  // Pure domain operation
}
```

### 2.2 Application Layer：流程协调

Application Layer 负责接收用户意图并协调领域操作，包括 Undo/Redo、Command acknowledgement、异步持久化、失败恢复和跨模块协调。

它可以依赖 Domain Core，但不得依赖具体 TSX 结构。

```ts
export class CanvasEditorController {
  execute(command: CanvasCommand): CanvasCommandResult;
  subscribe(listener: () => void): () => void;
  getSnapshot(): CanvasEditorSnapshot;
}
```

### 2.3 Integration Layer：外部系统边界

Integration Layer 负责 MessageChannel、HTTP、WebSocket、`localStorage`、iframe、`ResizeObserver`、第三方拖拽库、组件库 Adapter，以及数据序列化和外部输入校验。

所有外部输入进入领域层前必须转换为内部类型。Domain Core 不得直接调用 `fetch()`、`window.postMessage()`、`document.elementFromPoint()` 或 `localStorage.getItem()`。

### 2.4 TSX View：渲染与输入绑定

TSX View 负责 JSX、ARIA、CSS class、展示状态，以及将点击、键盘和指针输入转换为语义动作。

TSX View 不负责深层树遍历、Schema 修改、Drop 合法性、Undo 历史、网络协议、revision 比较、复杂坐标算法或持久化。

理想事件处理器应接近：

```tsx
const handleDelete = () => {
  editor.execute({ type: 'canvas.node.remove', nodeId });
};
```

## 3. 目录与文件组织

普通功能模块可以采用：

```text
feature-name/
├─ index.ts
├─ FeaturePage.tsx
├─ FeatureView.tsx
├─ feature.css
├─ model.ts
├─ commands.ts
├─ reducer.ts
├─ selectors.ts
├─ controller.ts
├─ protocol.ts
├─ adapters/
│  └─ external-service-adapter.ts
└─ __tests__/
   ├─ commands.test.ts
   ├─ reducer.test.ts
   └─ FeatureView.test.tsx
```

复杂 Canvas 模块应该按 `core/`、`interaction/`、`viewport/`、`overlay/`、`runtime/`、`bridge/` 和 `adapters/` 划分。目录只是职责示例，不得为了符合目录而创建空文件。

避免无边界的文件名：

- 不要使用 `utils.ts`、`helpers.ts`、`common.ts`、`misc.ts` 等垃圾桶文件；
- `types.ts` 和 `constants.ts` 只适用于边界清晰且规模很小的模块；
- 应使用 `drop-geometry.ts`、`message-validation.ts`、`canvas-node-id.ts` 等能表达领域含义的名称。

以下情况应发起职责审查：TSX 超过约 250 行、普通 TypeScript 超过约 400 行、单个 React 组件超过约 150 行、事件处理器超过约 10–15 行，或单个 Effect 超过约 20–30 行。这些是审查触发器，不是机械拆分阈值。

不要为一行代码创建抽象，不要为了缩短文件创建无意义包装组件，不要创建 `useEverythingAboutCanvas` 一类的万能 Hook，也不要在只有一个真实用例时过早设计插件系统、万能事件总线或通用 Schema Visitor。

## 4. TypeScript 规范

### 4.1 严格类型

项目必须逐步启用并保持以下选项：

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "useUnknownInCatchVariables": true
}
```

如果现有模块暂时无法开启，必须记录迁移计划，不得继续扩大不严格代码的范围。

### 4.2 不得使用 `any`

外部输入使用 `unknown`，先验证再转换：

```ts
function parseMessage(value: unknown): CanvasMessage {
  if (!isCanvasMessage(value)) {
    throw new InvalidCanvasMessageError();
  }

  return value;
}
```

类型断言不能替代验证。应尽量避免非空断言；确实属于启动阶段不可恢复的不变量时，使用带错误信息的断言函数。

### 4.3 用判别联合表达状态

```ts
type ConnectionState =
  | { status: 'connecting' }
  | { status: 'ready'; port: MessagePort }
  | { status: 'error'; error: CanvasConnectionError };
```

不要用多个布尔值和可选字段组合出互斥状态，也不要用 `ok: boolean` 加可选 `document`/`error` 表达 Command 结果。

### 4.4 API、依赖和常量

- 默认只导出稳定公共类型、领域操作入口和明确的 Adapter contract；
- `index.ts` 只定义公共 API，禁止无选择地 `export *` 整个目录；
- 禁止循环依赖；
- 常量必须有语义名称，不要散落 `0.28`、`200` 等体验相关数字；
- 注释解释约束和原因，不要复述代码字面含义；
- 类型导入使用 `import type`。

```ts
const dropEdgeThresholdRatio = 0.28;
const dragSourceReleaseDelayMs = 200;
```

## 5. React 与 TSX 规范

### 5.1 Page、View 和 Props

Page 负责选择资源、连接 Controller、处理页面级 loading/error，并组装主要区域。View 通过明确 Props 渲染，不要把整个全局 Store 传给所有子组件。

```ts
interface CanvasToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  zoomPercentage: number;
  onUndo: () => void;
  onRedo: () => void;
  onFitCanvas: () => void;
}
```

### 5.2 状态和 Effect

将状态分为四类，并为每类状态指定唯一 owner：

| 状态              | 示例                                           | 是否进入文档历史 |
| ----------------- | ---------------------------------------------- | ---------------- |
| Document State    | Schema、props、slots、layout、bindings         | 是               |
| Editor State      | selection、active page、open tabs、mode        | 通常否           |
| View State        | zoom、pan、scroll、expanded nodes              | 否               |
| Interaction State | hover、pointer、drag candidate、resize preview | 否               |

禁止存储可由现有状态推导出的值。节点数量、选中组件、是否可删除、是否 dirty 应使用 selector 计算。

Effect 只用于同步外部系统，不用于普通数据推导。一个 Effect 只同步一个明确的外部生命周期；MessagePort、键盘监听、ResizeObserver、拖拽监听、Timer 和持久化订阅不得混在同一个 Effect 中，并且每个生命周期都必须完整清理。

Render 必须保持纯净，不得写 Local Storage、发送消息、执行 Command、修改 DOM、启动 Timer 或修改领域状态。

### 5.3 JSX、Key 和可访问性

- 可重排节点必须使用稳定的业务 ID，禁止使用数组 index 作为 key；
- 复杂状态不要使用嵌套三元表达式，应提前 return 或拆成具名渲染函数；
- 不要使用带 `onClick` 的 `<div>` 代替 `<button>`；
- 组件定义时就必须同时考虑语义元素、accessible name、键盘行为、focus-visible、disabled 和状态播报；
- JSX 事件应调用语义 Command 或 callback，不应内联复杂领域逻辑。

## 6. 组件规范

### 6.1 组件分层

平台组件分为：

```text
UI Primitives: Button, IconButton, ToggleButton, TextField, Select, Tabs, Tooltip
UI Patterns: SearchField, CommandBar, EmptyState, StatusMessage, SegmentedControl
Feature Components: CanvasToolbar, PageTabs, ComponentCatalog, SelectionOverlay
Canvas Component Adapters: MUI Adapter, Ant Design Adapter, Web Adapter
```

平台组件和 Canvas 用户组件不得混用。

### 6.2 何时封装

满足以下任一条件时应考虑封装：多处重复使用、需要统一可访问性或 Design Token、需要统一键盘行为和状态、需要隔离第三方 API、需要统一埋点或 Command 语义、需要阻止危险 Props、未来可能更换底层实现，或同类组件已出现两种以上写法。

组件封装必须增加语义、行为、约束或稳定扩展点。禁止创建只做 Props 透传的空壳、没有产品语义的单布局组件，以及用大量 Boolean Props 组合的万能组件。

### 6.3 组件 API

Props 必须表达产品语义，不得暴露临时视觉值：

```ts
interface ButtonProps {
  variant?: 'accent' | 'neutral' | 'negative' | 'quiet';
  size?: 's' | 'm' | 'l';
  isDisabled?: boolean;
  isPending?: boolean;
  children: ReactNode;
  onPress?: () => void;
}
```

规范要求：

- 尺寸使用受控枚举，并映射到 Design Token；
- variant 使用语义名称，不使用 `blue`、`gray`、`small14` 等视觉名称；
- Controlled 和 Uncontrolled 模式必须明确；
- 交互组件优先使用 `onPress`、`onChange`、`onSelectionChange`、`onOpenChange`；
- 原始 Canvas 指针操作才使用 `onPointerDown`、`onPointerMove`、`onPointerUp`；
- 需要聚焦、测量或接入 Overlay 的基础组件必须正确支持 ref；
- 必须允许必要的 `aria-*`、`data-*`、`id` 和 `role`；
- 不得暴露全部第三方 Props、内部 DOM 结构、Theme 或 class。

业务代码不得依赖 `.button > span:first-child > svg` 等内部结构。稳定扩展点只能是 Props、Slots、公开 class、`data-state` 或 CSS custom property contract。

### 6.4 组件状态与结构

基础组件至少应考虑 Default、Hover、Pressed、Focus-visible、Disabled，以及适用时的 Selected、Pending、Error。Loading/Pending 不得导致尺寸跳动，必须防止重复提交，且可访问名称仍然明确。

Primitive 接收文案或内容，不应把产品文案写死在组件内部。样式与测试应尽量和组件共置；大型全局 CSS 不应包含所有组件实现。

### 6.5 第三方组件边界

平台 Shell 优先通过统一 Primitive 使用 React Aria Components、普通 CSS 和 Design Token。业务代码不应直接混用原生 button、MUI Button、Ant Design Button、React Aria Button 和自定义 div button。

MUI、Ant Design 等只能在对应 Adapter 中使用：Canvas Core 不得导入第三方 UI 库，Shell 不得使用第三方 Button，Adapter 不得导出 Emotion styled helper，Shell CSS 不得依赖 `.MuiButton-root`，Adapter Props 不得成为平台 UI Props。

## 7. 图标规范

Editor Chrome 只允许一个平台图标来源。业务代码不得直接导入图标库，只能使用类型安全的 Icon Registry：

```ts
export const platformIcons = {
  add: Add01Icon,
  delete: Delete02Icon,
  duplicate: Copy01Icon,
  undo: UndoIcon,
  redo: RedoIcon,
} as const;

export type IconName = keyof typeof platformIcons;
```

Registry 使用 `delete`、`duplicate`、`fitCanvas` 等语义名称，不暴露底层库名称。必须显式导入实际使用的图标，禁止 `import * as Icons`。

PlatformIcon 负责 Registry 解析、尺寸、stroke/fill、`currentColor`、`aria-hidden` 和开发环境错误提示。图标尺寸和颜色使用 Design Token，禁止传任意宽高或颜色。

IconButton 应统一处理 `aria-label`、Tooltip、i18n、Focus ring、点击区域、图标尺寸、Hover、Pressed、Disabled、Selected、Pending 和 Reduced motion。图标按钮必须有可访问名称，不能只依赖 Tooltip。装饰性图标使用 `aria-hidden="true"`；状态不能只通过颜色或图标表达。

同一图标在产品中必须保持同一语义，例如关闭和删除不能都使用同一个未区分语义的图标。Canvas 用户组件自身的图标可以不同，但必须隔离在用户内容或 Adapter 边界内。

## 8. CSS 与 Design Token 规范

- 使用 Spectrum 2，不使用 Spectrum 1 token。
- 使用 React Aria Components，不使用 React Spectrum UI components。
- 不允许手写或伪造 --spectrum-* 的值。
- CSS 只消费官方导入的 Spectrum 2 custom properties。
- 生成 token 前，先通过 Spectrum Design Data MCP 查询并确认。
- 优先使用 semantic token，避免直接使用原始色阶 token。
- 不使用 style macro，除非任务明确要求。
- 生成代码前先查询并确认 token 存在。
- 生成后检查 CSS 中是否存在硬编码颜色、间距和圆角。

### 8.1 Typography

- 平台所有可见文字的浏览器计算字号必须是整数且不小于 `13px`；
- 标准正文使用 `14px` 对应的 Typography Token；
- 标题、正文、按钮、输入框、Placeholder、Tooltip、Badge、空状态、伪元素、iframe 和 Portal 都受此限制；
- 禁止用 `transform: scale()` 规避字号限制；
- 禁止使用会计算为 11px 或 12px 的 detail/caption Token；
- 行高必须使用 Typography Token。

可以使用浏览器计算样式进行自动检查：

```ts
const size = Number.parseFloat(getComputedStyle(element).fontSize);
const valid = Number.isInteger(size) && size >= 13;
```

弱层级优先使用颜色、字重、间距和布局表达，不得不断缩小字号。

### 8.2 Design Token

字号、字重、行高、字间距、颜色、背景、边框、间距、控件尺寸、宽度约束、圆角、阴影、图标尺寸、Motion、Focus ring、层级和 Overlay 表现都必须使用 Design Token。

Token 选择顺序必须是：设计系统语义 Token → 设计系统尺度 Token → 统一定义的产品语义 Token → 运行时计算值。

只有设计系统无法表达需求时，才能新增产品 Token。新增 Token 必须在统一位置定义，使用语义名称，说明用途、现有 Token 不适用的原因，并被多个相关组件复用。

```css
/* 禁止 */
.button { color: #3478f6; padding: 7px 11px; border-radius: 5px; }

/* 推荐 */
.button {
  color: var(--spectrum-accent-content-color-default);
  padding: var(--spectrum-spacing-100) var(--spectrum-spacing-200);
  border-radius: var(--spectrum-corner-radius-small-default);
}
```

### 8.3 原始值、尺寸和布局

平台 UI 中禁止散布裸 `px`、裸 `rem`、十六进制颜色、`rgb()`/`hsl()`、匿名阴影、匿名圆角、临时透明度、无命名动画时间和随意 breakpoint。

Canvas 坐标、zoom scale、pointer position、Schema 数据、协议 revision、图布局坐标和用户作品本身的设计值不是视觉 Token，可以使用数值，但必须由算法或命名配置管理。

平台 UI 不得混用 `px`、`rem`、不同 Design System spacing scale、Token 与相近手写值。应优先使用 Grid、Flexbox、`minmax()`、`auto-fit`、`auto-fill`、Container Query、Design Token 和命名产品约束。禁止用固定宽度、临时 breakpoint、负 margin、固定高度裁切或随机 `z-index` 修补结构问题。

字体计算值必须为整数；其他静态控件尺寸也应优先选择能计算为整数 CSS 像素的 Token。坐标变换和缩放过程可以产生小数，但静态控件尺寸不能依赖匿名小数。

### 8.4 样式实现与状态

平台 UI 使用普通 CSS 和 Design Token，禁止在 JSX 中写视觉 Inline Style，禁止 CSS-in-JS。Inline style 只允许表达集中管理的运行时数据，例如 Canvas transform、节点坐标、动态测量结果、用户作品样式或 viewport 尺寸。

CSS class 和 Token 必须表达职责，不得使用 `.blue-box`、`.small-text`、`.temp-fix` 等偶然视觉名称。相同的控件高度、Focus ring、边框、字号、图标尺寸、Panel padding 和 Overlay shadow 应由共享 class、组件样式或语义 Token 统一表达。

每个交互控件至少需要考虑 Default、Hover、Active/Pressed、Focus-visible、Disabled、Loading 和 Error。Focus ring 必须使用 Design Token，动画必须使用 Motion Token，并支持 `prefers-reduced-motion: reduce`。

平台 Token 和 Editor Overlay CSS 不得改变用户作品的真实渲染，用户内容的样式也不得污染平台 UI。

## 9. 状态、异步与错误处理

每类状态只能有一个可写 owner。例如 Canvas iframe 是本地文档 Session 的 owner 时，Host 只能接收只读投影，不能同时保留另一份可写文档。若 Host 和 iframe 都可修改同一状态，必须有明确的单向协议和冲突规则。

每个请求必须能识别过期结果，避免页面切换、revision 变化或组件卸载后的旧结果覆盖新状态。可以使用 AbortController、request ID、document ID、expected revision 或 session nonce。

禁止没有错误处理的 fire-and-forget。UI 成功状态必须来自实际结果，而不是发送 Command 的瞬间：

```text
execute → pending → committed/rejected → visible feedback
```

Observer、request、port 和 timer 在卸载或 Session 切换后不得继续更新状态。

必须区分业务拒绝和程序异常。业务拒绝（如非法 Drop、达到 maxItems、循环嵌套、没有 Undo、权限不足）应返回结构化 Result；程序异常（如协议损坏、Adapter 崩溃、invariant 破坏、未知 Node Kind）应进入诊断系统或 Error Boundary。

错误至少应包含 `code`、`operation`、资源或文档 ID、node ID、command ID 和 recoverability。禁止只抛出 `new Error('Failed')`，禁止空 `catch`；可以安全忽略时必须说明原因。

## 10. 测试规范

### 10.1 Domain 和 Controller

Domain 单元测试验证树操作、Slot 合法性、Drop 排序、循环拒绝、history、no-op、immutable update 和 selector，不应需要 React 或浏览器。

Controller 测试验证 Command acknowledgement、revision、Undo/Redo、持久化失败、乱序请求、Session 切换和错误映射。

### 10.2 React 组件

验证可见状态、ARIA、disabled、keyboard、callback、loading、error 和 empty，不要测试 CSS 内部 DOM 实现细节。基础组件还应覆盖 accessible name、focus-visible、pending 防重复触发、variant/size 映射、计算字号、Light/Dark Token、装饰性图标的 `aria-hidden` 和 Icon Registry 有效性。

### 10.3 浏览器 E2E

E2E 必须验证用户可见结果，包括 pointer、drag/drop、iframe、zoom/pan、focus、keyboard、computed style、clipping、accessibility 和第三方组件行为，不得只检查内部 state。

## 11. 代码卫生与交付检查

提交前必须使用项目统一 Formatter、Oxlint/等价规则和 React Hooks 检查；删除 `console.log` 调试残留、注释掉的大段旧代码和无引用兼容分支；同一概念只使用一个名称。

提交前必须确保源代码、注释、配置和 Commit Message 中只包含 ASCII 英文字符；不得出现中文或其他非英文字符。代码注释、文档正文和 Commit Message 必须使用英文编写。

命名规则：文件名与主要 export 保持一致；React 组件使用 PascalCase；函数和变量使用 camelCase；常量使用表达语义的 camelCase；不使用 `ctx`、`mgr`、`obj`、`tmp`、`data2` 等模糊缩写。import 顺序保持为 React/标准库 → 外部依赖 → workspace package → 本地绝对模块 → 相对模块 → CSS。

UI 交付前必须在真实浏览器检查：

- 计算字号为整数且不小于 13px；
- Light/Dark Token 正确；
- Focus ring 可见；
- 没有文字截断、控件裁切和意外横向滚动；
- Overlay 不被遮挡；
- iframe 内外规则一致；
- 代表性桌面视口、缩放和高 DPI 下正常；
- axe 没有 serious/critical 问题。

## 12. 最小强制清单

Code Review 至少检查以下规则：

1. Domain Core 不依赖 React、DOM 或外部系统。
2. 每类状态只有一个可写 owner，派生状态使用 selector。
3. 组件 API 使用语义 Props、受控 size 和 variant，不暴露任意视觉值。
4. 平台组件必须通过统一 Primitive，第三方组件只能通过 Adapter。
5. 平台图标只有一个来源，业务代码只能使用 Icon Registry。
6. 平台 UI 的字体、间距、颜色、尺寸、边框、圆角、阴影和 Motion 使用 Design Token。
7. 平台 UI 禁止 Inline Visual Style、CSS-in-JS、散乱 Magic Number 和匿名小数尺寸。
8. 用户内容、第三方组件和平台 UI 的组件与视觉体系保持隔离。
9. 交互状态、键盘行为、ARIA 和 Focus-visible 在组件定义时完成。
10. 测试覆盖领域规则、组件可访问性和真实浏览器行为。
