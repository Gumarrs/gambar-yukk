<script setup lang="ts">
import type { ApiError } from '~/utils/errors'

const route = useRoute()
const router = useRouter()
const codeParam = computed(() => normalizeRoomCode(String(route.params.code ?? '')))

const { session, load, validate, clear } = useGuestSession()
const room = useRoom()
const realtime = useRealtimeRoom()
const game = useGameRound()
const sound = useSound()

const { roomState } = room
const { status: rtStatus, onlineIds } = realtime
const {
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
  connectionLost
} = game

const booting = ref(true)
const fatal = ref<string | null>(null)
const error = ref<string | null>(null)
const busy = ref<'ready' | 'start' | 'submit' | null>(null)
const leaveOpen = ref(false)
const submittedIds = ref<Set<string>>(new Set())
const canvasRef = ref<{ toBlob: () => Promise<Blob>; hasContent: boolean } | null>(null)

const players = computed(() => roomState.value?.players ?? [])
const me = computed(() => players.value.find((p) => p.id === session.value?.player_id) ?? null)
// Master status always comes from the server state, never from local storage.
const isMaster = computed(() => me.value?.is_master === true)
const roomInfo = computed(() => roomState.value?.room ?? null)

async function run(kind: 'ready' | 'start' | 'submit', fn: () => Promise<void>) {
  busy.value = kind
  error.value = null
  try {
    await fn()
  } catch (e) {
    error.value = toApiError(e).message
  } finally {
    busy.value = null
  }
}

function handleFatal(msg: string) {
  fatal.value = msg
  game.reset()
  room.stopHeartbeat()
  void realtime.disconnect()
  clear()
}

const refreshRoom = async () => {
  try {
    const state = await room.refresh()
    if (state.room.status === 'closed') handleFatal('Room ini sudah ditutup.')
  } catch (e) {
    const err = toApiError(e)
    if (FATAL_SESSION_CODES.includes(err.code)) handleFatal(err.message)
  }
}
const refreshRoomSoon = debounce(refreshRoom, 300)
const syncSoon = debounce(() => void game.sync().catch(() => {}), 200)

function wireRealtime() {
  realtime.on('player_joined', refreshRoomSoon)
  realtime.on('player_left', refreshRoomSoon)
  realtime.on('player_ready_changed', refreshRoomSoon)
  for (const ev of ['game_started', 'round_state_changed', 'results_ready'] as const) {
    realtime.on(ev, () => {
      syncSoon()
      refreshRoomSoon()
    })
  }
  // Cosmetic only: authoritative submission state comes from the backend.
  realtime.on('drawing_submitted', (p) => {
    if (typeof p.player_id === 'string') submittedIds.value = new Set([...submittedIds.value, p.player_id])
    syncSoon()
  })
  realtime.onReconnect(() => {
    void refreshRoom()
    void game.sync().catch(() => {})
  })
}

async function boot() {
  booting.value = true
  fatal.value = null
  const s = load()
  if (!s || s.room_code !== codeParam.value) {
    await router.replace({ path: '/', query: { join: codeParam.value } })
    return
  }
  try {
    const check = await validate()
    if (check !== 'ok') {
      fatal.value =
        check === 'closed' ? 'Room ini sudah ditutup atau kedaluwarsa.' : 'Sesimu sudah tidak berlaku. Silakan gabung lagi.'
      booting.value = false
      return
    }
    await room.refresh()
    if (roomState.value?.room.status === 'closed') return handleFatal('Room ini sudah ditutup.')
    const cur = session.value!
    wireRealtime()
    await realtime.connect(cur.room_id, {
      player_id: cur.player_id,
      guest_name: cur.guest_name,
      avatar_key: cur.avatar_key
    })
    room.startHeartbeat((e: ApiError) => handleFatal(e.message))
    game.startPolling()
    realtime.send('player_joined', { player_id: cur.player_id })
  } catch (e) {
    const err = toApiError(e)
    fatal.value = err.message
    if (!FATAL_SESSION_CODES.includes(err.code)) {
      // Likely a network problem: keep the session so a reload can recover.
      error.value = null
    }
  } finally {
    booting.value = false
  }
}

onMounted(boot)

onBeforeUnmount(() => {
  refreshRoomSoon.cancel()
  syncSoon.cancel()
  room.stopHeartbeat()
  game.stopPolling()
  void realtime.disconnect()
})

// Presence changes mean someone joined or dropped: re-verify the player list.
watch(
  () => onlineIds.value.size,
  () => refreshRoomSoon()
)

// Room list is refreshed periodically while waiting, as a fallback to Broadcast.
let roomPoll: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  roomPoll = setInterval(() => {
    if (!booting.value && !fatal.value && (phase.value === 'idle' || phase.value === 'results')) void refreshRoom()
  }, 8000)
})
onBeforeUnmount(() => roomPoll && clearInterval(roomPoll))

watch(
  () => round.value?.id,
  () => {
    submittedIds.value = new Set()
  }
)

watch(phase, (p) => {
  if (p === 'results') {
    if (isMaster.value && round.value) realtime.send('results_ready', { round_id: round.value.id })
    void refreshRoom()
  }
})

// Auto-submit at the deadline. Players can keep drawing until the very last second; when time runs
// out the canvas locks and the snapshot is uploaded straight away, retrying a few times. The server
// accepts submissions for a short grace period after drawing_ends_at (backend/003_submission_grace.sql).
const autoStarted = new Set<string>()
const STOP_RETRY = ['DRAWING_EXPIRED', 'ROUND_NOT_ACTIVE', 'INVALID_SESSION', 'PLAYER_LEFT', 'ROOM_CLOSED']
async function autoSubmitAtDeadline(roundId: string) {
  if (autoStarted.has(roundId)) return
  autoStarted.add(roundId)
  if (!canvasRef.value?.hasContent) return // nothing drawn: counts as timeout
  for (let attempt = 0; attempt < 4; attempt++) {
    if (hasSubmitted.value || round.value?.id !== roundId || phase.value === 'results') return
    try {
      const blob = await canvasRef.value.toBlob()
      const ok = await game.submitDrawing(blob)
      if (ok && session.value) {
        submittedIds.value = new Set([...submittedIds.value, session.value.player_id])
        realtime.send('drawing_submitted', { player_id: session.value.player_id, round_id: roundId })
      }
      return
    } catch (e) {
      const err = toApiError(e)
      console.warn('[gambar-bareng] kirim otomatis gagal:', err.code, `(percobaan ${attempt + 1})`)
      if (STOP_RETRY.includes(err.code)) {
        error.value = err.message
        return
      }
      await new Promise((r) => setTimeout(r, 1200))
    }
  }
  error.value = 'Gambarmu belum berhasil terkirim otomatis. Cek koneksi internetmu.'
}
watch(phase, (p) => {
  if (p === 'ending' && round.value) void autoSubmitAtDeadline(round.value.id)
})

async function submit(silent = false) {
  const rd = round.value
  if (!rd || !canvasRef.value) return
  try {
    if (!silent) busy.value = 'submit'
    const blob = await canvasRef.value.toBlob()
    const ok = await game.submitDrawing(blob)
    if (ok && session.value) {
      submittedIds.value = new Set([...submittedIds.value, session.value.player_id])
      realtime.send('drawing_submitted', { player_id: session.value.player_id, round_id: rd.id })
    }
  } catch (e) {
    const err = toApiError(e)
    console.warn('[gambar-bareng] kirim gambar gagal:', err.code, silent ? '(otomatis)' : '(manual)')
    error.value = err.message
  } finally {
    if (!silent) busy.value = null
  }
}

const toggleReady = () =>
  run('ready', async () => {
    await room.setReady(!me.value?.is_ready)
    realtime.send('player_ready_changed', { player_id: session.value?.player_id })
    await refreshRoom()
  })

const startGame = () =>
  run('start', async () => {
    await game.startGame()
    realtime.send('game_started', {})
    realtime.send('round_state_changed', {})
    await refreshRoom()
  })

// ---- Game settings (master, before the game starts) ----
const DURATIONS = [30, 60, 90, 120, 180]
const ROUND_OPTIONS = [1, 2, 3, 5, 7, 10]
const savingSettings = ref(false)

async function saveSettings(patch: { duration?: number; rounds?: number }) {
  const duration = patch.duration ?? roomInfo.value?.round_duration_seconds ?? 90
  const rounds = patch.rounds ?? roomInfo.value?.total_rounds ?? 3
  savingSettings.value = true
  error.value = null
  try {
    await room.updateSettings(duration, rounds)
    realtime.send('round_state_changed', {})
    await refreshRoom()
  } catch (e) {
    error.value = toApiError(e).message
  } finally {
    savingSettings.value = false
  }
}

// ---- Round label and end of game ----
const totalRounds = computed(() => roomInfo.value?.total_rounds ?? null)
const roundLabel = computed(() => {
  const n = roomInfo.value?.round_in_game ?? round.value?.round_number ?? 0
  return totalRounds.value ? `Ronde ${n} / ${totalRounds.value}` : `Ronde ${n}`
})
const gameOver = computed(() => {
  const played = roomInfo.value?.round_in_game
  return phase.value === 'results' && !!totalRounds.value && played != null && played >= totalRounds.value
})

// ---- Sounds ----
watch(countdownSeconds, (s) => {
  if (phase.value === 'countdown' && s > 0) sound.count()
})
watch(remaining, (s) => {
  if (phase.value !== 'drawing' || s <= 0 || s > 5) return
  if (s === 1) sound.lastTick()
  else sound.tick()
})
watch(phase, (p, prev) => {
  if (p === 'drawing' && prev !== 'drawing') {
    sound.go()
    sound.startMusic()
  } else if (p === 'ending') {
    sound.stopMusic()
    sound.timeUp()
  } else if (p === 'results') {
    sound.stopMusic()
    if (prev !== 'results') sound.fanfare()
  } else if (p === 'idle' || p === 'countdown') {
    sound.stopMusic()
  }
})
onBeforeUnmount(() => sound.stopMusic())

async function leaveRoom() {
  leaveOpen.value = false
  realtime.send('player_left', { player_id: session.value?.player_id })
  game.reset()
  await realtime.disconnect()
  await room.leave()
  await router.push('/')
}

async function backHome() {
  clear()
  await router.push('/')
}
</script>

<template>
  <LoadingState v-if="booting" label="Menyiapkan room…" />

  <main v-else-if="fatal" class="grid min-h-screen place-items-center p-6">
    <div class="sticker max-w-md animate-pop p-8 text-center">
      <p class="text-6xl" aria-hidden="true">🫥</p>
      <h1 class="my-3 text-3xl font-bold">Ups!</h1>
      <p class="mb-6 text-lg font-bold">{{ fatal }}</p>
      <div class="flex flex-wrap justify-center gap-3">
        <AppButton variant="secondary" @click="boot">Coba lagi</AppButton>
        <AppButton @click="backHome">Ke beranda</AppButton>
      </div>
    </div>
  </main>

  <div v-else class="min-h-screen">
    <header class="sticky top-0 z-30 border-b-[3px] border-ink bg-cream/90 backdrop-blur">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <h1 class="font-display text-2xl font-bold">
          <span class="text-coral">Gambar</span> <span class="text-sky">Bareng</span>
        </h1>
        <span class="rounded-full border-[3px] border-ink bg-white px-3 py-1 font-display font-bold tracking-widest">
          {{ codeParam }}
        </span>
        <div class="ml-auto flex items-center gap-2">
          <SoundToggle />
          <ConnectionBadge :status="rtStatus" :degraded="connectionLost" />
        </div>
        <AppButton variant="ghost" class="!px-3 !py-1 !text-base" @click="leaveOpen = true">Keluar</AppButton>
      </div>
    </header>

    <main class="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <ErrorBanner :message="error" @dismiss="error = null" />
      <p
        v-if="connectionLost"
        class="rounded-2xl border-[3px] border-ink bg-sun px-4 py-2 text-center font-bold"
        role="status"
      >
        Koneksi terputus. Kami coba sambungkan lagi otomatis…
      </p>

      <!-- Waiting room -->
      <section v-if="phase === 'idle'" class="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div class="space-y-5">
          <RoomCode :code="codeParam" />
          <div class="sticker space-y-4 p-4">
            <h3 class="text-xl font-bold">⚙️ Pengaturan game</h3>

            <div>
              <p class="mb-2 font-extrabold">⏱ Waktu menggambar</p>
              <div v-if="isMaster" class="flex flex-wrap gap-2">
                <button
                  v-for="d in DURATIONS"
                  :key="d"
                  type="button"
                  class="btn btn-secondary !px-3 !py-1.5 !text-base"
                  :class="roomInfo?.round_duration_seconds === d ? '!bg-sun' : ''"
                  :disabled="savingSettings"
                  @click="saveSettings({ duration: d })"
                >
                  {{ d }} dtk
                </button>
              </div>
              <p v-else class="font-bold">{{ roomInfo?.round_duration_seconds ?? 90 }} detik</p>
            </div>

            <div v-if="isMaster || roomInfo?.total_rounds">
              <p class="mb-2 font-extrabold">🔁 Jumlah ronde</p>
              <div v-if="isMaster" class="flex flex-wrap gap-2">
                <button
                  v-for="n in ROUND_OPTIONS"
                  :key="n"
                  type="button"
                  class="btn btn-secondary !px-3 !py-1.5 !text-base"
                  :class="roomInfo?.total_rounds === n ? '!bg-sun' : ''"
                  :disabled="savingSettings"
                  @click="saveSettings({ rounds: n })"
                >
                  {{ n }}
                </button>
              </div>
              <p v-else class="font-bold">{{ roomInfo?.total_rounds }} ronde</p>
            </div>

            <p class="font-extrabold">👥 Pemain: {{ players.length }} / {{ roomInfo?.max_players ?? 4 }}</p>
          </div>
        </div>

        <div class="space-y-5">
          <h2 class="text-3xl font-bold">Ruang tunggu</h2>
          <PlayerList
            :players="players"
            :me-id="session?.player_id ?? ''"
            :max-players="roomInfo?.max_players ?? 4"
            :online-ids="onlineIds"
            :realtime-status="rtStatus"
          />
          <div class="flex flex-wrap gap-3">
            <AppButton variant="secondary" :loading="busy === 'ready'" @click="toggleReady">
              {{ me?.is_ready ? '↩️ Belum siap' : '✅ Aku siap!' }}
            </AppButton>
            <AppButton v-if="isMaster" :loading="busy === 'start'" class="!px-8" @click="startGame">🚀 Mulai game</AppButton>
          </div>
          <p v-if="!isMaster" class="font-bold text-ink/60">Menunggu pembuat room memulai game…</p>
          <p v-else class="font-bold text-ink/60">Kamu bisa mulai kapan saja, tanpa menunggu semua siap.</p>
        </div>
      </section>

      <!-- Countdown -->
      <section v-else-if="phase === 'countdown'" class="grid items-center gap-6 md:grid-cols-2">
        <CountdownOverlay :seconds="countdownSeconds" />
        <div class="mx-auto w-full max-w-sm">
          <ReferenceImage :prompt="round?.prompt ?? null" />
        </div>
      </section>

      <!-- Drawing -->
      <section v-else-if="phase === 'drawing' || phase === 'ending'" class="space-y-4">
        <div class="flex flex-wrap items-center gap-4">
          <p class="font-display text-xl font-semibold">{{ roundLabel }}</p>
          <GameTimer :seconds="remaining" :total="totalSeconds" class="ml-auto" />
        </div>
        <div class="grid gap-5 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div class="lg:sticky lg:top-24 lg:self-start">
            <ReferenceImage :prompt="round?.prompt ?? null" />
            <div v-if="submittedIds.size" class="mt-3 flex items-center gap-2 text-sm font-extrabold">
              Sudah kirim:
              <AvatarBubble
                v-for="p in players.filter((x) => submittedIds.has(x.id))"
                :key="p.id"
                :avatar-key="p.avatar_key"
                :size="28"
              />
            </div>
          </div>
          <div class="space-y-3">
            <DrawingCanvas ref="canvasRef" :disabled="hasSubmitted || phase === 'ending'">
              <template #overlay>
                <div
                  v-if="hasSubmitted || phase === 'ending'"
                  class="absolute inset-0 grid place-items-center bg-white/70 p-4 text-center"
                >
                  <div class="sticker animate-pop p-6">
                    <p class="text-5xl" aria-hidden="true">{{ hasSubmitted ? '✅' : '⏰' }}</p>
                    <p class="mt-2 font-display text-2xl font-bold">
                      {{ hasSubmitted ? 'Gambarmu terkirim!' : 'Waktu habis!' }}
                    </p>
                    <p class="font-bold text-ink/70">Menunggu hasil semua pemain…</p>
                  </div>
                </div>
              </template>
            </DrawingCanvas>
            <div class="flex justify-end">
              <AppButton
                :loading="busy === 'submit' || submitting"
                :disabled="hasSubmitted || phase === 'ending'"
                class="!px-8"
                @click="submit(false)"
              >
                📤 Selesai &amp; kirim
              </AppButton>
            </div>
          </div>
        </div>
      </section>

      <!-- Results -->
      <section v-else-if="phase === 'results'">
        <LoadingState v-if="resultsLoading && !results" label="Mengambil gambar-gambar…" :fullscreen="false" />
        <div v-else-if="resultsError && !results" class="sticker mx-auto max-w-md p-6 text-center">
          <p class="mb-4 text-lg font-bold">{{ resultsError }}</p>
          <AppButton @click="game.retryResults()">Coba lagi</AppButton>
        </div>
        <ResultsGallery
          v-else-if="results"
          :results="results"
          :me-id="session?.player_id ?? ''"
          :can-start-next="isMaster"
          :game-over="gameOver"
          :round-label="roundLabel"
          :starting="busy === 'start'"
          waiting-text="Menunggu pembuat room memulai ronde berikutnya…"
          @next="startGame"
          @refresh-urls="game.refreshResultsUrls()"
        />
        <LoadingState v-else label="Menyiapkan hasil…" :fullscreen="false" />
      </section>
    </main>

    <AppModal :open="leaveOpen" title="Keluar dari room?" @close="leaveOpen = false">
      <p class="font-bold">Kamu akan meninggalkan room {{ codeParam }}. Kamu bisa gabung lagi dengan kode yang sama selama room masih ada.</p>
      <template #footer>
        <AppButton variant="secondary" @click="leaveOpen = false">Batal</AppButton>
        <AppButton variant="danger" @click="leaveRoom">Keluar</AppButton>
      </template>
    </AppModal>
  </div>
</template>
