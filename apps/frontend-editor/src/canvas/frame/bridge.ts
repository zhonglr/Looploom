import type { CanvasDocument, CanvasNodeId } from '../core/canvas-node'
import type { Rect } from '../dnd/geometry'
import type { ViewportTransform } from '../viewport/viewport'

export interface FrameEditingState {
  nodeId: CanvasNodeId
  initialValue: string
}

export interface FramePageSize {
  width: number
  height: number
}

export interface FrameInsertionPreview {
  parentId: CanvasNodeId
  fromIndex: number
  horizontal: boolean
  isEmpty: boolean
}

/** Live measured insertion slot in world coordinates, reported by the frame. */
export interface FramePreviewSlot {
  parentId: CanvasNodeId
  rect: Rect
  /** Live rect of the parent container, after the slot expanded it. */
  parentRect: Rect | null
  /** Live rect of the element immediately before the slot; null for before-first / empty containers. */
  prevRect: Rect | null
}

// Host → iframe
export type HostToFrameMessage =
  | { type: 'document'; revision: number; document: CanvasDocument }
  | { type: 'viewport'; transform: ViewportTransform }
  | {
      type: 'interaction'
      draggingNodeId: CanvasNodeId | null
      displacedParentId: CanvasNodeId | null
      insertionPreview: FrameInsertionPreview | null
      editing: FrameEditingState | null
    }

// iframe → Host
export type FrameToHostMessage =
  | { type: 'ready' }
  | {
      type: 'geometry'
      revision: number
      rects: Record<CanvasNodeId, Rect>
      pageSize: FramePageSize
      preview: FramePreviewSlot | null
    }
  | { type: 'editCommit'; nodeId: CanvasNodeId; value: string }
  | { type: 'editCancel'; nodeId: CanvasNodeId }

const hostOrigin = window.location.origin

export function postToFrame(
  iframe: HTMLIFrameElement | null,
  message: HostToFrameMessage,
): void {
  if (!iframe?.contentWindow) return
  iframe.contentWindow.postMessage(message, hostOrigin)
}

export function postToHost(message: FrameToHostMessage): void {
  window.parent.postMessage(message, hostOrigin)
}