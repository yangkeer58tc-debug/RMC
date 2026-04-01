import type { ResumeDetail, ResumeListItem } from '@/types/resume'
import { supabase } from '@/lib/supabaseClient'
import { extractTextFromFile, parseResumeText, type ExtractOptions } from '@/lib/resumeParserClient'
import { aiExtract } from '@/lib/aiExtract'

type ApiOk<T> = { success: true } & T

type ImportOpts = {
  onProgress?: (msg: string) => void
}

function sbErrorMessage(e: unknown, fallback: string) {
  const msg = (e as { message?: string })?.message
  return msg || fallback
}

function friendlyStorageUploadErrorMessage(raw: string) {
  const lower = raw.toLowerCase()
  if (lower.includes('row-level security') || lower.includes('rls') || lower.includes('unauthorized')) {
    return '上传失败：Supabase Storage 未授权（RLS）。请在 Supabase SQL Editor 执行 README 里的 storage.objects policy，然后重试。'
  }
  return raw
}

function guessFilenameFromUrl(url: string) {
  try {
    const u = new URL(url)
    const base = u.pathname.split('/').filter(Boolean).pop() || 'resume'
    return decodeURIComponent(base)
  } catch {
    return 'resume'
  }
}

function inferNameFromFilename(filename: string) {
  const base = filename.replace(/\.[^.]+$/, '')
  const cleaned = base
    .replace(/[_\-]+/g, ' ')
    .replace(/\b(cv|resume|curriculo|currículo|curriculum|vitae)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const ascii = cleaned.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s'.-]/g, '').trim()
  const words = ascii.split(/\s+/).filter(Boolean)
  if (words.length >= 2 && ascii.length <= 80) return ascii
  return null
}

function inferNameParts(fullName: string | null | undefined): { first_name: string | null; last_name: string | null } {
  const name = (fullName || '').trim()
  if (!name) return { first_name: null, last_name: null }

  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return { first_name: null, last_name: null }
  const last = parts[parts.length - 1] || null
  const first = parts.slice(0, -1).join(' ') || null
  return { first_name: first, last_name: last }
}

function pickFirst<T>(...vals: Array<T | null | undefined>) {
  for (const v of vals) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && !v.trim()) continue
    return v
  }
  return null
}

function asYearString(v: unknown) {
  if (typeof v !== 'string') return null
  const t = v.trim()
  const m = t.match(/(19|20)\d{2}/)
  return m?.[0] || null
}

function normalizeEducationAny(input: unknown) {
  if (!Array.isArray(input)) return null
  const items = input
    .map((it) => {
      const obj = it as any
      const degree = typeof obj?.degree === 'string' ? obj.degree.trim() : typeof obj?.raw === 'string' ? obj.raw.trim() : null
      const startDate = asYearString(obj?.startDate ?? obj?.start_date ?? obj?.startYear ?? obj?.start_year)
      const endDate = asYearString(obj?.endDate ?? obj?.end_date ?? obj?.endYear ?? obj?.end_year)
      const raw = typeof obj?.raw === 'string' ? obj.raw.trim() : degree
      if (!degree && !raw) return null
      return { degree: degree || raw || undefined, startDate: startDate || undefined, endDate: endDate || undefined, raw: raw || undefined }
    })
    .filter(Boolean)
  return items.length ? items : null
}

function mergeEducation(aiEdu: unknown, parsedEdu: unknown) {
  const ai = normalizeEducationAny(aiEdu)
  const parsed = normalizeEducationAny(parsedEdu)
  if (!ai) return parsed
  if (!parsed) return ai
  return ai.map((a) => {
    const key = (a.degree || a.raw || '').toLowerCase()
    const p = parsed.find((x) => ((x.degree || x.raw || '').toLowerCase() === key))
    return {
      degree: a.degree || p?.degree,
      startDate: a.startDate || p?.startDate,
      endDate: a.endDate || p?.endDate,
      raw: a.raw || p?.raw,
    }
  })
}

function chooseWorkYears(aiWorkYears: unknown, heuristic: number | null | undefined) {
  const ai = typeof aiWorkYears === 'number' && Number.isFinite(aiWorkYears) ? Math.trunc(aiWorkYears) : null
  const h = typeof heuristic === 'number' && Number.isFinite(heuristic) ? Math.trunc(heuristic) : null
  if (ai === null) return h
  if (ai < 0 || ai > 60) return h
  if (h === null) return ai
  if (Math.abs(ai - h) <= 2) return ai
  return h
}

function normalizeExt(name: string) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.txt')) return 'txt'
  return 'bin'
}

function getPublicFileUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export async function importResumeUpload(file: File, opts?: ImportOpts) {
  const storage_bucket = 'resumes'
  const ext = normalizeExt(file.name)
  const storage_path = `${crypto.randomUUID()}.${ext}`

  opts?.onProgress?.('上传中…')

  const { error: uploadErr } = await supabase.storage
    .from(storage_bucket)
    .upload(storage_path, file, { upsert: false, contentType: file.type || undefined })
  if (uploadErr) throw new Error(friendlyStorageUploadErrorMessage(sbErrorMessage(uploadErr, '上传失败')))

  let parse_status: ResumeDetail['parse_status'] = 'success'
  let parse_error: string | null = null
  let text_content: string | null = null
  let parsed: ReturnType<typeof parseResumeText> = {}
  let heuristicWorkYears: number | null | undefined

  try {
    opts?.onProgress?.('解析中…')
    const extractOpts: ExtractOptions = {
      ocr: { enabled: true, maxPages: 2 },
      onProgress: (e) => {
        const pct = typeof e.progress === 'number' ? ` ${Math.round(e.progress * 100)}%` : ''
        opts?.onProgress?.(`${e.stage}${pct}`)
      },
    }
    text_content = await extractTextFromFile(file, extractOpts)
    parsed = parseResumeText(text_content)
    heuristicWorkYears = parsed.workYears

    opts?.onProgress?.('AI 抽取中…')
    const aiRes = await aiExtract(text_content, file.name)
    const aiUsed = aiRes.ok
    const aiModel = aiRes.meta?.model || null
    let aiError: string | null = null
    let ai: any = null
    if (aiRes.ok) ai = aiRes.data
    if ('error' in aiRes) aiError = aiRes.error
    ;(parsed as any).aiUsed = aiUsed
    ;(parsed as any).aiModel = aiModel
    ;(parsed as any).aiError = aiError
    ;(parsed as any).aiExtractedAt = aiUsed ? new Date().toISOString() : null

    if (ai) {
      parsed = {
        ...parsed,
        name: pickFirst(ai.full_name, parsed.name) || undefined,
        country: pickFirst(ai.country, parsed.country) || undefined,
        city: pickFirst(ai.city, parsed.city) || undefined,
        email: pickFirst(ai.email, parsed.email) || undefined,
        whatsapp: pickFirst(ai.whatsapp, parsed.whatsapp) || undefined,
        phone: pickFirst(ai.phone, parsed.phone) || undefined,
        workYears: chooseWorkYears(ai.work_years, parsed.workYears) ?? undefined,
        education: mergeEducation(ai.education, parsed.education) ?? undefined,
        introSummaryOriginal: pickFirst(ai.intro_summary_original, parsed.introSummaryOriginal) || undefined,
        introLanguage: pickFirst(ai.intro_language, parsed.introLanguage) || undefined,
      }

      ;(parsed as any).profileSummary = pickFirst(ai.profile_summary, (parsed as any).profileSummary) || undefined
      ;(parsed as any).profileSummaryLanguage = pickFirst(ai.profile_summary_language, parsed.introLanguage) || undefined

      const inferred = inferNameParts(parsed.name)
      ;(parsed as any).firstName = pickFirst(ai.first_name, inferred.first_name) || undefined
      ;(parsed as any).lastName = pickFirst(ai.last_name, inferred.last_name) || undefined
    } else {
      const inferred = inferNameParts(parsed.name)
      ;(parsed as any).firstName = inferred.first_name || undefined
      ;(parsed as any).lastName = inferred.last_name || undefined
    }
  } catch (e) {
    parse_status = 'failed'
    parse_error = sbErrorMessage(e, '解析失败')
  }

  if (parse_status === 'success' && (text_content || '').trim().length < 20) {
    parse_status = 'failed'
    parse_error = '未检测到可解析文本（可能是扫描版PDF，请稍后重试或使用OCR）'
  }

  const payload = {
    source_type: 'upload' as const,
    source_url: null as string | null,
    storage_bucket,
    storage_path,
    original_filename: file.name,
    text_content,
    first_name: ((parsed as any).firstName as string | undefined) || null,
    last_name: ((parsed as any).lastName as string | undefined) || null,
    name: (parsed.name || inferNameFromFilename(file.name)) || null,
    country: parsed.country || null,
    city: parsed.city || null,
    email: parsed.email || null,
    whatsapp: parsed.whatsapp || null,
    phone: parsed.phone || null,
    work_years: parsed.workYears ?? 0,
    education: parsed.education ?? null,
    intro_summary_original: parsed.introSummaryOriginal || null,
    intro_language: parsed.introLanguage || null,
    profile_summary: ((parsed as any).profileSummary as string | undefined) || null,
    profile_summary_language: ((parsed as any).profileSummaryLanguage as string | undefined) || null,
    ai_used: ((parsed as any).aiUsed as boolean | undefined) || false,
    ai_model: ((parsed as any).aiModel as string | null | undefined) || null,
    ai_error: ((parsed as any).aiError as string | null | undefined) || null,
    ai_extracted_at: ((parsed as any).aiExtractedAt as string | null | undefined) || null,
    parse_status,
    parse_error,
  }

  opts?.onProgress?.('入库中…')
  const { data, error } = await supabase.from('resumes').insert(payload).select('id, parse_status').single()
  if (error) throw new Error(sbErrorMessage(error, '入库失败'))

  return { success: true, resumeId: String(data.id), status: String(data.parse_status) } satisfies ApiOk<{
    resumeId: string
    status: string
  }>
}

export async function importResumeUrl(url: string, opts?: ImportOpts) {
  async function fetchRemote() {
    if (import.meta.env.PROD) {
      const proxied = `/proxy?url=${encodeURIComponent(url)}`
      opts?.onProgress?.('下载中（通过代理）…')
      const r = await fetch(proxied)
      if (!r.ok) throw new Error(`代理下载失败：${r.status}`)
      return r
    }

    try {
      opts?.onProgress?.('下载中…')
      const r = await fetch(url)
      if (r.type === 'opaque') throw new Error('CORS blocked')
      if (!r.ok) throw new Error(`下载链接失败：${r.status}`)
      return r
    } catch {
      const proxied = `/proxy?url=${encodeURIComponent(url)}`
      opts?.onProgress?.('下载中（通过代理）…')
      const r = await fetch(proxied)
      if (!r.ok) throw new Error(`下载链接失败（可能被 CORS 拦截）：${r.status}`)
      return r
    }
  }

  const res = await fetchRemote()

  const blob = await res.blob()
  const filename = guessFilenameFromUrl(url)
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })

  const storage_bucket = 'resumes'
  const ext = normalizeExt(filename)
  const storage_path = `${crypto.randomUUID()}.${ext}`

  opts?.onProgress?.('上传中…')
  const { error: uploadErr } = await supabase.storage
    .from(storage_bucket)
    .upload(storage_path, file, { upsert: false, contentType: blob.type || undefined })
  if (uploadErr) throw new Error(friendlyStorageUploadErrorMessage(sbErrorMessage(uploadErr, '上传失败')))

  let parse_status: ResumeDetail['parse_status'] = 'success'
  let parse_error: string | null = null
  let text_content: string | null = null
  let parsed: ReturnType<typeof parseResumeText> = {}

  try {
    opts?.onProgress?.('解析中…')
    const extractOpts: ExtractOptions = {
      ocr: { enabled: true, maxPages: 2 },
      onProgress: (e) => {
        const pct = typeof e.progress === 'number' ? ` ${Math.round(e.progress * 100)}%` : ''
        opts?.onProgress?.(`${e.stage}${pct}`)
      },
    }
    text_content = await extractTextFromFile(file, extractOpts)
    parsed = parseResumeText(text_content)

    opts?.onProgress?.('AI 抽取中…')
    const aiRes = await aiExtract(text_content, filename)
    const aiUsed = aiRes.ok
    const aiModel = aiRes.meta?.model || null
    let aiError: string | null = null
    let ai: any = null
    if (aiRes.ok) ai = aiRes.data
    if ('error' in aiRes) aiError = aiRes.error
    ;(parsed as any).aiUsed = aiUsed
    ;(parsed as any).aiModel = aiModel
    ;(parsed as any).aiError = aiError
    ;(parsed as any).aiExtractedAt = aiUsed ? new Date().toISOString() : null

    if (ai) {
      parsed = {
        ...parsed,
        name: pickFirst(ai.full_name, parsed.name) || undefined,
        country: pickFirst(ai.country, parsed.country) || undefined,
        city: pickFirst(ai.city, parsed.city) || undefined,
        email: pickFirst(ai.email, parsed.email) || undefined,
        whatsapp: pickFirst(ai.whatsapp, parsed.whatsapp) || undefined,
        phone: pickFirst(ai.phone, parsed.phone) || undefined,
        workYears: chooseWorkYears(ai.work_years, parsed.workYears) ?? undefined,
        education: mergeEducation(ai.education, parsed.education) ?? undefined,
        introSummaryOriginal: pickFirst(ai.intro_summary_original, parsed.introSummaryOriginal) || undefined,
        introLanguage: pickFirst(ai.intro_language, parsed.introLanguage) || undefined,
      }

      ;(parsed as any).profileSummary = pickFirst(ai.profile_summary, (parsed as any).profileSummary) || undefined
      ;(parsed as any).profileSummaryLanguage = pickFirst(ai.profile_summary_language, parsed.introLanguage) || undefined

      const inferred = inferNameParts(parsed.name)
      ;(parsed as any).firstName = pickFirst(ai.first_name, inferred.first_name) || undefined
      ;(parsed as any).lastName = pickFirst(ai.last_name, inferred.last_name) || undefined
    } else {
      const inferred = inferNameParts(parsed.name)
      ;(parsed as any).firstName = inferred.first_name || undefined
      ;(parsed as any).lastName = inferred.last_name || undefined
    }
  } catch (e) {
    parse_status = 'failed'
    parse_error = sbErrorMessage(e, '解析失败')
  }

  if (parse_status === 'success' && (text_content || '').trim().length < 20) {
    parse_status = 'failed'
    parse_error = '未检测到可解析文本（可能是扫描版PDF，请稍后重试或使用OCR）'
  }

  const payload = {
    source_type: 'url' as const,
    source_url: url,
    storage_bucket,
    storage_path,
    original_filename: filename,
    text_content,
    first_name: ((parsed as any).firstName as string | undefined) || null,
    last_name: ((parsed as any).lastName as string | undefined) || null,
    name: (parsed.name || inferNameFromFilename(filename)) || null,
    country: parsed.country || null,
    city: parsed.city || null,
    email: parsed.email || null,
    whatsapp: parsed.whatsapp || null,
    phone: parsed.phone || null,
    work_years: parsed.workYears ?? 0,
    education: parsed.education ?? null,
    intro_summary_original: parsed.introSummaryOriginal || null,
    intro_language: parsed.introLanguage || null,
    profile_summary: ((parsed as any).profileSummary as string | undefined) || null,
    profile_summary_language: ((parsed as any).profileSummaryLanguage as string | undefined) || null,
    ai_used: ((parsed as any).aiUsed as boolean | undefined) || false,
    ai_model: ((parsed as any).aiModel as string | null | undefined) || null,
    ai_error: ((parsed as any).aiError as string | null | undefined) || null,
    ai_extracted_at: ((parsed as any).aiExtractedAt as string | null | undefined) || null,
    parse_status,
    parse_error,
  }

  opts?.onProgress?.('入库中…')
  const { data, error } = await supabase.from('resumes').insert(payload).select('id, parse_status').single()
  if (error) throw new Error(sbErrorMessage(error, '入库失败'))

  return { success: true, resumeId: String(data.id), status: String(data.parse_status) } satisfies ApiOk<{
    resumeId: string
    status: string
  }>
}

export async function listResumes(params: {
  q?: string
  country?: string
  city?: string
  status?: string
  minWorkYears?: string
  maxWorkYears?: string
}) {
  let q = supabase.from('resumes').select('*').order('created_at', { ascending: false }).limit(200)

  if (params.q?.trim()) {
    const keyword = params.q.trim().replace(/%/g, '')
    q = q.or(
      `name.ilike.%${keyword}%,email.ilike.%${keyword}%,phone.ilike.%${keyword}%,whatsapp.ilike.%${keyword}%`,
    )
  }
  if (params.country?.trim()) q = q.ilike('country', `%${params.country.trim()}%`)
  if (params.city?.trim()) q = q.ilike('city', `%${params.city.trim()}%`)
  if (params.status?.trim()) q = q.eq('parse_status', params.status.trim())
  if (params.minWorkYears?.trim()) q = q.gte('work_years', Number(params.minWorkYears.trim()))
  if (params.maxWorkYears?.trim()) q = q.lte('work_years', Number(params.maxWorkYears.trim()))

  const { data, error } = await q
  if (error) throw new Error(sbErrorMessage(error, '加载失败'))
  return { success: true, items: (data || []) as ResumeListItem[] } satisfies ApiOk<{ items: ResumeListItem[] }>
}

export async function getResume(id: string) {
  const { data, error } = await supabase.from('resumes').select('*').eq('id', id).single()
  if (error) throw new Error(sbErrorMessage(error, '加载失败'))
  return { success: true, item: data as ResumeDetail } satisfies ApiOk<{ item: ResumeDetail }>
}

export async function updateResume(id: string, patch: Partial<ResumeDetail>) {
  const body: Record<string, unknown> = {}
  const allowed = [
    'first_name',
    'last_name',
    'name',
    'country',
    'city',
    'email',
    'whatsapp',
    'phone',
    'work_years',
    'education',
    'intro_summary_original',
    'profile_summary',
    'profile_summary_language',
  ]
  for (const k of allowed) {
    if (k in patch) body[k] = (patch as Record<string, unknown>)[k]
  }
  body.updated_at = new Date().toISOString()

  const { data, error } = await supabase.from('resumes').update(body).eq('id', id).select('*').single()
  if (error) throw new Error(sbErrorMessage(error, '保存失败'))
  return { success: true, item: data as ResumeDetail } satisfies ApiOk<{ item: ResumeDetail }>
}

export async function reparseResume(id: string) {
  const { data: row, error: rowErr } = await supabase
    .from('resumes')
    .select('id, storage_bucket, storage_path, original_filename')
    .eq('id', id)
    .single()
  if (rowErr) throw new Error(sbErrorMessage(rowErr, '获取简历失败'))

  const bucket = String((row as { storage_bucket: string }).storage_bucket)
  const path = String((row as { storage_path: string }).storage_path)
  const filename = String((row as { original_filename: string | null }).original_filename || 'resume')

  const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(path)
  if (dlErr || !blob) throw new Error(sbErrorMessage(dlErr, '下载原文件失败'))

  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })

  let parse_status: ResumeDetail['parse_status'] = 'success'
  let parse_error: string | null = null
  let text_content: string | null = null
  let parsed: ReturnType<typeof parseResumeText> = {}

  try {
    const extractOpts: ExtractOptions = {
      ocr: { enabled: true, maxPages: 2 },
    }
    text_content = await extractTextFromFile(file, extractOpts)
    parsed = parseResumeText(text_content)

    const aiRes = await aiExtract(text_content, filename)
    const aiUsed = aiRes.ok
    const aiModel = aiRes.meta?.model || null
    let aiError: string | null = null
    let ai: any = null
    if (aiRes.ok) ai = aiRes.data
    if ('error' in aiRes) aiError = aiRes.error
    ;(parsed as any).aiUsed = aiUsed
    ;(parsed as any).aiModel = aiModel
    ;(parsed as any).aiError = aiError
    ;(parsed as any).aiExtractedAt = aiUsed ? new Date().toISOString() : null

    if (ai) {
      parsed = {
        ...parsed,
        name: pickFirst(ai.full_name, parsed.name) || undefined,
        country: pickFirst(ai.country, parsed.country) || undefined,
        city: pickFirst(ai.city, parsed.city) || undefined,
        email: pickFirst(ai.email, parsed.email) || undefined,
        whatsapp: pickFirst(ai.whatsapp, parsed.whatsapp) || undefined,
        phone: pickFirst(ai.phone, parsed.phone) || undefined,
        workYears: chooseWorkYears(ai.work_years, parsed.workYears) ?? undefined,
        education: mergeEducation(ai.education, parsed.education) ?? undefined,
        introSummaryOriginal: pickFirst(ai.intro_summary_original, parsed.introSummaryOriginal) || undefined,
        introLanguage: pickFirst(ai.intro_language, parsed.introLanguage) || undefined,
      }

      ;(parsed as any).profileSummary = pickFirst(ai.profile_summary, (parsed as any).profileSummary) || undefined
      ;(parsed as any).profileSummaryLanguage = pickFirst(ai.profile_summary_language, parsed.introLanguage) || undefined

      const inferred = inferNameParts(parsed.name)
      ;(parsed as any).firstName = pickFirst(ai.first_name, inferred.first_name) || undefined
      ;(parsed as any).lastName = pickFirst(ai.last_name, inferred.last_name) || undefined
    } else {
      const inferred = inferNameParts(parsed.name)
      ;(parsed as any).firstName = inferred.first_name || undefined
      ;(parsed as any).lastName = inferred.last_name || undefined
    }
  } catch (e) {
    parse_status = 'failed'
    parse_error = sbErrorMessage(e, '解析失败')
  }

  const patch = {
    text_content,
    first_name: ((parsed as any).firstName as string | undefined) || null,
    last_name: ((parsed as any).lastName as string | undefined) || null,
    name: (parsed.name || inferNameFromFilename(filename)) || null,
    country: parsed.country || null,
    city: parsed.city || null,
    email: parsed.email || null,
    whatsapp: parsed.whatsapp || null,
    phone: parsed.phone || null,
    work_years: parsed.workYears ?? 0,
    education: parsed.education ?? null,
    intro_summary_original: parsed.introSummaryOriginal || null,
    intro_language: parsed.introLanguage || null,
    profile_summary: ((parsed as any).profileSummary as string | undefined) || null,
    profile_summary_language: ((parsed as any).profileSummaryLanguage as string | undefined) || null,
    ai_used: ((parsed as any).aiUsed as boolean | undefined) || false,
    ai_model: ((parsed as any).aiModel as string | null | undefined) || null,
    ai_error: ((parsed as any).aiError as string | null | undefined) || null,
    ai_extracted_at: ((parsed as any).aiExtractedAt as string | null | undefined) || null,
    parse_status,
    parse_error,
    updated_at: new Date().toISOString(),
  }

  const { error: upErr } = await supabase.from('resumes').update(patch).eq('id', id)
  if (upErr) throw new Error(sbErrorMessage(upErr, '更新解析结果失败'))

  return { success: true, status: parse_status } satisfies ApiOk<{ status: string }>
}

export function resumeFileUrl(item: Pick<ResumeDetail, 'storage_bucket' | 'storage_path'>) {
  return getPublicFileUrl(item.storage_bucket, item.storage_path)
}
