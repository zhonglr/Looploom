import { createContext, useContext, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { CanvasDocument } from '../core/canvas-node'
import { createSampleDocument } from '../core/sample-document'
import { CanvasEditorController } from './controller'
import type { CanvasEditorSnapshot } from './controller'

const CanvasEditorContext = createContext<CanvasEditorController | null>(null)

export interface CanvasEditorProviderProps {
  children: ReactNode
  initialDocument?: CanvasDocument
}

export function CanvasEditorProvider({
  children,
  initialDocument,
}: CanvasEditorProviderProps) {
  const [controller] = useState(
    () => new CanvasEditorController(initialDocument ?? createSampleDocument()),
  )
  return (
    <CanvasEditorContext.Provider value={controller}>
      {children}
    </CanvasEditorContext.Provider>
  )
}

export function useCanvasEditorController(): CanvasEditorController {
  const controller = useContext(CanvasEditorContext)
  if (controller === null) {
    throw new Error(
      'useCanvasEditorController must be used inside CanvasEditorProvider',
    )
  }
  return controller
}

export function useCanvasEditorSnapshot(): CanvasEditorSnapshot {
  const controller = useCanvasEditorController()
  return useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
  )
}
