import type { CSSProperties, ReactNode } from 'react'
import type { CanvasNode } from '../../canvas/core/canvas-node'
import {
  isContainerNode,
  layoutKindLabel,
  nodeKindLabel,
} from '../../canvas/core/canvas-node'
import {
  useCanvasEditorController,
  useCanvasEditorSnapshot,
} from '../../canvas/editor/context'
import { getNode } from '../../canvas/core/document'
import './styles/editor-panels.css'

export function InspectorView() {
  const snapshot = useCanvasEditorSnapshot()
  const selected = snapshot.selection
    ? getNode(snapshot.document, snapshot.selection)
    : undefined

  return (
    <aside className="editor-panel" aria-label="Inspector">
      <header className="editor-panel-header">
        <h2 className="editor-panel-title">Inspector</h2>
      </header>
      <div className="editor-panel-body">
        {selected === undefined ? (
          <p className="editor-panel-hint">
            Select a node on the canvas to inspect it.
          </p>
        ) : (
          <>
            <dl className="editor-property-list">
              <div className="editor-property-row">
                <dt>Name</dt>
                <dd>{selected.name}</dd>
              </div>
              <div className="editor-property-row">
                <dt>Type</dt>
                <dd>{nodeKindLabel(selected.kind)}</dd>
              </div>
              {isContainerNode(selected) && (
                <>
                  <div className="editor-property-row">
                    <dt>Layout</dt>
                    <dd>{layoutKindLabel(selected.layout)}</dd>
                  </div>
                  <div className="editor-property-row">
                    <dt>Children</dt>
                    <dd>{selected.children.length}</dd>
                  </div>
                </>
              )}
            </dl>
            <section className="editor-panel-section">
              <h3 className="editor-panel-section-title">Tree</h3>
              <NodeTree />
            </section>
          </>
        )}
      </div>
      <footer className="editor-panel-footer">
        <span>Undo</span>
        <span>{snapshot.canUndo ? 'available' : 'empty'}</span>
        <span>Redo</span>
        <span>{snapshot.canRedo ? 'available' : 'empty'}</span>
      </footer>
    </aside>
  )
}

function NodeTree() {
  const controller = useCanvasEditorController()
  const snapshot = useCanvasEditorSnapshot()
  return (
    <ul className="editor-tree">
      {renderNode(
        snapshot.document.root,
        0,
        snapshot.selection,
        (nodeId) => controller.select(nodeId),
      )}
    </ul>
  )
}

function renderNode(
  node: CanvasNode,
  depth: number,
  selectedNodeId: string | null,
  onSelect: (nodeId: string) => void,
): ReactNode {
  const treeItemStyle = { '--tree-indent': String(depth) } as CSSProperties
  const selected = node.id === selectedNodeId
  return (
    <li key={node.id}>
      <button
        type="button"
        className={[
          'editor-tree-item',
          selected ? 'editor-tree-item-selected' : '',
        ].filter(Boolean).join(' ')}
        style={treeItemStyle}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(node.id)}
      >
        <span className="editor-tree-kind">{nodeKindLabel(node.kind)}</span>
        <span className="editor-tree-name">{node.name}</span>
      </button>
      {isContainerNode(node) && node.children.length > 0 && (
        <ul className="editor-tree">
          {node.children.map((child) =>
            renderNode(child, depth + 1, selectedNodeId, onSelect),
          )}
        </ul>
      )}
    </li>
  )
}
