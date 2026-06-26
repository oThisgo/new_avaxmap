'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_COLORS, BRAND_NAME } from '@/lib/brand'

type MappingRow = {
  id: string
  name: string
  slug: string
  description: string | null
  status: 'draft' | 'active' | 'archived'
  module_type: 'HSE' | 'REMOTE' | null
  is_demo: boolean
  updated_at: string
}

type TenantContext = {
  id: string
  name: string
  slug: string
  role: string
  is_active: boolean
}

export default function ClientDashboardPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const T = useMemo(() => ({
    bg: isDark ? BRAND_COLORS.darkBg : BRAND_COLORS.lightBg,
    surface: isDark ? BRAND_COLORS.darkSurface : BRAND_COLORS.lightSurface,
    surface2: isDark ? BRAND_COLORS.darkSurface2 : BRAND_COLORS.lightSurface2,
    border: isDark ? BRAND_COLORS.borderDark : BRAND_COLORS.borderLight,
    text: isDark ? BRAND_COLORS.textLight : BRAND_COLORS.textDark,
    textMuted: isDark ? BRAND_COLORS.textMutedDark : BRAND_COLORS.textMutedLight,
    textFaint: isDark ? BRAND_COLORS.textFaintDark : BRAND_COLORS.textFaintLight,
  }), [isDark])

  const [tenant, setTenant] = useState<TenantContext | null>(null)
  const [mappings, setMappings] = useState<MappingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/auth/manager/me')
      .then(async (res) => {
        if (!res.ok) throw new Error('unauthorized')
        return res.json()
      })
      .then((me) => {
        if (me.must_change_password) {
          router.replace('/dashboard/reset-password?first_access=1')
        }
      })
      .catch(() => {
        router.replace('/manager/login')
      })
  }, [router])

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/client/mappings')
        const data = await res.json()

        if (!res.ok) {
          setError(data.error ?? 'Não foi possível carregar os mapeamentos do cliente.')
          return
        }

        setTenant(data.tenant ?? null)
        setMappings(data.mappings ?? [])
      } catch {
        setError('Erro de conexão ao carregar o dashboard do cliente.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  function openMapping(mapping: MappingRow) {
    router.push(`/mapeamento/${mapping.slug}/dashboard`)
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: T.bg, color: T.text }}>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: T.textFaint }}>Plataforma {BRAND_NAME}</p>
            <h1 className="text-2xl font-semibold sm:text-3xl">Dashboard do Cliente</h1>
            <p className="mt-2 text-sm" style={{ color: T.textMuted }}>
              Gerencie seus mapeamentos e abra o ambiente de análise de cada projeto.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard/client/create')}
              className="rounded-lg px-3 py-2 text-sm font-semibold transition-colors text-white"
              style={{ backgroundColor: BRAND_COLORS.primary }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = BRAND_COLORS.primaryHover }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = BRAND_COLORS.primary }}
            >
              Criar mapeamento
            </button>
            <button
              type="button"
              onClick={() => {
                const firstMapping = mappings[0]
                if (firstMapping) {
                  router.push(`/mapeamento/${firstMapping.slug}/dashboard`)
                }
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{ border: `1px solid ${T.border}`, color: T.textMuted, backgroundColor: T.surface }}
            >
              Ir para Analytics
            </button>
            <ThemeToggle />
          </div>
        </div>

        <section className="mb-6 rounded-2xl p-4 sm:p-5" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
          <p className="text-xs uppercase tracking-wide" style={{ color: T.textFaint }}>Cliente</p>
          {tenant ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">{tenant.name}</span>
              <span className="rounded-full px-2.5 py-1 text-xs" style={{ color: BRAND_COLORS.primary, backgroundColor: `${BRAND_COLORS.primary}18` }}>
                {tenant.role}
              </span>
              {!tenant.is_active && (
                <span className="rounded-full px-2.5 py-1 text-xs" style={{ color: '#EF4444', backgroundColor: '#EF444422' }}>
                  Inativo
                </span>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm" style={{ color: T.textMuted }}>Nenhum cliente vinculado a este usuário.</p>
          )}
        </section>

        {loading && (
          <div className="rounded-2xl p-5" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <p className="text-sm" style={{ color: T.textMuted }}>Carregando mapeamentos...</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl p-5" style={{ border: '1px solid #ef444466', backgroundColor: '#ef44441a' }}>
            <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>
          </div>
        )}

        {!loading && !error && mappings.length === 0 && (
          <div className="rounded-2xl p-5" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <p className="text-sm" style={{ color: T.textMuted }}>
              Ainda não há mapeamentos criados para este cliente.
            </p>
          </div>
        )}

        {!loading && !error && mappings.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {mappings.map((mapping) => (
              <article
                key={mapping.id}
                className="rounded-2xl p-5"
                style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {mapping.is_demo && (
                    <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ color: BRAND_COLORS.primary, backgroundColor: `${BRAND_COLORS.primary}20` }}>
                      Demo
                    </span>
                  )}
                  <span className="rounded-full px-2.5 py-1 text-xs" style={{ color: T.textMuted, backgroundColor: T.surface2 }}>
                    {mapping.status}
                  </span>
                </div>

                <h2 className="text-lg font-semibold leading-tight">{mapping.name}</h2>
                <p className="mt-2 text-sm" style={{ color: T.textMuted }}>
                  {mapping.description ?? 'Sem descrição.'}
                </p>

                <div className="mt-4 flex items-center justify-between text-xs" style={{ color: T.textFaint }}>
                  <span>{mapping.module_type ?? 'Configuração customizada'}</span>
                  <span>{new Date(mapping.updated_at).toLocaleDateString('pt-BR')}</span>
                </div>

                <button
                  type="button"
                  onClick={() => openMapping(mapping)}
                  className="mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition"
                  style={{ backgroundColor: BRAND_COLORS.primary }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = BRAND_COLORS.primaryHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = BRAND_COLORS.primary }}
                >
                  Abrir mapeamento
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
