import type { RealtimeChannel } from '@supabase/supabase-js'

export type RealtimeEvent =
  | 'player_joined'
  | 'player_left'
  | 'player_ready_changed'
  | 'game_started'
  | 'round_state_changed'
  | 'drawing_submitted'
  | 'results_ready'

const EVENTS: RealtimeEvent[] = [
  'player_joined',
  'player_left',
  'player_ready_changed',
  'game_started',
  'round_state_changed',
  'drawing_submitted',
  'results_ready'
]

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'disconnected'

/**
 * Broadcast + Presence for a room channel.
 * Broadcast is only a "something changed" nudge: listeners must re-verify through RPC.
 * Payloads carry ids only. Never put the secret token in a payload or presence state.
 */
export function useRealtimeRoom() {
  const supabase = useSupabase()
  const status = ref<RealtimeStatus>('idle')
  const onlineIds = ref<Set<string>>(new Set())

  let channel: RealtimeChannel | null = null
  let hadConnection = false
  const handlers = new Map<RealtimeEvent, Array<(payload: Record<string, any>) => void>>()
  const reconnectHandlers: Array<() => void> = []

  function on(event: RealtimeEvent, cb: (payload: Record<string, any>) => void) {
    const list = handlers.get(event) ?? []
    list.push(cb)
    handlers.set(event, list)
  }

  function onReconnect(cb: () => void) {
    reconnectHandlers.push(cb)
  }

  async function connect(
    roomId: string,
    me: { player_id: string; guest_name: string; avatar_key: string }
  ) {
    await disconnect()
    status.value = 'connecting'

    const ch = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: me.player_id }, broadcast: { self: false } }
    })

    ch.on('presence', { event: 'sync' }, () => {
      onlineIds.value = new Set(Object.keys(ch.presenceState()))
    })

    for (const ev of EVENTS) {
      ch.on('broadcast', { event: ev }, ({ payload }) => {
        for (const cb of handlers.get(ev) ?? []) cb((payload ?? {}) as Record<string, any>)
      })
    }

    ch.subscribe(async (s) => {
      if (s === 'SUBSCRIBED') {
        const wasDown = hadConnection && status.value === 'disconnected'
        status.value = 'connected'
        hadConnection = true
        await ch.track({ player_id: me.player_id, guest_name: me.guest_name, avatar_key: me.avatar_key })
        if (wasDown) reconnectHandlers.forEach((cb) => cb())
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
        status.value = 'disconnected'
      }
    })

    channel = ch
  }

  function send(event: RealtimeEvent, payload: Record<string, unknown> = {}) {
    if (!channel || status.value !== 'connected') return
    void channel.send({ type: 'broadcast', event, payload })
  }

  async function disconnect() {
    if (channel) {
      const ch = channel
      channel = null
      try {
        await supabase.removeChannel(ch)
      } catch {
        /* ignore */
      }
    }
    onlineIds.value = new Set()
    hadConnection = false
    status.value = 'idle'
  }

  return { status, onlineIds, on, onReconnect, connect, send, disconnect }
}
