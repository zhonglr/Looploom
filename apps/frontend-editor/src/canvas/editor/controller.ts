import type {
  CanvasCommand,
  CanvasCommandResult,
} from '../core/commands'
import { applyCanvasCommand } from '../core/commands'
import type { CanvasDocument, CanvasNodeId } from '../core/canvas-node'
import { getNode } from '../core/document'
import {
  createHistory,
  peekRedo,
  peekUndo,
  popRedo,
  popUndo,
  pushHistory,
  type CanvasHistory,
} from '../core/history'

export interface CanvasEditorSnapshot {
  document: CanvasDocument
  selection: CanvasNodeId | null
  canUndo: boolean
  canRedo: boolean
  revision: number
}

export class CanvasEditorController {
  private document: CanvasDocument
  private history: CanvasHistory = createHistory()
  private selection: CanvasNodeId | null = null
  private revision = 0
  private snapshot: CanvasEditorSnapshot
  private readonly listeners = new Set<() => void>()

  constructor(initialDocument: CanvasDocument) {
    this.document = initialDocument
    this.snapshot = this.buildSnapshot()
  }

  getSnapshot(): CanvasEditorSnapshot {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  execute(command: CanvasCommand): CanvasCommandResult {
    const applied = this.apply(command)
    if (applied.result.status === 'committed' && applied.inverse !== undefined) {
      this.history = pushHistory(this.history, {
        forward: command,
        inverse: applied.inverse,
      })
    }
    this.emit()
    return this.withFreshHistoryFlags(applied.result)
  }

  undo(): CanvasCommandResult | null {
    const entry = peekUndo(this.history)
    if (!entry) return null
    const applied = this.apply(entry.inverse)
    if (applied.result.status !== 'committed') {
      this.emit()
      return this.withFreshHistoryFlags(applied.result)
    }
    const { history } = popUndo(this.history)
    this.history = history
    this.emit()
    return this.withFreshHistoryFlags(applied.result)
  }

  redo(): CanvasCommandResult | null {
    const entry = peekRedo(this.history)
    if (!entry) return null
    const applied = this.apply(entry.forward)
    if (applied.result.status !== 'committed') {
      this.emit()
      return this.withFreshHistoryFlags(applied.result)
    }
    const { history } = popRedo(this.history)
    this.history = history
    this.emit()
    return this.withFreshHistoryFlags(applied.result)
  }

  select(nodeId: CanvasNodeId | null): void {
    const exists = nodeId === null || getNode(this.document, nodeId) !== undefined
    this.selection = exists ? nodeId : null
    this.emit()
  }

  private apply(command: CanvasCommand): {
    result: CanvasCommandResult
    inverse?: CanvasCommand
  } {
    const applied = applyCanvasCommand(
      this.document,
      command,
      this.revision + 1,
      this.history.past.length > 0,
      this.history.future.length > 0,
    )
    if (applied.result.status === 'committed') {
      this.document = applied.document
      this.revision += 1
      this.selection = applied.result.affectedNodeId
    }
    return applied
  }

  private withFreshHistoryFlags(
    result: CanvasCommandResult,
  ): CanvasCommandResult {
    if (result.status !== 'committed') return result
    return {
      ...result,
      canUndo: this.history.past.length > 0,
      canRedo: this.history.future.length > 0,
    }
  }

  private buildSnapshot(): CanvasEditorSnapshot {
    return {
      document: this.document,
      selection: this.selection,
      canUndo: this.history.past.length > 0,
      canRedo: this.history.future.length > 0,
      revision: this.revision,
    }
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot()
    for (const listener of this.listeners) {
      listener()
    }
  }
}
