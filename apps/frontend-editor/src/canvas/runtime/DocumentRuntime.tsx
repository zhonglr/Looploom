import { useCallback, useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { CanvasDocument, CanvasNode, CanvasNodeId } from '../core/canvas-node'
import { isContainerNode } from '../core/canvas-node'

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
  editingValueRef: MutableRefObject<string | null> | undefined
  onEditCommit: ((nodeId: CanvasNodeId, value: string) => void) | undefined
  onEditCancel: ((nodeId: CanvasNodeId) => void) | undefined
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
  editingValueRef,
  onEditCommit,
  onEditCancel,
}: DocumentRuntimeProps) {
  return (
    <RenderNode
      node={document.root}
      registry={registry}
      previewRegistry={previewRegistry}
      previewNode={previewNode}
      isRoot
      depth={0}
      draggingNodeId={draggingNodeId}
      editingNodeId={editingNodeId}
      displacedParentId={displacedParentId}
      insertionPreview={insertionPreview}
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
  previewRegistry: NodeElementRegistry | undefined
  previewNode: CanvasNode | undefined
  isRoot?: boolean
  depth: number
  draggingNodeId: CanvasNodeId | null
  editingNodeId: CanvasNodeId | null
  displacedParentId: CanvasNodeId | null
  insertionPreview: FrameInsertionPreview | null
  displaced?: boolean
  editingValueRef: MutableRefObject<string | null> | undefined
  onEditCommit: ((nodeId: CanvasNodeId, value: string) => void) | undefined
  onEditCancel: ((nodeId: CanvasNodeId) => void) | undefined
}

function RenderNode({
  node,
  registry,
  previewRegistry,
  previewNode,
  isRoot = false,
  depth,
  draggingNodeId,
  editingNodeId,
  displacedParentId,
  insertionPreview,
  displaced = false,
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

  if (isContainerNode(node)) {
    const insertionForThis =
      insertionPreview && insertionPreview.parentId === node.id ? insertionPreview : null
    const horizontal = insertionForThis?.horizontal ?? false
    if (insertionForThis) {
      // While dragging the element leaves the flow entirely (no space occupied);
      // the live slot shows where it will land, sized by the real layout.
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
          editingValueRef={editingValueRef}
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
          'canvas-node-container',
          `canvas-node-layout-${node.layout}`,
          isRoot ? 'canvas-node-root' : '',
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
                editingValueRef={editingValueRef}
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
          'canvas-node-container',
          `canvas-node-layout-${node.layout}`,
          isRoot ? 'canvas-node-root' : '',
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
