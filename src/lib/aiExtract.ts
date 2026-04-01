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
}

export async function aiExtract(text: string, filename?: string) {
  try {
    const res = await fetch('/ai-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, filename }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as unknown
    const payload = data as { success?: boolean; data?: AiExtractResult }
    if (!payload?.success) return null
    return payload.data || null
  } catch {
    return null
  }
}

