import type { TallyField, TallyWebhookPayload } from './types'

// Nomes técnicos por módulo
const HSE_CODES = Array.from({ length: 35 }, (_, i) => `Q${String(i + 1).padStart(2, '0')}`)
const REMOTE_CODES = Array.from({ length: 16 }, (_, i) => `TR${String(i + 1).padStart(2, '0')}`)
const SOCIO_CODES = ['marital_status', 'education_level', 'disability', 'which_disability', 'remote_status', 'job_observations']

/**
 * Busca um campo pelo nome técnico (key ou label), de forma insensível a maiúsculas.
 */
function findField(fields: TallyField[], code: string): TallyField | undefined {
  const lower = code.toLowerCase()
  return fields.find(
    (f) =>
      f.key === code ||
      f.key?.toLowerCase() === lower ||
      f.label === code ||
      f.label?.toLowerCase() === lower,
  )
}

/**
 * Extrai o valor legível de um campo.
 *
 * O Tally envia DROPDOWN e MULTIPLE_CHOICE com array de UUIDs de opção em `value`.
 * Precisamos resolver esses UUIDs para o texto correspondente em `options`.
 *
 * Para INPUT_DATE, HIDDEN_FIELDS e INPUT_TEXT o valor já vem como string.
 */
function extractString(field: TallyField | undefined): string | null {
  if (!field) return null
  if (field.value === null || field.value === undefined) return null

  // Campos que enviam UUIDs de opções selecionadas
  if (Array.isArray(field.value) && field.value.length > 0) {
    const selectedId = String(field.value[0])

    // Resolve UUID → texto usando o array options do próprio campo
    if (Array.isArray(field.options) && field.options.length > 0) {
      const matched = field.options.find((o) => o.id === selectedId)
      if (matched) return matched.text.trim() || null
    }

    // Fallback: o item já é texto (não UUID)
    return selectedId.trim() || null
  }

  if (typeof field.value === 'string') return field.value.trim() || null

  return String(field.value).trim() || null
}

/**
 * Remove texto entre parênteses (e espaços extras) de um valor extraído.
 * Ex.: "Mulher cisgênero (que se identifica...)" → "Mulher cisgênero"
 */
function stripParenthetical(value: string | null): string | null {
  if (!value) return value
  return value.replace(/\s*\(.*?\)\s*$/, '').trim() || null
}

export interface ParsedTallyPayload {
  userId: string | null
  socio: Record<string, string | null>
  hse: Record<string, string | null>
  remote: Record<string, string | null>
  jobObservations: string | null
  submittedAt: string
  rawFields: TallyField[]
}

export function parseTallyPayload(payload: TallyWebhookPayload): ParsedTallyPayload {
  const fields = payload.data?.fields ?? []

  const userId = extractString(findField(fields, 'user_id'))

  const socio: Record<string, string | null> = {}
  for (const code of SOCIO_CODES) {
    const raw = extractString(findField(fields, code))
    socio[code] = code === 'gender' ? stripParenthetical(raw) : raw
  }

  const hse: Record<string, string | null> = {}
  for (const code of HSE_CODES) {
    hse[code] = extractString(findField(fields, code))
  }

  const remote: Record<string, string | null> = {}
  for (const code of REMOTE_CODES) {
    remote[code] = extractString(findField(fields, code))
  }

  return {
    userId,
    socio,
    hse,
    remote,
    jobObservations: extractString(findField(fields, 'job_observations')),
    submittedAt: payload.data?.createdAt ?? payload.createdAt,
    rawFields: fields,
  }
}
