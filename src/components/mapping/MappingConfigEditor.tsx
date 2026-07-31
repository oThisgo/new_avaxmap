'use client'

import { useState } from 'react'
import { useThemeTokens } from '@/lib/theme'
import { BRAND_COLORS } from '@/lib/brand'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { HSE_QUESTIONS } from '@/lib/analytics/hse-definition'
import { IETR_QUESTIONS } from '@/lib/analytics/ietr-definition'
import { QuestionOrderEditor } from '@/components/mapping/QuestionOrderEditor'

export type ColumnProfileDraft = {
  source_name: string
  display_name: string
  is_dashboard_filter: boolean
  is_demographic: boolean
  locked: boolean
  locked_reason: string | null
}

export type MappingConfigDraft = {
  modules: string[]
  credential_column: string
  column_profiles: ColumnProfileDraft[]
  hse_question_order: string[]
  hse_question_text_overrides: Record<string, string>
  ietr_question_order: string[]
  ietr_question_text_overrides: Record<string, string>
}

type ModuleDef = {
  key: 'sociodemografico' | 'hse' | 'ietr'
  title: string
  description: string
  domains?: readonly string[]
  questionCount?: number
}

const MODULE_DEFS: readonly ModuleDef[] = [
  {
    key: 'sociodemografico',
    title: 'Sociodemográfico',
    description: 'Perfil dos colaboradores (idade, gênero, raça/cor, escolaridade, estado civil, deficiência) para cruzamentos e filtros no dashboard. Os campos exibidos dependem das colunas marcadas como dado demográfico.',
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
] as const

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

interface MappingConfigEditorProps {
  draft: MappingConfigDraft
  onChange: (next: MappingConfigDraft) => void
  /** Colunas do CSV disponíveis para escolher como credencial de acesso. */
  credentialCandidates: readonly string[]
  disabled?: boolean
}

export function MappingConfigEditor({
  draft,
  onChange,
  credentialCandidates,
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
            const hasQuestions = mod.key === 'hse' || mod.key === 'ietr'
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

                {hasQuestions && (
                  <div
                    style={{
                      maxHeight: enabled && isExpanded ? '20000px' : '0px',
                      opacity: enabled && isExpanded ? 1 : 0,
                      overflow: 'hidden',
                      transition: 'max-height 0.55s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.4s ease-out',
                    }}
                  >
                    <div className="mt-4">
                      {mod.key === 'hse' ? (
                        <QuestionOrderEditor
                          questions={HSE_QUESTIONS}
                          order={draft.hse_question_order}
                          textOverrides={draft.hse_question_text_overrides}
                          onOrderChange={(order) => patch({ hse_question_order: order })}
                          onTextChange={(code, text) => patch({
                            hse_question_text_overrides: { ...draft.hse_question_text_overrides, [code]: text },
                          })}
                          onResetText={(code) => {
                            const next = { ...draft.hse_question_text_overrides }
                            delete next[code]
                            patch({ hse_question_text_overrides: next })
                          }}
                        />
                      ) : (
                        <QuestionOrderEditor
                          questions={IETR_QUESTIONS}
                          order={draft.ietr_question_order}
                          textOverrides={draft.ietr_question_text_overrides}
                          onOrderChange={(order) => patch({ ietr_question_order: order })}
                          onTextChange={(code, text) => patch({
                            ietr_question_text_overrides: { ...draft.ietr_question_text_overrides, [code]: text },
                          })}
                          onResetText={(code) => {
                            const next = { ...draft.ietr_question_text_overrides }
                            delete next[code]
                            patch({ ietr_question_text_overrides: next })
                          }}
                        />
                      )}
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
          identificáveis e não podem virar filtro ou gráfico.
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
                </div>

                {card.locked_reason && (
                  <p className="mt-1 text-xs" style={{ color: T.textFaint }}>{card.locked_reason}</p>
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
                      disabled={card.locked || disabled}
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
