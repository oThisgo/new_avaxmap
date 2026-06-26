'use client'

import { useState, useRef, DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_COLORS } from '@/lib/brand'

interface UploadResult {
  ok: boolean
  total: number
  inserted: number
  updated: number
  parse_errors: string[]
}

export default function UploadCollaboratorsPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const T = {
    bg: isDark ? BRAND_COLORS.darkBg : BRAND_COLORS.lightBg,
    surface: isDark ? BRAND_COLORS.darkSurface : BRAND_COLORS.lightSurface,
    surface2: isDark ? BRAND_COLORS.darkSurface2 : BRAND_COLORS.lightSurface2,
    border: isDark ? BRAND_COLORS.borderDark : BRAND_COLORS.borderLight,
    text: isDark ? BRAND_COLORS.textLight : BRAND_COLORS.textDark,
    textMuted: isDark ? BRAND_COLORS.textMutedDark : BRAND_COLORS.textMutedLight,
    textFaint: isDark ? BRAND_COLORS.textFaintDark : BRAND_COLORS.textFaintLight,
  }
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith('.csv')) {
      setFile(dropped)
      setResult(null)
      setError('')
    } else {
      setError('Apenas arquivos .csv são aceitos.')
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    if (picked) {
      setFile(picked)
      setResult(null)
      setError('')
    }
  }

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/admin/upload-collaborators', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao importar.')
      } else {
        setResult(data)
        setFile(null)
        if (inputRef.current) inputRef.current.value = ''
      }
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: T.bg, color: T.text }}>
      {/* Header */}
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: T.textMuted }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Dashboard
            </button>
            <span style={{ color: T.border }}>/</span>
            <span className="text-sm" style={{ color: T.text }}>Importar Colaboradores</span>
          </div>
          <ThemeToggle />
        </div>

        <h1 className="text-2xl font-semibold mb-1">Importar Colaboradores</h1>
        <p className="text-sm mb-8" style={{ color: T.textMuted }}>
          Faça upload do CSV de dados demográficos. O sistema usa a credencial configurada no mapeamento e atualiza cadastros existentes sem resetar respostas.
        </p>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          className="rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors"
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
            onChange={handleFileChange}
          />
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={file ? BRAND_COLORS.success : T.textFaint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          {file ? (
            <div className="text-center">
              <p className="font-medium" style={{ color: '#22C55E' }}>{file.name}</p>
              <p className="text-xs mt-0.5" style={{ color: '#A3A3A3' }}>
                {(file.size / 1024).toFixed(1)} KB — clique para trocar
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="font-medium" style={{ color: T.textMuted }}>Arraste o arquivo aqui ou clique para selecionar</p>
              <p className="text-xs mt-0.5" style={{ color: T.textFaint }}>Apenas .csv</p>
            </div>
          )}
        </div>

        {/* Colunas esperadas */}
        <div className="mt-4 rounded-xl p-4" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
          <p className="text-xs font-semibold mb-2" style={{ color: T.textFaint }}>ESTRUTURA FLEXÍVEL</p>
          <p className="text-xs" style={{ color: T.textMuted }}>
            O parser usa o cabeçalho do CSV e a configuração salva do mapeamento (credencial, campos padrão e estratificações).
          </p>
          <p className="text-xs mt-1" style={{ color: T.textFaint }}>
            Dica: mantenha os mesmos nomes de coluna definidos na criação do mapeamento para melhor reconhecimento.
          </p>
        </div>

        {/* Botão */}
        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="mt-6 w-full rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: BRAND_COLORS.primary, color: '#FFFFFF' }}
          onMouseEnter={(e) => { if (file && !loading) e.currentTarget.style.backgroundColor = BRAND_COLORS.primaryHover }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = BRAND_COLORS.primary }}
        >
          {loading ? 'Importando...' : 'Importar colaboradores'}
        </button>

        {/* Erro */}
        {error && (
          <div className="mt-4 rounded-xl p-4 text-sm" style={{ backgroundColor: '#EF444415', border: '1px solid #EF444440', color: '#EF4444' }}>
            {error}
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className="mt-4 rounded-xl p-5" style={{ backgroundColor: T.surface, border: '1px solid #22C55E40' }}>
            <p className="font-semibold mb-3" style={{ color: '#22C55E' }}>Importação concluída</p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Total processado', value: result.total, color: T.text },
                { label: 'Novos inseridos', value: result.inserted, color: BRAND_COLORS.success },
                { label: 'Atualizados', value: result.updated, color: BRAND_COLORS.primary },
              ].map((s) => (
                <div key={s.label} className="rounded-lg p-3 text-center" style={{ backgroundColor: T.surface2 }}>
                  <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>{s.label}</p>
                </div>
              ))}
            </div>
            {result.parse_errors.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: BRAND_COLORS.primary }}>
                  {result.parse_errors.length} linha(s) ignoradas por credencial inválida ou dados ausentes:
                </p>
                <ul className="text-xs space-y-0.5" style={{ color: '#A3A3A3' }}>
                  {result.parse_errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
