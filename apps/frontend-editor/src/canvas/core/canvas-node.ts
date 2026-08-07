export type CanvasNodeId = string

export interface CanvasNodeBase {
  id: CanvasNodeId
  name: string
}

export interface CanvasTextNode extends CanvasNodeBase {
  kind: 'text'
  text: string
}

export interface CanvasButtonNode extends CanvasNodeBase {
  kind: 'button'
  label: string
}

export type CanvasLayoutKind = 'block' | 'row' | 'column'

export interface CanvasContainerNode extends CanvasNodeBase {
  kind: 'container'
  layout: CanvasLayoutKind
  children: CanvasNode[]
}

export interface CanvasPageNode extends CanvasNodeBase {
  kind: 'page'
  layout: CanvasLayoutKind
  children: CanvasNode[]
}

export type CanvasNode = CanvasTextNode | CanvasButtonNode | CanvasContainerNode | CanvasPageNode

export interface CanvasDocument {
  id: CanvasNodeId
  name: string
  root: CanvasPageNode
}

export type CanvasNodeKind = CanvasNode['kind']

export function isContainerNode(
  node: CanvasNode,
): node is CanvasContainerNode {
  return node.kind === 'container'
}

export function isPageNode(
  node: CanvasNode,
): node is CanvasPageNode {
  return node.kind === 'page'
}

export function isLayoutNode(
  node: CanvasNode,
): node is CanvasContainerNode | CanvasPageNode {
  return node.kind === 'container' || node.kind === 'page'
}

const nodeKindLabels: Record<CanvasNodeKind, string> = {
  page: 'Page',
  container: 'Container',
  text: 'Text',
  button: 'Button',
}

const layoutKindLabels: Record<CanvasLayoutKind, string> = {
  block: 'Block',
  row: 'Row',
  column: 'Column',
}

export function nodeKindLabel(kind: CanvasNodeKind): string {
  return nodeKindLabels[kind]
}

export function layoutKindLabel(layout: CanvasLayoutKind): string {
  return layoutKindLabels[layout]
}
