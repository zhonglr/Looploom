import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { EditorShellIcons } from '../adapter/types'

const EditorShellIconsContext = createContext<EditorShellIcons | undefined>(
  undefined,
)

export interface EditorShellIconProviderProps {
  icons: EditorShellIcons
  children: ReactNode
}

export function EditorShellIconProvider({
  icons,
  children,
}: EditorShellIconProviderProps) {
  return (
    <EditorShellIconsContext.Provider value={icons}>
      {children}
    </EditorShellIconsContext.Provider>
  )
}

export function useEditorShellIcons(): EditorShellIcons | undefined {
  return useContext(EditorShellIconsContext)
}
