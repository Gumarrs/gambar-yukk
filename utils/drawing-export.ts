import { ApiError } from './errors'

export const MAX_DRAWING_BYTES = 5 * 1024 * 1024

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new ApiError('EXPORT_FAILED', 'Gagal membuat gambar dari kanvas.'))
      if (blob.size > MAX_DRAWING_BYTES) {
        return reject(new ApiError('FILE_TOO_LARGE', 'Gambar terlalu besar (maksimal 5 MB).'))
      }
      resolve(blob)
    }, 'image/png')
  })
}
