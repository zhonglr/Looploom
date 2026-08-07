import type { CanvasNodeId } from '../core/canvas-node'
import type { DropTarget } from '../dnd/drop-target'
import type { Point } from '../viewport/viewport'

export type PanActivation = 'middle-button' | 'space-primary'

export type CanvasInteractionState =
  | { status: 'idle'; hoverNodeId: CanvasNodeId | null }
  | {
      status: 'pressing'
      pointerId: number
      nodeId: CanvasNodeId
      origin: Point
      current: Point
      startedAt: number
    }
  | {
      status: 'dragging'
      pointerId: number
      nodeId: CanvasNodeId
      pointer: Point
      target: DropTarget
    }
  | {
      status: 'panning'
      pointerId: number
      activation: PanActivation
      lastPoint: Point
    }
  | {
      status: 'editing'
      sessionId: string
      nodeId: CanvasNodeId
      initialValue: string
      draft: string
    }
  | {
      status: 'settling'
      nodeId: CanvasNodeId
      outcome: 'committed' | 'rejected'
      target: DropTarget | null
      pointer: Point
      expiresAt: number
    }

export type CanvasInteractionEvent =
  | { type: 'pointerDown'; pointerId: number; nodeId: CanvasNodeId; point: Point; time: number }
  | { type: 'pointerMove'; pointerId: number; point: Point }
  | { type: 'pointerUp'; pointerId: number }
  | { type: 'panStart'; pointerId: number; activation: PanActivation; point: Point }
  | { type: 'editStart'; sessionId: string; nodeId: CanvasNodeId; initialValue: string }
  | { type: 'editDraft'; sessionId: string; draft: string }
  | { type: 'editCommit'; sessionId: string }
  | { type: 'editCancel'; sessionId: string }
  | { type: 'commandCommitted'; nodeId: CanvasNodeId; target: DropTarget; pointer: Point; time: number }
  | { type: 'commandRejected'; nodeId: CanvasNodeId; target: DropTarget | null; pointer: Point; time: number }
  | { type: 'commandNoOp' }
  | { type: 'commandCancelled' }
  | { type: 'globalCancel' }
  | { type: 'hoverChange'; nodeId: CanvasNodeId | null }

export interface InteractionReducerContext {
  dragActivationDistance: number
  dragActivationDelay: number
  settleDuration: number
}

export const DEFAULT_INTERACTION_CONTEXT: InteractionReducerContext = {
  dragActivationDistance: 4,
  dragActivationDelay: 200,
  settleDuration: 600,
}
