import type { RefObject } from 'react'
import type { CanvasNode, CanvasNodeId } from '../core/canvas-node'
import type { DragState, SettleState } from '../dnd/drag-controller'
import type { NodeGeometrySnapshot, Rect } from '../dnd/geometry'
import type { FramePreviewSlot } from '../frame/bridge'
import type { ViewportTransform } from '../viewport/viewport'
import { NodeContent } from '../runtime/DocumentRuntime'

const DRAG_GHOST_OFFSET = 12
const REJECTED_MESSAGE_GAP = 10
export const MIN_INSERTION_GAP = 12
export const MAX_INSERTION_GAP = 96
export const LAYOUT_GAP = 8

export interface DragOverlayProps {
  drag: DragState
  geometry: NodeGeometrySnapshot
  draggedNode: CanvasNode | undefined
  viewportRef: RefObject<HTMLDivElement | null>
  viewport: ViewportTransform
  settle: SettleState
  livePreview: FramePreviewSlot | null
}

export function DragOverlay({
  drag,
  geometry,
  draggedNode,
  viewportRef,
  viewport,
  settle,
  livePreview,
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

  const noop = valid ? valid.noop : false
  const highlightId = valid ? valid.parentId : null
  const draggedRectId = drag.nodeId ?? draggedNode?.id
  const draggedRect = draggedRectId
    ? geometry.get(draggedRectId)?.rect
    : undefined
  const liveSlot =
    livePreview && valid && !noop && livePreview.parentId === valid.parentId
      ? livePreview.rect
      : undefined
  const insertion = valid
    ? insertionMetrics(
        valid.parentId,
        valid.index,
        geometry,
        draggedRect,
        draggedRectId,
        liveSlot,
        livePreview?.prevRect ?? null,
        livePreview?.parentRect ?? undefined,
      )
    : undefined
  const insertionRect = insertion?.line
  const insertionBand = insertion?.band
  const highlightRect = insertion?.highlight ?? (highlightId
    ? geometry.get(highlightId)?.rect
    : undefined)

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
  draggedId?: CanvasNodeId | null,
  liveSlot?: Rect,
  livePrevRect?: Rect | null,
  liveParentRect?: Rect,
): {
  line: Rect
  band: Rect
  highlight: Rect
} | undefined {
  const parent = geometry.get(parentId)
  if (!parent) return undefined
  const horizontal = parent.layout === 'row'

  // Neighbours are computed from the filtered list (dragged node removed) so
  // the visual slot is where the node will land after removal.
  const allChildren = parent.childIds
    .map((id) => geometry.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
  const children = allChildren.filter((entry) => entry.id !== draggedId)
  const ownIndex = draggedId ? allChildren.findIndex((e) => e.id === draggedId) : -1
  const adjustedIndex = ownIndex !== -1 && index > ownIndex ? index - 1 : index
  const filteredIndex = Math.max(0, Math.min(adjustedIndex, children.length))

  // A live slot is reported by the frame with the real layout sizes at the
  // target position (the dragged node re-rendered inside the target container),
  // so the overlay band tracks the exact slot the frame is showing and the
  // highlight follows the parent as it grows to fit the slot. The insertion
  // line sits in the gap on the leading side of the slot, clear of the
  // skeleton; for a before-first insertion it marks the trailing boundary.
  if (liveSlot) {
    const prevEnd = livePrevRect
      ? horizontal
        ? livePrevRect.x + livePrevRect.width
        : livePrevRect.y + livePrevRect.height
      : undefined
    const leading = horizontal ? liveSlot.x : liveSlot.y
    const trailing = horizontal
      ? liveSlot.x + liveSlot.width
      : liveSlot.y + liveSlot.height
    const linePos = prevEnd !== undefined
      ? prevEnd + (leading - prevEnd) / 2
      : trailing + LAYOUT_GAP / 2
    const line = horizontal
      ? { x: linePos, y: liveSlot.y, width: 0, height: liveSlot.height }
      : { x: liveSlot.x, y: linePos, width: liveSlot.width, height: 0 }
    return { line, band: liveSlot, highlight: liveParentRect ?? parent.rect }
  }

  // For same-parent moves the geometry still contains the dragged rect; dropping
  // to own position is already flagged noop upstream, so we never reach here for noop.
  if (children.length === 0) {
    const slot = draggedRect
      ? horizontal ? draggedRect.width : draggedRect.height
      : MAX_INSERTION_GAP
    const slotClamped = Math.max(MIN_INSERTION_GAP, Math.min(slot, MAX_INSERTION_GAP))
    // Empty container: carve a padded slot inside the parent so the overlay has
    // a stable target, and expand the highlight similarly to edge cases.
    const band: Rect = horizontal
      ? { x: parent.rect.x + LAYOUT_GAP, y: parent.rect.y + LAYOUT_GAP, width: slotClamped, height: Math.max(24, parent.rect.height - LAYOUT_GAP * 2) }
      : { x: parent.rect.x + LAYOUT_GAP, y: parent.rect.y + LAYOUT_GAP, width: Math.max(24, parent.rect.width - LAYOUT_GAP * 2), height: slotClamped }
    const line: Rect = horizontal
      ? { x: band.x + band.width, y: band.y, width: 0, height: band.height }
      : { x: band.x, y: band.y + band.height, width: band.width, height: 0 }
    const highlight: Rect = horizontal
      ? { ...parent.rect, width: parent.rect.width + slotClamped + LAYOUT_GAP }
      : { ...parent.rect, height: parent.rect.height + slotClamped + LAYOUT_GAP }
    return { line, band, highlight }
  }

  const prev = filteredIndex > 0 ? children[filteredIndex - 1] : undefined
  const next = filteredIndex < children.length ? children[filteredIndex] : undefined
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
  let highlight: Rect = parent.rect

  if (prev && next) {
    // Middle gap: the slot needs one gap on each side (the frame keeps the
    // dragged node in place, so the slot is the only layout mutation). When it
    // does not fit, expand the parent and push successors by the same amount
    // the flex layout will. The insertion line sits in the trailing gap, clear
    // of the skeleton, marking the boundary against the next element.
    const gapStart = mainStart(prev)
    const gapEnd = mainEnd(next)
    const gap = gapEnd - gapStart
    const needsPush = slotSize + LAYOUT_GAP * 2 > gap
    bandStart = gapStart + LAYOUT_GAP
    bandEnd = bandStart + slotSize
    if (needsPush) {
      const shift = slotSize + LAYOUT_GAP * 2 - gap
      highlight = horizontal
        ? { ...parent.rect, width: parent.rect.width + shift }
        : { ...parent.rect, height: parent.rect.height + shift }
    }
    linePos = bandEnd + LAYOUT_GAP / 2
  } else if (prev) {
    // After the last child: the container grows at its trailing edge.
    const gapStart = mainStart(prev)
    bandStart = gapStart + LAYOUT_GAP
    bandEnd = bandStart + slotSize
    // No follower to anchor the boundary against: mark the slot's leading edge,
    // between the previous element and the skeleton.
    linePos = bandStart - LAYOUT_GAP / 2
    highlight = horizontal
      ? { ...parent.rect, width: parent.rect.width + slotSize + LAYOUT_GAP }
      : { ...parent.rect, height: parent.rect.height + slotSize + LAYOUT_GAP }
  } else if (next) {
    // Before the first child: carve the slot out of the front and push the
    // existing children back so nothing sticks out of the container edge.
    const contentStart = mainEnd(next)
    bandStart = contentStart
    bandEnd = contentStart + slotSize
    linePos = bandEnd + LAYOUT_GAP / 2
    highlight = horizontal
      ? { ...parent.rect, width: parent.rect.width + slotSize + LAYOUT_GAP }
      : { ...parent.rect, height: parent.rect.height + slotSize + LAYOUT_GAP }
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
      highlight,
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
    highlight,
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
