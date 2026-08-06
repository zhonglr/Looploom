import type { CanvasDocument, CanvasNode, CanvasNodeId } from '../core/canvas-node'
import { isContainerNode } from '../core/canvas-node'
import type { NodeGeometrySnapshot, Rect } from '../dnd/geometry'
import { containsPoint, rectToWorld } from '../dnd/geometry'
import type { Point, ViewportTransform } from '../viewport/viewport'

export function buildWorldSnapshot(
  document: CanvasDocument,
  rects: Record<CanvasNodeId, Rect>,
  viewport: ViewportTransform,
): NodeGeometrySnapshot {
  const map = new Map() as NodeGeometrySnapshot
  const walk = (node: CanvasNode, parentId: CanvasNodeId | null, depth: number) => {
    const screen = rects[node.id]
    map.set(node.id, {
      id: node.id,
      parentId,
      depth,
      isContainer: isContainerNode(node),
      layout: isContainerNode(node) ? node.layout : null,
      rect: screen ? rectToWorld(screen, viewport) : { x: 0, y: 0, width: 0, height: 0 },
      childIds: isContainerNode(node) ? node.children.map((child) => child.id) : [],
    })
    if (isContainerNode(node)) {
      for (const child of node.children) walk(child, node.id, depth + 1)
    }
  }
  walk(document.root, null, 0)
  return map
}

export function hitTestNode(
  document: CanvasDocument,
  rects: Record<CanvasNodeId, Rect>,
  point: Point,
): CanvasNodeId | null {
  let best: CanvasNodeId | null = null
  const walk = (node: CanvasNode) => {
    const rect = rects[node.id]
    if (rect && containsPoint(rect, point)) {
      best = node.id
      if (isContainerNode(node)) {
        for (const child of node.children) walk(child)
      }
    }
  }
  walk(document.root)
  return best
}