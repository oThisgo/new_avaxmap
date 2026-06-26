'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useTheme } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_ASSETS, BRAND_COLORS, BRAND_NAME } from '@/lib/brand'
import { HSE_QUESTIONS, HSE_SCALE_OPTIONS } from '@/lib/analytics/hse-definition'
import { IETR_QUESTIONS, IETR_SCALE_OPTIONS, type IetrQuestionDefinition } from '@/lib/analytics/ietr-definition'

type AnswerMap = Record<string, string>

type ModuleId = 'socio' | 'hse' | 'ietr'
type MobileModule = 'hse' | 'ietr'

interface SocioData {
  birth_date: string
  gender: string
  race_color: string
  marital_status: string
  education_level: string
  disability: string
  which_disability: string
  remote_status: string
}

interface FormThemeTokens {
  bg: string
  surface: string
  surface2: string
  border: string
  text: string
  textMuted: string
  textFaint: string
  inputBg: string
}

interface DropdownOption {
  value: string
  label: string
}

interface SubmitLikeEvent {
  preventDefault: () => void
}

type InteractiveField = HTMLInputElement | HTMLTextAreaElement

interface ScaleOptionsGridProps {
  options: readonly string[]
  questionCode: string
  selected: string | undefined
  disabled: boolean
  theme: FormThemeTokens
  onSelect: (questionCode: string, option: string) => void
}

interface CollapsibleModuleProps {
  id: ModuleId
  title: string
  subtitle: string
  isOpen: boolean
  onToggle: (moduleId: ModuleId) => void
  theme: FormThemeTokens
  children: React.ReactNode
}

const DOMAIN_ORDER = [
  'Demandas',
  'Controle',
  'Suporte',
  'Comunica\u00E7\u00E3o',
  'Papel',
  'Limites',
  'Ambiente',
  'Produtividade',
] as const

const DOMAIN_INTRO: Record<(typeof DOMAIN_ORDER)[number], string> = {
  Demandas: 'Carga e ritmo de trabalho no remoto.',
  Controle: 'Autonomia para organizar e executar atividades.',
  Suporte: 'Recursos e apoio para o trabalho remoto.',
  ['Comunica\u00E7\u00E3o']: 'Qualidade de alinhamento com a equipe.',
  Papel: 'Clareza de responsabilidades e expectativas.',
  Limites: 'Separação saudável entre trabalho e vida pessoal.',
  Ambiente: 'Condições físicas e interferências no local de trabalho.',
  Produtividade: 'Capacidade de manter entrega e foco no remoto.',
}

const GENDER_OPTIONS: readonly DropdownOption[] = [
  { value: 'Mulher', label: 'Mulher' },
  { value: 'Homem', label: 'Homem' },
  { value: 'Pessoa não-binária', label: 'Pessoa não-binária' },
  { value: 'Prefiro não informar', label: 'Prefiro não informar' },
]

const RACE_OPTIONS: readonly DropdownOption[] = [
  { value: 'Branca', label: 'Branca' },
  { value: 'Preta', label: 'Preta' },
  { value: 'Parda', label: 'Parda' },
  { value: 'Amarela', label: 'Amarela' },
  { value: 'Indígena', label: 'Indígena' },
  { value: 'Prefiro não informar', label: 'Prefiro não informar' },
]

const MARITAL_OPTIONS: readonly DropdownOption[] = [
  { value: 'Solteiro(a)', label: 'Solteiro(a)' },
  { value: 'Casado(a)', label: 'Casado(a)' },
  { value: 'União estável', label: 'União estável' },
  { value: 'Divorciado(a)', label: 'Divorciado(a)' },
  { value: 'Viúvo(a)', label: 'Viúvo(a)' },
  { value: 'Prefiro não informar', label: 'Prefiro não informar' },
]

const EDUCATION_OPTIONS: readonly DropdownOption[] = [
  { value: 'Ensino fundamental', label: 'Ensino fundamental' },
  { value: 'Ensino médio', label: 'Ensino médio' },
  { value: 'Ensino técnico', label: 'Ensino técnico' },
  { value: 'Ensino superior', label: 'Ensino superior' },
  { value: 'Pós-graduação', label: 'Pós-graduação' },
  { value: 'Mestrado/Doutorado', label: 'Mestrado/Doutorado' },
]

const DISABILITY_OPTIONS: readonly DropdownOption[] = [
  { value: 'Sim', label: 'Sim' },
  { value: 'Não', label: 'Não' },
]

const REMOTE_OPTIONS: readonly DropdownOption[] = [
  { value: 'Sim', label: 'Sim' },
  { value: 'Não', label: 'Não' },
]

const MOBILE_QUESTIONS_PER_PAGE = 4

function groupQuestionsByDomain() {
  const grouped = new Map<string, IetrQuestionDefinition[]>()
  for (const domain of DOMAIN_ORDER) grouped.set(domain, [])
  for (const question of IETR_QUESTIONS) {
    const current = grouped.get(question.domain)
    if (current) current.push(question)
  }
  return grouped
}

function getIetrQuestionNumber(
  domain: (typeof DOMAIN_ORDER)[number],
  index: number,
  groupedQuestions: Map<string, IetrQuestionDefinition[]>,
): number {
  const previousCount = DOMAIN_ORDER
    .slice(0, DOMAIN_ORDER.indexOf(domain))
    .reduce((sum, d) => sum + (groupedQuestions.get(d)?.length ?? 0), 0)

  return index + 1 + previousCount
}

function ScaleOptionsGrid({
  options,
  questionCode,
  selected,
  disabled,
  theme,
  onSelect,
}: Readonly<ScaleOptionsGridProps>) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
      {options.map((option) => {
        const active = selected === option
        return (
          <button
            key={`${questionCode}-${option}`}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            className="block rounded-lg border px-3 py-2 text-center text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => onSelect(questionCode, option)}
            onMouseEnter={(e) => {
              if (disabled || active) return
              e.currentTarget.style.borderColor = theme.textMuted
            }}
            onMouseLeave={(e) => {
              if (disabled || active) return
              e.currentTarget.style.borderColor = theme.border
            }}
            onFocus={(e) => {
              if (active) return
              e.currentTarget.style.borderColor = BRAND_COLORS.primary
            }}
            onBlur={(e) => {
              if (active) return
              e.currentTarget.style.borderColor = theme.border
            }}
            style={{
              borderColor: active ? BRAND_COLORS.primary : theme.border,
              backgroundColor: active ? `${BRAND_COLORS.primary}22` : theme.inputBg,
              color: active ? BRAND_COLORS.primary : theme.text,
            }}
          >
            <span
              className="block"
              style={{
                transform: active ? 'translateY(-1px)' : 'translateY(0)',
                transition: 'transform 0.15s ease',
              }}
            >
              {option}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function CustomDropdown({
  value,
  options,
  placeholder,
  disabled,
  theme,
  onChange,
}: Readonly<{
  value: string
  options: readonly DropdownOption[]
  placeholder: string
  disabled: boolean
  theme: FormThemeTokens
  onChange: (value: string) => void
}>) {
  const [open, setOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const selected = options.find((opt) => opt.value === value)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleOpenDropdown = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      })
    }
    setOpen(true)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={handleOpenDropdown}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          backgroundColor: theme.surface,
          border: `1px solid ${open ? BRAND_COLORS.primary : theme.border}`,
          color: selected ? theme.text : theme.textMuted,
        }}
        onMouseEnter={(e) => { if (!open && !disabled) e.currentTarget.style.borderColor = theme.textMuted }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = theme.border }}
        onFocus={(e) => { if (!disabled) e.currentTarget.style.borderColor = BRAND_COLORS.primary }}
        onBlur={(e) => { if (!open) e.currentTarget.style.borderColor = theme.border }}
      >
        <span className="truncate text-left">{selected?.label ?? placeholder}</span>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" style={{ opacity: 0.45, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
          <path d="M6 8L1 3h10z" />
        </svg>
      </button>

      {open && !disabled && (
        <div
          className="fixed max-h-[260px] overflow-y-auto rounded-xl py-1 shadow-xl z-50"
          style={{
            backgroundColor: theme.surface,
            border: `1px solid ${theme.border}`,
            top: `${dropdownPos.top}px`,
            left: `${dropdownPos.left}px`,
            width: `${dropdownPos.width}px`,
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors"
              style={{ color: opt.value === value ? BRAND_COLORS.primary : theme.text, fontWeight: opt.value === value ? 600 : 400 }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.surface2 }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <span className="truncate">{opt.label}</span>
              {opt.value === value && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={BRAND_COLORS.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CollapsibleModule({
  id,
  title,
  subtitle,
  isOpen,
  onToggle,
  theme,
  children,
}: Readonly<CollapsibleModuleProps>) {
  return (
    <section className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${theme.border}`, backgroundColor: theme.surface }}>
      <button
        type="button"
        className="w-full px-4 py-4 sm:px-6 sm:py-5 flex items-center justify-between gap-4 text-left transition-all"
        onClick={() => onToggle(id)}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.surface2 }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
        aria-expanded={isOpen}
        aria-controls={`module-content-${id}`}
      >
        <div>
          <h2 className="text-xl font-semibold" style={{ color: theme.text }}>{title}</h2>
          <p className="text-sm mt-1" style={{ color: theme.textFaint }}>{subtitle}</p>
        </div>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme.textMuted}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div
        id={`module-content-${id}`}
        style={{
          maxHeight: isOpen ? '10000px' : '0px',
          opacity: isOpen ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.55s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.4s ease-out',
        }}
      >
        <div className="px-4 pt-6 pb-4 sm:px-6 sm:pt-8 sm:pb-6">{children}</div>
      </div>
    </section>
  )
}

function chunkBy<T>(items: readonly T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks
}

interface IetrFormProps {
  thankYouPath?: string
}

export function IetrForm({ thankYouPath = '/agradecimento' }: Readonly<IetrFormProps>) {
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const T: FormThemeTokens = {
    bg: isDark ? BRAND_COLORS.darkBg : BRAND_COLORS.lightBg,
    surface: isDark ? BRAND_COLORS.darkSurface : BRAND_COLORS.lightSurface,
    surface2: isDark ? BRAND_COLORS.darkSurface2 : BRAND_COLORS.lightSurface2,
    border: isDark ? BRAND_COLORS.borderDark : BRAND_COLORS.borderLight,
    text: isDark ? BRAND_COLORS.textLight : BRAND_COLORS.textDark,
    textMuted: isDark ? BRAND_COLORS.textMutedDark : BRAND_COLORS.textMutedLight,
    textFaint: isDark ? BRAND_COLORS.textFaintDark : BRAND_COLORS.textFaintLight,
    inputBg: isDark ? BRAND_COLORS.darkSurface2 : BRAND_COLORS.lightSurface2,
  }

  const groupedQuestions = useMemo(() => groupQuestionsByDomain(), [])

  const [isMobile, setIsMobile] = useState(false)
  const [openModules, setOpenModules] = useState<Record<ModuleId, boolean>>({
    socio: false,
    hse: false,
    ietr: false,
  })

  const [mobileModule, setMobileModule] = useState<MobileModule>('hse')
  const [mobilePage, setMobilePage] = useState(0)

  const [socio, setSocio] = useState<SocioData>({
    birth_date: '',
    gender: '',
    race_color: '',
    marital_status: '',
    education_level: '',
    disability: '',
    which_disability: '',
    remote_status: '',
  })

  const [hseAnswers, setHseAnswers] = useState<AnswerMap>({})
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [jobObservations, setJobObservations] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const requiresIetr = !/^n[aã]o/i.test(socio.remote_status.trim())
  const effectiveIetrQuestions = requiresIetr ? IETR_QUESTIONS : []

  const totalQuestions = HSE_QUESTIONS.length + effectiveIetrQuestions.length
  const answeredCount = Object.keys(hseAnswers).length + Object.keys(answers).filter((key) => effectiveIetrQuestions.some((q) => q.code === key)).length
  const completionPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 100

  const unansweredHse = HSE_QUESTIONS.filter((q) => !hseAnswers[q.code])
  const unansweredIetr = effectiveIetrQuestions.filter((q) => !answers[q.code])

  const hsePages = useMemo(() => chunkBy(HSE_QUESTIONS, MOBILE_QUESTIONS_PER_PAGE), [])
  const ietrPages = useMemo(() => chunkBy(effectiveIetrQuestions, MOBILE_QUESTIONS_PER_PAGE), [effectiveIetrQuestions])

  const activeMobilePages = mobileModule === 'hse' ? hsePages : ietrPages
  const activeMobilePage = activeMobilePages[mobilePage] ?? []

  useEffect(() => {
    function updateMode() {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) {
        setMobileModule('hse')
        setMobilePage(0)
      }
    }

    updateMode()
    window.addEventListener('resize', updateMode)
    return () => window.removeEventListener('resize', updateMode)
  }, [])

  useEffect(() => {
    if (mobileModule === 'ietr' && ietrPages.length === 0) {
      setMobileModule('hse')
      setMobilePage(0)
      return
    }

    const maxPage = Math.max(activeMobilePages.length - 1, 0)
    if (mobilePage > maxPage) setMobilePage(maxPage)
  }, [mobileModule, ietrPages.length, activeMobilePages.length, mobilePage])

  function toggleModule(moduleId: ModuleId) {
    setOpenModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }))
  }

  function setSocioField(field: keyof SocioData, value: string) {
    setSocio((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'disability' && /^n[aã]o/i.test(value) ? { which_disability: '' } : {}),
    }))
  }

  function setHseAnswer(questionCode: string, rawValue: string) {
    setHseAnswers((prev) => ({ ...prev, [questionCode]: rawValue }))
  }

  function setAnswer(questionCode: string, rawValue: string) {
    setAnswers((prev) => ({ ...prev, [questionCode]: rawValue }))
  }

  function handleFieldMouseEnter(e: React.MouseEvent<InteractiveField>) {
    if (e.currentTarget === document.activeElement) return
    e.currentTarget.style.borderColor = T.textMuted
  }

  function handleFieldMouseLeave(e: React.MouseEvent<InteractiveField>) {
    if (e.currentTarget === document.activeElement) return
    e.currentTarget.style.borderColor = T.border
  }

  function handleFieldFocus(e: React.FocusEvent<InteractiveField>) {
    e.currentTarget.style.borderColor = BRAND_COLORS.primary
  }

  function handleFieldBlur(e: React.FocusEvent<InteractiveField>) {
    e.currentTarget.style.borderColor = T.border
  }

  async function handleSubmit(e: SubmitLikeEvent) {
    e.preventDefault()
    setError('')

    if (
      !socio.birth_date ||
      !socio.gender ||
      !socio.race_color ||
      !socio.marital_status ||
      !socio.education_level ||
      !socio.disability ||
      !socio.remote_status
    ) {
      setError('Preencha todos os campos sociodemográficos obrigatórios.')
      return
    }

    if (/^sim/i.test(socio.disability.trim()) && !socio.which_disability.trim()) {
      setError('Informe qual deficiência para continuar.')
      return
    }

    if (unansweredHse.length + unansweredIetr.length > 0) {
      setError(`Responda todas as questões obrigatórias antes de enviar. Faltam ${unansweredHse.length + unansweredIetr.length}.`)
      return
    }

    setIsSubmitting(true)

    try {
      const payload = {
        socio,
        hseAnswers: HSE_QUESTIONS.map((q) => ({ questionCode: q.code, rawValue: hseAnswers[q.code] })),
        ietrAnswers: IETR_QUESTIONS.map((q) => ({ questionCode: q.code, rawValue: answers[q.code] })),
        jobObservations: jobObservations.trim() || null,
      }

      const response = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Não foi possível enviar suas respostas.')
        return
      }

      router.push(thankYouPath)
    } catch {
      setError('Erro de conexão. Tente novamente em instantes.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    border: `1px solid ${T.border}`,
    backgroundColor: T.surface,
    color: T.text,
  }

  const questionCardStyle: React.CSSProperties = {
    border: `1px solid ${T.border}`,
    backgroundColor: T.inputBg,
  }

  const maxMobilePage = Math.max(activeMobilePages.length - 1, 0)

  function renderSocioFields() {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1.5 block" style={{ color: T.textMuted }}>Data de nascimento *</span>
          <input
            type="date"
            value={socio.birth_date}
            onChange={(e) => setSocioField('birth_date', e.target.value)}
            className="w-full rounded-lg px-3 py-2 outline-none transition-all"
            style={fieldStyle}
            disabled={isSubmitting}
            onMouseEnter={handleFieldMouseEnter}
            onMouseLeave={handleFieldMouseLeave}
            onFocus={handleFieldFocus}
            onBlur={handleFieldBlur}
          />
        </label>

        <label className="text-sm">
          <span className="mb-1.5 block" style={{ color: T.textMuted }}>Gênero *</span>
          <CustomDropdown
            value={socio.gender}
            options={GENDER_OPTIONS}
            placeholder="Selecione"
            disabled={isSubmitting}
            theme={T}
            onChange={(value) => setSocioField('gender', value)}
          />
        </label>

        <label className="text-sm">
          <span className="mb-1.5 block" style={{ color: T.textMuted }}>Raça/Cor *</span>
          <CustomDropdown
            value={socio.race_color}
            options={RACE_OPTIONS}
            placeholder="Selecione"
            disabled={isSubmitting}
            theme={T}
            onChange={(value) => setSocioField('race_color', value)}
          />
        </label>

        <label className="text-sm">
          <span className="mb-1.5 block" style={{ color: T.textMuted }}>Estado civil *</span>
          <CustomDropdown
            value={socio.marital_status}
            options={MARITAL_OPTIONS}
            placeholder="Selecione"
            disabled={isSubmitting}
            theme={T}
            onChange={(value) => setSocioField('marital_status', value)}
          />
        </label>

        <label className="text-sm">
          <span className="mb-1.5 block" style={{ color: T.textMuted }}>Escolaridade *</span>
          <CustomDropdown
            value={socio.education_level}
            options={EDUCATION_OPTIONS}
            placeholder="Selecione"
            disabled={isSubmitting}
            theme={T}
            onChange={(value) => setSocioField('education_level', value)}
          />
        </label>

        <label className="text-sm">
          <span className="mb-1.5 block" style={{ color: T.textMuted }}>Possui deficiência? *</span>
          <CustomDropdown
            value={socio.disability}
            options={DISABILITY_OPTIONS}
            placeholder="Selecione"
            disabled={isSubmitting}
            theme={T}
            onChange={(value) => setSocioField('disability', value)}
          />
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="mb-1.5 block" style={{ color: T.textMuted }}>
            Qual deficiência? {/^sim/i.test(socio.disability.trim()) ? '*' : '(opcional)'}
          </span>
          <input
            type="text"
            value={socio.which_disability}
            onChange={(e) => setSocioField('which_disability', e.target.value)}
            disabled={isSubmitting || /^n[aã]o/i.test(socio.disability.trim())}
            placeholder="Ex.: visual, auditiva, física, intelectual"
            className="w-full rounded-lg px-3 py-2 outline-none disabled:opacity-60 transition-all"
            style={fieldStyle}
            onMouseEnter={handleFieldMouseEnter}
            onMouseLeave={handleFieldMouseLeave}
            onFocus={handleFieldFocus}
            onBlur={handleFieldBlur}
          />
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="mb-1.5 block" style={{ color: T.textMuted }}>Você trabalha remotamente? *</span>
          <CustomDropdown
            value={socio.remote_status}
            options={REMOTE_OPTIONS}
            placeholder="Selecione"
            disabled={isSubmitting}
            theme={T}
            onChange={(value) => setSocioField('remote_status', value)}
          />
        </label>
      </div>
    )
  }

  function renderQuestionCard(questionCode: string, questionText: string, scaleOptions: readonly string[], selected: string | undefined, onSelect: (code: string, value: string) => void) {
    const displayNum = questionCode.replace(/^[^0-9]+/, '')
    return (
      <div key={questionCode} className="rounded-xl p-4 sm:p-5" style={questionCardStyle}>
        <p className="mb-4 text-base font-medium leading-relaxed sm:text-lg" style={{ color: T.text }}>
          {displayNum}. {questionText}
        </p>
        <ScaleOptionsGrid options={scaleOptions} questionCode={questionCode} selected={selected} disabled={isSubmitting} theme={T} onSelect={onSelect} />
      </div>
    )
  }

  function renderDesktopModules() {
    return (
      <>
        <CollapsibleModule
          id="socio"
          title="Dados sociodemográficos"
          subtitle="Dados para análises agregadas por perfil"
          isOpen={openModules.socio}
          onToggle={toggleModule}
          theme={T}
        >
          {renderSocioFields()}
        </CollapsibleModule>

        <CollapsibleModule
          id="hse"
          title="Módulo HSE"
          subtitle="Questões sobre o ambiente de trabalho em geral"
          isOpen={openModules.hse}
          onToggle={toggleModule}
          theme={T}
        >
          <div className="space-y-6">
            {HSE_QUESTIONS.map((question) => renderQuestionCard(question.code, question.text, HSE_SCALE_OPTIONS, hseAnswers[question.code], setHseAnswer))}
          </div>
        </CollapsibleModule>

        <CollapsibleModule
          id="ietr"
          title="Módulo IETR"
          subtitle="Questões sobre experiência de trabalho remoto"
          isOpen={openModules.ietr}
          onToggle={toggleModule}
          theme={T}
        >
          {!requiresIetr && (
            <p className="rounded-lg px-4 py-3 text-sm mb-6" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2, color: T.textMuted }}>
              Você informou que não trabalha remotamente. O módulo IETR será considerado opcional nesta submissão.
            </p>
          )}

          {requiresIetr && (
            <div className="space-y-6">
              {IETR_QUESTIONS.map((question, index) =>
                renderQuestionCard(String(index + 1).padStart(2, '0'), question.text, IETR_SCALE_OPTIONS, answers[question.code], (_, value) => setAnswer(question.code, value))
              )}
            </div>
          )}
        </CollapsibleModule>
      </>
    )
  }

  function renderMobileQuestionCard() {
    if (activeMobilePage.length === 0) {
      if (mobileModule === 'ietr') {
        return (
          <p className="rounded-lg px-4 py-3 text-sm" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2, color: T.textMuted }}>
            Você informou que não trabalha remotamente. O módulo IETR é opcional nesta submissão.
          </p>
        )
      }
      return null
    }

    return (
      <div className="space-y-4">
        {mobileModule === 'hse'
          ? activeMobilePage.map((question) => {
              const h = question as (typeof HSE_QUESTIONS)[number]
              return renderQuestionCard(h.code, h.text, HSE_SCALE_OPTIONS, hseAnswers[h.code], setHseAnswer)
            })
          : activeMobilePage.map((question) => {
              const q = question as IetrQuestionDefinition
              const idx = IETR_QUESTIONS.findIndex((x) => x.code === q.code)
              const num = String(idx + 1).padStart(2, '0')
              return renderQuestionCard(num, q.text, IETR_SCALE_OPTIONS, answers[q.code], (_, value) => setAnswer(q.code, value))
            })}
      </div>
    )
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: T.bg, color: T.text }}>
      <div className="fixed top-0 left-0 right-0 z-50" style={{ backgroundColor: isDark ? 'rgba(17,17,17,0.92)' : 'rgba(248,250,251,0.92)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${T.border}` }}>
        <div className="mx-auto w-full max-w-5xl px-4 py-2 sm:px-6 lg:px-8">
          <div className="mb-1 flex items-center justify-between text-xs" style={{ color: T.textMuted }}>
            <span>Progresso geral</span>
            <span>{completionPct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: T.surface2 }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${completionPct}%`, backgroundColor: BRAND_COLORS.primary }} />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 pb-48 pt-16 sm:px-6 lg:px-8">
        <div className="mb-4 flex justify-end">
          <ThemeToggle />
        </div>

        <header className="mb-8 flex flex-col gap-5">
          <div className="flex items-center justify-center sm:justify-start">
            <div className="h-24 w-24 overflow-hidden rounded-full p-4 shadow-sm" style={{ backgroundColor: BRAND_COLORS.primary }}>
              <Image src={BRAND_ASSETS.symbol} alt={BRAND_NAME} width={96} height={96} className="h-full w-full object-contain" style={{ height: '100%' }} />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold leading-tight sm:text-4xl">Pesquisa de mapeamento psicossocial</h1>
            <p className="max-w-3xl text-sm sm:text-base" style={{ color: T.textMuted }}>
              Responda considerando sua experiência de trabalho. Não existe resposta certa ou errada:
              marque a opção que melhor representa sua percepção atual.
            </p>
          </div>
        </header>

        <form id="ietr-form" onSubmit={handleSubmit} className="space-y-6">
          {isMobile ? (
            <>
              <section className="rounded-2xl p-4 sm:p-6" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
                <div className="mb-5 space-y-1">
                  <h2 className="text-xl font-semibold" style={{ color: T.text }}>Dados sociodemográficos</h2>
                  <p className="text-sm" style={{ color: T.textFaint }}>Esses dados serão usados para análises agregadas por perfil.</p>
                </div>
                {renderSocioFields()}
              </section>

              <section className="rounded-2xl p-4 sm:p-6" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
                <div className="mb-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setMobileModule('hse'); setMobilePage(0) }}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
                    style={{
                      border: `1px solid ${mobileModule === 'hse' ? BRAND_COLORS.primary : T.border}`,
                      backgroundColor: mobileModule === 'hse' ? `${BRAND_COLORS.primary}22` : T.surface,
                      color: mobileModule === 'hse' ? BRAND_COLORS.primary : T.textMuted,
                    }}
                  >
                    HSE
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMobileModule('ietr'); setMobilePage(0) }}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
                    style={{
                      border: `1px solid ${mobileModule === 'ietr' ? BRAND_COLORS.primary : T.border}`,
                      backgroundColor: mobileModule === 'ietr' ? `${BRAND_COLORS.primary}22` : T.surface,
                      color: mobileModule === 'ietr' ? BRAND_COLORS.primary : T.textMuted,
                      opacity: requiresIetr ? 1 : 0.7,
                    }}
                  >
                    IETR
                  </button>
                </div>

                <div className="mb-4 flex items-center justify-between text-sm" style={{ color: T.textMuted }}>
                  <span>{mobileModule === 'hse' ? 'Módulo HSE' : 'Módulo IETR'}</span>
                  <span>Página {activeMobilePages.length === 0 ? 1 : mobilePage + 1} de {Math.max(activeMobilePages.length, 1)}</span>
                </div>

                {renderMobileQuestionCard()}

                <div className="mt-5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={mobilePage === 0}
                    onClick={() => setMobilePage((p) => Math.max(0, p - 1))}
                    className="rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ border: `1px solid ${T.border}`, color: T.textMuted, backgroundColor: T.surface }}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={mobilePage >= maxMobilePage}
                    onClick={() => setMobilePage((p) => Math.min(maxMobilePage, p + 1))}
                    className="rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ border: `1px solid ${T.border}`, color: T.textMuted, backgroundColor: T.surface }}
                  >
                    Próxima
                  </button>
                </div>
              </section>
            </>
          ) : (
            renderDesktopModules()
          )}

          <section className="rounded-2xl p-4 sm:p-6" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <label htmlFor="job_observations" className="mb-2 block text-sm font-medium" style={{ color: T.text }}>
              Observações sobre o trabalho remoto (opcional)
            </label>
            <textarea
              id="job_observations"
              value={jobObservations}
              onChange={(e) => setJobObservations(e.target.value)}
              rows={4}
              maxLength={1500}
              disabled={isSubmitting}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
              style={fieldStyle}
              placeholder="Se quiser, descreva pontos que não apareceram nas questões acima."
              onMouseEnter={handleFieldMouseEnter}
              onMouseLeave={handleFieldMouseLeave}
              onFocus={handleFieldFocus}
              onBlur={handleFieldBlur}
            />
          </section>

          {error && <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}
        </form>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40" style={{ borderTop: `1px solid ${T.border}`, backgroundColor: isDark ? 'rgba(17,17,17,0.95)' : 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }}>
        <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
          <button
            type="submit"
            form="ietr-form"
            disabled={isSubmitting}
            className="w-full rounded-lg px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: BRAND_COLORS.primary }}
            onMouseEnter={(e) => { if (!isSubmitting) e.currentTarget.style.backgroundColor = BRAND_COLORS.primaryHover }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = BRAND_COLORS.primary }}
          >
            {isSubmitting ? 'Enviando respostas...' : 'Enviar respostas'}
          </button>
          <p className="mt-2 text-center text-xs" style={{ color: T.textFaint }}>As respostas são analisadas apenas de forma agregada.</p>
        </div>
      </div>
    </main>
  )
}


