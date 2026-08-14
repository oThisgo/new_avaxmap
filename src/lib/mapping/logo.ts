/**
 * Logo do cliente exibida nas telas do mapeamento.
 *
 * O valor guardado em `mappings.logo_url` é uma data URI da imagem já
 * redimensionada no navegador (ver LogoUploadField). O nome da coluna é
 * genérico de propósito: se um dia a imagem passar a viver em object storage,
 * muda só a string gravada — nada mais nesta cadeia precisa mudar.
 *
 * A validação abaixo roda no servidor, não só na UI: a data URI é devolvida
 * para o navegador de outras pessoas, então o que entra precisa ser
 * comprovadamente uma imagem raster.
 */

/** Tamanho máximo da data URI aceita (~200 KB de string base64). */
export const MAX_LOGO_DATA_URL_BYTES = 200 * 1024

/**
 * SVG fica de fora de propósito: é um documento que pode carregar script, e
 * aqui a imagem é enviada por um usuário e servida a outros.
 */
const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const

export const ALLOWED_LOGO_MIME: readonly string[] = ALLOWED_IMAGE_MIME
export const ALLOWED_LOGO_ACCEPT = ALLOWED_IMAGE_MIME.join(',')

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/

/**
 * Aceita uma data URI de imagem raster ou uma URL https (caminho de evolução
 * para object storage). Qualquer outra coisa vira `null` — inclusive string
 * vazia, que é como a UI sinaliza "remover a logo".
 */
export function normalizeLogoUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('data:')) {
    if (trimmed.length > MAX_LOGO_DATA_URL_BYTES) return null
    return DATA_URL_PATTERN.test(trimmed) ? trimmed : null
  }

  if (/^https:\/\/[^\s]+$/i.test(trimmed) && trimmed.length <= 2048) return trimmed

  return null
}

/** Mensagem única para UI e API, para as duas pontas recusarem pelo mesmo motivo. */
export const LOGO_REJECTED_MESSAGE =
  `Envie uma imagem PNG, JPEG ou WebP de até ${Math.round(MAX_LOGO_DATA_URL_BYTES / 1024)} KB.`
