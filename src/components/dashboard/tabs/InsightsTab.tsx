'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Activity, ArrowRight, BookOpenCheck, Brain, CalendarClock, Check, ClipboardCopy, CircleCheck,
  Gauge, GitCompareArrows, Info, Laptop, Layers, ListChecks, ShieldAlert, Sparkles, Target,
  TriangleAlert, Users, Wand2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { BRAND_COLORS } from '@/lib/brand'
import { useThemeTokens } from '@/lib/theme'
import type {
  Horizon, InsightModule, InsightsAnalysis, InsightsPayload, Priority, Severity,
} from '@/lib/analytics/insights-schema'
import type { ComparisonStat, CorrelationStat } from '@/lib/analytics/insights-evidence'
import { Panel, SegmentPills, classColor, fmtNumber } from '../HighlightWidgets'

// ─── Identidade visual da Lumen AI ───────────────────────────────────────────
const AI = {
  blue: '#4285F4',
  violet: '#8B7CF6',
  teal: '#22B8CF',
  gradient: 'linear-gradient(135deg, #4285F4 0%, #8B7CF6 55%, #22B8CF 100%)',
  gradientSoft: 'linear-gradient(135deg, rgba(66,133,244,0.14) 0%, rgba(139,124,246,0.10) 55%, rgba(34,184,207,0.08) 100%)',
}

const CACHE_PREFIX = 'insights_cache_v2:'

const SEVERITY: Record<Severity, { label: string; color: string; icon: LucideIcon }> = {
  critico: { label: 'Crítico', color: BRAND_COLORS.danger, icon: ShieldAlert },
  atencao: { label: 'Atenção', color: BRAND_COLORS.warning, icon: TriangleAlert },
  positivo: { label: 'Ponto forte', color: BRAND_COLORS.success, icon: CircleCheck },
  info: { label: 'Contexto', color: AI.blue, icon: Info },
}

const MODULE: Record<InsightModule, { label: string; icon: LucideIcon }> = {
  hse: { label: 'Riscos psicossociais', icon: Activity },
  ietr: { label: 'Trabalho remoto', icon: Laptop },
  saude_mental: { label: 'Saúde mental', icon: Brain },
  adesao: { label: 'Adesão', icon: Users },
  geral: { label: 'Geral', icon: Layers },
}

const PRIORITY: Record<Priority, { label: string; color: string }> = {
  alta: { label: 'Prioridade alta', color: BRAND_COLORS.danger },
  media: { label: 'Prioridade média', color: BRAND_COLORS.warning },
  baixa: { label: 'Prioridade baixa', color: BRAND_COLORS.slate },
}

const HORIZONS: Array<{ id: Horizon; label: string; hint: string }> = [
  { id: 'imediato', label: 'Imediato', hint: 'próximos dias' },
  { id: '30_dias', label: '30 dias', hint: 'curto prazo' },
  { id: '90_dias', label: '90 dias', hint: 'estruturante' },
]

const OVERALL_RISK: Record<InsightsAnalysis['overall_risk'], { label: string; color: string; level: number }> = {
  baixo: { label: 'Risco baixo', color: BRAND_COLORS.success, level: 1 },
  moderado: { label: 'Risco moderado', color: BRAND_COLORS.warning, level: 2 },
  alto: { label: 'Risco alto', color: '#F2763A', level: 3 },
  critico: { label: 'Risco crítico', color: BRAND_COLORS.danger, level: 4 },
}

const LOADING_STEPS = [
  { label: 'Consolidando respostas e adesão', icon: Users },
  { label: 'Calculando correlações entre módulos', icon: GitCompareArrows },
  { label: 'Comparando grupos e segmentos', icon: Layers },
  { label: 'Redigindo achados e plano de ação', icon: Wand2 },
]

/** Destaca trechos entre **asteriscos** que o modelo eventualmente devolve. */
function RichText({ text, color }: { text: string; color: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return (
    <>
      {parts.map((part, i) => (/^\*\*[^*]+\*\*$/.test(part)
        ? <strong key={i} style={{ color, fontWeight: 600 }}>{part.slice(2, -2)}</strong>
        : <span key={i}>{part}</span>))}
    </>
  )
}

function Chip({ children, color, solid = false }: { children: React.ReactNode; color: string; solid?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: solid ? color : `${color}1F`, color: solid ? '#FFFFFF' : color }}
    >
      {children}
    </span>
  )
}

function AiOrb({ size = 44, spinning = false }: { size?: number; spinning?: boolean }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0 rounded-2xl"
        style={{ background: AI.gradient, filter: 'blur(10px)', opacity: 0.55 }}
        animate={{ opacity: spinning ? [0.35, 0.8, 0.35] : 0.55 }}
        transition={{ duration: 1.8, repeat: spinning ? Infinity : 0 }}
      />
      <div className="relative flex h-full w-full items-center justify-center rounded-2xl" style={{ background: AI.gradient }}>
        <motion.div animate={spinning ? { rotate: 360 } : { rotate: 0 }} transition={{ duration: 3, repeat: spinning ? Infinity : 0, ease: 'linear' }}>
          <Sparkles size={size * 0.45} color="#FFFFFF" strokeWidth={2.2} />
        </motion.div>
      </div>
    </div>
  )
}

// ─── Cabeçalho ───────────────────────────────────────────────────────────────

function Header({
  data, isSuperuser, loading, onGenerate, onCopy, copied,
}: {
  data: InsightsPayload | null
  isSuperuser: boolean
  loading: boolean
  onGenerate: () => void
  onCopy: () => void
  copied: boolean
}) {
  const T = useThemeTokens()
  const scope = data?.evidence.scope
  const filters = scope ? Object.entries(scope.filters) : []

  return (
    <div className="relative overflow-hidden rounded-2xl p-[1px]" style={{ background: AI.gradient }}>
      <div className="relative rounded-[15px] p-5 sm:p-6" style={{ backgroundColor: T.surface }}>
        <div className="pointer-events-none absolute inset-0" style={{ background: AI.gradientSoft }} />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <AiOrb spinning={loading} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold" style={{ color: T.text }}>Lumen AI · Insights</h2>
                <Chip color={AI.violet}>Beta</Chip>
              </div>
              <p className="mt-0.5 text-sm" style={{ color: T.textMuted }}>
                Leitura executiva, correlações entre módulos e plano de ação gerados a partir dos dados deste mapeamento.
              </p>
              {data && (
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: T.surface2, color: T.textMuted }}>
                    {new Date(data.generated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                  <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: T.surface2, color: T.textMuted }}>
                    {data.evidence.scope.total_answered} respostas analisadas
                  </span>
                  <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: T.surface2, color: T.textMuted }}>
                    {filters.length > 0 ? filters.map(([k, v]) => `${k}: ${v}`).join(' · ') : 'Toda a organização'}
                  </span>
                  <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: T.surface2, color: T.textFaint }}>
                    modelo {data.model}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {data && (
              <button
                type="button"
                onClick={onCopy}
                className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors"
                style={{ border: `1px solid ${T.border}`, color: T.textMuted, backgroundColor: T.surface }}
              >
                {copied ? <Check size={15} /> : <ClipboardCopy size={15} />}
                {copied ? 'Copiado' : 'Copiar resumo'}
              </button>
            )}
            {isSuperuser && (
              <motion.button
                type="button"
                onClick={onGenerate}
                disabled={loading}
                whileHover={loading ? undefined : { y: -1 }}
                whileTap={loading ? undefined : { scale: 0.98 }}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                style={{
                  background: AI.gradient,
                  boxShadow: loading ? 'none' : '0 6px 20px rgba(66,133,244,0.35)',
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                <Sparkles size={15} />
                {loading ? 'Analisando…' : data ? 'Atualizar análise' : 'Gerar análise'}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Estados ─────────────────────────────────────────────────────────────────

function LoadingState() {
  const T = useThemeTokens()
  const [step, setStep] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 6500)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="rounded-2xl p-5" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide" style={{ color: AI.violet }}>Processando</p>
        <ol className="flex flex-col gap-3.5">
          {LOADING_STEPS.map((s, i) => {
            const done = i < step
            const active = i === step
            const Icon = s.icon
            return (
              <li key={s.label} className="flex items-center gap-3">
                <span
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: done || active ? AI.gradient : T.surface2,
                    color: done || active ? '#FFFFFF' : T.textFaint,
                    opacity: active ? 1 : done ? 0.85 : 1,
                  }}
                >
                  {done ? <Check size={15} /> : (
                    <motion.span animate={active ? { scale: [1, 1.15, 1] } : {}} transition={{ duration: 1.2, repeat: Infinity }}>
                      <Icon size={15} />
                    </motion.span>
                  )}
                </span>
                <span className="text-sm" style={{ color: active ? T.text : done ? T.textMuted : T.textFaint, fontWeight: active ? 600 : 400 }}>
                  {s.label}{active && '…'}
                </span>
              </li>
            )
          })}
        </ol>
        <p className="mt-5 text-xs" style={{ color: T.textFaint }}>Costuma levar de 20 a 40 segundos.</p>
      </div>
      <div className="flex flex-col gap-3">
        {[90, 70, 82, 60].map((w, i) => (
          <div key={i} className="overflow-hidden rounded-2xl p-5" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
            <div className="mb-3 h-3 w-1/3 rounded-full" style={{ background: T.skeleton }} />
            <div
              className="h-2.5 rounded-full"
              style={{
                width: `${w}%`,
                background: `linear-gradient(90deg, ${T.skeleton} 25%, ${T.skeletonShine} 50%, ${T.skeleton} 75%)`,
                backgroundSize: '600px 100%',
                animation: 'insightsShimmer 1.6s infinite linear',
                animationDelay: `${i * 120}ms`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ isSuperuser }: { isSuperuser: boolean }) {
  const T = useThemeTokens()
  const features = [
    { icon: Target, title: 'Resumo executivo', text: 'O estado do mapeamento em uma leitura, com nível de risco geral.' },
    { icon: GitCompareArrows, title: 'Correlações', text: 'Como riscos do trabalho se conectam a saúde mental, remoto e apoio.' },
    { icon: Layers, title: 'Grupos críticos', text: 'Segmentos da sua base que pedem atenção por risco ou adesão.' },
    { icon: ListChecks, title: 'Plano de ação', text: 'Ações por prazo e plano por área alinhado à ISO 45003.' },
  ]
  return (
    <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: T.surface, border: `1px dashed ${T.border}` }}>
      <p className="text-center text-sm" style={{ color: T.textMuted }}>
        {isSuperuser
          ? <>Clique em <strong style={{ color: T.text }}>Gerar análise</strong> para a Lumen AI ler os dados do recorte atual (os filtros do topo são respeitados).</>
          : <>Nenhuma análise gerada nesta sessão. Um superuser pode gerar a análise.</>}
      </p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="rounded-xl p-4"
            style={{ background: AI.gradientSoft, border: `1px solid ${T.border}` }}
          >
            <f.icon size={18} style={{ color: AI.violet }} />
            <p className="mt-2 text-sm font-semibold" style={{ color: T.text }}>{f.title}</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: T.textMuted }}>{f.text}</p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ─── Blocos da análise ───────────────────────────────────────────────────────

function ExecutiveSummary({ data }: { data: InsightsPayload }) {
  const T = useThemeTokens()
  const a = data.analysis
  const h = data.evidence.highlights
  const risk = OVERALL_RISK[a.overall_risk] ?? OVERALL_RISK.moderado

  const kpis = [
    { label: 'Adesão', value: `${fmtNumber(h.completion_pct, 0)}%`, sub: `${h.total_responses}/${h.total_expected}` },
    h.hse ? { label: 'Índice HSE', value: fmtNumber(h.hse.avg_score, 2), sub: h.hse.classification ?? '', color: classColor(h.hse.classification) } : null,
    h.mental_health ? { label: 'Saúde mental', value: fmtNumber(h.mental_health.avg_index, 1), sub: h.mental_health.classification ?? '', color: classColor(h.mental_health.classification) } : null,
    h.remote && h.remote.respondents > 0 ? { label: 'IETR', value: fmtNumber(h.remote.avg_score, 2), sub: h.remote.classification ?? '', color: classColor(h.remote.classification) } : null,
    h.mental_health ? { label: 'Risco de suicídio', value: String(h.mental_health.suicide_at_risk), sub: `${fmtNumber(h.mental_health.suicide_pct)}% dos respondentes`, color: h.mental_health.suicide_at_risk > 0 ? BRAND_COLORS.danger : undefined } : null,
  ].filter((k): k is NonNullable<typeof k> => k !== null)

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl"
      style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="p-6">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: AI.violet }}>
            <Sparkles size={13} /> Resumo executivo
          </p>
          <h3 className="mt-2 text-xl font-semibold leading-snug sm:text-2xl" style={{ color: T.text }}>{a.headline}</h3>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: T.textMuted }}><RichText text={a.executive_summary} color={T.text} /></p>
        </div>
        <div className="flex flex-col justify-center gap-3 p-6 lg:border-l" style={{ borderColor: T.border, background: `${risk.color}0D` }}>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: T.textFaint }}>Nível de risco geral</p>
          <p className="text-2xl font-bold" style={{ color: risk.color }}>{risk.label}</p>
          <div className="flex gap-1" aria-hidden>
            {[1, 2, 3, 4].map((lvl) => (
              <motion.div
                key={lvl}
                className="h-2 flex-1 rounded-full"
                initial={{ opacity: 0.2 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 * lvl }}
                style={{ backgroundColor: lvl <= risk.level ? risk.color : T.surface2 }}
              />
            ))}
          </div>
          <p className="text-[11px]" style={{ color: T.textFaint }}>Avaliação da IA considerando todos os módulos.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 border-t sm:grid-cols-3 lg:grid-cols-5" style={{ borderColor: T.border }}>
        {kpis.map((k, i) => (
          <div key={k.label} className="p-4" style={{ borderLeft: i > 0 ? `1px solid ${T.border}` : undefined }}>
            <p className="text-[11px] uppercase tracking-wide" style={{ color: T.textFaint }}>{k.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: k.color ?? T.text }}>{k.value}</p>
            <p className="text-xs" style={{ color: T.textMuted }}>{k.sub}</p>
          </div>
        ))}
      </div>
    </motion.section>
  )
}

function KeyFindings({ findings }: { findings: InsightsAnalysis['key_findings'] }) {
  const T = useThemeTokens()
  return (
    <Panel title="Principais achados" subtitle="Do mais ao menos grave, com o número que sustenta cada um" icon={Target} accent={AI.violet}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {findings.map((f, i) => {
          const sev = SEVERITY[f.severity] ?? SEVERITY.info
          const mod = MODULE[f.module] ?? MODULE.geral
          return (
            <motion.article
              key={`${f.title}-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              className="flex flex-col gap-2 rounded-xl p-4"
              style={{ backgroundColor: T.surface2, borderTop: `3px solid ${sev.color}` }}
            >
              <div className="flex items-center justify-between gap-2">
                <Chip color={sev.color}><sev.icon size={11} /> {sev.label}</Chip>
                <span className="flex items-center gap-1 text-[11px]" style={{ color: T.textFaint }}><mod.icon size={11} /> {mod.label}</span>
              </div>
              <p className="text-sm font-semibold leading-snug" style={{ color: T.text }}>{f.title}</p>
              <p className="text-lg font-bold tabular-nums leading-tight" style={{ color: sev.color }}>{f.evidence}</p>
              <p className="text-xs leading-relaxed" style={{ color: T.textMuted }}><RichText text={f.detail} color={T.text} /></p>
            </motion.article>
          )
        })}
      </div>
    </Panel>
  )
}

/** Barra divergente de −1 a +1 para o coeficiente de Pearson. */
function CorrelationBar({ r }: { r: number }) {
  const T = useThemeTokens()
  const width = Math.min(1, Math.abs(r)) * 50
  const color = Math.abs(r) >= 0.3 ? AI.violet : BRAND_COLORS.slate
  return (
    <div className="relative h-2 w-full rounded-full" style={{ backgroundColor: T.surface2 }} title={`r = ${fmtNumber(r, 2)}`}>
      <div className="absolute bottom-[-3px] top-[-3px] w-px" style={{ left: '50%', backgroundColor: T.textFaint }} />
      <motion.div
        className="absolute top-0 h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${width}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{ backgroundColor: color, ...(r < 0 ? { right: '50%' } : { left: '50%' }) }}
      />
    </div>
  )
}

function ComparisonBars({ c }: { c: ComparisonStat }) {
  const T = useThemeTokens()
  const max = c.scale.startsWith('0–4') ? 4 : 10
  return (
    <div className="flex flex-col gap-2">
      {[c.a, c.b].map((side, i) => (
        <div key={side.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate" style={{ color: T.textMuted }}>{side.label} <span style={{ color: T.textFaint }}>(n={side.n})</span></span>
            <span className="font-semibold tabular-nums" style={{ color: T.text }}>{fmtNumber(side.mean, 2)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: T.surface2 }}>
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(side.mean / max) * 100}%` }}
              transition={{ duration: 0.7 }}
              style={{ backgroundColor: i === 0 ? AI.violet : AI.teal }}
            />
          </div>
        </div>
      ))}
      <p className="text-[11px]" style={{ color: T.textFaint }}>{c.metric} · escala {c.scale}</p>
    </div>
  )
}

function Correlations({ data }: { data: InsightsPayload }) {
  const T = useThemeTokens()
  const corrById = new Map<string, CorrelationStat>(data.evidence.correlations.map((c) => [c.id, c]))
  const compById = new Map<string, ComparisonStat>(data.evidence.comparisons.map((c) => [c.id, c]))
  const featured = data.analysis.correlation_insights.filter((ci) => corrById.has(ci.correlation_id) || compById.has(ci.correlation_id))
  const [showAll, setShowAll] = useState(false)

  if (featured.length === 0 && data.evidence.correlations.length === 0) return null

  return (
    <Panel
      title="Conexões entre indicadores"
      subtitle="Correlações de Pearson e comparações calculadas sobre as respostas individuais — interpretadas pela IA"
      icon={GitCompareArrows}
      accent={AI.violet}
      action={data.evidence.correlations.length > 0 ? (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-medium" style={{ color: AI.blue }}>
          {showAll ? 'Ocultar matriz' : `Ver todas (${data.evidence.correlations.length})`}
        </button>
      ) : undefined}
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {featured.map((ci, i) => {
          const corr = corrById.get(ci.correlation_id)
          const comp = compById.get(ci.correlation_id)
          return (
            <motion.div
              key={ci.correlation_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              className="flex flex-col gap-3 rounded-xl p-4"
              style={{ backgroundColor: T.surface2 }}
            >
              {corr && (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold leading-snug" style={{ color: T.text }}>
                      {corr.x} <span style={{ color: T.textFaint }}>×</span> {corr.y}
                    </p>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-lg font-bold tabular-nums leading-none" style={{ color: AI.violet }}>r = {fmtNumber(corr.r, 2)}</p>
                      <p className="mt-1 text-[11px]" style={{ color: T.textFaint }}>{corr.strength} · n={corr.n}</p>
                    </div>
                  </div>
                  <CorrelationBar r={corr.r} />
                </>
              )}
              {comp && (
                <>
                  <p className="text-sm font-semibold leading-snug" style={{ color: T.text }}>
                    {comp.metric}: {comp.a.label.toLowerCase()} vs {comp.b.label.toLowerCase()}
                  </p>
                  <ComparisonBars c={comp} />
                </>
              )}
              <p className="text-xs leading-relaxed" style={{ color: T.textMuted }}><RichText text={ci.interpretation} color={T.text} /></p>
              <p className="flex items-start gap-1.5 text-xs font-medium leading-relaxed" style={{ color: T.text }}>
                <ArrowRight size={13} className="mt-0.5 flex-shrink-0" style={{ color: AI.teal }} />
                {ci.implication}
              </p>
            </motion.div>
          )
        })}
      </div>

      <AnimatePresence>
        {showAll && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: T.textFaint }}>
                    <th className="py-2 pr-2 font-medium">Variáveis</th>
                    <th className="w-48 py-2 pr-2 font-medium">−1 · 0 · +1</th>
                    <th className="py-2 pr-2 font-medium">r</th>
                    <th className="py-2 pr-2 font-medium">Força</th>
                    <th className="py-2 font-medium">n</th>
                  </tr>
                </thead>
                <tbody>
                  {data.evidence.correlations.map((c) => (
                    <tr key={c.id} className="border-t" style={{ borderColor: T.border }} title={c.reading}>
                      <td className="py-2 pr-2" style={{ color: T.text }}>{c.x} × {c.y}</td>
                      <td className="py-2 pr-2"><CorrelationBar r={c.r} /></td>
                      <td className="py-2 pr-2 font-semibold tabular-nums" style={{ color: T.text }}>{fmtNumber(c.r, 2)}</td>
                      <td className="py-2 pr-2 text-xs" style={{ color: T.textMuted }}>{c.strength}</td>
                      <td className="py-2 text-xs tabular-nums" style={{ color: T.textFaint }}>{c.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px]" style={{ color: T.textFaint }}>
                Passe o mouse sobre uma linha para ver a leitura. |r| &lt; 0,1 desprezível · &lt; 0,3 fraca · &lt; 0,5 moderada · ≥ 0,5 forte. Correlação indica associação, não causa.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  )
}

function ModuleAnalyses({ analyses }: { analyses: InsightsAnalysis['module_analyses'] }) {
  const T = useThemeTokens()
  const [active, setActive] = useState(analyses[0]?.module ?? 'geral')
  const current = analyses.find((m) => m.module === active) ?? analyses[0]
  if (!current) return null
  const mod = MODULE[current.module] ?? MODULE.geral

  return (
    <Panel
      title="Análise por módulo"
      subtitle="O que cada instrumento do mapeamento revela"
      icon={BookOpenCheck}
      action={<SegmentPills options={analyses.map((m) => ({ key: m.module, label: MODULE[m.module]?.label ?? m.module }))} value={current.module} onChange={(k) => setActive(k as InsightModule)} />}
    >
      <AnimatePresence mode="wait">
        <motion.div key={current.module} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: AI.gradientSoft, color: AI.violet }}>
              <mod.icon size={19} />
            </span>
            <p className="text-sm leading-relaxed" style={{ color: T.textMuted }}><RichText text={current.summary} color={T.text} /></p>
          </div>
          <ul className="flex flex-col gap-2">
            {current.highlights.map((item, i) => (
              <li key={i} className="flex gap-2 rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: T.surface2, color: T.text }}>
                <Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: AI.teal }} />
                <span><RichText text={item} color={T.text} /></span>
              </li>
            ))}
          </ul>
        </motion.div>
      </AnimatePresence>
    </Panel>
  )
}

function GroupsAtRisk({ groups }: { groups: InsightsAnalysis['groups_at_risk'] }) {
  const T = useThemeTokens()
  if (groups.length === 0) return null
  return (
    <Panel title="Grupos que merecem atenção" subtitle="Segmentos da base com risco elevado ou baixa participação" icon={Users} accent={BRAND_COLORS.warning}>
      <div className="flex flex-col gap-2.5">
        {groups.map((g, i) => {
          const sev = SEVERITY[g.severity] ?? SEVERITY.info
          return (
            <div key={`${g.segment}-${g.group}-${i}`} className="flex gap-3 rounded-xl p-3" style={{ backgroundColor: T.surface2, borderLeft: `3px solid ${sev.color}` }}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: T.text }}>{g.group}</span>
                  <span className="rounded-md px-1.5 py-0.5 text-[11px]" style={{ backgroundColor: T.surface, color: T.textMuted }}>{g.segment}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: T.textMuted }}><RichText text={g.reason} color={T.text} /></p>
              </div>
              <div className="flex-shrink-0 self-start"><Chip color={sev.color}>{sev.label}</Chip></div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function Recommendations({ items }: { items: InsightsAnalysis['recommendations'] }) {
  const T = useThemeTokens()
  return (
    <Panel title="Plano de ação recomendado" subtitle="Ações priorizadas por horizonte, com responsável sugerido" icon={CalendarClock} accent={AI.teal}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {HORIZONS.map((hz, col) => {
          const list = items.filter((r) => r.horizon === hz.id)
          return (
            <div key={hz.id} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: AI.gradient }}>{col + 1}</span>
                <span className="text-sm font-semibold" style={{ color: T.text }}>{hz.label}</span>
                <span className="text-xs" style={{ color: T.textFaint }}>· {hz.hint}</span>
                <span className="ml-auto text-xs tabular-nums" style={{ color: T.textFaint }}>{list.length}</span>
              </div>
              {list.length === 0 && <p className="text-xs" style={{ color: T.textFaint }}>Nenhuma ação neste horizonte.</p>}
              {list.map((r, i) => {
                const pr = PRIORITY[r.priority] ?? PRIORITY.media
                const mod = MODULE[r.module] ?? MODULE.geral
                return (
                  <motion.div
                    key={`${r.title}-${i}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 * i + col * 0.08 }}
                    className="flex flex-col gap-2 rounded-xl p-3.5"
                    style={{ backgroundColor: T.surface2, border: `1px solid ${T.border}` }}
                  >
                    <p className="text-sm font-semibold leading-snug" style={{ color: T.text }}>{r.title}</p>
                    <p className="text-xs leading-relaxed" style={{ color: T.textMuted }}><RichText text={r.description} color={T.text} /></p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip color={pr.color}>{pr.label}</Chip>
                      <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: T.surface, color: T.textMuted }}>{r.owner}</span>
                      <span className="flex items-center gap-1 text-[11px]" style={{ color: T.textFaint }}><mod.icon size={11} /> {mod.label}</span>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function IsoPlan({ plan }: { plan: InsightsAnalysis['iso45003_plan'] }) {
  const T = useThemeTokens()
  if (plan.length === 0) return null
  return (
    <Panel title="Plano por área · ISO 45003" subtitle="Fatores de risco e intervenções para as áreas prioritárias" icon={Gauge}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {plan.map((p, i) => {
          const pr = PRIORITY[p.priority] ?? PRIORITY.media
          return (
            <div key={`${p.area}-${i}`} className="rounded-xl p-4" style={{ backgroundColor: T.surface2 }}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold" style={{ color: T.text }}>{p.area}</p>
                <Chip color={pr.color}>{pr.label}</Chip>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: BRAND_COLORS.danger }}>Fatores de risco</p>
                  <ul className="flex flex-col gap-1">
                    {p.risk_factors.map((f, j) => (
                      <li key={j} className="flex gap-1.5 text-xs leading-relaxed" style={{ color: T.textMuted }}>
                        <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full" style={{ backgroundColor: BRAND_COLORS.danger }} />{f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: BRAND_COLORS.success }}>Intervenções</p>
                  <ul className="flex flex-col gap-1">
                    {p.interventions.map((f, j) => (
                      <li key={j} className="flex gap-1.5 text-xs leading-relaxed" style={{ color: T.textMuted }}>
                        <Check size={12} className="mt-0.5 flex-shrink-0" style={{ color: BRAND_COLORS.success }} />{f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function Methodology({ data }: { data: InsightsPayload }) {
  const T = useThemeTokens()
  return (
    <div className="rounded-2xl p-5" style={{ background: AI.gradientSoft, border: `1px solid ${T.border}` }}>
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: T.textMuted }}>
        <Info size={13} /> Como esta análise foi feita
      </p>
      <div className="grid grid-cols-1 gap-4 text-xs leading-relaxed md:grid-cols-2" style={{ color: T.textMuted }}>
        <ul className="flex flex-col gap-1.5">
          <li>• Todos os números, correlações e comparações são calculados pela plataforma diretamente das {data.evidence.scope.total_answered} respostas — a IA apenas interpreta.</li>
          <li>• Correlações exigem ao menos 10 respostas pareadas; comparações e segmentos, ao menos 5 pessoas por grupo.</li>
          <li>• Nenhum dado individual ou nominal é enviado ao modelo ({data.model}).</li>
        </ul>
        <ul className="flex flex-col gap-1.5">
          {data.analysis.caveats.map((c, i) => <li key={i}>• {c}</li>)}
          <li>• Conteúdo gerado por IA: revise com a equipe técnica antes de decisões.</li>
        </ul>
      </div>
    </div>
  )
}

function buildPlainSummary(data: InsightsPayload): string {
  const a = data.analysis
  return [
    `Lumen AI — Insights (${new Date(data.generated_at).toLocaleString('pt-BR')})`,
    '',
    a.headline,
    a.executive_summary.replaceAll('**', ''),
    '',
    'Principais achados:',
    ...a.key_findings.map((f) => `- ${f.title} (${f.evidence}): ${f.detail.replaceAll('**', '')}`),
    '',
    'Plano de ação:',
    ...HORIZONS.flatMap((hz) => a.recommendations.filter((r) => r.horizon === hz.id).map((r) => `- [${hz.label}] ${r.title} — ${r.owner}`)),
  ].join('\n')
}

// ─── Aba ─────────────────────────────────────────────────────────────────────

export default function InsightsTab({ query, isSuperuser }: Readonly<{ query: string; isSuperuser: boolean }>) {
  const [data, setData] = useState<InsightsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const cacheKey = useMemo(() => `${CACHE_PREFIX}${query}`, [query])

  // Cada recorte de filtros tem sua própria análise em cache na sessão.
  useEffect(() => {
    let cached: InsightsPayload | null = null
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const parsed = JSON.parse(raw) as InsightsPayload
        if (parsed?.version === 2) cached = parsed
      }
    } catch { /* storage indisponível */ }
    setData(cached)
    setError(null)
  }, [cacheKey])

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/insights' + (query ? '?' + query : ''))
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Erro ${res.status}`)
      setData(body as InsightsPayload)
      try { sessionStorage.setItem(cacheKey, JSON.stringify(body)) } catch { /* storage indisponível */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!data) return
    try {
      await navigator.clipboard.writeText(buildPlainSummary(data))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard indisponível */ }
  }

  return (
    <>
      <style>{`
        @keyframes insightsShimmer {
          0%   { background-position: -600px 0; }
          100% { background-position:  600px 0; }
        }
      `}</style>

      <div className="flex flex-col gap-5">
        <Header data={data} isSuperuser={isSuperuser} loading={loading} onGenerate={handleGenerate} onCopy={handleCopy} copied={copied} />

        {error && (
          <div className="flex items-start gap-2 rounded-xl p-4 text-sm" style={{ background: `${BRAND_COLORS.danger}12`, border: `1px solid ${BRAND_COLORS.danger}40`, color: BRAND_COLORS.danger }}>
            <TriangleAlert size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && <LoadingState />}
        {!loading && !data && !error && <EmptyState isSuperuser={isSuperuser} />}

        {!loading && data && (
          <>
            <ExecutiveSummary data={data} />
            <KeyFindings findings={data.analysis.key_findings} />
            <Correlations data={data} />
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <ModuleAnalyses analyses={data.analysis.module_analyses} />
              <GroupsAtRisk groups={data.analysis.groups_at_risk} />
            </div>
            <Recommendations items={data.analysis.recommendations} />
            <IsoPlan plan={data.analysis.iso45003_plan} />
            <Methodology data={data} />
          </>
        )}
      </div>
    </>
  )
}
