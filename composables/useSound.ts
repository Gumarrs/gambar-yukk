import { ref } from 'vue'

/**
 * Sound effects and background music, all synthesised with the Web Audio API (no audio files,
 * no licensing concerns). Browsers only allow audio after a user gesture, so the context is
 * resumed on the first click/tap/key press; effects are skipped while it is still locked.
 */
const MUTE_KEY = 'gambar_bareng_muted'
const muted = ref(false)

let ctx: AudioContext | null = null
let master: GainNode | null = null
let musicGain: GainNode | null = null
let musicTimer: ReturnType<typeof setInterval> | null = null
let nextNoteTime = 0
let step = 0
let initialized = false

// Chord tones in semitones above C4: C, F, Am, G. Each chord lasts 4 steps.
const CHORDS = [
  [0, 4, 7],
  [5, 9, 12],
  [9, 12, 16],
  [7, 11, 14]
]
const ARP = [0, 1, 2, 1]
const STEP_SEC = 0.27
const MUSIC_LEVEL = 0.16

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

function ensure(): AudioContext | null {
  if (!import.meta.client) return null
  if (ctx) return ctx
  const Ctor = window.AudioContext || (window as any).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor() as AudioContext
  master = ctx.createGain()
  master.gain.value = muted.value ? 0 : 1
  master.connect(ctx.destination)
  musicGain = ctx.createGain()
  musicGain.gain.value = 0
  musicGain.connect(master)
  return ctx
}

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const

function unlock() {
  const c = ensure()
  if (!c) return
  if (c.state === 'suspended') void c.resume()
  for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, unlock)
}

function init() {
  if (initialized || !import.meta.client) return
  initialized = true
  muted.value = readMuted()
  for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, unlock)
}

function tone(
  freq: number,
  start: number,
  dur: number,
  o: { type?: OscillatorType; vol?: number; dest?: AudioNode } = {}
) {
  const c = ctx
  if (!c || !master) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, start)
  const vol = o.vol ?? 0.25
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(vol, start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(g)
  g.connect(o.dest ?? master)
  osc.start(start)
  osc.stop(start + dur + 0.05)
}

/** Runs a sound effect only when audio is actually unlocked and running. */
function fx(fn: (t: number) => void) {
  const c = ensure()
  if (!c || c.state !== 'running') return
  fn(c.currentTime)
}

function scheduleStep(time: number, s: number) {
  if (!musicGain) return
  const chord = CHORDS[Math.floor(s / 4) % CHORDS.length]
  const i = s % 4
  tone(mtof(60 + chord[ARP[i]] + 12), time, STEP_SEC * 0.9, { type: 'triangle', vol: 0.5, dest: musicGain })
  if (i === 0 || i === 2) {
    tone(mtof(60 + chord[0] - 24), time, STEP_SEC * 1.8, { type: 'sine', vol: 0.8, dest: musicGain })
  }
}

export function useSound() {
  init()

  function startMusic() {
    const c = ensure()
    if (!c || !musicGain || musicTimer) return
    musicGain.gain.cancelScheduledValues(c.currentTime)
    musicGain.gain.setTargetAtTime(MUSIC_LEVEL, c.currentTime, 0.2)
    nextNoteTime = c.currentTime + 0.1
    step = 0
    musicTimer = setInterval(() => {
      if (!ctx || ctx.state !== 'running') return
      while (nextNoteTime < ctx.currentTime + 0.35) {
        scheduleStep(nextNoteTime, step)
        nextNoteTime += STEP_SEC
        step++
      }
    }, 100)
  }

  function stopMusic() {
    if (musicTimer) clearInterval(musicTimer)
    musicTimer = null
    if (ctx && musicGain) {
      musicGain.gain.cancelScheduledValues(ctx.currentTime)
      musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1)
    }
  }

  function toggleMute() {
    muted.value = !muted.value
    try {
      localStorage.setItem(MUTE_KEY, muted.value ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (ctx && master) master.gain.setTargetAtTime(muted.value ? 0 : 1, ctx.currentTime, 0.05)
  }

  return {
    muted,
    toggleMute,
    startMusic,
    stopMusic,
    /** 3-2-1 countdown before the round. */
    count: () => fx((t) => tone(660, t, 0.14, { vol: 0.3 })),
    /** Last 5 seconds: 5, 4, 3, 2 ... */
    tick: () => fx((t) => tone(880, t, 0.12, { type: 'triangle', vol: 0.3 })),
    /** The "1" right before time is up. */
    lastTick: () => fx((t) => tone(1100, t, 0.18, { type: 'triangle', vol: 0.34 })),
    /** Round starts. */
    go: () => fx((t) => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.18, { type: 'triangle', vol: 0.28 }))),
    /** The long "teeet" when time is up. */
    timeUp: () => fx((t) => tone(1000, t, 1.0, { type: 'square', vol: 0.16 })),
    /** Results are ready. */
    fanfare: () =>
      fx((t) => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, t + i * 0.12, 0.25, { type: 'triangle', vol: 0.28 })))
  }
}
