import type { Ref } from 'vue'
import { canvasToPngBlob } from '~/utils/drawing-export'

export const CANVAS_W = 960
export const CANVAS_H = 640

type Pt = { x: number; y: number }
type Stroke = { type: 'stroke'; color: string; size: number; points: Pt[] } | { type: 'clear' }

export const PALETTE = [
  '#2B2D42',
  '#FFFFFF',
  '#FF6B6B',
  '#FF9F43',
  '#FFC93C',
  '#6BCB77',
  '#4D96FF',
  '#9B5DE5',
  '#FF8FB1',
  '#8B5E3C'
]
export const BRUSH_SIZES = [4, 8, 14, 24]

/**
 * Pointer-events canvas painter (mouse, touch and stylus share one code path).
 * The bitmap is a fixed 960x640 so exports are consistent; CSS scales it responsively.
 * Strokes are kept as data so undo / clear are cheap and exact.
 */
export function useDrawingCanvas(canvasRef: Ref<HTMLCanvasElement | null>) {
  const color = ref(PALETTE[0])
  const size = ref(BRUSH_SIZES[1])
  const tool = ref<'brush' | 'eraser'>('brush')
  const disabled = ref(false)
  const strokeCount = ref(0)
  const hasContent = ref(false)

  const strokes: Stroke[] = []
  let current: Extract<Stroke, { type: 'stroke' }> | null = null
  let activePointer: number | null = null
  let el: HTMLCanvasElement | null = null

  const canUndo = computed(() => strokeCount.value > 0)

  function context() {
    return el?.getContext('2d') ?? null
  }

  function paintBackground() {
    const c = context()
    if (!c) return
    c.fillStyle = '#FFFFFF'
    c.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }

  function drawSegment(s: Extract<Stroke, { type: 'stroke' }>, from: number) {
    const c = context()
    if (!c) return
    c.strokeStyle = s.color
    c.fillStyle = s.color
    c.lineWidth = s.size
    c.lineCap = 'round'
    c.lineJoin = 'round'
    if (s.points.length === 1) {
      const p = s.points[0]
      c.beginPath()
      c.arc(p.x, p.y, s.size / 2, 0, Math.PI * 2)
      c.fill()
      return
    }
    c.beginPath()
    c.moveTo(s.points[Math.max(0, from - 1)].x, s.points[Math.max(0, from - 1)].y)
    for (let i = Math.max(1, from); i < s.points.length; i++) c.lineTo(s.points[i].x, s.points[i].y)
    c.stroke()
  }

  function redraw() {
    paintBackground()
    let any = false
    for (const s of strokes) {
      if (s.type === 'clear') {
        paintBackground()
        any = false
      } else {
        drawSegment(s, 0)
        if (s.color !== '#FFFFFF') any = true
      }
    }
    hasContent.value = any
  }

  function toPoint(e: PointerEvent): Pt {
    const r = (el as HTMLCanvasElement).getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) * CANVAS_W) / r.width,
      y: ((e.clientY - r.top) * CANVAS_H) / r.height
    }
  }

  function onDown(e: PointerEvent) {
    if (disabled.value || !el) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    activePointer = e.pointerId
    el.setPointerCapture(e.pointerId)
    const eraser = tool.value === 'eraser'
    current = {
      type: 'stroke',
      color: eraser ? '#FFFFFF' : color.value,
      size: eraser ? size.value * 2 : size.value,
      points: [toPoint(e)]
    }
    drawSegment(current, 0)
  }

  function onMove(e: PointerEvent) {
    if (!current || e.pointerId !== activePointer) return
    e.preventDefault()
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
    const list = events.length ? events : [e]
    const from = current.points.length
    for (const ev of list) current.points.push(toPoint(ev))
    drawSegment(current, from)
  }

  function onUp(e: PointerEvent) {
    if (!current || e.pointerId !== activePointer) return
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    strokes.push(current)
    strokeCount.value = strokes.length
    if (current.color !== '#FFFFFF') hasContent.value = true
    current = null
    activePointer = null
  }

  function init() {
    el = canvasRef.value
    if (!el) return
    el.width = CANVAS_W
    el.height = CANVAS_H
    paintBackground()
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }

  function dispose() {
    if (!el) return
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    el = null
  }

  function undo() {
    if (disabled.value || !strokes.length) return
    strokes.pop()
    strokeCount.value = strokes.length
    redraw()
  }

  /** Clearing is itself an undoable step. */
  function clear() {
    if (disabled.value || !hasContent.value) return
    strokes.push({ type: 'clear' })
    strokeCount.value = strokes.length
    redraw()
  }

  function toBlob(): Promise<Blob> {
    if (!el) return Promise.reject(new Error('canvas not ready'))
    return canvasToPngBlob(el)
  }

  onMounted(init)
  onBeforeUnmount(dispose)

  return { color, size, tool, disabled, canUndo, hasContent, undo, clear, toBlob }
}
