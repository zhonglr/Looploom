import { useCallback, useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { CanvasDocument, CanvasNode, CanvasNodeId } from '../core/canvas-node'
import { isContainerNode } from '../core/canvas-node'

export type NodeElementRegistry = Map<CanvasNodeId, HTMLElement>

export interface DocumentRuntimeProps {
  document: CanvasDocument
  registry: NodeElementRegistry
  draggingNodeId?: CanvasNodeId | null
  editingNodeId?: CanvasNodeId | null
  editingValueRef: MutableRefObject<string | null> | undefined
  onEditCommit: ((nodeId: CanvasNodeId, value: string) => void) | undefined
  onEditCancel: ((nodeId: CanvasNodeId) => void) | undefined
}

export function DocumentRuntime({
  document,
  registry,
  draggingNodeId = null,
  editingNodeId = null,
  editingValueRef,
  onEditCommit,
  onEditCancel,
}: DocumentRuntimeProps) {
  return (
    <RenderNode
      node={document.root}
      registry={registry}
      isRoot
      depth={0}
      draggingNodeId={draggingNodeId}
      editingNodeId={editingNodeId}
      editingValueRef={editingValueRef}
      onEditCommit={onEditCommit}
      onEditCancel={onEditCancel}
    />
  )
}

export function NodeContent({ node }: { node: CanvasNode }) {
  if (node.kind === 'button') {
    return <>{node.label}</>
  }
  if (node.kind === 'container') {
    return <>{node.children.length} nodes</>
  }
  return <>{node.text}</>
}

interface RenderNodeProps {
  node: CanvasNode
  registry: NodeElementRegistry
  isRoot?: boolean
  depth: number
  draggingNodeId: CanvasNodeId | null
  editingNodeId: CanvasNodeId | null
  editingValueRef: MutableRefObject<string | null> | undefined
  onEditCommit: ((nodeId: CanvasNodeId, value: string) => void) | undefined
  onEditCancel: ((nodeId: CanvasNodeId) => void) | undefined
}

function RenderNode({
  node,
  registry,
  isRoot = false,
  depth,
  draggingNodeId,
  editingNodeId,
  editingValueRef,
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

  const isDragging = draggingNodeId === node.id

  if (isContainerNode(node)) {
    return (
      <div
        ref={registerRef}
        data-canvas-node-id={node.id}
        data-canvas-depth={depth}
        className={[
          'canvas-node',
          'canvas-node-container',
          `canvas-node-layout-${node.layout}`,
          isRoot ? 'canvas-node-root' : '',
          isDragging ? 'canvas-node-dragging' : '',
        ].filter(Boolean).join(' ')}
      >
        {node.children.map((child) => (
          <RenderNode
            key={child.id}
            node={child}
            registry={registry}
            depth={depth + 1}
            draggingNodeId={draggingNodeId}
            editingNodeId={editingNodeId}
            editingValueRef={editingValueRef}
            onEditCommit={onEditCommit}
            onEditCancel={onEditCancel}
          />
        ))}
      </div>
    )
  }

  const isEditing = editingNodeId === node.id
  const initialValue = node.kind === 'text' ? node.text : node.label
  if (isEditing && onEditCommit) {
    return (
      <InlineEditor
        node={node}
        registry={registry}
        initialValue={initialValue}
        editingValueRef={editingValueRef}
        onCommit={(value) => onEditCommit(node.id, value)}
        onCancel={() => onEditCancel?.(node.id)}
      />
    )
  }

  const className = [
    'canvas-node',
    node.kind === 'button' ? 'canvas-node-button' : 'canvas-node-text',
    isDragging ? 'canvas-node-dragging' : '',
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
  initialValue: string
  editingValueRef: MutableRefObject<string | null> | undefined
  onCommit: (value: string) => void
  onCancel: () => void
}

function InlineEditor({
  node,
  registry,
  initialValue,
  editingValueRef,
  onCommit,
  onCancel,
}: InlineEditorProps) {
  const [value, setValue] = useState(initialValue)
  const ref = useRef<HTMLTextAreaElement>(null)
  const settledRef = useRef(false)

  useEffect(() => {
    if (editingValueRef) editingValueRef.current = initialValue
  }, [editingValueRef, initialValue])

  const commit = () => {
    if (settledRef.current) return
    settledRef.current = true
    onCommit(value)
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
    element.setSelectionRange(element.value.length, element.value.length)
  }, [])

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
      className="canvas-inline-editor"
      data-canvas-node-id={node.id}
      value={value}
      rows={1}
      spellCheck={false}
      onChange={(event) => {
        setValue(event.target.value)
        if (editingValueRef) editingValueRef.current = event.target.value
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          commit()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          cancel()
        }
        event.stopPropagation()
      }}
      onBlur={() => commit()}
    />
  )
}
