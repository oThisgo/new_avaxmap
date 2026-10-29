'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ArrowDown, ArrowUp, Building2, Check, ChevronDown, FileText, Filter, ImagePlus, Layers,
  LayoutList, ShieldCheck, Trash2, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { BRAND_COLORS } from '@/lib/brand'
import { useThemeTokens } from '@/lib/theme'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'

/* ─── Contrato com GET /api/dashboard/report-risk ─────────────────────────── */

type SectionKey =
  | 'abertura' | 'contexto' | 'participacao' | 'riscos' | 'estratificada' | 'ietr'
  | 'saude_mental' | 'associativa' | 'classificacao' | 'recomendacoes' | 'plano' | 'encerramento'

interface FieldMeta {
  key: string
  label: string
  isDashboardFilter: boolean
  categories: Array<{ name: string; total: number; answered: number }>
}

interface OptionsMeta {
  mappingName: string
  defaultClientName: string
  hasLogo: boolean
  logo: string | null
  modules: string[]
  fields: FieldMeta[]
  hseDomains: string[]
  totals: { collaborators: number; answered: number }
  availableSections: SectionKey[]
  defaultTechnicalResponsibles: string[]
}

interface Props {
  /** Filtros ativos no dashboard — pré-preenchem o recorte da base. */
  filters: Record<string, string>
  onClose: () => void
}

/* ─── Catálogos da tela ───────────────────────────────────────────────────── */

const SECTION_INFO: Record<SectionKey, { label: string; description: string }> = {
  abertura: { label: 'Abertura', description: 'Capa, introdução, agenda e sumário executivo.' },
  contexto: { label: 'Contexto & Método', description: 'NR-1, ISO 45003, lógica do índice e método de avaliação.' },
  participacao: { label: 'Participação e Perfil', description: 'Adesão por estrato, perfil demográfico e gênero por estrato.' },
  riscos: { label: 'Mapeamento de Riscos', description: 'Índice HSE geral, classificações, narrativa e mapa de domínios.' },
  estratificada: { label: 'Análise Estratificada', description: 'Distribuição de risco e heatmap de domínios por estrato.' },
  ietr: { label: 'Trabalho Remoto (IETR)', description: 'Resultados do IETR e análise por estrato.' },
  saude_mental: { label: 'Saúde Mental', description: 'Índice, estresse, depressão, risco de suicídio, hábitos, clima e percepção.' },
  associativa: { label: 'Análises Preditivas e Associativas', description: 'Correlações (Spearman) entre domínios/itens HSE e desfechos de saúde mental.' },
  classificacao: { label: 'Classificação de Riscos', description: 'Severidade, medidas de controle e Matriz de Risco Ocupacional (F × S / C).' },
  recomendacoes: { label: 'Recomendações', description: 'Grupos e domínios prioritários e próximos passos.' },
  plano: { label: 'Plano de Ação', description: 'Roadmap, playbooks por nível, governança, NR-1 e integração ao PGR.' },
  encerramento: { label: 'Encerramento', description: 'Slide de fechamento.' },
}

const PRESETS: Array<{ id: string; label: string; sections: SectionKey[] }> = [
  { id: 'completo', label: 'Completo', sections: Object.keys(SECTION_INFO) as SectionKey[] },
  { id: 'executivo', label: 'Executivo', sections: ['abertura', 'participacao', 'riscos', 'saude_mental', 'recomendacoes', 'encerramento'] },
  { id: 'pgr', label: 'Técnico (PGR)', sections: ['abertura', 'contexto', 'riscos', 'estratificada', 'classificacao', 'plano', 'encerramento'] },
]

const CONTROL_LEVELS = [
  { min: 81, label: 'Excelente', color: BRAND_COLORS.success },
  { min: 61, label: 'Adequado', color: BRAND_COLORS.primary },
  { min: 41, label: 'Intermediário', color: BRAND_COLORS.warning },
  { min: 21, label: 'Vulnerável', color: '#F2874A' },
  { min: 0, label: 'Crítico', color: BRAND_COLORS.danger },
]
const controlLevel = (v: number) => CONTROL_LEVELS.find((l) => v >= l.min) ?? CONTROL_LEVELS[CONTROL_LEVELS.length - 1]

type TabId = 'identidade' | 'recorte' | 'estratos' | 'secoes' | 'classificacao'
const TABS: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: 'identidade', label: 'Identidade', icon: Building2 },
  { id: 'recorte', label: 'Recorte da base', icon: Filter },
  { id: 'estratos', label: 'Estratos e categorias', icon: Layers },
  { id: 'secoes', label: 'Seções', icon: LayoutList },
  { id: 'classificacao', label: 'Classificação de riscos', icon: ShieldCheck },
]

/* ─── Estado persistido ───────────────────────────────────────────────────── */

interface FormState {
  clientName: string
  clientDescription: string
  logoMode: 'mapping' | 'custom' | 'none'
  customLogo: string | null
  coverImage: string | null
  technicalResponsibles: string
  filters: Record<string, string[]>
  strata: string[]
  excludedCategories: Record<string, string[]>
  excludeOmittedFromBase: boolean
  minGroupSize: number
  sections: SectionKey[]
  controls: Record<string, number>
  controlNotes: Record<string, string>
  generalNote: string
}

const STORAGE_PREFIX = 'report-options-v2:'

function defaultState(meta: OptionsMeta, dashboardFilters: Record<string, string>): FormState {
  return {
    clientName: meta.defaultClientName,
    clientDescription: '',
    logoMode: meta.hasLogo ? 'mapping' : 'none',
    customLogo: null,
    coverImage: null,
    technicalResponsibles: meta.defaultTechnicalResponsibles.join('\n'),
    filters: Object.fromEntries(Object.entries(dashboardFilters).filter(([, v]) => v).map(([k, v]) => [k, [v]])),
    // Padrão: os filtros do dashboard (estratos da planilha da empresa); os demais campos
    // demográficos ficam disponíveis para marcar.
    strata: (meta.fields.some((f) => f.isDashboardFilter) ? meta.fields.filter((f) => f.isDashboardFilter) : meta.fields).map((f) => f.key),
    excludedCategories: {},
    excludeOmittedFromBase: false,
    minGroupSize: 5,
    sections: meta.availableSections,
    controls: Object.fromEntries(meta.hseDomains.map((d) => [d, 50])),
    controlNotes: {},
    generalNote: '',
  }
}

/** Restaura o que foi salvo, descartando campos/seções que não existem mais no mapeamento. */
function restoreState(meta: OptionsMeta, base: FormState, saved: Partial<FormState>): FormState {
  const fieldKeys = new Set(meta.fields.map((f) => f.key))
  const keepKeys = <T,>(obj: Record<string, T> | undefined) => Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => fieldKeys.has(k)))
  const strata = (saved.strata ?? base.strata).filter((k) => fieldKeys.has(k))
  return {
    ...base,
    ...saved,
    customLogo: saved.customLogo ?? null,
    coverImage: null,
    filters: base.filters,
    strata,
    excludedCategories: keepKeys(saved.excludedCategories),
    sections: (saved.sections ?? base.sections).filter((s) => meta.availableSections.includes(s)),
    controls: { ...base.controls, ...Object.fromEntries(Object.entries(saved.controls ?? {}).filter(([d]) => meta.hseDomains.includes(d))) },
  }
}

function readImage(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Use uma imagem PNG, JPEG ou WebP.'))
    if (file.size > maxBytes) return reject(new Error(`A imagem deve ter no máximo ${Math.round(maxBytes / 1024 / 1024)} MB.`))
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    reader.readAsDataURL(file)
  })
}

/* ─── Peças visuais ───────────────────────────────────────────────────────── */

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  const T = useThemeTokens()
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold" style={{ color: T.text }}>{title}</h3>
      {hint && <p className="mt-0.5 text-xs leading-relaxed" style={{ color: T.textFaint }}>{hint}</p>}
    </div>
  )
}

function CategoryChip({ active, label, count, onClick, tone = 'include' }: {
  active: boolean
  label: string
  count?: string
  onClick: () => void
  tone?: 'include' | 'omit'
}) {
  const T = useThemeTokens()
  const color = tone === 'omit' ? BRAND_COLORS.danger : BRAND_COLORS.primary
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
      style={{
        backgroundColor: active ? `${color}1F` : T.surface2,
        color: active ? color : T.textMuted,
        border: `1px solid ${active ? `${color}66` : 'transparent'}`,
        textDecoration: tone === 'omit' && active ? 'line-through' : undefined,
      }}
    >
      {active && (tone === 'omit' ? <X size={11} /> : <Check size={11} />)}
      {label}
      {count && <span className="tabular-nums" style={{ color: T.textFaint }}>{count}</span>}
    </button>
  )
}

function ImagePicker({ label, hint, value, onChange, onError, maxBytes }: {
  label: string
  hint: string
  value: string | null
  onChange: (v: string | null) => void
  onError: (msg: string) => void
  maxBytes: number
}) {
  const T = useThemeTokens()
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex h-16 w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl"
        style={{ border: `1.5px dashed ${T.border}`, backgroundColor: T.surface2 }}
      >
        {value
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={value} alt={label} className="h-full w-full object-contain p-1" />
          : <ImagePlus size={20} style={{ color: T.textFaint }} />}
      </button>
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: T.text }}>{label}</p>
        <p className="text-xs" style={{ color: T.textFaint }}>{hint}</p>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="mt-1 inline-flex items-center gap-1 text-xs" style={{ color: BRAND_COLORS.danger }}>
            <Trash2 size={12} /> Remover
          </button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          try { onChange(await readImage(file, maxBytes)) } catch (err) { onError(err instanceof Error ? err.message : 'Imagem inválida.') }
        }}
      />
    </div>
  )
}

/* ─── Modal ───────────────────────────────────────────────────────────────── */

export default function ReportRiskModal({ filters: dashboardFilters, onClose }: Props) {
  const T = useThemeTokens()
  const [meta, setMeta] = useState<OptionsMeta | null>(null)
  const [state, setState] = useState<FormState | null>(null)
  const [tab, setTab] = useState<TabId>('identidade')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/dashboard/report-risk')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? `Erro ${res.status}`)
        return body as OptionsMeta
      })
      .then((m) => {
        if (!active) return
        const base = defaultState(m, dashboardFilters)
        let restored = base
        try {
          const raw = localStorage.getItem(STORAGE_PREFIX + m.mappingName)
          if (raw) restored = restoreState(m, base, JSON.parse(raw) as Partial<FormState>)
        } catch { /* armazenamento indisponível */ }
        setMeta(m)
        setState(restored)
      })
      .catch((err) => { if (active) setLoadError(err instanceof Error ? err.message : 'Erro ao carregar opções.') })
    return () => { active = false }
  }, [dashboardFilters])

  useEffect(() => {
    if (!meta || !state) return
    try {
      // A imagem de capa fica fora do armazenamento (tamanho); a logo customizada entra.
      const { coverImage: _cover, ...persist } = state
      void _cover
      localStorage.setItem(STORAGE_PREFIX + meta.mappingName, JSON.stringify(persist))
    } catch { /* armazenamento indisponível */ }
  }, [meta, state])

  const fieldByKey = useMemo(() => new Map((meta?.fields ?? []).map((f) => [f.key, f])), [meta])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((s) => (s ? { ...s, [key]: value } : s))

  function toggleInList(list: string[], value: string) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  }

  const activeFilterCount = state ? Object.values(state.filters).filter((v) => v.length > 0).length : 0
  const omittedCount = state ? Object.values(state.excludedCategories).reduce((s, v) => s + v.length, 0) : 0

  async function handleGenerate() {
    if (!state || !meta) return
    if (!state.clientName.trim()) {
      setTab('identidade')
      setError('Informe o nome do cliente.')
      return
    }
    if (state.sections.length === 0) {
      setTab('secoes')
      setError('Selecione ao menos uma seção.')
      return
    }
    setError(null)
    setGenerating(true)
    try {
      const res = await fetch('/api/dashboard/report-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: state.clientName.trim(),
          clientDescription: state.clientDescription.trim(),
          clientLogoBase64: state.logoMode === 'none' ? null : state.logoMode === 'custom' ? state.customLogo : undefined,
          coverImageBase64: state.coverImage,
          technicalResponsibles: state.technicalResponsibles.split('\n').map((v) => v.trim()).filter(Boolean),
          filters: Object.fromEntries(Object.entries(state.filters).filter(([, v]) => v.length > 0)),
          strata: state.strata,
          excludedCategories: state.excludedCategories,
          excludeOmittedFromBase: state.excludeOmittedFromBase,
          minGroupSize: state.minGroupSize,
          sections: state.sections,
          riskControlByDomain: state.controls,
          riskControlNotes: { general: state.generalNote, byDomain: state.controlNotes },
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `Erro ${res.status}`)
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `relatorio-riscos-${new Date().toISOString().slice(0, 10)}.pptx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar o relatório.')
    } finally {
      setGenerating(false)
    }
  }

  /* ── Conteúdo de cada aba ── */

  function renderIdentity(s: FormState, m: OptionsMeta) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <SectionTitle title="Cliente" hint="Aparece na capa, no rodapé de todos os slides e nos textos do relatório." />
          <div className="grid grid-cols-1 gap-3">
            <label className="text-sm">
              <span className="mb-1.5 block text-xs font-medium" style={{ color: T.textMuted }}>Nome do cliente *</span>
              <Input value={s.clientName} maxLength={80} onChange={(e) => update('clientName', e.target.value)} placeholder="Ex.: Empresa XPTO" />
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block text-xs font-medium" style={{ color: T.textMuted }}>Descrição / subtítulo (opcional)</span>
              <Textarea rows={2} maxLength={600} value={s.clientDescription} onChange={(e) => update('clientDescription', e.target.value)} placeholder="Ex.: Ciclo 2026 — unidades industriais e escritório central" />
            </label>
          </div>
        </div>

        <div>
          <SectionTitle title="Logo da capa" />
          <div className="mb-3 flex flex-wrap gap-2">
            {([
              { id: 'mapping', label: 'Logo do mapeamento', disabled: !m.hasLogo },
              { id: 'custom', label: 'Enviar outra logo', disabled: false },
              { id: 'none', label: 'Sem logo', disabled: false },
            ] as const).map((opt) => (
              <CategoryChip key={opt.id} active={s.logoMode === opt.id} label={opt.label + (opt.disabled ? ' (indisponível)' : '')} onClick={() => !opt.disabled && update('logoMode', opt.id)} />
            ))}
          </div>
          {s.logoMode === 'mapping' && m.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.logo} alt="Logo do mapeamento" className="h-14 w-auto rounded-lg p-1" style={{ backgroundColor: T.surface2 }} />
          )}
          {s.logoMode === 'custom' && (
            <ImagePicker label="Logo do cliente" hint="PNG com fundo transparente, até 2 MB." value={s.customLogo} onChange={(v) => update('customLogo', v)} onError={setError} maxBytes={2 * 1024 * 1024} />
          )}
        </div>

        <div>
          <SectionTitle title="Imagem da capa (opcional)" hint="Foto exibida na moldura da capa — ex.: fachada, equipe ou operação do cliente." />
          <ImagePicker label="Foto da capa" hint="JPEG ou PNG, até 3 MB." value={s.coverImage} onChange={(v) => update('coverImage', v)} onError={setError} maxBytes={3 * 1024 * 1024} />
        </div>

        <div>
          <SectionTitle title="Responsáveis técnicos" hint="Exibidos na seção de Classificação de Riscos. Uma pessoa por linha, com registro profissional." />
          <Textarea rows={3} value={s.technicalResponsibles} onChange={(e) => update('technicalResponsibles', e.target.value)} />
        </div>
      </div>
    )
  }

  function renderScope(s: FormState, m: OptionsMeta) {
    return (
      <div className="flex flex-col gap-5">
        <SectionTitle
          title="Considerar somente parte da base"
          hint="Selecione categorias para restringir o relatório a elas — ex.: uma unidade. Os demais estratos passam a mostrar apenas as categorias associadas ao recorte. Sem seleção, o campo não filtra."
        />
        {m.fields.map((field) => {
          const selected = s.filters[field.key] ?? []
          return (
            <div key={field.key} className="rounded-xl p-3.5" style={{ backgroundColor: T.surface2 }}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium" style={{ color: T.text }}>{field.label}</span>
                {selected.length > 0 && (
                  <button type="button" className="text-xs" style={{ color: BRAND_COLORS.primary }} onClick={() => update('filters', { ...s.filters, [field.key]: [] })}>
                    Limpar ({selected.length})
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {field.categories.map((c) => (
                  <CategoryChip
                    key={c.name}
                    active={selected.includes(c.name)}
                    label={c.name}
                    count={`${c.answered}/${c.total}`}
                    onClick={() => update('filters', { ...s.filters, [field.key]: toggleInList(selected, c.name) })}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderStrata(s: FormState) {
    const ordered = [...s.strata, ...(meta?.fields ?? []).map((f) => f.key).filter((k) => !s.strata.includes(k))]
    return (
      <div className="flex flex-col gap-5">
        <SectionTitle
          title="Estratos da análise"
          hint="Marque os estratos que entram nas análises por grupo e ordene-os. O primeiro é o estrato principal (matrizes de risco por grupo e leitura associativa). Expanda um estrato para omitir categorias."
        />
        <div className="flex flex-col gap-2">
          {ordered.map((key) => {
            const field = fieldByKey.get(key)
            if (!field) return null
            const enabled = s.strata.includes(key)
            const position = s.strata.indexOf(key)
            const omitted = s.excludedCategories[key] ?? []
            const isOpen = expanded === key
            const lockedByFilter = (s.filters[key] ?? []).length === 1
            return (
              <div key={key} className="rounded-xl" style={{ backgroundColor: T.surface2, opacity: enabled ? 1 : 0.7 }}>
                <div className="flex items-center gap-2 p-3">
                  <Checkbox checked={enabled} onChange={(v) => update('strata', v ? [...s.strata, key] : s.strata.filter((k) => k !== key))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: T.text }}>{field.label}</span>
                      {enabled && position === 0 && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${BRAND_COLORS.primary}1F`, color: BRAND_COLORS.primary }}>Principal</span>
                      )}
                      {omitted.length > 0 && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${BRAND_COLORS.danger}1A`, color: BRAND_COLORS.danger }}>{omitted.length} omitida(s)</span>
                      )}
                      {lockedByFilter && (
                        <span className="text-[11px]" style={{ color: T.textFaint }}>fixado pelo recorte — não estratifica</span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: T.textFaint }}>{field.categories.length} categorias</p>
                  </div>
                  {enabled && (
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label="Subir" disabled={position <= 0} className="rounded-md p-1.5 disabled:opacity-30" style={{ color: T.textMuted }}
                        onClick={() => { const next = [...s.strata]; [next[position - 1], next[position]] = [next[position], next[position - 1]]; update('strata', next) }}>
                        <ArrowUp size={15} />
                      </button>
                      <button type="button" aria-label="Descer" disabled={position >= s.strata.length - 1} className="rounded-md p-1.5 disabled:opacity-30" style={{ color: T.textMuted }}
                        onClick={() => { const next = [...s.strata]; [next[position + 1], next[position]] = [next[position], next[position + 1]]; update('strata', next) }}>
                        <ArrowDown size={15} />
                      </button>
                    </div>
                  )}
                  <button type="button" aria-label="Categorias" className="rounded-md p-1.5" style={{ color: T.textMuted }} onClick={() => setExpanded(isOpen ? null : key)}>
                    <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />
                  </button>
                </div>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-3 pb-3">
                        <p className="mb-2 text-xs" style={{ color: T.textFaint }}>Clique para omitir uma categoria das análises por grupo (respondentes/total entre parênteses).</p>
                        <div className="flex flex-wrap gap-1.5">
                          {field.categories.map((c) => (
                            <CategoryChip
                              key={c.name}
                              tone="omit"
                              active={omitted.includes(c.name)}
                              label={c.name}
                              count={`${c.answered}/${c.total}`}
                              onClick={() => update('excludedCategories', { ...s.excludedCategories, [key]: toggleInList(omitted, c.name) })}
                            />
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>

        <div className="rounded-xl p-3.5" style={{ border: `1px solid ${T.border}` }}>
          <Checkbox
            checked={s.excludeOmittedFromBase}
            onChange={(v) => update('excludeOmittedFromBase', v)}
            label={
              <span>
                <span className="font-medium">Remover da base quem pertence a categorias omitidas</span>
                <span className="block text-xs" style={{ color: T.textFaint }}>
                  Desligado: a categoria só some dos gráficos por grupo, e as pessoas continuam nos totais. Ligado: as pessoas saem de todo o relatório (ex.: excluir um tipo de vínculo).
                </span>
              </span>
            }
          />
        </div>

        <div className="rounded-xl p-3.5" style={{ border: `1px solid ${T.border}` }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: T.text }}>Tamanho mínimo de grupo</span>
            <span className="text-sm font-semibold tabular-nums" style={{ color: BRAND_COLORS.primary }}>{s.minGroupSize} respondentes</span>
          </div>
          <input type="range" min={5} max={30} step={1} value={s.minGroupSize} onChange={(e) => update('minGroupSize', Number(e.target.value))} className="w-full accent-[#1767F3]" />
          <p className="mt-1 text-xs" style={{ color: T.textFaint }}>Grupos menores ficam fora das análises de risco por estrato, preservando o anonimato (mínimo 5).</p>
        </div>
      </div>
    )
  }

  function renderSections(s: FormState, m: OptionsMeta) {
    return (
      <div className="flex flex-col gap-4">
        <SectionTitle title="Seções do relatório" hint="As seções aparecem na ordem abaixo e são numeradas automaticamente. Seções de módulos não usados neste mapeamento ficam indisponíveis." />
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.id} variant="outline" size="sm" onClick={() => update('sections', p.sections.filter((x) => m.availableSections.includes(x)))}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {(Object.keys(SECTION_INFO) as SectionKey[]).map((key) => {
            const available = m.availableSections.includes(key)
            const checked = s.sections.includes(key)
            return (
              <div key={key} className="rounded-xl p-3" style={{ backgroundColor: T.surface2, opacity: available ? 1 : 0.5 }}>
                <Checkbox
                  checked={checked && available}
                  disabled={!available}
                  onChange={(v) => update('sections', v ? [...s.sections, key] : s.sections.filter((x) => x !== key))}
                  label={
                    <span>
                      <span className="font-medium">{SECTION_INFO[key].label}</span>
                      <span className="block text-xs" style={{ color: T.textFaint }}>{available ? SECTION_INFO[key].description : 'Módulo não utilizado neste mapeamento.'}</span>
                    </span>
                  }
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderClassification(s: FormState, m: OptionsMeta) {
    if (m.hseDomains.length === 0) {
      return <p className="text-sm" style={{ color: T.textMuted }}>Este mapeamento não usa o módulo HSE — a Classificação de Riscos não se aplica.</p>
    }
    return (
      <div className="flex flex-col gap-5">
        <SectionTitle
          title="Nota de Controle (C) por domínio"
          hint="Maturidade das medidas de controle que a organização já possui para cada fator (0–100). Entra na Matriz de Risco Ocupacional: R = F × S / C. Controles mais maduros reduzem o risco final."
        />
        <div className="flex flex-col gap-2.5">
          {m.hseDomains.map((domain) => {
            const value = s.controls[domain] ?? 50
            const level = controlLevel(value)
            return (
              <div key={domain} className="rounded-xl p-3.5" style={{ backgroundColor: T.surface2 }}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: T.text }}>{domain}</span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${level.color}22`, color: level.color }}>{level.label}</span>
                    <span className="w-9 text-right text-sm font-semibold tabular-nums" style={{ color: T.text }}>{value}</span>
                  </span>
                </div>
                <input type="range" min={1} max={100} value={value} onChange={(e) => update('controls', { ...s.controls, [domain]: Number(e.target.value) })} className="w-full accent-[#1767F3]" />
                <Input
                  className="mt-2"
                  value={s.controlNotes[domain] ?? ''}
                  maxLength={600}
                  onChange={(e) => update('controlNotes', { ...s.controlNotes, [domain]: e.target.value })}
                  placeholder="Justificativa (opcional) — sem texto, o relatório usa a descrição do nível"
                />
              </div>
            )
          })}
        </div>
        <label className="text-sm">
          <span className="mb-1.5 block text-xs font-medium" style={{ color: T.textMuted }}>Justificativa geral (opcional)</span>
          <Textarea rows={3} maxLength={1200} value={s.generalNote} onChange={(e) => update('generalNote', e.target.value)} placeholder="Ex.: A empresa possui programa de saúde mental desde 2024, mas sem indicadores sistemáticos…" />
        </label>
      </div>
    )
  }

  /* ── Layout ── */

  return (
    <Modal open onClose={generating ? undefined : onClose} blocking={generating} className="max-w-5xl p-0 sm:p-0">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4 sm:px-6" style={{ borderColor: T.border }}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${BRAND_COLORS.primary}1A`, color: BRAND_COLORS.primary }}>
              <FileText size={20} />
            </span>
            <div>
              <h2 className="text-base font-semibold" style={{ color: T.text }}>Relatório de Riscos Psicossociais</h2>
              <p className="text-xs" style={{ color: T.textMuted }}>
                {meta ? `${meta.mappingName} · ${meta.totals.answered} de ${meta.totals.collaborators} responderam` : 'Carregando opções…'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={generating} className="rounded-lg p-1.5" style={{ color: T.textMuted }} aria-label="Fechar"><X size={18} /></button>
        </div>

        {loadError && <div className="m-5 rounded-xl p-4 text-sm" style={{ backgroundColor: `${BRAND_COLORS.danger}12`, color: BRAND_COLORS.danger }}>{loadError}</div>}
        {!loadError && (!meta || !state) && (
          <div className="flex flex-col gap-3 p-6">
            {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl" style={{ backgroundColor: T.surface2 }} />)}
          </div>
        )}

        {meta && state && (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <nav className="flex gap-1 overflow-x-auto border-b p-2 md:w-56 md:flex-shrink-0 md:flex-col md:border-b-0 md:border-r md:p-3" style={{ borderColor: T.border }}>
              {TABS.map((t) => {
                const active = tab === t.id
                const badge = t.id === 'recorte' ? activeFilterCount : t.id === 'estratos' ? omittedCount : t.id === 'secoes' ? state.sections.length : 0
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className="flex flex-shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors"
                    style={{ backgroundColor: active ? `${BRAND_COLORS.primary}14` : 'transparent', color: active ? BRAND_COLORS.primary : T.textMuted }}
                  >
                    <t.icon size={16} />
                    <span className="whitespace-nowrap">{t.label}</span>
                    {badge > 0 && <span className="ml-auto rounded-full px-1.5 text-[11px] tabular-nums" style={{ backgroundColor: T.surface2, color: T.textMuted }}>{badge}</span>}
                  </button>
                )
              })}
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6" style={{ maxHeight: '64vh' }}>
              <AnimatePresence mode="wait">
                <motion.div key={tab} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
                  {tab === 'identidade' && renderIdentity(state, meta)}
                  {tab === 'recorte' && renderScope(state, meta)}
                  {tab === 'estratos' && renderStrata(state)}
                  {tab === 'secoes' && renderSections(state, meta)}
                  {tab === 'classificacao' && renderClassification(state, meta)}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}

        {meta && state && (
          <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6" style={{ borderColor: T.border }}>
            <div className="min-w-0 text-xs" style={{ color: error ? BRAND_COLORS.danger : T.textFaint }}>
              {error ?? (
                <>
                  {state.sections.length} seções · {state.strata.length} estratos
                  {activeFilterCount > 0 && ` · recorte em ${activeFilterCount} campo(s)`}
                  {omittedCount > 0 && ` · ${omittedCount} categoria(s) omitida(s)`}
                  {generating && ' · gerando o arquivo, pode levar alguns segundos…'}
                </>
              )}
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <Button variant="outline" onClick={() => meta && setState(defaultState(meta, dashboardFilters))} disabled={generating}>Restaurar padrão</Button>
              <Button onClick={handleGenerate} loading={generating}>Gerar relatório (.pptx)</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
