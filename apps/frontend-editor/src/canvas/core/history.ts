import type { CanvasCommand } from './commands'

export interface HistoryEntry {
  forward: CanvasCommand
  inverse: CanvasCommand
}

export interface CanvasHistory {
  past: HistoryEntry[]
  future: HistoryEntry[]
}

export function createHistory(): CanvasHistory {
  return { past: [], future: [] }
}

export function pushHistory(
  history: CanvasHistory,
  entry: HistoryEntry,
): CanvasHistory {
  return { past: [...history.past, entry], future: [] }
}

export function peekUndo(history: CanvasHistory): HistoryEntry | undefined {
  return history.past[history.past.length - 1]
}

export function peekRedo(history: CanvasHistory): HistoryEntry | undefined {
  return history.future[history.future.length - 1]
}

export function popUndo(history: CanvasHistory): {
  history: CanvasHistory
  entry: HistoryEntry | undefined
} {
  const entry = peekUndo(history)
  if (!entry) return { history, entry: undefined }
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, entry],
    },
    entry,
  }
}

export function popRedo(history: CanvasHistory): {
  history: CanvasHistory
  entry: HistoryEntry | undefined
} {
  const entry = peekRedo(history)
  if (!entry) return { history, entry: undefined }
  return {
    history: {
      past: [...history.past, entry],
      future: history.future.slice(0, -1),
    },
    entry,
  }
}
