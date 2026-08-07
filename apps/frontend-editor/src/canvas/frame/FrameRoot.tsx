import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CanvasDocument, CanvasNode, CanvasNodeId } from '../core/canvas-node'
import { isLayoutNode } from '../core/canvas-node'
import type { Rect } from '../dnd/geometry'
import { createViewport } from '../viewport/viewport'
import type { ViewportTransform } from '../viewport/viewport'
import { DocumentRuntime } from '../runtime/DocumentRuntime'
import type { NodeElementRegistry } from '../runtime/DocumentRuntime'
import { getNode } from '../core/document'
import { postToHost } from './bridge'
import type { FrameEditingState, FrameInsertionPreview } from './bridge'
import { validateHostToFrameMessage } from './protocol'
import { PAGE_MIN_HEIGHT, PAGE_WIDTH } from '../core/page'

export function FrameRoot() {
  const [projection, setProjection] = useState<{
    document: CanvasDocument
    revision: number
  } | null>(null)
  const [viewport, setViewport] = useState<ViewportTransform>(() => createViewport())
  const [draggingNodeId, setDraggingNodeId] = useState<CanvasNodeId | null>(null)
  const [displacedParentId, setDisplacedParentId] = useState<CanvasNodeId | null>(null)
  const [insertionPreview, setInsertionPreview] = useState<FrameInsertionPreview | null>(null)
  const [editing, setEditing] = useState<FrameEditingState | null>(null)
  const registryRef = useRef<NodeElementRegistry>(new Map())
  const previewRegistryRef = useRef<NodeElementRegistry>(new Map())
  const pageRef = useRef<HTMLDivElement>(null)
  const frameSessionIdRef = useRef(`frame-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  const viewportRevisionRef = useRef(0)
  const interactionRevisionRef = useRef(0)

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const result = validateHostToFrameMessage(event.data)
      if (!result.ok) return
      const message = result.value
      switch (message.type) {
        case 'document':
          setProjection({ document: message.document, revision: message.revision })
          break
        case 'viewport':
          viewportRevisionRef.current += 1
          setViewport(message.transform)
          break
        case 'interaction':
          interactionRevisionRef.current += 1
          setDraggingNodeId(message.draggingNodeId)
          setDisplacedParentId(message.displacedParentId)
          setInsertionPreview(message.insertionPreview)
          setEditing(message.editing)
          break
      }
    }
    window.addEventListener('message', handleMessage)
    postToHost({ type: 'ready', frameSessionId: frameSessionIdRef.current })
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const reportGeometry = useCallback(() => {
    if (!projection) return
    const rects = measureAll(projection.document, registryRef.current)
    const page = pageRef.current
    const preview = measurePreview(previewRegistryRef.current, registryRef.current)
    postToHost({
      type: 'geometry',
      version: {
        frameSessionId: frameSessionIdRef.current,
        documentRevision: projection.revision,
        viewportRevision: viewportRevisionRef.current,
        interactionRevision: interactionRevisionRef.current,
      },
      rects,
      pageSize: page
        ? {
            width: page.getBoundingClientRect().width / viewport.scale,
            height: page.getBoundingClientRect().height / viewport.scale,
          }
        : { width: PAGE_WIDTH, height: PAGE_MIN_HEIGHT },
      preview,
    })
  }, [projection, viewport])

  useLayoutEffect(() => {
    reportGeometry()
  }, [reportGeometry, viewport, draggingNodeId, insertionPreview, editing])

  useEffect(() => {
    const page = pageRef.current
    if (!page) return undefined
    const observer = new ResizeObserver(() => reportGeometry())
    observer.observe(page)
    return () => observer.disconnect()
  }, [reportGeometry])

  return (
    <div className="canvas-frame-surface">
      {document && (
        <div
          className="canvas-frame-stage"
          style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px)` }}
        >
          <div
            ref={pageRef}
            className="canvas-frame-page"
            style={{ zoom: viewport.scale, width: PAGE_WIDTH, minHeight: PAGE_MIN_HEIGHT }}
          >
            <DocumentRuntime
              document={projection.document}
              registry={registryRef.current}
              previewRegistry={previewRegistryRef.current}
              previewNode={
                draggingNodeId ? getNode(projection.document, draggingNodeId) : undefined
              }
              draggingNodeId={draggingNodeId}
              displacedParentId={displacedParentId}
              insertionPreview={insertionPreview}
              editingNodeId={editing?.nodeId ?? null}
              editingValueRef={undefined}
              onEditCommit={(nodeId, value) => postToHost({ type: 'editCommit', nodeId, value })}
              onEditCancel={(nodeId) => postToHost({ type: 'editCancel', nodeId })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function measureAll(
  document: CanvasDocument,
  registry: NodeElementRegistry,
): Record<CanvasNodeId, Rect> {
  const rects: Record<CanvasNodeId, Rect> = {}
  const walk = (node: CanvasNode) => {
    const element = registry.get(node.id)
    if (element) {
      const rect = element.getBoundingClientRect()
      rects[node.id] = { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    }
    if (isLayoutNode(node)) {
      for (const child of node.children) walk(child)
    }
  }
  walk(document.root)
  return rects
}

function measurePreview(
  previewRegistry: NodeElementRegistry,
  registry: NodeElementRegistry,
): { parentId: CanvasNodeId; rect: Rect; parentRect: Rect | null; prevRect: Rect | null } | null {
  for (const [parentId, element] of previewRegistry) {
    const rect = element.getBoundingClientRect()
    const parentElement = registry.get(parentId)
    const parentRect = parentElement
      ? (() => {
          const r = parentElement.getBoundingClientRect()
          return { x: r.left, y: r.top, width: r.width, height: r.height }
        })()
      : null
    return { parentId, rect, parentRect, prevRect: null }
  }
  return null
}