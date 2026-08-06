import type { CanvasNodeId } from '../core/canvas-node'
import type { DropTarget } from './drop-target'
import type { Point } from '../viewport/viewport'

export const DRAG_THRESHOLD = 8

export interface DragState {
  status: 'idle' | 'pending' | 'dragging'
  nodeId: CanvasNodeId | null
  startScreen: Point | null
  pointerScreen: Point
  ghostX: number
  ghostY: number
  drop: DropTarget | null
}

export const IDLE_DRAG_STATE: DragState = {
  status: 'idle',
  nodeId: null,
  startScreen: null,
  pointerScreen: { x: 0, y: 0 },
  ghostX: 0,
  ghostY: 0,
  drop: null,
}

export interface DragControllerOptions {
  onDrop: (target: Extract<DropTarget, { status: 'valid' }>) => void
}

export class DragController {
  private state: DragState = IDLE_DRAG_STATE
  private readonly onDrop: DragControllerOptions['onDrop']
  private readonly listeners = new Set<() => void>()

  constructor(options: DragControllerOptions) {
    this.onDrop = options.onDrop
  }

  getState(): DragState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  start(nodeId: CanvasNodeId, startScreen: Point): void {
    if (this.state.status !== 'idle') return
    this.state = {
      status: 'pending',
      nodeId,
      startScreen,
      pointerScreen: startScreen,
      ghostX: startScreen.x,
      ghostY: startScreen.y,
      drop: null,
    }
    this.emit()
  }

  move(
    pointerScreen: Point,
    computeDrop: (pointerScreen: Point) => DropTarget,
  ): boolean {
    if (this.state.status === 'idle') return false

    if (this.state.status === 'pending') {
      const start = this.state.startScreen
      if (!start) return false
      const dx = pointerScreen.x - start.x
      const dy = pointerScreen.y - start.y
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return false
      this.state = {
        ...this.state,
        status: 'dragging',
        pointerScreen,
      }
    } else {
      this.state = {
        ...this.state,
        pointerScreen,
      }
    }

    this.state = {
      ...this.state,
      drop: computeDrop(pointerScreen),
      ghostX: pointerScreen.x,
      ghostY: pointerScreen.y,
    }
    this.emit()
    return true
  }

  drop(): void {
    if (this.state.status === 'idle') return
    if (this.state.status === 'dragging') {
      const target = this.state.drop
      if (target && target.status === 'valid') {
        this.onDrop(target)
      }
    }
    this.reset()
  }

  cancel(): void {
    this.reset()
  }

  isDragging(nodeId: CanvasNodeId): boolean {
    return this.state.status === 'dragging' && this.state.nodeId === nodeId
  }

  private reset(): void {
    if (this.state.status === 'idle') return
    this.state = IDLE_DRAG_STATE
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}
