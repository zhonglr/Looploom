import { useEffect, useRef, useState } from 'react'
import type { CanvasNode, CanvasNodeId } from '../core/canvas-node'
import { nodeKindLabel } from '../core/canvas-node'
import type { NodeGeometrySnapshot, Rect } from '../dnd/geometry'
import type { ViewportTransform } from '../viewport/viewport'

export interface SelectionOverlayProps {
  geometry: NodeGeometrySnapshot
  viewport: ViewportTransform
  selection: CanvasNodeId | null
  selectedNode: CanvasNode | undefined
  hover: CanvasNodeId | null
  rootId: CanvasNodeId
}

interface OverlayRect {
  left: number
  top: number
  width: number
  height: number
}

export function SelectionOverlay({
  geometry,
  viewport,
  selection,
  selectedNode,
  hover,
  rootId,
}: SelectionOverlayProps) {
  const selectedRect = selection ? rectFor(geometry, viewport, selection) : undefined
  const isHoveringRoot = hover === rootId
  const hoverRect =
    hover && hover !== selection && !isHoveringRoot
      ? rectFor(geometry, viewport, hover)
      : undefined

  const [hoverVisible, setHoverVisible] = useState(false)
  const hoverHideTimer = useRef<number | null>(null)
  const lastHoverRect = useRef<OverlayRect | undefined>(undefined)

  if (hoverRect) {
    lastHoverRect.current = hoverRect
  }

  useEffect(() => {
    if (hoverRect) {
      if (hoverHideTimer.current !== null) {
        window.clearTimeout(hoverHideTimer.current)
        hoverHideTimer.current = null
      }
      setHoverVisible(true)
    } else {
      hoverHideTimer.current = window.setTimeout(() => {
        setHoverVisible(false)
        hoverHideTimer.current = null
      }, 120)
    }
    return () => {
      if (hoverHideTimer.current !== null) {
        window.clearTimeout(hoverHideTimer.current)
        hoverHideTimer.current = null
      }
    }
  }, [hoverRect])

  return (
    <div className="canvas-overlay" aria-hidden="true">
      <div
        className="canvas-overlay-box canvas-overlay-box-hover"
        style={{
          ...boxStyle(hoverRect ?? lastHoverRect.current ?? { left: 0, top: 0, width: 0, height: 0 }),
          opacity: hoverVisible && hoverRect ? 1 : 0,
        }}
      />
      {selectedRect && selectedNode && (
        <>
          <div
            className="canvas-overlay-box canvas-overlay-box-selected"
            style={boxStyle(selectedRect)}
          />
          <div
            className="canvas-overlay-label"
            style={{ left: selectedRect.left, top: selectedRect.top }}
          >
            {nodeKindLabel(selectedNode.kind)} · {selectedNode.name}
          </div>
        </>
      )}
    </div>
  )
}

function rectFor(
  geometry: NodeGeometrySnapshot,
  viewport: ViewportTransform,
  nodeId: CanvasNodeId,
): OverlayRect | undefined {
  const rect = geometry.get(nodeId)?.rect
  if (!rect) return undefined
  return worldRect(rect, viewport)
}

function worldRect(rect: Rect, viewport: ViewportTransform): OverlayRect {
  return {
    left: rect.x * viewport.scale + viewport.panX,
    top: rect.y * viewport.scale + viewport.panY,
    width: rect.width * viewport.scale,
    height: rect.height * viewport.scale,
  }
}

function boxStyle(rect: OverlayRect): Record<string, string> {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
}