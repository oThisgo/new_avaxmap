/**
 * BeeTouch Risk Report — PPTX Generator v2
 * Modern brand identity: cream/navy palette, chevron motifs, section structure,
 * muted risk colors, and data-driven narrative text on every slide.
 */

import PptxGenJS from 'pptxgenjs'
import JSZip from 'jszip'
import fs from 'node:fs'
import path from 'node:path'

/* ─── Brand asset loader ─────────────────────────────────────────────────────
   Reads logo image files from public/images/ at report generation time.
   Place these files in the project:
     public/images/beetouch-logo.png    ← full horizontal logo (symbol + name)
     public/images/beetouch-symbol.png  ← icon/symbol only (square format)
   Client logos: PNG transparent bg, 400–800 px wide recommended.
─────────────────────────────────────────────────────────────────────────── */
interface BrandAssets {
  logoB64:   string | null
  symbolB64: string | null
  patternB64: string | null
}

async function forceNoAutofitInSlides(pptxBytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(Buffer.from(pptxBytes))
  const slideFiles = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))

  for (const name of slideFiles) {
    const file = zip.file(name)
    if (!file) continue

    const xml = await file.async('string')
    const patched = xml.replace(/<a:bodyPr([^>]*)>([\s\S]*?)<\/a:bodyPr>/g, (_m, attrs, inner) => {
      let nextInner = String(inner).replace(/<a:normAutofit(?:\s[^>]*)?\/>/g, '<a:noAutofit/>')
      if (!/<a:(?:noAutofit|spAutoFit|normAutofit)\b/.test(nextInner)) {
        nextInner += '<a:noAutofit/>'
      }
      return `<a:bodyPr${attrs}>${nextInner}</a:bodyPr>`
    })

    if (patched !== xml) zip.file(name, patched)
  }

  const out = await zip.generateAsync({ type: 'nodebuffer' })
  return out as unknown as Uint8Array
}

function loadBrandAsset(filename: string): string | null {
  try {
    const fp   = path.join(process.cwd(), 'public', 'images', filename)
    if (!fs.existsSync(fp)) return null
    const ext  = path.extname(filename).toLowerCase().replace('.', '')
    const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png'
    return `data:${mime};base64,${fs.readFileSync(fp).toString('base64')}`
  } catch {
    return null
  }
}

function loadFirstExistingBrandAsset(filenames: string[]): string | null {
  for (const filename of filenames) {
    const asset = loadBrandAsset(filename)
    if (asset) return asset
  }
  return null
}

function getBrandAssets(): BrandAssets {
  // Always resolve from disk so newly added images are picked up without server restart.
  return {
    logoB64: loadFirstExistingBrandAsset([
      'beetouch-logo.png',
      'beetouch-logo.jpg',
      'beetouch-logo.jpeg',
      'beetouch-logo.webp',
      'beetouch_logo.png',
      'beetouch_logo.jpg',
      'beetouch_logo.jpeg',
      'beetouch-logo.PNG',
      'beetouch-logo.JPG',
      'beetouch-logo.JPEG',
    ]),
    symbolB64: loadFirstExistingBrandAsset([
      'beetouch-symbol.png',
      'beetouch-symbol.jpg',
      'beetouch-symbol.jpeg',
      'beetouch-symbol.webp',
      'beetouch_symbol.png',
      'beetouch-symbol.PNG',
    ]),
    patternB64: loadFirstExistingBrandAsset([
      'beetouch-pattern.png',
      'beetouch-pattern.jpg',
      'beetouch-pattern.jpeg',
      'beetouch-pattern.webp',
      'beetouch_pattern.png',
      'beetouch-pattern.PNG',
    ]),
  }
}

/* ─── Brand palette ──────────────────────────────────────────────────────────
   Sourced from BeeTouch brand imagery: deep navy primary, warm cream light bg,
   brand mint accent (used on dark), electric blue for dynamic elements.
─────────────────────────────────────────────────────────────────────────── */
const C = {
  // Cover / dark backgrounds (reference palette)
  bg:      '032C39',   // primary dark — cover + divider bg
  navy:    '062F47',   // secondary dark panel
  navSub:  '0A3A56',   // decorative element on dark

  // Brand accents (reference image exact values)
  blue:    '1767F3',   // electric blue — primary accent
  blue2:   '36A2EB',   // lighter mid-blue
  blue3:   '6DC0E8',   // pale accent blue
  bluePale:'EAF3F8',   // very light tint (icon backgrounds)

  // Content slide backgrounds
  cream:   'F8FAFB',   // cool off-white content bg
  smoke:   'EAF3F8',   // light blue-gray alternate rows
  white:   'FFFFFF',

  // Typography
  textDk:  '032C39',
  textMd:  '647488',
  textLt:  '9AABB8',
  border:  'E2EBF0',

  // Risk — reference image exact values
  high:    'F73538',
  mod:     'F7B955',
  low:     '6CAF5D',

  // Risk tints
  highLt:  'FFF2F2',
  modLt:   'FFFCF0',
  lowLt:   'F2FAF0',

  // Legacy aliases — referenced throughout existing slides
  nav:     '032C39',   // ≡ bg
  nav2:    '062F47',   // ≡ navy
  mint:    '1767F3',   // old mint → electric blue
  mintDk:  '36A2EB',   // old mintDk → lighter blue
}

/* ─── Layout ─────────────────────────────────────────────────────────────── */
const W    = 13.33   // slide width  (LAYOUT_WIDE)
const H    = 7.5     // slide height
const MX   = 0.62   // content left margin
const RX   = 0.45   // content right margin
const CW   = W - MX - RX
const BARW = 0.07   // left accent bar width

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Slide = any

interface Distribution { name: string; value: number }

/* ─── Exported types ──────────────────────────────────────────────────────── */
export interface StratumRow {
  name:       string
  total:      number
  answered:   number
  hseAvg:     number | null
  hseClass:   string | null
  highPct:    number
  modPct:     number
  lowPct:     number
  domainAvgs: Record<string, number | null>
}

export interface IetrStratumRow {
  name:       string
  answered:   number
  ietrAvg:    number | null
  ietrClass:  string | null
  highPct:    number
  modPct:     number
  lowPct:     number
  domainAvgs: Record<string, number | null>
}

export interface HseStratifiedSlice {
  stratum: string
  stratumLabel: string
  stratumRows: StratumRow[]
}

export interface IetrStratifiedSlice {
  stratum: string
  stratumLabel: string
  ietrStratumRows: IetrStratumRow[]
}

export interface ReportPayload {
  clientName:        string
  clientDescription: string
  stratum:           string
  stratumLabel:      string
  generatedAt:       string
  filters:           Record<string, string>
  reportVariantLabel?: string
  totalCollabs:      number
  totalAnswered:     number
  genderDist:        Distribution[]
  raceDist:          Distribution[]
  ageRangeDist:      Distribution[]
  employDist:        Distribution[]
  educationDist:     Distribution[]
  maritalDist:       Distribution[]
  disabilityDist:    Distribution[]
  disabilityTypeDist: Distribution[]
  hseAvg:            number | null
  hseClassDist:      Distribution[]
  domainAvgs:        { domain: string; avg: number }[]
  stratumRows:       StratumRow[]
  hseDomains:        string[]
  hasIetr:           boolean
  ietrAvg:           number | null
  ietrClassDist:     Distribution[]
  ietrDomains:       string[]
  ietrDomainAvgs:    { domain: string; avg: number }[]
  ietrStratumRows:   IetrStratumRow[]
  stratifiedHse?:    HseStratifiedSlice[]
  stratifiedIetr?:   IetrStratifiedSlice[]
  clientLogoBase64?: string
}

/* ─── Risk helpers ────────────────────────────────────────────────────────── */
function riskColor(avg: number): string {
  if (avg >= 2.5) return C.high
  if (avg >= 1.5) return C.mod
  return C.low
}

function riskLabel(avg: number): string {
  if (avg >= 2.5) return 'Alto risco'
  if (avg >= 1.5) return 'Risco moderado'
  return 'Baixo risco'
}

function riskLightBg(avg: number): string {
  if (avg >= 2.5) return C.highLt
  if (avg >= 1.5) return C.modLt
  return C.lowLt
}

function ietrColor(avg: number): string {
  if (avg >= 4) return C.low
  if (avg >= 3) return C.mod
  return C.high
}

function ietrLabel(avg: number): string {
  if (avg >= 4) return 'Condição adequada'
  if (avg >= 3) return 'Zona de atenção'
  return 'Situação de risco'
}

function trunc1(value: number): number {
  return Math.trunc(value * 10) / 10
}

function pct1(part: number, total: number): number {
  return total > 0 ? trunc1((part / total) * 100) : 0
}

function fmtPct(value: number): string {
  return `${value.toFixed(1).replace('.', ',')}%`
}

function dominantRiskDisplay(top: { highPct: number; modPct: number }) {
  if (top.highPct > 0) {
    return { pct: top.highPct, color: C.high }
  }

  return { pct: top.modPct, color: C.mod }
}

/* ─── Dynamic narrative builder ──────────────────────────────────────────── */
function buildHseNarrative(data: ReportPayload): string {
  const { totalAnswered, totalCollabs, hseAvg, hseClassDist, domainAvgs, stratumRows, stratumLabel } = data
  const rate      = pct1(totalAnswered, totalCollabs)
  const highN     = hseClassDist.find(d => d.name === 'Alto risco')?.value ?? 0
  const modN      = hseClassDist.find(d => d.name === 'Risco moderado')?.value ?? 0
  const lowN      = hseClassDist.find(d => d.name === 'Baixo risco')?.value ?? 0
  const total     = highN + modN + lowN
  const highPct   = pct1(highN, total)
  const modPct    = pct1(modN, total)
  const lowPct    = pct1(lowN, total)
  const topDoms   = [...domainAvgs].sort((a, b) => b.avg - a.avg).slice(0, 3)
  const highAreas = stratumRows.filter(r => r.hseAvg !== null && r.hseAvg >= 2.5).length

  const lines: string[] = []

  if (hseAvg !== null) {
    lines.push(
      `O mapeamento conduzido em ${data.clientName} contou com ${totalAnswered} respondentes (${fmtPct(rate)} dos `
      + `${totalCollabs} colaboradores elegíveis). O score médio geral de ${hseAvg.toFixed(2)} na escala HSE `
      + `(0 a 4) classifica a organização em situação de ${riskLabel(hseAvg).toLowerCase()}.`,
    )
  }

  if (total > 0) {
    const areaMsg = highAreas > 0
      ? `Ao estratificar por ${stratumLabel.toLowerCase()}, ${highAreas} grupo(s) apresentaram classificação de alto risco.`
      : `Nenhum grupo por ${stratumLabel.toLowerCase()} atingiu classificação global de alto risco.`
    lines.push(
      `A distribuição por faixa de risco aponta que ${fmtPct(highPct)} dos respondentes estão em zona de alto risco, `
      + `${fmtPct(modPct)} em risco moderado e ${fmtPct(lowPct)} em baixo risco. ${areaMsg}`,
    )
  }

  if (topDoms.length > 0) {
    const domStr = topDoms.map(d => `${d.domain} (${d.avg.toFixed(2)})`).join(', ')
    lines.push(
      `Os domínios com maiores níveis de exposição são: ${domStr}. Esses fatores demandam atenção `
      + `prioritária na elaboração do Plano de Ação, conforme previsto pela NR-1 (Portaria MTE n 1.419/2024) `
      + `e pelas diretrizes da ISO 45003:2021.`,
    )
  }

  return lines.join('\n\n')
}

/* ─── SVG icon helpers ───────────────────────────────────────────────────────
   Generates Lucide-style outline SVGs as base64 data URIs for addImage().
   Modern PowerPoint embeds SVG natively; pptxgenjs falls back to Sharp/canvas.
─────────────────────────────────────────────────────────────────────────── */
type IconType =
  | 'people'
  | 'chart-bars'
  | 'graduation-cap'
  | 'alert-tri'
  | 'alert-circle'
  | 'check-circle'
  | 'sliders'
  | 'user'
  | 'handshake'
  | 'briefcase'
  | 'megaphone'

function iconDataUri(type: IconType, color: string): string {
  const c  = `#${color}`
  const sw = '1.8'
  const attr = `xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`
  const svgs: Record<IconType, string> = {
    'people':
      `<svg ${attr}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    'chart-bars':
      `<svg ${attr}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`,
    'graduation-cap':
      `<svg ${attr}><path d="M22 10l-10-5-10 5 10 5 10-5z"/><path d="M6 12v5c0 .7 2.7 3 6 3s6-2.3 6-3v-5"/><path d="M22 10v6"/></svg>`,
    'alert-tri':
      `<svg ${attr}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    'alert-circle':
      `<svg ${attr}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    'check-circle':
      `<svg ${attr}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    'sliders':
      `<svg ${attr}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="2" y1="14" x2="6" y2="14"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="18" y1="16" x2="22" y2="16"/></svg>`,
    'user':
      `<svg ${attr}><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>`,
    'handshake':
      `<svg ${attr}><path d="M11 14l2 2a2.8 2.8 0 0 0 4-4l-2-2"/><path d="M13 10l-2-2a2.8 2.8 0 0 0-4 4l2 2"/><path d="M3 9l3-3 3 3-3 3-3-3z"/><path d="M15 15l3-3 3 3-3 3-3-3z"/></svg>`,
    'briefcase':
      `<svg ${attr}><rect x="3" y="7" width="18" height="13" rx="2" ry="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></svg>`,
    'megaphone':
      `<svg ${attr}><path d="M3 11l12-5v12L3 13z"/><path d="M15 8a5 5 0 0 1 0 8"/><path d="M6 13v5a2 2 0 0 0 2 2h1"/></svg>`,
  }
  const b64 = Buffer.from(svgs[type]).toString('base64')
  return `data:image/svg+xml;base64,${b64}`
}

/* ─── Card drawing helper ────────────────────────────────────────────────────
   Draws a rounded white card with a multi-layer dispersed shadow effect.
   The shadow spreads symmetrically around the card (not just bottom-right).
─────────────────────────────────────────────────────────────────────────── */
function drawRoundedCard(
  slide: Slide,
  x: number, y: number, w: number, h: number,
  opts: { fill?: string; borderColor?: string; radius?: number } = {},
): void {
  const fill   = opts.fill        ?? C.white
  const border = opts.borderColor ?? C.border
  const r      = opts.radius      ?? 0.09
  // Three shadow layers — increasing size, decreasing darkness — simulates blur
  slide.addShape('roundRect', {
    x: x - 0.04, y: y + 0.06, w: w + 0.08, h: h + 0.04,
    fill: { color: 'EAF0F7' }, line: { color: 'EAF0F7', width: 0 }, rectRadius: r + 0.01,
  })
  slide.addShape('roundRect', {
    x: x - 0.02, y: y + 0.04, w: w + 0.04, h: h + 0.02,
    fill: { color: 'D6E2EE' }, line: { color: 'D6E2EE', width: 0 }, rectRadius: r + 0.005,
  })
  slide.addShape('roundRect', {
    x: x - 0.01, y: y + 0.02, w: w + 0.02, h: h + 0.01,
    fill: { color: 'C6D5E5' }, line: { color: 'C6D5E5', width: 0 }, rectRadius: r,
  })
  // Card face
  slide.addShape('roundRect', { x, y, w, h,
    fill: { color: fill }, line: { color: border, width: 0.5 }, rectRadius: r,
  })
}

/* ─── Content slide factory ───────────────────────────────────────────────── */
interface BaseSlide { slide: Slide; cY: number; cH: number }

function mkBase(
  prs:        PptxGenJS,
  title:      string,
  clientName: string,
  section?:   string,
): BaseSlide {
  const slide = prs.addSlide()

  slide.addShape('rect', { x: 0, y: 0, w: W, h: H,
    fill: { color: C.cream }, line: { color: C.cream, width: 0 } })
  slide.addShape('rect', { x: 0, y: 0, w: BARW, h: H,
    fill: { color: C.nav }, line: { color: C.nav, width: 0 } })
  slide.addShape('rect', { x: 0, y: 0, w: BARW, h: 0.38,
    fill: { color: C.mint }, line: { color: C.mint, width: 0 } })

  let topY = 0.2

  if (section) {
    slide.addText(section, {
      x: MX, y: topY, w: CW, h: 0.22,
      fontSize: 7.5, bold: true, color: C.mintDk, charSpacing: 2,
    })
    topY += 0.24
  }

  slide.addText(title, {
    x: MX, y: topY, w: CW, h: 0.5,
    fontSize: 15.5, bold: true, color: C.textDk, fontFace: 'Manrope',
  })
  topY += 0.52

  slide.addShape('rect', { x: MX, y: topY, w: CW, h: 0.012,
    fill: { color: C.border }, line: { color: C.border, width: 0 } })

  const cY = topY + 0.12
  const cH = H - cY - 0.3

  slide.addText(`${clientName}  |  Mapeamento de Riscos Psicossociais  |  beetouch.ai`, {
    x: MX, y: H - 0.27, w: CW, h: 0.2,
    fontSize: 7, color: C.textLt,
  })

  return { slide, cY, cH }
}

/* ─── Section divider (dark, chevron deco) ────────────────────────────────── */
function mkDivider(
  prs:      PptxGenJS,
  num:      string,
  title:    string,
  subtitle: string,
) {
  const slide = prs.addSlide()

  slide.addShape('rect', { x: 0, y: 0, w: W, h: H,
    fill: { color: C.nav }, line: { color: C.nav, width: 0 } })
  slide.addShape('rect', { x: 9.5, y: 0, w: W - 9.5, h: H,
    fill: { color: C.nav2 }, line: { color: C.nav2, width: 0 } })

  slide.addText('>>', {
    x: 8.8, y: 0.4, w: 5.0, h: 6.5,
    fontSize: 240, bold: true, color: C.navSub,
    align: 'center', valign: 'middle',
  })

  slide.addShape('rect', { x: 0, y: 0, w: BARW, h: H,
    fill: { color: C.mint }, line: { color: C.mint, width: 0 } })

  slide.addText(num, {
    x: MX, y: 1.8, w: 3, h: 0.42,
    fontSize: 10, bold: true, color: C.mint, charSpacing: 5,
  })

  slide.addShape('rect', { x: MX, y: 2.35, w: 3.0, h: 0.04,
    fill: { color: C.mint }, line: { color: C.mint, width: 0 } })

  slide.addText(title, {
    x: MX, y: 2.5, w: 8.6, h: 2.2,
    fontSize: 42, bold: true, color: C.white,
    align: 'left', fontFace: 'Manrope',
  })

  if (subtitle) {
    slide.addText(subtitle, {
      x: MX, y: 4.8, w: 8.6, h: 0.5,
      fontSize: 13, color: C.mint,
    })
  }

  const baDivider = getBrandAssets()
  if (baDivider.symbolB64) {
    const symbolW = 0.9
    const symbolH = symbolW * (74 / 99)
    slide.addImage({
      data: baDivider.symbolB64,
      x: W - symbolW - 0.4, y: H - symbolH - 0.4, w: symbolW, h: symbolH,
    })
  } else {
    slide.addText('beetouch.ai', {
      x: W - 2.2, y: H - 0.4, w: 1.8, h: 0.25,
      fontSize: 8, color: C.navSub, align: 'right',
    })
  }
}

/* ─── Cover ──────────────────────────────────────────────────────────────── */
function addCoverSlide(prs: PptxGenJS, data: ReportPayload) {
  const slide = prs.addSlide()

  // Full dark background
  slide.addShape('rect', { x: 0, y: 0, w: W, h: H,
    fill: { color: C.bg }, line: { color: C.bg, width: 0 } })

  // ── Right panel: brand pattern image ──────────────────────────────────────
  const PX   = 6.86   // panel start X
  const PW   = W - PX // panel width
  slide.addShape('rect', { x: PX, y: 0, w: PW, h: H,
    fill: { color: C.navy }, line: { color: C.navy, width: 0 } })
  const baCover = getBrandAssets()
  if (baCover.patternB64) {
    // Preserve original ratio (1320x917) and emulate "cover" without distortion.
    const patternRatio = 1320 / 917
    const drawH = H
    const drawW = drawH * patternRatio
    const drawX = PX - (drawW - PW) / 2
    slide.addImage({
      data: baCover.patternB64,
      x: drawX,
      y: 0,
      w: drawW,
      h: drawH,
    })
    // Mask overflow to the left so the pattern is visible only in the right panel.
    slide.addShape('rect', { x: 0, y: 0, w: PX, h: H,
      fill: { color: C.bg }, line: { color: C.bg, width: 0 } })
  }
  // Blue vertical separator line
  slide.addShape('rect', { x: PX, y: 0, w: 0.03, h: H,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 } })

  // ── BeeTouch logo ─────────────────────────────────────────────────────────
  if (baCover.logoB64) {
    const logoW = 3
    const logoH = logoW * (72 / 482)
    slide.addImage({
      data: baCover.logoB64,
      x: 0.6, y: 0.72, w: logoW, h: logoH,
    })
  } else {
    slide.addText('beetouch', {
      x: 0.6, y: 0.36, w: 2.1, h: 0.52,
      fontSize: 20, bold: true, color: C.white, fontFace: 'Manrope',
    })
    slide.addText('.ai', {
      x: 2.28, y: 0.36, w: 0.7, h: 0.52,
      fontSize: 20, color: C.blue, fontFace: 'Manrope',
    })
  }

  // ── Main title ────────────────────────────────────────────────────────────
  slide.addText('MAPEAMENTO DE', {
    x: 0.6, y: 1.32, w: 6.1, h: 0.88,
    fontSize: 38, bold: true, color: C.white, fontFace: 'Manrope',
  })
  slide.addText('RISCOS PSICOSSOCIAIS', {
    x: 0.6, y: 2.16, w: 6.1, h: 0.88,
    fontSize: 38, bold: true, color: C.white, fontFace: 'Manrope',
  })
  slide.addText('Relatório Executivo', {
    x: 0.6, y: 3.14, w: 5.8, h: 0.42,
    fontSize: 16, color: C.blue, fontFace: 'Manrope',
  })
  slide.addShape('rect', { x: 0.6, y: 3.68, w: 5.0, h: 0.02,
    fill: { color: C.navSub }, line: { color: C.navSub, width: 0 } })

  // ── Client info ───────────────────────────────────────────────────────────
  slide.addText(data.clientName, {
    x: 0.6, y: 3.88, w: 6.1, h: 0.54,
    fontSize: 20, bold: true, color: C.white, fontFace: 'Manrope',
  })
  if (data.clientDescription) {
    slide.addText(data.clientDescription, {
      x: 0.6, y: 4.46, w: 5.5, h: 0.32,
      fontSize: 12, color: C.blue2, fontFace: 'Inter',
    })
  }
  const date = new Date(data.generatedAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const dateCap = date.charAt(0).toUpperCase() + date.slice(1)
  const dateY = data.clientDescription ? 4.84 : 4.46
  slide.addText(dateCap, {
    x: 0.6, y: dateY, w: 5, h: 0.3,
    fontSize: 12, color: '6A8EAC', fontFace: 'Inter',
  })
  slide.addText('Saúde & Bem-Estar  •  NR-1/2025  •  ISO 45003', {
    x: 0.6, y: dateY + 0.38, w: 6.1, h: 0.28,
    fontSize: 11, color: C.blue2, fontFace: 'Inter',
  })

  const filterParts = Object.entries(data.filters).map(([k, v]) => `${k}=${v}`)
  if (data.reportVariantLabel) filterParts.push(data.reportVariantLabel)
  if (filterParts.length > 0) {
    slide.addText('Filtros: ' + filterParts.join(', '), {
      x: 0.6, y: dateY + 0.76, w: 6.1, h: 0.24,
      fontSize: 8.5, color: '6A8EAC', fontFace: 'Inter',
    })
  }

  // ── Client logo ───────────────────────────────────────────────────────────
  if (data.clientLogoBase64) {
    slide.addImage({
      data: data.clientLogoBase64,
      x: 0.6, y: 5.6, w: 3.8, h: 1.6,
      sizing: { type: 'contain', w: 3.8, h: 1.6 },
    })
  }
}

/* ─── Introduction ──────────────────────────────────────────────────────── */
function addIntroductionSlide(prs: PptxGenJS, data: ReportPayload) {
  const slide = prs.addSlide()

  slide.addShape('rect', { x: 0, y: 0, w: W, h: H,
    fill: { color: C.bg }, line: { color: C.bg, width: 0 } })
  slide.addShape('rect', { x: 0, y: H * 0.72, w: W, h: H * 0.28,
    fill: { color: C.cream }, line: { color: C.cream, width: 0 } })
  slide.addShape('rect', { x: 0, y: H * 0.72 - 0.04, w: W, h: 0.04,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 } })
  slide.addShape('rect', { x: 0, y: 0, w: BARW, h: H,
    fill: { color: C.mint }, line: { color: C.mint, width: 0 } })

  const ba = getBrandAssets()
  if (ba.logoB64) {
    const logoW = 2.85
    const logoH = logoW * (72 / 482)
    slide.addImage({
      data: ba.logoB64,
      x: MX, y: 0.54, w: logoW, h: logoH,
    })
  } else {
    slide.addText('beetouch', {
      x: MX, y: 0.58, w: 2.7, h: 0.42,
      fontSize: 18, bold: true, color: C.white, fontFace: 'Manrope',
    })
    slide.addText('.ai', {
      x: MX + 1.94, y: 0.58, w: 0.58, h: 0.42,
      fontSize: 18, color: C.blue, fontFace: 'Manrope',
    })
  }

  slide.addText('Introdução', {
    x: MX, y: 1.24, w: 2.6, h: 0.22,
    fontSize: 10, bold: true, color: C.mint, charSpacing: 3, fontFace: 'Manrope',
  })
  slide.addText('Saúde mental e gestão psicossocial', {
    x: MX, y: 1.46, w: 6.4, h: 0.78,
    fontSize: 32, bold: true, color: C.white, fontFace: 'Manrope',
  })

  slide.addShape('rect', { x: MX, y: 2.32, w: 4.95, h: 0.02,
    fill: { color: C.navSub }, line: { color: C.navSub, width: 0 } })

  const introCards = [
    {
      accent: C.blue,
      text: 'O cuidado com a saúde mental e a gestão dos fatores psicossociais no ambiente de trabalho têm se consolidado como vetores estratégicos para organizações que buscam alinhar bem-estar, inovação, sustentabilidade e competitividade. Em contextos de transformação acelerada, alta complexidade organizacional e demandas crescentes por ambientes de trabalho saudáveis, adotar uma abordagem estruturada para identificar, avaliar e mitigar riscos psicossociais deixou de ser apenas uma exigência normativa, passou a ser um diferencial de gestão e um compromisso com o futuro do trabalho.',
    },
    {
      accent: C.mint,
      text: 'Este relatório apresenta os resultados da classificação de riscos resultante do ciclo mais recente do Mapeamento Digital de Fatores de Risco Psicossociais e Saúde Mental. Conduzido com base em evidências científicas e tecnologias de análise populacional, o sistema de classificação permite identificar áreas de risco e fatores de proteção, apoiar a tomada de decisão e orientar planos de ação orientados por evidências.',
    },
  ]

  const cardGap = 0.3
  const cardW = (CW - cardGap) / 2
  const cardY = 2.54
  const cardH = 2.52

  introCards.forEach((card, idx) => {
    const x = MX + idx * (cardW + cardGap)
    drawRoundedCard(slide, x, cardY, cardW, cardH, { fill: 'FBFDFF', borderColor: 'D9E4EE', radius: 0.1 })
    slide.addShape('roundRect', {
      x, y: cardY, w: 0.08, h: cardH,
      fill: { color: card.accent }, line: { color: card.accent, width: 0 }, rectRadius: 0.1,
    })
    slide.addText(card.text, {
      x: x + 0.24, y: cardY + 0.22, w: cardW - 0.44, h: cardH - 0.36,
      fontSize: 10.8, color: C.textDk, fontFace: 'Inter',
      valign: 'top', margin: 0,
    })
  })

  const date = new Date(data.generatedAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const dateCap = date.charAt(0).toUpperCase() + date.slice(1)
  slide.addText(data.clientName, {
    x: MX, y: H * 0.74 + 0.16, w: 7, h: 0.45,
    fontSize: 16, bold: true, color: C.nav, fontFace: 'Manrope',
  })
  slide.addText(dateCap, {
    x: MX, y: H * 0.74 + 0.6, w: 7, h: 0.3,
    fontSize: 10, color: C.textMd,
  })
  slide.addText('Confidencial', {
    x: W - MX - RX - 1.5, y: H * 0.74 + 0.22, w: 1.5, h: 0.3,
    fontSize: 9, bold: true, color: C.mintDk, align: 'right',
  })
}

/* ─── Executive Summary ──────────────────────────────────────────────────── */
function addExecutiveSummarySlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Sumário Executivo', data.clientName)

  const highN   = data.hseClassDist.find(d => d.name === 'Alto risco')?.value ?? 0
  const modN    = data.hseClassDist.find(d => d.name === 'Risco moderado')?.value ?? 0
  const lowN    = data.hseClassDist.find(d => d.name === 'Baixo risco')?.value ?? 0
  const total   = highN + modN + lowN
  const rate    = data.totalCollabs > 0 ? data.totalAnswered / data.totalCollabs * 100 : 0
  const highPct = pct1(highN, total)
  const modPct  = pct1(modN, total)
  const lowPct  = pct1(lowN, total)

  // ── KPI CARDS ─────────────────────────────────────────────────────────────
  const kpiGap = 0.20
  const kpiW   = (CW - kpiGap * 4) / 5
  const kpiH   = 1.82
  const kpiY   = cY

  const kpis: { iconType: IconType; iconColor: string; iconBg: string; value: string; label: string }[] = [
    { iconType: 'people',       iconColor: C.blue,  iconBg: C.bluePale,
      value: data.totalAnswered.toLocaleString('pt-BR'), label: 'Pessoas participantes' },
    { iconType: 'chart-bars',   iconColor: C.blue,  iconBg: C.bluePale,
      value: fmtPct(trunc1(rate)),    label: 'Taxa de adesão' },
    { iconType: 'alert-tri',    iconColor: C.white, iconBg: C.high,
      value: fmtPct(highPct), label: 'Risco Alto' },
    { iconType: 'alert-circle', iconColor: C.white, iconBg: C.mod,
      value: fmtPct(modPct), label: 'Risco Moderado' },
    { iconType: 'check-circle', iconColor: C.white, iconBg: C.low,
      value: fmtPct(lowPct), label: 'Risco Baixo' },
  ]

  kpis.forEach((k, i) => {
    const bx = MX + i * (kpiW + kpiGap)
    drawRoundedCard(slide, bx, kpiY, kpiW, kpiH)
    // Icon circle background
    const iSize = 0.56
    const ix = bx + (kpiW - iSize) / 2
    const iy = kpiY + 0.22
    slide.addShape('ellipse', { x: ix, y: iy, w: iSize, h: iSize,
      fill: { color: k.iconBg }, line: { color: k.iconBg, width: 0 } })
    // SVG icon inside circle
    const ipad = 0.12
    slide.addImage({ data: iconDataUri(k.iconType, k.iconColor),
      x: ix + ipad, y: iy + ipad, w: iSize - ipad * 2, h: iSize - ipad * 2,
    })
    // Value
    slide.addText(k.value, {
      x: bx + 0.1, y: kpiY + 0.88, w: kpiW - 0.20, h: 0.62,
      fontSize: 24, bold: true, color: C.textDk, align: 'center', fontFace: 'Manrope',
    })
    // Label — single line, no wrap
    slide.addText(k.label, {
      x: bx + 0.1, y: kpiY + 1.50, w: kpiW - 0.20, h: 0.24,
      fontSize: 14, color: C.textMd, align: 'center', fontFace: 'Inter',
    })
  })

  // ── PRINCIPAIS INSIGHTS ────────────────────────────────────────────────────
  const insLabelY = kpiY + kpiH + 0.28
  const insY      = insLabelY + 0.28
  const insH      = cY + cH - insY - 0.1

  slide.addText('PRINCIPAIS INSIGHTS', {
    x: MX, y: insLabelY, w: 6, h: 0.22,
    fontSize: 14, bold: true, color: C.textLt, charSpacing: 2, fontFace: 'Manrope',
  })

  const insights: { iconType: IconType; color: string; bg: string; title: string; text: string }[] = []

  if (data.domainAvgs.length > 0) {
    const worst = [...data.domainAvgs].sort((a, b) => b.avg - a.avg)[0]
    insights.push({
      iconType: 'alert-tri', color: C.high, bg: C.highLt,
      title: 'Principal domínio de risco',
      text:  `"${worst.domain}" apresenta o maior score (${worst.avg.toFixed(2)}), classificado como ${riskLabel(worst.avg).toLowerCase()}.`,
    })
  }

  const critGroups = data.stratumRows.filter(r => r.hseAvg !== null && r.hseAvg >= 2.5)
  if (critGroups.length > 0) {
    const worst = [...critGroups].sort((a, b) => (b.hseAvg ?? 0) - (a.hseAvg ?? 0))[0]
    insights.push({
      iconType: 'alert-circle', color: C.mod, bg: C.modLt,
      title: `${data.stratumLabel} em maior risco`,
      text:  `${worst.name} apresenta a maior exposição ao risco entre os grupos analisados (score ${(worst.hseAvg ?? 0).toFixed(2)}).`,
    })
  } else {
    insights.push({
      iconType: 'people', color: C.mod, bg: C.modLt,
      title: 'Distribuição de risco',
      text:  `${fmtPct(highPct)} dos colaboradores estão em alto risco. Estratificação por ${data.stratumLabel.toLowerCase()} indica grupos prioritários para intervenção.`,
    })
  }

  if (data.hseAvg !== null) {
    insights.push({
      iconType: 'check-circle', color: C.low, bg: C.lowLt,
      title: 'Diagnóstico geral',
      text:  `Score médio de ${data.hseAvg.toFixed(2)} classifica a organização em ${riskLabel(data.hseAvg).toLowerCase()}. ${fmtPct(lowPct)} dos colaboradores em condição de baixo risco.`,
    })
  }

  const insGap = 0.22
  const insW   = (CW - insGap * 2) / 3

  insights.slice(0, 3).forEach((ins, i) => {
    const bx = MX + i * (insW + insGap)
    drawRoundedCard(slide, bx, insY, insW, insH)
    // Colored left accent bar (rounded on left side only — approximate with roundRect)
    slide.addShape('roundRect', { x: bx, y: insY, w: 0.06, h: insH,
      fill: { color: ins.color }, line: { color: ins.color, width: 0 }, rectRadius: 0.09 })
    // Icon circle
    const iSize = 0.40
    const ix    = bx + 0.2
    const iy    = insY + 0.24
    slide.addShape('ellipse', { x: ix, y: iy, w: iSize, h: iSize,
      fill: { color: ins.bg }, line: { color: ins.bg, width: 0 } })
    const ipad = 0.08
    slide.addImage({ data: iconDataUri(ins.iconType, ins.color),
      x: ix + ipad, y: iy + ipad, w: iSize - ipad * 2, h: iSize - ipad * 2,
    })
    // Title
    slide.addText(ins.title, {
      x: bx + 0.72, y: insY + 0.24, w: insW - 0.84, h: 0.3,
      fontSize: 14, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    // Body text
    slide.addText(ins.text, {
      x: bx + 0.18, y: insY + 0.72, w: insW - 0.3, h: insH - 0.84,
      fontSize: 14, color: C.textMd, fontFace: 'Inter',
    })
  })
}

/* ─── Agenda / Introdução ────────────────────────────────────────────────── */
function addAgendaSlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY } = mkBase(prs, 'Visão Geral do Relatório', data.clientName)

  const stratLabels = (data.stratifiedHse ?? [])
    .map((s) => s.stratumLabel)
    .filter((v, i, arr) => arr.indexOf(v) === i)
  const stratSub = stratLabels.length > 0
    ? `Distribuição e heatmap por ${stratLabels.join(' • ')}`
    : `Distribuição e heatmap por ${data.stratumLabel}`

  const sections = [
    { n: '01', label: 'Contexto & Metodologia',
      sub: 'NR-1/2025  •  ISO 45003  •  Escalas HSE', color: C.blue },
    { n: '02', label: 'Participação e Perfil',
      sub: `Adesão  •  Perfil demográfico  •  ${data.totalAnswered} respondentes`, color: C.blue2 },
    { n: '03', label: 'Mapeamento de Riscos',
      sub: 'Índice geral  •  Análise  •  Domínios HSE', color: C.high },
    { n: '04', label: 'Análise Estratificada',
      sub: stratSub, color: C.mod },
    ...(data.hasIetr ? [{ n: '05', label: 'Trabalho Remoto',
      sub: 'Resultados IETR — módulo de trabalho remoto', color: C.low }] : []),
    { n: data.hasIetr ? '06' : '05', label: 'Recomendações',
      sub: 'Grupos e domínios com maior criticidade para intervenção', color: C.low },
    { n: data.hasIetr ? '07' : '06', label: 'Plano de Ação',
      sub: 'Síntese atualizada para priorização operacional', color: C.mod },
  ]

  const cols  = 2
  const gap   = 0.28
  const cardW = (CW - gap) / cols
  const cardH = Math.min(1.28, (H - cY - 0.35) / Math.ceil(sections.length / cols) - 0.14)

  sections.forEach((s, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const bx  = MX + col * (cardW + gap)
    const by  = cY + row * (cardH + 0.14)

    drawRoundedCard(slide, bx, by, cardW, cardH)
    // Left accent bar — same roundRect radius as card, stays inside card boundaries
    slide.addShape('roundRect', { x: bx, y: by, w: 0.07, h: cardH,
      fill: { color: s.color }, line: { color: s.color, width: 0 }, rectRadius: 0.09 })
    // Number — wide enough so "06" never wraps
    slide.addText(s.n, {
      x: bx + 0.2, y: by + 0.08, w: 1.0, h: cardH - 0.18,
      fontSize: 26, bold: true, color: s.color, fontFace: 'Manrope', valign: 'middle',
    })
    // Label
    slide.addText(s.label, {
      x: bx + 1.22, y: by + 0.1, w: cardW - 1.38, h: 0.44,
      fontSize: 12, bold: true, color: C.textDk, fontFace: 'Manrope', valign: 'middle',
    })
    // Sub
    slide.addText(s.sub, {
      x: bx + 1.22, y: by + cardH - 0.44, w: cardW - 1.38, h: 0.34,
      fontSize: 9, color: C.textMd, fontFace: 'Inter',
    })
  })
}

/* ─── Action plan synthesis ─────────────────────────────────────────────── */
function addActionPlanSynthesisSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = data.hasIetr ? '07' : '06'
  const { slide, cY, cH } = mkBase(prs, 'Síntese Atualizada - Base para o Plano de Ação', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  const hseHigh = data.hseClassDist.find(d => d.name === 'Alto risco')?.value ?? 0
  const hseMod = data.hseClassDist.find(d => d.name === 'Risco moderado')?.value ?? 0
  const hseLow = data.hseClassDist.find(d => d.name === 'Baixo risco')?.value ?? 0
  const hseTotal = hseHigh + hseMod + hseLow

  const hseLowPct = pct1(hseLow, hseTotal)
  const hseModPct = pct1(hseMod, hseTotal)
  const hseHighPct = pct1(hseHigh, hseTotal)
  const adherencePct = pct1(data.totalAnswered, data.totalCollabs)

  const ietrRisk = data.ietrClassDist.find(d => d.name === 'Situação de risco')?.value ?? 0
  const ietrAtt = data.ietrClassDist.find(d => d.name === 'Zona de atenção')?.value ?? 0
  const ietrOk = data.ietrClassDist.find(d => d.name === 'Condição adequada')?.value ?? 0
  const ietrTotal = ietrRisk + ietrAtt + ietrOk
  const ietrRiskPct = pct1(ietrRisk, ietrTotal)
  const ietrAttPct = pct1(ietrAtt, ietrTotal)
  const ietrOkPct = pct1(ietrOk, ietrTotal)

  const demandOverall = data.domainAvgs.find(d => d.domain === 'Demandas')
  const demandModerateGroups = data.stratumRows
    .filter(r => {
      const v = r.domainAvgs['Demandas']
      return v !== null && v >= 1.5 && v < 2.5
    })
    .sort((a, b) => ((b.domainAvgs['Demandas'] ?? 0) - (a.domainAvgs['Demandas'] ?? 0)))
    .map(r => r.name)

  const demandHighGroups = data.stratumRows
    .filter(r => {
      const v = r.domainAvgs['Demandas']
      return v !== null && v >= 2.5
    })
    .sort((a, b) => ((b.domainAvgs['Demandas'] ?? 0) - (a.domainAvgs['Demandas'] ?? 0)))
    .map(r => r.name)

  const hasDemandData = !!demandOverall
  const demandScoreTxt = demandOverall ? demandOverall.avg.toFixed(2).replace('.', ',') : '--'
  const demandRisk = demandOverall ? riskLabel(demandOverall.avg).toLowerCase() : 'sem dados'
  const demandGroupsForText = (demandHighGroups.length > 0 ? demandHighGroups : demandModerateGroups).slice(0, 5)

  const leftBody = hasDemandData
    ? `Demandas apresenta classificação de ${demandRisk} no resultado geral (score ${demandScoreTxt}). ${demandGroupsForText.length > 0
      ? `A análise estratificada indica maior incidência em ${demandGroupsForText.join(', ')}.`
      : `A análise estratificada não identificou incidência relevante por ${data.stratumLabel.toLowerCase()}.`}`
    : 'Não há dados suficientes do domínio Demandas para consolidar evidências nesta base analítica.'

  const leftPriority = demandHighGroups.length > 0
    ? 'Prioridade operacional: reduzir sobrecarga, revisar metas e reequilibrar capacidade nas áreas com maior exposição.'
    : 'Prioridade operacional: reduzir sobrecarga, organizar prioridades e monitorar áreas com maior exposição.'

  const rightBody = data.hasIetr && ietrTotal > 0 && data.ietrAvg !== null
    ? `O módulo IETR apresenta score médio de ${data.ietrAvg.toFixed(2).replace('.', ',')}, classificado como ${ietrLabel(data.ietrAvg).toLowerCase()}. A distribuição mostra ${fmtPct(ietrRiskPct)} em situação de risco, ${fmtPct(ietrAttPct)} em zona de atenção e ${fmtPct(ietrOkPct)} em condição adequada.`
    : 'O módulo IETR não possui base suficiente nesta extração para evidência complementar de trabalho remoto.'

  const rightPriority = data.hasIetr && ietrTotal > 0
    ? 'Prioridade operacional: protocolo de teletrabalho saudável, desconexão, ergonomia e gestão de reuniões.'
    : 'Prioridade operacional: manter monitoramento contínuo das condições de trabalho remoto nas próximas coletas.'

  const kpiGap = 0.18
  const kpiW = (CW - kpiGap * 4) / 5
  const kpiH = 1.22
  const kpiY = cY + 0.34
  const kpis = [
    { value: `${data.totalAnswered}`, label: 'respondentes', sub: `${fmtPct(adherencePct)} de adesão`, color: C.blue },
    { value: fmtPct(hseLowPct), label: 'baixo risco HSE', sub: `${hseLow} colaboradores`, color: C.low },
    { value: fmtPct(hseModPct), label: 'risco moderado', sub: `${hseMod} colaboradores`, color: C.mod },
    { value: fmtPct(hseHighPct), label: 'alto risco HSE', sub: `${hseHigh} colaboradores`, color: C.high },
    { value: data.hasIetr && ietrTotal > 0 ? fmtPct(ietrRiskPct) : '--', label: 'risco IETR', sub: data.hasIetr && ietrTotal > 0 ? `${ietrRisk} em situação de risco` : 'sem base suficiente', color: data.hasIetr ? C.high : C.textLt },
  ]

  kpis.forEach((k, i) => {
    const x = MX + i * (kpiW + kpiGap)
    drawRoundedCard(slide, x, kpiY, kpiW, kpiH)
    slide.addShape('roundRect', {
      x, y: kpiY, w: 0.07, h: kpiH,
      fill: { color: k.color }, line: { color: k.color, width: 0 }, rectRadius: 0.09,
    })
    slide.addText(k.value, {
      x: x + 0.2, y: kpiY + 0.18, w: kpiW - 0.28, h: 0.38,
      fontSize: 20, bold: true, color: k.color, fontFace: 'Manrope',
    })
    slide.addText(k.label, {
      x: x + 0.2, y: kpiY + 0.68, w: kpiW - 0.28, h: 0.15,
      fontSize: 8.1, color: C.textLt, fontFace: 'Inter',
    })
    slide.addText(k.sub, {
      x: x + 0.2, y: kpiY + 0.94, w: kpiW - 0.28, h: 0.15,
      fontSize: 8.2, color: C.textDk, fontFace: 'Inter',
    })
  })

  const boxGap = 0.28
  const boxW = (CW - boxGap) / 2
  const boxY = kpiY + kpiH + 0.22
  const boxH = cH - (boxY - cY)

  const evidences = [
    { title: 'Evidência principal', body: leftBody, priority: leftPriority, accent: C.high, priorityColor: C.high },
    { title: 'Evidência complementar - Trabalho remoto', body: rightBody, priority: rightPriority, accent: 'EA8A00', priorityColor: 'EA8A00' },
  ]

  evidences.forEach((ev, i) => {
    const x = MX + i * (boxW + boxGap)
    drawRoundedCard(slide, x, boxY, boxW, boxH)
    slide.addShape('roundRect', {
      x, y: boxY, w: 0.07, h: boxH,
      fill: { color: ev.accent }, line: { color: ev.accent, width: 0 }, rectRadius: 0.09,
    })
    slide.addText(ev.title, {
      x: x + 0.22, y: boxY + 0.16, w: boxW - 0.36, h: 0.24,
      fontSize: 16, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    slide.addText(ev.body, {
      x: x + 0.22, y: boxY + 0.56, w: boxW - 0.36, h: boxH - 1.22,
      fontSize: 11, color: C.textDk, fontFace: 'Inter',
    })
    slide.addText(ev.priority, {
      x: x + 0.22, y: boxY + boxH - 0.38, w: boxW - 0.36, h: 0.24,
      fontSize: 10.5, bold: true, color: ev.priorityColor, fontFace: 'Inter',
    })
  })
}

function addActionPlanOperationalClassificationSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = data.hasIetr ? '07' : '06'
  const { slide, cY, cH } = mkBase(prs, 'Classificação Operacional de Risco para Priorização', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  const hseHigh = data.hseClassDist.find(d => d.name === 'Alto risco')?.value ?? 0
  const hseMod = data.hseClassDist.find(d => d.name === 'Risco moderado')?.value ?? 0
  const hseLow = data.hseClassDist.find(d => d.name === 'Baixo risco')?.value ?? 0
  const hseTotal = hseHigh + hseMod + hseLow
  const hseCriticalPct = pct1(hseHigh + hseMod, hseTotal)

  const ietrRisk = data.ietrClassDist.find(d => d.name === 'Situação de risco')?.value ?? 0
  const ietrAtt = data.ietrClassDist.find(d => d.name === 'Zona de atenção')?.value ?? 0
  const ietrOk = data.ietrClassDist.find(d => d.name === 'Condição adequada')?.value ?? 0
  const ietrTotal = ietrRisk + ietrAtt + ietrOk
  const ietrRiskPct = pct1(ietrRisk, ietrTotal)
  const ietrControl = data.ietrDomainAvgs.find(d => d.domain === 'Controle')?.avg ?? null
  const ietrDemand = data.ietrDomainAvgs.find(d => d.domain === 'Demandas' || d.domain === 'Demanda')?.avg ?? null

  const domainMap = new Map(data.domainAvgs.map(d => [d.domain, d.avg]))
  const strataWithDomains = data.stratumRows.filter(r => r.answered >= 5)

  const recurrencePct = (domain: string, threshold: number): number => {
    const total = strataWithDomains.length
    if (total === 0) return 0
    const withRisk = strataWithDomains.filter(r => {
      const v = r.domainAvgs[domain]
      return v !== null && v >= threshold
    }).length
    return pct1(withRisk, total)
  }

  const topGroupsByDomain = (domain: string, threshold: number): string[] => {
    return strataWithDomains
      .filter(r => {
        const v = r.domainAvgs[domain]
        return v !== null && v >= threshold
      })
      .sort((a, b) => ((b.domainAvgs[domain] ?? 0) - (a.domainAvgs[domain] ?? 0)))
      .slice(0, 3)
      .map(r => r.name)
  }

  const severityMultiplier = (avg: number | null): number => {
    if (avg === null) return 0.8
    if (avg >= 2.5) return 1.55
    if (avg >= 1.5) return 1.35
    if (avg >= 1.0) return 1.05
    return 0.8
  }

  const priorityFromR = (r: number): { label: string; prazo: string; color: string } => {
    if (r >= 75) return { label: 'Alta', prazo: '<= 6m', color: C.high }
    if (r >= 45) return { label: 'Moderado', prazo: '<= 6m', color: C.mintDk }
    if (r >= 20) return { label: 'Tolerável', prazo: '<= 9m', color: 'EA8A00' }
    if (r >= 12) return { label: 'Trivial monitorado', prazo: '<= 12m', color: C.low }
    return { label: 'Trivial', prazo: '<= 12m', color: C.low }
  }

  const makeHseFactor = (label: string, domain: string) => {
    const avgVal = domainMap.get(domain) ?? null
    const recurrence = recurrencePct(domain, 1.5)
    const groups = topGroupsByDomain(domain, 1.5)
    const F = trunc1(hseCriticalPct * (0.7 + (avgVal ?? 0) / 4))
    const R = trunc1(F * (severityMultiplier(avgVal) + (recurrence / 100) * 0.4))
    const pr = priorityFromR(R)
    const evidence = avgVal !== null
      ? `Score ${avgVal.toFixed(2).replace('.', ',')} (${riskLabel(avgVal).toLowerCase()}); recorrência em ${fmtPct(recurrence)} dos grupos${groups.length > 0 ? `: ${groups.join(', ')}` : ''}`
      : 'Sem dados suficientes nesta base'

    return { fator: label, evidencia: evidence, F, R, prioridade: pr.label, prazo: pr.prazo, pColor: pr.color }
  }

  const rows: Array<{ fator: string; evidencia: string; F: number; R: number; prioridade: string; prazo: string; pColor: string }> = []

  if (data.hasIetr && ietrTotal > 0 && data.ietrAvg !== null) {
    const teleR = trunc1(ietrRiskPct * 1.55)
    const telePr = priorityFromR(teleR)
    rows.push({
      fator: 'Teletrabalho/IETR',
      evidencia: `Situação de risco ${fmtPct(ietrRiskPct)}; score ${data.ietrAvg.toFixed(2).replace('.', ',')} (${ietrLabel(data.ietrAvg).toLowerCase()}); Demanda ${ietrDemand !== null ? ietrDemand.toFixed(2).replace('.', ',') : '--'} / Controle ${ietrControl !== null ? ietrControl.toFixed(2).replace('.', ',') : '--'}`,
      F: ietrRiskPct,
      R: teleR,
      prioridade: telePr.label,
      prazo: telePr.prazo,
      pColor: telePr.color,
    })
  }

  rows.push(makeHseFactor('Demandas HSE', 'Demandas'))
  rows.push(makeHseFactor('Controle/Autonomia', 'Controle'))
  rows.push(makeHseFactor('Apoio da Liderança', 'Apoio da Liderança'))
  rows.push(makeHseFactor('Relacionamentos', 'Relacionamentos'))
  rows.push(makeHseFactor('Cargo/Função', 'Cargo'))

  slide.addText(
    'Método de priorização: evidências HSE/IETR + criticidade organizacional + prazo de controle. O cálculo R usa lógica operacional para apoiar decisão sem substituir validação técnica do PGR.',
    { x: MX, y: cY + 0.04, w: CW, h: 0.2, fontSize: 8.9, color: C.textLt, italic: true, fontFace: 'Inter' },
  )

  const tableX = MX
  const tableY = cY + 0.34
  const tableW = CW
  const tableH = cH - 0.62
  const headH = 0.44
  const rowH = Math.min(0.62, (tableH - headH) / Math.max(1, rows.length))
  const cols = [2.2, 3.85, 1.0, 1.0, 1.7, 0.95]
  const headers = ['Fator', 'Evidência atualizada', 'F', 'R', 'Prioridade', 'Prazo']

  drawRoundedCard(slide, tableX, tableY, tableW, tableH)
  slide.addShape('roundRect', {
    x: tableX, y: tableY, w: tableW, h: headH,
    fill: { color: C.navy }, line: { color: C.navy, width: 0 }, rectRadius: 0.06,
  })

  let cx = tableX
  headers.forEach((h, i) => {
    slide.addText(h, {
      x: cx + 0.08, y: tableY + 0.12, w: cols[i] - 0.16, h: 0.18,
      fontSize: 9, bold: true, color: C.white, fontFace: 'Manrope',
      align: i >= 2 ? 'center' : 'left',
    })
    cx += cols[i]
  })

  rows.forEach((r, i) => {
    const y = tableY + headH + i * rowH
    const bg = i % 2 === 0 ? C.white : 'F8FBFE'
    slide.addShape('rect', {
      x: tableX, y, w: tableW, h: rowH,
      fill: { color: bg }, line: { color: bg, width: 0 },
    })

    slide.addShape('line', {
      x: tableX, y: y + rowH, w: tableW, h: 0,
      line: { color: C.border, pt: 0.6 },
    })

    let x = tableX
    slide.addText(r.fator, {
      x: x + 0.08, y: y + 0.17, w: cols[0] - 0.16, h: 0.18,
      fontSize: 8.8, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    x += cols[0]

    slide.addText(r.evidencia, {
      x: x + 0.08, y: y + 0.1, w: cols[1] - 0.16, h: rowH - 0.16,
      fontSize: 8, color: C.textMd, fontFace: 'Inter',
    })
    x += cols[1]

    slide.addText(fmtPct(r.F).replace('%', ''), {
      x: x + 0.05, y: y + 0.17, w: cols[2] - 0.1, h: 0.18,
      fontSize: 8.8, color: C.textDk, align: 'center', fontFace: 'Manrope',
    })
    x += cols[2]

    slide.addText(fmtPct(r.R).replace('%', ''), {
      x: x + 0.05, y: y + 0.17, w: cols[3] - 0.1, h: 0.18,
      fontSize: 8.8, color: C.textDk, align: 'center', fontFace: 'Manrope',
    })
    x += cols[3]

    slide.addText(r.prioridade, {
      x: x + 0.05, y: y + 0.17, w: cols[4] - 0.1, h: 0.18,
      fontSize: 8.8, bold: true, color: r.pColor, align: 'center', fontFace: 'Manrope',
    })
    x += cols[4]

    slide.addText(r.prazo, {
      x: x + 0.05, y: y + 0.17, w: cols[5] - 0.1, h: 0.18,
      fontSize: 8.6, color: C.textDk, align: 'center', fontFace: 'Manrope',
    })
  })

  slide.addText(
    'Nota: classificação operacional para apoiar priorização do plano de ação; revisar com equipe técnica, liderança e governança de SST antes da aprovação final.',
    { x: MX, y: cY + cH - 0.12, w: CW, h: 0.14, fontSize: 7.8, color: C.textLt, italic: true, fontFace: 'Inter' },
  )
}

type ActionPlaybookVariant = 'moderado' | 'toleravel' | 'trivial'

type DomainPlanSeverity = 'alto' | 'moderado'

type DomainPlanActionItem = {
  title: string
  owner: string
  deadline: string
  description: string
}

function getDomainActionTemplate(domain: string, severity: DomainPlanSeverity): DomainPlanActionItem[] {
  const d = domain.toLowerCase()
  const urgent = severity === 'alto'

  if (d.includes('demanda')) {
    return [
      {
        title: 'Rebalanceamento de carga e prioridades',
        owner: 'Lideranças + Pessoas & Cultura',
        deadline: urgent ? '45 dias' : '90 dias',
        description: 'Revisar metas, prazos e distribuição de atividades com foco em capacidade real das equipes.',
      },
      {
        title: 'Rito semanal de proteção de foco',
        owner: 'Gestores das áreas prioritárias',
        deadline: urgent ? '30 dias' : '60 dias',
        description: 'Organizar backlog, reduzir interrupções e pactuar limites de urgência por área.',
      },
      {
        title: 'Ajuste de dimensionamento e suporte',
        owner: 'Diretoria + RH',
        deadline: urgent ? '60 dias' : '120 dias',
        description: 'Avaliar necessidade de reforço de equipe, redistribuição de escopo e apoio transversal.',
      },
      {
        title: 'Monitoramento quinzenal de sobrecarga',
        owner: 'Pessoas & Cultura + SST',
        deadline: 'contínuo',
        description: 'Acompanhar sinais de sobrecarga e acionar plano de contingência quando necessário.',
      },
    ]
  }

  if (d.includes('controle')) {
    return [
      {
        title: 'Ampliação da autonomia operacional',
        owner: 'Lideranças + Pessoas & Cultura',
        deadline: urgent ? '60 dias' : '120 dias',
        description: 'Revisar alçadas, clareza de decisão e espaço de escolha sobre execução do trabalho.',
      },
      {
        title: 'Padronização de critérios de priorização',
        owner: 'Gestão + PMO/Planejamento',
        deadline: urgent ? '45 dias' : '90 dias',
        description: 'Definir critérios objetivos para ordem de demandas e limites de mudanças de prioridade.',
      },
      {
        title: 'Formação de lideranças em delegação',
        owner: 'Pessoas & Cultura',
        deadline: urgent ? '90 dias' : '150 dias',
        description: 'Capacitar gestores para distribuir decisões e aumentar previsibilidade de rotina.',
      },
      {
        title: 'Indicadores de autonomia por área',
        owner: 'Analytics de Pessoas + SST',
        deadline: 'contínuo',
        description: 'Medir evolução de autonomia e impacto na percepção de risco psicossocial.',
      },
    ]
  }

  if (d.includes('apoio') || d.includes('lideran')) {
    return [
      {
        title: 'Ritual de 1:1 e escuta ativa',
        owner: 'Lideranças imediatas',
        deadline: urgent ? '30 dias' : '60 dias',
        description: 'Instituir rotina de conversas estruturadas com foco em suporte e prevenção de desgaste.',
      },
      {
        title: 'Capacitação em liderança psicologicamente segura',
        owner: 'Pessoas & Cultura',
        deadline: urgent ? '75 dias' : '120 dias',
        description: 'Treinar gestores em acolhimento, encaminhamento e gestão de conflitos.',
      },
      {
        title: 'Matriz de suporte interáreas',
        owner: 'Direção + Gestores',
        deadline: urgent ? '60 dias' : '120 dias',
        description: 'Formalizar apoio cruzado entre equipes para períodos de maior pressão.',
      },
      {
        title: 'Pulso mensal de percepção de apoio',
        owner: 'Pessoas & Cultura + SST',
        deadline: 'contínuo',
        description: 'Monitorar tendência por área e agir rapidamente em grupos com deterioração.',
      },
    ]
  }

  if (d.includes('relacion')) {
    return [
      {
        title: 'Protocolo de prevenção de conflitos',
        owner: 'Pessoas & Cultura + Compliance',
        deadline: urgent ? '45 dias' : '90 dias',
        description: 'Definir regras de convivência, mediação e escalonamento para situações críticas.',
      },
      {
        title: 'Canal seguro e fluxo de resposta',
        owner: 'RH + Ouvidoria/Ética',
        deadline: urgent ? '45 dias' : '90 dias',
        description: 'Fortalecer canal de relato com confidencialidade, prazo e responsabilização.',
      },
      {
        title: 'Treinamento de comunicação não violenta',
        owner: 'Pessoas & Cultura',
        deadline: urgent ? '75 dias' : '120 dias',
        description: 'Capacitar lideranças e times para interações mais colaborativas e seguras.',
      },
      {
        title: 'Revisão trimestral do clima relacional',
        owner: 'Comitê de Acompanhamento',
        deadline: 'contínuo',
        description: 'Analisar incidentes e ajustar planos com base em recorrência e gravidade.',
      },
    ]
  }

  return [
    {
      title: `Plano dirigido para ${domain}`,
      owner: 'Pessoas & Cultura + Lideranças',
      deadline: urgent ? '60 dias' : '120 dias',
      description: 'Detalhar causas-raiz e estabelecer ações corretivas por grupo prioritário.',
    },
    {
      title: 'Ajustes de processo e rotina',
      owner: 'Gestores das áreas críticas',
      deadline: urgent ? '45 dias' : '90 dias',
      description: 'Revisar ritos de trabalho, interfaces e pontos de fricção operacional.',
    },
    {
      title: 'Capacitação orientada ao fator crítico',
      owner: 'Pessoas & Cultura',
      deadline: urgent ? '90 dias' : '150 dias',
      description: 'Treinar times e lideranças para prevenção e resposta ao fator de risco dominante.',
    },
    {
      title: 'Monitoramento com gatilhos de revisão',
      owner: 'SST + Governança',
      deadline: 'contínuo',
      description: 'Acompanhar evolução e revisar plano quando houver persistência ou agravamento.',
    },
  ]
}

function addActionPlanPlaybookSlide(prs: PptxGenJS, data: ReportPayload, variant: ActionPlaybookVariant) {
  const sNum = data.hasIetr ? '07' : '06'

  const hseHigh = data.hseClassDist.find(d => d.name === 'Alto risco')?.value ?? 0
  const hseMod = data.hseClassDist.find(d => d.name === 'Risco moderado')?.value ?? 0
  const hseLow = data.hseClassDist.find(d => d.name === 'Baixo risco')?.value ?? 0
  const hseTotal = hseHigh + hseMod + hseLow
  const hseHighPct = pct1(hseHigh, hseTotal)
  const hseModPct = pct1(hseMod, hseTotal)

  const ietrRisk = data.ietrClassDist.find(d => d.name === 'Situação de risco')?.value ?? 0
  const ietrAtt = data.ietrClassDist.find(d => d.name === 'Zona de atenção')?.value ?? 0
  const ietrOk = data.ietrClassDist.find(d => d.name === 'Condição adequada')?.value ?? 0
  const ietrTotal = ietrRisk + ietrAtt + ietrOk
  const ietrRiskPct = pct1(ietrRisk, ietrTotal)

  const topCriticalGroups = [...data.stratumRows]
    .filter(r => r.answered >= 5 && r.hseAvg !== null)
    .sort((a, b) => ((b.hseAvg ?? 0) - (a.hseAvg ?? 0)))
    .slice(0, 3)
    .map(r => r.name)

  const topIetrGroups = [...data.ietrStratumRows]
    .filter(r => r.answered >= 5)
    .sort((a, b) => b.highPct - a.highPct)
    .slice(0, 3)
    .map(r => r.name)

  const topDomains = [...data.domainAvgs]
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 4)
    .map(d => d.domain)

  const lowDomains = [...data.domainAvgs]
    .filter(d => d.avg < 1.5)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 4)
    .map(d => d.domain)

  const focusGroups = topCriticalGroups.length > 0 ? topCriticalGroups.join(', ') : data.stratumLabel
  const ietrGroups = topIetrGroups.length > 0 ? topIetrGroups.join(', ') : 'grupos prioritários'
  const highDomainsText = topDomains.length > 0 ? topDomains.join(', ') : 'domínios críticos'
  const safeDomainsText = lowDomains.length > 0 ? lowDomains.join(', ') : 'domínios de menor risco'

  type PlanItem = {
    title: string
    owner: string
    deadline: string
    description: string
    metric: string
  }

  let title = ''
  let focus = ''
  let accent = C.mintDk
  let items: PlanItem[] = []

  if (variant === 'moderado') {
    title = 'Risco Moderado - Ação Prioritária'
    focus = `Foco: trabalho remoto/IETR (${fmtPct(ietrRiskPct)}) e grupos com maior exposição combinada por ${data.stratumLabel.toLowerCase()}: ${focusGroups}. Prazo de execução: até 6 meses.`
    accent = C.mintDk
    items = [
      {
        title: 'Diagnóstico participativo de carga e teletrabalho',
        owner: 'Pessoas & Cultura + Lideranças das áreas críticas',
        deadline: '30 dias',
        description: `Grupos focais e entrevistas para mapear causas de sobrecarga e barreiras ao remoto em ${focusGroups}.`,
        metric: 'Aferição: >=80% das equipes críticas ouvidas; relatório com causas-raiz e plano de mitigação.',
      },
      {
        title: 'Protocolo de uso saudável do trabalho remoto',
        owner: 'Pessoas & Cultura + TI + Lideranças',
        deadline: '60 dias',
        description: 'Definir política de desconexão, limites de reuniões, pausas, ergonomia e disponibilidade.',
        metric: 'Aferição: política publicada; 100% das lideranças treinadas; check-list de adesão.',
      },
      {
        title: 'Revisão de carga, metas e capacidade',
        owner: 'Lideranças + Diretoria Executiva',
        deadline: '90 dias',
        description: `Revisar portfólio, prioridades e distribuição de demandas considerando ${highDomainsText}.`,
        metric: 'Aferição: redução dos indicadores de sobrecarga; nova leitura de Demandas em 6 meses.',
      },
      {
        title: 'Monitoramento mensal das áreas críticas',
        owner: 'Pessoas & Cultura + Saúde Ocupacional',
        deadline: 'contínuo',
        description: `Pulse survey mensal em ${focusGroups}, com painel de indicadores e gatilhos de revisão.`,
        metric: 'Aferição: dashboard atualizado mensalmente; plano revisado se risco persistir.',
      },
      {
        title: 'Mitigação direcionada para grupos de maior risco IETR',
        owner: 'Lideranças + Pessoas & Cultura',
        deadline: '120 dias',
        description: `Ações específicas para ${ietrGroups}, priorizando funções com maior exposição no IETR.`,
        metric: 'Aferição: melhoria de score IETR por grupo; redução da situação de risco no próximo ciclo.',
      },
    ]
  } else if (variant === 'toleravel') {
    title = 'Risco Tolerável - Ação Corretiva Planejada'
    focus = `Foco: manter estabilidade e prevenir avanço de fatores secundários (${highDomainsText}). Janela de execução: 3 a 9 meses.`
    accent = 'E28500'
    items = [
      {
        title: 'Transparência dos processos de comunicação e mudanças',
        owner: 'Gestão Institucional + Comunicação Interna',
        deadline: '3 meses',
        description: 'Mapear fluxos de informação, rituais de alinhamento, decisões e canal seguro de feedback.',
        metric: 'Aferição: satisfação com comunicação interna +10 p.p. no próximo ciclo.',
      },
      {
        title: 'Fortalecimento da autonomia e controle sobre o trabalho',
        owner: 'Lideranças + Pessoas & Cultura',
        deadline: '4 meses',
        description: 'Formação de lideranças em delegação, feedforward e gestão participativa.',
        metric: 'Aferição: percepção de controle/autonomia estável ou melhorada.',
      },
      {
        title: 'Capacitação de lideranças em saúde mental ocupacional',
        owner: 'Pessoas & Cultura',
        deadline: '4 meses',
        description: 'Workshop de sinais de sofrimento, escuta ativa e encaminhamento adequado, alinhado à ISO 45003.',
        metric: 'Aferição: 100% das lideranças das áreas prioritárias capacitadas.',
      },
      {
        title: 'Canal de escuta e suporte psicológico acessível',
        owner: 'Pessoas & Cultura + Direção',
        deadline: '6 meses',
        description: 'Implantar ou ampliar apoio psicológico, comunicação sem estigma e fluxo de encaminhamento.',
        metric: 'Aferição: canal disponível, divulgado e acompanhado semestralmente.',
      },
      {
        title: 'Rotina trimestral de revisão do plano',
        owner: 'Comitê de acompanhamento',
        deadline: 'contínuo',
        description: 'Revisão de indicadores, status das ações, riscos residuais e necessidade de replanejamento.',
        metric: 'Aferição: atas trimestrais e atualização contínua do plano de ação.',
      },
    ]
  } else {
    title = 'Risco Trivial - Manutenção e Monitoramento Contínuo'
    focus = `Foco: preservar fatores de proteção já consolidados (${safeDomainsText}) e impedir deterioração dos domínios de baixo risco.`
    accent = C.low
    items = [
      {
        title: 'Manutenção do suporte da liderança e dos colegas',
        owner: 'Pessoas & Cultura + Lideranças',
        deadline: 'contínuo',
        description: 'Programas de reconhecimento, 1:1 regulares e práticas colaborativas entre equipes.',
        metric: 'Aferição: apoio de liderança e colegas mantido ou melhorado.',
      },
      {
        title: 'Clareza de papéis e revisão de descrições de cargos',
        owner: 'Pessoas & Cultura',
        deadline: '6 meses',
        description: 'Atualizar responsabilidades, onboarding e rituais de alinhamento entre áreas.',
        metric: 'Aferição: 100% dos cargos críticos com descrição atualizada.',
      },
      {
        title: 'Comunicação interna sobre saúde psicossocial',
        owner: 'Comunicação + Pessoas & Cultura',
        deadline: '3 meses',
        description: 'Campanhas educativas com fatores de risco, resultados do mapeamento e canais de suporte.',
        metric: 'Aferição: alcance >=80% dos colaboradores elegíveis.',
      },
      {
        title: 'Ciclo anual de mapeamento psicossocial',
        owner: 'BeeTouch + Pessoas & Cultura',
        deadline: 'até 12 meses',
        description: `Reaplicação do HSE/IETR para comparar evolução dos indicadores (alto ${fmtPct(hseHighPct)} | moderado ${fmtPct(hseModPct)}).`,
        metric: 'Aferição: taxa de resposta >=75%; relatório comparativo em até 30 dias após coleta.',
      },
      {
        title: 'Integração com ritos de gestão existentes',
        owner: 'Direção + Pessoas & Cultura',
        deadline: 'contínuo',
        description: 'Incluir indicadores psicossociais nas pautas executivas e revisão periódica de prioridades.',
        metric: 'Aferição: indicadores revisados em fóruns executivos e planos atualizados.',
      },
    ]
  }

  const { slide } = mkBase(prs, title, data.clientName, `${sNum} | PLANO DE AÇÃO`)
  const titleY = 1.18
  slide.addShape('rect', {
    x: MX, y: titleY + 0.42, w: CW, h: 0.015,
    fill: { color: C.border }, line: { color: C.border, width: 0 },
  })

  slide.addText(focus, {
    x: MX, y: titleY + 0.62, w: CW, h: 0.26,
    fontSize: 11.2, bold: true, color: accent, fontFace: 'Inter',
  })

  const listY = titleY + 1.02
  const listH = H - listY - 0.45
  const rowGap = 0.12
  const rowH = Math.min(1.02, (listH - rowGap * (items.length - 1)) / items.length)

  items.forEach((it, i) => {
    const y = listY + i * (rowH + rowGap)
    const cardBg = i % 2 === 0 ? 'F4FAFD' : C.white

    drawRoundedCard(slide, MX, y, CW, rowH, { fill: cardBg, borderColor: 'D7E6EF', radius: 0.08 })
    slide.addShape('ellipse', {
      x: MX + 0.18, y: y + rowH / 2 - 0.17, w: 0.34, h: 0.34,
      fill: { color: accent }, line: { color: accent, width: 0 },
    })
    slide.addText(String(i + 1), {
      x: MX + 0.18, y: y + rowH / 2 - 0.06, w: 0.34, h: 0.12,
      fontSize: 10, bold: true, color: C.white, align: 'center', fontFace: 'Manrope',
    })

    slide.addText(it.title, {
      x: MX + 0.7, y: y + 0.13, w: 7.9, h: 0.2,
      fontSize: 13, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    slide.addText(`Resp.: ${it.owner} | Prazo: ${it.deadline}`, {
      x: MX + 0.7, y: y + 0.38, w: 7.9, h: 0.16,
      fontSize: 8.8, bold: true, color: accent, fontFace: 'Inter',
    })
    slide.addText(it.description, {
      x: MX + 0.7, y: y + 0.59, w: 7.9, h: 0.16,
      fontSize: 8.4, color: C.textMd, fontFace: 'Inter',
    })

    slide.addText(it.metric, {
      x: MX + CW - 4.4, y: y + rowH / 2 - 0.08, w: 4.15, h: 0.16,
      fontSize: 8.1, color: C.textLt, italic: true, align: 'left', fontFace: 'Inter',
    })
  })
}

function addActionPlanDomainSpecificSlide(prs: PptxGenJS, data: ReportPayload) {
  const highDomains = [...data.domainAvgs]
    .filter((d) => d.avg >= 2.5)
    .sort((a, b) => b.avg - a.avg)
  const moderateDomains = [...data.domainAvgs]
    .filter((d) => d.avg >= 1.5 && d.avg < 2.5)
    .sort((a, b) => b.avg - a.avg)

  const severity: DomainPlanSeverity = highDomains.length > 0 ? 'alto' : 'moderado'
  const selected = highDomains.length > 0 ? highDomains[0] : moderateDomains[0]
  if (!selected) return

  const threshold = severity === 'alto' ? 2.5 : 1.5
  const eligible = data.stratumRows.filter((r) => r.answered >= 5 && r.domainAvgs[selected.domain] !== null)
  const recurring = eligible.filter((r) => (r.domainAvgs[selected.domain] ?? 0) >= threshold)
  const recurrencePct = pct1(recurring.length, eligible.length)
  const topGroups = [...eligible]
    .sort((a, b) => ((b.domainAvgs[selected.domain] ?? 0) - (a.domainAvgs[selected.domain] ?? 0)))
    .slice(0, 3)

  const totalWithAnswers = data.stratumRows.filter((r) => r.answered >= 5).length
  const impactedPct = pct1(recurring.length, totalWithAnswers)
  const scoreTxt = selected.avg.toFixed(2).replace('.', ',')
  const levelTxt = riskLabel(selected.avg)
  const accent = riskColor(selected.avg)
  const actions = getDomainActionTemplate(selected.domain, severity)
  const sNum = data.hasIetr ? '07' : '06'

  const { slide, cY, cH } = mkBase(prs, `Plano Específico - Gestão de ${selected.domain}`, data.clientName, `${sNum} | PLANO DE AÇÃO`)

  const subtitle = severity === 'alto'
    ? `Domínio crítico prioritário no resultado geral, com necessidade de resposta imediata por ${data.stratumLabel.toLowerCase()}.`
    : `Domínio moderado com maior peso relativo nesta base, priorizado para prevenção de agravamento por ${data.stratumLabel.toLowerCase()}.`

  slide.addText(subtitle, {
    x: MX, y: cY + 0.02, w: CW, h: 0.18,
    fontSize: 8.9, color: C.textLt, italic: true, fontFace: 'Inter',
  })

  const kpiY = cY + 0.24
  const kpiH = 1.0
  const kpiGap = 0.16
  const kpiW = (CW - kpiGap * 3) / 4
  const kpis = [
    { value: scoreTxt, label: selected.domain, sub: 'score atual do domínio', color: accent },
    { value: levelTxt, label: 'classificação', sub: severity === 'alto' ? 'faixa crítica' : 'faixa moderada', color: accent },
    { value: fmtPct(recurrencePct), label: 'recorrência', sub: `${recurring.length} de ${Math.max(eligible.length, 1)} grupos com N >= 5`, color: C.blue },
    { value: fmtPct(impactedPct), label: 'impacto estratificado', sub: `${data.stratumLabel.toLowerCase()} com exposição relevante`, color: C.mintDk },
  ]

  kpis.forEach((k, i) => {
    const x = MX + i * (kpiW + kpiGap)
    drawRoundedCard(slide, x, kpiY, kpiW, kpiH)
    slide.addShape('roundRect', {
      x, y: kpiY, w: 0.07, h: kpiH,
      fill: { color: k.color }, line: { color: k.color, width: 0 }, rectRadius: 0.09,
    })
    slide.addText(k.value, {
      x: x + 0.2, y: kpiY + 0.2, w: kpiW - 0.28, h: 0.34,
      fontSize: 17, bold: true, color: k.color, fontFace: 'Manrope',
    })
    slide.addText(k.label, {
      x: x + 0.2, y: kpiY + 0.62, w: kpiW - 0.28, h: 0.15,
      fontSize: 8.2, color: C.textLt, fontFace: 'Inter',
    })
    slide.addText(k.sub, {
      x: x + 0.2, y: kpiY + 0.82, w: kpiW - 0.28, h: 0.14,
      fontSize: 8.1, color: C.textDk, fontFace: 'Inter',
    })
  })

  const bodyY = kpiY + kpiH + 0.2
  const bodyH = cH - (bodyY - cY)
  const leftW = 4.15
  const rightW = CW - leftW - 0.24

  drawRoundedCard(slide, MX, bodyY, leftW, bodyH)
  slide.addShape('roundRect', {
    x: MX, y: bodyY, w: 0.07, h: bodyH,
    fill: { color: accent }, line: { color: accent, width: 0 }, rectRadius: 0.09,
  })
  slide.addText('Leitura dinâmica do domínio', {
    x: MX + 0.22, y: bodyY + 0.14, w: leftW - 0.36, h: 0.2,
    fontSize: 12.5, bold: true, color: C.textDk, fontFace: 'Manrope',
  })

  slide.addText(
    `${selected.domain} aparece como foco prioritário nesta base com score ${scoreTxt} (${levelTxt.toLowerCase()}). A recorrência por ${data.stratumLabel.toLowerCase()} indica ${fmtPct(recurrencePct)} em faixa de atenção para este fator.`,
    {
      x: MX + 0.22, y: bodyY + 0.44, w: leftW - 0.36, h: 0.82,
      fontSize: 9.8, color: C.textDk, fontFace: 'Inter',
    },
  )

  slide.addText('Ranking dos grupos mais expostos', {
    x: MX + 0.22, y: bodyY + 1.34, w: leftW - 0.36, h: 0.18,
    fontSize: 8.6, bold: true, color: C.textLt, fontFace: 'Manrope',
  })

  if (topGroups.length === 0) {
    slide.addText(`Sem grupos com amostra mínima para ${selected.domain}.`, {
      x: MX + 0.22, y: bodyY + 1.62, w: leftW - 0.36, h: 0.3,
      fontSize: 8.5, color: C.textLt, italic: true, fontFace: 'Inter',
    })
  } else {
    const rankingBaseY = bodyY + 1.62
    const rankingStep = 0.5
    const maxScore = Math.max(...topGroups.map((r) => r.domainAvgs[selected.domain] ?? 0), 1)
    const nameW = 1.82
    const trackX = MX + 0.22 + nameW
    const trackW = 0.92
    const scoreX = trackX + trackW + 0.12

    topGroups.forEach((r, i) => {
      const score = r.domainAvgs[selected.domain] ?? 0
      const scorePct = Math.max(0.08, score / maxScore)
      const y = rankingBaseY + i * rankingStep

      slide.addText(r.name.toUpperCase(), {
        x: MX + 0.22, y: y + 0.03, w: nameW - 0.08, h: 0.14,
        fontSize: 8.6, color: C.textDk, fontFace: 'Inter',
      })

      slide.addShape('roundRect', {
        x: trackX, y, w: trackW, h: 0.16,
        fill: { color: 'DDE4EA' }, line: { color: 'DDE4EA', width: 0 }, rectRadius: 0.05,
      })
      slide.addShape('roundRect', {
        x: trackX, y, w: trackW * scorePct, h: 0.16,
        fill: { color: C.mod }, line: { color: C.mod, width: 0 }, rectRadius: 0.05,
      })

      slide.addText(score.toFixed(2).replace('.', ','), {
        x: scoreX, y: y + 0.01, w: 0.44, h: 0.14,
        fontSize: 9.2, bold: true, color: C.mod, align: 'right', fontFace: 'Manrope',
      })
      slide.addText('HSE', {
        x: scoreX + 0.5, y: y + 0.02, w: 0.35, h: 0.12,
        fontSize: 7.8, color: C.mod, fontFace: 'Inter',
      })
    })
  }

  const rightX = MX + leftW + 0.24
  drawRoundedCard(slide, rightX, bodyY, rightW, bodyH)
  slide.addShape('roundRect', {
    x: rightX, y: bodyY, w: 0.07, h: bodyH,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09,
  })
  slide.addText('Ações recomendadas (modelo base)', {
    x: rightX + 0.22, y: bodyY + 0.14, w: rightW - 0.36, h: 0.2,
    fontSize: 12.5, bold: true, color: C.textDk, fontFace: 'Manrope',
  })

  const rowGap = 0.08
  const rowTop = bodyY + 0.42
  const rowH = Math.min(0.68, (bodyH - 0.52 - rowGap * (actions.length - 1)) / actions.length)
  actions.forEach((action, i) => {
    const y = rowTop + i * (rowH + rowGap)
    const rowBg = i % 2 === 0 ? 'F6FAFD' : C.white
    drawRoundedCard(slide, rightX + 0.12, y, rightW - 0.24, rowH, { fill: rowBg, borderColor: 'DCE8F1', radius: 0.06 })
    slide.addText(`${i + 1}. ${action.title}`, {
      x: rightX + 0.22, y: y + 0.08, w: rightW - 0.44, h: 0.16,
      fontSize: 8.9, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    slide.addText(`Responsável: ${action.owner} | Prazo: ${action.deadline}`, {
      x: rightX + 0.22, y: y + 0.26, w: rightW - 0.44, h: 0.14,
      fontSize: 7.8, bold: true, color: C.blue, fontFace: 'Inter',
    })
    slide.addText(action.description, {
      x: rightX + 0.22, y: y + 0.42, w: rightW - 0.44, h: 0.14,
      fontSize: 7.6, color: C.textMd, fontFace: 'Inter',
    })
  })
}

function addActionPlanIetrSpecificSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasIetr) return

  const ietrRisk = data.ietrClassDist.find((d) => d.name === 'Situação de risco')?.value ?? 0
  const ietrAtt = data.ietrClassDist.find((d) => d.name === 'Zona de atenção')?.value ?? 0
  const ietrOk = data.ietrClassDist.find((d) => d.name === 'Condição adequada')?.value ?? 0
  const ietrTotal = ietrRisk + ietrAtt + ietrOk
  if (ietrTotal === 0 || data.ietrAvg === null || data.ietrDomainAvgs.length === 0) return

  const riskPct = pct1(ietrRisk, ietrTotal)
  const attPct = pct1(ietrAtt, ietrTotal)
  const okPct = pct1(ietrOk, ietrTotal)
  const criticalDomain = [...data.ietrDomainAvgs].sort((a, b) => a.avg - b.avg)[0]
  const criticalScoreTxt = criticalDomain.avg.toFixed(2).replace('.', ',')
  const criticalLabel = ietrLabel(criticalDomain.avg).toLowerCase()
  const criticalColor = ietrColor(criticalDomain.avg)

  const topIetrGroups = [...data.ietrStratumRows]
    .filter((r) => r.answered >= 5)
    .sort((a, b) => b.highPct - a.highPct)
    .slice(0, 4)
    .map((r) => r.name)

  const focusTxt = topIetrGroups.length > 0
    ? topIetrGroups.join(', ')
    : `${data.stratumLabel.toLowerCase()} prioritários`

  const sNum = data.hasIetr ? '07' : '06'
  const { slide, cY, cH } = mkBase(prs, 'Plano Específico - Trabalho Remoto (IETR)', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  slide.addShape('rect', {
    x: MX, y: cY + 0.16, w: CW, h: 0.012,
    fill: { color: C.border }, line: { color: C.border, width: 0 },
  })

  const kpiY = cY + 0.3
  const kpiGap = 0.12
  const kpiW = (CW - kpiGap * 4) / 5
  const kpiH = 1.14
  const cards = [
    {
      value: data.ietrAvg.toFixed(2).replace('.', ','),
      label: 'score médio IETR',
      sub: ietrLabel(data.ietrAvg),
      color: 'E28500',
    },
    {
      value: fmtPct(riskPct),
      label: 'situação de risco',
      sub: `${ietrRisk} colaboradores`,
      color: C.high,
    },
    {
      value: fmtPct(attPct),
      label: 'zona de atenção',
      sub: `${ietrAtt} colaboradores`,
      color: C.mod,
    },
    {
      value: fmtPct(okPct),
      label: 'condição adequada',
      sub: `${ietrOk} colaboradores`,
      color: C.low,
    },
    {
      value: `${criticalDomain.domain} ${criticalScoreTxt}`,
      label: 'domínio crítico',
      sub: criticalLabel,
      color: criticalColor,
    },
  ]

  cards.forEach((card, i) => {
    const x = MX + i * (kpiW + kpiGap)
    drawRoundedCard(slide, x, kpiY, kpiW, kpiH)
    slide.addShape('roundRect', {
      x, y: kpiY, w: 0.06, h: kpiH,
      fill: { color: card.color }, line: { color: card.color, width: 0 }, rectRadius: 0.08,
    })
    slide.addText(card.value, {
      x: x + 0.18, y: kpiY + 0.3, w: kpiW - 0.28, h: 0.3,
      fontSize: i === 4 ? 11.5 : 16, bold: true, color: card.color, fontFace: 'Manrope',
    })
    slide.addText(card.label, {
      x: x + 0.18, y: kpiY + 0.78, w: kpiW - 0.28, h: 0.14,
      fontSize: 8.4, color: C.textMd, fontFace: 'Inter',
    })
    slide.addText(card.sub, {
      x: x + 0.18, y: kpiY + 0.98, w: kpiW - 0.28, h: 0.12,
      fontSize: 7.8, color: i === 4 ? card.color : C.textDk, fontFace: 'Inter',
    })
  })

  const panelY = kpiY + kpiH + 0.2
  const panelH = cH - (panelY - cY)
  drawRoundedCard(slide, MX, panelY, CW, panelH)
  slide.addShape('roundRect', {
    x: MX, y: panelY, w: 0.06, h: panelH,
    fill: { color: 'E28500' }, line: { color: 'E28500', width: 0 }, rectRadius: 0.08,
  })

  slide.addText('Ações específicas para o IETR', {
    x: MX + 0.28, y: panelY + 0.24, w: CW - 0.42, h: 0.24,
    fontSize: 16, bold: true, color: C.textDk, fontFace: 'Manrope',
  })

  const actions = [
    {
      title: 'Política de desconexão',
      desc: 'Definir janelas de comunicação, regra para urgências, pausas e expectativa de resposta.',
      color: 'E28500',
    },
    {
      title: 'Reuniões saudáveis',
      desc: 'Bloquear agendas de foco, limitar duração, evitar reuniões sem pauta e registrar decisões.',
      color: 'E28500',
    },
    {
      title: 'Ergonomia e infraestrutura',
      desc: 'Checklist de home office, orientação de postura, equipamentos e suporte tecnológico.',
      color: '138A93',
    },
    {
      title: 'Acompanhamento dos grupos críticos',
      desc: `Monitorar ${focusTxt}.`,
      color: '138A93',
    },
  ]

  const rowStartY = panelY + 0.6
  const rowGap = 0.13
  const rowH = 0.58
  actions.forEach((action, i) => {
    const y = rowStartY + i * (rowH + rowGap)
    slide.addShape('ellipse', {
      x: MX + 0.32, y: y + 0.12, w: 0.3, h: 0.3,
      fill: { color: action.color }, line: { color: action.color, width: 0 },
    })
    slide.addText(String(i + 1), {
      x: MX + 0.32, y: y + 0.22, w: 0.3, h: 0.1,
      fontSize: 8.5, bold: true, color: C.white, align: 'center', fontFace: 'Manrope',
    })
    slide.addText(action.title, {
      x: MX + 0.78, y: y + 0.1, w: CW - 1.1, h: 0.16,
      fontSize: 11.3, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    slide.addText(action.desc, {
      x: MX + 0.78, y: y + 0.34, w: CW - 1.1, h: 0.14,
      fontSize: 8.6, color: C.textDk, fontFace: 'Inter',
    })
  })

  slide.addText(
    `Critério de eficácia: reduzir a situação de risco IETR de ${fmtPct(riskPct)} para patamar inferior a 30% e elevar a condição adequada no próximo ciclo.`,
    {
      x: MX + 0.28, y: panelY + panelH - 0.26, w: CW - 0.42, h: 0.16,
      fontSize: 10, bold: true, color: 'E28500', fontFace: 'Inter',
    },
  )
}

function addActionPlanFocusedGroupsSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = data.hasIetr ? '07' : '06'

  const ietrRows = [...data.ietrStratumRows]
    .filter((r) => r.answered >= 5 && r.ietrAvg !== null)
    .sort((a, b) => b.highPct - a.highPct)

  const hseRows = [...data.stratumRows]
    .filter((r) => r.answered >= 5 && r.hseAvg !== null)
    .sort((a, b) => ((b.hseAvg ?? 0) - (a.hseAvg ?? 0)))

  type FocusCard = {
    name: string
    risk: string
    action: string
    color: string
    score: number
  }

  const actionHint = (name: string): string => {
    const n = name.toLowerCase()
    if (n.includes('educ')) return 'Diagnóstico imediato de teletrabalho, prazos e reuniões.'
    if (n.includes('comunic')) return 'Mapa de capacidade, agenda de alinhamento e urgências.'
    if (n.includes('cargo') || n.includes('fun')) return 'Ajustar autonomia, escopo e interfaces de responsabilidade.'
    if (n.includes('45') || n.includes('50') || n.includes('54') || n.includes('faixa')) return 'Reforçar ergonomia, suporte tecnológico e gestão de pausas.'
    if (n.includes('raca') || n.includes('raça') || n.includes('cor')) return 'Investigar sobreposição de fatores de risco e barreiras de suporte.'
    if (n.includes('natureza')) return 'Revisar carga, prioridades e suporte remoto por rotina de trabalho.'
    return 'Aprofundar causas-raiz e executar plano de mitigação dirigido ao grupo.'
  }

  const cards: FocusCard[] = []
  const seen = new Set<string>()

  ietrRows.forEach((r) => {
    if (seen.has(r.name)) return
    seen.add(r.name)
    cards.push({
      name: r.name,
      risk: `Risco: IETR score ${(r.ietrAvg ?? 0).toFixed(2).replace('.', ',')}; ${fmtPct(r.highPct)} em situação de risco`,
      action: `Ação: ${actionHint(r.name)}`,
      color: r.highPct >= 40 ? C.high : 'E28500',
      score: r.highPct,
    })
  })

  hseRows.forEach((r) => {
    if (seen.has(r.name)) return
    seen.add(r.name)
    cards.push({
      name: r.name,
      risk: `Risco: HSE score ${(r.hseAvg ?? 0).toFixed(2).replace('.', ',')}; ${fmtPct(r.modPct)} moderado`,
      action: `Ação: ${actionHint(r.name)}`,
      color: (r.hseAvg ?? 0) >= 2.5 ? C.high : 'E28500',
      score: (r.hseAvg ?? 0) * 25,
    })
  })

  const topCards = cards.slice(0, 6)
  if (topCards.length === 0) return

  const { slide, cY, cH } = mkBase(prs, 'Grupos de Atenção Específica - Ações Direcionadas', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  slide.addShape('rect', {
    x: MX, y: cY + 0.16, w: CW, h: 0.012,
    fill: { color: C.border }, line: { color: C.border, width: 0 },
  })

  const gridY = cY + 0.28
  const gridH = cH - 0.98
  const colGap = 0.3
  const rowGap = 0.24
  const cardW = (CW - colGap * 2) / 3
  const cardH = (gridH - rowGap) / 2

  topCards.forEach((card, i) => {
    const row = Math.floor(i / 3)
    const col = i % 3
    const x = MX + col * (cardW + colGap)
    const y = gridY + row * (cardH + rowGap)

    drawRoundedCard(slide, x, y, cardW, cardH)
    slide.addShape('roundRect', {
      x, y, w: 0.06, h: cardH,
      fill: { color: card.color }, line: { color: card.color, width: 0 }, rectRadius: 0.08,
    })

    slide.addText(card.name, {
      x: x + 0.28, y: y + 0.22, w: cardW - 0.42, h: 0.24,
      fontSize: 16, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    slide.addText(card.risk, {
      x: x + 0.28, y: y + 0.74, w: cardW - 0.42, h: 0.16,
      fontSize: 9.2, bold: true, color: card.color, fontFace: 'Inter',
    })
    slide.addText(card.action, {
      x: x + 0.28, y: y + 1.22, w: cardW - 0.42, h: 0.16,
      fontSize: 8.8, color: C.textDk, fontFace: 'Inter',
    })
  })

  const positiveIetr = [...data.ietrStratumRows]
    .filter((r) => r.answered >= 5 && r.ietrAvg !== null)
    .sort((a, b) => b.lowPct - a.lowPct)[0]

  const positiveHse = [...data.stratumRows]
    .filter((r) => r.answered >= 5 && r.hseAvg !== null)
    .sort((a, b) => ((a.hseAvg ?? 99) - (b.hseAvg ?? 99)))[0]

  const positiveText = positiveIetr
    ? `Referência positiva: ${positiveIetr.name} apresentou IETR score ${(positiveIetr.ietrAvg ?? 0).toFixed(2).replace('.', ',')}. Recomenda-se documentar e disseminar práticas bem-sucedidas desta área como benchmarking interno.`
    : positiveHse
      ? `Referência positiva: ${positiveHse.name} apresentou HSE score ${(positiveHse.hseAvg ?? 0).toFixed(2).replace('.', ',')}. Recomenda-se documentar e disseminar práticas bem-sucedidas desta área como benchmarking interno.`
      : 'Referência positiva: manter monitoramento de práticas de proteção e replicar rotinas com melhor desempenho.'

  const refY = cY + cH - 0.34
  drawRoundedCard(slide, MX, refY, CW, 0.3, { fill: C.white, borderColor: C.border, radius: 0.07 })
  slide.addShape('roundRect', {
    x: MX, y: refY, w: 0.06, h: 0.3,
    fill: { color: C.low }, line: { color: C.low, width: 0 }, rectRadius: 0.07,
  })
  slide.addText(positiveText, {
    x: MX + 0.28, y: refY + 0.08, w: CW - 0.42, h: 0.14,
    fontSize: 9.2, bold: true, color: '0E6E2D', fontFace: 'Inter',
  })
}

type TimelineLane = 'moderado' | 'toleravel' | 'trivial'

type TimelineTask = {
  label: string
  deadline: string
  lane: TimelineLane
}

function parseDeadlineDurationMonths(deadline: string, lane: TimelineLane): number {
  const d = deadline.toLowerCase()
  if (d.includes('contínuo') || d.includes('continuo')) return 12

  const daysMatch = d.match(/(\d+)\s*dias?/)
  if (daysMatch) {
    const days = Number(daysMatch[1])
    return Math.max(1, Math.ceil(days / 30))
  }

  const monthsMatch = d.match(/(\d+)\s*mes/)
  if (monthsMatch) return Math.max(1, Number(monthsMatch[1]))

  if (d.includes('<= 6m') || d.includes('até 6')) return 6
  if (d.includes('<= 9m') || d.includes('até 9')) return 9
  if (d.includes('<= 12m') || d.includes('até 12')) return 12

  if (lane === 'moderado') return 6
  if (lane === 'toleravel') return 9
  return 12
}

function pickTimelineStartMonth(task: TimelineTask): number {
  const t = task.label.toLowerCase()

  if (task.lane === 'moderado') return 1

  if (task.lane === 'toleravel') {
    if (t.includes('capacitação') || t.includes('canal')) return 2
    return 1
  }

  if (t.includes('ciclo anual') || t.includes('mapeamento')) return 10
  if (t.includes('clareza de papéis') || t.includes('ritos')) return 3
  return 1
}

function addActionPlanIntegratedTimelineSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = data.hasIetr ? '07' : '06'
  const { slide, cY, cH } = mkBase(prs, 'Cronograma Integrado - 90 / 180 / 365 dias', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  const tasks: TimelineTask[] = [
    { label: 'Diagnóstico participativo', deadline: '30 dias', lane: 'moderado' },
    { label: 'Protocolo teletrabalho saudável', deadline: '60 dias', lane: 'moderado' },
    { label: 'Redistribuição de carga/metas', deadline: '90 dias', lane: 'moderado' },
    { label: 'Monitoramento mensal áreas críticas', deadline: 'contínuo', lane: 'moderado' },
    { label: 'Comunicação/mudanças', deadline: '3 meses', lane: 'toleravel' },
    { label: 'Autonomia e liderança participativa', deadline: '4 meses', lane: 'toleravel' },
    { label: 'Capacitação de lideranças', deadline: '4 meses', lane: 'toleravel' },
    { label: 'Canal de suporte psicológico', deadline: '6 meses', lane: 'toleravel' },
    { label: 'Clareza de papéis e JDs', deadline: '6 meses', lane: 'trivial' },
    { label: 'Comunicação saúde psicossocial', deadline: '3 meses', lane: 'trivial' },
    { label: '3º ciclo de mapeamento', deadline: 'até 12 meses', lane: 'trivial' },
  ]

  const laneColor: Record<TimelineLane, string> = {
    moderado: '138A93',
    toleravel: 'E28500',
    trivial: '1E7B3E',
  }

  const leftW = 2.46
  const timelineX = MX + leftW
  const timelineW = CW - leftW
  const headerY = cY + 0.56
  const headerH = 0.34
  const rowTop = headerY + headerH + 0.15
  const legendY = cY + cH - 0.2
  const rowsH = legendY - rowTop - 0.25
  const rowGap = 0.1
  const rowH = Math.min(0.36, (rowsH - rowGap * (tasks.length - 1)) / tasks.length)

  const unitW = timelineW / 12

  const headerSegments = [
    { label: 'Mês 1', months: 1 },
    { label: 'Mês 2', months: 1 },
    { label: 'Mês 3', months: 1 },
    { label: 'Mês 4', months: 1 },
    { label: 'Mês 5', months: 1 },
    { label: 'Mês 6', months: 1 },
    { label: 'Mês 7-9', months: 3 },
    { label: 'Mês 10-12', months: 3 },
  ]

  let hx = timelineX
  headerSegments.forEach((seg, i) => {
    const w = seg.months * unitW
    slide.addShape('roundRect', {
      x: hx, y: headerY, w, h: headerH,
      fill: { color: C.navy }, line: { color: C.navy, width: 0.3 }, rectRadius: i === 0 || i === headerSegments.length - 1 ? 0.05 : 0,
    })
    slide.addText(seg.label, {
      x: hx, y: headerY + 0.1, w, h: 0.14,
      fontSize: 8.5, bold: true, color: C.white, align: 'center', fontFace: 'Manrope',
    })
    hx += w
  })

  tasks.forEach((task, idx) => {
    const y = rowTop + idx * (rowH + rowGap)
    slide.addText(task.label, {
      x: MX, y: y + 0.07, w: leftW - 0.18, h: 0.14,
      fontSize: 8.7, color: C.textDk, fontFace: 'Inter',
    })

    const start = pickTimelineStartMonth(task)
    const duration = parseDeadlineDurationMonths(task.deadline, task.lane)
    const end = Math.min(12, start + duration - 1)
    const barX = timelineX + (start - 1) * unitW
    const barW = Math.max(unitW * 0.9, (end - start + 1) * unitW - 0.03)

    slide.addShape('roundRect', {
      x: barX, y, w: barW, h: rowH,
      fill: { color: laneColor[task.lane] }, line: { color: laneColor[task.lane], width: 0 }, rectRadius: 0.05,
    })
  })

  const legends = [
    { label: 'Moderado (<=6m)', color: laneColor.moderado },
    { label: 'Tolerável (<=9m)', color: laneColor.toleravel },
    { label: 'Trivial / manutenção (<=12m)', color: laneColor.trivial },
  ]

  let lx = MX
  legends.forEach((l) => {
    slide.addShape('rect', {
      x: lx, y: legendY, w: 0.2, h: 0.12,
      fill: { color: l.color }, line: { color: l.color, width: 0 },
    })
    slide.addText(l.label, {
      x: lx + 0.28, y: legendY + 0.01, w: 1.8, h: 0.12,
      fontSize: 8.2, color: C.textDk, fontFace: 'Inter',
    })
    lx += 2.05
  })
}

function addActionPlanGovernanceIndicatorsSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = data.hasIetr ? '07' : '06'
  const { slide, cY, cH } = mkBase(prs, 'Indicadores de Acompanhamento e Governança', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  const hseHigh = data.hseClassDist.find((d) => d.name === 'Alto risco')?.value ?? 0
  const hseMod = data.hseClassDist.find((d) => d.name === 'Risco moderado')?.value ?? 0
  const hseLow = data.hseClassDist.find((d) => d.name === 'Baixo risco')?.value ?? 0
  const hseTotal = hseHigh + hseMod + hseLow
  const hseHighPct = pct1(hseHigh, hseTotal)
  const hseModPct = pct1(hseMod, hseTotal)

  const demandHse = data.domainAvgs.find((d) => d.domain === 'Demandas')?.avg ?? null

  const ietrRisk = data.ietrClassDist.find((d) => d.name === 'Situação de risco')?.value ?? 0
  const ietrAtt = data.ietrClassDist.find((d) => d.name === 'Zona de atenção')?.value ?? 0
  const ietrOk = data.ietrClassDist.find((d) => d.name === 'Condição adequada')?.value ?? 0
  const ietrTotal = ietrRisk + ietrAtt + ietrOk
  const ietrRiskPct = pct1(ietrRisk, ietrTotal)
  const ietrOkPct = pct1(ietrOk, ietrTotal)

  const validHseGroups = data.stratumRows.filter((r) => r.answered >= 5)
  const criticalHseGroups = validHseGroups.filter((r) => (r.hseAvg ?? 0) >= 2.5)
  const criticalGroupPct = pct1(criticalHseGroups.length, validHseGroups.length)

  const validIetrGroups = data.ietrStratumRows.filter((r) => r.answered >= 5)
  const criticalIetrGroups = validIetrGroups.filter((r) => r.highPct >= 40)
  const criticalIetrPct = pct1(criticalIetrGroups.length, validIetrGroups.length)

  const adherencePct = pct1(data.totalAnswered, data.totalCollabs)

  const rightColor = C.blue
  const leftColor = C.low

  type GovCard = {
    title: string
    body: string
    goal: string
    side: 'left' | 'right'
  }

  const cards: GovCard[] = [
    {
      title: 'Resultado HSE',
      body: `Score Demandas: ${demandHse !== null ? demandHse.toFixed(2).replace('.', ',') : '--'}; ${fmtPct(hseModPct)} moderado geral; ${fmtPct(criticalGroupPct)} dos grupos em criticidade alta.`,
      goal: `Meta: reduzir Demandas e manter alto risco global abaixo de ${hseHighPct > 0 ? fmtPct(Math.max(0, hseHighPct - 5)) : '5,0%'}.`,
      side: 'left',
    },
    {
      title: 'Resultado IETR',
      body: ietrTotal > 0
        ? `% situação de risco: ${fmtPct(ietrRiskPct)}; score Demanda e Controle monitorados; distribuição por grupo com N >= 5.`
        : 'Sem base IETR suficiente nesta extração para acompanhamento consolidado por grupo.',
      goal: ietrTotal > 0
        ? `Meta: reduzir risco IETR de ${fmtPct(ietrRiskPct)} para <30%.`
        : 'Meta: concluir base mínima do IETR no próximo ciclo.',
      side: 'right',
    },
    {
      title: 'Processo',
      body: `% ações concluídas; % lideranças capacitadas; pulse surveys respondidos e variação de risco por grupo crítico.`,
      goal: `Meta: >=90% das ações no prazo e adesão de ${fmtPct(adherencePct)} ou superior.`,
      side: 'left',
    },
    {
      title: 'Organização do trabalho',
      body: `Horas extras, retrabalho, reuniões, carga percebida e prioridades conflitantes nas áreas críticas.`,
      goal: `Meta: redução progressiva em áreas críticas (${fmtPct(criticalGroupPct)} HSE | ${fmtPct(criticalIetrPct)} IETR).`,
      side: 'right',
    },
    {
      title: 'Suporte e cuidado',
      body: `Uso do canal de escuta, encaminhamentos, percepção de apoio e redução de estigma nos grupos priorizados.`,
      goal: ietrTotal > 0
        ? `Meta: ampliar condição adequada no IETR para acima de ${fmtPct(Math.max(ietrOkPct, 40))}.`
        : 'Meta: canal implantado, divulgado e com monitoramento trimestral.',
      side: 'left',
    },
    {
      title: 'PGR/GRO',
      body: `Registro no inventário, responsáveis nominais, atas de acompanhamento e revisão periódica de riscos psicossociais.`,
      goal: 'Meta: plano vivo e integrado ao PGR com governança executiva trimestral.',
      side: 'right',
    },
  ]

  slide.addShape('rect', {
    x: MX, y: cY + 0.16, w: CW, h: 0.012,
    fill: { color: C.border }, line: { color: C.border, width: 0 },
  })

  const gridY = cY + 0.3
  const gridH = cH - 0.88
  const colGap = 0.44
  const rowGap = 0.18
  const colW = (CW - colGap) / 2
  const cardH = (gridH - rowGap * 2) / 3

  cards.forEach((card, i) => {
    const row = Math.floor(i / 2)
    const col = i % 2
    const x = MX + col * (colW + colGap)
    const y = gridY + row * (cardH + rowGap)
    const accent = card.side === 'left' ? leftColor : rightColor

    drawRoundedCard(slide, x, y, colW, cardH)
    slide.addShape('roundRect', {
      x, y, w: 0.06, h: cardH,
      fill: { color: accent }, line: { color: accent, width: 0 }, rectRadius: 0.08,
    })

    slide.addText(card.title, {
      x: x + 0.28, y: y + 0.22, w: colW - 0.42, h: 0.18,
      fontSize: 14, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    slide.addText(card.body, {
      x: x + 0.28, y: y + 0.58, w: colW - 0.42, h: 0.28,
      fontSize: 8.6, color: C.textDk, fontFace: 'Inter',
    })
    slide.addText(card.goal, {
      x: x + 0.28, y: y + cardH - 0.34, w: colW - 0.42, h: 0.16,
      fontSize: 8.8, bold: true, color: accent, fontFace: 'Inter',
    })
  })

  const rhythm = 'Ritmo sugerido: reunião mensal nas áreas críticas, revisão executiva trimestral, reavaliação HSE/IETR em até 12 meses e atualização do PGR sempre que houver mudança relevante.'
  const rhythmY = cY + cH - 0.32
  drawRoundedCard(slide, MX, rhythmY, CW, 0.32, { fill: C.white, borderColor: C.border, radius: 0.07 })
  slide.addShape('roundRect', {
    x: MX, y: rhythmY, w: 0.06, h: 0.32,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.07,
  })
  slide.addText(rhythm, {
    x: MX + 0.28, y: rhythmY + 0.1, w: CW - 0.42, h: 0.14,
    fontSize: 8.8, bold: true, color: C.textDk, fontFace: 'Inter',
  })
}

function addActionPlanNr1MandatoryElementsSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = data.hasIetr ? '07' : '06'
  const { slide, cY, cH } = mkBase(prs, 'Elementos Obrigatórios do Plano de Ação - NR-1', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  const ietrRisk = data.ietrClassDist.find((d) => d.name === 'Situação de risco')?.value ?? 0
  const ietrAtt = data.ietrClassDist.find((d) => d.name === 'Zona de atenção')?.value ?? 0
  const ietrOk = data.ietrClassDist.find((d) => d.name === 'Condição adequada')?.value ?? 0
  const ietrTotal = ietrRisk + ietrAtt + ietrOk
  const ietrRiskPct = pct1(ietrRisk, ietrTotal)

  const hseHigh = data.hseClassDist.find((d) => d.name === 'Alto risco')?.value ?? 0
  const hseMod = data.hseClassDist.find((d) => d.name === 'Risco moderado')?.value ?? 0
  const hseLow = data.hseClassDist.find((d) => d.name === 'Baixo risco')?.value ?? 0
  const hseTotal = hseHigh + hseMod + hseLow
  const hseHighPct = pct1(hseHigh, hseTotal)

  const leaders = data.stratumRows.filter((r) => r.answered >= 5).slice(0, 3).map((r) => r.name)
  const leadersTxt = leaders.length > 0 ? leaders.join(', ') : data.stratumLabel

  type Nr1Card = {
    title: string
    body: string
    color: string
  }

  const cards: Nr1Card[] = [
    {
      title: 'Cronograma',
      body: 'Prazos definidos por prioridade: ações moderadas até 6 meses, toleráveis até 9 meses e manutenção até 12 meses.',
      color: C.blue,
    },
    {
      title: 'Responsáveis',
      body: `Designação nominal de responsáveis: Direção, Pessoas & Cultura, lideranças de área, TI, Saúde Ocupacional e Comunicação. Foco inicial: ${leadersTxt}.`,
      color: '138A93',
    },
    {
      title: 'Acompanhamento',
      body: 'Pulse surveys mensais nas áreas críticas, dashboard de indicadores, reuniões trimestrais de revisão e registros de execução.',
      color: 'E28500',
    },
    {
      title: 'Aferição',
      body: `Métricas por ação: redução de score/risco, adesão a treinamentos, horas extras, ergonomia, suporte e evolução ${data.hasIetr ? 'HSE/IETR' : 'HSE'}.`,
      color: C.low,
    },
    {
      title: 'Melhoria contínua',
      body: 'Revisão imediata quando ação for insuficiente, revisão intermediária em 3 meses e reavaliação completa no próximo ciclo.',
      color: C.high,
    },
    {
      title: 'Integração PGR',
      body: 'Inserir plano no PGR/GRO, vinculado ao inventário de riscos e às práticas de saúde e segurança do trabalho.',
      color: C.navy,
    },
  ]

  slide.addShape('rect', {
    x: MX, y: cY + 0.16, w: CW, h: 0.012,
    fill: { color: C.border }, line: { color: C.border, width: 0 },
  })

  const gridY = cY + 0.3
  const gridH = cH - 0.88
  const colGap = 0.32
  const rowGap = 0.2
  const cardW = (CW - colGap * 2) / 3
  const cardH = (gridH - rowGap) / 2

  cards.forEach((card, i) => {
    const row = Math.floor(i / 3)
    const col = i % 3
    const x = MX + col * (cardW + colGap)
    const y = gridY + row * (cardH + rowGap)

    drawRoundedCard(slide, x, y, cardW, cardH)
    slide.addShape('roundRect', {
      x, y, w: 0.06, h: cardH,
      fill: { color: card.color }, line: { color: card.color, width: 0 }, rectRadius: 0.08,
    })

    slide.addText(card.title, {
      x: x + 0.28, y: y + 0.24, w: cardW - 0.42, h: 0.2,
      fontSize: 16, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    slide.addText(card.body, {
      x: x + 0.28, y: y + 0.8, w: cardW - 0.42, h: cardH - 0.96,
      fontSize: 8.8, color: C.textDk, fontFace: 'Inter',
    })
  })

  const nextSteps = `Próximos passos: validar com Direção e Pessoas & Cultura, nomear responsáveis, formalizar cronograma, iniciar diagnóstico nas áreas prioritárias, revisar em 3 meses e reavaliar em até 12 meses${data.hasIetr ? ` (IETR risco atual: ${fmtPct(ietrRiskPct)}).` : '.'} ${hseHighPct > 0 ? `Meta HSE: manter alto risco abaixo de ${fmtPct(Math.max(0, hseHighPct - 5))}.` : ''}`

  const footerY = cY + cH - 0.3
  drawRoundedCard(slide, MX, footerY, CW, 0.3, { fill: C.white, borderColor: C.border, radius: 0.07 })
  slide.addShape('roundRect', {
    x: MX, y: footerY, w: 0.06, h: 0.3,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.07,
  })
  slide.addText(nextSteps, {
    x: MX + 0.28, y: footerY + 0.09, w: CW - 0.42, h: 0.14,
    fontSize: 8.7, bold: true, color: C.blue, fontFace: 'Inter',
  })
}

/* ─── Legal / normativo ──────────────────────────────────────────────────── */
function addLegalSlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Contexto Normativo', data.clientName, '01 | CONTEXTO & METODOLOGIA')

  const cards = [
    {
      tag: 'NR-1', color: C.high,
      title: 'Norma Regulamentadora n 01',
      subtitle: 'Gerenciamento de Riscos Ocupacionais — Portaria MTE n 1.419/2024',
      body: 'A revisão de 2024 incluiu os fatores psicossociais no escopo do GRO/PGR, tornando obrigatória a elaboração de um Plano de Ação para mitigação de riscos psicossociais a partir de maio de 2025. Exige identificação, avaliação e controle de riscos, incluindo sobrecarga, assédio e violência no trabalho.',
    },
    {
      tag: 'ISO 45003', color: C.nav,
      title: 'ISO 45003:2021',
      subtitle: 'Gestão de Riscos Psicossociais no Trabalho',
      body: 'Primeira norma internacional dedicada ao gerenciamento da saúde psicológica no trabalho. Estabelece diretrizes para identificar, avaliar e controlar riscos psicossociais, orientando a participação dos trabalhadores, o suporte da liderança e o monitoramento contínuo dos fatores de risco.',
    },
    {
      tag: 'HSE UK', color: C.mintDk,
      title: 'Management Standards (HSE)',
      subtitle: 'Health & Safety Executive — metodologia britânica validada',
      body: 'Framework amplamente adotado para avaliação de riscos psicossociais ocupacionais. Foca em seis estressores: Demandas, Controle, Apoio, Relacionamentos, Papel e Mudanças. Fornece benchmarks populacionais para comparação e suporte a tomada de decisão.',
    },
  ]

  const gap = 0.22
  const bW = (CW - gap * 2) / 3
  const cardY = cY + 0.02
  const cardH = cH - 0.04
  cards.forEach((c, i) => {
    const bx = MX + i * (bW + gap)
    drawRoundedCard(slide, bx, cardY, bW, cardH)
    slide.addShape('roundRect', { x: bx, y: cardY, w: 0.07, h: cardH,
      fill: { color: c.color }, line: { color: c.color, width: 0 }, rectRadius: 0.09 })
    slide.addShape('roundRect', { x: bx + 0.2, y: cardY + 0.14, w: 1.2, h: 0.28,
      fill: { color: C.bluePale }, line: { color: C.bluePale, width: 0 }, rectRadius: 0.08 })

    slide.addText(c.tag, {
      x: bx + 0.24, y: cardY + 0.18, w: 1.12, h: 0.22,
      fontSize: 10, bold: true, color: c.color, align: 'center', fontFace: 'Manrope',
    })
    slide.addText(c.title, {
      x: bx + 0.2, y: cardY + 0.52, w: bW - 0.34, h: 0.46,
      fontSize: 14, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    slide.addText(c.subtitle, {
      x: bx + 0.2, y: cardY + 1.0, w: bW - 0.34, h: 0.5,
      fontSize: 14, color: C.textMd, italic: true, fontFace: 'Inter',
    })
    slide.addShape('rect', { x: bx + 0.2, y: cardY + 1.6, w: bW - 0.34, h: 0.012,
      fill: { color: C.border }, line: { color: C.border, width: 0 } })
    slide.addText(c.body, {
      x: bx + 0.2, y: cardY + 1.72, w: bW - 0.34, h: cardH - 1.88,
      fontSize: 14, color: C.textMd, align: 'left', fontFace: 'Inter',
    })
  })
}

/* ─── Methodology ────────────────────────────────────────────────────────── */
function addMethodologySlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Metodologia de Avaliação', data.clientName, '01 | CONTEXTO & METODOLOGIA')

  const gap = 0.26
  const col = (CW - gap) / 2
  const modules = [
    {
      code: 'HSE',
      accent: C.blue,
      name: 'Módulo HSE', sub: 'Saúde & Segurança no Trabalho',
      scale: 'Escala de 0 (Nunca) a 4 (Sempre)',
      note:  'Scores elevados indicam maior exposição ao risco',
      thresholds: [
        { label: 'Baixo risco',    range: '< 1.5',      color: C.low,  pct: 37 },
        { label: 'Risco moderado', range: '1.5 a 2.5',  color: C.mod,  pct: 25 },
        { label: 'Alto risco',     range: '>= 2.5',      color: C.high, pct: 38 },
      ],
      domains: ['Demandas', 'Controle', 'Apoio da Liderança', 'Apoio dos Colegas', 'Relacionamentos', 'Cargo', 'Comunicação e Mudanças'],
    },
    {
      code: 'IETR',
      accent: C.blue2,
      name: 'Módulo IETR', sub: 'Índice de Exposição ao Trabalho Remoto',
      scale: 'Escala de 1 (Nunca) a 5 (Sempre)',
      note:  'Scores baixos indicam piores condições de trabalho',
      thresholds: [
        { label: 'Situação de risco',  range: '< 3.0',     color: C.high, pct: 40 },
        { label: 'Zona de atenção',    range: '3.0 a 4.0', color: C.mod,  pct: 33 },
        { label: 'Condição adequada',  range: '>= 4.0',     color: C.low,  pct: 27 },
      ],
      domains: ['Demandas', 'Controle', 'Suporte', 'Comunicação', 'Papel', 'Limites', 'Ambiente', 'Produtividade'],
    },
  ]

  modules.forEach((m, i) => {
    const bx = MX + i * (col + gap)
    const by = cY + 0.02
    const bh = cH - 0.04

    drawRoundedCard(slide, bx, by, col, bh)
    slide.addShape('roundRect', { x: bx, y: by, w: 0.07, h: bh,
      fill: { color: m.accent }, line: { color: m.accent, width: 0 }, rectRadius: 0.09 })
    slide.addShape('roundRect', { x: bx + 0.2, y: by + 0.14, w: 0.86, h: 0.24,
      fill: { color: C.bluePale }, line: { color: C.bluePale, width: 0 }, rectRadius: 0.08 })
    slide.addText(m.code, {
      x: bx + 0.22, y: by + 0.17, w: 0.82, h: 0.18,
      fontSize: 9, bold: true, color: m.accent, align: 'center', fontFace: 'Manrope',
    })

    let y = by + 0.46
    slide.addText(m.name, {
      x: bx + 0.2, y, w: col - 0.34, h: 0.32,
      fontSize: 13, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    y += 0.3
    slide.addText(m.sub, {
      x: bx + 0.2, y, w: col - 0.34, h: 0.24,
      fontSize: 8.8, color: C.textMd, italic: true, fontFace: 'Inter',
    })
    y += 0.32

    slide.addShape('roundRect', { x: bx + 0.2, y, w: col - 0.34, h: 0.58,
      fill: { color: C.bluePale }, line: { color: C.bluePale, width: 0 }, rectRadius: 0.08 })

    slide.addText(m.scale, {
      x: bx + 0.28, y: y + 0.13, w: col - 0.54, h: 0.18,
      fontSize: 8.8, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    slide.addText(m.note, {
      x: bx + 0.28, y: y + 0.33, w: col - 0.54, h: 0.16,
      fontSize: 7.8, color: C.textMd, italic: true, fontFace: 'Inter',
    })
    y += 0.7

    const barW = col - 0.34
    let segX = bx + 0.2
    slide.addShape('roundRect', { x: segX, y, w: barW, h: 0.2,
      fill: { color: C.smoke }, line: { color: C.smoke, width: 0 }, rectRadius: 0.06 })
    m.thresholds.forEach(seg => {
      const sw = (seg.pct / 100) * barW
      slide.addShape('rect', { x: segX, y, w: sw, h: 0.22,
        fill: { color: seg.color }, line: { color: seg.color, width: 0 } })
      segX += sw
    })
    y += 0.3

    m.thresholds.forEach(t => {
      slide.addShape('ellipse', { x: bx + 0.2, y: y + 0.04, w: 0.09, h: 0.09,
        fill: { color: t.color }, line: { color: t.color, width: 0 } })
      slide.addText(t.label, {
        x: bx + 0.33, y: y + 0.01, w: col - 1.32, h: 0.16,
        fontSize: 8, color: C.textMd, fontFace: 'Inter',
      })
      slide.addText(t.range, {
        x: bx + col - 0.9, y: y + 0.01, w: 0.7, h: 0.16,
        fontSize: 8, bold: true, color: C.textDk, align: 'right', fontFace: 'Manrope',
      })
      y += 0.22
    })

    y += 0.16
    slide.addText('Domínios avaliados', {
      x: bx + 0.2, y, w: col - 0.34, h: 0.2,
      fontSize: 8.5, bold: true, color: C.textLt, charSpacing: 1.2, fontFace: 'Manrope',
    })
    y += 0.24

    const chipGap = 0.12
    const chipW = (col - 0.34 - chipGap) / 2
    m.domains.forEach(d => {
      const idx = m.domains.indexOf(d)
      const cx = bx + 0.2 + (idx % 2) * (chipW + chipGap)
      const cy = y + Math.floor(idx / 2) * 0.26
      slide.addShape('roundRect', { x: cx, y: cy, w: chipW, h: 0.18,
        fill: { color: C.smoke }, line: { color: C.smoke, width: 0 }, rectRadius: 0.06 })
      slide.addText(d, {
        x: cx + 0.08, y: cy + 0.02, w: chipW - 0.16, h: 0.14,
        fontSize: 7.6, color: C.textMd, fontFace: 'Inter', margin: 0,
      })
    })
  })
}

/* ─── Participation ──────────────────────────────────────────────────────── */
function addParticipationSlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Adesão e Participação', data.clientName, '02 | PARTICIPAÇÃO E PERFIL')

  const rate = pct1(data.totalAnswered, data.totalCollabs)
  const rateColor = rate >= 70 ? C.low : rate >= 50 ? C.mod : C.high

  const kpis = [
    { value: String(data.totalCollabs),  label: 'Colaboradores elegíveis', color: C.blue,  iconType: 'people' as IconType, iconBg: C.bluePale, iconColor: C.blue },
    { value: String(data.totalAnswered), label: 'Respondentes',            color: C.low,   iconType: 'people' as IconType, iconBg: C.lowLt,   iconColor: C.low },
    { value: fmtPct(rate),               label: 'Taxa de adesão',          color: rateColor, iconType: 'chart-bars' as IconType, iconBg: rate >= 70 ? C.lowLt : rate >= 50 ? C.modLt : C.highLt, iconColor: rateColor },
  ]

  const kpiGap = 0.22
  const kpiW = (CW - kpiGap * 2) / 3
  const kpiH = 1.52
  kpis.forEach((k, i) => {
    const bx = MX + i * (kpiW + kpiGap)
    drawRoundedCard(slide, bx, cY, kpiW, kpiH)
    slide.addShape('roundRect', { x: bx, y: cY, w: 0.07, h: kpiH,
      fill: { color: k.color }, line: { color: k.color, width: 0 }, rectRadius: 0.09 })
    slide.addShape('ellipse', { x: bx + 0.22, y: cY + 0.24, w: 0.42, h: 0.42,
      fill: { color: k.iconBg }, line: { color: k.iconBg, width: 0 } })
    slide.addImage({ data: iconDataUri(k.iconType, k.iconColor),
      x: bx + 0.31, y: cY + 0.33, w: 0.24, h: 0.24 })
    slide.addText(k.value, {
      x: bx + 0.2, y: cY + 0.28, w: kpiW - 0.38, h: 0.54,
      fontSize: 28, bold: true, color: k.color, align: 'right', valign: 'middle', fontFace: 'Manrope',
    })
    slide.addText(k.label, {
      x: bx + 0.2, y: cY + 0.96, w: kpiW - 0.38, h: 0.2,
      fontSize: 8.2, color: C.textMd, fontFace: 'Inter',
    })
    slide.addText(i === 0 ? 'Base elegível' : i === 1 ? 'Questionários válidos' : 'Participação consolidada', {
      x: bx + 0.2, y: cY + 1.18, w: kpiW - 0.38, h: 0.14,
      fontSize: 7.3, color: C.textLt, fontFace: 'Inter',
    })
  })

  const rateMsg = rate >= 70 ? 'representativa e acima do limiar recomendado'
    : rate >= 50 ? 'moderada — considerar acoes de engajamento para o próximo ciclo'
      : 'baixa — recomendada análise das barreiras de participação antes de conclusões finais'
  const narrativeY = cY + kpiH + 0.22
  slide.addShape('roundRect', { x: MX, y: narrativeY, w: CW, h: 0.54,
    fill: { color: C.bluePale }, line: { color: C.bluePale, width: 0 }, rectRadius: 0.08 })
  slide.addText(`A taxa de adesão de ${fmtPct(rate)} e considerada ${rateMsg}.`, {
    x: MX + 0.18, y: narrativeY + 0.14, w: CW - 0.36, h: 0.2,
    fontSize: 9.2, color: C.textMd, italic: true, fontFace: 'Inter',
  })

  const rows = [...data.stratumRows]
    .sort((a, b) => pct1(a.answered, a.total) - pct1(b.answered, b.total))
    .slice(0, 20)
  if (rows.length === 0) return

  slide.addText(`Adesão por ${data.stratumLabel}`, {
    x: MX, y: narrativeY + 0.74, w: CW, h: 0.22,
    fontSize: 8.8, bold: true, color: C.textLt, charSpacing: 1.4, fontFace: 'Manrope',
  })

  const shellY = narrativeY + 1.02
  const shellH = cY + cH - shellY - 0.04
  drawRoundedCard(slide, MX, shellY, CW, shellH)
  slide.addShape('roundRect', { x: MX, y: shellY, w: 0.07, h: shellH,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09 })

  slide.addText(`Distribuição de participação por ${data.stratumLabel.toLowerCase()}`, {
    x: MX + 0.22, y: shellY + 0.14, w: CW - 0.44, h: 0.22,
    fontSize: 10, bold: true, color: C.textDk, fontFace: 'Manrope',
  })
  slide.addText('Total elegível, respondentes e taxa de adesão por grupo analisado.', {
    x: MX + 0.22, y: shellY + 0.37, w: CW - 0.44, h: 0.16,
    fontSize: 7.8, color: C.textLt, fontFace: 'Inter',
  })

  const tableY = shellY + 0.62
  const avail  = shellH - 0.74
  const rowH   = Math.min(0.26, avail / (rows.length + 1))
  const tableW = CW - 0.28

  const hdrOpt = { fill: { color: C.bluePale }, color: C.textDk, bold: true, fontSize: 8.2, fontFace: 'Manrope', border: { type: 'solid', color: C.border, pt: 0.3 } }
  const header = [[
    { text: data.stratumLabel,  options: { ...hdrOpt, align: 'left'   } },
    { text: 'Total',            options: { ...hdrOpt, align: 'center' } },
    { text: 'Respondentes',     options: { ...hdrOpt, align: 'center' } },
    { text: 'Taxa de Adesão',   options: { ...hdrOpt, align: 'center' } },
  ]]

  const dataRows = rows.map((r, idx) => {
    const bg  = idx % 2 === 0 ? C.white : C.smoke
    const pct = pct1(r.answered, r.total)
    const pc  = pct >= 70 ? C.low : pct >= 50 ? C.mod : C.high
    const bdr = { type: 'solid', color: C.border, pt: 0.3 }
    return [
      { text: r.name,             options: { fill: { color: bg }, color: C.textDk, fontSize: 8.1, align: 'left',   fontFace: 'Inter', border: bdr } },
      { text: String(r.total),    options: { fill: { color: bg }, color: C.textMd, fontSize: 8.1, align: 'center', fontFace: 'Inter', border: bdr } },
      { text: String(r.answered), options: { fill: { color: bg }, color: C.textDk, fontSize: 8.1, align: 'center', fontFace: 'Inter', border: bdr } },
      { text: fmtPct(pct),        options: { fill: { color: bg }, color: pc, fontSize: 8.3, bold: true, align: 'center', fontFace: 'Manrope', border: bdr } },
    ]
  })

  slide.addTable([...header, ...dataRows], {
    x: MX + 0.14, y: tableY, w: tableW, h: avail,
    colW: [tableW * 0.55, tableW * 0.14, tableW * 0.17, tableW * 0.14],
    rowH,
    margin: 0.03,
  })
}

/* ─── Demographics ───────────────────────────────────────────────────────── */
function addDemographicsSlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Perfil da População', data.clientName, '02 | PARTICIPAÇÃO E PERFIL')

  const colGap  = 0.24
  const rowGap  = 0.2
  const colW    = (CW - colGap * 2) / 3
  const cardH   = (cH - rowGap) / 2
  const palette = [C.blue, C.blue2, C.mod, C.high, C.low, C.blue3, C.textMd]

  const pctRows = (dist: Distribution[], max = 5): { name: string; value: number; pct: number }[] => {
    const sorted = [...dist].filter(d => d.value > 0).sort((a, b) => b.value - a.value)
    const limited = sorted.length > max
      ? [...sorted.slice(0, max - 1), { name: 'Outros', value: sorted.slice(max - 1).reduce((s, d) => s + d.value, 0) }]
      : sorted
    const total = limited.reduce((s, d) => s + d.value, 0)
    return limited.map(d => ({ ...d, pct: pct1(d.value, total) }))
  }

  const drawCard = (idx: number, title: string) => {
    const col = idx % 3
    const row = Math.floor(idx / 3)
    const bx  = MX + col * (colW + colGap)
    const by  = cY + row * (cardH + rowGap)
    drawRoundedCard(slide, bx, by, colW, cardH)
    slide.addShape('roundRect', { x: bx, y: by, w: 0.07, h: cardH,
      fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09 })
    slide.addText(title, {
      x: bx + 0.22, y: by + 0.12, w: colW - 0.36, h: 0.24,
      fontSize: 8.5, bold: true, color: C.textLt, charSpacing: 1.4, fontFace: 'Manrope',
    })
    slide.addText(`${data.totalAnswered} respondentes`, {
      x: bx + 0.22, y: by + 0.35, w: colW - 0.36, h: 0.18,
      fontSize: 7.5, color: C.textLt, fontFace: 'Inter',
    })
    return { bx, by }
  }

  const drawDonutWithLegend = (idx: number, title: string, dist: Distribution[]) => {
    const { bx, by } = drawCard(idx, title)
    const rows = pctRows(dist)
    if (rows.length === 0) {
      slide.addText('Sem dados', {
        x: bx + 0.22, y: by + 1.2, w: colW - 0.36, h: 0.25,
        fontSize: 9, color: C.textMd, align: 'center', fontFace: 'Inter',
      })
      return
    }

    const donutX = bx + 0.12
    const donutY = by + 0.62
    const donutW = 1.58
    const donutH = 1.58

    slide.addChart('doughnut', [{ name: 'N', labels: rows.map(r => r.name), values: rows.map(r => r.value) }], {
      x: donutX, y: donutY, w: donutW, h: donutH,
      chartColors: palette,
      showLegend: false,
      showTitle: false,
      showDataLabels: false,
      holeSize: 66,
    })

    const lx = bx + 1.9
    const lw = colW - 2.02
    rows.slice(0, 5).forEach((r, i) => {
      const ly = by + 0.74 + i * 0.34
      slide.addShape('ellipse', { x: lx, y: ly + 0.05, w: 0.12, h: 0.12,
        fill: { color: palette[i % palette.length] }, line: { color: palette[i % palette.length], width: 0 } })
      slide.addText(r.name, {
        x: lx + 0.16, y: ly, w: lw - 0.84, h: 0.2,
        fontSize: 7.5, color: C.textMd, fontFace: 'Inter', margin: 0,
      })
      slide.addText(fmtPct(r.pct), {
        x: bx + colW - 0.78, y: ly, w: 0.62, h: 0.2,
        fontSize: 8, bold: true, color: C.textDk, align: 'right', fontFace: 'Manrope', margin: 0,
      })
    })
  }

  const drawEducationChart = (idx: number, dist: Distribution[]) => {
    const { bx, by } = drawCard(idx, 'ESCOLARIDADE')
    const sorted = [...dist].filter(d => d.value > 0).sort((a, b) => b.value - a.value)
    const rows = sorted.length > 4
      ? [...sorted.slice(0, 4), { name: 'Outros', value: sorted.slice(4).reduce((s, d) => s + d.value, 0) }]
      : sorted
    if (rows.length === 0) {
      slide.addText('Sem dados', {
        x: bx + 0.22, y: by + 1.2, w: colW - 0.36, h: 0.25,
        fontSize: 9, color: C.textMd, align: 'center', fontFace: 'Inter',
      })
      return
    }

    const listX = bx + 0.18
    const listW = colW - 0.36
    const topY  = by + 0.64
    const gapY  = 0.14
    const rowH  = Math.min(0.34, (cardH - 0.92) / rows.length)
    const maxVal = Math.max(...rows.map(r => r.value), 1)
    const total  = rows.reduce((sum, item) => sum + item.value, 0)
    rows.forEach((r, i) => {
      const yy = topY + i * (rowH + gapY)
      const barX = listX + 1.58
      const barW = listW - 2.4
      const barFill = [C.blue, C.blue2, C.blue3, C.navSub, C.textLt, C.low][i % 6]
      const pct = pct1(r.value, total)
      const label = r.name.length > 24 ? r.name.slice(0, 24) + '…' : r.name
      slide.addText(label, {
        x: listX, y: yy + 0.02, w: 1.5, h: 0.22,
        fontSize: 7.2, color: C.textMd, fontFace: 'Inter', margin: 0,
      })
      slide.addShape('roundRect', { x: barX, y: yy + 0.05, w: barW, h: 0.14,
        fill: { color: 'E9F1F7' }, line: { color: 'E9F1F7', width: 0 }, rectRadius: 0.05 })
      slide.addShape('roundRect', { x: barX, y: yy + 0.05, w: Math.max(0.12, barW * (r.value / maxVal)), h: 0.14,
        fill: { color: barFill }, line: { color: barFill, width: 0 }, rectRadius: 0.05 })
      slide.addText(String(r.value), {
        x: barX + barW + 0.04, y: yy + 0.01, w: 0.26, h: 0.18,
        fontSize: 7.2, color: C.textMd, align: 'right', fontFace: 'Inter', margin: 0,
      })
      slide.addText(fmtPct(pct), {
        x: bx + colW - 0.8, y: yy - 0.01, w: 0.62, h: 0.2,
        fontSize: 8, bold: true, color: C.textDk, align: 'right', fontFace: 'Manrope', margin: 0,
      })
    })
  }

  drawDonutWithLegend(0, 'GÊNERO', data.genderDist)

  {
    const { bx, by } = drawCard(1, 'FAIXA ETÁRIA')
    const AGE_ORDER = ['Ate 24', 'Até 24', '18-24', '25-34', '35-44', '45-54', '55+']
    const ordered: Distribution[] = []
    AGE_ORDER.forEach(l => {
      const d = data.ageRangeDist.find(r => r.name === l)
      if (d && !ordered.find(o => o.name === d.name)) ordered.push(d)
    })
    data.ageRangeDist.forEach(d => {
      if (!ordered.find(o => o.name === d.name)) ordered.push(d)
    })
    const active = ordered.filter(d => d.value > 0)
    if (active.length > 0) {
      slide.addChart('bar', [{ name: 'N', labels: active.map(d => d.name), values: active.map(d => d.value) }], {
        x: bx + 0.14, y: by + 0.62, w: colW - 0.28, h: cardH - 0.76,
        barDir: 'col', barGapWidthPct: 55,
        chartColors: [C.blue],
        showTitle: false, showLegend: false,
        showDataLabels: true, dataLabelFontSize: 8,
        valAxisHidden: true, catAxisLabelFontSize: 8,
        valAxisMaxVal: Math.max(...active.map(d => d.value), 1) * 1.28,
      })
    } else {
      slide.addText('Sem dados', {
        x: bx + 0.22, y: by + 1.2, w: colW - 0.36, h: 0.25,
        fontSize: 9, color: C.textMd, align: 'center', fontFace: 'Inter',
      })
    }
  }

  drawDonutWithLegend(2, data.raceDist.length > 0 ? 'RAÇA / COR' : 'VÍNCULO', data.raceDist.length > 0 ? data.raceDist : data.employDist)
  drawEducationChart(3, data.educationDist)
  drawDonutWithLegend(4, 'ESTADO CIVIL', data.maritalDist)

  {
    const idx = 5
    const { bx, by } = drawCard(idx, 'DEFICIÊNCIA')
    const rows = pctRows(data.disabilityDist, 3)
    if (rows.length > 0) {
      const donutX = bx + 0.12
      const donutY = by + 0.62
      const donutW = 1.46
      const donutH = 1.24
      slide.addChart('doughnut', [{ name: 'N', labels: rows.map(r => r.name), values: rows.map(r => r.value) }], {
        x: donutX, y: donutY, w: donutW, h: donutH,
        chartColors: [C.blue, C.blue3, C.textMd],
        showLegend: false,
        showTitle: false,
        showDataLabels: false,
        holeSize: 66,
      })
      rows.forEach((r, i) => {
        const ly = by + 0.76 + i * 0.32
        const lc = [C.blue, C.blue3, C.textMd][i]
        slide.addShape('ellipse', { x: bx + 1.76, y: ly + 0.05, w: 0.12, h: 0.12,
          fill: { color: lc }, line: { color: lc, width: 0 } })
        slide.addText(r.name, {
          x: bx + 1.92, y: ly, w: colW - 2.7, h: 0.2,
          fontSize: 7.5, color: C.textMd, fontFace: 'Inter', margin: 0,
        })
        slide.addText(fmtPct(r.pct), {
          x: bx + colW - 0.78, y: ly, w: 0.62, h: 0.2,
          fontSize: 8, bold: true, color: C.textDk, align: 'right', fontFace: 'Manrope', margin: 0,
        })
      })
    } else {
      slide.addText('Sem dados', {
        x: bx + 0.22, y: by + 1.0, w: colW - 0.36, h: 0.25,
        fontSize: 9, color: C.textMd, align: 'center', fontFace: 'Inter',
      })
    }

    slide.addText('TIPOS DECLARADOS', {
      x: bx + 0.22, y: by + cardH - 1.08, w: colW - 0.36, h: 0.18,
      fontSize: 7.5, bold: true, color: C.textLt, charSpacing: 1.1, fontFace: 'Manrope',
    })

    const typeRows = [...data.disabilityTypeDist].sort((a, b) => b.value - a.value).slice(0, 4)
    if (typeRows.length > 0) {
      const bdr = { type: 'solid', color: C.border, pt: 0.3 }
      const header = [[
        { text: 'Tipo', options: { fill: { color: C.smoke }, color: C.textDk, fontSize: 7.5, bold: true, align: 'left', border: bdr } },
        { text: 'Qtd', options: { fill: { color: C.smoke }, color: C.textDk, fontSize: 7.5, bold: true, align: 'center', border: bdr } },
      ]]
      const rowsTbl = typeRows.map((r, i) => {
        const bg = i % 2 === 0 ? C.white : C.smoke
        return [
          { text: r.name, options: { fill: { color: bg }, color: C.textMd, fontSize: 7.2, align: 'left', border: bdr } },
          { text: String(r.value), options: { fill: { color: bg }, color: C.textDk, fontSize: 7.2, bold: true, align: 'center', border: bdr } },
        ]
      })
      slide.addTable([...header, ...rowsTbl], {
        x: bx + 0.22, y: by + cardH - 0.86, w: colW - 0.36, h: 0.5,
        colW: [colW - 0.95, 0.55], rowH: 0.12,
      })
    } else {
      slide.addText('Sem detalhamento de tipos', {
        x: bx + 0.22, y: by + cardH - 0.58, w: colW - 0.36, h: 0.2,
        fontSize: 7.5, color: C.textLt, fontFace: 'Inter',
      })
    }
  }
}

/* ─── Risk index ─────────────────────────────────────────────────────────── */
function addRiskIndexSlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Índice de Risco Psicossocial Geral', data.clientName, '03 | MAPEAMENTO DE RISCOS')

  const high  = data.hseClassDist.find(d => d.name === 'Alto risco')?.value ?? 0
  const mod   = data.hseClassDist.find(d => d.name === 'Risco moderado')?.value ?? 0
  const low   = data.hseClassDist.find(d => d.name === 'Baixo risco')?.value ?? 0
  const total   = high + mod + low

  const lowPct  = pct1(low, total)
  const modPct  = pct1(mod, total)
  const highPct = pct1(high, total)
  const dominant = [
    { label: 'Baixo', pct: lowPct },
    { label: 'Moderado', pct: modPct },
    { label: 'Alto', pct: highPct },
  ].sort((a, b) => b.pct - a.pct)[0]
  const leftW   = 6.25
  const gap     = 0.26
  const rightX  = MX + leftW + gap
  const rightW  = CW - leftW - gap

  drawRoundedCard(slide, MX, cY, leftW, cH)
  slide.addShape('roundRect', { x: MX, y: cY, w: 0.07, h: cH,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09 })
  slide.addText('DISTRIBUIÇÃO GERAL DO NÍVEL DE RISCO PSICOSSOCIAL', {
    x: MX + 0.22, y: cY + 0.14, w: leftW - 0.4, h: 0.22,
    fontSize: 8.2, bold: true, color: C.textLt, charSpacing: 1.2, fontFace: 'Manrope',
  })

  const donutSize = Math.min(4.55, leftW - 0.56)
  const donutX = MX + (leftW - donutSize) / 2
  const donutY = cY + 0.46 + Math.max(0, (cH - 0.66 - donutSize) / 2)
  const donutCenterY = donutY + donutSize / 2

  slide.addChart('doughnut', [{
    name: 'Colaboradores',
    labels: ['Baixo', 'Moderado', 'Alto'],
    values: [low, mod, high],
  }], {
    x: donutX, y: donutY, w: donutSize, h: donutSize,
    chartColors: [C.low, C.mod, C.high],
    showLegend: false,
    showTitle: false,
    showDataLabels: false,
    holeSize: 66,
  })

  slide.addText(fmtPct(dominant.pct), {
    x: donutX + donutSize * 0.22, y: donutCenterY - 0.36, w: donutSize * 0.56, h: 0.5,
    fontSize: 24, bold: true, color: C.textDk, align: 'center', fontFace: 'Manrope', valign: 'mid',
  })
  slide.addText(dominant.label, {
    x: donutX + donutSize * 0.22, y: donutCenterY + 0.02, w: donutSize * 0.56, h: 0.26,
    fontSize: 12, bold: true, color: C.textMd, align: 'center', fontFace: 'Inter', valign: 'mid',
  })

  drawRoundedCard(slide, rightX, cY, rightW, 1.38)

  if (data.hseAvg !== null) {
    const sc = riskColor(data.hseAvg)
    const sl = riskLabel(data.hseAvg)
    slide.addShape('roundRect', { x: rightX, y: cY, w: 0.07, h: 1.38,
      fill: { color: sc }, line: { color: sc, width: 0 }, rectRadius: 0.09 })
    slide.addText('Score médio HSE', {
      x: rightX + 0.22, y: cY + 0.18, w: 1.8, h: 0.18,
      fontSize: 8.2, color: C.textLt, fontFace: 'Inter',
    })
    slide.addText(data.hseAvg.toFixed(2), {
      x: rightX + 0.22, y: cY + 0.36, w: 1.45, h: 0.44,
      fontSize: 28, bold: true, color: sc, fontFace: 'Manrope',
    })
    slide.addText(sl, {
      x: rightX + 0.22, y: cY + 0.86, w: 2.1, h: 0.2,
      fontSize: 9.2, bold: true, color: sc, fontFace: 'Inter',
    })
    slide.addText('Escala de 0 a 4. Scores mais altos indicam maior exposição ao risco.', {
      x: rightX + 1.95, y: cY + 0.28, w: rightW - 2.15, h: 0.5,
      fontSize: 7.8, color: C.textMd, fontFace: 'Inter',
    })
    slide.addShape('roundRect', { x: rightX + 1.95, y: cY + 0.9, w: rightW - 2.15, h: 0.2,
      fill: { color: riskLightBg(data.hseAvg) }, line: { color: riskLightBg(data.hseAvg), width: 0 }, rectRadius: 0.06 })
    slide.addShape('roundRect', { x: rightX + 1.95, y: cY + 0.9, w: (rightW - 2.15) * Math.min((data.hseAvg / 4), 1), h: 0.2,
      fill: { color: sc }, line: { color: sc, width: 0 }, rectRadius: 0.06 })
  }

  const classCards = [
    { label: 'Baixo', n: low,  pct: lowPct,  color: C.low },
    { label: 'Moderado', n: mod, pct: modPct, color: C.mod },
    { label: 'Alto', n: high, pct: highPct, color: C.high },
  ]
  classCards.forEach((cc, i) => {
    const cy2 = cY + 1.6 + i * 1.12
    drawRoundedCard(slide, rightX, cy2, rightW, 0.92)
    slide.addShape('ellipse', { x: rightX + 0.22, y: cy2 + 0.28, w: 0.12, h: 0.12,
      fill: { color: cc.color }, line: { color: cc.color, width: 0 } })
    slide.addText(cc.label, {
      x: rightX + 0.42, y: cy2 + 0.18, w: 1.1, h: 0.16,
      fontSize: 9, bold: true, color: C.textDk, fontFace: 'Inter',
    })
    slide.addShape('roundRect', { x: rightX + 1.7, y: cy2 + 0.28, w: rightW - 2.9, h: 0.16,
      fill: { color: 'EFF3F7' }, line: { color: 'EFF3F7', width: 0 }, rectRadius: 0.05 })
    slide.addShape('roundRect', { x: rightX + 1.7, y: cy2 + 0.28, w: Math.max(0.16, (rightW - 2.9) * (cc.pct / 100)), h: 0.16,
      fill: { color: cc.color }, line: { color: cc.color, width: 0 }, rectRadius: 0.05 })
    slide.addText(fmtPct(cc.pct), {
      x: rightX + rightW - 0.96, y: cy2 + 0.17, w: 0.72, h: 0.2,
      fontSize: 8.8, bold: true, color: C.textDk, align: 'right', fontFace: 'Manrope',
    })
    slide.addText(`${cc.n} colaboradores`, {
      x: rightX + 0.42, y: cy2 + 0.46, w: 1.2, h: 0.14,
      fontSize: 7.5, color: C.textLt, fontFace: 'Inter',
    })
  })
}

/* ─── Narrative / analysis ───────────────────────────────────────────────── */
function addNarrativeSlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Análise e Interpretação', data.clientName, '03 | MAPEAMENTO DE RISCOS')

  const high  = data.hseClassDist.find(d => d.name === 'Alto risco')?.value ?? 0
  const mod   = data.hseClassDist.find(d => d.name === 'Risco moderado')?.value ?? 0
  const total = data.hseClassDist.reduce((s, d) => s + d.value, 0)
  const topDom = [...data.domainAvgs].sort((a, b) => b.avg - a.avg)[0]

  const kpis = [
    {
      value: data.hseAvg !== null ? data.hseAvg.toFixed(2) : '--',
      label: 'Score médio HSE',
      sub:   data.hseAvg !== null ? riskLabel(data.hseAvg) : 'sem dados',
      color: data.hseAvg !== null ? riskColor(data.hseAvg) : C.textMd,
    },
    {
      value: total > 0 ? fmtPct(pct1(high, total)) : '--',
      label: 'em alto risco',
      sub:   `${high} colaboradores`,
      color: C.high,
    },
    {
      value: total > 0 ? fmtPct(pct1(mod, total)) : '--',
      label: 'em risco moderado',
      sub:   `${mod} colaboradores`,
      color: C.mod,
    },
    {
      value: topDom?.domain ?? '--',
      label: 'domínio mais crítico',
      sub:   topDom ? `score ${topDom.avg.toFixed(2)}` : '',
      color: topDom ? riskColor(topDom.avg) : C.textMd,
      small: true,
    },
  ]

  const kpiGap = 0.14
  const kpiW = (CW - kpiGap * 3) / 4
  const kpiH = 1.36
  kpis.forEach((k, i) => {
    const kx = MX + i * (kpiW + kpiGap)
    drawRoundedCard(slide, kx, cY, kpiW, kpiH)
    slide.addShape('roundRect', { x: kx, y: cY, w: 0.07, h: kpiH,
      fill: { color: k.color }, line: { color: k.color, width: 0 }, rectRadius: 0.09 })
    slide.addText(k.value, {
      x: kx + 0.18, y: cY + 0.18, w: kpiW - 0.3, h: 0.48,
      fontSize: k.small ? 13 : 24, bold: true, color: k.color, fontFace: 'Manrope',
    })
    slide.addText(k.label, {
      x: kx + 0.18, y: cY + 0.75, w: kpiW - 0.3, h: 0.16,
      fontSize: 7.8, color: C.textLt, fontFace: 'Manrope', charSpacing: 0.8,
    })
    slide.addText(k.sub, {
      x: kx + 0.18, y: cY + 1.0, w: kpiW - 0.3, h: 0.16,
      fontSize: 7.6, color: C.textMd, fontFace: 'Inter',
    })
  })

  const narrative = buildHseNarrative(data)
  const bodyY = cY + 1.62
  const leftW = 7.55
  const gap = 0.24
  const rightX = MX + leftW + gap
  const rightW = CW - leftW - gap
  const worstThree = [...data.domainAvgs].sort((a, b) => b.avg - a.avg).slice(0, 3)

  drawRoundedCard(slide, MX, bodyY, leftW, cH - 1.62)
  slide.addShape('roundRect', { x: MX, y: bodyY, w: 0.07, h: cH - 1.62,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09 })
  slide.addText('LEITURA EXECUTIVA', {
    x: MX + 0.22, y: bodyY + 0.14, w: leftW - 0.4, h: 0.18,
    fontSize: 8, bold: true, color: C.textLt, charSpacing: 1.2, fontFace: 'Manrope',
  })
  slide.addText(narrative, {
    x: MX + 0.22, y: bodyY + 0.42, w: leftW - 0.38, h: cH - 2.12,
    fontSize: 9.6, color: C.textMd, align: 'left', fontFace: 'Inter',
  })

  drawRoundedCard(slide, rightX, bodyY, rightW, cH - 1.62)
  slide.addShape('roundRect', { x: rightX, y: bodyY, w: 0.07, h: cH - 1.62,
    fill: { color: C.high }, line: { color: C.high, width: 0 }, rectRadius: 0.09 })
  slide.addText('FOCOS PRIORITÁRIOS', {
    x: rightX + 0.22, y: bodyY + 0.14, w: rightW - 0.4, h: 0.18,
    fontSize: 8, bold: true, color: C.textLt, charSpacing: 1.2, fontFace: 'Manrope',
  })
  worstThree.forEach((dom, i) => {
    const y = bodyY + 0.46 + i * 0.78
    const col = riskColor(dom.avg)
    drawRoundedCard(slide, rightX + 0.14, y, rightW - 0.28, 0.62, { fill: C.white, borderColor: C.border, radius: 0.07 })
    slide.addShape('roundRect', { x: rightX + 0.14, y, w: 0.05, h: 0.62,
      fill: { color: col }, line: { color: col, width: 0 }, rectRadius: 0.07 })
    slide.addText(dom.domain, {
      x: rightX + 0.3, y: y + 0.12, w: rightW - 1.25, h: 0.16,
      fontSize: 8.8, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    slide.addText(riskLabel(dom.avg), {
      x: rightX + 0.3, y: y + 0.32, w: rightW - 1.25, h: 0.14,
      fontSize: 7.6, color: col, fontFace: 'Inter',
    })
    slide.addText(dom.avg.toFixed(2), {
      x: rightX + rightW - 1.02, y: y + 0.16, w: 0.68, h: 0.22,
      fontSize: 10.8, bold: true, color: col, align: 'right', fontFace: 'Manrope',
    })
  })
}

/* ─── Domain bar chart ───────────────────────────────────────────────────── */
function addDomainSlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Perfil de Risco por Domínio — HSE', data.clientName, '03 | MAPEAMENTO DE RISCOS')

  if (data.domainAvgs.length === 0) return

  const ordered = data.hseDomains
    .map(domain => {
      const found = data.domainAvgs.find(d => d.domain === domain)
      return found ? { domain: found.domain, avg: found.avg } : null
    })
    .filter((d): d is { domain: string; avg: number } => d !== null)
  const ranked = [...ordered].sort((a, b) => b.avg - a.avg)
  const leftW  = 6.15
  const gap    = 0.26
  const rightX = MX + leftW + gap
  const rightW = CW - leftW - gap

  drawRoundedCard(slide, MX, cY, leftW, cH)
  slide.addShape('roundRect', { x: MX, y: cY, w: 0.07, h: cH,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09 })
  slide.addText('RADAR DE EXPOSIÇÃO POR DOMÍNIO', {
    x: MX + 0.22, y: cY + 0.14, w: leftW - 0.4, h: 0.2,
    fontSize: 8.2, bold: true, color: C.textLt, charSpacing: 1.2, fontFace: 'Manrope',
  })
  slide.addText('Quanto maior a área preenchida, maior o risco no domínio.', {
    x: MX + 0.22, y: cY + 0.36, w: leftW - 0.4, h: 0.16,
    fontSize: 7.6, color: C.textLt, fontFace: 'Inter',
  })

  const radarW = leftW - 1.74
  const radarH = cH - 2.04
  const radarX = MX + (leftW - radarW) / 2
  const radarY = cY + 0.94

  slide.addChart('radar', [{
    name: 'Score médio',
    labels: ordered.map(d => d.domain),
    values: ordered.map(d => d.avg),
  }], {
    x: radarX, y: radarY, w: radarW, h: radarH,
    chartColors: [C.blue3],
    radarStyle: 'filled',
    showTitle: false, showLegend: false,
    showDataLabels: false,
    showValue: false,
    catAxisHidden: true,
    catAxisLabelPos: 'none',
    catAxisLabelFontSize: 7,
    valAxisHidden: true,
    valAxisMinVal: 0,
    valAxisMaxVal: 4,
    valAxisMajorUnit: 1,
  })

  slide.addChart('radar', [{
    name: 'Score médio',
    labels: ordered.map(d => d.domain),
    values: ordered.map(d => d.avg),
  }], {
    x: radarX, y: radarY, w: radarW, h: radarH,
    chartColors: [C.blue],
    radarStyle: 'marker',
    showTitle: false, showLegend: false,
    showDataLabels: false,
    showValue: false,
    catAxisHidden: true,
    catAxisLabelPos: 'none',
    catAxisLabelFontSize: 7,
    valAxisHidden: true,
    valAxisMinVal: 0,
    valAxisMaxVal: 4,
    valAxisMajorUnit: 1,
  })

  const cx = radarX + radarW / 2
  const cy = radarY + radarH / 2 + 0.02
  const labelR = Math.min(radarW, radarH) * 0.38
  ordered.forEach((d, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i / ordered.length)
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    const w = 1.55
    const radialOffset = sinA < -0.85 ? 0.58 : 0.42
    const lxCenter = cx + cosA * (labelR + radialOffset)
    const ly = cy + sinA * (labelR + radialOffset) - 0.12
    const align: 'left' | 'center' | 'right' = cosA > 0.25 ? 'left' : cosA < -0.25 ? 'right' : 'center'
    const lx = align === 'center' ? lxCenter - w / 2 : align === 'right' ? lxCenter - w : lxCenter
    slide.addText(d.domain, {
      x: lx, y: ly, w, h: 0.14,
      fontSize: 8, bold: true, color: C.textDk, align, fontFace: 'Manrope', margin: 0,
    })
    slide.addText(riskLabel(d.avg), {
      x: lx, y: ly + 0.14, w, h: 0.12,
      fontSize: 7.2, color: riskColor(d.avg), align, fontFace: 'Inter', margin: 0,
    })
  })

  drawRoundedCard(slide, rightX, cY, rightW, cH)
  slide.addShape('roundRect', { x: rightX, y: cY, w: 0.07, h: cH,
    fill: { color: C.high }, line: { color: C.high, width: 0 }, rectRadius: 0.09 })
  slide.addText('RANKING DE DOMÍNIOS', {
    x: rightX + 0.22, y: cY + 0.14, w: rightW - 0.4, h: 0.2,
    fontSize: 8.2, bold: true, color: C.textLt, charSpacing: 1.2, fontFace: 'Manrope',
  })

  ranked.forEach((d, i) => {
    const y = cY + 0.48 + i * 0.55
    const col = riskColor(d.avg)
    slide.addText(d.domain, {
      x: rightX + 0.22, y, w: rightW - 1.18, h: 0.15,
      fontSize: 8, color: C.textMd, fontFace: 'Inter',
    })
    slide.addShape('roundRect', { x: rightX + 0.22, y: y + 0.22, w: rightW - 1.32, h: 0.14,
      fill: { color: 'EFF3F7' }, line: { color: 'EFF3F7', width: 0 }, rectRadius: 0.05 })
    slide.addShape('roundRect', { x: rightX + 0.22, y: y + 0.22, w: Math.max(0.14, (rightW - 1.32) * (d.avg / 4)), h: 0.14,
      fill: { color: col }, line: { color: col, width: 0 }, rectRadius: 0.05 })
    slide.addText(d.avg.toFixed(2), {
      x: rightX + rightW - 1.08, y: y + 0.06, w: 0.64, h: 0.2,
      fontSize: 8.8, bold: true, color: col, align: 'right', fontFace: 'Manrope',
    })
    slide.addText(riskLabel(d.avg), {
      x: rightX + rightW - 1.24, y: y + 0.26, w: 0.8, h: 0.14,
      fontSize: 6.8, color: col, align: 'right', fontFace: 'Inter',
    })
  })
}

/* ─── Stratum distribution (stacked bar) ─────────────────────────────────── */
function addStratumDistSlide(prs: PptxGenJS, data: ReportPayload) {
  const rows = [...data.stratumRows]
    .filter(r => r.answered >= 5)
    .sort((a, b) => b.highPct - a.highPct)
    .slice(0, 12)

  if (rows.length === 0) return

  const { slide, cY, cH } = mkBase(prs,
    `Distribuição de Risco por ${data.stratumLabel}`,
    data.clientName, '04 | ANÁLISE ESTRATIFICADA',
  )

  const top = rows.reduce((best, row) => (row.highPct > best.highPct ? row : best), rows[0])
  const avgHigh = trunc1(rows.reduce((sum, r) => sum + r.highPct, 0) / rows.length)
  const scoreRows = rows.filter((r): r is StratumRow & { hseAvg: number } => r.hseAvg !== null)
  const avgScore = scoreRows.length > 0 ? scoreRows.reduce((sum, r) => sum + r.hseAvg, 0) / scoreRows.length : null
  const topRisk = dominantRiskDisplay(top)
  const kpiH = 0.92
  const kpiGap = 0.14
  const kpiW = (CW - kpiGap * 2) / 3
  const kpiY = cY
  const kpis = [
    { label: 'Grupos analisados', value: `${rows.length}`, sub: `N >= 5 respostas`, color: C.blue },
    { label: 'Maior situação de risco', value: fmtPct(topRisk.pct), sub: `${top.name}`, color: topRisk.color },
    { label: 'Score médio HSE', value: avgScore !== null ? avgScore.toFixed(2).replace('.', ',') : '--', sub: 'escala de 0 a 4', color: avgScore !== null ? riskColor(avgScore) : C.textMd },
  ]

  kpis.forEach((k, i) => {
    const x = MX + i * (kpiW + kpiGap)
    drawRoundedCard(slide, x, kpiY, kpiW, kpiH)
    slide.addShape('roundRect', { x, y: kpiY, w: 0.07, h: kpiH,
      fill: { color: k.color }, line: { color: k.color, width: 0 }, rectRadius: 0.09 })
    slide.addText(k.value, {
      x: x + 0.2, y: kpiY + 0.16, w: kpiW - 0.28, h: 0.36,
      fontSize: 22, bold: true, color: k.color, fontFace: 'Manrope',
    })
    slide.addText(k.label, {
      x: x + 0.2, y: kpiY + 0.56, w: kpiW - 0.28, h: 0.14,
      fontSize: 7.6, color: C.textLt, fontFace: 'Manrope', charSpacing: 0.7,
    })
    slide.addText(k.sub, {
      x: x + 0.2, y: kpiY + 0.72, w: kpiW - 0.28, h: 0.14,
      fontSize: 8, color: C.textMd, fontFace: 'Inter',
    })
  })

  const chartY = cY + kpiH + 0.28
  const chartH = cH - kpiH - 0.18
  drawRoundedCard(slide, MX, chartY, CW, chartH)
  slide.addShape('roundRect', { x: MX, y: chartY, w: 0.07, h: chartH,
    fill: { color: C.navSub }, line: { color: C.navSub, width: 0 }, rectRadius: 0.09 })
  slide.addText(
    `Distribuição percentual por classificação de risco por ${data.stratumLabel.toLowerCase()}, ordenado por maior percentual de alto risco.`,
    { x: MX + 0.22, y: chartY + 0.18, w: CW - 0.38, h: 0.18, fontSize: 8.1, color: C.textLt, italic: true, fontFace: 'Inter' },
  )

  const plotX = MX + 0.22
  const plotY = chartY + 0.58
  const plotW = CW - 0.38
  const plotH = chartH - 0.86
  const labelW = 4.05
  const distX = plotX + labelW
  const distW = plotW - labelW - 0.08
  const rowGap = 0.07
  const barH = Math.min(0.32, (plotH - rowGap * (rows.length - 1)) / rows.length)

  slide.addText('DISTRIBUIÇÃO DE RISCO (%)', {
    x: distX, y: chartY + 0.40, w: 2.05, h: 0.14,
    fontSize: 7.1, bold: true, color: C.textLt, charSpacing: 0.8, fontFace: 'Manrope', align: 'left', margin: 0,
  })

  slide.addText('\u25CF Alto', {
    x: distX + 2.2, y: chartY + 0.40, w: 0.58, h: 0.14,
    fontSize: 6.9, color: C.high, fontFace: 'Inter', align: 'left', margin: 0,
  })
  slide.addText('\u25CF Moderado', {
    x: distX + 2.86, y: chartY + 0.40, w: 0.9, h: 0.14,
    fontSize: 6.9, color: C.mod, fontFace: 'Inter', align: 'left', margin: 0,
  })
  slide.addText('\u25CF Baixo', {
    x: distX + 3.82, y: chartY + 0.40, w: 0.65, h: 0.14,
    fontSize: 6.9, color: C.low, fontFace: 'Inter', align: 'left', margin: 0,
  })

  const ticks = [0, 25, 50, 75, 100]
  ticks.forEach(tick => {
    const tx = distX + distW * (tick / 100)
    slide.addShape('line', {
      x: tx, y: plotY - 0.02, w: 0, h: plotH + 0.03,
      line: { color: tick === 0 ? C.border : 'E8EEF5', pt: tick === 0 ? 1 : 0.7 },
    })
    slide.addText(`${tick}%`, {
      x: tx - 0.2, y: plotY + plotH + 0.05, w: 0.4, h: 0.12,
      fontSize: 6.4, color: C.textLt, align: 'center', valign: 'mid', fontFace: 'Inter', margin: 0,
    })
  })

  rows.forEach((r, i) => {
    const y = plotY + i * (barH + rowGap)
    const pctSum = Math.max(1, r.highPct + r.modPct + r.lowPct)
    const highW = distW * (r.highPct / pctSum)
    const modW = distW * (r.modPct / pctSum)
    const lowW = Math.max(0, distW - highW - modW)
    const scoreTxt = r.hseAvg !== null ? `Score ${r.hseAvg.toFixed(2).replace('.', ',')}` : 'Score --'

    slide.addText(`${r.name} (N=${r.answered})`, {
      x: plotX, y: y + 0.055, w: labelW - 1.1, h: 0.15,
      fontSize: 7.8, color: C.textMd, fontFace: 'Inter',
    })

    slide.addText(scoreTxt, {
      x: plotX + labelW - 1.0, y: y + 0.055, w: 0.95, h: 0.15,
      fontSize: 7.3, bold: true, color: r.hseAvg !== null ? riskColor(r.hseAvg) : C.textLt,
      align: 'right', fontFace: 'Manrope',
    })

    slide.addShape('roundRect', { x: distX, y, w: distW, h: barH,
      fill: { color: 'F2F6FB' }, line: { color: 'F2F6FB', width: 0 }, rectRadius: 0.07 })
    if (highW > 0.002) {
      slide.addShape('roundRect', { x: distX, y, w: highW, h: barH,
        fill: { color: C.high }, line: { color: C.high, width: 0 }, rectRadius: 0.07 })
    }
    if (modW > 0.002) {
      slide.addShape('roundRect', { x: distX + highW, y, w: modW, h: barH,
        fill: { color: C.mod }, line: { color: C.mod, width: 0 }, rectRadius: 0.07 })
    }
    if (lowW > 0.002) {
      slide.addShape('roundRect', { x: distX + highW + modW, y, w: lowW, h: barH,
        fill: { color: C.low }, line: { color: C.low, width: 0 }, rectRadius: 0.07 })
    }
  })
}

/* ─── Heatmap ────────────────────────────────────────────────────────────── */
const DOM_ABBR: Record<string, string> = {
  'Demandas': 'Demandas',
  'Controle': 'Controle',
  'Apoio da Liderança': 'Apoio Liderança',
  'Apoio dos Colegas': 'Apoio Colegas',
  'Relacionamentos': 'Relacionamentos',
  'Cargo': 'Cargo',
  'Comunicação e Mudanças': 'Mudanças',
}

const DOM_ICON: Record<string, IconType> = {
  'Demandas': 'alert-tri',
  'Controle': 'sliders',
  'Apoio da Liderança': 'user',
  'Apoio dos Colegas': 'people',
  'Relacionamentos': 'handshake',
  'Cargo': 'briefcase',
  'Comunicação e Mudanças': 'megaphone',
}

const IETR_ABBR: Record<string, string> = {
  'Demandas': 'Demandas',
  'Demanda': 'Demandas',
  'Controle': 'Controle',
  'Suporte': 'Suporte',
  'Comunicação': 'Comunicação',
  'Papel': 'Papel',
  'Limites': 'Limites',
  'Ambiente': 'Ambiente',
  'Produtividade': 'Produtividade',
}

const IETR_ICON: Record<string, IconType> = {
  'Demandas': 'alert-tri',
  'Demanda': 'alert-tri',
  'Controle': 'sliders',
  'Suporte': 'people',
  'Comunicação': 'megaphone',
  'Papel': 'briefcase',
  'Limites': 'alert-circle',
  'Ambiente': 'user',
  'Produtividade': 'chart-bars',
}

function addHeatmapSlides(prs: PptxGenJS, data: ReportPayload) {
  const rows = data.stratumRows.filter(r => r.answered >= 5)
  if (rows.length === 0 || data.hseDomains.length === 0) return

  const PAGE  = 12
  const pages = Math.ceil(rows.length / PAGE)

  for (let p = 0; p < pages; p++) {
    const pageRows = rows.slice(p * PAGE, (p + 1) * PAGE)
    const suffix   = pages > 1 ? ` (${p + 1}/${pages})` : ''
    const { slide, cY, cH } = mkBase(prs,
      `Heatmap de Domínios por ${data.stratumLabel}${suffix}`,
      data.clientName, '04 | ANÁLISE ESTRATIFICADA',
    )

    drawRoundedCard(slide, MX, cY, CW, cH)
    slide.addShape('roundRect', { x: MX, y: cY, w: 0.07, h: cH,
      fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09 })
    slide.addText(
      `Leitura por ${data.stratumLabel.toLowerCase()}: classificação dos domínios HSE por grupo (N >= 5).`,
      { x: MX + 0.22, y: cY + 0.14, w: CW - 0.36, h: 0.18, fontSize: 8.1, color: C.textLt, italic: true, fontFace: 'Inter' },
    )

    const tableX = MX + 0.16
    const tableY = cY + 0.36
    const tableW = CW - 0.3
    const tableH = cH - 0.82
    const legendH = 0.2
    const headerH = 0.62
    const bodyH = tableH - headerH
    const nameW = 2.25
    const domW = (tableW - nameW) / data.hseDomains.length

    slide.addShape('roundRect', { x: tableX, y: tableY, w: tableW, h: tableH,
      fill: { color: C.white }, line: { color: C.border, width: 0.5 }, rectRadius: 0.06 })
    slide.addShape('roundRect', { x: tableX, y: tableY, w: tableW, h: headerH,
      fill: { color: 'F6F9FC' }, line: { color: 'F6F9FC', width: 0 }, rectRadius: 0.06 })

    slide.addText(data.stratumLabel.toUpperCase(), {
      x: tableX + 0.12, y: tableY + 0.22, w: nameW - 0.2, h: 0.16,
      fontSize: 8.3, bold: true, color: C.textMd, fontFace: 'Manrope',
    })

    data.hseDomains.forEach((domain, i) => {
      const cx = tableX + nameW + i * domW
      const iconType = DOM_ICON[domain] ?? 'alert-circle'
      slide.addImage({
        data: iconDataUri(iconType, C.textMd),
        x: cx + domW / 2 - 0.07, y: tableY + 0.12, w: 0.14, h: 0.14,
      })
      slide.addText(DOM_ABBR[domain] ?? domain, {
        x: cx + 0.02, y: tableY + 0.3, w: domW - 0.04, h: 0.16,
        fontSize: 7.2, bold: true, color: C.textMd, align: 'center', fontFace: 'Manrope',
      })
      slide.addShape('line', {
        x: cx, y: tableY, w: 0, h: tableH,
        line: { color: 'EDF2F7', pt: 0.7 },
      })
    })

    const rowH = Math.min(0.36, bodyH / pageRows.length)
    pageRows.forEach((r, idx) => {
      const ry = tableY + headerH + idx * rowH
      const rowBg = idx % 2 === 0 ? C.white : 'FAFCFE'
      slide.addShape('rect', { x: tableX, y: ry, w: tableW, h: rowH,
        fill: { color: rowBg }, line: { color: rowBg, width: 0 } })

      slide.addText(r.name, {
        x: tableX + 0.1, y: ry + 0.08, w: nameW - 0.2, h: rowH - 0.1,
        fontSize: 8.2, bold: true, color: C.textDk, fontFace: 'Inter',
      })

      data.hseDomains.forEach((domain, dIdx) => {
        const avg = r.domainAvgs[domain]
        const dotColor = avg === null || avg === undefined ? C.textLt : riskColor(avg)
        const dotText = avg === null || avg === undefined ? '·' : '\u25CF'
        const cx = tableX + nameW + dIdx * domW
        slide.addText(dotText, {
          x: cx, y: ry + 0.07, w: domW, h: rowH - 0.08,
          align: 'center', valign: 'middle',
          fontSize: dotText === '·' ? 12 : 14,
          bold: true,
          color: dotColor,
        })
      })

      slide.addShape('line', {
        x: tableX, y: ry + rowH, w: tableW, h: 0,
        line: { color: 'EEF3F8', pt: 0.7 },
      })
    })

    const legendY = cY + cH - legendH - 0.12
    slide.addShape('roundRect', { x: MX + 0.18, y: legendY, w: CW - 0.36, h: legendH,
      fill: { color: C.smoke }, line: { color: C.border, width: 0.5 }, rectRadius: 0.04 })
    slide.addText('\u25CF  Alto risco', {
      x: MX + 0.42, y: legendY + 0.03, w: 1.4, h: 0.14,
      fontSize: 8.2, bold: true, color: C.high, fontFace: 'Inter',
    })
    slide.addText('\u25CF  Moderado', {
      x: MX + 2.0, y: legendY + 0.03, w: 1.4, h: 0.14,
      fontSize: 8.2, bold: true, color: C.mod, fontFace: 'Inter',
    })
    slide.addText('\u25CF  Baixo risco', {
      x: MX + 3.55, y: legendY + 0.03, w: 1.5, h: 0.14,
      fontSize: 8.2, bold: true, color: C.low, fontFace: 'Inter',
    })
    slide.addText(`${String(p + 1).padStart(2, '0')}`, {
      x: MX + CW - 0.42, y: legendY + 0.03, w: 0.24, h: 0.14,
      fontSize: 8, bold: true, color: C.textMd, align: 'right', fontFace: 'Manrope',
    })
  }
}

/* ─── IETR ───────────────────────────────────────────────────────────────── */
function addIetrSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasIetr) return

  const { slide, cY, cH } = mkBase(prs, 'Resultados — Trabalho Remoto (IETR)', data.clientName, '05 | TRABALHO REMOTO')

  const risk = data.ietrClassDist.find(d => d.name === 'Situação de risco')?.value
    ?? 0
  const att  = data.ietrClassDist.find(d => d.name === 'Zona de atenção')?.value
    ?? 0
  const ok   = data.ietrClassDist.find(d => d.name === 'Condição adequada')?.value
    ?? 0
  const tot  = risk + att + ok

  const riskPct = pct1(risk, tot)
  const attPct  = pct1(att, tot)
  const okPct   = pct1(ok, tot)
  const dominant = [
    { label: 'Condição adequada', pct: okPct },
    { label: 'Zona de atenção', pct: attPct },
    { label: 'Situação de risco', pct: riskPct },
  ].sort((a, b) => b.pct - a.pct)[0]

  const leftW = 5.9
  const gap = 0.26
  const rightX = MX + leftW + gap
  const rightW = CW - leftW - gap

  drawRoundedCard(slide, MX, cY, leftW, cH)
  slide.addShape('roundRect', { x: MX, y: cY, w: 0.07, h: cH,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09 })
  slide.addText('DISTRIBUIÇÃO GERAL DO NÍVEL DE RISCO NO TRABALHO REMOTO', {
    x: MX + 0.22, y: cY + 0.14, w: leftW - 0.42, h: 0.22,
    fontSize: 8.1, bold: true, color: C.textLt, charSpacing: 1.05, fontFace: 'Manrope',
  })

  const donutSize = Math.min(3.45, leftW - 1.0)
  const donutX = MX + (leftW - donutSize) / 2
  const donutY = cY + 0.44
  const donutCenterY = donutY + donutSize / 2
  slide.addChart('doughnut', [{
    name: 'Colaboradores',
    labels: ['Condição adequada', 'Zona de atenção', 'Situação de risco'],
    values: [ok, att, risk],
  }], {
    x: donutX, y: donutY, w: donutSize, h: donutSize,
    chartColors: [C.low, C.mod, C.high],
    showLegend: false,
    showTitle: false,
    showDataLabels: false,
    holeSize: 66,
  })
  slide.addText(fmtPct(dominant.pct), {
    x: donutX + donutSize * 0.2, y: donutCenterY - 0.33, w: donutSize * 0.6, h: 0.44,
    fontSize: 22, bold: true, color: C.textDk, align: 'center', fontFace: 'Manrope',
  })
  slide.addText(dominant.label, {
    x: donutX + donutSize * 0.14, y: donutCenterY + 0.03, w: donutSize * 0.72, h: 0.22,
    fontSize: 9.2, bold: true, color: C.textMd, align: 'center', fontFace: 'Inter',
  })

  const classCards = [
    { label: 'Condição adequada', n: ok, pct: okPct, color: C.low },
    { label: 'Zona de atenção', n: att, pct: attPct, color: C.mod },
    { label: 'Situação de risco', n: risk, pct: riskPct, color: C.high },
  ]
  const classCardH = 0.44
  const classGap = 0.1
  const classStartY = cY + cH - (classCards.length * classCardH + (classCards.length - 1) * classGap) - 0.12
  classCards.forEach((cc, i) => {
    const cy2 = classStartY + i * (classCardH + classGap)
    drawRoundedCard(slide, MX + 0.16, cy2, leftW - 0.32, classCardH, { fill: C.white, borderColor: C.border, radius: 0.06 })
    slide.addShape('ellipse', { x: MX + 0.34, y: cy2 + 0.155, w: 0.1, h: 0.1,
      fill: { color: cc.color }, line: { color: cc.color, width: 0 } })
    slide.addText(cc.label, {
      x: MX + 0.5, y: cy2 + 0.12, w: 1.95, h: 0.14,
      fontSize: 7.6, bold: true, color: C.textDk, fontFace: 'Inter',
    })
    slide.addShape('roundRect', { x: MX + 2.6, y: cy2 + 0.155, w: leftW - 4.1, h: 0.1,
      fill: { color: 'EFF3F7' }, line: { color: 'EFF3F7', width: 0 }, rectRadius: 0.04 })
    slide.addShape('roundRect', { x: MX + 2.6, y: cy2 + 0.155, w: Math.max(0.1, (leftW - 4.1) * (cc.pct / 100)), h: 0.1,
      fill: { color: cc.color }, line: { color: cc.color, width: 0 }, rectRadius: 0.04 })
    slide.addText(`${fmtPct(cc.pct)} | N=${cc.n}`, {
      x: MX + leftW - 1.33, y: cy2 + 0.12, w: 1.07, h: 0.14,
      fontSize: 7.5, bold: true, color: C.textDk, align: 'right', fontFace: 'Manrope',
    })
  })

  const scoreCardH = 1.56
  const rightGap = 0.18
  const rankingY = cY + scoreCardH + rightGap
  const rankingH = cH - scoreCardH - rightGap

  drawRoundedCard(slide, rightX, cY, rightW, scoreCardH)
  slide.addShape('roundRect', { x: rightX, y: cY, w: 0.07, h: scoreCardH,
    fill: { color: C.mod }, line: { color: C.mod, width: 0 }, rectRadius: 0.09 })
  slide.addText('SCORE MÉDIO IETR', {
    x: rightX + 0.22, y: cY + 0.14, w: rightW - 0.4, h: 0.2,
    fontSize: 8.2, bold: true, color: C.textLt, charSpacing: 1.05, fontFace: 'Manrope',
  })

  if (data.ietrAvg !== null) {
    const sc = ietrColor(data.ietrAvg)
    const sl = ietrLabel(data.ietrAvg)
    drawRoundedCard(slide, rightX + 0.16, cY + 0.4, rightW - 0.32, 0.96, { fill: C.white, borderColor: C.border, radius: 0.07 })
    slide.addShape('roundRect', { x: rightX + 0.16, y: cY + 0.4, w: 0.06, h: 0.96,
      fill: { color: sc }, line: { color: sc, width: 0 }, rectRadius: 0.07 })
    slide.addText('Score médio IETR', {
      x: rightX + 0.3, y: cY + 0.54, w: 1.5, h: 0.14,
      fontSize: 8, color: C.textLt, fontFace: 'Inter',
    })
    slide.addText(data.ietrAvg.toFixed(2).replace('.', ','), {
      x: rightX + 0.3, y: cY + 0.66, w: 1.0, h: 0.3,
      fontSize: 17.5, bold: true, color: sc, fontFace: 'Manrope',
    })
    slide.addText(sl, {
      x: rightX + 1.15, y: cY + 0.73, w: rightW - 1.5, h: 0.2,
      fontSize: 9, bold: true, color: sc, fontFace: 'Inter',
    })
    slide.addShape('roundRect', { x: rightX + 1.15, y: cY + 1.0, w: rightW - 1.5, h: 0.14,
      fill: { color: riskLightBg(data.ietrAvg) }, line: { color: riskLightBg(data.ietrAvg), width: 0 }, rectRadius: 0.05 })
    slide.addShape('roundRect', { x: rightX + 1.15, y: cY + 1.0, w: (rightW - 1.5) * Math.min((data.ietrAvg / 5), 1), h: 0.14,
      fill: { color: sc }, line: { color: sc, width: 0 }, rectRadius: 0.05 })
  }

  drawRoundedCard(slide, rightX, rankingY, rightW, rankingH)
  slide.addShape('roundRect', { x: rightX, y: rankingY, w: 0.07, h: rankingH,
    fill: { color: C.high }, line: { color: C.high, width: 0 }, rectRadius: 0.09 })
  slide.addText('RANKING DE DOMÍNIOS IETR', {
    x: rightX + 0.22, y: rankingY + 0.14, w: rightW - 0.4, h: 0.2,
    fontSize: 8.2, bold: true, color: C.textLt, charSpacing: 1.05, fontFace: 'Manrope',
  })

  const ranked = [...data.ietrDomainAvgs].sort((a, b) => a.avg - b.avg)
  const rowGap = 0.08
  const rowsTop = rankingY + 0.42
  const rowsAvail = rankingH - 0.54
  const rankedRowH = Math.min(0.6, (rowsAvail - rowGap * Math.max(0, ranked.length - 1)) / Math.max(1, ranked.length))
  ranked.forEach((d, i) => {
    const y = rowsTop + i * (rankedRowH + rowGap)
    const col = ietrColor(d.avg)
    drawRoundedCard(slide, rightX + 0.16, y, rightW - 0.32, rankedRowH, { fill: C.white, borderColor: C.border, radius: 0.07 })
    slide.addShape('roundRect', { x: rightX + 0.16, y, w: 0.05, h: rankedRowH,
      fill: { color: col }, line: { color: col, width: 0 }, rectRadius: 0.07 })
    slide.addText(d.domain, {
      x: rightX + 0.3, y: y + 0.1, w: rightW - 1.5, h: 0.14,
      fontSize: 8.6, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    const barW = rightW - 1.78
    slide.addShape('roundRect', { x: rightX + 0.3, y: y + rankedRowH - 0.24, w: barW, h: 0.12,
      fill: { color: 'EFF3F7' }, line: { color: 'EFF3F7', width: 0 }, rectRadius: 0.05 })
    slide.addShape('roundRect', { x: rightX + 0.3, y: y + rankedRowH - 0.24, w: Math.max(0.1, barW * (d.avg / 5)), h: 0.12,
      fill: { color: col }, line: { color: col, width: 0 }, rectRadius: 0.05 })
    slide.addText(`${d.avg.toFixed(2).replace('.', ',')}  |  ${ietrLabel(d.avg)}`, {
      x: rightX + rightW - 1.3, y: y + 0.1, w: 1.1, h: 0.14,
      fontSize: 8.2, bold: true, color: col, align: 'right', fontFace: 'Manrope',
    })
  })
}

function addIetrStratumDistSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasIetr) return
  const rows = [...data.ietrStratumRows]
    .filter(r => r.answered >= 5)
    .sort((a, b) => b.highPct - a.highPct)
    .slice(0, 12)

  if (rows.length === 0) return

  const { slide, cY, cH } = mkBase(prs,
    `Distribuição de Risco no Trabalho Remoto por ${data.stratumLabel}`,
    data.clientName, '05 | TRABALHO REMOTO',
  )

  const top = rows.reduce((best, row) => (row.highPct > best.highPct ? row : best), rows[0])
  const avgRisk = trunc1(rows.reduce((sum, r) => sum + r.highPct, 0) / rows.length)
  const avgScoreRows = rows.filter((r): r is IetrStratumRow & { ietrAvg: number } => r.ietrAvg !== null)
  const avgScore = avgScoreRows.length > 0 ? avgScoreRows.reduce((sum, r) => sum + r.ietrAvg, 0) / avgScoreRows.length : null
  const topRisk = dominantRiskDisplay(top)
  const kpiH = 0.92
  const kpiGap = 0.14
  const kpiW = (CW - kpiGap * 2) / 3

  const kpis = [
    { label: 'Grupos analisados', value: `${rows.length}`, sub: 'N >= 5 respostas', color: C.blue },
    { label: 'Maior situação de risco', value: fmtPct(topRisk.pct), sub: `${top.name}`, color: topRisk.color },
    { label: 'Score médio IETR', value: avgScore !== null ? avgScore.toFixed(2).replace('.', ',') : '--', sub: `risco médio ${fmtPct(avgRisk)}`, color: avgScore !== null ? ietrColor(avgScore) : C.textMd },
  ]

  kpis.forEach((k, i) => {
    const x = MX + i * (kpiW + kpiGap)
    drawRoundedCard(slide, x, cY, kpiW, kpiH)
    slide.addShape('roundRect', { x, y: cY, w: 0.07, h: kpiH,
      fill: { color: k.color }, line: { color: k.color, width: 0 }, rectRadius: 0.09 })
    slide.addText(k.value, {
      x: x + 0.2, y: cY + 0.16, w: kpiW - 0.28, h: 0.34,
      fontSize: 22, bold: true, color: k.color, fontFace: 'Manrope',
    })
    slide.addText(k.label, {
      x: x + 0.2, y: cY + 0.56, w: kpiW - 0.28, h: 0.14,
      fontSize: 7.5, color: C.textLt, fontFace: 'Manrope',
    })
    slide.addText(k.sub, {
      x: x + 0.2, y: cY + 0.72, w: kpiW - 0.28, h: 0.14,
      fontSize: 7.9, color: C.textMd, fontFace: 'Inter',
    })
  })

  const chartY = cY + kpiH + 0.28
  const chartH = cH - kpiH - 0.18
  drawRoundedCard(slide, MX, chartY, CW, chartH)
  slide.addShape('roundRect', { x: MX, y: chartY, w: 0.07, h: chartH,
    fill: { color: C.navSub }, line: { color: C.navSub, width: 0 }, rectRadius: 0.09 })
  slide.addText(
    `Distribuição percentual por classificação no módulo remoto, por ${data.stratumLabel.toLowerCase()}, ordenado por maior percentual em situação de risco.`,
    { x: MX + 0.22, y: chartY + 0.18, w: CW - 0.38, h: 0.18, fontSize: 8.1, color: C.textLt, italic: true, fontFace: 'Inter' },
  )

  const plotX = MX + 0.22
  const plotY = chartY + 0.58
  const plotW = CW - 0.38
  const plotH = chartH - 0.86
  const labelW = 4.05
  const distX = plotX + labelW
  const distW = plotW - labelW - 0.08
  const rowGap = 0.07
  const barH = Math.min(0.32, (plotH - rowGap * (rows.length - 1)) / rows.length)

  slide.addText('DISTRIBUIÇÃO DE RISCO (%)', {
    x: distX, y: chartY + 0.40, w: 2.05, h: 0.14,
    fontSize: 7.1, bold: true, color: C.textLt, charSpacing: 0.8, fontFace: 'Manrope', align: 'left', margin: 0,
  })
  slide.addText('\u25CF Risco', {
    x: distX + 2.2, y: chartY + 0.40, w: 0.62, h: 0.14,
    fontSize: 6.9, color: C.high, fontFace: 'Inter', align: 'left', margin: 0,
  })
  slide.addText('\u25CF Atenção', {
    x: distX + 2.9, y: chartY + 0.40, w: 0.76, h: 0.14,
    fontSize: 6.9, color: C.mod, fontFace: 'Inter', align: 'left', margin: 0,
  })
  slide.addText('\u25CF Adequada', {
    x: distX + 3.74, y: chartY + 0.40, w: 0.8, h: 0.14,
    fontSize: 6.9, color: C.low, fontFace: 'Inter', align: 'left', margin: 0,
  })

  const ticks = [0, 25, 50, 75, 100]
  ticks.forEach(tick => {
    const tx = distX + distW * (tick / 100)
    slide.addShape('line', {
      x: tx, y: plotY - 0.02, w: 0, h: plotH + 0.03,
      line: { color: tick === 0 ? C.border : 'E8EEF5', pt: tick === 0 ? 1 : 0.7 },
    })
    slide.addText(`${tick}%`, {
      x: tx - 0.2, y: plotY + plotH + 0.05, w: 0.4, h: 0.12,
      fontSize: 6.4, color: C.textLt, align: 'center', valign: 'mid', fontFace: 'Inter', margin: 0,
    })
  })

  rows.forEach((r, i) => {
    const y = plotY + i * (barH + rowGap)
    const pctSum = Math.max(1, r.highPct + r.modPct + r.lowPct)
    const highW = distW * (r.highPct / pctSum)
    const modW = distW * (r.modPct / pctSum)
    const lowW = Math.max(0, distW - highW - modW)
    const scoreTxt = r.ietrAvg !== null ? `Score ${r.ietrAvg.toFixed(2).replace('.', ',')}` : 'Score --'

    slide.addText(`${r.name} (N=${r.answered})`, {
      x: plotX, y: y + 0.055, w: labelW - 1.1, h: 0.15,
      fontSize: 7.8, color: C.textMd, fontFace: 'Inter',
    })
    slide.addText(scoreTxt, {
      x: plotX + labelW - 1.0, y: y + 0.055, w: 0.95, h: 0.15,
      fontSize: 7.3, bold: true, color: r.ietrAvg !== null ? ietrColor(r.ietrAvg) : C.textLt,
      align: 'right', fontFace: 'Manrope',
    })

    slide.addShape('roundRect', { x: distX, y, w: distW, h: barH,
      fill: { color: 'F2F6FB' }, line: { color: 'F2F6FB', width: 0 }, rectRadius: 0.07 })
    if (highW > 0.001) {
      slide.addShape('roundRect', { x: distX, y, w: highW, h: barH,
        fill: { color: C.high }, line: { color: C.high, width: 0 }, rectRadius: 0.07 })
    }
    if (modW > 0.001) {
      slide.addShape('roundRect', { x: distX + highW, y, w: modW, h: barH,
        fill: { color: C.mod }, line: { color: C.mod, width: 0 }, rectRadius: 0.07 })
    }
    if (lowW > 0.001) {
      slide.addShape('roundRect', { x: distX + highW + modW, y, w: lowW, h: barH,
        fill: { color: C.low }, line: { color: C.low, width: 0 }, rectRadius: 0.07 })
    }
  })
}

function addIetrHeatmapSlides(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasIetr) return
  const rows = data.ietrStratumRows.filter(r => r.answered >= 5)
  if (rows.length === 0 || data.ietrDomains.length === 0) return

  const PAGE = 12
  const pages = Math.ceil(rows.length / PAGE)

  for (let p = 0; p < pages; p++) {
    const pageRows = rows.slice(p * PAGE, (p + 1) * PAGE)
    const suffix = pages > 1 ? ` (${p + 1}/${pages})` : ''
    const { slide, cY, cH } = mkBase(prs,
      `Heatmap IETR por ${data.stratumLabel}${suffix}`,
      data.clientName, '05 | TRABALHO REMOTO',
    )

    drawRoundedCard(slide, MX, cY, CW, cH)
    slide.addShape('roundRect', { x: MX, y: cY, w: 0.07, h: cH,
      fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09 })
    slide.addText(
      `Leitura por ${data.stratumLabel.toLowerCase()}: classificação dos domínios do módulo remoto por grupo (N >= 5).`,
      { x: MX + 0.22, y: cY + 0.14, w: CW - 0.36, h: 0.18, fontSize: 8.1, color: C.textLt, italic: true, fontFace: 'Inter' },
    )

    const tableX = MX + 0.16
    const tableY = cY + 0.36
    const tableW = CW - 0.3
    const tableH = cH - 0.82
    const legendH = 0.2
    const headerH = 0.62
    const bodyH = tableH - headerH
    const nameW = 2.4
    const domW = (tableW - nameW) / data.ietrDomains.length

    slide.addShape('roundRect', { x: tableX, y: tableY, w: tableW, h: tableH,
      fill: { color: C.white }, line: { color: C.border, width: 0.5 }, rectRadius: 0.06 })
    slide.addShape('roundRect', { x: tableX, y: tableY, w: tableW, h: headerH,
      fill: { color: 'F6F9FC' }, line: { color: 'F6F9FC', width: 0 }, rectRadius: 0.06 })

    slide.addText(data.stratumLabel.toUpperCase(), {
      x: tableX + 0.12, y: tableY + 0.22, w: nameW - 0.2, h: 0.16,
      fontSize: 8.3, bold: true, color: C.textMd, fontFace: 'Manrope',
    })

    data.ietrDomains.forEach((domain, i) => {
      const cx = tableX + nameW + i * domW
      const iconType = IETR_ICON[domain] ?? 'alert-circle'
      slide.addImage({
        data: iconDataUri(iconType, C.textMd),
        x: cx + domW / 2 - 0.07, y: tableY + 0.12, w: 0.14, h: 0.14,
      })
      slide.addText(IETR_ABBR[domain] ?? domain, {
        x: cx + 0.02, y: tableY + 0.3, w: domW - 0.04, h: 0.16,
        fontSize: 7.2, bold: true, color: C.textMd, align: 'center', fontFace: 'Manrope',
      })
      slide.addShape('line', {
        x: cx, y: tableY, w: 0, h: tableH,
        line: { color: 'EDF2F7', pt: 0.7 },
      })
    })

    const rowH = Math.min(0.36, bodyH / pageRows.length)
    pageRows.forEach((r, idx) => {
      const ry = tableY + headerH + idx * rowH
      const rowBg = idx % 2 === 0 ? C.white : 'FAFCFE'
      slide.addShape('rect', { x: tableX, y: ry, w: tableW, h: rowH,
        fill: { color: rowBg }, line: { color: rowBg, width: 0 } })

      slide.addText(r.name, {
        x: tableX + 0.1, y: ry + 0.08, w: nameW - 0.2, h: rowH - 0.1,
        fontSize: 8.2, bold: true, color: C.textDk, fontFace: 'Inter',
      })

      data.ietrDomains.forEach((domain, dIdx) => {
        const avg = r.domainAvgs[domain]
        const dotColor = avg === null || avg === undefined ? C.textLt : ietrColor(avg)
        const dotText = avg === null || avg === undefined ? '·' : '\u25CF'
        const cx = tableX + nameW + dIdx * domW
        slide.addText(dotText, {
          x: cx, y: ry + 0.07, w: domW, h: rowH - 0.08,
          align: 'center', valign: 'middle',
          fontSize: dotText === '·' ? 12 : 14,
          bold: true,
          color: dotColor,
        })
      })

      slide.addShape('line', {
        x: tableX, y: ry + rowH, w: tableW, h: 0,
        line: { color: 'EEF3F8', pt: 0.7 },
      })
    })

    const legendY = cY + cH - legendH - 0.12
    slide.addShape('roundRect', { x: MX + 0.18, y: legendY, w: CW - 0.36, h: legendH,
      fill: { color: C.smoke }, line: { color: C.border, width: 0.5 }, rectRadius: 0.04 })
    slide.addText('\u25CF  Situação de risco', {
      x: MX + 0.42, y: legendY + 0.03, w: 2.0, h: 0.14,
      fontSize: 8.1, bold: true, color: C.high, fontFace: 'Inter',
    })
    slide.addText('\u25CF  Zona de atenção', {
      x: MX + 2.75, y: legendY + 0.03, w: 1.95, h: 0.14,
      fontSize: 8.1, bold: true, color: C.mod, fontFace: 'Inter',
    })
    slide.addText('\u25CF  Condição adequada', {
      x: MX + 5.02, y: legendY + 0.03, w: 2.1, h: 0.14,
      fontSize: 8.1, bold: true, color: C.low, fontFace: 'Inter',
    })
    slide.addText(`${String(p + 1).padStart(2, '0')}`, {
      x: MX + CW - 0.42, y: legendY + 0.03, w: 0.24, h: 0.14,
      fontSize: 8, bold: true, color: C.textMd, align: 'right', fontFace: 'Manrope',
    })
  }
}

/* ─── Priorities ─────────────────────────────────────────────────────────── */
function addPrioritiesSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = data.hasIetr ? '06' : '05'
  const { slide, cY, cH } = mkBase(prs, 'Grupos e Domínios Prioritarios', data.clientName, `${sNum} | RECOMENDAÇÕES`)

  slide.addText(
    `Grupos e domínios com maior exposição ao risco, identificados a partir da estratificação por ${data.stratumLabel.toLowerCase()}.`,
    { x: MX, y: cY, w: CW, h: 0.24, fontSize: 9, color: C.textMd, italic: true },
  )

  const topAreas   = [...data.stratumRows].filter(r => r.hseAvg !== null).sort((a, b) => (b.hseAvg ?? 0) - (a.hseAvg ?? 0)).slice(0, 8)
  const topDomains = [...data.domainAvgs].sort((a, b) => b.avg - a.avg).slice(0, 5)
  const gap = 0.26
  const panelY = cY + 0.32
  const panelH = cH - 0.32
  const colW = (CW - gap) / 2

  drawRoundedCard(slide, MX, panelY, colW, panelH)
  slide.addShape('roundRect', { x: MX, y: panelY, w: 0.07, h: panelH,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09 })
  slide.addText(`TOP ${topAreas.length} ${data.stratumLabel.toUpperCase()}S — MAIOR SCORE HSE`, {
    x: MX + 0.22, y: panelY + 0.14, w: colW - 0.38, h: 0.2,
    fontSize: 8.1, bold: true, color: C.textLt, charSpacing: 1.05, fontFace: 'Manrope',
  })

  const areaTopY = panelY + 0.42
  const areaGap = 0.08
  const areaAvailH = panelH - 0.54
  const areaRowH = Math.min(0.55, (areaAvailH - areaGap * Math.max(0, topAreas.length - 1)) / Math.max(1, topAreas.length))

  topAreas.forEach((r, i) => {
    const y = areaTopY + i * (areaRowH + areaGap)
    const rc = r.hseAvg !== null ? riskColor(r.hseAvg) : C.textLt
    drawRoundedCard(slide, MX + 0.16, y, colW - 0.32, areaRowH, { fill: C.white, borderColor: C.border, radius: 0.07 })
    slide.addShape('roundRect', { x: MX + 0.16, y, w: 0.05, h: areaRowH,
      fill: { color: rc }, line: { color: rc, width: 0 }, rectRadius: 0.07 })
    drawRoundedCard(slide, MX + 0.26, y + 0.12, 0.28, areaRowH - 0.24, { fill: 'EFF3F8', borderColor: 'EFF3F8', radius: 0.05 })
    slide.addText(`#${i + 1}`, {
      x: MX + 0.26, y: y + areaRowH / 2 - 0.07, w: 0.28, h: 0.14,
      fontSize: 8, bold: true, color: C.textMd, align: 'center', fontFace: 'Manrope',
    })
    slide.addText(r.name, {
      x: MX + 0.62, y: y + 0.09, w: colW - 2.02, h: 0.17,
      fontSize: 8.1, bold: true, color: C.textDk, fontFace: 'Inter',
    })
    const sub = r.hseAvg !== null
      ? `Score ${r.hseAvg.toFixed(2).replace('.', ',')} | ${r.hseClass ?? ''} | N=${r.answered}`
      : `N=${r.answered}`
    slide.addText(sub, {
      x: MX + 0.62, y: y + areaRowH - 0.19, w: colW - 2.02, h: 0.14,
      fontSize: 7.1, color: C.textLt, fontFace: 'Inter',
    })
    if (r.hseAvg !== null) {
      slide.addText(r.hseAvg.toFixed(2).replace('.', ','), {
        x: MX + colW - 1.22, y: y + 0.08, w: 0.9, h: 0.17,
        fontSize: 9, bold: true, color: rc, align: 'right', fontFace: 'Manrope',
      })
    }
  })

  const dx = MX + colW + gap
  drawRoundedCard(slide, dx, panelY, colW, panelH)
  slide.addShape('roundRect', { x: dx, y: panelY, w: 0.07, h: panelH,
    fill: { color: C.high }, line: { color: C.high, width: 0 }, rectRadius: 0.09 })
  slide.addText('DOMÍNIOS HSE DE MAIOR RISCO', {
    x: dx + 0.22, y: panelY + 0.14, w: colW - 0.38, h: 0.2,
    fontSize: 8.1, bold: true, color: C.textLt, charSpacing: 1.05, fontFace: 'Manrope',
  })

  const domTopY = panelY + 0.42
  const domGap = 0.1
  const domAvailH = panelH - 0.56
  const domRowH = Math.min(0.78, (domAvailH - domGap * Math.max(0, topDomains.length - 1)) / Math.max(1, topDomains.length))

  topDomains.forEach((d, i) => {
    const y = domTopY + i * (domRowH + domGap)
    const dc = riskColor(d.avg)
    drawRoundedCard(slide, dx + 0.16, y, colW - 0.32, domRowH, { fill: C.white, borderColor: C.border, radius: 0.07 })
    slide.addShape('roundRect', { x: dx + 0.16, y, w: 0.05, h: domRowH,
      fill: { color: dc }, line: { color: dc, width: 0 }, rectRadius: 0.07 })

    slide.addText(d.domain, {
      x: dx + 0.3, y: y + 0.1, w: colW - 1.55, h: 0.16,
      fontSize: 8.5, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    slide.addText(`${d.avg.toFixed(2).replace('.', ',')} | ${riskLabel(d.avg)}`, {
      x: dx + colW - 1.2, y: y + 0.1, w: 1.0, h: 0.16,
      fontSize: 8.1, bold: true, color: dc, align: 'right', fontFace: 'Manrope',
    })

    const barW = colW - 1.42
    const fillW = Math.min(barW, Math.max(0.12, barW * (d.avg / 4)))
    slide.addShape('roundRect', { x: dx + 0.3, y: y + domRowH - 0.25, w: barW, h: 0.12,
      fill: { color: 'EFF3F8' }, line: { color: 'EFF3F8', width: 0 }, rectRadius: 0.05 })
    slide.addShape('roundRect', { x: dx + 0.3, y: y + domRowH - 0.25, w: fillW, h: 0.12,
      fill: { color: dc }, line: { color: dc, width: 0 }, rectRadius: 0.05 })
  })
}

/* ─── Next steps ─────────────────────────────────────────────────────────── */
function addNextStepsSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = data.hasIetr ? '06' : '05'
  const { slide, cY, cH } = mkBase(prs, 'Plano de Ação — Próximos Passos', data.clientName, `${sNum} | RECOMENDAÇÕES`)

  slide.addText(
    'Roadmap sugerido para o ciclo de gestão de riscos psicossociais, conforme NR-1/2025 e ISO 45003:2021.',
    { x: MX, y: cY, w: CW, h: 0.24, fontSize: 9.5, color: C.textMd, italic: true },
  )

  const phases = [
    {
      period: '90 DIAS',
      color:  C.high,
      title:  'Ação Imediata',
      items:  [
        `Socializar os resultados com lideranças, RH e CIPA`,
        `Priorizar grupos e domínios de alto risco por ${data.stratumLabel.toLowerCase()}`,
        `Iniciar elaboração do Plano de Ação (PGR / NR-1)`,
      ],
    },
    {
      period: '180 DIAS',
      color:  C.mod,
      title:  'Implementação',
      items:  [
        `Executar ações preventivas e corretivas prioritárias`,
        `Definir indicadores e metas de redução de risco`,
        `Reportar progresso ao comitê de SST / CIPA`,
      ],
    },
    {
      period: '365 DIAS',
      color:  C.low,
      title:  'Consolidação',
      items:  [
        `Realizar novo ciclo de mapeamento psicossocial`,
        `Comparar indicadores com o diagnóstico inicial`,
        `Atualizar PGR e plano de ação para o próximo ciclo`,
      ],
    },
  ]

  const colW  = (CW - 0.6) / 3
  const cardY = cY + 0.34
  const cardH = cH - 0.34
  const softBg = ['FFF5F4', 'FFF9EF', 'F0FAF3']

  phases.forEach((ph, i) => {
    const bx = MX + i * (colW + 0.3)

    // Arrow connector between columns (except last)
    if (i < 2) {
      slide.addShape('line', {
        x: bx + colW + 0.04, y: cardY + 0.27, w: 0.2, h: 0,
        line: { color: C.border, pt: 1 },
      })
      slide.addText('\u25B6', {
        x: bx + colW + 0.18, y: cardY + 0.17, w: 0.12, h: 0.18,
        fontSize: 8, bold: true, color: C.border, align: 'center',
      })
    }

    drawRoundedCard(slide, bx, cardY, colW, cardH, { fill: softBg[i], borderColor: C.border, radius: 0.08 })
    slide.addShape('roundRect', { x: bx + 0.06, y: cardY + 0.08, w: colW - 0.12, h: 0.48,
      fill: { color: ph.color }, line: { color: ph.color, width: 0 }, rectRadius: 0.08 })

    slide.addText(ph.period, {
      x: bx + 0.18, y: cardY + 0.18, w: colW - 0.36, h: 0.17,
      fontSize: 11.5, bold: true, color: C.white, fontFace: 'Manrope', align: 'center',
    })
    slide.addText(ph.title, {
      x: bx + 0.18, y: cardY + 0.36, w: colW - 0.36, h: 0.14,
      fontSize: 8, color: C.white, align: 'center', fontFace: 'Inter',
    })

    let iy = cardY + 0.72
    ph.items.forEach(item => {
      slide.addText('\u25B8  ' + item, {
        x: bx + 0.16, y: iy, w: colW - 0.32, h: 0.54,
        fontSize: 8.4, color: C.textMd, fontFace: 'Inter',
      })
      iy += 0.56
    })
  })
}

/* ─── Closing ────────────────────────────────────────────────────────────── */
function addClosingSlide(prs: PptxGenJS, data: ReportPayload) {
  const slide = prs.addSlide()

  slide.addShape('rect', { x: 0, y: 0, w: W, h: H,
    fill: { color: C.nav }, line: { color: C.nav, width: 0 } })
  slide.addShape('rect', { x: 0, y: H * 0.72, w: W, h: H * 0.28,
    fill: { color: C.cream }, line: { color: C.cream, width: 0 } })
  slide.addShape('rect', { x: 0, y: H * 0.72 - 0.04, w: W, h: 0.04,
    fill: { color: C.mint }, line: { color: C.mint, width: 0 } })
  slide.addShape('rect', { x: 0, y: 0, w: BARW, h: H,
    fill: { color: C.mint }, line: { color: C.mint, width: 0 } })

  slide.addText('>>', {
    x: 9.2, y: -0.2, w: 4.2, h: H * 0.74,
    fontSize: 200, bold: true, color: C.navSub,
    align: 'center', valign: 'middle',
  })

  const baClosing = getBrandAssets()
  if (baClosing.logoB64) {
    const logoW = 4.2
    const logoH = logoW * (72 / 482)
    slide.addImage({
      data: baClosing.logoB64,
      x: MX, y: 1.45, w: logoW, h: logoH,
    })
  } else {
    slide.addText('beetouch', {
      x: MX, y: 1.5, w: 3.0, h: 0.62,
      fontSize: 24, bold: true, color: C.white, fontFace: 'Manrope',
    })
    slide.addText('.ai', {
      x: MX + 2.32, y: 1.5, w: 0.7, h: 0.62,
      fontSize: 24, color: C.mint, fontFace: 'Manrope',
    })
  }
  slide.addText('AI For Human Wellbeing', {
    x: MX, y: 2.2, w: 6, h: 0.4,
    fontSize: 14, color: C.mint,
  })
  slide.addShape('rect', { x: MX, y: 2.78, w: 4.5, h: 0.018,
    fill: { color: C.navSub }, line: { color: C.navSub, width: 0 } })
  slide.addText(
    'Este relatorio foi gerado automaticamente pela plataforma beetouch.ai\n'
    + 'com base nos dados coletados da organização.',
    {
      x: MX, y: 2.96, w: 8.5, h: 0.7,
      fontSize: 11.5, color: 'B0C8E0',
    },
  )

  const date = new Date(data.generatedAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const dateCap = date.charAt(0).toUpperCase() + date.slice(1)
  slide.addText(data.clientName, {
    x: MX, y: H * 0.72 + 0.18, w: 7, h: 0.45,
    fontSize: 16, bold: true, color: C.nav,
  })
  slide.addText(dateCap, {
    x: MX, y: H * 0.72 + 0.62, w: 7, h: 0.3,
    fontSize: 10, color: C.textMd,
  })
  slide.addText('Confidencial', {
    x: W - MX - RX - 1.5, y: H * 0.72 + 0.22, w: 1.5, h: 0.3,
    fontSize: 9, bold: true, color: C.mintDk, align: 'right',
  })
}

/* ─── Main export ────────────────────────────────────────────────────────── */
export async function buildRiskReport(data: ReportPayload): Promise<Uint8Array> {
  const prs  = new PptxGenJS()
  prs.layout = 'LAYOUT_WIDE'
  prs.author = 'beetouch.ai'
  prs.company = 'BeeTouch'
  prs.subject = `Relatorio de Riscos Psicossociais — ${data.clientName}`
  prs.title   = 'Mapeamento de Riscos Psicossociais'

  const sRec = data.hasIetr ? '06' : '05'
  const sPlan = data.hasIetr ? '07' : '06'

  addCoverSlide(prs, data)
  addIntroductionSlide(prs, data)
  addAgendaSlide(prs, data)
  addExecutiveSummarySlide(prs, data)

  mkDivider(prs, '01', 'Contexto &\nMetodologia', 'Enquadramento normativo e metodológico da avaliação')
  addLegalSlide(prs, data)
  addMethodologySlide(prs, data)

  mkDivider(prs, '02', 'Participação\ne Perfil', `${data.totalAnswered} respondentes de ${data.totalCollabs} colaboradores`)
  addParticipationSlide(prs, data)
  addDemographicsSlide(prs, data)

  mkDivider(prs, '03', 'Mapeamento\nde Riscos', 'Resultados HSE — índice geral, análise e domínios')
  addRiskIndexSlide(prs, data)
  addNarrativeSlide(prs, data)
  addDomainSlide(prs, data)

  const stratifiedHse = (data.stratifiedHse && data.stratifiedHse.length > 0)
    ? data.stratifiedHse
    : [{ stratum: data.stratum, stratumLabel: data.stratumLabel, stratumRows: data.stratumRows }]
  const stratifiedLabels = stratifiedHse
    .map((s) => s.stratumLabel)
    .filter((v, i, arr) => arr.indexOf(v) === i)
  mkDivider(
    prs,
    '04',
    'Análise\nEstratificada',
    `Distribuição e heatmap por ${stratifiedLabels.join(' • ')}`,
  )
  stratifiedHse.forEach((slice) => {
    const scoped: ReportPayload = {
      ...data,
      stratum: slice.stratum,
      stratumLabel: slice.stratumLabel,
      stratumRows: slice.stratumRows,
    }
    addStratumDistSlide(prs, scoped)
    addHeatmapSlides(prs, scoped)
  })

  if (data.hasIetr) {
    const stratifiedIetr = (data.stratifiedIetr && data.stratifiedIetr.length > 0)
      ? data.stratifiedIetr
      : [{ stratum: data.stratum, stratumLabel: data.stratumLabel, ietrStratumRows: data.ietrStratumRows }]
    const stratifiedIetrLabels = stratifiedIetr
      .map((s) => s.stratumLabel)
      .filter((v, i, arr) => arr.indexOf(v) === i)
    mkDivider(prs, '05', 'Trabalho\nRemoto', `Resultados do módulo IETR por ${stratifiedIetrLabels.join(' • ')}`)
    addIetrSlide(prs, data)
    stratifiedIetr.forEach((slice) => {
      const scoped: ReportPayload = {
        ...data,
        stratum: slice.stratum,
        stratumLabel: slice.stratumLabel,
        ietrStratumRows: slice.ietrStratumRows,
      }
      addIetrStratumDistSlide(prs, scoped)
      addIetrHeatmapSlides(prs, scoped)
    })
  }

  mkDivider(prs, sRec, 'Recomendações', 'Focos prioritários para direcionar a resposta organizacional')
  addPrioritiesSlide(prs, data)

  mkDivider(prs, sPlan, 'Plano de Ação', 'Síntese atualizada para priorização operacional')
  addActionPlanSynthesisSlide(prs, data)
  addActionPlanOperationalClassificationSlide(prs, data)
  addActionPlanPlaybookSlide(prs, data, 'moderado')
  addActionPlanPlaybookSlide(prs, data, 'toleravel')
  addActionPlanPlaybookSlide(prs, data, 'trivial')
  addActionPlanDomainSpecificSlide(prs, data)
  addActionPlanIetrSpecificSlide(prs, data)
  addActionPlanFocusedGroupsSlide(prs, data)
  addActionPlanIntegratedTimelineSlide(prs, data)
  addActionPlanGovernanceIndicatorsSlide(prs, data)
  addActionPlanNr1MandatoryElementsSlide(prs, data)

  addClosingSlide(prs, data)

  const buf = await prs.write({ outputType: 'nodebuffer' })
  return await forceNoAutofitInSlides(buf as unknown as Uint8Array)
}


