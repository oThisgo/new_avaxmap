'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'motion/react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_ASSETS, BRAND_COLORS, BRAND_NAME } from '@/lib/brand'
import { useThemeTokens, type ThemeTokens } from '@/lib/theme'
import { Select, type SelectOption } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { AlertPresence } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/input'
import { HSE_QUESTIONS, HSE_SCALE_OPTIONS, HSE_CODES, type HseQuestionDefinition } from '@/lib/analytics/hse-definition'
import { IETR_QUESTIONS, IETR_SCALE_OPTIONS, IETR_CODES, type IetrQuestionDefinition } from '@/lib/analytics/ietr-definition'
import {
  MENTAL_HEALTH_CODES,
  MENTAL_HEALTH_QUESTIONS,
  type MentalHealthQuestion,
} from '@/lib/analytics/mental-health-definition'
import {
  createEmptyMentalHealthAnswers,
  type MentalHealthAnswers,
} from '@/lib/analytics/mental-health'
import {
  MentalHealthModule,
  countMentalHealthRequired,
  getMentalHealthPending,
  type MentalHealthNoneState,
} from '@/components/forms/MentalHealthModule'
import type { MappingModuleKey } from '@/lib/mapping/config'
import { applyQuestionOverrides } from '@/lib/mapping/question-overrides'

type AnswerMap = Record<string, string>

type ModuleId = 'socio' | 'hse' | 'ietr' | 'saude_mental'
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

type FormThemeTokens = ThemeTokens
type DropdownOption = SelectOption

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
          <motion.button
            key={`${questionCode}-${option}`}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            whileTap={disabled ? undefined : { scale: 0.94 }}
            animate={active ? { scale: [1, 1.05, 1] } : { scale: 1 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="block min-h-[44px] rounded-lg border px-3 py-2.5 text-center text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
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
            <span className="block">{option}</span>
          </motion.button>
        )
      })}
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
  mappingSlug?: string
}

type MappingRuntimeConfig = {
  modules: MappingModuleKey[]
  demographic_columns: string[]
  column_mapping: Record<string, string>
  tcle_text: string | null
  hse_question_order: string[]
  hse_question_text_overrides: Record<string, string>
  ietr_question_order: string[]
  ietr_question_text_overrides: Record<string, string>
  mental_health_question_order: string[]
  mental_health_question_text_overrides: Record<string, string>
}

export function IetrForm({ thankYouPath = '/agradecimento', mappingSlug }: Readonly<IetrFormProps>) {
  const router = useRouter()
  const { isDark, ...T } = useThemeTokens()
  const formTopRef = useRef<HTMLDivElement>(null)

  const [isMobile, setIsMobile] = useState(false)
  const [openModules, setOpenModules] = useState<Record<ModuleId, boolean>>({
    socio: false,
    hse: false,
    ietr: false,
    saude_mental: false,
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
  const [mentalHealth, setMentalHealth] = useState<MentalHealthAnswers>(() => createEmptyMentalHealthAnswers())
  const [mentalHealthNone, setMentalHealthNone] = useState<MentalHealthNoneState>({})
  const [jobObservations, setJobObservations] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [configLoading, setConfigLoading] = useState(false)
  const [mappingConfig, setMappingConfig] = useState<MappingRuntimeConfig>({
    modules: ['sociodemografico', 'hse', 'ietr'],
    demographic_columns: ['gender', 'age_range', 'race_color', 'education_level', 'marital_status', 'disability', 'disability_types'],
    column_mapping: {},
    tcle_text: null,
    hse_question_order: HSE_CODES,
    hse_question_text_overrides: {},
    ietr_question_order: IETR_CODES,
    ietr_question_text_overrides: {},
    mental_health_question_order: MENTAL_HEALTH_CODES,
    mental_health_question_text_overrides: {},
  })

  const hseQuestions = useMemo(
    () => applyQuestionOverrides<HseQuestionDefinition>(HSE_QUESTIONS, {
      order: mappingConfig.hse_question_order,
      text: mappingConfig.hse_question_text_overrides,
    }),
    [mappingConfig.hse_question_order, mappingConfig.hse_question_text_overrides],
  )
  const ietrQuestions = useMemo(
    () => applyQuestionOverrides<IetrQuestionDefinition>(IETR_QUESTIONS, {
      order: mappingConfig.ietr_question_order,
      text: mappingConfig.ietr_question_text_overrides,
    }),
    [mappingConfig.ietr_question_order, mappingConfig.ietr_question_text_overrides],
  )

  const mentalHealthQuestions = useMemo(
    () => applyQuestionOverrides<MentalHealthQuestion>(MENTAL_HEALTH_QUESTIONS, {
      order: mappingConfig.mental_health_question_order,
      text: mappingConfig.mental_health_question_text_overrides,
    }),
    [mappingConfig.mental_health_question_order, mappingConfig.mental_health_question_text_overrides],
  )

  const hasSocioModule = mappingConfig.modules.includes('sociodemografico')
  const hasHseModule = mappingConfig.modules.includes('hse')
  const hasIetrModule = mappingConfig.modules.includes('ietr')
  const hasMentalHealthModule = mappingConfig.modules.includes('saude_mental')

  const mentalHealthPending = hasMentalHealthModule
    ? getMentalHealthPending(mentalHealthQuestions, mentalHealth, mentalHealthNone)
    : []
  const mentalHealthRequiredCount = hasMentalHealthModule
    ? countMentalHealthRequired(mentalHealthQuestions, mentalHealth)
    : 0

  const requiresIetr = hasIetrModule && (!hasSocioModule || !/^n[aã]o/i.test(socio.remote_status.trim()))
  const effectiveIetrQuestions = useMemo(
    () => (requiresIetr ? ietrQuestions : []),
    [requiresIetr, ietrQuestions],
  )

  const totalQuestions = hseQuestions.length + effectiveIetrQuestions.length + mentalHealthRequiredCount
  const answeredCount =
    Object.keys(hseAnswers).length
    + Object.keys(answers).filter((key) => effectiveIetrQuestions.some((q) => q.code === key)).length
    + Math.max(0, mentalHealthRequiredCount - mentalHealthPending.length)
  const completionPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 100

  const unansweredHse = hasHseModule ? hseQuestions.filter((q) => !hseAnswers[q.code]) : []
  const unansweredIetr = effectiveIetrQuestions.filter((q) => !answers[q.code])

  const hsePages = useMemo(() => chunkBy(hseQuestions, MOBILE_QUESTIONS_PER_PAGE), [hseQuestions])
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

  useEffect(() => {
    if (!mappingSlug) return

    setConfigLoading(true)
    fetch(`/api/mapeamento/${mappingSlug}/config`)
      .then(async (res) => {
        if (!res.ok) throw new Error('config_unavailable')
        return res.json()
      })
      .then((json) => {
        if (!json?.config) return
        setMappingConfig({
          modules: Array.isArray(json.config.modules) && json.config.modules.length > 0
            ? json.config.modules
            : ['sociodemografico', 'hse', 'ietr'],
          demographic_columns: Array.isArray(json.config.demographic_columns)
            ? json.config.demographic_columns
            : ['gender', 'age_range', 'race_color', 'education_level', 'marital_status', 'disability', 'disability_types'],
          column_mapping: json.config.column_mapping && typeof json.config.column_mapping === 'object'
            ? json.config.column_mapping
            : {},
          tcle_text: typeof json.mapping?.tcle_text === 'string' && json.mapping.tcle_text.trim().length > 0
            ? json.mapping.tcle_text
            : null,
          hse_question_order: Array.isArray(json.config.hse_question_order) && json.config.hse_question_order.length > 0
            ? json.config.hse_question_order
            : HSE_CODES,
          hse_question_text_overrides: json.config.hse_question_text_overrides && typeof json.config.hse_question_text_overrides === 'object'
            ? json.config.hse_question_text_overrides
            : {},
          ietr_question_order: Array.isArray(json.config.ietr_question_order) && json.config.ietr_question_order.length > 0
            ? json.config.ietr_question_order
            : IETR_CODES,
          ietr_question_text_overrides: json.config.ietr_question_text_overrides && typeof json.config.ietr_question_text_overrides === 'object'
            ? json.config.ietr_question_text_overrides
            : {},
          mental_health_question_order: Array.isArray(json.config.mental_health_question_order) && json.config.mental_health_question_order.length > 0
            ? json.config.mental_health_question_order
            : MENTAL_HEALTH_CODES,
          mental_health_question_text_overrides: json.config.mental_health_question_text_overrides && typeof json.config.mental_health_question_text_overrides === 'object'
            ? json.config.mental_health_question_text_overrides
            : {},
        })
      })
      .catch(() => {})
      .finally(() => setConfigLoading(false))
  }, [mappingSlug])

  function toggleModule(moduleId: ModuleId) {
    setOpenModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }))
  }

  function isFieldPrefilledByCsv(field: string): boolean {
    if (field === 'birth_date') {
      return !!mappingConfig.column_mapping.birth_date || !!mappingConfig.column_mapping.age_range
    }
    return !!mappingConfig.column_mapping[field]
  }

  function shouldShowDemographicField(field: string): boolean {
    return mappingConfig.demographic_columns.includes(field) && !isFieldPrefilledByCsv(field)
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

    if (hasSocioModule) {
      const requiredMissing = [
        shouldShowDemographicField('age_range') && !socio.birth_date,
        shouldShowDemographicField('gender') && !socio.gender,
        shouldShowDemographicField('race_color') && !socio.race_color,
        shouldShowDemographicField('marital_status') && !socio.marital_status,
        shouldShowDemographicField('education_level') && !socio.education_level,
        shouldShowDemographicField('disability') && !socio.disability,
        hasIetrModule && !socio.remote_status,
      ].some(Boolean)

      if (requiredMissing) {
        setOpenModules((prev) => ({ ...prev, socio: true }))
        reportError('Preencha os campos sociodemográficos obrigatórios para este mapeamento.')
        return
      }
    }

    if (/^sim/i.test(socio.disability.trim()) && !socio.which_disability.trim()) {
      setOpenModules((prev) => ({ ...prev, socio: true }))
      reportError('Informe qual deficiência para continuar.')
      return
    }

    const unansweredTotal = unansweredHse.length + unansweredIetr.length + mentalHealthPending.length
    if (unansweredTotal > 0) {
      goToFirstUnanswered()
      reportError(`Responda todas as questões obrigatórias antes de enviar. Faltam ${unansweredTotal}.`)
      return
    }

    setIsSubmitting(true)

    try {
      const payloadSocio = {
        birth_date: socio.birth_date,
        gender: socio.gender,
        race_color: socio.race_color,
        marital_status: socio.marital_status,
        education_level: socio.education_level,
        disability: socio.disability,
        which_disability: socio.which_disability,
        remote_status: hasIetrModule ? (socio.remote_status || 'Sim') : 'Não',
      }

      const payload = {
        socio: payloadSocio,
        hseAnswers: hasHseModule
          ? hseQuestions.map((q) => ({ questionCode: q.code, rawValue: hseAnswers[q.code] }))
          : [],
        ietrAnswers: (hasIetrModule && requiresIetr)
          ? ietrQuestions.map((q) => ({ questionCode: q.code, rawValue: answers[q.code] }))
          : [],
        mentalHealth: hasMentalHealthModule ? mentalHealth : null,
        jobObservations: jobObservations.trim() || null,
      }

      const response = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        reportError(data.error ?? 'Não foi possível enviar suas respostas.')
        return
      }

      router.push(thankYouPath)
    } catch {
      reportError('Erro de conexão. Tente novamente em instantes.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function reportError(message: string) {
    setError(message)
    requestAnimationFrame(() => formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function goToFirstUnanswered() {
    if (unansweredHse.length > 0) {
      setOpenModules((prev) => ({ ...prev, hse: true }))
      if (isMobile) {
        const idx = hseQuestions.findIndex((q) => q.code === unansweredHse[0].code)
        setMobileModule('hse')
        setMobilePage(Math.max(0, Math.floor(idx / MOBILE_QUESTIONS_PER_PAGE)))
      }
      return
    }
    if (unansweredIetr.length > 0) {
      setOpenModules((prev) => ({ ...prev, ietr: true }))
      if (isMobile) {
        const idx = effectiveIetrQuestions.findIndex((q) => q.code === unansweredIetr[0].code)
        setMobileModule('ietr')
        setMobilePage(Math.max(0, Math.floor(idx / MOBILE_QUESTIONS_PER_PAGE)))
      }
      return
    }
    if (mentalHealthPending.length > 0) {
      setOpenModules((prev) => ({ ...prev, saude_mental: true }))
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
          <Select
            value={socio.gender}
            options={GENDER_OPTIONS}
            placeholder="Selecione"
            disabled={isSubmitting}
            onChange={(value) => setSocioField('gender', value)}
          />
        </label>

        <label className="text-sm">
          <span className="mb-1.5 block" style={{ color: T.textMuted }}>Raça/Cor *</span>
          <Select
            value={socio.race_color}
            options={RACE_OPTIONS}
            placeholder="Selecione"
            disabled={isSubmitting}
            onChange={(value) => setSocioField('race_color', value)}
          />
        </label>

        <label className="text-sm">
          <span className="mb-1.5 block" style={{ color: T.textMuted }}>Estado civil *</span>
          <Select
            value={socio.marital_status}
            options={MARITAL_OPTIONS}
            placeholder="Selecione"
            disabled={isSubmitting}
            onChange={(value) => setSocioField('marital_status', value)}
          />
        </label>

        <label className="text-sm">
          <span className="mb-1.5 block" style={{ color: T.textMuted }}>Escolaridade *</span>
          <Select
            value={socio.education_level}
            options={EDUCATION_OPTIONS}
            placeholder="Selecione"
            disabled={isSubmitting}
            onChange={(value) => setSocioField('education_level', value)}
          />
        </label>

        <label className="text-sm">
          <span className="mb-1.5 block" style={{ color: T.textMuted }}>Possui deficiência? *</span>
          <Select
            value={socio.disability}
            options={DISABILITY_OPTIONS}
            placeholder="Selecione"
            disabled={isSubmitting}
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
          <Select
            value={socio.remote_status}
            options={REMOTE_OPTIONS}
            placeholder="Selecione"
            disabled={isSubmitting}
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

  function renderMentalHealthFields() {
    return (
      <MentalHealthModule
        questions={mentalHealthQuestions}
        answers={mentalHealth}
        onAnswersChange={setMentalHealth}
        noneState={mentalHealthNone}
        onNoneStateChange={setMentalHealthNone}
        disabled={isSubmitting}
        highlightCodes={error ? mentalHealthPending.map((q) => q.code) : []}
      />
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
            {hseQuestions.map((question) => renderQuestionCard(question.code, question.text, HSE_SCALE_OPTIONS, hseAnswers[question.code], setHseAnswer))}
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
              {ietrQuestions.map((question, index) =>
                renderQuestionCard(String(index + 1).padStart(2, '0'), question.text, IETR_SCALE_OPTIONS, answers[question.code], (_, value) => setAnswer(question.code, value))
              )}
            </div>
          )}
        </CollapsibleModule>

        {hasMentalHealthModule && (
          <CollapsibleModule
            id="saude_mental"
            title="Módulo Saúde Mental"
            subtitle="Comportamento e emoção, fatores ambientais e percepção sobre saúde e qualidade de vida"
            isOpen={openModules.saude_mental}
            onToggle={toggleModule}
            theme={T}
          >
            {renderMentalHealthFields()}
          </CollapsibleModule>
        )}
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
              const h = question as HseQuestionDefinition
              return renderQuestionCard(h.code, h.text, HSE_SCALE_OPTIONS, hseAnswers[h.code], setHseAnswer)
            })
          : activeMobilePage.map((question) => {
              const q = question as IetrQuestionDefinition
              const idx = ietrQuestions.findIndex((x) => x.code === q.code)
              const num = String(idx + 1).padStart(2, '0')
              return renderQuestionCard(num, q.text, IETR_SCALE_OPTIONS, answers[q.code], (_, value) => setAnswer(q.code, value))
            })}
      </div>
    )
  }

  const hseShare = totalQuestions > 0 ? (hseQuestions.length / totalQuestions) * 100 : 0
  const showMilestone = hasHseModule && requiresIetr && effectiveIetrQuestions.length > 0

  return (
    <main className="min-h-screen" style={{ backgroundColor: T.bg, color: T.text }}>
      <div className="fixed top-0 left-0 right-0 z-50" style={{ backgroundColor: isDark ? 'rgba(17,17,17,0.92)' : 'rgba(248,250,251,0.92)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${T.border}` }}>
        <div className="mx-auto w-full max-w-5xl px-4 py-2 sm:px-6 lg:px-8">
          <div className="mb-1 flex items-center justify-between text-xs" style={{ color: T.textMuted }}>
            <span>Progresso geral</span>
            <span>{completionPct}%</span>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: T.surface2 }}>
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: BRAND_COLORS.primary }}
              initial={false}
              animate={{ width: `${completionPct}%` }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
            {showMilestone && (
              <span
                className="absolute top-0 h-full w-px"
                style={{ left: `${hseShare}%`, backgroundColor: T.bg, opacity: 0.6 }}
                title="Início do módulo IETR"
              />
            )}
          </div>
        </div>
      </div>

      <div ref={formTopRef} className="mx-auto w-full max-w-5xl px-4 pb-48 pt-16 sm:px-6 lg:px-8">
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
              {hasSocioModule && (
                <section className="rounded-2xl p-4 sm:p-6" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
                <div className="mb-5 space-y-1">
                  <h2 className="text-xl font-semibold" style={{ color: T.text }}>Dados sociodemográficos</h2>
                  <p className="text-sm" style={{ color: T.textFaint }}>Esses dados serão usados para análises agregadas por perfil.</p>
                </div>
                {renderSocioFields()}
                </section>
              )}

              {(hasHseModule || hasIetrModule) && (
                <section className="rounded-2xl p-4 sm:p-6" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
                <div className="mb-4 flex items-center gap-2">
                  {hasHseModule && (
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
                  )}
                  {hasIetrModule && (
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
                  )}
                </div>

                <div className="mb-4 flex items-center justify-between text-sm" style={{ color: T.textMuted }}>
                  <span>{mobileModule === 'hse' ? 'Módulo HSE' : 'Módulo IETR'}</span>
                  <span>Página {activeMobilePages.length === 0 ? 1 : mobilePage + 1} de {Math.max(activeMobilePages.length, 1)}</span>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${mobileModule}-${mobilePage}`}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    {renderMobileQuestionCard()}
                  </motion.div>
                </AnimatePresence>

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
              )}

              {hasMentalHealthModule && (
                <section className="rounded-2xl p-4 sm:p-6" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
                  <div className="mb-5 space-y-1">
                    <h2 className="text-xl font-semibold" style={{ color: T.text }}>Módulo Saúde Mental</h2>
                    <p className="text-sm" style={{ color: T.textFaint }}>
                      Comportamento e emoção, fatores ambientais e percepção sobre saúde e qualidade de vida.
                    </p>
                  </div>
                  {renderMentalHealthFields()}
                </section>
              )}
            </>
          ) : (
            renderDesktopModules()
          )}

          <section className="rounded-2xl p-4 sm:p-6" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="job_observations" className="block text-sm font-medium" style={{ color: T.text }}>
                Observações sobre o trabalho remoto (opcional)
              </label>
              <span className="text-xs" style={{ color: T.textFaint }}>{jobObservations.length}/1500</span>
            </div>
            <Textarea
              id="job_observations"
              value={jobObservations}
              onChange={(e) => setJobObservations(e.target.value)}
              rows={4}
              maxLength={1500}
              disabled={isSubmitting}
              placeholder="Se quiser, descreva pontos que não apareceram nas questões acima."
            />
          </section>

          <AlertPresence show={!!error}>{error}</AlertPresence>
        </form>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40" style={{ borderTop: `1px solid ${T.border}`, backgroundColor: isDark ? 'rgba(17,17,17,0.95)' : 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }}>
        <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
          <Button type="submit" form="ietr-form" size="lg" loading={isSubmitting} className="w-full">
            {isSubmitting ? 'Enviando respostas...' : 'Enviar respostas'}
          </Button>
          <p className="mt-2 text-center text-xs" style={{ color: T.textFaint }}>As respostas são analisadas apenas de forma agregada.</p>
        </div>
      </div>
    </main>
  )
}


