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

const DRAG_GHOST_OFFSET = 12
const REJECTED_MESSAGE_GAP = 10

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function SmoothGhost({
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
  const posRef = useRef({ x: initialX ?? targetX, y: initialY ?? targetY })
  const targetRef = useRef({ x: targetX, y: targetY })
  const startedRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  targetRef.current = { x: targetX, y: targetY }

  useEffect(() => {
    posRef.current = { x: pos.x, y: pos.y }
  }, [pos])

  useEffect(() => {
    if (!startedRef.current && initialX !== undefined && initialY !== undefined) {
      startedRef.current = true
    }
    const animate = () => {
      const current = posRef.current
      const target = targetRef.current
      const dx = target.x - current.x
      const dy = target.y - current.y
      const dist = Math.hypot(dx, dy)
      if (dist < 0.5) {
        setPos({ x: target.x, y: target.y })
        rafRef.current = null
        return
      }
      const t = Math.min(1, 0.18)
      const next = { x: lerp(current.x, target.x, t), y: lerp(current.y, target.y, t) }
      posRef.current = next
      setPos(next)
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [targetX, targetY, initialX, initialY])

  return (
    <div
      className="canvas-drag-ghost"
      style={{ left: pos.x, top: pos.y }}
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
      {ghostOffset && draggedNode && (() => {
        if (drag.status === 'dragging' && drag.originScreen && viewportRect) {
          const originInLayer = {
            x: drag.originScreen.x - viewportRect.left + DRAG_GHOST_OFFSET,
            y: drag.originScreen.y - viewportRect.top + DRAG_GHOST_OFFSET,
          }
          return (
            <SmoothGhost
              targetX={ghostOffset.x}
              targetY={ghostOffset.y}
              initialX={originInLayer.x}
              initialY={originInLayer.y}
            >
              <NodeContent node={draggedNode} />
            </SmoothGhost>
          )
        }
        return (
          <div
            className="canvas-drag-ghost"
            style={{ left: ghostOffset.x, top: ghostOffset.y }}
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

