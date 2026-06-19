'use client'

import { useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ActiveFilters {
  area:            string
  role:            string
  gender:          string
  race_color:      string
  employment_type: string
}

interface ThemeColors {
  bg:           string
  surface:      string
  border:       string
  text:         string
  textMuted:    string
  textFaint:    string
  inputBg:      string
  inputBorder:  string
  menuHover:    string
}

interface Props {
  filters:  ActiveFilters
  theme:    ThemeColors
  isDark:   boolean
  onClose:  () => void
}

const FILTER_LABELS: Record<string, string> = {
  area:            'Área',
  role:            'Cargo',
  gender:          'Gênero',
  race_color:      'Raça / Cor',
  employment_type: 'Vínculo',
}

export default function ReportRiskModal({ filters, theme: T, isDark, onClose }: Props) {
  const [clientName,        setClientName]        = useState('')
  const [clientDescription, setClientDescription] = useState('')
  const [excludePj,         setExcludePj]         = useState(false)
  const [logoPreview,       setLogoPreview]       = useState<string | null>(null)
  const [logoBase64,        setLogoBase64]        = useState<string | undefined>()
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const activeFilters = Object.entries(filters).filter(([, v]) => v)

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo deve ter no máximo 2 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setLogoBase64(result)
      setLogoPreview(result)
    }
    reader.readAsDataURL(file)
  }

  async function handleGenerate() {
    if (!clientName.trim()) {
      setError('O nome do cliente é obrigatório.')
      return
    }
    setError(null)
    setLoading(true)

    const activeF: Record<string, string> = {}
    for (const [k, v] of activeFilters) { activeF[k] = v }

    try {
      const res = await fetch('/api/dashboard/report-risk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          clientName:        clientName.trim(),
          clientDescription: clientDescription.trim(),
          clientLogoBase64:  logoBase64,
          filters:           activeF,
          excludePj,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Erro desconhecido.' }))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href     = url
      a.download = `relatorio-risco${excludePj ? '-sem-pj' : ''}-${date}.pptx`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar o relatório.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width:           '100%',
    padding:         '8px 12px',
    borderRadius:    8,
    border:          `1px solid ${T.inputBorder}`,
    backgroundColor: T.inputBg,
    color:           T.text,
    fontSize:        14,
    outline:         'none',
  }

  const labelStyle: React.CSSProperties = {
    display:      'block',
    fontSize:     12,
    fontWeight:   600,
    marginBottom: 5,
    color:        T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }

  return (
    <>
      {/* Backdrop */}
      <div
        role="presentation"
        onClick={onClose}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        style={{
          position:        'fixed',
          inset:           0,
          backgroundColor: 'rgba(0,0,0,0.55)',
          backdropFilter:  'blur(3px)',
          zIndex:          100,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position:        'fixed',
          top:             '50%',
          left:            '50%',
          transform:       'translate(-50%, -50%)',
          width:           '100%',
          maxWidth:        560,
          maxHeight:       '90vh',
          overflowY:       'auto',
          backgroundColor: T.surface,
          border:          `1px solid ${T.border}`,
          borderRadius:    16,
          padding:         '28px 32px',
          zIndex:          101,
          boxShadow:       isDark ? '0 24px 60px rgba(0,0,0,0.7)' : '0 24px 60px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              {/* Presentation icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#29B6F6' : '#1565C0'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>
                Relatório de Risco
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: T.textMuted }}>
              Gerar apresentação PPTX com dados estratificados
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 4 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Active filters */}
        {activeFilters.length > 0 && (
          <div
            style={{
              marginBottom:    20,
              padding:         '10px 14px',
              borderRadius:    8,
              backgroundColor: isDark ? '#1A2A3A' : '#EBF5FB',
              border:          `1px solid ${isDark ? '#1565C020' : '#29B6F640'}`,
            }}
          >
            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: isDark ? '#29B6F6' : '#1565C0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Filtros ativos
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {activeFilters.map(([k, v]) => (
                <span
                  key={k}
                  style={{
                    fontSize:        12,
                    padding:         '2px 8px',
                    borderRadius:    999,
                    backgroundColor: isDark ? '#0D1B2A' : '#FFFFFF',
                    border:          `1px solid ${T.border}`,
                    color:           T.text,
                  }}
                >
                  {FILTER_LABELS[k] ?? k}: <strong>{v}</strong>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Form fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Client name */}
          <div>
            <label htmlFor="rr-client-name" style={labelStyle}>Nome do Cliente *</label>
            <input
              id="rr-client-name"
              type="text"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="Ex: BeeTouch"
              style={inputStyle}
            />
          </div>

          {/* Client description */}
          <div>
            <label htmlFor="rr-client-desc" style={labelStyle}>Descrição / Contexto</label>
            <input
              id="rr-client-desc"
              type="text"
              value={clientDescription}
              onChange={e => setClientDescription(e.target.value)}
              placeholder="Ex: Setor educacional — Período: Jan–Jun 2025"
              style={inputStyle}
            />
          </div>

          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: `1px solid ${T.inputBorder}`,
              backgroundColor: T.inputBg,
            }}
          >
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Estratificação automática
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: T.textFaint }}>
              Na seção de Análise Estratificada, o relatório irá gerar distribuição e heatmap para cada filtro ativo do dashboard.
            </p>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 8,
              border: `1px solid ${T.inputBorder}`,
              backgroundColor: T.inputBg,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={excludePj}
              onChange={e => setExcludePj(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.text }}>
                Gerar versão sem vínculo PJ
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: T.textFaint }}>
                Exclui dos cálculos e gráficos os colaboradores classificados como PJ, mantendo o mesmo modelo de apresentação.
              </p>
            </div>
          </label>

          {/* Logo upload */}
          <div>
            <label style={labelStyle}>Logo do Cliente <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional, PNG/JPG, max 2 MB)</span></label>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                display:         'flex',
                alignItems:      'center',
                gap:             12,
                padding:         '10px 14px',
                borderRadius:    8,
                border:          `2px dashed ${T.inputBorder}`,
                backgroundColor: T.inputBg,
                cursor:          'pointer',
              }}
            >
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreview} alt="Logo preview" style={{ height: 40, maxWidth: 100, objectFit: 'contain', borderRadius: 4 }} />
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.textFaint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              )}
              <div>
                <p style={{ margin: 0, fontSize: 13, color: T.text, fontWeight: logoPreview ? 500 : 400 }}>
                  {logoPreview ? 'Logo carregado — clique para trocar' : 'Clique para selecionar arquivo'}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textFaint }}>PNG, JPG ou SVG</p>
              </div>
              {logoPreview && (
                <button
                  onClick={e => { e.stopPropagation(); setLogoBase64(undefined); setLogoPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 4 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" style={{ display: 'none' }} onChange={handleLogoChange} />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop:       16,
              padding:         '10px 14px',
              borderRadius:    8,
              backgroundColor: isDark ? '#2D0A0A' : '#FFEBEE',
              border:          `1px solid #EF9A9A`,
              color:           '#C62828',
              fontSize:        13,
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding:         '9px 18px',
              borderRadius:    8,
              border:          `1px solid ${T.border}`,
              backgroundColor: 'transparent',
              color:           T.textMuted,
              fontSize:        14,
              cursor:          loading ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || !clientName.trim()}
            style={{
              display:         'flex',
              alignItems:      'center',
              gap:             8,
              padding:         '9px 20px',
              borderRadius:    8,
              border:          'none',
              backgroundColor: loading || !clientName.trim() ? (isDark ? '#1B3A6B' : '#90CAF9') : '#1565C0',
              color:           '#FFFFFF',
              fontSize:        14,
              fontWeight:      600,
              cursor:          loading || !clientName.trim() ? 'not-allowed' : 'pointer',
              transition:      'background-color 0.15s',
            }}
          >
            {loading ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Gerando PPTX…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Gerar PPTX
              </>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
