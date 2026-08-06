import type { CanvasRejectCode } from '../core/commands'
import type { CanvasNodeId } from '../core/canvas-node'
import type { NodeGeometrySnapshot, NodeGeometrySnapshotEntry } from './geometry'
import {
  containsPoint,
  isHorizontalLayout,
  rectCenterX,
  rectCenterY,
} from './geometry'
import type { Point } from '../viewport/viewport'

export type DropPlacement = 'inside' | 'before' | 'after'

export type DropTarget =
  | {
      status: 'valid'
      parentId: CanvasNodeId
      index: number
      placement: DropPlacement
    }
  | {
      status: 'rejected'
      reason: CanvasRejectCode | 'cannot-drag-root' | 'invalid'
    }

export function computeDropTarget(
  pointerWorld: Point,
  dragNodeId: CanvasNodeId,
  geometry: NodeGeometrySnapshot,
  rootId: CanvasNodeId,
): DropTarget {
  if (dragNodeId === rootId) {
    return { status: 'rejected', reason: 'cannot-drag-root' }
  }

  const targetContainer = findDeepestContainerContaining(pointerWorld, geometry)
  if (!targetContainer) {
    return { status: 'rejected', reason: 'invalid' }
  }
  if (isWithinSubtreeOf(geometry, targetContainer.id, dragNodeId)) {
    return { status: 'rejected', reason: 'cycle' }
  }

  return insertPointInContainer(
    geometry,
    targetContainer.id,
    dragNodeId,
    pointerWorld,
  )
}

function findDeepestContainerContaining(
  point: Point,
  geometry: NodeGeometrySnapshot,
): NodeGeometrySnapshotEntry | undefined {
  let deepest: NodeGeometrySnapshotEntry | undefined
  for (const entry of geometry.values()) {
    if (!entry.isContainer) continue
    if (!containsPoint(entry.rect, point)) continue
    if (deepest === undefined || entry.depth > deepest.depth) {
      deepest = entry
    }
  }
  return deepest
}

function insertPointInContainer(
  geometry: NodeGeometrySnapshot,
  parentId: CanvasNodeId,
  dragNodeId: CanvasNodeId,
  pointerWorld: Point,
): DropTarget {
  const parent = geometry.get(parentId)
  if (!parent || !parent.isContainer || !parent.layout) {
    return { status: 'rejected', reason: 'target-not-container' }
  }

  const children = parent.childIds
    .map((id) => geometry.get(id))
    .filter((entry): entry is NodeGeometrySnapshotEntry => entry !== undefined)

  if (children.length === 0) {
    return { status: 'valid', parentId, index: 0, placement: 'inside' }
  }

  const horizontal = isHorizontalLayout(parent.layout)
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i]
    if (!child) continue
    if (!containsPoint(child.rect, pointerWorld)) continue

    if (child.id === dragNodeId) {
      return {
        status: 'valid',
        parentId,
        index: i,
        placement: 'before',
      }
    }

    const before = horizontal
      ? pointerWorld.x < rectCenterX(child.rect)
      : pointerWorld.y < rectCenterY(child.rect)
    const index = before ? i : i + 1
    return {
      status: 'valid',
      parentId,
      index,
      placement: before ? 'before' : 'after',
    }
  }

  return findNearestGap(
    geometry,
    parentId,
    children,
    dragNodeId,
    pointerWorld,
    horizontal,
  )
}

function findNearestGap(
  geometry: NodeGeometrySnapshot,
  parentId: CanvasNodeId,
  children: NodeGeometrySnapshotEntry[],
  dragNodeId: CanvasNodeId,
  pointerWorld: Point,
  horizontal: boolean,
): DropTarget {
  let nearestIndex = children.length
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i]
    if (!child) continue
    const distance = horizontal
      ? Math.abs(pointerWorld.x - rectCenterX(child.rect))
      : Math.abs(pointerWorld.y - rectCenterY(child.rect))
    if (distance < nearestDistance) {
      nearestDistance = distance
      const before = horizontal
        ? pointerWorld.x < rectCenterX(child.rect)
        : pointerWorld.y < rectCenterY(child.rect)
      nearestIndex = before ? i : i + 1
    }
  }

  if (isWithinSubtreeOf(geometry, parentId, dragNodeId)) {
    return { status: 'rejected', reason: 'cycle' }
  }
  return {
    status: 'valid',
    parentId,
    index: nearestIndex,
    placement: nearestIndex < children.length ? 'before' : 'after',
  }
}

function isWithinSubtreeOf(
  geometry: NodeGeometrySnapshot,
  nodeId: CanvasNodeId,
  subtreeRootId: CanvasNodeId,
): boolean {
  let currentId: CanvasNodeId | undefined = nodeId
  while (currentId !== undefined) {
    if (currentId === subtreeRootId) return true
    const entry = geometry.get(currentId)
    currentId = entry?.parentId ?? undefined
  }
  return false
}
