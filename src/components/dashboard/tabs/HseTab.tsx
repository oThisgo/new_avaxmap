'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'

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

interface DomainItem { name: string; avg_score: number; weight: number; classification: string }
interface HseData { domains: DomainItem[]; class_distribution: { name: string; value: number }[]; avg_score: number | null }

export default function HseTab({ query }: { query: string }) {
  const [data, setData] = useState<HseData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/hse${query ? `?${query}` : ''}`)
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
        <span className="text-xs uppercase tracking-wide" style={{ color: '#A3A3A3' }}>Score HSE Médio</span>
        <span className="text-3xl font-bold">{data.avg_score != null ? `${data.avg_score.toFixed(2)} / 4.00` : '—'}</span>
      </div>

      {/* Distribuição geral */}
      <div className="rounded-xl p-5" style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A' }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: '#A3A3A3' }}>Distribuição Geral HSE</h3>
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
        <h3 className="text-sm font-semibold mb-4" style={{ color: '#A3A3A3' }}>Score Médio por Domínio (escala 0–4)</h3>
        {data.domains.length === 0 ? (
          <p className="text-sm" style={{ color: '#525252' }}>Sem dados</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, data.domains.length * 44)}>
            <BarChart data={data.domains} layout="vertical" margin={{ left: 8, right: 50 }}>
              <XAxis type="number" domain={[0, 4]} ticks={[0, 1, 1.5, 2, 2.5, 3, 4]} tick={{ fill: '#525252', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={180} tick={{ fill: '#A3A3A3', fontSize: 11 }} axisLine={false} tickLine={false} />
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
        {data.domains.map((d) => (
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
