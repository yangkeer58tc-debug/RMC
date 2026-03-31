export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      resumes: {
        Row: {
          id: string
          source_type: 'upload' | 'url'
          source_url: string | null
          storage_bucket: string
          storage_path: string
          original_filename: string | null
          text_content: string | null
          name: string | null
          country: string | null
          city: string | null
          email: string | null
          whatsapp: string | null
          phone: string | null
          work_years: number | null
          education: Json | null
          intro_summary_original: string | null
          intro_language: string | null
          parse_status: 'processing' | 'success' | 'failed'
          parse_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          source_type: 'upload' | 'url'
          source_url?: string | null
          storage_bucket?: string
          storage_path: string
          original_filename?: string | null
          text_content?: string | null
          name?: string | null
          country?: string | null
          city?: string | null
          email?: string | null
          whatsapp?: string | null
          phone?: string | null
          work_years?: number | null
          education?: Json | null
          intro_summary_original?: string | null
          intro_language?: string | null
          parse_status?: 'processing' | 'success' | 'failed'
          parse_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          source_type?: 'upload' | 'url'
          source_url?: string | null
          storage_bucket?: string
          storage_path?: string
          original_filename?: string | null
          text_content?: string | null
          name?: string | null
          country?: string | null
          city?: string | null
          email?: string | null
          whatsapp?: string | null
          phone?: string | null
          work_years?: number | null
          education?: Json | null
          intro_summary_original?: string | null
          intro_language?: string | null
          parse_status?: 'processing' | 'success' | 'failed'
          parse_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

