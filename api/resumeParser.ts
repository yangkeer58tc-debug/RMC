import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import { franc } from 'franc-min'
import { findPhoneNumbersInText } from 'libphonenumber-js'

export type EducationItem = {
  school?: string
  degree?: string
  major?: string
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

function normalizeWhitespace(s: string) {
  return s.replace(/\r\n/g, '\n').replace(/[\t\f\v]+/g, ' ').replace(/\u00a0/g, ' ')
}

function normalizeFieldKey(k: string) {
  return k
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function splitDelimitedLine(line: string, delimiter: ',' | '\t') {
  if (delimiter === '\t') return line.split('\t').map((x) => x.trim())
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

function pickMapped(m: Record<string, string>, keys: string[]) {
  for (const k of keys) {
    const v = m[k]
    if (v && v.trim()) return v.trim()
  }
  return undefined
}

function safeJsonArray(raw: string | undefined) {
  if (!raw) return null
  const t = raw.trim()
  if (!t || t === '\\N' || t === 'null') return null
  try {
    const parsed = JSON.parse(t)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function rangeTextToYears(v: string | undefined) {
  if (!v) return undefined
  const t = v.trim().toLowerCase()
  if (!t || t === '\\n') return undefined
  const zh = t.match(/(\d+)\s*[-~]\s*(\d+)\s*年/)
  if (zh) return Number(zh[2])
  if (t.includes('8+') || t.includes('8 years') || t.includes('8年以上')) return 8
  const n = t.match(/\d{1,2}/)
  return n ? Number(n[0]) : undefined
}

function buildEducationFromStandardized(mapped: Record<string, string>): EducationItem[] | undefined {
  const arr = safeJsonArray(pickMapped(mapped, ['education_experience', 'education_history', 'education']))
  if (arr?.length) {
    const out: EducationItem[] = []
    for (const it of arr.slice(0, 12)) {
      const o = it as Record<string, unknown>
      const item: EducationItem = {
        school: typeof o.school === 'string' ? o.school : undefined,
        degree: typeof o.degree === 'string' ? o.degree : undefined,
        major: typeof o.subject === 'string' ? o.subject : undefined,
        startDate: typeof o.time_range === 'string' ? o.time_range : undefined,
        raw: typeof o.subject === 'string' ? o.subject : typeof o.school === 'string' ? o.school : undefined,
      }
      if (item.school || item.degree || item.major || item.startDate || item.raw) out.push(item)
    }
    if (out.length) return out
  }
  const educationLevel = pickMapped(mapped, ['education_level'])
  return educationLevel ? [{ degree: educationLevel, raw: educationLevel }] : undefined
}

function pullContactFromUserConcat(mapped: Record<string, string>) {
  const arr = safeJsonArray(pickMapped(mapped, ['user_concat', 'contacts', 'contact_list']))
  const out: { email?: string; phone?: string; address?: string } = {}
  for (const it of arr || []) {
    const o = it as Record<string, unknown>
    const type = typeof o.type === 'string' ? o.type.toLowerCase() : ''
    const value = typeof o.value === 'string' ? o.value.trim() : ''
    if (!value) continue
    if (type === 'email' && !out.email) out.email = value
    else if (type === 'phone' && !out.phone) out.phone = value
    else if (type === 'address' && !out.address) out.address = value
  }
  return out
}

function parseStructuredResumeRow(text: string): Omit<ParsedResume, 'textContent'> | null {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return null

  const header = lines[0]
  const value = lines[1]
  const delimiter: ',' | '\t' = header.includes('\t') ? '\t' : ','
  if (!header.includes(delimiter) || !value.includes(delimiter)) return null

  const headCols = splitDelimitedLine(header, delimiter).map(normalizeFieldKey)
  const valCols = splitDelimitedLine(value, delimiter)
  if (headCols.length < 5 || valCols.length < 3) return null

  const hints = [
    'first_name',
    'last_name',
    'full_name',
    'email',
    'phone',
    'city',
    'country',
    'work_years',
    'summary',
    'user_name',
    'user_concat',
    'education_experience',
    'work_experience',
    'personal_statement',
  ]
  if (!headCols.some((h) => hints.includes(h))) return null

  const mapped: Record<string, string> = {}
  for (let i = 0; i < Math.min(headCols.length, valCols.length); i++) {
    const key = headCols[i]
    if (!key) continue
    mapped[key] = valCols[i] || ''
  }

  const firstName = pickMapped(mapped, ['first_name', 'firstname', 'given_name'])
  const lastName = pickMapped(mapped, ['last_name', 'lastname', 'family_name', 'surname'])
  const fullName = pickMapped(mapped, ['full_name', 'name', 'candidate_name'])
  const name = fullName || [firstName, lastName].filter(Boolean).join(' ').trim() || undefined

  const contact = pullContactFromUserConcat(mapped)
  const workYearsRaw = pickMapped(mapped, [
    'work_years',
    'work_experience_years',
    'years_experience',
    'experience_years',
    'total_experience_years',
  ])
  const workYears = rangeTextToYears(workYearsRaw)

  const education = buildEducationFromStandardized(mapped)
  const summaryRaw = pickMapped(mapped, [
    'summary',
    'professional_summary',
    'profile_summary',
    'intro_summary_original',
    'self_introduction',
    'about_me',
    'personal_statement',
    'work_industry',
    'work_skills',
  ])
  const introSummaryOriginal = summaryRaw || pickMapped(mapped, ['resume_text', 'raw_text'])?.slice(0, 520)

  return {
    name: name || pickMapped(mapped, ['user_name']),
    country: pickMapped(mapped, ['country', 'nation', 'nationality']),
    city: pickMapped(mapped, ['city', 'location_city']),
    email: pickMapped(mapped, ['email', 'email_address']) || contact.email,
    whatsapp: pickMapped(mapped, ['whatsapp', 'whatsapp_number']),
    phone: pickMapped(mapped, ['phone', 'phone_number', 'mobile']) || contact.phone,
    workYears: typeof workYears === 'number' && Number.isFinite(workYears) ? workYears : undefined,
    education,
    introSummaryOriginal,
    introLanguage: undefined,
  }
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
      if (parts.length >= 2) return { city: parts[0], country: parts[parts.length - 1] }
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
  if (!candidates.length) return undefined
  return Math.max(...candidates)
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
    const parts = line.split(/[,，|]/).map((p) => p.trim()).filter(Boolean)
    const school = parts[0]
    const degree = parts.find((p) => /(BSc|MSc|PhD|Bachelor|Master|Doctor|本科|硕士|博士|学士|研究生)/i.test(p))
    items.push({ school, degree, raw: line })
  }
  return items.length ? items : undefined
}

export async function extractTextFromFile(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) {
    const data = await pdfParse(buffer)
    return data.text || ''
  }
  if (lower.endsWith('.docx')) {
    const res = await mammoth.extractRawText({ buffer })
    return res.value || ''
  }
  return buffer.toString('utf-8')
}

export function parseResumeText(text: string): Omit<ParsedResume, 'textContent'> {
  const normalized = normalizeWhitespace(text)
  const structured = parseStructuredResumeRow(normalized)
  const name = structured?.name || extractName(normalized)
  const loc = extractLocation(normalized)
  const country = structured?.country || loc.country
  const city = structured?.city || loc.city
  const email = structured?.email || extractEmail(normalized)
  const whatsapp = structured?.whatsapp || extractWhatsApp(normalized)
  const phone = structured?.phone || extractPhone(normalized)
  const workYears = structured?.workYears ?? extractWorkYears(normalized)
  const education = structured?.education || extractEducation(normalized)
  const introSummaryOriginal = structured?.introSummaryOriginal || buildIntroSummary(normalized)
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
