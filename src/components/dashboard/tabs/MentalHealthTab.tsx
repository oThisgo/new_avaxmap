'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, CartesianGrid, LabelList,
} from 'recharts'
import { useThemeTokens } from '@/lib/theme'
import { BRAND_COLORS } from '@/lib/brand'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert } from '@/components/ui/alert'

interface ComponentItem {
  key: string
  label: string
  weight: number
  avg_score: number | null
  answered: number
}

interface DistItem { name: string; value: number }

interface DistributionGroup {
  key: string
  title: string
  items: DistItem[]
}

interface DescriptiveItem { field: string; label: string; count: number; pct: number }

interface DescriptiveGroup {
  key: string
  title: string
  items: DescriptiveItem[]
}

interface HistogramItem { value: number; count: number; pct: number }

interface HistogramData {
  respondents: number
  avg: number | null
  min: number | null
  max: number | null
  histogram: HistogramItem[]
}

interface MentalHealthData {
  respondents: number
  avg_index: number | null
  class_distribution: DistItem[]
  components: ComponentItem[]
  distributions: DistributionGroup[]
  suicide: { at_risk: number; total: number }
  descriptive: DescriptiveGroup[]
  tobacco_cigarettes: HistogramData
  health_score: HistogramData
  life_quality_score: HistogramData
}

// Índice maior = melhor: Excelente no verde, Insatisfatório no vermelho.
const CLASS_COLORS: Record<string, string> = {
  'Excelente': BRAND_COLORS.success,
  'Bom': BRAND_COLORS.success,
  'Regular': BRAND_COLORS.warning,
  'Insatisfatório': BRAND_COLORS.danger,
  'Sem dados': '#8E9AAF',
  // Faixas dos blocos categóricos
  'Ausência de Sintomas': BRAND_COLORS.success,
  'Sintomas Leves': BRAND_COLORS.success,
  'Sintomas Moderados': BRAND_COLORS.warning,
  'Sintomas Graves': BRAND_COLORS.danger,
  'Ausente': BRAND_COLORS.success,
  'Leve': BRAND_COLORS.success,
  'Moderada': BRAND_COLORS.warning,
  'Alta': BRAND_COLORS.danger,
  'Sim': BRAND_COLORS.success,
  'Não': BRAND_COLORS.danger,
  'Não Informado': '#8E9AAF',
  'Não fumante': BRAND_COLORS.success,
  'Ex-fumante': BRAND_COLORS.warning,
  'Fumante passivo': BRAND_COLORS.warning,
  'Fumante': BRAND_COLORS.danger,
  'Não Bebe': BRAND_COLORS.success,
  'Consumo Moderado': BRAND_COLORS.warning,
  'Padrão Binge': BRAND_COLORS.danger,
}

function scoreColor(score: number | null): string {
  if (score === null) return '#8E9AAF'
  if (score >= 7) return BRAND_COLORS.success
  if (score >= 4) return BRAND_COLORS.warning
  return BRAND_COLORS.danger
}

/** Formata em pt-BR com 1 casa decimal (vírgula) — mesmo padrão do modelo de referência. */
function fmt1(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/**
 * Tooltip customizado do gráfico "Nota média por componente": o Recharts
 * colore a linha de valor com base no `fill` do <Bar> (sem Cell, então cai
 * pro default do tema do navegador, ilegível no escuro) em vez do `fill` de
 * cada <Cell> — por isso não dá pra usar contentStyle/itemStyle direto. Aqui
 * a cor da linha "Nota média" é a mesma do risco daquela barra.
 */
function ComponentTooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ payload: ComponentItem }> }) {
  const T = useThemeTokens()
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  if (row.avg_score === null) return null

  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}
    >
      <p className="text-xs font-semibold" style={{ color: T.text }}>{row.label}</p>
      <p className="text-xs" style={{ color: scoreColor(row.avg_score) }}>
        Nota média : {row.avg_score.toFixed(2)} (peso {row.weight}, {row.answered} respostas)
      </p>
    </div>
  )
}

/** Donut de classificação com legenda (cor · nome · % · N) abaixo — mesmo padrão em toda a aba. */
function PieCard({ title, items }: Readonly<{ title: string; items: DistItem[] }>) {
  const T = useThemeTokens()
  const total = items.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: T.textMuted }}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm" style={{ color: T.textFaint }}>Sem dados</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={items} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                {items.map((item) => <Cell key={item.name} fill={CLASS_COLORS[item.name] ?? '#8E9AAF'} />)}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text }}
                formatter={(v, name) => [`${v} respostas`, String(name)]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-col gap-1.5">
            {items.map((item) => {
              const pct = total > 0 ? (item.value / total) * 100 : 0
              return (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CLASS_COLORS[item.name] ?? '#8E9AAF' }} />
                  <span className="flex-1 truncate" style={{ color: T.text }} title={item.name}>{item.name}</span>
                  <span style={{ color: T.textMuted }}>{Math.round(pct * 10) / 10}%</span>
                  <span className="w-7 text-right" style={{ color: T.textFaint }}>{item.value}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/** Lista de barras azuis com % e N — o modelo descritivo já usado no resto do dashboard. */
function DescriptiveBarCard({ title, items }: Readonly<{ title: string; items: DescriptiveItem[] }>) {
  const T = useThemeTokens()
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: T.textMuted }}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm" style={{ color: T.textFaint }}>Sem dados</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.field} className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-3 text-xs">
                <span style={{ color: T.text }}>{item.label}</span>
                <span className="flex-shrink-0" style={{ color: T.textMuted }}>{item.count} ({item.pct}%)</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: T.surface2 }}>
                <div className="h-full rounded-full" style={{ width: `${item.pct}%`, backgroundColor: BRAND_COLORS.primary }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Card de destaque do risco de suicídio: contagem + frase, depois a ocorrência de cada indicador (sem barra — é um bloco sensível, de contagem baixa). */
function SuicideRiskCard({ atRisk, total, items }: Readonly<{ atRisk: number; total: number; items: DescriptiveItem[] }>) {
  const T = useThemeTokens()
  const pct = total > 0 ? Math.round((atRisk / total) * 1000) / 10 : 0

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: T.surface, border: `1px solid ${atRisk > 0 ? BRAND_COLORS.danger : T.border}` }}
    >
      <h3 className="text-sm font-semibold mb-3" style={{ color: T.textMuted }}>Risco de Suicídio</h3>
      <div className="flex items-start gap-3 mb-4">
        <span className="text-3xl font-bold flex-shrink-0" style={{ color: atRisk > 0 ? BRAND_COLORS.danger : T.text }}>{atRisk}</span>
        <span className="text-xs pt-1" style={{ color: T.textMuted }}>
          {atRisk === 1 ? 'pessoa da sua organização reportou' : 'pessoas da sua organização reportaram'} pelo
          menos um indicativo de suicídio ({pct}%).
        </span>
      </div>
      {items.length > 0 && (
        <>
          <p className="text-xs font-medium mb-2" style={{ color: T.textFaint }}>
            Número de ocorrências de cada tipo de indicativo:
          </p>
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.field} className="flex items-center justify-between text-xs gap-3">
                <span style={{ color: T.text }}>{item.label}</span>
                <span className="flex-shrink-0" style={{ color: T.textMuted }}>{item.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Card de histograma de valor bruto (nota exata, cigarros/dia) — estatísticas
 * de resumo em cima (média, ou média/mín/máx), legenda, e a distribuição
 * exata em barras, com o rótulo do valor no topo de cada uma.
 */
function ValueHistogramCard({
  title, seriesLabel, stats, data, yUnit,
}: Readonly<{
  title: string
  seriesLabel: string
  stats: Array<{ label: string; value: string }>
  data: HistogramData
  yUnit: 'count' | 'pct'
}>) {
  const T = useThemeTokens()
  const chartData = data.histogram.map((item) => ({
    name: Number.isInteger(item.value) ? String(item.value) : fmt1(item.value),
    raw: yUnit === 'pct' ? item.pct : item.count,
  }))

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: T.textMuted }}>{title}</h3>
      {data.histogram.length === 0 ? (
        <p className="text-sm" style={{ color: T.textFaint }}>Sem dados</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-6 mb-4">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col gap-0.5">
                <span className="text-xs" style={{ color: T.textFaint }}>{stat.label}</span>
                <span className="text-2xl font-bold" style={{ color: T.text }}>{stat.value}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-1 text-xs" style={{ color: T.textMuted }}>
            <span className="h-2.5 w-4 rounded-sm flex-shrink-0" style={{ backgroundColor: BRAND_COLORS.primary }} />
            {seriesLabel}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 20 }}>
              <CartesianGrid stroke={T.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: T.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: T.textFaint, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => (yUnit === 'pct' ? `${v}%` : String(v))}
              />
              <Bar dataKey="raw" fill={BRAND_COLORS.primary} radius={[4, 4, 0, 0]}>
                <LabelList
                  dataKey="raw"
                  position="top"
                  formatter={(v: string | number | boolean | null | undefined) => (yUnit === 'pct' ? `${fmt1(Number(v ?? 0))}%` : fmt1(Number(v ?? 0)))}
                  style={{ fill: T.text, fontSize: 11 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-center text-xs italic mt-1" style={{ color: T.textFaint }}>{seriesLabel}</p>
        </>
      )}
    </div>
  )
}

type HistogramKey = 'tobacco_cigarettes' | 'health_score' | 'life_quality_score'

const HISTOGRAM_CARD_CONFIG: Record<HistogramKey, {
  title: string
  seriesLabel: string
  yUnit: 'count' | 'pct'
  stats: (d: HistogramData) => Array<{ label: string; value: string }>
}> = {
  tobacco_cigarettes: {
    title: 'Uso de Tabaco',
    seriesLabel: 'Cigarros por Dia',
    yUnit: 'count',
    stats: (d) => [{ label: 'Cigarros por Dia (média)', value: d.avg != null ? fmt1(d.avg) : '—' }],
  },
  health_score: {
    title: 'Percepção sobre Saúde',
    seriesLabel: 'Saúde',
    yUnit: 'pct',
    stats: (d) => [
      { label: 'Nota Média', value: d.avg != null ? fmt1(d.avg) : '—' },
      { label: 'Menor Nota', value: d.min != null ? String(d.min) : '—' },
      { label: 'Maior Nota', value: d.max != null ? String(d.max) : '—' },
    ],
  },
  life_quality_score: {
    title: 'Percepção sobre Qualidade de Vida',
    seriesLabel: 'Qualidade de Vida',
    yUnit: 'pct',
    stats: (d) => [
      { label: 'Nota Média', value: d.avg != null ? fmt1(d.avg) : '—' },
      { label: 'Menor Nota', value: d.min != null ? String(d.min) : '—' },
      { label: 'Maior Nota', value: d.max != null ? String(d.max) : '—' },
    ],
  },
}

type SectionSpec = {
  id: string
  title: string
  subtitle?: string
  distKeys: readonly string[]
  descKeys: readonly string[]
  histogramKeys?: readonly HistogramKey[]
  columns: 2 | 3
  /** Seção "Sintomas Depressivos" ganha o card de risco de suicídio, além do que vem de distKeys/descKeys. */
  suicide?: boolean
}

/**
 * Mapeia cada seção da aba às chaves de `distributions` (pizza), `descriptive`
 * (barras) e histogramas (nota bruta) devolvidos por
 * /api/dashboard/mental-health — ver as constantes DISTRIBUTION_ORDER,
 * DESCRIPTIVE_GROUPS, CLIMATE_ENUM_GROUPS e NumericAccumulator em
 * src/app/api/dashboard/mental-health/route.ts. Título e conteúdo de cada
 * card vêm do próprio grupo (já com rótulo em pt-br) ou de
 * HISTOGRAM_CARD_CONFIG, então adicionar uma seção nova é só uma entrada aqui.
 */
const SECTIONS: readonly SectionSpec[] = [
  { id: 'estresse', title: 'Estresse', distKeys: ['estresse'], descKeys: ['stress_symptoms', 'stress_sources'], columns: 3 },
  { id: 'sintomas-depressivos', title: 'Sintomas Depressivos', distKeys: ['sintomas_depressivos'], descKeys: ['depression_symptoms'], columns: 3, suicide: true },
  {
    id: 'uso-substancias',
    title: 'Uso de Substâncias',
    distKeys: ['tabaco', 'alcool'],
    descKeys: ['substances'],
    histogramKeys: ['tobacco_cigarettes'],
    columns: 3,
  },
  { id: 'uso-internet', title: 'Uso de Internet', distKeys: ['internet'], descKeys: ['internet_behaviors'], columns: 2 },
  { id: 'fatores-ambientais', title: 'Fatores Ambientais', distKeys: ['rede_de_apoio'], descKeys: ['support_sources', 'life_events'], columns: 3 },
  {
    id: 'saude-qualidade-vida',
    title: 'Saúde e Qualidade de Vida',
    distKeys: [],
    descKeys: [],
    histogramKeys: ['health_score', 'life_quality_score'],
    columns: 2,
  },
  {
    id: 'ansiedade-climatica',
    title: 'Ansiedade Climática',
    subtitle: 'Exposição a desastre natural ou ambiental nos últimos dois anos e suas consequências percebidas.',
    distKeys: ['ansiedade_climatica'],
    descKeys: ['disaster_type', 'disaster_contact', 'disaster_vulnerability', 'disaster_safety_concern'],
    columns: 3,
  },
]

const GRID_COLS: Record<2 | 3, string> = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
}

const OVERVIEW_ID = 'indice-geral'

/** Barra de tópicos clicáveis que rola suavemente até a seção correspondente — só lista o que de fato tem conteúdo (ver `items`). */
function SectionNav({ items }: Readonly<{ items: Array<{ id: string; title: string }> }>) {
  const T = useThemeTokens()

  return (
    <nav
      className="flex flex-wrap items-center gap-2 rounded-xl p-3"
      style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}
      aria-label="Navegação rápida entre seções de Saúde Mental"
    >
      <span className="text-xs font-medium mr-1" style={{ color: T.textFaint }}>Ir para:</span>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          onClick={(e) => {
            e.preventDefault()
            document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          className="rounded-lg px-3 py-1.5 text-xs font-medium no-underline transition-colors"
          style={{ border: `1px solid ${T.border}`, color: T.textMuted, backgroundColor: T.surface2 }}
        >
          {item.title}
        </a>
      ))}
    </nav>
  )
}

export default function MentalHealthTab({ query }: Readonly<{ query: string }>) {
  const T = useThemeTokens()
  const [data, setData] = useState<MentalHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch('/api/dashboard/mental-health' + (query ? `?${query}` : ''))
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setData(d)
        setFailed(false)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [query])

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }
  if (failed || !data) return <Alert>Erro ao carregar dados.</Alert>
  if (data.respondents === 0) {
    return <Alert>Nenhuma resposta do módulo Saúde Mental para os filtros selecionados.</Alert>
  }

  const suicidePct = data.suicide.total > 0
    ? Math.round((data.suicide.at_risk / data.suicide.total) * 1000) / 10
    : 0

  const cardStyle = { backgroundColor: T.surface, border: `1px solid ${T.border}` }

  // Resolvido uma vez só: alimenta tanto a navegação quanto a renderização das
  // seções, e uma seção sem nenhum card com dado simplesmente não aparece em
  // nenhum dos dois lugares (nada de link morto ou card vazio lado a lado).
  const visibleSections = SECTIONS.map((section) => {
    const pies = section.distKeys
      .map((key) => data.distributions.find((d) => d.key === key))
      .filter((g): g is DistributionGroup => g !== undefined)
    const bars = section.descKeys
      .map((key) => data.descriptive.find((d) => d.key === key))
      .filter((g): g is DescriptiveGroup => g !== undefined)
    const suicideGroup = section.suicide
      ? data.descriptive.find((d) => d.key === 'suicide_symptoms')
      : undefined
    const histograms = (section.histogramKeys ?? [])
      .map((key) => ({ key, config: HISTOGRAM_CARD_CONFIG[key], data: data[key] }))
      .filter((h) => h.data.histogram.length > 0)

    if (pies.length === 0 && bars.length === 0 && !suicideGroup && histograms.length === 0) return null
    return { section, pies, bars, suicideGroup, histograms }
  }).filter((s): s is NonNullable<typeof s> => s !== null)

  const navItems = [
    { id: OVERVIEW_ID, title: 'Índice de Saúde Mental' },
    ...visibleSections.map((s) => ({ id: s.section.id, title: s.section.title })),
  ]

  return (
    <div className="flex flex-col gap-8">
      <SectionNav items={navItems} />

      <section id={OVERVIEW_ID} className="flex flex-col gap-3 scroll-mt-4">
        <h2 className="text-base font-semibold" style={{ color: T.text }}>Índice de Saúde Mental</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl p-5 flex flex-col gap-1" style={cardStyle}>
            <span className="text-xs uppercase tracking-wide" style={{ color: T.textMuted }}>Índice de Saúde Mental</span>
            <span className="text-3xl font-bold" style={{ color: T.text }}>
              {data.avg_index != null ? `${data.avg_index.toFixed(2)} / 10.00` : '—'}
            </span>
            <span className="text-xs" style={{ color: T.textFaint }}>Média ponderada de 8 componentes; maior é melhor</span>
          </div>

          <div className="rounded-xl p-5 flex flex-col gap-1" style={cardStyle}>
            <span className="text-xs uppercase tracking-wide" style={{ color: T.textMuted }}>Respostas</span>
            <span className="text-3xl font-bold" style={{ color: T.text }}>{data.respondents}</span>
            <span className="text-xs" style={{ color: T.textFaint }}>Colaboradores que responderam o módulo</span>
          </div>

          <div
            className="rounded-xl p-5 flex flex-col gap-1"
            style={{
              backgroundColor: T.surface,
              border: `1px solid ${data.suicide.at_risk > 0 ? BRAND_COLORS.danger : T.border}`,
            }}
          >
            <span className="text-xs uppercase tracking-wide" style={{ color: T.textMuted }}>Indicadores de risco de suicídio</span>
            <span className="text-3xl font-bold" style={{ color: data.suicide.at_risk > 0 ? BRAND_COLORS.danger : T.text }}>
              {data.suicide.at_risk} <span className="text-lg font-medium">({suicidePct}%)</span>
            </span>
            <span className="text-xs" style={{ color: T.textFaint }}>Reduz o índice individual pela metade</span>
          </div>
        </div>

        <div className="rounded-xl p-5" style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: T.textMuted }}>Classificação do Índice de Saúde Mental</h3>
          {data.class_distribution.length === 0 ? (
            <p className="text-sm" style={{ color: T.textFaint }}>Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.class_distribution} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {data.class_distribution.map((e) => <Cell key={e.name} fill={CLASS_COLORS[e.name] ?? '#555'} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text }}
                  formatter={(v, name) => [`${v} respostas`, String(name)]}
                />
                <Legend formatter={(v) => <span style={{ color: T.textMuted, fontSize: '12px' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl p-5" style={cardStyle}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: T.textMuted }}>Nota média por componente (escala 0–10)</h3>
          <p className="text-xs mb-4" style={{ color: T.textFaint }}>
            Cada componente entra no índice com o peso indicado. Quem não respondeu um componente fica
            fora da média dele — ausência de dado não vira nota zero.
          </p>
          <ResponsiveContainer width="100%" height={Math.max(220, data.components.length * 40)}>
            <BarChart data={data.components.filter((c) => c.avg_score !== null)} layout="vertical" margin={{ left: 8, right: 50 }}>
              <XAxis type="number" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fill: T.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={150} tick={{ fill: T.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: T.surface2 }} content={<ComponentTooltipContent />} />
              <Bar dataKey="avg_score" radius={[0, 4, 4, 0]}>
                {data.components.filter((c) => c.avg_score !== null).map((c) => (
                  <Cell key={c.key} fill={scoreColor(c.avg_score)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {visibleSections.map(({ section, pies, bars, suicideGroup, histograms }) => (
        <section key={section.id} id={section.id} className="flex flex-col gap-3 scroll-mt-4">
          <div>
            <h2 className="text-base font-semibold" style={{ color: T.text }}>{section.title}</h2>
            {section.subtitle && (
              <p className="text-xs mt-0.5" style={{ color: T.textFaint }}>{section.subtitle}</p>
            )}
          </div>
          <div className={`grid grid-cols-1 gap-3 ${GRID_COLS[section.columns]}`}>
            {pies.map((group) => <PieCard key={group.key} title={group.title} items={group.items} />)}
            {bars.map((group) => <DescriptiveBarCard key={group.key} title={group.title} items={group.items} />)}
            {histograms.map((h) => (
              <ValueHistogramCard
                key={h.key}
                title={h.config.title}
                seriesLabel={h.config.seriesLabel}
                stats={h.config.stats(h.data)}
                data={h.data}
                yUnit={h.config.yUnit}
              />
            ))}
            {suicideGroup && (
              <SuicideRiskCard atRisk={data.suicide.at_risk} total={data.suicide.total} items={suicideGroup.items} />
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
