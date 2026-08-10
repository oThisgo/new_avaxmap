'use client'

import { motion } from 'motion/react'
import { BRAND_COLORS } from '@/lib/brand'
import { useThemeTokens, type ThemeTokens } from '@/lib/theme'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import {
  MENTAL_HEALTH_SCALE_HEADER,
  MENTAL_HEALTH_SECTIONS,
  type CheckboxGroupQuestion,
  type MentalHealthQuestion,
  type MentalHealthSectionKey,
} from '@/lib/analytics/mental-health-definition'
import {
  clearHiddenConditionalFields,
  type MentalHealthAnswers,
  type MentalHealthAnswerValue,
} from '@/lib/analytics/mental-health'

/**
 * Renderização do módulo Saúde Mental dirigida pela definição declarativa: cada
 * widget vem do `kind` da questão, e nada da estrutura do questionário está
 * codificado aqui. Adicionar/editar uma pergunta é mexer só em
 * `mental-health-definition.ts`.
 */

/**
 * Marcação de "Nenhuma das anteriores" por questão. Para a maioria dos grupos
 * ela é apenas UI (§2.2) — força uma resposta explícita sem virar coluna. A
 * exceção é a Rede de Apoio, cujo "Ninguém" tem `noneField` e é persistido.
 */
export type MentalHealthNoneState = Record<string, boolean>

export function isMentalHealthQuestionVisible(
  question: MentalHealthQuestion,
  answers: MentalHealthAnswers,
): boolean {
  if (!question.visibleWhen) return true
  return answers[question.visibleWhen.field] === question.visibleWhen.equals
}

function isCheckboxGroupAnswered(
  question: CheckboxGroupQuestion,
  answers: MentalHealthAnswers,
  noneState: MentalHealthNoneState,
): boolean {
  if (question.options.some((option) => answers[option.field] === true)) return true
  if (question.otherField) {
    const text = answers[question.otherField.field]
    if (typeof text === 'string' && text.trim().length > 0) return true
  }
  if (question.noneField && answers[question.noneField] === true) return true
  return noneState[question.code] === true
}

export function isMentalHealthQuestionAnswered(
  question: MentalHealthQuestion,
  answers: MentalHealthAnswers,
  noneState: MentalHealthNoneState,
): boolean {
  if (question.kind === 'checkbox_group') return isCheckboxGroupAnswered(question, answers, noneState)
  if (question.kind === 'text') return true
  if (!question.required) return true
  return answers[question.field] !== null && answers[question.field] !== undefined
}

/** Questões visíveis e ainda sem resposta — usado no progresso e no submit. */
export function getMentalHealthPending(
  questions: readonly MentalHealthQuestion[],
  answers: MentalHealthAnswers,
  noneState: MentalHealthNoneState,
): MentalHealthQuestion[] {
  return questions.filter(
    (question) =>
      isMentalHealthQuestionVisible(question, answers) &&
      !isMentalHealthQuestionAnswered(question, answers, noneState),
  )
}

/** Total de questões que contam para o progresso (visíveis e não opcionais). */
export function countMentalHealthRequired(
  questions: readonly MentalHealthQuestion[],
  answers: MentalHealthAnswers,
): number {
  return questions.filter(
    (question) =>
      isMentalHealthQuestionVisible(question, answers) &&
      question.kind !== 'text' &&
      (question.kind === 'checkbox_group' || question.required),
  ).length
}

const SCALE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

interface MentalHealthModuleProps {
  /** Questões já com ordem e enunciados customizados aplicados. */
  questions: readonly MentalHealthQuestion[]
  answers: MentalHealthAnswers
  onAnswersChange: (next: MentalHealthAnswers) => void
  noneState: MentalHealthNoneState
  onNoneStateChange: (next: MentalHealthNoneState) => void
  disabled?: boolean
  /** Códigos a destacar como pendentes após uma tentativa de envio. */
  highlightCodes?: readonly string[]
}

export function MentalHealthModule({
  questions,
  answers,
  onAnswersChange,
  noneState,
  onNoneStateChange,
  disabled = false,
  highlightCodes = [],
}: Readonly<MentalHealthModuleProps>) {
  const T = useThemeTokens()
  const highlighted = new Set(highlightCodes)

  function setField(field: string, value: MentalHealthAnswerValue) {
    // A limpeza dos condicionais roda a cada alteração: desmarcar o gatilho
    // apaga os dependentes na hora, em vez de submetê-los com valor residual.
    onAnswersChange(clearHiddenConditionalFields({ ...answers, [field]: value }))
  }

  function setNone(code: string, checked: boolean) {
    onNoneStateChange({ ...noneState, [code]: checked })
  }

  function toggleGroupOption(question: CheckboxGroupQuestion, field: string, checked: boolean) {
    const next: MentalHealthAnswers = { ...answers, [field]: checked }
    // Marcar qualquer item desmarca "nenhum" — e vice-versa (§2.2).
    if (checked && question.noneField) next[question.noneField] = false
    onAnswersChange(clearHiddenConditionalFields(next))
    if (checked) setNone(question.code, false)
  }

  function toggleNone(question: CheckboxGroupQuestion, checked: boolean) {
    const next: MentalHealthAnswers = { ...answers }
    if (checked) {
      for (const option of question.options) next[option.field] = false
      if (question.otherField) next[question.otherField.field] = null
    }
    if (question.noneField) next[question.noneField] = checked
    onAnswersChange(clearHiddenConditionalFields(next))
    setNone(question.code, checked)
  }

  function isNoneChecked(question: CheckboxGroupQuestion): boolean {
    if (question.noneField) return answers[question.noneField] === true
    return noneState[question.code] === true
  }

  function renderCheckboxGroup(question: CheckboxGroupQuestion) {
    const otherText = question.otherField
      ? (answers[question.otherField.field] as string | null) ?? ''
      : ''

    return (
      <div className="flex flex-col gap-2.5">
        {question.options.map((option) => (
          <Checkbox
            key={option.field}
            checked={answers[option.field] === true}
            disabled={disabled}
            onChange={(checked) => toggleGroupOption(question, option.field, checked)}
            label={<span style={{ color: T.text }}>{option.label}</span>}
          />
        ))}

        {question.otherField && (
          <div className="flex flex-col gap-2">
            <Checkbox
              checked={otherText.trim().length > 0}
              disabled={disabled}
              onChange={(checked) => {
                if (checked) setNone(question.code, false)
                setField(question.otherField!.field, checked ? '' : null)
                if (checked && question.noneField) setField(question.noneField, false)
              }}
              label={<span style={{ color: T.text }}>{question.otherField.label}</span>}
            />
            <Input
              value={otherText}
              disabled={disabled || isNoneChecked(question)}
              placeholder={question.otherField.placeholder}
              maxLength={255}
              onChange={(e) => {
                const value = e.target.value
                const next: MentalHealthAnswers = { ...answers, [question.otherField!.field]: value }
                if (value.trim().length > 0 && question.noneField) next[question.noneField] = false
                onAnswersChange(clearHiddenConditionalFields(next))
                if (value.trim().length > 0) setNone(question.code, false)
              }}
            />
          </div>
        )}

        <div className="mt-1 border-t pt-3" style={{ borderColor: T.border }}>
          <Checkbox
            checked={isNoneChecked(question)}
            disabled={disabled}
            onChange={(checked) => toggleNone(question, checked)}
            label={<span style={{ color: T.textMuted }}>{question.noneLabel}</span>}
          />
        </div>
      </div>
    )
  }

  function renderQuestionBody(question: MentalHealthQuestion) {
    if (question.kind === 'checkbox_group') return renderCheckboxGroup(question)

    if (question.kind === 'boolean') {
      // Sem valor pré-selecionado: "não respondeu" tem de ser distinguível de
      // "respondeu Não" (§3.3 e §3.7).
      const current = answers[question.field]
      return (
        <Select
          value={current === true ? 'sim' : current === false ? 'nao' : ''}
          options={[
            { value: 'sim', label: question.yesLabel ?? 'Sim' },
            { value: 'nao', label: question.noLabel ?? 'Não' },
          ]}
          placeholder="Selecione"
          disabled={disabled}
          onChange={(value) => setField(question.field, value === 'sim')}
        />
      )
    }

    if (question.kind === 'enum') {
      const current = answers[question.field]
      return (
        <Select
          value={typeof current === 'number' ? String(current) : ''}
          options={question.options.map((option) => ({ value: String(option.value), label: option.label }))}
          placeholder="Selecione"
          disabled={disabled}
          onChange={(value) => setField(question.field, Number(value))}
        />
      )
    }

    if (question.kind === 'number') {
      const current = answers[question.field]
      return (
        <Input
          type="number"
          inputMode="numeric"
          min={question.min}
          max={question.max}
          value={typeof current === 'number' ? String(current) : ''}
          disabled={disabled}
          className="max-w-[180px]"
          onChange={(e) => {
            const raw = e.target.value
            setField(question.field, raw === '' ? null : Number(raw))
          }}
        />
      )
    }

    if (question.kind === 'scale_0_10') {
      const current = answers[question.field]
      return (
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
          {SCALE_VALUES.map((value) => {
            const active = current === value
            return (
              <motion.button
                key={value}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                whileTap={disabled ? undefined : { scale: 0.94 }}
                animate={active ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                onClick={() => setField(question.field, value)}
                className="min-h-[44px] rounded-lg border text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: active ? BRAND_COLORS.primary : T.border,
                  backgroundColor: active ? `${BRAND_COLORS.primary}22` : T.inputBg,
                  color: active ? BRAND_COLORS.primary : T.text,
                }}
              >
                {value}
              </motion.button>
            )
          })}
        </div>
      )
    }

    const current = (answers[question.field] as string | null) ?? ''
    return (
      <Textarea
        rows={4}
        maxLength={question.maxLength}
        value={current}
        disabled={disabled}
        onChange={(e) => setField(question.field, e.target.value)}
      />
    )
  }

  function renderQuestion(question: MentalHealthQuestion, index: number) {
    const optional = question.kind === 'text' || (question.kind !== 'checkbox_group' && !question.required)
    const pending = highlighted.has(question.code)

    return (
      <div
        key={question.code}
        className="rounded-xl p-4 sm:p-5"
        style={{
          border: `1px solid ${pending ? BRAND_COLORS.danger : T.border}`,
          backgroundColor: T.inputBg,
        }}
      >
        <p className="text-base font-medium leading-relaxed sm:text-lg" style={{ color: T.text }}>
          {String(index + 1).padStart(2, '0')}. {question.text}
          {!optional && <span style={{ color: BRAND_COLORS.primary }}> *</span>}
          {optional && <span className="text-sm font-normal" style={{ color: T.textFaint }}> (opcional)</span>}
        </p>
        {question.hint && (
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: T.textFaint }}>{question.hint}</p>
        )}
        <div className="mt-4">{renderQuestionBody(question)}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {MENTAL_HEALTH_SECTIONS.map((section) => {
        const sectionQuestions = questions.filter(
          (question) => question.section === section.key && isMentalHealthQuestionVisible(question, answers),
        )
        if (sectionQuestions.length === 0) return null

        return (
          <section key={section.key} className="flex flex-col gap-4">
            <SectionHeader sectionKey={section.key} title={section.title} subtitle={section.subtitle} theme={T} />
            <div className="flex flex-col gap-4">
              {sectionQuestions.map((question, index) => renderQuestion(question, index))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function SectionHeader({
  sectionKey,
  title,
  subtitle,
  theme,
}: Readonly<{ sectionKey: MentalHealthSectionKey; title: string; subtitle: string; theme: ThemeTokens }>) {
  return (
    <header className="border-l-4 pl-3" style={{ borderColor: BRAND_COLORS.primary }}>
      <h3 className="text-lg font-semibold" style={{ color: theme.text }}>{title}</h3>
      <p className="text-sm" style={{ color: theme.textFaint }}>{subtitle}</p>
      {sectionKey === 'percepcao_saude' && (
        <p className="mt-2 text-sm" style={{ color: theme.textMuted }}>
          <strong style={{ color: theme.text }}>{MENTAL_HEALTH_SCALE_HEADER.title}.</strong>{' '}
          {MENTAL_HEALTH_SCALE_HEADER.instructions}
        </p>
      )}
    </header>
  )
}
