export type QuestionOverrides = {
  order: string[]
  text: Record<string, string>
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

/**
 * Valida order/text vindos de mapping.config (ou do payload de criação) contra a lista
 * canônica de códigos do módulo. Códigos desconhecidos são descartados; códigos válidos
 * ausentes de `rawOrder` são anexados ao final, garantindo que `order` sempre contenha
 * exatamente `validCodes` (mesmo conjunto, possivelmente reordenado).
 */
export function normalizeQuestionOverrides(
  rawOrder: unknown,
  rawText: unknown,
  validCodes: readonly string[],
): QuestionOverrides {
  const validSet = new Set(validCodes)

  const requestedOrder = normalizeStringArray(rawOrder).filter((code) => validSet.has(code))
  const seen = new Set(requestedOrder)
  const order = [...requestedOrder, ...validCodes.filter((code) => !seen.has(code))]

  const text: Record<string, string> = {}
  if (rawText && typeof rawText === 'object' && !Array.isArray(rawText)) {
    for (const [code, value] of Object.entries(rawText as Record<string, unknown>)) {
      if (!validSet.has(code) || typeof value !== 'string') continue
      const trimmed = value.trim()
      if (trimmed.length > 0) text[code] = trimmed
    }
  }

  return { order, text }
}

/**
 * Aplica ordem custom + enunciados customizados a uma lista base de perguntas.
 * Códigos de `overrides.order` ausentes de `base` são ignorados, e qualquer código de
 * `base` que não apareça em `overrides.order` (config incompleta/desatualizada) é
 * anexado ao final — a lista retornada sempre contém todas as perguntas de `base`.
 */
export function applyQuestionOverrides<T extends { code: string; text: string }>(
  base: readonly T[],
  overrides: QuestionOverrides,
): T[] {
  const byCode = new Map(base.map((q) => [q.code, q]))
  const seen = new Set<string>()
  const withText = (q: T) => {
    const customText = overrides.text[q.code]
    return customText ? { ...q, text: customText } : q
  }

  const ordered: T[] = []
  for (const code of overrides.order) {
    const q = byCode.get(code)
    if (!q || seen.has(code)) continue
    seen.add(code)
    ordered.push(withText(q))
  }
  for (const q of base) {
    if (seen.has(q.code)) continue
    ordered.push(withText(q))
  }
  return ordered
}
