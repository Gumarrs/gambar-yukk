import type { GuestSession } from '~/types/session'
import { ApiError, FATAL_SESSION_CODES, toApiError } from '~/utils/errors'
import { authParams } from '~/utils/auth'
import { firstRow } from '~/utils/normalize'

const STORAGE_KEY = 'gambar_bareng_session'

function isSession(v: any): v is GuestSession {
  return (
    v &&
    typeof v.player_id === 'string' &&
    typeof v.secret_token === 'string' &&
    typeof v.room_id === 'string' &&
    typeof v.room_code === 'string'
  )
}

export type SessionCheck = 'ok' | 'invalid' | 'closed'

export function useGuestSession() {
  const session = useState<GuestSession | null>('guest-session', () => null)
  const { rpc } = useBackend()

  /** Reads the session from sessionStorage (tab scoped). */
  function load(): GuestSession | null {
    if (!import.meta.client) return null
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      session.value = isSession(parsed)
        ? {
            ...parsed,
            guest_name: String(parsed.guest_name ?? ''),
            avatar_key: String(parsed.avatar_key ?? ''),
            is_master: parsed.is_master === true
          }
        : null
    } catch {
      session.value = null
    }
    return session.value
  }

  function save(s: GuestSession) {
    session.value = s
    if (!import.meta.client) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
      /* storage unavailable: session lives in memory only */
    }
  }

  function clear() {
    session.value = null
    if (!import.meta.client) return
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  /**
   * Validates the stored session with validate_guest_session.
   * - 'ok': session valid (is_master and profile are refreshed from the server)
   * - 'invalid' / 'closed': session cleared
   * Network errors are rethrown WITHOUT clearing, so a flaky connection never logs the player out.
   */
  async function validate(): Promise<SessionCheck> {
    const s = session.value ?? load()
    if (!s) return 'invalid'
    try {
      const data = await rpc('validate_guest_session', authParams(s))
      const row = firstRow(data)
      if (!row || row.success !== true) {
        clear()
        return 'invalid'
      }
      const status = row.room?.status
      if (status === 'closed') {
        clear()
        return 'closed'
      }
      save({
        ...s,
        room_id: typeof row.room?.id === 'string' ? row.room.id : s.room_id,
        room_code: typeof row.room?.code === 'string' ? String(row.room.code).toUpperCase() : s.room_code,
        guest_name: typeof row.player?.name === 'string' ? row.player.name : s.guest_name,
        avatar_key: typeof row.player?.avatar_key === 'string' ? row.player.avatar_key : s.avatar_key,
        // Never trust local master state: always take it from the server.
        is_master: row.player?.is_master === true
      })
      return 'ok'
    } catch (e) {
      const err = e instanceof ApiError ? e : toApiError(e)
      if (FATAL_SESSION_CODES.includes(err.code)) {
        clear()
        return err.code === 'ROOM_CLOSED' || err.code === 'ROOM_EXPIRED' ? 'closed' : 'invalid'
      }
      throw err
    }
  }

  return { session, load, save, clear, validate }
}
