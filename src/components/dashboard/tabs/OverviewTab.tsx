'use client'

import { useEffect, useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { useTheme } from '@/components/ThemeProvider'

// Paleta para gráficos organizacionais
const ORG_PALETTE = [
  '#F5C200', '#3B82F6', '#8B5CF6', '#22C55E',
  '#EF4444', '#F97316', '#06B6D4', '#EC4899',
  '#A3A3A3', '#84CC16', '#14B8A6', '#F43F5E',
]

interface DistItem { name: string; value: number }
interface DayItem { date: string; count: number }

interface OverviewData {
  total_responses: number
  total_expected: number
  completion_pct: number
  responses_by_day: DayItem[]
  by_area: DistItem[]
  by_role: DistItem[]
  by_employment_type: DistItem[]
  by_organization: DistItem[]
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const surface = isDark ? '#1A1A1A' : '#FFFFFF'
  const border = isDark ? '#2A2A2A' : '#E5E5E5'
  const text = isDark ? '#FFFFFF' : '#111111'
  const textMuted = isDark ? '#A3A3A3' : '#737373'
  const textFaint = isDark ? '#525252' : '#A3A3A3'
  return (
    <div className="rounded-xl p-5 flex flex-col gap-1" style={{ backgroundColor: surface, border: `1px solid ${border}` }}>
      <span className="text-xs uppercase tracking-wide" style={{ color: textMuted }}>{label}</span>
      <span className="text-3xl font-bold" style={{ color: text }}>{value}</span>
      {sub && <span className="text-xs" style={{ color: textFaint }}>{sub}</span>}
    </div>
  )
}

function OrgDonut({ title, data }: { title: string; data: DistItem[] }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const surface = isDark ? '#1A1A1A' : '#FFFFFF'
  const border = isDark ? '#2A2A2A' : '#E5E5E5'
  const text = isDark ? '#FFFFFF' : '#111111'
  const textMuted = isDark ? '#A3A3A3' : '#737373'
  const textFaint = isDark ? '#525252' : '#A3A3A3'
  const total = data.reduce((s, d) => s + d.value, 0)
  const top = data.slice(0, 8)

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: surface, border: `1px solid ${border}` }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: textMuted }}>{title}</h3>
      {data.length === 0 ? (
        <p className="text-sm" style={{ color: textFaint }}>Sem dados</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={top} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                {top.map((entry, i) => (
                  <Cell key={entry.name} fill={ORG_PALETTE[i % ORG_PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: surface, border: `1px solid ${border}`, borderRadius: '8px', color: text }}
                formatter={(value, name) => [
                  `${value} (${total > 0 ? ((Number(value) / total) * 100).toFixed(1) : 0}%)`,
                  String(name),
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Legenda tabular */}
          <div className="mt-3 flex flex-col gap-1.5">
            {top.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ORG_PALETTE[i % ORG_PALETTE.length] }} />
                  <span className="text-xs truncate" style={{ color: textMuted }} title={d.name}>{d.name}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs" style={{ color: textFaint }}>
                    {total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%
                  </span>
                  <span className="text-xs font-semibold" style={{ color: text }}>{d.value}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Formata "2026-04-17" → "17/04"
function fmtDay(date: string) {
  const [, m, d] = date.split('-')
  return `${d}/${m}`
}

export default function OverviewTab({ query }: { query: string }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const T = {
    surface: isDark ? '#1A1A1A' : '#FFFFFF',
    border: isDark ? '#2A2A2A' : '#E5E5E5',
    text: isDark ? '#FFFFFF' : '#111111',
    textMuted: isDark ? '#A3A3A3' : '#737373',
    textFaint: isDark ? '#525252' : '#A3A3A3',
    grid: isDark ? '#2A2A2A' : '#E5E5E5',
  }
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/overview${query ? `?${query}` : ''}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [query])

  if (loading) return <p className="text-sm" style={{ color: T.textMuted }}>Carregando...</p>
  if (!data) return <p className="text-sm" style={{ color: '#EF4444' }}>Erro ao carregar dados.</p>

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total de Respostas" value={data.total_responses.toLocaleString('pt-BR')} />
        <StatCard label="Respostas Esperadas" value={data.total_expected.toLocaleString('pt-BR')} />
        <StatCard
          label="Percentual Concluído"
          value={`${data.completion_pct.toFixed(2).replace('.', ',')}%`}
          sub={`${data.total_responses} de ${data.total_expected}`}
        />
      </div>

      {/* Gráfico de respostas por dia */}
      <div className="rounded-xl p-5" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: T.textMuted }}>Respostas por Dia</h3>
        {data.responses_by_day.length === 0 ? (
          <p className="text-sm" style={{ color: T.textFaint }}>Sem dados</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.responses_by_day} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDay}
                tick={{ fill: T.textFaint, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: T.textFaint, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text }}              itemStyle={{ color: T.text }}
              labelStyle={{ color: T.textMuted }}                labelFormatter={(v) => `Data: ${String(v).split('-').reverse().join('/')}`}
                formatter={(v) => [`${v} respostas`, 'Respostas']}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#F5C200"
                strokeWidth={2}
                dot={{ fill: '#F5C200', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Distribuições organizacionais */}
      <h3 className="text-sm font-semibold -mb-2" style={{ color: T.textMuted }}>Adesão por Segmento</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <OrgDonut title="Respostas por Área" data={data.by_area} />
        <OrgDonut title="Respostas por Cargo" data={data.by_role} />
        <OrgDonut title="Respostas por Vínculo" data={data.by_employment_type} />
        <OrgDonut title="Respostas por Organização" data={data.by_organization} />
      </div>
    </div>
  )
}
