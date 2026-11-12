/**
 * Response normalizers.
 *
 * The contract only documents exact response shapes for validate_guest_session,
 * get_round_results and get-drawing-url. For create_room, join_room, get_room_state and
 * sync_round_state the contract lists "expected output includes ..." without a schema, so these
 * normalizers accept the plausible variants (flat vs nested, single object vs one-row array).
 *
 * If an actual response differs, only this file needs adjusting. When a required field is missing
 * we throw RESPONSE_SHAPE and log the KEY NAMES ONLY (never values, so tokens are never logged).
 */
import type {
  PromptInfo,
  ResultDrawing,
  RoomPlayer,
  RoomState,
  RoomStatus,
  RoundResults,
  RoundState,
  RoundStatus
} from '~/types/game'
import type { GuestSession } from '~/types/session'
import { ApiError } from './errors'

type Raw = Record<string, any>

const isObj = (v: unknown): v is Raw => v !== null && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function firstRow(data: unknown): Raw | null {
  const v = Array.isArray(data) ? data[0] : data
  return isObj(v) ? v : null
}

function shapeError(raw: Raw | null, what: string): ApiError {
  console.warn(`[gambar-bareng] Unexpected ${what} response. Keys:`, raw ? Object.keys(raw) : 'none')
  return new ApiError('RESPONSE_SHAPE', 'Respons dari server tidak sesuai harapan. Hubungi pembuat game ya.')
}

export function normalizeSessionPayload(
  data: unknown,
  fallback: { name: string; avatar: string }
): GuestSession {
  const raw = firstRow(data)
  if (!raw) throw shapeError(null, 'session')
  const player: Raw = isObj(raw.player) ? raw.player : raw
  const room: Raw = isObj(raw.room) ? raw.room : raw

  const player_id = str(raw.player_id) ?? str(player.id) ?? str(player.player_id)
  const secret_token = str(raw.secret_token) ?? str(player.secret_token) ?? str(raw.guest_secret_token)
  const room_id = str(raw.room_id) ?? str(room.id) ?? str(room.room_id)
  const room_code = str(raw.room_code) ?? str(room.code) ?? str(room.room_code)

  if (!player_id || !secret_token || !room_id || !room_code) throw shapeError(raw, 'session')

  return {
    player_id,
    secret_token,
    room_id,
    room_code: room_code.toUpperCase(),
    guest_name: str(player.guest_name) ?? str(player.name) ?? str(raw.guest_name) ?? fallback.name,
    avatar_key: str(player.avatar_key) ?? str(raw.avatar_key) ?? fallback.avatar,
    is_master: raw.is_master === true || player.is_master === true
  }
}

function normalizePlayer(p: Raw, masterId: string | null): RoomPlayer | null {
  const id = str(p.id) ?? str(p.player_id)
  if (!id) return null
  const online = p.is_online ?? p.online
  return {
    id,
    name: str(p.name) ?? str(p.guest_name) ?? 'Pemain',
    avatar_key: str(p.avatar_key) ?? '',
    is_ready: p.is_ready === true,
    is_master: typeof p.is_master === 'boolean' ? p.is_master : id === masterId,
    is_online: typeof online === 'boolean' ? online : null
  }
}

export function normalizeRoomState(data: unknown): RoomState {
  const raw = firstRow(data)
  if (!raw) throw shapeError(null, 'room state')
  const roomRaw: Raw = isObj(raw.room) ? raw.room : raw
  const id = str(roomRaw.id) ?? str(roomRaw.room_id)
  const code = str(roomRaw.code) ?? str(roomRaw.room_code)
  if (!id || !code) throw shapeError(raw, 'room state')

  const masterId = str(roomRaw.master_player_id)
  const list: unknown[] = Array.isArray(raw.players)
    ? raw.players
    : Array.isArray(raw.player_list)
      ? raw.player_list
      : Array.isArray(roomRaw.players)
        ? roomRaw.players
        : []
  const players = list
    .map((p) => (isObj(p) ? normalizePlayer(p, masterId) : null))
    .filter((p): p is RoomPlayer => p !== null)

  return {
    room: {
      id,
      code: code.toUpperCase(),
      status: (str(roomRaw.status) ?? 'waiting') as RoomStatus,
      master_player_id: masterId ?? players.find((p) => p.is_master)?.id ?? null,
      max_players: num(roomRaw.max_players, 4),
      round_duration_seconds: num(roomRaw.round_duration_seconds, 90),
      current_round_number: num(roomRaw.current_round_number, 0)
    },
    players
  }
}

function normalizePrompt(p: unknown): PromptInfo | null {
  if (!isObj(p)) return null
  const id = str(p.id) ?? str(p.prompt_id) ?? ''
  const image_url = str(p.image_url) ?? str(p.thumbnail_url) ?? ''
  const title = str(p.title) ?? ''
  if (!id && !image_url && !title) return null
  return {
    id,
    title: title || 'Gambar',
    category: str(p.category) ?? '',
    image_url,
    difficulty: str(p.difficulty)
  }
}

/** Some RPCs return prompt fields flat on the round (prompt_id, prompt_title, prompt_image_url ...). */
function flatPrompt(r: Raw): PromptInfo | null {
  return normalizePrompt({
    id: r.prompt_id,
    title: r.prompt_title ?? r.title,
    category: r.prompt_category ?? r.category,
    image_url: r.prompt_image_url ?? r.image_url ?? r.reference_image_url,
    thumbnail_url: r.prompt_thumbnail_url ?? r.thumbnail_url,
    difficulty: r.prompt_difficulty ?? r.difficulty
  })
}

let warnedNoPrompt = false

/** Returns null when the room has no round yet. */
export function normalizeRoundState(data: unknown): RoundState | null {
  const raw = firstRow(data)
  if (!raw) return null
  const r: Raw = isObj(raw.round) ? raw.round : isObj(raw.current_round) ? raw.current_round : raw
  const id = str(r.id) ?? str(r.round_id)
  if (!id) return null
  const prompt =
    normalizePrompt(r.prompt ?? raw.prompt ?? r.drawing_prompt ?? raw.drawing_prompt) ?? flatPrompt(r) ?? flatPrompt(raw)
  const status = (str(r.status) ?? 'countdown') as RoundStatus
  if (!prompt && (status === 'countdown' || status === 'drawing') && !warnedNoPrompt) {
    warnedNoPrompt = true
    // Key names only, never values.
    console.warn('[gambar-bareng] sync_round_state tanpa prompt. Keys:', Object.keys(raw), 'round keys:', Object.keys(r))
  }
  return {
    id,
    round_number: num(r.round_number, 1),
    status,
    prompt,
    countdown_started_at: str(r.countdown_started_at),
    drawing_started_at: str(r.drawing_started_at),
    drawing_ends_at: str(r.drawing_ends_at),
    server_time: str(raw.server_time) ?? str(raw.now) ?? str(r.server_time),
    has_submitted:
      typeof (raw.has_submitted ?? r.has_submitted) === 'boolean' ? (raw.has_submitted ?? r.has_submitted) : null
  }
}

/** Used for the documented get-drawing-url response. */
export function normalizeResults(data: unknown): RoundResults {
  const raw = firstRow(data)
  const round_id = raw ? str(raw.round_id) : null
  if (!raw || !round_id) throw shapeError(raw, 'results')
  const drawings: ResultDrawing[] = (Array.isArray(raw.drawings) ? raw.drawings : [])
    .filter(isObj)
    .map((d: Raw) => ({
      player_id: str(d.player_id) ?? '',
      player_name: str(d.player_name) ?? 'Pemain',
      avatar_key: str(d.avatar_key) ?? '',
      status: d.status === 'timeout' ? 'timeout' : 'submitted',
      submitted_at: str(d.submitted_at),
      drawing_url: str(d.drawing_url)
    }))
  return {
    round_id,
    round_number: num(raw.round_number, 1),
    status: (str(raw.status) ?? 'results') as RoundStatus,
    prompt: normalizePrompt(raw.prompt),
    drawings,
    signed_url_expires_in: num(raw.signed_url_expires_in, 3600)
  }
}
