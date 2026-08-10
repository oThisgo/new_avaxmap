'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import { useThemeTokens } from '@/lib/theme'
import { BRAND_COLORS } from '@/lib/brand'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert } from '@/components/ui/alert'

interface ComponentItem {
  key: string
  label: string
  weight: number
  avg_score: number | null
  answered: number
}

interface DistributionGroup {
  key: string
  title: string
  items: { name: string; value: number }[]
}

interface DescriptiveGroup {
  key: string
  title: string
  items: { field: string; label: string; count: number; pct: number }[]
}

interface MentalHealthData {
  respondents: number
  avg_index: number | null
  class_distribution: { name: string; value: number }[]
  components: ComponentItem[]
  distributions: DistributionGroup[]
  suicide: { at_risk: number; total: number }
  descriptive: DescriptiveGroup[]
}

// Índice maior = melhor: Excelente no verde, Insatisfatório no vermelho.
const CLASS_COLORS: Record<string, string> = {
  'Excelente': BRAND_COLORS.success,
  'Bom': BRAND_COLORS.success,
  'Regular': BRAND_COLORS.warning,
  'Insatisfatório': BRAND_COLORS.danger,
  'Sem dados': '#8E9AAF',
  // Faixas dos blocos categóricos
  'Ausência de Sintomas': BRAND_COLORS.success,
  'Sintomas Leves': BRAND_COLORS.success,
  'Sintomas Moderados': BRAND_COLORS.warning,
  'Sintomas Graves': BRAND_COLORS.danger,
  'Ausente': BRAND_COLORS.success,
  'Leve': BRAND_COLORS.success,
  'Moderada': BRAND_COLORS.warning,
  'Alta': BRAND_COLORS.danger,
  'Sim': BRAND_COLORS.success,
  'Não': BRAND_COLORS.danger,
  'Não Informado': '#8E9AAF',
  'Não fumante': BRAND_COLORS.success,
  'Ex-fumante': BRAND_COLORS.warning,
  'Fumante passivo': BRAND_COLORS.warning,
  'Fumante': BRAND_COLORS.danger,
  'Não Bebe': BRAND_COLORS.success,
  'Consumo Moderado': BRAND_COLORS.warning,
  'Padrão Binge': BRAND_COLORS.danger,
}

function scoreColor(score: number | null): string {
  if (score === null) return '#8E9AAF'
  if (score >= 7) return BRAND_COLORS.success
  if (score >= 4) return BRAND_COLORS.warning
  return BRAND_COLORS.danger
}

export default function MentalHealthTab({ query }: Readonly<{ query: string }>) {
  const T = useThemeTokens()
  const [data, setData] = useState<MentalHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch('/api/dashboard/mental-health' + (query ? `?${query}` : ''))
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setData(d)
        setFailed(false)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [query])

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }
  if (failed || !data) return <Alert>Erro ao carregar dados.</Alert>
  if (data.respondents === 0) {
    return <Alert>Nenhuma resposta do módulo Saúde Mental para os filtros selecionados.</Alert>
  }

  const suicidePct = data.suicide.total > 0
    ? Math.round((data.suicide.at_risk / data.suicide.total) * 1000) / 10
    : 0

  const cardStyle = { backgroundColor: T.surface, border: `1px solid ${T.border}` }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl p-5 flex flex-col gap-1" style={cardStyle}>
          <span className="text-xs uppercase tracking-wide" style={{ color: T.textMuted }}>Índice de Saúde Mental</span>
          <span className="text-3xl font-bold" style={{ color: T.text }}>
            {data.avg_index != null ? `${data.avg_index.toFixed(2)} / 10.00` : '—'}
          </span>
          <span className="text-xs" style={{ color: T.textFaint }}>Média ponderada de 8 componentes; maior é melhor</span>
        </div>

        <div className="rounded-xl p-5 flex flex-col gap-1" style={cardStyle}>
          <span className="text-xs uppercase tracking-wide" style={{ color: T.textMuted }}>Respostas</span>
          <span className="text-3xl font-bold" style={{ color: T.text }}>{data.respondents}</span>
          <span className="text-xs" style={{ color: T.textFaint }}>Colaboradores que responderam o módulo</span>
        </div>

        <div
          className="rounded-xl p-5 flex flex-col gap-1"
          style={{
            backgroundColor: T.surface,
            border: `1px solid ${data.suicide.at_risk > 0 ? BRAND_COLORS.danger : T.border}`,
          }}
        >
          <span className="text-xs uppercase tracking-wide" style={{ color: T.textMuted }}>Indicadores de risco de suicídio</span>
          <span className="text-3xl font-bold" style={{ color: data.suicide.at_risk > 0 ? BRAND_COLORS.danger : T.text }}>
            {data.suicide.at_risk} <span className="text-lg font-medium">({suicidePct}%)</span>
          </span>
          <span className="text-xs" style={{ color: T.textFaint }}>Reduz o índice individual pela metade</span>
        </div>
      </div>

      <div className="rounded-xl p-5" style={cardStyle}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: T.textMuted }}>Classificação do Índice de Saúde Mental</h3>
        {data.class_distribution.length === 0 ? (
          <p className="text-sm" style={{ color: T.textFaint }}>Sem dados</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.class_distribution} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                {data.class_distribution.map((e) => <Cell key={e.name} fill={CLASS_COLORS[e.name] ?? '#555'} />)}
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

      <div className="rounded-xl p-5" style={cardStyle}>
        <h3 className="text-sm font-semibold mb-1" style={{ color: T.textMuted }}>Nota média por componente (escala 0–10)</h3>
        <p className="text-xs mb-4" style={{ color: T.textFaint }}>
          Cada componente entra no índice com o peso indicado. Quem não respondeu um componente fica
          fora da média dele — ausência de dado não vira nota zero.
        </p>
        <ResponsiveContainer width="100%" height={Math.max(220, data.components.length * 40)}>
          <BarChart data={data.components.filter((c) => c.avg_score !== null)} layout="vertical" margin={{ left: 8, right: 50 }}>
            <XAxis type="number" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fill: T.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" width={150} tick={{ fill: T.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: T.surface2 }}
              contentStyle={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text }}
              formatter={(v, _name, item) => {
                const row = item?.payload as ComponentItem | undefined
                return [`${Number(v).toFixed(2)} (peso ${row?.weight ?? '—'}, ${row?.answered ?? 0} respostas)`, 'Nota média']
              }}
            />
            <Bar dataKey="avg_score" radius={[0, 4, 4, 0]}>
              {data.components.filter((c) => c.avg_score !== null).map((c) => (
                <Cell key={c.key} fill={scoreColor(c.avg_score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data.distributions.map((group) => {
          const total = group.items.reduce((sum, item) => sum + item.value, 0)
          return (
            <div key={group.key} className="rounded-xl p-5" style={cardStyle}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: T.textMuted }}>{group.title}</h3>
              <div className="flex flex-col gap-2">
                {group.items.map((item) => {
                  const pct = total > 0 ? (item.value / total) * 100 : 0
                  const color = CLASS_COLORS[item.name] ?? '#8E9AAF'
                  return (
                    <div key={item.name} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs">
                        <span style={{ color: T.text }}>{item.name}</span>
                        <span style={{ color: T.textMuted }}>{item.value} ({Math.round(pct * 10) / 10}%)</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: T.surface2 }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {data.descriptive.map((group) => (
        <div key={group.key} className="rounded-xl p-5" style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: T.textMuted }}>{group.title}</h3>
          <div className="flex flex-col gap-2">
            {group.items.map((item) => (
              <div key={item.field} className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-3 text-xs">
                  <span style={{ color: T.text }}>{item.label}</span>
                  <span className="flex-shrink-0" style={{ color: T.textMuted }}>{item.count} ({item.pct}%)</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: T.surface2 }}>
                  <div className="h-full rounded-full" style={{ width: `${item.pct}%`, backgroundColor: BRAND_COLORS.primary }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
