'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import { useTheme } from '@/components/ThemeProvider'
import { BRAND_COLORS } from '@/lib/brand'

const PALETTE = [BRAND_COLORS.primary, BRAND_COLORS.secondary, '#5F82F6', BRAND_COLORS.mint, BRAND_COLORS.peach, BRAND_COLORS.pink, BRAND_COLORS.lilac, BRAND_COLORS.slate]

interface DistItem { name: string; value: number }
interface DemoData {
  gender: DistItem[]
  age_range: DistItem[]
  race_color: DistItem[]
  education_level: DistItem[]
  marital_status: DistItem[]
  disability: DistItem[]
  disability_types: DistItem[]
}

function BarTooltip({ active, payload, label, isDark, color }: { active?: boolean; payload?: { value: number }[]; label?: string; isDark: boolean; color: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF', border: `1px solid ${isDark ? '#2A2A2A' : '#E5E5E5'}`, borderRadius: '8px', padding: '8px 12px' }}>
      <p style={{ color: isDark ? '#A3A3A3' : '#737373', fontSize: '12px', marginBottom: '2px' }}>{label}</p>
      <p style={{ color, fontSize: '13px', fontWeight: 600 }}>Qtd: {payload[0].value}</p>
    </div>
  )
}

function TooltipWithColor({ active, payload, label, data, isDark }: { active?: boolean; payload?: { value: number }[]; label?: string; data: DistItem[]; isDark: boolean }) {
  const idx = data.findIndex((d) => d.name === label)
  const color = PALETTE[Math.max(idx, 0) % PALETTE.length]
  return <BarTooltip active={active} payload={payload} label={label} isDark={isDark} color={color} />
}

function HBarChart({ title, data }: { title: string; data: DistItem[] }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const surface = isDark ? '#1A1A1A' : '#FFFFFF'
  const border = isDark ? '#2A2A2A' : '#E5E5E5'
  const textMuted = isDark ? '#A3A3A3' : '#737373'
  const textFaint = isDark ? '#525252' : '#A3A3A3'
  const cursor = isDark ? '#2A2A2A' : '#F0F0F0'

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: surface, border: `1px solid ${border}` }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: textMuted }}>{title}</h3>
      {data.length === 0 ? (
        <p className="text-sm" style={{ color: textFaint }}>Sem dados</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
            <XAxis type="number" allowDecimals={false} tick={{ fill: textFaint, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={160} tick={{ fill: textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<TooltipWithColor data={data} isDark={isDark} />} cursor={{ fill: cursor }} />
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
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const surface = isDark ? '#1A1A1A' : '#FFFFFF'
  const border = isDark ? '#2A2A2A' : '#E5E5E5'
  const text = isDark ? '#FFFFFF' : '#111111'
  const textMuted = isDark ? '#A3A3A3' : '#737373'
  const textFaint = isDark ? '#525252' : '#A3A3A3'
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: surface, border: `1px solid ${border}` }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: textMuted }}>{title}</h3>
      {data.length === 0 ? (
        <p className="text-sm" style={{ color: textFaint }}>Sem dados</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: surface, border: `1px solid ${border}`, borderRadius: '8px', color: text }}
              formatter={(v) => [`${v}`, 'Qtd']}  
            />
            <Legend formatter={(v) => <span style={{ color: textMuted, fontSize: '11px' }}>{v}</span>} />
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

  if (loading) return <p className="text-sm" style={{ color: '#737373' }}>Carregando...</p>
  if (!data) return <p className="text-sm" style={{ color: '#EF4444' }}>Erro ao carregar dados.</p>

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <DonutChart title="Gênero" data={data.gender} />
      <HBarChart title="Faixa Etária" data={data.age_range} />
      <HBarChart title="Raça / Cor" data={data.race_color} />
      <HBarChart title="Escolaridade" data={data.education_level} />
      <HBarChart title="Estado Civil" data={data.marital_status} />
      <DonutChart title="Deficiência (PcD)" data={data.disability} />
      {data.disability_types.length > 0 && (
        <div className="md:col-span-2">
          <HBarChart title="Tipos de Deficiência" data={data.disability_types} />
        </div>
      )}
    </div>
  )
}
