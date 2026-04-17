'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'

const CLASS_COLORS: Record<string, string> = {
  'Condição adequada': '#22C55E',
  'Zona de atenção': '#F5C200',
  'Situação de risco': '#EF4444',
}

const DOMAIN_COLORS = [
  '#F5C200', '#22C55E', '#3B82F6', '#8B5CF6',
  '#EF4444', '#F97316', '#06B6D4', '#EC4899',
]

interface DomainItem { name: string; avg_score: number; weight: number; classification: string }
interface RemoteData { domains: DomainItem[]; class_distribution: { name: string; value: number }[]; avg_score: number | null }

export default function RemoteTab({ query }: { query: string }) {
  const [data, setData] = useState<RemoteData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/remote${query ? `?${query}` : ''}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [query])

  if (loading) return <p className="text-sm" style={{ color: '#A3A3A3' }}>Carregando...</p>
  if (!data) return <p className="text-sm" style={{ color: '#EF4444' }}>Erro ao carregar dados.</p>

  return (
    <div className="flex flex-col gap-6">
      {/* Score médio */}
      <div className="rounded-xl p-5 flex flex-col gap-1" style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A' }}>
        <span className="text-xs uppercase tracking-wide" style={{ color: '#A3A3A3' }}>Score IETR Médio</span>
        <span className="text-3xl font-bold">{data.avg_score != null ? `${data.avg_score.toFixed(2)} / 5.00` : '—'}</span>
      </div>

      {/* Distribuição geral */}
      <div className="rounded-xl p-5" style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A' }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: '#A3A3A3' }}>Distribuição Geral IETR (Trabalho Remoto)</h3>
        {data.class_distribution.length === 0 ? (
          <p className="text-sm" style={{ color: '#525252' }}>Sem dados</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.class_distribution} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                {data.class_distribution.map((e) => (
                  <Cell key={e.name} fill={CLASS_COLORS[e.name] ?? '#555'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', color: '#fff' }}
                formatter={(v, name) => [`${v} respostas`, String(name)]}  
              />
              <Legend formatter={(v) => <span style={{ color: '#A3A3A3', fontSize: '12px' }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Score por domínio */}
      <div className="rounded-xl p-5" style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A' }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: '#A3A3A3' }}>Score Médio por Domínio IETR (escala 1–5)</h3>
        {data.domains.length === 0 ? (
          <p className="text-sm" style={{ color: '#525252' }}>Sem dados</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, data.domains.length * 44)}>
            <BarChart data={data.domains} layout="vertical" margin={{ left: 8, right: 50 }}>
              <XAxis type="number" domain={[1, 5]} ticks={[1, 2, 3, 3.5, 4, 5]} tick={{ fill: '#525252', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={200} tick={{ fill: '#A3A3A3', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', color: '#fff' }}
                cursor={{ fill: '#2A2A2A' }}
                itemStyle={{ color: '#FFFFFF' }}
                labelStyle={{ color: '#A3A3A3' }}
                formatter={(v, _name, entry) => [
                  `${Number(v).toFixed(2)} — ${(entry as { payload: DomainItem }).payload.classification}`, 'Score'
                ]}
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
        {data.domains.map((d, i) => (
          <div key={d.name} className="rounded-xl p-4 flex flex-col gap-2" style={{ backgroundColor: '#1A1A1A', border: `1px solid ${CLASS_COLORS[d.classification] ?? '#2A2A2A'}` }}>
            <span className="text-xs font-medium" style={{ color: CLASS_COLORS[d.classification] ?? '#A3A3A3' }}>{d.name}</span>
            <span className="text-2xl font-bold">{d.avg_score.toFixed(2)}</span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full w-fit"
              style={{
                backgroundColor: CLASS_COLORS[d.classification] + '22',
                color: CLASS_COLORS[d.classification] ?? '#A3A3A3',
              }}
            >
              {d.classification}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
