import { describe, expect, it } from 'vitest'
import { createSampleDocument } from '../core/sample-document'
import { validateHostToFrameMessage } from './protocol'

describe('validateHostToFrameMessage', () => {
  it('accepts a document with a page root', () => {
    const document = createSampleDocument()

    expect(validateHostToFrameMessage({
      type: 'document',
      revision: 0,
      document,
    })).toEqual({
      ok: true,
      value: {
        type: 'document',
        revision: 0,
        document,
      },
    })
  })
})
