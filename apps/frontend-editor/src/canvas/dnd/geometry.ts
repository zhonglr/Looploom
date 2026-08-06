import type { CanvasLayoutKind, CanvasNodeId } from '../core/canvas-node'
import type { Point, ViewportTransform } from '../viewport/viewport'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface NodeGeometrySnapshotEntry {
  id: CanvasNodeId
  parentId: CanvasNodeId | null
  depth: number
  isContainer: boolean
  layout: CanvasLayoutKind | null
  rect: Rect
  childIds: CanvasNodeId[]
}

export type NodeGeometrySnapshot = Map<CanvasNodeId, NodeGeometrySnapshotEntry>

export function rectFromClient(
  rect: { left: number; top: number; width: number; height: number },
  viewportRect: { left: number; top: number },
): Rect {
  return {
    x: rect.left - viewportRect.left,
    y: rect.top - viewportRect.top,
    width: rect.width,
    height: rect.height,
  }
}

export function rectToWorld(rect: Rect, transform: ViewportTransform): Rect {
  const topLeft = worldPointOf(
    { x: rect.x, y: rect.y },
    transform,
  )
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: rect.width / transform.scale,
    height: rect.height / transform.scale,
  }
}

export function worldPointOf(point: Point, transform: ViewportTransform): Point {
  return {
    x: (point.x - transform.panX) / transform.scale,
    y: (point.y - transform.panY) / transform.scale,
  }
}

export function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

export function rectCenterX(rect: Rect): number {
  return rect.x + rect.width / 2
}

export function rectCenterY(rect: Rect): number {
  return rect.y + rect.height / 2
}

export function isHorizontalLayout(layout: CanvasLayoutKind): boolean {
  return layout === 'row'
}
