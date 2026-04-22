'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export default function LoginPage() {
  const router = useRouter()
  const [cpf, setCpf] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/collaborator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: cpf.replace(/\D/g, '') }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao validar CPF.')
        return
      }

      router.push('/formulario')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const digits = cpf.replace(/\D/g, '')

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="flex justify-center mb-10">
        <div className="w-20 h-20 rounded-full bg-[#F5C200] flex items-center justify-center overflow-hidden">
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
      <div className="rounded-2xl p-8 border border-[#E5E5E5]" style={{ backgroundColor: '#FFFFFF' }}>
        <h1 className="text-2xl font-semibold mb-1" style={{ color: '#111111' }}>
          Sua experiência no trabalho importa
        </h1>
        <p className="text-sm mb-8" style={{ color: '#737373' }}>
          Insira o seu CPF para acessar a pesquisa.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cpf" className="text-sm font-medium" style={{ color: '#404040' }}>
              CPF
            </label>
            <input
              id="cpf"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              placeholder="000.000.000-00"
              className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
              style={{ backgroundColor: '#F5F5F5', border: '1px solid #E5E5E5', color: '#111111' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#F5C200')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#E5E5E5')}
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-sm rounded-lg px-4 py-2.5" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || digits.length !== 11}
            className="w-full rounded-lg py-3 text-sm font-semibold mt-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#F5C200', color: '#111111' }}
            onMouseEnter={(e) => { if (!loading && digits.length === 11) e.currentTarget.style.backgroundColor = '#D4A800' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#F5C200' }}
          >
            {loading ? 'Verificando...' : 'Acessar pesquisa →'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs mt-6" style={{ color: '#A3A3A3' }}>
        As respostas são anônimas e analisadas apenas de forma agregada.
      </p>
    </div>
  )
}
