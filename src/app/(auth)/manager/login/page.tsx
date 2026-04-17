'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function ManagerLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao autenticar')
        return
      }

      router.push('/dashboard')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#111111' }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: '#F5C200' }}
          >
            <Image
              src="/logo-alana.png"
              alt="Instituto Alana"
              width={56}
              height={56}
              className="object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8" style={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A' }}>
          <h1 className="text-2xl font-semibold text-white mb-1">Acesso do Gestor</h1>
          <p className="text-sm mb-8" style={{ color: '#A3A3A3' }}>
            Entre com suas credenciais para acessar o dashboard.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: '#A3A3A3' }}>
                E-mail
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="gestor@institutoalana.org.br"
                className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                style={{ backgroundColor: '#111111', border: '1px solid #2A2A2A', color: '#FFFFFF' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#F5C200')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#2A2A2A')}
                disabled={loading}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: '#A3A3A3' }}>
                Senha
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                style={{ backgroundColor: '#111111', border: '1px solid #2A2A2A', color: '#FFFFFF' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#F5C200')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#2A2A2A')}
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-sm rounded-lg px-4 py-2.5" style={{ backgroundColor: '#EF444422', border: '1px solid #EF444440', color: '#EF4444' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-3 text-sm font-semibold transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#F5C200', color: '#111111' }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#D4A800' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#F5C200' }}
            >
              {loading ? 'Entrando...' : 'Entrar →'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#525252' }}>
          Instituto Alana — Plataforma de Mapeamento de Riscos Psicossociais
        </p>
      </div>
    </div>
  )
}
