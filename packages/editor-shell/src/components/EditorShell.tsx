import { Layout, type ITabRenderValues, type TabNode } from 'flexlayout-react'
import { useCallback } from 'react'
import type { ReactNode } from 'react'
import type {
  EditorLayoutAction,
  EditorLayoutModel,
  EditorShellIcons,
  EditorWindowRegistry,
  EditorWindowRenderContext,
} from '../adapter/types'
import { useEditorShellIcons } from './EditorShellIconProvider'
import 'flexlayout-react/style/dark.css'
import '../styles/editor-shell.css'

const defaultPopoutURL = '/popout.html'
const defaultPopoutWindowName = 'EditorWindow'
const defaultTabDragSpeed = 0.12

export interface EditorShellOptions {
  realtimeResize?: boolean
  supportsPopout?: boolean
  popoutURL?: string
  popoutWindowName?: string
  constrainFloatPanels?: boolean
  tabDragSpeed?: number
}

export interface EditorShellProps {
  model: EditorLayoutModel
  windows: EditorWindowRegistry
  className?: string
  activeWindowId?: string
  onActiveWindowChange?: (id: string) => void
  onModelChange?: (
    model: EditorLayoutModel,
    action: EditorLayoutAction,
  ) => void
  renderTabIcon?: (window: EditorWindowRenderContext) => ReactNode
  renderTabLabel?: (window: EditorWindowRenderContext) => ReactNode
  renderUnknownWindow?: (window: EditorWindowRenderContext) => ReactNode
  icons?: EditorShellIcons
  options?: EditorShellOptions
}

export function EditorShell({
  model,
  windows,
  className = '',
  activeWindowId,
  onActiveWindowChange,
  onModelChange,
  renderTabIcon,
  renderTabLabel,
  renderUnknownWindow,
  icons: propsIcons,
  options = {},
}: EditorShellProps) {
  const contextIcons = useEditorShellIcons()
  const icons = propsIcons ?? contextIcons

  const toContext = useCallback(
    (node: TabNode): EditorWindowRenderContext => ({
      id: node.getId(),
      title: node.getName(),
      component: node.getComponent() ?? '',
      config: node.getConfig(),
    }),
    [],
  )

  const factory = useCallback(
    (node: TabNode) => {
      const renderer = windows[node.getComponent() ?? '']
      const context = toContext(node)
      return renderer?.(context) ?? renderUnknownWindow?.(context) ?? null
    },
    [renderUnknownWindow, toContext, windows],
  )

  const onRenderTab = useCallback(
    (node: TabNode, values: ITabRenderValues) => {
      const context = toContext(node)
      values.leading = renderTabIcon?.(context)
      values.content = (
        <span
          className="editor-shell__tab-label"
          onPointerDown={() => onActiveWindowChange?.(context.id)}
        >
          {renderTabLabel?.(context) ?? context.title}
        </span>
      )
    },
    [onActiveWindowChange, renderTabIcon, renderTabLabel, toContext],
  )

  const layoutOptions = {
    realtimeResize: options.realtimeResize ?? true,
    supportsPopout: options.supportsPopout ?? true,
    popoutURL: options.popoutURL ?? defaultPopoutURL,
    popoutWindowName: options.popoutWindowName ?? defaultPopoutWindowName,
    constrainFloatPanels: options.constrainFloatPanels ?? false,
    tabDragSpeed: options.tabDragSpeed ?? defaultTabDragSpeed,
  }

  return (
    <div
      className={`editor-shell-root flexlayout__theme_dark ${className}`}
      data-active-window={activeWindowId}
    >
      <Layout
        model={model}
        factory={factory}
        onRenderTab={onRenderTab}
        {...(onModelChange !== undefined ? { onModelChange } : {})}
        {...(icons !== undefined ? { icons } : {})}
        {...layoutOptions}
      />
    </div>
  )
}
