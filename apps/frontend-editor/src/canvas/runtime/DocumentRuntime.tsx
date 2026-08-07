import { useCallback, useEffect, useRef, useState } from 'react'
import type { CanvasDocument, CanvasNode, CanvasNodeId } from '../core/canvas-node'
import { isLayoutNode, isPageNode } from '../core/canvas-node'

import type { FrameInsertionPreview } from '../frame/bridge'

export type NodeElementRegistry = Map<CanvasNodeId, HTMLElement>

export interface DocumentRuntimeProps {
  document: CanvasDocument
  registry: NodeElementRegistry
  previewRegistry?: NodeElementRegistry
  previewNode?: CanvasNode | undefined
  draggingNodeId?: CanvasNodeId | null
  editingNodeId?: CanvasNodeId | null
  displacedParentId?: CanvasNodeId | null
  insertionPreview?: FrameInsertionPreview | null
  editingDraft?: string | null
  editingSelectionRevision?: number
  onEditChange: (nodeId: CanvasNodeId, value: string) => void
  onEditCommit: (nodeId: CanvasNodeId, value: string, selectionRevision: number) => void
  onEditCancel: (nodeId: CanvasNodeId) => void
}

export function DocumentRuntime({
  document,
  registry,
  previewRegistry,
  previewNode,
  draggingNodeId = null,
  editingNodeId = null,
  displacedParentId = null,
  insertionPreview = null,
  editingDraft = null,
  editingSelectionRevision = 0,
  onEditChange,
  onEditCommit,
  onEditCancel,
}: DocumentRuntimeProps) {
  return (
    <RenderNode
      node={document.root}
      registry={registry}
      previewRegistry={previewRegistry}
      previewNode={previewNode}
      depth={0}
      draggingNodeId={draggingNodeId}
      editingNodeId={editingNodeId}
      displacedParentId={displacedParentId}
      insertionPreview={insertionPreview}
      editingDraft={editingDraft}
      editingSelectionRevision={editingSelectionRevision}
      onEditChange={onEditChange}
      onEditCommit={onEditCommit}
      onEditCancel={onEditCancel}
    />
  )
}

export function NodeContent({ node }: { node: CanvasNode }) {
  if (node.kind === 'button') {
    return <>{node.label}</>
  }
  if (node.kind === 'container' || node.kind === 'page') {
    return <>{node.children.length} nodes</>
  }
  return <>{node.text}</>
}

interface RenderNodeProps {
  node: CanvasNode
  registry: NodeElementRegistry
  previewRegistry: NodeElementRegistry | undefined
  previewNode: CanvasNode | undefined
  depth: number
  draggingNodeId: CanvasNodeId | null
  editingNodeId: CanvasNodeId | null
  displacedParentId: CanvasNodeId | null
  insertionPreview: FrameInsertionPreview | null
  displaced?: boolean
  editingDraft: string | null
  editingSelectionRevision: number
  onEditChange: (nodeId: CanvasNodeId, value: string) => void
  onEditCommit: (nodeId: CanvasNodeId, value: string, selectionRevision: number) => void
  onEditCancel: (nodeId: CanvasNodeId) => void
}

function RenderNode({
  node,
  registry,
  previewRegistry,
  previewNode,
  depth,
  draggingNodeId,
  editingNodeId,
  displacedParentId,
  insertionPreview,
  displaced = false,
  editingDraft,
  editingSelectionRevision,
  onEditChange,
  onEditCommit,
  onEditCancel,
}: RenderNodeProps) {
  const registerRef = useCallback(
    (element: HTMLElement | null) => {
      if (element) {
        registry.set(node.id, element)
      } else {
        registry.delete(node.id)
      }
    },
    [node.id, registry],
  )

  const registerPreview = useCallback(
    (parentId: CanvasNodeId, element: HTMLElement | null) => {
      if (!previewRegistry) return
      if (element) {
        previewRegistry.set(parentId, element)
      } else {
        previewRegistry.delete(parentId)
      }
    },
    [previewRegistry],
  )

  const isDragging = draggingNodeId === node.id
  const isDisplacedParent = node.id === displacedParentId

  if (isLayoutNode(node)) {
    const isPage = isPageNode(node)
    const nodeClass = isPage ? 'canvas-node-page' : 'canvas-node-container'
    const insertionForThis =
      insertionPreview && insertionPreview.parentId === node.id ? insertionPreview : null
    const horizontal = insertionForThis?.horizontal ?? false
    if (insertionForThis) {
      const filtered = node.children.filter(
        (child) => child.id !== draggingNodeId,
      )
      const before = filtered.slice(0, insertionForThis.fromIndex)
      const after = filtered.slice(insertionForThis.fromIndex)
      const renderChild = (child: CanvasNode) => (
        <RenderNode
          key={child.id}
          node={child}
          registry={registry}
          previewRegistry={previewRegistry}
          previewNode={previewNode}
          depth={depth + 1}
          draggingNodeId={draggingNodeId}
          editingNodeId={editingNodeId}
          displacedParentId={displacedParentId}
          insertionPreview={insertionPreview}
          displaced={false}
          editingDraft={editingDraft}
          editingSelectionRevision={editingSelectionRevision}
          onEditChange={onEditChange}
          onEditCommit={onEditCommit}
          onEditCancel={onEditCancel}
        />
      )
      return (
        <div
          ref={registerRef}
          data-canvas-node-id={node.id}
          data-canvas-depth={depth}
          className={[
            'canvas-node',
            nodeClass,
            `canvas-node-layout-${node.layout}`,
            isDragging ? 'canvas-node-dragging' : '',
          ].filter(Boolean).join(' ')}
        >
          {before.map(renderChild)}
          {previewNode && (
            <span
              ref={(element) => registerPreview(node.id, element)}
              aria-hidden="true"
              className={[
                'canvas-insertion-slot',
                `canvas-insertion-slot-${horizontal ? 'row' : 'column'}`,
                insertionForThis.isEmpty ? 'canvas-insertion-slot-empty' : '',
              ].filter(Boolean).join(' ')}
            >
              <RenderNode
                node={previewNode}
                registry={registry}
                previewRegistry={previewRegistry}
                previewNode={previewNode}
                depth={depth + 1}
                draggingNodeId={draggingNodeId}
                editingNodeId={editingNodeId}
                displacedParentId={displacedParentId}
                insertionPreview={insertionPreview}
                editingDraft={editingDraft}
                editingSelectionRevision={editingSelectionRevision}
                onEditChange={onEditChange}
                onEditCommit={onEditCommit}
                onEditCancel={onEditCancel}
              />
            </span>
          )}
          {after.map(renderChild)}
        </div>
      )
    }
    return (
      <div
        ref={registerRef}
        data-canvas-node-id={node.id}
        data-canvas-depth={depth}
        className={[
          'canvas-node',
          nodeClass,
          `canvas-node-layout-${node.layout}`,
          isDragging ? 'canvas-node-dragging' : '',
        ].filter(Boolean).join(' ')}
      >
        {node.children
          .filter((child) => child.id !== draggingNodeId)
          .map((child) => (
            <RenderNode
              key={child.id}
              node={child}
              registry={registry}
              previewRegistry={previewRegistry}
              previewNode={previewNode}
              depth={depth + 1}
              draggingNodeId={draggingNodeId}
              editingNodeId={editingNodeId}
              displacedParentId={displacedParentId}
              insertionPreview={insertionPreview}
              displaced={isDisplacedParent}
              editingDraft={editingDraft}
              editingSelectionRevision={editingSelectionRevision}
              onEditChange={onEditChange}
              onEditCommit={onEditCommit}
              onEditCancel={onEditCancel}
            />
          ))}
      </div>
    )
  }

  const isEditing = editingNodeId === node.id
  if (isEditing) {
    return (
      <InlineEditor
        node={node}
        registry={registry}
        value={editingDraft ?? (node.kind === 'text' ? node.text : node.label)}
        selectionRevision={editingSelectionRevision}
        onEditChange={(value) => onEditChange(node.id, value)}
        onCommit={(value, revision) => onEditCommit(node.id, value, revision)}
        onCancel={() => onEditCancel(node.id)}
      />
    )
  }

  const className = [
    'canvas-node',
    node.kind === 'button' ? 'canvas-node-button' : 'canvas-node-text',
    isDragging ? 'canvas-node-dragging' : '',
    displaced ? 'canvas-node-displaced' : '',
  ].filter(Boolean).join(' ')

  if (node.kind === 'button') {
    return (
      <button
        ref={registerRef}
        type="button"
        tabIndex={-1}
        data-canvas-node-id={node.id}
        data-canvas-depth={depth}
        className={className}
      >
        {node.label}
      </button>
    )
  }

  return (
    <span
      ref={registerRef}
      data-canvas-node-id={node.id}
      data-canvas-depth={depth}
      className={className}
    >
      {node.text}
    </span>
  )
}

interface InlineEditorProps {
  node: CanvasNode
  registry: NodeElementRegistry
  value: string
  selectionRevision: number
  onEditChange: (value: string) => void
  onCommit: (value: string, selectionRevision: number) => void
  onCancel: () => void
}

function InlineEditor({
  node,
  registry,
  value: hostValue,
  selectionRevision,
  onEditChange,
  onCommit,
  onCancel,
}: InlineEditorProps) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null)
  const settledRef = useRef(false)
  const isButton = node.kind === 'button'
  const [localValue, setLocalValue] = useState(hostValue)
  const localValueRef = useRef(localValue)
  localValueRef.current = localValue

  useEffect(() => {
    setLocalValue(hostValue)
  }, [hostValue])

  const commit = () => {
    if (settledRef.current) return
    settledRef.current = true
    onCommit(localValueRef.current, selectionRevision)
  }

  const cancel = () => {
    if (settledRef.current) return
    settledRef.current = true
    onCancel()
  }

  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.focus()
    if ('setSelectionRange' in element) {
      element.setSelectionRange(element.value.length, element.value.length)
    }
  }, [])

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const next = event.target.value
    setLocalValue(next)
    localValueRef.current = next
    onEditChange(next)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
    event.stopPropagation()
  }

  const className = isButton
    ? 'canvas-inline-editor canvas-inline-editor-button'
    : 'canvas-inline-editor'

  if (isButton) {
    return (
      <input
        ref={(element) => {
          ref.current = element
          if (element) {
            registry.set(node.id, element)
          } else {
            registry.delete(node.id)
          }
        }}
        type="text"
        className={className}
        data-canvas-node-id={node.id}
        value={localValue}
        spellCheck={false}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => commit()}
      />
    )
  }

  return (
    <textarea
      ref={(element) => {
        ref.current = element
        if (element) {
          registry.set(node.id, element)
        } else {
          registry.delete(node.id)
        }
      }}
      className={className}
      data-canvas-node-id={node.id}
      value={localValue}
      rows={1}
      spellCheck={false}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={() => commit()}
    />
  )
}
