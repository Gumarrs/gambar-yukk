export type RoomStatus = 'waiting' | 'countdown' | 'drawing' | 'results' | 'closed'
export type RoundStatus = 'countdown' | 'drawing' | 'results' | 'completed'
export type DrawingStatus = 'submitted' | 'timeout'

export interface RoomPlayer {
  id: string
  name: string
  avatar_key: string
  is_ready: boolean
  is_master: boolean
  /** Backend-computed online flag (from heartbeat). null when the RPC does not provide one. */
  is_online: boolean | null
}

export interface RoomInfo {
  id: string
  code: string
  status: RoomStatus
  master_player_id: string | null
  max_players: number
  round_duration_seconds: number
  current_round_number: number
  /** Rounds per game. null until get_room_state exposes it. */
  total_rounds: number | null
  /** Which round of the current game is running (1-based). null until get_room_state exposes it. */
  round_in_game: number | null
}

export interface RoomState {
  room: RoomInfo
  players: RoomPlayer[]
}

export interface PromptInfo {
  id: string
  title: string
  category: string
  image_url: string
  difficulty: string | null
}

export interface RoundState {
  id: string
  round_number: number
  status: RoundStatus
  prompt: PromptInfo | null
  countdown_started_at: string | null
  drawing_started_at: string | null
  drawing_ends_at: string | null
  /** Optional server clock reading, used to correct client clock drift when present. */
  server_time: string | null
  has_submitted: boolean | null
}

export interface ResultDrawing {
  player_id: string
  player_name: string
  avatar_key: string
  status: DrawingStatus
  submitted_at: string | null
  drawing_url: string | null
}

export interface RoundResults {
  round_id: string
  round_number: number
  status: RoundStatus
  prompt: PromptInfo | null
  drawings: ResultDrawing[]
  signed_url_expires_in: number
}
