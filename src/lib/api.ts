import type { ResumeDetail, ResumeListItem } from '@/types/resume'
import { supabase } from '@/lib/supabaseClient'
import { extractTextFromFile, parseResumeText, type ExtractOptions } from '@/lib/resumeParserClient'

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
    name: parsed.name || null,
    country: parsed.country || null,
    city: parsed.city || null,
    email: parsed.email || null,
    whatsapp: parsed.whatsapp || null,
    phone: parsed.phone || null,
    work_years: parsed.workYears ?? null,
    education: parsed.education ?? null,
    intro_summary_original: parsed.introSummaryOriginal || null,
    intro_language: parsed.introLanguage || null,
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
    name: parsed.name || null,
    country: parsed.country || null,
    city: parsed.city || null,
    email: parsed.email || null,
    whatsapp: parsed.whatsapp || null,
    phone: parsed.phone || null,
    work_years: parsed.workYears ?? null,
    education: parsed.education ?? null,
    intro_summary_original: parsed.introSummaryOriginal || null,
    intro_language: parsed.introLanguage || null,
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
  const allowed = ['name', 'country', 'city', 'email', 'whatsapp', 'phone', 'work_years', 'education', 'intro_summary_original']
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
    text_content = await extractTextFromFile(file)
    parsed = parseResumeText(text_content)
  } catch (e) {
    parse_status = 'failed'
    parse_error = sbErrorMessage(e, '解析失败')
  }

  const patch = {
    text_content,
    name: parsed.name || null,
    country: parsed.country || null,
    city: parsed.city || null,
    email: parsed.email || null,
    whatsapp: parsed.whatsapp || null,
    phone: parsed.phone || null,
    work_years: parsed.workYears ?? null,
    education: parsed.education ?? null,
    intro_summary_original: parsed.introSummaryOriginal || null,
    intro_language: parsed.introLanguage || null,
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
