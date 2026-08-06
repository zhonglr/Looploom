import {
  Actions,
  DockLocation,
  Model,
  TabNode,
  type IJsonTabNode,
  type ITabAttributes,
  type ITabSetAttributes,
} from 'flexlayout-react'
import type {
  EditorDockLocation,
  EditorFloatType,
  EditorLayoutJson,
  EditorLayoutModel,
  EditorLayoutTab,
  EditorModelOptions,
  EditorNodeConstraints,
  EditorWindowDefinition,
  EditorWindowId,
  EditorWindowRenderContext,
} from './types'

const dockLocations: Record<EditorDockLocation, DockLocation> = {
  center: DockLocation.CENTER,
  left: DockLocation.LEFT,
  right: DockLocation.RIGHT,
  top: DockLocation.TOP,
  bottom: DockLocation.BOTTOM,
}

function toWindowContext(node: TabNode): EditorWindowRenderContext {
  return {
    id: node.getId(),
    title: node.getName(),
    component: node.getComponent() ?? '',
    config: node.getConfig(),
  }
}

export function createEditorTab(
  definition: EditorWindowDefinition,
): EditorLayoutTab {
  const tab: IJsonTabNode = {
    type: 'tab',
    id: definition.id,
    name: definition.title,
    component: definition.component,
    config: definition.config,
    enableClose: definition.enableClose ?? false,
    enableDrag: definition.enableDrag ?? true,
    enablePopout: definition.enablePopout ?? true,
  }
  if (definition.minWidth !== undefined) tab.minWidth = definition.minWidth
  if (definition.maxWidth !== undefined) tab.maxWidth = definition.maxWidth
  if (definition.minHeight !== undefined) tab.minHeight = definition.minHeight
  if (definition.maxHeight !== undefined) tab.maxHeight = definition.maxHeight
  return tab
}

export function createEditorModel(
  json: EditorLayoutJson,
  options: EditorModelOptions = {},
): EditorLayoutModel {
  const model = Model.fromJson(json)
  if (options.splitterSize !== undefined) {
    model.setSplitterSize(options.splitterSize)
  }
  return model
}

export function serializeEditorModel(
  model: EditorLayoutModel,
): EditorLayoutJson {
  return model.toJson()
}

export function getEditorWindow(
  model: EditorLayoutModel,
  id?: EditorWindowId,
): EditorWindowRenderContext | undefined {
  if (!id) return undefined
  const node = model.getNodeById(id)
  return node instanceof TabNode ? toWindowContext(node) : undefined
}

export function getActiveEditorWindow(
  model: EditorLayoutModel,
  preferredId?: EditorWindowId,
): EditorWindowRenderContext | undefined {
  if (preferredId) {
    const preferred = getEditorWindow(model, preferredId)
    if (preferred) return preferred
  }
  const activeTabset = model.getActiveTabset()
  const selected = activeTabset?.getSelectedNode()
  return selected instanceof TabNode ? toWindowContext(selected) : undefined
}

export function addEditorWindow(
  model: EditorLayoutModel,
  definition: EditorWindowDefinition,
  targetId: string,
  location: EditorDockLocation = 'center',
  select = true,
): EditorWindowRenderContext | undefined {
  const node = model.doAction(
    Actions.addTab(
      createEditorTab(definition),
      targetId,
      dockLocations[location],
      -1,
      select,
    ),
  )
  return node instanceof TabNode ? toWindowContext(node) : undefined
}

export function moveEditorWindow(
  model: EditorLayoutModel,
  windowId: string,
  targetId: string,
  location: EditorDockLocation = 'center',
  select = true,
) {
  return model.doAction(
    Actions.moveNode(windowId, targetId, dockLocations[location], -1, select),
  )
}

export function floatEditorWindow(
  model: EditorLayoutModel,
  windowId: string,
  type: EditorFloatType = 'float',
) {
  return model.doAction(Actions.popoutTab(windowId, type))
}

export function selectEditorWindow(
  model: EditorLayoutModel,
  windowId: string,
) {
  return model.doAction(Actions.selectTab(windowId))
}

export function updateEditorNodeConstraints(
  model: EditorLayoutModel,
  nodeId: string,
  constraints: EditorNodeConstraints,
) {
  if (!model.getNodeById(nodeId)) return undefined
  const attributes: ITabSetAttributes | ITabAttributes = constraints
  return model.doAction(Actions.updateNodeAttributes(nodeId, attributes))
}
