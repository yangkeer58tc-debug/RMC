import express, { type Request, type Response } from 'express'
import crypto from 'crypto'
import multer from 'multer'
import { z } from 'zod'
import { getSupabaseAdmin } from '../supabaseAdmin.js'
import { extractTextFromFile, parseResumeText, type EducationItem } from '../resumeParser.js'

const router = express.Router()

function nowIso() {
  return new Date().toISOString()
}

function safeBasename(name: string) {
  const base = name.split('/').pop() || name
  const cleaned = base.replace(/[^a-zA-Z0-9._-\u4e00-\u9fff]+/g, '_')
  return cleaned.slice(0, 120) || 'resume'
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
})

async function uploadToStorage(buffer: Buffer, filename: string, contentType?: string) {
  const supabaseAdmin = getSupabaseAdmin()
  const id = crypto.randomUUID()
  const clean = safeBasename(filename)
  const path = `uploads/${id}__${clean}`
  const blob = new Blob([buffer], { type: contentType || 'application/octet-stream' })

  const { error } = await supabaseAdmin.storage.from('resumes').upload(path, blob, {
    upsert: false,
    contentType: contentType || undefined,
  })
  if (error) throw new Error(error.message)
  return { storagePath: path, originalFilename: clean }
}

async function downloadFromStorage(storagePath: string) {
  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin.storage.from('resumes').download(storagePath)
  if (error) throw new Error(error.message)
  const ab = await data.arrayBuffer()
  return Buffer.from(ab)
}

async function createResumeRow(input: {
  sourceType: 'upload' | 'url'
  sourceUrl?: string | null
  storagePath: string
  originalFilename?: string | null
}) {
  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('resumes')
    .insert({
      source_type: input.sourceType,
      source_url: input.sourceUrl ?? null,
      storage_bucket: 'resumes',
      storage_path: input.storagePath,
      original_filename: input.originalFilename ?? null,
      parse_status: 'processing',
      updated_at: nowIso(),
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  if (!data?.id) throw new Error('Failed to create resume row')
  return data.id
}

async function parseAndUpdate(resumeId: string, buffer: Buffer, filename: string) {
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const text = await extractTextFromFile(buffer, filename)
    const parsed = parseResumeText(text)
    const education = parsed.education || null

    const { error } = await supabaseAdmin
      .from('resumes')
      .update({
        text_content: text || null,
        name: parsed.name ?? null,
        country: parsed.country ?? null,
        city: parsed.city ?? null,
        email: parsed.email ?? null,
        whatsapp: parsed.whatsapp ?? null,
        phone: parsed.phone ?? null,
        work_years: parsed.workYears ?? null,
        education,
        intro_summary_original: parsed.introSummaryOriginal ?? null,
        intro_language: parsed.introLanguage ?? null,
        parse_status: 'success',
        parse_error: null,
        updated_at: nowIso(),
      })
      .eq('id', resumeId)

    if (error) throw new Error(error.message)
    return { status: 'success' as const }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Parse failed'
    await supabaseAdmin
      .from('resumes')
      .update({ parse_status: 'failed', parse_error: message, updated_at: nowIso() })
      .eq('id', resumeId)
    return { status: 'failed' as const, errorMessage: message }
  }
}

router.post('/import/upload', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file
  if (!file) {
    res.status(400).json({ success: false, error: 'Missing file' })
    return
  }

  try {
    const uploaded = await uploadToStorage(file.buffer, file.originalname, file.mimetype)
    const resumeId = await createResumeRow({
      sourceType: 'upload',
      storagePath: uploaded.storagePath,
      originalFilename: uploaded.originalFilename,
    })
    const parsed = await parseAndUpdate(resumeId, file.buffer, uploaded.originalFilename)

    res.status(200).json({ success: true, resumeId, status: parsed.status })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Import failed'
    res.status(500).json({ success: false, error: msg })
  }
})

router.post('/import/url', async (req: Request, res: Response) => {
  const bodySchema = z.object({ url: z.string().url() })
  const parsedBody = bodySchema.safeParse(req.body)
  if (!parsedBody.success) {
    res.status(400).json({ success: false, error: 'Invalid url' })
    return
  }

  const url = parsedBody.data.url
  if (!/^https?:\/\//i.test(url)) {
    res.status(400).json({ success: false, error: 'Only http/https supported' })
    return
  }

  try {
    const resp = await fetch(url)
    if (!resp.ok) {
      res.status(400).json({ success: false, error: `Fetch failed: ${resp.status}` })
      return
    }

    const arrayBuf = await resp.arrayBuffer()
    const buf = Buffer.from(arrayBuf)
    if (buf.length > 15 * 1024 * 1024) {
      res.status(400).json({ success: false, error: 'File too large (max 15MB)' })
      return
    }

    const u = new URL(url)
    const nameFromUrl = safeBasename(decodeURIComponent(u.pathname.split('/').pop() || 'resume'))
    const contentType = resp.headers.get('content-type') || undefined
    const uploaded = await uploadToStorage(buf, nameFromUrl, contentType)
    const resumeId = await createResumeRow({
      sourceType: 'url',
      sourceUrl: url,
      storagePath: uploaded.storagePath,
      originalFilename: uploaded.originalFilename,
    })
    const parsed = await parseAndUpdate(resumeId, buf, uploaded.originalFilename)

    res.status(200).json({ success: true, resumeId, status: parsed.status })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Import failed'
    res.status(500).json({ success: false, error: msg })
  }
})

router.get('/', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const country = typeof req.query.country === 'string' ? req.query.country.trim() : ''
  const city = typeof req.query.city === 'string' ? req.query.city.trim() : ''
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : ''
  const minWorkYears = typeof req.query.minWorkYears === 'string' ? Number(req.query.minWorkYears) : undefined
  const maxWorkYears = typeof req.query.maxWorkYears === 'string' ? Number(req.query.maxWorkYears) : undefined

  try {
    const supabaseAdmin = getSupabaseAdmin()
    let query = supabaseAdmin
      .from('resumes')
      .select(
        'id,name,country,city,email,whatsapp,phone,work_years,parse_status,parse_error,created_at,updated_at',
      )
      .order('created_at', { ascending: false })
      .limit(200)

    if (q) {
      const like = `%${q}%`
      query = query.or(
        `name.ilike.${like},email.ilike.${like},phone.ilike.${like},whatsapp.ilike.${like}`,
      )
    }
    if (country) query = query.ilike('country', `%${country}%`)
    if (city) query = query.ilike('city', `%${city}%`)
    if (status && ['processing', 'success', 'failed'].includes(status)) {
      query = query.eq('parse_status', status as 'processing' | 'success' | 'failed')
    }
    if (Number.isFinite(minWorkYears as number)) query = query.gte('work_years', minWorkYears as number)
    if (Number.isFinite(maxWorkYears as number)) query = query.lte('work_years', maxWorkYears as number)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    res.status(200).json({ success: true, items: data || [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Query failed'
    res.status(500).json({ success: false, error: msg })
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  const id = req.params.id
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin.from('resumes').select('*').eq('id', id).single()
    if (error) {
      res.status(404).json({ success: false, error: 'Not found' })
      return
    }
    res.status(200).json({ success: true, item: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Query failed'
    res.status(500).json({ success: false, error: msg })
  }
})

router.put('/:id', async (req: Request, res: Response) => {
  const id = req.params.id
  const bodySchema = z.object({
    name: z.string().trim().min(1).max(80).nullable().optional(),
    country: z.string().trim().max(80).nullable().optional(),
    city: z.string().trim().max(80).nullable().optional(),
    email: z.string().trim().max(200).nullable().optional(),
    whatsapp: z.string().trim().max(200).nullable().optional(),
    phone: z.string().trim().max(60).nullable().optional(),
    work_years: z.number().int().min(0).max(80).nullable().optional(),
    education: z
      .array(
        z.object({
          school: z.string().optional(),
          degree: z.string().optional(),
          major: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          raw: z.string().optional(),
        }),
      )
      .nullable()
      .optional(),
    intro_summary_original: z.string().trim().max(2000).nullable().optional(),
  })

  const parsedBody = bodySchema.safeParse(req.body)
  if (!parsedBody.success) {
    res.status(400).json({ success: false, error: 'Invalid body' })
    return
  }

  const data = parsedBody.data
  const patch: Record<string, unknown> = { updated_at: nowIso() }

  if ('name' in data) patch.name = data.name
  if ('country' in data) patch.country = data.country
  if ('city' in data) patch.city = data.city
  if ('email' in data) patch.email = data.email
  if ('whatsapp' in data) patch.whatsapp = data.whatsapp
  if ('phone' in data) patch.phone = data.phone
  if ('work_years' in data) patch.work_years = data.work_years
  if ('education' in data) patch.education = (data.education as EducationItem[] | null) ?? null
  if ('intro_summary_original' in data) patch.intro_summary_original = data.intro_summary_original

  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { data: updated, error } = await supabaseAdmin
      .from('resumes')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      res.status(404).json({ success: false, error: 'Not found' })
      return
    }
    res.status(200).json({ success: true, item: updated })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed'
    res.status(500).json({ success: false, error: msg })
  }
})

router.post('/:id/reparse', async (req: Request, res: Response) => {
  const id = req.params.id
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { data: row, error } = await supabaseAdmin
      .from('resumes')
      .select('id,storage_path,original_filename')
      .eq('id', id)
      .single()

    if (error || !row) {
      res.status(404).json({ success: false, error: 'Not found' })
      return
    }

    await supabaseAdmin
      .from('resumes')
      .update({ parse_status: 'processing', parse_error: null, updated_at: nowIso() })
      .eq('id', id)

    const buf = await downloadFromStorage(row.storage_path)
    const parsed = await parseAndUpdate(id, buf, row.original_filename || 'resume')
    res.status(200).json({ success: true, status: parsed.status })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Reparse failed'
    res.status(500).json({ success: false, error: msg })
  }
})

router.get('/:id/file', async (req: Request, res: Response) => {
  const id = req.params.id
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { data: row, error } = await supabaseAdmin
      .from('resumes')
      .select('storage_path')
      .eq('id', id)
      .single()

    if (error || !row?.storage_path) {
      res.status(404).json({ success: false, error: 'File not found' })
      return
    }

    const { data, error: signErr } = await supabaseAdmin.storage
      .from('resumes')
      .createSignedUrl(row.storage_path, 60)

    if (signErr || !data?.signedUrl) {
      res.status(500).json({ success: false, error: signErr?.message || 'Failed to sign url' })
      return
    }

    res.redirect(302, data.signedUrl)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Download failed'
    res.status(500).json({ success: false, error: msg })
  }
})

export default router
