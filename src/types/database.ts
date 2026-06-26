export type ModuleType = 'HSE' | 'REMOTE'
export type MappingStatus = 'draft' | 'active' | 'archived'

export type HseClass = 'Baixo risco' | 'Risco moderado' | 'Alto risco'
export type RemoteClass = 'Condição adequada' | 'Zona de atenção' | 'Situação de risco'

// ─── Tabelas ─────────────────────────────────────────────────────────────────

export interface Collaborator {
  id: string
  mapping_id?: string | null
  cpf?: string | null
  name?: string | null
  email?: string | null
  has_answered: boolean
  created_at: string
  updated_at: string

  // Campos organizacionais vindos do CSV
  area?: string | null
  role?: string | null
  employment_type?: string | null
  organization?: string | null

  // Sociodemográficos (preenchidos após submissão do formulário)
  birth_date?: string | null
  gender?: string | null
  race_color?: string | null
  marital_status?: string | null
  education_level?: string | null
  disability?: string | null
  which_disability?: string | null
  remote_status?: string | null
}

export interface AnswerRecord {
  questionCode: string
  rawValue: string | null
  numericValue: number | null
  riskValue: number | null
}

export interface DomainRecord {
  domain: string
  weight: number
  score: number
  weightedScore: number
}

export interface Response {
  id: string
  collaborator_id: string
  submitted_at: string
  completion_percent?: number | null
  // Respostas brutas por questão
  answers?: AnswerRecord[] | null
  // Scores por domínio
  hse_domains?: DomainRecord[] | null
  remote_domains?: DomainRecord[] | null
  // Resultado final
  hse_score?: number | null
  hse_class?: HseClass | null
  remote_score?: number | null
  remote_class?: RemoteClass | null
  job_observations?: string | null
  created_at: string
}

export interface Manager {
  id: string
  name: string
  email: string
  password_hash: string
  is_active: boolean
  created_at: string
}

export interface Tenant {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
}

export interface TenantManager {
  id: string
  tenant_id: string
  manager_id: string
  role: string
  created_at: string
}

export interface Mapping {
  id: string
  tenant_id: string
  name: string
  slug: string
  description?: string | null
  status: MappingStatus
  module_type?: ModuleType | null
  is_demo: boolean
  tcle_text?: string | null
  csv_columns?: string[] | null
  config?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface MappingManager {
  id: string
  mapping_id: string
  manager_id: string
  role: string
  created_at: string
}

// ─── Tipo para o Supabase client tipado ──────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      collaborators: {
        Row: Collaborator
        Insert: Omit<Collaborator, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Collaborator, 'id' | 'created_at'>>
      }
      responses: {
        Row: Response
        Insert: Omit<Response, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<Response, 'id' | 'created_at'>>
      }
      response_answers: {
        Row: Record<string, never>
        Insert: Record<string, never>
        Update: Record<string, never>
      }
      domain_scores: {
        Row: Record<string, never>
        Insert: Record<string, never>
        Update: Record<string, never>
      }
      response_results: {
        Row: Record<string, never>
        Insert: Record<string, never>
        Update: Record<string, never>
      }
      managers: {
        Row: Manager
        Insert: Omit<Manager, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<Manager, 'id' | 'created_at'>>
      }
      tenants: {
        Row: Tenant
        Insert: Omit<Tenant, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<Tenant, 'id' | 'created_at'>>
      }
      tenant_managers: {
        Row: TenantManager
        Insert: Omit<TenantManager, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<TenantManager, 'id' | 'created_at'>>
      }
      mappings: {
        Row: Mapping
        Insert: Omit<Mapping, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Mapping, 'id' | 'created_at' | 'updated_at'>>
      }
      mapping_managers: {
        Row: MappingManager
        Insert: Omit<MappingManager, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<MappingManager, 'id' | 'created_at'>>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
