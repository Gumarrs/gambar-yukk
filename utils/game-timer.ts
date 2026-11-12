/** Whole seconds left until an ISO timestamp, using a (possibly drift-corrected) clock. Never negative. */
export function secondsUntil(iso: string | null, nowMs: number): number {
  if (!iso) return 0
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.ceil((t - nowMs) / 1000))
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
