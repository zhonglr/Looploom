import type {
  Action,
  IJsonModel,
  IJsonTabNode,
  Model,
} from 'flexlayout-react'
import type { ReactNode } from 'react'

export type EditorWindowId = string
export type EditorLayoutName = string
export type EditorDockLocation = 'center' | 'left' | 'right' | 'top' | 'bottom'
export type EditorFloatType = 'window' | 'float' | 'tab'

// Adapter contract: these aliases expose flexlayout's instance and JSON types
// under shell-owned names so consumers never import flexlayout directly.
export type EditorLayoutJson = IJsonModel
export type EditorLayoutTab = IJsonTabNode
export type EditorLayoutModel = Model
export type EditorLayoutAction = Action

export interface EditorWindowDefinition {
  id: EditorWindowId
  title: string
  component: string
  config?: unknown
  enableClose?: boolean
  enableDrag?: boolean
  enablePopout?: boolean
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
}

export interface EditorWindowRenderContext {
  id: EditorWindowId
  title: string
  component: string
  config?: unknown
}

export type EditorWindowRenderer = (
  context: EditorWindowRenderContext,
) => ReactNode

export type EditorWindowRegistry = Record<string, EditorWindowRenderer>

export interface EditorModelOptions {
  splitterSize?: number
}

export interface EditorLayoutStorage {
  load(name: EditorLayoutName): EditorLayoutJson | undefined
  save(name: EditorLayoutName, model: EditorLayoutJson): void
}

export type EditorLayoutPreset = EditorLayoutJson | (() => EditorLayoutJson)
export type EditorLayoutPresets = Record<EditorLayoutName, EditorLayoutPreset>

export interface EditorConstraintZone {
  id: string
  label: string
  weight: number
  min?: number
  max?: number
  axis?: 'horizontal' | 'vertical'
}

export interface EditorNodeConstraints {
  weight?: number
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
}

export interface EditorShellIcons {
  close?: ReactNode
  pin?: ReactNode
  closeTabset?: ReactNode
  popout?: ReactNode
  popoutFloat?: ReactNode
  maximize?: ReactNode
  restore?: ReactNode
  more?: ReactNode
  edgeArrow?: ReactNode
  activeTabset?: ReactNode
  closeFloatPopout?: ReactNode
}
