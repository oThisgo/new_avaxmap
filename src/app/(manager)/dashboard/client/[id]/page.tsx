'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_COLORS } from '@/lib/brand'
import { useThemeTokens } from '@/lib/theme'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { AlertPresence } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Modal } from '@/components/ui/modal'
import { HSE_CODES } from '@/lib/analytics/hse-definition'
import { IETR_CODES } from '@/lib/analytics/ietr-definition'
import { MENTAL_HEALTH_CODES } from '@/lib/analytics/mental-health-definition'
import {
  MappingConfigEditor,
  type ColumnProfileDraft,
  type MappingConfigDraft,
} from '@/components/mapping/MappingConfigEditor'
import { MANAGER_ROLE_OPTIONS, managerRoleLabel, type ManagerRole } from '@/lib/mapping/manager-roles'
import { SOCIODEMOGRAPHIC_QUESTION_KEYS } from '@/lib/mapping/sociodemographic-questions'
import { computeColumnLockMaps } from '@/lib/mapping/column-locks'
import { TcleEditor } from '@/components/tcle/TcleEditor'
import { LogoUploadField } from '@/components/mapping/LogoUploadField'
import { normalizeLogoUrl } from '@/lib/mapping/logo'
import { readJsonResponse } from '@/lib/http/read-json-response'
import { isRichTextEmpty, sanitizeRichTextHtml } from '@/lib/tcle/rich-text'

type MappingDetail = {
  id: string
  name: string
  slug: string
  description: string | null
  status: 'draft' | 'active' | 'archived'
  module_type: 'HSE' | 'REMOTE' | null
  is_demo: boolean
  created_at: string
  updated_at: string
  config: Record<string, unknown> | null
  tcle_text: string | null
  logo_url: string | null
  csv_columns: string[] | null
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const list = value.filter((v): v is string => typeof v === 'string')
  return list.length > 0 ? list : fallback
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

/**
 * Reconstrói o rascunho editável a partir do `config` persistido. Mapeamentos
 * criados antes da configuração por coluna (ou semeados direto no banco) não têm
 * `column_profiles` — nesse caso as colunas conhecidas do CSV viram cards.
 */
function buildDraftFromConfig(mapping: MappingDetail): MappingConfigDraft {
  const config = mapping.config ?? {}
  const csvColumns = Array.isArray(mapping.csv_columns) ? mapping.csv_columns : []

  const rawProfiles = Array.isArray(config.column_profiles) ? config.column_profiles : []
  const dashboardFilters = new Set(asStringArray(config.dashboard_filters, []))
  const demographicColumns = new Set(asStringArray(config.demographic_columns, []))
  const displayNames = asStringRecord(config.column_display_names)
  const columnMapping = asStringRecord(config.column_mapping)
  const credentialColumn = typeof config.credential_column === 'string' ? config.credential_column : ''

  // Recalculado a partir de column_mapping (não do `locked`/`locked_reason`
  // persistido) para que mapeamentos criados antes da distinção entre
  // bloqueio de identidade e bloqueio sociodemográfico (ver
  // src/lib/mapping/column-locks.ts) já abram com o filtro liberado nas
  // colunas sociodemográficas reconhecidas, sem precisar reenviar o CSV.
  const { identityLockByColumn, demographicLockByColumn } = computeColumnLockMaps(columnMapping, credentialColumn)

  const profiles: ColumnProfileDraft[] = rawProfiles.length > 0
    ? rawProfiles.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return []
        const row = raw as Record<string, unknown>
        const sourceName = typeof row.source_name === 'string' ? row.source_name : ''
        if (!sourceName) return []
        const isDemographicLocked = demographicLockByColumn.has(sourceName)
        return [{
          source_name: sourceName,
          display_name: typeof row.display_name === 'string' && row.display_name.trim()
            ? row.display_name
            : sourceName,
          is_dashboard_filter: row.is_dashboard_filter === true,
          is_demographic: isDemographicLocked ? true : row.is_demographic === true,
          locked: identityLockByColumn.has(sourceName),
          locked_reason: identityLockByColumn.get(sourceName) ?? null,
          demographic_locked: isDemographicLocked,
          demographic_locked_reason: demographicLockByColumn.get(sourceName) ?? null,
        }]
      })
    : csvColumns.map((column) => ({
        source_name: column,
        display_name: displayNames[column] ?? column,
        is_dashboard_filter: dashboardFilters.has(column),
        is_demographic: demographicLockByColumn.has(column) ? true : demographicColumns.has(column),
        locked: identityLockByColumn.has(column),
        locked_reason: identityLockByColumn.get(column) ?? null,
        demographic_locked: demographicLockByColumn.has(column),
        demographic_locked_reason: demographicLockByColumn.get(column) ?? null,
      }))

  return {
    modules: asStringArray(config.modules, ['sociodemografico', 'hse', 'ietr']),
    credential_column: typeof config.credential_column === 'string' ? config.credential_column : '',
    column_profiles: profiles,
    sociodemographic_questions: asStringArray(config.sociodemographic_questions, [...SOCIODEMOGRAPHIC_QUESTION_KEYS]),
    hse_question_order: asStringArray(config.hse_question_order, [...HSE_CODES]),
    hse_question_text_overrides: asStringRecord(config.hse_question_text_overrides),
    ietr_question_order: asStringArray(config.ietr_question_order, [...IETR_CODES]),
    ietr_question_text_overrides: asStringRecord(config.ietr_question_text_overrides),
    mental_health_question_order: asStringArray(config.mental_health_question_order, [...MENTAL_HEALTH_CODES]),
    mental_health_question_text_overrides: asStringRecord(config.mental_health_question_text_overrides),
  }
}

type ManagerRow = {
  id: string
  name: string
  email: string
  mapping_role: string
  is_active: boolean
  temp_password_plain: string | null
  must_change_password: boolean
}


const STATUS_LABELS: Record<MappingDetail['status'], string> = {
  draft: 'Rascunho',
  active: 'Ativo',
  archived: 'Arquivado',
}

const STATUS_OPTIONS: ReadonlyArray<{ value: MappingDetail['status']; label: string }> = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'active', label: 'Ativo' },
  { value: 'archived', label: 'Arquivado' },
]

export default function MappingConfigPage() {
  const params = useParams<{ id: string }>()
  const mappingId = params.id
  const router = useRouter()
  const T = useThemeTokens()

  const [mapping, setMapping] = useState<MappingDetail | null>(null)
  const [managers, setManagers] = useState<ManagerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ManagerRole>('viewer')
  const [submitting, setSubmitting] = useState(false)
  const [temporaryPassword, setTemporaryPassword] = useState('')

  const [statusDraft, setStatusDraft] = useState<MappingDetail['status']>('draft')
  const [statusSaving, setStatusSaving] = useState(false)

  const [configDraft, setConfigDraft] = useState<MappingConfigDraft | null>(null)
  const [configBaseline, setConfigBaseline] = useState<string>('')
  const [configSaving, setConfigSaving] = useState(false)
  const [configSuccess, setConfigSuccess] = useState('')

  const [tcleDraft, setTcleDraft] = useState('')
  const [tcleBaseline, setTcleBaseline] = useState('')
  const [tcleSaving, setTcleSaving] = useState(false)
  const [tcleSuccess, setTcleSuccess] = useState('')
  const [logoDraft, setLogoDraft] = useState<string | null>(null)
  const [logoBaseline, setLogoBaseline] = useState<string | null>(null)
  const [logoSaving, setLogoSaving] = useState(false)
  const [logoSuccess, setLogoSuccess] = useState('')

  const [openingMapping, setOpeningMapping] = useState(false)

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function handleOpenMapping(slug: string) {
    setError('')
    setOpeningMapping(true)
    try {
      const res = await fetch('/api/auth/manager/enter-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping_slug: slug }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível abrir o mapeamento.')
        setOpeningMapping(false)
        return
      }
      router.push(`/mapeamento/${slug}/dashboard`)
    } catch {
      setError('Erro de conexão ao abrir o mapeamento.')
      setOpeningMapping(false)
    }
  }

  const configDirty = configDraft !== null && JSON.stringify(configDraft) !== configBaseline
  const tcleDirty = tcleDraft !== tcleBaseline
  const logoDirty = logoDraft !== logoBaseline

  async function loadMapping() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/client/mappings/${mappingId}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível carregar o mapeamento.')
        return
      }
      setMapping(data.mapping ?? null)
      setManagers(data.managers ?? [])
      if (data.mapping?.status) setStatusDraft(data.mapping.status)
      if (data.mapping) {
        const draft = buildDraftFromConfig(data.mapping as MappingDetail)
        setConfigDraft(draft)
        setConfigBaseline(JSON.stringify(draft))

        const tcleText = typeof data.mapping.tcle_text === 'string' ? data.mapping.tcle_text : ''
        setTcleDraft(tcleText)
        setTcleBaseline(tcleText)

        const logo = normalizeLogoUrl(data.mapping.logo_url)
        setLogoDraft(logo)
        setLogoBaseline(logo)
      }
    } catch {
      setError('Erro de conexão ao carregar o mapeamento.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveConfig() {
    if (!configDraft || !mapping) return

    if (configDraft.modules.length === 0) {
      setError('Selecione ao menos um módulo para o mapeamento.')
      return
    }

    const removedModules = asStringArray(mapping.config?.modules, [])
      .filter((mod) => !configDraft.modules.includes(mod))

    if (removedModules.length > 0) {
      const confirmed = window.confirm(
        `Você está removendo ${removedModules.length === 1 ? 'o módulo' : 'os módulos'}: ${removedModules.join(', ')}.\n\n` +
        'As respostas já coletadas permanecem no banco, mas deixam de aparecer no formulário, ' +
        'no dashboard e nos relatórios.\n\nDeseja continuar?',
      )
      if (!confirmed) return
    }

    setError('')
    setConfigSuccess('')
    setConfigSaving(true)

    try {
      // Sem cards de coluna não há de onde derivar filtros/demográficos: nesse caso
      // os valores já persistidos são reenviados intactos, senão salvar apenas os
      // módulos zeraria a configuração de dashboard do mapeamento.
      const hasColumnCards = configDraft.column_profiles.length > 0
      const preservedSelections = hasColumnCards ? {} : {
        dashboard_filters: asStringArray(mapping.config?.dashboard_filters, []),
        demographic_columns: asStringArray(mapping.config?.demographic_columns, []),
        stratification_columns: asStringArray(mapping.config?.stratification_columns, []),
      }

      const res = await fetch(`/api/client/mappings/${mappingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_config: true,
          modules: configDraft.modules,
          credential_column: configDraft.credential_column,
          column_profiles: configDraft.column_profiles,
          ...preservedSelections,
          column_display_names: Object.fromEntries(
            configDraft.column_profiles.map((card) => [card.source_name, card.display_name]),
          ),
          // Preservado da configuração atual: o vínculo header do CSV -> campo
          // canônico não é editável aqui e não pode ser perdido no PATCH.
          column_mapping: mapping.config?.column_mapping ?? {},
          csv_columns: mapping.csv_columns ?? [],
          sociodemographic_questions: configDraft.sociodemographic_questions,
          hse_question_order: configDraft.hse_question_order,
          hse_question_text_overrides: configDraft.hse_question_text_overrides,
          ietr_question_order: configDraft.ietr_question_order,
          ietr_question_text_overrides: configDraft.ietr_question_text_overrides,
          mental_health_question_order: configDraft.mental_health_question_order,
          mental_health_question_text_overrides: configDraft.mental_health_question_text_overrides,
        }),
      })
      const result = await readJsonResponse(res, 'Não foi possível salvar a configuração.')
      if (!result.ok) {
        setError(result.error)
        return
      }
      setConfigSuccess('Configuração salva. As mudanças já valem para o formulário, o dashboard e os relatórios.')
      await loadMapping()
    } catch {
      setError('Erro de conexão ao salvar a configuração.')
    } finally {
      setConfigSaving(false)
    }
  }

  async function handleSaveLogo() {
    if (!logoDirty) return
    setError('')
    setLogoSuccess('')
    setLogoSaving(true)
    try {
      const res = await fetch(`/api/client/mappings/${mappingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // String vazia é como a API entende "remover a logo".
        body: JSON.stringify({ logo_url: logoDraft ?? '' }),
      })
      const result = await readJsonResponse(res, 'Não foi possível salvar a logo.')
      if (!result.ok) {
        setError(result.error)
        return
      }
      setLogoSuccess(
        logoDraft
          ? 'Logo salva. Ela já aparece nas telas deste mapeamento.'
          : 'Logo removida das telas deste mapeamento.',
      )
      await loadMapping()
    } catch {
      setError('Erro de conexão ao salvar a logo.')
    } finally {
      setLogoSaving(false)
    }
  }

  async function handleSaveTcle() {
    if (!tcleDirty) return
    setError('')
    setTcleSuccess('')
    setTcleSaving(true)
    try {
      const sanitized = sanitizeRichTextHtml(tcleDraft)
      const res = await fetch(`/api/client/mappings/${mappingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tcle_text: isRichTextEmpty(sanitized) ? '' : sanitized }),
      })
      const result = await readJsonResponse(res, 'Não foi possível salvar o TCLE.')
      if (!result.ok) {
        setError(result.error)
        return
      }
      setTcleSuccess('TCLE salvo. Novos acessos ao formulário já veem o texto atualizado.')
      await loadMapping()
    } catch {
      setError('Erro de conexão ao salvar o TCLE. A requisição não chegou a receber resposta do servidor.')
    } finally {
      setTcleSaving(false)
    }
  }

  useEffect(() => {
    if (mappingId) loadMapping()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappingId])

  async function handleSaveStatus() {
    if (!mapping || statusDraft === mapping.status) return
    setError('')
    setStatusSaving(true)
    try {
      const res = await fetch(`/api/client/mappings/${mappingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusDraft }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível atualizar o status.')
        return
      }
      await loadMapping()
    } catch {
      setError('Erro de conexão ao atualizar o status.')
    } finally {
      setStatusSaving(false)
    }
  }

  function openDeleteModal() {
    setDeleteConfirmText('')
    setDeleteError('')
    setDeleteModalOpen(true)
  }

  async function handleDeleteMapping() {
    if (!mapping) return
    setDeleteError('')
    setDeleting(true)
    try {
      const res = await fetch(`/api/client/mappings/${mappingId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_name: deleteConfirmText.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDeleteError(data.error ?? 'Não foi possível excluir o mapeamento.')
        return
      }
      router.push('/dashboard/client')
    } catch {
      setDeleteError('Erro de conexão ao excluir o mapeamento.')
    } finally {
      setDeleting(false)
    }
  }

  async function handleAddManager(e: { preventDefault: () => void }) {
    e.preventDefault()
    setError('')
    setTemporaryPassword('')

    if (!name.trim() || !email.trim()) {
      setError('Nome e e-mail são obrigatórios.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/mappings/${mappingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível adicionar o gestor.')
        return
      }

      if (data.created_manager_credential?.temporary_password) {
        setTemporaryPassword(data.created_manager_credential.temporary_password)
      }
      setName('')
      setEmail('')
      setRole('viewer')
      await loadMapping()
    } catch {
      setError('Erro de conexão ao adicionar gestor.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetCode(managerId: string) {
    setError('')
    setTemporaryPassword('')
    try {
      const res = await fetch(`/api/client/mappings/${mappingId}/managers/${managerId}/reset-code`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Falha ao redefinir código de acesso.')
        return
      }
      setTemporaryPassword(data.temporary_password ?? '')
      await loadMapping()
    } catch {
      setError('Erro de conexão ao redefinir código de acesso.')
    }
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: T.bg, color: T.text }}>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard/client')}
              className="flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: T.textMuted }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Meus mapeamentos
            </button>
            <span style={{ color: T.border }}>/</span>
            <span className="text-sm" style={{ color: T.text }}>Configuração do mapeamento</span>
          </div>
          <ThemeToggle />
        </div>

        {loading && (
          <div className="flex flex-col gap-6">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        )}

        {!loading && error && !mapping && <AlertPresence show>{error}</AlertPresence>}

        {!loading && mapping && (
          <>
            <Card className="mb-6 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold sm:text-2xl">{mapping.name}</h1>
                <Badge>{STATUS_LABELS[mapping.status]}</Badge>
                {mapping.is_demo && <Badge tone="primary">Demo</Badge>}
              </div>
              <p className="mt-2 text-sm" style={{ color: T.textMuted }}>
                {mapping.description ?? 'Sem descrição.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs" style={{ color: T.textFaint }}>
                <span>Slug: {mapping.slug}</span>
                <span>{mapping.module_type ?? 'Configuração customizada'}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <Button onClick={() => handleOpenMapping(mapping.slug)} loading={openingMapping}>
                  {openingMapping ? 'Abrindo...' : 'Abrir mapeamento'}
                </Button>

                <div className="flex items-end gap-2">
                  <label className="text-sm">
                    <span className="mb-1.5 block text-xs" style={{ color: T.textMuted }}>Status do mapeamento</span>
                    <Select
                      className="w-44"
                      value={statusDraft}
                      onChange={(v) => setStatusDraft(v as MappingDetail['status'])}
                      options={STATUS_OPTIONS}
                    />
                  </label>
                  <Button
                    variant="outline"
                    onClick={handleSaveStatus}
                    disabled={statusSaving || statusDraft === mapping.status}
                    loading={statusSaving}
                  >
                    {statusSaving ? 'Salvando...' : 'Salvar status'}
                  </Button>
                </div>
              </div>
            </Card>

            <AlertPresence show={!!error}>{error}</AlertPresence>

            {temporaryPassword && (
              <div className="rounded-lg px-4 py-3 mb-6 mt-4" style={{ backgroundColor: `${BRAND_COLORS.primary}22`, border: `1px solid ${BRAND_COLORS.primary}66` }}>
                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: T.textFaint }}>Código de acesso gerado</p>
                <p className="text-lg font-semibold" style={{ color: BRAND_COLORS.primary }}>{temporaryPassword}</p>
                <p className="text-xs mt-1" style={{ color: T.textMuted }}>
                  Entregue esse código ao gestor. No primeiro login ele será obrigado a definir a senha definitiva.
                </p>
              </div>
            )}

            {configDraft && (
              <Card className="mb-6 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold mb-1">Configuração do questionário e do dashboard</h2>
                    <p className="text-sm" style={{ color: T.textMuted }}>
                      Alterações valem imediatamente para novos acessos ao formulário, para o dashboard
                      e para os relatórios gerados.
                    </p>
                  </div>
                  <Button
                    onClick={handleSaveConfig}
                    disabled={!configDirty || configSaving}
                    loading={configSaving}
                  >
                    {configSaving ? 'Salvando...' : 'Salvar configuração'}
                  </Button>
                </div>

                {configSuccess && (
                  <div
                    className="mt-4 rounded-lg px-4 py-3 text-sm"
                    style={{
                      backgroundColor: `${BRAND_COLORS.primary}18`,
                      border: `1px solid ${BRAND_COLORS.primary}55`,
                      color: T.text,
                    }}
                  >
                    {configSuccess}
                  </div>
                )}

                <div className="mt-5">
                  <MappingConfigEditor
                    draft={configDraft}
                    onChange={(next) => {
                      setConfigDraft(next)
                      setConfigSuccess('')
                    }}
                    credentialCandidates={mapping.csv_columns ?? []}
                    columnMapping={(mapping.config?.column_mapping as Record<string, string> | undefined) ?? {}}
                    disabled={configSaving}
                  />
                </div>
              </Card>
            )}

            <Card className="mb-6 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Logo da empresa</h2>
                  <p className="text-sm" style={{ color: T.textMuted }}>
                    Marca do cliente exibida junto da BeeTouch nas telas deste mapeamento.
                  </p>
                </div>
                <Button
                  onClick={handleSaveLogo}
                  disabled={!logoDirty || logoSaving}
                  loading={logoSaving}
                >
                  {logoSaving ? 'Salvando...' : 'Salvar logo'}
                </Button>
              </div>

              {logoSuccess && (
                <div
                  className="mt-4 rounded-lg px-4 py-3 text-sm"
                  style={{
                    backgroundColor: `${BRAND_COLORS.primary}18`,
                    border: `1px solid ${BRAND_COLORS.primary}55`,
                    color: T.text,
                  }}
                >
                  {logoSuccess}
                </div>
              )}

              <div className="mt-4">
                <LogoUploadField
                  value={logoDraft}
                  onChange={(next) => {
                    setLogoDraft(next)
                    setLogoSuccess('')
                  }}
                  disabled={logoSaving}
                />
              </div>
            </Card>

            <Card className="mb-6 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold mb-1">TCLE</h2>
                  <p className="text-sm" style={{ color: T.textMuted }}>
                    Termo de Consentimento Livre e Esclarecido exibido ao colaborador antes de responder
                    o formulário. Alterações valem para novos acessos — quem já aceitou o termo não
                    precisa aceitar de novo.
                  </p>
                </div>
                <Button
                  onClick={handleSaveTcle}
                  disabled={!tcleDirty || tcleSaving}
                  loading={tcleSaving}
                >
                  {tcleSaving ? 'Salvando...' : 'Salvar TCLE'}
                </Button>
              </div>

              {tcleSuccess && (
                <div
                  className="mt-4 rounded-lg px-4 py-3 text-sm"
                  style={{
                    backgroundColor: `${BRAND_COLORS.primary}18`,
                    border: `1px solid ${BRAND_COLORS.primary}55`,
                    color: T.text,
                  }}
                >
                  {tcleSuccess}
                </div>
              )}

              <div className="mt-4">
                <TcleEditor
                  value={tcleDraft}
                  onChange={(next) => {
                    setTcleDraft(next)
                    setTcleSuccess('')
                  }}
                  disabled={tcleSaving}
                />
              </div>
            </Card>

            <Card className="mb-6 p-5">
              <h2 className="text-lg font-semibold mb-1">Gestores cadastrados</h2>
              <p className="text-sm mb-4" style={{ color: T.textMuted }}>
                Emails e códigos de acesso dos gestores vinculados a este mapeamento.
              </p>

              {/* Tabela — telas médias/grandes */}
              <div className="hidden md:block overflow-x-auto rounded-lg" style={{ border: `1px solid ${T.border}` }}>
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: T.surface2 }}>
                    <tr>
                      <th className="text-left px-3 py-2">Nome</th>
                      <th className="text-left px-3 py-2">E-mail</th>
                      <th className="text-left px-3 py-2">Perfil</th>
                      <th className="text-left px-3 py-2">Código de acesso</th>
                      <th className="text-left px-3 py-2">Primeiro acesso</th>
                      <th className="text-left px-3 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managers.map((m) => (
                      <tr key={m.id} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td className="px-3 py-2">{m.name}</td>
                        <td className="px-3 py-2" style={{ color: T.textMuted }}>{m.email}</td>
                        <td className="px-3 py-2">{managerRoleLabel(m.mapping_role)}</td>
                        <td className="px-3 py-2">
                          {m.temp_password_plain ? (
                            <span className="font-mono text-xs px-2 py-1 rounded-md" style={{ backgroundColor: `${BRAND_COLORS.primary}15`, color: BRAND_COLORS.primary, border: `1px solid ${BRAND_COLORS.primary}40` }}>
                              {m.temp_password_plain}
                            </span>
                          ) : (
                            <span style={{ color: T.textFaint }}>—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={m.must_change_password ? 'primary' : 'success'}>
                            {m.must_change_password ? 'Pendente' : 'Concluído'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Button variant="outline" size="sm" onClick={() => handleResetCode(m.id)}>
                            Redefinir código
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {managers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center" style={{ color: T.textFaint }}>
                          Nenhum gestor vinculado a este mapeamento.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Cards — mobile */}
              <div className="md:hidden flex flex-col gap-3">
                {managers.map((m) => (
                  <div key={m.id} className="rounded-lg p-3" style={{ border: `1px solid ${T.border}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: T.text }}>{m.name}</p>
                        <p className="text-xs" style={{ color: T.textMuted }}>{m.email}</p>
                      </div>
                      <Badge tone={m.must_change_password ? 'primary' : 'success'}>
                        {m.must_change_password ? 'Pendente' : 'Concluído'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs" style={{ color: T.textFaint }}>Perfil: <span style={{ color: T.text }}>{managerRoleLabel(m.mapping_role)}</span></p>
                    {m.temp_password_plain && (
                      <span className="mt-2 inline-block font-mono text-xs px-2 py-1 rounded-md" style={{ backgroundColor: `${BRAND_COLORS.primary}15`, color: BRAND_COLORS.primary, border: `1px solid ${BRAND_COLORS.primary}40` }}>
                        {m.temp_password_plain}
                      </span>
                    )}
                    <div className="mt-3">
                      <Button variant="outline" size="sm" onClick={() => handleResetCode(m.id)}>
                        Redefinir código
                      </Button>
                    </div>
                  </div>
                ))}
                {managers.length === 0 && (
                  <p className="text-center text-sm py-6" style={{ color: T.textFaint }}>Nenhum gestor vinculado a este mapeamento.</p>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="text-lg font-semibold mb-1">Adicionar gestor</h2>
              <p className="text-sm mb-4" style={{ color: T.textMuted }}>
                O sistema vai gerar um código de acesso temporário para o primeiro login.
              </p>

              <form onSubmit={handleAddManager} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome"
                  required
                />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@empresa.com"
                  required
                />
                <Select
                  value={role}
                  onChange={(v) => setRole(v as ManagerRole)}
                  options={MANAGER_ROLE_OPTIONS.map(({ value, label }) => ({ value, label }))}
                />
                <Button type="submit" loading={submitting}>
                  {submitting ? 'Adicionando...' : 'Adicionar gestor'}
                </Button>
              </form>
              <p className="mt-3 text-xs" style={{ color: T.textFaint }}>
                {MANAGER_ROLE_OPTIONS.find((opt) => opt.value === role)?.description}
              </p>
            </Card>

            <Card className="mt-6 p-5" style={{ border: `1px solid ${BRAND_COLORS.danger}66` }}>
              <h2 className="text-lg font-semibold mb-1" style={{ color: BRAND_COLORS.danger }}>Zona de risco</h2>
              <p className="text-sm mb-4" style={{ color: T.textMuted }}>
                Excluir o mapeamento apaga permanentemente todos os colaboradores, respostas e vínculos
                de gestores com ele. Gestores que também atuam em outros mapeamentos continuam com
                acesso a eles — só o vínculo com este mapeamento é removido. Essa ação não pode ser desfeita.
              </p>
              <Button
                variant="outline"
                style={{ color: BRAND_COLORS.danger }}
                onClick={openDeleteModal}
              >
                Excluir mapeamento
              </Button>
            </Card>
          </>
        )}
      </div>

      <Modal open={deleteModalOpen} onClose={deleting ? undefined : () => setDeleteModalOpen(false)}>
        <h2 className="text-lg font-semibold" style={{ color: BRAND_COLORS.danger }}>Excluir mapeamento</h2>
        <p className="mt-2 text-sm" style={{ color: T.textMuted }}>
          Isso apaga permanentemente <strong>{mapping?.name}</strong> e todos os colaboradores, respostas
          e vínculos de gestores ligados a ele. Não há como desfazer.
        </p>
        <label className="mt-4 block text-sm">
          <span className="mb-1.5 block text-xs" style={{ color: T.textMuted }}>
            Digite <strong>{mapping?.name}</strong> para confirmar
          </span>
          <Input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={mapping?.name}
            disabled={deleting}
          />
        </label>

        <AlertPresence show={!!deleteError}>{deleteError}</AlertPresence>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteMapping}
            disabled={deleting || deleteConfirmText.trim() !== mapping?.name}
            loading={deleting}
          >
            {deleting ? 'Excluindo...' : 'Excluir permanentemente'}
          </Button>
        </div>
      </Modal>
    </main>
  )
}
