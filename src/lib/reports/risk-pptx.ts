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

/**
 * Vocabulário herdado do gerador original, escrito para a FAB (estrato "especialidade",
 * "Comando/Gestão") e para a CMPC ("GHE PGR"). No AvaxMap os estratos são definidos por cada
 * empresa, então o texto final dos slides é normalizado para termos neutros. Aplicado ao XML
 * já gerado para alcançar todos os slides de uma vez, inclusive textos montados dinamicamente.
 * "Área" preserva o gênero de "especialidade" ("especialidades críticas" → "áreas críticas").
 */
/**
 * Muitos textos herdados formatam números com toFixed(2) ("2.16"). Converte para o padrão
 * brasileiro ("2,16") apenas dentro dos nós de texto e apenas números com exatamente duas
 * casas — numeração de seções ("2.1") e atributos XML ficam intactos.
 */
function normalizeDecimalSeparators(xml: string): string {
  return xml.replace(/<a:t>([^<]*)<\/a:t>/g, (_m, text: string) => (
    `<a:t>${text.replace(/(^|[^\d.])(\d+)\.(\d{2})(?![\d.])/g, '$1$2,$3')}</a:t>`
  ))
}

function normalizeLegacyVocabulary(xml: string): string {
  return normalizeDecimalSeparators(xml)
    .replace(/GHE PGR/g, 'Grupo')
    .replace(/ghe pgr/g, 'grupo')
    .replace(/ESPECIALIDADES/g, 'ÁREAS')
    .replace(/Especialidades/g, 'Áreas')
    .replace(/especialidades/g, 'áreas')
    .replace(/ESPECIALIDADE/g, 'ÁREA')
    .replace(/Especialidade/g, 'Área')
    .replace(/especialidade/g, 'área')
    .replace(/Comando\/Gestão/g, 'Alta gestão')
}

/**
 * No HSE-IT não existem subdomínios: o segundo nível da análise associativa usa os itens
 * (questões) do instrumento. O texto herdado fala em "subdomínio"; aqui vira "item".
 */
function normalizeHseSubdomainVocabulary(xml: string): string {
  return xml
    .replace(/SUBDOMÍNIOS/g, 'ITENS')
    .replace(/Subdomínios/g, 'Itens')
    .replace(/subdomínios/g, 'itens')
    .replace(/SUBDOMÍNIO/g, 'ITEM')
    .replace(/Subdomínio/g, 'Item')
    .replace(/subdomínio/g, 'item')
}

async function forceNoAutofitInSlides(pptxBytes: Uint8Array, hseVocabulary: boolean): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(Buffer.from(pptxBytes))
  const slideFiles = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))

  for (const name of slideFiles) {
    const file = zip.file(name)
    if (!file) continue

    const xml = await file.async('string')
    const noAutofitXml = xml.replace(/<a:bodyPr([^>]*)>([\s\S]*?)<\/a:bodyPr>/g, (_m, attrs, inner) => {
      let nextInner = String(inner).replace(/<a:normAutofit(?:\s[^>]*)?\/>/g, '<a:noAutofit/>')
      if (!/<a:(?:noAutofit|spAutoFit|normAutofit)\b/.test(nextInner)) {
        nextInner += '<a:noAutofit/>'
      }
      return `<a:bodyPr${attrs}>${nextInner}</a:bodyPr>`
    })
    const normalized = normalizeLegacyVocabulary(noAutofitXml)
    const patched = hseVocabulary ? normalizeHseSubdomainVocabulary(normalized) : normalized

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
  /** % em Alto risco por domínio — usado só no heatmap por estrato (legenda "% de Risco Alto"). */
  domainHighPcts?: Record<string, number | null>
  /**
   * % em Alto OU Moderado risco por domínio — é o F (frequência de exposição) da Matriz de
   * Risco Ocupacional (ver buildRiskMatrixRowsForDomains): "proporção da população
   * potencialmente exposta ao fator de risco psicossocial" inclui quem já saiu do Baixo risco,
   * não só quem está em Alto. Campo separado de domainHighPcts de propósito — o heatmap por
   * estrato usa domainHighPcts (Alto puro) e não deve mudar de significado junto com F.
   */
  domainAtLeastModeratePcts?: Record<string, number | null>
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

// Diferente de StratumRow (usado nas análises de risco), não tem limiar mínimo de N —
// existe justamente para listar TODAS as categorias na Base Respondente e Participação,
// inclusive as pequenas demais para entrar nas análises de risco por domínio.
export interface ParticipationRow {
  name: string
  total: number
  answered: number
}

/** Categoria de trabalho por estrato — uma fatia por estrato do relatório. */
export interface WorkCategoryStratifiedSlice {
  stratum: string
  stratumLabel: string
  rows: WorkCategoryByOm4Row[]
}

/** Cruzamento gênero x estrato — uma fatia por estrato do relatório. */
export interface GenderByStratumStratifiedSlice {
  stratum: string
  stratumLabel: string
  rows: GenderByStratumRow[]
}

export interface ParticipationStratifiedSlice {
  stratum: string
  stratumLabel: string
  participationRows: ParticipationRow[]
}

export interface WellbeingStratumRow {
  name: string
  answered: number
  mentalHealthAvg: number | null
  mentalValid: number
  mentalUnsatPct: number
  mentalRegularPct: number
  mentalGoodPct: number
  mentalExcellentPct: number
  severeStressPct: number
  depressiveAlertPct: number
  suicideRiskPct: number
  supportPresencePct: number
}

export interface WellbeingStratifiedSlice {
  stratum: string
  stratumLabel: string
  wellbeingStratumRows: WellbeingStratumRow[]
}

export interface WellbeingPerceptionStratumRow {
  name: string
  answered: number
  mentalSelfHealthAvg: number | null
  lifeQualityAvg: number | null
}

export interface WellbeingRecurringItem {
  name: string
  value: number
  pct: number
}

export interface BullyingSpecialtyIncidenceRow {
  specialty: string
  total: number
  exposed: number
  incidencePct: number
}

export const CLIMATE_DISASTER_COLUMNS = [
  { key: 'flood', label: 'Enchentes' },
  { key: 'landslide', label: 'Desliz.' },
  { key: 'hurricane', label: 'Furacões' },
  { key: 'drought', label: 'Seca' },
  { key: 'blackout', label: 'Blecautes' },
  { key: 'wildfire', label: 'Incêndios' },
  { key: 'earthquake', label: 'Terrem.' },
  { key: 'tsunami', label: 'Tsunami' },
  { key: 'damBreak', label: 'Barragem' },
  { key: 'chemicalSpill', label: 'Químico' },
] as const

export type ClimateDisasterTypeKey = (typeof CLIMATE_DISASTER_COLUMNS)[number]['key']

export interface ClimateDisasterStratumRow {
  category: string
  total: number
  exposed: number
  typeCounts: Record<ClimateDisasterTypeKey, number>
}

export interface ClimateDisasterStratifiedSlice {
  stratum: string
  stratumLabel: string
  rows: ClimateDisasterStratumRow[]
}

export const BULLYING_NATURE_COLUMNS = [
  { key: 'race', label: 'Raça' },
  { key: 'gender', label: 'Gênero' },
  { key: 'sexualOrientation', label: 'Orient. sexual' },
  { key: 'religion', label: 'Religião' },
  { key: 'disability', label: 'Deficiência' },
  { key: 'age', label: 'Idade' },
] as const

export type BullyingTypeKey = (typeof BULLYING_NATURE_COLUMNS)[number]['key']

export interface BullyingSpecialtyNatureRow {
  specialty: string
  total: number
  exposed: number
  incidencePct: number
  typeCounts: Record<BullyingTypeKey, number>
  topTypeLabel: string
  topTypeCount: number
  topTypePct: number
}

export interface BullyingIncidenceStratifiedSlice {
  stratum: string
  stratumLabel: string
  bullyingSpecialtyIncidence: BullyingSpecialtyIncidenceRow[]
}

export interface BullyingNatureStratifiedSlice {
  stratum: string
  stratumLabel: string
  bullyingSpecialtyNatureRows: BullyingSpecialtyNatureRow[]
}

export interface AssociativeCorrelationMetric {
  outcome: string
  coefficient: number | null
  absCoefficient: number
  sampleSize: number
}

export interface AssociativeCorrelationRow {
  predictor: string
  metrics: AssociativeCorrelationMetric[]
  meanAbsCoefficient: number
}

export interface AssociativePriorityAction {
  scope: 'Domínio' | 'Subdomínio'
  factor: string
  priority: 'Alta' | 'Média' | 'Monitorar'
  strength: number
  strongestOutcome: string
  rationale: string
  recommendation: string
}

export interface AssociativeOm4Insight {
  stratumValue: string
  sampleSize: number
  strongestOutcome: string
  topDomain: string
  topDomainStrength: number
  topSubdomain: string
  topSubdomainStrength: number
  priority: 'Alta' | 'Média' | 'Monitorar'
  keyFactors: string[]
  recommendation: string
  caseType?: 'Atenção' | 'Benchmark'
  whyIncluded?: string
  mentalBurdenScore?: number | null
}

export interface AssociativeOm4MentalNotesRow {
  stratumValue: string
  sampleSize: number
  riscoPsicossocialAvg: number | null
  saudeMentalAvg: number | null
  notaEstresseAvg: number | null
  notaSintomasDepressivosAvg: number | null
  notaInternetAvg: number | null
  notaRedeApoioAvg: number | null
  notaSuicidioAvg: number | null
  topDomain: string
  topSubdomain: string
  diagnosisStrategic: string
}

export interface QualitativeSummary {
  totalRespondents: number
  filledObservations: number
  emptyObservations: number
  filledPct: number
  summaryOnly?: boolean
}

export interface WorkCategoryByOm4Row {
  om4: string
  total: number
  expediente: number
  escala: number
  expedienteEscala: number
  notInformed: number
}

export interface GenderByStratumRow {
  stratumValue: string
  total: number
  masculino: number
  feminino: number
  outro: number
  notInformed: number
}

/** Uma macrorregião do país com seus indicadores agregados. */
export interface RegionalRiskRow {
  regiao: string
  respondents: number
  hseAvg: number | null
  mentalHealthAvg: number | null
  disasterExposedPct: number | null
  disasterRespondents: number
  topOms: string[]
  abrangencia?: string | null
}

export interface RegionalUfRow {
  uf: string
  regiao: string
  cidade: string
  respondents: number
  hseAvg: number | null
  mentalHealthAvg: number | null
  disasterExposedPct: number | null
  disasterRespondents: number
}

export interface RegionalRiskData {
  rows: RegionalRiskRow[]
  /** Respondentes que puderam ser localizados geograficamente. */
  coveredRespondents: number
  totalRespondents: number
  ufRows: RegionalUfRow[]
}

export interface ReportPayload {
  /**
   * Seções do relatório, na ordem em que são renderizadas (ver buildRiskReport). Omitido =
   * todas as seções suportadas pelos dados presentes no payload.
   */
  reportSections?:   ReportSectionKey[]
  /** Plano resolvido pelo orquestrador (número e rótulo de cada seção) — lido pela Agenda. */
  sectionPlan?:      SectionPlanEntry[]
  /**
   * Nota de Controle (C, 0–100) por domínio da Matriz de Risco Ocupacional — maturidade das
   * medidas de controle já existentes. Domínio ausente = DEFAULT_RISK_CONTROL.
   */
  riskControlByDomain?: Record<string, number>
  /**
   * Justificativas da Nota de Controle escritas por quem gera o relatório. Ausentes = texto
   * gerado a partir do nível de controle (ver controlJustification*).
   */
  riskControlNotes?: { general?: string; byDomain?: Record<string, string>; conclusion?: string }
  /** Responsáveis técnicos exibidos na Classificação de Riscos (uma pessoa por linha). */
  technicalResponsibles?: string[]
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
  workCategoryByOm4: WorkCategoryByOm4Row[]
  stratifiedWorkCategory?: WorkCategoryStratifiedSlice[]
  stratifiedGenderByStratum?: GenderByStratumStratifiedSlice[]
  genderByStratum?: GenderByStratumRow[]
  hseAvg:            number | null
  hseClassDist:      Distribution[]
  domainAvgs:        { domain: string; avg: number }[]
  /** % em Alto risco por domínio (geral) — usado só no heatmap por estrato, ver StratumRow.domainHighPcts. */
  overallDomainHighPcts?: Record<string, number | null>
  /** % em Alto OU Moderado risco por domínio (geral) — F da Matriz de Risco Ocupacional, ver StratumRow.domainAtLeastModeratePcts. */
  overallDomainAtLeastModeratePcts?: Record<string, number | null>
  /**
   * Subdomínios (indice_* do Modelo Associativo Dinâmico — ver subdomainPredictors em
   * cmpc|yara|fab/report-data.ts) normalizados para a mesma escala 0-10 "maior = melhor"
   * dos domínios (domainAvgs), para alimentar addSubdomainRiskMapSlide.
   */
  subdomainAvgs?: { subdomain: string; avg: number }[]
  overallSubdomainHighPcts?: Record<string, number | null>
  stratumRows:       StratumRow[]
  hseDomains:        string[]
  /**
   * Protocolo de risco da base. Omitido = IRP (FAB/CMPC/YARA, 0–10 menor = pior).
   * O Instituto Alana passa HSE_RISK_PROTOCOL (0–4, maior = pior).
   */
  riskProtocol?:     RiskProtocol
  hasIetr:           boolean
  ietrAvg:           number | null
  ietrClassDist:     Distribution[]
  ietrDomains:       string[]
  ietrDomainAvgs:    { domain: string; avg: number }[]
  ietrStratumRows:   IetrStratumRow[]
  stratifiedHse?:    HseStratifiedSlice[]
  stratifiedIetr?:   IetrStratifiedSlice[]
  stratifiedParticipation?: ParticipationStratifiedSlice[]
  hasWellbeing?:     boolean
  mentalHealthAvg?:  number | null
  mentalHealthClassDist?: Distribution[]
  stressDist?:       Distribution[]
  depressionDist?:   Distribution[]
  suicideRiskDist?:  Distribution[]
  mentalHealthCriticalUnionCount?: number
  tobaccoDist?:      Distribution[]
  alcoholDist?:      Distribution[]
  internetDist?:     Distribution[]
  supportDist?:      Distribution[]
  climateExposureDist?: Distribution[]
  disasterTypeDist?: Distribution[]
  /** Só entre expostos (exposed_natural_disaster === true) — ordem fixa (não por frequência). */
  disasterContactDist?: Distribution[]
  disasterVulnerabilityDist?: Distribution[]
  disasterSafetyConcernDist?: Distribution[]
  stratifiedClimateDisasterRows?: ClimateDisasterStratifiedSlice[]
  bullyingExposureDist?: Distribution[]
  bullyingTypeDist?: Distribution[]
  bullyingSpecialtyIncidence?: BullyingSpecialtyIncidenceRow[]
  bullyingSpecialtyNatureRows?: BullyingSpecialtyNatureRow[]
  stratifiedBullyingIncidence?: BullyingIncidenceStratifiedSlice[]
  stratifiedBullyingNature?: BullyingNatureStratifiedSlice[]
  perceivedMentalHealthDist?: Distribution[]
  perceivedPhysicalHealthDist?: Distribution[]
  perceivedLifeQualityDist?: Distribution[]
  stressSourcesTop?: WellbeingRecurringItem[]
  stressSymptomsTop?: WellbeingRecurringItem[]
  depressionSymptomsTop?: WellbeingRecurringItem[]
  wellbeingStratumRows?: WellbeingStratumRow[]
  wellbeingPerceptionStratumRows?: WellbeingPerceptionStratumRow[]
  stratifiedWellbeing?: WellbeingStratifiedSlice[]
  associativeOutcomes?: string[]
  associativeDomainCorrelations?: AssociativeCorrelationRow[]
  associativeSubdomainCorrelations?: AssociativeCorrelationRow[]
  /**
   * Amostra de pontos brutos (um por respondente) por trás dos r de Spearman mais fortes
   * (domínio ou subdomínio) contra Saúde Mental (Geral) — ferramenta de auditoria visual do
   * próprio número (ver addAssociativeDynamicScatterSlides), não um resultado novo de análise.
   */
  associativeScatterSamples?: {
    predictor: string
    outcome: string
    coefficient: number
    sampleSize: number
    points: { x: number; y: number }[]
  }[]
  associativePriorityActions?: AssociativePriorityAction[]
  associativeOm4Insights?: AssociativeOm4Insight[]
  associativeOm4MentalNotes?: AssociativeOm4MentalNotesRow[]
  qualitativeSummary?: QualitativeSummary
  clientLogoBase64?: string
  /** Foto opcional do cliente exibida na moldura da capa (ver addCoverSlide). */
  clientCoverImageBase64?: string
  /**
   * CMPC only: número da seção ativa, definido pelo contador sequencial de
   * renderCmpcSectionGroup — sobrepõe o cálculo padrão dos get*SectionNumber
   * (baseado em flags fixas), que não sabe lidar com seções repetidas por unidade.
   */
  sectionNumberOverride?: string
}

/* ─── Protocolo de risco ──────────────────────────────────────────────────────
   Dois protocolos coexistem e têm escalas OPOSTAS:

   • IRP (FAB, CMPC, YARA) — índice 0 a 10, MENOR = PIOR.
   • HSE-IT (Instituto Alana / Maria Farinha) — escala 0 a 4, MAIOR = PIOR.

   Todo o gerador consulta o protocolo ativo em vez de comparar com limiares
   fixos; sem isso, alimentar o HSE aqui inverteria cor, ordenação e barras.
─────────────────────────────────────────────────────────────────────────────── */
export interface RiskProtocol {
  /** Sigla exibida no slide de Método de Avaliação. */
  code: string
  name: string
  subtitle: string
  scaleLabel: string
  scaleNote: string
  scaleMin: number
  scaleMax: number
  /** true quando valores MAIORES indicam MAIOR risco (HSE-IT). */
  higherIsWorse: boolean
  highCut: number
  moderateCut: number
  highRange: string
  moderateRange: string
  lowRange: string
  /** Rótulo curto usado em títulos/legendas (ex.: "Índice de Risco", "HSE"). */
  indexLabel: string
}

export const IRP_RISK_PROTOCOL: RiskProtocol = {
  code: 'IRP',
  name: 'Módulo IRP',
  subtitle: 'Índice de Risco Psicossocial',
  scaleLabel: 'Índice de 0 a 10',
  scaleNote: 'Valores menores indicam maior exposição ao risco',
  scaleMin: 0,
  scaleMax: 10,
  higherIsWorse: false,
  highCut: 6.3,
  moderateCut: 6.88,
  highRange: '< 6,30',
  moderateRange: '6,30 a 6,87',
  lowRange: '>= 6,88',
  indexLabel: 'Índice de Risco',
}

export const HSE_RISK_PROTOCOL: RiskProtocol = {
  code: 'HSE',
  name: 'Módulo HSE',
  subtitle: 'Saúde & Segurança no Trabalho',
  scaleLabel: 'Escala de 0 (Nunca) a 4 (Sempre)',
  scaleNote: 'Scores elevados indicam maior exposição ao risco',
  scaleMin: 0,
  scaleMax: 4,
  higherIsWorse: true,
  highCut: 2.5,
  moderateCut: 1.5,
  highRange: '≥ 2,5',
  moderateRange: '1,5 a 2,49',
  lowRange: '< 1,5',
  indexLabel: 'Score HSE',
}

/**
 * Protocolo em uso pelo relatório sendo gerado. Definido de forma síncrona no
 * início de buildRiskReport; como toda a montagem de slides é síncrona (os únicos
 * `await` estão nas duas últimas linhas daquela função), não há risco de duas
 * gerações concorrentes se misturarem. Se algum dia um `await` for introduzido no
 * meio da montagem, esta premissa deixa de valer.
 */
let activeRiskProtocol: RiskProtocol = IRP_RISK_PROTOCOL

/* ─── Risk helpers ────────────────────────────────────────────────────────── */
type RiskLevel = 'high' | 'mod' | 'low'

function riskLevelOf(avg: number): RiskLevel {
  const p = activeRiskProtocol
  if (p.higherIsWorse) {
    if (avg >= p.highCut) return 'high'
    if (avg >= p.moderateCut) return 'mod'
    return 'low'
  }
  if (avg < p.highCut) return 'high'
  if (avg < p.moderateCut) return 'mod'
  return 'low'
}

/** True quando o valor está em alto risco no protocolo ativo. */
function isHighRisk(avg: number): boolean {
  return riskLevelOf(avg) === 'high'
}

/** True quando o valor está em risco moderado OU alto no protocolo ativo. */
function isAtLeastModerateRisk(avg: number): boolean {
  return riskLevelOf(avg) !== 'low'
}

/** Comparador que ordena do MAIS crítico para o menos, na direção do protocolo. */
function byMostCritical(a: { avg: number }, b: { avg: number }): number {
  return activeRiskProtocol.higherIsWorse ? b.avg - a.avg : a.avg - b.avg
}

function riskColor(avg: number): string {
  const level = riskLevelOf(avg)
  if (level === 'high') return C.high
  if (level === 'mod') return C.mod
  return C.low
}

function riskLabel(avg: number): string {
  const level = riskLevelOf(avg)
  if (level === 'high') return 'Alto risco'
  if (level === 'mod') return 'Risco moderado'
  return 'Baixo risco'
}

function riskLightBg(avg: number): string {
  const level = riskLevelOf(avg)
  if (level === 'high') return C.highLt
  if (level === 'mod') return C.modLt
  return C.lowLt
}

/** Posição do valor na escala (0..1), independente da direção do risco. */
function riskIndexRatio(value: number): number {
  const { scaleMin, scaleMax } = activeRiskProtocol
  return Math.max(0, Math.min(1, (value - scaleMin) / (scaleMax - scaleMin)))
}

/** Severidade em % (0 = melhor, 100 = pior), já orientada pela direção do protocolo. */
function riskSeverityPct(value: number): number {
  const ratio = riskIndexRatio(value)
  return trunc1((activeRiskProtocol.higherIsWorse ? ratio : 1 - ratio) * 100)
}

function ietrIndexRatio(value: number): number {
  return Math.max(0, Math.min(1, (value - 1) / 4))
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

// Arredondamento padrão (não truncamento) a 1 casa — usado só pela Matriz de Risco Ocupacional
// (buildRiskMatrixRowsForDomains), para bater com a referência original da tabela "GERAL"
// fornecida pelo cliente, que arredonda em vez de truncar.
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function fmtPct(value: number): string {
  return `${value.toFixed(1).replace('.', ',')}%`
}

function mixHexColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const clean = hex.replace('#', '')
    const r = Number.parseInt(clean.slice(0, 2), 16)
    const g = Number.parseInt(clean.slice(2, 4), 16)
    const bl = Number.parseInt(clean.slice(4, 6), 16)
    return { r, g, bl }
  }
  const toHex = (value: number) => value.toString(16).padStart(2, '0').toUpperCase()
  const clamped = Math.max(0, Math.min(1, t))
  const c1 = parse(a)
  const c2 = parse(b)
  const r = Math.round(c1.r + (c2.r - c1.r) * clamped)
  const g = Math.round(c1.g + (c2.g - c1.g) * clamped)
  const bl = Math.round(c1.bl + (c2.bl - c1.bl) * clamped)
  return `${toHex(r)}${toHex(g)}${toHex(bl)}`
}

function heatRiskColor(pct: number): string {
  const p = Math.max(0, Math.min(100, pct))
  if (p <= 50) return mixHexColor(C.low, C.mod, p / 50)
  return mixHexColor(C.mod, C.high, (p - 50) / 50)
}

/* ─── Variantes de cliente (legado) ───────────────────────────────────────────
   O gerador original (plataforma-alana) escolhia layout e textos pelo NOME do cliente
   (FAB/CMPC/YARA/Statkraft/Abiquim). No AvaxMap o relatório é genérico e guiado por
   configuração (ver buildRiskReport), então todas as variantes ficam desligadas — os
   slides seguem sempre o ramo genérico. Mantidas como funções para não reescrever as
   dezenas de ramos de texto que ainda as consultam.
─────────────────────────────────────────────────────────────────────────── */
function isCmpcReport(data: ReportPayload): boolean {
  void data
  return false
}

function isFabReport(data: ReportPayload): boolean {
  void data
  return false
}

function hasAssociativeDynamicSection(data: ReportPayload): boolean {
  const domainRows = data.associativeDomainCorrelations ?? []
  const subdomainRows = data.associativeSubdomainCorrelations ?? []
  return domainRows.length > 0 || subdomainRows.length > 0
}

/** A presença da seção é decidida pelo orquestrador (resolveSectionPlan). */
function hasRiskClassificationSection(data: ReportPayload): boolean {
  void data
  return true
}

/* ─── Numeração de seções ─────────────────────────────────────────────────────
   O número de cada seção é calculado uma única vez por resolveSectionPlan e injetado em
   `sectionNumberOverride` antes de renderizar os slides daquela seção.
─────────────────────────────────────────────────────────────────────────── */
function sectionNumberOf(data: ReportPayload): string {
  return data.sectionNumberOverride ?? ''
}

function participationSectionBreadcrumb(data: ReportPayload): string {
  return `${sectionNumberOf(data)} | PARTICIPAÇÃO E PERFIL`
}

function mappingSectionBreadcrumb(data: ReportPayload): string {
  return `${sectionNumberOf(data)} | MAPEAMENTO DE RISCOS`
}

function stratumDistSectionBreadcrumb(data: ReportPayload): string {
  return `${sectionNumberOf(data)} | ANÁLISE ESTRATIFICADA`
}

const getWellbeingSectionNumber = sectionNumberOf
const getRecommendationSectionNumber = sectionNumberOf
const getPlanSectionNumber = sectionNumberOf
const getRiskClassificationSectionNumber = sectionNumberOf
const getAssociativeSectionNumber = sectionNumberOf

function associativeSectionBreadcrumbLabel(data: ReportPayload): string {
  void data
  return 'ANÁLISES PREDITIVAS E ASSOCIATIVAS'
}

function associativeSectionTitleLabel(data: ReportPayload): string {
  void data
  return 'Análises Preditivas e Associativas'
}

function mentalHealthColor(avg: number): string {
  if (avg < 5) return C.high
  if (avg < 7) return C.mod
  return C.low
}

function mentalHealthLabel(avg: number): string {
  if (avg < 5) return 'Insatisfatório'
  if (avg < 7) return 'Regular'
  if (avg < 9) return 'Bom'
  return 'Excelente'
}

function splitCountsFromPct(total: number, pcts: number[]): number[] {
  const safeTotal = Math.max(0, Math.round(total))
  if (safeTotal === 0) return pcts.map(() => 0)

  const normalized = pcts.map((pct) => Math.max(0, pct))
  const pctSum = normalized.reduce((sum, pct) => sum + pct, 0)
  if (pctSum <= 0) return normalized.map(() => 0)

  const raw = normalized.map((pct) => (pct / pctSum) * safeTotal)
  const counts = raw.map((value) => Math.floor(value))
  const missing = safeTotal - counts.reduce((sum, value) => sum + value, 0)

  const order = raw
    .map((value, idx) => ({ idx, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac)

  for (let i = 0; i < missing; i++) {
    counts[order[i % order.length].idx] += 1
  }

  return counts
}

function drawRiskBarLabel(
  slide: Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  color: string,
) {
  if (w < 0.42) return
  slide.addText(text, {
    x,
    y,
    w,
    h,
    fontSize: 6.8,
    bold: true,
    color,
    align: 'center',
    valign: 'mid',
    margin: 0,
    fontFace: 'Manrope',
  })
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
  const topDoms   = [...domainAvgs].sort(byMostCritical).slice(0, 3)
  const highAreas = stratumRows.filter(r => r.highPct >= r.modPct && r.highPct >= r.lowPct).length

  const lines: string[] = []

  if (hseAvg !== null) {
    lines.push(
      `O mapeamento conduzido em ${data.clientName} contou com ${totalAnswered} respondentes. O índice médio geral de risco psicossocial foi ${hseAvg.toFixed(2)} `
      + `e a classificação predominante observada foi ${riskLabel(hseAvg).toLowerCase()}.`,
    )
  }

  if (total > 0) {
    const areaMsg = highAreas > 0
      ? `Ao estratificar por ${stratumLabel.toLowerCase()}, ${highAreas} grupo(s) apresentaram classificação de alto risco.`
      : `Nenhum grupo por ${stratumLabel.toLowerCase()} atingiu classificação global de alto risco.`
    lines.push(
      `A distribuição por classificação aponta que ${fmtPct(highPct)} dos respondentes estão em alto risco, `
      + `${fmtPct(modPct)} em risco moderado e ${fmtPct(lowPct)} em baixo risco. ${areaMsg}`,
    )
  }

  if (topDoms.length > 0) {
    const domStr = topDoms.map(d => `${d.domain} (${d.avg.toFixed(2)})`).join(', ')
    lines.push(
      `Os domínios com maior criticidade (menor índice médio) são: ${domStr}. Esses fatores demandam atenção `
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
  | 'clipboard'
  | 'shield-check'
  | 'map'
  | 'layers'
  | 'shield'
  | 'grid'
  | 'brain'

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
    'clipboard':
      `<svg ${attr}><path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z"/><rect x="4" y="4" width="16" height="18" rx="2"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="8" y1="19" x2="13" y2="19"/></svg>`,
    'shield-check':
      `<svg ${attr}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
    'map':
      `<svg ${attr}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`,
    'layers':
      `<svg ${attr}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    'shield':
      `<svg ${attr}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    'grid':
      `<svg ${attr}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    'brain':
      `<svg ${attr}><path d="M9.5 2A3.5 3.5 0 0 0 6 5.5V6a3 3 0 0 0-2 5.24A3 3 0 0 0 6 17a3.5 3.5 0 0 0 3.5 3.5"/><path d="M14.5 2A3.5 3.5 0 0 1 18 5.5V6a3 3 0 0 1 2 5.24A3 3 0 0 1 18 17a3.5 3.5 0 0 1-3.5 3.5"/><path d="M9.5 2v19"/><path d="M14.5 2v19"/></svg>`,
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
      fontSize: 8.2, bold: true, color: C.mintDk, charSpacing: 2,
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
    fontSize: 7.7, color: C.textLt,
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

  const baCover = getBrandAssets()

  // ── Right panel: moldura para foto/imagem do cliente ───────────────────────
  // Painel liso, sem padrão de marca, barra separadora ou borda — só a foto do
  // cliente quando houver (data.clientCoverImageBase64); sem ela, fica vazio.
  const PX   = 6.86   // panel start X
  const PW   = W - PX // panel width
  slide.addShape('rect', { x: PX, y: 0, w: PW, h: H,
    fill: { color: C.navy }, line: { color: C.navy, width: 0 } })

  if (data.clientCoverImageBase64) {
    const frameX = PX + 0.4
    const frameY = 0.55
    const frameW = PW - 0.8
    const frameH = H - 1.1
    slide.addImage({
      data: data.clientCoverImageBase64,
      x: frameX, y: frameY, w: frameW, h: frameH,
      sizing: { type: 'cover', w: frameW, h: frameH },
    })
  }

  // ── Client logo (moldura no topo — logo específico do cliente) ─────────────
  const clientLogoW = 2.2
  const clientLogoH = 0.8
  if (data.clientLogoBase64) {
    slide.addImage({
      data: data.clientLogoBase64,
      x: 0.6, y: 0.55, w: clientLogoW, h: clientLogoH,
      sizing: { type: 'contain', w: clientLogoW, h: clientLogoH },
    })
  } else {
    slide.addShape('roundRect', {
      x: 0.6, y: 0.55, w: clientLogoW, h: clientLogoH,
      fill: { type: 'none' }, line: { color: C.navSub, width: 1, dashType: 'dash' }, rectRadius: 0.05,
    })
    slide.addText('Logo do cliente', {
      x: 0.6, y: 0.55, w: clientLogoW, h: clientLogoH,
      fontSize: 8.5, color: C.textLt, align: 'center', valign: 'middle', fontFace: 'Inter',
    })
  }

  // ── Main title ────────────────────────────────────────────────────────────
  slide.addText('MAPEAMENTO DIGITAL DE FATORES', {
    x: 0.6, y: 1.68, w: 6.1, h: 0.48,
    fontSize: 26, bold: true, color: C.white, fontFace: 'Manrope',
  })
  slide.addText('DE RISCOS PSICOSSOCIAIS E', {
    x: 0.6, y: 2.12, w: 6.1, h: 0.48,
    fontSize: 26, bold: true, color: C.white, fontFace: 'Manrope',
  })
  slide.addText('SAÚDE MENTAL', {
    x: 0.6, y: 2.56, w: 6.1, h: 0.48,
    fontSize: 26, bold: true, color: C.white, fontFace: 'Manrope',
  })

  // Selo "Relatório executivo"
  slide.addShape('roundRect', {
    x: 0.6, y: 3.2, w: 1.95, h: 0.34,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.17,
  })
  slide.addText('Relatório executivo', {
    x: 0.6, y: 3.2, w: 1.95, h: 0.34,
    fontSize: 10.5, bold: true, color: C.white, align: 'center', valign: 'middle', fontFace: 'Manrope',
  })

  // ── Client info ───────────────────────────────────────────────────────────
  slide.addText(data.clientName, {
    x: 0.6, y: 3.78, w: 6.1, h: 0.5,
    fontSize: 20, bold: true, color: C.white, fontFace: 'Manrope',
  })
  let infoY = 4.3
  if (data.clientDescription) {
    slide.addText(data.clientDescription, {
      x: 0.6, y: infoY, w: 5.6, h: 0.36,
      fontSize: 12, color: C.blue2, fontFace: 'Inter',
    })
    infoY += 0.38
  }

  const date = new Date(data.generatedAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const dateCap = date.charAt(0).toUpperCase() + date.slice(1)
  slide.addText(dateCap, {
    x: 0.6, y: infoY, w: 5, h: 0.3,
    fontSize: 12, color: '6A8EAC', fontFace: 'Inter',
  })
  infoY += 0.36
  slide.addText('Saúde & Bem-Estar  •  NR-1/2025  •  ISO 45003', {
    x: 0.6, y: infoY, w: 6.1, h: 0.28,
    fontSize: 11, color: C.blue2, fontFace: 'Inter',
  })
  infoY += 0.34

  const filterParts = Object.entries(data.filters).map(([k, v]) => `${k}=${v}`)
  if (data.reportVariantLabel) filterParts.push(data.reportVariantLabel)
  if (filterParts.length > 0) {
    slide.addText('Filtros: ' + filterParts.join(', '), {
      x: 0.6, y: infoY, w: 6.1, h: 0.24,
      fontSize: 8.5, color: '6A8EAC', fontFace: 'Inter',
    })
  }

  // ── BeeTouch logo (rodapé) ──────────────────────────────────────────────────
  if (baCover.logoB64) {
    const logoW = 2.5
    const logoH = logoW * (72 / 482)
    slide.addImage({
      data: baCover.logoB64,
      x: 0.6, y: H - logoH - 0.5, w: logoW, h: logoH,
    })
  } else {
    slide.addText('beetouch', {
      x: 0.6, y: H - 0.82, w: 2.1, h: 0.42,
      fontSize: 16, bold: true, color: C.white, fontFace: 'Manrope',
    })
    slide.addText('.ai', {
      x: 2.1, y: H - 0.82, w: 0.6, h: 0.42,
      fontSize: 16, color: C.blue, fontFace: 'Manrope',
    })
  }
}

/* ─── Introduction ──────────────────────────────────────────────────────── */
function addIntroductionSlide(prs: PptxGenJS, data: ReportPayload) {
  const pages: { subtitle: string; intro?: string; cards: { title: string; text: string }[]; citation?: string }[] = [
    {
      subtitle: 'Saúde mental e fatores psicossociais no trabalho',
      intro: 'O cuidado com a saúde mental e a gestão dos fatores psicossociais no ambiente de trabalho consolidaram-se como dimensões estruturais da gestão de riscos ocupacionais. Eles decorrem da interação entre o trabalhador e a organização do trabalho, envolvendo a gestão de tarefas, clareza de papéis e relações interpessoais. Quando não identificados e geridos sistematicamente, esses fatores ampliam a exposição ao adoecimento e comprometem diretamente a segurança e o desempenho organizacional.',
      cards: [
        { title: 'Legislação nacional (NR-01)', text: 'Consolidou a obrigatoriedade da avaliação sistemática dos riscos psicossociais no âmbito do GRO e do PGR, equiparando-os em relevância de gestão aos riscos físicos, químicos e ergonômicos.' },
        { title: 'Convergência internacional', text: 'Alinhamento com as diretrizes globais da ISO 31000 (gestão de riscos) e da ISO 45003, a primeira norma dedicada especificamente aos riscos psicossociais no trabalho.' },
      ],
    },
    {
      subtitle: 'Bem-estar e qualidade de vida como eixo estratégico de gestão humana',
      cards: [
        { title: 'Abordagem ampliada', text: 'A avaliação e a gestão de fatores de riscos psicossociais não se limitam à identificação de fatores de adoecimento. Pressupõem, de forma primordial, o monitoramento de indicadores que podem constituir a causa raiz do adoecimento mental no trabalho, capazes de prejudicar o desempenho, o bem-estar e a qualidade de vida dos trabalhadores.' },
        { title: 'Mapeamento integrado', text: 'O presente mapeamento integra indicadores relativos a fatores de riscos psicossociais e clínicos, contemplando aspectos relacionados ao contexto, conteúdo e organização do trabalho, bem como sintomas psicológicos e psiquiátricos, como ansiedade, estresse e depressão. Ao analisar esses dados em conjunto com indicadores de qualidade de vida e percepção geral de saúde, torna-se possível estruturar novas ações de promoção de saúde com maior nível de eficácia e precisão.' },
      ],
    },
    {
      subtitle: 'Objetivo deste relatório',
      cards: [
        { title: 'Contexto e escopo', text: `Este relatório apresenta os resultados do mapeamento digital de fatores de risco psicossociais e saúde mental de ${data.clientName}. Conduzido com base em evidências científicas e tecnologias de análise epidemiológica, o mapeamento permite identificar fatores de risco psicossociais, fatores de proteção, indicadores de saúde mental e oportunidades de melhoria das condições de trabalho.` },
        { title: 'Subsídios técnicos e prevenção', text: 'Ao apresentar os dados coletados e sua análise integrada, o presente relatório subsidia a identificação, a avaliação, a priorização e o monitoramento contínuo dos fatores de risco psicossociais relacionados ao trabalho, contribuindo diretamente para o planejamento de medidas preventivas eficazes e o fortalecimento de ambientes de trabalho saudáveis.' },
      ],
    },
  ]

  const ba = getBrandAssets()

  pages.forEach((page) => {
    const slide = prs.addSlide()

    slide.addShape('rect', { x: 0, y: 0, w: W, h: H,
      fill: { color: C.bg }, line: { color: C.bg, width: 0 } })
    slide.addShape('rect', { x: 0, y: 0, w: BARW, h: H,
      fill: { color: C.blue }, line: { color: C.blue, width: 0 } })

    if (ba.logoB64) {
      const logoW = 2.1
      const logoH = logoW * (72 / 482)
      slide.addImage({ data: ba.logoB64, x: MX, y: 0.5, w: logoW, h: logoH })
    } else {
      slide.addText('beetouch', {
        x: MX, y: 0.42, w: 2.0, h: 0.36,
        fontSize: 15, bold: true, color: C.white, fontFace: 'Manrope',
      })
      slide.addText('.ai', {
        x: MX + 1.44, y: 0.42, w: 0.5, h: 0.36,
        fontSize: 15, color: C.blue, fontFace: 'Manrope',
      })
    }

    slide.addText('Introdução', {
      x: MX, y: 1.02, w: 8, h: 0.56,
      fontSize: 30, bold: true, color: C.white, fontFace: 'Manrope',
    })
    slide.addText(page.subtitle, {
      x: MX, y: 1.62, w: CW, h: 0.32,
      fontSize: 14.5, color: C.blue2, fontFace: 'Manrope',
    })
    slide.addShape('rect', { x: MX, y: 1.98, w: 1.35, h: 0.025,
      fill: { color: C.blue }, line: { color: C.blue, width: 0 } })

    let cardY = 2.28
    let cardH = H - cardY - 0.5

    if (page.intro) {
      slide.addText(page.intro, {
        x: MX, y: cardY, w: CW, h: 1.0,
        fontSize: 12.5, color: C.blue3, fontFace: 'Inter', valign: 'top', margin: 0,
      })
      cardY += 1.14
      cardH = H - cardY - 0.5
    }

    // Citação bibliográfica: reserva uma faixa abaixo dos cards em vez de disputar espaço
    // com o texto do card, mesmo padrão de nota de rodapé usado alhures no relatório
    // (fontSize pequeno, itálico, C.textLt).
    if (page.citation) cardH -= 0.34

    const cardGap = 0.3
    const cardW = (CW - cardGap) / 2

    page.cards.forEach((card, idx) => {
      const x = MX + idx * (cardW + cardGap)
      slide.addShape('roundRect', {
        x, y: cardY, w: cardW, h: cardH,
        fill: { color: C.navy }, line: { color: C.navSub, width: 1 }, rectRadius: 0.09,
      })
      slide.addShape('roundRect', {
        x, y: cardY, w: 0.07, h: cardH,
        fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09,
      })
      slide.addText(card.title, {
        x: x + 0.26, y: cardY + 0.2, w: cardW - 0.48, h: 0.36,
        fontSize: 14.5, bold: true, color: C.white, fontFace: 'Manrope',
      })
      slide.addText(card.text, {
        x: x + 0.26, y: cardY + 0.6, w: cardW - 0.48, h: cardH - 0.8,
        fontSize: 11.5, color: C.blue3, fontFace: 'Inter', valign: 'top', margin: 0,
      })
    })

    if (page.citation) {
      slide.addText(page.citation, {
        x: MX, y: cardY + cardH + 0.12, w: CW, h: 0.22,
        fontSize: 8.3, italic: true, color: C.textLt, fontFace: 'Inter', valign: 'top', margin: 0,
      })
    }
  })
}

/* ─── Executive Summary ──────────────────────────────────────────────────── */
function addExecutiveSummarySlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Sumário Executivo', data.clientName)

  const highN   = data.hseClassDist.find(d => d.name === 'Alto risco')?.value ?? 0
  const modN    = data.hseClassDist.find(d => d.name === 'Risco moderado')?.value ?? 0
  const lowN    = data.hseClassDist.find(d => d.name === 'Baixo risco')?.value ?? 0
  const highOrModN = highN + modN
  const total   = highN + modN + lowN
  const highPct = pct1(highN, total)
  const modPct  = pct1(modN, total)
  const highOrModPct = pct1(highOrModN, total)
  const lowPct  = pct1(lowN, total)

  // ── KPI CARDS ─────────────────────────────────────────────────────────────
  const kpiGap = 0.20
  const kpiW   = (CW - kpiGap * 3) / 4
  const kpiH   = 1.82
  const kpiY   = cY

  const kpis: { iconType: IconType; iconColor: string; iconBg: string; value: string; label: string }[] = [
    { iconType: 'people',       iconColor: C.blue,  iconBg: C.bluePale,
      value: data.totalAnswered.toLocaleString('pt-BR'), label: 'Pessoas participantes' },
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
      fontSize: 12, color: C.textMd, align: 'center', fontFace: 'Inter',
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
    const worst = [...data.domainAvgs].sort(byMostCritical)[0]
    insights.push({
      iconType: 'alert-tri', color: C.high, bg: C.highLt,
      title: 'Principal domínio de risco',
      text: activeRiskProtocol.higherIsWorse
        ? `"${worst.domain}" apresentou o maior score (${worst.avg.toFixed(2)}), classificado como ${riskLabel(worst.avg).toLowerCase()}.`
        : `"${worst.domain}" apresentou o menor índice médio (${worst.avg.toFixed(2)}), indicando maior criticidade no protocolo Beetouch.`,
    })
  }

  insights.push({
    iconType: 'people', color: C.mod, bg: C.modLt,
    title: 'Distribuição de risco',
    text:  `${fmtPct(highOrModPct)} dos trabalhadores estão em situação de risco moderado ou alto.`,
  })

  if (data.hseAvg !== null) {
    insights.push({
      iconType: 'check-circle', color: C.low, bg: C.lowLt,
      title: 'Diagnóstico geral',
      text:  `Índice médio de ${data.hseAvg.toFixed(2)} classifica a organização em ${riskLabel(data.hseAvg).toLowerCase()}. ${fmtPct(lowPct)} dos trabalhadores em condição de baixo risco.`,
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

  const planned = data.sectionPlan?.filter((entry) => entry.inAgenda)
  const sections = (planned ?? []).map((entry, idx) => ({
    n: entry.number,
    label: entry.label,
    sub: entry.key === 'estratificada' ? stratSub : entry.sub,
    color: [C.blue, C.blue2, C.high, C.mod, C.low, C.blue3, C.navSub][idx % 7],
  }))

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
function getPlanHseContext(data: ReportPayload): { label: string; rows: StratumRow[] } {
  const specialSlice = data.stratifiedHse?.find((slice) => slice.stratum === 'especialidade' && slice.stratumRows.length > 0)
  return {
    label: specialSlice?.stratumLabel ?? data.stratumLabel,
    rows: specialSlice?.stratumRows ?? data.stratumRows,
  }
}

function getPlanIetrContext(data: ReportPayload): { label: string; rows: IetrStratumRow[] } {
  const specialSlice = data.stratifiedIetr?.find((slice) => slice.stratum === 'especialidade' && slice.ietrStratumRows.length > 0)
  return {
    label: specialSlice?.stratumLabel ?? data.stratumLabel,
    rows: specialSlice?.ietrStratumRows ?? data.ietrStratumRows,
  }
}

function addActionPlanStrategicRoadmapSlide(prs: PptxGenJS, data: ReportPayload, page: 1 | 2 | 3) {
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(
    prs,
    `Plano de Ação Integrado — Roadmap Estratégico (${page}/3)`,
    data.clientName,
    `${sNum} | PLANO DE AÇÃO`,
  )

  const allRows = [
    {
      prazo: '0–3 meses',
      objetivo: 'Estruturar a governança dos riscos psicossociais',
      justificativa: 'A NR-1 estabelece que o gerenciamento deve iniciar pela identificação, avaliação, classificação dos riscos e elaboração do Plano de Ação do PGR, definindo responsáveis e critérios de acompanhamento.',
      acoes: 'Constituir Comitê de Riscos Psicossociais; Atualizar Inventário de Riscos e Plano de Ação do PGR; Priorizar unidades críticas conforme classificação; Definir indicadores e responsáveis pelo acompanhamento.',
      solucao: 'AVAX Map como linha de base diagnóstica.',
    },
    {
      prazo: '0–3 meses',
      objetivo: 'Reduzir fatores organizacionais prioritários',
      justificativa: 'As análises preditivas demonstram maior impacto dos fatores relacionados à organização do trabalho, responsabilidades e satisfação sobre os desfechos de saúde mental. A atuação deve priorizar mudanças organizacionais antes das intervenções individuais.',
      acoes: 'Revisar distribuição de demandas; Mapear processos críticos; Revisar papéis e responsabilidades; Implantar melhorias operacionais nas unidades prioritárias.',
      solucao: 'AVAX Deep para investigação das causas-raiz dos riscos identificados pelo diagnóstico.',
    },
    {
      prazo: '3–6 meses',
      objetivo: 'Fortalecer lideranças e práticas de gestão',
      justificativa: 'O Guia do MTE destaca que liderança, comunicação e organização do trabalho são medidas preventivas fundamentais para redução dos riscos psicossociais.',
      acoes: 'Desenvolver gestores em liderança saudável; Capacitar sobre prevenção do assédio, feedback, comunicação, gestão de conflitos e gestão da mudança; Implantar rotinas estruturadas de acompanhamento das equipes.',
      solucao: 'AVAX Learn com trilhas educacionais personalizadas a partir dos fatores críticos identificados pelo AVAX Map e pelas investigações do AVAX Deep.',
    },
    {
      prazo: '3–6 meses',
      objetivo: 'Fortalecer comunicação organizacional e participação dos trabalhadores',
      justificativa: 'O GRO recomenda mecanismos permanentes de consulta, comunicação e participação como parte da gestão dos riscos psicossociais.',
      acoes: 'Estruturar canais permanentes de escuta; Implementar ciclos de feedback; Fortalecer programas de reconhecimento; Divulgar periodicamente indicadores e ações implementadas.',
      solucao: 'AVAX Pulse para monitoramento da efetividade das ações implementadas em especialidades críticas; AVAX Bench para acompanhamento da maturidade da governança e da efetividade das ações institucionais.',
    },
    {
      prazo: '3–12 meses',
      objetivo: 'Monitorar continuamente os fatores de risco',
      justificativa: 'O MTE determina que a efetividade das medidas deve ser acompanhada continuamente para subsidiar a melhoria do PGR.',
      acoes: 'Realizar monitoramento trimestral; Detectar alterações precoces dos indicadores; Avaliar efetividade das intervenções; Atualizar prioridades conforme evolução dos riscos.',
      solucao: 'AVAX Pulse realizando monitoramento contínuo da população, geração de alertas e acompanhamento da evolução dos indicadores de risco psicossocial.',
    },
    {
      prazo: '6–9 meses',
      objetivo: 'Aprofundar fatores persistentes e validar intervenções',
      justificativa: 'Após a implantação das primeiras medidas, fatores persistentes devem ser analisados em maior profundidade para identificação das causas organizacionais.',
      acoes: 'Realizar grupos focais; Entrevistas com gestores e trabalhadores; Revisar planos específicos das unidades críticas; Validar barreiras à implementação das melhorias.',
      solucao: 'AVAX Deep para investigação qualitativa complementar integrada aos resultados do monitoramento realizado pelo AVAX Pulse.',
    },
    {
      prazo: '6–12 meses',
      objetivo: 'Consolidar a melhoria contínua do GRO',
      justificativa: 'A revisão periódica do Inventário de Riscos e do Plano de Ação constitui requisito central do ciclo PDCA previsto na NR-1 e na ISO 45001.',
      acoes: 'Reavaliar classificação dos riscos; Atualizar Inventário e Plano de Ação; Comparar evolução com a linha de base; Produzir relatório executivo para a alta administração.',
      solucao: 'AVAX Map para reavaliação anual; AVAX Pulse para consolidar tendências; AVAX Bench para avaliação da maturidade institucional; AVAX Lumen para geração automatizada de relatórios gerenciais e recomendações.',
    },
    {
      prazo: 'Transversal\n(durante todo o ciclo)',
      objetivo: 'Oferecer suporte especializado aos trabalhadores',
      justificativa: 'O cuidado individual deve complementar as intervenções organizacionais, especialmente para trabalhadores com maior vulnerabilidade identificada durante o monitoramento.',
      acoes: 'Encaminhamento para atendimento psicológico; Programas de acolhimento; Gestão de casos críticos.',
      solucao: 'AVAX Mind para cuidado psicológico estruturado.',
    },
  ]

  const pages = {
    1: allRows.slice(0, 3),
    2: allRows.slice(3, 6),
    3: allRows.slice(6, 8),
  }
  const rows = pages[page]

  slide.addText('Roadmap tático-operacional para implantação, acompanhamento e consolidação do GRO psicossocial, priorizando o estrato de especialidade.', {
    x: MX,
    y: cY + 0.02,
    w: CW,
    h: 0.2,
    fontSize: 9.6,
    color: C.textMd,
    italic: true,
    fontFace: 'Inter',
  })

  const rowGap = 0.14
  const rowH = (cH - 0.34 - rowGap * (rows.length - 1)) / rows.length
  const cols = [1.2, 1.75, 3.0, 3.0, CW - 1.2 - 1.75 - 3.0 - 3.0 - 0.12]
  const headers = ['Prazo', 'Objetivo', 'Justificativa Técnica', 'Ações Recomendadas', 'Soluções BeeTouch Integradas']
  const tableX = MX
  const tableY = cY + 0.3
  const headerH = 0.42

  drawRoundedCard(slide, tableX, tableY, CW, headerH, { fill: C.navy, borderColor: C.navy, radius: 0.06 })
  let hx = tableX
  headers.forEach((header, idx) => {
    slide.addText(header, {
      x: hx + 0.08,
      y: tableY + 0.12,
      w: cols[idx] - 0.16,
      h: 0.16,
      fontSize: 8.6,
      bold: true,
      color: C.white,
      fontFace: 'Manrope',
    })
    hx += cols[idx]
  })

  rows.forEach((row, idx) => {
    const y = tableY + headerH + idx * (rowH + rowGap)
    const bg = idx % 2 === 0 ? C.white : 'F8FBFE'
    drawRoundedCard(slide, tableX, y, CW, rowH, { fill: bg, borderColor: C.border, radius: 0.04 })

    let x = tableX
    const values = [row.prazo, row.objetivo, row.justificativa, row.acoes, row.solucao]
    values.forEach((value, cIdx) => {
      const color = cIdx === 0 ? C.navy : cIdx === 4 ? C.blue : C.textDk
      const bold = cIdx === 0 || cIdx === 1
      slide.addText(value, {
        x: x + 0.08,
        y: y + 0.12,
        w: cols[cIdx] - 0.16,
        h: rowH - 0.18,
        fontSize: cIdx === 4 ? 8.7 : 8.9,
        bold,
        color,
        fontFace: bold ? 'Manrope' : 'Inter',
      })
      x += cols[cIdx]
    })
  })
}

function addActionPlanSynthesisSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Síntese Atualizada - Base para o Plano de Ação', data.clientName, `${sNum} | PLANO DE AÇÃO`)
  const hseContext = getPlanHseContext(data)

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

  const criticalDomain = [...data.domainAvgs].sort(byMostCritical)[0]
  const criticalDomainName = criticalDomain?.domain ?? 'Domínio crítico'
  const criticalOverall = criticalDomain?.avg ?? null

  const criticalGroups = hseContext.rows
    .filter(r => {
      const v = r.domainAvgs[criticalDomainName]
      return v !== null
    })
    .sort((a, b) => ((a.domainAvgs[criticalDomainName] ?? 99) - (b.domainAvgs[criticalDomainName] ?? 99)))
    .map(r => r.name)

  const hasCriticalData = criticalOverall !== null
  const criticalScoreTxt = criticalOverall !== null ? criticalOverall.toFixed(2).replace('.', ',') : '--'
  const criticalRisk = criticalOverall !== null ? riskLabel(criticalOverall).toLowerCase() : 'sem dados'
  const criticalGroupsForText = criticalGroups.slice(0, 5)

  const leftBody = hasCriticalData
    ? `${criticalDomainName} apresenta maior criticidade no resultado geral (índice médio ${criticalScoreTxt}, classificação ${criticalRisk}). ${criticalGroupsForText.length > 0
      ? `A análise estratificada indica maior incidência em ${criticalGroupsForText.join(', ')}.`
      : `A análise estratificada não identificou incidência relevante por ${hseContext.label.toLowerCase()}.`}`
    : 'Não há dados suficientes dos domínios para consolidar evidências nesta base analítica.'

  const leftPriority = criticalGroups.length > 0
    ? `Prioridade operacional: reduzir sobrecarga, revisar metas e reequilibrar capacidade nas ${hseContext.label.toLowerCase()} com maior exposição.`
    : `Prioridade operacional: reduzir sobrecarga, organizar prioridades e monitorar ${hseContext.label.toLowerCase()} com maior exposição.`

  const wellbeingTotal = (data.suicideRiskDist ?? []).reduce((sum, item) => sum + item.value, 0)
  const wellbeingRisk = data.suicideRiskDist?.find((item) => item.name === 'Com risco')?.value ?? 0
  const wellbeingRiskPct = pct1(wellbeingRisk, wellbeingTotal)
  const severeStress = data.stressDist?.find((item) => item.name === 'Sintomas Graves')?.value ?? 0
  const severeStressPct = pct1(severeStress, wellbeingTotal)
  const depressiveAlert = (data.depressionDist ?? [])
    .filter((item) => item.name === 'Sintomas Moderados' || item.name === 'Sintomas Graves')
    .reduce((sum, item) => sum + item.value, 0)
  const depressiveAlertPct = pct1(depressiveAlert, wellbeingTotal)
  const wellbeingAvg = data.mentalHealthAvg ?? null

  const rightBody = data.hasIetr && ietrTotal > 0 && data.ietrAvg !== null
    ? `O módulo IETR apresenta índice médio de ${data.ietrAvg.toFixed(2).replace('.', ',')}, classificado como ${ietrLabel(data.ietrAvg).toLowerCase()}. A distribuição mostra ${fmtPct(ietrRiskPct)} em situação de risco, ${fmtPct(ietrAttPct)} em zona de atenção e ${fmtPct(ietrOkPct)} em condição adequada.`
    : data.hasWellbeing && wellbeingTotal > 0 && wellbeingAvg !== null
      ? `A leitura de saúde mental apresenta índice médio de ${wellbeingAvg.toFixed(2).replace('.', ',')} (${mentalHealthLabel(wellbeingAvg).toLowerCase()}). Há ${fmtPct(severeStressPct)} com estresse grave, ${fmtPct(depressiveAlertPct)} com sintomas depressivos e ${fmtPct(wellbeingRiskPct)} com risco de suicídio sinalizado.`
    : 'Não há base complementar suficiente nesta extração para evidência adicional além do módulo psicossocial.'

  const rightPriority = data.hasIetr && ietrTotal > 0
    ? 'Prioridade operacional: protocolo de teletrabalho saudável, desconexão, ergonomia e gestão de reuniões.'
    : data.hasWellbeing && wellbeingTotal > 0
      ? 'Prioridade operacional: protocolo de acolhimento, fluxo de cuidado, manejo de crise e ações preventivas de saúde mental.'
    : 'Prioridade operacional: manter monitoramento contínuo das condições psicossociais nas próximas coletas.'

  const kpiGap = 0.18
  const kpiW = (CW - kpiGap * 4) / 5
  const kpiH = 1.22
  const kpiY = cY + 0.34
  const kpis = [
    { value: `${data.totalAnswered}`, label: 'respondentes', sub: `${fmtPct(adherencePct)} de adesão`, color: C.blue },
    { value: fmtPct(hseLowPct), label: 'baixo risco psicossocial', sub: `${hseLow} trabalhadores`, color: C.low },
    { value: fmtPct(hseModPct), label: 'risco moderado', sub: `${hseMod} trabalhadores`, color: C.mod },
    { value: fmtPct(hseHighPct), label: 'alto risco psicossocial', sub: `${hseHigh} trabalhadores`, color: C.high },
    {
      value: data.hasIetr && ietrTotal > 0
        ? fmtPct(ietrRiskPct)
        : data.hasWellbeing && wellbeingTotal > 0
          ? fmtPct(wellbeingRiskPct)
          : '--',
      label: data.hasIetr ? 'risco IETR' : 'risco de suicídio',
      sub: data.hasIetr && ietrTotal > 0
        ? `${ietrRisk} em situação de risco`
        : data.hasWellbeing && wellbeingTotal > 0
          ? `${wellbeingRisk} sinalizados`
          : 'sem base suficiente',
      color: (data.hasIetr || data.hasWellbeing) ? C.high : C.textLt,
    },
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

  const complementaryTitle = data.hasIetr
    ? 'Evidência complementar - Trabalho remoto'
    : 'Evidência complementar - Saúde mental'

  const evidences = [
    { title: 'Evidência principal', body: leftBody, priority: leftPriority, accent: C.high, priorityColor: C.high },
    { title: complementaryTitle, body: rightBody, priority: rightPriority, accent: 'EA8A00', priorityColor: 'EA8A00' },
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
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Classificação Operacional de Risco para Priorização', data.clientName, `${sNum} | PLANO DE AÇÃO`)
  const hseContext = getPlanHseContext(data)

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
  const ietrDemand = data.ietrDomainAvgs.find(d => d.domain === 'Demanda')?.avg ?? null

  const domainMap = new Map(data.domainAvgs.map(d => [d.domain, d.avg]))
  const strataWithDomains = hseContext.rows.filter(r => r.answered >= 5)

  const isDomainAtRisk = (row: { domainAvgs: Record<string, number | null> }, domain: string): boolean => {
    const v = row.domainAvgs[domain]
    return v !== null && v !== undefined && isAtLeastModerateRisk(v)
  }

  const recurrencePct = (domain: string): number => {
    const total = strataWithDomains.length
    if (total === 0) return 0
    const withRisk = strataWithDomains.filter((r) => isDomainAtRisk(r, domain)).length
    return pct1(withRisk, total)
  }

  const topGroupsByDomain = (domain: string): string[] => {
    return strataWithDomains
      .filter((r) => isDomainAtRisk(r, domain))
      .sort((a, b) => byMostCritical(
        { avg: a.domainAvgs[domain] ?? 0 },
        { avg: b.domainAvgs[domain] ?? 0 },
      ))
      .slice(0, 3)
      .map(r => r.name)
  }

  const severityMultiplier = (avg: number | null): number => {
    if (avg === null) return 0.8
    if (isHighRisk(avg)) return 1.55
    if (isAtLeastModerateRisk(avg)) return 1.25
    return 0.85
  }

  const priorityFromR = (r: number): { label: string; prazo: string; color: string } => {
    if (r >= 75) return { label: 'Alta', prazo: '<= 6m', color: C.high }
    if (r >= 45) return { label: 'Moderado', prazo: '<= 6m', color: C.mintDk }
    if (r >= 20) return { label: 'Tolerável', prazo: '<= 9m', color: 'EA8A00' }
    if (r >= 12) return { label: 'Trivial monitorado', prazo: '<= 12m', color: C.low }
    return { label: 'Trivial', prazo: '<= 12m', color: C.low }
  }

  const makeDomainFactor = (label: string, domain: string) => {
    const avgVal = domainMap.get(domain) ?? null
    const recurrence = recurrencePct(domain)
    const groups = topGroupsByDomain(domain)
    const severityFactor = avgVal === null ? 0.4 : (riskSeverityPct(avgVal) / 100)
    const F = trunc1(hseCriticalPct * (0.6 + severityFactor))
    const R = trunc1(F * (severityMultiplier(avgVal) + (recurrence / 100) * 0.4))
    const pr = priorityFromR(R)
    const evidence = avgVal !== null
      ? `Índice médio ${avgVal.toFixed(2).replace('.', ',')} (${riskLabel(avgVal).toLowerCase()}); recorrência em ${fmtPct(recurrence)} dos grupos${groups.length > 0 ? `: ${groups.join(', ')}` : ''}`
      : 'Sem dados suficientes nesta base'

    return { fator: label, evidencia: evidence, F, R, prioridade: pr.label, prazo: pr.prazo, pColor: pr.color }
  }

  const rows: Array<{ fator: string; evidencia: string; F: number; R: number; prioridade: string; prazo: string; pColor: string }> = []

  if (data.hasIetr && ietrTotal > 0 && data.ietrAvg !== null) {
    const teleR = trunc1(ietrRiskPct * 1.55)
    const telePr = priorityFromR(teleR)
    rows.push({
      fator: 'Teletrabalho/IETR',
      evidencia: `Situação de risco ${fmtPct(ietrRiskPct)}; índice ${data.ietrAvg.toFixed(2).replace('.', ',')} (${ietrLabel(data.ietrAvg).toLowerCase()}); Demanda ${ietrDemand !== null ? ietrDemand.toFixed(2).replace('.', ',') : '--'} / Controle ${ietrControl !== null ? ietrControl.toFixed(2).replace('.', ',') : '--'}`,
      F: ietrRiskPct,
      R: teleR,
      prioridade: telePr.label,
      prazo: telePr.prazo,
      pColor: telePr.color,
    })
  }

  // Percorre os domínios REAIS da base em vez de uma lista fixa. Com os nomes do protocolo
  // Beetouch hardcoded aqui, qualquer base com outro conjunto de domínios (HSE, por exemplo)
  // caía no fallback de "sem dados" e produzia F/R idênticos em todas as linhas.
  const domainsInOrder = [...data.domainAvgs].sort(byMostCritical).map((d) => d.domain)
  for (const domain of domainsInOrder) {
    rows.push(makeDomainFactor(domain, domain))
  }

  slide.addText(
    'Método de priorização: índices e classificações do protocolo Beetouch + criticidade organizacional + prazo de controle. O cálculo R usa lógica operacional para apoiar decisão sem substituir validação técnica do PGR.',
    { x: MX, y: cY + 0.04, w: CW, h: 0.2, fontSize: 9.6, color: C.textLt, italic: true, fontFace: 'Inter' },
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
    { x: MX, y: cY + cH - 0.12, w: CW, h: 0.14, fontSize: 8.1, color: C.textLt, italic: true, fontFace: 'Inter' },
  )
}

type ActionPlaybookVariant = 'moderado' | 'toleravel' | 'trivial'

type DomainPlanSeverity = 'alto' | 'moderado'

type ActionPlanMatrixCellStyle = {
  color?: string
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  fontSize?: number
}

function drawActionPlanMatrixTable(
  slide: Slide,
  options: {
    x: number
    y: number
    w: number
    h: number
    headers: string[]
    rows: string[][]
    colWeights: number[]
    headerColor?: string
    borderColor?: string
    evenRowColor?: string
    oddRowColor?: string
    headerFontSize?: number
    cellFontSize?: number
    cellStyle?: (rowIndex: number, colIndex: number, text: string) => ActionPlanMatrixCellStyle | undefined
  },
) {
  const {
    x,
    y,
    w,
    h,
    headers,
    rows,
    colWeights,
    headerColor = C.navy,
    borderColor = C.border,
    evenRowColor = C.white,
    oddRowColor = 'F8FBFE',
    headerFontSize = 8.8,
    cellFontSize = 8,
    cellStyle,
  } = options

  const safeRows = rows.length > 0 ? rows : [['']]
  const weightTotal = colWeights.reduce((sum, value) => sum + value, 0)
  const normalized = colWeights.map((value) => (w * value) / weightTotal)
  const headerH = Math.min(0.5, Math.max(0.34, h * 0.11))
  const rowH = (h - headerH) / safeRows.length

  drawRoundedCard(slide, x, y, w, h, { fill: C.white, borderColor, radius: 0.04 })
  slide.addShape('rect', {
    x,
    y,
    w,
    h: headerH,
    fill: { color: headerColor },
    line: { color: headerColor, width: 0 },
  })

  let hx = x
  headers.forEach((header, colIndex) => {
    slide.addText(header, {
      x: hx + 0.06,
      y: y + 0.1,
      w: normalized[colIndex] - 0.12,
      h: headerH - 0.12,
      fontSize: headerFontSize,
      bold: true,
      color: C.white,
      fontFace: 'Manrope',
      align: colIndex === headers.length - 1 ? 'center' : 'left',
      valign: 'mid',
    })
    hx += normalized[colIndex]
  })

  safeRows.forEach((row, rowIndex) => {
    const rowY = y + headerH + rowIndex * rowH
    const bg = rowIndex % 2 === 0 ? evenRowColor : oddRowColor
    slide.addShape('rect', {
      x,
      y: rowY,
      w,
      h: rowH,
      fill: { color: bg },
      line: { color: bg, width: 0 },
    })

    let cx = x
    headers.forEach((_, colIndex) => {
      const txt = row[colIndex] ?? ''
      const style = cellStyle?.(rowIndex, colIndex, txt)
      slide.addText(txt, {
        x: cx + 0.06,
        y: rowY + 0.06,
        w: normalized[colIndex] - 0.12,
        h: rowH - 0.1,
        fontSize: style?.fontSize ?? cellFontSize,
        bold: style?.bold ?? false,
        color: style?.color ?? C.textDk,
        align: style?.align ?? 'left',
        valign: 'mid',
        fontFace: style?.bold ? 'Manrope' : 'Inter',
      })
      cx += normalized[colIndex]
    })

    slide.addShape('line', {
      x,
      y: rowY + rowH,
      w,
      h: 0,
      line: { color: borderColor, pt: 0.6 },
    })
  })

  let vx = x
  for (let i = 0; i < normalized.length - 1; i += 1) {
    vx += normalized[i]
    slide.addShape('line', {
      x: vx,
      y,
      w: 0,
      h,
      line: { color: borderColor, pt: 0.7 },
    })
  }
}

function addActionPlanExecutiveMatrixCriteriaSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Matriz Executiva de Riscos Psicossociais', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  slide.addText(`${data.clientName} · leitura executiva para priorização e plano de ação`, {
    x: MX,
    y: cY + 0.04,
    w: CW,
    h: 0.2,
    fontSize: 12,
    italic: true,
    color: C.textMd,
    fontFace: 'Inter',
  })

  slide.addText(
    'Matriz complementar à avaliação quantitativa do GRO, combinando o nível de risco identificado, a associação com saúde mental, a distribuição entre unidades e a urgência de intervenção. Facilita a definição do plano de ação e a apresentação executiva do diagnóstico.',
    {
      x: MX,
      y: cY + 0.38,
      w: CW,
      h: 0.58,
      fontSize: 11,
      color: C.textDk,
      fontFace: 'Inter',
    },
  )

  slide.addText('Critérios de priorização', {
    x: MX,
    y: cY + 1.06,
    w: CW,
    h: 0.28,
    fontSize: 22,
    bold: true,
    color: C.textDk,
    fontFace: 'Manrope',
  })

  drawActionPlanMatrixTable(slide, {
    x: MX,
    y: cY + 1.42,
    w: CW,
    h: cH - 1.52,
    headers: ['Prioridade', 'Interpretação', 'Diretriz'],
    colWeights: [1.3, 4.5, 4.5],
    rows: [
      [
        'P1: Crítica',
        'Exposição relevante associada a desfechos de saúde mental e concentração em unidades vulneráveis',
        'Intervenção imediata e acompanhamento mensal',
      ],
      [
        'P2: Alta',
        'Exposição importante ou controle organizacional insuficiente',
        'Plano de ação em até 90 dias',
      ],
      [
        'P3: Moderada',
        'Risco delimitado, sem evidência de impacto generalizado',
        'Ação preventiva e monitoramento trimestral',
      ],
      [
        'P4: Manutenção',
        'Fator predominantemente protegido',
        'Preservar controles e disseminar boas práticas',
      ],
    ],
    headerFontSize: 11,
    cellFontSize: 10.2,
    evenRowColor: C.white,
    oddRowColor: C.white,
    cellStyle: (_row, col) => ({
      bold: col === 0,
      color: C.textDk,
    }),
  })
}

// Descrições genéricas por domínio (NR-1 / ISO 45003), reaproveitadas nas matrizes do Plano de
// Ação para qualquer cliente — evidências/consequências/controles não dependem de dados fixos
// de uma empresa específica; só a lista de grupos/estratos priorizados vem de `data`.
const DOMAIN_RISK_INSIGHTS: Record<string, { evidence: string; consequence: string; control: string }> = {
  'Trabalho': {
    evidence: 'Volume de demandas, prazos e organização das tarefas percebidos como excessivos ou pouco viáveis.',
    consequence: 'Fadiga, estresse persistente, queda de desempenho, absenteísmo e afastamentos.',
    control: 'Revisar dimensionamento, distribuição de tarefas, prazos e pontos de estrangulamento operacional.',
  },
  'Autonomia': {
    evidence: 'Baixa margem de decisão da equipe sobre ritmo, método e priorização do próprio trabalho.',
    consequence: 'Redução do senso de competência, desmotivação e aumento do estresse percebido.',
    control: 'Ampliar participação na definição de metas, prazos e forma de execução das tarefas.',
  },
  'Liderança': {
    evidence: 'Suporte, escuta e orientação da chefia percebidos como insuficientes no dia a dia.',
    consequence: 'Insegurança, menor engajamento e maior desgaste emocional das equipes.',
    control: 'Capacitar lideranças em gestão de pessoas, feedback e comunicação de apoio.',
  },
  'Cooperação': {
    evidence: 'Baixo apoio entre colegas e dificuldade de atuação em rede.',
    consequence: 'Isolamento, sobrecarga individual e deterioração do clima de equipe.',
    control: 'Fortalecer rotinas de apoio entre pares e pactos de colaboração intraequipes.',
  },
  'Convivência': {
    evidence: 'Sinais de conflitos interpessoais, falta de respeito ou risco de assédio nas relações de trabalho.',
    consequence: 'Sofrimento psíquico, afastamentos e agravamento de quadros de ansiedade/depressão.',
    control: 'Fortalecer protocolos de prevenção ao assédio e mediação estruturada de conflitos.',
  },
  'Responsabilidades': {
    evidence: 'Baixa clareza sobre papéis, metas e critérios de priorização das atividades.',
    consequence: 'Retrabalho, conflitos de prioridade e percepção de injustiça.',
    control: 'Atualizar atribuições, fluxos decisórios e realizar alinhamentos periódicos de expectativas.',
  },
  'Mudanças': {
    evidence: 'Comunicação insuficiente e baixa participação da equipe durante mudanças operacionais.',
    consequence: 'Insegurança, ansiedade e resistência às transformações em curso.',
    control: 'Estruturar protocolo de comunicação de mudanças com calendário e canais de consulta.',
  },
  'Satisfação': {
    evidence: 'Percepção de baixo reconhecimento, remuneração ou desenvolvimento de carreira.',
    consequence: 'Desmotivação, desengajamento e maior intenção de saída.',
    control: 'Qualificar critérios de reconhecimento, feedback e trilhas de desenvolvimento.',
  },
}

function priorityTierFromAvg(avg: number | null, isBenchmark = false): string {
  if (isBenchmark) return 'P4: Benchmark'
  // Sem dado não é criticidade máxima — a sentinela numérica anterior invertia de sentido
  // no protocolo HSE (onde valores altos são os piores).
  if (avg === null) return 'P3: Moderada'
  if (isHighRisk(avg)) return 'P1: Crítica'
  if (isAtLeastModerateRisk(avg)) return 'P2: Alta'
  return 'P3: Moderada'
}

function addActionPlanExecutiveMatrixConsolidatedSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Matriz consolidada', data.clientName, `${sNum} | PLANO DE AÇÃO`)
  const hseContext = getPlanHseContext(data)
  const validGroups = hseContext.rows.filter((r) => r.answered >= 5)

  const rows: string[][] = [...data.domainAvgs]
    .filter((d) => DOMAIN_RISK_INSIGHTS[d.domain])
    .sort(byMostCritical)
    .map((d) => {
      const insight = DOMAIN_RISK_INSIGHTS[d.domain]
      const groups = validGroups
        .filter((r) => { const v = r.domainAvgs[d.domain]; return v !== null && v !== undefined && isAtLeastModerateRisk(v) })
        .sort((a, b) => (a.domainAvgs[d.domain] ?? 99) - (b.domainAvgs[d.domain] ?? 99))
        .slice(0, 3)
        .map((r) => r.name)

      return [
        d.domain,
        insight.evidence,
        groups.length > 0 ? groups.join(', ') : `Nenhuma ${hseContext.label.toLowerCase()} com N ≥ 5 abaixo do limiar de atenção`,
        insight.consequence,
        insight.control,
        priorityTierFromAvg(d.avg),
      ]
    })

  drawActionPlanMatrixTable(slide, {
    x: MX,
    y: cY + 0.02,
    w: CW,
    h: cH - 0.04,
    headers: [
      'Perigo ou fator psicossocial',
      'Evidências identificadas',
      `${hseContext.label} prioritárias`,
      'Possíveis consequências',
      'Controles recomendados',
      'Prioridade',
    ],
    colWeights: [1.55, 2.7, 1.4, 1.9, 3.15, 1],
    rows,
    headerFontSize: 7.8,
    cellFontSize: 6.6,
    cellStyle: (_row, col, value) => {
      if (col !== 5) return { color: C.textDk }
      if (value.startsWith('P1')) return { color: C.high, bold: true, align: 'center', fontSize: 7 }
      if (value.startsWith('P2')) return { color: 'E28500', bold: true, align: 'center', fontSize: 7 }
      if (value.startsWith('P3')) return { color: C.navy, bold: true, align: 'center', fontSize: 7 }
      return { color: C.textDk, bold: true, align: 'center', fontSize: 7 }
    },
  })
}

function addActionPlanExecutiveMatrixUnitPrioritizationSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getPlanSectionNumber(data)
  const hseContext = getPlanHseContext(data)
  const { slide, cY } = mkBase(prs, `Priorização por ${hseContext.label.toLowerCase()}`, data.clientName, `${sNum} | PLANO DE AÇÃO`)

  const hseHigh = data.hseClassDist.find((d) => d.name === 'Alto risco')?.value ?? 0
  const hseMod = data.hseClassDist.find((d) => d.name === 'Risco moderado')?.value ?? 0
  const hseLow = data.hseClassDist.find((d) => d.name === 'Baixo risco')?.value ?? 0
  const hseTotal = hseHigh + hseMod + hseLow
  const criticalPct = pct1(hseHigh + hseMod, hseTotal)
  const overallLabel = riskLabel(data.hseAvg ?? 0).toLowerCase()

  const criticalDomain = [...data.domainAvgs].sort(byMostCritical)[0]
  const intro = criticalDomain
    ? `A classificação geral é de ${overallLabel} psicossocial, porém ${fmtPct(criticalPct)} dos participantes apresentam exposição moderada ou alta. O domínio ${criticalDomain.domain} concentra as principais vulnerabilidades nesta base.`
    : `A classificação geral é de ${overallLabel} psicossocial, com ${fmtPct(criticalPct)} dos participantes em exposição moderada ou alta.`

  slide.addText(intro, {
    x: MX,
    y: cY + 0.02,
    w: CW,
    h: 0.46,
    fontSize: 11,
    color: C.textDk,
    fontFace: 'Inter',
  })

  const validGroups = hseContext.rows.filter((r) => r.answered >= 5)
  const sortedGroups = [...validGroups].sort((a, b) => byMostCritical({ avg: a.hseAvg ?? 0 }, { avg: b.hseAvg ?? 0 }))
  const bestGroup = sortedGroups.length > 0 ? sortedGroups[sortedGroups.length - 1] : null
  const isBenchmarkCandidate = bestGroup !== null && bestGroup.hseAvg !== null && !isAtLeastModerateRisk(bestGroup.hseAvg)

  const tableRows: string[][] = sortedGroups.slice(0, 10).map((r) => {
    const isBenchmark = isBenchmarkCandidate && r.name === bestGroup!.name
    const topDomains = Object.entries(r.domainAvgs)
      .filter((entry): entry is [string, number] => entry[1] !== null)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2)
      .map(([domain]) => domain)

    const factors = topDomains.length > 0
      ? topDomains.map((domain) => DOMAIN_RISK_INSIGHTS[domain]?.evidence ?? domain).join(' ')
      : 'Sem domínios com dados suficientes nesta base.'

    const response = isBenchmark
      ? `Documentar práticas locais e avaliar adaptação para outras ${hseContext.label.toLowerCase()}.`
      : topDomains.length > 0
        ? topDomains.map((domain) => DOMAIN_RISK_INSIGHTS[domain]?.control).filter(Boolean).join(' ')
        : 'Monitorar evolução no próximo ciclo.'

    return [r.name, factors, priorityTierFromAvg(r.hseAvg, isBenchmark), response]
  })

  drawActionPlanMatrixTable(slide, {
    x: MX,
    y: cY + 0.58,
    w: CW,
    h: 3.88,
    headers: [hseContext.label, 'Principais fatores de risco', 'Nível de prioridade', 'Resposta recomendada'],
    colWeights: [1.2, 3.2, 1.2, 5.4],
    rows: tableRows,
    headerFontSize: 10,
    cellFontSize: 8.2,
    cellStyle: (_row, col, value) => {
      if (col !== 2) return { color: C.textDk }
      if (value.startsWith('P1')) return { color: C.high, bold: true }
      if (value.startsWith('P2')) return { color: 'E28500', bold: true }
      if (value.startsWith('P4')) return { color: C.navy, bold: true }
      return { color: C.textDk, bold: true }
    },
  })

  const criticalNames = sortedGroups.filter((r) => r.hseAvg !== null && isHighRisk(r.hseAvg)).slice(0, 3).map((r) => r.name)
  const closingParts: string[] = []
  if (criticalNames.length > 0) {
    closingParts.push(`${criticalNames.join(', ')} concentram os maiores riscos e requerem intervenção prioritária.`)
  }
  if (isBenchmarkCandidate) {
    closingParts.push(`${bestGroup!.name} pode ser estudada como referência de boas práticas.`)
  }
  const closing = closingParts.length > 0
    ? closingParts.join(' ')
    : `Nenhuma ${hseContext.label.toLowerCase()} atingiu classificação de alto risco nesta base.`

  slide.addText(closing, {
    x: MX,
    y: cY + 4.56,
    w: CW,
    h: 0.42,
    fontSize: 10.6,
    color: C.textDk,
    fontFace: 'Inter',
  })
}

function addActionPlanRiskTreatmentSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Plano de tratamento dos riscos', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  drawActionPlanMatrixTable(slide, {
    x: MX,
    y: cY + 0.04,
    w: CW,
    h: cH - 0.08,
    headers: ['Medida', 'Responsável sugerido', 'Prazo', 'Indicador de acompanhamento'],
    colWeights: [3.25, 2.3, 1.08, 4.37],
    rows: [
      [
        'Constituir governança corporativa para riscos psicossociais',
        'RH, HSE/SST e lideranças de negócio',
        '30 dias',
        'Comitê instituído e calendário definido',
      ],
      [
        'Elaborar planos locais para Porto Alegre e Cruz Alta',
        'RH local, HSE e gestores das unidades',
        '30 a 60 dias',
        'Percentual de ações iniciadas e concluídas',
      ],
      [
        'Revisar carga, prazos e capacidade de execução',
        'Operações, gestores locais e RH',
        '60 a 90 dias',
        'Horas extras, backlog, absenteísmo, percepção de carga e cumprimento de prazos',
      ],
      [
        'Implantar protocolo de comunicação e consulta em mudanças',
        'Comunicação, RH e liderança',
        '60 dias',
        'Alcance das comunicações, dúvidas respondidas e percepção de clareza',
      ],
      [
        'Estruturar prevenção e mediação de conflitos',
        'RH, lideranças e áreas de integridade',
        '60 a 90 dias',
        'Casos tratados, reincidência e percepção de cooperação',
      ],
      [
        'Mapear práticas protetivas de Vitória',
        'RH Corporativo e liderança local',
        '90 dias',
        'Práticas documentadas e unidades que iniciaram replicação',
      ],
      [
        'Reavaliar indicadores psicossociais',
        'Comitê de riscos psicossociais',
        '6 a 12 meses',
        'Variação do risco por domínio e unidade',
      ],
    ],
    headerFontSize: 11,
    cellFontSize: 8.7,
    cellStyle: (_row, col) => ({
      bold: col === 0,
      color: C.textDk,
    }),
  })
}

function addActionPlanSolutionsPortfolioSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Soluções Bee Touch para operacionalização do plano', data.clientName, `${sNum} | PLANO DE AÇÃO`)
  const hseContext = getPlanHseContext(data)
  const validGroups = hseContext.rows.filter((r) => r.answered >= 5)
  const sortedGroups = [...validGroups].sort((a, b) => byMostCritical({ avg: a.hseAvg ?? 0 }, { avg: b.hseAvg ?? 0 }))
  const criticalGroupNames = sortedGroups.filter((r) => r.hseAvg !== null && isAtLeastModerateRisk(r.hseAvg)).slice(0, 5).map((r) => r.name)
  const criticalGroupsTxt = criticalGroupNames.length > 0 ? criticalGroupNames.join(', ') : hseContext.label
  const bestGroup = sortedGroups.length > 0 ? sortedGroups[sortedGroups.length - 1] : null
  const bestGroupTxt = bestGroup && bestGroup.hseAvg !== null && !isAtLeastModerateRisk(bestGroup.hseAvg) ? bestGroup.name : `as ${hseContext.label.toLowerCase()} com melhor desempenho`

  slide.addText(
    'As soluções abaixo apoiam a transformação do diagnóstico em governança, planos locais, desenvolvimento de lideranças, cuidado e monitoramento contínuo. A tecnologia organiza evidências e acompanha a eficácia das medidas, sem substituir a revisão das condições e dos processos de trabalho.',
    {
      x: MX,
      y: cY + 0.02,
      w: CW,
      h: 0.48,
      fontSize: 11,
      color: C.textDk,
      fontFace: 'Inter',
    },
  )

  drawActionPlanMatrixTable(slide, {
    x: MX,
    y: cY + 0.56,
    w: CW,
    h: cH - 0.6,
    headers: ['Solução Bee Touch', 'Finalidade', 'Aplicação recomendada', 'Público/escopo', 'Cadência sugerida'],
    colWeights: [1.95, 1.95, 1.95, 1.95, 1.95],
    rows: [
      [
        'AVAX Map',
        'Governança e gestão do inventário',
        'Consolidar fatores prioritários, unidades, responsáveis, prazos, indicadores e evidências de eficácia no ciclo do GRO/PGR.',
        'Corporativo e unidades P1/P2',
        'Implantação e revisão mensal',
      ],
      [
        'AVAX Deep',
        'Aprofundamento qualitativo',
        'Realizar escutas complementares e análises locais sobre carga, conflitos, comunicação, exigências emocionais e interfaces de trabalho.',
        criticalGroupsTxt,
        'Primeiros 30 a 90 dias',
      ],
      [
        'AVAX Pulse',
        'Monitoramento de curto ciclo',
        'Acompanhar percepção de carga, clareza, suporte, comunicação de mudanças, cooperação e recuperação após as intervenções.',
        'Unidades prioritárias e grupos expostos',
        'Mensal nas P1; trimestral nas P2/P3',
      ],
      [
        'AVAX Learn',
        'Desenvolvimento de lideranças',
        'Trilhas práticas para gestão de demandas, comunicação em mudanças, feedback, reconhecimento, prevenção de conflitos e encaminhamento responsável.',
        'Lideranças, HR BPs, HSE/SST e gestores locais',
        'Ciclos de 60 a 90 dias',
      ],
      [
        'AVAX Mind',
        'Acolhimento e assistência',
        'Disponibilizar escuta psicológica, orientação e encaminhamento confidencial aos trabalhadores(as), articulados aos fluxos internos de saúde.',
        'Grupos vulneráveis e demanda espontânea',
        'Acesso contínuo',
      ],
      [
        'AVAX Bench',
        'Benchmark e disseminação',
        `Comparar evolução entre ${hseContext.label.toLowerCase()}, identificar controles protetivos e apoiar a adaptação das práticas positivas observadas em ${bestGroupTxt}.`,
        'Corporativo e todas as unidades',
        'Semestral ou anual',
      ],
      [
        'Lúmen / AVAX Psi',
        'Inteligência e workspace de gestão',
        'Apoiar leitura dos dados, registrar decisões, acompanhar pendências e gerar sínteses executivas para comitês e lideranças.',
        'Comitê de riscos psicossociais e áreas responsáveis',
        'Acompanhamento contínuo',
      ],
    ],
    headerFontSize: 9.6,
    cellFontSize: 7.7,
    cellStyle: (_row, col) => ({
      bold: col === 0,
      color: col === 0 ? C.navy : C.textDk,
    }),
  })
}

function addActionPlanSolutionsOrchestrationSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Orquestração recomendada por nível de prioridade', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  drawActionPlanMatrixTable(slide, {
    x: MX,
    y: cY + 0.08,
    w: CW,
    h: 2.9,
    headers: ['Prioridade', 'Combinação de soluções', 'Uso no plano'],
    colWeights: [1.9, 1.9, 1.9],
    rows: [
      [
        'P1: Crítica',
        'AVAX Map + AVAX Deep + AVAX Pulse + AVAX Mind',
        'Plano local imediato, aprofundamento qualitativo, acompanhamento mensal e assistência disponível.',
      ],
      [
        'P2: Alta',
        'AVAX Map + AVAX Deep + AVAX Learn + AVAX Pulse',
        'Plano em até 90 dias, atuação sobre controles organizacionais e monitoramento trimestral.',
      ],
      [
        'P3: Moderada',
        'AVAX Map + AVAX Pulse + AVAX Learn',
        'Ação preventiva, qualificação gerencial e verificação trimestral dos indicadores.',
      ],
      [
        'P4: Manutenção/benchmark',
        'AVAX Bench + AVAX Learn',
        'Documentar controles protetivos, compartilhar práticas e acompanhar sua adaptação.',
      ],
    ],
    headerFontSize: 11,
    cellFontSize: 9,
    cellStyle: (_row, col) => ({
      bold: col === 0,
      color: C.textDk,
    }),
  })

  drawRoundedCard(slide, MX, cY + 3.16, CW, cH - 3.22, { fill: 'F8FBFE', borderColor: C.border, radius: 0.06 })
  slide.addText(
    'Recomendação executiva: iniciar pelas unidades P1 com AVAX Deep para detalhamento dos fatores e AVAX Pulse para acompanhamento mensal; em paralelo, estruturar no AVAX Map a governança corporativa, os planos locais e os indicadores de eficácia. As trilhas AVAX Learn e o suporte AVAX Mind devem ser ativados conforme o público e a natureza de cada medida.',
    {
      x: MX + 0.14,
      y: cY + 3.3,
      w: CW - 0.28,
      h: cH - 3.5,
      fontSize: 11.8,
      italic: true,
      color: C.textDk,
      fontFace: 'Inter',
    },
  )
}

function addActionPlanConclusionPgrSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getPlanSectionNumber(data)
  const { slide, cY } = mkBase(prs, 'Conclusão para o PGR', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  slide.addText(
    `A matriz indica que a prioridade de ${data.clientName} deve estar no controle dos fatores relacionados à organização do trabalho, sobretudo carga, viabilidade das demandas, conteúdo das atividades, comunicação de mudanças e suporte social. A assistência psicológica deve permanecer disponível, porém não substitui a revisão das condições e dos processos que produzem ou ampliam a exposição.`,
    {
      x: MX,
      y: cY + 0.24,
      w: CW,
      h: 1.15,
      fontSize: 15,
      color: C.textDk,
      fontFace: 'Inter',
      valign: 'top',
    },
  )

  slide.addText(
    'Recomenda-se registrar os fatores prioritários no Inventário de Riscos do PGR, com medidas de prevenção, responsáveis, prazos, indicadores, critérios de eficácia e participação dos trabalhadores(as). A revisão mensal do mapa de riscos pelas lideranças e pelos HR BPs é recomendada para as unidades prioritárias.',
    {
      x: MX,
      y: cY + 1.8,
      w: CW,
      h: 1.15,
      fontSize: 15,
      color: C.textDk,
      fontFace: 'Inter',
      valign: 'top',
    },
  )
}

// Roadmap fixo em número de etapas/prazos (metodologia GRO/NR-1), mas com a justificativa das
// etapas 1 e 5 calculada a partir de data.domainAvgs e das correlações associativas — mesmos
// domínios "fracos" e mesmos subdomínios líderes já usados na Síntese Executiva da seção de
// Classificação de Riscos, para manter o relatório coerente entre seções.
type RoadmapPriority = 'Alta' | 'Média' | 'Contínua'

function roadmapPriorityPalette(priority: RoadmapPriority): { accent: string; bg: string; fg: string } {
  if (priority === 'Alta') return { accent: C.high, bg: C.highLt, fg: 'B3262A' }
  if (priority === 'Média') return { accent: 'EA8A00', bg: C.modLt, fg: 'A15E00' }
  return { accent: C.blue, bg: 'DCEAFB', fg: C.blue }
}

// Janelas do ciclo anual exigido pela NR-1. O plano precisa se distribuir ao longo dos 12 meses,
// e não se concentrar no início — daí o roadmap trabalhar com ondas, não com prazos livres.
type RoadmapWave = 1 | 2 | 3 | 4

const ROADMAP_WAVE_LABEL: Record<RoadmapWave, string> = {
  1: '0–3 meses',
  2: '3–6 meses',
  3: '6–9 meses',
  4: '9–12 meses',
}

// Roadmap no formato do modelo BeeTouch: prioridade + prazo + objetivo + justificativa + ações +
// amarração com as soluções AVAX.
//
// PRIORIDADE e PRAZO são deliberadamente desacoplados. A prioridade é o sinal de gravidade e vem
// dos dados desta base (domínios críticos, dispersão entre estratos, correlações, saúde mental).
// O prazo vem do SEQUENCIAMENTO: cada etapa tem uma janela permitida [minWave, maxWave] e uma
// lista de pré-requisitos (`after`). A prioridade só antecipa a etapa dentro da janela dela —
// nunca à frente de algo de que ela dependa. Sem isso, uma base com tudo crítico jogaria as sete
// etapas para 0–6 meses, o que quebra as dependências reais (ex.: capacitar liderança "com base
// nos dados" antes de a investigação qualitativa ter produzido esses dados) e desrespeita a
// organização ao longo de um ano prevista na NR-1.
function addActionPlanExtendedRoadmapSlide(prs: PptxGenJS, data: ReportPayload) { // NOSONAR
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Roadmap Estratégico — Plano de Ação Integrado', data.clientName, `${sNum} | PLANO DE AÇÃO`)
  const hseContext = getPlanHseContext(data)
  const stratumLower = hseContext.label.toLowerCase()

  const sortedDomains = [...data.domainAvgs].sort(byMostCritical)
  const weakDomains = sortedDomains.slice(0, 3).map((d) => d.domain)
  const weakDomainsList = weakDomains.length > 0 ? joinNaturalList(weakDomains) : 'os domínios com maior criticidade do diagnóstico'
  const worstDomainAvg = sortedDomains[0]?.avg ?? null
  const hasHighRiskDomain = worstDomainAvg !== null && isHighRisk(worstDomainAvg)

  const subdomainRows = data.associativeSubdomainCorrelations ?? []
  const generalOutcome = (data.associativeOutcomes ?? ['Saúde Mental (Geral)'])[0] ?? 'Saúde Mental (Geral)'
  const topSubdomains = topCorrelationsForOutcome(subdomainRows, generalOutcome, 3).map((s) => s.name.toLowerCase())
  const topSubdomainsList = topSubdomains.length > 0 ? joinNaturalList(topSubdomains) : 'organização do trabalho, carga e reconhecimento'

  // Dispersão entre estratos — sustenta a etapa de priorização por grupo exposto.
  const validStrata = hseContext.rows.filter((r) => r.answered >= 5)
  const criticalStrata = validStrata.filter((r) => r.hseAvg !== null && isAtLeastModerateRisk(r.hseAvg))
  const criticalStrataNames = [...criticalStrata]
    .sort((a, b) => byMostCritical({ avg: a.hseAvg ?? 0 }, { avg: b.hseAvg ?? 0 }))
    .slice(0, 3)
    .map((r) => r.name)
  const strataSpreadTxt = validStrata.length > 1
    ? `A estratificação por ${stratumLower} mostra ${criticalStrata.length} de ${validStrata.length} grupos abaixo do limiar de atenção${criticalStrataNames.length > 0 ? ` (ex.: ${joinNaturalList(criticalStrataNames)})` : ''}, orientando a priorização dos recursos.`
    : `A estratificação por ${stratumLower} orienta a priorização dos recursos entre os grupos avaliados.`

  const liderancaAvg = data.domainAvgs.find((d) => d.domain === 'Liderança')?.avg ?? null
  const liderancaCritica = liderancaAvg !== null && isAtLeastModerateRisk(liderancaAvg)

  // Saúde mental — escala a etapa de promoção/cuidado quando há sinais relevantes na base.
  const wellbeingTotal = (data.suicideRiskDist ?? []).reduce((sum, item) => sum + item.value, 0)
  const severeStressPct = pct1(data.stressDist?.find((i) => i.name === 'Sintomas Graves')?.value ?? 0, wellbeingTotal)
  const depressiveAlertPct = pct1(
    (data.depressionDist ?? []).filter((i) => i.name === 'Sintomas Moderados' || i.name === 'Sintomas Graves').reduce((s, i) => s + i.value, 0),
    wellbeingTotal,
  )
  const suicideRiskPct = pct1(data.suicideRiskDist?.find((i) => i.name === 'Com risco')?.value ?? 0, wellbeingTotal)
  const mentalAlert = wellbeingTotal > 0 && (severeStressPct >= 10 || depressiveAlertPct >= 20 || suicideRiskPct >= 5)
  const mentalStatTxt = wellbeingTotal > 0
    ? ` Nesta base, ${fmtPct(depressiveAlertPct)} apresentam sintomas depressivos e ${fmtPct(suicideRiskPct)} sinalizam risco de suicídio.`
    : ''

  type RoadmapItem = {
    id: string
    order: number
    priority: RoadmapPriority
    /** Janela permitida no ciclo de 12 meses; a prioridade só desloca a etapa dentro dela. */
    minWave: RoadmapWave
    maxWave: RoadmapWave
    /** Etapas que precisam estar concluídas antes desta (empurram a onda para frente). */
    after: string[]
    objetivo: string
    justificativa: string
    acoes: string[]
    solucoes: { tool: string; desc: string }[]
  }

  const items: RoadmapItem[] = [
    {
      id: 'governanca',
      order: 1,
      priority: 'Alta',
      minWave: 1,
      maxWave: 1,
      after: [],
      objetivo: 'Institucionalizar a governança do gerenciamento dos riscos psicossociais',
      justificativa: `O diagnóstico identificou ${weakDomainsList} como fatores prioritários. A primeira etapa é estruturar a governança para coordenar a implementação das medidas preventivas.`,
      acoes: ['Instituir Comitê Gestor', 'Integrar resultados ao PGR', 'Definir indicadores', 'Designar responsáveis'],
      solucoes: [
        { tool: 'AVAX Bench', desc: 'avalia a maturidade da gestão e identifica lacunas.' },
        { tool: 'AVAX Map', desc: `linha de base, indicadores e estratificação por ${stratumLower}.` },
      ],
    },
    {
      id: 'priorizacao',
      order: 2,
      priority: criticalStrata.length > 0 ? 'Alta' : 'Média',
      // Usa o diagnóstico que já existe, então pode correr em paralelo à governança.
      minWave: 1,
      maxWave: 2,
      after: [],
      objetivo: 'Priorizar intervenções nos grupos mais expostos',
      justificativa: strataSpreadTxt,
      acoes: [`Priorizar ${stratumLower} críticos`, 'Elaborar planos locais', 'Definir indicadores específicos'],
      solucoes: [
        { tool: 'AVAX Map', desc: 'identifica grupos prioritários e direciona as intervenções.' },
      ],
    },
    {
      id: 'investigacao',
      order: 3,
      priority: hasHighRiskDomain ? 'Alta' : 'Média',
      minWave: 2,
      maxWave: 3,
      after: ['governanca'],
      objetivo: 'Investigar causas organizacionais dos fatores críticos',
      justificativa: `O diagnóstico quantitativo indica onde estão os riscos; a investigação qualitativa identifica as causas-raiz${weakDomains.length > 0 ? `, sobretudo em ${weakDomains[0]}` : ''}.`,
      acoes: ['Entrevistas e grupos focais', 'Oficinas participativas', 'Análise de processos', 'Identificação de causas-raiz'],
      solucoes: [
        { tool: 'AVAX Deep', desc: 'conduz investigações qualitativas e produz evidências para intervenções específicas.' },
      ],
    },
    {
      id: 'melhorias',
      order: 4,
      priority: hasHighRiskDomain ? 'Alta' : 'Média',
      // Redesenhar processos exige as causas-raiz já mapeadas pela investigação.
      minWave: 3,
      maxWave: 4,
      after: ['investigacao'],
      objetivo: 'Implementar melhorias na organização do trabalho',
      justificativa: `Os principais fatores críticos relacionam-se a ${topSubdomainsList}.`,
      acoes: ['Revisar processos', 'Redistribuir demandas', 'Melhorar comunicação', 'Ampliar autonomia', 'Revisar reconhecimento'],
      solucoes: [
        { tool: 'AVAX Deep', desc: 'subsidia o redesenho dos processos.' },
        { tool: 'AVAX Learn', desc: 'apoia a implementação por meio de capacitações.' },
      ],
    },
    {
      id: 'liderancas',
      order: 5,
      priority: liderancaCritica ? 'Alta' : 'Média',
      // Capacitação personalizada só faz sentido depois que a investigação produz os dados, e
      // seu objetivo é sustentar as mudanças já em implementação — por isso encadeia também
      // após `melhorias`. É esse encadeamento que mantém a última janela (9–12m) ocupada mesmo
      // quando todas as etapas escalam para prioridade Alta.
      minWave: 3,
      maxWave: 4,
      after: ['investigacao', 'melhorias'],
      objetivo: 'Desenvolver competências das lideranças',
      justificativa: `A sustentabilidade das mudanças depende da atuação das lideranças${liderancaAvg !== null ? ` (índice atual ${liderancaAvg.toFixed(2).replace('.', ',')} — ${riskLabel(liderancaAvg).toLowerCase()})` : ''}.`,
      acoes: ['Capacitação em liderança saudável', 'Feedback e comunicação', 'Gestão de conflitos', 'Gestão das mudanças'],
      solucoes: [
        { tool: 'AVAX Learn', desc: 'trilhas formativas personalizadas.' },
        { tool: 'AVAX Pulse', desc: 'monitora indicadores relacionados à liderança.' },
      ],
    },
    {
      id: 'saudeMental',
      order: 6,
      priority: mentalAlert ? 'Alta' : 'Média',
      // Acolhimento/assistência não depende do aprofundamento qualitativo — pode começar cedo.
      minWave: 2,
      maxWave: 3,
      after: [],
      objetivo: 'Fortalecer ações permanentes de promoção da saúde mental',
      justificativa: `As ações organizacionais devem ser complementadas por estratégias permanentes de promoção da saúde.${mentalStatTxt}`,
      acoes: ['Campanhas educativas', 'Psicoeducação', 'Fluxos de acolhimento', 'Encaminhamento especializado'],
      solucoes: [
        { tool: 'AVAX Mind', desc: 'acolhimento e encaminhamento.' },
        { tool: 'AVAX Learn', desc: 'educação em saúde.' },
      ],
    },
    {
      id: 'monitoramento',
      order: 7,
      priority: 'Contínua',
      minWave: 1,
      maxWave: 4,
      after: [],
      objetivo: 'Monitorar a efetividade das ações e promover melhoria contínua',
      justificativa: 'O GRO pressupõe monitoramento contínuo e revisão periódica do plano.',
      acoes: ['Monitoramento trimestral', 'Revisão dos indicadores', 'Atualização do Plano de Ação', 'Reaplicação do diagnóstico'],
      solucoes: [
        { tool: 'AVAX Pulse', desc: 'monitoramento contínuo.' },
        { tool: 'AVAX Lumen', desc: 'integração dos dados e apoio à decisão.' },
      ],
    },
  ]

  // Alocação das ondas: a prioridade puxa a etapa para o início da janela dela, mas os
  // pré-requisitos empurram para frente — nenhuma etapa cai antes de algo de que dependa.
  // `items` já está em ordem topológica (as dependências apontam sempre para trás).
  const waveById = new Map<string, RoadmapWave>()
  for (const item of items) {
    let wave: number = item.priority === 'Alta' ? item.minWave : item.maxWave
    for (const depId of item.after) {
      const depWave = waveById.get(depId)
      if (depWave !== undefined) wave = Math.max(wave, depWave + 1)
    }
    waveById.set(item.id, Math.min(4, Math.max(1, wave)) as RoadmapWave)
  }

  // Passe de cobertura: a alocação acima pode deixar janelas vazias (ex.: com priorização
  // acelerada e investigação em 6–9m, a janela 3–6m fica órfã). Para cada janela vazia, puxa a
  // etapa mais próxima que possa ser antecipada — só se todos os pré-requisitos dela já
  // estiverem em janelas anteriores e se a janela de origem não ficar vazia no lugar. Garante um
  // plano distribuído nos 12 meses do ciclo, sem furos e sem violar o encadeamento.
  const scheduled = items.filter((item) => item.priority !== 'Contínua')
  for (const target of [1, 2, 3, 4] as RoadmapWave[]) {
    if (scheduled.some((item) => waveById.get(item.id) === target)) continue

    const candidate = scheduled
      .filter((item) => (waveById.get(item.id) ?? 1) > target)
      .filter((item) => item.after.every((depId) => (waveById.get(depId) ?? 1) < target))
      .filter((item) => {
        const current = waveById.get(item.id)
        return scheduled.some((other) => other.id !== item.id && waveById.get(other.id) === current)
      })
      .sort((a, b) => (waveById.get(a.id) ?? 1) - (waveById.get(b.id) ?? 1) || a.order - b.order)[0]

    if (candidate) waveById.set(candidate.id, target)
  }

  const prazoFor = (item: RoadmapItem): string => (
    item.priority === 'Contínua'
      ? 'Todo o ciclo'
      : ROADMAP_WAVE_LABEL[waveById.get(item.id) ?? item.minWave]
  )

  // Ordena cronologicamente (é um roadmap); "Contínua" fecha a tabela. A prioridade continua
  // visível na primeira coluna, mas não define mais a posição na linha do tempo.
  const sortedItems = [...items].sort((a, b) => {
    if (a.priority === 'Contínua' && b.priority !== 'Contínua') return 1
    if (b.priority === 'Contínua' && a.priority !== 'Contínua') return -1
    const waveA = waveById.get(a.id) ?? a.minWave
    const waveB = waveById.get(b.id) ?? b.minWave
    return waveA - waveB || a.order - b.order
  })

  slide.addText(
    'Sequenciado ao longo do ciclo de 12 meses previsto na NR-1, respeitando as dependências entre as etapas. A prioridade reflete a criticidade apontada pelo diagnóstico; o prazo, a ordem de execução.',
    { x: MX, y: cY + 0.02, w: CW, h: 0.18, fontSize: 8.9, color: C.textLt, italic: true, fontFace: 'Inter' },
  )

  const tableX = MX
  const tableY = cY + 0.26
  const tableW = CW
  const tableH = cH - 0.3
  const headerH = 0.4
  const rowH = (tableH - headerH) / sortedItems.length
  const colW = [0.86, 0.86, 1.95, 2.9, 2.43, tableW - 0.86 - 0.86 - 1.95 - 2.9 - 2.43]
  const colX = colW.reduce<number[]>((acc, w, i) => [...acc, i === 0 ? tableX : acc[i - 1] + colW[i - 1]], [])

  drawRoundedCard(slide, tableX, tableY, tableW, tableH, { fill: C.white, borderColor: C.border, radius: 0.05 })
  slide.addShape('roundRect', {
    x: tableX, y: tableY, w: tableW, h: headerH,
    fill: { color: C.navy }, line: { color: C.navy, width: 0 }, rectRadius: 0.05,
  })
  ;['Prioridade', 'Prazo', 'Objetivo', 'Justificativa técnica', 'Ações recomendadas', 'Como a BeeTouch apoia'].forEach((head, i) => {
    slide.addText(head, {
      x: colX[i] + 0.08, y: tableY + 0.11, w: colW[i] - 0.16, h: 0.2,
      fontSize: 8.4, bold: true, color: C.white, align: i < 2 ? 'center' : 'left', fontFace: 'Manrope',
    })
  })

  sortedItems.forEach((item, idx) => {
    const y = tableY + headerH + idx * rowH
    const pal = roadmapPriorityPalette(item.priority)

    slide.addShape('rect', {
      x: tableX, y, w: tableW, h: rowH,
      fill: { color: idx % 2 === 0 ? C.white : 'FAFCFE' }, line: { color: idx % 2 === 0 ? C.white : 'FAFCFE', width: 0 },
    })
    slide.addShape('rect', {
      x: tableX, y: y + rowH, w: tableW, h: 0.008,
      fill: { color: C.border }, line: { color: C.border, width: 0 },
    })
    slide.addShape('roundRect', {
      x: tableX, y: y + 0.05, w: 0.05, h: rowH - 0.1,
      fill: { color: pal.accent }, line: { color: pal.accent, width: 0 }, rectRadius: 0.02,
    })

    // Prioridade (pill)
    const prioW = colW[0] - 0.26
    const pillH = 0.26
    slide.addShape('roundRect', {
      x: colX[0] + 0.15, y: y + (rowH - pillH) / 2, w: prioW, h: pillH,
      fill: { color: pal.bg }, line: { color: pal.accent, width: 0.6 }, rectRadius: 0.13,
    })
    slide.addText(item.priority, {
      x: colX[0] + 0.15, y: y + (rowH - pillH) / 2, w: prioW, h: pillH,
      fontSize: 7.8, bold: true, color: pal.fg, align: 'center', valign: 'mid', fontFace: 'Manrope',
    })

    // Prazo
    slide.addText(prazoFor(item), {
      x: colX[1] + 0.04, y: y + (rowH - 0.24) / 2, w: colW[1] - 0.08, h: 0.24,
      fontSize: 8, bold: true, color: C.textDk, align: 'center', valign: 'mid', fontFace: 'Manrope',
    })

    // Objetivo
    slide.addText(item.objetivo, {
      x: colX[2] + 0.06, y: y + 0.06, w: colW[2] - 0.14, h: rowH - 0.12,
      fontSize: 8, bold: true, color: C.textDk, fontFace: 'Manrope', valign: 'top',
    })

    // Justificativa
    slide.addText(item.justificativa, {
      x: colX[3] + 0.06, y: y + 0.06, w: colW[3] - 0.14, h: rowH - 0.12,
      fontSize: 7.4, color: C.textMd, fontFace: 'Inter', valign: 'top',
    })

    // Ações (bullets)
    slide.addText(item.acoes.map((a) => `•  ${a}`).join('\n'), {
      x: colX[4] + 0.06, y: y + 0.06, w: colW[4] - 0.14, h: rowH - 0.12,
      fontSize: 7.3, color: C.textDk, fontFace: 'Inter', valign: 'top', lineSpacingMultiple: 1.05,
    })

    // Soluções BeeTouch (nome + descrição)
    slide.addText(
      item.solucoes.flatMap((s, sIdx) => ([
        { text: `${s.tool}: `, options: { bold: true, color: C.blue } },
        { text: s.desc, options: { color: C.textMd, breakLine: sIdx < item.solucoes.length - 1 } },
      ])),
      {
        x: colX[5] + 0.06, y: y + 0.06, w: colW[5] - 0.14, h: rowH - 0.12,
        fontSize: 7.2, fontFace: 'Inter', valign: 'top', lineSpacingMultiple: 1.05,
      },
    )
  })
}

// Fecha o relatório com o guia de leitura — orienta como usar os resultados sem sobreinterpretar.
// Conteúdo normativo; só o rótulo do estrato acompanha a configuração da base.
function addReportInterpretationGuideSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Como interpretar este relatório', data.clientName, `${sNum} | PLANO DE AÇÃO`)
  const stratumLower = (data.stratumLabel || 'estrato').toLowerCase()

  const cards = [
    {
      title: '1. Comece pelo panorama',
      text: 'O IRP geral resume a exposição do conjunto, mas não deve ser utilizado isoladamente. Observe também a distribuição entre baixo, moderado e alto risco.',
      color: C.blue,
    },
    {
      title: '2. Priorize os domínios',
      text: 'Valores menores indicam maior criticidade. Domínios e subdomínios ajudam a localizar as condições de trabalho que exigem intervenção.',
      color: C.high,
    },
    {
      title: '3. Leia os recortes com cautela',
      text: `Resultados por ${stratumLower} mostram heterogeneidade. Bases pequenas têm maior instabilidade e devem ser complementadas por análise qualitativa.`,
      color: C.mod,
    },
    {
      title: '4. Diferencie risco e saúde',
      text: 'Fatores psicossociais descrevem condições de trabalho. Indicadores de saúde mental mostram possíveis repercussões agregadas e não equivalem a diagnóstico.',
      color: C.low,
    },
    {
      title: '5. Converta achados em controle',
      text: 'As prioridades devem gerar ações sobre organização, gestão e relações de trabalho, com responsáveis, prazos, recursos e indicadores de acompanhamento.',
      color: C.blue,
    },
    {
      title: '6. Monitore a efetividade',
      text: 'O relatório representa um ciclo de avaliação. Reaplicações e indicadores organizacionais permitem verificar tendências e ajustar medidas.',
      color: C.low,
    },
  ]

  const colGap = 0.22
  const rowGap = 0.18
  const cardW = (CW - colGap * 2) / 3
  const calloutH = 0.6
  const gridH = cH - calloutH - 0.24
  const cardH = (gridH - rowGap) / 2

  cards.forEach((card, idx) => {
    const col = idx % 3
    const row = Math.floor(idx / 3)
    const x = MX + col * (cardW + colGap)
    const y = cY + 0.04 + row * (cardH + rowGap)

    drawRoundedCard(slide, x, y, cardW, cardH, { radius: 0.06 })
    slide.addShape('roundRect', {
      x, y, w: 0.06, h: cardH,
      fill: { color: card.color }, line: { color: card.color, width: 0 }, rectRadius: 0.06,
    })
    slide.addText(card.title, {
      x: x + 0.22, y: y + 0.18, w: cardW - 0.38, h: 0.24,
      fontSize: 12, bold: true, color: C.navy, fontFace: 'Manrope',
    })
    slide.addText(card.text, {
      x: x + 0.22, y: y + 0.5, w: cardW - 0.38, h: cardH - 0.66,
      fontSize: 9.4, color: C.textMd, fontFace: 'Inter', valign: 'top',
    })
  })

  const calloutY = cY + 0.04 + gridH + 0.2
  drawRoundedCard(slide, MX, calloutY, CW, calloutH, { fill: C.bluePale, borderColor: C.bluePale, radius: 0.06 })
  slide.addText(
    'Uso recomendado: integrar os resultados ao GRO/PGR, ao Plano de Ação e à governança de saúde e segurança, preservando anonimato e confidencialidade.',
    {
      x: MX + 0.32, y: calloutY, w: CW - 0.6, h: calloutH,
      fontSize: 10.6, bold: true, color: C.navy, fontFace: 'Manrope', valign: 'middle',
    },
  )
}

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
        owner: 'Lideranças + Gestão de Pessoas',
        deadline: urgent ? '45 dias' : '90 dias',
        description: 'Revisar metas, prazos e distribuição de atividades com foco em capacidade real das equipes.',
      },
      {
        title: 'Rito semanal de proteção de foco',
        owner: 'Gestores das especialidades prioritárias',
        deadline: urgent ? '30 dias' : '60 dias',
        description: 'Organizar backlog, reduzir interrupções e pactuar limites de urgência por especialidade.',
      },
      {
        title: 'Ajuste de dimensionamento e suporte',
        owner: 'Diretoria + RH',
        deadline: urgent ? '60 dias' : '120 dias',
        description: 'Avaliar necessidade de reforço de equipe, redistribuição de escopo e apoio transversal.',
      },
      {
        title: 'Monitoramento quinzenal de sobrecarga',
        owner: 'Gestão de Pessoas + SST',
        deadline: 'contínuo',
        description: 'Acompanhar sinais de sobrecarga e acionar plano de contingência quando necessário.',
      },
    ]
  }

  if (d.includes('controle')) {
    return [
      {
        title: 'Ampliação da autonomia operacional',
        owner: 'Lideranças + Gestão de Pessoas',
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
        owner: 'Gestão de Pessoas',
        deadline: urgent ? '90 dias' : '150 dias',
        description: 'Capacitar gestores para distribuir decisões e aumentar previsibilidade de rotina.',
      },
      {
        title: 'Indicadores de autonomia por especialidade',
        owner: 'Analytics de Pessoas + SST',
        deadline: 'contínuo',
        description: 'Medir evolução de autonomia e impacto na percepção de risco psicossocial por especialidade.',
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
        owner: 'Gestão de Pessoas',
        deadline: urgent ? '75 dias' : '120 dias',
        description: 'Treinar gestores em acolhimento, encaminhamento e gestão de conflitos.',
      },
      {
        title: 'Matriz de suporte entre especialidades',
        owner: 'Direção + Gestores',
        deadline: urgent ? '60 dias' : '120 dias',
        description: 'Formalizar apoio cruzado entre equipes para períodos de maior pressão.',
      },
      {
        title: 'Pulso mensal de percepção de apoio',
        owner: 'Gestão de Pessoas + SST',
        deadline: 'contínuo',
        description: 'Monitorar tendência por especialidade e agir rapidamente em grupos com deterioração.',
      },
    ]
  }

  if (d.includes('relacion')) {
    return [
      {
        title: 'Protocolo de prevenção de conflitos',
        owner: 'Gestão de Pessoas + Compliance',
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
        owner: 'Gestão de Pessoas',
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
      owner: 'Gestão de Pessoas + Lideranças',
      deadline: urgent ? '60 dias' : '120 dias',
      description: 'Detalhar causas-raiz e estabelecer ações corretivas por grupo prioritário.',
    },
    {
      title: 'Ajustes de processo e rotina',
      owner: 'Gestores das especialidades críticas',
      deadline: urgent ? '45 dias' : '90 dias',
      description: 'Revisar ritos de trabalho, interfaces e pontos de fricção operacional.',
    },
    {
      title: 'Capacitação orientada ao fator crítico',
      owner: 'Gestão de Pessoas',
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
  const sNum = getPlanSectionNumber(data)
  const hseContext = getPlanHseContext(data)
  const ietrContext = data.hasIetr ? getPlanIetrContext(data) : { label: hseContext.label, rows: [] as IetrStratumRow[] }

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

  const topCriticalGroups = [...hseContext.rows]
    .filter(r => r.answered >= 5 && r.hseAvg !== null)
    .sort((a, b) => byMostCritical({ avg: a.hseAvg ?? 0 }, { avg: b.hseAvg ?? 0 }))
    .slice(0, 3)
    .map(r => r.name)

  const topIetrGroups = [...ietrContext.rows]
    .filter(r => r.answered >= 5)
    .sort((a, b) => b.highPct - a.highPct)
    .slice(0, 3)
    .map(r => r.name)

  const topDomains = [...data.domainAvgs]
    .sort(byMostCritical)
    .slice(0, 4)
    .map(d => d.domain)

  const lowDomains = [...data.domainAvgs]
    .filter(d => !isAtLeastModerateRisk(d.avg))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 4)
    .map(d => d.domain)

  const focusGroups = topCriticalGroups.length > 0 ? topCriticalGroups.join(', ') : hseContext.label
  const ietrGroups = topIetrGroups.length > 0 ? topIetrGroups.join(', ') : `${hseContext.label.toLowerCase()} prioritárias`
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
    focus = data.hasIetr
      ? `Foco: trabalho remoto/IETR (${fmtPct(ietrRiskPct)}) e grupos com maior exposição combinada por ${hseContext.label.toLowerCase()}: ${focusGroups}. Prazo de execução: até 6 meses.`
      : `Foco: reduzir exposição psicossocial nas ${hseContext.label.toLowerCase()} mais críticas: ${focusGroups}. Prazo de execução: até 6 meses.`
    accent = C.mintDk
    items = [
      {
        title: data.hasIetr ? 'Diagnóstico participativo de carga e teletrabalho' : 'Diagnóstico participativo de carga e organização do trabalho',
        owner: 'Gestão de Pessoas + Lideranças das especialidades críticas',
        deadline: '30 dias',
        description: data.hasIetr
          ? `Grupos focais e entrevistas para mapear causas de sobrecarga e barreiras ao remoto em ${focusGroups}.`
          : `Grupos focais e entrevistas para mapear causas de sobrecarga, retrabalho e conflitos de prioridade em ${focusGroups}.`,
        metric: 'Aferição: >=80% das equipes críticas ouvidas; relatório com causas-raiz e plano de mitigação.',
      },
      {
        title: data.hasIetr ? 'Protocolo de uso saudável do trabalho remoto' : 'Protocolo de gestão saudável da carga e da jornada',
        owner: data.hasIetr ? 'Gestão de Pessoas + TI + Lideranças' : 'Gestão de Pessoas + Lideranças',
        deadline: '60 dias',
        description: data.hasIetr
          ? 'Definir política de desconexão, limites de reuniões, pausas, ergonomia e disponibilidade.'
          : 'Definir limites de urgência, pausas, janelas de foco e regras de priorização entre especialidades.',
        metric: data.hasIetr
          ? 'Aferição: política publicada; 100% das lideranças treinadas; check-list de adesão.'
          : 'Aferição: protocolo publicado; lideranças treinadas; check-list de adesão por especialidade.',
      },
      {
        title: 'Revisão de carga, metas e capacidade',
        owner: 'Lideranças + Comando/Gestão',
        deadline: '90 dias',
        description: `Revisar portfólio, prioridades e distribuição de demandas considerando ${highDomainsText}.`,
        metric: 'Aferição: redução dos indicadores de sobrecarga; nova leitura de Demandas em 6 meses.',
      },
      {
        title: 'Monitoramento mensal das especialidades críticas',
        owner: 'Gestão de Pessoas + Saúde Ocupacional',
        deadline: 'contínuo',
        description: `Pulse survey mensal em ${focusGroups}, com painel de indicadores e gatilhos de revisão.`,
        metric: 'Aferição: dashboard atualizado mensalmente; plano revisado se risco persistir.',
      },
    ]
    if (data.hasIetr) {
      items.push({
        title: 'Mitigação direcionada para grupos de maior risco IETR',
        owner: 'Lideranças + Gestão de Pessoas',
        deadline: '120 dias',
        description: `Ações específicas para ${ietrGroups}, priorizando funções com maior exposição no IETR.`,
        metric: 'Aferição: melhoria de índice IETR por grupo; redução da situação de risco no próximo ciclo.',
      })
    }
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
        owner: 'Lideranças + Gestão de Pessoas',
        deadline: '4 meses',
        description: 'Formação de lideranças em delegação, feedforward e gestão participativa.',
        metric: 'Aferição: percepção de controle/autonomia estável ou melhorada.',
      },
      {
        title: 'Capacitação de lideranças em saúde mental ocupacional',
        owner: 'Gestão de Pessoas',
        deadline: '4 meses',
        description: 'Workshop de sinais de sofrimento, escuta ativa e encaminhamento adequado, alinhado à ISO 45003.',
        metric: 'Aferição: 100% das lideranças das especialidades prioritárias capacitadas.',
      },
      {
        title: 'Canal de escuta e suporte psicológico acessível',
        owner: 'Gestão de Pessoas + Comando/Gestão',
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
        owner: 'Gestão de Pessoas + Lideranças',
        deadline: 'contínuo',
        description: 'Programas de reconhecimento, 1:1 regulares e práticas colaborativas entre equipes.',
        metric: 'Aferição: apoio de liderança e colegas mantido ou melhorado.',
      },
      {
        title: 'Clareza de papéis e revisão de descrições de cargos',
        owner: 'Gestão de Pessoas',
        deadline: '6 meses',
        description: 'Atualizar responsabilidades, onboarding e rituais de alinhamento entre especialidades.',
        metric: 'Aferição: 100% dos cargos críticos com descrição atualizada.',
      },
      {
        title: 'Comunicação interna sobre saúde psicossocial',
        owner: 'Comunicação + Gestão de Pessoas',
        deadline: '3 meses',
        description: 'Campanhas educativas com fatores de risco, resultados do mapeamento e canais de suporte.',
        metric: 'Aferição: alcance >=80% dos trabalhadores elegíveis.',
      },
      {
        title: 'Ciclo anual de mapeamento psicossocial',
        owner: 'BeeTouch + Gestão de Pessoas',
        deadline: 'até 12 meses',
        description: `Reaplicação do protocolo ${data.hasIetr ? 'psicossocial/IETR' : 'psicossocial'} para comparar evolução dos indicadores (alto ${fmtPct(hseHighPct)} | moderado ${fmtPct(hseModPct)}).`,
        metric: 'Aferição: taxa de resposta >=75%; relatório comparativo em até 30 dias após coleta.',
      },
      {
        title: 'Integração com ritos de gestão existentes',
        owner: 'Comando/Gestão + Gestão de Pessoas',
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
  const hseContext = getPlanHseContext(data)
  const highDomains = [...data.domainAvgs]
    .filter((d) => isHighRisk(d.avg))
    .sort(byMostCritical)
  const moderateDomains = [...data.domainAvgs]
    .filter((d) => riskLevelOf(d.avg) === 'mod')
    .sort(byMostCritical)

  const severity: DomainPlanSeverity = highDomains.length > 0 ? 'alto' : 'moderado'
  const selected = highDomains.length > 0 ? highDomains[0] : moderateDomains[0]
  if (!selected) return

  // "Recorrente" = grupo cujo domínio selecionado está pelo menos em risco moderado (quando o
  // domínio geral já é alto, restringe aos grupos igualmente em alto risco).
  const matchesSeverity = (v: number): boolean => (severity === 'alto' ? isHighRisk(v) : isAtLeastModerateRisk(v))
  const eligible = hseContext.rows.filter((r) => r.answered >= 5 && r.domainAvgs[selected.domain] !== null)
  const recurring = eligible.filter((r) => {
    const v = r.domainAvgs[selected.domain]
    return v !== null && v !== undefined && matchesSeverity(v)
  })
  const recurrencePct = pct1(recurring.length, eligible.length)
  const topGroups = [...eligible]
    .sort((a, b) => byMostCritical(
      { avg: a.domainAvgs[selected.domain] ?? 0 },
      { avg: b.domainAvgs[selected.domain] ?? 0 },
    ))
    .slice(0, 3)

  const totalWithAnswers = hseContext.rows.filter((r) => r.answered >= 5).length
  const impactedPct = pct1(recurring.length, totalWithAnswers)
  const scoreTxt = selected.avg.toFixed(2).replace('.', ',')
  const levelTxt = riskLabel(selected.avg)
  const accent = riskColor(selected.avg)
  const actions = getDomainActionTemplate(selected.domain, severity)
  const sNum = getPlanSectionNumber(data)

  const { slide, cY, cH } = mkBase(prs, `Plano Específico - Gestão de ${selected.domain}`, data.clientName, `${sNum} | PLANO DE AÇÃO`)

  const subtitle = severity === 'alto'
    ? `Domínio crítico prioritário no resultado geral, com necessidade de resposta imediata por ${hseContext.label.toLowerCase()}.`
    : `Domínio moderado com maior peso relativo nesta base, priorizado para prevenção de agravamento por ${hseContext.label.toLowerCase()}.`

  slide.addText(subtitle, {
    x: MX, y: cY + 0.02, w: CW, h: 0.18,
    fontSize: 9.6, color: C.textLt, italic: true, fontFace: 'Inter',
  })

  const kpiY = cY + 0.24
  const kpiH = 1.0
  const kpiGap = 0.16
  const kpiW = (CW - kpiGap * 3) / 4
  const kpis = [
    { value: scoreTxt, label: selected.domain, sub: 'índice atual do domínio', color: accent },
    { value: levelTxt, label: 'classificação', sub: severity === 'alto' ? 'faixa crítica' : 'faixa moderada', color: accent },
    { value: fmtPct(recurrencePct), label: 'recorrência', sub: `${recurring.length} de ${Math.max(eligible.length, 1)} grupos com N >= 5`, color: C.blue },
    { value: fmtPct(impactedPct), label: 'impacto estratificado', sub: `${hseContext.label.toLowerCase()} com exposição relevante`, color: C.mintDk },
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
    `${selected.domain} aparece como foco prioritário nesta base com índice ${scoreTxt} (${levelTxt.toLowerCase()}). A recorrência por ${hseContext.label.toLowerCase()} indica ${fmtPct(recurrencePct)} em faixa de atenção para este fator.`,
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
    const maxScore = Math.max(...topGroups.map((r) => riskSeverityPct(r.domainAvgs[selected.domain] ?? 10)), 1)
    const nameW = 1.82
    const trackX = MX + 0.22 + nameW
    const trackW = 0.92
    const scoreX = trackX + trackW + 0.12

    topGroups.forEach((r, i) => {
      const score = r.domainAvgs[selected.domain] ?? 10
      const scorePct = Math.max(0.08, riskSeverityPct(score) / maxScore)
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
        fill: { color: riskColor(score) }, line: { color: riskColor(score), width: 0 }, rectRadius: 0.05,
      })

      slide.addText(score.toFixed(2).replace('.', ','), {
        x: scoreX, y: y + 0.01, w: 0.44, h: 0.14,
        fontSize: 9.2, bold: true, color: riskColor(score), align: 'right', fontFace: 'Manrope',
      })
      slide.addText('Índice', {
        x: scoreX + 0.5, y: y + 0.02, w: 0.35, h: 0.12,
        fontSize: 7.8, color: riskColor(score), fontFace: 'Inter',
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
  const ietrContext = getPlanIetrContext(data)

  const ietrRisk = data.ietrClassDist.find((d) => d.name === 'Situação de risco')?.value ?? 0
  const ietrAtt = data.ietrClassDist.find((d) => d.name === 'Zona de atenção')?.value ?? 0
  const ietrOk = data.ietrClassDist.find((d) => d.name === 'Condição adequada')?.value ?? 0
  const ietrTotal = ietrRisk + ietrAtt + ietrOk
  if (ietrTotal === 0 || data.ietrAvg === null || data.ietrDomainAvgs.length === 0) return

  const riskPct = pct1(ietrRisk, ietrTotal)
  const attPct = pct1(ietrAtt, ietrTotal)
  const okPct = pct1(ietrOk, ietrTotal)
  const criticalDomain = [...data.ietrDomainAvgs].sort(byMostCritical)[0]
  const criticalScoreTxt = criticalDomain.avg.toFixed(2).replace('.', ',')
  const criticalLabel = ietrLabel(criticalDomain.avg).toLowerCase()
  const criticalColor = ietrColor(criticalDomain.avg)

  const topIetrGroups = [...ietrContext.rows]
    .filter((r) => r.answered >= 5)
    .sort((a, b) => b.highPct - a.highPct)
    .slice(0, 4)
    .map((r) => r.name)

  const focusTxt = topIetrGroups.length > 0
    ? topIetrGroups.join(', ')
    : `${ietrContext.label.toLowerCase()} prioritários`

  const sNum = getPlanSectionNumber(data)
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
      label: 'índice médio IETR',
      sub: ietrLabel(data.ietrAvg),
      color: 'E28500',
    },
    {
      value: fmtPct(riskPct),
      label: 'situação de risco',
      sub: `${ietrRisk} trabalhadores`,
      color: C.high,
    },
    {
      value: fmtPct(attPct),
      label: 'zona de atenção',
      sub: `${ietrAtt} trabalhadores`,
      color: C.mod,
    },
    {
      value: fmtPct(okPct),
      label: 'condição adequada',
      sub: `${ietrOk} trabalhadores`,
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
      fontSize: 8.9, color: C.textDk, fontFace: 'Inter',
    })
  })

  slide.addText(
    `Critério de eficácia: reduzir a situação de risco IETR de ${fmtPct(riskPct)} para patamar inferior a 30% e elevar a condição adequada no próximo ciclo.`,
    {
      x: MX + 0.28, y: panelY + panelH - 0.26, w: CW - 0.42, h: 0.16,
      fontSize: 10.4, bold: true, color: 'E28500', fontFace: 'Inter',
    },
  )
}

function addActionPlanFocusedGroupsSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getPlanSectionNumber(data)
  const hseContext = getPlanHseContext(data)
  const ietrContext = data.hasIetr ? getPlanIetrContext(data) : { label: hseContext.label, rows: [] as IetrStratumRow[] }

  const ietrRows = [...ietrContext.rows]
    .filter((r) => r.answered >= 5 && r.ietrAvg !== null)
    .sort((a, b) => b.highPct - a.highPct)

  const hseRows = [...hseContext.rows]
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
    if (n.includes('educ')) return data.hasIetr ? 'Diagnóstico imediato de teletrabalho, prazos e reuniões.' : 'Diagnóstico imediato de carga, prazos e reuniões.'
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
      risk: `Risco: índice IETR ${(r.ietrAvg ?? 0).toFixed(2).replace('.', ',')}; ${fmtPct(r.highPct)} em situação de risco`,
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
      risk: `Risco: índice ${(r.hseAvg ?? 0).toFixed(2).replace('.', ',')}; ${fmtPct(r.modPct)} moderado`,
      action: `Ação: ${actionHint(r.name)}`,
      color: r.hseAvg !== null ? riskColor(r.hseAvg) : 'E28500',
      score: r.hseAvg !== null ? riskSeverityPct(r.hseAvg) : 0,
    })
  })

  cards.sort((a, b) => b.score - a.score)

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

  const positiveIetr = [...ietrContext.rows]
    .filter((r) => r.answered >= 5 && r.ietrAvg !== null)
    .sort((a, b) => b.lowPct - a.lowPct)[0]

  const positiveHse = [...hseContext.rows]
    .filter((r) => r.answered >= 5 && r.hseAvg !== null)
    .sort((a, b) => byMostCritical({ avg: a.hseAvg ?? 0 }, { avg: b.hseAvg ?? 0 }))[0]

  const positiveText = data.hasIetr && positiveIetr
    ? `Referência positiva: ${positiveIetr.name} apresentou IETR índice ${(positiveIetr.ietrAvg ?? 0).toFixed(2).replace('.', ',')}. Recomenda-se documentar e disseminar práticas bem-sucedidas desta especialidade como benchmarking interno.`
    : positiveHse
      ? `Referência positiva: ${positiveHse.name} apresentou índice de risco ${(positiveHse.hseAvg ?? 0).toFixed(2).replace('.', ',')}. Recomenda-se documentar e disseminar práticas bem-sucedidas desta especialidade como benchmarking interno.`
      : 'Referência positiva: manter monitoramento de práticas de proteção e replicar rotinas com melhor desempenho.'

  const refY = cY + cH - 0.34
  drawRoundedCard(slide, MX, refY, CW, 0.3, { fill: C.white, borderColor: C.border, radius: 0.07 })
  slide.addShape('roundRect', {
    x: MX, y: refY, w: 0.06, h: 0.3,
    fill: { color: C.low }, line: { color: C.low, width: 0 }, rectRadius: 0.07,
  })
  slide.addText(positiveText, {
    x: MX + 0.28, y: refY + 0.08, w: CW - 0.42, h: 0.14,
    fontSize: 9.5, bold: true, color: '0E6E2D', fontFace: 'Inter',
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
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Cronograma Integrado - 90 / 180 / 365 dias', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  const tasks: TimelineTask[] = [
    { label: 'Diagnóstico participativo', deadline: '30 dias', lane: 'moderado' },
    { label: data.hasIetr ? 'Protocolo teletrabalho saudável' : 'Protocolo de carga e jornada saudável', deadline: '60 dias', lane: 'moderado' },
    { label: 'Redistribuição de carga/metas', deadline: '90 dias', lane: 'moderado' },
    { label: 'Monitoramento mensal especialidades críticas', deadline: 'contínuo', lane: 'moderado' },
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
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Indicadores de Acompanhamento e Governança', data.clientName, `${sNum} | PLANO DE AÇÃO`)
  const hseContext = getPlanHseContext(data)
  const ietrContext = data.hasIetr ? getPlanIetrContext(data) : { label: hseContext.label, rows: [] as IetrStratumRow[] }

  const hseHigh = data.hseClassDist.find((d) => d.name === 'Alto risco')?.value ?? 0
  const hseMod = data.hseClassDist.find((d) => d.name === 'Risco moderado')?.value ?? 0
  const hseLow = data.hseClassDist.find((d) => d.name === 'Baixo risco')?.value ?? 0
  const hseTotal = hseHigh + hseMod + hseLow
  const hseHighPct = pct1(hseHigh, hseTotal)
  const hseModPct = pct1(hseMod, hseTotal)

  const demandIndex = data.domainAvgs.find((d) => d.domain === 'Trabalho')?.avg ?? null

  const ietrRisk = data.ietrClassDist.find((d) => d.name === 'Situação de risco')?.value ?? 0
  const ietrAtt = data.ietrClassDist.find((d) => d.name === 'Zona de atenção')?.value ?? 0
  const ietrOk = data.ietrClassDist.find((d) => d.name === 'Condição adequada')?.value ?? 0
  const ietrTotal = ietrRisk + ietrAtt + ietrOk
  const ietrRiskPct = pct1(ietrRisk, ietrTotal)
  const ietrOkPct = pct1(ietrOk, ietrTotal)

  const validHseGroups = hseContext.rows.filter((r) => r.answered >= 5)
  const criticalHseGroups = validHseGroups.filter((r) => r.hseAvg !== null && isHighRisk(r.hseAvg))
  const criticalGroupPct = pct1(criticalHseGroups.length, validHseGroups.length)

  const validIetrGroups = ietrContext.rows.filter((r) => r.answered >= 5)
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
      title: 'Resultado Psicossocial',
      body: `Índice Trabalho: ${demandIndex !== null ? demandIndex.toFixed(2).replace('.', ',') : '--'}; ${fmtPct(hseModPct)} moderado geral; ${fmtPct(criticalGroupPct)} dos grupos em criticidade alta.`,
      goal: `Meta: reduzir Demandas e manter alto risco global abaixo de ${hseHighPct > 0 ? fmtPct(Math.max(0, hseHighPct - 5)) : '5,0%'}.`,
      side: 'left',
    },
    {
      title: data.hasIetr ? 'Resultado IETR' : 'Saúde Mental Complementar',
      body: data.hasIetr
        ? (ietrTotal > 0
          ? `% situação de risco: ${fmtPct(ietrRiskPct)}; índices de Demanda e Controle monitorados; distribuição por grupo com N >= 5.`
          : 'Sem base IETR suficiente nesta extração para acompanhamento consolidado por grupo.')
        : 'Acompanhamento complementar por indicadores de saúde mental e bem-estar, com estratificação por especialidade quando aplicável.',
      goal: data.hasIetr
        ? (ietrTotal > 0
          ? `Meta: reduzir risco IETR de ${fmtPct(ietrRiskPct)} para <30%.`
          : 'Meta: concluir base mínima do IETR no próximo ciclo.')
        : 'Meta: reduzir sinais de alerta em saúde mental e ampliar fatores de proteção no próximo ciclo.',
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
      body: `Horas extras, retrabalho, reuniões, carga percebida e prioridades conflitantes nas especialidades críticas.`,
      goal: data.hasIetr
        ? `Meta: redução progressiva em especialidades críticas (${fmtPct(criticalGroupPct)} psicossocial | ${fmtPct(criticalIetrPct)} IETR).`
        : `Meta: redução progressiva em especialidades críticas (${fmtPct(criticalGroupPct)} psicossocial).`,
      side: 'right',
    },
    {
      title: 'Suporte e cuidado',
      body: `Uso do canal de escuta, encaminhamentos, percepção de apoio e redução de estigma nos grupos priorizados.`,
      goal: data.hasIetr && ietrTotal > 0
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

  const rhythm = `Ritmo sugerido: reunião mensal nas especialidades críticas, revisão executiva trimestral, reavaliação ${data.hasIetr ? 'psicossocial/IETR' : 'psicossocial'} em até 12 meses e atualização do PGR sempre que houver mudança relevante.`
  const rhythmY = cY + cH - 0.32
  drawRoundedCard(slide, MX, rhythmY, CW, 0.32, { fill: C.white, borderColor: C.border, radius: 0.07 })
  slide.addShape('roundRect', {
    x: MX, y: rhythmY, w: 0.06, h: 0.32,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.07,
  })
  slide.addText(rhythm, {
    x: MX + 0.28, y: rhythmY + 0.1, w: CW - 0.42, h: 0.14,
    fontSize: 9.1, bold: true, color: C.textDk, fontFace: 'Inter',
  })
}

function addActionPlanNr1MandatoryElementsSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Elementos Obrigatórios do Plano de Ação - NR-1', data.clientName, `${sNum} | PLANO DE AÇÃO`)
  const hseContext = getPlanHseContext(data)

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

  const leaders = hseContext.rows.filter((r) => r.answered >= 5).slice(0, 3).map((r) => r.name)
  const leadersTxt = leaders.length > 0 ? leaders.join(', ') : hseContext.label

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
      body: `Designação nominal de responsáveis: Comando/Gestão, Gestão de Pessoas, lideranças de especialidade, TI, Saúde Ocupacional e Comunicação. Foco inicial: ${leadersTxt}.`,
      color: '138A93',
    },
    {
      title: 'Acompanhamento',
      body: 'Pulse surveys mensais nas especialidades críticas, dashboard de indicadores, reuniões trimestrais de revisão e registros de execução.',
      color: 'E28500',
    },
    {
      title: 'Aferição',
      body: `Métricas por ação: redução de índice/risco, adesão a treinamentos, horas extras, ergonomia, suporte e evolução ${data.hasIetr ? 'psicossocial/IETR' : 'psicossocial'}.`,
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

  const nextSteps = `Próximos passos: validar com Comando/Gestão e Gestão de Pessoas, nomear responsáveis, formalizar cronograma, iniciar diagnóstico nas especialidades prioritárias, revisar em 3 meses e reavaliar em até 12 meses${data.hasIetr ? ` (IETR risco atual: ${fmtPct(ietrRiskPct)}).` : '.'} ${hseHighPct > 0 ? `Meta do Índice de Risco: manter alto risco abaixo de ${fmtPct(Math.max(0, hseHighPct - 5))}.` : ''}`

  const footerY = cY + cH - 0.3
  drawRoundedCard(slide, MX, footerY, CW, 0.3, { fill: C.white, borderColor: C.border, radius: 0.07 })
  slide.addShape('roundRect', {
    x: MX, y: footerY, w: 0.06, h: 0.3,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.07,
  })
  slide.addText(nextSteps, {
    x: MX + 0.28, y: footerY + 0.09, w: CW - 0.42, h: 0.14,
    fontSize: 9, bold: true, color: C.blue, fontFace: 'Inter',
  })
}

/* ─── Legal / normativo ──────────────────────────────────────────────────── */
function addLegalSlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Contexto Normativo', data.clientName, '01 | CONTEXTO & MÉTODO')

  const cards: { tag: string; color: string; icon: IconType; title: string; subtitle: string; body: (string | { text: string; bold?: boolean })[] }[] = [
    {
      tag: 'NR-1', color: C.high, icon: 'clipboard',
      title: 'Norma Regulamentadora 01',
      subtitle: 'Gerenciamento de Riscos Ocupacionais — Portaria MTE n. 1.419/2024',
      body: [
        { text: 'A revisão de 2024 incluiu os ' }, { text: 'fatores psicossociais', bold: true }, { text: ' no escopo do GRO/PGR.' },
        '\n\n',
        { text: 'Torna obrigatória a elaboração de um ' }, { text: 'Plano de Ação', bold: true }, { text: ' para mitigação de riscos psicossociais a partir de maio de 2025.' },
        '\n\n',
        { text: 'Exige identificação, avaliação e controle de riscos, incluindo sobrecarga, assédio e violência no trabalho.' },
      ],
    },
    {
      tag: 'ISO 45003', color: C.navy, icon: 'shield-check',
      title: 'ISO 45003:2021',
      subtitle: 'Gestão de Riscos Psicossociais no Trabalho',
      body: [
        { text: 'Primeira ' }, { text: 'norma internacional', bold: true }, { text: ' dedicada ao gerenciamento da saúde psicológica no trabalho.' },
        '\n\n',
        { text: 'Estabelece diretrizes para identificar, avaliar e controlar riscos, orientando a participação dos trabalhadores, o suporte da liderança e o monitoramento contínuo.' },
      ],
    },
    {
      tag: 'AVAX MAP', color: C.blue2, icon: 'map',
      title: 'Protocolo Digital (AVAX Map)',
      subtitle: 'Instrumento autoaplicável para avaliação psicossocial',
      body: [
        { text: 'Protocolo digital estruturado, composto por questões sobre hábitos, saúde mental e qualidade de vida.' },
        '\n\n',
        { text: 'Algoritmos definem a estratificação com base em literatura científica (Peuker & Faller, 2021), classificados conforme a ' }, { text: 'ISO 31000', bold: true }, { text: '.' },
      ],
    },
    {
      tag: 'CAMPO', color: C.blue3, icon: 'people',
      title: 'Delineamento e Procedimentos',
      subtitle: 'Coleta transversal com janela única de aplicação',
      body: [
        { text: 'Delineamento transversal, com uma única coleta de dados, realizada entre 13 de abril e 11 de maio de 2026.' },
        '\n\n',
        { text: 'As coletas foram acompanhadas de perto por equipes previamente treinadas, favorecendo a alta adesão ao projeto.' },
      ],
    },
    {
      tag: 'LIMITAÇÕES', color: C.mod, icon: 'alert-tri',
      title: 'Limitações do Estudo',
      subtitle: 'Delineamento transversal, autorrelato e participação voluntária',
      body: [
        { text: 'Estudo transversal, baseado em respostas autorreferidas e participação voluntária. Os resultados representam a população respondente e o período avaliado, não estabelecendo, isoladamente, ' },
        { text: 'causalidade ou nexo entre trabalho e agravos à saúde', bold: true },
        { text: '.' },
      ],
    },
  ]

  const colGap = 0.2
  const cardW = (CW - colGap * (cards.length - 1)) / cards.length
  const cardY = cY + 0.04
  const cardH = cH - 0.08
  const barH = 0.08

  cards.forEach((c, i) => {
    const bx = MX + i * (cardW + colGap)
    drawRoundedCard(slide, bx, cardY, cardW, cardH, { radius: 0.07 })
    slide.addShape('roundRect', { x: bx, y: cardY, w: cardW, h: barH,
      fill: { color: c.color }, line: { color: c.color, width: 0 }, rectRadius: 0.07 })
    // Mascara o arredondamento inferior da barra de topo para ficar reta encostando no card.
    slide.addShape('rect', { x: bx, y: cardY + barH / 2, w: cardW, h: barH / 2,
      fill: { color: c.color }, line: { color: c.color, width: 0 } })

    const pad = 0.18
    const badgeY = cardY + barH + 0.14
    slide.addShape('roundRect', { x: bx + pad, y: badgeY, w: cardW - pad * 2 - 0.34, h: 0.26,
      fill: { color: C.bluePale }, line: { color: C.bluePale, width: 0 }, rectRadius: 0.13 })
    slide.addText(c.tag, {
      x: bx + pad, y: badgeY, w: cardW - pad * 2 - 0.34, h: 0.26,
      fontSize: 9, bold: true, color: c.color, align: 'center', valign: 'middle', fontFace: 'Manrope',
    })
    slide.addImage({
      data: iconDataUri(c.icon, c.color),
      x: bx + cardW - pad - 0.26, y: badgeY + 0.02, w: 0.22, h: 0.22,
    })

    let y = badgeY + 0.4
    slide.addText(c.title, {
      x: bx + pad, y, w: cardW - pad * 2, h: 0.46,
      fontSize: 12, bold: true, color: C.textDk, fontFace: 'Manrope', valign: 'top',
    })
    y += 0.46
    slide.addText(c.subtitle, {
      x: bx + pad, y, w: cardW - pad * 2, h: 0.4,
      fontSize: 8.8, color: C.textMd, italic: true, fontFace: 'Inter', valign: 'top',
    })
    y += 0.44
    slide.addShape('rect', { x: bx + pad, y, w: cardW - pad * 2, h: 0.012,
      fill: { color: C.border }, line: { color: C.border, width: 0 } })
    y += 0.12
    slide.addText(
      // Segmentos de string marcam quebra de parágrafo (breakLine) — pptxgenjs não
      // interpreta '\n' dentro de <a:t> como quebra real, precisa da opção explícita.
      c.body.map((seg) => (typeof seg === 'string' ? { text: '', options: { breakLine: true } } : { text: seg.text, options: seg.bold ? { bold: true, color: C.textDk } : undefined })),
      {
        x: bx + pad, y, w: cardW - pad * 2, h: cardY + cardH - y - 0.14,
        fontSize: 8.6, color: C.textMd, align: 'left', fontFace: 'Inter', valign: 'top',
      },
    )
  })
}

/**
 * Sumário executivo do módulo IETR — mesmo desenho do Sumário Executivo geral (cards com ícone
 * + faixa de insights), aplicado à população que respondeu o módulo remoto.
 */
function addIetrExecutiveSummarySlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasIetr) return

  // A seção de Trabalho Remoto usa o literal '05' nos demais slides — mantém o padrão.
  const { slide, cY, cH } = mkBase(prs, 'Sumário Executivo — Trabalho Remoto', data.clientName, '05 | TRABALHO REMOTO')

  const riskN = data.ietrClassDist.find((d) => d.name === 'Situação de risco')?.value ?? 0
  const attN = data.ietrClassDist.find((d) => d.name === 'Zona de atenção')?.value ?? 0
  const okN = data.ietrClassDist.find((d) => d.name === 'Condição adequada')?.value ?? 0
  const total = riskN + attN + okN

  const kpiGap = 0.20
  const kpiW = (CW - kpiGap * 3) / 4
  const kpiH = 1.82
  const kpiY = cY

  const kpis: { iconType: IconType; iconColor: string; iconBg: string; value: string; label: string }[] = [
    { iconType: 'people', iconColor: C.blue, iconBg: C.bluePale,
      value: total.toLocaleString('pt-BR'), label: 'Respondentes do módulo' },
    { iconType: 'alert-tri', iconColor: C.white, iconBg: C.high,
      value: fmtPct(pct1(riskN, total)), label: 'Situação de risco' },
    { iconType: 'alert-circle', iconColor: C.white, iconBg: C.mod,
      value: fmtPct(pct1(attN, total)), label: 'Zona de atenção' },
    { iconType: 'check-circle', iconColor: C.white, iconBg: C.low,
      value: fmtPct(pct1(okN, total)), label: 'Condição adequada' },
  ]

  kpis.forEach((k, i) => {
    const bx = MX + i * (kpiW + kpiGap)
    drawRoundedCard(slide, bx, kpiY, kpiW, kpiH)
    const iSize = 0.56
    const ix = bx + (kpiW - iSize) / 2
    const iy = kpiY + 0.22
    slide.addShape('ellipse', { x: ix, y: iy, w: iSize, h: iSize,
      fill: { color: k.iconBg }, line: { color: k.iconBg, width: 0 } })
    const ipad = 0.12
    slide.addImage({ data: iconDataUri(k.iconType, k.iconColor),
      x: ix + ipad, y: iy + ipad, w: iSize - ipad * 2, h: iSize - ipad * 2 })
    slide.addText(k.value, {
      x: bx + 0.1, y: kpiY + 0.88, w: kpiW - 0.20, h: 0.62,
      fontSize: 24, bold: true, color: C.textDk, align: 'center', fontFace: 'Manrope',
    })
    slide.addText(k.label, {
      x: bx + 0.1, y: kpiY + 1.50, w: kpiW - 0.20, h: 0.24,
      fontSize: 12, color: C.textMd, align: 'center', fontFace: 'Inter',
    })
  })

  const insLabelY = kpiY + kpiH + 0.28
  const insY = insLabelY + 0.28
  const insH = cY + cH - insY - 0.1

  slide.addText('PRINCIPAIS INSIGHTS', {
    x: MX, y: insLabelY, w: 6, h: 0.22,
    fontSize: 14, bold: true, color: C.textLt, charSpacing: 2, fontFace: 'Manrope',
  })

  const worstIetrDomain = [...data.ietrDomainAvgs].sort((a, b) => a.avg - b.avg)[0]
  const criticalGroups = [...data.ietrStratumRows]
    .filter((r) => r.answered >= 5)
    .sort((a, b) => b.highPct - a.highPct)
    .slice(0, 3)
    .map((r) => r.name)

  const insights: { iconType: IconType; color: string; bg: string; title: string; text: string }[] = []

  if (data.ietrAvg !== null) {
    insights.push({
      iconType: 'check-circle', color: C.blue, bg: C.bluePale,
      title: 'Diagnóstico do módulo',
      text: `Score médio de ${data.ietrAvg.toFixed(2).replace('.', ',')} classifica o trabalho remoto como ${ietrLabel(data.ietrAvg).toLowerCase()}. Nesta escala, valores maiores indicam condição mais adequada.`,
    })
  }

  if (worstIetrDomain) {
    insights.push({
      iconType: 'alert-tri', color: C.high, bg: C.highLt,
      title: 'Domínio mais crítico',
      text: `"${worstIetrDomain.domain}" apresenta o menor score (${worstIetrDomain.avg.toFixed(2).replace('.', ',')}), classificado como ${ietrLabel(worstIetrDomain.avg).toLowerCase()}.`,
    })
  }

  insights.push({
    iconType: 'people', color: C.mod, bg: C.modLt,
    title: 'Grupos prioritários',
    text: criticalGroups.length > 0
      ? `${fmtPct(pct1(riskN, total))} do módulo está em situação de risco. Maior concentração em ${criticalGroups.join(', ')}.`
      : `${fmtPct(pct1(riskN, total))} do módulo está em situação de risco.`,
  })

  const insGap = 0.22
  const insW = (CW - insGap * 2) / 3

  insights.slice(0, 3).forEach((ins, i) => {
    const bx = MX + i * (insW + insGap)
    drawRoundedCard(slide, bx, insY, insW, insH)
    slide.addShape('roundRect', { x: bx, y: insY, w: 0.06, h: insH,
      fill: { color: ins.color }, line: { color: ins.color, width: 0 }, rectRadius: 0.09 })
    const iSize = 0.40
    const ix = bx + 0.2
    const iy = insY + 0.24
    slide.addShape('ellipse', { x: ix, y: iy, w: iSize, h: iSize,
      fill: { color: ins.bg }, line: { color: ins.bg, width: 0 } })
    const ipad = 0.1
    slide.addImage({ data: iconDataUri(ins.iconType, ins.color),
      x: ix + ipad, y: iy + ipad, w: iSize - ipad * 2, h: iSize - ipad * 2 })
    slide.addText(ins.title, {
      x: bx + 0.72, y: insY + 0.26, w: insW - 0.84, h: 0.3,
      fontSize: 14, bold: true, color: C.textDk, fontFace: 'Manrope',
    })
    slide.addText(ins.text, {
      x: bx + 0.18, y: insY + 0.74, w: insW - 0.3, h: insH - 0.86,
      fontSize: 11.5, color: C.textMd, fontFace: 'Inter', valign: 'top',
    })
  })
}

/** Glossário dos 7 estressores do HSE-IT. Só faz sentido no protocolo HSE. */
function addHseDimensionsSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!activeRiskProtocol.higherIsWorse) return

  const { slide, cY, cH } = mkBase(prs, 'Dimensões avaliadas pelo HSE', data.clientName, '01 | CONTEXTO & MÉTODO')

  const dimensions = [
    { name: 'Demandas', desc: 'Avalia a carga de trabalho, o ritmo, os prazos e as exigências emocionais da tarefa.', color: C.high },
    { name: 'Controle', desc: 'Mede o nível de autonomia que o trabalhador tem sobre como executa suas atividades.', color: C.mod },
    { name: 'Apoio da liderança', desc: 'Verifica o suporte, a orientação, o feedback e o reconhecimento oferecidos pela chefia direta.', color: C.blue },
    { name: 'Apoio dos colegas', desc: 'Analisa a cooperação, o clima de ajuda mútua e a relação entre os colegas de equipe.', color: C.blue2 },
    { name: 'Relacionamentos', desc: 'Identifica a ocorrência de conflitos, hostilidades, assédio e comportamentos inaceitáveis no ambiente laboral.', color: C.high },
    { name: 'Cargo', desc: 'Observa se o profissional compreende bem suas responsabilidades e o que a empresa espera dele.', color: C.low },
    { name: 'Comunicação e mudanças', desc: 'Examina como a organização comunica e gerencia as mudanças estruturais ou de rotina para os empregados.', color: C.blue3 },
  ]

  slide.addText(
    'Os sete estressores do Management Standards (Health & Safety Executive) avaliados nesta base.',
    { x: MX, y: cY + 0.04, w: CW, h: 0.2, fontSize: 9.6, color: C.textLt, italic: true, fontFace: 'Inter' },
  )

  const colGap = 0.22
  const rowGap = 0.16
  const cols = 2
  const rows = Math.ceil(dimensions.length / cols)
  const cardW = (CW - colGap) / cols
  const cardH = (cH - 0.34 - rowGap * (rows - 1)) / rows

  dimensions.forEach((dim, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const x = MX + col * (cardW + colGap)
    const y = cY + 0.34 + row * (cardH + rowGap)

    drawRoundedCard(slide, x, y, cardW, cardH, { radius: 0.06 })
    slide.addShape('roundRect', {
      x, y, w: 0.06, h: cardH,
      fill: { color: dim.color }, line: { color: dim.color, width: 0 }, rectRadius: 0.06,
    })
    slide.addText(dim.name, {
      x: x + 0.24, y: y + 0.12, w: cardW - 0.4, h: 0.22,
      fontSize: 12, bold: true, color: C.navy, fontFace: 'Manrope',
    })
    slide.addText(dim.desc, {
      x: x + 0.24, y: y + 0.38, w: cardW - 0.4, h: cardH - 0.5,
      fontSize: 9.6, color: C.textMd, fontFace: 'Inter', valign: 'top',
    })
  })
}

/**
 * Faixas do resultado final R com prioridade, prazo e ação recomendada — versão detalhada,
 * exibida na seção de Plano de Ação.
 */
function addFinalRiskRangesTableSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Faixas da Classificação de Riscos Final', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  const rows: Array<{ range: string; label: string; priority: string; prazo: string; action: string; color: string; bg: string }> = [
    { range: '0,0 – 19,9', label: 'Trivial', priority: 'Muito baixa', prazo: 'Até 12 meses',
      action: 'Manter os controles existentes e realizar monitoramento periódico.', color: C.low, bg: C.lowLt },
    { range: '20,0 – 39,9', label: 'Tolerável', priority: 'Baixa', prazo: 'Até 9 meses',
      action: 'Planejar melhorias e fortalecer medidas preventivas.', color: '8A9B2E', bg: 'F4F7E4' },
    { range: '40,0 – 74,9', label: 'Moderado', priority: 'Média', prazo: 'Até 6 meses',
      action: 'Implementar ações corretivas priorizadas e acompanhar sua efetividade.', color: 'EA8A00', bg: C.modLt },
    { range: '75,0 – 89,9', label: 'Substancial', priority: 'Alta', prazo: 'Até 3 meses',
      action: 'Implementar intervenções prioritárias, envolver a liderança e intensificar o monitoramento.', color: C.high, bg: C.highLt },
    { range: '90,0 – 100,0', label: 'Intolerável', priority: 'Crítica', prazo: 'Imediato',
      action: 'Implementar medidas corretivas imediatas, podendo incluir a suspensão da atividade até que o risco seja reduzido a um nível aceitável.', color: '9A1D22', bg: 'F3D2D3' },
  ]

  const tableX = MX
  const tableY = cY + 0.1
  const tableW = CW
  const tableH = cH - 0.16
  const headerH = 0.5
  const rowH = (tableH - headerH) / rows.length
  const colW = [1.5, 1.45, 1.2, 1.35, tableW - 1.5 - 1.45 - 1.2 - 1.35]
  const colX = colW.reduce<number[]>((acc, w, i) => [...acc, i === 0 ? tableX : acc[i - 1] + colW[i - 1]], [])

  drawRoundedCard(slide, tableX, tableY, tableW, tableH, { fill: C.white, borderColor: C.border, radius: 0.04 })
  slide.addShape('roundRect', {
    x: tableX, y: tableY, w: tableW, h: headerH,
    fill: { color: C.navy }, line: { color: C.navy, width: 0 }, rectRadius: 0.04,
  })
  ;['Faixa de R (Resultado Final)', 'Classificação', 'Prioridade', 'Prazo recomendado', 'Ações recomendadas'].forEach((head, i) => {
    slide.addText(head, {
      x: colX[i] + 0.08, y: tableY + 0.09, w: colW[i] - 0.16, h: 0.32,
      fontSize: 8.8, bold: true, color: C.white, align: i === 4 ? 'left' : 'center', valign: 'middle', fontFace: 'Manrope',
    })
  })

  rows.forEach((row, idx) => {
    const y = tableY + headerH + idx * rowH
    slide.addShape('rect', {
      x: tableX, y, w: tableW, h: rowH,
      fill: { color: idx % 2 === 0 ? C.white : 'FAFCFE' }, line: { color: idx % 2 === 0 ? C.white : 'FAFCFE', width: 0 },
    })
    slide.addShape('rect', { x: tableX, y: y + rowH, w: tableW, h: 0.006, fill: { color: C.border }, line: { color: C.border, width: 0 } })
    slide.addShape('roundRect', {
      x: tableX, y: y + 0.05, w: 0.05, h: rowH - 0.1,
      fill: { color: row.color }, line: { color: row.color, width: 0 }, rectRadius: 0.02,
    })

    slide.addText(row.range, {
      x: colX[0], y, w: colW[0], h: rowH,
      fontSize: 10, bold: true, color: C.textDk, align: 'center', valign: 'middle', fontFace: 'Manrope', margin: 0,
    })

    const pillH = 0.3
    slide.addShape('roundRect', {
      x: colX[1] + 0.12, y: y + (rowH - pillH) / 2, w: colW[1] - 0.24, h: pillH,
      fill: { color: row.bg }, line: { color: row.color, width: 0.6 }, rectRadius: 0.06,
    })
    slide.addText(row.label, {
      x: colX[1] + 0.12, y: y + (rowH - pillH) / 2, w: colW[1] - 0.24, h: pillH,
      fontSize: 9.4, bold: true, color: row.color, align: 'center', valign: 'middle', fontFace: 'Manrope', margin: 0, wrap: false,
    })

    slide.addText(row.priority, {
      x: colX[2], y, w: colW[2], h: rowH,
      fontSize: 9.4, bold: true, color: row.color, align: 'center', valign: 'middle', fontFace: 'Manrope', margin: 0, wrap: false,
    })
    slide.addText(row.prazo, {
      x: colX[3], y, w: colW[3], h: rowH,
      fontSize: 9.4, color: C.textDk, align: 'center', valign: 'middle', fontFace: 'Inter', margin: 0, wrap: false,
    })
    slide.addText(row.action, {
      x: colX[4] + 0.1, y: y + 0.06, w: colW[4] - 0.2, h: rowH - 0.12,
      fontSize: 9.2, color: C.textMd, valign: 'middle', fontFace: 'Inter', margin: 0,
    })
  })
}

// Explica a lógica dos dois indicadores sequenciais (F e R) por trás das faixas mostradas
// no slide anterior (addFinalRiskRangesTableSlide) — F mede magnitude de exposição, R
// combina F com gravidade e alcance organizacional para gerar a prioridade de intervenção.
// Específico do protocolo HSE-IT (Instituto Alana / Maria Farinha, ver activeRiskProtocol);
// não se aplica ao IRP usado por FAB/CMPC/YARA, cujas faixas seguem outra lógica de cálculo.
function addFinalRiskPriorityMethodSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!activeRiskProtocol.higherIsWorse) return

  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Método de Classificação de Riscos', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  slide.addText(
    'A classificação das prioridades é baseada em dois indicadores sequenciais. O indicador F representa a frequência ponderada da exposição ao risco, considerando a proporção de trabalhadores expostos e a criticidade relativa do domínio psicossocial avaliado.',
    {
      x: MX,
      y: cY + 0.06,
      w: CW,
      h: 0.6,
      fontSize: 11.5,
      color: C.textDk,
      fontFace: 'Inter',
    },
  )

  slide.addText(
    'O indicador R corresponde ao índice de prioridade do risco, calculado a partir da combinação do indicador F com critérios de gravidade e alcance organizacional. Dessa forma, F expressa a magnitude da exposição ao risco, enquanto R orienta a definição das prioridades de intervenção e a implementação de medidas de prevenção e controle.',
    {
      x: MX,
      y: cY + 0.68,
      w: CW,
      h: 0.86,
      fontSize: 11.5,
      color: C.textDk,
      fontFace: 'Inter',
    },
  )

  slide.addText('Legenda do método de classificação', {
    x: MX,
    y: cY + 1.62,
    w: CW,
    h: 0.28,
    fontSize: 13.5,
    bold: true,
    color: C.navy,
    fontFace: 'Manrope',
  })

  const legendItems = [
    {
      letter: 'F',
      title: 'Frequência ponderada da exposição',
      body: 'Representa a magnitude da exposição ao risco, considerando a proporção de trabalhadores expostos e a criticidade relativa do domínio psicossocial avaliado.',
      h: 1.02,
    },
    {
      letter: 'R',
      title: 'Índice de prioridade do risco',
      body: 'Representa a prioridade de intervenção, obtida pela combinação da frequência ponderada da exposição com critérios de gravidade e alcance organizacional. Valores mais elevados indicam maior prioridade para a adoção de medidas de prevenção e controle.',
      h: 1.26,
    },
  ]

  let itemY = cY + 1.96
  legendItems.forEach((item) => {
    drawRoundedCard(slide, MX, itemY, CW, item.h, { fill: 'F2F7FC', borderColor: 'DCE8F3', radius: 0.08 })

    slide.addShape('ellipse', {
      x: MX + 0.22,
      y: itemY + 0.2,
      w: 0.5,
      h: 0.5,
      fill: { color: C.navy },
      line: { color: C.navy, width: 0 },
    })
    slide.addText(item.letter, {
      x: MX + 0.22,
      y: itemY + 0.2,
      w: 0.5,
      h: 0.5,
      fontSize: 18,
      bold: true,
      color: C.white,
      align: 'center',
      valign: 'middle',
      fontFace: 'Manrope',
    })

    slide.addText(item.title, {
      x: MX + 0.9,
      y: itemY + 0.18,
      w: CW - 1.14,
      h: 0.24,
      fontSize: 13,
      bold: true,
      color: C.navy,
      fontFace: 'Manrope',
    })
    slide.addText(item.body, {
      x: MX + 0.9,
      y: itemY + 0.46,
      w: CW - 1.14,
      h: item.h - 0.56,
      fontSize: 10.6,
      color: C.textDk,
      fontFace: 'Inter',
    })

    itemY += item.h + 0.16
  })
}

function addRiskClassificationInfoSlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Índice de Risco Psicossocial e lógica do algoritmo', data.clientName, '01 | CONTEXTO & MÉTODO')

  const isHse = activeRiskProtocol.code === 'HSE'
  slide.addText(
    isHse
      ? 'O Índice HSE sintetiza a exposição psicossocial em uma escala de 0 a 4. Valores maiores indicam maior exposição.'
      : 'O IRP sintetiza a exposição psicossocial em uma escala de 0 a 10. Valores menores indicam maior exposição.',
    {
      x: MX, y: cY + 0.04, w: CW, h: 0.24,
      fontSize: 10.8, color: C.textMd, fontFace: 'Inter', valign: 'top',
    },
  )

  const blocks = isHse ? [
    {
      title: '1. Frequência percebida',
      text: 'Cada item é respondido em uma escala de frequência de 0 (Nunca) a 4 (Sempre), sobre os últimos 6 meses de trabalho.',
      color: C.blue,
    },
    {
      title: '2. Leitura de risco',
      text: 'Itens protetivos (ex.: apoio, clareza, autonomia) são invertidos (4 − resposta), de modo que valores maiores sempre indicam mais risco.',
      color: C.mod,
    },
    {
      title: '3. Score por domínio',
      text: 'O score de cada domínio é a média dos seus itens, o que evita que domínios com mais perguntas pesem artificialmente mais.',
      color: C.high,
    },
    {
      title: '4. Índice ponderado',
      text: 'O índice geral pondera os domínios: Demandas 20%; Controle, Apoio da Liderança, Relacionamentos e Comunicação e Mudanças 15% cada; Apoio dos Colegas e Cargo 10% cada.',
      color: C.low,
    },
  ] : [
    {
      title: '1. Percepção dos trabalhadores',
      text: 'As respostas expressam como as condições de trabalho são percebidas em cada domínio.',
      color: C.blue,
    },
    {
      title: '2. Composição dos domínios',
      text: 'O cálculo considera a quantidade e a natureza dos indicadores, evitando que domínios com mais itens tenham peso artificialmente maior.',
      color: C.mod,
    },
    {
      title: '3. Severidade inerente',
      text: 'Fatores com maior potencial de impacto sobre saúde, segurança e funcionamento organizacional recebem ponderação compatível com sua relevância.',
      color: C.high,
    },
    {
      title: '4. Integração ponderada',
      text: 'Os componentes são combinados em um índice sintético por domínio e em um índice geral, preservando comparabilidade e capacidade de priorização.',
      color: C.low,
    },
  ]

  const colGap = 0.2
  const colW = (CW - colGap * 3) / 4
  const topY = cY + 0.4
  const calloutH = 1.05
  const blockH = cH - 0.4 - calloutH - 0.2

  blocks.forEach((block, idx) => {
    const x = MX + idx * (colW + colGap)
    drawRoundedCard(slide, x, topY, colW, blockH, { radius: 0.06 })
    slide.addShape('roundRect', {
      x, y: topY, w: 0.06, h: blockH,
      fill: { color: block.color }, line: { color: block.color, width: 0 }, rectRadius: 0.06,
    })

    slide.addText(block.title, {
      x: x + 0.22, y: topY + 0.2, w: colW - 0.38, h: 0.42,
      fontSize: 12, bold: true, color: C.navy, fontFace: 'Manrope', valign: 'top',
    })
    slide.addText(block.text, {
      x: x + 0.22, y: topY + 0.68, w: colW - 0.38, h: blockH - 0.84,
      fontSize: 9.4, color: C.textMd, fontFace: 'Inter', valign: 'top',
    })
  })

  const calloutY = topY + blockH + 0.2
  drawRoundedCard(slide, MX, calloutY, CW, calloutH, { fill: C.bluePale, borderColor: C.bluePale, radius: 0.06 })
  slide.addShape('roundRect', {
    x: MX, y: calloutY, w: 0.06, h: calloutH,
    fill: { color: C.navy }, line: { color: C.navy, width: 0 }, rectRadius: 0.06,
  })
  slide.addText('Por que não usar uma média simples?', {
    x: MX + 0.28, y: calloutY + 0.16, w: CW - 0.5, h: 0.26,
    fontSize: 12.5, bold: true, color: C.navy, fontFace: 'Manrope',
  })
  slide.addText(
    'Uma média simples poderia diluir fatores de maior severidade ou supervalorizar domínios com maior número de perguntas. A ponderação reduz essas distorções e produz uma medida mais adequada para definir prioridades de prevenção e acompanhar a evolução dos riscos.',
    {
      x: MX + 0.28, y: calloutY + 0.46, w: CW - 0.5, h: calloutH - 0.56,
      fontSize: 10.1, color: C.textMd, fontFace: 'Inter', valign: 'top',
    },
  )
}

/* ─── Methodology ────────────────────────────────────────────────────────── */
function addMethodologySlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Método de Avaliação', data.clientName, '01 | CONTEXTO & MÉTODO')

  const gap = 0.26
  const col = (CW - gap) / 2

  const hseHigh = data.hseClassDist.find((item) => item.name === 'Alto risco')?.value ?? 0
  const hseMod = data.hseClassDist.find((item) => item.name === 'Risco moderado')?.value ?? 0
  const hseLow = data.hseClassDist.find((item) => item.name === 'Baixo risco')?.value ?? 0
  const hseTotal = hseHigh + hseMod + hseLow

  const ietrRisk = data.ietrClassDist.find((item) => item.name === 'Situação de risco')?.value ?? 0
  const ietrAtt = data.ietrClassDist.find((item) => item.name === 'Zona de atenção')?.value ?? 0
  const ietrOk = data.ietrClassDist.find((item) => item.name === 'Condição adequada')?.value ?? 0
  const ietrTotal = ietrRisk + ietrAtt + ietrOk

  const mhDist = data.mentalHealthClassDist ?? []
  const mhUnsat = mhDist.find((item) => item.name === 'Insatisfatório')?.value ?? 0
  const mhRegular = mhDist.find((item) => item.name === 'Regular')?.value ?? 0
  const mhPositive = mhDist
    .filter((item) => item.name === 'Bom' || item.name === 'Excelente')
    .reduce((sum, item) => sum + item.value, 0)
  const mhTotal = mhUnsat + mhRegular + mhPositive

  const modules = [
    {
      code: activeRiskProtocol.code,
      accent: C.blue,
      name: activeRiskProtocol.subtitle, sub: activeRiskProtocol.code === 'HSE' ? 'Health & Safety Executive' : 'Protocolo Beetouch',
      scale: activeRiskProtocol.scaleLabel,
      note:  activeRiskProtocol.scaleNote,
      thresholds: [
        { label: 'Alto risco',     range: activeRiskProtocol.highRange,     color: C.high, pct: pct1(hseHigh, hseTotal) },
        { label: 'Risco moderado', range: activeRiskProtocol.moderateRange, color: C.mod,  pct: pct1(hseMod, hseTotal) },
        { label: 'Baixo risco',    range: activeRiskProtocol.lowRange,      color: C.low,  pct: pct1(hseLow, hseTotal) },
      ],
      domains: data.hseDomains.length > 0
        ? data.hseDomains
        : ['Trabalho', 'Autonomia', 'Liderança', 'Cooperação', 'Convivência', 'Responsabilidades', 'Mudanças', 'Satisfação'],
    },
    ...(data.hasIetr
      ? [{
          code: 'IETR',
          accent: C.blue2,
          name: 'Módulo IETR', sub: 'Instrumento de Avaliação do Trabalho Remoto',
          scale: 'Escala de 1 (Nunca) a 5 (Sempre)',
          note:  'Índices baixos indicam piores condições de trabalho',
          thresholds: [
            { label: 'Situação de risco', range: '< 3,0', color: C.high, pct: pct1(ietrRisk, ietrTotal) },
            { label: 'Zona de atenção', range: '3,0 a 4,0', color: C.mod, pct: pct1(ietrAtt, ietrTotal) },
            { label: 'Condição adequada', range: '>= 4,0', color: C.low, pct: pct1(ietrOk, ietrTotal) },
          ],
          domains: data.ietrDomains.length > 0 ? data.ietrDomains : ['Demanda', 'Controle'],
        }]
      : [{
          code: 'SM',
          accent: C.blue2,
          name: 'Saúde Mental', sub: 'Leitura complementar de bem-estar',
          scale: 'Índice de 0 a 10',
          note: 'Índices maiores indicam melhor condição de saúde mental',
          thresholds: [
            { label: 'Insatisfatório', range: '< 5,0', color: C.high, pct: pct1(mhUnsat, mhTotal) },
            { label: 'Regular', range: '5,0 a 6,9', color: C.mod, pct: pct1(mhRegular, mhTotal) },
            { label: 'Bom / Excelente', range: '>= 7,0', color: C.low, pct: pct1(mhPositive, mhTotal) },
          ],
          domains: ['Estresse', 'Sintomas depressivos', 'Risco de suicídio', 'Rede de apoio'],
        }]),
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
  // stratifiedParticipation não tem o limiar mínimo de N=5 que stratumRows aplica (esse
  // limiar existe pra análise de risco, não pra contagem de participação) — por isso não
  // reaproveita stratifiedHse aqui. Sem esse campo (YARA/FAB ainda não o preenchem), cai no
  // fallback com stratumRows mesmo, só sem as categorias pequenas que já vinham excluídas.
  const slices: { stratum: string; stratumLabel: string; participationRows: ParticipationRow[] }[] =
    (data.stratifiedParticipation && data.stratifiedParticipation.length > 0)
      ? data.stratifiedParticipation
      : [{
          stratum: data.stratum,
          stratumLabel: data.stratumLabel,
          participationRows: data.stratumRows.map((r) => ({ name: r.name, total: r.total, answered: r.answered })),
        }]

  const PAGE = 12

  slices.forEach((slice) => {
    // Da categoria com mais respondentes para a com menos.
    const allRows = [...slice.participationRows].sort((a, b) => (
      b.answered - a.answered || b.total - a.total || a.name.localeCompare(b.name, 'pt-BR')
    ))
    if (allRows.length === 0) return

    const analyticallyEligible = allRows.filter((row) => row.answered >= 5).length
    const belowThreshold = allRows.length - analyticallyEligible
    const pages = Math.ceil(allRows.length / PAGE)

    for (let p = 0; p < pages; p++) {
      const { slide, cY, cH } = mkBase(
        prs,
        pages > 1
          ? `Base Respondente e Participação — ${slice.stratumLabel} (${p + 1}/${pages})`
          : `Base Respondente e Participação — ${slice.stratumLabel}`,
        data.clientName,
        participationSectionBreadcrumb(data),
      )

      const kpis = [
        { value: String(data.totalAnswered), label: 'Respostas válidas', color: C.blue, iconType: 'people' as IconType, iconBg: C.bluePale, iconColor: C.blue, caption: 'Entrevistas concluídas' },
        { value: String(allRows.length), label: `${slice.stratumLabel} mapeadas`, color: C.low, iconType: 'chart-bars' as IconType, iconBg: C.lowLt, iconColor: C.low, caption: 'Grupos observados' },
        { value: String(analyticallyEligible), label: `${slice.stratumLabel} com base analítica`, color: C.mod, iconType: 'check-circle' as IconType, iconBg: C.modLt, iconColor: C.mod, caption: 'Critério mínimo aplicado' },
        { value: fmtPct(pct1(data.totalAnswered, data.totalCollabs)), label: '% de Adesão da Unidade', color: C.blue2, iconType: 'shield-check' as IconType, iconBg: 'E8F6FD', iconColor: C.blue2, caption: `${data.totalAnswered} respondentes de ${data.totalCollabs} trabalhadores` },
      ]

      const kpiGap = 0.2
      const kpiW = (CW - kpiGap * 3) / 4
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
        slide.addText(k.caption, {
          x: bx + 0.2, y: cY + 1.18, w: kpiW - 0.38, h: 0.28,
          fontSize: 7.3, color: C.textLt, fontFace: 'Inter',
        })
      })

      const narrativeY = cY + kpiH + 0.22
      slide.addShape('roundRect', { x: MX, y: narrativeY, w: CW, h: 0.54,
        fill: { color: C.bluePale }, line: { color: C.bluePale, width: 0 }, rectRadius: 0.08 })
      slide.addText(
        belowThreshold > 0
          ? `Nesta base, a participação é apresentada por ${slice.stratumLabel.toLowerCase()}, da categoria com mais respondentes para a com menos. ${belowThreshold} categoria(s) com menos de 5 respondentes ficam fora das análises de risco por domínio, mas são listadas aqui para completude.`
          : `Nesta base, a participação é apresentada por ${slice.stratumLabel.toLowerCase()}, da categoria com mais respondentes para a com menos.`,
        {
          x: MX + 0.18, y: narrativeY + 0.1, w: CW - 0.36, h: 0.4,
          fontSize: 9.6, color: C.textMd, italic: true, fontFace: 'Inter', valign: 'top',
        },
      )

      const pageRows = allRows.slice(p * PAGE, (p + 1) * PAGE)
      slide.addText(`Base respondente por ${slice.stratumLabel}`, {
        x: MX, y: narrativeY + 0.74, w: CW, h: 0.22,
        fontSize: 9.4, bold: true, color: C.textLt, charSpacing: 1.4, fontFace: 'Manrope',
      })

      const shellY = narrativeY + 1.02
      const shellH = cY + cH - shellY - 0.04
      drawRoundedCard(slide, MX, shellY, CW, shellH)
      slide.addShape('roundRect', { x: MX, y: shellY, w: 0.07, h: shellH,
        fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09 })

      slide.addText(`Distribuição de respondentes por ${slice.stratumLabel.toLowerCase()}`, {
        x: MX + 0.22, y: shellY + 0.14, w: CW - 0.44, h: 0.22,
        fontSize: 10.4, bold: true, color: C.textDk, fontFace: 'Manrope',
      })
      slide.addText('N esperado = colaboradores cadastrados na categoria. Adesão = respondentes / N esperado. % do total = respondentes da categoria / total de respondentes deste recorte. Categorias com * têm menos de 5 respondentes e ficam fora das análises de risco por domínio.', {
        x: MX + 0.22, y: shellY + 0.37, w: CW - 0.44, h: 0.16,
        fontSize: 8.1, color: C.textLt, fontFace: 'Inter',
      })

      const tableY = shellY + 0.62
      const avail = shellH - 0.74
      const rowH = Math.min(0.28, avail / (PAGE + 1))
      const tableW = CW - 0.28

      // Base do percentual é o total de respondentes DESTE recorte (soma de todas as páginas),
      // e não o total do relatório — assim a coluna fecha em 100% dentro da própria tabela.
      const sliceAnswered = allRows.reduce((sum, r) => sum + r.answered, 0)

      const hdrOpt = { fill: { color: C.bluePale }, color: C.textDk, bold: true, fontSize: 8.2, fontFace: 'Manrope', border: { type: 'solid', color: C.border, pt: 0.3 } }
      const header = [[
        { text: slice.stratumLabel, options: { ...hdrOpt, align: 'left' } },
        { text: 'N esperado', options: { ...hdrOpt, align: 'center' } },
        { text: 'Respondentes', options: { ...hdrOpt, align: 'center' } },
        { text: 'Adesão', options: { ...hdrOpt, align: 'center' } },
        { text: '% do total', options: { ...hdrOpt, align: 'center' } },
      ]]

      const dataRows = pageRows.map((r, idx) => {
        const bg = idx % 2 === 0 ? C.white : C.smoke
        const bdr = { type: 'solid', color: C.border, pt: 0.3 }
        const belowMin = r.answered < 5
        const textColor = belowMin ? C.textLt : C.textDk
        return [
          { text: belowMin ? `${r.name} *` : r.name, options: { fill: { color: bg }, color: textColor, italic: belowMin, fontSize: 8.1, align: 'left', fontFace: 'Inter', border: bdr } },
          { text: String(r.total), options: { fill: { color: bg }, color: textColor, fontSize: 8.1, align: 'center', fontFace: 'Inter', border: bdr } },
          { text: String(r.answered), options: { fill: { color: bg }, color: textColor, fontSize: 8.1, align: 'center', fontFace: 'Inter', border: bdr } },
          { text: fmtPct(pct1(r.answered, r.total)), options: { fill: { color: bg }, color: textColor, fontSize: 8.1, align: 'center', fontFace: 'Inter', border: bdr } },
          { text: fmtPct(pct1(r.answered, sliceAnswered)), options: { fill: { color: bg }, color: textColor, fontSize: 8.1, align: 'center', fontFace: 'Inter', border: bdr } },
        ]
      })

      slide.addTable([...header, ...dataRows], {
        x: MX + 0.14, y: tableY, w: tableW, h: avail,
        colW: [tableW * 0.4, tableW * 0.15, tableW * 0.15, tableW * 0.15, tableW * 0.15],
        rowH,
        margin: 0.03,
      })
    }
  })
}

/* ─── Demographics ───────────────────────────────────────────────────────── */
function addDemographicsSlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Perfil da População', data.clientName, participationSectionBreadcrumb(data))

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

  const getTopItem = (dist: Distribution[]): { name: string; value: number; pct: number } | null => {
    const valid = dist.filter((item) => item.value > 0)
    if (valid.length === 0) return null
    const totalDist = valid.reduce((sum, item) => sum + item.value, 0)
    const top = [...valid].sort((a, b) => b.value - a.value)[0]
    return { name: top.name, value: top.value, pct: pct1(top.value, totalDist) }
  }

  const normalizeGenderNarrative = (name: string): string => {
    if (name === 'Feminino') return 'mulheres'
    if (name === 'Masculino') return 'homens'
    if (name === 'Outro') return 'pessoas de outro gênero'
    return 'pessoas'
  }

  const normalizeMaritalNarrative = (name: string): string => {
    if (name.startsWith('Casado')) return 'casados(as)'
    if (name.startsWith('Solteiro')) return 'solteiros(as)'
    return name.toLowerCase()
  }

  const normalizeRaceNarrative = (name: string): string => {
    if (name === 'Branca') return 'brancos'
    if (name === 'Preta') return 'pretos'
    if (name === 'Parda') return 'pardos'
    if (name === 'Amarela') return 'amarelos'
    if (name === 'Indígena') return 'indígenas'
    return name.toLowerCase()
  }

  const normalizeEducationNarrative = (name: string): string => {
    if (name === 'Graduação') return 'ensino superior completo'
    if (name.includes('Especialização') || name === 'Mestrado' || name === 'Doutorado' || name === 'Pós-Doutorado') {
      return 'pós-graduação'
    }
    if (name === 'Ensino Médio') return 'ensino médio'
    if (name.includes('Fundamental')) return 'ensino fundamental'
    return name.toLowerCase()
  }

  const normalizedAgeLabel = (name: string): string => {
    if (name === 'Ate 24') return 'Até 24'
    return name
  }

  const ageMidpoint: Record<string, number> = {
    'Até 24': 22,
    'Ate 24': 22,
    '18-24': 21,
    '25-34': 30,
    '35-44': 40,
    '45-54': 50,
    '55+': 60,
  }

  const estimatedAgeAverage = (() => {
    const valid = data.ageRangeDist.filter((item) => item.value > 0)
    const totalAge = valid.reduce((sum, item) => sum + item.value, 0)
    if (totalAge === 0) return null
    const weighted = valid.reduce((sum, item) => sum + (ageMidpoint[item.name] ?? 0) * item.value, 0)
    return Math.round(weighted / totalAge)
  })()

  const topGender = getTopItem(data.genderDist)
  const topAge = getTopItem(data.ageRangeDist)
  const topMarital = getTopItem(data.maritalDist)
  const topRace = getTopItem(data.raceDist)
  const topEducation = getTopItem(data.educationDist)

  const demographicSummary = `O perfil da amostra foi caracterizado predominantemente por ${normalizeGenderNarrative(topGender?.name ?? 'Não informado')} (${fmtPct(topGender?.pct ?? 0)}), concentrados na faixa etária de ${normalizedAgeLabel(topAge?.name ?? 'Não informado')} (${fmtPct(topAge?.pct ?? 0)}), ${normalizeMaritalNarrative(topMarital?.name ?? 'Não informado')} (${fmtPct(topMarital?.pct ?? 0)}), ${normalizeRaceNarrative(topRace?.name ?? 'Não informado')} (${fmtPct(topRace?.pct ?? 0)}), com ${normalizeEducationNarrative(topEducation?.name ?? 'Não informado')} (${fmtPct(topEducation?.pct ?? 0)}).`

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
        x: lx + 0.16, y: ly, w: lw - 1.0, h: 0.2,
        fontSize: 7.5, color: C.textMd, fontFace: 'Inter', margin: 0,
      })
      slide.addText(`${fmtPct(r.pct)} | N=${r.value}`, {
        x: bx + colW - 0.98, y: ly, w: 0.82, h: 0.2,
        fontSize: 7.5, bold: true, color: C.textDk, align: 'right', fontFace: 'Manrope', margin: 0,
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
      const fillW = Math.max(0.12, barW * (r.value / maxVal))
      const label = r.name.length > 24 ? r.name.slice(0, 24) + '…' : r.name
      slide.addText(label, {
        x: listX, y: yy + 0.02, w: 1.5, h: 0.22,
        fontSize: 7.2, color: C.textMd, fontFace: 'Inter', margin: 0,
      })
      slide.addShape('roundRect', { x: barX, y: yy + 0.05, w: barW, h: 0.14,
        fill: { color: 'E9F1F7' }, line: { color: 'E9F1F7', width: 0 }, rectRadius: 0.05 })
      slide.addShape('roundRect', { x: barX, y: yy + 0.05, w: fillW, h: 0.14,
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
      const chartX = bx + 0.14
      const chartY = by + 0.62
      const chartW = colW - 0.28
      const chartH = cardH - 1.12
      const totalAge = active.reduce((sum, item) => sum + item.value, 0)
      const normalizeAgeLabel = (name: string): string => name === 'Ate 24' ? 'Até 24' : name

      // showDataLabels do gráfico nativo (OOXML) não é confiável fora do PowerPoint — o Google
      // Slides costuma simplesmente não renderizar rótulo de dado em barra/coluna importada de
      // .pptx. Por isso o N vai como texto nosso mesmo (igual às legendas de rosca), não como
      // data label do chart.
      slide.addChart('bar', [{ name: 'N', labels: active.map(d => d.name), values: active.map(d => d.value) }], {
        x: chartX, y: chartY, w: chartW, h: chartH,
        barDir: 'col', barGapWidthPct: 55,
        chartColors: [C.blue],
        showTitle: false, showLegend: false,
        showDataLabels: false,
        valAxisHidden: true, catAxisHidden: true,
        valAxisMaxVal: Math.max(...active.map(d => d.value), 1) * 1.28,
      })

      const slotW = chartW / active.length
      active.forEach((item, i) => {
        slide.addText(`${normalizeAgeLabel(item.name)}\n${fmtPct(pct1(item.value, totalAge))} | N=${item.value}`, {
          x: chartX + slotW * i + 0.02, y: by + cardH - 0.36, w: slotW - 0.04, h: 0.28,
          fontSize: 6.4, color: C.textMd, align: 'center', fontFace: 'Inter', margin: 0,
        })
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
    const { bx, by } = drawCard(idx, 'SÍNTESE DO PERFIL')
    slide.addText('RESUMO DINÂMICO', {
      x: bx + 0.22, y: by + 0.62, w: colW - 0.36, h: 0.2,
      fontSize: 7.6, bold: true, color: C.textLt, charSpacing: 1.0, fontFace: 'Manrope',
    })
    slide.addText(demographicSummary, {
      x: bx + 0.22, y: by + 0.86, w: colW - 0.36, h: cardH - 1.04,
      fontSize: 8.1, color: C.textDk, fontFace: 'Inter',
    })
  }
}

// Cruzamento gênero x estrato — mesma população do card de Gênero geral (respondentes válidos),
// mesmo tratamento de "sem estrato informado" que addWorkCategoryByOm4Slide. Só populado quando
// data.genderByStratum existe (hoje, apenas nos relatórios da FAB).
function addGenderByStratumSlide(prs: PptxGenJS, data: ReportPayload) {
  const genderByStratum = data.genderByStratum
  if (!genderByStratum || genderByStratum.length === 0) return

  const stratumLabel = data.stratumLabel || 'Estrato'
  const stratumLabelUpper = stratumLabel.toUpperCase()
  const stratumLabelLower = stratumLabel.toLowerCase()

  const rows = [...genderByStratum]
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total || a.stratumValue.localeCompare(b.stratumValue, 'pt-BR'))

  if (rows.length === 0) return

  const totalBase = rows.reduce((sum, row) => sum + row.total, 0)
  const totalMasculino = rows.reduce((sum, row) => sum + row.masculino, 0)
  const totalFeminino = rows.reduce((sum, row) => sum + row.feminino, 0)
  const totalOutro = rows.reduce((sum, row) => sum + row.outro, 0)

  const genderColors = { masculino: C.blue, feminino: 'EC4899', outro: '8B5CF6' }
  const PAGE = 10
  const pages = Math.ceil(rows.length / PAGE)

  for (let p = 0; p < pages; p++) {
    const pageRows = rows.slice(p * PAGE, (p + 1) * PAGE)
    const suffix = pages > 1 ? ` (${p + 1}/${pages})` : ''
    const { slide, cY, cH } = mkBase(
      prs,
      `Gênero por ${stratumLabel}${suffix}`,
      data.clientName,
      participationSectionBreadcrumb(data),
    )

    slide.addText(
      `Leitura por ${stratumLabelLower}: distribuição dos respondentes entre Masculino, Feminino e Outro.`,
      { x: MX, y: cY + 0.06, w: CW, h: 0.2, fontSize: 9.1, color: C.textLt, italic: true, fontFace: 'Inter' },
    )

    const cardGap = 0.18
    const cardY = cY + 0.34
    const cardH = 0.78
    const cardW = (CW - cardGap * 3) / 4
    const cards = [
      { title: 'Respondentes', value: totalBase, pct: 100, accent: C.navy },
      { title: 'Masculino', value: totalMasculino, pct: pct1(totalMasculino, totalBase), accent: genderColors.masculino },
      { title: 'Feminino', value: totalFeminino, pct: pct1(totalFeminino, totalBase), accent: genderColors.feminino },
      { title: 'Outro', value: totalOutro, pct: pct1(totalOutro, totalBase), accent: genderColors.outro },
    ]

    cards.forEach((card, idx) => {
      const x = MX + idx * (cardW + cardGap)
      drawRoundedCard(slide, x, cardY, cardW, cardH)
      slide.addShape('roundRect', {
        x, y: cardY, w: 0.07, h: cardH,
        fill: { color: card.accent }, line: { color: card.accent, width: 0 }, rectRadius: 0.09,
      })
      slide.addText(card.title.toUpperCase(), {
        x: x + 0.18, y: cardY + 0.12, w: cardW - 0.28, h: 0.14,
        fontSize: 7.4, bold: true, color: C.textLt, charSpacing: 0.9, fontFace: 'Manrope',
      })
      slide.addText(String(card.value), {
        x: x + 0.18, y: cardY + 0.28, w: cardW - 0.28, h: 0.24,
        fontSize: 18, bold: true, color: C.textDk, fontFace: 'Manrope',
      })
      slide.addText(idx === 0 ? 'base total da leitura' : fmtPct(card.pct), {
        x: x + 0.18, y: cardY + 0.54, w: cardW - 0.28, h: 0.12,
        fontSize: 7.6, color: card.accent, bold: true, fontFace: 'Inter',
      })
    })

    const tableY = cardY + cardH + 0.14
    const tableH = cH - (tableY - cY) - 0.3
    const headerH = 0.62
    const legendH = 0.3
    const tableX = MX + 0.12
    const tableInnerW = CW - 0.3
    const bodyH = tableH - headerH - legendH - 0.08
    const nameW = 2.5
    const baseW = 0.72
    const categoryW = (tableInnerW - nameW - baseW) / 3
    const rowH = Math.min(0.38, bodyH / Math.max(pageRows.length, 1))

    drawRoundedCard(slide, MX, tableY, CW, tableH)
    slide.addShape('roundRect', {
      x: MX, y: tableY, w: 0.07, h: tableH,
      fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09,
    })
    slide.addShape('roundRect', {
      x: MX + 0.12, y: tableY + 0.1, w: CW - 0.24, h: headerH,
      fill: { color: 'F6F9FC' }, line: { color: 'F6F9FC', width: 0 }, rectRadius: 0.05,
    })

    slide.addText(stratumLabelUpper, {
      x: tableX + 0.12, y: tableY + 0.31, w: nameW - 0.2, h: 0.14,
      fontSize: 7.8, bold: true, color: C.textMd, fontFace: 'Manrope',
    })
    slide.addText('BASE', {
      x: tableX + nameW, y: tableY + 0.31, w: baseW, h: 0.14,
      fontSize: 7.8, bold: true, color: C.textMd, align: 'center', fontFace: 'Manrope',
    })

    const genderColumns = [
      { key: 'masculino' as const, label: 'Masculino', offset: 0 },
      { key: 'feminino' as const, label: 'Feminino', offset: 1 },
      { key: 'outro' as const, label: 'Outro', offset: 2 },
    ]

    genderColumns.forEach((column) => {
      const x = tableX + nameW + baseW + column.offset * categoryW
      slide.addText(column.label, {
        x: x + 0.04, y: tableY + 0.31, w: categoryW - 0.08, h: 0.14,
        fontSize: 7.3, bold: true, color: C.textMd, align: 'center', fontFace: 'Manrope',
      })
      slide.addShape('line', {
        x, y: tableY + 0.12, w: 0, h: headerH + bodyH,
        line: { color: 'EDF2F7', pt: 0.7 },
      })
    })

    pageRows.forEach((row, idx) => {
      const ry = tableY + headerH + idx * rowH
      const rowBg = idx % 2 === 0 ? C.white : 'FAFCFE'

      slide.addShape('rect', {
        x: tableX, y: ry, w: tableInnerW, h: rowH,
        fill: { color: rowBg }, line: { color: rowBg, width: 0 },
      })

      slide.addText(row.stratumValue, {
        x: tableX + 0.12, y: ry + 0.04, w: nameW - 0.22, h: 0.17,
        fontSize: 7.4, bold: true, color: C.textDk, fontFace: 'Inter', valign: 'top', margin: 0, wrap: false,
      })
      slide.addText(`(N = ${row.total})`, {
        x: tableX + 0.12, y: ry + 0.22, w: nameW - 0.22, h: 0.12,
        fontSize: 6.6, bold: true, color: C.textLt, fontFace: 'Inter', valign: 'top', margin: 0,
      })

      slide.addText(String(row.total), {
        x: tableX + nameW, y: ry + (rowH - 0.16) / 2, w: baseW, h: 0.16,
        fontSize: 7.8, bold: true, color: C.textDk, align: 'center', fontFace: 'Manrope', margin: 0,
      })

      genderColumns.forEach((column, colIdx) => {
        const cx = tableX + nameW + baseW + colIdx * categoryW
        const count = row[column.key]
        const intensity = row.total > 0 ? (count / row.total) * 100 : 0
        const fill = intensity <= 0 ? 'F2F5FA' : mixHexColor('FFFFFF', genderColors[column.key], Math.min(1, intensity / 100))
        const textColor = intensity >= 65 ? C.white : C.textDk

        slide.addShape('roundRect', {
          x: cx + 0.05, y: ry + 0.045, w: categoryW - 0.1, h: rowH - 0.09,
          fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.04,
        })
        slide.addText(`${count}\n${fmtPct(pct1(count, row.total))}`, {
          x: cx + 0.05, y: ry + 0.035, w: categoryW - 0.1, h: rowH - 0.07,
          align: 'center', valign: 'mid', fontSize: 7.1, bold: true, color: textColor, fontFace: 'Manrope', margin: 0,
        })
      })

      slide.addShape('line', {
        x: tableX, y: ry + rowH, w: tableInnerW, h: 0,
        line: { color: 'EEF3F8', pt: 0.7 },
      })
    })

    const legendY = tableY + headerH + bodyH + 0.08
    const legendItems = [
      { label: 'Masculino', color: genderColors.masculino },
      { label: 'Feminino', color: genderColors.feminino },
      { label: 'Outro', color: genderColors.outro },
    ]
    legendItems.forEach((item, idx) => {
      const x = MX + 0.24 + idx * 1.3
      slide.addShape('ellipse', {
        x, y: legendY + 0.02, w: 0.1, h: 0.1,
        fill: { color: item.color }, line: { color: item.color, width: 0 },
      })
      slide.addText(item.label, {
        x: x + 0.16, y: legendY, w: 1.1, h: 0.14,
        fontSize: 7, color: C.textLt, fontFace: 'Inter',
      })
    })

    const baseNote = `Inclui todos os respondentes válidos, agrupados por ${stratumLabelLower} — quem não tem ${stratumLabelLower} preenchido no cadastro aparece em "Sem ${stratumLabelLower} informado".`
    slide.addText(baseNote, {
      x: MX + 5.25, y: legendY, w: CW - 5.25, h: 0.12,
      fontSize: 7.3, color: C.textLt, italic: true, align: 'right', fontFace: 'Inter',
    })
  }
}

/* ─── Risk index ─────────────────────────────────────────────────────────── */
function addRiskIndexSlide(
  prs: PptxGenJS,
  data: ReportPayload,
  options?: { combinedRisk?: boolean; title?: string },
) {
  const combinedRisk = options?.combinedRisk ?? false
  const title = options?.title ?? 'Índice de Risco Psicossocial Geral'
  const { slide, cY, cH } = mkBase(prs, title, data.clientName, mappingSectionBreadcrumb(data))

  const high  = data.hseClassDist.find(d => d.name === 'Alto risco')?.value ?? 0
  const mod   = data.hseClassDist.find(d => d.name === 'Risco moderado')?.value ?? 0
  const low   = data.hseClassDist.find(d => d.name === 'Baixo risco')?.value ?? 0
  const highOrMod = high + mod
  const total   = high + mod + low

  const lowPct  = pct1(low, total)
  const modPct  = pct1(mod, total)
  const highPct = pct1(high, total)
  const highOrModPct = pct1(highOrMod, total)
  const dominant = combinedRisk
    ? [
        { label: 'Baixo', pct: lowPct },
        { label: 'Moderado + Alto', pct: highOrModPct },
      ].sort((a, b) => b.pct - a.pct)[0]
    : [
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
    name: 'Trabalhadores',
    labels: combinedRisk ? ['Baixo', 'Moderado + Alto'] : ['Baixo', 'Moderado', 'Alto'],
    values: combinedRisk ? [low, highOrMod] : [low, mod, high],
  }], {
    x: donutX, y: donutY, w: donutSize, h: donutSize,
    chartColors: combinedRisk ? [C.low, C.high] : [C.low, C.mod, C.high],
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
    slide.addText('Índice de Risco', {
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
    slide.addText('Índice de 0 a 10. Valores menores indicam maior exposição ao risco.', {
      x: rightX + 1.95, y: cY + 0.28, w: rightW - 2.15, h: 0.5,
      fontSize: 7.8, color: C.textMd, fontFace: 'Inter',
    })
    slide.addShape('roundRect', { x: rightX + 1.95, y: cY + 0.9, w: rightW - 2.15, h: 0.2,
      fill: { color: riskLightBg(data.hseAvg) }, line: { color: riskLightBg(data.hseAvg), width: 0 }, rectRadius: 0.06 })
    slide.addShape('roundRect', { x: rightX + 1.95, y: cY + 0.9, w: (rightW - 2.15) * riskIndexRatio(data.hseAvg), h: 0.2,
      fill: { color: sc }, line: { color: sc, width: 0 }, rectRadius: 0.06 })
  }

  const classCards = combinedRisk
    ? [
        { label: 'Baixo', n: low, pct: lowPct, color: C.low },
        { label: 'Moderado + Alto', n: highOrMod, pct: highOrModPct, color: C.high },
      ]
    : [
        { label: 'Baixo', n: low, pct: lowPct, color: C.low },
        { label: 'Moderado', n: mod, pct: modPct, color: C.mod },
        { label: 'Alto', n: high, pct: highPct, color: C.high },
      ]
  classCards.forEach((cc, i) => {
    const cy2 = cY + 1.6 + i * 1.12
    const fillW = Math.max(0.16, (rightW - 2.9) * (cc.pct / 100))
    drawRoundedCard(slide, rightX, cy2, rightW, 0.92)
    slide.addShape('ellipse', { x: rightX + 0.22, y: cy2 + 0.28, w: 0.12, h: 0.12,
      fill: { color: cc.color }, line: { color: cc.color, width: 0 } })
    slide.addText(cc.label, {
      x: rightX + 0.42, y: cy2 + 0.18, w: 1.1, h: 0.16,
      fontSize: 9, bold: true, color: C.textDk, fontFace: 'Inter',
    })
    slide.addShape('roundRect', { x: rightX + 1.7, y: cy2 + 0.28, w: rightW - 2.9, h: 0.16,
      fill: { color: 'EFF3F7' }, line: { color: 'EFF3F7', width: 0 }, rectRadius: 0.05 })
    slide.addShape('roundRect', { x: rightX + 1.7, y: cy2 + 0.28, w: fillW, h: 0.16,
      fill: { color: cc.color }, line: { color: cc.color, width: 0 }, rectRadius: 0.05 })
    slide.addText(fmtPct(cc.pct), {
      x: rightX + rightW - 0.96, y: cy2 + 0.17, w: 0.72, h: 0.2,
      fontSize: 8.8, bold: true, color: C.textDk, align: 'right', fontFace: 'Manrope',
    })
    slide.addText(`${cc.n} trabalhadores`, {
      x: rightX + 0.42, y: cy2 + 0.46, w: 1.2, h: 0.14,
      fontSize: 7.5, color: C.textLt, fontFace: 'Inter',
    })
  })
}

/* ─── Narrative / analysis ───────────────────────────────────────────────── */
function addNarrativeSlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Análise e Interpretação', data.clientName, mappingSectionBreadcrumb(data))

  const high  = data.hseClassDist.find(d => d.name === 'Alto risco')?.value ?? 0
  const mod   = data.hseClassDist.find(d => d.name === 'Risco moderado')?.value ?? 0
  const total = data.hseClassDist.reduce((s, d) => s + d.value, 0)
  const topDom = [...data.domainAvgs].sort(byMostCritical)[0]

  const kpis = [
    {
      value: data.hseAvg !== null ? data.hseAvg.toFixed(2) : '--',
      label: 'Índice de Risco médio',
      sub:   data.hseAvg !== null ? riskLabel(data.hseAvg) : 'sem dados',
      color: data.hseAvg !== null ? riskColor(data.hseAvg) : C.textMd,
    },
    {
      value: total > 0 ? fmtPct(pct1(high, total)) : '--',
      label: 'em alto risco',
      sub:   `${high} trabalhadores`,
      color: C.high,
    },
    {
      value: total > 0 ? fmtPct(pct1(mod, total)) : '--',
      label: 'em risco moderado',
      sub:   `${mod} trabalhadores`,
      color: C.mod,
    },
    {
      value: topDom?.domain ?? '--',
      label: 'domínio mais crítico',
      sub:   topDom ? `índice ${topDom.avg.toFixed(2)}` : '',
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
  const worstThree = [...data.domainAvgs].sort(byMostCritical).slice(0, 3)

  drawRoundedCard(slide, MX, bodyY, leftW, cH - 1.62)
  slide.addShape('roundRect', { x: MX, y: bodyY, w: 0.07, h: cH - 1.62,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09 })
  slide.addText('LEITURA EXECUTIVA', {
    x: MX + 0.22, y: bodyY + 0.14, w: leftW - 0.4, h: 0.18,
    fontSize: 8, bold: true, color: C.textLt, charSpacing: 1.2, fontFace: 'Manrope',
  })
  slide.addText(narrative, {
    x: MX + 0.22, y: bodyY + 0.42, w: leftW - 0.38, h: cH - 2.12,
    fontSize: 14, color: C.textMd, align: 'left', fontFace: 'Inter',
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
  const { slide, cY, cH } = mkBase(prs, 'Perfil de Risco por Domínio — Índice de Risco', data.clientName, mappingSectionBreadcrumb(data))

  if (data.domainAvgs.length === 0) return

  const ordered = data.hseDomains
    .map(domain => {
      const found = data.domainAvgs.find(d => d.domain === domain)
      return found ? { domain: found.domain, avg: found.avg } : null
    })
    .filter((d): d is { domain: string; avg: number } => d !== null)
  const ranked = [...ordered].sort(byMostCritical)
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
  slide.addText('Quanto maior a área preenchida, maior a exposição ao risco no domínio.', {
    x: MX + 0.22, y: cY + 0.36, w: leftW - 0.4, h: 0.16,
    fontSize: 7.6, color: C.textLt, fontFace: 'Inter',
  })

  // Severidade em % (0 = melhor, 100 = pior) já orientada pelo protocolo — mantém
  // "maior área preenchida = maior exposição" válido nas duas direções de escala.
  const radarRiskExposure = ordered.map((d) => riskSeverityPct(d.avg))

  const radarW = leftW - 1.74
  const radarH = cH - 2.04
  const radarX = MX + (leftW - radarW) / 2
  const radarY = cY + 0.94

  slide.addChart('radar', [{
    name: 'Exposição ao risco',
    labels: ordered.map(d => d.domain),
    values: radarRiskExposure,
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
    valAxisMaxVal: 100,
    valAxisMajorUnit: 10,
  })

  slide.addChart('radar', [{
    name: 'Exposição ao risco',
    labels: ordered.map(d => d.domain),
    values: radarRiskExposure,
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
    valAxisMaxVal: 100,
    valAxisMajorUnit: 10,
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
    slide.addShape('roundRect', { x: rightX + 0.22, y: y + 0.22, w: Math.max(0.14, (rightW - 1.32) * riskIndexRatio(d.avg)), h: 0.14,
      fill: { color: col }, line: { color: col, width: 0 }, rectRadius: 0.05 })
    slide.addText(d.avg.toFixed(2), {
      x: rightX + rightW - 1.08, y: y + 0.06, w: 0.64, h: 0.2,
      fontSize: 8.8, bold: true, color: C.textDk, align: 'right', fontFace: 'Manrope',
    })
    slide.addText(riskLabel(d.avg), {
      x: rightX + rightW - 1.24, y: y + 0.26, w: 0.8, h: 0.14,
      fontSize: 6.8, color: col, align: 'right', fontFace: 'Inter',
    })
  })
}

function addDomainRiskMapSlide(prs: PptxGenJS, data: ReportPayload) {
  const { slide, cY, cH } = mkBase(prs, 'Mapa de Riscos por Domínio', data.clientName, mappingSectionBreadcrumb(data))
  if (data.domainAvgs.length === 0) return

  const ordered = data.hseDomains
    .map((domain) => data.domainAvgs.find((d) => d.domain === domain))
    .filter((d): d is { domain: string; avg: number } => Boolean(d))
  if (ordered.length === 0) return

  drawRoundedCard(slide, MX, cY, CW, cH, { fill: '071A4A', borderColor: '112A66', radius: 0.08 })
  slide.addShape('roundRect', {
    x: MX, y: cY, w: 0.07, h: cH,
    fill: { color: C.blue2 }, line: { color: C.blue2, width: 0 }, rectRadius: 0.08,
  })

  const mapX = MX + 0.2
  const mapY = cY + 0.1
  const mapW = CW - 0.4
  const mapH = cH - 0.72
  const cx = mapX + mapW * 0.5
  const cy = mapY + mapH * 0.48
  const maxR = Math.min(mapW, mapH) * 0.42
  const innerR = maxR * 0.26

  for (let r = 1; r <= 5; r++) {
    const rr = innerR + ((maxR - innerR) * r) / 5
    slide.addShape('ellipse', {
      x: cx - rr, y: cy - rr, w: rr * 2, h: rr * 2,
      fill: { color: '071A4A', transparency: 100 },
      line: { color: r % 2 === 0 ? '203B78' : '17326D', width: 0.8 },
    })
  }

  slide.addShape('ellipse', {
    x: cx - innerR, y: cy - innerR, w: innerR * 2, h: innerR * 2,
    fill: { color: '102C63', transparency: 20 },
    line: { color: '2858A8', width: 0.8 },
  })
  slide.addImage({
    data: iconDataUri('user', '8FD4FF'),
    x: cx - 0.36, y: cy - 0.36, w: 0.72, h: 0.72,
  })

  const bubbleR = 0.22
  const n = ordered.length
  ordered.forEach((item, idx) => {
    const angle = (-Math.PI / 2) + (idx * (Math.PI * 2)) / n
    const ratio = riskIndexRatio(item.avg)
    const rr = innerR + (maxR - innerR) * ratio
    const px = cx + rr * Math.cos(angle)
    const py = cy + rr * Math.sin(angle)
    const color = riskColor(item.avg)

    slide.addShape('line', {
      x: cx, y: cy, w: px - cx, h: py - cy,
      line: { color: '264A88', width: 0.6 },
    })
    slide.addShape('ellipse', {
      x: px - (bubbleR + 0.06), y: py - (bubbleR + 0.06), w: (bubbleR + 0.06) * 2, h: (bubbleR + 0.06) * 2,
      fill: { color: color, transparency: 60 },
      line: { color: color, width: 0 },
    })
    slide.addShape('ellipse', {
      x: px - bubbleR, y: py - bubbleR, w: bubbleR * 2, h: bubbleR * 2,
      fill: { color }, line: { color: 'FFFFFF', width: 0.5 },
    })
    slide.addText(item.avg.toFixed(2).replace('.', ','), {
      x: px - 0.27, y: py - 0.08, w: 0.54, h: 0.16,
      fontSize: 7.8, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Manrope',
    })

    const lx = px + (Math.cos(angle) >= 0 ? 0.26 : -1.28)
    const ly = py + (Math.sin(angle) >= 0 ? 0.03 : -0.16)
    slide.addText(item.domain, {
      x: lx, y: ly, w: 1.02, h: 0.14,
      fontSize: 8.4, bold: true, color: color, align: Math.cos(angle) >= 0 ? 'left' : 'right', fontFace: 'Inter',
    })
  })

  const legendY = cY + cH - 0.52
  slide.addText('Mapa de Riscos Psicossociais por Domínio', {
    x: MX + 0.26, y: legendY - 0.12, w: CW - 0.52, h: 0.14,
    fontSize: 10.9, bold: true, color: 'A6D7FF', align: 'center', fontFace: 'Manrope',
  })

  const legend = [
    { label: 'Crítico (< 6,30)', color: C.high },
    { label: 'Moderado (6,30 a 6,87)', color: C.mod },
    { label: 'Proteção (>= 6,88)', color: C.low },
  ]
  const lgW = 1.95
  const totalW = lgW * 3 + 0.22 * 2
  const startX = MX + (CW - totalW) / 2
  legend.forEach((l, i) => {
    const x = startX + i * (lgW + 0.22)
    slide.addShape('ellipse', {
      x, y: legendY + 0.06, w: 0.11, h: 0.11,
      fill: { color: l.color }, line: { color: l.color, width: 0 },
    })
    slide.addText(l.label, {
      x: x + 0.15, y: legendY + 0.03, w: lgW - 0.16, h: 0.16,
      fontSize: 7.6, color: 'D7E7FF', fontFace: 'Inter',
    })
  })
}

// CMPC: linha de referência "CMPC (Geral)" com os números consolidados da empresa toda,
// construída a partir dos campos de nível superior de ReportPayload (não por-estrato) — usada
// para comparar cada unidade produtiva contra a baseline da companhia nos slides de
// distribuição por unidade (addStratumDistSlide/addMentalHealthStratumRiskDistSlide/
// addMentalHealthStratumSlide). Só entra quando o estrato ativo é 'rpt_unidade_produtiva' (o
// bloco geral da CMPC) — não aparece nos blocos por unidade (estrato GHE) nem nos estratos
// extras (Setor de Trabalho, Cargo/Posição), que usam outros estratos.
// `name` é parametrizável porque a mesma conta serve para duas leituras diferentes: a linha
// "CMPC (Geral)" nos slides de distribuição por unidade, e uma linha por unidade nos slides de
// síntese (addCmpcRiskSynthesisByUnitSlide), onde cada payload de unidade traz os mesmos campos
// de nível superior consolidados para aquela unidade.
function buildCmpcGeneralStratumRow(data: ReportPayload, name = 'CMPC (Geral)'): StratumRow {
  const highN = data.hseClassDist.find((d) => d.name === 'Alto risco')?.value ?? 0
  const modN = data.hseClassDist.find((d) => d.name === 'Risco moderado')?.value ?? 0
  const lowN = data.hseClassDist.find((d) => d.name === 'Baixo risco')?.value ?? 0
  const total = highN + modN + lowN
  return {
    name,
    total: data.totalCollabs,
    answered: data.totalAnswered,
    hseAvg: data.hseAvg,
    hseClass: data.hseAvg !== null ? riskLabel(data.hseAvg) : null,
    highPct: pct1(highN, total),
    modPct: pct1(modN, total),
    lowPct: pct1(lowN, total),
    domainAvgs: Object.fromEntries(data.domainAvgs.map((d) => [d.domain, d.avg])),
    domainHighPcts: data.overallDomainHighPcts,
  }
}

// Mesma ideia de buildCmpcGeneralStratumRow, para os slides de distribuição de saúde mental por
// unidade. As percentagens de estresse grave/alerta depressivo/risco de suicídio/rede de apoio
// são recalculadas aqui a partir das distribuições de nível superior (stressDist/
// depressionDist/suicideRiskDist/supportDist) — os mesmos rótulos usados em
// buildWellbeingStratumRows (classifyStressCount/isDepressionAlert em cmpc/report-data.ts).
function buildCmpcGeneralWellbeingRow(data: ReportPayload, name = 'CMPC (Geral)'): WellbeingStratumRow {
  const classDist = data.mentalHealthClassDist ?? []
  const unsatN = classDist.find((d) => d.name === 'Insatisfatório')?.value ?? 0
  const regularN = classDist.find((d) => d.name === 'Regular')?.value ?? 0
  const goodN = classDist.find((d) => d.name === 'Bom')?.value ?? 0
  const excellentN = classDist.find((d) => d.name === 'Excelente')?.value ?? 0
  const mentalValid = unsatN + regularN + goodN + excellentN

  const stressDist = data.stressDist ?? []
  const severeStressN = stressDist.find((d) => d.name === 'Sintomas Graves')?.value ?? 0
  const stressTotal = stressDist.reduce((sum, d) => sum + d.value, 0)

  const depressionDist = data.depressionDist ?? []
  const depressiveAlertN = depressionDist
    .filter((d) => d.name === 'Sintomas Moderados' || d.name === 'Sintomas Graves')
    .reduce((sum, d) => sum + d.value, 0)
  const depressionTotal = depressionDist.reduce((sum, d) => sum + d.value, 0)

  const suicideRiskDist = data.suicideRiskDist ?? []
  const suicideRiskN = suicideRiskDist.find((d) => d.name === 'Com risco')?.value ?? 0
  const suicideTotal = suicideRiskDist.reduce((sum, d) => sum + d.value, 0)

  const supportDist = data.supportDist ?? []
  const supportPresentN = supportDist.find((d) => d.name === 'Com apoio')?.value ?? 0
  const supportTotal = supportDist.reduce((sum, d) => sum + d.value, 0)

  return {
    name,
    answered: data.totalAnswered,
    mentalHealthAvg: data.mentalHealthAvg ?? null,
    mentalValid,
    mentalUnsatPct: pct1(unsatN, mentalValid),
    mentalRegularPct: pct1(regularN, mentalValid),
    mentalGoodPct: pct1(goodN, mentalValid),
    mentalExcellentPct: pct1(excellentN, mentalValid),
    severeStressPct: pct1(severeStressN, stressTotal),
    depressiveAlertPct: pct1(depressiveAlertN, depressionTotal),
    suicideRiskPct: pct1(suicideRiskN, suicideTotal),
    supportPresencePct: pct1(supportPresentN, supportTotal),
  }
}

/* ─── Stratum distribution (stacked bar) ─────────────────────────────────── */
function addStratumDistSlide(prs: PptxGenJS, data: ReportPayload) {
  const rows = [...data.stratumRows]
    .filter((r) => r.answered >= 5)
    .sort((a, b) => b.highPct - a.highPct)

  if (rows.length === 0) return

  const generalRow = (isCmpcReport(data) && data.stratum === 'rpt_unidade_produtiva')
    ? buildCmpcGeneralStratumRow(data)
    : null
  const allRows = generalRow ? [generalRow, ...rows] : rows

  const PAGE = 10
  const pages = Math.ceil(allRows.length / PAGE)

  for (let p = 0; p < pages; p++) {
    const pageRows = allRows.slice(p * PAGE, (p + 1) * PAGE)
    const suffix = pages > 1 ? ` (${p + 1}/${pages})` : ''
    const { slide, cY, cH } = mkBase(prs,
      `Distribuição de Risco por ${data.stratumLabel}${suffix}`,
      data.clientName, stratumDistSectionBreadcrumb(data),
    )

    const top = rows.reduce((best, row) => (row.highPct > best.highPct ? row : best), rows[0])
    // Usa data.hseAvg (média de todos os respondentes) em vez de recalcular uma média das
    // médias dos grupos exibidos: essa segunda conta é não ponderada por N e ainda exclui
    // grupos com N < 5, então diverge do índice geral mostrado no Mapeamento de Riscos.
    const avgScore = data.hseAvg
    const topRisk = dominantRiskDisplay(top)
    const kpiH = 0.92
    const kpiGap = 0.14
    const kpiW = (CW - kpiGap * 2) / 3
    const kpiY = cY
    const kpis = [
      { label: 'Grupos analisados', value: `${rows.length}`, sub: `N >= 5 respostas`, color: C.blue },
      { label: 'Maior situação de risco', value: fmtPct(topRisk.pct), sub: `${top.name}`, color: topRisk.color },
      { label: 'Índice de Risco médio', value: avgScore !== null ? avgScore.toFixed(2).replace('.', ',') : '--', sub: 'escala de 0 a 10', color: avgScore !== null ? riskColor(avgScore) : C.textMd },
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
      { x: MX + 0.22, y: chartY + 0.18, w: CW - 0.38, h: 0.18, fontSize: 8.8, color: C.textLt, italic: true, fontFace: 'Inter' },
    )

    const plotX = MX + 0.22
    const plotY = chartY + 0.58
    const plotW = CW - 0.38
    const plotH = chartH - 0.86
    const labelW = 4.05
    const distX = plotX + labelW
    const distW = plotW - labelW - 0.08
    const rowGap = 0.07
    const barH = Math.min(0.32, (plotH - rowGap * (pageRows.length - 1)) / pageRows.length)

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

    pageRows.forEach((r, i) => {
    const y = plotY + i * (barH + rowGap)
    const isGeneral = r.name === 'CMPC (Geral)'
    const pctSum = Math.max(1, r.highPct + r.modPct + r.lowPct)
    const highW = distW * (r.highPct / pctSum)
    const modW = distW * (r.modPct / pctSum)
    const lowW = Math.max(0, distW - highW - modW)
    const [highN, modN, lowN] = splitCountsFromPct(r.answered, [r.highPct, r.modPct, r.lowPct])
    const scoreTxt = r.hseAvg !== null ? `Índice ${r.hseAvg.toFixed(2).replace('.', ',')}` : 'Índice --'

    if (isGeneral) {
      slide.addShape('roundRect', { x: plotX - 0.06, y: y - 0.035, w: plotW + 0.06, h: barH + 0.07,
        fill: { color: 'EAF2FB' }, line: { color: C.blue2, width: 0.6 }, rectRadius: 0.05 })
    }

    slide.addText(`${r.name} (N=${r.answered})`, {
      x: plotX, y: y + 0.055, w: labelW - 1.1, h: 0.15,
      fontSize: 7.8, bold: isGeneral, color: isGeneral ? C.navy : C.textMd, fontFace: 'Inter',
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
      drawRiskBarLabel(slide, distX, y, highW, barH, `${fmtPct(r.highPct)} (N=${highN})`, C.white)
    }
    if (modW > 0.002) {
      slide.addShape('roundRect', { x: distX + highW, y, w: modW, h: barH,
        fill: { color: C.mod }, line: { color: C.mod, width: 0 }, rectRadius: 0.07 })
      drawRiskBarLabel(slide, distX + highW, y, modW, barH, `${fmtPct(r.modPct)} (N=${modN})`, C.textDk)
    }
    if (lowW > 0.002) {
      slide.addShape('roundRect', { x: distX + highW + modW, y, w: lowW, h: barH,
        fill: { color: C.low }, line: { color: C.low, width: 0 }, rectRadius: 0.07 })
      drawRiskBarLabel(slide, distX + highW + modW, y, lowW, barH, `${fmtPct(r.lowPct)} (N=${lowN})`, C.textDk)
    }
    })
  }
}

/* ─── Heatmap ────────────────────────────────────────────────────────────── */
const DOM_ABBR: Record<string, string> = {
  'Trabalho': 'Trabalho',
  'Autonomia': 'Autonomia',
  'Liderança': 'Liderança',
  'Cooperação': 'Cooperação',
  'Convivência': 'Convivência',
  'Responsabilidades': 'Responsabilidades',
  'Mudanças': 'Mudanças',
  'Satisfação': 'Satisfação',
}

const DOM_ICON: Record<string, IconType> = {
  'Trabalho': 'briefcase',
  'Autonomia': 'sliders',
  'Liderança': 'user',
  'Cooperação': 'people',
  'Convivência': 'handshake',
  'Responsabilidades': 'alert-circle',
  'Mudanças': 'megaphone',
  'Satisfação': 'check-circle',
}

const IETR_ABBR: Record<string, string> = {
  'Demanda': 'Demanda',
  'Controle': 'Controle',
}

const IETR_ICON: Record<string, IconType> = {
  'Demanda': 'alert-tri',
  'Controle': 'sliders',
}

function addHeatmapSlides(prs: PptxGenJS, data: ReportPayload) {
  const rows = data.stratumRows.filter(r => r.answered >= 5)
  const heatmapRows = [...rows]
  if (data.stratum === 'especialidade' && data.overallDomainHighPcts) {
    const overallDomainAvgs = Object.fromEntries(data.domainAvgs.map((item) => [item.domain, item.avg]))
    heatmapRows.push({
      name: `${data.clientName} (Geral)`,
      total: data.totalCollabs,
      answered: data.totalAnswered,
      hseAvg: data.hseAvg,
      hseClass: null,
      highPct: 0,
      modPct: 0,
      lowPct: 0,
      domainAvgs: overallDomainAvgs,
      domainHighPcts: data.overallDomainHighPcts,
    })
  }
  if (heatmapRows.length === 0 || data.hseDomains.length === 0) return

  const PAGE  = 13
  const pages = Math.ceil(heatmapRows.length / PAGE)

  for (let p = 0; p < pages; p++) {
    const pageRows = heatmapRows.slice(p * PAGE, (p + 1) * PAGE)
    const suffix   = pages > 1 ? ` (${p + 1}/${pages})` : ''
    const { slide, cY, cH } = mkBase(prs,
      `Heatmap de Domínios por ${data.stratumLabel}${suffix}`,
      data.clientName, stratumDistSectionBreadcrumb(data),
    )

    drawRoundedCard(slide, MX, cY, CW, cH)
    slide.addShape('roundRect', { x: MX, y: cY, w: 0.07, h: cH,
      fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09 })
    slide.addText(
      `Leitura por ${data.stratumLabel.toLowerCase()}: classificação dos domínios do Índice de Risco por grupo (N >= 5).`,
      { x: MX + 0.22, y: cY + 0.14, w: CW - 0.36, h: 0.18, fontSize: 8.8, color: C.textLt, italic: true, fontFace: 'Inter' },
    )

    const tableX = MX + 0.16
    const tableY = cY + 0.36
    const tableW = CW - 0.3
    const tableH = cH - 0.82
    const legendH = 0.32
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

    const rowH = Math.min(0.38, bodyH / pageRows.length)
    pageRows.forEach((r, idx) => {
      const ry = tableY + headerH + idx * rowH
      const rowBg = idx % 2 === 0 ? C.white : 'FAFCFE'
      slide.addShape('rect', { x: tableX, y: ry, w: tableW, h: rowH,
        fill: { color: rowBg }, line: { color: rowBg, width: 0 } })

      slide.addText(r.name, {
        x: tableX + 0.1, y: ry + 0.04, w: nameW - 0.2, h: 0.17,
        fontSize: 7.4, bold: true, color: C.textDk, fontFace: 'Inter', valign: 'top', margin: 0, wrap: false,
      })
      slide.addText(`(N = ${r.answered})`, {
        x: tableX + 0.1, y: ry + 0.22, w: nameW - 0.2, h: 0.12,
        fontSize: 6.6, bold: true, color: C.textLt, fontFace: 'Inter', valign: 'top', margin: 0,
      })

      data.hseDomains.forEach((domain, dIdx) => {
        const avg = r.domainAvgs[domain]
        const cx = tableX + nameW + dIdx * domW
        const riskPct = r.domainHighPcts?.[domain] ?? (avg === null || avg === undefined ? null : riskSeverityPct(avg))
        const fill = riskPct === null ? 'EEF3F8' : heatRiskColor(riskPct)
        const textColor = riskPct !== null && riskPct >= 70 ? C.white : C.textDk
        const label = riskPct === null ? '--' : fmtPct(riskPct)

        slide.addShape('roundRect', {
          x: cx + 0.05,
          y: ry + 0.04,
          w: domW - 0.1,
          h: rowH - 0.08,
          fill: { color: fill },
          line: { color: fill, width: 0 },
          rectRadius: 0.04,
        })

        slide.addText(label, {
          x: cx + 0.05, y: ry + 0.04, w: domW - 0.1, h: rowH - 0.08,
          align: 'center', valign: 'middle',
          fontSize: 7.3,
          bold: true,
          color: textColor,
          fontFace: 'Manrope',
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
    slide.addText('% de Risco Alto', {
      x: MX + 0.34, y: legendY + 0.09, w: 1.35, h: 0.14,
      fontSize: 8, bold: true, color: C.textMd, fontFace: 'Inter',
    })

    const scaleX = MX + 1.72
    const scaleY = legendY + 0.1
    const scaleW = 3.2
    const scaleH = 0.12
    const steps = 20
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps
      const segX = scaleX + scaleW * t0
      const segW = scaleW / steps
      const pct = t0 * 100
      const col = heatRiskColor(pct)
      slide.addShape('rect', {
        x: segX, y: scaleY, w: segW + 0.002, h: scaleH,
        fill: { color: col }, line: { color: col, width: 0 },
      })
    }
    ;[0, 25, 50, 75, 100].forEach((tick) => {
      const tx = scaleX + scaleW * (tick / 100)
      slide.addShape('line', {
        x: tx, y: scaleY + scaleH + 0.005, w: 0, h: 0.03,
        line: { color: C.textLt, pt: 0.6 },
      })
      slide.addText(`${tick}`, {
        x: tx - 0.09, y: scaleY + scaleH + 0.03, w: 0.18, h: 0.1,
        fontSize: 6.5, color: C.textLt, align: 'center', fontFace: 'Inter', margin: 0,
      })
    })

    slide.addText(`${String(p + 1).padStart(2, '0')}`, {
      x: MX + CW - 0.62, y: legendY + 0.02, w: 0.44, h: 0.16,
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
    name: 'Trabalhadores',
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
    const fillW = Math.max(0.1, (leftW - 4.1) * (cc.pct / 100))
    drawRoundedCard(slide, MX + 0.16, cy2, leftW - 0.32, classCardH, { fill: C.white, borderColor: C.border, radius: 0.06 })
    slide.addShape('ellipse', { x: MX + 0.34, y: cy2 + 0.155, w: 0.1, h: 0.1,
      fill: { color: cc.color }, line: { color: cc.color, width: 0 } })
    slide.addText(cc.label, {
      x: MX + 0.5, y: cy2 + 0.12, w: 1.95, h: 0.14,
      fontSize: 7.6, bold: true, color: C.textDk, fontFace: 'Inter',
    })
    slide.addShape('roundRect', { x: MX + 2.6, y: cy2 + 0.155, w: leftW - 4.1, h: 0.1,
      fill: { color: 'EFF3F7' }, line: { color: 'EFF3F7', width: 0 }, rectRadius: 0.04 })
    slide.addShape('roundRect', { x: MX + 2.6, y: cy2 + 0.155, w: fillW, h: 0.1,
      fill: { color: cc.color }, line: { color: cc.color, width: 0 }, rectRadius: 0.04 })
    drawRiskBarLabel(slide, MX + 2.6, cy2 + 0.155, fillW, 0.1, `${fmtPct(cc.pct)} (N=${cc.n})`, cc.color === C.high ? C.white : C.textDk)
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
  slide.addText('ÍNDICE MÉDIO IETR', {
    x: rightX + 0.22, y: cY + 0.14, w: rightW - 0.4, h: 0.2,
    fontSize: 8.2, bold: true, color: C.textLt, charSpacing: 1.05, fontFace: 'Manrope',
  })

  if (data.ietrAvg !== null) {
    const sc = ietrColor(data.ietrAvg)
    const sl = ietrLabel(data.ietrAvg)
    drawRoundedCard(slide, rightX + 0.16, cY + 0.4, rightW - 0.32, 0.96, { fill: C.white, borderColor: C.border, radius: 0.07 })
    slide.addShape('roundRect', { x: rightX + 0.16, y: cY + 0.4, w: 0.06, h: 0.96,
      fill: { color: sc }, line: { color: sc, width: 0 }, rectRadius: 0.07 })
    slide.addText('Índice médio IETR', {
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
    slide.addShape('roundRect', { x: rightX + 1.15, y: cY + 1.0, w: (rightW - 1.5) * ietrIndexRatio(data.ietrAvg), h: 0.14,
      fill: { color: sc }, line: { color: sc, width: 0 }, rectRadius: 0.05 })
  }

  drawRoundedCard(slide, rightX, rankingY, rightW, rankingH)
  slide.addShape('roundRect', { x: rightX, y: rankingY, w: 0.07, h: rankingH,
    fill: { color: C.high }, line: { color: C.high, width: 0 }, rectRadius: 0.09 })
  slide.addText('RANKING DE DOMÍNIOS IETR', {
    x: rightX + 0.22, y: rankingY + 0.14, w: rightW - 0.4, h: 0.2,
    fontSize: 8.2, bold: true, color: C.textLt, charSpacing: 1.05, fontFace: 'Manrope',
  })

  const ranked = [...data.ietrDomainAvgs].sort(byMostCritical)
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
  // data.ietrAvg (média de todos os respondentes) em vez de uma média das médias dos grupos
  // exibidos — ver o mesmo ajuste em addStratumDistSlide.
  const avgScore = data.ietrAvg
  const topRisk = dominantRiskDisplay(top)
  const kpiH = 0.92
  const kpiGap = 0.14
  const kpiW = (CW - kpiGap * 2) / 3

  const kpis = [
    { label: 'Grupos analisados', value: `${rows.length}`, sub: 'N >= 5 respostas', color: C.blue },
    { label: 'Maior situação de risco', value: fmtPct(topRisk.pct), sub: `${top.name}`, color: topRisk.color },
    { label: 'Índice médio IETR', value: avgScore !== null ? avgScore.toFixed(2).replace('.', ',') : '--', sub: `risco médio ${fmtPct(avgRisk)}`, color: avgScore !== null ? ietrColor(avgScore) : C.textMd },
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
    { x: MX + 0.22, y: chartY + 0.18, w: CW - 0.38, h: 0.18, fontSize: 8.8, color: C.textLt, italic: true, fontFace: 'Inter' },
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
    const [highN, modN, lowN] = splitCountsFromPct(r.answered, [r.highPct, r.modPct, r.lowPct])
    const scoreTxt = r.ietrAvg !== null ? `Índice ${r.ietrAvg.toFixed(2).replace('.', ',')}` : 'Índice --'

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
      drawRiskBarLabel(slide, distX, y, highW, barH, `${fmtPct(r.highPct)} (N=${highN})`, C.white)
    }
    if (modW > 0.001) {
      slide.addShape('roundRect', { x: distX + highW, y, w: modW, h: barH,
        fill: { color: C.mod }, line: { color: C.mod, width: 0 }, rectRadius: 0.07 })
      drawRiskBarLabel(slide, distX + highW, y, modW, barH, `${fmtPct(r.modPct)} (N=${modN})`, C.textDk)
    }
    if (lowW > 0.001) {
      slide.addShape('roundRect', { x: distX + highW + modW, y, w: lowW, h: barH,
        fill: { color: C.low }, line: { color: C.low, width: 0 }, rectRadius: 0.07 })
      drawRiskBarLabel(slide, distX + highW + modW, y, lowW, barH, `${fmtPct(r.lowPct)} (N=${lowN})`, C.textDk)
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
      { x: MX + 0.22, y: cY + 0.14, w: CW - 0.36, h: 0.18, fontSize: 8.8, color: C.textLt, italic: true, fontFace: 'Inter' },
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
        x: tableX + 0.1, y: ry + 0.04, w: nameW - 0.2, h: 0.17,
        fontSize: 7.4, bold: true, color: C.textDk, fontFace: 'Inter', valign: 'top', margin: 0, wrap: false,
      })
      slide.addText(`(N = ${r.answered})`, {
        x: tableX + 0.1, y: ry + 0.22, w: nameW - 0.2, h: 0.12,
        fontSize: 6.6, bold: true, color: C.textLt, fontFace: 'Inter', valign: 'top', margin: 0,
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
      x: MX + CW - 0.62, y: legendY + 0.02, w: 0.44, h: 0.16,
      fontSize: 8, bold: true, color: C.textMd, align: 'right', fontFace: 'Manrope',
    })
  }
}

/* ─── Priorities ─────────────────────────────────────────────────────────── */
function addPrioritiesSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getRecommendationSectionNumber(data)
  // Na FAB e na CMPC este slide foi realocado para o Plano de Ação (ver isFabReport/
  // isCmpcReport em buildRiskReport), já que a seção de Recomendações não é renderizada —
  // o breadcrumb acompanha o novo lar.
  const breadcrumbLabel = (isFabReport(data) || isCmpcReport(data)) ? 'PLANO DE AÇÃO' : 'RECOMENDAÇÕES'
  const { slide, cY, cH } = mkBase(prs, 'Grupos e Domínios Prioritarios', data.clientName, `${sNum} | ${breadcrumbLabel}`)

  slide.addText(
    `Grupos e domínios com maior exposição ao risco, identificados a partir da estratificação por ${data.stratumLabel.toLowerCase()}.`,
    { x: MX, y: cY, w: CW, h: 0.24, fontSize: 9.6, color: C.textMd, italic: true },
  )

  const topAreas   = [...data.stratumRows].filter(r => r.hseAvg !== null).sort((a, b) => byMostCritical({ avg: a.hseAvg ?? 0 }, { avg: b.hseAvg ?? 0 })).slice(0, 8)
  const topDomains = [...data.domainAvgs].sort(byMostCritical).slice(0, 5)
  const gap = 0.26
  const panelY = cY + 0.32
  const panelH = cH - 0.32
  const colW = (CW - gap) / 2

  drawRoundedCard(slide, MX, panelY, colW, panelH)
  slide.addShape('roundRect', { x: MX, y: panelY, w: 0.07, h: panelH,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09 })
  slide.addText(`TOP ${topAreas.length} ${data.stratumLabel.toUpperCase()}S — MAIOR RISCO`, {
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
      ? `Índice ${r.hseAvg.toFixed(2).replace('.', ',')} | ${r.hseClass ?? ''} | N=${r.answered}`
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
  slide.addText('DOMÍNIOS DE MAIOR RISCO', {
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
    const fillW = Math.min(barW, Math.max(0.12, barW * riskIndexRatio(d.avg)))
    slide.addShape('roundRect', { x: dx + 0.3, y: y + domRowH - 0.25, w: barW, h: 0.12,
      fill: { color: 'EFF3F8' }, line: { color: 'EFF3F8', width: 0 }, rectRadius: 0.05 })
    slide.addShape('roundRect', { x: dx + 0.3, y: y + domRowH - 0.25, w: fillW, h: 0.12,
      fill: { color: dc }, line: { color: dc, width: 0 }, rectRadius: 0.05 })
  })
}

/* ─── Next steps ─────────────────────────────────────────────────────────── */
function addNextStepsSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getRecommendationSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Plano de Ação — Próximos Passos', data.clientName, `${sNum} | RECOMENDAÇÕES`)

  slide.addText(
    'Roadmap sugerido para o ciclo de gestão de riscos psicossociais, conforme NR-1/2025 e ISO 45003:2021.',
    { x: MX, y: cY, w: CW, h: 0.24, fontSize: 10.1, color: C.textMd, italic: true },
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
      x: MX, y: 1.5, w: 3, h: 0.62,
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
    'Este relatório foi gerado automaticamente pela plataforma beetouch.ai\n'
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


function addMentalHealthSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasWellbeing) return

  const sNum = getWellbeingSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Saúde Mental Integrada', data.clientName, `${sNum} | SAÚDE MENTAL`)

  const total = (data.stressDist ?? []).reduce((sum, item) => sum + item.value, 0)
  if (total === 0) return

  const severeStress = data.stressDist?.find((item) => item.name === 'Sintomas Graves')?.value ?? 0
  const depressiveAlert = (data.depressionDist ?? [])
    .filter((item) => item.name === 'Sintomas Moderados' || item.name === 'Sintomas Graves')
    .reduce((sum, item) => sum + item.value, 0)
  const suicideRisk = data.suicideRiskDist?.find((item) => item.name === 'Com risco')?.value ?? 0
  const criticalUnionCount = data.mentalHealthCriticalUnionCount ?? 0
  const supportPresent = data.supportDist?.find((item) => item.name === 'Com apoio')?.value ?? 0

  const mentalAvg = data.mentalHealthAvg ?? null
  const accent = mentalAvg !== null ? mentalHealthColor(mentalAvg) : C.textMd
  const scoreLabel = mentalAvg !== null ? mentalHealthLabel(mentalAvg) : 'Sem dados'

  const cards = [
    { value: mentalAvg !== null ? mentalAvg.toFixed(2).replace('.', ',') : '--', label: 'índice médio', sub: scoreLabel, color: accent },
    { value: fmtPct(pct1(severeStress, total)), label: 'estresse grave', sub: `${severeStress} pessoas`, color: C.high },
    { value: fmtPct(pct1(depressiveAlert, total)), label: 'sintomas depressivos', sub: `${depressiveAlert} pessoas`, color: C.mod },
    { value: fmtPct(pct1(suicideRisk, total)), label: 'risco de suicídio', sub: `${suicideRisk} sinalizações`, color: C.high },
    { value: fmtPct(pct1(criticalUnionCount, total)), label: 'qualquer alerta crítico', sub: `${criticalUnionCount} pessoas únicas`, color: C.high },
    { value: fmtPct(pct1(supportPresent, total)), label: 'rede de apoio', sub: `${supportPresent} com apoio`, color: C.low },
  ]

  const kpiGap = 0.16
  const kpiW = (CW - kpiGap * 5) / 6
  const kpiH = 1.16
  cards.forEach((card, index) => {
    const x = MX + index * (kpiW + kpiGap)
    drawRoundedCard(slide, x, cY + 0.18, kpiW, kpiH)
    slide.addShape('roundRect', { x, y: cY + 0.18, w: 0.07, h: kpiH,
      fill: { color: card.color }, line: { color: card.color, width: 0 }, rectRadius: 0.09 })
    slide.addText(card.value, {
      x: x + 0.2, y: cY + 0.38, w: kpiW - 0.28, h: 0.28,
      fontSize: 17, bold: true, color: card.color, fontFace: 'Manrope',
    })
    slide.addText(card.label, {
      x: x + 0.2, y: cY + 0.8, w: kpiW - 0.28, h: 0.14,
      fontSize: 7.8, color: C.textLt, fontFace: 'Inter',
    })
    slide.addText(card.sub, {
      x: x + 0.2, y: cY + 0.98, w: kpiW - 0.28, h: 0.14,
      fontSize: 8, color: C.textDk, fontFace: 'Inter',
    })
  })

  const leftW = 6.2
  const gap = 0.26
  const panelY = cY + 1.54
  const panelH = cH - 1.54
  const rightX = MX + leftW + gap
  const rightW = CW - leftW - gap

  drawRoundedCard(slide, MX, panelY, leftW, panelH)
  slide.addShape('roundRect', { x: MX, y: panelY, w: 0.07, h: panelH,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09 })
  slide.addText('DISTRIBUIÇÃO DOS INDICADORES DE SAÚDE MENTAL', {
    x: MX + 0.22, y: panelY + 0.14, w: leftW - 0.36, h: 0.2,
    fontSize: 8.2, bold: true, color: C.textLt, charSpacing: 1.05, fontFace: 'Manrope',
  })

  const leftItems = [
    { label: 'Estresse grave', pct: pct1(severeStress, total), color: C.high },
    { label: 'Alerta depressivo', pct: pct1(depressiveAlert, total), color: C.mod },
    { label: 'Risco de suicídio', pct: pct1(suicideRisk, total), color: C.high },
    { label: 'Rede de apoio presente', pct: pct1(supportPresent, total), color: C.low },
  ]

  leftItems.forEach((item, index) => {
    const y = panelY + 0.48 + index * 0.66
    const barX = MX + 2.08
    const trackW = leftW - 2.95
    const pctX = MX + leftW - 0.78
    const fillW = Math.max(0.12, trackW * (item.pct / 100))
    slide.addText(item.label, {
      x: MX + 0.22, y: y + 0.06, w: 1.8, h: 0.14,
      fontSize: 8.5, bold: true, color: C.textDk, fontFace: 'Inter',
    })
    slide.addShape('roundRect', { x: barX, y: y + 0.08, w: trackW, h: 0.12,
      fill: { color: 'EFF3F8' }, line: { color: 'EFF3F8', width: 0 }, rectRadius: 0.05 })
    slide.addShape('roundRect', { x: barX, y: y + 0.08, w: fillW, h: 0.12,
      fill: { color: item.color }, line: { color: item.color, width: 0 }, rectRadius: 0.05 })
    slide.addText(fmtPct(item.pct), {
      x: pctX, y: y + 0.02, w: 0.56, h: 0.16,
      fontSize: 8.4, bold: true, color: item.color, align: 'right', fontFace: 'Manrope',
    })
  })

  slide.addText(
    `A combinação de estresse grave, sintomas depressivos e risco de suicídio ajuda a priorizar fluxos de acolhimento, suporte e revisão organizacional. ${criticalUnionCount} pessoas únicas apresentam pelo menos um desses alertas críticos, sem dupla contagem entre indicadores. O índice agregado de ${mentalAvg !== null ? mentalAvg.toFixed(2).replace('.', ',') : '--'} orienta a leitura global da saúde mental desta população.`,
    {
      x: MX + 0.22, y: panelY + panelH - 0.62, w: leftW - 0.38, h: 0.42,
      fontSize: 9.6, color: C.textMd, fontFace: 'Inter',
    },
  )

  drawRoundedCard(slide, rightX, panelY, rightW, panelH)
  slide.addShape('roundRect', { x: rightX, y: panelY, w: 0.07, h: panelH,
    fill: { color: C.mod }, line: { color: C.mod, width: 0 }, rectRadius: 0.09 })
  slide.addText('CLASSIFICAÇÃO E FATORES DE PROTEÇÃO', {
    x: rightX + 0.22, y: panelY + 0.14, w: rightW - 0.36, h: 0.2,
    fontSize: 8.2, bold: true, color: C.textLt, charSpacing: 1.05, fontFace: 'Manrope',
  })

  const classRows = [...(data.mentalHealthClassDist ?? [])]
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 4)

  classRows.forEach((row, index) => {
    const y = panelY + 0.48 + index * 0.6
    const pct = pct1(row.value, total)
    const color = row.name === 'Insatisfatório' ? C.high : row.name === 'Regular' ? C.mod : C.low
    drawRoundedCard(slide, rightX + 0.16, y, rightW - 0.32, 0.46, { fill: C.white, borderColor: C.border, radius: 0.07 })
    slide.addShape('roundRect', { x: rightX + 0.16, y, w: 0.05, h: 0.46,
      fill: { color }, line: { color, width: 0 }, rectRadius: 0.07 })
    slide.addText(row.name, {
      x: rightX + 0.28, y: y + 0.1, w: rightW - 2.2, h: 0.14,
      fontSize: 8.5, bold: true, color: C.textDk, fontFace: 'Inter',
    })
    slide.addText(`${row.value} pessoas | ${fmtPct(pct)}`, {
      x: rightX + rightW - 1.98, y: y + 0.1, w: 1.74, h: 0.14,
      fontSize: 8.2, bold: true, color, align: 'right', fontFace: 'Manrope',
    })
  })

  const supportSummary = data.supportDist?.find((item) => item.name === 'Sem apoio')?.value ?? 0
  const supportMissingPct = pct1(supportSummary, total)
  slide.addText(
    `Fatores de proteção: ${fmtPct(pct1(supportPresent, total))} relatam rede de apoio presente. Por outro lado, ${fmtPct(supportMissingPct)} não relataram apoio, exigindo atenção nos fluxos de cuidado e encaminhamento.`,
    {
      x: rightX + 0.22, y: panelY + panelH - 0.62, w: rightW - 0.36, h: 0.42,
      fontSize: 9.4, color: C.textMd, fontFace: 'Inter',
    },
  )
}

// Abre a seção de Saúde Mental delimitando o alcance dos indicadores: leitura epidemiológica e
// organizacional, não clínica. Conteúdo normativo (não depende dos dados da base).
function addMentalHealthMethodologicalNoteSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasWellbeing) return

  const sNum = getWellbeingSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Nota metodológica - Saúde Mental', data.clientName, `${sNum} | SAÚDE MENTAL`)

  const footerH = 0.6
  const panelH = cH - footerH - 0.24

  slide.addShape('roundRect', {
    x: MX, y: cY + 0.06, w: CW, h: panelH,
    fill: { color: C.navy }, line: { color: C.navy, width: 0 }, rectRadius: 0.1,
  })

  slide.addText('Como interpretar esta seção', {
    x: MX + 0.42, y: cY + 0.36, w: CW - 0.84, h: 0.36,
    fontSize: 19, bold: true, color: C.white, fontFace: 'Manrope',
  })

  slide.addText('Os indicadores de saúde mental apresentados possuem finalidade epidemiológica e organizacional.', {
    x: MX + 0.42, y: cY + 0.86, w: CW - 0.84, h: 0.26,
    fontSize: 12, bold: true, color: C.blue2, fontFace: 'Manrope',
  })

  const paragraphs = [
    'Eles descrevem padrões agregados de bem-estar e sintomas autorreferidos na população participante. Não constituem diagnóstico clínico, não permitem inferência individual e não substituem avaliação realizada por profissional habilitado.',
    'A leitura deve ocorrer em conjunto com os fatores de risco psicossociais e com o contexto de trabalho. Associações observadas indicam relações estatísticas e prioridades de investigação; não demonstram, isoladamente, causalidade ou nexo ocupacional.',
    'Resultados sensíveis devem ser tratados de forma agregada, confidencial e orientada à prevenção, ao acolhimento e ao encaminhamento adequado.',
  ]

  let py = cY + 1.3
  paragraphs.forEach((txt) => {
    const h = 0.16 + Math.max(1, Math.ceil(txt.length / 118)) * 0.22
    slide.addText(txt, {
      x: MX + 0.42, y: py, w: CW - 0.84, h,
      fontSize: 11, color: C.white, fontFace: 'Inter', valign: 'top',
    })
    py += h + 0.14
  })

  const footerY = cY + panelH + 0.18
  drawRoundedCard(slide, MX, footerY, CW, footerH, { fill: C.bluePale, borderColor: C.bluePale, radius: 0.06 })
  slide.addText(
    'Princípio de leitura: condições de trabalho primeiro; indicadores de saúde como informação complementar.',
    {
      x: MX + 0.32, y: footerY, w: CW - 0.6, h: footerH,
      fontSize: 10.8, bold: true, color: C.navy, fontFace: 'Manrope', valign: 'middle',
    },
  )
}

function addMentalHealthRiskIndexSlide(
  prs: PptxGenJS,
  data: ReportPayload,
  options?: { combinedRisk?: boolean; title?: string },
) {
  if (!data.hasWellbeing) return
  const combinedRisk = options?.combinedRisk ?? false

  const dist = data.mentalHealthClassDist ?? []
  const unsat = dist.find((item) => item.name === 'Insatisfatório')?.value ?? 0
  const regular = dist.find((item) => item.name === 'Regular')?.value ?? 0
  const good = dist.find((item) => item.name === 'Bom')?.value ?? 0
  const excellent = dist.find((item) => item.name === 'Excelente')?.value ?? 0
  const total = unsat + regular + good + excellent
  if (total === 0) return

  const goodPct = pct1(good, total)
  const excellentPct = pct1(excellent, total)
  const regularPct = pct1(regular, total)
  const unsatPct = pct1(unsat, total)
  const riskCombined = regular + unsat
  const healthyCombined = good + excellent
  const riskCombinedPct = pct1(riskCombined, total)
  const healthyCombinedPct = pct1(healthyCombined, total)
  const dominant = combinedRisk
    ? [
        { label: 'Bom + Excelente', pct: healthyCombinedPct },
        { label: 'Regular + Insatisfatório', pct: riskCombinedPct },
      ].sort((a, b) => b.pct - a.pct)[0]
    : [
        { label: 'Excelente', pct: excellentPct },
        { label: 'Bom', pct: goodPct },
        { label: 'Regular', pct: regularPct },
        { label: 'Insatisfatório', pct: unsatPct },
      ].sort((a, b) => b.pct - a.pct)[0]

  const excellentColor = '4C9A4A'
  const goodColor = C.low
  const healthyColor = goodColor
  const riskColorMh = C.high

  const sNum = getWellbeingSectionNumber(data)
  const title = options?.title ?? 'Índice de Saúde Mental Geral'
  const { slide, cY, cH } = mkBase(prs, title, data.clientName, `${sNum} | SAÚDE MENTAL`)

  const leftW = 6.25
  const gap = 0.26
  const rightX = MX + leftW + gap
  const rightW = CW - leftW - gap

  drawRoundedCard(slide, MX, cY, leftW, cH)
  slide.addShape('roundRect', { x: MX, y: cY, w: 0.07, h: cH,
    fill: { color: C.blue2 }, line: { color: C.blue2, width: 0 }, rectRadius: 0.09 })
  slide.addText('DISTRIBUIÇÃO GERAL DA CLASSIFICAÇÃO DE SAÚDE MENTAL', {
    x: MX + 0.22, y: cY + 0.14, w: leftW - 0.4, h: 0.22,
    fontSize: 8.2, bold: true, color: C.textLt, charSpacing: 1.2, fontFace: 'Manrope',
  })

  const donutSize = Math.min(4.55, leftW - 0.56)
  const donutX = MX + (leftW - donutSize) / 2
  const donutY = cY + 0.46 + Math.max(0, (cH - 0.66 - donutSize) / 2)
  const donutCenterY = donutY + donutSize / 2

  slide.addChart('doughnut', [{
    name: 'Trabalhadores',
    labels: combinedRisk
      ? ['Bom + Excelente', 'Regular + Insatisfatório']
      : ['Excelente', 'Bom', 'Regular', 'Insatisfatório'],
    values: combinedRisk
      ? [healthyCombined, riskCombined]
      : [excellent, good, regular, unsat],
  }], {
    x: donutX, y: donutY, w: donutSize, h: donutSize,
    chartColors: combinedRisk ? [healthyColor, riskColorMh] : [excellentColor, goodColor, C.mod, C.high],
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

  if (data.mentalHealthAvg !== null && data.mentalHealthAvg !== undefined) {
    const sc = mentalHealthColor(data.mentalHealthAvg)
    const sl = mentalHealthLabel(data.mentalHealthAvg)
    slide.addShape('roundRect', { x: rightX, y: cY, w: 0.07, h: 1.38,
      fill: { color: sc }, line: { color: sc, width: 0 }, rectRadius: 0.09 })
    slide.addText('Índice de Saúde Mental', {
      x: rightX + 0.22, y: cY + 0.18, w: 2.1, h: 0.18,
      fontSize: 8.2, color: C.textLt, fontFace: 'Inter',
    })
    slide.addText(data.mentalHealthAvg.toFixed(2), {
      x: rightX + 0.22, y: cY + 0.36, w: 1.8, h: 0.44,
      fontSize: 30, bold: true, color: sc, fontFace: 'Manrope',
    })
    slide.addText(sl, {
      x: rightX + 0.22, y: cY + 0.84, w: 2.2, h: 0.18,
      fontSize: 11.5, bold: true, color: sc, fontFace: 'Inter',
    })

    const ratio = Math.max(0, Math.min(1, data.mentalHealthAvg / 10))
    slide.addText('Índice de 0 a 10. Valores maiores indicam melhor condição de saúde mental.', {
      x: rightX + 1.58, y: cY + 0.3, w: rightW - 1.78, h: 0.24,
      fontSize: 7.1, color: C.textMd, fontFace: 'Inter',
    })
    slide.addShape('roundRect', { x: rightX + 1.58, y: cY + 0.84, w: rightW - 1.94, h: 0.18,
      fill: { color: 'E7EFE7' }, line: { color: 'E7EFE7', width: 0 }, rectRadius: 0.06 })
    slide.addShape('roundRect', { x: rightX + 1.58, y: cY + 0.84, w: (rightW - 1.94) * ratio, h: 0.18,
      fill: { color: sc }, line: { color: sc, width: 0 }, rectRadius: 0.06 })
  }

  const metrics = combinedRisk
    ? [
        { label: 'Bom + Excelente', pct: healthyCombinedPct, n: healthyCombined, color: healthyColor },
        { label: 'Regular + Insatisfatório', pct: riskCombinedPct, n: riskCombined, color: riskColorMh },
      ]
    : [
        { label: 'Excelente', pct: excellentPct, n: excellent, color: excellentColor },
        { label: 'Bom', pct: goodPct, n: good, color: goodColor },
        { label: 'Regular', pct: regularPct, n: regular, color: C.mod },
        { label: 'Insatisfatório', pct: unsatPct, n: unsat, color: C.high },
      ]

  metrics.forEach((metric, i) => {
    const y = cY + 1.52 + i * 0.92
    drawRoundedCard(slide, rightX, y, rightW, 0.78)
    slide.addShape('ellipse', { x: rightX + 0.22, y: y + 0.25, w: 0.11, h: 0.11,
      fill: { color: metric.color }, line: { color: metric.color, width: 0 } })
    slide.addText(metric.label, {
      x: rightX + 0.42, y: y + 0.18, w: 1.45, h: 0.16,
      fontSize: 8.1, bold: true, color: C.textDk, fontFace: 'Inter',
    })
    slide.addText(`${metric.n} trabalhadores`, {
      x: rightX + 0.42, y: y + 0.4, w: 1.6, h: 0.14,
      fontSize: 6.8, color: C.textLt, fontFace: 'Inter',
    })

    const trackX = rightX + 1.62
    const trackW = rightW - 2.78
    slide.addShape('roundRect', { x: trackX, y: y + 0.3, w: trackW, h: 0.16,
      fill: { color: 'EDF2F7' }, line: { color: 'EDF2F7', width: 0 }, rectRadius: 0.06 })
    slide.addShape('roundRect', { x: trackX, y: y + 0.3, w: Math.max(0.1, trackW * (metric.pct / 100)), h: 0.16,
      fill: { color: metric.color }, line: { color: metric.color, width: 0 }, rectRadius: 0.06 })

    slide.addText(fmtPct(metric.pct), {
      x: rightX + rightW - 0.76, y: y + 0.16, w: 0.58, h: 0.16,
      fontSize: 8.8, bold: true, color: C.textDk, align: 'right', fontFace: 'Manrope',
    })
  })
}

function addMentalHealthStratumRiskDistSlide(prs: PptxGenJS, data: ReportPayload) {
  const rows = (data.wellbeingStratumRows ?? [])
    .filter((row) => row.answered >= 5 && row.mentalValid >= 5)
    .sort((a, b) => b.mentalUnsatPct - a.mentalUnsatPct)

  if (!data.hasWellbeing || rows.length === 0) return

  const generalRow = (isCmpcReport(data) && data.stratum === 'rpt_unidade_produtiva')
    ? buildCmpcGeneralWellbeingRow(data)
    : null
  const allRows = generalRow ? [generalRow, ...rows] : rows

  const sNum = getWellbeingSectionNumber(data)
  const PAGE = 10
  const pages = Math.ceil(allRows.length / PAGE)

  for (let p = 0; p < pages; p++) {
    const pageRows = allRows.slice(p * PAGE, (p + 1) * PAGE)
    const suffix = pages > 1 ? ` (${p + 1}/${pages})` : ''
    const { slide, cY, cH } = mkBase(prs,
      `Distribuição de Saúde Mental por ${data.stratumLabel}${suffix}`,
      data.clientName,
      `${sNum} | SAÚDE MENTAL`,
    )

    const top = rows.reduce((best, row) => (row.mentalUnsatPct > best.mentalUnsatPct ? row : best), rows[0])
    // data.mentalHealthAvg (média de todos os respondentes) em vez de uma média das médias dos
    // grupos exibidos — ver o mesmo ajuste em addStratumDistSlide.
    const avgScore = data.mentalHealthAvg ?? null
    const kpiH = 0.92
    const kpiGap = 0.14
    const kpiW = (CW - kpiGap * 2) / 3
    const kpiY = cY
    const kpis = [
      { label: 'Grupos analisados', value: `${rows.length}`, sub: 'N >= 5 respostas válidas', color: C.blue2 },
      { label: 'Maior nível insatisfatório', value: fmtPct(top.mentalUnsatPct), sub: `${top.name}`, color: C.high },
      { label: 'Índice de saúde mental médio', value: avgScore !== null ? avgScore.toFixed(2).replace('.', ',') : '--', sub: 'escala de 0 a 10', color: avgScore !== null ? mentalHealthColor(avgScore) : C.textMd },
    ]

    kpis.forEach((kpi, i) => {
      const x = MX + i * (kpiW + kpiGap)
      drawRoundedCard(slide, x, kpiY, kpiW, kpiH)
      slide.addShape('roundRect', { x, y: kpiY, w: 0.07, h: kpiH,
        fill: { color: kpi.color }, line: { color: kpi.color, width: 0 }, rectRadius: 0.09 })
      slide.addText(kpi.value, {
        x: x + 0.2, y: kpiY + 0.16, w: kpiW - 0.28, h: 0.36,
        fontSize: 22, bold: true, color: kpi.color, fontFace: 'Manrope',
      })
      slide.addText(kpi.label, {
        x: x + 0.2, y: kpiY + 0.56, w: kpiW - 0.28, h: 0.14,
        fontSize: 7.6, color: C.textLt, fontFace: 'Manrope', charSpacing: 0.7,
      })
      slide.addText(kpi.sub, {
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
      `Distribuição percentual da classificação de saúde mental por ${data.stratumLabel.toLowerCase()}, ordenada por maior percentual de nível insatisfatório.`,
      { x: MX + 0.22, y: chartY + 0.18, w: CW - 0.38, h: 0.18, fontSize: 8.8, color: C.textLt, italic: true, fontFace: 'Inter' },
    )

    const plotX = MX + 0.22
    const plotY = chartY + 0.58
    const plotW = CW - 0.38
    const plotH = chartH - 0.86
    const labelW = 4.05
    const distX = plotX + labelW
    const distW = plotW - labelW - 0.08
    const rowGap = 0.07
    const barH = Math.min(0.32, (plotH - rowGap * (pageRows.length - 1)) / pageRows.length)

    slide.addText('DISTRIBUIÇÃO DE SAÚDE MENTAL (%)', {
      x: distX, y: chartY + 0.4, w: 2.42, h: 0.14,
      fontSize: 7.1, bold: true, color: C.textLt, charSpacing: 0.8, fontFace: 'Manrope', align: 'left', margin: 0,
    })

    const excellentColor = '4C9A4A'
    const goodColor = C.low

    slide.addText('● Insatisfatório', {
      x: distX + 2.45, y: chartY + 0.4, w: 1.02, h: 0.14,
      fontSize: 6.9, color: C.high, fontFace: 'Inter', align: 'left', margin: 0,
    })
    slide.addText('● Regular', {
      x: distX + 3.51, y: chartY + 0.4, w: 0.7, h: 0.14,
      fontSize: 6.9, color: C.mod, fontFace: 'Inter', align: 'left', margin: 0,
    })
    slide.addText('● Bom', {
      x: distX + 4.25, y: chartY + 0.4, w: 0.56, h: 0.14,
      fontSize: 6.9, color: goodColor, fontFace: 'Inter', align: 'left', margin: 0,
    })
    slide.addText('● Excelente', {
      x: distX + 4.82, y: chartY + 0.4, w: 0.84, h: 0.14,
      fontSize: 6.9, color: excellentColor, fontFace: 'Inter', align: 'left', margin: 0,
    })

    const ticks = [0, 25, 50, 75, 100]
    ticks.forEach((tick) => {
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

    pageRows.forEach((row, i) => {
      const y = plotY + i * (barH + rowGap)
      const isGeneral = row.name === 'CMPC (Geral)'
      const pctSum = Math.max(1, row.mentalUnsatPct + row.mentalRegularPct + row.mentalGoodPct + row.mentalExcellentPct)
      const unsatW = distW * (row.mentalUnsatPct / pctSum)
      const regularW = distW * (row.mentalRegularPct / pctSum)
      const goodW = distW * (row.mentalGoodPct / pctSum)
      const excellentW = Math.max(0, distW - unsatW - regularW - goodW)
      const [unsatN, regularN, goodN, excellentN] = splitCountsFromPct(
        row.mentalValid,
        [row.mentalUnsatPct, row.mentalRegularPct, row.mentalGoodPct, row.mentalExcellentPct],
      )
      const scoreTxt = row.mentalHealthAvg !== null ? `Índice ${row.mentalHealthAvg.toFixed(2).replace('.', ',')}` : 'Índice --'

      if (isGeneral) {
        slide.addShape('roundRect', { x: plotX - 0.06, y: y - 0.035, w: plotW + 0.06, h: barH + 0.07,
          fill: { color: 'EAF2FB' }, line: { color: C.blue2, width: 0.6 }, rectRadius: 0.05 })
      }

      slide.addText(`${row.name} (N=${row.answered})`, {
        x: plotX, y: y + 0.055, w: labelW - 1.1, h: 0.15,
        fontSize: 7.8, bold: isGeneral, color: isGeneral ? C.navy : C.textMd, fontFace: 'Inter',
      })

      slide.addText(scoreTxt, {
        x: plotX + labelW - 1, y: y + 0.055, w: 0.95, h: 0.15,
        fontSize: 7.3, bold: true, color: row.mentalHealthAvg !== null ? mentalHealthColor(row.mentalHealthAvg) : C.textLt,
        align: 'right', fontFace: 'Manrope',
      })

      slide.addShape('roundRect', { x: distX, y, w: distW, h: barH,
        fill: { color: 'F2F6FB' }, line: { color: 'F2F6FB', width: 0 }, rectRadius: 0.07 })
      if (unsatW > 0.002) {
        slide.addShape('roundRect', { x: distX, y, w: unsatW, h: barH,
          fill: { color: C.high }, line: { color: C.high, width: 0 }, rectRadius: 0.07 })
        drawRiskBarLabel(slide, distX, y, unsatW, barH, `${fmtPct(row.mentalUnsatPct)} (N=${unsatN})`, C.white)
      }
      if (regularW > 0.002) {
        slide.addShape('roundRect', { x: distX + unsatW, y, w: regularW, h: barH,
          fill: { color: C.mod }, line: { color: C.mod, width: 0 }, rectRadius: 0.07 })
        drawRiskBarLabel(slide, distX + unsatW, y, regularW, barH, `${fmtPct(row.mentalRegularPct)} (N=${regularN})`, C.textDk)
      }
      if (goodW > 0.002) {
        slide.addShape('roundRect', { x: distX + unsatW + regularW, y, w: goodW, h: barH,
          fill: { color: goodColor }, line: { color: goodColor, width: 0 }, rectRadius: 0.07 })
        drawRiskBarLabel(slide, distX + unsatW + regularW, y, goodW, barH, `${fmtPct(row.mentalGoodPct)} (N=${goodN})`, C.textDk)
      }
      if (excellentW > 0.002) {
        slide.addShape('roundRect', { x: distX + unsatW + regularW + goodW, y, w: excellentW, h: barH,
          fill: { color: excellentColor }, line: { color: excellentColor, width: 0 }, rectRadius: 0.07 })
        drawRiskBarLabel(slide, distX + unsatW + regularW + goodW, y, excellentW, barH, `${fmtPct(row.mentalExcellentPct)} (N=${excellentN})`, C.white)
      }
    })
  }
}

function addMentalHealthStratumSlide(prs: PptxGenJS, data: ReportPayload) {
  const rows = (data.wellbeingStratumRows ?? [])
    .filter((row) => row.answered >= 5)
    .sort((a, b) => (
      (b.severeStressPct + b.depressiveAlertPct + b.suicideRiskPct)
      - (a.severeStressPct + a.depressiveAlertPct + a.suicideRiskPct)
    ))
  if (!data.hasWellbeing || rows.length === 0) return

  const generalRow = (isCmpcReport(data) && data.stratum === 'rpt_unidade_produtiva')
    ? buildCmpcGeneralWellbeingRow(data)
    : null
  const allRows = generalRow ? [generalRow, ...rows] : rows

  const sNum = getWellbeingSectionNumber(data)
  const PAGE = 10
  const pages = Math.ceil(allRows.length / PAGE)

  for (let p = 0; p < pages; p++) {
    const pageRows = allRows.slice(p * PAGE, (p + 1) * PAGE)
    const suffix = pages > 1 ? ` (${p + 1}/${pages})` : ''
    const { slide, cY, cH } = mkBase(
      prs,
      `Estratificação de Saúde Mental por ${data.stratumLabel}${suffix}`,
      data.clientName,
      `${sNum} | SAÚDE MENTAL`,
    )

    slide.addText(
      `Grupos ordenados por maior criticidade combinada de risco de suicídio, estresse grave e sintomas depressivos, considerando ${data.stratumLabel.toLowerCase()} com N >= 5 respostas.`,
      { x: MX, y: cY, w: CW, h: 0.22, fontSize: 9.6, color: C.textMd, italic: true, fontFace: 'Inter' },
    )

    const panelY = cY + 0.28
    const panelH = cH - 0.3
    drawRoundedCard(slide, MX, panelY, CW, panelH)
    slide.addShape('roundRect', { x: MX, y: panelY, w: 0.07, h: panelH,
      fill: { color: C.blue2 }, line: { color: C.blue2, width: 0 }, rectRadius: 0.09 })

    const tableX = MX + 0.16
    const tableY = panelY + 0.42
    const tableW = CW - 0.32
    const tableH = panelH - 0.56
    const headerH = 0.4
    const rowGap = 0.05
    const rowH = Math.min(0.43, (tableH - headerH - rowGap * (pageRows.length - 1)) / pageRows.length)
    const orgW = 2.9
    const idxW = 1.2
    const metricW = (tableW - orgW - idxW) / 4

    const riskCellStyle = (pct: number): { bg: string; fg: string } => {
      const bg = heatRiskColor(pct)
      const fg = pct >= 70 ? C.white : C.textDk
      return { bg, fg }
    }

    const supportCellStyle = (pct: number): { bg: string; fg: string } => {
      const invertedRisk = Math.max(0, Math.min(100, 100 - pct))
      const bg = heatRiskColor(invertedRisk)
      const fg = invertedRisk >= 70 ? C.white : C.textDk
      return { bg, fg }
    }

    drawRoundedCard(slide, tableX, tableY, tableW, tableH, { fill: C.white, borderColor: C.border, radius: 0.06 })
    slide.addShape('roundRect', {
      x: tableX, y: tableY, w: tableW, h: headerH,
      fill: { color: 'F6F9FC' }, line: { color: 'F6F9FC', width: 0 }, rectRadius: 0.06,
    })

    const headers = ['ORGANIZAÇÃO', 'ÍNDICE', 'ESTRESSE GRAVE', 'ALERTA DEPRESSIVO', 'RISCO SUICIDA', 'REDE DE APOIO']
    const cols = [tableX, tableX + orgW, tableX + orgW + idxW, tableX + orgW + idxW + metricW, tableX + orgW + idxW + metricW * 2, tableX + orgW + idxW + metricW * 3]
    const widths = [orgW, idxW, metricW, metricW, metricW, metricW]

    headers.forEach((header, i) => {
      slide.addText(header, {
        x: cols[i] + 0.03,
        y: tableY + 0.13,
        w: widths[i] - 0.06,
        h: 0.14,
        fontSize: 7.7,
        bold: true,
        color: C.textMd,
        align: i === 0 ? 'left' : 'center',
        fontFace: 'Manrope',
      })
    })

    pageRows.forEach((row, i) => {
      const y = tableY + headerH + i * (rowH + rowGap)
      const idxValue = row.mentalHealthAvg !== null ? row.mentalHealthAvg.toFixed(2).replace('.', ',') : '--'
      const idxColor = row.mentalHealthAvg !== null ? mentalHealthColor(row.mentalHealthAvg) : C.textLt

      const stress = riskCellStyle(row.severeStressPct)
      const depress = riskCellStyle(row.depressiveAlertPct)
      const suicide = riskCellStyle(row.suicideRiskPct)
      const support = supportCellStyle(row.supportPresencePct)

      const isGeneral = row.name === 'CMPC (Geral)'
      const baseBg = isGeneral ? 'EAF2FB' : i % 2 === 0 ? C.white : 'FBFDFE'
      slide.addShape('rect', {
        x: tableX, y, w: tableW, h: rowH,
        fill: { color: baseBg }, line: { color: isGeneral ? C.blue2 : baseBg, width: isGeneral ? 0.6 : 0 },
      })

      slide.addText(row.name, {
        x: tableX + 0.06, y: y + 0.09, w: orgW - 0.12, h: 0.14,
        fontSize: 8.3, bold: true, color: isGeneral ? C.navy : C.textDk, fontFace: 'Inter',
      })
      slide.addText(`N=${row.answered}`, {
        x: tableX + orgW - 0.62, y: y + 0.09, w: 0.56, h: 0.14,
        fontSize: 7.1, color: C.textLt, align: 'right', fontFace: 'Inter',
      })

      slide.addText(idxValue, {
        x: tableX + orgW + 0.04, y: y + 0.09, w: idxW - 0.08, h: 0.14,
        fontSize: 8.3, bold: true, color: idxColor, align: 'center', fontFace: 'Manrope',
      })

      const metricCells = [
        { pct: row.severeStressPct, style: stress },
        { pct: row.depressiveAlertPct, style: depress },
        { pct: row.suicideRiskPct, style: suicide },
        { pct: row.supportPresencePct, style: support },
      ]

      metricCells.forEach((cell, m) => {
        const cx = tableX + orgW + idxW + metricW * m + 0.02
        slide.addShape('roundRect', {
          x: cx,
          y: y + 0.05,
          w: metricW - 0.04,
          h: rowH - 0.1,
          fill: { color: cell.style.bg },
          line: { color: cell.style.bg, width: 0 },
          rectRadius: 0.03,
        })
        slide.addText(fmtPct(cell.pct), {
          x: cx,
          y: y + 0.1,
          w: metricW - 0.04,
          h: 0.14,
          fontSize: 8.8,
          bold: true,
          color: cell.style.fg,
          align: 'center',
          fontFace: 'Manrope',
        })
      })

      slide.addShape('line', {
        x: tableX, y: y + rowH, w: tableW, h: 0,
        line: { color: 'EEF3F8', pt: 0.7 },
      })
    })
  }
}

function addMentalHealthPerceptionHeatmapSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasWellbeing) return

  const rows = (data.wellbeingPerceptionStratumRows ?? [])
    .filter((row) => row.answered >= 5)
    .filter((row) => row.mentalSelfHealthAvg !== null || row.lifeQualityAvg !== null)
    .sort((a, b) => {
      const aCombined = ((a.mentalSelfHealthAvg ?? 0) + (a.lifeQualityAvg ?? 0)) / 2
      const bCombined = ((b.mentalSelfHealthAvg ?? 0) + (b.lifeQualityAvg ?? 0)) / 2
      return aCombined - bCombined
    })

  if (rows.length === 0) return

  const sNum = getWellbeingSectionNumber(data)
  const PAGE = 12
  const pages = Math.ceil(rows.length / PAGE)

  for (let p = 0; p < pages; p++) {
    const pageRows = rows.slice(p * PAGE, (p + 1) * PAGE)
    const suffix = pages > 1 ? ` (${p + 1}/${pages})` : ''
    const { slide, cY, cH } = mkBase(
      prs,
      `Heatmap de Percepção por ${data.stratumLabel}${suffix}`,
      data.clientName,
      `${sNum} | SAÚDE MENTAL`,
    )

    drawRoundedCard(slide, MX, cY, CW, cH)
    slide.addShape('roundRect', {
      x: MX,
      y: cY,
      w: 0.07,
      h: cH,
      fill: { color: C.mintDk },
      line: { color: C.mintDk, width: 0 },
      rectRadius: 0.09,
    })

    slide.addText(
      `Leitura por ${data.stratumLabel.toLowerCase()}: médias de percepção de saúde mental e qualidade de vida (escala de 0 a 10), considerando grupos com N >= 5 respostas.`,
      {
        x: MX + 0.22,
        y: cY + 0.14,
        w: CW - 0.36,
        h: 0.18,
        fontSize: 8.8,
        color: C.textLt,
        italic: true,
        fontFace: 'Inter',
      },
    )

    const tableX = MX + 0.16
    const tableY = cY + 0.38
    const tableW = CW - 0.3
    const tableH = cH - 0.84
    const legendH = 0.3
    const headerH = 0.44
    const bodyH = tableH - headerH

    const nameW = 3.55
    const nW = 0.9
    const metricW = (tableW - nameW - nW) / 2

    drawRoundedCard(slide, tableX, tableY, tableW, tableH, { fill: C.white, borderColor: C.border, radius: 0.06 })
    slide.addShape('roundRect', {
      x: tableX,
      y: tableY,
      w: tableW,
      h: headerH,
      fill: { color: 'F6F9FC' },
      line: { color: 'F6F9FC', width: 0 },
      rectRadius: 0.06,
    })

    const headers = [(data.stratumLabel || 'Estrato').toUpperCase(), 'N', 'PERCEPÇÃO DE SAÚDE', 'QUALIDADE DE VIDA']
    const cols = [tableX, tableX + nameW, tableX + nameW + nW, tableX + nameW + nW + metricW]
    const widths = [nameW, nW, metricW, metricW]

    headers.forEach((header, i) => {
      slide.addText(header, {
        x: cols[i] + 0.03,
        y: tableY + 0.14,
        w: widths[i] - 0.06,
        h: 0.14,
        fontSize: 7.5,
        bold: true,
        color: C.textMd,
        align: i === 0 ? 'left' : 'center',
        fontFace: 'Manrope',
      })
    })

    const rowH = Math.min(0.36, bodyH / pageRows.length)
    pageRows.forEach((row, idx) => {
      const ry = tableY + headerH + idx * rowH
      const rowBg = idx % 2 === 0 ? C.white : 'FAFCFE'

      slide.addShape('rect', {
        x: tableX,
        y: ry,
        w: tableW,
        h: rowH,
        fill: { color: rowBg },
        line: { color: rowBg, width: 0 },
      })

      slide.addText(row.name, {
        x: tableX + 0.08,
        y: ry + 0.1,
        w: nameW - 0.12,
        h: rowH - 0.12,
        fontSize: 8.2,
        bold: true,
        color: C.textDk,
        fontFace: 'Inter',
      })

      slide.addText(String(row.answered), {
        x: tableX + nameW + 0.03,
        y: ry + 0.1,
        w: nW - 0.06,
        h: rowH - 0.12,
        fontSize: 8.1,
        bold: true,
        color: C.textDk,
        align: 'center',
        fontFace: 'Manrope',
      })

      const metricCells = [
        { avg: row.mentalSelfHealthAvg, cx: tableX + nameW + nW },
        { avg: row.lifeQualityAvg, cx: tableX + nameW + nW + metricW },
      ]

      metricCells.forEach((cell) => {
        const fill = cell.avg === null ? 'EEF3F8' : heatRiskColor(riskSeverityPct(cell.avg))
        const fg = cell.avg === null ? C.textLt : (riskSeverityPct(cell.avg) >= 70 ? C.white : C.textDk)
        const txt = cell.avg === null ? '--' : cell.avg.toFixed(2).replace('.', ',')

        slide.addShape('roundRect', {
          x: cell.cx + 0.03,
          y: ry + 0.06,
          w: metricW - 0.06,
          h: rowH - 0.12,
          fill: { color: fill },
          line: { color: fill, width: 0 },
          rectRadius: 0.03,
        })

        slide.addText(txt, {
          x: cell.cx + 0.03,
          y: ry + 0.1,
          w: metricW - 0.06,
          h: rowH - 0.14,
          fontSize: 8.6,
          bold: true,
          color: fg,
          align: 'center',
          fontFace: 'Manrope',
        })
      })

      slide.addShape('line', {
        x: tableX,
        y: ry + rowH,
        w: tableW,
        h: 0,
        line: { color: 'EEF3F8', pt: 0.7 },
      })
    })

    const legendY = cY + cH - legendH - 0.12
    slide.addShape('roundRect', {
      x: MX + 0.18,
      y: legendY,
      w: CW - 0.36,
      h: legendH,
      fill: { color: C.smoke },
      line: { color: C.border, width: 0.5 },
      rectRadius: 0.04,
    })

    slide.addText('Média (0 a 10)', {
      x: MX + 0.34,
      y: legendY + 0.09,
      w: 1.2,
      h: 0.14,
      fontSize: 8,
      bold: true,
      color: C.textMd,
      fontFace: 'Inter',
    })

    const scaleX = MX + 1.7
    const scaleY = legendY + 0.1
    const scaleW = 3.2
    const steps = 32
    for (let i = 0; i < steps; i++) {
      const score = (i / Math.max(steps - 1, 1)) * 10
      const fill = heatRiskColor(riskSeverityPct(score))
      slide.addShape('rect', {
        x: scaleX + (i * scaleW) / steps,
        y: scaleY,
        w: scaleW / steps + 0.002,
        h: 0.12,
        fill: { color: fill },
        line: { color: fill, width: 0 },
      })
    }

    slide.addText('0', {
      x: scaleX - 0.02,
      y: scaleY + 0.14,
      w: 0.2,
      h: 0.12,
      fontSize: 6.8,
      color: C.textLt,
      fontFace: 'Inter',
      align: 'left',
    })
    slide.addText('10', {
      x: scaleX + scaleW - 0.2,
      y: scaleY + 0.14,
      w: 0.3,
      h: 0.12,
      fontSize: 6.8,
      color: C.textLt,
      fontFace: 'Inter',
      align: 'right',
    })
  }
}

function addMentalHealthLifestyleSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasWellbeing) return

  const sNum = getWellbeingSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Hábitos e Fatores Complementares', data.clientName, `${sNum} | SAÚDE MENTAL`)

  const buildRows = (dist: Distribution[] | undefined): { name: string; value: number; pct: number }[] => {
    const safe = (dist ?? []).filter((item) => item.value > 0)
    const total = safe.reduce((sum, item) => sum + item.value, 0)
    if (total <= 0) return []
    return safe
      .sort((a, b) => b.value - a.value)
      .map((item) => ({ name: item.name, value: item.value, pct: pct1(item.value, total) }))
  }

  const tobaccoRows = buildRows(data.tobaccoDist)
  const alcoholRows = buildRows(data.alcoholDist)
  const internetRows = buildRows(data.internetDist)
  const supportRows = buildRows(data.supportDist)

  const pctByName = (rows: { name: string; value: number; pct: number }[], matcher: (name: string) => boolean): number => rows
    .filter((row) => matcher(row.name.toLowerCase()))
    .reduce((sum, row) => sum + row.pct, 0)

  const buildLifestyleInsight = (title: string, rows: { name: string; value: number; pct: number }[]): string => {
    const top = rows[0]
    if (!top) return 'Sem base suficiente para leitura descritiva.'

    if (title === 'Uso de tabaco') {
      const currentSmoking = pctByName(rows, (name) => name === 'fumante')
      // "não fumante" contém a substring "fumante", então precisa ser excluído explicitamente
      // — senão o "não fumante" (maioria da base) entra na soma de exposição atual/pregressa.
      const anySmoking = pctByName(rows, (name) => name.includes('fumante') && !name.includes('não fumante'))
      return `Predomina ${top.name.toLowerCase()} em ${fmtPct(top.pct)}. Exposição atual ou pregressa ao tabaco aparece em ${fmtPct(anySmoking)}, com fumantes atuais em ${fmtPct(currentSmoking)}.`
    }

    if (title === 'Uso de bebidas alcoólicas') {
      const attention = pctByName(rows, (name) => name.includes('moderado') || name.includes('binge'))
      const binge = pctByName(rows, (name) => name.includes('binge'))
      return `${top.name} concentra ${fmtPct(top.pct)} da base. O consumo que pede atenção soma ${fmtPct(attention)}, incluindo ${fmtPct(binge)} em padrão binge.`
    }

    if (title === 'Dependência de internet') {
      const lowExposure = pctByName(rows, (name) => name.includes('ausente') || name.includes('leve'))
      const criticalExposure = pctByName(rows, (name) => name.includes('moderada') || name.includes('alta'))
      return `Os níveis ${rows.slice(0, 2).map((row) => row.name.toLowerCase()).join(' e ')} lideram a distribuição. Ainda assim, dependência moderada ou alta reúne ${fmtPct(criticalExposure)}, frente a ${fmtPct(lowExposure)} em ausência ou leve.`
    }

    const support = pctByName(rows, (name) => name.includes('com apoio'))
    const noSupport = pctByName(rows, (name) => name.includes('sem apoio'))
    return `A proteção social é majoritária: ${fmtPct(support)} relatam apoio disponível. Por outro lado, ${fmtPct(noSupport)} não identificam rede de apoio, grupo que exige vigilância no acolhimento.`
  }

  const sections = [
    {
      title: 'Uso de tabaco',
      rows: tobaccoRows,
      colorFor: (name: string) => {
        const n = name.toLowerCase()
        if (n.includes('não fumante')) return C.low
        if (n.includes('ex-fumante') || n.includes('passivo')) return C.mod
        if (n.includes('fumante')) return C.high
        return C.textMd
      },
    },
    {
      title: 'Uso de bebidas alcoólicas',
      rows: alcoholRows,
      colorFor: (name: string) => {
        const n = name.toLowerCase()
        if (n.includes('não bebe')) return C.low
        if (n.includes('moderado')) return C.mod
        if (n.includes('binge')) return C.high
        return C.textMd
      },
    },
    {
      title: 'Dependência de internet',
      rows: internetRows,
      colorFor: (name: string) => {
        const n = name.toLowerCase()
        if (n.includes('ausente')) return C.low
        if (n.includes('leve')) return C.mod
        if (n.includes('moderada') || n.includes('alta')) return C.high
        return C.textMd
      },
    },
    {
      title: 'Rede de apoio',
      rows: supportRows,
      colorFor: (name: string) => {
        const n = name.toLowerCase()
        if (n.includes('com apoio')) return C.low
        if (n.includes('sem apoio')) return C.high
        return C.textMd
      },
    },
  ]

  const headerY = cY + 0.02
  slide.addText('Distribuições observadas na base respondente para hábitos de saúde e fatores de proteção psicossocial.', {
    x: MX, y: headerY, w: CW, h: 0.2,
    fontSize: 9.6, color: C.textMd, italic: true, fontFace: 'Inter',
  })

  const gap = 0.22
  const cardW = (CW - gap) / 2
  const cardH = (cH - 0.3 - 0.22) / 2
  const startY = cY + 0.26

  sections.forEach((section, idx) => {
    const col = idx % 2
    const row = Math.floor(idx / 2)
    const x = MX + col * (cardW + gap)
    const y = startY + row * (cardH + 0.22)

    drawRoundedCard(slide, x, y, cardW, cardH)
    slide.addShape('roundRect', {
      x, y, w: 0.07, h: cardH,
      fill: { color: C.blue2 }, line: { color: C.blue2, width: 0 }, rectRadius: 0.09,
    })

    slide.addText(section.title.toUpperCase(), {
      x: x + 0.22, y: y + 0.12, w: cardW - 0.34, h: 0.16,
      fontSize: 8.1, bold: true, color: C.textLt, charSpacing: 1, fontFace: 'Manrope',
    })

    const rows = section.rows.slice(0, 5)
    const footerText = buildLifestyleInsight(section.title, rows)
    if (rows.length === 0) {
      slide.addText('Sem dados suficientes nesta base.', {
        x: x + 0.22, y: y + 0.5, w: cardW - 0.34, h: 0.2,
        fontSize: 8.4, color: C.textLt, italic: true, fontFace: 'Inter',
      })
      return
    }

    const rowStartY = y + 0.42
    const rowGap = 0.08
  const footerH = 0.74
  const barH = Math.min(0.18, (cardH - footerH - 0.68 - rowGap * (rows.length - 1)) / rows.length)
    const labelW = cardW * 0.48
    const pctW = 1.2
    const trackW = cardW - labelW - pctW - 0.36

    rows.forEach((item, itemIdx) => {
      const ry = rowStartY + itemIdx * (barH + rowGap)
      const color = section.colorFor(item.name)
      const fillW = Math.max(0.1, trackW * (item.pct / 100))

      slide.addText(item.name, {
        x: x + 0.22, y: ry + 0.01, w: labelW - 0.06, h: 0.14,
        fontSize: 7.4, color: C.textDk, fontFace: 'Inter', margin: 0,
      })

      const barX = x + 0.22 + labelW
      slide.addShape('roundRect', {
        x: barX, y: ry, w: trackW, h: barH,
        fill: { color: 'EFF3F8' }, line: { color: 'EFF3F8', width: 0 }, rectRadius: 0.05,
      })
      slide.addShape('roundRect', {
        x: barX, y: ry, w: fillW, h: barH,
        fill: { color }, line: { color, width: 0 }, rectRadius: 0.05,
      })

      if (false) slide.addText(`${fmtPct(item.pct)} (N=${item.value})`, { x: barX, y: ry, w: fillW, h: barH })

      slide.addText(`${fmtPct(item.pct)} (N = ${item.value})`, {
        x: x + cardW - pctW - 0.14, y: ry - 0.01, w: pctW, h: 0.14,
        fontSize: 7.8, bold: true, color, align: 'right', fontFace: 'Manrope', margin: 0,
      })
    })

    slide.addText(footerText, {
      x: x + 0.22, y: y + cardH - footerH + 0.06, w: cardW - 0.34, h: footerH - 0.12,
      fontSize: 9.5, color: C.textMd, fontFace: 'Inter', valign: 'mid', margin: 0,
    })
  })
}

function findWellbeingSliceByArea(data: ReportPayload): { label: string; rows: WellbeingStratumRow[] } {
  const slices = data.stratifiedWellbeing ?? []
  const preferredOrder = [
    'organizacao_nivel_4',
    'organizacao_nivel_3',
    'organizacao_nivel_2',
    'organizacao_nivel_1',
    data.stratum,
    'especialidade',
  ]

  for (const key of preferredOrder) {
    const byArea = slices.find((slice) => slice.stratum === key && slice.wellbeingStratumRows.length > 0)
    if (byArea) return { label: byArea.stratumLabel, rows: byArea.wellbeingStratumRows }
  }

  const firstAvailable = slices.find((slice) => slice.wellbeingStratumRows.length > 0)
  if (firstAvailable) return { label: firstAvailable.stratumLabel, rows: firstAvailable.wellbeingStratumRows }

  return { label: data.stratumLabel, rows: data.wellbeingStratumRows ?? [] }
}

function addMentalHealthSymptomsSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasWellbeing) return

  const sNum = getWellbeingSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Sintomas, Incidência e Prevalência', data.clientName, `${sNum} | SAÚDE MENTAL`)

  const total = (data.stressDist ?? []).reduce((sum, item) => sum + item.value, 0)
  if (total === 0) return

  const severeStress = data.stressDist?.find((item) => item.name === 'Sintomas Graves')?.value ?? 0
  const depressiveAlert = (data.depressionDist ?? [])
    .filter((item) => item.name === 'Sintomas Moderados' || item.name === 'Sintomas Graves')
    .reduce((sum, item) => sum + item.value, 0)
  const suicideRisk = data.suicideRiskDist?.find((item) => item.name === 'Com risco')?.value ?? 0

  const severeStressPct = pct1(severeStress, total)
  const depressiveAlertPct = pct1(depressiveAlert, total)
  const suicideRiskPct = pct1(suicideRisk, total)

  const areaSource = findWellbeingSliceByArea(data)
  const groups = areaSource.rows.filter((row) => row.answered >= 5)
  const severeRecurringCount = groups.filter((row) => row.severeStressPct >= 15).length
  const depressiveRecurringCount = groups.filter((row) => row.depressiveAlertPct >= 20).length
  const suicideRecurringCount = groups.filter((row) => row.suicideRiskPct > 0).length
  const severeRecurrence = pct1(severeRecurringCount, groups.length)
  const depressiveRecurrence = pct1(depressiveRecurringCount, groups.length)
  const suicideRecurrence = pct1(suicideRecurringCount, groups.length)

  const kpiY = cY + 0.16
  const kpiH = 1.08
  const kpiGap = 0.16
  const kpiW = (CW - kpiGap * 5) / 6
  const kpis = [
    { value: fmtPct(severeStressPct), label: 'incid. estresse grave', sub: `${severeStress} pessoas`, color: C.high },
    { value: fmtPct(depressiveAlertPct), label: 'incid. sintomas depressivos', sub: `${depressiveAlert} pessoas`, color: C.mod },
    { value: fmtPct(suicideRiskPct), label: 'incid. risco de suicídio', sub: `${suicideRisk} pessoas`, color: C.high },
    { value: fmtPct(severeRecurrence), label: 'prev. estresse grave', sub: `${severeRecurringCount}/${groups.length} grupos`, color: C.high },
    { value: fmtPct(depressiveRecurrence), label: 'prev. sintomas depressivos', sub: `${depressiveRecurringCount}/${groups.length} grupos`, color: C.mod },
    { value: fmtPct(suicideRecurrence), label: 'prev. risco suicida', sub: `${suicideRecurringCount}/${groups.length} grupos`, color: C.high },
  ]

  kpis.forEach((kpi, idx) => {
    const x = MX + idx * (kpiW + kpiGap)
    drawRoundedCard(slide, x, kpiY, kpiW, kpiH)
    slide.addShape('roundRect', {
      x, y: kpiY, w: 0.07, h: kpiH,
      fill: { color: kpi.color }, line: { color: kpi.color, width: 0 }, rectRadius: 0.09,
    })
    slide.addText(kpi.value, {
      x: x + 0.2, y: kpiY + 0.2, w: kpiW - 0.28, h: 0.28,
      fontSize: 15, bold: true, color: kpi.color, fontFace: 'Manrope',
    })
    slide.addText(kpi.label, {
      x: x + 0.2, y: kpiY + 0.58, w: kpiW - 0.28, h: 0.14,
      fontSize: 6.8, color: C.textLt, fontFace: 'Inter',
    })
    slide.addText(kpi.sub, {
      x: x + 0.2, y: kpiY + 0.82, w: kpiW - 0.28, h: 0.14,
      fontSize: 7.4, color: C.textDk, fontFace: 'Inter',
    })
  })

  const panelY = kpiY + kpiH + 0.18
  const panelH = cH - (panelY - cY)
  const gap = 0.24
  const leftW = (CW - gap) / 2
  const rightX = MX + leftW + gap

  const normalize = (rows: Distribution[] | undefined): { name: string; value: number; pct: number }[] => {
    const safe = (rows ?? []).filter((item) => item.value > 0)
    const sum = safe.reduce((acc, item) => acc + item.value, 0)
    if (sum <= 0) return []
    return safe.map((item) => ({ name: item.name, value: item.value, pct: pct1(item.value, sum) }))
      .sort((a, b) => b.pct - a.pct)
  }

  const stressRows = normalize(data.stressDist)
  const depressionRows = normalize(data.depressionDist)

  const pctFromRows = (rows: { name: string; value: number; pct: number }[], names: string[]): number => rows
    .filter((row) => names.includes(row.name))
    .reduce((sum, row) => sum + row.pct, 0)

  const drawDistributionCard = (
    x: number,
    title: string,
    rows: { name: string; value: number; pct: number }[],
    colorFor: (name: string) => string,
  ) => {
    const moderateAndSevere = pctFromRows(rows, ['Sintomas Moderados', 'Sintomas Graves'])
    const lowBurden = pctFromRows(rows, ['Ausência de Sintomas', 'Sintomas Leves'])
    const severeOnly = pctFromRows(rows, ['Sintomas Graves'])
    const footerText = title === 'Distribuição de estresse'
      ? `Estresse moderado ou grave soma ${fmtPct(moderateAndSevere)} da base, com ${fmtPct(severeOnly)} já em sintomas graves. Ausência ou quadro leve concentram ${fmtPct(lowBurden)}.`
      : `Os sintomas depressivos potenciais concentram ${fmtPct(moderateAndSevere)}, considerando sintomas moderados e graves. Os casos graves representam ${fmtPct(severeOnly)}, enquanto ausência ou quadros leves reúnem ${fmtPct(lowBurden)}.`

    drawRoundedCard(slide, x, panelY, leftW, panelH)
    slide.addShape('roundRect', {
      x, y: panelY, w: 0.07, h: panelH,
      fill: { color: C.blue2 }, line: { color: C.blue2, width: 0 }, rectRadius: 0.09,
    })
    slide.addText(title.toUpperCase(), {
      x: x + 0.22, y: panelY + 0.14, w: leftW - 0.34, h: 0.16,
      fontSize: 8.2, bold: true, color: C.textLt, charSpacing: 1, fontFace: 'Manrope',
    })

    const listed = rows.slice(0, 5)
    if (listed.length === 0) {
      slide.addText('Sem dados suficientes.', {
        x: x + 0.22, y: panelY + 0.56, w: leftW - 0.34, h: 0.2,
        fontSize: 8.4, color: C.textLt, italic: true, fontFace: 'Inter',
      })
      return
    }

    const rowStartY = panelY + 0.46
    const rowGap = 0.09
  const footerH = 0.74
  const barH = Math.min(0.2, (panelH - footerH - 0.72 - rowGap * (listed.length - 1)) / listed.length)
    const labelW = leftW * 0.48
    const pctW = 1.2
    const trackW = leftW - labelW - pctW - 0.36

    listed.forEach((item, idx) => {
      const ry = rowStartY + idx * (barH + rowGap)
      const color = colorFor(item.name)
      const fillW = Math.max(0.1, trackW * (item.pct / 100))
      const barX = x + 0.22 + labelW

      slide.addText(item.name, {
        x: x + 0.22, y: ry + 0.01, w: labelW - 0.06, h: 0.14,
        fontSize: 7.5, color: C.textDk, fontFace: 'Inter', margin: 0,
      })
      slide.addShape('roundRect', {
        x: barX, y: ry, w: trackW, h: barH,
        fill: { color: 'EFF3F8' }, line: { color: 'EFF3F8', width: 0 }, rectRadius: 0.05,
      })
      slide.addShape('roundRect', {
        x: barX, y: ry, w: fillW, h: barH,
        fill: { color }, line: { color, width: 0 }, rectRadius: 0.05,
      })
      slide.addText(`${fmtPct(item.pct)} (N = ${item.value})`, {
        x: x + leftW - pctW - 0.14, y: ry - 0.01, w: pctW, h: 0.14,
        fontSize: 7.8, bold: true, color, align: 'right', fontFace: 'Manrope', margin: 0,
      })
    })

    slide.addText(footerText, {
      x: x + 0.22, y: panelY + panelH - footerH + 0.06, w: leftW - 0.34, h: footerH - 0.12,
      fontSize: 9.5, color: C.textMd, fontFace: 'Inter', valign: 'mid', margin: 0,
    })
  }

  drawDistributionCard(
    MX,
    'Distribuição de estresse',
    stressRows,
    (name) => name === 'Sintomas Graves' ? C.high : name === 'Sintomas Moderados' ? C.mod : C.low,
  )

  drawDistributionCard(
    rightX,
    'Distribuição de sintomas depressivos',
    depressionRows,
    (name) => name === 'Sintomas Graves' ? C.high : name === 'Sintomas Moderados' ? C.mod : C.low,
  )
}

function addMentalHealthTopDriversSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasWellbeing) return

  const stressSources = (data.stressSourcesTop ?? []).slice(0, 6)
  const stressSymptoms = (data.stressSymptomsTop ?? []).slice(0, 6)
  const depressionSymptoms = (data.depressionSymptomsTop ?? []).slice(0, 6)
  if (stressSources.length === 0 && stressSymptoms.length === 0 && depressionSymptoms.length === 0) return

  const sNum = getWellbeingSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Principais Fontes e Sintomas', data.clientName, `${sNum} | SAÚDE MENTAL`)

  slide.addText(
    'Rankings por recorrência entre trabalhadores respondentes (percentual de pessoas que marcaram cada item).',
    { x: MX, y: cY + 0.02, w: CW, h: 0.2, fontSize: 9.5, color: C.textMd, italic: true, fontFace: 'Inter' },
  )

  const panelY = cY + 0.28
  const panelH = cH - 0.28
  const gap = 0.2
  const colW = (CW - gap * 2) / 3

  const sections: Array<{ title: string; x: number; rows: WellbeingRecurringItem[]; color: string }> = [
    { title: 'Fontes de estresse', x: MX, rows: stressSources, color: C.mod },
    { title: 'Sintomas de estresse', x: MX + colW + gap, rows: stressSymptoms, color: C.high },
    { title: 'Sintomas depressivos', x: MX + (colW + gap) * 2, rows: depressionSymptoms, color: C.blue },
  ]

  sections.forEach((section) => {
    drawRoundedCard(slide, section.x, panelY, colW, panelH)
    slide.addShape('roundRect', {
      x: section.x,
      y: panelY,
      w: 0.07,
      h: panelH,
      fill: { color: section.color },
      line: { color: section.color, width: 0 },
      rectRadius: 0.09,
    })

    slide.addText(section.title.toUpperCase(), {
      x: section.x + 0.22, y: panelY + 0.14, w: colW - 0.34, h: 0.16,
      fontSize: 8, bold: true, color: C.textLt, charSpacing: 1, fontFace: 'Manrope',
    })

    if (section.rows.length === 0) {
      slide.addText('Sem dados suficientes.', {
        x: section.x + 0.22, y: panelY + 0.58, w: colW - 0.34, h: 0.2,
        fontSize: 8.4, color: C.textLt, italic: true, fontFace: 'Inter',
      })
      return
    }

    const leader = section.rows[0]
    const second = section.rows[1]
    const spread = second ? trunc1(leader.pct - second.pct) : leader.pct
    // Cada item é um percentual independente de respondentes que marcaram aquela opção (seleção
    // múltipla) — não soma "% das recorrências", já que a mesma pessoa pode contar em vários
    // itens ao mesmo tempo. Por isso o texto não agrega os 3 primeiros num único percentual.
    const footerText = second
      ? `${leader.name} lidera com ${fmtPct(leader.pct)}, seguido por ${second.name.toLowerCase()} em ${fmtPct(second.pct)} — vantagem de ${fmtPct(spread)} do primeiro para o segundo.`
      : `${leader.name} concentra ${fmtPct(leader.pct)} e aparece como principal sinal desta leitura, sem concorrência relevante de outros itens nesta base.`

    const startY = panelY + 0.42
    const gapY = 0.08
    const footerH = 0.94
    const rowH = Math.min(0.34, (panelH - footerH - 0.64 - gapY * (section.rows.length - 1)) / section.rows.length)
    const rankW = 0.25
    const labelW = colW * 0.51
    const pctW = 0.64
    const nW = 0.92
    const trackW = colW - rankW - labelW - pctW - 0.26

    section.rows.forEach((row, i) => {
      const y = startY + i * (rowH + gapY)
      const barW = Math.max(0.08, trackW * (row.pct / 100))
      const barX = section.x + 0.22 + rankW + labelW

      slide.addText(`${i + 1}º`, {
        x: section.x + 0.22, y: y + 0.01, w: rankW - 0.04, h: 0.14,
        fontSize: 7.8, bold: true, color: section.color, align: 'center', fontFace: 'Manrope', margin: 0,
      })
      slide.addText(row.name, {
        x: section.x + 0.22 + rankW, y: y + 0.01, w: labelW - 0.06, h: 0.14,
        fontSize: 7.2, color: C.textDk, fontFace: 'Inter', margin: 0,
      })

      slide.addShape('roundRect', {
        x: barX, y, w: trackW, h: rowH,
        fill: { color: 'EFF3F8' }, line: { color: 'EFF3F8', width: 0 }, rectRadius: 0.05,
      })
      slide.addShape('roundRect', {
        x: barX, y, w: barW, h: rowH,
        fill: { color: section.color }, line: { color: section.color, width: 0 }, rectRadius: 0.05,
      })
      slide.addText(fmtPct(row.pct), {
        x: section.x + colW - pctW - 0.14, y: y - 0.01, w: pctW, h: 0.14,
        fontSize: 7.7, bold: true, color: section.color, align: 'right', fontFace: 'Manrope', margin: 0,
      })
      slide.addText(`(N = ${row.value})`, {
        x: section.x + colW - nW - 0.14, y: y + 0.11, w: nW, h: 0.12,
        fontSize: 6.8, bold: true, color: section.color, align: 'right', fontFace: 'Inter', margin: 0,
      })
    })

    slide.addText(footerText, {
      x: section.x + 0.22, y: panelY + panelH - footerH + 0.08, w: colW - 0.34, h: footerH - 0.14,
      fontSize: 9.5, color: C.textMd, fontFace: 'Inter', valign: 'mid', margin: 0,
    })
  })
}

function addMentalHealthClimateAnxietySlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasWellbeing) return

  const exposureDist = data.climateExposureDist ?? []
  const exposed = exposureDist.find((item) => item.name === 'Expostos')?.value ?? 0
  const notExposed = exposureDist.find((item) => item.name === 'Não expostos')?.value ?? 0
  const total = exposed + notExposed
  if (total === 0) return

  const exposedPct = pct1(exposed, total)
  const notExposedPct = pct1(notExposed, total)
  const ranking = [...(data.disasterTypeDist ?? [])]
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  const sNum = getWellbeingSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Ansiedade Climática e Exposição a Desastres', data.clientName, `${sNum} | SAÚDE MENTAL`)

  const gap = 0.24
  const leftW = 4.1
  const midW = 4.45
  const rightW = CW - leftW - midW - gap * 2
  const leftX = MX
  const midX = leftX + leftW + gap
  const rightX = midX + midW + gap

  drawRoundedCard(slide, leftX, cY, leftW, cH)
  slide.addShape('roundRect', { x: leftX, y: cY, w: 0.07, h: cH,
    fill: { color: C.blue2 }, line: { color: C.blue2, width: 0 }, rectRadius: 0.09 })
  slide.addText('EXPOSIÇÃO A DESASTRES NATURAIS', {
    x: leftX + 0.22, y: cY + 0.14, w: leftW - 0.36, h: 0.2,
    fontSize: 8.1, bold: true, color: C.textLt, charSpacing: 1, fontFace: 'Manrope',
  })

  const donutSize = Math.min(3.1, leftW - 0.5)
  const donutX = leftX + (leftW - donutSize) / 2
  const donutY = cY + 0.52
  const donutCenterY = donutY + donutSize / 2

  slide.addChart('doughnut', [{
    name: 'Trabalhadores',
    labels: ['Expostos', 'Não expostos'],
    values: [exposed, notExposed],
  }], {
    x: donutX, y: donutY, w: donutSize, h: donutSize,
    chartColors: [C.high, C.low],
    showLegend: false,
    showTitle: false,
    showDataLabels: false,
    holeSize: 66,
  })

  slide.addText(fmtPct(exposedPct), {
    x: donutX + donutSize * 0.22, y: donutCenterY - 0.3, w: donutSize * 0.56, h: 0.42,
    fontSize: 20, bold: true, color: C.textDk, align: 'center', fontFace: 'Manrope', valign: 'mid',
  })
  slide.addText('Expostos', {
    x: donutX + donutSize * 0.22, y: donutCenterY + 0.02, w: donutSize * 0.56, h: 0.2,
    fontSize: 10, bold: true, color: C.textMd, align: 'center', fontFace: 'Inter', valign: 'mid',
  })

  slide.addText(`● Expostos: ${fmtPct(exposedPct)} (${exposed})`, {
    x: leftX + 0.3, y: cY + cH - 0.58, w: leftW - 0.56, h: 0.16,
    fontSize: 8.2, color: C.high, fontFace: 'Inter',
  })
  slide.addText(`● Não expostos: ${fmtPct(notExposedPct)} (${notExposed})`, {
    x: leftX + 0.3, y: cY + cH - 0.36, w: leftW - 0.56, h: 0.16,
    fontSize: 8.2, color: C.low, fontFace: 'Inter',
  })

  drawRoundedCard(slide, midX, cY, midW, cH)
  slide.addShape('roundRect', { x: midX, y: cY, w: 0.07, h: cH,
    fill: { color: C.mod }, line: { color: C.mod, width: 0 }, rectRadius: 0.09 })
  slide.addText('TIPOS DE DESASTRES MAIS RECORRENTES', {
    x: midX + 0.22, y: cY + 0.14, w: midW - 0.36, h: 0.2,
    fontSize: 8.1, bold: true, color: C.textLt, charSpacing: 1, fontFace: 'Manrope',
  })

  if (ranking.length === 0) {
    slide.addText('Sem recorrência registrada de tipos específicos nesta base.', {
      x: midX + 0.22, y: cY + 0.56, w: midW - 0.36, h: 0.24,
      fontSize: 8.4, color: C.textLt, italic: true, fontFace: 'Inter',
    })
  } else {
    const rowGap = 0.08
    const rowH = Math.min(0.3, (cH - 1.02 - rowGap * (ranking.length - 1)) / ranking.length)
    const maxValue = Math.max(...ranking.map((item) => item.value), 1)
    ranking.forEach((row, idx) => {
      const y = cY + 0.5 + idx * (rowH + rowGap)
      const barX = midX + 2.38
      const barW = midW - 2.94
      const fillW = Math.max(0.08, barW * (row.value / maxValue))

      slide.addText(`${idx + 1}º`, {
        x: midX + 0.22, y: y + 0.05, w: 0.24, h: 0.14,
        fontSize: 7.6, bold: true, color: C.mod, align: 'center', fontFace: 'Manrope', margin: 0,
      })
      slide.addText(row.name, {
        x: midX + 0.5, y: y + 0.05, w: 1.84, h: 0.14,
        fontSize: 7.6, color: C.textDk, fontFace: 'Inter', margin: 0,
      })

      slide.addShape('roundRect', { x: barX, y, w: barW, h: rowH,
        fill: { color: 'EFF3F8' }, line: { color: 'EFF3F8', width: 0 }, rectRadius: 0.05 })
      slide.addShape('roundRect', { x: barX, y, w: fillW, h: rowH,
        fill: { color: C.mod }, line: { color: C.mod, width: 0 }, rectRadius: 0.05 })
      slide.addText(String(row.value), {
        x: midX + midW - 0.5, y: y + 0.04, w: 0.28, h: 0.14,
        fontSize: 8.1, bold: true, color: C.textDk, align: 'right', fontFace: 'Manrope', margin: 0,
      })
    })
  }

  drawRoundedCard(slide, rightX, cY, rightW, cH)
  slide.addShape('roundRect', { x: rightX, y: cY, w: 0.07, h: cH,
    fill: { color: C.high }, line: { color: C.high, width: 0 }, rectRadius: 0.09 })
  slide.addText('ANÁLISE DESCRITIVA', {
    x: rightX + 0.22, y: cY + 0.14, w: rightW - 0.36, h: 0.2,
    fontSize: 8.1, bold: true, color: C.textLt, charSpacing: 1, fontFace: 'Manrope',
  })

  const topType = ranking[0]
  const topTypeTxt = topType ? `${topType.name} (${topType.value} registros)` : 'sem tipo predominante identificado'
  const exposedMsg = `A base indica ${fmtPct(exposedPct)} de trabalhadores expostos a desastres naturais (${exposed} pessoas), enquanto ${fmtPct(notExposedPct)} não relataram exposição (${notExposed} pessoas).`
  const rankingMsg = `Entre os relatos de exposição, o tipo mais recorrente foi ${topTypeTxt}.`
  const riskMsg = 'Esse padrão sugere potencial ampliação de insegurança percebida, com possível impacto sobre estresse, sensação de vulnerabilidade e necessidade de suporte psicossocial preventivo.'

  slide.addText(`${exposedMsg} ${rankingMsg} ${riskMsg}`, {
    x: rightX + 0.22, y: cY + 0.44, w: rightW - 0.36, h: cH - 0.62,
    fontSize: 11.2, color: C.textMd, fontFace: 'Inter',
  })
}

function addMentalHealthClimateDisasterByStratumSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasWellbeing) return

  const slices = (data.stratifiedClimateDisasterRows && data.stratifiedClimateDisasterRows.length > 0)
    ? data.stratifiedClimateDisasterRows
    : []

  for (const slice of slices) {
    const groupLabel = slice.stratumLabel
    const allRows = [...slice.rows]
      .filter((row) => row.total >= 5 && row.exposed > 0)
      .sort((a, b) => (b.exposed - a.exposed) || (b.total - a.total) || a.category.localeCompare(b.category, 'pt-BR'))

    if (allRows.length === 0) continue

    const PAGE = 12
    const pages = Math.ceil(allRows.length / PAGE)
    const maxCount = Math.max(
      ...allRows.flatMap((row) => CLIMATE_DISASTER_COLUMNS.map((col) => row.typeCounts[col.key] ?? 0)),
      0,
    )

    for (let p = 0; p < pages; p++) {
      const pageRows = allRows.slice(p * PAGE, (p + 1) * PAGE)
      const suffix = pages > 1 ? ` (${p + 1}/${pages})` : ''
      const { slide, cY, cH } = mkBase(
        prs,
        `Ocorrência dos Tipos de Desastres por ${groupLabel}${suffix}`,
        data.clientName,
        `${getWellbeingSectionNumber(data)} | SAÚDE MENTAL`,
      )

      drawRoundedCard(slide, MX, cY, CW, cH)
      slide.addShape('roundRect', {
        x: MX, y: cY, w: 0.07, h: cH,
        fill: { color: C.mod }, line: { color: C.mod, width: 0 }, rectRadius: 0.09,
      })
      slide.addText(
        `Leitura por ${groupLabel.toLowerCase()}: número de ocorrências de cada tipo de desastre entre respondentes com relato de exposição. Quanto mais intensa a cor, maior a contagem observada.`,
        {
          x: MX + 0.22, y: cY + 0.14, w: CW - 0.36, h: 0.18,
          fontSize: 8.8, color: C.textLt, italic: true, fontFace: 'Inter',
        },
      )

      const tableX = MX + 0.16
      const tableY = cY + 0.36
      const tableW = CW - 0.3
      const tableH = cH - 0.82
      const legendH = 0.32
      const headerH = 0.62
      const bodyH = tableH - headerH
      const nameW = 2.25
      const typeW = (tableW - nameW) / CLIMATE_DISASTER_COLUMNS.length

      slide.addShape('roundRect', { x: tableX, y: tableY, w: tableW, h: tableH,
        fill: { color: C.white }, line: { color: C.border, width: 0.5 }, rectRadius: 0.06 })
      slide.addShape('roundRect', { x: tableX, y: tableY, w: tableW, h: headerH,
        fill: { color: 'F6F9FC' }, line: { color: 'F6F9FC', width: 0 }, rectRadius: 0.06 })

      slide.addText(groupLabel.toUpperCase(), {
        x: tableX + 0.12, y: tableY + 0.22, w: nameW - 0.2, h: 0.16,
        fontSize: 8.1, bold: true, color: C.textMd, fontFace: 'Manrope',
      })

      CLIMATE_DISASTER_COLUMNS.forEach((column, i) => {
        const cx = tableX + nameW + i * typeW
        slide.addText(column.label, {
          x: cx + 0.03, y: tableY + 0.24, w: typeW - 0.06, h: 0.16,
          fontSize: 6.5, bold: true, color: C.textMd, align: 'center', fontFace: 'Manrope',
        })
        slide.addShape('line', {
          x: cx, y: tableY, w: 0, h: tableH,
          line: { color: 'EDF2F7', pt: 0.7 },
        })
      })

      const rowH = Math.min(0.36, bodyH / pageRows.length)
      pageRows.forEach((row, idx) => {
        const y = tableY + headerH + idx * rowH
        const label = row.category.length > 34 ? `${row.category.slice(0, 33)}...` : row.category

        slide.addText(label, {
          x: tableX + 0.1, y: y + 0.04, w: nameW - 0.14, h: rowH - 0.06,
          fontSize: 7.4, color: C.textDk, fontFace: 'Inter', valign: 'mid', margin: 0,
        })
        slide.addText(`(N = ${row.total} | casos = ${row.exposed})`, {
          x: tableX + 0.1, y: y + rowH - 0.13, w: nameW - 0.14, h: 0.11,
          fontSize: 6.3, color: C.textLt, fontFace: 'Inter', margin: 0,
        })

        CLIMATE_DISASTER_COLUMNS.forEach((column, colIdx) => {
          const count = row.typeCounts[column.key] ?? 0
          const intensity = maxCount > 0 ? (count / maxCount) * 100 : 0
          const cellX = tableX + nameW + colIdx * typeW

          slide.addShape('roundRect', {
            x: cellX + 0.035, y: y + 0.05, w: typeW - 0.07, h: rowH - 0.1,
            fill: { color: count > 0 ? heatRiskColor(intensity) : 'EEF2F7' },
            line: { color: count > 0 ? heatRiskColor(intensity) : 'EEF2F7', width: 0 },
            rectRadius: 0.04,
          })
          slide.addText(String(count), {
            x: cellX + 0.035, y: y + 0.06, w: typeW - 0.07, h: rowH - 0.12,
            fontSize: 8, bold: true, color: count > 0 ? C.white : C.textLt,
            align: 'center', valign: 'mid', fontFace: 'Manrope', margin: 0,
          })
        })

        slide.addShape('line', {
          x: tableX, y: y + rowH, w: tableW, h: 0,
          line: { color: 'EEF2F7', pt: 0.7 },
        })
      })

      const legendY = cY + cH - legendH - 0.12
      slide.addShape('roundRect', { x: MX + 0.18, y: legendY, w: CW - 0.36, h: legendH,
        fill: { color: C.smoke }, line: { color: C.border, width: 0.5 }, rectRadius: 0.04 })
      slide.addText('Ocorrências', {
        x: MX + 0.34, y: legendY + 0.09, w: 1.0, h: 0.14,
        fontSize: 8, bold: true, color: C.textMd, fontFace: 'Inter',
      })

      const scaleX = MX + 1.5
      const scaleY = legendY + 0.1
      const scaleW = 3.2
      const steps = 32
      for (let i = 0; i < steps; i++) {
        const pct = (i / Math.max(steps - 1, 1)) * 100
        slide.addShape('rect', {
          x: scaleX + (i * scaleW) / steps,
          y: scaleY,
          w: scaleW / steps + 0.002,
          h: 0.12,
          fill: { color: heatRiskColor(pct) },
          line: { color: heatRiskColor(pct), width: 0 },
        })
      }
      slide.addText('0', {
        x: scaleX - 0.02, y: scaleY + 0.14, w: 0.2, h: 0.12,
        fontSize: 6.8, color: C.textLt, fontFace: 'Inter', align: 'left',
      })
      slide.addText(String(maxCount), {
        x: scaleX + scaleW - 0.2, y: scaleY + 0.14, w: 0.3, h: 0.12,
        fontSize: 6.8, color: C.textLt, fontFace: 'Inter', align: 'right',
      })
    }
  }
}

// Complementa addMentalHealthClimateAnxietySlide: entre quem relatou exposição a um desastre
// (exposed_natural_disaster === true), como foi o contato com o evento e como isso afetou a
// sensação de vulnerabilidade e a preocupação com segurança — campos do instrumento
// (mapping_interview_desastres_naturais_dicionario.csv: disaster_contact,
// disaster_vulnerability_feeling, disaster_safety_concern) computados em
// disasterContactDist/disasterVulnerabilityDist/disasterSafetyConcernDist. Painéis com contagem
// zerada (cliente sem essas colunas, ex.: YARA) são omitidos; sem nenhum painel, não renderiza.
function addMentalHealthDisasterFollowupSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasWellbeing) return

  const panels = [
    { title: 'CONTATO COM O DESASTRE', color: C.high, rows: data.disasterContactDist ?? [] },
    { title: 'SENSAÇÃO DE VULNERABILIDADE', color: C.mod, rows: data.disasterVulnerabilityDist ?? [] },
    { title: 'PREOCUPAÇÃO COM SEGURANÇA', color: C.blue2, rows: data.disasterSafetyConcernDist ?? [] },
  ].filter((panel) => panel.rows.some((row) => row.value > 0))
  if (panels.length === 0) return

  const sNum = getWellbeingSectionNumber(data)
  const { slide, cY, cH } = mkBase(
    prs,
    'Contato, Vulnerabilidade e Segurança Pós-Desastre',
    data.clientName,
    `${sNum} | SAÚDE MENTAL`,
  )

  slide.addText(
    'Entre os trabalhadores que relataram exposição a um desastre, como foi o contato com o evento e como isso afetou a percepção de vulnerabilidade e de segurança.',
    { x: MX, y: cY, w: CW, h: 0.28, fontSize: 9.6, color: C.textMd, italic: true, fontFace: 'Inter' },
  )

  const gap = 0.24
  const panelW = (CW - gap * (panels.length - 1)) / panels.length
  const panelY = cY + 0.36
  const panelH = cH - 0.38

  panels.forEach((panel, pIdx) => {
    const px = MX + pIdx * (panelW + gap)
    drawRoundedCard(slide, px, panelY, panelW, panelH)
    slide.addShape('roundRect', {
      x: px, y: panelY, w: 0.07, h: panelH,
      fill: { color: panel.color }, line: { color: panel.color, width: 0 }, rectRadius: 0.09,
    })
    slide.addText(panel.title, {
      x: px + 0.2, y: panelY + 0.14, w: panelW - 0.34, h: 0.32,
      fontSize: 8.1, bold: true, color: C.textLt, charSpacing: 0.6, fontFace: 'Manrope',
    })

    const total = panel.rows.reduce((sum, row) => sum + row.value, 0)
    const maxValue = Math.max(...panel.rows.map((row) => row.value), 1)
    const rowGap = 0.1
    const rowsTop = panelY + 0.5
    const rowsAvailH = panelY + panelH - 0.14 - rowsTop
    const rowH = Math.min(0.4, (rowsAvailH - rowGap * (panel.rows.length - 1)) / panel.rows.length)
    const barW = panelW - 0.4

    panel.rows.forEach((row, rIdx) => {
      const y = rowsTop + rIdx * (rowH + rowGap)
      const pct = pct1(row.value, total)
      const fillW = Math.max(0.06, barW * (row.value / maxValue))

      slide.addText(row.name, {
        x: px + 0.2, y, w: panelW - 0.4, h: 0.15,
        fontSize: 7.6, color: C.textDk, fontFace: 'Inter', margin: 0,
      })
      slide.addShape('roundRect', {
        x: px + 0.2, y: y + 0.17, w: barW, h: rowH - 0.19,
        fill: { color: 'EFF3F8' }, line: { color: 'EFF3F8', width: 0 }, rectRadius: 0.04,
      })
      slide.addShape('roundRect', {
        x: px + 0.2, y: y + 0.17, w: fillW, h: rowH - 0.19,
        fill: { color: panel.color }, line: { color: panel.color, width: 0 }, rectRadius: 0.04,
      })
      slide.addText(`${row.value} (${fmtPct(pct)})`, {
        x: px + 0.2, y: y + 0.17, w: barW - 0.06, h: rowH - 0.19,
        fontSize: 6.8, bold: true, color: row.value / maxValue > 0.5 ? C.white : C.textDk,
        align: 'right', valign: 'mid', fontFace: 'Manrope', margin: 0,
      })
    })
  })
}

function addMentalHealthSelfPerceptionSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasWellbeing) return

  const allCards = [
    {
      title: 'Percepção sobre Saúde Mental',
      shortLabel: 'Saúde Mental',
      color: C.mintDk,
      dist: data.perceivedMentalHealthDist ?? [],
    },
    {
      title: 'Percepção sobre Saúde (Geral)',
      shortLabel: 'Saúde Geral',
      color: C.blue,
      dist: data.perceivedPhysicalHealthDist ?? [],
    },
    {
      title: 'Percepção sobre Qualidade de Vida',
      shortLabel: 'Qualidade de Vida',
      color: C.mod,
      dist: data.perceivedLifeQualityDist ?? [],
    },
  ]

  // Cards sem nenhum dado (indicador não coletado nesta base) são omitidos em vez de
  // mostrar um card vazio — o layout se redistribui entre os cards que sobrarem.
  const cards = allCards.filter((card) => card.dist.some((item) => item.value > 0))
  if (cards.length === 0) return

  const sNum = getWellbeingSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Percepção de Saúde', data.clientName, `${sNum} | SAÚDE MENTAL`)

  const gap = 0.2
  const cardW = (CW - gap * (cards.length - 1)) / cards.length
  const cardH = cH

  cards.forEach((card, index) => {
    const x = MX + index * (cardW + gap)
    drawRoundedCard(slide, x, cY, cardW, cardH)
    slide.addShape('roundRect', {
      x,
      y: cY,
      w: 0.07,
      h: cardH,
      fill: { color: card.color },
      line: { color: card.color, width: 0 },
      rectRadius: 0.09,
    })

    slide.addText(card.title, {
      x: x + 0.22, y: cY + 0.16, w: cardW - 0.36, h: 0.18,
      fontSize: 8.2, bold: true, color: C.textLt, charSpacing: 0.3, fontFace: 'Manrope',
    })

    const total = card.dist.reduce((sum, item) => sum + item.value, 0)
    if (total === 0) {
      slide.addText('Sem dados para este indicador.', {
        x: x + 0.22, y: cY + 0.74, w: cardW - 0.36, h: 0.2,
        fontSize: 9, italic: true, color: C.textMd, fontFace: 'Inter',
      })
      return
    }

    const weightedSum = card.dist.reduce((sum, item) => {
      const score = Number(item.name)
      return Number.isFinite(score) ? sum + score * item.value : sum
    }, 0)
    const avgScore = total > 0 ? trunc1(weightedSum / total) : 0
    const validScores = card.dist
      .map((item) => ({ score: Number(item.name), value: item.value }))
      .filter((item) => Number.isFinite(item.score) && item.value > 0)
      .sort((a, b) => a.score - b.score)
    const minScore = validScores.length > 0 ? validScores[0].score : 0
    const maxScore = validScores.length > 0 ? validScores[validScores.length - 1].score : 0

    const metricY = cY + 0.44
    const metricW = (cardW - 0.52) / 3
    const metricGap = 0.04
    const metrics = [
      { label: 'Nota Média', value: avgScore.toFixed(1).replace('.', ','), color: card.color },
      { label: 'Menor Nota', value: String(minScore), color: C.textDk },
      { label: 'Maior Nota', value: String(maxScore), color: C.textDk },
    ]

    metrics.forEach((metric, idx) => {
      const mx = x + 0.22 + idx * (metricW + metricGap)
      slide.addText(metric.label, {
        x: mx, y: metricY, w: metricW, h: 0.14,
        fontSize: 7.2, color: C.textLt, align: 'center', fontFace: 'Inter',
      })
      slide.addText(metric.value, {
        x: mx, y: metricY + 0.16, w: metricW, h: 0.26,
        fontSize: 18, bold: true, color: metric.color, align: 'center', fontFace: 'Manrope',
      })
    })

    const scores = Array.from({ length: 11 }, (_, value) => String(value))
    const pctValues = scores.map((score) => {
      const count = card.dist.find((item) => item.name === score)?.value ?? 0
      return pct1(count, total)
    })
    const maxPct = Math.max(...pctValues, 0)

    slide.addText(`- ${card.shortLabel}`, {
      x: x + 0.26, y: cY + 1.04, w: cardW - 0.4, h: 0.14,
      fontSize: 7.8, bold: true, color: card.color, fontFace: 'Inter',
    })

    const chartX = x + 0.18
    const chartY = cY + 1.2
    const chartW = cardW - 0.3
    const chartH = cardH - 1.6

    // Rótulos 0-10 usam o eixo de categorias nativo do gráfico (em vez de texto
    // sobreposto calculado manualmente) para garantir alinhamento exato com as barras —
    // a divisão manual não batia com o padding interno que o próprio gráfico aplica.
    slide.addChart('bar', [{
      name: card.shortLabel,
      labels: scores,
      values: pctValues,
    }], {
      x: chartX,
      y: chartY,
      w: chartW,
      h: chartH,
      barDir: 'col',
      barGapWidthPct: 50,
      chartColors: [card.color],
      showLegend: false,
      showTitle: false,
      showDataLabels: false,
      valAxisMinVal: 0,
      valAxisMaxVal: Math.max(5, maxPct * 1.3),
      valAxisMajorUnit: 5,
      catAxisHidden: false,
      catAxisLineShow: false,
      catAxisLabelPos: 'low',
      catAxisLabelColor: C.textMd,
      catAxisLabelFontFace: 'Inter',
      catAxisLabelFontSize: 6.8,
      catAxisLabelRotate: 0,
      // Sem isso o pptxgenjs grava as categorias como <c:multiLvlStrRef> (referência
      // multinível) mesmo para uma lista simples de números — alguns leitores de PPTX não
      // resolvem esse formato e caem no fallback de numerar sequencialmente 1..N em vez de
      // mostrar os rótulos reais (era a causa do "1 a 11" em vez de "0 a 10"). Forçar
      // catLabelFormatCode faz o pptxgenjs emitir um <c:numRef> simples, universalmente
      // suportado, já que as categorias aqui são literalmente os números 0-10.
      catLabelFormatCode: 'General',
    })

    slide.addText('Escala de 0 a 10 (distribuição percentual)', {
      x: x + 0.22, y: cY + cardH - 0.24, w: cardW - 0.36, h: 0.12,
      fontSize: 6.8, color: C.textLt, align: 'center', fontFace: 'Inter',
    })
  })
}

function addAssociativeDynamicIntroSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!hasAssociativeDynamicSection(data)) return

  const sNum = getAssociativeSectionNumber(data)
  const { slide, cY, cH } = mkBase(
    prs,
    `${associativeSectionTitleLabel(data)} — Contexto e Objetivo`,
    data.clientName,
    `${sNum} | ${associativeSectionBreadcrumbLabel(data)}`,
  )

  drawRoundedCard(slide, MX, cY, CW, cH)
  slide.addShape('roundRect', {
    x: MX, y: cY, w: 0.07, h: cH,
    fill: { color: C.blue }, line: { color: C.blue, width: 0 }, rectRadius: 0.09,
  })

  slide.addText('Finalidade da seção', {
    x: MX + 0.22, y: cY + 0.12, w: CW - 0.34, h: 0.2,
    fontSize: 13, bold: true, color: C.navy, fontFace: 'Manrope',
  })

  const bullets = [
    'Traduzir, de forma objetiva, quais dimensões de risco psicossocial apresentam maior associação com desfechos de saúde mental na base atual.',
    'Apoiar priorização operacional com dados dinâmicos da população analisada, mantendo o relatório técnico e as seções normativas já existentes.',
    'Oferecer leitura comparável entre domínios e subdomínios para orientar foco de intervenção por unidade e por processo de trabalho.',
  ]

  bullets.forEach((item, idx) => {
    const y = cY + 0.42 + idx * 0.95
    drawRoundedCard(slide, MX + 0.18, y, CW - 0.26, 0.82, {
      fill: idx % 2 === 0 ? 'F7FAFE' : C.white,
      borderColor: C.border,
      radius: 0.06,
    })
    slide.addText(`• ${item}`, {
      x: MX + 0.28,
      y: y + 0.14,
      w: CW - 0.5,
      h: 0.52,
      fontSize: 10.7,
      color: C.textDk,
      fontFace: 'Inter',
    })
  })

  const totalDomain = data.associativeDomainCorrelations?.length ?? 0
  const totalSubdomain = data.associativeSubdomainCorrelations?.length ?? 0
  const om4Count = data.associativeOm4Insights?.length ?? 0
  const stratumLabelLower = (data.stratumLabel || 'estrato').toLowerCase()
  slide.addText(
    `Base dinâmica atual: ${totalDomain} domínios, ${totalSubdomain} subdomínios e ${om4Count} ${stratumLabelLower} com análise associativa válida.`,
    {
      x: MX + 0.22,
      y: cY + cH - 0.22,
      w: CW - 0.44,
      h: 0.12,
      fontSize: 7.5,
      color: C.textLt,
      fontFace: 'Inter',
      align: 'right',
    },
  )
}

function addAssociativeDynamicMethodSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!hasAssociativeDynamicSection(data)) return

  const sNum = getAssociativeSectionNumber(data)
  const { slide, cY, cH } = mkBase(
    prs,
    `${associativeSectionTitleLabel(data)} — Método de Cálculo`,
    data.clientName,
    `${sNum} | ${associativeSectionBreadcrumbLabel(data)}`,
  )

  drawRoundedCard(slide, MX, cY, CW, cH)
  slide.addShape('roundRect', {
    x: MX, y: cY, w: 0.07, h: cH,
    fill: { color: C.mod }, line: { color: C.mod, width: 0 }, rectRadius: 0.09,
  })

  const steps = [
    activeRiskProtocol.code === 'HSE'
      ? '1) Escala de risco: domínios e itens do HSE já são lidos como risco (0–4, maior = pior); o Índice de Saúde Mental é convertido em carga (10 − índice).'
      : '1) Conversão para escala de risco: índices protetivos são invertidos para leitura de risco (10 - índice).',
    '2) Desfechos utilizados: Saúde Mental (Geral), Estresse, Depressão (número de sintomas) e indicadores de Risco de Suicídio.',
    '3) Associação estatística: correlação de Spearman por fator vs. desfecho, preservando direção positiva ou inversa (r).',
    '4) Priorização: foco em associações positivas entre risco psicossocial e piora de saúde mental; associações inversas entram como benchmark.',
  ]

  steps.forEach((item, idx) => {
    const y = cY + 0.34 + idx * 0.78
    drawRoundedCard(slide, MX + 0.2, y, CW - 0.3, 0.68, {
      fill: C.white,
      borderColor: C.border,
      radius: 0.05,
    })
    slide.addText(item, {
      x: MX + 0.3,
      y: y + 0.17,
      w: CW - 0.5,
      h: 0.36,
      fontSize: 10.4,
      color: C.textDk,
      fontFace: 'Inter',
    })
  })

  const note = 'Leitura técnica: r positivo indica que maior risco psicossocial caminha com piora dos desfechos; r negativo indica relação inversa/protetiva. Associação não implica causalidade direta.'
  drawRoundedCard(slide, MX + 0.2, cY + cH - 1.0, CW - 0.3, 0.72, {
    fill: 'F7FAFE',
    borderColor: C.border,
    radius: 0.05,
  })
  slide.addText(note, {
    x: MX + 0.3,
    y: cY + cH - 0.78,
    w: CW - 0.5,
    h: 0.32,
    fontSize: 9.6,
    italic: true,
    color: C.textMd,
    fontFace: 'Inter',
  })
}

function formatSignedCoefficient(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`
}

function associativeSignedColor(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'EEF2F7'
  const intensity = Math.max(0, Math.min(1, Math.abs(value)))
  if (value >= 0) {
    if (intensity >= 0.45) return '26B893'
    if (intensity >= 0.25) return '7ED7BF'
    return 'DDF5EE'
  }
  if (intensity >= 0.45) return 'E57373'
  if (intensity >= 0.25) return 'F3A4A4'
  return 'FBE2E2'
}

function associativeSignedTextColor(value: number | null): string {
  if (value === null || Number.isNaN(value)) return C.textLt
  return value >= 0 ? '0E6E5D' : 'A33A3A'
}

function addAssociativeBarRankingSlide(
  prs: PptxGenJS,
  data: ReportPayload,
  rows: AssociativeCorrelationRow[],
  title: string,
  targetOutcome: string,
) {
  if (rows.length === 0) return
  const sNum = getAssociativeSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, title, data.clientName, `${sNum} | ${associativeSectionBreadcrumbLabel(data)}`)

  drawRoundedCard(slide, MX, cY, CW, cH)
  slide.addShape('roundRect', {
    x: MX, y: cY, w: 0.07, h: cH,
    fill: { color: C.blue3 }, line: { color: C.blue3, width: 0 }, rectRadius: 0.09,
  })

  const ranked = rows
    .map((row) => {
      const metric = row.metrics.find((item) => item.outcome === targetOutcome)
      return {
        predictor: row.predictor,
        coefficient: metric?.coefficient ?? null,
        hasMetric: metric?.coefficient !== null,
      }
    })
    .filter((row) => row.hasMetric)
    .sort((a, b) => (b.coefficient ?? -99) - (a.coefficient ?? -99) || a.predictor.localeCompare(b.predictor, 'pt-BR'))

  const top = ranked.slice(0, Math.min(20, ranked.length))
  const maxAbs = Math.max(...top.map((row) => Math.abs(row.coefficient ?? 0)), 0.01)

  const chartX = MX + 0.2
  const chartY = cY + 0.42
  const chartW = CW - 0.4
  const chartH = cH - 0.7
  const labelW = 3.5
  const valW = 0.86
  const barsX = chartX + labelW
  const barsW = chartW - labelW - valW - 0.12
  const halfW = barsW / 2
  const zeroX = barsX + halfW
  const gap = top.length <= 10 ? 0.09 : 0.05
  const rowH = Math.max(0.14, Math.min(0.5, (chartH - gap * (top.length - 1)) / top.length))
  const usedH = top.length * rowH + Math.max(0, top.length - 1) * gap
  const startY = chartY + Math.max(0, (chartH - usedH) / 2)

  slide.addShape('line', {
    x: zeroX, y: chartY - 0.03, w: 0, h: chartH + 0.06,
    line: { color: C.border, pt: 1 },
  })
  slide.addText('-1,0', { x: barsX - 0.1, y: cY + cH - 0.16, w: 0.4, h: 0.12, fontSize: 6.4, color: C.textLt, align: 'left', fontFace: 'Inter' })
  slide.addText('0', { x: zeroX - 0.08, y: cY + cH - 0.16, w: 0.16, h: 0.12, fontSize: 6.4, color: C.textLt, align: 'center', fontFace: 'Inter' })
  slide.addText('+1,0', { x: barsX + barsW - 0.28, y: cY + cH - 0.16, w: 0.4, h: 0.12, fontSize: 6.4, color: C.textLt, align: 'right', fontFace: 'Inter' })

  top.forEach((row, idx) => {
    const y = startY + idx * (rowH + gap)
    const coefficient = row.coefficient ?? 0
    const fillW = Math.max(0.02, halfW * (Math.abs(coefficient) / maxAbs))
    const barX = coefficient >= 0 ? zeroX : zeroX - fillW

    slide.addText(row.predictor, {
      x: chartX,
      y: y + 0.02,
      w: labelW - 0.06,
      h: 0.12,
      fontSize: 7.4,
      color: C.textDk,
      fontFace: 'Inter',
      align: 'right',
      margin: 0,
    })

    slide.addShape('roundRect', {
      x: barsX, y, w: barsW, h: rowH,
      fill: { color: 'EEF3FA' }, line: { color: 'EEF3FA', width: 0 }, rectRadius: 0.03,
    })
    const barColor = associativeSignedColor(coefficient)
    slide.addShape('roundRect', {
      x: barX, y, w: fillW, h: rowH,
      fill: { color: barColor }, line: { color: barColor, width: 0 }, rectRadius: 0.03,
    })

    slide.addText(formatSignedCoefficient(coefficient), {
      x: barsX + barsW + 0.06,
      y: y + 0.02,
      w: valW,
      h: 0.12,
      fontSize: 7.8,
      bold: true,
      color: associativeSignedTextColor(coefficient),
      fontFace: 'Manrope',
      margin: 0,
    })
  })

  slide.addText(`Escala: correlação r (Spearman) com ${targetOutcome}. Positivo = piora conjunta; negativo = relação inversa.`, {
    x: barsX,
    y: cY + cH - 0.16,
    w: barsW,
    h: 0.12,
    fontSize: 6.8,
    color: C.textLt,
    align: 'center',
    fontFace: 'Inter',
  })
}

function addAssociativeDynamicDomainBarsSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!hasAssociativeDynamicSection(data)) return
  addAssociativeBarRankingSlide(
    prs,
    data,
    data.associativeDomainCorrelations ?? [],
    'Correlação dos Domínios com Saúde Mental (Geral) (r)',
    'Saúde Mental (Geral)',
  )
}

// Complementa addAssociativeDynamicDomainBarsSlide/addAssociativeDynamicSubdomainBarsSlide:
// nuvem de pontos bruta (um ponto por respondente) por trás dos r de Spearman mais fortes —
// ferramenta de auditoria visual do próprio número (checar se a correlação reflete uma relação
// distribuída no corpo da amostra, ou se está sendo puxada por poucos pontos extremos), não um
// resultado novo de análise. Marcadores semi-transparentes: onde há muitos valores repetidos
// (comum em índices derivados de escala Likert), a sobreposição aparece mais escura em vez de
// esconder pontos atrás de outros — nenhum ponto é deslocado ou alterado.
function addAssociativeDynamicScatterSlides(prs: PptxGenJS, data: ReportPayload) {
  if (!hasAssociativeDynamicSection(data)) return
  const samples = data.associativeScatterSamples ?? []
  if (samples.length === 0) return

  const sNum = getAssociativeSectionNumber(data)
  const PER_PAGE = 4
  const pages = Math.ceil(samples.length / PER_PAGE)

  for (let p = 0; p < pages; p++) {
    const pageSamples = samples.slice(p * PER_PAGE, (p + 1) * PER_PAGE)
    const suffix = pages > 1 ? ` (${p + 1}/${pages})` : ''
    const { slide, cY, cH } = mkBase(
      prs,
      `Dispersão dos Preditores mais Correlacionados${suffix}`,
      data.clientName,
      `${sNum} | ${associativeSectionBreadcrumbLabel(data)}`,
    )

    slide.addText(
      'Nuvem de pontos individuais (um ponto por respondente) por trás do r de Spearman: serve para checar se a correlação reflete uma relação distribuída na amostra ou está sendo puxada por poucos pontos extremos.',
      { x: MX, y: cY, w: CW, h: 0.3, fontSize: 9.3, color: C.textMd, italic: true, fontFace: 'Inter' },
    )

    const cols = 2
    const rowsCount = 2
    const gap = 0.22
    const gridY = cY + 0.36
    const cardW = (CW - gap * (cols - 1)) / cols
    const cardH = (cH - 0.38 - gap * (rowsCount - 1)) / rowsCount

    pageSamples.forEach((sample, idx) => {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const bx = MX + col * (cardW + gap)
      const by = gridY + row * (cardH + gap)
      const color = associativeSignedColor(sample.coefficient)
      const textColor = associativeSignedTextColor(sample.coefficient)

      drawRoundedCard(slide, bx, by, cardW, cardH)
      slide.addShape('roundRect', {
        x: bx, y: by, w: 0.06, h: cardH,
        fill: { color: textColor }, line: { color: textColor, width: 0 }, rectRadius: 0.08,
      })

      slide.addText(sample.predictor, {
        x: bx + 0.18, y: by + 0.1, w: cardW - 1.4, h: 0.2,
        fontSize: 9.4, bold: true, color: C.textDk, fontFace: 'Manrope',
      })
      slide.addText(`${formatSignedCoefficient(sample.coefficient)}  ·  N=${sample.sampleSize}`, {
        x: bx + cardW - 1.3, y: by + 0.1, w: 1.12, h: 0.2,
        fontSize: 8.6, bold: true, color: textColor, align: 'right', fontFace: 'Manrope',
      })

      const chartX = bx + 0.14
      const chartY = by + 0.36
      const chartW = cardW - 0.28
      const chartH = cardH - 0.5

      slide.addChart('scatter', [
        { name: 'X-Axis', values: sample.points.map((pt) => pt.x) },
        { name: sample.outcome, values: sample.points.map((pt) => pt.y) },
      ], {
        x: chartX, y: chartY, w: chartW, h: chartH,
        chartColors: [color],
        chartColorsOpacity: 55,
        lineSize: 0,
        lineDataSymbol: 'circle',
        lineDataSymbolSize: 4,
        lineDataSymbolLineSize: 0,
        showLegend: false,
        showTitle: false,
        showDataLabels: false,
        catAxisMinVal: 0,
        catAxisMaxVal: 10,
        valAxisMinVal: 0,
        valAxisMaxVal: 10,
        catAxisTitle: sample.predictor,
        showCatAxisTitle: true,
        catAxisTitleFontSize: 7,
        catAxisTitleColor: C.textMd,
        valAxisTitle: sample.outcome,
        showValAxisTitle: true,
        valAxisTitleFontSize: 7,
        valAxisTitleColor: C.textMd,
        catAxisLabelFontSize: 6.4,
        valAxisLabelFontSize: 6.4,
        catAxisLabelColor: C.textLt,
        valAxisLabelColor: C.textLt,
        catAxisLineColor: C.border,
        valAxisLineColor: C.border,
        catGridLine: { color: 'EDF2F7', size: 0.5 },
        valGridLine: { color: 'EDF2F7', size: 0.5 },
      })
    })
  }
}

function addAssociativeDynamicOm4MentalNotesSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!hasAssociativeDynamicSection(data)) return
  const stratumLabel = data.stratumLabel || 'Estrato'
  const stratumLabelLower = stratumLabel.toLowerCase()
  const stratumLabelUpper = stratumLabel.toUpperCase()
  const rows = (data.associativeOm4MentalNotes ?? []).slice(0, 8)
  if (rows.length === 0) return

  const sNum = getAssociativeSectionNumber(data)
  const { slide, cY, cH } = mkBase(
    prs,
    `Painel Integrado por ${stratumLabel} — Notas de Saúde Mental e Diagnóstico Estratégico`,
    data.clientName,
    `${sNum} | ${associativeSectionBreadcrumbLabel(data)}`,
  )

  drawRoundedCard(slide, MX, cY, CW, cH)
  slide.addShape('roundRect', {
    x: MX, y: cY, w: 0.07, h: cH,
    fill: { color: C.blue2 }, line: { color: C.blue2, width: 0 }, rectRadius: 0.09,
  })

  slide.addText(`Comparativo por ${stratumLabelLower} com as notas dos componentes do Índice de Saúde Mental e leitura estratégica do fator mais comprometido.`, {
    x: MX + 0.22, y: cY + 0.14, w: CW - 0.36, h: 0.16,
    fontSize: 8.8, italic: true, color: C.textLt, fontFace: 'Inter',
  })

  const tableX = MX + 0.14
  const tableY = cY + 0.38
  const tableW = CW - 0.28
  const tableH = cH - 0.66
  const headerH = 0.62
  const rowH = (tableH - headerH) / rows.length
  const colW = [1.22, 0.66, 0.84, 0.84, 0.78, 0.86, 0.72, 0.72, tableW - (1.22 + 0.66 + 0.84 + 0.84 + 0.78 + 0.86 + 0.72 + 0.72)]
  const headers = [
    stratumLabelUpper,
    'N',
    'RISCO\nPSICOSS.',
    'SAÚDE\nMENTAL',
    'NOTA\nESTRESSE',
    'NOTA\nDEPRESSÃO',
    'NOTA\nINTERNET',
    'NOTA\nSUICÍDIO',
    'DIAGNÓSTICO ESTRATÉGICO',
  ]

  drawRoundedCard(slide, tableX, tableY, tableW, tableH, { fill: C.white, borderColor: C.border, radius: 0.05 })

  let hx = tableX
  headers.forEach((header, i) => {
    slide.addShape('rect', {
      x: hx, y: tableY, w: colW[i], h: headerH,
      fill: { color: C.navSub }, line: { color: C.navSub, width: 0.4 },
    })
    slide.addText(header, {
      x: hx + 0.04, y: tableY + 0.12, w: colW[i] - 0.08, h: 0.4,
      fontSize: 6.6, bold: true, color: C.white, align: 'center', valign: 'mid', fontFace: 'Manrope',
    })
    hx += colW[i]
  })

  const scoreBg = (value: number | null, mode: 'higher-is-better' | 'lower-is-better' | 'suicide-note') => {
    if (value === null || Number.isNaN(value)) return 'EEF2F7'
    if (mode === 'lower-is-better') {
      if (isHighRisk(value)) return C.highLt
      if (isAtLeastModerateRisk(value)) return C.modLt
      return C.lowLt
    }
    if (mode === 'suicide-note') {
      return value >= 1.5 ? C.highLt : C.lowLt
    }
    if (value < 4) return C.highLt
    if (value < 7) return C.modLt
    return C.lowLt
  }

  const scoreTxtColor = (value: number | null, mode: 'higher-is-better' | 'lower-is-better' | 'suicide-note') => {
    if (value === null || Number.isNaN(value)) return C.textLt
    if (mode === 'lower-is-better') {
      if (isHighRisk(value)) return C.high
      if (isAtLeastModerateRisk(value)) return C.mod
      return C.low
    }
    if (mode === 'suicide-note') return value >= 1.5 ? C.high : C.low
    if (value < 4) return C.high
    if (value < 7) return C.mod
    return C.low
  }

  const fmt = (v: number | null) => (v === null || Number.isNaN(v) ? '--' : v.toFixed(2))

  rows.forEach((row, i) => {
    const y = tableY + headerH + i * rowH
    const zebra = i % 2 === 0 ? C.white : 'F9FBFD'

    let x = tableX
    const cells = [
      row.stratumValue,
      String(row.sampleSize),
      fmt(row.riscoPsicossocialAvg),
      fmt(row.saudeMentalAvg),
      fmt(row.notaEstresseAvg),
      fmt(row.notaSintomasDepressivosAvg),
      fmt(row.notaInternetAvg),
      fmt(row.notaSuicidioAvg),
      row.diagnosisStrategic,
    ]

    cells.forEach((cell, cIdx) => {
      const isNumericColumn = cIdx >= 2 && cIdx <= 7
      const mode = cIdx === 2
        ? 'lower-is-better'
        : cIdx === 7
          ? 'suicide-note'
          : 'higher-is-better'
      const bg = isNumericColumn
        ? scoreBg(cIdx === 2 ? row.riscoPsicossocialAvg : cIdx === 3 ? row.saudeMentalAvg : cIdx === 4 ? row.notaEstresseAvg : cIdx === 5 ? row.notaSintomasDepressivosAvg : cIdx === 6 ? row.notaInternetAvg : row.notaSuicidioAvg, mode)
        : zebra

      slide.addShape('rect', {
        x, y, w: colW[cIdx], h: rowH,
        fill: { color: bg }, line: { color: C.border, width: 0.3 },
      })

      const color = isNumericColumn
        ? scoreTxtColor(cIdx === 2 ? row.riscoPsicossocialAvg : cIdx === 3 ? row.saudeMentalAvg : cIdx === 4 ? row.notaEstresseAvg : cIdx === 5 ? row.notaSintomasDepressivosAvg : cIdx === 6 ? row.notaInternetAvg : row.notaSuicidioAvg, mode)
        : C.textDk

      slide.addText(cell, {
        x: x + 0.04,
        y: y + 0.04,
        w: colW[cIdx] - 0.08,
        h: rowH - 0.08,
        fontSize: cIdx === 8 ? 5.8 : 7,
        bold: isNumericColumn,
        color,
        align: cIdx === 0 || cIdx === 8 ? 'left' : 'center',
        valign: 'mid',
        fontFace: cIdx === 8 ? 'Inter' : 'Manrope',
        margin: 0,
      })

      x += colW[cIdx]
    })
  })

  slide.addText(`Leitura das escalas: Risco Psicossocial (${activeRiskProtocol.code === 'HSE' ? 'HSE 0–4, maior = pior' : 'IRP 0–10, maior = melhor'}); Saúde Mental e Notas Estresse/Depressão/Internet (0–10, maior = melhor); Nota Suicídio (0–10, maior = pior). Diagnóstico estratégico mostra domínio + subdomínio mais comprometidos e interpretação operacional.`, {
    x: MX + 0.22, y: cY + cH - 0.16, w: CW - 0.44, h: 0.12,
    fontSize: 6.8, color: C.textLt, fontFace: 'Inter', align: 'right',
  })
}

const ASSOCIATIVE_DOMAIN_MEANING: Record<string, string> = {
  'Trabalho': 'rotina de trabalho, pressão e organização das entregas',
  'Autonomia': 'margem de decisão da equipe sobre ritmo e forma de executar o trabalho',
  'Liderança': 'qualidade do suporte da chefia, escuta e orientação no dia a dia',
  'Cooperação': 'apoio entre colegas e capacidade de atuar em rede',
  'Convivência': 'respeito nas relações e prevenção de assédio e conflitos',
  'Responsabilidades': 'clareza de papéis, metas e divisão de responsabilidades',
  'Mudanças': 'comunicação e participação em mudanças operacionais',
  'Satisfação': 'percepção de reconhecimento, justiça e vínculo com a organização',
  'Carga de Trabalho': 'volume de demandas e pressão de prazos',
  'Ambiente de Trabalho': 'condições materiais e contexto físico de trabalho',
  'Comunicação': 'clareza das informações entre comando, liderança e equipes',
  'Apoio e Encorajamento': 'presença ativa de suporte da liderança',
}

function addAssociativeDynamicOm4InsightsSlide(prs: PptxGenJS, data: ReportPayload) { // NOSONAR
  if (!hasAssociativeDynamicSection(data)) return
  const stratumLabel = data.stratumLabel || 'Estrato'
  const stratumLabelLower = stratumLabel.toLowerCase()
  const allRows = (data.associativeOm4Insights ?? []).slice(0, 6)
  if (allRows.length === 0) return

  const sNum = getAssociativeSectionNumber(data)
  const meaning = ASSOCIATIVE_DOMAIN_MEANING

  // Um card por vez ocupando toda a largura de coluna disponível evita a sobreposição de
  // texto observada com 3 cards lado a lado: cada bloco (badge, domínio, sinal, desfecho,
  // foco, justificativa, recomendação) avança por um cursor vertical sequencial (`cy`), com
  // altura generosa o bastante para o texto de tamanho variável (dado dinâmico) quebrar em
  // até 3-4 linhas sem invadir o bloco seguinte.
  const PER_PAGE = 3
  const pages = Math.ceil(allRows.length / PER_PAGE)

  for (let p = 0; p < pages; p++) {
    const pageRows = allRows.slice(p * PER_PAGE, (p + 1) * PER_PAGE)
    const suffix = pages > 1 ? ` (${p + 1}/${pages})` : ''
    const { slide, cY, cH } = mkBase(
      prs,
      `Síntese Dinâmica — Foco em ${stratumLabel}${suffix}`,
      data.clientName,
      `${sNum} | ${associativeSectionBreadcrumbLabel(data)}`,
    )

    drawRoundedCard(slide, MX, cY, CW, cH)
    slide.addShape('roundRect', {
      x: MX, y: cY, w: 0.07, h: cH,
      fill: { color: C.high }, line: { color: C.high, width: 0 }, rectRadius: 0.09,
    })

    slide.addText(`Leitura objetiva por ${stratumLabelLower}: casos de atenção e casos positivos de benchmark para orientar decisões práticas.`, {
      x: MX + 0.22, y: cY + 0.14, w: CW - 0.36, h: 0.18,
      fontSize: 9.3, italic: true, color: C.textLt, fontFace: 'Inter',
    })

    const gapX = 0.2
    const cols = PER_PAGE
    const cardTop = cY + 0.42
    const cardH = cH - 0.56
    const cardW = (CW - gapX * (cols - 1)) / cols

    pageRows.forEach((row, idx) => {
      const x = MX + idx * (cardW + gapX)
      const y = cardTop
      const innerW = cardW - 0.28
      const isBenchmark = row.caseType === 'Benchmark'
      const priorityColor = isBenchmark ? C.low : row.priority === 'Alta' ? C.high : row.priority === 'Média' ? C.mod : C.low
      const badgeBg = isBenchmark ? C.lowLt : row.priority === 'Alta' ? C.highLt : row.priority === 'Média' ? C.modLt : C.lowLt
      const focusList = row.keyFactors.slice(0, 2)
      const humanTopDomain = meaning[row.topDomain] ?? row.topDomain.toLowerCase()
      const humanTopSubdomain = meaning[row.topSubdomain] ?? row.topSubdomain.toLowerCase()

      drawRoundedCard(slide, x, y, cardW, cardH, { fill: C.white, borderColor: C.border, radius: 0.07 })
      slide.addShape('roundRect', {
        x, y, w: 0.07, h: cardH,
        fill: { color: priorityColor }, line: { color: priorityColor, width: 0 }, rectRadius: 0.07,
      })

      let cy = y + 0.16

      slide.addText(row.stratumValue, {
        x: x + 0.14, y: cy, w: innerW, h: 0.22, fontSize: 11.5, bold: true, color: C.navy, fontFace: 'Manrope', wrap: false,
      })
      cy += 0.28

      slide.addShape('roundRect', {
        x: x + 0.14, y: cy, w: innerW, h: 0.2,
        fill: { color: badgeBg }, line: { color: badgeBg, width: 0 }, rectRadius: 0.05,
      })
      slide.addText(`${isBenchmark ? 'Benchmark positivo' : 'Caso de atenção'}  |  N=${row.sampleSize}`, {
        x: x + 0.14, y: cy + 0.03, w: innerW, h: 0.14, fontSize: 7.6, bold: true, color: priorityColor, fontFace: 'Inter', align: 'center',
      })
      cy += 0.34

      const addField = (label: string, value: string, lines: number) => {
        const h = 0.15 + lines * 0.145
        slide.addText([
          { text: `${label}: `, options: { bold: true, color: C.textMd } },
          { text: value, options: { color: C.textDk } },
        ], {
          x: x + 0.14, y: cy, w: innerW, h, fontSize: 8.3, fontFace: 'Inter', valign: 'top',
        })
        cy += h + 0.06
      }

      addField('Onde mais pesa', `${humanTopDomain}.`, 2)
      addField('Sinal específico', `${row.topSubdomain} (${humanTopSubdomain}).`, 2)
      addField('Desfecho mais sensível', `${row.strongestOutcome}.`, 1)
      addField('Foco recomendado', `${focusList.join(' e ')}.`, 2)

      slide.addShape('line', {
        x: x + 0.14, y: cy + 0.02, w: innerW, h: 0,
        line: { color: C.border, pt: 0.6 },
      })
      cy += 0.14

      const whyText = row.whyIncluded ?? row.recommendation
      const whyH = 0.16 + Math.max(1, Math.ceil(whyText.length / 42)) * 0.145
      slide.addText('Por que aparece', {
        x: x + 0.14, y: cy, w: innerW, h: 0.14, fontSize: 7.6, bold: true, color: C.textMd, fontFace: 'Manrope',
      })
      cy += 0.16
      slide.addText(whyText, {
        x: x + 0.14, y: cy, w: innerW, h: whyH, fontSize: 7.8, italic: true, color: C.textLt, fontFace: 'Inter', valign: 'top',
      })
      cy += whyH + 0.1

      slide.addText('Recomendação', {
        x: x + 0.14, y: cy, w: innerW, h: 0.14, fontSize: 7.6, bold: true, color: C.textMd, fontFace: 'Manrope',
      })
      cy += 0.16
      const recH = Math.max(0.3, cardH - (cy - y) - 0.1)
      slide.addText(row.recommendation, {
        x: x + 0.14, y: cy, w: innerW, h: recH, fontSize: 7.8, color: C.textDk, fontFace: 'Inter', valign: 'top',
      })
    })
  }
}

function joinNaturalList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

const fmtR = (v: number): string => v.toFixed(2).replace('.', ',')

// Ranking compartilhado por addAssociativeDynamicOverallSynthesisSlide e
// addRiskClassificationExecutiveSynthesisSlide: top N preditores (domínio ou subdomínio) por
// força de correlação com um outcome específico (ex.: "Saúde Mental (Geral)").
function topCorrelationsForOutcome(
  rows: AssociativeCorrelationRow[],
  outcome: string,
  n: number,
): { name: string; r: number }[] {
  return rows
    .map((row) => {
      const metric = row.metrics.find((m) => m.outcome === outcome)
      return metric && metric.coefficient !== null ? { name: row.predictor, r: metric.coefficient } : null
    })
    .filter((v): v is { name: string; r: number } => v !== null)
    .sort((a, b) => b.r - a.r)
    .slice(0, n)
}

// Fecha a seção com uma leitura textual das correlações já mostradas nos gráficos/heatmaps
// anteriores — 100% derivada de associativeDomainCorrelations/associativeSubdomainCorrelations
// (mesma fonte usada nas barras e heatmaps), nada fixo por cliente.
function addAssociativeDynamicOverallSynthesisSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!hasAssociativeDynamicSection(data)) return

  const sNum = getAssociativeSectionNumber(data)
  const { slide, cY, cH } = mkBase(
    prs,
    'Síntese Interpretativa',
    data.clientName,
    `${sNum} | ${associativeSectionBreadcrumbLabel(data)}`,
  )

  const domainRows = data.associativeDomainCorrelations ?? []
  const subdomainRows = data.associativeSubdomainCorrelations ?? []
  const outcomes = data.associativeOutcomes ?? ['Saúde Mental (Geral)', 'Estresse', 'Depressão', 'Risco de suicídio']
  const generalOutcome = outcomes[0] ?? 'Saúde Mental (Geral)'
  const stressOutcome = outcomes[1] ?? 'Estresse'
  const depressionOutcome = outcomes[2] ?? 'Depressão'
  const suicideOutcome = outcomes[3] ?? 'Risco de suicídio'

  const topDomains = topCorrelationsForOutcome(domainRows, generalOutcome, 4)
  const topSubdomains = topCorrelationsForOutcome(subdomainRows, generalOutcome, 4)

  const allRows = [...domainRows, ...subdomainRows]
  const avgAbsForOutcome = (outcome: string): number | null => {
    const values = allRows
      .map((row) => row.metrics.find((m) => m.outcome === outcome))
      .filter((m): m is AssociativeCorrelationMetric => m !== undefined && m.coefficient !== null)
      .map((m) => Math.abs(m.coefficient as number))
    return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null
  }

  const stressAvg = avgAbsForOutcome(stressOutcome)
  const depressionAvg = avgAbsForOutcome(depressionOutcome)
  const suicideAvg = avgAbsForOutcome(suicideOutcome)

  const consistentOutcomes = [
    stressAvg !== null ? 'estresse' : null,
    depressionAvg !== null ? 'depressão' : null,
  ].filter((v): v is string => v !== null)

  const actionAreas = joinNaturalList([
    ...topDomains.slice(0, 2).map((d) => d.name),
    ...topSubdomains.slice(0, 2).map((d) => d.name),
  ])

  const cardGap = 0.2
  const cardW = (CW - cardGap * 2) / 3
  const cardY = cY + 0.06
  const cardH = cH - 0.1
  const topBarH = 0.06

  const cards: Array<{ icon: IconType; color: string; num: string; title: string; render: (x: number, y: number, w: number) => void }> = [
    {
      icon: 'chart-bars',
      color: C.blue,
      num: '01',
      title: 'Fatores Gerais',
      render: (x, y, w) => {
        slide.addText(
          `A organização do trabalho possui forte associação com indicadores de pior saúde mental em ${data.clientName}. Os principais domínios correlacionados são:`,
          { x, y, w, h: 0.72, fontSize: 10, color: C.textMd, fontFace: 'Inter', valign: 'top' },
        )
        let ry = y + 0.82
        if (topDomains.length === 0) {
          slide.addText('Sem correlações válidas nesta base.', { x, y: ry, w, h: 0.2, fontSize: 9.6, italic: true, color: C.textLt, fontFace: 'Inter' })
        }
        topDomains.forEach((d, idx) => {
          slide.addText([
            { text: `r=${fmtR(d.r)}  `, options: { bold: true, color: C.blue } },
            { text: d.name, options: { bold: idx < 2, color: idx < 2 ? C.textDk : C.textMd } },
          ], { x, y: ry, w, h: 0.26, fontSize: idx < 2 ? 11.5 : 10.5, fontFace: 'Inter', valign: 'top' })
          ry += 0.3
        })
      },
    },
    {
      icon: 'grid',
      color: C.blue,
      num: '02',
      title: 'Subdomínios Críticos',
      render: (x, y, w) => {
        slide.addText(
          'Em nível de análise específico, os fatores organizacionais que mais impactam diretamente o bem-estar psicológico são:',
          { x, y, w, h: 0.72, fontSize: 10, color: C.textMd, fontFace: 'Inter', valign: 'top' },
        )
        let ry = y + 0.82
        if (topSubdomains.length === 0) {
          slide.addText('Sem correlações válidas nesta base.', { x, y: ry, w, h: 0.2, fontSize: 9.6, italic: true, color: C.textLt, fontFace: 'Inter' })
        }
        topSubdomains.forEach((d, idx) => {
          slide.addText([
            { text: `r=${fmtR(d.r)}  `, options: { bold: true, color: C.blue } },
            { text: d.name, options: { bold: idx < 2, color: idx < 2 ? C.textDk : C.textMd } },
          ], { x, y: ry, w, h: 0.26, fontSize: idx < 2 ? 11.5 : 10.5, fontFace: 'Inter', valign: 'top' })
          ry += 0.3
        })
      },
    },
    {
      icon: 'brain',
      color: C.blue,
      num: '03',
      title: 'Conclusões & Foco',
      render: (x, y, w) => {
        if (consistentOutcomes.length > 0) {
          // A ausência de correlação válida para suicídio (suicideAvg === null) normalmente
          // reflete falta de VARIÂNCIA no desfecho (ex.: quase ninguém com risco declarado),
          // não falta de amostra — por isso ganha uma leitura própria em vez de derrubar o
          // card inteiro no fallback genérico de "base insuficiente".
          const suicideClause = suicideAvg !== null
            ? `. O risco de suicídio manteve-se ${suicideAvg < 0.2 ? 'baixo/inexistente' : 'comparativamente mais baixo'}.`
            : '. O risco de suicídio não apresentou variabilidade suficiente nesta base para compor a análise de correlação — indício de baixíssima incidência.'
          slide.addText([
            { text: 'As correlações identificadas mostram-se mais consistentes com sintomas de ', options: { color: C.textMd } },
            { text: joinNaturalList(consistentOutcomes), options: { bold: true, color: C.textDk } },
            { text: suicideClause, options: { color: C.textMd } },
          ], { x, y, w, h: 0.9, fontSize: 10, fontFace: 'Inter', valign: 'top' })
        } else {
          slide.addText('Não há base suficiente para comparar a consistência das associações entre os desfechos avaliados.', {
            x, y, w, h: 0.9, fontSize: 10, italic: true, color: C.textLt, fontFace: 'Inter', valign: 'top',
          })
        }

        if (actionAreas) {
          slide.addText('Direcionamento de Ações:', {
            x, y: y + 0.98, w, h: 0.2, fontSize: 10.5, bold: true, color: C.textDk, fontFace: 'Manrope',
          })
          const bulletItems = [...topDomains.slice(0, 2).map((d) => d.name), ...topSubdomains.slice(0, 2).map((d) => d.name)]
          bulletItems.forEach((item, idx) => {
            slide.addText(`•  ${item}`, {
              x, y: y + 1.24 + idx * 0.24, w, h: 0.2, fontSize: 10, color: C.textDk, fontFace: 'Inter',
            })
          })
        }
      },
    },
  ]

  cards.forEach((card, idx) => {
    const x = MX + idx * (cardW + cardGap)
    drawRoundedCard(slide, x, cardY, cardW, cardH)
    slide.addShape('roundRect', {
      x, y: cardY, w: cardW, h: topBarH,
      fill: { color: card.color }, line: { color: card.color, width: 0 }, rectRadius: 0.03,
    })

    const badgeSize = 0.4
    slide.addShape('roundRect', {
      x: x + 0.24, y: cardY + 0.22, w: badgeSize, h: badgeSize,
      fill: { color: card.color }, line: { color: card.color, width: 0 }, rectRadius: 0.08,
    })
    slide.addImage({
      data: iconDataUri(card.icon, 'FFFFFF'),
      x: x + 0.24 + 0.09, y: cardY + 0.22 + 0.09, w: badgeSize - 0.18, h: badgeSize - 0.18,
    })
    slide.addText(card.num, {
      x: x + 0.24 + badgeSize + 0.08, y: cardY + 0.16, w: cardW - badgeSize - 0.5, h: 0.5,
      fontSize: 26, bold: true, color: 'DCE4EC', fontFace: 'Manrope',
    })

    slide.addText(card.title, {
      x: x + 0.24, y: cardY + 0.74, w: cardW - 0.44, h: 0.3,
      fontSize: 15.5, bold: true, color: C.textDk, fontFace: 'Manrope',
    })

    card.render(x + 0.24, cardY + 1.14, cardW - 0.44)
  })
}

function drawAssociativeHeatmapSlides(
  prs: PptxGenJS,
  data: ReportPayload,
  titleBase: string,
  rows: AssociativeCorrelationRow[],
  sectionLabel: string,
  pageSize: number,
) {
  if (rows.length === 0) return

  const outcomes = data.associativeOutcomes ?? rows[0]?.metrics.map((metric) => metric.outcome) ?? []
  if (outcomes.length === 0) return

  const pages = Math.ceil(rows.length / pageSize)
  const maxAbs = Math.max(
    ...rows.flatMap((row) => row.metrics.map((metric) => Math.abs(metric.coefficient ?? 0))),
    0,
  )

  for (let page = 0; page < pages; page++) {
    const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize)
    const suffix = pages > 1 ? ` (${page + 1}/${pages})` : ''
    const { slide, cY, cH } = mkBase(prs, `${titleBase}${suffix}`, data.clientName, sectionLabel)

    drawRoundedCard(slide, MX, cY, CW, cH)
    slide.addShape('roundRect', {
      x: MX, y: cY, w: 0.07, h: cH,
      fill: { color: C.blue2 }, line: { color: C.blue2, width: 0 }, rectRadius: 0.09,
    })

    slide.addText(
      'Correlação de Spearman (r). Tons verdes mostram associação positiva; tons vermelhos mostram relação inversa. A intensidade indica a magnitude da associação.',
      {
        x: MX + 0.22, y: cY + 0.14, w: CW - 0.36, h: 0.18,
        fontSize: 8.8, color: C.textLt, italic: true, fontFace: 'Inter',
      },
    )

    const tableX = MX + 0.16
    const tableY = cY + 0.36
    const tableW = CW - 0.3
    const tableH = cH - 0.82
    const headerH = 0.62
    const bodyH = tableH - headerH
    const nameW = 3.2
    const metricW = (tableW - nameW) / outcomes.length

    slide.addShape('roundRect', { x: tableX, y: tableY, w: tableW, h: tableH,
      fill: { color: C.white }, line: { color: C.border, width: 0.5 }, rectRadius: 0.06 })
    slide.addShape('roundRect', { x: tableX, y: tableY, w: tableW, h: headerH,
      fill: { color: 'F6F9FC' }, line: { color: 'F6F9FC', width: 0 }, rectRadius: 0.06 })

    slide.addText('DIMENSÃO', {
      x: tableX + 0.12, y: tableY + 0.22, w: nameW - 0.2, h: 0.16,
      fontSize: 8.2, bold: true, color: C.textMd, fontFace: 'Manrope',
    })

    outcomes.forEach((outcome, i) => {
      const cx = tableX + nameW + i * metricW
      slide.addText(outcome, {
        x: cx + 0.04, y: tableY + 0.24, w: metricW - 0.08, h: 0.16,
        fontSize: 7.1, bold: true, color: C.textMd, align: 'center', fontFace: 'Manrope',
      })
      slide.addShape('line', {
        x: cx, y: tableY, w: 0, h: tableH,
        line: { color: 'EDF2F7', pt: 0.7 },
      })
    })

    const rowH = Math.min(0.36, bodyH / Math.max(pageRows.length, 1))
    pageRows.forEach((row, idx) => {
      const y = tableY + headerH + idx * rowH

      slide.addText(row.predictor, {
        x: tableX + 0.1, y: y + 0.05, w: nameW - 0.14, h: rowH - 0.1,
        fontSize: 7.7, color: C.textDk, fontFace: 'Inter', valign: 'mid', margin: 0,
      })

      outcomes.forEach((outcome, colIdx) => {
        const metric = row.metrics.find((item) => item.outcome === outcome)
        const value = metric?.coefficient ?? null
        const color = value === null ? 'EEF2F7' : associativeSignedColor(value)
        const txt = value === null ? '--' : formatSignedCoefficient(value)
        const cellX = tableX + nameW + colIdx * metricW

        slide.addShape('roundRect', {
          x: cellX + 0.04, y: y + 0.06, w: metricW - 0.08, h: rowH - 0.12,
          fill: { color }, line: { color, width: 0 }, rectRadius: 0.04,
        })
        slide.addText(txt, {
          x: cellX + 0.04, y: y + 0.06, w: metricW - 0.08, h: rowH - 0.12,
          fontSize: 7.8, bold: true,
          color: value === null ? C.textLt : associativeSignedTextColor(value),
          align: 'center', valign: 'mid', fontFace: 'Manrope', margin: 0,
        })
      })

      slide.addShape('line', {
        x: tableX, y: y + rowH, w: tableW, h: 0,
        line: { color: 'EEF2F7', pt: 0.7 },
      })
    })

    const legendY = cY + cH - 0.42
    slide.addText(`Escala r de -${maxAbs.toFixed(2)} a +${maxAbs.toFixed(2)} (amostra atual).`, {
      x: MX + 0.22, y: legendY, w: CW - 0.44, h: 0.12,
      fontSize: 7.4, color: C.textLt, fontFace: 'Inter', align: 'right',
    })
  }
}

function addAssociativeDynamicDomainHeatmapSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!hasAssociativeDynamicSection(data)) return
  const sNum = getAssociativeSectionNumber(data)
  const rows = data.associativeDomainCorrelations ?? []
  drawAssociativeHeatmapSlides(
    prs,
    data,
    'Correlação (r): Domínios de Risco x Variáveis de Saúde Mental',
    rows,
    `${sNum} | ${associativeSectionBreadcrumbLabel(data)}`,
    10,
  )
}

function addAssociativeDynamicPrioritySlide(prs: PptxGenJS, data: ReportPayload) {
  if (!hasAssociativeDynamicSection(data)) return
  const sNum = getAssociativeSectionNumber(data)
  const rows = (data.associativePriorityActions ?? []).slice(0, 8)
  if (rows.length === 0) return

  const { slide, cY, cH } = mkBase(
    prs,
    'Prioridades de Ação por Associação de Risco',
    data.clientName,
    `${sNum} | ${associativeSectionBreadcrumbLabel(data)}`,
  )

  drawRoundedCard(slide, MX, cY, CW, cH)
  slide.addShape('roundRect', {
    x: MX, y: cY, w: 0.07, h: cH,
    fill: { color: C.high }, line: { color: C.high, width: 0 }, rectRadius: 0.09,
  })

  slide.addText('Priorização baseada em correlação positiva (r) entre risco psicossocial e piora dos desfechos de saúde mental.', {
    x: MX + 0.22, y: cY + 0.14, w: CW - 0.36, h: 0.18,
    fontSize: 8.9, color: C.textLt, italic: true, fontFace: 'Inter',
  })

  const tableX = MX + 0.16
  const tableY = cY + 0.36
  const tableW = CW - 0.3
  const tableH = cH - 0.5
  const headerH = 0.52
  const rowH = (tableH - headerH) / rows.length
  const colW = [1.1, 2.2, 0.92, 1.5, 2.9, tableW - (1.1 + 2.2 + 0.92 + 1.5 + 2.9)]
  const headers = ['Escopo', 'Fator', 'r', 'Prioridade', 'Desfecho-chave', 'Recomendação']

  drawRoundedCard(slide, tableX, tableY, tableW, tableH, { fill: C.white, borderColor: C.border, radius: 0.05 })

  let hx = tableX
  headers.forEach((header, idx) => {
    slide.addShape('rect', {
      x: hx, y: tableY, w: colW[idx], h: headerH,
      fill: { color: 'F6F9FC' }, line: { color: C.border, width: 0.4 },
    })
    slide.addText(header, {
      x: hx + 0.05, y: tableY + 0.17, w: colW[idx] - 0.1, h: 0.16,
      fontSize: 7.2, bold: true, color: C.textMd, align: 'center', fontFace: 'Manrope',
    })
    hx += colW[idx]
  })

  rows.forEach((row, i) => {
    const y = tableY + headerH + i * rowH
    let x = tableX
    const priorityColor = row.priority === 'Alta' ? C.high : row.priority === 'Média' ? C.mod : C.low
    const priorityBg = row.priority === 'Alta' ? C.highLt : row.priority === 'Média' ? C.modLt : C.lowLt
    const values = [
      row.scope,
      row.factor,
      row.strength.toFixed(2),
      row.priority,
      row.strongestOutcome,
      row.recommendation,
    ]

    values.forEach((value, cIdx) => {
      const isPriority = cIdx === 3
      slide.addShape('rect', {
        x, y, w: colW[cIdx], h: rowH,
        fill: { color: isPriority ? priorityBg : C.white },
        line: { color: C.border, width: 0.35 },
      })
      slide.addText(value, {
        x: x + 0.05,
        y: y + 0.06,
        w: colW[cIdx] - 0.1,
        h: rowH - 0.1,
        fontSize: cIdx === 5 ? 6.8 : 7.1,
        bold: isPriority,
        color: isPriority ? priorityColor : C.textDk,
        align: cIdx === 2 ? 'center' : 'left',
        valign: 'mid',
        fontFace: 'Inter',
      })
      x += colW[cIdx]
    })
  })
}

function addRiskClassificationMethodOverviewSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!hasRiskClassificationSection(data)) return

  const sNum = getRiskClassificationSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Método', data.clientName, `${sNum} | CLASSIFICAÇÃO DE RISCOS`)

  drawRoundedCard(slide, MX, cY + 0.04, CW, cH - 0.04, { fill: 'F2F7FC', borderColor: 'DCE8F3', radius: 0.1 })
  slide.addShape('roundRect', {
    x: MX,
    y: cY + 0.04,
    w: 0.07,
    h: cH - 0.04,
    fill: { color: C.blue2 },
    line: { color: C.blue2, width: 0 },
    rectRadius: 0.1,
  })

  const topY = cY + 0.2
  drawRoundedCard(slide, MX + 0.2, topY, CW - 0.3, 1.5, { fill: 'E8F0F9', borderColor: 'E8F0F9', radius: 0.08 })
  slide.addText('Responsabilidade Técnica', {
    x: MX + 0.34,
    y: topY + 0.24,
    w: CW - 0.58,
    h: 0.2,
    fontSize: 16,
    bold: true,
    color: C.navy,
    fontFace: 'Manrope',
  })
  slide.addText(
    'A avaliação dos fatores psicossociais relacionados ao trabalho foi conduzida por profissionais legalmente habilitados em Psicologia, observadas as competências profissionais estabelecidas pela legislação vigente e pelas normas aplicáveis do Conselho Federal de Psicologia.',
    {
      x: MX + 0.34,
      y: topY + 0.58,
      w: CW - 0.6,
      h: 0.82,
      fontSize: 11.3,
      color: C.textDk,
      fontFace: 'Inter',
    },
  )

  const midY = topY + 1.68
  const gap = 0.22
  const cardW = (CW - 0.4 - gap) / 2

  drawRoundedCard(slide, MX + 0.2, midY, cardW, 1.32, { fill: C.navy, borderColor: C.navy, radius: 0.08 })
  slide.addText('Responsáveis técnicos:', {
    x: MX + 0.42,
    y: midY + 0.3,
    w: cardW - 0.32,
    h: 0.18,
    fontSize: 9.6,
    bold: true,
    color: C.white,
    fontFace: 'Manrope',
  })
  slide.addText((data.technicalResponsibles && data.technicalResponsibles.length > 0 ? data.technicalResponsibles : DEFAULT_TECHNICAL_RESPONSIBLES).join('\n'), {
    x: MX + 0.42,
    y: midY + 0.58,
    w: cardW - 0.32,
    h: 0.54,
    fontSize: 10.4,
    bold: true,
    color: C.white,
    fontFace: 'Inter',
  })

  drawRoundedCard(slide, MX + 0.2 + cardW + gap, midY, cardW, 1.32, { fill: C.white, borderColor: C.blue, radius: 0.08 })
  slide.addText('Objetivo e Método AVAX MAP', {
    x: MX + 0.42 + cardW + gap,
    y: midY + 0.3,
    w: cardW - 0.32,
    h: 0.18,
    fontSize: 9.8,
    bold: true,
    color: C.navy,
    fontFace: 'Manrope',
  })
  slide.addText(
    'Avaliar fatores psicossociais e subsidiar ações de prevenção e monitoramento. Em conformidade com NR-01, NR-17 e ISO 45003, o método apoia a tomada de decisão em saúde e segurança do trabalho.',
    {
      x: MX + 0.42 + cardW + gap,
      y: midY + 0.58,
      w: cardW - 0.32,
      h: 0.58,
      fontSize: 9,
      color: C.textDk,
      fontFace: 'Inter',
    },
  )

  const bottomY = midY + 1.5
  drawRoundedCard(slide, MX + 0.2, bottomY, CW - 0.3, cY + cH - bottomY - 0.12, { fill: 'E8F0F9', borderColor: 'E8F0F9', radius: 0.08 })
  slide.addText('Resultados e Integração ao PGR', {
    x: MX + 0.34,
    y: bottomY + 0.18,
    w: CW - 0.58,
    h: 0.18,
    fontSize: 11.5,
    bold: true,
    color: C.navy,
    fontFace: 'Manrope',
  })
  slide.addText(
    'Os resultados constituem subsídios técnicos para identificação de perigos e estimativa de exposição. A classificação final e incorporação ao Inventário de Riscos do PGR deve ser realizada pela organização no âmbito do GRO, considerando processos e medidas de prevenção existentes.',
    {
      x: MX + 0.34,
      y: bottomY + 0.44,
      w: CW - 0.58,
      h: 0.54,
      fontSize: 10.6,
      color: C.textDk,
      fontFace: 'Inter',
    },
  )
  slide.addText('Os resultados deste levantamento devem subsidiar a atualização do Inventário de Riscos Ocupacionais e do Plano de Ação do PGR da organização.', {
    x: MX + 0.34,
    y: bottomY + 1.02,
    w: CW - 0.58,
    h: 0.24,
    fontSize: 10.6,
    italic: true,
    color: C.navy,
    fontFace: 'Inter',
  })
}

function addRiskClassificationMethodTableSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!hasRiskClassificationSection(data)) return

  const sNum = getRiskClassificationSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Método', data.clientName, `${sNum} | CLASSIFICAÇÃO DE RISCOS`)

  const tableX = MX + 0.58
  const tableY = cY + 0.2
  const tableW = CW - 1.16
  const tableH = cH - 0.42
  const headerH = 0.72
  const rowH = (tableH - headerH) / 3
  const colW = [1.75, 2.45, 4.05, tableW - 1.75 - 2.45 - 4.05]

  drawRoundedCard(slide, tableX, tableY, tableW, tableH, { fill: C.white, borderColor: C.border, radius: 0.06 })
  slide.addShape('rect', {
    x: tableX,
    y: tableY,
    w: tableW,
    h: headerH,
    fill: { color: '2668DD' },
    line: { color: '2668DD', width: 0 },
  })

  const headers = ['Plano\nanalisado', 'Fonte', 'O que evidencia', 'Limite']
  let hx = tableX
  headers.forEach((head, i) => {
    slide.addText(head, {
      x: hx + 0.22,
      y: tableY + 0.18,
      w: colW[i] - 0.3,
      h: 0.32,
      fontSize: 10.2,
      bold: true,
      color: C.white,
      fontFace: 'Manrope',
    })
    hx += colW[i]
  })

  const rows = [
    ['Controles\ninstitucionais', 'Informações da empresa', 'Existência de políticas, canais, programas e treinamentos', 'Não comprova, sozinho, efetividade percebida'],
    ['Percepção dos\ntrabalhadores', 'AVAX Map', 'Experiência vivida, exposição percebida, aspectos positivos e vulnerabilidades', 'Não substitui investigação detalhada (análise de processos e da atividade)'],
    ['Integração técnica', 'Análise BeeTouch', 'Onde há coerência ou divergência entre estrutura formal e percepção populacional', 'Requer aprofundamento em áreas prioritárias'],
  ]

  rows.forEach((row, rIdx) => {
    const y = tableY + headerH + rIdx * rowH
    const bg = rIdx % 2 === 0 ? C.white : 'F6F8FB'
    slide.addShape('rect', {
      x: tableX,
      y,
      w: tableW,
      h: rowH,
      fill: { color: bg },
      line: { color: C.border, width: 0 },
    })

    let x = tableX
    row.forEach((cell, cIdx) => {
      slide.addText(cell, {
        x: x + 0.22,
        y: y + 0.22,
        w: colW[cIdx] - 0.3,
        h: rowH - 0.28,
        fontSize: 10.2,
        color: C.textDk,
        fontFace: 'Inter',
      })
      x += colW[cIdx]
    })
  })
}

function addRiskClassificationModelSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!hasRiskClassificationSection(data)) return

  const sNum = getRiskClassificationSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Método', data.clientName, `${sNum} | CLASSIFICAÇÃO DE RISCOS`)

  slide.addText('Classificação de riscos', {
    x: MX,
    y: cY + 0.16,
    w: 3.2,
    h: 0.3,
    fontSize: 23,
    bold: true,
    color: C.navy,
    fontFace: 'Manrope',
  })
  slide.addText(
    'A classificação dos riscos psicossociais baseia-se nos princípios do GRO da NR-1, integrando frequência, severidade e controles implementados. Considera responsabilidade, complexidade, pressão temporal e carga emocional para priorizar ações preventivas.',
    {
      x: MX,
      y: cY + 0.58,
      w: 6.2,
      h: 0.8,
      fontSize: 12,
      color: C.textDk,
      fontFace: 'Inter',
    },
  )

  slide.addText('R = (F × S) ÷ C', {
    x: MX + 0.28,
    y: cY + 1.76,
    w: 3.8,
    h: 0.5,
    fontSize: 34,
    bold: true,
    color: '2668DD',
    fontFace: 'Manrope',
  })
  slide.addText('Modelo utilizado para estimar\no nível de risco ocupacional', {
    x: MX + 3.95,
    y: cY + 1.86,
    w: 2.7,
    h: 0.44,
    fontSize: 12,
    color: '2668DD',
    fontFace: 'Inter',
  })

  const cards = [
    {
      title: 'R = Nível de risco',
      body: 'Combinação entre exposição, potencial de dano e efetividade dos controles existentes.',
    },
    {
      title: 'F = Frequência',
      body: 'Intensidade da exposição, considerando exigências da atividade, como pressão temporal e carga emocional.',
    },
    {
      title: 'S = Severidade',
      body: 'Potencial de dano à saúde, estresse ocupacional, sofrimento psíquico e impactos funcionais.',
    },
    {
      title: 'C = Controles',
      body: 'Abrangência e eficácia das medidas preventivas implementadas para mitigar riscos.',
    },
  ]

  const gap = 0.2
  const cardW = (CW - gap * 3) / 4
  const y = cY + 3.08
  cards.forEach((card, idx) => {
    const x = MX + idx * (cardW + gap)
    drawRoundedCard(slide, x, y, cardW, 1.72, { fill: 'E9EFF6', borderColor: 'DCE5EE', radius: 0.08 })
    slide.addText(card.title, {
      x: x + 0.18,
      y: y + 0.22,
      w: cardW - 0.3,
      h: 0.24,
      fontSize: 16,
      bold: true,
      color: C.navy,
      fontFace: 'Manrope',
    })
    slide.addText(card.body, {
      x: x + 0.18,
      y: y + 0.58,
      w: cardW - 0.3,
      h: 0.96,
      fontSize: 10.2,
      color: C.textDk,
      fontFace: 'Inter',
    })
  })
}

function addRiskClassificationLevelsSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!hasRiskClassificationSection(data)) return

  const sNum = getRiskClassificationSectionNumber(data)
  const { slide, cY } = mkBase(prs, 'Classificação da Frequência (F)', data.clientName, `${sNum} | CLASSIFICAÇÃO DE RISCOS`)

  slide.addText('Classificação da frequência de exposição aos fatores de riscos psicossociais', {
    x: MX,
    y: cY + 0.12,
    w: 6.2,
    h: 0.26,
    fontSize: 18,
    bold: true,
    color: C.navy,
    fontFace: 'Manrope',
  })
  slide.addText(
    'A classificação é realizada com base na média dos itens válidos de cada domínio, permitindo a comparação entre dimensões. Valores mais elevados representam maior exposição percebida aos fatores de riscos.',
    {
      x: MX,
      y: cY + 0.44,
      w: 6.15,
      h: 0.6,
      fontSize: 11,
      color: C.textDk,
      fontFace: 'Inter',
    },
  )

  const cards = [
    {
      title: 'Baixo',
      body: 'Predominância de percepções favoráveis e presença de condições consideradas protetivas.',
      bg: 'DDEDDC',
      border: C.low,
      fg: '496E32',
    },
    {
      title: 'Moderado',
      body: 'Coexistência de fatores protetivos e de atenção, indicando oportunidade de monitoramento e melhoria.',
      bg: 'F9F2D8',
      border: C.mod,
      fg: '8A6510',
    },
    {
      title: 'Alto',
      body: 'Predominância de percepções desfavoráveis, sugerindo maior exposição e necessidade de intervenção prioritária.',
      bg: 'FCEBE1',
      border: 'F2A370',
      fg: '8F4A1D',
    },
  ]

  const gap = 0.24
  const cardW = (CW - gap * 2) / 3
  const y = cY + 1.34
  cards.forEach((card, idx) => {
    const x = MX + idx * (cardW + gap)
    drawRoundedCard(slide, x, y, cardW, 1.34, { fill: card.bg, borderColor: card.border, radius: 0.1 })
    slide.addText(card.title, {
      x: x + 0.22,
      y: y + 0.2,
      w: cardW - 0.32,
      h: 0.24,
      fontSize: 17,
      bold: true,
      color: card.fg,
      fontFace: 'Manrope',
    })
    slide.addText(card.body, {
      x: x + 0.22,
      y: y + 0.58,
      w: cardW - 0.34,
      h: 0.6,
      fontSize: 10.3,
      color: card.fg,
      fontFace: 'Inter',
    })
  })

  drawRoundedCard(slide, MX, cY + 3.02, CW, 1.52, { fill: 'E9EFF6', borderColor: 'DDE5EF', radius: 0.1 })
  slide.addText('Frequência (F)', {
    x: MX + 0.28,
    y: cY + 3.32,
    w: CW - 0.5,
    h: 0.24,
    fontSize: 20,
    bold: true,
    color: C.navy,
    fontFace: 'Manrope',
  })
  slide.addText(
    'Para fins de gestão de riscos e apoio ao PGR, o indicador (F) corresponde à proporção da população potencialmente exposta ao fator de risco psicossocial, sendo essencial para a estimativa do risco ocupacional total.',
    {
      x: MX + 0.28,
      y: cY + 3.76,
      w: CW - 0.54,
      h: 0.58,
      fontSize: 11.3,
      color: C.textDk,
      fontFace: 'Inter',
    },
  )
  slide.addText('Os pontos de corte são definidos a partir de critérios técnicos e estatísticos estabelecidos para o instrumento.', {
    x: MX,
    y: cY + 5.54,
    w: CW,
    h: 0.18,
    fontSize: 9.6,
    italic: true,
    color: C.textMd,
    fontFace: 'Inter',
  })
}

function addRiskClassificationSeverityTableSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!hasRiskClassificationSection(data)) return

  const sNum = getRiskClassificationSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Classificação da Severidade dos Riscos (S)', data.clientName, `${sNum} | CLASSIFICAÇÃO DE RISCOS`)

  const tableX = MX - 0.1
  const tableY = cY + 0.06
  const tableW = CW + 0.2
  const tableH = cH - 0.12
  const headerH = 0.52
  const hazards = riskHazardsForProtocol()
  const rowH = (tableH - headerH) / hazards.length
  const colW = [3.1, 1.7, 2.65, 1.2, tableW - 3.1 - 1.7 - 2.65 - 1.2]

  drawRoundedCard(slide, tableX, tableY, tableW, tableH, { fill: C.white, borderColor: C.border, radius: 0.03 })
  slide.addShape('rect', {
    x: tableX,
    y: tableY,
    w: tableW,
    h: headerH,
    fill: { color: '2B4593' },
    line: { color: '2B4593', width: 0 },
  })

  const headers = [
    'Perigo\n(Fator de Risco Psicossocial)',
    'Domínio\ncorrespondente',
    'Descrição resumida do risco',
    'Severidade\n(0-100)',
    'Justificativa técnica (base NR-01 / Guia MTE)',
  ]
  let hx = tableX
  headers.forEach((head, i) => {
    slide.addText(head, {
      x: hx + 0.08,
      y: tableY + 0.1,
      w: colW[i] - 0.16,
      h: 0.34,
      fontSize: 8.6,
      bold: true,
      color: C.white,
      align: 'center',
      fontFace: 'Manrope',
    })
    hx += colW[i]
  })

  const rows = hazards.map((h) => [h.hazard, h.domain, h.description, String(h.severity), h.justification])

  rows.forEach((row, rIdx) => {
    const y = tableY + headerH + rIdx * rowH
    const bg = rIdx % 2 === 0 ? C.white : 'F4F6F8'
    slide.addShape('rect', {
      x: tableX,
      y,
      w: tableW,
      h: rowH,
      fill: { color: bg },
      line: { color: 'E5E9EF', width: 0.4 },
    })

    let x = tableX
    row.forEach((cell, cIdx) => {
      slide.addText(cell, {
        x: x + 0.08,
        y: y + 0.05,
        w: colW[cIdx] - 0.16,
        h: rowH - 0.08,
        fontSize: cIdx === 4 ? 7.0 : 7.4,
        bold: cIdx === 3,
        align: 'center',
        color: C.textDk,
        fontFace: 'Inter',
      })
      x += colW[cIdx]
    })
  })
}

type ControlLevel = 'Excelente' | 'Adequado' | 'Intermediário' | 'Vulnerável' | 'Crítico'

function controlLevelFromScore(score: number): ControlLevel {
  if (score >= 81) return 'Excelente'
  if (score >= 61) return 'Adequado'
  if (score >= 41) return 'Intermediário'
  if (score >= 21) return 'Vulnerável'
  return 'Crítico'
}

function controlLevelPalette(level: ControlLevel): { bg: string; border: string; fg: string; dot: string } {
  if (level === 'Excelente') return { bg: 'E7F4E2', border: '93C47D', fg: '335622', dot: '76B95E' }
  if (level === 'Adequado') return { bg: 'E6EFFB', border: '7DADE3', fg: '1F4F8C', dot: '4F7FD8' }
  if (level === 'Intermediário') return { bg: 'FBEFCD', border: 'F4C85C', fg: '8A6510', dot: 'E2B32F' }
  if (level === 'Vulnerável') return { bg: 'FCE8DD', border: 'F4A261', fg: '8C4A17', dot: 'F2874A' }
  return { bg: 'FADFE0', border: 'E28A8E', fg: '7A1E23', dot: 'D95A61' }
}

type RiskMatrixRow = {
  domain: string
  f: number
  s: number
  c: number
  r: number
  cls: string
}

function addRiskMatrixSlide(prs: PptxGenJS, data: ReportPayload, title: string, rows: RiskMatrixRow[]) {
  if (!hasRiskClassificationSection(data)) return

  const sNum = getRiskClassificationSectionNumber(data)
  const { slide, cY } = mkBase(prs, title, data.clientName, `${sNum} | CLASSIFICAÇÃO DE RISCOS`)

  const tableX = MX + 0.24
  const tableY = cY + 1.12
  const tableW = CW - 0.48
  const headerH = 0.46
  const rowH = 0.38
  const colW = [1.95, 1.45, 1.95, 1.95, 2.0, tableW - 1.95 - 1.45 - 1.95 - 1.95 - 2.0]
  const headers = ['Domínio\nPsicossocial', 'Risco (F)', 'Severidade\n(S)', 'Controle (C)', 'Nível de Risco\n(R)', 'Classificação']

  drawRoundedCard(slide, tableX, tableY, tableW, headerH + rowH * rows.length, { fill: C.white, borderColor: 'D3DEEA', radius: 0.03 })
  slide.addShape('rect', {
    x: tableX,
    y: tableY,
    w: tableW,
    h: headerH,
    fill: { color: 'F3F7FC' },
    line: { color: 'D3DEEA', width: 0.5 },
  })

  let hx = tableX
  headers.forEach((head, idx) => {
    slide.addText(head, {
      x: hx + 0.1,
      y: tableY + 0.1,
      w: colW[idx] - 0.2,
      h: 0.28,
      fontSize: 9.8,
      bold: true,
      color: C.navy,
      fontFace: 'Manrope',
    })
    hx += colW[idx]
  })

  rows.forEach((row, idx) => {
    const y = tableY + headerH + idx * rowH
    const bg = idx % 2 === 0 ? C.white : 'FAFCFE'
    slide.addShape('rect', {
      x: tableX,
      y,
      w: tableW,
      h: rowH,
      fill: { color: bg },
      line: { color: 'E2EAF3', width: 0.4 },
    })

    const clsLevel: ControlLevel = row.cls === 'Intolerável'
      ? 'Crítico'
      : row.cls === 'Substancial'
        ? 'Vulnerável'
        : row.cls === 'Moderado'
          ? 'Intermediário'
          : row.cls === 'Tolerável'
            ? 'Adequado'
            : 'Excelente'
    const pal = controlLevelPalette(clsLevel)

    const cells = [
      row.domain,
      row.f.toFixed(1).replace('.', ','),
      String(row.s),
      String(row.c),
      row.r.toFixed(1).replace('.', ','),
      row.cls,
    ]

    let x = tableX
    cells.forEach((cell, cIdx) => {
      if (cIdx === 5) {
        drawRoundedCard(slide, x + 0.06, y + 0.07, colW[cIdx] - 0.12, rowH - 0.14, {
          fill: pal.bg,
          borderColor: pal.border,
          radius: 0.03,
        })
      }
      slide.addText(cell, {
        x: x + 0.1,
        y: y + 0.1,
        w: colW[cIdx] - 0.2,
        h: 0.18,
        fontSize: 9.6,
        bold: cIdx === 5,
        color: cIdx === 5 ? pal.fg : C.textDk,
        fontFace: cIdx === 5 ? 'Manrope' : 'Inter',
      })
      x += colW[cIdx]
    })
  })
}

/**
 * Nota de Controle (C, 0–100) por domínio — maturidade das medidas de controle já existentes,
 * informada na geração do relatório (riskControlByDomain). Domínio sem nota usa
 * DEFAULT_RISK_CONTROL ("Intermediário"); valores fora da faixa são limitados a 1–100 (C = 0
 * tornaria R indefinido).
 */
function getFabControlByDomain(data: ReportPayload): Record<string, number> {
  const out: Record<string, number> = {}
  for (const domain of riskMatrixDomains()) {
    const raw = data.riskControlByDomain?.[domain]
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_RISK_CONTROL
    out[domain] = Math.max(1, Math.min(100, Math.round(value)))
  }
  return out
}

function buildFabRiskMatrixRows(data: ReportPayload, domainAtLeastModeratePcts: Record<string, number | null>): RiskMatrixRow[] {
  return buildRiskMatrixRowsForDomains(domainAtLeastModeratePcts, getFabControlByDomain(data))
}

function addFabDynamicRiskMatrixGeneralSlide(prs: PptxGenJS, data: ReportPayload) {
  const pcts: Record<string, number | null> = data.overallDomainAtLeastModeratePcts
    ?? Object.fromEntries((data.domainAvgs ?? []).map((item) => [item.domain, riskSeverityPct(item.avg)]))

  const rows = buildFabRiskMatrixRows(data, pcts)
  addRiskMatrixSlide(prs, data, `Matriz de Risco Ocupacional — ${data.clientName} Geral`, rows)
}

function addFabDynamicRiskMatrixByUnitSlides(prs: PptxGenJS, data: ReportPayload) {
  const rows = (data.stratumRows ?? []).filter((row) => row.answered >= 5)
  if (rows.length === 0) return

  rows.forEach((row) => {
    const pcts: Record<string, number | null> = row.domainAtLeastModeratePcts
      ?? Object.fromEntries(Object.entries(row.domainAvgs).map(([domain, avg]) => [domain, avg === null ? null : riskSeverityPct(avg)]))

    const matrixRows = buildFabRiskMatrixRows(data, pcts)
    addRiskMatrixSlide(prs, data, `Matriz de Risco Ocupacional — ${data.stratumLabel}: ${row.name}`, matrixRows)
  })
}

// Placeholder — texto a ser substituído por conteúdo real sobre a maturidade das medidas
// de controle do escopo relatado, redigido pelo time de negócio a partir do diagnóstico.
// "OM" só faz sentido para a FAB; Statkraft e Abiquim usam o termo genérico.
export const DEFAULT_TECHNICAL_RESPONSIBLES = [
  'Dra. Ana Carolina Peuker — CRP 07/11087',
  'Ms. Miguel Alves — CRP 07/33497',
]

const CONTROL_LEVEL_TEXT: Record<ControlLevel, string> = {
  Excelente: 'a gestão deste fator é altamente estruturada, com indicadores, práticas sistemáticas e acompanhamento contínuo.',
  Adequado: 'existem práticas consistentes para este fator, ainda com espaço para evolução na integração e no alcance das ações.',
  Intermediário: 'existem políticas e ações pontuais, mas falta sistematização e acompanhamento contínuo dos resultados.',
  Vulnerável: 'há lacunas estruturais significativas e as práticas preventivas ainda são incipientes.',
  Crítico: 'não há políticas, suporte ou monitoramento adequados — o fator está, na prática, sem medidas de controle.',
}

/** Medidas de controle típicas por domínio — orientam o que a nota está avaliando. */
const CONTROL_EXAMPLES: Record<string, string> = {
  'Demandas': 'dimensionamento de equipes, gestão de prazos, pausas e limites de jornada',
  'Controle': 'autonomia sobre ritmo, pausas e método de trabalho; participação nas decisões',
  'Apoio da Liderança': 'formação de lideranças, rituais de escuta e feedback, suporte em situações críticas',
  'Apoio dos Colegas': 'práticas de cooperação, integração de equipes e redes de apoio entre pares',
  'Relacionamentos': 'política e canal de denúncia de assédio, mediação de conflitos e resposta a condutas inadequadas',
  'Cargo': 'descrição de funções, clareza de metas e alinhamento de responsabilidades',
  'Comunicação e Mudanças': 'comunicação prévia de mudanças, consulta às equipes e retorno sobre decisões',
}

function controlDomainJustification(data: ReportPayload, domain: string, score: number): string {
  const custom = data.riskControlNotes?.byDomain?.[domain]?.trim()
  if (custom) return custom
  const level = controlLevelFromScore(score)
  const examples = CONTROL_EXAMPLES[domain]
  return `Nota ${score}/100 (${level}): ${CONTROL_LEVEL_TEXT[level]}${examples ? ` Para este domínio, considera-se a maturidade de medidas como ${examples}.` : ''}`
}

function controlGeneralParagraphs(data: ReportPayload, controlByDomain: Record<string, number>): string[] {
  const custom = data.riskControlNotes?.general?.trim()
  const entries = Object.entries(controlByDomain).sort((a, b) => a[1] - b[1])
  const avg = Math.round(entries.reduce((s, [, v]) => s + v, 0) / Math.max(1, entries.length))
  const level = controlLevelFromScore(avg)
  const weakest = entries.slice(0, 2).map(([d, v]) => `${d} (${v})`)
  const strongest = entries.slice(-2).reverse().map(([d, v]) => `${d} (${v})`)
  const uniform = entries.length > 0 && entries[0][1] === entries[entries.length - 1][1]
  return [
    custom ?? `A Nota Geral de Controle (${avg}/100) é a média das notas atribuídas às medidas de controle de cada domínio e indica nível ${level.toLowerCase()}: ${CONTROL_LEVEL_TEXT[level]}`,
    uniform
      ? 'Todos os domínios receberam a mesma nota de controle. Recomenda-se revisar as notas com as áreas responsáveis (RH, SESMT, lideranças) para refletir a maturidade real de cada fator.'
      : `Os controles mais frágeis estão em ${joinNaturalList(weakest)}; os mais maduros, em ${joinNaturalList(strongest)}. A nota de controle reduz o risco final (R = F × S / C): domínios com controle frágil e alta exposição tendem a liderar a priorização.`,
    'As notas devem ser revisadas a cada ciclo de avaliação, à medida que as ações do Plano de Ação forem implantadas, para que a Matriz de Risco Ocupacional reflita a evolução das medidas de prevenção.',
  ]
}

function controlConclusionParagraphs(data: ReportPayload): string[] {
  const custom = data.riskControlNotes?.conclusion?.trim()
  const pcts: Record<string, number | null> = data.overallDomainAtLeastModeratePcts
    ?? Object.fromEntries((data.domainAvgs ?? []).map((item) => [item.domain, riskSeverityPct(item.avg)]))
  const rows = buildFabRiskMatrixRows(data, pcts)
  const top = rows.slice(0, 3).map((r) => `${r.domain} (R = ${r.r.toFixed(1).replace('.', ',')}, ${r.cls.toLowerCase()})`)
  const critical = rows.filter((r) => r.cls === 'Intolerável' || r.cls === 'Substancial').map((r) => r.domain)
  const lowControl = Object.entries(getFabControlByDomain(data)).filter(([, v]) => v <= 40).map(([d]) => d)
  return [
    custom ?? `A Matriz de Risco Ocupacional de ${data.clientName} aponta como fatores prioritários ${joinNaturalList(top)}.`,
    critical.length > 0
      ? `${joinNaturalList(critical)} ${critical.length === 1 ? 'atinge' : 'atingem'} classificação substancial ou intolerável e ${critical.length === 1 ? 'exige' : 'exigem'} ação imediata, com responsáveis e prazos definidos no Plano de Ação do PGR.`
      : 'Nenhum domínio atinge classificação substancial ou intolerável; a prioridade é corrigir os fatores moderados e manter o monitoramento dos demais.',
    lowControl.length > 0
      ? `As medidas de controle são frágeis em ${joinNaturalList(lowControl)}, o que amplia o risco residual mesmo onde a exposição é moderada.`
      : 'Não há domínios com controle vulnerável ou crítico; o foco é reduzir a exposição (F) nos fatores com maior severidade.',
    'Estes resultados devem subsidiar a atualização do Inventário de Riscos e do Plano de Ação do PGR, no âmbito do GRO, com reavaliação periódica.',
  ]
}

function addFabRiskControlGeneralSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getRiskClassificationSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Classificação Geral', data.clientName, `${sNum} | CLASSIFICAÇÃO DE RISCOS`)

  const controlByDomain = getFabControlByDomain(data)
  const scoreValues = Object.values(controlByDomain)
  const score = Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length)
  const level = controlLevelFromScore(score)
  const pal = controlLevelPalette(level)

  drawRoundedCard(slide, MX, cY + 0.06, CW, cH - 0.1)
  slide.addShape('roundRect', {
    x: MX,
    y: cY + 0.06,
    w: 0.07,
    h: cH - 0.1,
    fill: { color: C.blue2 },
    line: { color: C.blue2, width: 0 },
    rectRadius: 0.09,
  })

  slide.addText('1. Classificação Geral', {
    x: MX + 0.34,
    y: cY + 0.24,
    w: 3.6,
    h: 0.22,
    fontSize: 18,
    bold: true,
    color: C.textDk,
    fontFace: 'Manrope',
  })

  slide.addText(`Nota Geral: ${score}/100`, {
    x: MX + 0.34,
    y: cY + 0.64,
    w: 2.4,
    h: 0.2,
    fontSize: 16,
    bold: true,
    color: C.textDk,
    fontFace: 'Manrope',
  })

  slide.addText('—', {
    x: MX + 2.76,
    y: cY + 0.64,
    w: 0.16,
    h: 0.2,
    fontSize: 16,
    bold: true,
    color: C.textDk,
    fontFace: 'Manrope',
  })

  slide.addShape('ellipse', {
    x: MX + 2.98,
    y: cY + 0.67,
    w: 0.16,
    h: 0.16,
    fill: { color: pal.dot },
    line: { color: pal.dot, width: 0 },
  })

  slide.addText(level, {
    x: MX + 3.22,
    y: cY + 0.64,
    w: 1.6,
    h: 0.2,
    fontSize: 16,
    bold: true,
    color: C.textDk,
    fontFace: 'Manrope',
    wrap: false,
  })

  slide.addText('Justificativa', {
    x: MX + 0.34,
    y: cY + 1.06,
    w: 2.2,
    h: 0.2,
    fontSize: 14,
    bold: true,
    color: C.textDk,
    fontFace: 'Manrope',
  })

  const paragraphs = controlGeneralParagraphs(data, controlByDomain)

  paragraphs.forEach((txt, idx) => {
    drawRoundedCard(slide, MX + 0.3, cY + 1.34 + idx * 1.33, CW - 0.52, 1.16, {
      fill: idx % 2 === 0 ? 'F8FBFE' : C.white,
      borderColor: C.border,
      radius: 0.05,
    })
    slide.addText(txt, {
      x: MX + 0.44,
      y: cY + 1.48 + idx * 1.33,
      w: CW - 0.82,
      h: 0.9,
      fontSize: 10.6,
      color: C.textDk,
      fontFace: 'Inter',
    })
  })
}

function addFabRiskControlDomainSlide(prs: PptxGenJS, data: ReportPayload) {
  const controlByDomain = getFabControlByDomain(data)
  const items = riskMatrixDomains().map((domain, idx) => ({
    title: `2.${idx + 1} ${domain}`,
    score: controlByDomain[domain],
    text: controlDomainJustification(data, domain, controlByDomain[domain]),
  }))

  const sNum = getRiskClassificationSectionNumber(data)
  const PER_PAGE = 2
  const pages = Math.ceil(items.length / PER_PAGE)

  for (let p = 0; p < pages; p++) {
    const pageItems = items.slice(p * PER_PAGE, (p + 1) * PER_PAGE)
    const suffix = pages > 1 ? ` (${p + 1}/${pages})` : ''
    const { slide, cY, cH } = mkBase(prs, `Classificação por Domínio${suffix}`, data.clientName, `${sNum} | CLASSIFICAÇÃO DE RISCOS`)

    drawRoundedCard(slide, MX, cY + 0.06, CW, cH - 0.1)
    slide.addShape('roundRect', {
      x: MX,
      y: cY + 0.06,
      w: 0.07,
      h: cH - 0.1,
      fill: { color: C.blue2 },
      line: { color: C.blue2, width: 0 },
      rectRadius: 0.09,
    })

    slide.addText('2. Classificação por Domínio', {
      x: MX + 0.34,
      y: cY + 0.22,
      w: 4.2,
      h: 0.22,
      fontSize: 18,
      bold: true,
      color: C.textDk,
      fontFace: 'Manrope',
    })

    pageItems.forEach((item, idx) => {
      const level = controlLevelFromScore(item.score)
      const pal = controlLevelPalette(level)
      const y = cY + 0.58 + idx * 2.56

      drawRoundedCard(slide, MX + 0.28, y, CW - 0.5, 2.34, {
        fill: idx % 2 === 0 ? 'F8FBFE' : C.white,
        borderColor: C.border,
        radius: 0.05,
      })

      slide.addText(item.title, {
        x: MX + 0.42,
        y: y + 0.14,
        w: 2.6,
        h: 0.2,
        fontSize: 14,
        bold: true,
        color: C.textDk,
        fontFace: 'Manrope',
      })

      slide.addText(`Nota: ${item.score}/100`, {
        x: MX + 0.42,
        y: y + 0.48,
        w: 1.6,
        h: 0.18,
        fontSize: 12.5,
        bold: true,
        color: C.textDk,
        fontFace: 'Manrope',
      })

      slide.addText('—', {
        x: MX + 2.05,
        y: y + 0.48,
        w: 0.16,
        h: 0.18,
        fontSize: 12.5,
        bold: true,
        color: C.textDk,
        fontFace: 'Manrope',
      })

      slide.addShape('ellipse', {
        x: MX + 2.28,
        y: y + 0.5,
        w: 0.15,
        h: 0.15,
        fill: { color: pal.dot },
        line: { color: pal.dot, width: 0 },
      })

      slide.addText(level, {
        x: MX + 2.52,
        y: y + 0.48,
        w: 1.3,
        h: 0.18,
        fontSize: 12.5,
        bold: true,
        color: C.textDk,
        fontFace: 'Manrope',
        wrap: false,
      })

      slide.addText('Justificativa', {
        x: MX + 0.42,
        y: y + 0.8,
        w: 1.5,
        h: 0.16,
        fontSize: 11,
        bold: true,
        color: C.textDk,
        fontFace: 'Manrope',
      })

      slide.addText(item.text, {
        x: MX + 0.56,
        y: y + 1.02,
        w: CW - 0.88,
        h: 1.18,
        fontSize: 10.4,
        color: C.textDk,
        fontFace: 'Inter',
      })
    })
  }
}

function addFabRiskControlSummarySlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getRiskClassificationSectionNumber(data)
  const { slide, cY } = mkBase(prs, 'Resumo', data.clientName, `${sNum} | CLASSIFICAÇÃO DE RISCOS`)

  slide.addText('Resumo', {
    x: MX,
    y: cY + 0.04,
    w: CW,
    h: 0.24,
    fontSize: 20,
    bold: true,
    color: C.textDk,
    fontFace: 'Manrope',
  })

  const controlByDomain = getFabControlByDomain(data)
  const domainRows = riskMatrixDomains().map((domain) => ({ domain, score: controlByDomain[domain] }))
  const generalScore = Math.round(domainRows.reduce((sum, row) => sum + row.score, 0) / domainRows.length)
  const rows = [...domainRows, { domain: 'Geral', score: generalScore }]

  const tableX = MX
  const tableY = cY + 0.44
  const tableW = CW
  const tableH = 4.95
  const headerH = 0.5
  const rowH = (tableH - headerH) / rows.length
  const colW = [2.95, 2.6, tableW - 2.95 - 2.6]

  drawRoundedCard(slide, tableX, tableY, tableW, tableH, { fill: C.white, borderColor: C.border, radius: 0.03 })
  slide.addShape('rect', {
    x: tableX,
    y: tableY,
    w: tableW,
    h: headerH,
    fill: { color: 'F3F7FB' },
    line: { color: C.border, width: 0.6 },
  })

  const headers = ['Domínio', 'Nota', 'Nível de Atenção']
  let hx = tableX
  headers.forEach((head, idx) => {
    slide.addText(head, {
      x: hx + 0.12,
      y: tableY + 0.14,
      w: colW[idx] - 0.24,
      h: 0.2,
      fontSize: 12,
      bold: true,
      color: C.textDk,
      align: 'center',
      fontFace: 'Manrope',
    })
    hx += colW[idx]
  })

  rows.forEach((row, idx) => {
    const y = tableY + headerH + idx * rowH
    const bg = idx % 2 === 0 ? C.white : 'FAFCFE'
    const level = controlLevelFromScore(row.score)
    const pal = controlLevelPalette(level)

    slide.addShape('rect', {
      x: tableX,
      y,
      w: tableW,
      h: rowH,
      fill: { color: bg },
      line: { color: C.border, width: 0.5 },
    })

    slide.addText(row.domain, {
      x: tableX + 0.12,
      y: y + 0.13,
      w: colW[0] - 0.24,
      h: 0.16,
      fontSize: row.domain === 'Geral' ? 12 : 11.5,
      bold: row.domain === 'Geral',
      color: C.textDk,
      align: 'left',
      fontFace: 'Inter',
    })

    slide.addText(String(row.score), {
      x: tableX + colW[0] + 0.12,
      y: y + 0.13,
      w: colW[1] - 0.24,
      h: 0.16,
      fontSize: row.domain === 'Geral' ? 12 : 11.5,
      bold: row.domain === 'Geral',
      color: C.textDk,
      align: 'left',
      fontFace: 'Manrope',
    })

    slide.addShape('ellipse', {
      x: tableX + colW[0] + colW[1] + 0.16,
      y: y + 0.12,
      w: 0.15,
      h: 0.15,
      fill: { color: pal.dot },
      line: { color: pal.dot, width: 0 },
    })

    slide.addText(level, {
      x: tableX + colW[0] + colW[1] + 0.4,
      y: y + 0.12,
      w: colW[2] - 0.5,
      h: 0.18,
      fontSize: row.domain === 'Geral' ? 12 : 11.5,
      bold: row.domain === 'Geral',
      color: C.textDk,
      align: 'left',
      fontFace: 'Inter',
    })
  })
}

// Reaproveita as faixas de controlLevelPalette para as 4 primeiras faixas (mesma linguagem
// visual do restante da seção); Intolerável ganha um tom próprio, mais grave que "Crítico",
// já que é o topo da escala de risco final (R = F x S / C), não de maturidade de controle.
function finalRiskLevelPalette(level: string): { bg: string; border: string; fg: string; dot: string } {
  if (level === 'Trivial') return controlLevelPalette('Excelente')
  if (level === 'Tolerável') return controlLevelPalette('Intermediário')
  if (level === 'Moderado') return controlLevelPalette('Vulnerável')
  if (level === 'Substancial') return controlLevelPalette('Crítico')
  return { bg: 'F3D2D3', border: 'B33036', fg: '4A0E11', dot: '9A1D22' }
}

function addFabFinalRiskRangesSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getRiskClassificationSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Faixas da Classificação de Riscos Final', data.clientName, `${sNum} | CLASSIFICAÇÃO DE RISCOS`)

  const tableX = MX
  const tableY = cY + 0.28
  const tableW = CW
  const tableH = cH - 0.34
  const headerH = 0.5
  const rowH = (tableH - headerH) / 5
  const colW = [1.3, 1.7, tableW - 1.3 - 1.7]

  drawRoundedCard(slide, tableX, tableY, tableW, tableH, { fill: C.white, borderColor: C.border, radius: 0.03 })
  slide.addShape('rect', {
    x: tableX,
    y: tableY,
    w: tableW,
    h: headerH,
    fill: { color: C.navy },
    line: { color: C.navy, width: 0 },
  })

  const headers = ['Valor', 'Classificação', 'Ações']
  let hx = tableX
  headers.forEach((head, idx) => {
    slide.addText(head, {
      x: hx + 0.14,
      y: tableY + 0.14,
      w: colW[idx] - 0.24,
      h: 0.22,
      fontSize: 11,
      bold: true,
      color: C.white,
      align: idx === 2 ? 'left' : 'center',
      fontFace: 'Manrope',
    })
    hx += colW[idx]
  })

  const rows: { range: string; level: string; text: string }[] = [
    { range: '0 – 19', level: 'Trivial', text: 'Monitoramento rotineiro; manter controles existentes; ações corretivas adiadas/baixa prioridade.' },
    { range: '20 – 39', level: 'Tolerável', text: 'Ação corretiva planejada a médio prazo; revisão das medidas administrativas; treinamento focalizado.' },
    { range: '40 – 59', level: 'Moderado', text: 'Medidas de controle prioritárias; plano de ação com responsáveis e prazo (curto prazo); revisão do procedimento e comunicação aos trabalhadores.' },
    { range: '60 – 79', level: 'Substancial', text: 'Intervenção imediata; controles coletivos e administrativos reforçados; avaliar necessidade de medidas organizacionais e apoio à saúde; monitoramento rigoroso.' },
    { range: '80 – ≥100', level: 'Intolerável', text: 'Ação corretiva imediata e possivelmente suspensão da atividade até mitigação efetiva; envolver alta direção; medidas de emergência e acompanhamento de saúde dos trabalhadores; comunicar inventário de riscos e plano de ação conforme NR-1.' },
  ]

  rows.forEach((row, idx) => {
    const y = tableY + headerH + idx * rowH
    const bg = idx % 2 === 0 ? C.white : 'FAFCFE'
    const pal = finalRiskLevelPalette(row.level)

    slide.addShape('rect', {
      x: tableX,
      y,
      w: tableW,
      h: rowH,
      fill: { color: bg },
      line: { color: C.border, width: 0.5 },
    })

    slide.addText(row.range, {
      x: tableX + 0.14,
      y: y + 0.08,
      w: colW[0] - 0.24,
      h: rowH - 0.16,
      fontSize: 11,
      bold: true,
      color: C.textDk,
      align: 'center',
      valign: 'mid',
      fontFace: 'Manrope',
    })

    drawRoundedCard(slide, tableX + colW[0] + 0.14, y + (rowH - 0.3) / 2, colW[1] - 0.28, 0.3, {
      fill: pal.bg,
      borderColor: pal.border,
      radius: 0.06,
    })
    slide.addShape('ellipse', {
      x: tableX + colW[0] + 0.28,
      y: y + rowH / 2 - 0.06,
      w: 0.12,
      h: 0.12,
      fill: { color: pal.dot },
      line: { color: pal.dot, width: 0 },
    })
    slide.addText(row.level, {
      x: tableX + colW[0] + 0.46,
      y: y + (rowH - 0.3) / 2,
      w: colW[1] - 0.6,
      h: 0.3,
      fontSize: 10.4,
      bold: true,
      color: pal.fg,
      align: 'left',
      valign: 'mid',
      fontFace: 'Manrope',
    })

    slide.addText(row.text, {
      x: tableX + colW[0] + colW[1] + 0.14,
      y: y + 0.08,
      w: colW[2] - 0.26,
      h: rowH - 0.16,
      fontSize: 9.4,
      color: C.textDk,
      valign: 'mid',
      fontFace: 'Inter',
    })
  })
}

function addFabRiskControlConclusionSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getRiskClassificationSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Conclusão Geral', data.clientName, `${sNum} | CLASSIFICAÇÃO DE RISCOS`)

  drawRoundedCard(slide, MX, cY + 0.06, CW, cH - 0.1)
  slide.addShape('roundRect', {
    x: MX,
    y: cY + 0.06,
    w: 0.07,
    h: cH - 0.1,
    fill: { color: C.blue2 },
    line: { color: C.blue2, width: 0 },
    rectRadius: 0.09,
  })

  slide.addText('3. Conclusão Geral', {
    x: MX + 0.34,
    y: cY + 0.22,
    w: 3.6,
    h: 0.22,
    fontSize: 20,
    bold: true,
    color: C.textDk,
    fontFace: 'Manrope',
  })

  const paragraphs = controlConclusionParagraphs(data)

  paragraphs.forEach((txt, idx) => {
    drawRoundedCard(slide, MX + 0.3, cY + 0.62 + idx * 1.24, CW - 0.52, 1.1, {
      fill: idx % 2 === 0 ? 'F8FBFE' : C.white,
      borderColor: C.border,
      radius: 0.05,
    })
    slide.addText(txt, {
      x: MX + 0.44,
      y: cY + 0.76 + idx * 1.24,
      w: CW - 0.82,
      h: 0.82,
      fontSize: 11,
      color: C.textDk,
      fontFace: 'Inter',
    })
  })
}

function lowerFirstNoDot(s: string): string {
  const trimmed = s.replace(/\.$/, '')
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
}

// Fecha a seção de Classificação de Riscos com uma leitura executiva — 100% calculada a partir
// de data.hseAvg/hseClassDist/domainAvgs e das correlações associativas já usadas em outros
// slides. O tom (favorável vs. que requer atenção) e os domínios citados mudam conforme os
// dados de cada base; nada aqui é fixo por cliente.
function addRiskClassificationExecutiveSynthesisSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getRiskClassificationSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Síntese Executiva', data.clientName, `${sNum} | CLASSIFICAÇÃO DE RISCOS`)

  const hseAvg = data.hseAvg
  const hseHigh = data.hseClassDist.find((d) => d.name === 'Alto risco')?.value ?? 0
  const hseMod = data.hseClassDist.find((d) => d.name === 'Risco moderado')?.value ?? 0
  const hseLow = data.hseClassDist.find((d) => d.name === 'Baixo risco')?.value ?? 0
  const hseTotal = hseHigh + hseMod + hseLow
  const lowPct = pct1(hseLow, hseTotal)
  const criticalPct = pct1(hseHigh + hseMod, hseTotal)
  const isFavorable = hseLow >= hseHigh + hseMod
  const overallLabel = hseAvg !== null ? riskLabel(hseAvg).toLowerCase() : null

  const sortedDomainsDesc = [...data.domainAvgs].sort((a, b) => b.avg - a.avg)
  const sortedDomainsAsc = [...data.domainAvgs].sort(byMostCritical)
  const strongDomains = sortedDomainsDesc.slice(0, 4).map((d) => d.domain)
  const weakDomains = sortedDomainsAsc.slice(0, 3)

  const domainRows = data.associativeDomainCorrelations ?? []
  const subdomainRows = data.associativeSubdomainCorrelations ?? []
  const generalOutcome = (data.associativeOutcomes ?? ['Saúde Mental (Geral)'])[0] ?? 'Saúde Mental (Geral)'
  const rFor = (name: string): number | null => {
    const metric = domainRows.find((r) => r.predictor === name)?.metrics.find((m) => m.outcome === generalOutcome)
    return metric?.coefficient ?? null
  }
  const avgAbs = (names: string[]): number | null => {
    const values = names.map((n) => rFor(n)).filter((v): v is number => v !== null).map(Math.abs)
    return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null
  }
  const strongAvgR = avgAbs(strongDomains)
  const weakAvgR = avgAbs(weakDomains.map((d) => d.domain))

  // Intro
  const p1 = hseAvg !== null && overallLabel !== null
    ? `Os resultados do Mapeamento de Fatores de Riscos Psicossociais de ${data.clientName} indicam um cenário organizacional ${isFavorable ? 'globalmente favorável' : 'que requer atenção organizacional'}, com índice médio de risco psicossocial de ${hseAvg.toFixed(2).replace('.', ',')}, classificado como ${overallLabel}. A percepção de ${fmtPct(lowPct)} dos participantes foi compatível com baixa exposição aos fatores de risco psicossocial${isFavorable ? ', sugerindo que a organização dispõe de um conjunto consistente de fatores protetivos que favorecem um ambiente de trabalho saudável.' : ', o que ainda assim convive com uma parcela relevante da base em exposição moderada ou alta.'}`
    : `Não há dados suficientes de índice de risco psicossocial nesta base para compor a síntese executiva.`

  // Pontos fortes
  const pfSub1 = strongDomains.length > 0
    ? `Domínios de ${joinNaturalList(strongDomains)} refletem uma boa estrutura de apoio social e funcionamento coletivo.`
    : 'Não há domínios com dados suficientes para destacar como pontos fortes nesta base.'
  const pfSub2 = strongDomains.length > 0
    ? `Estes domínios favorecem a comunicação, a integração das equipes e a previsibilidade das atividades, atuando como recursos essenciais para a manutenção do bem-estar dos trabalhadores.${(strongAvgR !== null && weakAvgR !== null)
      ? (strongAvgR < weakAvgR
        ? ' As análises associativas confirmam menor relação desses domínios com indicadores de pior saúde mental, frente aos fatores ligados à organização do trabalho.'
        : ' As análises associativas indicam que essa relação varia conforme o fator avaliado, recomendando acompanhamento contínuo mesmo nos pontos fortes.')
      : ''}`
    : ''

  // Oportunidades de melhoria
  const weakList = weakDomains.length > 0
    ? joinNaturalList(weakDomains.map((d) => `${d.domain} (${d.avg.toFixed(2).replace('.', ',')})`))
    : null
  const actions = weakDomains
    .map((d) => DOMAIN_RISK_INSIGHTS[d.domain]?.control)
    .filter((v): v is string => Boolean(v))
    .map(lowerFirstNoDot)
  const topDomainsGeneral = topCorrelationsForOutcome(domainRows, generalOutcome, 2)
  const topSubdomainsGeneral = topCorrelationsForOutcome(subdomainRows, generalOutcome, 3)

  const omSub1 = weakList
    ? `${weakList} exigem priorização no Plano de Ação.`
    : 'Não há domínios com dados suficientes para priorizar oportunidades de melhoria nesta base.'
  const omSub2 = actions.length > 0
    ? `${joinNaturalList(actions).charAt(0).toUpperCase()}${joinNaturalList(actions).slice(1)}.`
    : ''
  const omSub3 = topDomainsGeneral.length > 0
    ? `${joinNaturalList(topDomainsGeneral.map((d) => d.name))} ${topDomainsGeneral.length > 1 ? 'são os domínios' : 'é o domínio'} mais fortemente ${topDomainsGeneral.length > 1 ? 'associados' : 'associado'} aos indicadores de saúde mental${topSubdomainsGeneral.length > 0 ? `, especialmente ${joinNaturalList(topSubdomainsGeneral.map((s) => s.name.toLowerCase()))}` : ''}.`
    : ''

  // Conclusão
  const conclusionLabel = overallLabel !== null
    ? (isFavorable ? 'Base Sólida com Alertas:' : 'Cenário que Requer Atenção:')
    : 'Leitura Indisponível:'
  const conclusionSub1 = overallLabel !== null
    ? `Embora ${isFavorable ? 'haja' : 'a classificação geral seja de'} ${overallLabel} global, ${fmtPct(criticalPct)} dos trabalhadores percebem maior exposição (risco moderado a alto), exigindo ações preventivas direcionadas${weakDomains.length > 0 ? `, priorizando ${joinNaturalList(weakDomains.map((d) => d.domain))}` : ''}.`
    : 'Esta base não reúne dados suficientes de índice de risco para uma leitura conclusiva.'
  const conclusionSub2 = 'O monitoramento contínuo dos indicadores permitirá avaliar a efetividade das ações e sustentar um processo permanente de melhoria, em consonância com as diretrizes da NR-1 e da ISO 45003.'

  // Panorama Geral (topo)
  const panoramaH = 1.1
  drawRoundedCard(slide, MX, cY + 0.04, CW, panoramaH, { fill: 'F7FAFE', borderColor: C.blue2, radius: 0.06 })
  slide.addShape('roundRect', {
    x: MX, y: cY + 0.04, w: 0.07, h: panoramaH,
    fill: { color: C.blue2 }, line: { color: C.blue2, width: 0 }, rectRadius: 0.09,
  })
  slide.addText('PANORAMA GERAL', {
    x: MX + 0.26, y: cY + 0.16, w: CW - 0.5, h: 0.18,
    fontSize: 10.4, bold: true, color: C.blue2, charSpacing: 0.6, fontFace: 'Manrope',
  })
  slide.addText(p1, {
    x: MX + 0.26, y: cY + 0.38, w: CW - 0.5, h: panoramaH - 0.46,
    fontSize: 10.3, color: C.textDk, fontFace: 'Inter', valign: 'top',
  })

  // 3 colunas
  const colGap = 0.2
  const colW = (CW - colGap * 2) / 3
  const colY = cY + panoramaH + 0.18
  const colH = cH - panoramaH - 0.22
  const topBarH = 0.06

  const addSubBlock = (x: number, y: number, w: number, label: string, text: string): number => {
    if (!text) return y
    let textY = y
    if (label) {
      slide.addText(label, {
        x, y, w, h: 0.18, fontSize: 10, bold: true, color: C.textDk, fontFace: 'Manrope',
      })
      textY += 0.2
    }
    const lines = Math.max(1, Math.ceil(text.length / (w * 15)))
    const h = 0.06 + lines * 0.16
    slide.addText(text, {
      x, y: textY, w, h, fontSize: 9.4, color: C.textMd, fontFace: 'Inter', valign: 'top',
    })
    return textY + 0.04 + h
  }

  const columns: Array<{ label: string; color: string; blocks: Array<{ label: string; text: string }> }> = [
    {
      label: 'PONTOS FORTES',
      color: C.low,
      blocks: [
        { label: 'Desempenho Satisfatório:', text: pfSub1 },
        { label: 'Fatores de Proteção:', text: pfSub2 },
      ],
    },
    {
      label: 'OPORTUNIDADES DE MELHORIA',
      color: 'EA8A00',
      blocks: [
        { label: 'Focos de Atenção:', text: omSub1 },
        { label: 'Diretrizes de Intervenção:', text: omSub2 },
        { label: '', text: omSub3 },
      ],
    },
    {
      label: 'CONCLUSÃO',
      color: C.blue,
      blocks: [
        { label: conclusionLabel, text: conclusionSub1 },
        { label: 'Próximos Passos:', text: conclusionSub2 },
      ],
    },
  ]

  columns.forEach((col, idx) => {
    const x = MX + idx * (colW + colGap)
    drawRoundedCard(slide, x, colY, colW, colH)
    slide.addShape('roundRect', {
      x, y: colY, w: colW, h: topBarH,
      fill: { color: col.color }, line: { color: col.color, width: 0 }, rectRadius: 0.03,
    })
    slide.addText(col.label, {
      x: x + 0.2, y: colY + 0.16, w: colW - 0.38, h: 0.2,
      fontSize: 11, bold: true, color: col.color, charSpacing: 0.4, fontFace: 'Manrope',
    })

    let by = colY + 0.46
    col.blocks.forEach((block) => {
      by = addSubBlock(x + 0.2, by, colW - 0.4, block.label, block.text) + 0.1
    })
  })
}

/**
 * Cronograma em Gantt: as etapas datadas viram barras numa escala mensal contínua, o que
 * revela as sobreposições que uma lista esconde. As etapas sem data vão para uma faixa
 * própria abaixo, em vez de ficarem com barra vazia na linha do tempo.
 */
// Pluralização das poucas stratumLabel conhecidas nesta seção ("Organização Militar" ->
// "Organizações Militares"). Estratos fora desta lista caem no singular do próprio label —
// gramaticalmente neutro, nunca errado — em vez de arriscar uma pluralização automática ruim.
const WELLBEING_PRIORITY_LABEL_PLURAL: Record<string, string> = {
  'Organização Militar': 'Organizações Militares',
  'Especialidade': 'Especialidades',
}

const WELLBEING_PRIORITY_TOP_N = 5

/**
 * Fecha o relatório com um recorte executivo de saúde mental: por que estrato (ex.: OM e
 * especialidade) tem a maior criticidade combinada de estresse grave, alerta depressivo e
 * risco de suicídio — as mesmas 3 métricas e o mesmo critério de ordenação/corte (N >= 5) já
 * usados em addMentalHealthStratumSlide, só que lado a lado e limitados ao Top 5 de cada
 * estrato, para orientar "onde aprofundar primeiro" em vez de listar a base inteira.
 * Requer pelo menos 2 estratos em data.stratifiedWellbeing (hoje, só a FAB tem isso) — outros
 * clientes simplesmente não geram o slide.
 */
function addMentalHealthDeepDivePrioritiesSlide(prs: PptxGenJS, data: ReportPayload) {
  if (!data.hasWellbeing) return
  const slices = data.stratifiedWellbeing ?? []
  if (slices.length < 2) return

  const columns = slices.slice(0, 2).map((slice) => {
    const rows = [...slice.wellbeingStratumRows]
      .filter((r) => r.answered >= 5)
      .sort((a, b) => (
        (b.severeStressPct + b.depressiveAlertPct + b.suicideRiskPct)
        - (a.severeStressPct + a.depressiveAlertPct + a.suicideRiskPct)
      ))
      .slice(0, WELLBEING_PRIORITY_TOP_N)
    return { label: WELLBEING_PRIORITY_LABEL_PLURAL[slice.stratumLabel] ?? slice.stratumLabel, rows }
  })
  if (columns.every((c) => c.rows.length === 0)) return

  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(
    prs,
    'Estratificação de Saúde Mental: Onde Aprofundar Primeiro?',
    data.clientName,
    `${sNum} | PLANO DE AÇÃO`,
  )

  slide.addText(
    'A leitura por organização e especialidade permite priorizar suporte e investigação de causa-raiz sem individualizar nem patologizar trabalhadores.',
    { x: MX, y: cY, w: CW, h: 0.32, fontSize: 10.5, color: C.textDk, align: 'center', valign: 'top', fontFace: 'Inter' },
  )

  const bannerH = 0.62
  const gapBeforeBanner = 0.2
  const blockY = cY + 0.48
  const blockH = cH - 0.48 - bannerH - gapBeforeBanner

  const labelH = 0.24
  const tableGap = 0.06
  const tableY = blockY + labelH + tableGap
  const tableH = blockH - labelH - tableGap
  const headerH = 0.34

  // Mesma altura de linha nas duas colunas mesmo que uma tenha menos de 5 grupos qualificados
  // (N >= 5) — evita linhas mais altas de um lado só por causa de um estrato mais raso.
  const maxRows = Math.max(1, ...columns.map((c) => c.rows.length))
  const bodyRowH = (tableH - headerH) / maxRows

  const colGap = 0.3
  const colW = (CW - colGap) / 2
  const headers = ['Grupo', 'N', 'Índice', 'Estresse', 'Depressivo', 'Risco\nsuicida']
  const grupoW = colW * 0.3
  const metricW = (colW - grupoW) / 5
  const colWidths = [grupoW, metricW, metricW, metricW, metricW, metricW]

  columns.forEach((col, ci) => {
    if (col.rows.length === 0) return
    const x = MX + ci * (colW + colGap)

    slide.addText(`${col.label}: maiores criticidades combinadas`, {
      x, y: blockY, w: colW, h: labelH, valign: 'middle',
      fontSize: 10.6, bold: true, color: C.navy, fontFace: 'Manrope',
    })

    drawRoundedCard(slide, x, tableY, colW, tableH, { fill: C.white, borderColor: C.border, radius: 0.05 })

    // Cabeçalho sólido navy ocupando toda a largura da coluna, com os cantos de baixo
    // "quadrados" por um retângulo simples sobreposto — evita repetir a lógica de raio por
    // canto só para esta barra.
    slide.addShape('roundRect', {
      x, y: tableY, w: colW, h: headerH,
      fill: { color: C.navy }, line: { color: C.navy, width: 0 }, rectRadius: 0.05,
    })
    slide.addShape('rect', {
      x, y: tableY + headerH / 2, w: colW, h: headerH / 2,
      fill: { color: C.navy }, line: { color: C.navy, width: 0 },
    })

    let hx = x
    headers.forEach((head, i) => {
      slide.addText(head, {
        x: hx + 0.04, y: tableY, w: colWidths[i] - 0.08, h: headerH, valign: 'middle',
        align: i === 0 ? 'left' : 'center', fontSize: 8.4, bold: true, color: C.white, fontFace: 'Manrope',
      })
      hx += colWidths[i]
    })

    col.rows.forEach((row, ri) => {
      const y = tableY + headerH + ri * bodyRowH
      const bg = ri % 2 === 0 ? C.white : 'F6F9FC'
      slide.addShape('rect', {
        x, y, w: colW, h: bodyRowH,
        fill: { color: bg }, line: { color: C.border, width: 0.4 },
      })

      const idxColor = row.mentalHealthAvg !== null ? mentalHealthColor(row.mentalHealthAvg) : C.textLt
      const cells = [
        row.name,
        `N=${row.answered}`,
        row.mentalHealthAvg !== null ? row.mentalHealthAvg.toFixed(2).replace('.', ',') : '--',
        fmtPct(row.severeStressPct),
        fmtPct(row.depressiveAlertPct),
        fmtPct(row.suicideRiskPct),
      ]
      let cx = x
      cells.forEach((cell, ci2) => {
        slide.addText(cell, {
          x: cx + 0.04, y, w: colWidths[ci2] - 0.08, h: bodyRowH, valign: 'middle',
          align: ci2 === 0 ? 'left' : 'center',
          fontSize: ci2 === 0 ? 8.6 : 8.4,
          bold: ci2 === 0 || ci2 === 2,
          color: ci2 === 0 ? C.navy : ci2 === 2 ? idxColor : C.textDk,
          fontFace: ci2 === 0 || ci2 === 2 ? 'Manrope' : 'Inter',
        })
        cx += colWidths[ci2]
      })
    })
  })

  const bannerY = cY + cH - bannerH
  slide.addShape('roundRect', {
    x: MX, y: bannerY, w: CW, h: bannerH,
    fill: { color: C.navy }, line: { color: C.navy, width: 0 }, rectRadius: 0.12,
  })
  slide.addText(
    'Priorizar comunicação, acolhimento, investigação qualitativa e cruzamentos com carga, escala, carreira, desligamentos e tempo de formação.',
    {
      x: MX + 0.5, y: bannerY, w: CW - 1, h: bannerH, valign: 'middle', align: 'center',
      fontSize: 11.5, bold: true, color: C.white, fontFace: 'Manrope', lineSpacingMultiple: 1.18,
    },
  )
}

/* ─── Slides executivos de escala e continuidade ──────────────────────────── */

/** Card com barra de acento à esquerda, título e bullets. Usado pelos slides executivos. */
function drawAccentBulletCard(
  slide: Slide,
  opts: { x: number; y: number; w: number; h: number; accent: string; title: string; bullets: string[]; titleSize?: number },
) {
  const { x, y, w, h, accent, title, bullets, titleSize = 13 } = opts
  drawRoundedCard(slide, x, y, w, h)
  slide.addShape('roundRect', {
    x, y, w: 0.07, h,
    fill: { color: accent }, line: { color: accent, width: 0 }, rectRadius: 0.07,
  })
  slide.addText(title, {
    x: x + 0.26, y: y + 0.16, w: w - 0.46, h: 0.44,
    fontSize: titleSize, bold: true, color: C.navy, fontFace: 'Manrope', valign: 'top',
  })
  slide.addText(
    bullets.map((b) => ({ text: b, options: { bullet: { code: '2022' }, breakLine: true } })),
    {
      x: x + 0.3, y: y + 0.66, w: w - 0.5, h: h - 0.82,
      fontSize: 9.6, color: C.textMd, fontFace: 'Inter', valign: 'top', lineSpacingMultiple: 1.16,
    },
  )
}

/** Faixa de destaque com a mensagem-chave do slide. */
function drawKeyMessageBar(
  slide: Slide,
  opts: { x: number; y: number; w: number; h: number; label: string; text: string; accent?: string },
) {
  const { x, y, w, h, label, text, accent = C.blue } = opts
  drawRoundedCard(slide, x, y, w, h, { fill: C.bluePale, borderColor: C.blue2 })
  slide.addShape('roundRect', {
    x, y, w: 0.07, h,
    fill: { color: accent }, line: { color: accent, width: 0 }, rectRadius: 0.07,
  })
  slide.addText(
    [
      { text: `${label} `, options: { bold: true, color: C.navy } },
      { text, options: { color: C.textDk } },
    ],
    {
      x: x + 0.28, y, w: w - 0.5, h,
      fontSize: 10.5, fontFace: 'Inter', valign: 'middle',
    },
  )
}

/** ISO 45003 como eixo de continuidade — abre o bloco de continuidade do Plano de Ação. */
function addActionPlanIso45003ContinuitySlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'ISO 45003 como eixo de continuidade', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  slide.addText(
    'A continuidade precisa deixar de ser uma entrega pontual e virar sistema de gestão: avaliar, controlar, monitorar e melhorar.',
    { x: MX, y: cY + 0.02, w: CW, h: 0.26, fontSize: 10.9, color: C.textMd, fontFace: 'Inter' },
  )

  const pillars = [
    {
      accent: C.blue, title: '1. Sistema de gestão',
      bullets: ['Integrar fatores psicossociais ao GRO/PGR.', 'Registrar riscos, controles, prazos e responsáveis.'],
    },
    {
      accent: C.low, title: '2. Organização do trabalho',
      bullets: ['Priorizar carga, autonomia, satisfação e mudanças.', 'Atuar sobre causas organizacionais, não apenas sintomas.'],
    },
    {
      accent: C.mod, title: '3. Participação e liderança',
      bullets: ['Envolver comando, lideranças e trabalhadores.', 'Comunicar critérios, decisões e evolução do plano.'],
    },
    {
      accent: C.high, title: '4. Melhoria contínua',
      bullets: ['Acompanhar indicadores.', 'Reavaliar efetividade.', 'Recalibrar o plano de ação.'],
    },
  ]

  const barH = 0.5
  const cardsY = cY + 0.4
  const cardsH = cH - 0.4 - barH * 2 - 0.34
  const gap = 0.2
  const cW = (CW - gap * 3) / 4

  pillars.forEach((p, i) => {
    drawAccentBulletCard(slide, {
      x: MX + i * (cW + gap), y: cardsY, w: cW, h: cardsH,
      accent: p.accent, title: p.title, bullets: p.bullets, titleSize: 12,
    })
  })

  drawKeyMessageBar(slide, {
    x: MX, y: cardsY + cardsH + 0.14, w: CW, h: barH,
    label: 'Tradução para a organização:',
    text: 'usar o mapeamento como linha de base, aprovar governança e manter ciclo trimestral de acompanhamento.',
    accent: C.blue2,
  })

  drawKeyMessageBar(slide, {
    x: MX, y: cardsY + cardsH + 0.14 + barH + 0.1, w: CW, h: barH,
    label: 'Mensagem para decisão:',
    text: 'a ISO 45003 dá o método; este mapeamento já é a linha de base.',
  })

  slide.addText(
    'Referência conceitual: ISO 45003:2021 — gestão de riscos psicossociais no trabalho e integração ao sistema de SST.',
    { x: MX, y: cY + cH - 0.16, w: CW, h: 0.18, fontSize: 8.3, italic: true, color: C.textLt, fontFace: 'Inter' },
  )
}

/** Próximos passos para garantir continuidade — encerra o Plano de Ação com o cronograma. */
function addActionPlanContinuityNextStepsSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getPlanSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Próximos passos para garantir continuidade', data.clientName, `${sNum} | PLANO DE AÇÃO`)

  slide.addText(
    'A decisão estratégica é transformar o relatório em ciclo permanente de gestão, com entregas executivas e acompanhamento trimestral.',
    { x: MX, y: cY + 0.02, w: CW, h: 0.26, fontSize: 10.9, color: C.textMd, fontFace: 'Inter' },
  )

  const phases = [
    {
      accent: C.blue, window: '0–30 dias', title: 'Governança',
      bullets: ['Comitê executivo.', 'Validação das prioridades.', 'Integração ao PGR/GRO.', 'Donos e indicadores.'],
    },
    {
      accent: C.low, window: '31–90 dias', title: 'Causa-raiz e plano',
      bullets: ['AVAX Deep nos grupos críticos.', 'Entrevistas e grupos focais.', 'Plano local por especialidade.', 'Ajustes em carga, autonomia e comunicação.'],
    },
    {
      accent: C.mod, window: '3–6 meses', title: 'Implementação',
      bullets: ['Capacitação de lideranças.', 'Comunicação de mudanças.', 'Rotinas de acompanhamento.', 'Monitoramento dos controles.'],
    },
    {
      accent: C.high, window: '6–12 meses', title: 'Reavaliação',
      bullets: ['Pulso trimestral.', 'Reaplicação anual.', 'Comparativo evolutivo.', 'Nova priorização.'],
    },
  ]

  const barH = 0.72
  const cardsY = cY + 0.4
  const cardsH = cH - 0.4 - barH - 0.42
  const gap = 0.2
  const cW = (CW - gap * 3) / 4

  phases.forEach((p, i) => {
    const x = MX + i * (cW + gap)
    drawRoundedCard(slide, x, cardsY, cW, cardsH)
    slide.addShape('roundRect', { x, y: cardsY, w: 0.07, h: cardsH,
      fill: { color: p.accent }, line: { color: p.accent, width: 0 }, rectRadius: 0.07 })
    slide.addText(p.window, {
      x: x + 0.26, y: cardsY + 0.14, w: cW - 0.46, h: 0.24,
      fontSize: 12.5, bold: true, color: C.navy, fontFace: 'Manrope', margin: 0, wrap: false,
    })
    slide.addText(p.title, {
      x: x + 0.26, y: cardsY + 0.4, w: cW - 0.46, h: 0.24,
      fontSize: 10.5, bold: true, color: p.accent, fontFace: 'Manrope', margin: 0, wrap: false,
    })
    slide.addText(
      p.bullets.map((b) => ({ text: b, options: { bullet: { code: '2022' }, breakLine: true } })),
      {
        x: x + 0.3, y: cardsY + 0.72, w: cW - 0.5, h: cardsH - 0.88,
        fontSize: 9.4, color: C.textMd, fontFace: 'Inter', valign: 'top', lineSpacingMultiple: 1.16,
      },
    )
  })

  const barY = cardsY + cardsH + 0.16
  drawRoundedCard(slide, MX, barY, CW, barH, { fill: C.bluePale, borderColor: C.blue2 })
  slide.addShape('roundRect', { x: MX, y: barY, w: 0.07, h: barH,
    fill: { color: C.low }, line: { color: C.low, width: 0 }, rectRadius: 0.07 })
  slide.addText('Modelo de continuidade', {
    x: MX + 0.28, y: barY + 0.08, w: 2.1, h: barH - 0.16,
    fontSize: 12, bold: true, color: C.navy, fontFace: 'Manrope', valign: 'middle',
  })
  slide.addText(
    'Acompanhamento por 12 meses: governança executiva + AVAX Deep + AVAX Learn + painel de indicadores + pulso/reaplicação + suporte ao PGR/GRO.',
    { x: MX + 2.46, y: barY + 0.06, w: CW - 2.74, h: barH - 0.12,
      fontSize: 10.3, color: C.textDk, fontFace: 'Inter', valign: 'middle' },
  )

  slide.addText(
    'Objetivo: garantir que o mapeamento deixe de ser entrega isolada e se torne ciclo de gestão com evidências, controles e melhoria contínua.',
    { x: MX, y: cY + cH - 0.18, w: CW, h: 0.18, fontSize: 8.3, italic: true, color: C.textLt, fontFace: 'Inter' },
  )
}

function addRiskControlScaleTableSlide(prs: PptxGenJS, data: ReportPayload) {
  const sNum = getRiskClassificationSectionNumber(data)
  const { slide, cY, cH } = mkBase(prs, 'Classificação das Medidas de Controle', data.clientName, `${sNum} | CLASSIFICAÇÃO DE RISCOS`)

  const tableX = MX
  const tableY = cY + 0.58
  const tableW = CW
  const tableH = cH - 0.76
  const headerH = 0.62
  const rowH = (tableH - headerH) / 5
  const colW = [1.45, 1.8, tableW - 1.45 - 1.8]

  drawRoundedCard(slide, tableX, tableY, tableW, tableH, { fill: C.white, borderColor: C.border, radius: 0.03 })
  slide.addShape('rect', {
    x: tableX,
    y: tableY,
    w: tableW,
    h: headerH,
    fill: { color: 'F3F7FB' },
    line: { color: C.border, width: 0.6 },
  })

  const headers = ['Faixa\n(0-100)', 'Nível de\nAtenção', 'Descrição']
  let hx = tableX
  headers.forEach((head, idx) => {
    slide.addText(head, {
      x: hx + 0.12,
      y: tableY + 0.14,
      w: colW[idx] - 0.24,
      h: 0.3,
      fontSize: 10.4,
      bold: true,
      color: C.textDk,
      align: 'center',
      fontFace: 'Manrope',
    })
    hx += colW[idx]
  })

  const rows = [
    { range: '81 - 100', level: 'Excelente' as ControlLevel, text: 'Gestão de saúde mental altamente estruturada, com indicadores e práticas sistemáticas.' },
    { range: '61 - 80', level: 'Adequado' as ControlLevel, text: 'Práticas consistentes, porém ainda com espaço para evolução na integração e alcance das ações.' },
    { range: '41 - 60', level: 'Intermediário' as ControlLevel, text: 'Políticas e ações pontuais; falta de sistematização e acompanhamento contínuo.' },
    { range: '21 - 40', level: 'Vulnerável' as ControlLevel, text: 'Lacunas estruturais significativas e práticas preventivas incipientes.' },
    { range: '0 - 20', level: 'Crítico' as ControlLevel, text: 'Risco psicossocial elevado; ausência de políticas, suporte e monitoramento adequados.' },
  ]

  rows.forEach((row, idx) => {
    const y = tableY + headerH + idx * rowH
    const bg = idx % 2 === 0 ? C.white : 'FAFCFE'
    const pal = controlLevelPalette(row.level)

    slide.addShape('rect', {
      x: tableX,
      y,
      w: tableW,
      h: rowH,
      fill: { color: bg },
      line: { color: C.border, width: 0.5 },
    })

    slide.addText(row.range, {
      x: tableX + 0.12,
      y: y + 0.18,
      w: colW[0] - 0.24,
      h: 0.18,
      fontSize: 11,
      bold: true,
      color: C.textDk,
      align: 'left',
      fontFace: 'Manrope',
    })

    slide.addShape('ellipse', {
      x: tableX + colW[0] + 0.14,
      y: y + 0.2,
      w: 0.14,
      h: 0.14,
      fill: { color: pal.dot },
      line: { color: pal.dot, width: 0 },
    })

    slide.addText(row.level, {
      x: tableX + colW[0] + 0.34,
      y: y + 0.18,
      w: colW[1] - 0.44,
      h: 0.18,
      fontSize: 10.8,
      color: C.textDk,
      align: 'left',
      fontFace: 'Inter',
    })

    slide.addText(row.text, {
      x: tableX + colW[0] + colW[1] + 0.12,
      y: y + 0.12,
      w: colW[2] - 0.24,
      h: rowH - 0.14,
      fontSize: 10.2,
      color: C.textDk,
      fontFace: 'Inter',
    })
  })
}

/**
 * Perigos psicossociais da NR-01 / Guia MTE com severidade (S, 0–100) — tabela regulatória,
 * universal entre empresas. Cada perigo aponta para o domínio correspondente em cada protocolo:
 * no HSE-IT não há domínio de recompensas/reconhecimento, então esse perigo fica fora da
 * matriz quando o protocolo ativo é o HSE.
 */
interface RiskHazard {
  hazard: string
  irpDomain: string
  hseDomain: string | null
  description: string
  severity: number
  justification: string
}

const RISK_HAZARDS: RiskHazard[] = [
  { hazard: 'Problemas de relacionamento no trabalho (incluindo assédio de qualquer natureza)', irpDomain: 'Convivência', hseDomain: 'Relacionamentos', description: 'Exposição direta a condutas abusivas, humilhações, isolamento ou assédio.', severity: 95, justification: 'Classificado como risco crítico pela severidade do dano psíquico e jurídico; associado a adoecimento grave, afastamentos e passivos trabalhistas.' },
  { hazard: 'Falta de suporte/apoio no trabalho (líderes / chefia)', irpDomain: 'Liderança', hseDomain: 'Apoio da Liderança', description: 'Liderança autoritária, ausência de apoio emocional ou técnico.', severity: 85, justification: 'Fator de alto impacto na saúde mental e nos índices de absenteísmo; reduz resiliência e amplifica os demais riscos.' },
  { hazard: 'Demanda e organização do trabalho (sobrecarga ou subcarga)', irpDomain: 'Trabalho', hseDomain: 'Demandas', description: 'Exigências excessivas, prazos curtos ou tarefas sem significado.', severity: 80, justification: 'Fortemente associado a burnout e DORT; frequente em todos os setores produtivos.' },
  { hazard: 'Baixo controle no trabalho / Falta de autonomia', irpDomain: 'Autonomia', hseDomain: 'Controle', description: 'Pouca influência sobre decisões, ritmo ou métodos de trabalho.', severity: 75, justification: 'Reduz senso de competência e aumenta o estresse; correlação comprovada com esgotamento e adoecimento.' },
  { hazard: 'Baixas recompensas e reconhecimento no trabalho', irpDomain: 'Satisfação', hseDomain: null, description: 'Falta de valorização, remuneração ou progresso na carreira.', severity: 70, justification: 'Gera desmotivação e sofrimento psíquico; impacto médio-alto sobre a saúde mental e o engajamento.' },
  { hazard: 'Má gestão de mudanças organizacionais', irpDomain: 'Mudanças', hseDomain: 'Comunicação e Mudanças', description: 'Falta de comunicação e suporte durante reestruturações.', severity: 65, justification: 'Pode provocar ansiedade, insegurança e transtornos de adaptação; risco moderado-alto, dependendo da frequência das mudanças.' },
  { hazard: 'Falta de suporte/apoio no trabalho (colegas)', irpDomain: 'Cooperação', hseDomain: 'Apoio dos Colegas', description: 'Ausência de cooperação, conflitos interpessoais, isolamento.', severity: 60, justification: 'Reduz coesão e aumenta a percepção de injustiça; risco alto, porém de menor severidade individual.' },
  { hazard: 'Baixa clareza de papel/função no trabalho', irpDomain: 'Responsabilidades', hseDomain: 'Cargo', description: 'Ambiguidade de funções, ausência de definição de responsabilidades.', severity: 55, justification: 'Causa confusão e tensão psicológica; risco moderado, mas potencializado em ambientes de alta demanda.' },
]

/** Perigos aplicáveis ao protocolo ativo, já com o nome do domínio daquele protocolo. */
function riskHazardsForProtocol(): Array<RiskHazard & { domain: string }> {
  const isHse = activeRiskProtocol.code === 'HSE'
  return RISK_HAZARDS
    .map((h) => ({ ...h, domain: (isHse ? h.hseDomain : h.irpDomain) ?? '' }))
    .filter((h) => h.domain !== '')
}

/** Domínios da Matriz de Risco Ocupacional, na ordem de severidade da tabela regulatória. */
function riskMatrixDomains(): string[] {
  return riskHazardsForProtocol().map((h) => h.domain)
}

function classifyRiskMatrixLevel(risk: number): string {
  if (risk >= 80) return 'Intolerável'
  if (risk >= 60) return 'Substancial'
  if (risk >= 40) return 'Moderado'
  if (risk >= 20) return 'Tolerável'
  return 'Trivial'
}

// `domainAtLeastModeratePcts` alimenta F (Frequência) da Matriz de Risco Ocupacional —
// "proporção da população potencialmente exposta ao fator de risco psicossocial" (ver slide
// addRiskClassificationLevelsSlide), portanto Alto + Moderado, não só Alto. Não confundir com
// StratumRow.domainHighPcts / ReportPayload.overallDomainHighPcts (Alto puro), que alimentam
// só o heatmap por estrato (legenda "% de Risco Alto") e têm um significado deliberadamente
// diferente.
function buildRiskMatrixRowsForDomains(
  domainAtLeastModeratePcts: Record<string, number | null>,
  controlByDomain: Record<string, number>,
): RiskMatrixRow[] {
  const severityByDomain = new Map(riskHazardsForProtocol().map((h) => [h.domain, h.severity]))
  return riskMatrixDomains()
    .map((domain) => {
      // fRaw fica em precisão total (sem arredondar) até o cálculo de R — arredondar F antes
      // de multiplicar por S/C produz um R levemente diferente do esperado (validado contra a
      // tabela de referência do cliente: some domains discordavam em 0,1 quando F era
      // arredondado primeiro). `f` (exibido na coluna Risco (F)) é só o arredondamento de
      // fRaw para exibição, não entra na conta de r.
      const fRaw = Math.max(0, Math.min(100, domainAtLeastModeratePcts[domain] ?? 0))
      const f = round1(fRaw)
      const s = severityByDomain.get(domain) ?? 0
      const c = controlByDomain[domain]
      const r = c > 0 ? round1((fRaw * s) / c) : 0
      return {
        domain,
        f,
        s,
        c,
        r,
        cls: classifyRiskMatrixLevel(r),
      }
    })
    .sort((a, b) => (b.r - a.r) || (b.f - a.f) || (b.s - a.s) || a.domain.localeCompare(b.domain, 'pt-BR'))
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Deck avulso da CMPC só com a seção Classificação de Riscos (consolidada) + as matrizes de
 * classificação por GHE de cada unidade produtiva. Capa e encerramento incluídos para o
 * arquivo poder ser apresentado sozinho.
 */
/* ─── Orquestração ────────────────────────────────────────────────────────────
   O relatório é montado a partir de uma lista de seções (ReportSectionKey). Cada seção só
   entra quando (1) foi pedida em `reportSections` e (2) o payload tem os dados que ela exige
   (ex.: Trabalho Remoto só com IETR, Saúde Mental só com o módulo respondido). A numeração é
   sequencial sobre as seções efetivamente renderizadas e é injetada em cada slide via
   `sectionNumberOverride` — nenhum slide decide seu número por conta própria.
─────────────────────────────────────────────────────────────────────────── */

export type ReportSectionKey =
  | 'abertura'
  | 'contexto'
  | 'participacao'
  | 'riscos'
  | 'estratificada'
  | 'ietr'
  | 'saude_mental'
  | 'associativa'
  | 'classificacao'
  | 'recomendacoes'
  | 'plano'
  | 'encerramento'

export interface SectionPlanEntry {
  key: ReportSectionKey
  number: string
  label: string
  sub: string
  /** Seções numeradas aparecem na Agenda; Abertura e Encerramento não. */
  inAgenda: boolean
}

export const REPORT_SECTION_ORDER: ReportSectionKey[] = [
  'abertura', 'contexto', 'participacao', 'riscos', 'estratificada', 'ietr', 'saude_mental',
  'associativa', 'classificacao', 'recomendacoes', 'plano', 'encerramento',
]

/** Nota de Controle padrão (0–100) quando o domínio não tem valor informado: "Intermediário". */
export const DEFAULT_RISK_CONTROL = 50

const SECTION_META: Record<ReportSectionKey, { label: string; divider: string; sub: string; numbered: boolean }> = {
  abertura: { label: 'Abertura', divider: '', sub: '', numbered: false },
  contexto: { label: 'Contexto & Método', divider: 'Contexto &\nMétodo', sub: 'NR-1  •  ISO 45003  •  Protocolo e classificação de risco', numbered: true },
  participacao: { label: 'Participação e Perfil', divider: 'Participação\ne Perfil', sub: 'Base respondente  •  Adesão  •  Perfil demográfico', numbered: true },
  riscos: { label: 'Mapeamento de Riscos', divider: 'Mapeamento\nde Riscos', sub: 'Índice geral  •  Classificações  •  Domínios HSE', numbered: true },
  estratificada: { label: 'Análise Estratificada', divider: 'Análise\nEstratificada', sub: 'Distribuição e heatmap por estrato', numbered: true },
  ietr: { label: 'Trabalho Remoto', divider: 'Trabalho\nRemoto', sub: 'Resultados do módulo IETR', numbered: true },
  saude_mental: { label: 'Saúde Mental', divider: 'Saúde\nMental', sub: 'Estresse  •  Sintomas depressivos  •  Risco de suicídio  •  Fatores de proteção', numbered: true },
  associativa: { label: 'Análises Preditivas e Associativas', divider: 'Análises\nPreditivas\ne Associativas', sub: 'Correlações entre domínios de risco e desfechos de saúde mental', numbered: true },
  classificacao: { label: 'Classificação de Riscos', divider: 'Classificação\nde Riscos', sub: 'Severidade  •  Medidas de controle  •  Matriz de risco ocupacional', numbered: true },
  recomendacoes: { label: 'Recomendações', divider: 'Recomendações', sub: 'Grupos e domínios com maior criticidade para intervenção', numbered: true },
  plano: { label: 'Plano de Ação', divider: 'Plano de Ação', sub: 'Roadmap  •  Playbooks  •  Governança  •  Integração ao PGR', numbered: true },
  encerramento: { label: 'Encerramento', divider: '', sub: '', numbered: false },
}

/** Seções que o payload consegue sustentar — pedir uma seção sem dado não gera slide vazio. */
function sectionIsSupported(key: ReportSectionKey, data: ReportPayload): boolean {
  switch (key) {
    case 'riscos':
    case 'estratificada':
      return data.hseAvg !== null && data.hseDomains.length > 0
    case 'ietr':
      return data.hasIetr
    case 'saude_mental':
      return Boolean(data.hasWellbeing)
    case 'associativa':
      return hasAssociativeDynamicSection(data)
    case 'classificacao':
      return data.hseAvg !== null && data.hseDomains.length > 0
    default:
      return true
  }
}

export function resolveSectionPlan(data: ReportPayload): SectionPlanEntry[] {
  const requested = new Set(data.reportSections ?? REPORT_SECTION_ORDER)
  let counter = 0
  return REPORT_SECTION_ORDER
    .filter((key) => requested.has(key) && sectionIsSupported(key, data))
    .map((key) => {
      const meta = SECTION_META[key]
      const number = meta.numbered ? pad(++counter) : ''
      return { key, number, label: meta.label, sub: meta.sub, inAgenda: meta.numbered }
    })
}

function withSection(data: ReportPayload, entry: SectionPlanEntry): ReportPayload {
  return { ...data, sectionNumberOverride: entry.number }
}

function renderSection(prs: PptxGenJS, data: ReportPayload, entry: SectionPlanEntry) {
  const d = withSection(data, entry)
  const meta = SECTION_META[entry.key]
  const divider = (sub = meta.sub) => mkDivider(prs, entry.number, meta.divider, sub)

  switch (entry.key) {
    case 'abertura':
      addCoverSlide(prs, d)
      addIntroductionSlide(prs, d)
      addAgendaSlide(prs, d)
      addExecutiveSummarySlide(prs, d)
      return

    case 'contexto':
      divider()
      addLegalSlide(prs, d)
      addRiskClassificationInfoSlide(prs, d)
      addHseDimensionsSlide(prs, d)
      addMethodologySlide(prs, d)
      return

    case 'participacao': {
      divider(`${data.totalAnswered} respondentes de ${data.totalCollabs} trabalhadores`)
      addParticipationSlide(prs, d)
      addDemographicsSlide(prs, d)
      const genderSlices = (data.stratifiedGenderByStratum ?? []).filter((slice) => slice.rows.length > 0)
      genderSlices.forEach((slice) => {
        addGenderByStratumSlide(prs, { ...d, stratum: slice.stratum, stratumLabel: slice.stratumLabel, genderByStratum: slice.rows })
      })
      return
    }

    case 'riscos':
      divider()
      addRiskIndexSlide(prs, d)
      addRiskIndexSlide(prs, d, {
        combinedRisk: true,
        title: 'Índice de Risco Psicossocial Geral — Moderado + Alto Consolidado',
      })
      addNarrativeSlide(prs, d)
      addDomainSlide(prs, d)
      addDomainRiskMapSlide(prs, d)
      return

    case 'estratificada': {
      const slices = (data.stratifiedHse && data.stratifiedHse.length > 0)
        ? data.stratifiedHse
        : [{ stratum: data.stratum, stratumLabel: data.stratumLabel, stratumRows: data.stratumRows }]
      const labels = slices.map((s) => s.stratumLabel).filter((v, i, arr) => arr.indexOf(v) === i)
      divider(`Distribuição e heatmap por ${labels.join(' • ')}`)
      slices.forEach((slice) => {
        const scoped: ReportPayload = { ...d, stratum: slice.stratum, stratumLabel: slice.stratumLabel, stratumRows: slice.stratumRows }
        addStratumDistSlide(prs, scoped)
        addHeatmapSlides(prs, scoped)
      })
      return
    }

    case 'ietr': {
      const slices = (data.stratifiedIetr && data.stratifiedIetr.length > 0)
        ? data.stratifiedIetr
        : [{ stratum: data.stratum, stratumLabel: data.stratumLabel, ietrStratumRows: data.ietrStratumRows }]
      const labels = slices.map((s) => s.stratumLabel).filter((v, i, arr) => arr.indexOf(v) === i)
      divider(`Resultados do módulo IETR por ${labels.join(' • ')}`)
      addIetrExecutiveSummarySlide(prs, d)
      addIetrSlide(prs, d)
      slices.forEach((slice) => {
        const scoped: ReportPayload = { ...d, stratum: slice.stratum, stratumLabel: slice.stratumLabel, ietrStratumRows: slice.ietrStratumRows }
        addIetrStratumDistSlide(prs, scoped)
        addIetrHeatmapSlides(prs, scoped)
      })
      return
    }

    case 'saude_mental': {
      divider()
      addMentalHealthMethodologicalNoteSlide(prs, d)
      addMentalHealthRiskIndexSlide(prs, d)
      addMentalHealthRiskIndexSlide(prs, d, {
        combinedRisk: true,
        title: 'Índice de Saúde Mental Geral — Regular + Insatisfatório Consolidado',
      })
      addMentalHealthSlide(prs, d)
      addMentalHealthClimateAnxietySlide(prs, d)
      addMentalHealthClimateDisasterByStratumSlide(prs, d)
      addMentalHealthDisasterFollowupSlide(prs, d)
      addMentalHealthLifestyleSlide(prs, d)
      addMentalHealthSymptomsSlide(prs, d)
      addMentalHealthTopDriversSlide(prs, d)
      const slices = (data.stratifiedWellbeing && data.stratifiedWellbeing.length > 0)
        ? data.stratifiedWellbeing
        : [{ stratum: data.stratum, stratumLabel: data.stratumLabel, wellbeingStratumRows: data.wellbeingStratumRows ?? [] }]
      slices.forEach((slice) => {
        const scoped: ReportPayload = { ...d, stratum: slice.stratum, stratumLabel: slice.stratumLabel, wellbeingStratumRows: slice.wellbeingStratumRows }
        addMentalHealthStratumRiskDistSlide(prs, scoped)
        addMentalHealthStratumSlide(prs, scoped)
        addMentalHealthPerceptionHeatmapSlide(prs, scoped)
      })
      addMentalHealthSelfPerceptionSlide(prs, d)
      return
    }

    case 'associativa':
      divider()
      addAssociativeDynamicIntroSlide(prs, d)
      addAssociativeDynamicMethodSlide(prs, d)
      addAssociativeDynamicDomainBarsSlide(prs, d)
      addAssociativeDynamicScatterSlides(prs, d)
      addAssociativeDynamicDomainHeatmapSlide(prs, d)
      addAssociativeDynamicPrioritySlide(prs, d)
      addAssociativeDynamicOm4MentalNotesSlide(prs, d)
      addAssociativeDynamicOm4InsightsSlide(prs, d)
      addAssociativeDynamicOverallSynthesisSlide(prs, d)
      return

    case 'classificacao':
      divider()
      addRiskClassificationMethodOverviewSlide(prs, d)
      addRiskClassificationMethodTableSlide(prs, d)
      addRiskClassificationModelSlide(prs, d)
      addRiskClassificationLevelsSlide(prs, d)
      addRiskClassificationSeverityTableSlide(prs, d)
      addRiskControlScaleTableSlide(prs, d)
      addFabRiskControlGeneralSlide(prs, d)
      addFabRiskControlDomainSlide(prs, d)
      addFabRiskControlSummarySlide(prs, d)
      addFabFinalRiskRangesSlide(prs, d)
      addFabDynamicRiskMatrixGeneralSlide(prs, d)
      addFabDynamicRiskMatrixByUnitSlides(prs, d)
      addFabRiskControlConclusionSlide(prs, d)
      addRiskClassificationExecutiveSynthesisSlide(prs, d)
      return

    case 'recomendacoes':
      divider()
      addPrioritiesSlide(prs, d)
      addNextStepsSlide(prs, d)
      return

    case 'plano':
      divider()
      addActionPlanStrategicRoadmapSlide(prs, d, 1)
      addActionPlanStrategicRoadmapSlide(prs, d, 2)
      addActionPlanStrategicRoadmapSlide(prs, d, 3)
      addActionPlanSynthesisSlide(prs, d)
      addActionPlanOperationalClassificationSlide(prs, d)
      addActionPlanExecutiveMatrixCriteriaSlide(prs, d)
      addActionPlanExecutiveMatrixConsolidatedSlide(prs, d)
      addActionPlanExecutiveMatrixUnitPrioritizationSlide(prs, d)
      addActionPlanPlaybookSlide(prs, d, 'moderado')
      addActionPlanPlaybookSlide(prs, d, 'toleravel')
      addActionPlanPlaybookSlide(prs, d, 'trivial')
      addActionPlanDomainSpecificSlide(prs, d)
      addActionPlanIetrSpecificSlide(prs, d)
      addActionPlanFocusedGroupsSlide(prs, d)
      addActionPlanIntegratedTimelineSlide(prs, d)
      addMentalHealthDeepDivePrioritiesSlide(prs, d)
      addActionPlanGovernanceIndicatorsSlide(prs, d)
      addActionPlanNr1MandatoryElementsSlide(prs, d)
      addActionPlanRiskTreatmentSlide(prs, d)
      addActionPlanSolutionsPortfolioSlide(prs, d)
      addActionPlanSolutionsOrchestrationSlide(prs, d)
      addActionPlanConclusionPgrSlide(prs, d)
      addFinalRiskRangesTableSlide(prs, d)
      addFinalRiskPriorityMethodSlide(prs, d)
      addActionPlanExtendedRoadmapSlide(prs, d)
      addActionPlanIso45003ContinuitySlide(prs, d)
      addActionPlanContinuityNextStepsSlide(prs, d)
      addReportInterpretationGuideSlide(prs, d)
      return

    case 'encerramento':
      addClosingSlide(prs, d)
      return
  }
}

export async function buildRiskReport(data: ReportPayload): Promise<Uint8Array> {
  // Define o protocolo ANTES de qualquer montagem de slide. Toda a construção abaixo é
  // síncrona (os únicos `await` estão nas duas últimas linhas), então não há como duas
  // gerações concorrentes trocarem o protocolo uma da outra no meio do caminho.
  activeRiskProtocol = data.riskProtocol ?? HSE_RISK_PROTOCOL

  const prs  = new PptxGenJS()
  prs.layout = 'LAYOUT_WIDE'
  prs.author = 'beetouch.ai'
  prs.company = 'BeeTouch'
  prs.subject = `Relatorio de Riscos Psicossociais — ${data.clientName}`
  prs.title   = 'Mapeamento de Riscos Psicossociais'

  const plan = resolveSectionPlan(data)
  const planned: ReportPayload = { ...data, sectionPlan: plan }
  for (const entry of plan) renderSection(prs, planned, entry)

  const buf = await prs.write({ outputType: 'nodebuffer' })
  return await forceNoAutofitInSlides(buf as unknown as Uint8Array, activeRiskProtocol.code === 'HSE')
}
