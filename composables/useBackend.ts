import { toApiError } from '~/utils/errors'

/** Throws when the backend reports a logical failure inside a 200 response ({ success: false }). */
function assertSuccess(data: unknown) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>
    if (d.success === false) {
      throw toApiError(String(d.error ?? d.message ?? d.code ?? ''))
    }
  }
}

/** Thin wrappers around supabase.rpc and Edge Function calls with safe, translated errors. */
export function useBackend() {
  const supabase = useSupabase()

  async function rpc<T = any>(fn: string, params: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(fn, params)
    if (error) {
      // Diagnostics: function name + server error only. Params (which contain the token) are never logged.
      console.warn(`[gambar-bareng] rpc ${fn} gagal:`, error.code, error.message, error.hint ?? '')
      throw toApiError(error)
    }
    assertSuccess(data)
    return data as T
  }

  async function invoke<T = any>(fn: string, body: FormData | Record<string, unknown>): Promise<T> {
    // Do not set Content-Type manually: for FormData the browser adds the multipart boundary.
    const { data, error } = await supabase.functions.invoke(fn, { body })
    if (error) {
      console.warn(`[gambar-bareng] function ${fn} gagal:`, error.message)
      let text = error.message
      try {
        const ctx = (error as any).context
        if (ctx && typeof ctx.json === 'function') {
          const j = await ctx.json()
          text = String(j?.error ?? j?.message ?? j?.code ?? text)
        }
      } catch {
        /* keep original message */
      }
      throw toApiError(text)
    }
    assertSuccess(data)
    return data as T
  }

  return { rpc, invoke }
}
