import { useCanvasEditorSnapshot } from '../../canvas/editor/context'
import './styles/editor-panels.css'

export function ProjectView() {
  const snapshot = useCanvasEditorSnapshot()
  return (
    <aside className="editor-panel" aria-label="Project">
      <header className="editor-panel-header">
        <h2 className="editor-panel-title">Project</h2>
      </header>
      <div className="editor-panel-body">
        <section className="editor-panel-section">
          <h3 className="editor-panel-section-title">Pages</h3>
          <ul className="editor-page-list">
            <li className="editor-page-item editor-page-item-active">
              {snapshot.document.name}
            </li>
          </ul>
        </section>
        <p className="editor-panel-hint">Component catalog will live here.</p>
      </div>
    </aside>
  )
}
