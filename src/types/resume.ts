export type ParseStatus = 'processing' | 'success' | 'failed'
export type SourceType = 'upload' | 'url'

export type EducationItem = {
  school?: string
  degree?: string
  major?: string
  startDate?: string
  endDate?: string
  raw?: string
}

export type ResumeListItem = {
  id: string
  name: string | null
  country: string | null
  city: string | null
  email: string | null
  whatsapp: string | null
  phone: string | null
  work_years: number | null
  parse_status: ParseStatus
  parse_error: string | null
  created_at: string
  updated_at: string
}

export type ResumeDetail = ResumeListItem & {
  source_type: SourceType
  source_url: string | null
  storage_bucket: string
  storage_path: string
  original_filename: string | null
  intro_summary_original: string | null
  intro_language: string | null
  education: EducationItem[] | null
  text_content?: string | null
}
