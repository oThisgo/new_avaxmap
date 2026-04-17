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
      <div className="bg-[#1A1A1A] rounded-2xl p-8 border border-[#2A2A2A]">
        <h1 className="text-2xl font-semibold text-white mb-1">
          Pesquisa de Saúde e Bem-Estar no Trabalho
        </h1>
        <p className="text-[#A3A3A3] text-sm mb-8">
          Insira o seu CPF para acessar a pesquisa.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cpf" className="text-sm font-medium text-[#A3A3A3]">
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
              className="w-full rounded-lg bg-[#111111] border border-[#2A2A2A] px-4 py-3 text-white placeholder-[#525252] text-sm focus:outline-none focus:border-[#F5C200] transition-colors"
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-4 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || digits.length !== 11}
            className="w-full rounded-lg bg-[#F5C200] text-[#111111] font-semibold py-3 text-sm mt-2 hover:bg-[#D4A800] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verificando...' : 'Acessar pesquisa →'}
          </button>
        </form>
      </div>

      <p className="text-center text-[#525252] text-xs mt-6">
        As respostas são anônimas e analisadas apenas de forma agregada.
      </p>
    </div>
  )
}
