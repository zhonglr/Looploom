import type { RefObject } from 'react'
import type { CanvasNode, CanvasNodeId } from '../core/canvas-node'
import type { DragState } from '../dnd/drag-controller'
import type { DropTarget } from '../dnd/drop-target'
import type { NodeGeometrySnapshot, Rect } from '../dnd/geometry'
import type { ViewportTransform } from '../viewport/viewport'
import { NodeContent } from '../runtime/DocumentRuntime'

const DRAG_GHOST_OFFSET = 12
const REJECTED_MESSAGE_GAP = 10
const MIN_INSERTION_GAP = 12
const MAX_INSERTION_GAP = 96
const LAYOUT_GAP = 8

export type SettleState =
  | {
      kind: 'placed'
      target: Extract<DropTarget, { status: 'valid' }>
      ghostX: number
      ghostY: number
    }
  | { kind: 'rejected'; message: string }
  | null

export interface DragOverlayProps {
  drag: DragState
  geometry: NodeGeometrySnapshot
  draggedNode: CanvasNode | undefined
  viewportRef: RefObject<HTMLDivElement | null>
  viewport: ViewportTransform
  settle: SettleState
}

export function DragOverlay({
  drag,
  geometry,
  draggedNode,
  viewportRef,
  viewport,
  settle,
}: DragOverlayProps) {
  if (drag.status !== 'dragging' && settle === null) return null

  const settling = settle !== null
  const viewportElement = viewportRef.current
  const viewportRect = viewportElement?.getBoundingClientRect()

  const target =
    drag.drop?.status === 'valid'
      ? drag.drop
      : settle?.kind === 'placed'
        ? settle.target
        : null
  const valid = target
  const rejected = drag.drop?.status === 'rejected' ? drag.drop : null

  const highlightId = valid ? valid.parentId : null
  const draggedRectId = drag.nodeId ?? draggedNode?.id
  const draggedRect = draggedRectId
    ? geometry.get(draggedRectId)?.rect
    : undefined
  const insertion = valid
    ? insertionMetrics(valid.parentId, valid.index, geometry, draggedRect)
    : undefined
  const insertionRect = insertion?.line
  const insertionBand = insertion?.band
  const highlightRect = highlightId
    ? geometry.get(highlightId)?.rect
    : undefined

  const pointerInLayer = viewportRect
    ? {
        x: drag.ghostX - viewportRect.left,
        y: drag.ghostY - viewportRect.top,
      }
    : { x: drag.ghostX, y: drag.ghostY }

  const settlingGhost =
    settle?.kind === 'placed' && viewportRect
      ? {
          x: settle.ghostX - viewportRect.left + DRAG_GHOST_OFFSET,
          y: settle.ghostY - viewportRect.top + DRAG_GHOST_OFFSET,
        }
      : undefined

  const ghostOffset =
    draggedNode && viewportRect && (drag.status === 'dragging' || settlingGhost)
      ? settlingGhost ?? {
          x: pointerInLayer.x + DRAG_GHOST_OFFSET,
          y: pointerInLayer.y + DRAG_GHOST_OFFSET,
        }
      : undefined

  const rejectedMessage = rejected
    ? rejectMessage(rejected.reason)
    : null

  return (
    <div
      className={[
        'canvas-drag-layer',
        settling ? 'canvas-drag-layer-settling' : '',
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
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
          className={[
            'canvas-drop-rejected',
            pointerInLayer.y < 80 ? 'canvas-drop-rejected-below' : '',
          ].filter(Boolean).join(' ')}
          style={{
            left: pointerInLayer.x,
            top:
              pointerInLayer.y < 80
                ? pointerInLayer.y + REJECTED_MESSAGE_GAP
                : pointerInLayer.y - REJECTED_MESSAGE_GAP,
          }}
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

function insertionMetrics(
  parentId: CanvasNodeId,
  index: number,
  geometry: NodeGeometrySnapshot,
  draggedRect: Rect | undefined,
): { line: Rect; band: Rect } | undefined {
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
  const neighborMainSize = Math.max(
    ...neighbors.map((child) =>
      horizontal ? child.rect.width : child.rect.height,
    ),
  )
  const fallbackSlotSize = Math.max(
    MIN_INSERTION_GAP,
    Math.min(MAX_INSERTION_GAP, neighborMainSize),
  )
  const slotSize = draggedRect
    ? horizontal
      ? draggedRect.width
      : draggedRect.height
    : fallbackSlotSize

  const mainStart = (child: NonNullable<typeof prev>) =>
    horizontal
      ? child.rect.x + child.rect.width
      : child.rect.y + child.rect.height
  const mainEnd = (child: NonNullable<typeof prev>) =>
    horizontal ? child.rect.x : child.rect.y

  let linePos: number
  let bandStart: number
  let bandEnd: number

  if (prev && next) {
    const gapStart = mainStart(prev)
    const gapEnd = mainEnd(next)
    const gap = gapEnd - gapStart
    const boundary = (gapStart + gapEnd) / 2
    const width = Math.max(
      MIN_INSERTION_GAP,
      Math.min(gap, slotSize),
    )
    linePos = boundary
    bandStart = boundary - width / 2
    bandEnd = boundary + width / 2
  } else if (prev) {
    const gapStart = mainStart(prev)
    const slotStart = gapStart + LAYOUT_GAP
    linePos = slotStart
    bandStart = slotStart
    bandEnd = slotStart + slotSize
  } else if (next) {
    const gapEnd = mainEnd(next)
    const slotEnd = gapEnd - LAYOUT_GAP
    linePos = slotEnd
    bandStart = slotEnd - slotSize
    bandEnd = slotEnd
  } else {
    return undefined
  }

  if (horizontal) {
    return {
      line: {
        x: linePos,
        y: crossStart,
        width: 0,
        height: crossEnd - crossStart,
      },
      band: {
        x: bandStart,
        y: crossStart,
        width: bandEnd - bandStart,
        height: crossEnd - crossStart,
      },
    }
  }
  return {
    line: {
      x: crossStart,
      y: linePos,
      width: crossEnd - crossStart,
      height: 0,
    },
    band: {
      x: crossStart,
      y: bandStart,
      width: crossEnd - crossStart,
      height: bandEnd - bandStart,
    },
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
