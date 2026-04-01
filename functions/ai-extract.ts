import { z } from 'zod'

const EducationItemSchema = z
  .object({
    school: z.string().trim().min(1).max(200).optional().nullable(),
    degree: z.string().trim().min(1).max(200).optional().nullable(),
    major: z.string().trim().min(1).max(200).optional().nullable(),
    startDate: z.string().trim().min(1).max(50).optional().nullable(),
    endDate: z.string().trim().min(1).max(50).optional().nullable(),
    raw: z.string().trim().min(1).max(500).optional().nullable(),
  })
  .strict()

const ExtractResultSchema = z
  .object({
    full_name: z.string().trim().min(1).max(120).optional().nullable(),
    first_name: z.string().trim().min(1).max(80).optional().nullable(),
    last_name: z.string().trim().min(1).max(80).optional().nullable(),
    country: z.string().trim().min(1).max(80).optional().nullable(),
    city: z.string().trim().min(1).max(80).optional().nullable(),
    email: z.string().trim().min(1).max(200).optional().nullable(),
    whatsapp: z.string().trim().min(1).max(80).optional().nullable(),
    phone: z.string().trim().min(1).max(80).optional().nullable(),
    work_years: z.number().int().min(0).max(60).optional().nullable(),
    education: z.array(EducationItemSchema).max(12).optional().nullable(),
    intro_summary_original: z.string().trim().min(1).max(900).optional().nullable(),
    intro_language: z.string().trim().min(2).max(12).optional().nullable(),
  })
  .strict()

const BodySchema = z
  .object({
    text: z.string().min(1).max(30000),
    filename: z.string().max(260).optional(),
  })
  .strict()

function json(data: unknown, init?: { status?: number }) {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function pickJsonObject(s: string) {
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return s.slice(start, end + 1)
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}

export async function onRequestPost(context: { request: Request; env: Record<string, string | undefined> }) {
  const { request, env } = context

  const apiKey = env.LLM_API_KEY
  const baseUrl = env.LLM_BASE_URL
  const model = env.LLM_MODEL || 'gpt-4o-mini'

  if (!apiKey || !baseUrl) {
    return json(
      {
        success: false,
        error: 'Missing LLM_API_KEY or LLM_BASE_URL',
        meta: { model, base_url: baseUrl || null },
      },
      { status: 501 },
    )
  }

  let bodyRaw: unknown
  try {
    bodyRaw = await request.json()
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(bodyRaw)
  if (!parsed.success) {
    return json({ success: false, error: 'Invalid request body' }, { status: 400 })
  }

  const { text, filename } = parsed.data

  const system =
    'You are a resume parsing engine. Extract only information explicitly supported by the resume text. Do not guess. Output ONLY valid JSON, no markdown.'
  const user =
    `Resume filename: ${filename || ''}\n` +
    `Resume text:\n${text}\n\n` +
    'Return JSON with keys: full_name, first_name, last_name, country, city, email, whatsapp, phone, work_years, education, intro_summary_original, intro_language. Use null when unknown.\n' +
    '- full_name should be the display name.\n' +
    '- first_name/last_name should be split if possible.\n' +
    '- country should be a country name (e.g., United Arab Emirates) or ISO-2 if clearly present; do not guess.\n' +
    '- city should be the city part of location if present; do not guess.\n' +
    '- work_years MUST be derived from explicit date ranges in the text; use current year for Present; if ranges are missing, return null.\n' +
    '- For OCR text, prioritize lines near headings like NAME/CONTACT/LOCATION/ABOUT/EXPERIENCE.\n' +
    '- intro_summary_original must keep the resume original language.'

  const url = baseUrl.replace(/\/$/, '') + '/v1/chat/completions'

  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!upstream.ok) {
    const msg = await upstream.text().catch(() => '')
    return json({ success: false, error: `LLM request failed: ${upstream.status} ${msg}` }, { status: 502 })
  }

  const data = (await upstream.json().catch(() => null)) as any
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    return json({ success: false, error: 'LLM returned empty content' }, { status: 502 })
  }

  const maybeJson = pickJsonObject(content.trim())
  if (!maybeJson) {
    return json({ success: false, error: 'LLM output is not JSON' }, { status: 502 })
  }

  let obj: unknown
  try {
    obj = JSON.parse(maybeJson)
  } catch {
    return json({ success: false, error: 'Failed to parse LLM JSON' }, { status: 502 })
  }

  const validated = ExtractResultSchema.safeParse(obj)
  if (!validated.success) {
    return json({ success: false, error: 'LLM JSON does not match schema' }, { status: 502 })
  }

  return json({
    success: true,
    data: validated.data,
    meta: {
      model,
      base_url: baseUrl,
      input_chars: text.length,
    },
  })
}
