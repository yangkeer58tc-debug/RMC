import mammoth from 'mammoth'
import { franc } from 'franc-min'
import { findPhoneNumbersInText } from 'libphonenumber-js'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type EducationItem = {
  degree?: string
  startDate?: string
  endDate?: string
  raw?: string
}

export type ParsedResume = {
  textContent: string
  name?: string
  country?: string
  city?: string
  email?: string
  whatsapp?: string
  phone?: string
  workYears?: number
  education?: EducationItem[]
  introSummaryOriginal?: string
  introLanguage?: string
}

export type ExtractOptions = {
  onProgress?: (e: { stage: string; progress?: number }) => void
  ocr?: {
    enabled?: boolean
    maxPages?: number
  }
}

function normalizeWhitespace(s: string) {
  return s.replace(/\r\n/g, '\n').replace(/[\t\f\v]+/g, ' ').replace(/\u00a0/g, ' ')
}

function firstNonEmptyLine(lines: string[]) {
  for (const l of lines) {
    const t = l.trim()
    if (t) return t
  }
  return ''
}

function pickFirstMatch(text: string, re: RegExp) {
  const m = text.match(re)
  return m?.[0]
}

function extractEmail(text: string) {
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  const m = text.match(re)
  return m?.[0]
}

function extractWhatsApp(text: string) {
  const waLink = pickFirstMatch(text, /(https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^\s]+)/i)
  if (waLink) return waLink

  const lines = normalizeWhitespace(text).split('\n').slice(0, 80)
  for (const line of lines) {
    if (!/whats?app/i.test(line)) continue
    const numbers = findPhoneNumbersInText(line)
    if (numbers.length) return numbers[0]?.number?.number || line.trim()
    const raw = pickFirstMatch(line, /\+?\d[\d\s().-]{6,}\d/)
    if (raw) return raw.replace(/\s+/g, ' ').trim()
    return line.trim()
  }
  return undefined
}

function extractPhone(text: string) {
  const phones = findPhoneNumbersInText(text)
  if (phones.length) return phones[0]?.number?.number
  const raw = pickFirstMatch(text, /\+?\d[\d\s().-]{6,}\d/)
  return raw?.replace(/\s+/g, ' ').trim()
}

function extractName(text: string) {
  const lines = normalizeWhitespace(text).split('\n').map((l) => l.trim()).filter(Boolean)

  for (const l of lines.slice(0, 40)) {
    const m = l.match(/^(?:Name|姓名)\s*[:：]\s*(.+)$/i)
    if (m?.[1]) return m[1].trim().slice(0, 80)
  }

  const ignored = /(email|e-mail|phone|tel|mobile|whats?app|linkedin|github|www\.|http)/i
  const candidates = lines.slice(0, 12).filter((l) => !ignored.test(l))
  for (const l of candidates) {
    const ascii = l.replace(/[^A-Za-z\s'.-]/g, '').trim()
    if (ascii.split(/\s+/).filter(Boolean).length >= 2 && ascii.length <= 40) return ascii
    const cjk = l.replace(/[^\u4e00-\u9fff·\s]/g, '').replace(/\s+/g, '').trim()
    if (cjk.length >= 2 && cjk.length <= 6) return cjk
  }
  return undefined
}

function extractLocation(text: string) {
  const lines = normalizeWhitespace(text).split('\n').map((l) => l.trim()).filter(Boolean)

  for (const l of lines.slice(0, 60)) {
    const m = l.match(/^(?:Location|所在地|现居)\s*[:：]\s*(.+)$/i)
    if (m?.[1]) {
      const v = m[1].trim()
      const parts = v.split(/[,，\-–—/|]+/).map((p) => p.trim()).filter(Boolean)
      if (parts.length >= 3) return { city: parts[parts.length - 2], country: parts[parts.length - 1] }
      if (parts.length === 2) return { city: parts[0], country: parts[1] }
      return { city: v }
    }
  }

  for (const l of lines.slice(0, 12)) {
    const parts = l.split(/[,，]/).map((p) => p.trim()).filter(Boolean)
    if (parts.length === 2 && parts[0].length <= 40 && parts[1].length <= 40) {
      return { city: parts[0], country: parts[1] }
    }
  }
  return {}
}

function extractWorkYears(text: string) {
  const candidates: number[] = []
  for (const m of text.matchAll(/(\d{1,2})(?:\s*\+)?\s*(?:years?|yrs?)\b/gi)) {
    candidates.push(Number(m[1]))
  }
  for (const m of text.matchAll(/(?:工作|从业|经验)\s*(\d{1,2})\s*年/gi)) {
    candidates.push(Number(m[1]))
  }
  for (const m of text.matchAll(/(\d{1,2})\s*年(?:以上)?(?:工作)?经验/gi)) {
    candidates.push(Number(m[1]))
  }
  if (candidates.length) return Math.max(...candidates)

  const nowYear = new Date().getFullYear()
  let minStart: number | null = null
  let maxEnd: number | null = null

  const rangeRe = /((?:19|20)\d{2})\s*(?:–|—|-|to)\s*(present|now|current|((?:19|20)\d{2}))/gi
  for (const m of text.matchAll(rangeRe)) {
    const start = Number(m[1])
    const end = m[2] ? nowYear : Number(m[3])
    if (Number.isNaN(start) || Number.isNaN(end)) continue
    if (start < 1950 || start > nowYear) continue
    if (end < 1950 || end > nowYear) continue
    minStart = minStart === null ? start : Math.min(minStart, start)
    maxEnd = maxEnd === null ? end : Math.max(maxEnd, end)
  }

  if (minStart !== null && maxEnd !== null && maxEnd >= minStart) {
    const y = Math.min(60, Math.max(0, maxEnd - minStart))
    if (y > 0) return y
  }

  return undefined
}

function findSection(text: string, headers: RegExp[]) {
  const lines = normalizeWhitespace(text).split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]?.trim()
    if (!l) continue
    if (headers.some((h) => h.test(l))) {
      const out: string[] = []
      for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
        const s = lines[j] ?? ''
        if (!s.trim()) {
          if (out.length >= 3) break
          continue
        }
        if (/^[A-Z][A-Za-z\s]{2,25}$/.test(s.trim()) && out.length >= 3) break
        if (/^(工作经历|项目经历|技能|Skills|Experience|Projects?)\b/i.test(s.trim()) && out.length >= 3) break
        out.push(s.trim())
        if (out.join(' ').length > 1200) break
      }
      return out.join('\n').trim()
    }
  }
  return undefined
}

function splitSentences(text: string) {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return []
  const parts = t
    .split(/(?<=[。！？.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length) return parts
  return [t]
}

function buildIntroSummary(text: string) {
  const section = findSection(text, [/^Summary\b/i, /^Profile\b/i, /^About\s+Me\b/i, /^自我介绍/, /^个人简介/, /^简介/])
  const base = section || text
  const lines = normalizeWhitespace(base).split('\n').map((l) => l.trim()).filter(Boolean)
  const head = lines.slice(0, 40).join(' ')
  const sentences = splitSentences(head)
  const picked: string[] = []
  for (const s of sentences) {
    if (!s.trim()) continue
    picked.push(s.trim())
    if (picked.join(' ').length > 520) break
    if (picked.length >= 3) break
  }
  const out = picked.join(' ')
  return out || head.slice(0, 520)
}

function extractEducation(text: string): EducationItem[] | undefined {
  const section = findSection(text, [/^Education\b/i, /^教育经历/, /^教育背景/])
  if (!section) return undefined
  const lines = section
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
  const items: EducationItem[] = []
  for (const line of lines) {
    if (items.length >= 8) break
    const degree = /(BSc|MSc|PhD|Bachelor|Master|Doctor|本科|硕士|博士|学士|研究生)/i.test(line) ? line : undefined
    const years = line.match(/((?:19|20)\d{2}).{0,6}((?:19|20)\d{2})/)
    const startDate = years?.[1]
    const endDate = years?.[2]
    items.push({ degree: degree || line, startDate, endDate, raw: line })
  }
  return items.length ? items : undefined
}

async function extractTextFromPdf(arrayBuffer: ArrayBuffer) {
  const doc = await getDocument({ data: arrayBuffer }).promise
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const strs = content.items
      .map((it) => {
        const anyIt = it as unknown as { str?: string }
        return anyIt?.str || ''
      })
      .filter(Boolean)
    parts.push(strs.join(' '))
  }
  return parts.join('\n')
}

async function ocrPdf(arrayBuffer: ArrayBuffer, opts?: ExtractOptions) {
  const maxPages = Math.max(1, opts?.ocr?.maxPages ?? 2)
  opts?.onProgress?.({ stage: 'ocr:init' })

  let worker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>> | null = null
  try {
    const { createWorker } = await import('tesseract.js')
    worker = await createWorker('eng', 1, {
      logger: (m) => {
        const stage = m?.status ? `ocr:${m.status}` : 'ocr:working'
        opts?.onProgress?.({ stage, progress: m?.progress })
      },
    })

    await worker.load()
    await worker.reinitialize('eng')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'OCR 初始化失败'
    throw new Error(`OCR 初始化失败：${msg}`)
  }

  const doc = await getDocument({ data: arrayBuffer }).promise
  const pages = Math.min(doc.numPages, maxPages)
  const chunks: string[] = []

  for (let i = 1; i <= pages; i++) {
    opts?.onProgress?.({ stage: `ocr:render:${i}/${pages}` })
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 3 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    await page.render({ canvasContext: ctx, viewport }).promise
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const d = img.data
    for (let p = 0; p < d.length; p += 4) {
      const r = d[p] ?? 0
      const g = d[p + 1] ?? 0
      const b = d[p + 2] ?? 0
      const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
      const v = y > 170 ? 255 : 0
      d[p] = v
      d[p + 1] = v
      d[p + 2] = v
    }
    ctx.putImageData(img, 0, 0)

    const half = Math.floor(canvas.width / 2)
    const crops: Array<{ label: string; x: number; w: number }> = [
      { label: 'left', x: 0, w: half },
      { label: 'right', x: half, w: canvas.width - half },
    ]

    for (const c of crops) {
      const crop = document.createElement('canvas')
      crop.width = c.w
      crop.height = canvas.height
      const cctx = crop.getContext('2d')
      if (!cctx) continue
      cctx.drawImage(canvas, c.x, 0, c.w, canvas.height, 0, 0, c.w, canvas.height)
      const dataUrl = crop.toDataURL('image/png')
      opts?.onProgress?.({ stage: `ocr:recognize:${i}/${pages}:${c.label}` })
      try {
        const result = await worker.recognize(dataUrl)
        const text = result?.data?.text || ''
        if (text.trim()) chunks.push(text)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'OCR 识别失败'
        throw new Error(`OCR 识别失败：${msg}`)
      }
    }
    if (chunks.join('\n').length > 1500) break
  }

  await worker.terminate()
  return chunks.join('\n').trim()
}

export async function extractTextFromFile(file: File, opts?: ExtractOptions): Promise<string> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.pdf')) {
    const original = await file.arrayBuffer()
    const bufForText = original.slice(0)
    const bufForOcr = original.slice(0)
    const plain = (await extractTextFromPdf(bufForText)).trim()
    if (plain.length >= 40) return plain
    const allowOcr = opts?.ocr?.enabled ?? true
    if (!allowOcr) return plain
    opts?.onProgress?.({ stage: 'ocr:fallback' })
    return (await ocrPdf(bufForOcr, opts)).trim()
  }
  if (lower.endsWith('.docx')) {
    const buf = await file.arrayBuffer()
    const res = await mammoth.extractRawText({ arrayBuffer: buf } as unknown as { arrayBuffer: ArrayBuffer })
    return res.value || ''
  }
  return file.text()
}

export function parseResumeText(text: string): Omit<ParsedResume, 'textContent'> {
  const normalized = normalizeWhitespace(text)
  const name = extractName(normalized)
  const { country, city } = extractLocation(normalized)
  const email = extractEmail(normalized)
  const whatsapp = extractWhatsApp(normalized)
  const phone = extractPhone(normalized)
  const workYears = extractWorkYears(normalized)
  const education = extractEducation(normalized)
  const introSummaryOriginal = buildIntroSummary(normalized)
  const sampleForLang = firstNonEmptyLine(normalized.split('\n').slice(0, 30)) || introSummaryOriginal || normalized.slice(0, 200)
  const introLanguage = sampleForLang ? franc(sampleForLang) : undefined

  return {
    name,
    country,
    city,
    email,
    whatsapp,
    phone,
    workYears,
    education,
    introSummaryOriginal,
    introLanguage: introLanguage && introLanguage !== 'und' ? introLanguage : undefined,
  }
}
