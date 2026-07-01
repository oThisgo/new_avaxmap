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

function sanitizeAttributes(tag: string, rawAttrs: string): string {
  if (tag !== 'span') return ''

  const styleMatch = rawAttrs.match(/\sstyle\s*=\s*(["'])(.*?)\1/i)
  if (!styleMatch) return ''

  const rawStyle = styleMatch[2]
  const backgroundColorMatch = rawStyle.match(/background-color\s*:\s*([^;]+)/i)
  if (!backgroundColorMatch) return ''

  const color = backgroundColorMatch[1].trim()
  if (!/^#[0-9a-fA-F]{3,8}$/.test(color) && !/^rgb(a)?\([^)]+\)$/.test(color)) return ''

  return ` style="background-color: ${color}"`
}

export function sanitizeRichTextHtml(input: string): string {
  if (!input) return ''

  let html = input
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi, '')

  html = html.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase()
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
