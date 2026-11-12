import type { RoundResults, RoundState } from '~/types/game'
import { toApiError } from '~/utils/errors'
import { authParams } from '~/utils/auth'
import { normalizeResults, normalizeRoundState } from '~/utils/normalize'
import { secondsUntil } from '~/utils/game-timer'

export type RoundPhase = 'idle' | 'countdown' | 'drawing' | 'ending' | 'results'

const POLL_ACTIVE_MS = 2500
const POLL_IDLE_MS = 5000
const DEFAULT_COUNTDOWN_MS = 3000

/**
 * Round engine. Server timestamps are authoritative:
 * - sync_round_state is polled (2.5s while a round is live, 5s otherwise)
 * - a local 250ms ticker only interpolates between syncs
 * - clock drift is corrected when the backend returns a server time
 */
export function useGameRound() {
  const { rpc, invoke } = useBackend()
  const { session } = useGuestSession()

  const round = ref<RoundState | null>(null)
  const nowMs = ref(Date.now())
  const clockOffset = ref(0)
  const hasSubmitted = ref(false)
  const submitting = ref(false)
  const results = ref<RoundResults | null>(null)
  const resultsLoading = ref(false)
  const resultsError = ref<string | null>(null)
  const failures = ref(0)

  let resultsFetchedAt = 0
  let resultsAttempt: string | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let syncing = false
  const boundaryHit = new Set<string>()

  const serverNow = () => nowMs.value + clockOffset.value

  const countdownSeconds = computed(() => {
    const r = round.value
    if (!r) return 0
    if (r.drawing_started_at) return secondsUntil(r.drawing_started_at, serverNow())
    if (r.countdown_started_at) {
      const t = Date.parse(r.countdown_started_at)
      if (!Number.isNaN(t)) return secondsUntil(new Date(t + DEFAULT_COUNTDOWN_MS).toISOString(), serverNow())
    }
    return 0
  })

  const remaining = computed(() => secondsUntil(round.value?.drawing_ends_at ?? null, serverNow()))

  const totalSeconds = computed(() => {
    const r = round.value
    if (r?.drawing_started_at && r.drawing_ends_at) {
      const d = Math.round((Date.parse(r.drawing_ends_at) - Date.parse(r.drawing_started_at)) / 1000)
      if (d > 0) return d
    }
    return 90
  })

  const phase = computed<RoundPhase>(() => {
    const r = round.value
    if (!r) return 'idle'
    if (r.status === 'results' || r.status === 'completed') return 'results'
    if (r.status === 'countdown') return 'countdown'
    return remaining.value > 0 ? 'drawing' : 'ending'
  })

  const connectionLost = computed(() => failures.value >= 2)

  function trigger(key: string, fn: () => Promise<unknown>) {
    if (boundaryHit.has(key)) return
    boundaryHit.add(key)
    void fn().catch(() => {})
  }

  function tick() {
    nowMs.value = Date.now()
    const r = round.value
    if (!r) return
    if (r.status === 'countdown' && countdownSeconds.value === 0) {
      trigger(`${r.id}:cd`, () => sync())
    } else if (r.status === 'drawing' && remaining.value === 0) {
      trigger(`${r.id}:end`, async () => {
        // Short grace so an upload that is already in flight is not raced by finalization.
        await new Promise((res) => setTimeout(res, 1500))
        await finishRound(r.id)
        await sync()
      })
    }
  }

  function applyRound(next: RoundState | null) {
    const prev = round.value
    if (!next) {
      round.value = null
      return
    }
    if (!prev || prev.id !== next.id) {
      hasSubmitted.value = next.has_submitted === true
      results.value = null
      resultsError.value = null
      resultsAttempt = null
    } else if (next.has_submitted) {
      hasSubmitted.value = true
    }
    // A later sync that omits the prompt must not wipe the reference image we already have for this round.
    const merged = prev && prev.id === next.id && !next.prompt && prev.prompt ? { ...next, prompt: prev.prompt } : next
    round.value = merged
    if (merged.status === 'results' || merged.status === 'completed') maybeLoadResults(merged.id)
  }

  async function sync() {
    const s = session.value
    if (!s || syncing) return
    syncing = true
    try {
      const data = await rpc('sync_round_state', authParams(s))
      const next = normalizeRoundState(data)
      if (next?.server_time) {
        const t = Date.parse(next.server_time)
        if (!Number.isNaN(t)) clockOffset.value = t - Date.now()
      }
      failures.value = 0
      applyRound(next)
    } catch (e) {
      const err = toApiError(e)
      // A room that has not started a round yet may answer with "no active round": that is not an outage.
      if (err.code === 'ROUND_NOT_ACTIVE') {
        failures.value = 0
        applyRound(null)
        return
      }
      failures.value++
      throw err
    } finally {
      syncing = false
    }
  }

  async function finishRound(roundId: string) {
    const s = session.value
    if (!s) return
    await rpc('finish_round', { ...authParams(s), p_round_id: roundId })
  }

  async function startGame() {
    const s = session.value
    if (!s) return
    const data = await rpc('start_game', authParams(s))
    // If start_game already returns the round with its prompt, show it right away.
    const started = normalizeRoundState(data)
    if (started?.prompt) applyRound(started)
    await sync()
  }

  /** Uploads through the upload-drawing Edge Function (which also registers the submission). */
  async function submitDrawing(blob: Blob): Promise<boolean> {
    const s = session.value
    const r = round.value
    if (!s || !r || submitting.value || hasSubmitted.value) return false
    submitting.value = true
    try {
      const form = new FormData()
      form.append('player_id', s.player_id)
      form.append('secret_token', s.secret_token)
      form.append('round_id', r.id)
      form.append('file', blob, 'drawing.png')
      await invoke('upload-drawing', form)
      hasSubmitted.value = true
      void sync().catch(() => {})
      return true
    } catch (e) {
      const err = toApiError(e)
      // Window closed: let the backend state decide what happens next.
      if (err.code === 'DRAWING_EXPIRED') void sync().catch(() => {})
      throw err
    } finally {
      submitting.value = false
    }
  }

  function maybeLoadResults(id: string) {
    const stale =
      !!results.value &&
      results.value.round_id === id &&
      Date.now() - resultsFetchedAt > Math.max(60, results.value.signed_url_expires_in - 300) * 1000
    if (resultsAttempt === id && !stale) return
    void loadResults(id, { silent: !!results.value })
  }

  /** get-drawing-url: reference + private drawings as signed URLs. */
  async function loadResults(id: string, opts: { silent?: boolean } = {}) {
    const s = session.value
    if (!s || resultsLoading.value) return
    resultsAttempt = id
    if (!opts.silent) resultsLoading.value = true
    resultsError.value = null
    try {
      const data = await invoke('get-drawing-url', {
        player_id: s.player_id,
        secret_token: s.secret_token,
        round_id: id
      })
      results.value = normalizeResults(data)
      resultsFetchedAt = Date.now()
    } catch (e) {
      resultsError.value = toApiError(e).message
    } finally {
      resultsLoading.value = false
    }
  }

  function retryResults() {
    const id = round.value?.id ?? results.value?.round_id
    if (!id) return
    resultsAttempt = null
    void loadResults(id)
  }

  /** Signed URL rejected (expired): fetch fresh ones, at most once per 15 seconds. */
  function refreshResultsUrls() {
    const id = results.value?.round_id
    if (!id || Date.now() - resultsFetchedAt < 15_000) return
    void loadResults(id, { silent: true })
  }

  async function pollLoop() {
    if (!running) return
    try {
      await sync()
    } catch {
      /* failures counter drives the connection banner */
    }
    if (!running) return
    const live = phase.value === 'countdown' || phase.value === 'drawing' || phase.value === 'ending'
    pollTimer = setTimeout(pollLoop, live ? POLL_ACTIVE_MS : POLL_IDLE_MS)
  }

  function startPolling() {
    if (running) return
    running = true
    tickTimer = setInterval(tick, 250)
    void pollLoop()
  }

  function stopPolling() {
    running = false
    if (tickTimer) clearInterval(tickTimer)
    if (pollTimer) clearTimeout(pollTimer)
    tickTimer = null
    pollTimer = null
  }

  function reset() {
    stopPolling()
    round.value = null
    results.value = null
    hasSubmitted.value = false
    boundaryHit.clear()
  }

  onBeforeUnmount(stopPolling)

  return {
    round,
    phase,
    countdownSeconds,
    remaining,
    totalSeconds,
    hasSubmitted,
    submitting,
    results,
    resultsLoading,
    resultsError,
    connectionLost,
    sync,
    startGame,
    submitDrawing,
    loadResults,
    retryResults,
    refreshResultsUrls,
    startPolling,
    stopPolling,
    reset
  }
}
