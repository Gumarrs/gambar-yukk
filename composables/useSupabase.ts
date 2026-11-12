import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/** Single shared Supabase client. Only the public URL + anon/publishable key are ever used here. */
export function useSupabase(): SupabaseClient {
  if (client) return client
  const { public: cfg } = useRuntimeConfig()
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new Error('Supabase belum dikonfigurasi. Isi NUXT_PUBLIC_SUPABASE_URL dan NUXT_PUBLIC_SUPABASE_ANON_KEY di .env')
  }
  client = createClient(cfg.supabaseUrl as string, cfg.supabaseAnonKey as string, {
    // Guests have no Supabase Auth user; identity is the player_id + secret token.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 10 } }
  })
  return client
}
