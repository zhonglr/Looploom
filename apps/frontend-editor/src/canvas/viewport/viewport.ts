export const MIN_SCALE = 0.2
export const MAX_SCALE = 3
export const DEFAULT_SCALE = 1

export interface ViewportTransform {
  scale: number
  panX: number
  panY: number
}

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export function createViewport(
  scale = DEFAULT_SCALE,
  panX = 0,
  panY = 0,
): ViewportTransform {
  return { scale: clampScale(scale), panX, panY }
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export function screenToWorld(
  transform: ViewportTransform,
  point: Point,
): Point {
  return {
    x: (point.x - transform.panX) / transform.scale,
    y: (point.y - transform.panY) / transform.scale,
  }
}

export function panBy(
  transform: ViewportTransform,
  dx: number,
  dy: number,
): ViewportTransform {
  return { ...transform, panX: transform.panX + dx, panY: transform.panY + dy }
}

export function zoomAt(
  transform: ViewportTransform,
  screenPoint: Point,
  nextScale: number,
): ViewportTransform {
  const scale = clampScale(nextScale)
  const worldPoint = screenToWorld(transform, screenPoint)
  return {
    scale,
    panX: screenPoint.x - worldPoint.x * scale,
    panY: screenPoint.y - worldPoint.y * scale,
  }
}

export function fitViewport(
  worldSize: Size,
  viewportSize: Size,
  padding = 0,
): ViewportTransform {
  const availableWidth = Math.max(1, viewportSize.width - padding * 2)
  const availableHeight = Math.max(1, viewportSize.height - padding * 2)
  const scale = clampScale(
    Math.min(
      availableWidth / Math.max(1, worldSize.width),
      availableHeight / Math.max(1, worldSize.height),
    ),
  )
  return {
    scale,
    panX: (viewportSize.width - worldSize.width * scale) / 2,
    panY: (viewportSize.height - worldSize.height * scale) / 2,
  }
}

export function formatZoom(transform: ViewportTransform): string {
  return `${Math.round(transform.scale * 100)}%`
}
