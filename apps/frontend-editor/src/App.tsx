import { useState } from 'react'
import { createEditorModel, EditorShell } from 'editor-shell'
import { CanvasEditorProvider } from './canvas/editor/context'
import { defaultLayout } from './editor/layouts'
import { windowRegistry } from './editor/windowRegistry'

export function App() {
  const [model] = useState(() =>
    createEditorModel(defaultLayout, { splitterSize: 5 }),
  )

  return (
    <CanvasEditorProvider>
      <EditorShell model={model} windows={windowRegistry} />
    </CanvasEditorProvider>
  )
}
