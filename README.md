# Gambar Bareng (frontend)

Nuxt 3 + TypeScript + Tailwind frontend for the existing Supabase backend (RPC + Edge Functions + Realtime).
It never touches tables directly, never uses the service role key, and loads private drawings only via signed URLs.

## Run locally

```bash
npm install
cp .env.example .env     # fill NUXT_PUBLIC_SUPABASE_URL and NUXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```
