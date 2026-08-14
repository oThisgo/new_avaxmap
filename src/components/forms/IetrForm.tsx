'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'motion/react'
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
  FREQUENCY_SCALE_DESCRIPTIONS,
  FREQUENCY_SCALE_INSTRUCTIONS,
  FREQUENCY_SCALE_TITLE,
} from '@/lib/analytics/frequency-scale'
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
import { normalizeLogoUrl } from '@/lib/mapping/logo'
import { MappingLogo } from '@/components/mapping/MappingLogo'
import { applyQuestionOverrides } from '@/lib/mapping/question-overrides'
import { SOCIODEMOGRAPHIC_QUESTION_KEYS, getEffectiveSociodemographicQuestions } from '@/lib/mapping/sociodemographic-questions'

type AnswerMap = Record<string, string>

type ModuleId = 'socio' | 'hse' | 'ietr' | 'saude_mental'

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
  { value: 'Prefiro não informar', label: 'Prefiro não informar' },
]

/** "Qual deficiência?" só existe para quem declarou ter deficiência. */
function declaredDisability(value: string): boolean {
  return /^sim/i.test(value.trim())
}

const REMOTE_OPTIONS: readonly DropdownOption[] = [
  { value: 'Sim', label: 'Sim' },
  { value: 'Não', label: 'Não' },
]

/**
 * Marcador de campo/questão obrigatória. Mesmo padrão visual do módulo Saúde
 * Mental (ver renderQuestion em src/components/forms/MentalHealthModule.tsx),
 * para que a obrigatoriedade seja sinalizada igual em todos os módulos.
 */
function RequiredMark() {
  return <span style={{ color: BRAND_COLORS.primary }}> *</span>
}

/**
 * Contextualização do instrumento: janela de referência das respostas e o que
 * cada ponto da escala significa. Abre os módulos que usam a escala de
 * frequência de 5 pontos.
 */
function FrequencyScaleIntro({ theme }: Readonly<{ theme: FormThemeTokens }>) {
  return (
    <div
      className="rounded-xl px-4 py-4 sm:px-5"
      style={{ border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg }}
    >
      <p className="text-sm font-semibold leading-relaxed sm:text-base" style={{ color: theme.text }}>
        {FREQUENCY_SCALE_INSTRUCTIONS}
      </p>

      <p className="mt-4 text-sm font-semibold" style={{ color: theme.text }}>{FREQUENCY_SCALE_TITLE}</p>
      <dl className="mt-1.5 space-y-1">
        {FREQUENCY_SCALE_DESCRIPTIONS.map((item) => (
          <div key={item.option} className="text-sm leading-relaxed">
            <dt className="inline font-semibold" style={{ color: theme.text }}>{item.option}</dt>
            <dd className="inline" style={{ color: theme.textMuted }}> — {item.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
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
  // O `overflow: hidden` é obrigatório enquanto a altura anima, senão o conteúdo
  // vaza durante o colapso. Depois que o bloco termina de abrir ele volta a
  // `visible`, senão os dropdowns (Select) do módulo sociodemográfico ficam
  // cortados na borda inferior da seção em vez de flutuarem sobre ela.
  const [openAnimationDone, setOpenAnimationDone] = useState(isOpen)
  const [lastIsOpen, setLastIsOpen] = useState(isOpen)

  // Ajuste de estado durante o render (em vez de um efeito): assim que `isOpen`
  // muda, o conteúdo volta a ficar recortado enquanto a nova animação roda.
  if (lastIsOpen !== isOpen) {
    setLastIsOpen(isOpen)
    setOpenAnimationDone(false)
  }

  const contentOverflow = isOpen && openAnimationDone ? 'visible' : 'hidden'

  return (
    <section className="rounded-2xl" style={{ border: `1px solid ${theme.border}`, backgroundColor: theme.surface }}>
      <button
        type="button"
        // Arredonda os 4 cantos quando fechado (o botão é o bloco inteiro) e só os
        // de cima quando aberto (o conteúdo continua abaixo) — como a section não
        // tem mais overflow-hidden (ver comentário acima), é o próprio border-radius
        // do botão que define o formato do hover, não o corte da section.
        className={`w-full ${isOpen ? 'rounded-t-2xl' : 'rounded-2xl'} px-4 py-4 sm:px-6 sm:py-5 flex items-center justify-between gap-4 text-left transition-all`}
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
        onTransitionEnd={(e) => {
          if (e.propertyName === 'max-height' && isOpen) setOpenAnimationDone(true)
        }}
        style={{
          maxHeight: isOpen ? '10000px' : '0px',
          opacity: isOpen ? 1 : 0,
          overflow: contentOverflow,
          transition: 'max-height 0.55s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.4s ease-out',
        }}
      >
        <div className="px-4 pt-6 pb-4 sm:px-6 sm:pt-8 sm:pb-6">{children}</div>
      </div>
    </section>
  )
}

/**
 * Módulo sem recolhimento, usado no mobile: todas as questões numa seção
 * corrida. Antes só o Saúde Mental era assim — HSE e IETR ficavam atrás de
 * abas e paginação de 4 questões, o que quebrava a leitura em telas pequenas.
 */
function PlainModule({
  title,
  subtitle,
  theme,
  children,
}: Readonly<{ title: string; subtitle: string; theme: FormThemeTokens; children: React.ReactNode }>) {
  return (
    <section className="rounded-2xl p-4 sm:p-6" style={{ border: `1px solid ${theme.border}`, backgroundColor: theme.surface }}>
      <div className="mb-5 space-y-1">
        <h2 className="text-xl font-semibold" style={{ color: theme.text }}>{title}</h2>
        <p className="text-sm" style={{ color: theme.textFaint }}>{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

interface IetrFormProps {
  thankYouPath?: string
  mappingSlug?: string
}

type MappingRuntimeConfig = {
  modules: MappingModuleKey[]
  column_mapping: Record<string, string>
  sociodemographic_questions: string[]
  tcle_text: string | null
  logo_url: string | null
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
    column_mapping: {},
    sociodemographic_questions: [...SOCIODEMOGRAPHIC_QUESTION_KEYS],
    tcle_text: null,
    logo_url: null,
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

  // Campos do módulo sociodemográfico realmente exibidos: os que o gestor
  // escolheu na configuração do mapeamento (sociodemographic_questions) e que
  // ainda não vêm prontos da base importada (ver
  // src/lib/mapping/sociodemographic-questions.ts — a mesma regra vale para o
  // editor de configuração, para as duas pontas nunca divergirem).
  const effectiveSocioQuestions = useMemo(
    () => new Set(getEffectiveSociodemographicQuestions(mappingConfig.sociodemographic_questions, mappingConfig.column_mapping)),
    [mappingConfig.sociodemographic_questions, mappingConfig.column_mapping],
  )
  const socioFieldVisibility = {
    birth_date: hasSocioModule && effectiveSocioQuestions.has('age_range'),
    gender: hasSocioModule && effectiveSocioQuestions.has('gender'),
    race_color: hasSocioModule && effectiveSocioQuestions.has('race_color'),
    marital_status: hasSocioModule && effectiveSocioQuestions.has('marital_status'),
    education_level: hasSocioModule && effectiveSocioQuestions.has('education_level'),
    disability: hasSocioModule && effectiveSocioQuestions.has('disability'),
    remote_status: hasSocioModule && hasIetrModule,
  }
  const showSocioModule = Object.values(socioFieldVisibility).some(Boolean)

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

  useEffect(() => {
    function updateMode() {
      setIsMobile(window.innerWidth < 768)
    }

    updateMode()
    window.addEventListener('resize', updateMode)
    return () => window.removeEventListener('resize', updateMode)
  }, [])

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
          column_mapping: json.config.column_mapping && typeof json.config.column_mapping === 'object'
            ? json.config.column_mapping
            : {},
          sociodemographic_questions: Array.isArray(json.config.sociodemographic_questions) && json.config.sociodemographic_questions.length > 0
            ? json.config.sociodemographic_questions
            : [...SOCIODEMOGRAPHIC_QUESTION_KEYS],
          tcle_text: typeof json.mapping?.tcle_text === 'string' && json.mapping.tcle_text.trim().length > 0
            ? json.mapping.tcle_text
            : null,
          logo_url: normalizeLogoUrl(json.mapping?.logo_url),
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

  function setSocioField(field: keyof SocioData, value: string) {
    setSocio((prev) => ({
      ...prev,
      [field]: value,
      // "Qual deficiência?" só é exibido para quem responde "Sim"; qualquer
      // outra resposta (inclusive "Prefiro não informar") limpa o campo, para
      // não submeter resíduo de um valor digitado antes.
      ...(field === 'disability' && !declaredDisability(value) ? { which_disability: '' } : {}),
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
        socioFieldVisibility.birth_date && !socio.birth_date,
        socioFieldVisibility.gender && !socio.gender,
        socioFieldVisibility.race_color && !socio.race_color,
        socioFieldVisibility.marital_status && !socio.marital_status,
        socioFieldVisibility.education_level && !socio.education_level,
        socioFieldVisibility.disability && !socio.disability,
        socioFieldVisibility.remote_status && !socio.remote_status,
      ].some(Boolean)

      if (requiredMissing) {
        setOpenModules((prev) => ({ ...prev, socio: true }))
        reportError('Preencha os campos sociodemográficos obrigatórios para este mapeamento.')
        return
      }
    }

    if (declaredDisability(socio.disability) && !socio.which_disability.trim()) {
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

  /**
   * Abre o módulo que tem a primeira pendência. No mobile os módulos já ficam
   * todos expandidos, então basta o scroll até o topo que reportError faz.
   */
  function goToFirstUnanswered() {
    if (unansweredHse.length > 0) {
      setOpenModules((prev) => ({ ...prev, hse: true }))
      return
    }
    if (unansweredIetr.length > 0) {
      setOpenModules((prev) => ({ ...prev, ietr: true }))
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

  function renderSocioFields() {
    const disabilityAnsweredYes = declaredDisability(socio.disability)

    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {socioFieldVisibility.birth_date && (
          <label className="text-sm">
            <span className="mb-1.5 block" style={{ color: T.textMuted }}>Data de nascimento<RequiredMark /></span>
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
        )}

        {socioFieldVisibility.gender && (
          <label className="text-sm">
            <span className="mb-1.5 block" style={{ color: T.textMuted }}>Gênero<RequiredMark /></span>
            <Select
              value={socio.gender}
              options={GENDER_OPTIONS}
              placeholder="Selecione"
              disabled={isSubmitting}
              onChange={(value) => setSocioField('gender', value)}
            />
          </label>
        )}

        {socioFieldVisibility.race_color && (
          <label className="text-sm">
            <span className="mb-1.5 block" style={{ color: T.textMuted }}>Raça/Cor<RequiredMark /></span>
            <Select
              value={socio.race_color}
              options={RACE_OPTIONS}
              placeholder="Selecione"
              disabled={isSubmitting}
              onChange={(value) => setSocioField('race_color', value)}
            />
          </label>
        )}

        {socioFieldVisibility.marital_status && (
          <label className="text-sm">
            <span className="mb-1.5 block" style={{ color: T.textMuted }}>Estado civil<RequiredMark /></span>
            <Select
              value={socio.marital_status}
              options={MARITAL_OPTIONS}
              placeholder="Selecione"
              disabled={isSubmitting}
              onChange={(value) => setSocioField('marital_status', value)}
            />
          </label>
        )}

        {socioFieldVisibility.education_level && (
          <label className="text-sm">
            <span className="mb-1.5 block" style={{ color: T.textMuted }}>Escolaridade<RequiredMark /></span>
            <Select
              value={socio.education_level}
              options={EDUCATION_OPTIONS}
              placeholder="Selecione"
              disabled={isSubmitting}
              onChange={(value) => setSocioField('education_level', value)}
            />
          </label>
        )}

        {socioFieldVisibility.disability && (
          <>
            <label className="text-sm">
              <span className="mb-1.5 block" style={{ color: T.textMuted }}>Possui deficiência?<RequiredMark /></span>
              <Select
                value={socio.disability}
                options={DISABILITY_OPTIONS}
                placeholder="Selecione"
                disabled={isSubmitting}
                onChange={(value) => setSocioField('disability', value)}
              />
            </label>

            {disabilityAnsweredYes && (
              <label className="text-sm sm:col-span-2">
                <span className="mb-1.5 block" style={{ color: T.textMuted }}>
                  Qual deficiência?<RequiredMark />
                </span>
                <input
                  type="text"
                  value={socio.which_disability}
                  onChange={(e) => setSocioField('which_disability', e.target.value)}
                  disabled={isSubmitting}
                  placeholder="Ex.: visual, auditiva, física, intelectual"
                  className="w-full rounded-lg px-3 py-2 outline-none disabled:opacity-60 transition-all"
                  style={fieldStyle}
                  onMouseEnter={handleFieldMouseEnter}
                  onMouseLeave={handleFieldMouseLeave}
                  onFocus={handleFieldFocus}
                  onBlur={handleFieldBlur}
                />
              </label>
            )}
          </>
        )}

        {socioFieldVisibility.remote_status && (
          <label className="text-sm sm:col-span-2">
            <span className="mb-1.5 block" style={{ color: T.textMuted }}>Você trabalha remotamente?<RequiredMark /></span>
            <Select
              value={socio.remote_status}
              options={REMOTE_OPTIONS}
              placeholder="Selecione"
              disabled={isSubmitting}
              onChange={(value) => setSocioField('remote_status', value)}
            />
          </label>
        )}
      </div>
    )
  }

  function renderQuestionCard(questionCode: string, questionText: string, scaleOptions: readonly string[], selected: string | undefined, onSelect: (code: string, value: string) => void) {
    const displayNum = questionCode.replace(/^[^0-9]+/, '')
    return (
      <div key={questionCode} className="rounded-xl p-4 sm:p-5" style={questionCardStyle}>
        <p className="mb-4 text-base font-medium leading-relaxed sm:text-lg" style={{ color: T.text }}>
          {displayNum}. {questionText}
          <RequiredMark />
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

  function renderHseQuestions() {
    return (
      <div className="space-y-6">
        <FrequencyScaleIntro theme={T} />
        {hseQuestions.map((question) =>
          renderQuestionCard(question.code, question.text, HSE_SCALE_OPTIONS, hseAnswers[question.code], setHseAnswer),
        )}
      </div>
    )
  }

  /**
   * Conteúdo do módulo IETR, incluindo o campo de observações — ele é sobre
   * trabalho remoto, então pertence a este módulo e some junto quando o IETR
   * não faz parte do mapeamento.
   */
  function renderIetrContent() {
    if (!requiresIetr) {
      return (
        <p className="rounded-lg px-4 py-3 text-sm" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2, color: T.textMuted }}>
          Você informou que não trabalha remotamente. O módulo IETR será considerado opcional nesta submissão.
        </p>
      )
    }

    return (
      <>
        <div className="space-y-6">
          <FrequencyScaleIntro theme={T} />
          {ietrQuestions.map((question, index) =>
            renderQuestionCard(
              String(index + 1).padStart(2, '0'),
              question.text,
              IETR_SCALE_OPTIONS,
              answers[question.code],
              (_, value) => setAnswer(question.code, value),
            ),
          )}
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="job_observations" className="block text-sm font-medium" style={{ color: T.text }}>
              Observações sobre o trabalho remoto <span style={{ color: T.textFaint }}>(opcional)</span>
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
        </div>
      </>
    )
  }

  const moduleSections: Array<{ id: ModuleId; title: string; subtitle: string; content: React.ReactNode }> = []
  if (showSocioModule) {
    moduleSections.push({
      id: 'socio',
      title: 'Dados sociodemográficos',
      subtitle: 'Dados para análises agregadas por perfil',
      content: renderSocioFields(),
    })
  }
  if (hasHseModule) {
    moduleSections.push({
      id: 'hse',
      title: 'Condições psicossociais no trabalho',
      subtitle: 'Questões sobre o ambiente de trabalho em geral',
      content: renderHseQuestions(),
    })
  }
  if (hasIetrModule) {
    moduleSections.push({
      id: 'ietr',
      title: 'Módulo IETR',
      subtitle: 'Questões sobre experiência de trabalho remoto',
      content: renderIetrContent(),
    })
  }
  if (hasMentalHealthModule) {
    moduleSections.push({
      id: 'saude_mental',
      title: 'Saúde e bem-estar',
      subtitle: 'Comportamento e emoção, fatores ambientais e percepção sobre saúde e qualidade de vida',
      content: renderMentalHealthFields(),
    })
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
          <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-start">
            <div className="h-24 w-24 overflow-hidden rounded-full p-4 shadow-sm" style={{ backgroundColor: BRAND_COLORS.primary }}>
              <Image src={BRAND_ASSETS.symbol} alt={BRAND_NAME} width={96} height={96} className="h-full w-full object-contain" style={{ height: '100%' }} />
            </div>
            <MappingLogo src={mappingConfig.logo_url} variant="header" />
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
          {/* Mesmo conteúdo nos dois modos: no mobile cada módulo é uma seção
              corrida (como o Saúde Mental sempre foi); no desktop os módulos
              viram blocos recolhíveis. */}
          {moduleSections.map((module) =>
            isMobile ? (
              <PlainModule key={module.id} title={module.title} subtitle={module.subtitle} theme={T}>
                {module.content}
              </PlainModule>
            ) : (
              <CollapsibleModule
                key={module.id}
                id={module.id}
                title={module.title}
                subtitle={module.subtitle}
                isOpen={openModules[module.id]}
                onToggle={toggleModule}
                theme={T}
              >
                {module.content}
              </CollapsibleModule>
            ),
          )}

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


