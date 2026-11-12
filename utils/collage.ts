import type { RoundResults } from '~/types/game'

const W = 1200
const PAD = 40
const GAP = 30
const INK = '#2B2D42'
const CREAM = '#FFF8EC'

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    // Needed so the canvas stays exportable. If the server sends no CORS headers the load fails and we fall back to a placeholder.
    img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => resolve(null), 15000)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    img.src = src
  })
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = '#FFFFFF') {
  ctx.fillStyle = INK
  rr(ctx, x + 6, y + 6, w, h, 24)
  ctx.fill()
  ctx.fillStyle = fill
  rr(ctx, x, y, w, h, 24)
  ctx.fill()
}

function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = INK
  ctx.lineWidth = 4
  rr(ctx, x, y, w, h, 24)
  ctx.stroke()
}

function fit(text: string, ctx: CanvasRenderingContext2D, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

function contain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * s
  const dh = img.naturalHeight * s
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

function placeholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, icon: string, text: string) {
  ctx.fillStyle = '#F1F1F1'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(43,45,66,.55)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '56px sans-serif'
  ctx.fillText(icon, x + w / 2, y + h / 2 - 26)
  ctx.font = '600 26px Fredoka, system-ui, sans-serif'
  ctx.fillText(fit(text, ctx, w - 40), x + w / 2, y + h / 2 + 34)
}

/** Draws the reference + every player's drawing into one shareable PNG (runs fully in the browser). */
export async function buildCollage(results: RoundResults): Promise<Blob> {
  try {
    await document.fonts?.load('700 40px Fredoka')
  } catch {
    /* fall back to system font */
  }

  const prompt = results.prompt
  const [refImg, ...imgs] = await Promise.all([
    prompt?.image_url ? loadImage(prompt.image_url) : Promise.resolve(null),
    ...results.drawings.map((d) => (d.drawing_url ? loadImage(d.drawing_url) : Promise.resolve(null)))
  ])

  const n = results.drawings.length
  const cols = n <= 1 ? 1 : 2
  const cellW = cols === 1 ? 700 : (W - PAD * 2 - GAP) / 2
  const imgH = Math.round((cellW * 2) / 3)
  const labelH = 68
  const cellH = imgH + labelH
  const rows = Math.max(1, Math.ceil(n / cols))

  const headerH = 150
  const refW = 560
  const refImgH = 360
  const refH = labelH + refImgH
  const footerH = 80
  const H = headerH + refH + GAP + rows * (cellH + GAP) + footerH

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unsupported')

  ctx.fillStyle = CREAM
  ctx.fillRect(0, 0, W, H)

  // Header
  ctx.textBaseline = 'alphabetic'
  ctx.font = '700 64px Fredoka, system-ui, sans-serif'
  const a = 'Gambar '
  const b = 'Bareng'
  const total = ctx.measureText(a + b).width
  const startX = (W - total) / 2
  ctx.textAlign = 'left'
  ctx.fillStyle = '#FF6B6B'
  ctx.fillText(a, startX, 80)
  ctx.fillStyle = '#4D96FF'
  ctx.fillText(b, startX + ctx.measureText(a).width, 80)
  ctx.textAlign = 'center'
  ctx.fillStyle = INK
  ctx.font = '600 30px Fredoka, system-ui, sans-serif'
  ctx.fillText(`Ronde ${results.round_number}`, W / 2, 125)

  // Reference card
  const rx = (W - refW) / 2
  let y = headerH
  card(ctx, rx, y, refW, refH)
  ctx.fillStyle = '#9B5DE5'
  rr(ctx, rx, y, refW, labelH, 24)
  ctx.fill()
  ctx.fillRect(rx, y + labelH - 24, refW, 24)
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = '700 32px Fredoka, system-ui, sans-serif'
  ctx.fillText(fit(`Referensi: ${prompt?.title ?? '-'}`, ctx, refW - 48), rx + 24, y + labelH / 2)
  ctx.save()
  ctx.beginPath()
  ctx.rect(rx, y + labelH, refW, refImgH)
  ctx.clip()
  ctx.fillStyle = CREAM
  ctx.fillRect(rx, y + labelH, refW, refImgH)
  if (refImg) contain(ctx, refImg, rx, y + labelH, refW, refImgH)
  else placeholder(ctx, rx, y + labelH, refW, refImgH, '🖼️', prompt?.title ?? 'Referensi')
  ctx.restore()
  frame(ctx, rx, y, refW, refH)

  // Drawings grid
  y += refH + GAP
  results.drawings.forEach((d, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = cols === 1 ? (W - cellW) / 2 : PAD + col * (cellW + GAP)
    const cy = y + row * (cellH + GAP)

    card(ctx, x, cy, cellW, cellH)
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, cy + labelH, cellW, imgH)
    ctx.clip()
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(x, cy + labelH, cellW, imgH)
    const img = imgs[i]
    if (img) contain(ctx, img, x, cy + labelH, cellW, imgH)
    else placeholder(ctx, x, cy + labelH, cellW, imgH, '⏰', d.drawing_url ? 'Gambar gagal dimuat' : 'Belum terkirim')
    ctx.restore()

    // Label bar
    ctx.fillStyle = CREAM
    rr(ctx, x, cy, cellW, labelH, 24)
    ctx.fill()
    ctx.fillRect(x, cy + labelH - 24, cellW, 24)
    const av = avatarFor(d.avatar_key)
    ctx.fillStyle = av.bg
    ctx.beginPath()
    ctx.arc(x + 44, cy + labelH / 2, 24, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '26px sans-serif'
    ctx.fillStyle = INK
    ctx.fillText(av.emoji, x + 44, cy + labelH / 2 + 2)
    ctx.textAlign = 'left'
    ctx.font = '700 30px Fredoka, system-ui, sans-serif'
    ctx.fillText(fit(d.player_name, ctx, cellW - 100), x + 84, cy + labelH / 2 + 1)
    // Separator + border
    ctx.fillStyle = INK
    ctx.fillRect(x, cy + labelH - 2, cellW, 4)
    frame(ctx, x, cy, cellW, cellH)
  })

  // Footer
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(43,45,66,.6)'
  ctx.font = '600 26px Fredoka, system-ui, sans-serif'
  ctx.fillText('Main bareng teman di Gambar Bareng ✏️', W / 2, H - 32)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('export failed'))), 'image/png')
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/** Opens the system share sheet with the PNG when supported (mostly phones); otherwise downloads it. */
export async function shareCollage(blob: Blob, text: string): Promise<ShareOutcome> {
  const file = new File([blob], 'gambar-bareng.png', { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Gambar Bareng', text })
      return 'shared'
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
      // Any other failure: fall through to a plain download.
    }
  }
  downloadBlob(blob, 'gambar-bareng.png')
  return 'downloaded'
}
