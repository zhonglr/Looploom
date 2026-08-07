import type { CanvasNodeId } from '../core/canvas-node'
import type { NodeGeometrySnapshot, Rect } from '../dnd/geometry'
import type { ViewportTransform } from '../viewport/viewport'

export const MIN_INSERTION_GAP = 12
export const MAX_INSERTION_GAP = 96
export const LAYOUT_GAP = 8

export interface InsertionMetrics {
  line: Rect
  band: Rect
  highlight: Rect
}

export function computeInsertionMetrics(
  parentId: CanvasNodeId,
  index: number,
  geometry: NodeGeometrySnapshot,
  draggedRect: Rect | undefined,
  draggedId: CanvasNodeId | null,
  liveSlot: Rect | undefined,
  livePrevRect: Rect | null,
  liveParentRect: Rect | undefined,
): InsertionMetrics | undefined {
  const parent = geometry.get(parentId)
  if (!parent) return undefined
  const horizontal = parent.layout === 'row'

  const allChildren = parent.childIds
    .map((id) => geometry.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
  const children = allChildren.filter((entry) => entry.id !== draggedId)
  const ownIndex = draggedId ? allChildren.findIndex((e) => e.id === draggedId) : -1
  const adjustedIndex = ownIndex !== -1 && index > ownIndex ? index - 1 : index
  const filteredIndex = Math.max(0, Math.min(adjustedIndex, children.length))
  const isSameParent = ownIndex !== -1

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

  if (children.length === 0) {
    const slot = draggedRect
      ? horizontal ? draggedRect.width : draggedRect.height
      : MAX_INSERTION_GAP
    const slotClamped = Math.max(MIN_INSERTION_GAP, Math.min(slot, MAX_INSERTION_GAP))
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
    const gapStart = mainStart(prev)
    const gapEnd = mainEnd(next)
    const gap = gapEnd - gapStart
    const needsPush = slotSize + LAYOUT_GAP * 2 > gap
    bandStart = gapStart + LAYOUT_GAP
    bandEnd = bandStart + slotSize
    if (needsPush && !isSameParent) {
      const shift = slotSize + LAYOUT_GAP * 2 - gap
      highlight = horizontal
        ? { ...parent.rect, width: parent.rect.width + shift }
        : { ...parent.rect, height: parent.rect.height + shift }
    }
    linePos = bandEnd + LAYOUT_GAP / 2
  } else if (prev) {
    const gapStart = mainStart(prev)
    bandStart = gapStart + LAYOUT_GAP
    bandEnd = bandStart + slotSize
    linePos = bandStart - LAYOUT_GAP / 2
    highlight = isSameParent
      ? parent.rect
      : horizontal
        ? { ...parent.rect, width: parent.rect.width + slotSize + LAYOUT_GAP }
        : { ...parent.rect, height: parent.rect.height + slotSize + LAYOUT_GAP }
  } else if (next) {
    const contentStart = mainEnd(next)
    bandStart = contentStart
    bandEnd = contentStart + slotSize
    linePos = bandEnd + LAYOUT_GAP / 2
    highlight = isSameParent
      ? parent.rect
      : horizontal
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

export function worldRectStyle(rect: Rect, viewport: ViewportTransform): Record<string, string> {
  return {
    left: `${rect.x * viewport.scale + viewport.panX}px`,
    top: `${rect.y * viewport.scale + viewport.panY}px`,
    width: `${rect.width * viewport.scale}px`,
    height: `${rect.height * viewport.scale}px`,
  }
}

export function insertionStyle(
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
