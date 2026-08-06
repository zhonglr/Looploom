import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createViewport, fitViewport, panBy, zoomAt } from './viewport'
import type { Point, ViewportTransform } from './viewport'

const ZOOM_STEP = 1.2
const ZOOM_REFERENCE_DELTA = 100
const ZOOM_MAX_NOTCHES = 1.5
const WHEEL_LINE_DELTA = 100
const WHEEL_PAGE_DELTA = 800
const FIT_PADDING = 48

export interface PageSize {
  width: number
  height: number
}

export interface UseViewportControllerOptions {
  viewportRef: RefObject<HTMLDivElement | null>
  getPageSize: () => PageSize
}

function normalizeWheelDelta(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * WHEEL_LINE_DELTA
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * WHEEL_PAGE_DELTA
  }
  return event.deltaY
}

export interface ViewportController {
  viewport: ViewportTransform
  setViewport: (value: ViewportTransform) => void
  isPanning: boolean
  spaceHeld: boolean
  startPan: (point: Point) => void
  updatePan: (point: Point) => void
  endPan: () => void
  isPanActive: () => boolean
  handleZoomIn: () => void
  handleZoomOut: () => void
  handleZoomReset: () => void
  fitPageToViewport: () => void
}

export function useViewportController({
  viewportRef,
  getPageSize,
}: UseViewportControllerOptions): ViewportController {
  const [viewport, setViewport] = useState<ViewportTransform>(() => createViewport())
  const [isPanning, setIsPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const panStartRef = useRef<Point | null>(null)

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return undefined
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect()
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
        const delta = normalizeWheelDelta(event)
        const notches = Math.max(
          -ZOOM_MAX_NOTCHES,
          Math.min(ZOOM_MAX_NOTCHES, delta / ZOOM_REFERENCE_DELTA),
        )
        const factor = Math.pow(ZOOM_STEP, -notches)
        setViewport((current) => zoomAt(current, point, current.scale * factor))
      } else {
        if (panStartRef.current !== null) return
        setViewport((current) => panBy(current, -event.deltaX, -event.deltaY))
      }
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [viewportRef])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(true)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const startPan = (point: Point) => {
    panStartRef.current = point
    setIsPanning(true)
  }

  const updatePan = (point: Point) => {
    const start = panStartRef.current
    if (!start) return
    const dx = point.x - start.x
    const dy = point.y - start.y
    panStartRef.current = point
    setViewport((current) => panBy(current, dx, dy))
  }

  const endPan = () => {
    panStartRef.current = null
    setIsPanning(false)
  }

  const isPanActive = () => panStartRef.current !== null

  const viewportCenter = (): Point | undefined => {
    const element = viewportRef.current
    if (!element) return undefined
    return { x: element.clientWidth / 2, y: element.clientHeight / 2 }
  }

  const handleZoomIn = () => {
    const center = viewportCenter()
    if (center) {
      setViewport((current) => zoomAt(current, center, current.scale * ZOOM_STEP))
    }
  }

  const handleZoomOut = () => {
    const center = viewportCenter()
    if (center) {
      setViewport((current) => zoomAt(current, center, current.scale / ZOOM_STEP))
    }
  }

  const handleZoomReset = () => {
    setViewport((current) => ({ ...current, scale: 1 }))
  }

  const fitPageToViewport = () => {
    const element = viewportRef.current
    if (!element) return
    setViewport(
      fitViewport(
        getPageSize(),
        { width: element.clientWidth, height: element.clientHeight },
        FIT_PADDING,
      ),
    )
  }

  return {
    viewport,
    setViewport,
    isPanning,
    spaceHeld,
    startPan,
    updatePan,
    endPan,
    isPanActive,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    fitPageToViewport,
  }
}