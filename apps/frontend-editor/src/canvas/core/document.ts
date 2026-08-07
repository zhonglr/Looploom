import type {
  CanvasContainerNode,
  CanvasDocument,
  CanvasNode,
  CanvasNodeId,
  CanvasPageNode,
} from './canvas-node'
import { isLayoutNode, isPageNode } from './canvas-node'

export type CanvasLayoutParent = CanvasContainerNode | CanvasPageNode

export interface ParentOfNode {
  parent: CanvasLayoutParent
  index: number
}

export interface RemoveNodeResult {
  document: CanvasDocument
  node: CanvasNode
  parentId: CanvasNodeId
  index: number
}

export interface InsertNodeResult {
  document: CanvasDocument
  index: number
}

export interface MoveNodeResult {
  document: CanvasDocument
  node: CanvasNode
  fromParentId: CanvasNodeId
  fromIndex: number
  toParentId: CanvasNodeId
  toIndex: number
  moved: boolean
}

export interface SetTextResult {
  document: CanvasDocument
  changed: boolean
  previousValue: string
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length))
}

export function getNode(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
): CanvasNode | undefined {
  const path = findNodePath(document, nodeId)
  if (path === undefined) return undefined
  return getNodeByPath(document.root, path)
}

export function getNodeByPath(
  root: CanvasPageNode,
  path: readonly number[],
): CanvasNode | undefined {
  let node: CanvasNode = root
  for (const index of path) {
    if (!isLayoutNode(node)) return undefined
    const child: CanvasNode | undefined = node.children[index]
    if (!child) return undefined
    node = child
  }
  return node
}

export function findNodePath(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
): number[] | undefined {
  return findNodePathIn(document.root, nodeId, [])
}

function findNodePathIn(
  node: CanvasNode,
  nodeId: CanvasNodeId,
  prefix: number[],
): number[] | undefined {
  if (node.id === nodeId) return prefix
  if (!isLayoutNode(node)) return undefined
  for (let index = 0; index < node.children.length; index += 1) {
    const child: CanvasNode | undefined = node.children[index]
    if (!child) continue
    const result = findNodePathIn(child, nodeId, [...prefix, index])
    if (result) return result
  }
  return undefined
}

export function getParent(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
): ParentOfNode | undefined {
  const path = findNodePath(document, nodeId)
  if (!path || path.length === 0) return undefined
  const parentPath = path.slice(0, -1)
  const parent = getNodeByPath(document.root, parentPath)
  if (!parent || !isLayoutNode(parent)) return undefined
  return { parent, index: path[path.length - 1] ?? 0 }
}

export function collectNodeIds(node: CanvasNode): Set<CanvasNodeId> {
  const ids = new Set<CanvasNodeId>([node.id])
  if (isLayoutNode(node)) {
    for (const child of node.children) {
      for (const id of collectNodeIds(child)) {
        ids.add(id)
      }
    }
  }
  return ids
}

export function findDuplicateIds(node: CanvasNode): CanvasNodeId[] {
  const seen = new Set<CanvasNodeId>()
  const duplicates = new Set<CanvasNodeId>()
  function visit(n: CanvasNode): void {
    if (seen.has(n.id)) {
      duplicates.add(n.id)
    } else {
      seen.add(n.id)
    }
    if (isLayoutNode(n)) {
      for (const child of n.children) {
        visit(child)
      }
    }
  }
  visit(node)
  return [...duplicates]
}

export function isDescendantOf(
  document: CanvasDocument,
  ancestorId: CanvasNodeId,
  nodeId: CanvasNodeId,
): boolean {
  let currentId: CanvasNodeId | undefined = nodeId
  while (currentId !== undefined) {
    if (currentId === ancestorId) return true
    currentId = getParent(document, currentId)?.parent.id
  }
  return false
}

export function insertNodeAt(
  document: CanvasDocument,
  parentId: CanvasNodeId,
  index: number,
  node: CanvasNode,
): InsertNodeResult | undefined {
  const parentPath = findNodePath(document, parentId)
  if (!parentPath) return undefined
  const parent = getNodeByPath(document.root, parentPath)
  if (!parent || !isLayoutNode(parent)) return undefined
  const effectiveIndex = clampIndex(index, parent.children.length)
  const children = [...parent.children]
  children.splice(effectiveIndex, 0, node)
  const root = replaceNodeAt(document.root, parentPath, {
    ...parent,
    children,
  })
  return { document: { ...document, root }, index: effectiveIndex }
}

export function removeNodeAt(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
): RemoveNodeResult | undefined {
  if (nodeId === document.root.id) return undefined
  const path = findNodePath(document, nodeId)
  if (!path || path.length === 0) return undefined
  const parentPath = path.slice(0, -1)
  const index = path[path.length - 1] ?? 0
  const parent = getNodeByPath(document.root, parentPath)
  if (!parent || !isLayoutNode(parent)) return undefined
  const node = parent.children[index]
  if (!node) return undefined
  const children = parent.children.filter((_, childIndex) => childIndex !== index)
  const root = replaceNodeAt(document.root, parentPath, { ...parent, children })
  return {
    document: { ...document, root },
    node,
    parentId: parent.id,
    index,
  }
}

export function moveNodeIn(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  targetParentId: CanvasNodeId,
  targetIndex: number,
): MoveNodeResult | undefined {
  const source = removeNodeAt(document, nodeId)
  if (!source) return undefined
  const inserted = insertNodeAt(source.document, targetParentId, targetIndex, source.node)
  if (!inserted) return undefined
  const moved =
    source.parentId !== targetParentId || source.index !== inserted.index
  return {
    document: inserted.document,
    node: source.node,
    fromParentId: source.parentId,
    fromIndex: source.index,
    toParentId: targetParentId,
    toIndex: inserted.index,
    moved,
  }
}

export function setNodeText(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  value: string,
): SetTextResult | undefined {
  const path = findNodePath(document, nodeId)
  if (!path || path.length === 0) return undefined
  const node = getNodeByPath(document.root, path)
  if (!node) return undefined
  if (node.kind !== 'text' && node.kind !== 'button') return undefined
  const previousValue = node.kind === 'text' ? node.text : node.label
  if (previousValue === value) {
    return { document, changed: false, previousValue }
  }
  const updated: CanvasNode =
    node.kind === 'text' ? { ...node, text: value } : { ...node, label: value }
  const root = replaceNodeAt(document.root, path, updated)
  return { document: { ...document, root }, changed: true, previousValue }
}

function replaceNodeAt(
  root: CanvasPageNode,
  path: readonly number[],
  replacement: CanvasNode,
): CanvasPageNode {
  if (path.length === 0) return isPageNode(replacement) ? replacement : root
  const parentPath = path.slice(0, -1)
  const index = path[path.length - 1] ?? 0
  const parent = getNodeByPath(root, parentPath)
  if (!parent || !isLayoutNode(parent)) return root
  const children = [...parent.children]
  children[index] = replacement
  return replaceNodeAt(root, parentPath, { ...parent, children })
}
