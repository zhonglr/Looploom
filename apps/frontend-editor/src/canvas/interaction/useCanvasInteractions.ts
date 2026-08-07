import { useEffect, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type { RefObject } from 'react'
import type { CanvasNodeId } from '../core/canvas-node'
import { isLayoutNode } from '../core/canvas-node'
import { getNode, getParent } from '../core/document'
import type { CanvasEditorController, CanvasEditorSnapshot } from '../editor/controller'
import type { NodeGeometrySnapshot, Rect } from '../dnd/geometry'
import { rectToWorld } from '../dnd/geometry'
import { computeDropTarget } from '../dnd/drop-target'
import { DragController, IDLE_DRAG_STATE } from '../dnd/drag-controller'
import type { DragState, SettleState } from '../dnd/drag-controller'
import { buildWorldSnapshot, hitTestNode } from '../frame/snapshot'
import type {
  FrameEditingState,
  FrameInsertionPreview,
  FramePageSize,
  FramePreviewSlot,
  FrameToHostMessage,
  ProjectionVersion,
} from '../frame/bridge'
import { fitViewport, panBy, screenToWorld } from '../viewport/viewport'
import type { Point } from '../viewport/viewport'
import type { ViewportController } from '../viewport/useViewportController'
import { createPointerSession } from './pointer-session'

const AUTO_PAN_EDGE = 64
const AUTO_PAN_SPEED = 16
const SETTLE_DURATION = 190
const FIT_PADDING = 48

export interface UseCanvasInteractionsOptions {
  controller: CanvasEditorController
  snapshot: CanvasEditorSnapshot
  viewportController: ViewportController
  viewportRef: RefObject<HTMLDivElement | null>
  onPageSize: (size: FramePageSize) => void
}

export interface CanvasInteractions {
  hover: CanvasNodeId | null
  dragState: DragState
  settle: SettleState
  editing: FrameEditingState | null
  geometry: NodeGeometrySnapshot
  livePreview: FramePreviewSlot | null
  displacedParentId: CanvasNodeId | null
  insertionPreview: FrameInsertionPreview | null
  handlePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  handlePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  handlePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void
  handlePointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void
  handlePointerLeave: () => void
  handleDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void
  handleKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  onFrameMessage: (message: FrameToHostMessage, expectedVersion: ProjectionVersion | null) => void
}

export function useCanvasInteractions({
  controller,
  snapshot,
  viewportController,
  viewportRef,
  onPageSize,
}: UseCanvasInteractionsOptions): CanvasInteractions {
  const optionsRef = useRef<UseCanvasInteractionsOptions>({
    controller,
    snapshot,
    viewportController,
    viewportRef,
    onPageSize,
  })
  optionsRef.current = {
    controller,
    snapshot,
    viewportController,
    viewportRef,
    onPageSize,
  }

  const viewportRef2 = useRef(viewportController.viewport)
  viewportRef2.current = viewportController.viewport

  const frameRectsRef = useRef<Record<CanvasNodeId, Rect>>({})
  const fittedRef = useRef(false)

  const [hover, setHover] = useState<CanvasNodeId | null>(null)
  const [editing, setEditing] = useState<FrameEditingState | null>(null)
  const editingRef = useRef<FrameEditingState | null>(null)
  editingRef.current = editing

  const [dragState, setDragState] = useState<DragState>(IDLE_DRAG_STATE)
  const dragRef = useRef<DragController | null>(null)
  if (dragRef.current === null) {
    dragRef.current = new DragController({
      onDrop: (target) => {
        if (target.noop) return
        const state = dragRef.current!.getState()
        if (state.nodeId !== null) {
          optionsRef.current.controller.execute({
            type: 'document.moveNode',
            nodeId: state.nodeId,
            targetParentId: target.parentId,
            targetIndex: target.index,
          })
        }
      },
    })
  }

  const [settle, setSettle] = useState<SettleState>(null)
  const [geometry, setGeometry] = useState<NodeGeometrySnapshot>(
    new Map() as NodeGeometrySnapshot,
  )
  const geometryRef = useRef<NodeGeometrySnapshot>(geometry)
  geometryRef.current = geometry

  const [livePreview, setLivePreview] = useState<FramePreviewSlot | null>(null)

  const displacedParentId =
    dragState.status === 'dragging' &&
    dragState.drop?.status === 'valid' &&
    !dragState.drop.noop
      ? computeDisplacedParentId(dragState.drop, geometryRef.current, dragState.nodeId)
      : null

  const insertionPreview = (() => {
    if (
      dragState.status !== 'dragging' ||
      !dragState.drop ||
      dragState.drop.status !== 'valid'
    )
      return null
    return computeInsertionPreview(dragState.drop, geometryRef.current, dragState.nodeId)
  })()

  const autoPanRef = useRef<number | null>(null)
  const settleTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return dragRef.current!.subscribe(() => {
      setDragState(dragRef.current!.getState())
    })
  }, [])

  const pointerSession = useRef<ReturnType<typeof createPointerSession> | null>(null)
  if (pointerSession.current === null) {
    pointerSession.current = createPointerSession({
      onCancel: () => {
        optionsRef.current.viewportController.endPan()
        stopAutoPan()
        dragRef.current!.cancel()
        setHover(null)
        setSettle(null)
      },
      onCaptureLost: () => {
        optionsRef.current.viewportController.endPan()
        stopAutoPan()
        dragRef.current!.cancel()
        setHover(null)
        setSettle(null)
      },
    })
  }

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
    const handleBlur = () => pointerSession.current?.cancel()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pointerSession.current?.cancel()
      }
    }
    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const pointerInViewport = (event: {
    clientX: number
    clientY: number
  }): Point => {
    const rect = viewportRef.current?.getBoundingClientRect()
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    }
  }

  const buildGeometry = () => {
    const options = optionsRef.current
    return buildWorldSnapshot(
      options.snapshot.document,
      frameRectsRef.current,
      viewportRef2.current,
    )
  }

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
        const pan = { x: (dx / len) * AUTO_PAN_SPEED, y: (dy / len) * AUTO_PAN_SPEED }
        const next = panBy(viewportRef2.current, -pan.x, -pan.y)
        viewportRef2.current = next
        optionsRef.current.viewportController.setViewport(next)
        const world = screenToWorld(next, {
          x: pointer.x - vpRect.left,
          y: pointer.y - vpRect.top,
        })
        dragRef.current!.move(pointer, () =>
          computeDropTarget(world, drag.nodeId!, geometryRef.current, optionsRef.current.snapshot.document.root.id),
        )
      }
      autoPanRef.current = requestAnimationFrame(tick)
    }
    autoPanRef.current = requestAnimationFrame(tick)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (editingRef.current !== null) return
    viewportRef.current?.focus()
    if (event.button === 1 || (event.button === 0 && optionsRef.current.viewportController.spaceHeld)) {
      optionsRef.current.viewportController.startPan({
        x: event.clientX,
        y: event.clientY,
      })
      event.preventDefault()
      pointerSession.current!.capture(event.currentTarget, event.pointerId)
      return
    }
    if (event.button !== 0) return
    const nodeId = hitTestNode(
      optionsRef.current.snapshot.document,
      frameRectsRef.current,
      pointerInViewport(event),
    )
    optionsRef.current.controller.select(nodeId)
    if (nodeId === null || nodeId === optionsRef.current.snapshot.document.root.id) return
    pointerSession.current!.capture(event.currentTarget, event.pointerId)
    const geometryMap = buildGeometry()
    geometryRef.current = geometryMap
    setGeometry(geometryMap)
    dragRef.current!.start(nodeId, { x: event.clientX, y: event.clientY })
  }

  const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (editingRef.current !== null) return
    const nodeId = hitTestNode(
      optionsRef.current.snapshot.document,
      frameRectsRef.current,
      pointerInViewport(event),
    )
    if (!nodeId) return
    const node = getNode(optionsRef.current.snapshot.document, nodeId)
    if (!node || node.kind === 'container') return
    const initialValue = node.kind === 'text' ? node.text : node.label
    optionsRef.current.controller.select(nodeId)
    setEditing({ nodeId, initialValue })
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewportCtrl = optionsRef.current.viewportController
    if (viewportCtrl.isPanActive()) {
      viewportCtrl.updatePan({ x: event.clientX, y: event.clientY })
      return
    }
    const current = dragRef.current!.getState()
    if (current.status === 'idle') {
      if (editingRef.current !== null) return
      setHover(
        hitTestNode(
          optionsRef.current.snapshot.document,
          frameRectsRef.current,
          pointerInViewport(event),
        ),
      )
    }
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerSession.current!.isActive(event.pointerId)) return
    optionsRef.current.viewportController.endPan()
    stopAutoPan()
    const state = dragRef.current!.getState()
    if (state.status !== 'idle') {
      const lastDrop = state.drop
      const ghostX = state.ghostX
      const ghostY = state.ghostY
      dragRef.current!.drop()
      setHover(null)
      if (lastDrop?.status === 'valid' && !lastDrop.noop) {
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
    pointerSession.current!.release()
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerSession.current!.isActive(event.pointerId)) return
    optionsRef.current.viewportController.endPan()
    stopAutoPan()
    dragRef.current!.cancel()
    setHover(null)
    setSettle(null)
    pointerSession.current!.release()
  }

  const handlePointerLeave = () => {
    const viewportCtrl = optionsRef.current.viewportController
    if (!viewportCtrl.isPanActive() && dragRef.current!.getState().status === 'idle') {
      setHover(null)
    }
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editingRef.current !== null) return
    const options = optionsRef.current
    const modifier = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()
    if (modifier && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) {
        options.controller.redo()
      } else {
        options.controller.undo()
      }
      return
    }
    if (modifier && key === 'y') {
      event.preventDefault()
      options.controller.redo()
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (options.snapshot.selection !== null) {
        event.preventDefault()
        options.controller.execute({
          type: 'document.removeNode',
          nodeId: options.snapshot.selection,
        })
      }
      return
    }
    if (event.key === 'Escape') {
      if (dragRef.current!.getState().status !== 'idle') {
        dragRef.current!.cancel()
        stopAutoPan()
        setHover(null)
        setSettle(null)
      } else {
        options.controller.select(null)
      }
      return
    }
    if (event.key === 'ArrowUp' && options.snapshot.selection !== null) {
      const parent = getParent(options.snapshot.document, options.snapshot.selection)
      if (parent) {
        event.preventDefault()
        options.controller.select(parent.parent.id)
      }
    }
  }

  const onFrameMessage = (message: FrameToHostMessage, expectedVersion: ProjectionVersion | null) => {
    const options = optionsRef.current
    switch (message.type) {
      case 'ready':
        break
      case 'geometry': {
        if (
          expectedVersion !== null &&
          (message.version.frameSessionId !== expectedVersion.frameSessionId ||
            message.version.documentRevision !== expectedVersion.documentRevision)
        ) {
          return
        }
        frameRectsRef.current = message.rects
        options.onPageSize(message.pageSize)
        if (dragRef.current?.getState().status === 'dragging') {
          // Freeze world geometry while dragging: the iframe's insertion slot
          // intentionally mutates layout (renders the dragged node in place,
          // expands container, pushes successors). Using that mutated rect for
          // drop-target / overlay maths would double-shift and drift the
          // highlight. Keep the drag-start snapshot stable, but keep the live
          // measured slot so overlays track the real target size.
          setLivePreview(
            message.preview
              ? {
                  parentId: message.preview.parentId,
                  rect: rectToWorld(message.preview.rect, viewportRef2.current),
                  parentRect: message.preview.parentRect
                    ? rectToWorld(message.preview.parentRect, viewportRef2.current)
                    : null,
                  prevRect: computeLivePrevRect(
                    message.preview.parentId,
                    message.rects,
                    options.snapshot.document,
                    dragRef.current?.getState() ?? null,
                    geometryRef.current,
                    viewportRef2.current,
                  ),
                }
              : null,
          )
          break
        }
        setLivePreview(null)
        const world = buildWorldSnapshot(
          options.snapshot.document,
          message.rects,
          viewportRef2.current,
        )
        geometryRef.current = world
        setGeometry(world)
        if (!fittedRef.current) {
          fittedRef.current = true
          const element = viewportRef.current
          if (element) {
            options.viewportController.setViewport(
              fitViewport(
                message.pageSize,
                { width: element.clientWidth, height: element.clientHeight },
                FIT_PADDING,
              ),
            )
          }
        }
        break
      }
      case 'editCommit':
        if (editingRef.current?.nodeId === message.nodeId) {
          setEditing(null)
          options.controller.execute({
            type: 'document.setText',
            nodeId: message.nodeId,
            value: message.value,
          })
        }
        break
      case 'editCancel':
        if (editingRef.current?.nodeId === message.nodeId) {
          setEditing(null)
        }
        break
    }
  }

  return {
    hover,
    dragState,
    settle,
    editing,
    geometry,
    livePreview,
    displacedParentId,
    insertionPreview,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    handleDoubleClick,
    handleKeyDown,
    onFrameMessage,
  }
}

function computeDisplacedParentId(
  drop: Extract<import('../dnd/drop-target').DropTarget, { status: 'valid' }>,
  geometry: NodeGeometrySnapshot,
  dragNodeId: CanvasNodeId | null,
): CanvasNodeId | null {
  const insertion = buildInsertionPreviewInternal(drop, geometry, dragNodeId)
  if (!insertion) return null
  // Children following the live insertion slot are visibly shifted by the
  // frame's real layout, so mark their parent for the displacement fallback.
  return insertion.fromIndex < insertion.filteredLen ? drop.parentId : null
}

function computeInsertionPreview(
  drop: Extract<import('../dnd/drop-target').DropTarget, { status: 'valid' }>,
  geometry: NodeGeometrySnapshot,
  dragNodeId: CanvasNodeId | null,
): FrameInsertionPreview | null {
  const insertion = buildInsertionPreviewInternal(drop, geometry, dragNodeId)
  if (!insertion) return null
  const parent = geometry.get(drop.parentId)
  if (!parent) return null
  return {
    parentId: drop.parentId,
    fromIndex: insertion.fromIndex,
    horizontal: parent.layout === 'row',
    isEmpty: insertion.filteredLen === 0,
  }
}

function buildInsertionPreviewInternal(
  drop: Extract<import('../dnd/drop-target').DropTarget, { status: 'valid' }>,
  geometry: NodeGeometrySnapshot,
  dragNodeId: CanvasNodeId | null,
): { fromIndex: number; filteredLen: number } | null {
  const parent = geometry.get(drop.parentId)
  if (!parent) return null
  const allChildren = parent.childIds
    .map((id) => geometry.get(id))
    .filter((e): e is NonNullable<typeof e> => e !== undefined)
  const filtered = allChildren.filter((e) => e.id !== dragNodeId)
  const ownIndex = dragNodeId ? allChildren.findIndex((e) => e.id === dragNodeId) : -1
  const adjustedIndex = ownIndex !== -1 && drop.index > ownIndex ? drop.index - 1 : drop.index
  const filteredIndex = Math.max(0, Math.min(adjustedIndex, filtered.length))
  return { fromIndex: filteredIndex, filteredLen: filtered.length }
}

function computeLivePrevRect(
  parentId: CanvasNodeId,
  liveRects: Record<CanvasNodeId, Rect>,
  document: import('../core/canvas-node').CanvasDocument,
  state: DragState | null,
  geometry: NodeGeometrySnapshot,
  viewport: import('../viewport/viewport').ViewportTransform,
): Rect | null {
  if (!state || state.status !== 'dragging' || state.nodeId == null) return null
  if (!state.drop || state.drop.status !== 'valid' || state.drop.noop) return null
  const insertion = buildInsertionPreviewInternal(state.drop, geometry, state.nodeId)
  if (!insertion) return null
  const parent = getNode(document, parentId)
  if (!parent || !isLayoutNode(parent)) return null
  const filtered = parent.children.filter((child) => child.id !== state.nodeId)
  const prev = insertion.fromIndex > 0 ? filtered[insertion.fromIndex - 1] : undefined
  const rect = prev ? liveRects[prev.id] : undefined
  return rect ? rectToWorld(rect, viewport) : null
}
