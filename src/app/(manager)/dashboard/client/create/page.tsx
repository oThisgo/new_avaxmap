'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_COLORS } from '@/lib/brand'

type MappingStatus = 'draft' | 'active'
type ManagerRole = 'admin' | 'manager' | 'analyst' | 'viewer'

type ManagerInput = {
  name: string
  email: string
  role: ManagerRole
}

type CreatedCredential = {
  email: string
  temporary_password: string
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

const MODULE_OPTIONS = [
  { value: 'sociodemografico', label: 'Sociodemográfico' },
  { value: 'hse', label: 'HSE (riscos psicossociais)' },
  { value: 'ietr', label: 'IETR (trabalho remoto)' },
] as const

const STATUS_OPTIONS: ReadonlyArray<{ value: MappingStatus; label: string }> = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'active', label: 'Ativo' },
]

const MANAGER_ROLE_OPTIONS: ReadonlyArray<{ value: ManagerRole; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Gestor' },
  { value: 'analyst', label: 'Analista' },
  { value: 'viewer', label: 'Visualizador' },
]

function StyledDropdown<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  border,
  bg,
  text,
  textMuted,
}: Readonly<{
  value: T
  onChange: (v: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
  placeholder?: string
  border: string
  bg: string
  text: string
  textMuted: string
}>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selected = options.find((opt) => opt.value === value)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors flex items-center justify-between"
        style={{ border: `1px solid ${open ? BRAND_COLORS.primary : border}`, backgroundColor: bg, color: selected ? text : textMuted }}
      >
        <span>{selected?.label ?? placeholder ?? 'Selecione'}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ opacity: 0.55 }}>
          <path d="M6 8L1.5 3.5h9z" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-40 mt-1 w-full rounded-xl py-1"
          style={{ border: `1px solid ${border}`, backgroundColor: bg, boxShadow: '0 10px 30px rgba(0,0,0,0.20)' }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              className="w-full px-3 py-2 text-left text-sm transition-colors"
              style={{ color: opt.value === value ? BRAND_COLORS.primary : text, backgroundColor: 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${BRAND_COLORS.primary}18` }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function parseColumns(input: string): string[] {
  return input
    .split(/\n|,/)
    .map((v) => v.trim())
    .filter(Boolean)
}

export default function CreateMappingPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const T = useMemo(() => ({
    bg: isDark ? BRAND_COLORS.darkBg : BRAND_COLORS.lightBg,
    surface: isDark ? BRAND_COLORS.darkSurface : BRAND_COLORS.lightSurface,
    surface2: isDark ? BRAND_COLORS.darkSurface2 : BRAND_COLORS.lightSurface2,
    border: isDark ? BRAND_COLORS.borderDark : BRAND_COLORS.borderLight,
    text: isDark ? BRAND_COLORS.textLight : BRAND_COLORS.textDark,
    textMuted: isDark ? BRAND_COLORS.textMutedDark : BRAND_COLORS.textMutedLight,
    textFaint: isDark ? BRAND_COLORS.textFaintDark : BRAND_COLORS.textFaintLight,
  }), [isDark])

  const [name, setName] = useState('')
  const [status, setStatus] = useState<MappingStatus>('draft')
  const [tcleText, setTcleText] = useState('')
  const [csvColumnsRaw, setCsvColumnsRaw] = useState('Nome completo\nCPF\nData de nascimento\nE-mail\nArea\nCargo\nGenero\nRaca\nVinculo')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [inferLoading, setInferLoading] = useState(false)
  const [inferError, setInferError] = useState('')
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [credentialCandidates, setCredentialCandidates] = useState<string[]>([])
  const [credentialColumn, setCredentialColumn] = useState('')
  const [stratificationCandidates, setStratificationCandidates] = useState<string[]>([])
  const [stratificationColumns, setStratificationColumns] = useState<string[]>([])
  const [dashboardFilterColumns, setDashboardFilterColumns] = useState<string[]>([])
  const [selectedModules, setSelectedModules] = useState<string[]>(['sociodemografico', 'hse', 'ietr'])
  const [managers, setManagers] = useState<ManagerInput[]>([{ name: '', email: '', role: 'manager' }])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredential[]>([])

  function toggleInList(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
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

  function toggleStratificationColumn(column: string) {
    setStratificationColumns((prev) => {
      const next = prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column]
      setDashboardFilterColumns((filters) => filters.filter((f) => next.includes(f)))
      return next
    })
  }

  function toggleDashboardFilter(column: string) {
    setDashboardFilterColumns((prev) =>
      prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column],
    )
  }

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

      setDetectedHeaders(headers)
      setColumnMapping(data.suggestions.field_map ?? {})
      setCredentialCandidates((data.suggestions.credential_candidates ?? []).length > 0
        ? data.suggestions.credential_candidates
        : headers)
      setCredentialColumn(data.suggestions.credential_column ?? '')
      setStratificationCandidates(inferredStratifications)
      setStratificationColumns(inferredStratifications)
      setDashboardFilterColumns(inferredFilters.filter((f) => inferredStratifications.includes(f)))
      setCsvColumnsRaw(headers.join('\n'))
    } catch {
      setInferError('Erro de conexão ao analisar o CSV.')
    } finally {
      setInferLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setCreatedCredentials([])

    const csvColumns = parseColumns(csvColumnsRaw)
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
      const res = await fetch('/api/client/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          status,
          modules: selectedModules,
          csv_columns: csvColumns,
          tcle_text: tcleText.trim(),
          dashboard_filters: dashboardFilterColumns,
          stratification_columns: stratificationColumns,
          credential_column: credentialColumn || null,
          column_mapping: columnMapping,
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
                <StyledDropdown<MappingStatus>
                  value={status}
                  onChange={setStatus}
                  options={STATUS_OPTIONS}
                  border={T.border}
                  bg={T.surface2}
                  text={T.text}
                  textMuted={T.textMuted}
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl p-4 sm:p-5" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <h2 className="text-lg font-semibold">Módulos e Dashboard</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm mb-2" style={{ color: T.textMuted }}>Módulos incluídos *</p>
                <div className="space-y-2">
                  {MODULE_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedModules.includes(opt.value)}
                        onChange={() => setSelectedModules((prev) => toggleInList(prev, opt.value))}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm mb-2" style={{ color: T.textMuted }}>Coluna de credencial de acesso</p>
                <StyledDropdown<string>
                  value={credentialColumn}
                  onChange={setCredentialColumn}
                  options={credentialCandidates.map((col) => ({ value: col, label: col }))}
                  placeholder="Escolha a coluna de credencial"
                  border={T.border}
                  bg={T.surface2}
                  text={T.text}
                  textMuted={T.textMuted}
                />
                <p className="mt-2 text-xs" style={{ color: T.textFaint }}>
                  Sugestão automática baseada no cabeçalho do CSV (CPF, matrícula, e-mail).
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm mb-2" style={{ color: T.textMuted }}>Estratificações da empresa</p>
                {stratificationCandidates.length === 0 ? (
                  <p className="text-xs" style={{ color: T.textFaint }}>
                    Faça a leitura de um CSV para sugerir estratificações automaticamente.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {stratificationCandidates.map((column) => (
                      <label key={column} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={stratificationColumns.includes(column)}
                          onChange={() => toggleStratificationColumn(column)}
                        />
                        <span>{column}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm mb-2" style={{ color: T.textMuted }}>Filtros no dashboard analítico</p>
                {stratificationColumns.length === 0 ? (
                  <p className="text-xs" style={{ color: T.textFaint }}>
                    Os filtros são derivados das colunas de estratificação selecionadas.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {stratificationColumns.map((column) => (
                      <label key={`filter-${column}`} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={dashboardFilterColumns.includes(column)}
                          onChange={() => toggleDashboardFilter(column)}
                        />
                        <span>{column}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl p-4 sm:p-5" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <h2 className="text-lg font-semibold">Estrutura do CSV</h2>
            <p className="mt-1 text-xs" style={{ color: T.textFaint }}>
              Faça upload da base da empresa para detectar colunas automaticamente.
            </p>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="text-sm">
                <span className="mb-1.5 block" style={{ color: T.textMuted }}>Arquivo CSV da empresa</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2, color: T.text }}
                />
              </label>
              <button
                type="button"
                onClick={handleInferCsvColumns}
                disabled={inferLoading}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: BRAND_COLORS.primary }}
                onMouseEnter={(e) => { if (!inferLoading) e.currentTarget.style.backgroundColor = BRAND_COLORS.primaryHover }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = BRAND_COLORS.primary }}
              >
                {inferLoading ? 'Lendo colunas...' : 'Ler colunas do CSV'}
              </button>
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

            <textarea
              value={csvColumnsRaw}
              onChange={(e) => setCsvColumnsRaw(e.target.value)}
              rows={8}
              className="mt-3 w-full rounded-lg px-3 py-2 outline-none"
              style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2, color: T.text }}
            />
          </section>

          <section className="rounded-2xl p-4 sm:p-5" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <h2 className="text-lg font-semibold">TCLE</h2>
            <textarea
              value={tcleText}
              onChange={(e) => setTcleText(e.target.value)}
              rows={8}
              placeholder="Digite o texto do TCLE para este mapeamento..."
              className="mt-3 w-full rounded-lg px-3 py-2 outline-none"
              style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2, color: T.text }}
            />
          </section>

          <section className="rounded-2xl p-4 sm:p-5" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Gestores do mapeamento</h2>
              <button
                type="button"
                onClick={addManagerRow}
                className="rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ border: `1px solid ${T.border}`, color: T.textMuted, backgroundColor: T.surface2 }}
              >
                Adicionar gestor
              </button>
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
                  <StyledDropdown<ManagerRole>
                    value={m.role}
                    onChange={(role) => updateManager(idx, { role })}
                    options={MANAGER_ROLE_OPTIONS}
                    border={T.border}
                    bg={T.surface}
                    text={T.text}
                    textMuted={T.textMuted}
                  />
                  <button
                    type="button"
                    onClick={() => removeManagerRow(idx)}
                    disabled={managers.length === 1}
                    className="rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                    style={{ border: `1px solid ${T.border}`, color: '#EF4444', backgroundColor: T.surface }}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          </section>

          {error && (
            <div className="rounded-xl p-3 text-sm" style={{ border: '1px solid #ef444466', backgroundColor: '#ef44441a', color: '#ef4444' }}>
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-xl p-3 text-sm" style={{ border: '1px solid #22c55e66', backgroundColor: '#22c55e1a', color: '#22c55e' }}>
              {success}
            </div>
          )}

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
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: BRAND_COLORS.primary }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = BRAND_COLORS.primaryHover }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = BRAND_COLORS.primary }}
            >
              {loading ? 'Criando...' : 'Criar mapeamento'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
