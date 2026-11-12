export const NAME_MAX = 20

export function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
}

export function isValidName(raw: string): boolean {
  const n = sanitizeName(raw)
  return n.length >= 1 && n.length <= NAME_MAX
}

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

export function isValidRoomCode(raw: string): boolean {
  return /^[A-Z0-9]{6}$/.test(normalizeRoomCode(raw))
}
