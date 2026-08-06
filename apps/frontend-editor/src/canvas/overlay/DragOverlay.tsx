import type { RefObject } from 'react'
import type { CanvasNode, CanvasNodeId } from '../core/canvas-node'
import type { DragState } from '../dnd/drag-controller'
import type { NodeGeometrySnapshot, Rect } from '../dnd/geometry'
import type { ViewportTransform } from '../viewport/viewport'
import { NodeContent } from '../runtime/DocumentRuntime'

const DRAG_GHOST_OFFSET = 12

export interface DragOverlayProps {
  drag: DragState
  geometry: NodeGeometrySnapshot
  draggedNode: CanvasNode | undefined
  viewportRef: RefObject<HTMLDivElement | null>
  viewport: ViewportTransform
  settle: { kind: 'placed' | 'rejected' } | null
}

export function DragOverlay({
  drag,
  geometry,
  draggedNode,
  viewportRef,
  viewport,
  settle,
}: DragOverlayProps) {
  if (drag.status !== 'dragging') return null

  const viewportElement = viewportRef.current
  const viewportRect = viewportElement?.getBoundingClientRect()

  const target = drag.drop
  const valid = target && target.status === 'valid' ? target : null
  const rejected = target && target.status === 'rejected' ? target : null

  const highlightId =
    valid && valid.placement === 'inside' ? valid.parentId : null
  const insertionRect = valid
    ? insertionLineRect(valid.parentId, valid.index, geometry)
    : undefined
  const insertionBand = valid
    ? insertionBandRect(valid.parentId, valid.index, geometry)
    : undefined
  const highlightRect = highlightId
    ? geometry.get(highlightId)?.rect
    : undefined

  const pointerInLayer = viewportRect
    ? {
        x: drag.ghostX - viewportRect.left,
        y: drag.ghostY - viewportRect.top,
      }
    : { x: drag.ghostX, y: drag.ghostY }

  const ghostOffset =
    draggedNode && geometry.has(draggedNode.id) && viewportRect
      ? {
          x: pointerInLayer.x + DRAG_GHOST_OFFSET,
          y: pointerInLayer.y + DRAG_GHOST_OFFSET,
        }
      : undefined

  const rejectedMessage = rejected
    ? rejectMessage(rejected.reason)
    : null

  return (
    <div className="canvas-drag-layer" aria-hidden="true">
      {highlightRect && viewportRect && (
        <div
          className={[
            'canvas-drop-highlight',
            settle?.kind === 'placed' ? 'canvas-drop-highlight-placed' : '',
          ].filter(Boolean).join(' ')}
          style={worldRectStyle(highlightRect, viewport)}
        />
      )}
      {insertionBand && viewportRect && (
        <div
          className={[
            'canvas-insertion-band',
            settle?.kind === 'placed' ? 'canvas-insertion-band-placed' : '',
          ].filter(Boolean).join(' ')}
          style={worldRectStyle(insertionBand, viewport)}
        />
      )}
      {insertionRect && viewportRect && (
        <div
          className="canvas-insertion-line"
          style={insertionStyle(insertionRect, viewport)}
        />
      )}
      {ghostOffset && draggedNode && (
        <div
          className="canvas-drag-ghost"
          style={{ left: ghostOffset.x, top: ghostOffset.y }}
        >
          <NodeContent node={draggedNode} />
        </div>
      )}
      {rejectedMessage && (
        <div
          className="canvas-drop-rejected"
          style={{ left: pointerInLayer.x, top: pointerInLayer.y }}
        >
          {rejectedMessage}
        </div>
      )}
    </div>
  )
}

function rejectMessage(reason: string): string {
  switch (reason) {
    case 'cycle':
      return 'Cannot move into itself or its children'
    case 'cannot-drag-root':
      return 'Cannot move the page root'
    case 'target-not-container':
      return 'Target cannot contain children'
    default:
      return 'Invalid drop target'
  }
}

function insertionLineRect(
  parentId: CanvasNodeId,
  index: number,
  geometry: NodeGeometrySnapshot,
): Rect {
  const parent = geometry.get(parentId)
  if (!parent) return { x: 0, y: 0, width: 0, height: 0 }
  const band = insertionBandRect(parentId, index, geometry)
  if (!band) return { x: 0, y: 0, width: 0, height: 0 }
  if (parent.layout === 'row') {
    return {
      x: band.x + band.width / 2,
      y: band.y,
      width: 0,
      height: band.height,
    }
  }
  return {
    x: band.x,
    y: band.y + band.height / 2,
    width: band.width,
    height: 0,
  }
}

const MIN_INSERTION_GAP = 12

function insertionBandRect(
  parentId: CanvasNodeId,
  index: number,
  geometry: NodeGeometrySnapshot,
): Rect | undefined {
  const parent = geometry.get(parentId)
  if (!parent) return undefined
  const horizontal = parent.layout === 'row'

  const children = parent.childIds
    .map((id) => geometry.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
  if (children.length === 0) return undefined
  const prev = index > 0 ? children[index - 1] : undefined
  const next = index < children.length ? children[index] : undefined
  const neighbors = [prev, next].flatMap((child) =>
    child ? [child] : [],
  )
  const crossStart = Math.min(
    ...neighbors.map((child) =>
      horizontal ? child.rect.y : child.rect.x,
    ),
  )
  const crossEnd = Math.max(
    ...neighbors.map((child) =>
      horizontal
        ? child.rect.y + child.rect.height
        : child.rect.x + child.rect.width,
    ),
  )

  if (horizontal) {
    let left = prev ? prev.rect.x + prev.rect.width : parent.rect.x
    let right = next ? next.rect.x : parent.rect.x + parent.rect.width
    const gap = right - left
    if (gap < MIN_INSERTION_GAP) {
      const center = (left + right) / 2
      left = Math.max(parent.rect.x, center - MIN_INSERTION_GAP / 2)
      right = Math.min(
        parent.rect.x + parent.rect.width,
        center + MIN_INSERTION_GAP / 2,
      )
    }
    if (right - left <= 0) return undefined
    return {
      x: left,
      y: crossStart,
      width: right - left,
      height: crossEnd - crossStart,
    }
  }

  let top = prev ? prev.rect.y + prev.rect.height : parent.rect.y
  let bottom = next ? next.rect.y : parent.rect.y + parent.rect.height
  const gap = bottom - top
  if (gap < MIN_INSERTION_GAP) {
    const center = (top + bottom) / 2
    top = Math.max(parent.rect.y, center - MIN_INSERTION_GAP / 2)
    bottom = Math.min(
      parent.rect.y + parent.rect.height,
      center + MIN_INSERTION_GAP / 2,
    )
  }
  if (bottom - top <= 0) return undefined
  return {
    x: crossStart,
    y: top,
    width: crossEnd - crossStart,
    height: bottom - top,
  }
}

function worldRectStyle(rect: Rect, viewport: ViewportTransform): Record<string, string> {
  return {
    left: `${rect.x * viewport.scale + viewport.panX}px`,
    top: `${rect.y * viewport.scale + viewport.panY}px`,
    width: `${rect.width * viewport.scale}px`,
    height: `${rect.height * viewport.scale}px`,
  }
}

function insertionStyle(
  rect: Rect,
  viewport: ViewportTransform,
): Record<string, string> {
  const horizontal = rect.width === 0
  if (horizontal) {
    return {
      left: `${rect.x * viewport.scale + viewport.panX - 1}px`,
      top: `${rect.y * viewport.scale + viewport.panY}px`,
      width: '2px',
      height: `${rect.height * viewport.scale}px`,
    }
  }
  return {
    left: `${rect.x * viewport.scale + viewport.panX}px`,
    top: `${rect.y * viewport.scale + viewport.panY - 1}px`,
    width: `${rect.width * viewport.scale}px`,
    height: '2px',
  }
}
