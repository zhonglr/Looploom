import type { CanvasDocument, CanvasPageNode } from './canvas-node'

const root: CanvasPageNode = {
  id: 'page-home',
  name: 'Home',
  kind: 'page',
  layout: 'column',
  children: [
    {
      id: 'header',
      name: 'Header',
      kind: 'container',
      layout: 'row',
      children: [{ id: 'brand', name: 'Brand', kind: 'text', text: 'Looploom' }],
    },
    {
      id: 'hero',
      name: 'Hero',
      kind: 'container',
      layout: 'column',
      children: [
        {
          id: 'hero-title',
          name: 'Hero title',
          kind: 'text',
          text: 'Build low-code canvases',
        },
        {
          id: 'hero-body',
          name: 'Hero body',
          kind: 'text',
          text: 'Structure-aware editing starts here.',
        },
      ],
    },
    {
      id: 'actions',
      name: 'Actions',
      kind: 'container',
      layout: 'row',
      children: [
        { id: 'cta-primary', name: 'Primary CTA', kind: 'button', label: 'Get started' },
        { id: 'cta-secondary', name: 'Secondary CTA', kind: 'button', label: 'Learn more' },
      ],
    },
  ],
}

export function createSampleDocument(): CanvasDocument {
  return {
    id: 'page-home',
    name: 'Home',
    root,
  }
}
