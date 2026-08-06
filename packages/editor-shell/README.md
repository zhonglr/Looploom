# editor-shell

`editor-shell` 是一个面向 React 编辑器、设计工具和工作台类应用的可复用布局包。它提供业务无关的窗口注册、停靠布局、标签页、尺寸约束、浮动窗口、浏览器弹出窗口和 Layout 持久化能力。

这个包不包含 Project、Inspector、Timeline 等具体业务面板。调用方通过窗口注册表提供自己的 React 视图，通过 Layout JSON 决定这些视图如何组合。

> 当前包是 pnpm workspace 内的私有包，供本仓库中的应用直接使用。它还没有被整理成可发布到 npm 的独立制品。

## 技术来源与能力归属

本包直接建立在 [`flexlayout-react`](https://github.com/caplin/FlexLayout) 之上，并不是自行实现了一套停靠树或拖拽算法。当前安装版本为 `flexlayout-react@0.10.3`。

| 能力 | 来源 |
| --- | --- |
| 行/列布局树、tabset、标签页 | `flexlayout-react` |
| 拖拽停靠、拆分、标签重组 | `flexlayout-react` |
| splitter 调整尺寸 | `flexlayout-react` |
| 节点 weight、min/max 尺寸 | `flexlayout-react` 的布局模型 |
| 主窗口内的浮动面板 | `flexlayout-react` |
| 弹出到独立浏览器窗口 | `flexlayout-react` 的 popout window |
| `EditorWindowRegistry` 业务视图注册 | `editor-shell` |
| 创建、移动、选择、浮动窗口的语义化函数 | `editor-shell` |
| Layout preset、保存、加载和重置 | `editor-shell` |
| 可替换的 Layout 存储接口 | `editor-shell` |
| 可复用的尺寸/权重编辑面板 | `editor-shell` |
| 默认深色外观和标签渲染扩展点 | `editor-shell` |

React 和 React DOM 以 peer dependency 的形式存在。目前要求 React 19：

```json
{
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

## 包边界

`editor-shell` 只负责以下通用概念：

- 一个窗口如何由 `id`、标题和组件类型描述。
- 窗口如何注册并渲染。
- Layout 模型如何创建、序列化、切换和持久化。
- 窗口如何添加、移动、选择、浮动或弹出。
- 布局节点如何设置 weight、最小尺寸和最大尺寸。
- 标签图标、标签标题和未知窗口如何由调用方定制。

调用方仍然负责：

- 具体工具视图及其业务状态。
- 工具栏、菜单栏、状态栏和快捷键。
- Layout 的实际内容与命名。
- Layout 保存到哪里。
- 用户权限、远程同步和冲突处理。
- 弹出窗口的 URL、页面元信息和浏览器策略。

## 目录结构

```text
packages/editor-shell/
├─ src/
│  ├─ components/
│  │  ├─ EditorShell.tsx
│  │  └─ EditorShellIconProvider.tsx
│  ├─ adapter/
│  │  ├─ model.ts
│  │  ├─ types.ts
│  │  └─ errors.ts
│  ├─ hooks/
│  │  └─ useEditorLayouts.ts
│  ├─ styles/
│  │  └─ editor-shell.css
│  └─ index.ts
├─ package.json
└─ README.md
```

## 在 workspace 中使用

调用方应用声明 workspace 依赖：

```json
{
  "dependencies": {
    "editor-shell": "workspace:*"
  }
}
```

然后在仓库根目录安装依赖：

```bash
pnpm install
```

应用不需要再直接依赖 `flexlayout-react`。底层类型、`DockLocation` 和常用模型类型已经由 `editor-shell` 统一导出。

## 最小接入示例

### 1. 编写业务视图

窗口内容就是普通 React 组件：

```tsx
function ProjectView() {
  return <div>Project</div>
}

function InspectorView() {
  return <div>Inspector</div>
}

function CanvasView() {
  return <div>Canvas</div>
}
```

### 2. 创建窗口注册表

Layout 节点的 `component` 字段是注册表的 key：

```tsx
import type { EditorWindowRegistry } from 'editor-shell'

const windows: EditorWindowRegistry = {
  project: () => <ProjectView />,
  inspector: () => <InspectorView />,
  canvas: () => <CanvasView />,
}
```

renderer 会收到当前 `TabNode`，可以读取窗口 ID、名称和 config：

```tsx
const windows: EditorWindowRegistry = {
  inspector: ({ node }) => (
    <InspectorView
      windowId={node.getId()}
      config={node.getConfig()}
    />
  ),
}
```

### 3. 定义 Layout

Layout 使用布局树描述。下面创建左侧 Project、中间 Canvas、右侧 Inspector：

```tsx
import { createEditorTab, type IJsonModel } from 'editor-shell'

export const defaultLayout: IJsonModel = {
  global: {
    enableEdgeDock: true,
    tabEnableDrag: true,
    tabEnablePopout: true,
    tabEnablePopoutIcon: true,
    tabEnablePopoutFloatIcon: true,
    tabSetEnableDivide: true,
    tabSetEnableDrop: true,
  },
  borders: [],
  layout: {
    type: 'row',
    id: 'root',
    weight: 100,
    children: [
      {
        type: 'tabset',
        id: 'left-tools',
        weight: 20,
        minWidth: 180,
        maxWidth: 420,
        children: [
          createEditorTab({
            id: 'project',
            title: 'Project',
            component: 'project',
          }),
        ],
      },
      {
        type: 'tabset',
        id: 'canvas-tools',
        weight: 60,
        minWidth: 360,
        children: [
          createEditorTab({
            id: 'canvas',
            title: 'Canvas',
            component: 'canvas',
            enablePopout: false,
          }),
        ],
      },
      {
        type: 'tabset',
        id: 'right-tools',
        weight: 20,
        minWidth: 220,
        maxWidth: 480,
        children: [
          createEditorTab({
            id: 'inspector',
            title: 'Inspector',
            component: 'inspector',
          }),
        ],
      },
    ],
  },
}
```

`weight` 是同级节点之间分配可用空间的相对权重，不是固定百分比。窗口整体尺寸改变、最小/最大尺寸得到满足后，剩余空间会根据同级节点权重重新分配。

### 4. 渲染 EditorShell

```tsx
import { EditorShell, createEditorModel } from 'editor-shell'
import { useState } from 'react'
import { defaultLayout } from './defaultLayout'

export function Workspace() {
  const [model] = useState(() =>
    createEditorModel(defaultLayout, { splitterSize: 5 }),
  )

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <EditorShell
        model={model}
        windows={windows}
        renderUnknownWindow={(node) => (
          <div>Unknown window type: {node.getComponent()}</div>
        )}
      />
    </div>
  )
}
```

`EditorShell` 的父容器必须具有可计算的宽度和高度。只有 `height: auto` 而没有上层固定高度时，布局区域可能得到 0 高度。

## Layout 保存、加载与重置

`useEditorLayouts` 管理多个 Layout。它不直接使用 `localStorage`，而是接收一个 `EditorLayoutStorage`，因此可以替换为 IndexedDB、桌面配置文件或远程接口。

```tsx
import {
  EditorShell,
  useEditorLayouts,
  type EditorLayoutStorage,
  type IJsonModel,
} from 'editor-shell'

const storage: EditorLayoutStorage = {
  load(name) {
    const value = localStorage.getItem(`editor-layout:${name}`)
    return value ? (JSON.parse(value) as IJsonModel) : undefined
  },
  save(name, model) {
    localStorage.setItem(`editor-layout:${name}`, JSON.stringify(model))
  },
}

const presets = {
  Default: () => defaultLayout,
  Debug: () => debugLayout,
}

export function Workspace() {
  const layouts = useEditorLayouts({
    presets,
    initialLayout: 'Default',
    storage,
    modelOptions: { splitterSize: 5 },
  })

  return (
    <>
      <button onClick={() => layouts.selectLayout('Debug')}>
        Debug Layout
      </button>
      <button onClick={layouts.saveLayout}>Save</button>
      <button onClick={layouts.resetLayout}>Reset</button>

      <EditorShell
        model={layouts.model}
        windows={windows}
        onModelChange={layouts.handleModelChange}
      />
    </>
  )
}
```

行为说明：

- `selectLayout(name)` 优先加载该名称下已保存的模型，否则使用 preset。
- `saveLayout()` 将当前模型序列化后交给 storage。
- `resetLayout()` 忽略已保存版本，重新创建当前 preset。
- `revision` 在切换、保存、重置或模型变化时递增，可用于状态栏或 dirty tracking 的基础信号；它本身不是完整的撤销栈。
- preset 推荐写成返回新对象的函数，避免调用方意外共享和修改同一个 JSON 对象。

在 SSR 环境中不要在模块顶层访问 `window` 或 `localStorage`。应在客户端创建 storage，或者在服务端不传 `storage`。

## 动态创建自定义 EditorWindow

任何注册在 `EditorWindowRegistry` 中的组件都可以像内置面板一样加入布局：

```tsx
import { addEditorWindow, DockLocation } from 'editor-shell'

addEditorWindow(
  model,
  {
    id: 'color-tool-1',
    title: 'Color Tool',
    component: 'color-tool',
    config: { documentId: 'document-42' },
    enableClose: true,
    enableDrag: true,
    enablePopout: true,
    minWidth: 240,
    maxWidth: 640,
    minHeight: 160,
    maxHeight: 720,
  },
  'right-tools',
  DockLocation.CENTER,
)
```

注册对应 renderer：

```tsx
const windows: EditorWindowRegistry = {
  'color-tool': ({ id, config }) => (
    <ColorTool id={id} config={config} />
  ),
}
```

同一个 `component` 可以创建多个窗口实例；每个实例必须使用唯一的 `id`。

## 移动、选择与浮动窗口

```tsx
import {
  floatEditorWindow,
  getActiveEditorWindow,
  getEditorWindow,
  moveEditorWindow,
  selectEditorWindow,
} from 'editor-shell'

const inspector = getEditorWindow(model, 'inspector')
const active = getActiveEditorWindow(model, 'preferred-window-id')

selectEditorWindow(model, 'inspector')

moveEditorWindow(
  model,
  'inspector',
  'left-tools',
  'center',
)

// 主页面内部的浮动面板。
floatEditorWindow(model, 'inspector', 'float')

// 独立浏览器窗口。
floatEditorWindow(model, 'inspector', 'window')
```

常见的停靠位置：

- `'center'`：与目标组成标签页。
- `'left'`：停靠在目标左侧。
- `'right'`：停靠在目标右侧。
- `'top'`：停靠在目标上方。
- `'bottom'`：停靠在目标下方。

`targetId` 必须是当前模型中存在且允许接收 drop 的节点 ID。

## 尺寸、最大值、最小值与权重

初始值可以直接写入 Layout JSON，也可以运行时更新：

```tsx
import { updateEditorNodeConstraints } from 'editor-shell'

updateEditorNodeConstraints(model, 'left-tools', {
  weight: 25,
  minWidth: 200,
  maxWidth: 480,
})

updateEditorNodeConstraints(model, 'bottom-tools', {
  weight: 35,
  minHeight: 120,
  maxHeight: 420,
})
```

规则：

- 水平排列的兄弟节点主要使用 `minWidth` 和 `maxWidth`。
- 垂直排列的兄弟节点主要使用 `minHeight` 和 `maxHeight`。
- `weight` 只在同级节点之间比较。
- 当所有最小尺寸之和大于可用空间时，布局无法同时满足全部约束。调用方应为目标屏幕尺寸设计合理的下限。
- min/max 是布局约束，不等同于 CSS 的 `min-width` 和 `max-width`。

## 独立浏览器窗口与多显示器

启用 popout：

```tsx
<EditorShell
  model={model}
  windows={windows}
  supportsPopout
  popoutURL="/popout.html"
  popoutWindowName="My Editor Window"
/>
```

应用需要提供 `popoutURL` 对应的 HTML 页面，例如：

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Editor Window</title>
  </head>
  <body></body>
</html>
```

浏览器弹出窗口可以由用户拖到其他显示器，因此可以人工组成多显示器工作区。但需要明确以下限制：

- 浏览器可能拦截不是由用户手势触发的弹窗。
- 新窗口的位置和尺寸受浏览器、操作系统及权限控制。
- 当前 `editor-shell` 不使用 Window Management API 自动枚举显示器。
- 当前包不保存或自动恢复每个原生窗口在不同显示器上的物理坐标。
- 浏览器的缩放、DPI 和多屏坐标系可能不一致。
- Layout JSON 保存的是 FlexLayout 模型；不要把它当作完整的操作系统窗口会话。

如果产品要求自动识别显示器、恢复窗口坐标、进程间通信或在应用重启后重建原生窗口，应该在 Electron、Tauri 或其他桌面运行时中增加单独的窗口管理层。`editor-shell` 可以继续负责窗口内部的停靠布局。

## 标签与图标定制

```tsx
<EditorShell
  model={model}
  windows={windows}
  activeWindowId={activeWindowId}
  onActiveWindowChange={setActiveWindowId}
  renderTabIcon={(window) => iconByComponent(window.component)}
  renderTabLabel={(window) => (
    <span>{window.title}</span>
  )}
  renderUnknownWindow={(window) => (
    <div>Missing renderer: {window.component}</div>
  )}
/>
```

工具栏图标统一通过 `EditorShellIconProvider` 在根部声明一次，全壳生效；`icons` prop 只在需要单实例覆盖时使用：

```tsx
<EditorShellIconProvider icons={platformIcons}>
  <EditorShell model={model} windows={windows} />
</EditorShellIconProvider>
```

`platformIcons` 的类型是 `EditorShellIcons`，包含关闭、popout、maximize/restore、more 等布局 chrome 图标，由 shell 自持有，不暴露底层库的类型。

## 样式

`EditorShell` 会自动导入 `flexlayout-react/style/dark.css` 和包内的默认主题。所有通用覆盖都限定在 `.editor-shell-root` 下，减少对应用其他区域的影响。主题颜色、间距、圆角、阴影和字号全部映射到 Spectrum 2 Design Token，并依赖应用提供的 token 定义。

调用方可以用额外的 `className` 覆盖 CSS 变量或局部样式，但必须继续使用 Design Token，不得手写颜色或裸尺寸：

```tsx
<EditorShell
  className="my-editor-theme"
  model={model}
  windows={windows}
/>
```

```css
.my-editor-theme .flexlayout__layout {
  --color-text: var(--spectrum-neutral-content-color-default);
  --color-background: var(--spectrum-background-base-color);
  --color-drag1: var(--spectrum-accent-content-color-default);
}
```

由于底层库的主题使用 `.flexlayout__*` 类名，深度定制时仍会依赖 `flexlayout-react` 的 DOM 和 CSS 约定。升级底层库后需要进行视觉回归测试。

## EditorShellProps

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `model` | `EditorLayoutModel` | 必填 | 当前布局模型（由 `createEditorModel` 创建） |
| `windows` | `EditorWindowRegistry` | 必填 | component 到 React renderer 的映射 |
| `className` | `string` | `''` | 根节点额外类名 |
| `activeWindowId` | `string` | `undefined` | 调用方维护的活动窗口 ID |
| `onActiveWindowChange` | `(id) => void` | `undefined` | 用户按下标签时调用 |
| `onModelChange` | `(model, action) => void` | `undefined` | 底层模型发生动作时调用 |
| `renderTabIcon` | `(window) => ReactNode` | `undefined` | 自定义标签图标 |
| `renderTabLabel` | `(window) => ReactNode` | 窗口标题 | 自定义标签内容 |
| `renderUnknownWindow` | `(window) => ReactNode` | `null` | 未注册组件的回退内容 |
| `icons` | `EditorShellIcons` | 底层默认值 | 工具栏图标集合（推荐通过 IconProvider 注入） |
| `options` | `EditorShellOptions` | `{}` | flexlayout 布局选项，见下表 |

`EditorShellOptions`：

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `realtimeResize` | `boolean` | `true` | splitter 拖动时实时调整 |
| `supportsPopout` | `boolean` | `true` | 是否允许浏览器弹出窗口 |
| `popoutURL` | `string` | `/popout.html` | 弹出窗口使用的 HTML |
| `popoutWindowName` | `string` | `EditorWindow` | 浏览器窗口名称 |
| `constrainFloatPanels` | `boolean` | `false` | 是否限制内部浮动面板范围 |
| `tabDragSpeed` | `number` | `0.12` | 标签拖动速度配置 |

## 公共模型 API

| API | 作用 |
| --- | --- |
| `createEditorTab(definition)` | 将窗口定义转换成布局 tab JSON（`EditorLayoutTab`） |
| `createEditorModel(json, options?)` | 从 JSON 创建模型（`EditorLayoutModel`） |
| `serializeEditorModel(model)` | 将模型序列化成 JSON（`EditorLayoutJson`） |
| `getEditorWindow(model, id)` | 按 ID 获取窗口上下文 |
| `getActiveEditorWindow(model, preferredId?)` | 获取优先窗口或当前活动窗口 |
| `addEditorWindow(...)` | 向目标节点加入窗口 |
| `moveEditorWindow(...)` | 移动并重新停靠窗口 |
| `floatEditorWindow(model, id, type)` | 内部浮动或弹出浏览器窗口 |
| `selectEditorWindow(model, id)` | 选择窗口标签 |
| `updateEditorNodeConstraints(...)` | 更新 weight 和尺寸约束 |

包不直接暴露 `flexlayout-react` 的 `Model`、`Action`、`DockLocation` 等类型；公共 API 使用 shell 自有的 `EditorLayoutModel`、`EditorLayoutAction`、`EditorLayoutJson` 等 Adapter contract 别名。`EditorLayoutJson` 的结构与 FlexLayout JSON schema 一致，属于明确的 Adapter contract。

## 重要约定

1. 每个窗口 `id` 必须在整个模型中唯一且稳定。
2. `component` 必须与窗口注册表中的 key 对应。
3. tabset 和布局行的 `id` 也应稳定；移动窗口和修改约束依赖这些 ID。
4. `config` 最好保持 JSON 可序列化，否则 Layout 保存后可能丢失数据。
5. 窗口的业务状态不应全部塞入 Layout JSON。文档内容、选择状态等应由应用状态层管理。
6. FlexLayout 的 `Model` 会在动作执行时原地更新。不要依赖对象引用变化判断模型是否修改；可使用 `onModelChange` 或 `revision`。
7. storage 的异常处理由实现方负责。远程存储应考虑异步、版本和冲突；当前 `EditorLayoutStorage` 是同步接口。
8. Layout 结构发生破坏性升级时，应为已保存 JSON 增加版本号和迁移策略。

## 当前限制

- `EditorLayoutStorage` 当前只支持同步 `load`/`save`。
- 没有内置撤销/重做历史。
- 没有内置 Layout schema 版本迁移。
- 没有自动多显示器发现或原生窗口坐标恢复。
- 没有业务级快捷键和命令系统。
- 当前 package exports 指向 TypeScript 源码，适用于本 pnpm workspace；若要发布到 npm，需要改为 `dist` exports，并确保构建过程复制 CSS 和生成完整发布清单。

## 本仓库中的完整示例

可以参考：

- `apps/frontend-editor/src/App.tsx`：整体组合。
- `apps/frontend-editor/src/editor/layouts.ts`：Layout preset。
- `apps/frontend-editor/src/editor/windowRegistry.tsx`：业务视图注册。
- `apps/frontend-editor/src/editor/views/`：与包解耦的工具视图。
- `apps/frontend-editor/public/popout.html`：浏览器弹出窗口页面。

## 验证命令

在仓库根目录运行：

```bash
pnpm --filter editor-shell typecheck
pnpm --filter editor-shell build
pnpm --filter frontend-editor build
pnpm lint
```

