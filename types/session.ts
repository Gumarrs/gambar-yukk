export interface GuestSession {
  player_id: string
  secret_token: string
  room_id: string
  room_code: string
  guest_name: string
  avatar_key: string
  is_master: boolean
}
