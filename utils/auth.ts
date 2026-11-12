import type { GuestSession } from '~/types/session'

/** Standard credential parameters shared by every guest-authenticated RPC. */
export const authParams = (s: GuestSession) => ({
  p_player_id: s.player_id,
  p_secret_token: s.secret_token
})
