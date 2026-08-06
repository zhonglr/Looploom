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

export type CanvasNode = CanvasTextNode | CanvasButtonNode | CanvasContainerNode

export interface CanvasDocument {
  id: CanvasNodeId
  name: string
  root: CanvasContainerNode
}

export type CanvasNodeKind = CanvasNode['kind']

export function isContainerNode(
  node: CanvasNode,
): node is CanvasContainerNode {
  return node.kind === 'container'
}

const nodeKindLabels: Record<CanvasNodeKind, string> = {
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
