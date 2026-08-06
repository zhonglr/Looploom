import { useEffect, useRef, useState } from 'react'
import { getNode } from './core/document'
import { useCanvasEditorController, useCanvasEditorSnapshot } from './editor/context'
import { useViewportController } from './viewport/useViewportController'
import { useCanvasInteractions } from './interaction/useCanvasInteractions'
import { SelectionOverlay } from './overlay/SelectionOverlay'
import { DragOverlay } from './overlay/DragOverlay'
import { postToFrame } from './frame/bridge'
import type { FramePageSize, FrameToHostMessage } from './frame/bridge'
import { formatZoom } from './viewport/viewport'
import { PAGE_MIN_HEIGHT, PAGE_WIDTH } from './core/page'
import './styles/canvas.css'

// oxlint-disable react/iframe-missing-sandbox -- trusted same-origin frame needs allow-same-origin for origin-checked postMessage (see docs/plans/m5)

const FRAME_SRC = '/canvas-frame.html'

export function CanvasView() {
  const controller = useCanvasEditorController()
  const snapshot = useCanvasEditorSnapshot()
  const viewportRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const pageSizeRef = useRef<FramePageSize>({
    width: PAGE_WIDTH,
    height: PAGE_MIN_HEIGHT,
  })
  const [frameReady, setFrameReady] = useState(false)

  const viewportController = useViewportController({
    viewportRef,
    getPageSize: () => pageSizeRef.current,
  })
  const { viewport } = viewportController

  const interactions = useCanvasInteractions({
    controller,
    snapshot,
    viewportController,
    viewportRef,
    onPageSize: (size) => {
      pageSizeRef.current = size
    },
  })

  const draggingNodeId =
    interactions.dragState.status === 'dragging' ? interactions.dragState.nodeId : null

  useEffect(() => {
    postToFrame(iframeRef.current, {
      type: 'document',
      revision: snapshot.revision,
      document: snapshot.document,
    })
  }, [snapshot.revision, snapshot.document])

  useEffect(() => {
    postToFrame(iframeRef.current, { type: 'viewport', transform: viewport })
  }, [viewport])

  useEffect(() => {
    postToFrame(iframeRef.current, {
      type: 'interaction',
      draggingNodeId,
      displacedParentId: interactions.displacedParentId,
      insertionPreview: interactions.insertionPreview,
      editing: interactions.editing,
    })
  }, [draggingNodeId, interactions.displacedParentId, interactions.insertionPreview, interactions.editing])

  useEffect(() => {
    if (!frameReady) return
    postToFrame(iframeRef.current, {
      type: 'document',
      revision: snapshot.revision,
      document: snapshot.document,
    })
    postToFrame(iframeRef.current, { type: 'viewport', transform: viewport })
    postToFrame(iframeRef.current, {
      type: 'interaction',
      draggingNodeId,
      displacedParentId: interactions.displacedParentId,
      insertionPreview: interactions.insertionPreview,
      editing: interactions.editing,
    })
  }, [
    frameReady,
    snapshot.revision,
    snapshot.document,
    viewport,
    draggingNodeId,
    interactions.displacedParentId,
    interactions.insertionPreview,
    interactions.editing,
  ])

  useEffect(() => {
    const handleMessage = (event: MessageEvent<FrameToHostMessage>) => {
      if (event.origin !== window.location.origin) return
      if (event.source !== iframeRef.current?.contentWindow) return
      if (event.data.type === 'ready') {
        setFrameReady(true)
        return
      }
      interactions.onFrameMessage(event.data)
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [interactions])

  const selectedNode = snapshot.selection
    ? getNode(snapshot.document, snapshot.selection)
    : undefined

  const viewportClass = [
    'canvas-viewport',
    viewportController.isPanning ? 'canvas-viewport-panning' : '',
    viewportController.spaceHeld && !viewportController.isPanning
      ? 'canvas-viewport-space-pan'
      : '',
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
            onClick={viewportController.handleZoomOut}
          >
            −
          </button>
          <button
            type="button"
            className="canvas-toolbar-button canvas-toolbar-zoom"
            aria-label="Reset zoom to 100%"
            onClick={viewportController.handleZoomReset}
          >
            {formatZoom(viewport)}
          </button>
          <button
            type="button"
            className="canvas-toolbar-button"
            aria-label="Zoom in"
            onClick={viewportController.handleZoomIn}
          >
            +
          </button>
          <button
            type="button"
            className="canvas-toolbar-button"
            aria-label="Fit canvas to viewport"
            onClick={viewportController.fitPageToViewport}
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
        onKeyDown={interactions.handleKeyDown}
      >
        <iframe
          ref={iframeRef}
          src={FRAME_SRC}
          title="Canvas frame"
          sandbox="allow-scripts allow-same-origin"
          className="canvas-frame"
        />
        <div
          className={[
            'canvas-hit-layer',
            interactions.editing !== null ? 'canvas-hit-layer-inactive' : '',
          ].filter(Boolean).join(' ')}
          onPointerDown={interactions.handlePointerDown}
          onPointerMove={interactions.handlePointerMove}
          onPointerUp={interactions.handlePointerUp}
          onPointerCancel={interactions.handlePointerCancel}
          onPointerLeave={interactions.handlePointerLeave}
          onDoubleClick={interactions.handleDoubleClick}
        />
        {interactions.dragState.status === 'idle' && interactions.settle === null && (
          <SelectionOverlay
            geometry={interactions.geometry}
            viewport={viewport}
            selection={snapshot.selection}
            selectedNode={selectedNode}
            hover={interactions.hover}
          />
        )}
        <DragOverlay
          drag={interactions.dragState}
          geometry={interactions.geometry}
          draggedNode={
            interactions.dragState.nodeId
              ? getNode(snapshot.document, interactions.dragState.nodeId)
              : undefined
          }
          viewportRef={viewportRef}
          viewport={viewport}
          settle={interactions.settle}
          livePreview={interactions.livePreview}
        />
      </div>
    </section>
  )
}