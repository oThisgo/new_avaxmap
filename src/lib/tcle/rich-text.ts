const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'mark',
  'ul',
  'ol',
  'li',
  'span',
])

/**
 * O separador de parágrafo padrão do contentEditable varia por navegador —
 * historicamente o Chrome usa `<div>` a cada Enter quando
 * `document.execCommand('defaultParagraphSeparator')` não foi forçado para
 * 'p' (ver TcleEditor). Sem este alias, `<div>` cai fora de ALLOWED_TAGS e é
 * removido pelo laço abaixo — não só a tag, o parágrafo inteiro perde a quebra
 * e cola no texto anterior, sem nem um espaço no lugar. Tratar `<div>` como
 * `<p>` evita esse "some o parágrafo" tanto pro editor quanto pra qualquer
 * HTML colado de outra origem.
 */
const TAG_ALIASES: Record<string, string> = { div: 'p' }

const TEXT_ALIGN_VALUES = new Set(['left', 'right', 'center', 'justify'])

function sanitizeAttributes(tag: string, rawAttrs: string): string {
  const styleMatch = rawAttrs.match(/\sstyle\s*=\s*(["'])(.*?)\1/i)
  if (!styleMatch) return ''
  const rawStyle = styleMatch[2]

  if (tag === 'span') {
    const backgroundColorMatch = rawStyle.match(/background-color\s*:\s*([^;]+)/i)
    if (!backgroundColorMatch) return ''

    const color = backgroundColorMatch[1].trim()
    if (!/^#[0-9a-fA-F]{3,8}$/.test(color) && !/^rgb(a)?\([^)]+\)$/.test(color)) return ''

    return ` style="background-color: ${color}"`
  }

  if (tag === 'p') {
    const alignMatch = rawStyle.match(/text-align\s*:\s*([^;]+)/i)
    if (!alignMatch) return ''

    const align = alignMatch[1].trim().toLowerCase()
    if (!TEXT_ALIGN_VALUES.has(align)) return ''

    return ` style="text-align: ${align}"`
  }

  return ''
}

export function sanitizeRichTextHtml(input: string): string {
  if (!input) return ''

  let html = input
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi, '')

  html = html.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, tagName: string, attrs: string) => {
    const rawTag = tagName.toLowerCase()
    const tag = TAG_ALIASES[rawTag] ?? rawTag
    const isClosing = full.startsWith('</')

    if (!ALLOWED_TAGS.has(tag)) return ''
    if (isClosing) return `</${tag}>`
    if (tag === 'br') return '<br>'

    const safeAttrs = sanitizeAttributes(tag, attrs)
    return `<${tag}${safeAttrs}>`
  })

  return html.trim()
}

export function stripRichText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()
}

export function isRichTextEmpty(html: string): boolean {
  return stripRichText(html).length === 0
}
