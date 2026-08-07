import type { FrameToHostMessage, HostToFrameMessage, ProjectionVersion } from './bridge'
import type { Rect } from '../dnd/geometry'
import type { CanvasDocument, CanvasNodeId } from '../core/canvas-node'
import type { ViewportTransform } from '../viewport/viewport'

export type ProtocolValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function validateNodeId(value: unknown): value is CanvasNodeId {
  return isString(value) && value.length > 0
}

function validateRect(value: unknown): value is Rect {
  return (
    isObject(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height)
  )
}

function validateRects(value: unknown): value is Record<string, Rect> {
  if (!isObject(value)) return false
  for (const [key, rect] of Object.entries(value)) {
    if (!validateNodeId(key)) return false
    if (!validateRect(rect)) return false
  }
  return true
}

function validateViewportTransform(value: unknown): value is ViewportTransform {
  return (
    isObject(value) &&
    isFiniteNumber(value.scale) &&
    isFiniteNumber(value.panX) &&
    isFiniteNumber(value.panY)
  )
}

function validateProjectionVersion(value: unknown): value is ProjectionVersion {
  return (
    isObject(value) &&
    isString(value.frameSessionId) &&
    isNonNegativeInteger(value.documentRevision) &&
    isNonNegativeInteger(value.viewportRevision) &&
    isNonNegativeInteger(value.interactionRevision)
  )
}

function validateDocument(value: unknown): value is CanvasDocument {
  if (!isObject(value)) return false
  if (!validateNodeId(value.id)) return false
  if (!isString(value.name)) return false
  if (!isObject(value.root)) return false
  if (value.root.kind !== 'page') return false
  return true
}

export function validateHostToFrameMessage(
  value: unknown,
): ProtocolValidationResult<HostToFrameMessage> {
  if (!isObject(value)) return { ok: false, reason: 'message is not an object' }
  if (!isString(value.type)) return { ok: false, reason: 'message.type is not a string' }

  switch (value.type) {
    case 'document':
      if (!isNonNegativeInteger(value.revision)) return { ok: false, reason: 'document.revision must be a non-negative integer' }
      if (!validateDocument(value.document)) return { ok: false, reason: 'document is invalid' }
      return { ok: true, value: { type: 'document', revision: value.revision, document: value.document } }

    case 'viewport':
      if (!validateViewportTransform(value.transform)) return { ok: false, reason: 'viewport.transform is invalid' }
      return { ok: true, value: { type: 'viewport', transform: value.transform } }

    case 'interaction': {
      if (value.draggingNodeId !== null && !validateNodeId(value.draggingNodeId)) {
        return { ok: false, reason: 'interaction.draggingNodeId must be null or a valid node id' }
      }
      if (value.displacedParentId !== null && !validateNodeId(value.displacedParentId)) {
        return { ok: false, reason: 'interaction.displacedParentId must be null or a valid node id' }
      }
      if (value.insertionPreview !== null) {
        if (!isObject(value.insertionPreview)) return { ok: false, reason: 'interaction.insertionPreview must be null or an object' }
        if (!validateNodeId(value.insertionPreview.parentId)) return { ok: false, reason: 'insertionPreview.parentId is invalid' }
        if (!isNonNegativeInteger(value.insertionPreview.fromIndex)) return { ok: false, reason: 'insertionPreview.fromIndex must be a non-negative integer' }
        if (typeof value.insertionPreview.horizontal !== 'boolean') return { ok: false, reason: 'insertionPreview.horizontal must be boolean' }
        if (typeof value.insertionPreview.isEmpty !== 'boolean') return { ok: false, reason: 'insertionPreview.isEmpty must be boolean' }
      }
      if (value.editing !== null) {
        if (!isObject(value.editing)) return { ok: false, reason: 'interaction.editing must be null or an object' }
        if (!validateNodeId(value.editing.nodeId)) return { ok: false, reason: 'editing.nodeId is invalid' }
        if (!isString(value.editing.draft)) return { ok: false, reason: 'editing.draft must be a string' }
        if (!isNonNegativeInteger(value.editing.selectionRevision)) return { ok: false, reason: 'editing.selectionRevision must be a non-negative integer' }
      }
      return {
        ok: true,
        value: value as HostToFrameMessage,
      }
    }

    default:
      return { ok: false, reason: `unknown message type: ${value.type}` }
  }
}

export function validateFrameToHostMessage(
  value: unknown,
): ProtocolValidationResult<FrameToHostMessage> {
  if (!isObject(value)) return { ok: false, reason: 'message is not an object' }
  if (!isString(value.type)) return { ok: false, reason: 'message.type is not a string' }

  switch (value.type) {
    case 'ready':
      if (!isString(value.frameSessionId)) return { ok: false, reason: 'ready.frameSessionId must be a string' }
      return { ok: true, value: { type: 'ready', frameSessionId: value.frameSessionId } }

    case 'geometry': {
      if (!validateProjectionVersion(value.version)) return { ok: false, reason: 'geometry.version is invalid' }
      if (!validateRects(value.rects)) return { ok: false, reason: 'geometry.rects is invalid' }
      if (!isObject(value.pageSize)) return { ok: false, reason: 'geometry.pageSize must be an object' }
      if (!isFiniteNumber(value.pageSize.width)) return { ok: false, reason: 'geometry.pageSize.width must be finite' }
      if (!isFiniteNumber(value.pageSize.height)) return { ok: false, reason: 'geometry.pageSize.height must be finite' }
      if (value.preview !== null) {
        if (!isObject(value.preview)) return { ok: false, reason: 'geometry.preview must be null or an object' }
        if (!validateNodeId(value.preview.parentId)) return { ok: false, reason: 'preview.parentId is invalid' }
        if (!validateRect(value.preview.rect)) return { ok: false, reason: 'preview.rect is invalid' }
        if (value.preview.parentRect !== null && !validateRect(value.preview.parentRect)) {
          return { ok: false, reason: 'preview.parentRect must be null or a valid rect' }
        }
        if (value.preview.prevRect !== null && !validateRect(value.preview.prevRect)) {
          return { ok: false, reason: 'preview.prevRect must be null or a valid rect' }
        }
      }
      return {
        ok: true,
        value: value as FrameToHostMessage,
      }
    }

    case 'editChange':
      if (!validateNodeId(value.nodeId)) return { ok: false, reason: 'editChange.nodeId is invalid' }
      if (!isString(value.value)) return { ok: false, reason: 'editChange.value must be a string' }
      return { ok: true, value: { type: 'editChange', nodeId: value.nodeId, value: value.value } }

    case 'editCommit':
      if (!validateNodeId(value.nodeId)) return { ok: false, reason: 'editCommit.nodeId is invalid' }
      if (!isString(value.value)) return { ok: false, reason: 'editCommit.value must be a string' }
      if (!isNonNegativeInteger(value.selectionRevision)) return { ok: false, reason: 'editCommit.selectionRevision must be a non-negative integer' }
      return { ok: true, value: { type: 'editCommit', nodeId: value.nodeId, value: value.value, selectionRevision: value.selectionRevision } }

    case 'editCancel':
      if (!validateNodeId(value.nodeId)) return { ok: false, reason: 'editCancel.nodeId is invalid' }
      return { ok: true, value: { type: 'editCancel', nodeId: value.nodeId } }

    default:
      return { ok: false, reason: `unknown message type: ${value.type}` }
  }
}
