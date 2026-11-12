# Gambar Bareng (frontend)

Nuxt 3 + TypeScript + Tailwind frontend for the existing Supabase backend (RPC + Edge Functions + Realtime).
It never touches tables directly, never uses the service role key, and loads private drawings only via signed URLs.

## Run locally

```bash
npm install
cp .env.example .env     # fill NUXT_PUBLIC_SUPABASE_URL and NUXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

## Deploy to Vercel

Import the repo, set the two `NUXT_PUBLIC_*` variables, deploy. Nitro auto-detects Vercel. The app runs as an SPA (`ssr: false`).

## Structure

```
composables/  useSupabase, useBackend (rpc/invoke), useGuestSession, useRoom,
              useRealtimeRoom, useGameRound, useDrawingCanvas
utils/        errors (Indonesian messages), normalize (response shapes), game-timer, drawing-export, ...
components/   game/* and ui/*
pages/        index, room/[code] (waiting, countdown, drawing, results), results/[roundId]
```

## Verify against the real backend (important)

This build was written against the contract only and has **not been run against the live backend**.
The contract gives exact shapes for `validate_guest_session`, `get_round_results` and `get-drawing-url`.
For `create_room`, `join_room`, `get_room_state` and `sync_round_state` it only lists fields, so
`utils/normalize.ts` accepts flat or nested variants (and one-row arrays). If a response differs, adjust
that one file; on a mismatch the app shows a generic message and logs the response **key names only** (never values).

Things to check on first run:

1. `create_room` / `join_room` return `player_id`, `secret_token`, `room_id`, `room_code` (flat or under `player` / `room`).
2. `get_room_state` returns the room (`id`, `code`/`room_code`, `status`, ...) and a `players` array with `id`, `name`/`guest_name`, `avatar_key`, `is_ready`, and ideally `is_master` / `is_online`.
3. `sync_round_state` returns the round (`id`/`round_id`, `status`, the three timestamps, `prompt`). If it also returns a server time (`server_time` or `now`), clock drift is corrected automatically.
4. With no round yet, `sync_round_state` either returns nothing or an error that mentions "no active round"; both are treated as "idle".

## Behaviour notes

- Session lives in `sessionStorage` (`gambar_bareng_session`), is re-validated on load, and `is_master` always comes from the server.
- Polling: `sync_round_state` every 2.5s during countdown/drawing, 5s otherwise; heartbeat every 20s.
- If the player has drawn something, the drawing is auto-submitted once when 2 seconds remain. Players who never submit show as timed out.
- Broadcast is only a nudge to re-fetch; presence drives the online dots.
