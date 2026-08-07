import { describe, expect, it } from 'vitest'
import type { NodeGeometrySnapshot } from './geometry'
import { computeDropTarget } from './drop-target'

const geometry: NodeGeometrySnapshot = new Map([
  [
    'page',
    {
      id: 'page',
      parentId: null,
      depth: 0,
      isContainer: true,
      layout: 'column',
      rect: { x: 0, y: 0, width: 300, height: 400 },
      childIds: ['header', 'body'],
    },
  ],
  [
    'header',
    {
      id: 'header',
      parentId: 'page',
      depth: 1,
      isContainer: true,
      layout: 'row',
      rect: { x: 0, y: 0, width: 300, height: 80 },
      childIds: ['drag'],
    },
  ],
  [
    'drag',
    {
      id: 'drag',
      parentId: 'header',
      depth: 2,
      isContainer: false,
      layout: null,
      rect: { x: 12, y: 12, width: 60, height: 32 },
      childIds: [],
    },
  ],
  [
    'body',
    {
      id: 'body',
      parentId: 'page',
      depth: 1,
      isContainer: true,
      layout: 'column',
      rect: { x: 0, y: 80, width: 300, height: 320 },
      childIds: ['content'],
    },
  ],
  [
    'content',
    {
      id: 'content',
      parentId: 'body',
      depth: 2,
      isContainer: false,
      layout: null,
      rect: { x: 12, y: 100, width: 276, height: 80 },
      childIds: [],
    },
  ],
])

describe('computeDropTarget page edge zone', () => {
  it('prioritizes the leading page edge over a nested container', () => {
    expect(
      computeDropTarget({ x: 150, y: 24 }, 'drag', geometry, 'page', 48),
    ).toEqual({
      status: 'valid',
      parentId: 'page',
      index: 0,
      placement: 'before',
      noop: false,
    })
  })

  it('prioritizes the page edge over a nested container', () => {
    expect(
      computeDropTarget({ x: 150, y: 376 }, 'drag', geometry, 'page', 48),
    ).toEqual({
      status: 'valid',
      parentId: 'page',
      index: 2,
      placement: 'after',
      noop: false,
    })
  })

  it('accepts a pointer just outside the page edge', () => {
    expect(
      computeDropTarget({ x: 150, y: 424 }, 'drag', geometry, 'page', 48),
    ).toEqual({
      status: 'valid',
      parentId: 'page',
      index: 2,
      placement: 'after',
      noop: false,
    })
  })

  it('rejects a pointer beyond the page edge zone', () => {
    expect(
      computeDropTarget({ x: 150, y: 449 }, 'drag', geometry, 'page', 48),
    ).toEqual({ status: 'rejected', reason: 'invalid' })
  })
})
