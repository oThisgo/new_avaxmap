'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'

const PALETTE = ['#F5C200', '#22C55E', '#3B82F6', '#8B5CF6', '#EF4444', '#F97316', '#06B6D4', '#EC4899']

interface DistItem { name: string; value: number }
interface DemoData {
  gender: DistItem[]
  age_range: DistItem[]
  race_color: DistItem[]
  education_level: DistItem[]
  marital_status: DistItem[]
  disability: DistItem[]
}

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', padding: '8px 12px' }}>
      <p style={{ color: '#A3A3A3', fontSize: '12px', marginBottom: '2px' }}>{label}</p>
      <p style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 600 }}>Qtd: {payload[0].value}</p>
    </div>
  )
}

function HBarChart({ title, data }: { title: string; data: DistItem[] }) {
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A' }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: '#A3A3A3' }}>{title}</h3>
      {data.length === 0 ? (
        <p className="text-sm" style={{ color: '#525252' }}>Sem dados</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
            <XAxis type="number" allowDecimals={false} tick={{ fill: '#525252', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={160} tick={{ fill: '#A3A3A3', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<BarTooltip />} cursor={{ fill: '#2A2A2A' }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function DonutChart({ title, data }: { title: string; data: DistItem[] }) {
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A' }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: '#A3A3A3' }}>{title}</h3>
      {data.length === 0 ? (
        <p className="text-sm" style={{ color: '#525252' }}>Sem dados</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', color: '#fff' }}
              formatter={(v) => [`${v}`, 'Qtd']}  
            />
            <Legend formatter={(v) => <span style={{ color: '#A3A3A3', fontSize: '11px' }}>{v}</span>} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export default function DemographicsTab({ query }: { query: string }) {
  const [data, setData] = useState<DemoData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/demographics${query ? `?${query}` : ''}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [query])

  if (loading) return <p className="text-sm" style={{ color: '#A3A3A3' }}>Carregando...</p>
  if (!data) return <p className="text-sm" style={{ color: '#EF4444' }}>Erro ao carregar dados.</p>

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <DonutChart title="Gênero" data={data.gender} />
      <HBarChart title="Faixa Etária" data={data.age_range} />
      <HBarChart title="Raça / Cor" data={data.race_color} />
      <HBarChart title="Escolaridade" data={data.education_level} />
      <HBarChart title="Estado Civil" data={data.marital_status} />
      <DonutChart title="Deficiência (PcD)" data={data.disability} />
    </div>
  )
}
