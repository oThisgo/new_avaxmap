import { db } from '@/lib/db/pool'
import { decryptFieldOrNull } from '@/lib/security/crypto'
import { SUICIDE_SYMPTOM_OPTIONS } from '@/lib/analytics/mental-health-definition'
import type { MentalHealthAnswers } from '@/lib/analytics/mental-health'

/**
 * Casos com indicador de risco de suicídio de um mapeamento.
 *
 * Consulta feita direto das respostas brutas (`mental_health_answers`), não do
 * cache derivado: é a fonte da verdade e não depende de o cache ter sido
 * gravado. Fica isolada aqui porque duas rotas precisam do mesmo recorte com
 * exposições diferentes — a de contagem (sem dado pessoal, para o indicador da
 * aba) e a de listagem (com dado pessoal, atrás da confirmação de senha).
 */

export interface SuicideRiskCase {
  collaborator_id: string
  name: string | null
  email: string | null
  birth_date: string | null
  gender: string | null
  area: string | null
  role: string | null
  /** Rótulos dos indicadores marcados (ideação, plano, tentativa...). */
  exposures: string[]
  submitted_at: string
}

interface RiskRow {
  collaborator_id: string
  name: string | null
  email: string | null
  birth_date: string | null
  gender: string | null
  area: string | null
  role: string | null
  mental_health_answers: unknown
  submitted_at: unknown
}

function toIsoString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  return ''
}

/** Indicadores marcados, em rótulos legíveis, na ordem canônica do instrumento. */
function readExposures(answers: unknown): string[] {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return []
  const typed = answers as MentalHealthAnswers

  return SUICIDE_SYMPTOM_OPTIONS
    .filter((option) => typed[option.field] === true)
    .map((option) => option.label)
}

/**
 * Linhas brutas de risco do mapeamento, já ordenadas da mais recente para a
 * mais antiga. Os campos pessoais continuam cifrados aqui — quem decide expor
 * é o chamador (ver `toSuicideRiskCase`).
 */
async function fetchRiskRows(mappingId: string): Promise<RiskRow[]> {
  const rows = await db
    .selectFrom('responses')
    .innerJoin('collaborators', 'collaborators.id', 'responses.collaborator_id')
    .select([
      'responses.collaborator_id',
      'responses.mental_health_answers',
      'responses.submitted_at',
      'collaborators.name',
      'collaborators.email',
      'collaborators.birth_date',
      'collaborators.gender',
      'collaborators.area',
      'collaborators.role',
    ])
    .where('collaborators.mapping_id', '=', mappingId)
    .where('responses.mental_health_answers', 'is not', null)
    .orderBy('responses.submitted_at', 'desc')
    .execute()

  return rows as unknown as RiskRow[]
}

/**
 * Nome, e-mail e data de nascimento são gravados cifrados (AES-256-GCM); só
 * este ponto, já atrás da confirmação de senha, os decifra.
 */
function toSuicideRiskCase(row: RiskRow, exposures: string[]): SuicideRiskCase {
  return {
    collaborator_id: row.collaborator_id,
    name: decryptFieldOrNull(row.name),
    email: decryptFieldOrNull(row.email),
    birth_date: decryptFieldOrNull(row.birth_date),
    gender: row.gender,
    area: row.area,
    role: row.role,
    exposures,
    submitted_at: toIsoString(row.submitted_at),
  }
}

export async function listSuicideRiskCases(mappingId: string): Promise<SuicideRiskCase[]> {
  const rows = await fetchRiskRows(mappingId)
  const cases: SuicideRiskCase[] = []

  for (const row of rows) {
    const exposures = readExposures(row.mental_health_answers)
    if (exposures.length === 0) continue
    cases.push(toSuicideRiskCase(row, exposures))
  }

  return cases
}

export interface SuicideRiskCounts {
  total: number
  /** Casos registrados depois da última vez que este gestor abriu a aba. */
  unseen: number
  latestAt: string | null
}

/**
 * Contagens para o indicador da aba. Não decifra nem devolve nenhum dado
 * pessoal — é o que permite mostrar a notificação sem exigir a senha.
 */
export async function countSuicideRiskCases(
  mappingId: string,
  lastSeenAt: Date | null,
): Promise<SuicideRiskCounts> {
  const rows = await fetchRiskRows(mappingId)

  let total = 0
  let unseen = 0
  let latestAt: string | null = null

  for (const row of rows) {
    if (readExposures(row.mental_health_answers).length === 0) continue

    total++
    const submittedAt = toIsoString(row.submitted_at)
    if (!latestAt && submittedAt) latestAt = submittedAt
    if (!lastSeenAt || (submittedAt && new Date(submittedAt) > lastSeenAt)) unseen++
  }

  return { total, unseen, latestAt }
}
