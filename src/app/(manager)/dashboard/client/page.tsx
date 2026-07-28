'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_NAME } from '@/lib/brand'
import { useThemeTokens } from '@/lib/theme'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert } from '@/components/ui/alert'

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
  const T = useThemeTokens()

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
            <Button onClick={() => router.push('/dashboard/client/create')}>
              Criar mapeamento
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const firstMapping = mappings[0]
                if (firstMapping) {
                  router.push(`/mapeamento/${firstMapping.slug}/dashboard`)
                }
              }}
            >
              Ir para Analytics
            </Button>
            <ThemeToggle />
          </div>
        </div>

        <Card className="mb-6 p-4 sm:p-5">
          <p className="text-xs uppercase tracking-wide" style={{ color: T.textFaint }}>Cliente</p>
          {tenant ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">{tenant.name}</span>
              <Badge tone="primary">{tenant.role}</Badge>
              {!tenant.is_active && <Badge tone="danger">Inativo</Badge>}
            </div>
          ) : (
            <p className="mt-2 text-sm" style={{ color: T.textMuted }}>Nenhum cliente vinculado a este usuário.</p>
          )}
        </Card>

        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
          </div>
        )}

        {!loading && error && <Alert>{error}</Alert>}

        {!loading && !error && mappings.length === 0 && (
          <Card className="p-5">
            <p className="text-sm" style={{ color: T.textMuted }}>
              Ainda não há mapeamentos criados para este cliente.
            </p>
          </Card>
        )}

        {!loading && !error && mappings.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {mappings.map((mapping, idx) => (
              <motion.article
                key={mapping.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(idx * 0.05, 0.4), ease: 'easeOut' }}
                className="rounded-2xl p-5"
                style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {mapping.is_demo && <Badge tone="primary">Demo</Badge>}
                  <Badge>{mapping.status}</Badge>
                </div>

                <h2 className="text-lg font-semibold leading-tight">{mapping.name}</h2>
                <p className="mt-2 text-sm" style={{ color: T.textMuted }}>
                  {mapping.description ?? 'Sem descrição.'}
                </p>

                <div className="mt-4 flex items-center justify-between text-xs" style={{ color: T.textFaint }}>
                  <span>{mapping.module_type ?? 'Configuração customizada'}</span>
                  <span>{new Date(mapping.updated_at).toLocaleDateString('pt-BR')}</span>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button onClick={() => openMapping(mapping)} className="flex-1">
                    Abrir mapeamento
                  </Button>
                  <Button variant="outline" onClick={() => router.push(`/dashboard/client/${mapping.id}`)}>
                    Editar
                  </Button>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
