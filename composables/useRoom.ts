import type { RoomState } from '~/types/game'
import type { GuestSession } from '~/types/session'
import { ApiError, FATAL_SESSION_CODES, toApiError } from '~/utils/errors'
import { authParams } from '~/utils/auth'
import { normalizeRoomState, normalizeSessionPayload } from '~/utils/normalize'

const HEARTBEAT_MS = 20_000

export function useRoom() {
  const { rpc } = useBackend()
  const { session, save, clear } = useGuestSession()
  const roomState = ref<RoomState | null>(null)
  let hbTimer: ReturnType<typeof setInterval> | null = null

  function requireSession(): GuestSession {
    if (!session.value) throw new ApiError('INVALID_SESSION', 'Sesimu sudah tidak berlaku. Silakan gabung lagi.')
    return session.value
  }

  async function createRoom(name: string, avatar: string): Promise<GuestSession> {
    const data = await rpc('create_room', { p_guest_name: name, p_avatar_key: avatar })
    const s = normalizeSessionPayload(data, { name, avatar })
    save({ ...s, is_master: true })
    return session.value as GuestSession
  }

  async function joinRoom(code: string, name: string, avatar: string): Promise<GuestSession> {
    const data = await rpc('join_room', { p_room_code: code, p_guest_name: name, p_avatar_key: avatar })
    const s = normalizeSessionPayload(data, { name, avatar })
    save(s)
    return s
  }

  /** get_room_state: initial load and recovery after reconnects. */
  async function refresh(): Promise<RoomState> {
    const s = requireSession()
    const data = await rpc('get_room_state', authParams(s))
    const state = normalizeRoomState(data)
    roomState.value = state
    // Keep the cached master flag aligned with the server (informational only).
    const me = state.players.find((p) => p.id === s.player_id)
    if (me && me.is_master !== s.is_master) save({ ...s, is_master: me.is_master })
    return state
  }

  async function setReady(isReady: boolean) {
    await rpc('set_player_ready', { ...authParams(requireSession()), p_is_ready: isReady })
  }

  async function startGame() {
    await rpc('start_game', authParams(requireSession()))
  }

  async function leave() {
    const s = session.value
    stopHeartbeat()
    if (s) {
      try {
        await rpc('leave_room', authParams(s))
      } catch (e) {
        // Fatal-session errors mean we are effectively gone already; anything else still ends locally.
        const err = toApiError(e)
        if (!FATAL_SESSION_CODES.includes(err.code)) console.warn('[gambar-bareng] leave_room failed:', err.code)
      }
    }
    clear()
    roomState.value = null
  }

  function startHeartbeat(onFatal?: (e: ApiError) => void) {
    stopHeartbeat()
    const beat = async () => {
      const s = session.value
      if (!s) return
      try {
        await rpc('heartbeat_player', authParams(s))
      } catch (e) {
        const err = toApiError(e)
        if (FATAL_SESSION_CODES.includes(err.code)) onFatal?.(err)
      }
    }
    void beat()
    hbTimer = setInterval(beat, HEARTBEAT_MS)
  }

  function stopHeartbeat() {
    if (hbTimer) clearInterval(hbTimer)
    hbTimer = null
  }

  return { roomState, createRoom, joinRoom, refresh, setReady, startGame, leave, startHeartbeat, stopHeartbeat }
}
