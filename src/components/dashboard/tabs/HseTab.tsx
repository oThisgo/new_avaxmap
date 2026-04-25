'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import { useTheme } from '@/components/ThemeProvider'

interface TooltipProps {
  active?: boolean
  payload?: { value: number; payload: DomainItem }[]
  label?: string
}

const CLASS_COLORS: Record<string, string> = {
  'Baixo risco': '#22C55E',
  'Risco moderado': '#F5C200',
  'Alto risco': '#EF4444',
}

const DOMAIN_COLORS: Record<string, string> = {
  'Demandas': '#EF4444',
  'Controle': '#3B82F6',
  'Apoio da Chefia': '#8B5CF6',
  'Apoio dos Colegas': '#06B6D4',
  'Relacionamentos': '#F97316',
  'Cargo': '#22C55E',
  'Comunicação e Mudanças': '#F5C200',
}

const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  'Demandas': 'Avalia a carga de trabalho, incluindo ritmo, volume, atenção exigida e carga emocional.',
  'Controle': 'Investiga o nível de autonomia e influência que o trabalhador tem sobre como realiza suas tarefas e o ritmo de trabalho.',
  'Apoio da Chefia': 'Avalia o suporte, incentivo e recursos fornecidos pela liderança direta.',
  'Apoio dos Colegas': 'Avalia o apoio social, colaboração e ajuda recebida dos colegas de trabalho.',
  'Relacionamentos': 'Investiga a promoção de um ambiente de trabalho positivo, prevenção de conflitos e comportamento inaceitável.',
  'Cargo': 'Mensura a clareza sobre responsabilidades, metas e se há conflitos de função.',
  'Comunicação e Mudanças': 'Analisa como as mudanças organizacionais (estruturais, técnicas) são gerenciadas e comunicadas.',
}

interface DomainItem { name: string; avg_score: number; weight: number; classification: string }
interface HseData { domains: DomainItem[]; class_distribution: { name: string; value: number }[]; avg_score: number | null }

function DomainTooltip({ active, payload, label }: TooltipProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const surface = isDark ? '#1A1A1A' : '#FFFFFF'
  const border = isDark ? '#2A2A2A' : '#E5E5E5'
  const text = isDark ? '#FFFFFF' : '#111111'
  const textMuted = isDark ? '#A3A3A3' : '#737373'
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const color = CLASS_COLORS[d.classification] ?? '#A3A3A3'
  const description = DOMAIN_DESCRIPTIONS[d.name]
  return (
    <div style={{ backgroundColor: surface, border: `1px solid ${border}`, borderRadius: '10px', padding: '12px 14px', maxWidth: '260px' }}>
      <p className="font-semibold text-sm mb-1" style={{ color: text }}>{label}</p>
      <p className="text-sm mb-2" style={{ color }}>
        Score: {d.avg_score.toFixed(2)} — {d.classification}
      </p>
      {description && <p className="text-xs leading-relaxed" style={{ color: textMuted }}>{description}</p>}
    </div>
  )
}

export default function HseTab({ query }: { query: string }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const T = {
    surface: isDark ? '#1A1A1A' : '#FFFFFF',
    border: isDark ? '#2A2A2A' : '#E5E5E5',
    text: isDark ? '#FFFFFF' : '#111111',
    textMuted: isDark ? '#A3A3A3' : '#737373',
    textFaint: isDark ? '#525252' : '#A3A3A3',
    axisX: isDark ? '#525252' : '#A3A3A3',
    axisY: isDark ? '#A3A3A3' : '#737373',
    cursor: isDark ? '#2A2A2A' : '#F0F0F0',
  }
  const [data, setData] = useState<HseData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/hse${query ? `?${query}` : ''}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [query])

  if (loading) return <p className="text-sm" style={{ color: T.textMuted }}>Carregando...</p>
  if (!data) return <p className="text-sm" style={{ color: '#EF4444' }}>Erro ao carregar dados.</p>

  return (
    <div className="flex flex-col gap-6">
      {/* Score médio */}
      <div className="rounded-xl p-5 flex flex-col gap-1" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
        <span className="text-xs uppercase tracking-wide" style={{ color: T.textMuted }}>Score HSE Médio</span>
        <span className="text-3xl font-bold" style={{ color: T.text }}>{data.avg_score != null ? `${data.avg_score.toFixed(2)} / 4.00` : '—'}</span>
      </div>

      {/* Distribuição geral */}
      <div className="rounded-xl p-5" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: T.textMuted }}>Distribuição Geral HSE</h3>
        {data.class_distribution.length === 0 ? (
          <p className="text-sm" style={{ color: T.textFaint }}>Sem dados</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.class_distribution} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                {data.class_distribution.map((e) => (
                  <Cell key={e.name} fill={CLASS_COLORS[e.name] ?? '#555'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text }}
                formatter={(v, name) => [`${v} respostas`, String(name)]}  
              />
              <Legend formatter={(v) => <span style={{ color: T.textMuted, fontSize: '12px' }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Score por domínio */}
      <div className="rounded-xl p-5" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: T.textMuted }}>Score Médio por Domínio (escala 0–4)</h3>
        {data.domains.length === 0 ? (
          <p className="text-sm" style={{ color: T.textFaint }}>Sem dados</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, data.domains.length * 44)}>
            <BarChart data={data.domains} layout="vertical" margin={{ left: 8, right: 50 }}>
              <XAxis type="number" domain={[0, 4]} ticks={[0, 1, 1.5, 2, 2.5, 3, 4]} tick={{ fill: T.axisX, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={180} tick={{ fill: T.axisY, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                content={<DomainTooltip />}
                cursor={{ fill: T.cursor }}
              />
              <Bar dataKey="avg_score" radius={[0, 4, 4, 0]}>
                {data.domains.map((d) => (
                  <Cell key={d.name} fill={CLASS_COLORS[d.classification] ?? '#555'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Cards por domínio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {data.domains.map((d) => (
          <div key={d.name} className="rounded-xl p-4 flex flex-col gap-2" style={{ backgroundColor: T.surface, border: `1px solid ${CLASS_COLORS[d.classification] ?? T.border}` }}>
            <span className="text-xs font-medium" style={{ color: CLASS_COLORS[d.classification] ?? T.textMuted }}>{d.name}</span>
            <span className="text-2xl font-bold" style={{ color: T.text }}>{d.avg_score.toFixed(2)}</span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full w-fit"
              style={{
                backgroundColor: CLASS_COLORS[d.classification] + '22',
                color: CLASS_COLORS[d.classification] ?? '#A3A3A3',
              }}
            >
              {d.classification}
            </span>
            {DOMAIN_DESCRIPTIONS[d.name] && (
              <p className="text-xs leading-relaxed mt-1" style={{ color: T.textMuted }}>{DOMAIN_DESCRIPTIONS[d.name]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
