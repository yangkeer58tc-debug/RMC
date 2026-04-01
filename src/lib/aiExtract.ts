export type AiExtractResult = {
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  country?: string | null
  city?: string | null
  email?: string | null
  whatsapp?: string | null
  phone?: string | null
  work_years?: number | null
  education?: unknown[] | null
  intro_summary_original?: string | null
  intro_language?: string | null
  profile_summary?: string | null
  profile_summary_language?: string | null
  job_direction?: string | null
}

export type AiExtractMeta = {
  model?: string
  base_url?: string
  input_chars?: number
}

export type AiExtractResponse =
  | { ok: true; data: AiExtractResult; meta?: AiExtractMeta }
  | { ok: false; error: string; meta?: AiExtractMeta }

export async function aiExtract(text: string, filename?: string): Promise<AiExtractResponse> {
  try {
    const res = await fetch('/ai-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, filename }),
    })
    const data = (await res.json().catch(() => null)) as unknown
    const payload = data as { success?: boolean; data?: AiExtractResult; error?: string; meta?: AiExtractMeta }
    if (!res.ok || !payload?.success) {
      return { ok: false, error: payload?.error || `AI request failed: ${res.status}`, meta: payload?.meta }
    }
    return { ok: true, data: payload.data || {}, meta: payload.meta }
  } catch {
    return { ok: false, error: 'AI request failed', meta: undefined }
  }
}
