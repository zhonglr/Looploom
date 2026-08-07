import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { CanvasNode } from '../core/canvas-node'
import type { DragState, SettleState } from '../dnd/drag-controller'
import type { NodeGeometrySnapshot } from '../dnd/geometry'
import type { FramePreviewSlot } from '../frame/bridge'
import type { ViewportTransform } from '../viewport/viewport'
import { NodeContent } from '../runtime/DocumentRuntime'
import {
  computeInsertionMetrics,
  insertionStyle,
  worldRectStyle,
} from './overlay-geometry'

const DRAG_IMAGE_OFFSET = 12
const REJECTED_MESSAGE_GAP = 10
const GLIDE_STEP = 0.4

function SmoothDragImage({
  targetX,
  targetY,
  initialX,
  initialY,
  children,
}: {
  targetX: number
  targetY: number
  initialX?: number
  initialY?: number
  children: ReactNode
}) {
  const [pos, setPos] = useState({
    x: initialX ?? targetX,
    y: initialY ?? targetY,
  })
  const posRef = useRef(pos)
  posRef.current = pos
  const targetRef = useRef({ x: targetX, y: targetY })
  targetRef.current = { x: targetX, y: targetY }
  const rafRef = useRef(0)
  const [exact, setExact] = useState(false)

  useEffect(() => {
    const animate = () => {
      const current = posRef.current
      const target = targetRef.current
      const dx = target.x - current.x
      const dy = target.y - current.y
      const dist = Math.hypot(dx, dy)
      if (dist < 0.5) {
        posRef.current = target
        setPos({ x: target.x, y: target.y })
        setExact(true)
        return
      }
      const t = 1 - Math.exp(-GLIDE_STEP)
      posRef.current = { x: current.x + dx * t, y: current.y + dy * t }
      setPos(posRef.current)
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  useEffect(() => {
    if (!exact) return
    setPos({ x: targetX, y: targetY })
  }, [targetX, targetY, exact])

  return (
    <div
      className="canvas-drag-image"
      style={{ left: pos.x, top: pos.y, transition: 'none' }}
    >
      {children}
    </div>
  )
}

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
  const lastViewportRef = useRef(viewport)
  const viewportMoving =
    viewport.panX !== lastViewportRef.current.panX ||
    viewport.panY !== lastViewportRef.current.panY ||
    viewport.scale !== lastViewportRef.current.scale
  useEffect(() => {
    lastViewportRef.current = viewport
  }, [viewport])

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
  const liveSlot =
    livePreview && valid && livePreview.parentId === valid.parentId
      ? livePreview.rect
      : undefined
  const insertion = valid
    ? computeInsertionMetrics(
        valid.parentId,
        valid.index,
        geometry,
        draggedRect,
        draggedRectId ?? null,
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
        x: drag.imageX - viewportRect.left,
        y: drag.imageY - viewportRect.top,
      }
    : { x: drag.imageX, y: drag.imageY }

  const settlingImage =
    settle?.kind === 'placed' && viewportRect
      ? {
          x: settle.imageX - viewportRect.left + DRAG_IMAGE_OFFSET,
          y: settle.imageY - viewportRect.top + DRAG_IMAGE_OFFSET,
        }
      : undefined

  const imageOffset =
    draggedNode && viewportRect && (drag.status === 'dragging' || settlingImage)
      ? settlingImage ?? {
          x: pointerInLayer.x + DRAG_IMAGE_OFFSET,
          y: pointerInLayer.y + DRAG_IMAGE_OFFSET,
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
          style={{
            ...worldRectStyle(highlightRect, viewport),
            transition: viewportMoving ? 'none' : undefined,
          }}
        />
      )}
      {insertionBand && viewportRect && (
        <div
          className={[
            'canvas-insertion-band',
            settle?.kind === 'placed' ? 'canvas-insertion-band-placed' : '',
          ].filter(Boolean).join(' ')}
          style={{
            ...worldRectStyle(insertionBand, viewport),
            transition: viewportMoving ? 'none' : undefined,
          }}
        />
      )}
      {insertionRect && viewportRect && (
        <div
          className="canvas-insertion-line"
          style={{
            ...insertionStyle(insertionRect, viewport),
            transition: viewportMoving ? 'none' : undefined,
          }}
        />
      )}
      {imageOffset && draggedNode && (() => {
        if (drag.status === 'dragging' && drag.originScreen && viewportRect) {
          const originInLayer = {
            x: drag.originScreen.x - viewportRect.left + DRAG_IMAGE_OFFSET,
            y: drag.originScreen.y - viewportRect.top + DRAG_IMAGE_OFFSET,
          }
          return (
            <SmoothDragImage
              targetX={imageOffset.x}
              targetY={imageOffset.y}
              initialX={originInLayer.x}
              initialY={originInLayer.y}
            >
              <NodeContent node={draggedNode} />
            </SmoothDragImage>
          )
        }
        return (
          <div
            className="canvas-drag-image"
            style={{ left: imageOffset.x, top: imageOffset.y }}
          >
            <NodeContent node={draggedNode} />
          </div>
        )
      })()}
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

