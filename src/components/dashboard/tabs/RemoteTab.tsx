'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import { useTheme } from '@/components/ThemeProvider'
import { BRAND_COLORS } from '@/lib/brand'

interface TooltipProps {
  active?: boolean
  payload?: { value: number; payload: DomainItem }[]
  label?: string
}

const CLASS_COLORS: Record<string, string> = {
  'Condição adequada': BRAND_COLORS.success,
  'Zona de atenção': BRAND_COLORS.warning,
  'Situação de risco': BRAND_COLORS.danger,
}

interface DomainItem { name: string; avg_score: number; weight: number; classification: string }
interface QuestionRiskItem {
  domain: string
  question_code: string
  question_text: string
  avg_score: number
  classification: string
  responses: number
}
interface RemoteData {
  domains: DomainItem[]
  class_distribution: { name: string; value: number }[]
  avg_score: number | null
  question_risk: QuestionRiskItem[]
}

function classificationBadge(classification: string) {
  if (classification === 'Situação de risco') return { bg: `${BRAND_COLORS.danger}22`, text: BRAND_COLORS.danger }
  if (classification === 'Zona de atenção') return { bg: `${BRAND_COLORS.warning}22`, text: BRAND_COLORS.warning }
  return { bg: `${BRAND_COLORS.success}22`, text: BRAND_COLORS.success }
}

function DomainTooltip({ active, payload, label }: TooltipProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const surface = isDark ? BRAND_COLORS.darkSurface : BRAND_COLORS.lightSurface
  const border = isDark ? BRAND_COLORS.borderDark : BRAND_COLORS.borderLight
  const text = isDark ? BRAND_COLORS.textLight : BRAND_COLORS.textDark
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const color = CLASS_COLORS[d.classification] ?? '#A3A3A3'
  return (
    <div style={{ backgroundColor: surface, border: `1px solid ${border}`, borderRadius: '10px', padding: '12px 14px', maxWidth: '260px' }}>
      <p className="font-semibold text-sm mb-1" style={{ color: text }}>{label}</p>
      <p className="text-sm" style={{ color }}>{`Score: ${d.avg_score.toFixed(2)} — ${d.classification}`}</p>
    </div>
  )
}

export default function RemoteTab({ query }: { query: string }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const T = {
    surface: isDark ? BRAND_COLORS.darkSurface : BRAND_COLORS.lightSurface,
    border: isDark ? BRAND_COLORS.borderDark : BRAND_COLORS.borderLight,
    text: isDark ? BRAND_COLORS.textLight : BRAND_COLORS.textDark,
    textMuted: isDark ? BRAND_COLORS.textMutedDark : BRAND_COLORS.textMutedLight,
    textFaint: isDark ? BRAND_COLORS.textFaintDark : BRAND_COLORS.textFaintLight,
    axisX: isDark ? BRAND_COLORS.textFaintDark : BRAND_COLORS.textFaintLight,
    axisY: isDark ? BRAND_COLORS.textMutedDark : BRAND_COLORS.textMutedLight,
    cursor: isDark ? BRAND_COLORS.darkSurface2 : BRAND_COLORS.lightSurface2,
  }
  const surface2 = isDark ? BRAND_COLORS.darkSurface2 : BRAND_COLORS.lightSurface2
  const [data, setData] = useState<RemoteData | null>(null)
  const [loading, setLoading] = useState(true)

  const questionRiskByDomain = (data?.question_risk ?? []).reduce<Record<string, QuestionRiskItem[]>>((acc, row) => {
    if (!acc[row.domain]) acc[row.domain] = []
    acc[row.domain].push(row)
    return acc
  }, {})

  useEffect(() => {
    const url = query ? `/api/dashboard/remote?${query}` : '/api/dashboard/remote'
    setLoading(true)
    fetch(url)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [query])

  if (loading) return <p className="text-sm" style={{ color: T.textMuted }}>Carregando...</p>
  if (!data) return <p className="text-sm" style={{ color: BRAND_COLORS.danger }}>Erro ao carregar dados.</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl p-5 flex flex-col gap-1" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
        <span className="text-xs uppercase tracking-wide" style={{ color: T.textMuted }}>Score IETR Médio</span>
        <span className="text-3xl font-bold" style={{ color: T.text }}>{data.avg_score != null ? `${data.avg_score.toFixed(2)} / 5.00` : '—'}</span>
      </div>

      <div className="rounded-xl p-5" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: T.textMuted }}>Distribuição Geral IETR (Trabalho Remoto)</h3>
        {data.class_distribution.length === 0 ? (
          <p className="text-sm" style={{ color: T.textFaint }}>Sem dados</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.class_distribution} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                {data.class_distribution.map((e) => <Cell key={e.name} fill={CLASS_COLORS[e.name] ?? '#555'} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text }} formatter={(v, name) => [`${v} respostas`, String(name)]} />
              <Legend formatter={(v) => <span style={{ color: T.textMuted, fontSize: '12px' }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-xl p-5" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: T.textMuted }}>Score Médio por Domínio IETR (escala 1–5)</h3>
        {data.domains.length === 0 ? (
          <p className="text-sm" style={{ color: T.textFaint }}>Sem dados</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, data.domains.length * 44)}>
            <BarChart data={data.domains} layout="vertical" margin={{ left: 8, right: 50 }}>
              <XAxis type="number" domain={[1, 5]} ticks={[1, 2, 3, 3.5, 4, 5]} tick={{ fill: T.axisX, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={200} tick={{ fill: T.axisY, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<DomainTooltip />} cursor={{ fill: T.cursor }} />
              <Bar dataKey="avg_score" radius={[0, 4, 4, 0]}>
                {data.domains.map((d) => <Cell key={d.name} fill={CLASS_COLORS[d.classification] ?? '#555'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-xl p-5" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: T.textMuted }}>Classificação Média de Risco por Questão</h3>
        {(data.question_risk ?? []).length === 0 ? (
          <p className="text-sm" style={{ color: T.textFaint }}>Sem dados</p>
        ) : (
          <div className="flex flex-col gap-4">
            {Object.entries(questionRiskByDomain).map(([domain, questions]) => (
              <div key={domain} className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${T.border}` }}>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: T.textMuted, backgroundColor: surface2 }}>{domain}</div>
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: surface2 }}>
                    <tr>
                      <th className="text-left px-3 py-2" style={{ color: T.textMuted }}>Código</th>
                      <th className="text-left px-3 py-2" style={{ color: T.textMuted }}>Enunciado</th>
                      <th className="text-left px-3 py-2" style={{ color: T.textMuted }}>Score médio</th>
                      <th className="text-left px-3 py-2" style={{ color: T.textMuted }}>Classificação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((q) => {
                      const badge = classificationBadge(q.classification)
                      return (
                        <tr key={q.question_code} style={{ borderTop: `1px solid ${T.border}` }}>
                          <td className="px-3 py-2 font-mono text-xs" style={{ color: T.textMuted }}>{q.question_code}</td>
                          <td className="px-3 py-2" style={{ color: T.text }}>{q.question_text}</td>
                          <td className="px-3 py-2 font-semibold" style={{ color: T.text }}>{q.avg_score.toFixed(2)}</td>
                          <td className="px-3 py-2"><span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: badge.bg, color: badge.text }}>{q.classification}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {data.domains.map((d) => (
          <div key={d.name} className="rounded-xl p-4 flex flex-col gap-2" style={{ backgroundColor: T.surface, border: `1px solid ${CLASS_COLORS[d.classification] ?? T.border}` }}>
            <span className="text-xs font-medium" style={{ color: CLASS_COLORS[d.classification] ?? T.textMuted }}>{d.name}</span>
            <span className="text-2xl font-bold" style={{ color: T.text }}>{d.avg_score.toFixed(2)}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full w-fit" style={{ backgroundColor: `${CLASS_COLORS[d.classification]}22`, color: CLASS_COLORS[d.classification] ?? '#A3A3A3' }}>{d.classification}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
