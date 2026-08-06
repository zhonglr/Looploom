import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { CanvasNode, CanvasNodeId } from '../core/canvas-node'
import { nodeKindLabel } from '../core/canvas-node'
import type { NodeElementRegistry } from '../runtime/DocumentRuntime'
import type { ViewportTransform } from '../viewport/viewport'

export interface SelectionOverlayProps {
  registry: NodeElementRegistry
  viewportRef: RefObject<HTMLDivElement | null>
  viewport: ViewportTransform
  revision: number
  selection: CanvasNodeId | null
  selectedNode: CanvasNode | undefined
  hover: CanvasNodeId | null
}

interface OverlayRect {
  left: number
  top: number
  width: number
  height: number
}

export function SelectionOverlay({
  registry,
  viewportRef,
  viewport,
  revision,
  selection,
  selectedNode,
  hover,
}: SelectionOverlayProps) {
  const [selectedRect, setSelectedRect] = useState<OverlayRect | undefined>(undefined)
  const [hoverRect, setHoverRect] = useState<OverlayRect | undefined>(undefined)

  useLayoutEffect(() => {
    setSelectedRect(selection ? rectFor(registry, viewportRef, selection) : undefined)
    setHoverRect(
      hover && hover !== selection ? rectFor(registry, viewportRef, hover) : undefined,
    )
  }, [registry, viewportRef, viewport, revision, selection, hover])

  return (
    <div className="canvas-overlay" aria-hidden="true">
      {hoverRect && (
        <div
          className="canvas-overlay-box canvas-overlay-box-hover"
          style={boxStyle(hoverRect)}
        />
      )}
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
  registry: NodeElementRegistry,
  viewportRef: RefObject<HTMLDivElement | null>,
  nodeId: CanvasNodeId,
): OverlayRect | undefined {
  const element = registry.get(nodeId)
  const viewport = viewportRef.current
  if (!element || !viewport) return undefined
  const viewportRect = viewport.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  return {
    left: elementRect.left - viewportRect.left,
    top: elementRect.top - viewportRect.top,
    width: elementRect.width,
    height: elementRect.height,
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
