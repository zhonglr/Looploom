import type { EditorLayoutName } from './types'

export type EditorLayoutErrorCode =
  | 'layout.not-found'
  | 'layout.storage-load-failed'
  | 'layout.storage-save-failed'

export type EditorLayoutOperation = 'layout.load' | 'layout.save'

export interface EditorLayoutErrorOptions {
  code: EditorLayoutErrorCode
  layoutName: EditorLayoutName
  cause?: unknown
}

export class EditorLayoutError extends Error {
  readonly code: EditorLayoutErrorCode
  readonly operation: EditorLayoutOperation
  readonly layoutName: EditorLayoutName
  readonly recoverable = true

  constructor(options: EditorLayoutErrorOptions) {
    super(options.code, { cause: options.cause })
    this.name = 'EditorLayoutError'
    this.code = options.code
    this.operation =
      options.code === 'layout.storage-save-failed' ? 'layout.save' : 'layout.load'
    this.layoutName = options.layoutName
  }
}
