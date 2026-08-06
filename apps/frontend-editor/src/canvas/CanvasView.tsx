import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type { CanvasNodeId } from './core/canvas-node'
import { isContainerNode } from './core/canvas-node'
import { getNode, getParent } from './core/document'
import { useCanvasEditorController, useCanvasEditorSnapshot } from './editor/context'
import { SelectionOverlay } from './overlay/SelectionOverlay'
import { DragOverlay, type SettleState } from './overlay/DragOverlay'
import { DocumentRuntime, type NodeElementRegistry } from './runtime/DocumentRuntime'
import { DragController, IDLE_DRAG_STATE } from './dnd/drag-controller'
import { computeDropTarget } from './dnd/drop-target'
import {
  rectFromClient,
  rectToWorld,
  type NodeGeometrySnapshot,
} from './dnd/geometry'
import {
  createViewport,
  fitViewport,
  formatZoom,
  panBy,
  screenToWorld,
  zoomAt,
  type ViewportTransform,
} from './viewport/viewport'
import './styles/canvas.css'

const ZOOM_STEP = 1.2
const ZOOM_REFERENCE_DELTA = 100
const ZOOM_MAX_NOTCHES = 1.5
const WHEEL_LINE_DELTA = 100
const WHEEL_PAGE_DELTA = 800
const FIT_PADDING = 48
const PAGE_WIDTH = 1440
const PAGE_MIN_HEIGHT = 900
const AUTO_PAN_EDGE = 64
const AUTO_PAN_SPEED = 16
const SETTLE_DURATION = 190

function normalizeWheelDelta(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * WHEEL_LINE_DELTA
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * WHEEL_PAGE_DELTA
  }
  return event.deltaY
}

export function CanvasView() {
  const controller = useCanvasEditorController()
  const snapshot = useCanvasEditorSnapshot()
  const [viewport, setViewport] = useState<ViewportTransform>(() => createViewport())
  const [hover, setHover] = useState<CanvasNodeId | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [, setResizeTick] = useState(0)
  const [, setOverlayTick] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const registryRef = useRef<NodeElementRegistry>(new Map())
  const panStartRef = useRef<{ x: number; y: number } | null>(null)
  const dragRef = useRef<DragController | null>(null)
  if (dragRef.current === null) {
    dragRef.current = new DragController({
      onDrop: (target) => {
        const state = dragRef.current!.getState()
        if (state.nodeId !== null) {
          controller.execute({
            type: 'document.moveNode',
            nodeId: state.nodeId,
            targetParentId: target.parentId,
            targetIndex: target.index,
          })
        }
      },
    })
  }
  const [dragState, setDragState] = useState(IDLE_DRAG_STATE)
  const [settle, setSettle] = useState<SettleState>(null)
  const dragNodeId = dragState.nodeId
  const draggingNodeId = dragState.status !== 'idle' ? dragNodeId : null
  const [geometry, setGeometry] = useState<NodeGeometrySnapshot>(new Map())
  const geometryRef = useRef<NodeGeometrySnapshot>(new Map())
  const viewportRef2 = useRef(viewport)
  viewportRef2.current = viewport
  const [editing, setEditing] = useState<{ nodeId: CanvasNodeId; initialValue: string } | null>(null)
  const editingValueRef = useRef<string | null>(null)
  const editingCommittedRef = useRef(false)

  const selectedNode = snapshot.selection
    ? getNode(snapshot.document, snapshot.selection)
    : undefined

  const editingNodeId = editing?.nodeId ?? null

  const commitEditing = () => {
    const current = editing
    if (!current || editingCommittedRef.current) return
    editingCommittedRef.current = true
    const value = editingValueRef.current ?? current.initialValue
    setEditing(null)
    editingValueRef.current = null
    controller.execute({ type: 'document.setText', nodeId: current.nodeId, value })
  }

  const cancelEditing = () => {
    if (editingCommittedRef.current) return
    setEditing(null)
    editingValueRef.current = null
  }

  useEffect(() => {
    return dragRef.current!.subscribe(() => {
      setDragState(dragRef.current!.getState())
    })
  }, [])

  useEffect(() => {
    return () => {
      if (autoPanRef.current !== null) {
        cancelAnimationFrame(autoPanRef.current)
      }
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect()
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
        const delta = normalizeWheelDelta(event)
        const notches =
          Math.max(-ZOOM_MAX_NOTCHES, Math.min(ZOOM_MAX_NOTCHES, delta / ZOOM_REFERENCE_DELTA))
        const factor = Math.pow(ZOOM_STEP, -notches)
        setViewport((current) => zoomAt(current, point, current.scale * factor))
      } else {
        if (panStartRef.current !== null) return
        setViewport((current) => panBy(current, -event.deltaX, -event.deltaY))
      }
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(true)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      setResizeTick((tick) => tick + 1)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    setOverlayTick((tick) => tick + 1)
  }, [snapshot.revision])

  const captureGeometry = () => {
    const viewportElement = viewportRef.current
    if (!viewportElement) return new Map() as NodeGeometrySnapshot
    const viewportRect = viewportElement.getBoundingClientRect()
    const map = new Map() as NodeGeometrySnapshot

    const walk = (node: import('./core/canvas-node').CanvasNode, parentId: CanvasNodeId | null, depth: number) => {
      const element = registryRef.current.get(node.id)
      const rect = element
        ? rectToWorld(rectFromClient(element.getBoundingClientRect(), viewportRect), viewportRef2.current)
        : { x: 0, y: 0, width: 0, height: 0 }
      map.set(node.id, {
        id: node.id,
        parentId,
        depth,
        isContainer: isContainerNode(node),
        layout: isContainerNode(node) ? node.layout : null,
        rect,
        childIds: isContainerNode(node) ? node.children.map((child) => child.id) : [],
      })
      if (isContainerNode(node)) {
        for (const child of node.children) walk(child, node.id, depth + 1)
      }
    }
    walk(snapshot.document.root, null, 0)
    return map
  }

  const autoPanRef = useRef<number | null>(null)
  const settleTimerRef = useRef<number | null>(null)
  const stopAutoPan = () => {
    if (autoPanRef.current !== null) {
      cancelAnimationFrame(autoPanRef.current)
      autoPanRef.current = null
    }
  }
  const runAutoPan = () => {
    if (autoPanRef.current !== null) return
    const tick = () => {
      const drag = dragRef.current!.getState()
      const viewportElement = viewportRef.current
      if (drag.status !== 'dragging' || !viewportElement) {
        autoPanRef.current = null
        return
      }
      const vpRect = viewportElement.getBoundingClientRect()
      const pointer = drag.pointerScreen
      let dx = 0
      let dy = 0
      if (pointer.x < vpRect.left + AUTO_PAN_EDGE) dx = -(AUTO_PAN_EDGE - (pointer.x - vpRect.left))
      else if (pointer.x > vpRect.right - AUTO_PAN_EDGE) dx = AUTO_PAN_EDGE - (vpRect.right - pointer.x)
      if (pointer.y < vpRect.top + AUTO_PAN_EDGE) dy = -(AUTO_PAN_EDGE - (pointer.y - vpRect.top))
      else if (pointer.y > vpRect.bottom - AUTO_PAN_EDGE) dy = AUTO_PAN_EDGE - (vpRect.bottom - pointer.y)
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy)
        const speed = AUTO_PAN_SPEED
        const pan = { x: (dx / len) * speed, y: (dy / len) * speed }
        const next = panBy(viewportRef2.current, -pan.x, -pan.y)
        viewportRef2.current = next
        setViewport(next)
        const world = screenToWorld(next, {
          x: pointer.x - vpRect.left,
          y: pointer.y - vpRect.top,
        })
        dragRef.current!.move(pointer, () => computeDropTarget(world, drag.nodeId!, geometryRef.current, snapshot.document.root.id))
      }
      autoPanRef.current = requestAnimationFrame(tick)
    }
    autoPanRef.current = requestAnimationFrame(tick)
  }

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    panStartRef.current = { x: event.clientX, y: event.clientY }
    setIsPanning(true)
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (editingNodeId !== null) {
      const target = (event.target as HTMLElement).closest('[data-canvas-node-id]')
      const nodeId = target?.getAttribute('data-canvas-node-id')
      if (nodeId !== editingNodeId) commitEditing()
      return
    }
    viewportRef.current?.focus()
    if (event.button === 1 || (event.button === 0 && spaceHeld)) {
      startPan(event)
      return
    }
    if (event.button !== 0) return
    const target = (event.target as HTMLElement).closest('[data-canvas-node-id]')
    const nodeId = target?.getAttribute('data-canvas-node-id') ?? null
    controller.select(nodeId)
    if (nodeId === null || nodeId === snapshot.document.root.id) return
    const geometryMap = captureGeometry()
    geometryRef.current = geometryMap
    setGeometry(geometryMap)
    dragRef.current!.start(nodeId, { x: event.clientX, y: event.clientY })
  }

  const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (editingNodeId !== null) return
    const target = (event.target as HTMLElement).closest('[data-canvas-node-id]')
    const nodeId = target?.getAttribute('data-canvas-node-id')
    if (!nodeId) return
    const node = getNode(snapshot.document, nodeId)
    if (!node || node.kind === 'container') return
    const initialValue = node.kind === 'text' ? node.text : node.label
    controller.select(nodeId)
    editingCommittedRef.current = false
    setEditing({ nodeId, initialValue })
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panStartRef.current !== null) {
      const start = panStartRef.current
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      panStartRef.current = { x: event.clientX, y: event.clientY }
      setViewport((current) => panBy(current, dx, dy))
      return
    }
    const current = dragRef.current!.getState()
    if (current.status === 'idle') {
      const target = (event.target as HTMLElement).closest('[data-canvas-node-id]')
      const nodeId = target?.getAttribute('data-canvas-node-id')
      setHover(nodeId ?? null)
      return
    }
    const pointer = { x: event.clientX, y: event.clientY }
    if (current.status === 'pending' || current.status === 'dragging') {
      const viewportElement = viewportRef.current
      const viewportRect = viewportElement?.getBoundingClientRect()
      const world = viewportRect
        ? screenToWorld(viewportRef2.current, {
            x: pointer.x - viewportRect.left,
            y: pointer.y - viewportRect.top,
          })
        : { x: 0, y: 0 }
      dragRef.current!.move(pointer, () =>
        computeDropTarget(world, current.nodeId!, geometryRef.current, snapshot.document.root.id),
      )
      runAutoPan()
    }
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const wasPanning = panStartRef.current !== null
    panStartRef.current = null
    setIsPanning(false)
    stopAutoPan()
    const state = dragRef.current!.getState()
    if (state.status !== 'idle') {
      const lastDrop = state.drop
      const ghostX = state.ghostX
      const ghostY = state.ghostY
      dragRef.current!.drop()
      if (lastDrop?.status === 'valid') {
        setSettle({ kind: 'placed', target: lastDrop, ghostX, ghostY })
      } else if (lastDrop?.status === 'rejected') {
        setSettle({ kind: 'rejected', message: lastDrop.reason })
      }
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current)
      }
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null
        setSettle(null)
      }, SETTLE_DURATION)
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    void wasPanning
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    panStartRef.current = null
    setIsPanning(false)
    stopAutoPan()
    dragRef.current!.cancel()
    setSettle(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handlePointerLeave = () => {
    if (panStartRef.current === null && dragRef.current!.getState().status === 'idle') {
      setHover(null)
    }
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editingNodeId !== null) {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelEditing()
      }
      return
    }
    const modifier = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()
    if (modifier && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) {
        controller.redo()
      } else {
        controller.undo()
      }
      return
    }
    if (modifier && key === 'y') {
      event.preventDefault()
      controller.redo()
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (snapshot.selection !== null) {
        event.preventDefault()
        controller.execute({
          type: 'document.removeNode',
          nodeId: snapshot.selection,
        })
      }
      return
    }
    if (event.key === 'Escape') {
      if (dragRef.current!.getState().status !== 'idle') {
        dragRef.current!.cancel()
        stopAutoPan()
        setSettle(null)
      } else {
        controller.select(null)
      }
      return
    }
    if (event.key === 'ArrowUp' && snapshot.selection !== null) {
      const parent = getParent(snapshot.document, snapshot.selection)
      if (parent) {
        event.preventDefault()
        controller.select(parent.parent.id)
      }
    }
  }

  const viewportCenter = (): { x: number; y: number } | undefined => {
    const element = viewportRef.current
    if (!element) return undefined
    return { x: element.clientWidth / 2, y: element.clientHeight / 2 }
  }

  const handleZoomIn = () => {
    const center = viewportCenter()
    if (center) {
      setViewport((current) => zoomAt(current, center, current.scale * ZOOM_STEP))
    }
  }

  const handleZoomOut = () => {
    const center = viewportCenter()
    if (center) {
      setViewport((current) => zoomAt(current, center, current.scale / ZOOM_STEP))
    }
  }

  const handleZoomReset = () => {
    setViewport((current) => ({ ...current, scale: 1 }))
  }

  const fitPageToViewport = () => {
    const viewportElement = viewportRef.current
    const page = pageRef.current
    if (!viewportElement || !page) return
    setViewport(
      fitViewport(
        { width: page.offsetWidth, height: page.offsetHeight },
        { width: viewportElement.clientWidth, height: viewportElement.clientHeight },
        FIT_PADDING,
      ),
    )
  }

  useLayoutEffect(() => {
    fitPageToViewport()
  }, [])

  const viewportClass = [
    'canvas-viewport',
    isPanning ? 'canvas-viewport-panning' : '',
    spaceHeld && !isPanning ? 'canvas-viewport-space-pan' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className="canvas-window" aria-label="Canvas">
      <header className="canvas-toolbar">
        <div className="canvas-toolbar-group">
          <button
            type="button"
            className="canvas-toolbar-button"
            aria-label="Zoom out"
            onClick={handleZoomOut}
          >
            −
          </button>
          <button
            type="button"
            className="canvas-toolbar-button canvas-toolbar-zoom"
            aria-label="Reset zoom to 100%"
            onClick={handleZoomReset}
          >
            {formatZoom(viewport)}
          </button>
          <button
            type="button"
            className="canvas-toolbar-button"
            aria-label="Zoom in"
            onClick={handleZoomIn}
          >
            +
          </button>
          <button
            type="button"
            className="canvas-toolbar-button"
            aria-label="Fit canvas to viewport"
            onClick={fitPageToViewport}
          >
            Fit
          </button>
        </div>
        <p className="canvas-toolbar-hint" aria-hidden="true">
          Space or middle-drag to pan · Ctrl/Cmd + wheel to zoom
        </p>
      </header>
      <div
        ref={viewportRef}
        tabIndex={0}
        role="application"
        aria-label="Canvas viewport"
        className={viewportClass}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        onKeyDown={handleKeyDown}
        onDoubleClick={handleDoubleClick}
      >
        <div
          className="canvas-world"
          style={{
            transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.scale})`,
          }}
        >
          <div
            ref={pageRef}
            className="canvas-page"
            style={{ width: PAGE_WIDTH, minHeight: PAGE_MIN_HEIGHT }}
          >
            <DocumentRuntime
              document={snapshot.document}
              registry={registryRef.current}
              draggingNodeId={draggingNodeId}
              editingNodeId={editingNodeId}
              editingValueRef={editingValueRef}
              onEditCommit={commitEditing}
              onEditCancel={cancelEditing}
            />
          </div>
        </div>
        <SelectionOverlay
          registry={registryRef.current}
          viewportRef={viewportRef}
          viewport={viewport}
          revision={snapshot.revision}
          selection={snapshot.selection}
          selectedNode={selectedNode}
          hover={hover}
        />
        <DragOverlay
          drag={dragState}
          geometry={geometry}
          draggedNode={dragNodeId ? getNode(snapshot.document, dragNodeId) : undefined}
          viewportRef={viewportRef}
          viewport={viewport}
          settle={settle}
        />
      </div>
    </section>
  )
}
