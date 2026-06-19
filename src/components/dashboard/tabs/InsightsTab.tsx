'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/ThemeProvider'

interface InsightsMeta {
  total_collaborators: number
  total_answered: number
  response_rate: number
  filters: Record<string, string>
}

interface InsightsData {
  insights: string
  generated_at: string
  meta: InsightsMeta
}

interface InsightSection {
  id: string
  title: string
  content: string
}

function parseSections(raw: string): InsightSection[] {
  const sections: InsightSection[] = []
  let current: InsightSection | null = null
  for (const line of raw.split('\n')) {
    const match = /^\*\*([^*]+)\*\*$/.exec(line.trim())
    if (match) {
      if (current) sections.push({ ...current, content: current.content.trim() })
      current = { id: `sec-${sections.length}`, title: match[1], content: '' }
    } else if (current) {
      current.content += line + '\n'
    }
  }
  if (current) sections.push({ ...current, content: current.content.trim() })
  return sections
}

function renderContent(text: string, textColor: string, mutedColor: string) {
  return text.split('\n').map((line, i) => {
    const key = `el-${text.slice(0, 8)}-${i}`
    if (!line.trim()) return <div key={key} className="h-1.5" />
    const parts = line.split(/(\*\*[^*]+\*\*)/).map((part, j) => ({
      id: `p-${i}-${j}`,
      bold: /^\*\*[^*]+\*\*$/.test(part),
      text: part.replaceAll('**', ''),
    }))
    return (
      <p key={key} className="text-sm leading-relaxed" style={{ color: mutedColor }}>
        {parts.map(part =>
          part.bold
            ? <strong key={part.id} style={{ color: textColor, fontWeight: 600 }}>{part.text}</strong>
            : <span key={part.id}>{part.text}</span>
        )}
      </p>
    )
  })
}

function getSectionTheme(title: string) {
  const l = title.toLowerCase()
  if (l.includes('vis') || l.includes('geral'))
    return { gradient: 'linear-gradient(135deg, #4285F4, #34A853)', glow: 'rgba(66,133,244,0.12)' }
  if (l.includes('aten') || l.includes('ponto'))
    return { gradient: 'linear-gradient(135deg, #EA4335, #FBBC04)', glow: 'rgba(234,67,53,0.12)' }
  if (l.includes('remoto') || l.includes('ietr'))
    return { gradient: 'linear-gradient(135deg, #34A853, #4285F4)', glow: 'rgba(52,168,83,0.12)' }
  if (l.includes('disparidade') || l.includes('grupo') || l.includes('demogr'))
    return { gradient: 'linear-gradient(135deg, #FBBC04, #EA4335)', glow: 'rgba(251,188,4,0.12)' }
  if (l.includes('recomend'))
    return { gradient: 'linear-gradient(135deg, #B39DDB, #4285F4)', glow: 'rgba(179,157,219,0.12)' }
  if (l.includes('iso') || l.includes('plano') || l.includes('45003'))
    return { gradient: 'linear-gradient(135deg, #00BCD4, #34A853)', glow: 'rgba(0,188,212,0.12)' }
  const fallbacks = [
    { gradient: 'linear-gradient(135deg, #4285F4, #B39DDB)', glow: 'rgba(66,133,244,0.12)' },
    { gradient: 'linear-gradient(135deg, #34A853, #FBBC04)', glow: 'rgba(52,168,83,0.12)' },
    { gradient: 'linear-gradient(135deg, #EA4335, #B39DDB)', glow: 'rgba(234,67,53,0.12)' },
    { gradient: 'linear-gradient(135deg, #FBBC04, #EA4335)', glow: 'rgba(251,188,4,0.12)' },
  ]
  return fallbacks[(title.codePointAt(0) ?? 0) % 4]
}

const METRIC_COLORS = ['#4285F4', '#34A853', '#FBBC04']

interface SharedColors {
  surface: string
  border: string
  text: string
  textMuted: string
  skeleton: string
  skeletonShine: string
}

interface SectionCardColors {
  surface: string
  border: string
  text: string
  textMuted: string
}

function LoadingSkeletons({ T }: Readonly<{ T: SharedColors }>) {
  return (
    <div className="space-y-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={`skel-${i}`}
          className="rounded-2xl overflow-hidden"
          style={{ background: T.surface, border: `1px solid ${T.border}`, display: 'flex' }}
        >
          <div style={{ width: 3, background: T.skeleton, flexShrink: 0 }} />
          <div className="flex-1 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg" style={{ width: 28, height: 28, background: T.skeleton }} />
              <div className="rounded-full h-3" style={{ width: '30%', background: T.skeleton }} />
            </div>
            {[88, 72, 80, 55].map((w, j) => (
              <div
                key={`sl-${i}-${j}`}
                className="rounded-full h-2.5 mb-2.5"
                style={{
                  width: `${w}%`,
                  background: `linear-gradient(90deg, ${T.skeleton} 25%, ${T.skeletonShine} 50%, ${T.skeleton} 75%)`,
                  backgroundSize: '600px 100%',
                  animation: `shimmer 1.6s infinite linear`,
                  animationDelay: `${(i * 4 + j) * 60}ms`,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function InsightsContent({ data, sections, isDark, T }: Readonly<{
  data: InsightsData
  sections: InsightSection[]
  isDark: boolean
  T: SharedColors
}>) {
  const sectionColors = { surface: T.surface, border: T.border, text: T.text, textMuted: T.textMuted }
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Colaboradores', value: data.meta.total_collaborators, color: METRIC_COLORS[0] },
          { label: 'Respondentes', value: data.meta.total_answered, color: METRIC_COLORS[1] },
          { label: 'Taxa de resposta', value: `${data.meta.response_rate}%`, color: METRIC_COLORS[2] },
        ].map(({ label, value, color }, idx) => (
          <div
            key={label}
            className="rounded-xl overflow-hidden"
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              animation: `fadeSlideIn 360ms ease both`,
              animationDelay: `${idx * 55}ms`,
            }}
          >
            <div style={{ height: 3, background: color }} />
            <div className="p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: T.text }}>{value}</p>
              <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>{label}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-4">
        {sections.length > 0 ? sections.map((sec, idx) => (
          <InsightSectionCard key={sec.id} sec={sec} idx={idx} isDark={isDark} colors={sectionColors} />
        )) : (
          <div className="rounded-2xl p-5" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <pre className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: T.textMuted }}>{data.insights}</pre>
          </div>
        )}
      </div>
      {Object.keys(data.meta.filters).length > 0 && (
        <p className="text-xs px-1" style={{ color: T.textMuted }}>
          Filtros aplicados: {Object.entries(data.meta.filters).map(([k, v]) => `${k}: ${v}`).join(' · ')}
        </p>
      )}
    </>
  )
}

function InsightSectionCard({ sec, idx, isDark, colors }: Readonly<{
  sec: InsightSection
  idx: number
  isDark: boolean
  colors: SectionCardColors
}>) {
  const st = getSectionTheme(sec.title)
  const bg = isDark
    ? `radial-gradient(ellipse at 8% 50%, ${st.glow} 0%, transparent 60%), ${colors.surface}`
    : `radial-gradient(ellipse at 8% 50%, ${st.glow.replace('0.12', '0.05')} 0%, transparent 60%), ${colors.surface}`
  return (
    <div
      className="insight-card rounded-2xl overflow-hidden"
      style={{
        '--insight-glow': st.glow.replace('0.12', '0.22'),
        background: bg,
        border: `1px solid ${colors.border}`,
        animation: `fadeSlideIn 420ms ease both`,
        animationDelay: `${idx * 75}ms`,
        display: 'flex',
      } as React.CSSProperties}
    >
      <div style={{ width: 3, background: st.gradient, flexShrink: 0 }} />
      <div className="flex-1 p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              width: 28, height: 28,
              background: st.gradient,
              boxShadow: `0 2px 8px ${st.glow.replace('0.12', '0.45')}`,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold" style={{ color: colors.text }}>{sec.title}</h3>
        </div>
        <div className="space-y-1">
          {renderContent(sec.content, colors.text, colors.textMuted)}
        </div>
      </div>
    </div>
  )
}

function InsightsHeader({ generatedAt, isSuperuser, loading, hasData, isDark, T, onGenerate }: Readonly<{
  generatedAt: string | null
  isSuperuser: boolean
  loading: boolean
  hasData: boolean
  isDark: boolean
  T: SharedColors & { border: string }
  onGenerate: () => void
}>) {
  const headerBg = isDark
    ? 'radial-gradient(ellipse at 15% 50%, rgba(66,133,244,0.14) 0%, transparent 55%), radial-gradient(ellipse at 85% 50%, rgba(179,157,219,0.10) 0%, transparent 55%), #161616'
    : 'radial-gradient(ellipse at 15% 50%, rgba(66,133,244,0.07) 0%, transparent 55%), radial-gradient(ellipse at 85% 50%, rgba(179,157,219,0.05) 0%, transparent 55%), #FFFFFF'
  const btnBg = loading ? T.skeleton : 'linear-gradient(135deg, #4285F4 0%, #34A853 100%)'
  const btnColor = loading ? T.textMuted : '#FFFFFF'
  const btnLabel = hasData ? 'Gerar novamente' : 'Gerar insights'
  return (
    <div
      className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 overflow-hidden"
      style={{ background: headerBg, border: `1px solid ${T.border}` }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center rounded-xl flex-shrink-0"
          style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #4285F4 0%, #B39DDB 100%)', boxShadow: '0 4px 16px rgba(66,133,244,0.35)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold" style={{ color: T.text }}>Insights com IA</h2>
          <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>
            Análise gerada pelo Gemini
            {generatedAt && <span className="ml-1 opacity-60">· {generatedAt}</span>}
          </p>
        </div>
      </div>
      {isSuperuser && (
        <button
          onClick={onGenerate}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold flex-shrink-0"
          style={{
            background: btnBg, color: btnColor,
            boxShadow: loading ? 'none' : '0 4px 14px rgba(66,133,244,0.32)',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.75 : 1,
            transition: 'opacity 150ms ease, box-shadow 150ms ease',
          }}
        >
          {loading ? (
            <>
              <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Gerando…
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              {btnLabel}
            </>
          )}
        </button>
      )}
    </div>
  )
}

function InsightsEmptyState({ isSuperuser, isDark, T }: Readonly<{
  isSuperuser: boolean
  isDark: boolean
  T: Pick<SharedColors, 'surface' | 'border' | 'text' | 'textMuted'>
}>) {
  const iconStroke = isDark ? '#444' : '#C0C0C8'
  const iconBg = isDark ? '#1E1E1E' : '#F2F2F6'
  const msg = isSuperuser
    ? <><strong style={{ color: T.text }}>&quot;Gerar insights&quot;</strong> para receber uma análise personalizada dos dados atuais.</>
    : <>Nenhum insight gerado ainda. Aguarde um superuser gerar a análise.</>
  return (
    <div
      className="rounded-2xl p-14 flex flex-col items-center gap-4"
      style={{ background: T.surface, border: `1px dashed ${T.border}` }}
    >
      <div className="rounded-full flex items-center justify-center" style={{ width: 56, height: 56, background: iconBg }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
        </svg>
      </div>
      <p className="text-sm text-center max-w-xs leading-relaxed" style={{ color: T.textMuted }}>
        {isSuperuser ? <>Clique em {msg}</> : msg}
      </p>
    </div>
  )
}

export default function InsightsTab({ query, isSuperuser }: Readonly<{ query: string; isSuperuser: boolean }>) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const T = {
    surface: isDark ? '#161616' : '#FFFFFF',
    surfaceHover: isDark ? '#1C1C1C' : '#F8F8FB',
    border: isDark ? '#272727' : '#E4E4E7',
    text: isDark ? '#F1F1F1' : '#111111',
    textMuted: isDark ? '#9B9B9B' : '#555555',
    skeleton: isDark ? '#222222' : '#EBEBEB',
    skeletonShine: isDark ? '#2C2C2C' : '#F5F5F5',
  }
  const [data, setData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('insights_cache')
      if (cached) setData(JSON.parse(cached) as InsightsData)
    } catch { /* ignore */ }
  }, [])

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const url = '/api/dashboard/insights' + (query ? '?' + query : '')
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Erro ${res.status}`)
      }
      const json: InsightsData = await res.json()
      setData(json)
      try { sessionStorage.setItem('insights_cache', JSON.stringify(json)) } catch { /* ignore */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  const generatedAt = data?.generated_at
    ? new Date(data.generated_at).toLocaleString('pt-BR')
    : null

  const sections = data ? parseSections(data.insights) : []

  return (
    <>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -600px 0; }
          100% { background-position:  600px 0; }
        }
        .insight-card {
          transition: transform 180ms ease, box-shadow 180ms ease;
        }
        .insight-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px var(--insight-glow, rgba(66,133,244,0.15));
        }
      `}</style>

      <div className="space-y-5">

        <InsightsHeader
          generatedAt={generatedAt}
          isSuperuser={isSuperuser}
          loading={loading}
          hasData={!!data}
          isDark={isDark}
          T={T}
          onGenerate={handleGenerate}
        />

        {/* ── Erro ── */}
        {error && (
          <div
            className="rounded-xl p-4 text-sm"
            style={{ background: 'rgba(234,67,53,0.08)', border: '1px solid rgba(234,67,53,0.22)', color: '#EA4335' }}
          >
            <strong>Erro:</strong> {error}
          </div>
        )}

        {/* ── Estado vazio ── */}
        {!data && !loading && !error && (
          <InsightsEmptyState isSuperuser={isSuperuser} isDark={isDark} T={T} />
        )}

        {/* ── Loading skeletons ── */}
        {loading && <LoadingSkeletons T={T} />}

        {/* ── Conteúdo ── */}
        {data && !loading && (
          <InsightsContent data={data} sections={sections} isDark={isDark} T={T} />
        )}

      </div>
    </>
  )
}
