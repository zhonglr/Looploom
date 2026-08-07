import type {
  CanvasInteractionEvent,
  CanvasInteractionState,
  InteractionReducerContext,
} from './interaction-state'
import { DEFAULT_INTERACTION_CONTEXT } from './interaction-state'
import type { DropTarget } from '../dnd/drop-target'
import type { CanvasNodeId } from '../core/canvas-node'

export function createIdleState(hoverNodeId: CanvasNodeId | null = null): CanvasInteractionState {
  return { status: 'idle', hoverNodeId }
}

export function interactionReducer(
  state: CanvasInteractionState,
  event: CanvasInteractionEvent,
  ctx: InteractionReducerContext = DEFAULT_INTERACTION_CONTEXT,
  now: number = Date.now(),
): CanvasInteractionState {
  switch (state.status) {
    case 'idle':
      return reduceIdle(state, event)
    case 'pressing':
      return reducePressing(state, event, ctx, now)
    case 'dragging':
      return reduceDragging(state, event)
    case 'panning':
      return reducePanning(state, event)
    case 'editing':
      return reduceEditing(state, event)
    case 'settling':
      return reduceSettling(state, event)
    default:
      return state
  }
}

function reduceIdle(
  state: Extract<CanvasInteractionState, { status: 'idle' }>,
  event: CanvasInteractionEvent,
): CanvasInteractionState {
  switch (event.type) {
    case 'pointerDown':
      return {
        status: 'pressing',
        pointerId: event.pointerId,
        nodeId: event.nodeId,
        origin: event.point,
        current: event.point,
        startedAt: event.time,
      }
    case 'panStart':
      return {
        status: 'panning',
        pointerId: event.pointerId,
        activation: event.activation,
        lastPoint: event.point,
      }
    case 'editStart':
      return {
        status: 'editing',
        sessionId: event.sessionId,
        nodeId: event.nodeId,
        initialValue: event.initialValue,
        draft: event.initialValue,
      }
    case 'hoverChange':
      return { status: 'idle', hoverNodeId: event.nodeId }
    case 'globalCancel':
      return { status: 'idle', hoverNodeId: state.hoverNodeId }
    default:
      return state
  }
}

function reducePressing(
  state: Extract<CanvasInteractionState, { status: 'pressing' }>,
  event: CanvasInteractionEvent,
  ctx: InteractionReducerContext,
  now: number,
): CanvasInteractionState {
  switch (event.type) {
    case 'pointerMove': {
      if (event.pointerId !== state.pointerId) return state
      const dx = event.point.x - state.origin.x
      const dy = event.point.y - state.origin.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const elapsed = now - state.startedAt
      if (distance >= ctx.dragActivationDistance || elapsed >= ctx.dragActivationDelay) {
        return {
          status: 'dragging',
          pointerId: state.pointerId,
          nodeId: state.nodeId,
          pointer: event.point,
          target: { status: 'rejected', reason: 'invalid' },
        }
      }
      return { ...state, current: event.point }
    }
    case 'pointerUp':
      if (event.pointerId !== state.pointerId) return state
      return { status: 'idle', hoverNodeId: state.nodeId }
    case 'globalCancel':
      return createIdleState(state.nodeId)
    default:
      return state
  }
}

function reduceDragging(
  state: Extract<CanvasInteractionState, { status: 'dragging' }>,
  event: CanvasInteractionEvent,
): CanvasInteractionState {
  switch (event.type) {
    case 'pointerMove':
      if (event.pointerId !== state.pointerId) return state
      return { ...state, pointer: event.point }
    case 'commandCommitted':
      return {
        status: 'settling',
        nodeId: event.nodeId,
        outcome: 'committed',
        target: event.target as DropTarget,
        pointer: event.pointer,
        expiresAt: event.time + 600,
      }
    case 'commandRejected':
      return {
        status: 'settling',
        nodeId: event.nodeId,
        outcome: 'rejected',
        target: event.target as DropTarget | null,
        pointer: event.pointer,
        expiresAt: event.time + 600,
      }
    case 'commandNoOp':
    case 'commandCancelled':
      return createIdleState(state.nodeId)
    case 'pointerUp':
      if (event.pointerId !== state.pointerId) return state
      return createIdleState(state.nodeId)
    case 'globalCancel':
      return createIdleState()
    default:
      return state
  }
}

function reducePanning(
  state: Extract<CanvasInteractionState, { status: 'panning' }>,
  event: CanvasInteractionEvent,
): CanvasInteractionState {
  switch (event.type) {
    case 'pointerMove':
      if (event.pointerId !== state.pointerId) return state
      return { ...state, lastPoint: event.point }
    case 'pointerUp':
      if (event.pointerId !== state.pointerId) return state
      return createIdleState()
    case 'globalCancel':
      return createIdleState()
    default:
      return state
  }
}

function reduceEditing(
  state: Extract<CanvasInteractionState, { status: 'editing' }>,
  event: CanvasInteractionEvent,
): CanvasInteractionState {
  switch (event.type) {
    case 'editDraft':
      if (event.sessionId !== state.sessionId) return state
      return { ...state, draft: event.draft }
    case 'editCommit':
    case 'editCancel':
      if (event.sessionId !== state.sessionId) return state
      return createIdleState(state.nodeId)
    case 'globalCancel':
      return createIdleState(state.nodeId)
    default:
      return state
  }
}

function reduceSettling(
  state: Extract<CanvasInteractionState, { status: 'settling' }>,
  event: CanvasInteractionEvent,
): CanvasInteractionState {
  switch (event.type) {
    case 'pointerDown':
    case 'panStart':
      return createIdleState()
    case 'globalCancel':
      return createIdleState()
    default:
      return state
  }
}
