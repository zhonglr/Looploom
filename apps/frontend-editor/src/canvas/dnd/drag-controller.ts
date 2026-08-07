import type { CanvasNodeId } from '../core/canvas-node'
import type { DropTarget } from './drop-target'
import type { Point } from '../viewport/viewport'

export const DRAG_THRESHOLD = 12
export const DRAG_MIN_TIME = 120

export interface DragState {
  status: 'idle' | 'pending' | 'dragging'
  nodeId: CanvasNodeId | null
  startScreen: Point | null
  startTime: number
  pointerScreen: Point
  imageX: number
  imageY: number
  drop: DropTarget | null
  originScreen: Point | null
}

export type SettleState =
  | {
      kind: 'placed'
      target: Extract<DropTarget, { status: 'valid' }>
      imageX: number
      imageY: number
    }
  | { kind: 'rejected'; message: string }
  | null

export const IDLE_DRAG_STATE: DragState = {
  status: 'idle',
  nodeId: null,
  startScreen: null,
  startTime: 0,
  pointerScreen: { x: 0, y: 0 },
  imageX: 0,
  imageY: 0,
  drop: null,
  originScreen: null,
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

  start(nodeId: CanvasNodeId, startScreen: Point, originScreen?: Point): void {
    if (this.state.status !== 'idle') return
    this.state = {
      status: 'pending',
      nodeId,
      startScreen,
      startTime: Date.now(),
      pointerScreen: startScreen,
      imageX: startScreen.x,
      imageY: startScreen.y,
      drop: null,
      originScreen: originScreen ?? startScreen,
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
      const distance = Math.hypot(dx, dy)
      const elapsed = Date.now() - this.state.startTime
      if (distance < DRAG_THRESHOLD || elapsed < DRAG_MIN_TIME) return false
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
      imageX: pointerScreen.x,
      imageY: pointerScreen.y,
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
