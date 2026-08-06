import { useCallback, useState } from 'react'
import { EditorLayoutError } from '../adapter/errors'
import { createEditorModel, serializeEditorModel } from '../adapter/model'
import type {
  EditorLayoutAction,
  EditorLayoutJson,
  EditorLayoutModel,
  EditorLayoutName,
  EditorLayoutPresets,
  EditorLayoutStorage,
  EditorModelOptions,
} from '../adapter/types'

export interface UseEditorLayoutsOptions {
  presets: EditorLayoutPresets
  initialLayout: EditorLayoutName
  storage?: EditorLayoutStorage
  modelOptions?: EditorModelOptions
}

function resolvePreset(
  presets: EditorLayoutPresets,
  name: EditorLayoutName,
): EditorLayoutJson {
  const preset = presets[name]
  if (!preset) {
    throw new EditorLayoutError({ code: 'layout.not-found', layoutName: name })
  }
  return typeof preset === 'function' ? preset() : structuredClone(preset)
}

export function useEditorLayouts({
  presets,
  initialLayout,
  storage,
  modelOptions,
}: UseEditorLayoutsOptions) {
  const loadModel = useCallback(
    (name: EditorLayoutName, includeSaved = true) => {
      const saved = includeSaved ? loadSavedLayout(storage, name) : undefined
      const json = saved ?? resolvePreset(presets, name)
      return createEditorModel(json, modelOptions)
    },
    [modelOptions, presets, storage],
  )

  const [layoutName, setLayoutName] = useState(initialLayout)
  const [model, setModel] = useState<EditorLayoutModel>(() =>
    loadModel(initialLayout),
  )
  const [revision, setRevision] = useState(0)

  const selectLayout = useCallback(
    (name: EditorLayoutName) => {
      setLayoutName(name)
      setModel(loadModel(name))
      setRevision((value) => value + 1)
    },
    [loadModel],
  )

  const saveLayout = useCallback(() => {
    if (!storage) return
    try {
      storage.save(layoutName, serializeEditorModel(model))
    } catch (cause) {
      throw new EditorLayoutError({
        code: 'layout.storage-save-failed',
        layoutName,
        cause,
      })
    }
  }, [layoutName, model, storage])

  const resetLayout = useCallback(() => {
    setModel(loadModel(layoutName, false))
    setRevision((value) => value + 1)
  }, [layoutName, loadModel])

  const handleModelChange = useCallback(
    (_model: EditorLayoutModel, _action: EditorLayoutAction) => {
      setRevision((value) => value + 1)
    },
    [],
  )

  return {
    layoutName,
    model,
    revision,
    selectLayout,
    saveLayout,
    resetLayout,
    handleModelChange,
  }
}

function loadSavedLayout(
  storage: EditorLayoutStorage | undefined,
  name: EditorLayoutName,
): EditorLayoutJson | undefined {
  if (!storage) return undefined
  try {
    return storage.load(name)
  } catch (cause) {
    throw new EditorLayoutError({
      code: 'layout.storage-load-failed',
      layoutName: name,
      cause,
    })
  }
}
