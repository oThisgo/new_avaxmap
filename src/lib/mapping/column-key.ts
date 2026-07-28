const CUSTOM_FIELD_PREFIX = 'custom:'

/**
 * Deterministic slug for a CSV header, used both when writing a collaborator's
 * custom-column value (upload-collaborators route) and when reading it back
 * (mapping config normalization, demographics/filters routes). Must stay in
 * sync between writer and reader since no separate slug->header map is stored.
 */
export function slugifyColumnKey(header: string): string {
  const slug = header
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || 'coluna'
}

export function toCustomFieldKey(header: string): string {
  return `${CUSTOM_FIELD_PREFIX}${slugifyColumnKey(header)}`
}

export function isCustomFieldKey(key: string): boolean {
  return key.startsWith(CUSTOM_FIELD_PREFIX)
}

export function customFieldSlug(key: string): string {
  return key.slice(CUSTOM_FIELD_PREFIX.length)
}
