import type {
  CanvasDocument,
  CanvasNode,
  CanvasNodeId,
} from './canvas-node'
import { isLayoutNode } from './canvas-node'
import {
  collectNodeIds,
  findDuplicateIds,
  getNode,
  getParent,
  insertNodeAt,
  isDescendantOf,
  moveNodeIn,
  removeNodeAt,
  setNodeText,
} from './document'

export type CanvasCommandId = string

export interface AddNodeCommand {
  type: 'document.addNode'
  node: CanvasNode
  parentId: CanvasNodeId
  index?: number
}

export interface RemoveNodeCommand {
  type: 'document.removeNode'
  nodeId: CanvasNodeId
}

export interface MoveNodeCommand {
  type: 'document.moveNode'
  nodeId: CanvasNodeId
  targetParentId: CanvasNodeId
  targetIndex: number
}

export interface SetTextCommand {
  type: 'document.setText'
  nodeId: CanvasNodeId
  value: string
}

export type CanvasCommand = AddNodeCommand | RemoveNodeCommand | MoveNodeCommand | SetTextCommand

export type CanvasRejectCode =
  | 'duplicate-node-id'
  | 'parent-not-found'
  | 'parent-not-container'
  | 'cannot-remove-root'
  | 'node-not-found'
  | 'cannot-move-root'
  | 'target-not-found'
  | 'target-not-container'
  | 'cycle'
  | 'node-not-editable'

export interface CommittedResult {
  status: 'committed'
  commandId: CanvasCommandId
  revision: number
  canUndo: boolean
  canRedo: boolean
  affectedNodeId: CanvasNodeId
}

export interface RejectedResult {
  status: 'rejected'
  code: CanvasRejectCode
  message: string
}

export interface NoOpResult {
  status: 'no-op'
  code: 'no-op'
  message: string
}

export type CanvasCommandResult = CommittedResult | RejectedResult | NoOpResult

export interface ApplyCommandResult {
  document: CanvasDocument
  result: CanvasCommandResult
  inverse?: CanvasCommand
}

const rejectMessages: Record<CanvasRejectCode, string> = {
  'duplicate-node-id': 'A node with this id already exists in the document',
  'parent-not-found': 'The target parent node does not exist',
  'parent-not-container': 'The target node cannot contain children',
  'cannot-remove-root': 'The document root cannot be removed',
  'node-not-found': 'The node does not exist in the document',
  'cannot-move-root': 'The document root cannot be moved',
  'target-not-found': 'The target container does not exist',
  'target-not-container': 'The target node cannot contain children',
  cycle: 'A node cannot be moved into itself or one of its children',
  'node-not-editable': 'This node type does not support text editing',
}

export function applyCanvasCommand(
  document: CanvasDocument,
  command: CanvasCommand,
  revision: number,
  canUndo: boolean,
  canRedo: boolean,
): ApplyCommandResult {
  switch (command.type) {
    case 'document.addNode':
      return applyAddNode(document, command, revision, canUndo, canRedo)
    case 'document.removeNode':
      return applyRemoveNode(document, command, revision, canUndo, canRedo)
    case 'document.moveNode':
      return applyMoveNode(document, command, revision, canUndo, canRedo)
    case 'document.setText':
      return applySetText(document, command, revision, canUndo, canRedo)
  }
}

function applyAddNode(
  document: CanvasDocument,
  command: AddNodeCommand,
  revision: number,
  canUndo: boolean,
  canRedo: boolean,
): ApplyCommandResult {
  const internalDuplicate = findDuplicateIds(command.node)
  if (internalDuplicate.length > 0) {
    return {
      document,
      result: {
        status: 'rejected',
        code: 'duplicate-node-id',
        message: `Incoming subtree contains duplicate node id: ${internalDuplicate[0]}`,
      },
    }
  }
  const incomingIds = collectNodeIds(command.node)
  for (const existingId of incomingIds) {
    if (getNode(document, existingId) !== undefined) {
      return {
        document,
        result: {
          status: 'rejected',
          code: 'duplicate-node-id',
          message: `A node with id "${existingId}" already exists in the document`,
        },
      }
    }
  }
  const parent = getNode(document, command.parentId)
  if (parent === undefined) {
    return rejected(document, 'parent-not-found')
  }
  if (!isLayoutNode(parent)) {
    return rejected(document, 'parent-not-container')
  }
  const inserted = insertNodeAt(
    document,
    command.parentId,
    command.index ?? parent.children.length,
    command.node,
  )
  if (!inserted) {
    return rejected(document, 'parent-not-found')
  }
  return {
    document: inserted.document,
    result: committed(command, revision, canUndo, canRedo, command.node.id),
    inverse: { type: 'document.removeNode', nodeId: command.node.id },
  }
}

function applyRemoveNode(
  document: CanvasDocument,
  command: RemoveNodeCommand,
  revision: number,
  canUndo: boolean,
  canRedo: boolean,
): ApplyCommandResult {
  if (command.nodeId === document.root.id) {
    return rejected(document, 'cannot-remove-root')
  }
  if (getNode(document, command.nodeId) === undefined) {
    return rejected(document, 'node-not-found')
  }
  const removed = removeNodeAt(document, command.nodeId)
  if (!removed) {
    return rejected(document, 'node-not-found')
  }
  return {
    document: removed.document,
    result: committed(command, revision, canUndo, canRedo, removed.parentId),
    inverse: {
      type: 'document.addNode',
      node: removed.node,
      parentId: removed.parentId,
      index: removed.index,
    },
  }
}

function applyMoveNode(
  document: CanvasDocument,
  command: MoveNodeCommand,
  revision: number,
  canUndo: boolean,
  canRedo: boolean,
): ApplyCommandResult {
  const node = getNode(document, command.nodeId)
  if (node === undefined) {
    return rejected(document, 'node-not-found')
  }
  if (command.nodeId === document.root.id) {
    return rejected(document, 'cannot-move-root')
  }
  const targetParent = getNode(document, command.targetParentId)
  if (targetParent === undefined) {
    return rejected(document, 'target-not-found')
  }
  if (!isLayoutNode(targetParent)) {
    return rejected(document, 'target-not-container')
  }
  if (isDescendantOf(document, command.nodeId, command.targetParentId)) {
    return rejected(document, 'cycle')
  }
  const source = getParent(document, command.nodeId)
  if (!source) {
    return rejected(document, 'node-not-found')
  }
  const moved = moveNodeIn(
    document,
    command.nodeId,
    command.targetParentId,
    command.targetIndex,
  )
  if (!moved) {
    return rejected(document, 'target-not-found')
  }
  if (!moved.moved) {
    return {
      document,
      result: {
        status: 'no-op',
        code: 'no-op',
        message: 'The node is already at that position',
      },
    }
  }
  return {
    document: moved.document,
    result: committed(command, revision, canUndo, canRedo, command.nodeId),
    inverse: {
      type: 'document.moveNode',
      nodeId: command.nodeId,
      targetParentId: moved.fromParentId,
      targetIndex: moved.fromIndex,
    },
  }
}

function applySetText(
  document: CanvasDocument,
  command: SetTextCommand,
  revision: number,
  canUndo: boolean,
  canRedo: boolean,
): ApplyCommandResult {
  const node = getNode(document, command.nodeId)
  if (node === undefined) {
    return rejected(document, 'node-not-found')
  }
  if (node.kind !== 'text' && node.kind !== 'button') {
    return rejected(document, 'node-not-editable')
  }
  const previousValue = node.kind === 'text' ? node.text : node.label
  const updated = setNodeText(document, command.nodeId, command.value)
  if (!updated) {
    return rejected(document, 'node-not-found')
  }
  if (!updated.changed) {
    return {
      document,
      result: {
        status: 'no-op',
        code: 'no-op',
        message: 'The node text is already set to that value',
      },
    }
  }
  return {
    document: updated.document,
    result: committed(command, revision, canUndo, canRedo, command.nodeId),
    inverse: {
      type: 'document.setText',
      nodeId: command.nodeId,
      value: previousValue,
    },
  }
}

function committed(
  command: CanvasCommand,
  revision: number,
  canUndo: boolean,
  canRedo: boolean,
  affectedNodeId: CanvasNodeId,
): CommittedResult {
  return {
    status: 'committed',
    commandId: `${command.type}:${revision}`,
    revision,
    canUndo,
    canRedo,
    affectedNodeId,
  }
}

function rejected(
  document: CanvasDocument,
  code: CanvasRejectCode,
): ApplyCommandResult {
  return {
    document,
    result: {
      status: 'rejected',
      code,
      message: rejectMessages[code],
    },
  }
}
