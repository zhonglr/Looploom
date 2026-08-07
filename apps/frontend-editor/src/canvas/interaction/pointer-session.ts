export interface PointerSession {
  pointerId: number | null
  isCaptured: boolean
  capture: (element: Element, pointerId: number) => void
  release: () => void
  isActive: (pointerId: number) => boolean
  cancel: () => void
}

export interface PointerSessionOptions {
  onCancel: (pointerId: number | null) => void
  onCaptureLost: (pointerId: number | null) => void
}

export function createPointerSession(options: PointerSessionOptions): PointerSession {
  let pointerId: number | null = null
  let capturedElement: Element | null = null
  let isCaptured = false

  const handleLostCapture = (event: Event) => {
    const pointerEvent = event as PointerEvent
    if (pointerEvent.pointerId !== pointerId) return
    isCaptured = false
    capturedElement = null
    pointerId = null
    options.onCaptureLost(pointerEvent.pointerId)
  }

  const capture = (element: Element, id: number) => {
    if (pointerId === id && isCaptured) return
    if (isCaptured && capturedElement && pointerId !== null) {
      try {
        capturedElement.releasePointerCapture(pointerId)
      } catch {
        // already released
      }
      capturedElement.removeEventListener('lostpointercapture', handleLostCapture as EventListener)
    }
    pointerId = id
    capturedElement = element
    isCaptured = true
    element.addEventListener('lostpointercapture', handleLostCapture as EventListener)
    element.setPointerCapture(id)
  }

  const release = () => {
    if (isCaptured && capturedElement && pointerId !== null) {
      capturedElement.removeEventListener('lostpointercapture', handleLostCapture as EventListener)
      try {
        capturedElement.releasePointerCapture(pointerId)
      } catch {
        // already released
      }
    }
    isCaptured = false
    capturedElement = null
    pointerId = null
  }

  const isActive = (id: number): boolean => pointerId === id

  const cancel = () => {
    const prevPointerId = pointerId
    release()
    options.onCancel(prevPointerId)
  }

  return {
    get pointerId() {
      return pointerId
    },
    get isCaptured() {
      return isCaptured
    },
    capture,
    release,
    isActive,
    cancel,
  }
}
