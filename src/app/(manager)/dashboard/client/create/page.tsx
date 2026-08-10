'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_COLORS } from '@/lib/brand'
import { useThemeTokens } from '@/lib/theme'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { AlertPresence } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { isRichTextEmpty, sanitizeRichTextHtml } from '@/lib/tcle/rich-text'
import { HSE_CODES } from '@/lib/analytics/hse-definition'
import { IETR_CODES } from '@/lib/analytics/ietr-definition'
import { MENTAL_HEALTH_CODES } from '@/lib/analytics/mental-health-definition'
import { QuestionOrderEditor } from '@/components/mapping/QuestionOrderEditor'
import { MODULE_DEFS, QUESTION_EDITABLE_MODULES } from '@/components/mapping/MappingConfigEditor'

type QuestionEditableModuleKey = keyof typeof QUESTION_EDITABLE_MODULES

type MappingStatus = 'draft' | 'active'
type ManagerRole = 'superuser' | 'admin' | 'manager' | 'analyst' | 'viewer'

type ManagerInput = {
  name: string
  email: string
  role: ManagerRole
}

interface SubmitLikeEvent {
  preventDefault: () => void
}

type CreatedCredential = {
  email: string
  temporary_password: string
}

type TcleFormatState = {
  bold: boolean
  italic: boolean
  underline: boolean
  highlight: boolean
}

type CsvInferenceResponse = {
  ok: boolean
  headers: string[]
  delimiter: string
  suggestions: {
    field_map: Record<string, string>
    credential_candidates: string[]
    credential_column: string | null
    stratification_columns: string[]
    dashboard_filters: string[]
  }
}

type ColumnProfileCard = {
  source_name: string
  display_name: string
  is_dashboard_filter: boolean
  is_demographic: boolean
  locked: boolean
  locked_reason: string | null
}

const STATUS_OPTIONS: ReadonlyArray<{ value: MappingStatus; label: string }> = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'active', label: 'Ativo' },
]

const MANAGER_ROLE_OPTIONS: ReadonlyArray<{ value: ManagerRole; label: string }> = [
  { value: 'superuser', label: 'Superuser (base de trabalhadores, exportações, relatórios)' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Gestor' },
  { value: 'analyst', label: 'Analista' },
  { value: 'viewer', label: 'Visualizador' },
]

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function prettyFieldName(fieldKey: string): string {
  const labels: Record<string, string> = {
    full_name: 'Nome completo',
    cpf: 'CPF',
    employee_code: 'Código/Matrícula',
    email: 'E-mail',
    birth_date: 'Data de nascimento',
    gender: 'Gênero',
    race_color: 'Raça/Cor',
    education_level: 'Escolaridade',
    marital_status: 'Estado civil',
    disability: 'Deficiência',
    disability_type: 'Tipo de deficiência',
    age_range: 'Faixa etária',
  }
  return labels[fieldKey] ?? fieldKey
}

function buildColumnCards(
  headers: string[],
  fieldMap: Record<string, string>,
  credentialColumn: string,
  dashboardFilterSuggestions: string[],
): ColumnProfileCard[] {
  const lockByColumn = new Map<string, string>()

  for (const [field, column] of Object.entries(fieldMap)) {
    if (!column) continue
    lockByColumn.set(column, `Campo padrão: ${prettyFieldName(field)}`)
  }

  if (credentialColumn) {
    lockByColumn.set(credentialColumn, 'Credencial de acesso')
  }

  const demographicFields = new Set([
    'age_range',
    'birth_date',
    'gender',
    'race_color',
    'education_level',
    'marital_status',
    'disability',
    'disability_type',
  ])

  const demographicColumns = new Set(
    Object.entries(fieldMap)
      .filter(([field]) => demographicFields.has(field))
      .map(([, column]) => column),
  )

  const suggestedFilters = new Set(dashboardFilterSuggestions)

  return headers.map((header) => ({
    source_name: header,
    display_name: header,
    is_dashboard_filter: suggestedFilters.has(header),
    is_demographic: demographicColumns.has(header),
    locked: lockByColumn.has(header),
    locked_reason: lockByColumn.get(header) ?? null,
  }))
}

function reapplyColumnLocks(
  cards: ColumnProfileCard[],
  fieldMap: Record<string, string>,
  credentialColumn: string,
): ColumnProfileCard[] {
  const lockByColumn = new Map<string, string>()

  for (const [field, column] of Object.entries(fieldMap)) {
    if (!column) continue
    lockByColumn.set(column, `Campo padrão: ${prettyFieldName(field)}`)
  }

  if (credentialColumn) {
    lockByColumn.set(credentialColumn, 'Credencial de acesso')
  }

  return cards.map((card) => ({
    ...card,
    locked: lockByColumn.has(card.source_name),
    locked_reason: lockByColumn.get(card.source_name) ?? null,
  }))
}

export default function CreateMappingPage() {
  const router = useRouter()
  const T = useThemeTokens()

  const [name, setName] = useState('')
  const [status, setStatus] = useState<MappingStatus>('draft')
  const [tcleText, setTcleText] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [inferLoading, setInferLoading] = useState(false)
  const [inferError, setInferError] = useState('')
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [credentialCandidates, setCredentialCandidates] = useState<string[]>([])
  const [credentialColumn, setCredentialColumn] = useState('')
  const [columnCards, setColumnCards] = useState<ColumnProfileCard[]>([])
  const [selectedModules, setSelectedModules] = useState<string[]>(['sociodemografico', 'hse', 'ietr'])
  const [expandedModule, setExpandedModule] = useState<string | null>(null)
  // Ordem e enunciados por módulo com banco de perguntas — um estado só, para
  // que incluir um novo módulo editável não exija novo par de useState.
  const [questionOrders, setQuestionOrders] = useState<Record<QuestionEditableModuleKey, string[]>>({
    hse: HSE_CODES,
    ietr: IETR_CODES,
    saude_mental: MENTAL_HEALTH_CODES,
  })
  const [questionTexts, setQuestionTexts] = useState<Record<QuestionEditableModuleKey, Record<string, string>>>({
    hse: {},
    ietr: {},
    saude_mental: {},
  })
  const [managers, setManagers] = useState<ManagerInput[]>([{ name: '', email: '', role: 'manager' }])
  const tcleEditorRef = useRef<HTMLDivElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredential[]>([])
  const [tcleFormatState, setTcleFormatState] = useState<TcleFormatState>({
    bold: false,
    italic: false,
    underline: false,
    highlight: false,
  })

  function isSelectionInsideEditor(): boolean {
    if (!tcleEditorRef.current) return false
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return false
    const anchorNode = selection.anchorNode
    return !!anchorNode && tcleEditorRef.current.contains(anchorNode)
  }

  function isHighlightValueActive(value: unknown): boolean {
    if (typeof value !== 'string') return false
    const normalized = value.toLowerCase().replace(/\s+/g, '')
    return normalized.includes('#fde68a') || normalized.includes('rgb(253,230,138)')
  }

  function refreshTcleFormatState() {
    if (!isSelectionInsideEditor()) {
      setTcleFormatState({ bold: false, italic: false, underline: false, highlight: false })
      return
    }

    const hiliteValue = document.queryCommandValue('hiliteColor')
    const backValue = document.queryCommandValue('backColor')

    setTcleFormatState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      highlight: isHighlightValueActive(hiliteValue) || isHighlightValueActive(backValue),
    })
  }

  function updateManager(index: number, patch: Partial<ManagerInput>) {
    setManagers((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  function addManagerRow() {
    setManagers((prev) => [...prev, { name: '', email: '', role: 'manager' }])
  }

  function removeManagerRow(index: number) {
    setManagers((prev) => prev.filter((_, i) => i !== index))
  }

  function updateColumnCard(
    sourceName: string,
    patch: Partial<Pick<ColumnProfileCard, 'display_name' | 'is_dashboard_filter' | 'is_demographic'>>,
  ) {
    setColumnCards((prev) =>
      prev.map((card) => {
        if (card.source_name !== sourceName) return card
        if (card.locked && (patch.is_dashboard_filter !== undefined || patch.is_demographic !== undefined)) {
          return card
        }
        return { ...card, ...patch }
      }),
    )
  }

  function removeColumnCard(sourceName: string) {
    setColumnCards((prev) => prev.filter((card) => card.source_name !== sourceName))
    setDetectedHeaders((prev) => prev.filter((header) => header !== sourceName))
    setColumnMapping((prev) => {
      const next: Record<string, string> = {}
      for (const [field, column] of Object.entries(prev)) {
        if (column === sourceName) continue
        next[field] = column
      }
      return next
    })
    setCredentialCandidates((prev) => prev.filter((candidate) => candidate !== sourceName))
    setCredentialColumn((prev) => (prev === sourceName ? '' : prev))
  }

  function applyTcleCommand(command: 'bold' | 'italic' | 'underline') {
    if (!tcleEditorRef.current) return
    tcleEditorRef.current.focus()
    document.execCommand(command)
    setTcleText(tcleEditorRef.current.innerHTML)
    refreshTcleFormatState()
  }

  function applyTcleHighlight() {
    if (!tcleEditorRef.current) return
    tcleEditorRef.current.focus()
    const shouldRemoveHighlight = tcleFormatState.highlight
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand('hiliteColor', false, shouldRemoveHighlight ? 'transparent' : '#FDE68A')
    document.execCommand('styleWithCSS', false, 'false')
    setTcleText(tcleEditorRef.current.innerHTML)
    refreshTcleFormatState()
  }

  useEffect(() => {
    if (!tcleEditorRef.current) return
    if (tcleEditorRef.current.innerHTML === tcleText) return
    tcleEditorRef.current.innerHTML = tcleText
  }, [tcleText])

  useEffect(() => {
    function handleSelectionChange() {
      refreshTcleFormatState()
    }

    const editor = tcleEditorRef.current
    if (editor) {
      editor.addEventListener('keyup', handleSelectionChange)
      editor.addEventListener('mouseup', handleSelectionChange)
    }
    document.addEventListener('selectionchange', handleSelectionChange)

    return () => {
      if (editor) {
        editor.removeEventListener('keyup', handleSelectionChange)
        editor.removeEventListener('mouseup', handleSelectionChange)
      }
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [])

  const tcleButtonStyle = (active: boolean, isHighlightButton = false): React.CSSProperties => ({
    border: `1px solid ${active ? BRAND_COLORS.primary : T.border}`,
    backgroundColor: active
      ? `${BRAND_COLORS.primary}22`
      : (isHighlightButton ? '#FEF3C7' : T.surface2),
    color: active ? BRAND_COLORS.primary : (isHighlightButton ? '#92400E' : T.text),
  })

  async function handleInferCsvColumns() {
    if (!csvFile) {
      setInferError('Selecione um arquivo CSV para analisar as colunas.')
      return
    }

    setInferLoading(true)
    setInferError('')

    try {
      const formData = new FormData()
      formData.append('file', csvFile)

      const res = await fetch('/api/client/mappings/infer-columns', {
        method: 'POST',
        body: formData,
      })

      const data = (await res.json()) as CsvInferenceResponse | { error?: string }
      if (!res.ok || !('ok' in data)) {
        setInferError((data as { error?: string }).error ?? 'Falha ao analisar CSV.')
        return
      }

      const headers = data.headers ?? []
      const inferredStratifications = data.suggestions.stratification_columns ?? []
      const inferredFilters = data.suggestions.dashboard_filters ?? []
      const inferredCredential = data.suggestions.credential_column ?? ''
      const fieldMap = data.suggestions.field_map ?? {}
      const baseCards = buildColumnCards(
        headers,
        fieldMap,
        inferredCredential,
        inferredFilters,
      )

      // Se a inferência não trouxe filtros, usa estratificações como fallback.
      const cardsWithFallback = inferredFilters.length > 0
        ? baseCards
        : baseCards.map((card) => (
            inferredStratifications.includes(card.source_name)
              ? { ...card, is_dashboard_filter: true }
              : card
          ))

      setDetectedHeaders(headers)
      setColumnMapping(fieldMap)
      setCredentialCandidates((data.suggestions.credential_candidates ?? []).length > 0
        ? data.suggestions.credential_candidates
        : headers)
      setCredentialColumn(inferredCredential)
      setColumnCards(cardsWithFallback)
    } catch {
      setInferError('Erro de conexão ao analisar o CSV.')
    } finally {
      setInferLoading(false)
    }
  }

  useEffect(() => {
    if (!credentialColumn || columnCards.length === 0) return
    setColumnCards((prev) => reapplyColumnLocks(prev, columnMapping, credentialColumn))
  }, [credentialColumn, columnCards.length, columnMapping])

  async function handleSubmit(e: SubmitLikeEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setCreatedCredentials([])

    const csvColumns = columnCards.map((card) => card.source_name)
    const dashboardFilterColumns = columnCards
      .filter((card) => card.is_dashboard_filter)
      .map((card) => card.source_name)
    const demographicColumns = columnCards
      .filter((card) => card.is_demographic)
      .map((card) => card.source_name)
    const columnDisplayNames = Object.fromEntries(
      columnCards.map((card) => [card.source_name, card.display_name.trim() || card.source_name]),
    )
    const cleanManagers = managers
      .map((m) => ({ ...m, name: m.name.trim(), email: m.email.trim().toLowerCase() }))
      .filter((m) => m.name && m.email)

    if (!name.trim()) {
      setError('Informe o nome do mapeamento.')
      return
    }

    if (selectedModules.length === 0) {
      setError('Selecione ao menos um módulo.')
      return
    }

    if (csvColumns.length === 0) {
      setError('Defina ao menos uma coluna para o CSV.')
      return
    }

    setLoading(true)
    try {
      const sanitizedTcle = sanitizeRichTextHtml(tcleText)

      const res = await fetch('/api/client/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          status,
          modules: selectedModules,
          csv_columns: csvColumns,
          tcle_text: isRichTextEmpty(sanitizedTcle) ? '' : sanitizedTcle,
          dashboard_filters: dashboardFilterColumns,
          stratification_columns: dashboardFilterColumns,
          demographic_columns: demographicColumns,
          column_display_names: columnDisplayNames,
          column_profiles: columnCards,
          credential_column: credentialColumn || null,
          column_mapping: columnMapping,
          hse_question_order: questionOrders.hse,
          hse_question_text_overrides: questionTexts.hse,
          ietr_question_order: questionOrders.ietr,
          ietr_question_text_overrides: questionTexts.ietr,
          mental_health_question_order: questionOrders.saude_mental,
          mental_health_question_text_overrides: questionTexts.saude_mental,
          managers: cleanManagers,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Falha ao criar o mapeamento.')
        return
      }

      setSuccess('Mapeamento criado com sucesso!')
      setCreatedCredentials(data.created_manager_credentials ?? [])
      setTimeout(() => {
        router.push('/dashboard/client')
      }, 1300)
    } catch {
      setError('Erro de conexão ao criar mapeamento.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: T.bg, color: T.text }}>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push('/dashboard/client')}
            className="rounded-lg px-3 py-2 text-sm transition-colors"
            style={{ border: `1px solid ${T.border}`, color: T.textMuted, backgroundColor: T.surface }}
          >
            Voltar ao Dashboard
          </button>
          <ThemeToggle />
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold sm:text-3xl">Criar novo mapeamento</h1>
          <p className="mt-2 text-sm" style={{ color: T.textMuted }}>
            Configure módulos, estrutura do CSV, gestores, TCLE e filtros do analytics em uma única etapa.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <section className="rounded-2xl p-4 sm:p-5" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <h2 className="text-lg font-semibold">Dados básicos</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1.5 block" style={{ color: T.textMuted }}>Nome do mapeamento *</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 outline-none"
                  style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2, color: T.text }}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1.5 block" style={{ color: T.textMuted }}>Status inicial</span>
                <Select
                  value={status}
                  onChange={(v) => setStatus(v as MappingStatus)}
                  options={STATUS_OPTIONS}
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl p-4 sm:p-5" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <h2 className="text-lg font-semibold">Módulos e Dashboard</h2>
            <p className="mt-1 text-xs" style={{ color: T.textFaint }}>
              Escolha os módulos do questionário. Em HSE e IETR você pode revisar os domínios, editar o enunciado de cada pergunta e reordená-las arrastando.
            </p>

            <div className="mt-4 space-y-3">
              {MODULE_DEFS.map((mod) => {
                const enabled = selectedModules.includes(mod.key)
                const questionEditor = mod.key in QUESTION_EDITABLE_MODULES
                  ? QUESTION_EDITABLE_MODULES[mod.key as QuestionEditableModuleKey]
                  : null
                const editorKey = mod.key as QuestionEditableModuleKey
                const hasQuestions = questionEditor !== null
                const isExpanded = expandedModule === mod.key

                return (
                  <div key={mod.key} className="rounded-xl p-4" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2 }}>
                    <div className="flex items-start justify-between gap-3">
                      <Checkbox
                        checked={enabled}
                        onChange={() => setSelectedModules((prev) => toggleInList(prev, mod.key))}
                        label={<span className="font-semibold" style={{ color: T.text }}>{mod.title}</span>}
                      />
                      {hasQuestions && (
                        <button
                          type="button"
                          onClick={() => setExpandedModule((prev) => (prev === mod.key ? null : mod.key))}
                          disabled={!enabled}
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
                            order={questionOrders[editorKey]}
                            textOverrides={questionTexts[editorKey]}
                            onOrderChange={(order) => setQuestionOrders((prev) => ({ ...prev, [editorKey]: order }))}
                            onTextChange={(code, text) => setQuestionTexts((prev) => ({
                              ...prev,
                              [editorKey]: { ...prev[editorKey], [code]: text },
                            }))}
                            onResetText={(code) => setQuestionTexts((prev) => {
                              const next = { ...prev[editorKey] }
                              delete next[code]
                              return { ...prev, [editorKey]: next }
                            })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-4">
              <p className="text-sm mb-2" style={{ color: T.textMuted }}>Coluna de credencial de acesso</p>
              <Select
                value={credentialColumn}
                onChange={setCredentialColumn}
                options={credentialCandidates.map((col) => ({ value: col, label: col }))}
                placeholder="Escolha a coluna de credencial"
              />
              <p className="mt-2 text-xs" style={{ color: T.textFaint }}>
                Sugestão automática baseada no cabeçalho do CSV (CPF, matrícula, e-mail).
              </p>
            </div>
          </section>

          <section className="rounded-2xl p-4 sm:p-5" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <h2 className="text-lg font-semibold">Estrutura do CSV</h2>
            <p className="mt-1 text-xs" style={{ color: T.textFaint }}>
              Faça upload da base da empresa para detectar colunas automaticamente.
            </p>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="text-sm">
                <span className="mb-1.5 block" style={{ color: T.textMuted }}>Arquivo CSV da empresa</span>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <div
                  className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5"
                  style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2 }}
                >
                  <button
                    type="button"
                    onClick={() => csvInputRef.current?.click()}
                    className="flex-shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                    style={{ backgroundColor: T.surface, color: T.text, border: `1px solid ${T.border}` }}
                  >
                    Escolher arquivo
                  </button>
                  <span className="truncate text-sm" style={{ color: csvFile ? T.text : T.textFaint }}>
                    {csvFile ? csvFile.name : 'Nenhum arquivo selecionado'}
                  </span>
                </div>
              </div>
              <Button type="button" onClick={handleInferCsvColumns} loading={inferLoading}>
                {inferLoading ? 'Lendo colunas...' : 'Ler colunas do CSV'}
              </Button>
            </div>

            {inferError && (
              <p className="mt-3 text-sm" style={{ color: '#EF4444' }}>{inferError}</p>
            )}

            {Object.keys(columnMapping).length > 0 && (
              <div className="mt-4 rounded-xl p-3" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2 }}>
                <p className="text-xs font-semibold mb-2" style={{ color: T.textFaint }}>Campos padrão reconhecidos</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {Object.entries(columnMapping).map(([field, column]) => (
                    <div key={field} className="text-xs" style={{ color: T.textMuted }}>
                      <strong style={{ color: T.text }}>{field}</strong>: {column}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detectedHeaders.length > 0 && (
              <p className="mt-3 text-xs" style={{ color: T.textFaint }}>
                {detectedHeaders.length} colunas detectadas automaticamente no cabeçalho.
              </p>
            )}

            {columnCards.length > 0 ? (
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {columnCards.map((card) => (
                  <article
                    key={card.source_name}
                    className="rounded-xl p-3"
                    style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2 }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold" style={{ color: T.text }}>
                        {card.source_name}
                      </p>
                      <div className="flex items-center gap-2">
                        {card.locked && (
                          <span
                            className="rounded-full px-2 py-1 text-[11px]"
                            style={{ color: BRAND_COLORS.primary, backgroundColor: `${BRAND_COLORS.primary}22` }}
                          >
                            Bloqueado
                          </span>
                        )}
                        {!card.locked && (
                          <button
                            type="button"
                            onClick={() => removeColumnCard(card.source_name)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                            style={{ color: '#EF4444', backgroundColor: 'transparent' }}
                            title="Desconsiderar esta coluna"
                            aria-label={`Excluir coluna ${card.source_name}`}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#EF444422' }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {card.locked_reason && (
                      <p className="mt-1 text-xs" style={{ color: T.textFaint }}>{card.locked_reason}</p>
                    )}

                    <label htmlFor={`display-${card.source_name}`} className="mt-3 block text-xs" style={{ color: T.textMuted }}>
                      Nome de visualização
                    </label>
                    <input
                      id={`display-${card.source_name}`}
                      value={card.display_name}
                      onChange={(e) => updateColumnCard(card.source_name, { display_name: e.target.value })}
                      className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.text }}
                    />

                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-xs" style={{ color: T.textMuted }}>
                        <input
                          type="checkbox"
                          checked={card.is_dashboard_filter}
                          disabled={card.locked}
                          onChange={(e) => updateColumnCard(card.source_name, { is_dashboard_filter: e.target.checked })}
                        />
                        <span>Filtro no dashboard</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs" style={{ color: T.textMuted }}>
                        <input
                          type="checkbox"
                          checked={card.is_demographic}
                          disabled={card.locked}
                          onChange={(e) => updateColumnCard(card.source_name, { is_demographic: e.target.checked })}
                        />
                        <span>Dado demográfico</span>
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs" style={{ color: T.textFaint }}>
                Faça a leitura do CSV para habilitar a configuração por coluna.
              </p>
            )}
          </section>

          <section className="rounded-2xl p-4 sm:p-5" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <h2 className="text-lg font-semibold">TCLE</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyTcleCommand('bold')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold"
                style={tcleButtonStyle(tcleFormatState.bold)}
                aria-label="Negrito"
                title="Negrito"
                aria-pressed={tcleFormatState.bold}
              >
                <span style={{ fontWeight: 700 }}>B</span>
              </button>
              <button
                type="button"
                onClick={() => applyTcleCommand('italic')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm"
                style={tcleButtonStyle(tcleFormatState.italic)}
                aria-label="Itálico"
                title="Itálico"
                aria-pressed={tcleFormatState.italic}
              >
                <span style={{ fontStyle: 'italic', fontWeight: 600 }}>I</span>
              </button>
              <button
                type="button"
                onClick={() => applyTcleCommand('underline')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm"
                style={tcleButtonStyle(tcleFormatState.underline)}
                aria-label="Sublinhado"
                title="Sublinhado"
                aria-pressed={tcleFormatState.underline}
              >
                <span style={{ textDecoration: 'underline', fontWeight: 600 }}>U</span>
              </button>
              <button
                type="button"
                onClick={applyTcleHighlight}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md"
                style={tcleButtonStyle(tcleFormatState.highlight, true)}
                aria-label="Marca-texto"
                title="Marca-texto"
                aria-pressed={tcleFormatState.highlight}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M15 5l4 4" />
                  <path d="M4 20l5.5-1.5L20 8 16 4 5.5 14.5z" />
                  <path d="M3 21h7" />
                </svg>
              </button>
            </div>
            <div
              ref={tcleEditorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => setTcleText((e.currentTarget as HTMLDivElement).innerHTML)}
              className="mt-2 min-h-[180px] w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2, color: T.text }}
            />
            {isRichTextEmpty(tcleText) && (
              <p className="mt-2 text-xs" style={{ color: T.textFaint }}>
                Dica: selecione um trecho para aplicar formatação como negrito, itálico, sublinhado e marca-texto.
              </p>
            )}
          </section>

          <section className="rounded-2xl p-4 sm:p-5" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Gestores do mapeamento</h2>
              <Button type="button" variant="outline" size="sm" onClick={addManagerRow}>
                Adicionar gestor
              </Button>
            </div>
            <div className="mt-3 space-y-3">
              {managers.map((m, idx) => (
                <div key={`manager-${idx}`} className="grid grid-cols-1 gap-3 rounded-xl p-3 sm:grid-cols-4" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2 }}>
                  <input
                    value={m.name}
                    onChange={(e) => updateManager(idx, { name: e.target.value })}
                    placeholder="Nome"
                    className="rounded-lg px-3 py-2 outline-none"
                    style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.text }}
                  />
                  <input
                    type="email"
                    value={m.email}
                    onChange={(e) => updateManager(idx, { email: e.target.value })}
                    placeholder="email@empresa.com"
                    className="rounded-lg px-3 py-2 outline-none"
                    style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.text }}
                  />
                  <Select
                    value={m.role}
                    onChange={(role) => updateManager(idx, { role: role as ManagerRole })}
                    options={MANAGER_ROLE_OPTIONS}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => removeManagerRow(idx)}
                    disabled={managers.length === 1}
                    style={{ color: BRAND_COLORS.danger }}
                  >
                    Remover
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <AlertPresence show={!!error}>{error}</AlertPresence>
          <AlertPresence show={!!success} tone="success">{success}</AlertPresence>

          {createdCredentials.length > 0 && (
            <section className="rounded-2xl p-4" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
              <h3 className="text-sm font-semibold">Credenciais temporárias geradas</h3>
              <div className="mt-2 space-y-2">
                {createdCredentials.map((cred) => (
                  <div key={cred.email} className="rounded-lg p-3 text-xs" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2, color: T.textMuted }}>
                    <p>Email: {cred.email}</p>
                    <p>Senha temporária: {cred.temporary_password}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="lg" loading={loading}>
              {loading ? 'Criando...' : 'Criar mapeamento'}
            </Button>
          </div>
        </form>
      </div>
    </main>
  )
}
