import { CanvasView } from '../canvas/CanvasView'
import { InspectorView } from './views/InspectorView'
import { ProjectView } from './views/ProjectView'
import type { EditorWindowRegistry } from 'editor-shell'

export const windowRegistry: EditorWindowRegistry = {
  project: () => <ProjectView />,
  canvas: () => <CanvasView />,
  inspector: () => <InspectorView />,
}
