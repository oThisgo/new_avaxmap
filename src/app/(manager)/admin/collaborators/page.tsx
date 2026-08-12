'use client'

import { useCallback, useEffect, useRef, useState, DragEvent } from 'react'
import { useRouter } from 'next/navigation'
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

interface UploadResult {
  ok: boolean
  total: number
  inserted: number
  updated: number
  parse_errors: string[]
}

type RosterColumn = { key: string; label: string }
type OmittedColumn = { label: string; reason: string }

type RosterRow = {
  id: string
  values: Record<string, string | null>
  has_answered: boolean
  answered_at: string | null
  has_response_record: boolean
}

type RosterResponse = {
  columns: RosterColumn[]
  omitted_columns: OmittedColumn[]
  rows: RosterRow[]
  total: number
  total_answered: number
  page: number
  page_size: number
  page_count: number
  can_delete: boolean
}

type PendingConfirm = { id: string; action: 'collaborator' | 'response' }

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'answered', label: 'Responderam' },
  { value: 'pending', label: 'Pendentes' },
]

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function CollaboratorsPage() {
  const router = useRouter()
  const T = useThemeTokens()
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)

  const [roster, setRoster] = useState<RosterResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)

  const [confirming, setConfirming] = useState<PendingConfirm | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadRoster = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), status })
      if (appliedSearch) params.set('search', appliedSearch)

      const res = await fetch(`/api/admin/collaborators?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Falha ao carregar os colaboradores.')
        setRoster(null)
        return
      }
      setRoster(data as RosterResponse)
    } catch {
      setError('Erro de conexão ao carregar os colaboradores.')
      setRoster(null)
    } finally {
      setLoading(false)
    }
  }, [appliedSearch, page, status])

  useEffect(() => {
    loadRoster()
  }, [loadRoster])

  // Debounce da busca: evita uma requisição por tecla digitada.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  function selectFile(picked: File | undefined | null) {
    if (!picked) return
    if (!picked.name.toLowerCase().endsWith('.csv')) {
      setError('Apenas arquivos .csv são aceitos.')
      return
    }
    setFile(picked)
    setUploadResult(null)
    setError('')
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    selectFile(e.dataTransfer.files[0])
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError('')
    setNotice('')
    setUploadResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/admin/upload-collaborators', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao importar.')
        return
      }
      setUploadResult(data)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      setPage(1)
      await loadRoster()
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(target: PendingConfirm) {
    setError('')
    setNotice('')
    setDeletingId(target.id)
    try {
      const url = target.action === 'collaborator'
        ? `/api/admin/collaborators/${target.id}`
        : `/api/admin/collaborators/${target.id}/response`

      const res = await fetch(url, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível concluir a exclusão.')
        return
      }

      setNotice(
        target.action === 'collaborator'
          ? 'Colaborador excluído da base deste mapeamento.'
          : 'Resposta excluída. O colaborador já pode responder novamente.',
      )
      setConfirming(null)
      await loadRoster()
    } catch {
      setError('Erro de conexão ao excluir.')
    } finally {
      setDeletingId(null)
    }
  }

  const columns = roster?.columns ?? []
  const rows = roster?.rows ?? []
  const canDelete = roster?.can_delete ?? false
  const pending = roster ? roster.total - roster.total_answered : 0

  function renderActions(row: RosterRow) {
    if (!canDelete) return <span className="text-xs" style={{ color: T.textFaint }}>—</span>

    const isConfirmingThis = confirming?.id === row.id
    if (isConfirmingThis && confirming) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: BRAND_COLORS.danger }}>
            {confirming.action === 'collaborator' ? 'Excluir colaborador?' : 'Excluir resposta?'}
          </span>
          <Button
            variant="danger"
            size="sm"
            loading={deletingId === row.id}
            onClick={() => handleDelete(confirming)}
          >
            Confirmar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirming(null)}>
            Cancelar
          </Button>
        </div>
      )
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        {row.has_answered && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirming({ id: row.id, action: 'response' })}
          >
            Excluir resposta
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirming({ id: row.id, action: 'collaborator' })}
          style={{ color: BRAND_COLORS.danger, borderColor: `${BRAND_COLORS.danger}66` }}
        >
          Excluir
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8" style={{ backgroundColor: T.bg, color: T.text }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: T.textMuted }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Dashboard
            </button>
            <span style={{ color: T.border }}>/</span>
            <span className="text-sm" style={{ color: T.text }}>Colaboradores</span>
          </div>
          <ThemeToggle />
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Colaboradores</h1>
          <p className="mt-1 text-sm" style={{ color: T.textMuted }}>
            Base de colaboradores deste mapeamento: quem está cadastrado, quem já respondeu e quando.
          </p>
        </div>

        <AlertPresence show={!!error}>{error}</AlertPresence>
        <AlertPresence show={!!notice} tone="success">{notice}</AlertPresence>

        {/* Resumo */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Cadastrados', value: roster?.total ?? 0, color: T.text },
            { label: 'Responderam', value: roster?.total_answered ?? 0, color: BRAND_COLORS.success },
            { label: 'Pendentes', value: pending, color: BRAND_COLORS.primary },
          ].map((stat) => (
            <Card key={stat.label} className="p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
              <p className="mt-0.5 text-xs" style={{ color: T.textMuted }}>{stat.label}</p>
            </Card>
          ))}
        </div>

        {/* Importação */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Importar base (CSV)</h2>
          <p className="mt-1 text-sm" style={{ color: T.textMuted }}>
            O parser usa o cabeçalho do CSV e a configuração salva do mapeamento. Cadastros existentes são
            atualizados sem resetar quem já respondeu.
          </p>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
            className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl p-8 transition-colors"
            style={{
              backgroundColor: dragging ? T.surface2 : T.surface,
              border: `2px dashed ${dragging ? BRAND_COLORS.primary : file ? BRAND_COLORS.success : T.border}`,
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => selectFile(e.target.files?.[0])}
            />
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={file ? BRAND_COLORS.success : T.textFaint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            {file ? (
              <div className="text-center">
                <p className="font-medium" style={{ color: BRAND_COLORS.success }}>{file.name}</p>
                <p className="mt-0.5 text-xs" style={{ color: T.textMuted }}>
                  {(file.size / 1024).toFixed(1)} KB — clique para trocar
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: T.textMuted }}>Arraste o CSV aqui ou clique para selecionar</p>
                <p className="mt-0.5 text-xs" style={{ color: T.textFaint }}>Apenas .csv</p>
              </div>
            )}
          </div>

          <Button onClick={handleUpload} disabled={!file || uploading} loading={uploading} className="mt-4">
            {uploading ? 'Importando...' : 'Importar colaboradores'}
          </Button>

          {uploadResult && (
            <div className="mt-4 rounded-xl p-4" style={{ backgroundColor: T.surface2, border: `1px solid ${BRAND_COLORS.success}40` }}>
              <p className="font-semibold" style={{ color: BRAND_COLORS.success }}>Importação concluída</p>
              <p className="mt-1 text-sm" style={{ color: T.textMuted }}>
                {uploadResult.total} processado(s) · {uploadResult.inserted} novo(s) · {uploadResult.updated} atualizado(s)
              </p>
              {uploadResult.parse_errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold" style={{ color: BRAND_COLORS.primary }}>
                    {uploadResult.parse_errors.length} linha(s) ignorada(s):
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs" style={{ color: T.textMuted }}>
                    {uploadResult.parse_errors.map((parseError) => <li key={parseError}>{parseError}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Listagem */}
        <Card className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">Base cadastrada</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-48"
              />
              <Select
                className="w-40"
                value={status}
                onChange={(value) => { setStatus(value); setPage(1) }}
                options={STATUS_OPTIONS}
              />
            </div>
          </div>

          {loading ? (
            <div className="mt-4 flex flex-col gap-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : (
            <>
              {/* Tabela — telas médias/grandes */}
              <div className="mt-4 hidden overflow-x-auto rounded-lg md:block" style={{ border: `1px solid ${T.border}` }}>
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: T.surface2 }}>
                    <tr>
                      {columns.map((column) => (
                        <th key={column.key} className="whitespace-nowrap px-3 py-2 text-left">{column.label}</th>
                      ))}
                      <th className="whitespace-nowrap px-3 py-2 text-left">Entrevista</th>
                      <th className="whitespace-nowrap px-3 py-2 text-left">Respondida em</th>
                      <th className="whitespace-nowrap px-3 py-2 text-left">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} style={{ borderTop: `1px solid ${T.border}` }}>
                        {columns.map((column) => (
                          <td key={column.key} className="px-3 py-2" style={{ color: row.values[column.key] ? T.text : T.textFaint }}>
                            {row.values[column.key] ?? '—'}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          <Badge tone={row.has_answered ? 'success' : 'neutral'}>
                            {row.has_answered ? 'Concluída' : 'Pendente'}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2" style={{ color: T.textMuted }}>
                          {formatDateTime(row.answered_at)}
                        </td>
                        <td className="px-3 py-2">{renderActions(row)}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={columns.length + 3} className="px-3 py-6 text-center" style={{ color: T.textFaint }}>
                          Nenhum colaborador encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Cards — mobile */}
              <div className="mt-4 flex flex-col gap-3 md:hidden">
                {rows.map((row) => (
                  <div key={row.id} className="rounded-lg p-3" style={{ border: `1px solid ${T.border}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold" style={{ color: T.text }}>
                        {columns[0] ? row.values[columns[0].key] ?? '—' : '—'}
                      </p>
                      <Badge tone={row.has_answered ? 'success' : 'neutral'}>
                        {row.has_answered ? 'Concluída' : 'Pendente'}
                      </Badge>
                    </div>
                    <dl className="mt-2 space-y-0.5 text-xs">
                      {columns.slice(1).map((column) => (
                        <div key={column.key} className="flex gap-1">
                          <dt style={{ color: T.textFaint }}>{column.label}:</dt>
                          <dd style={{ color: T.text }}>{row.values[column.key] ?? '—'}</dd>
                        </div>
                      ))}
                      <div className="flex gap-1">
                        <dt style={{ color: T.textFaint }}>Respondida em:</dt>
                        <dd style={{ color: T.text }}>{formatDateTime(row.answered_at)}</dd>
                      </div>
                    </dl>
                    <div className="mt-3">{renderActions(row)}</div>
                  </div>
                ))}
                {rows.length === 0 && (
                  <p className="py-6 text-center text-sm" style={{ color: T.textFaint }}>
                    Nenhum colaborador encontrado.
                  </p>
                )}
              </div>

              {roster && roster.page_count > 1 && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs" style={{ color: T.textMuted }}>
                    Página {roster.page} de {roster.page_count} · {roster.total} colaborador(es)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={roster.page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={roster.page >= roster.page_count}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}

              {roster && roster.omitted_columns.length > 0 && (
                <div className="mt-4 rounded-lg p-3" style={{ backgroundColor: T.surface2 }}>
                  <p className="text-xs font-semibold" style={{ color: T.textFaint }}>
                    COLUNAS DA BASE NÃO EXIBIDAS
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs" style={{ color: T.textMuted }}>
                    {roster.omitted_columns.map((column) => (
                      <li key={column.label}>
                        <span style={{ color: T.text }}>{column.label}</span> — {column.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="mt-4 text-xs" style={{ color: T.textFaint }}>
                Esta lista mostra apenas as colunas da base enviada pelo cliente e o status da entrevista.
                Respostas, notas e classificações de risco não são exibidas de forma nominal — o questionário é
                respondido sob anonimato e só aparece de forma agregada no dashboard.
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
