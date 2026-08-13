'use client'

import { useState } from 'react'
import { useThemeTokens } from '@/lib/theme'
import { BRAND_COLORS } from '@/lib/brand'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { HSE_QUESTIONS } from '@/lib/analytics/hse-definition'
import { IETR_QUESTIONS } from '@/lib/analytics/ietr-definition'
import { MENTAL_HEALTH_EDITABLE_QUESTIONS, MENTAL_HEALTH_QUESTIONS } from '@/lib/analytics/mental-health-definition'
import { QuestionOrderEditor, type EditableQuestion } from '@/components/mapping/QuestionOrderEditor'
import type { MappingModuleKey } from '@/lib/mapping/config'
import {
  SOCIODEMOGRAPHIC_QUESTION_KEYS,
  SOCIODEMOGRAPHIC_QUESTION_LABELS,
  getSociodemographicPrefillColumn,
} from '@/lib/mapping/sociodemographic-questions'

export type ColumnProfileDraft = {
  source_name: string
  display_name: string
  is_dashboard_filter: boolean
  is_demographic: boolean
  /** Dado identificável (nome, CPF/matrícula, e-mail, credencial) — trava filtro e demográfico. */
  locked: boolean
  locked_reason: string | null
  /** Sociodemográfico reconhecido (gênero, data de nascimento, etc.) — trava só o demográfico; filtro fica livre. */
  demographic_locked: boolean
  demographic_locked_reason: string | null
}

export type MappingConfigDraft = {
  modules: string[]
  credential_column: string
  column_profiles: ColumnProfileDraft[]
  /** Quais perguntas do módulo sociodemográfico o formulário faz — ver src/lib/mapping/sociodemographic-questions.ts. */
  sociodemographic_questions: string[]
  hse_question_order: string[]
  hse_question_text_overrides: Record<string, string>
  ietr_question_order: string[]
  ietr_question_text_overrides: Record<string, string>
  mental_health_question_order: string[]
  mental_health_question_text_overrides: Record<string, string>
}

type ModuleDef = {
  key: MappingModuleKey
  title: string
  description: string
  domains?: readonly string[]
  questionCount?: number
}

/**
 * Módulos com banco de perguntas editável, e onde a ordem/enunciados de cada um
 * ficam no rascunho da configuração. Uma entrada aqui basta para o módulo ganhar
 * o editor de perguntas — sem JSX duplicado por módulo.
 */
export const QUESTION_EDITABLE_MODULES = {
  hse: {
    questions: HSE_QUESTIONS as readonly EditableQuestion[],
    orderKey: 'hse_question_order',
    textKey: 'hse_question_text_overrides',
  },
  ietr: {
    questions: IETR_QUESTIONS as readonly EditableQuestion[],
    orderKey: 'ietr_question_order',
    textKey: 'ietr_question_text_overrides',
  },
  saude_mental: {
    questions: MENTAL_HEALTH_EDITABLE_QUESTIONS as readonly EditableQuestion[],
    orderKey: 'mental_health_question_order',
    textKey: 'mental_health_question_text_overrides',
  },
} as const satisfies Record<string, {
  questions: readonly EditableQuestion[]
  orderKey: keyof MappingConfigDraft
  textKey: keyof MappingConfigDraft
}>

type QuestionEditableModuleKey = keyof typeof QUESTION_EDITABLE_MODULES

function isQuestionEditableModule(key: MappingModuleKey): key is QuestionEditableModuleKey {
  return key in QUESTION_EDITABLE_MODULES
}

export const MODULE_DEFS: readonly ModuleDef[] = [
  {
    key: 'sociodemografico',
    title: 'Sociodemográfico',
    description: 'Perfil dos colaboradores (idade, gênero, raça/cor, escolaridade, estado civil, deficiência) para cruzamentos e filtros no dashboard. Escolha abaixo quais perguntas fazer — as que já vêm de uma coluna da base ficam travadas automaticamente.',
  },
  {
    key: 'hse',
    title: 'HSE — Riscos psicossociais',
    description: 'Baseado no HSE Management Standards Indicator Tool. Mede a percepção dos colaboradores em 7 domínios de risco psicossocial no trabalho, com escala de 5 pontos.',
    domains: ['Demandas', 'Controle', 'Apoio da Liderança', 'Apoio dos Colegas', 'Relacionamentos', 'Cargo', 'Comunicação e Mudanças'],
    questionCount: HSE_QUESTIONS.length,
  },
  {
    key: 'ietr',
    title: 'IETR — Trabalho remoto',
    description: 'Avalia a experiência de quem trabalha remotamente em 8 domínios, com escala de 5 pontos. Só é aplicado a colaboradores que informam trabalhar remotamente no módulo sociodemográfico.',
    domains: ['Demandas', 'Controle', 'Suporte', 'Comunicação', 'Papel', 'Limites', 'Ambiente', 'Produtividade'],
    questionCount: IETR_QUESTIONS.length,
  },
  {
    key: 'saude_mental',
    title: 'Saúde Mental — pacote de 3 seções',
    description: 'Pacote com "Comportamento e Emoção" (estresse, sintomas depressivos, indicadores de risco, tabaco, álcool, substâncias e uso de internet), "Fatores Ambientais" (rede de apoio e vivências do último ano) e "Percepção sobre Saúde e Qualidade de Vida". Gera o Índice de Saúde Mental (0–10) a partir de 8 componentes ponderados, com o bloco de risco de suicídio atuando como divisor do índice.',
    domains: [
      'Comportamento e Emoção',
      'Fatores Ambientais',
      'Percepção sobre Saúde e Qualidade de Vida',
    ],
    questionCount: MENTAL_HEALTH_QUESTIONS.length,
  },
] as const

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

interface SociodemographicQuestionsPickerProps {
  selected: readonly string[]
  columnMapping: Record<string, string>
  onChange: (next: string[]) => void
  disabled?: boolean
}

/**
 * Checkboxes para escolher quais perguntas do módulo sociodemográfico o
 * formulário faz. Uma pergunta cuja resposta já vem de uma coluna da base
 * (detectado via column_mapping, preenchido na leitura do CSV) fica travada
 * ligada — perguntar de novo ao colaborador seria redundante — e explica de
 * qual coluna veio o bloqueio, no mesmo padrão visual dos cards de coluna
 * bloqueados logo abaixo, nesta mesma tela.
 */
export function SociodemographicQuestionsPicker({
  selected,
  columnMapping,
  onChange,
  disabled = false,
}: Readonly<SociodemographicQuestionsPickerProps>) {
  const T = useThemeTokens()

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {SOCIODEMOGRAPHIC_QUESTION_KEYS.map((key) => {
        const prefillColumn = getSociodemographicPrefillColumn(key, columnMapping)
        const locked = prefillColumn !== null
        const checked = locked || selected.includes(key)

        return (
          <div
            key={key}
            className="rounded-lg px-3 py-2.5"
            style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}
          >
            <Checkbox
              checked={checked}
              disabled={locked || disabled}
              onChange={() => onChange(toggleInList([...selected], key))}
              label={<span style={{ color: T.text }}>{SOCIODEMOGRAPHIC_QUESTION_LABELS[key]}</span>}
            />
            {locked && (
              <p className="mt-1 pl-6 text-xs" style={{ color: T.textFaint }}>
                Já vem da coluna &ldquo;{prefillColumn}&rdquo; da base — não é perguntado no formulário.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface MappingConfigEditorProps {
  draft: MappingConfigDraft
  onChange: (next: MappingConfigDraft) => void
  /** Colunas do CSV disponíveis para escolher como credencial de acesso. */
  credentialCandidates: readonly string[]
  /** header do CSV -> campo canônico, usado para bloquear perguntas sociodemográficas já cobertas pela base. */
  columnMapping: Record<string, string>
  disabled?: boolean
}

export function MappingConfigEditor({
  draft,
  onChange,
  credentialCandidates,
  columnMapping,
  disabled = false,
}: Readonly<MappingConfigEditorProps>) {
  const T = useThemeTokens()
  const [expandedModule, setExpandedModule] = useState<string | null>(null)

  function patch(changes: Partial<MappingConfigDraft>) {
    onChange({ ...draft, ...changes })
  }

  function updateColumn(sourceName: string, changes: Partial<ColumnProfileDraft>) {
    patch({
      column_profiles: draft.column_profiles.map((card) =>
        card.source_name === sourceName ? { ...card, ...changes } : card,
      ),
    })
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-base font-semibold">Módulos do questionário</h3>
        <p className="mt-1 text-xs" style={{ color: T.textFaint }}>
          Desmarcar um módulo remove suas perguntas do formulário, suas abas do dashboard e suas
          seções do relatório. Respostas já coletadas permanecem no banco.
        </p>

        <div className="mt-3 space-y-3">
          {MODULE_DEFS.map((mod) => {
            const enabled = draft.modules.includes(mod.key)
            const questionEditor = isQuestionEditableModule(mod.key) ? QUESTION_EDITABLE_MODULES[mod.key] : null
            const hasQuestions = questionEditor !== null
            const isExpanded = expandedModule === mod.key

            return (
              <div
                key={mod.key}
                className="rounded-xl p-4"
                style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2 }}
              >
                <div className="flex items-start justify-between gap-3">
                  <Checkbox
                    checked={enabled}
                    disabled={disabled}
                    onChange={() => patch({ modules: toggleInList(draft.modules, mod.key) })}
                    label={<span className="font-semibold" style={{ color: T.text }}>{mod.title}</span>}
                  />
                  {hasQuestions && (
                    <button
                      type="button"
                      onClick={() => setExpandedModule((prev) => (prev === mod.key ? null : mod.key))}
                      disabled={!enabled || disabled}
                      className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ border: `1px solid ${T.border}`, color: T.textMuted, backgroundColor: T.surface }}
                    >
                      <span>{isExpanded ? 'Ocultar perguntas' : `Ver ${mod.questionCount} perguntas`}</span>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  )}
                </div>

                <p className="mt-2 text-sm" style={{ color: T.textMuted }}>{mod.description}</p>

                {mod.domains && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {mod.domains.map((domain) => (
                      <Badge key={domain}>{domain}</Badge>
                    ))}
                  </div>
                )}

                {mod.key === 'sociodemografico' && enabled && (
                  <div className="mt-4">
                    <SociodemographicQuestionsPicker
                      selected={draft.sociodemographic_questions}
                      columnMapping={columnMapping}
                      onChange={(next) => patch({ sociodemographic_questions: next })}
                      disabled={disabled}
                    />
                  </div>
                )}

                {questionEditor && (
                  <div
                    style={{
                      maxHeight: enabled && isExpanded ? '20000px' : '0px',
                      opacity: enabled && isExpanded ? 1 : 0,
                      overflow: 'hidden',
                      transition: 'max-height 0.55s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.4s ease-out',
                    }}
                  >
                    <div className="mt-4">
                      <QuestionOrderEditor
                        questions={questionEditor.questions}
                        order={draft[questionEditor.orderKey] as string[]}
                        textOverrides={draft[questionEditor.textKey] as Record<string, string>}
                        onOrderChange={(order) => patch({ [questionEditor.orderKey]: order })}
                        onTextChange={(code, text) => patch({
                          [questionEditor.textKey]: {
                            ...(draft[questionEditor.textKey] as Record<string, string>),
                            [code]: text,
                          },
                        })}
                        onResetText={(code) => {
                          const next = { ...(draft[questionEditor.textKey] as Record<string, string>) }
                          delete next[code]
                          patch({ [questionEditor.textKey]: next })
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {credentialCandidates.length > 0 && (
        <section>
          <h3 className="text-base font-semibold">Coluna de credencial de acesso</h3>
          <p className="mt-1 text-xs" style={{ color: T.textFaint }}>
            Coluna usada pelo colaborador para entrar no formulário.
          </p>
          <div className="mt-2">
            <Select
              value={draft.credential_column}
              onChange={(value) => patch({ credential_column: value })}
              options={credentialCandidates.map((col) => ({ value: col, label: col }))}
              placeholder="Escolha a coluna de credencial"
            />
          </div>
        </section>
      )}

      <section>
        <h3 className="text-base font-semibold">Colunas da base</h3>
        <p className="mt-1 text-xs" style={{ color: T.textFaint }}>
          Defina o nome exibido e onde cada coluna aparece. Colunas bloqueadas guardam dados
          identificáveis e não podem virar filtro ou gráfico. Colunas sociodemográficas
          reconhecidas automaticamente (gênero, data de nascimento etc.) sempre aparecem como
          gráfico, mas também podem virar filtro do dashboard.
        </p>

        {draft.column_profiles.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {draft.column_profiles.map((card) => (
              <article
                key={card.source_name}
                className="rounded-xl p-3"
                style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold" style={{ color: T.text }}>{card.source_name}</p>
                  {card.locked && (
                    <span
                      className="rounded-full px-2 py-1 text-[11px]"
                      style={{ color: BRAND_COLORS.primary, backgroundColor: `${BRAND_COLORS.primary}22` }}
                    >
                      Bloqueado
                    </span>
                  )}
                  {!card.locked && card.demographic_locked && (
                    <span
                      className="rounded-full px-2 py-1 text-[11px]"
                      style={{ color: T.textMuted, backgroundColor: T.surface }}
                    >
                      Campo padrão
                    </span>
                  )}
                </div>

                {(card.locked_reason || card.demographic_locked_reason) && (
                  <p className="mt-1 text-xs" style={{ color: T.textFaint }}>
                    {card.locked_reason ?? card.demographic_locked_reason}
                  </p>
                )}

                <label htmlFor={`edit-display-${card.source_name}`} className="mt-3 block text-xs" style={{ color: T.textMuted }}>
                  Nome de visualização
                </label>
                <input
                  id={`edit-display-${card.source_name}`}
                  value={card.display_name}
                  disabled={disabled}
                  onChange={(e) => updateColumn(card.source_name, { display_name: e.target.value })}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60"
                  style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.text }}
                />

                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs" style={{ color: T.textMuted }}>
                    <input
                      type="checkbox"
                      checked={card.is_dashboard_filter}
                      disabled={card.locked || disabled}
                      onChange={(e) => updateColumn(card.source_name, { is_dashboard_filter: e.target.checked })}
                    />
                    <span>Filtro no dashboard</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs" style={{ color: T.textMuted }}>
                    <input
                      type="checkbox"
                      checked={card.is_demographic}
                      disabled={card.locked || card.demographic_locked || disabled}
                      onChange={(e) => updateColumn(card.source_name, { is_demographic: e.target.checked })}
                    />
                    <span>Dado demográfico</span>
                  </label>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs" style={{ color: T.textFaint }}>
            Este mapeamento não tem colunas de base registradas. Envie a base de colaboradores para
            habilitar a configuração por coluna.
          </p>
        )}
      </section>
    </div>
  )
}
