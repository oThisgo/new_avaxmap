'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Activity, ArrowRight, Brain, CalendarClock, CircleCheck, FolderKanban, Flag, LayoutDashboard,
  Plus, Rocket, ShieldAlert, Users, UserCheck, Sparkles, Clock,
} from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_COLORS, BRAND_NAME } from '@/lib/brand'
import { useThemeTokens } from '@/lib/theme'
import type { MappingHighlights } from '@/lib/analytics/mapping-highlights'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert } from '@/components/ui/alert'
import {
  KpiTile, Panel, ProgressRing, RankBar, StackedClassBar,
  chartTooltipStyle, classColor, fmtDate, fmtNumber,
} from '@/components/dashboard/HighlightWidgets'

type MappingRow = {
  id: string
  name: string
  slug: string
  description: string | null
  status: 'draft' | 'active' | 'archived'
  module_type: 'HSE' | 'REMOTE' | null
  is_demo: boolean
  updated_at: string
}

type TenantContext = {
  id: string
  name: string
  slug: string
  role: string
  is_active: boolean
}

type MappingSummary = {
  id: string
  name: string
  slug: string
  status: string
  is_demo: boolean
  modules: string[]
  created_at: string
  total_expected: number
  total_responses: number
  completion_pct: number
  last_response_at: string | null
  hse_avg: number | null
  hse_class: string | null
  hse_high_risk: number | null
  mh_avg: number | null
  mh_class: string | null
  suicide_at_risk: number | null
}

type TimelineEvent = {
  at: string
  kind: 'created' | 'first_response' | 'milestone' | 'last_response'
  mapping_id: string
  mapping_name: string
  label: string
}

type ClientOverview = {
  overall: (MappingHighlights & {
    mappings_total: number
    mappings_by_status: Record<string, number>
    responses_last_7_days: number
  }) | null
  mappings: MappingSummary[]
  timeline: TimelineEvent[]
}

type ViewId = 'overview' | 'mappings'

const STATUS_LABEL: Record<string, string> = { active: 'Ativo', draft: 'Rascunho', archived: 'Arquivado' }
const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral'> = { active: 'success', draft: 'warning', archived: 'neutral' }

const MODULE_LABEL: Record<string, string> = {
  hse: 'HSE',
  ietr: 'Trabalho remoto',
  saude_mental: 'Saúde mental',
  sociodemografico: 'Sociodemográfico',
}

const EVENT_STYLE: Record<TimelineEvent['kind'], { icon: typeof Rocket; color: string }> = {
  created: { icon: Rocket, color: BRAND_COLORS.slate },
  first_response: { icon: Flag, color: BRAND_COLORS.secondary },
  milestone: { icon: CircleCheck, color: BRAND_COLORS.success },
  last_response: { icon: Clock, color: BRAND_COLORS.primary },
}

function fmtDay(date: string) {
  const [, m, d] = date.split('-')
  return `${d}/${m}`
}

function relativeTime(iso: string): string {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (diffDays <= 0) return 'hoje'
  if (diffDays === 1) return 'ontem'
  if (diffDays < 30) return `há ${diffDays} dias`
  return fmtDate(iso)
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function ScorePill({ value, classification, decimals = 2 }: { value: number | null; classification: string | null; decimals?: number }) {
  const T = useThemeTokens()
  if (value === null) return <span className="text-xs" style={{ color: T.textFaint }}>—</span>
  const color = classColor(classification)
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums" style={{ backgroundColor: `${color}22`, color }} title={classification ?? undefined}>
      {fmtNumber(value, decimals)}
      {classification && <span className="hidden font-medium lg:inline">· {classification}</span>}
    </span>
  )
}

function OverviewView({
  data, onOpen, opening, onCreate,
}: {
  data: ClientOverview
  onOpen: (slug: string) => void
  opening: string | null
  onCreate: () => void
}) {
  const T = useThemeTokens()
  const o = data.overall
  const tooltip = chartTooltipStyle(T)

  const last30 = useMemo(() => {
    if (!o) return []
    const byDate = new Map(o.responses_by_day.map((d) => [d.date, d.count]))
    const days: Array<{ date: string; count: number }> = []
    const today = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      days.push({ date: key, count: byDate.get(key) ?? 0 })
    }
    return days
  }, [o])

  if (!o || o.mappings_total === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `${BRAND_COLORS.primary}1A`, color: BRAND_COLORS.primary }}>
          <Sparkles size={22} />
        </span>
        <p className="text-lg font-semibold">Comece seu primeiro mapeamento</p>
        <p className="max-w-md text-sm" style={{ color: T.textMuted }}>
          Assim que houver mapeamentos com respostas, este painel mostra adesão, riscos psicossociais e saúde mental consolidados.
        </p>
        <Button onClick={onCreate}>Criar mapeamento</Button>
      </Card>
    )
  }

  const activeCount = o.mappings_by_status.active ?? 0
  const mh = o.mental_health
  const hse = o.hse
  const pending = o.total_expected - o.total_responses

  return (
    <div className="flex flex-col gap-5">
      {/* ── KPIs principais ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-5 rounded-2xl p-6 sm:flex-row"
          style={{ background: `linear-gradient(135deg, ${BRAND_COLORS.primary}24, ${BRAND_COLORS.secondary}0D)`, border: `1px solid ${BRAND_COLORS.primary}40` }}
        >
          <ProgressRing value={o.completion_pct} label={`${fmtNumber(o.completion_pct, 0)}%`} sublabel="adesão geral" />
          <div className="flex w-full flex-col gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: BRAND_COLORS.primary }}>Participação consolidada</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {o.total_responses.toLocaleString('pt-BR')}
                <span className="text-base font-medium" style={{ color: T.textMuted }}> respostas de {o.total_expected.toLocaleString('pt-BR')} colaboradores</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p style={{ color: T.textFaint }}>Aguardando resposta</p>
                <p className="text-base font-semibold tabular-nums">{pending.toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p style={{ color: T.textFaint }}>Últimos 7 dias</p>
                <p className="text-base font-semibold tabular-nums">+{o.responses_last_7_days.toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p style={{ color: T.textFaint }}>Primeira resposta</p>
                <p className="text-sm font-semibold">{fmtDate(o.first_response_at)}</p>
              </div>
              <div>
                <p style={{ color: T.textFaint }}>Última resposta</p>
                <p className="text-sm font-semibold">{o.last_response_at ? relativeTime(o.last_response_at) : '—'}</p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KpiTile
            icon={FolderKanban}
            label="Mapeamentos"
            value={o.mappings_total.toLocaleString('pt-BR')}
            unit={o.mappings_total === 1 ? 'projeto' : 'projetos'}
            badge={`${activeCount} ${activeCount === 1 ? 'ativo' : 'ativos'}`}
            badgeColor={BRAND_COLORS.primary}
            foot={Object.entries(o.mappings_by_status).filter(([s]) => s !== 'active').map(([s, n]) => `${n} ${STATUS_LABEL[s]?.toLowerCase() ?? s}`).join(' · ') || 'Todos em andamento'}
            delay={0.05}
          />
          <KpiTile
            icon={Users}
            label="Colaboradores cadastrados"
            value={o.total_expected.toLocaleString('pt-BR')}
            badge={`${o.total_responses.toLocaleString('pt-BR')} responderam`}
            badgeColor={BRAND_COLORS.success}
            foot="Somando todos os mapeamentos"
            delay={0.1}
          />
          {mh ? (
            <KpiTile
              icon={ShieldAlert}
              label="Risco de suicídio"
              value={mh.suicide_at_risk.toLocaleString('pt-BR')}
              unit={mh.suicide_at_risk === 1 ? 'pessoa' : 'pessoas'}
              accent={mh.suicide_at_risk > 0 ? BRAND_COLORS.danger : BRAND_COLORS.success}
              emphasis={mh.suicide_at_risk > 0}
              badge={mh.suicide_at_risk > 0 ? 'Requer acolhimento' : 'Nenhum indicador'}
              foot={`${fmtNumber(mh.suicide_pct)}% de ${mh.respondents} respondentes de Saúde Mental`}
              delay={0.15}
            />
          ) : (
            <KpiTile icon={UserCheck} label="Adesão geral" value={`${fmtNumber(o.completion_pct, 0)}%`} delay={0.15} />
          )}
          {hse ? (
            <KpiTile
              icon={Activity}
              label="Alto risco psicossocial"
              value={hse.high_risk.toLocaleString('pt-BR')}
              unit={hse.high_risk === 1 ? 'pessoa' : 'pessoas'}
              accent={hse.high_risk > 0 ? BRAND_COLORS.warning : BRAND_COLORS.success}
              badge={hse.classification ? `HSE médio ${fmtNumber(hse.avg_score, 2)} · ${hse.classification}` : null}
              badgeColor={classColor(hse.classification)}
              foot={`${fmtNumber((hse.high_risk / Math.max(1, hse.respondents)) * 100)}% das respostas do HSE`}
              delay={0.2}
            />
          ) : (
            <KpiTile icon={Brain} label="Saúde mental média" value={fmtNumber(mh?.avg_index ?? null)} unit="/ 10" delay={0.2} />
          )}
        </div>
      </div>

      {/* ── Ritmo e adesão por mapeamento ─────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Respostas nos últimos 30 dias" subtitle="Todos os mapeamentos somados" icon={CalendarClock}>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={last30} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: T.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
              <YAxis allowDecimals={false} tick={{ fill: T.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip
                {...tooltip}
                cursor={{ fill: T.surface2 }}
                labelFormatter={(v) => `Data: ${String(v).split('-').reverse().join('/')}`}
                formatter={(v) => [`${v} respostas`, 'No dia']}
              />
              <Bar dataKey="count" fill={BRAND_COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Adesão por mapeamento" subtitle="Quem já respondeu, em cada projeto" icon={UserCheck}>
          <div className="flex flex-col gap-4">
            {data.mappings.map((m) => (
              <RankBar
                key={m.id}
                label={m.name}
                hint={`${m.total_responses} de ${m.total_expected} responderam`}
                value={m.completion_pct}
                max={100}
                display={`${fmtNumber(m.completion_pct, 0)}%`}
                color={BRAND_COLORS.primary}
                tag={`${m.total_responses}/${m.total_expected}`}
                tagColor={BRAND_COLORS.slate}
              />
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Riscos consolidados ───────────────────────────────────────── */}
      {(hse || mh) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {hse && hse.domains.length > 0 && (
            <Panel title="Domínios HSE mais críticos" subtitle="Média de todos os respondentes (0 a 4) — quanto maior, pior" icon={Activity}>
              <div className="flex flex-col gap-3.5">
                {hse.domains.map((d) => (
                  <RankBar key={d.name} label={d.name} value={d.avg_score} max={4} display={fmtNumber(d.avg_score, 2)} color={classColor(d.classification)} tag={d.classification} />
                ))}
              </div>
            </Panel>
          )}
          <Panel title="Panorama de saúde" subtitle="Distribuição das classificações em todos os mapeamentos" icon={Brain}>
            <div className="flex flex-col gap-5">
              {hse && <StackedClassBar title="Riscos psicossociais (HSE)" items={hse.class_distribution} />}
              {mh && <StackedClassBar title="Índice de Saúde Mental" items={mh.class_distribution} />}
              {o.remote && <StackedClassBar title="Trabalho remoto (IETR)" items={o.remote.class_distribution} />}
              {mh && mh.respondents > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: 'Estresse grave', value: mh.severe_stress },
                    { label: 'Sint. depressivos', value: mh.depressive_moderate_severe },
                    { label: 'Sem rede de apoio', value: mh.no_support },
                    { label: 'Álcool (binge)', value: mh.binge },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl p-3" style={{ backgroundColor: T.surface2 }}>
                      <p className="text-lg font-bold tabular-nums">{fmtNumber((item.value / mh.respondents) * 100)}%</p>
                      <p className="text-xs" style={{ color: T.textMuted }}>{item.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* ── Comparativo + linha do tempo ──────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Comparativo entre mapeamentos" subtitle="Principais indicadores de cada projeto lado a lado" icon={LayoutDashboard}>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[680px] border-separate border-spacing-y-1 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: T.textFaint }}>
                  <th className="px-2 py-1 font-medium">Mapeamento</th>
                  <th className="px-2 py-1 font-medium">Adesão</th>
                  <th className="px-2 py-1 font-medium">HSE</th>
                  <th className="px-2 py-1 font-medium">Saúde mental</th>
                  <th className="px-2 py-1 font-medium">Risco suicídio</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {data.mappings.map((m) => (
                  <tr key={m.id} style={{ backgroundColor: T.surface2 }}>
                    <td className="rounded-l-lg px-2 py-2.5">
                      <p className="font-medium">{m.name}</p>
                      <p className="text-xs" style={{ color: T.textFaint }}>
                        {STATUS_LABEL[m.status] ?? m.status} · {m.last_response_at ? `última resposta ${relativeTime(m.last_response_at)}` : 'sem respostas'}
                      </p>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full" style={{ backgroundColor: T.border }}>
                          <div className="h-full rounded-full" style={{ width: `${m.completion_pct}%`, backgroundColor: BRAND_COLORS.primary }} />
                        </div>
                        <span className="text-xs tabular-nums" style={{ color: T.textMuted }}>{fmtNumber(m.completion_pct, 0)}%</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5"><ScorePill value={m.hse_avg} classification={m.hse_class} /></td>
                    <td className="px-2 py-2.5"><ScorePill value={m.mh_avg} classification={m.mh_class} decimals={1} /></td>
                    <td className="px-2 py-2.5">
                      {m.suicide_at_risk === null ? (
                        <span className="text-xs" style={{ color: T.textFaint }}>—</span>
                      ) : (
                        <span className="text-sm font-semibold tabular-nums" style={{ color: m.suicide_at_risk > 0 ? BRAND_COLORS.danger : T.textMuted }}>
                          {m.suicide_at_risk}
                        </span>
                      )}
                    </td>
                    <td className="rounded-r-lg px-2 py-2.5 text-right">
                      <Button size="sm" variant="outline" loading={opening === m.slug} onClick={() => onOpen(m.slug)} disabled={m.status !== 'active'}>
                        Dashboard <ArrowRight size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Linha do tempo" subtitle="Marcos recentes dos mapeamentos" icon={Clock}>
          {data.timeline.length === 0 ? (
            <p className="text-sm" style={{ color: T.textFaint }}>Nenhum evento ainda.</p>
          ) : (
            <ol className="relative flex flex-col gap-4 pl-1">
              <span aria-hidden className="absolute bottom-2 left-[15px] top-2 w-px" style={{ backgroundColor: T.border }} />
              {data.timeline.map((e, i) => {
                const style = EVENT_STYLE[e.kind]
                const Icon = style.icon
                return (
                  <motion.li
                    key={`${e.mapping_id}-${e.kind}-${e.at}-${i}`}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.4) }}
                    className="relative flex gap-3"
                  >
                    <span className="z-[1] flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: T.surface, border: `2px solid ${style.color}`, color: style.color }}>
                      <Icon size={13} strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug">{e.label}</p>
                      <p className="truncate text-xs" style={{ color: T.textFaint }}>{e.mapping_name} · {fmtDate(e.at)}</p>
                    </div>
                  </motion.li>
                )
              })}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  )
}

function MappingsView({
  mappings, summaries, onOpen, opening, onEdit,
}: {
  mappings: MappingRow[]
  summaries: Map<string, MappingSummary>
  onOpen: (slug: string) => void
  opening: string | null
  onEdit: (id: string) => void
}) {
  const T = useThemeTokens()

  if (mappings.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm" style={{ color: T.textMuted }}>Ainda não há mapeamentos criados para este cliente.</p>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {mappings.map((mapping, idx) => {
        const s = summaries.get(mapping.id)
        return (
          <motion.article
            key={mapping.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(idx * 0.05, 0.4), ease: 'easeOut' }}
            className="flex flex-col rounded-2xl p-5"
            style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {mapping.is_demo && <Badge tone="primary">Demo</Badge>}
              <Badge tone={STATUS_TONE[mapping.status] ?? 'neutral'}>{STATUS_LABEL[mapping.status] ?? mapping.status}</Badge>
            </div>

            <h2 className="text-lg font-semibold leading-tight">{mapping.name}</h2>
            <p className="mt-2 text-sm" style={{ color: T.textMuted }}>{mapping.description ?? 'Sem descrição.'}</p>

            {s && (
              <div className="mt-4 flex flex-col gap-3">
                <div>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span style={{ color: T.textMuted }}>Adesão</span>
                    <span className="tabular-nums" style={{ color: T.text }}>
                      <span className="font-semibold">{fmtNumber(s.completion_pct, 0)}%</span>
                      <span style={{ color: T.textFaint }}> · {s.total_responses}/{s.total_expected}</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: T.surface2 }}>
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${s.completion_pct}%` }}
                      transition={{ duration: 0.7 }}
                      style={{ backgroundColor: BRAND_COLORS.primary }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.hse_avg !== null && <ScorePill value={s.hse_avg} classification={s.hse_class} />}
                  {s.mh_avg !== null && <ScorePill value={s.mh_avg} classification={s.mh_class} decimals={1} />}
                  {!!s.suicide_at_risk && (
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${BRAND_COLORS.danger}22`, color: BRAND_COLORS.danger }}>
                      {s.suicide_at_risk} com risco de suicídio
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {s.modules.map((m) => (
                    <span key={m} className="rounded-md px-1.5 py-0.5 text-[11px]" style={{ backgroundColor: T.surface2, color: T.textMuted }}>
                      {MODULE_LABEL[m] ?? m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-auto pt-4">
              <div className="mb-3 flex items-center justify-between text-xs" style={{ color: T.textFaint }}>
                <span>{s?.last_response_at ? `Última resposta ${relativeTime(s.last_response_at)}` : 'Sem respostas ainda'}</span>
                <span>Atualizado em {new Date(mapping.updated_at).toLocaleDateString('pt-BR')}</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => onOpen(mapping.slug)} className="flex-1" loading={opening === mapping.slug} disabled={mapping.status !== 'active'}>
                  Abrir dashboard
                </Button>
                <Button variant="outline" onClick={() => onEdit(mapping.id)}>Editar</Button>
              </div>
            </div>
          </motion.article>
        )
      })}
    </div>
  )
}

export default function ClientDashboardPage() {
  const router = useRouter()
  const T = useThemeTokens()

  const [tenant, setTenant] = useState<TenantContext | null>(null)
  const [managerName, setManagerName] = useState('')
  const [mappings, setMappings] = useState<MappingRow[]>([])
  const [overview, setOverview] = useState<ClientOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<ViewId>('overview')
  const [opening, setOpening] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/manager/me')
      .then(async (res) => {
        if (!res.ok) throw new Error('unauthorized')
        return res.json()
      })
      .then((me) => {
        setManagerName(typeof me.name === 'string' ? me.name : '')
        if (me.must_change_password) {
          router.replace('/dashboard/reset-password?first_access=1')
        }
      })
      .catch(() => {
        router.replace('/manager/login')
      })
  }, [router])

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError('')
      try {
        const [mappingsRes, overviewRes] = await Promise.all([
          fetch('/api/client/mappings'),
          fetch('/api/client/overview'),
        ])
        const data = await mappingsRes.json()

        if (!mappingsRes.ok) {
          setError(data.error ?? 'Não foi possível carregar os mapeamentos do cliente.')
          return
        }

        setTenant(data.tenant ?? null)
        setMappings(data.mappings ?? [])
        if (overviewRes.ok) setOverview(await overviewRes.json())
      } catch {
        setError('Erro de conexão ao carregar o dashboard do cliente.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const summaries = useMemo(() => new Map((overview?.mappings ?? []).map((m) => [m.id, m])), [overview])

  /** Ativa o contexto do mapeamento na sessão (cookie) antes de abrir o dashboard. */
  async function openMapping(slug: string) {
    setOpening(slug)
    setError('')
    try {
      const res = await fetch('/api/auth/manager/enter-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping_slug: slug }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Não foi possível abrir o mapeamento.')
        setOpening(null)
        return
      }
      router.push(`/mapeamento/${slug}/dashboard`)
    } catch {
      setError('Erro de conexão ao abrir o mapeamento.')
      setOpening(null)
    }
  }

  const views: Array<{ id: ViewId; label: string; icon: typeof LayoutDashboard; count?: number }> = [
    { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
    { id: 'mappings', label: 'Mapeamentos', icon: FolderKanban, count: mappings.length },
  ]

  return (
    <main className="min-h-screen" style={{ backgroundColor: T.bg, color: T.text }}>
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: T.textFaint }}>Plataforma {BRAND_NAME}</p>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              {greeting()}{managerName ? `, ${managerName.split(' ')[0]}` : ''}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" style={{ color: T.textMuted }}>
              {tenant ? (
                <>
                  <span>Painel do cliente <span className="font-semibold" style={{ color: T.text }}>{tenant.name}</span></span>
                  <Badge tone="primary">{tenant.role}</Badge>
                  {!tenant.is_active && <Badge tone="danger">Inativo</Badge>}
                </>
              ) : (
                <span>Nenhum cliente vinculado a este usuário.</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => router.push('/dashboard/client/create')}>
              <Plus size={16} /> Criar mapeamento
            </Button>
            <ThemeToggle />
          </div>
        </div>

        <div className="mb-6 flex gap-1 rounded-xl p-1" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, width: 'fit-content' }}>
          {views.map((v) => {
            const active = view === v.id
            const Icon = v.icon
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className="relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                style={{ color: active ? '#FFFFFF' : T.textMuted }}
              >
                {active && (
                  <motion.span layoutId="client-view-pill" className="absolute inset-0 rounded-lg" style={{ backgroundColor: BRAND_COLORS.primary }} transition={{ duration: 0.22 }} />
                )}
                <Icon size={15} className="relative" />
                <span className="relative">{v.label}</span>
                {v.count !== undefined && (
                  <span className="relative rounded-full px-1.5 text-xs tabular-nums" style={{ backgroundColor: active ? '#FFFFFF33' : T.surface2 }}>{v.count}</span>
                )}
              </button>
            )
          })}
        </div>

        {error && <div className="mb-4"><Alert>{error}</Alert></div>}

        {loading ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Skeleton className="h-52 rounded-2xl" />
              <Skeleton className="h-52 rounded-2xl xl:col-span-2" />
            </div>
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {view === 'overview' && overview && (
                <OverviewView data={overview} onOpen={openMapping} opening={opening} onCreate={() => router.push('/dashboard/client/create')} />
              )}
              {view === 'overview' && !overview && !error && (
                <Alert>Não foi possível carregar os indicadores consolidados.</Alert>
              )}
              {view === 'mappings' && (
                <MappingsView
                  mappings={mappings}
                  summaries={summaries}
                  onOpen={openMapping}
                  opening={opening}
                  onEdit={(id) => router.push(`/dashboard/client/${id}`)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </main>
  )
}
