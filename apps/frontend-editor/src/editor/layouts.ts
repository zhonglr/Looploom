import { createEditorTab, type EditorLayoutJson } from 'editor-shell'

export const defaultLayout: EditorLayoutJson = {
  global: {
    enableEdgeDock: true,
    tabEnableDrag: true,
    tabEnablePopout: false,
    tabSetEnableDivide: true,
    tabSetEnableDrop: true,
  },
  borders: [],
  layout: {
    type: 'row',
    id: 'root',
    weight: 100,
    children: [
      {
        type: 'tabset',
        id: 'left-tools',
        weight: 20,
        minWidth: 180,
        maxWidth: 420,
        children: [
          createEditorTab({
            id: 'project',
            title: 'Project',
            component: 'project',
          }),
        ],
      },
      {
        type: 'tabset',
        id: 'canvas-tools',
        weight: 60,
        minWidth: 360,
        children: [
          createEditorTab({
            id: 'canvas',
            title: 'Canvas',
            component: 'canvas',
            enablePopout: false,
          }),
        ],
      },
      {
        type: 'tabset',
        id: 'right-tools',
        weight: 20,
        minWidth: 220,
        maxWidth: 480,
        children: [
          createEditorTab({
            id: 'inspector',
            title: 'Inspector',
            component: 'inspector',
          }),
        ],
      },
    ],
  },
}
