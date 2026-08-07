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
      /** True when dropping here wouldn't change the document layout. */
      noop: boolean
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
  pageEdgeZoneWorld: number,
): DropTarget {
  if (dragNodeId === rootId) {
    return { status: 'rejected', reason: 'cannot-drag-root' }
  }

  const pageEdgeTarget = findPageEdgeTarget(
    pointerWorld,
    dragNodeId,
    geometry,
    rootId,
    pageEdgeZoneWorld,
  )
  if (pageEdgeTarget) return pageEdgeTarget

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

function findPageEdgeTarget(
  point: Point,
  dragNodeId: CanvasNodeId,
  geometry: NodeGeometrySnapshot,
  rootId: CanvasNodeId,
  edgeZone: number,
): Extract<DropTarget, { status: 'valid' }> | undefined {
  const root = geometry.get(rootId)
  if (!root?.isContainer || !root.layout || edgeZone <= 0) return undefined

  const horizontal = isHorizontalLayout(root.layout)
  const mainPoint = horizontal ? point.x : point.y
  const crossPoint = horizontal ? point.y : point.x
  const mainStart = horizontal ? root.rect.x : root.rect.y
  const mainEnd = horizontal
    ? root.rect.x + root.rect.width
    : root.rect.y + root.rect.height
  const crossStart = horizontal ? root.rect.y : root.rect.x
  const crossEnd = horizontal
    ? root.rect.y + root.rect.height
    : root.rect.x + root.rect.width

  if (crossPoint < crossStart - edgeZone || crossPoint > crossEnd + edgeZone) {
    return undefined
  }

  const leadingDistance = Math.abs(mainPoint - mainStart)
  const trailingDistance = Math.abs(mainPoint - mainEnd)
  if (Math.min(leadingDistance, trailingDistance) > edgeZone) return undefined

  if (root.childIds.length === 0) {
    return validTarget(rootId, 0, 'inside', dragNodeId, geometry)
  }

  const leading = leadingDistance <= trailingDistance
  return validTarget(
    rootId,
    leading ? 0 : root.childIds.length,
    leading ? 'before' : 'after',
    dragNodeId,
    geometry,
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

function validTarget(
  parentId: CanvasNodeId,
  index: number,
  placement: DropPlacement,
  dragNodeId: CanvasNodeId,
  geometry: NodeGeometrySnapshot,
): Extract<DropTarget, { status: 'valid' }> {
  const me = geometry.get(dragNodeId)
  const sameParent = me?.parentId === parentId
  const ownIndex =
    sameParent && geometry.get(parentId)
      ? geometry.get(parentId)!.childIds.indexOf(dragNodeId)
      : -1
  const noop =
    sameParent && (index === ownIndex || index === ownIndex + 1)
  return { status: 'valid', parentId, index, placement, noop }
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
    return {
      status: 'valid',
      parentId,
      index: 0,
      placement: 'inside',
      noop: false,
    }
  }

  const horizontal = isHorizontalLayout(parent.layout)
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i]
    if (!child) continue
    if (!containsPoint(child.rect, pointerWorld)) continue

    if (child.id === dragNodeId) {
      return validTarget(parentId, i, 'before', dragNodeId, geometry)
    }

    const before = horizontal
      ? pointerWorld.x < rectCenterX(child.rect)
      : pointerWorld.y < rectCenterY(child.rect)
    const index = before ? i : i + 1
    return validTarget(
      parentId,
      index,
      before ? 'before' : 'after',
      dragNodeId,
      geometry,
    )
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
  return validTarget(
    parentId,
    nearestIndex,
    nearestIndex < children.length ? 'before' : 'after',
    dragNodeId,
    geometry,
  )
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
