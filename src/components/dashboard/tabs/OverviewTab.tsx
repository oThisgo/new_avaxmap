'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { motion } from 'motion/react'
import {
  Activity, Brain, CalendarClock, HeartPulse, ShieldAlert, TrendingDown, TriangleAlert,
  CircleCheck, Users, Flame, Info, Layers,
} from 'lucide-react'
import { BRAND_COLORS } from '@/lib/brand'
import { useThemeTokens } from '@/lib/theme'
import { classifyMentalHealth } from '@/lib/analytics/mental-health'
import type { MappingHighlights } from '@/lib/analytics/mapping-highlights'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert } from '@/components/ui/alert'
import {
  KpiTile, Panel, ProgressRing, RankBar, SegmentPills, StackedClassBar,
  chartTooltipStyle, classColor, fmtDate, fmtNumber,
} from '../HighlightWidgets'

const ORG_PALETTE = [
  BRAND_COLORS.primary, BRAND_COLORS.secondary, '#5F82F6', BRAND_COLORS.mint,
  BRAND_COLORS.peach, BRAND_COLORS.pink, BRAND_COLORS.lilac, BRAND_COLORS.slate,
  '#A3A3A3', '#84CC16', '#14B8A6', '#F43F5E',
]

/** Abaixo disso, a adesão de um grupo é sinalizada como baixa. */
const LOW_ADHERENCE_PCT = 70

interface DistItem { name: string; value: number }
interface DayItem { date: string; count: number }

interface OverviewData {
  total_responses: number
  total_expected: number
  completion_pct: number
  responses_by_day: DayItem[]
  // null = a base deste mapeamento não tem essa coluna (card nem aparece);
  // [] = tem a coluna, mas ninguém respondeu ainda ("Sem dados").
  by_area: DistItem[] | null
  by_role: DistItem[] | null
  by_employment_type: DistItem[] | null
  highlights: MappingHighlights | null
}

type AlertTone = 'danger' | 'warning' | 'info' | 'success'
interface ManagerAlert { tone: AlertTone; title: string; detail: string }

const TONE_COLOR: Record<AlertTone, string> = {
  danger: BRAND_COLORS.danger,
  warning: BRAND_COLORS.warning,
  info: BRAND_COLORS.primary,
  success: BRAND_COLORS.success,
}
const TONE_ICON = { danger: ShieldAlert, warning: TriangleAlert, info: Info, success: CircleCheck }

function plural(n: number, singular: string, pluralForm: string) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : pluralForm}`
}

/** Leitura automática dos números em frases curtas para o gestor. */
function buildAlerts(h: MappingHighlights): ManagerAlert[] {
  const alerts: ManagerAlert[] = []
  const mh = h.mental_health
  const hse = h.hse

  if (mh && mh.suicide_at_risk > 0) {
    alerts.push({
      tone: 'danger',
      title: `${plural(mh.suicide_at_risk, 'pessoa sinalizou', 'pessoas sinalizaram')} indicadores de risco de suicídio`,
      detail: `${fmtNumber(mh.suicide_pct)}% de quem respondeu o módulo de Saúde Mental. Recomenda-se acionar o protocolo de acolhimento — a aba Dados de Risco lista os casos para os perfis autorizados.`,
    })
  }

  if (hse && hse.high_risk > 0) {
    alerts.push({
      tone: 'danger',
      title: `${plural(hse.high_risk, 'colaborador', 'colaboradores')} em alto risco psicossocial`,
      detail: `${fmtNumber((hse.high_risk / Math.max(1, hse.respondents)) * 100)}% das respostas do HSE estão na faixa de alto risco.`,
    })
  }

  const worstDomain = hse?.domains[0]
  if (worstDomain && worstDomain.classification !== 'Baixo risco') {
    alerts.push({
      tone: worstDomain.classification === 'Alto risco' ? 'danger' : 'warning',
      title: `Domínio mais crítico: ${worstDomain.name}`,
      detail: `Score médio ${fmtNumber(worstDomain.avg_score, 2)} de 4 (${worstDomain.classification}). É o primeiro candidato a plano de ação.`,
    })
  }

  const lowGroups = h.segments
    .flatMap((s) => s.groups.map((g) => ({ ...g, segment: s.label })))
    .filter((g) => g.pct < LOW_ADHERENCE_PCT)
    .sort((a, b) => a.pct - b.pct)
  if (lowGroups.length > 0) {
    const worst = lowGroups[0]
    alerts.push({
      tone: 'warning',
      title: `Baixa adesão em ${worst.segment}: ${worst.name} (${fmtNumber(worst.pct)}%)`,
      detail: lowGroups.length > 1
        ? `Outros ${lowGroups.length - 1} grupo(s) abaixo de ${LOW_ADHERENCE_PCT}%. Vale reforçar a comunicação com essas lideranças.`
        : `Vale reforçar a comunicação com essa liderança.`,
    })
  }

  if (mh && mh.respondents > 0 && mh.severe_stress > 0) {
    alerts.push({
      tone: 'warning',
      title: `${fmtNumber((mh.severe_stress / mh.respondents) * 100)}% com sintomas graves de estresse`,
      detail: `${plural(mh.severe_stress, 'pessoa relatou', 'pessoas relataram')} 5 ou mais sintomas de estresse no último mês.`,
    })
  }

  const missing = h.total_expected - h.total_responses
  if (missing > 0) {
    alerts.push({
      tone: h.completion_pct >= 75 ? 'success' : 'info',
      title: h.completion_pct >= 75
        ? `Boa adesão: ${fmtNumber(h.completion_pct)}% já responderam`
        : `Adesão em ${fmtNumber(h.completion_pct)}%`,
      detail: `Ainda ${plural(missing, 'colaborador não respondeu', 'colaboradores não responderam')}.`,
    })
  }

  return alerts
}

function fmtDay(date: string) {
  const [, m, d] = date.split('-')
  return `${d}/${m}`
}

function daysBetween(a: string, b: string) {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000) + 1)
}

function OrgDonut({ title, data }: { title: string; data: DistItem[] }) {
  const T = useThemeTokens()
  const total = data.reduce((s, d) => s + d.value, 0)
  const top = data.slice(0, 8)

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
      <h3 className="mb-4 text-sm font-semibold" style={{ color: T.textMuted }}>{title}</h3>
      {data.length === 0 ? (
        <p className="text-sm" style={{ color: T.textFaint }}>Sem dados</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={top} cx="50%" cy="50%" innerRadius={48} outerRadius={76} paddingAngle={2} dataKey="value" stroke={T.surface} strokeWidth={2}>
                {top.map((entry, i) => (
                  <Cell key={entry.name} fill={ORG_PALETTE[i % ORG_PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                {...chartTooltipStyle(T)}
                formatter={(value, name) => [`${value} (${total > 0 ? ((Number(value) / total) * 100).toFixed(1) : 0}%)`, String(name)]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-col gap-1.5">
            {top.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: ORG_PALETTE[i % ORG_PALETTE.length] }} />
                  <span className="truncate text-xs" style={{ color: T.textMuted }} title={d.name}>{d.name}</span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <span className="text-xs" style={{ color: T.textFaint }}>{total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%</span>
                  <span className="text-xs font-semibold" style={{ color: T.text }}>{d.value}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ScoreChip({ value, classification, decimals = 2 }: { value: number | null; classification: string | null; decimals?: number }) {
  const T = useThemeTokens()
  if (value === null || !classification) {
    return <span className="text-xs" style={{ color: T.textFaint }} title="Menos de 5 respostas no grupo — oculto para preservar o anonimato">n &lt; 5</span>
  }
  const color = classColor(classification)
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums" style={{ backgroundColor: `${color}22`, color }} title={classification}>
      {fmtNumber(value, decimals)}
      <span className="hidden font-medium md:inline">· {classification}</span>
    </span>
  )
}

function SegmentTable({ segments }: { segments: MappingHighlights['segments'] }) {
  const T = useThemeTokens()
  const [segmentKey, setSegmentKey] = useState(segments[0]?.key ?? '')
  const segment = segments.find((s) => s.key === segmentKey) ?? segments[0]
  if (!segment) return null

  const groups = [...segment.groups].sort((a, b) => (b.hse_avg ?? -1) - (a.hse_avg ?? -1))
  const showHse = groups.some((g) => g.hse_avg !== null)
  const showMh = groups.some((g) => g.mh_avg !== null)

  return (
    <Panel
      title="Mapa de calor por segmento"
      subtitle="Adesão e índices médios por grupo, do mais crítico ao menos crítico. Grupos com menos de 5 respostas têm os índices ocultos."
      icon={Layers}
      action={<SegmentPills options={segments.map((s) => ({ key: s.key, label: s.label }))} value={segment.key} onChange={setSegmentKey} />}
    >
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-y-1 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide" style={{ color: T.textFaint }}>
              <th className="px-2 py-1 font-medium">{segment.label}</th>
              <th className="px-2 py-1 font-medium">Adesão</th>
              {showHse && <th className="px-2 py-1 font-medium">Índice HSE (0–4)</th>}
              {showMh && <th className="px-2 py-1 font-medium">Saúde Mental (0–10)</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const low = g.pct < LOW_ADHERENCE_PCT
              return (
                <tr key={g.name} style={{ backgroundColor: T.surface2 }}>
                  <td className="rounded-l-lg px-2 py-2 font-medium" style={{ color: T.text }}>{g.name}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full" style={{ backgroundColor: T.border }}>
                        <div className="h-full rounded-full" style={{ width: `${g.pct}%`, backgroundColor: low ? BRAND_COLORS.warning : BRAND_COLORS.primary }} />
                      </div>
                      <span className="text-xs tabular-nums" style={{ color: low ? BRAND_COLORS.warning : T.textMuted }}>
                        {fmtNumber(g.pct, 0)}% <span style={{ color: T.textFaint }}>({g.answered}/{g.total})</span>
                      </span>
                    </div>
                  </td>
                  {showHse && <td className={`px-2 py-2 ${showMh ? '' : 'rounded-r-lg'}`}><ScoreChip value={g.hse_avg} classification={g.hse_class} /></td>}
                  {showMh && (
                    <td className="rounded-r-lg px-2 py-2">
                      <ScoreChip value={g.mh_avg} classification={g.mh_avg !== null ? classifyMentalHealth(g.mh_avg) : null} decimals={1} />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function HighlightsSection({ h }: { h: MappingHighlights }) {
  const T = useThemeTokens()
  const alerts = useMemo(() => buildAlerts(h), [h])
  const tooltip = chartTooltipStyle(T)
  const hse = h.hse
  const mh = h.mental_health
  const remote = h.remote

  const lowAdherence = useMemo(
    () => h.segments
      .flatMap((s) => s.groups.map((g) => ({ ...g, segment: s.label })))
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 6),
    [h.segments],
  )

  const fieldDays = h.first_response_at && h.last_response_at ? daysBetween(h.first_response_at, h.last_response_at) : 0
  const peak = h.responses_by_day.reduce<{ date: string; count: number } | null>((best, d) => (!best || d.count > best.count ? d : best), null)

  return (
    <div className="flex flex-col gap-5">
      {/* ── Termômetro ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative flex flex-col items-center gap-5 overflow-hidden rounded-2xl p-6 sm:flex-row"
          style={{ background: `linear-gradient(135deg, ${BRAND_COLORS.primary}1F, ${BRAND_COLORS.secondary}0D)`, border: `1px solid ${BRAND_COLORS.primary}40` }}
        >
          <ProgressRing value={h.completion_pct} label={`${fmtNumber(h.completion_pct, 0)}%`} sublabel="de adesão" />
          <div className="flex w-full flex-col gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: BRAND_COLORS.primary }}>Termômetro do mapeamento</p>
              <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: T.text }}>
                {h.total_responses.toLocaleString('pt-BR')} <span className="text-base font-medium" style={{ color: T.textMuted }}>de {h.total_expected.toLocaleString('pt-BR')} responderam</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p style={{ color: T.textFaint }}>Pendentes</p>
                <p className="text-base font-semibold tabular-nums" style={{ color: T.text }}>{(h.total_expected - h.total_responses).toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p style={{ color: T.textFaint }}>Dias em campo</p>
                <p className="text-base font-semibold tabular-nums" style={{ color: T.text }}>{fieldDays || '—'}</p>
              </div>
              <div>
                <p style={{ color: T.textFaint }}>Primeira resposta</p>
                <p className="text-sm font-semibold" style={{ color: T.text }}>{fmtDate(h.first_response_at)}</p>
              </div>
              <div>
                <p style={{ color: T.textFaint }}>Pico de respostas</p>
                <p className="text-sm font-semibold" style={{ color: T.text }}>{peak ? `${fmtDay(peak.date)} · ${peak.count}` : '—'}</p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {mh && (
            <KpiTile
              icon={ShieldAlert}
              label="Risco de suicídio"
              value={mh.suicide_at_risk.toLocaleString('pt-BR')}
              unit={mh.suicide_at_risk === 1 ? 'pessoa' : 'pessoas'}
              accent={mh.suicide_at_risk > 0 ? BRAND_COLORS.danger : BRAND_COLORS.success}
              emphasis={mh.suicide_at_risk > 0}
              badge={mh.suicide_at_risk > 0 ? 'Atenção imediata' : 'Nenhum indicador'}
              foot={`${fmtNumber(mh.suicide_pct)}% de ${mh.respondents} respondentes · últimos 30 dias`}
              delay={0.05}
            />
          )}
          {hse && (
            <KpiTile
              icon={Activity}
              label="Índice HSE médio"
              value={fmtNumber(hse.avg_score, 2)}
              unit="/ 4"
              accent={classColor(hse.classification)}
              badge={hse.classification}
              badgeColor={classColor(hse.classification)}
              foot={`${plural(hse.high_risk, 'pessoa', 'pessoas')} em alto risco · quanto menor, melhor`}
              delay={0.1}
            />
          )}
          {mh && (
            <KpiTile
              icon={Brain}
              label="Índice de Saúde Mental"
              value={fmtNumber(mh.avg_index, 1)}
              unit="/ 10"
              accent={classColor(mh.classification)}
              badge={mh.classification}
              badgeColor={classColor(mh.classification)}
              foot={`Percepção de saúde ${fmtNumber(mh.avg_health_score)} · qualidade de vida ${fmtNumber(mh.avg_life_quality)}`}
              delay={0.15}
            />
          )}
          {remote && remote.respondents > 0 ? (
            <KpiTile
              icon={Users}
              label="Trabalho remoto (IETR)"
              value={fmtNumber(remote.avg_score, 2)}
              unit="/ 5"
              accent={classColor(remote.classification)}
              badge={remote.classification}
              badgeColor={classColor(remote.classification)}
              foot={`${plural(remote.respondents, 'pessoa em trabalho remoto respondeu', 'pessoas em trabalho remoto responderam')} · quanto maior, melhor`}
              delay={0.2}
            />
          ) : (
            <KpiTile
              icon={Users}
              label="Respostas recebidas"
              value={h.total_responses.toLocaleString('pt-BR')}
              accent={BRAND_COLORS.primary}
              foot={`${fmtNumber(h.completion_pct)}% de ${h.total_expected} esperadas`}
              delay={0.2}
            />
          )}
        </div>
      </div>

      {/* ── Alertas + distribuição de classificações ──────────────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="O que pede atenção agora" subtitle="Leitura automática dos indicadores deste recorte" icon={Flame} accent={BRAND_COLORS.danger}>
          {alerts.length === 0 ? (
            <p className="text-sm" style={{ color: T.textFaint }}>Nenhum ponto de atenção identificado.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {alerts.map((alert, i) => {
                const Icon = TONE_ICON[alert.tone]
                const color = TONE_COLOR[alert.tone]
                return (
                  <motion.li
                    key={alert.title}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.05 * i }}
                    className="flex gap-3 rounded-xl p-3"
                    style={{ backgroundColor: `${color}10`, borderLeft: `3px solid ${color}` }}
                  >
                    <Icon size={18} className="mt-0.5 flex-shrink-0" style={{ color }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: T.text }}>{alert.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed" style={{ color: T.textMuted }}>{alert.detail}</p>
                    </div>
                  </motion.li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Distribuição das classificações" subtitle="Como as respostas se dividem em cada instrumento" icon={HeartPulse}>
          <div className="flex flex-col gap-5">
            {hse && <StackedClassBar title="Riscos psicossociais (HSE)" items={hse.class_distribution} />}
            {mh && <StackedClassBar title="Índice de Saúde Mental" items={mh.class_distribution} />}
            {remote && <StackedClassBar title="Trabalho remoto (IETR)" items={remote.class_distribution} />}
            {mh && mh.respondents > 0 && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                {[
                  { label: 'Estresse grave', value: mh.severe_stress },
                  { label: 'Sintomas depressivos mod./graves', value: mh.depressive_moderate_severe },
                  { label: 'Sem rede de apoio', value: mh.no_support },
                  { label: 'Consumo de álcool binge', value: mh.binge },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl p-3" style={{ backgroundColor: T.surface2 }}>
                    <p className="text-xl font-bold tabular-nums" style={{ color: T.text }}>{fmtNumber((item.value / mh.respondents) * 100)}%</p>
                    <p className="text-xs" style={{ color: T.textMuted }}>{item.label}</p>
                    <p className="text-[11px] tabular-nums" style={{ color: T.textFaint }}>{plural(item.value, 'pessoa', 'pessoas')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* ── Linha do tempo ─────────────────────────────────────────────── */}
      {h.responses_by_day.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Respostas por dia" subtitle="Ritmo de coleta ao longo do período" icon={CalendarClock}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={h.responses_by_day} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: T.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
                <YAxis allowDecimals={false} tick={{ fill: T.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  {...tooltip}
                  cursor={{ fill: T.surface2 }}
                  labelFormatter={(v) => `Data: ${String(v).split('-').reverse().join('/')}`}
                  formatter={(v) => [`${v} respostas`, 'No dia']}
                />
                <Bar dataKey="count" fill={BRAND_COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="Adesão acumulada" subtitle="Percentual do público que já respondeu, dia a dia" icon={TrendingDown}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={h.responses_by_day} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="adherenceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND_COLORS.primary} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={BRAND_COLORS.primary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: T.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: T.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  {...tooltip}
                  labelFormatter={(v) => `Até ${String(v).split('-').reverse().join('/')}`}
                  formatter={(v, _name, item) => [`${fmtNumber(Number(v))}% (${(item?.payload as { cumulative?: number })?.cumulative ?? 0} respostas)`, 'Adesão']}
                />
                <Area type="monotone" dataKey="cumulative_pct" stroke={BRAND_COLORS.primary} strokeWidth={2} fill="url(#adherenceFill)" activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* ── Domínios e questões críticas ──────────────────────────────── */}
      {hse && hse.domains.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Domínios HSE do mais ao menos crítico" subtitle="Score médio de risco (0 a 4) — quanto maior, pior" icon={Activity}>
            <div className="flex flex-col gap-3.5">
              {hse.domains.map((d) => (
                <RankBar
                  key={d.name}
                  label={d.name}
                  value={d.avg_score}
                  max={4}
                  display={fmtNumber(d.avg_score, 2)}
                  color={classColor(d.classification)}
                  tag={d.classification}
                />
              ))}
            </div>
          </Panel>
          <Panel title="Questões com os scores mais críticos" subtitle="Itens do HSE com maior risco médio" icon={TriangleAlert} accent={BRAND_COLORS.warning}>
            <ol className="flex flex-col gap-3">
              {hse.critical_questions.map((q, i) => {
                const color = classColor(q.classification)
                return (
                  <li key={q.code} className="flex gap-3">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: `${color}22`, color }}>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug" style={{ color: T.text }}>{q.text}</p>
                      <p className="mt-1 text-xs" style={{ color: T.textFaint }}>
                        {q.code} · {q.domain} · <span className="font-semibold" style={{ color }}>{fmtNumber(q.avg_score, 2)} ({q.classification})</span> · {fmtNumber(q.high_risk_pct, 0)}% marcaram resposta de alto risco
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </Panel>
        </div>
      )}

      {/* ── Segmentos ─────────────────────────────────────────────────── */}
      {h.segments.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Panel title="Grupos com menor adesão" subtitle={`Todas as categorias, da menor para a maior. Abaixo de ${LOW_ADHERENCE_PCT}% em destaque.`} icon={TrendingDown} accent={BRAND_COLORS.warning}>
            <div className="flex flex-col gap-3.5">
              {lowAdherence.map((g) => {
                const low = g.pct < LOW_ADHERENCE_PCT
                return (
                  <RankBar
                    key={`${g.segment}-${g.name}`}
                    label={`${g.name}`}
                    hint={`${g.segment}: ${g.answered} de ${g.total} responderam`}
                    value={g.pct}
                    max={100}
                    display={`${fmtNumber(g.pct, 0)}%`}
                    color={low ? BRAND_COLORS.warning : BRAND_COLORS.primary}
                    tag={g.segment}
                    tagColor={BRAND_COLORS.slate}
                  />
                )
              })}
            </div>
          </Panel>
          <SegmentTable segments={h.segments} />
        </div>
      )}
    </div>
  )
}

export default function OverviewTab({ query }: { query: string }) {
  const T = useThemeTokens()
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/overview${query ? `?${query}` : ''}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [query])

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl xl:col-span-2" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    )
  }
  if (!data || typeof data.total_expected !== 'number') return <Alert>Erro ao carregar dados.</Alert>

  return (
    <div className="flex flex-col gap-6">
      {data.highlights && data.highlights.total_responses > 0 ? (
        <HighlightsSection h={data.highlights} />
      ) : (
        <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
          <p className="text-base font-semibold" style={{ color: T.text }}>Aguardando as primeiras respostas</p>
          <p className="mt-1 text-sm" style={{ color: T.textMuted }}>
            {data.total_expected.toLocaleString('pt-BR')} colaboradores cadastrados neste recorte. Os indicadores aparecem assim que as respostas chegarem.
          </p>
        </div>
      )}

      {(data.by_area || data.by_role || data.by_employment_type) && (
        <>
          <h3 className="-mb-2 text-sm font-semibold" style={{ color: T.textMuted }}>Composição das respostas</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.by_area && <OrgDonut title="Respostas por Área" data={data.by_area} />}
            {data.by_role && <OrgDonut title="Respostas por Cargo" data={data.by_role} />}
            {data.by_employment_type && <OrgDonut title="Respostas por Vínculo" data={data.by_employment_type} />}
          </div>
        </>
      )}
    </div>
  )
}
