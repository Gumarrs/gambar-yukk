export class ApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

const RULES: Array<[RegExp, string, string]> = [
  [/failed to fetch|network|\bload failed|fetch failed|timeout/, 'NETWORK', 'Koneksi internet bermasalah. Cek koneksimu lalu coba lagi.'],
  [/drawing prompt|prompt aktif|no active prompt/, 'NO_PROMPT', 'Belum ada gambar referensi aktif di server, jadi game belum bisa dimulai. Hubungi pembuat game.'],
  [/invalid.*(session|token|guest|credential)|unauthorized|session invalid|invalid player/, 'INVALID_SESSION', 'Sesimu sudah tidak berlaku. Silakan gabung lagi.'],
  [/only.*master|not.*master|master only/, 'NOT_MASTER', 'Hanya pembuat room yang bisa memulai game.'],
  [/already left|player left|has left/, 'PLAYER_LEFT', 'Kamu sudah keluar dari room ini.'],
  [/room.*closed|closed room/, 'ROOM_CLOSED', 'Room ini sudah ditutup.'],
  [/(drawing|submission|submit|round|time).*(expired|ended|over|window|closed)/, 'DRAWING_EXPIRED', 'Waktu menggambar sudah habis.'],
  [/room.*expired|expired room/, 'ROOM_EXPIRED', 'Room ini sudah kedaluwarsa.'],
  [/full|penuh/, 'ROOM_FULL', 'Room sudah penuh (maksimal 4 pemain).'],
  [/room.*not found|invalid room|room code/, 'ROOM_NOT_FOUND', 'Kode room tidak ditemukan. Cek lagi kodenya ya.'],
  [/round.*(not active|not found|no active)|no (active )?round|not active/, 'ROUND_NOT_ACTIVE', 'Ronde belum aktif atau sudah selesai.'],
  [/upload|storage|png|file/, 'UPLOAD_FAILED', 'Gambar gagal diunggah. Coba kirim lagi.']
]

const FALLBACK: [string, string] = ['UNKNOWN', 'Terjadi kesalahan. Coba lagi ya.']

function extractText(e: unknown): string {
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const anyE = e as Record<string, unknown>
    if (typeof anyE.message === 'string') return anyE.message
  }
  return ''
}

/** Maps any backend/network error to a safe, Indonesian message. Raw text is never shown to the user. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e
  const text = extractText(e).toLowerCase().replace(/_/g, ' ')
  for (const [re, code, message] of RULES) {
    if (re.test(text)) return new ApiError(code, message)
  }
  return new ApiError(FALLBACK[0], FALLBACK[1])
}

export const FATAL_SESSION_CODES = ['INVALID_SESSION', 'PLAYER_LEFT', 'ROOM_CLOSED', 'ROOM_EXPIRED']
