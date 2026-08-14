'use client'

import { useEffect, useState } from 'react'
import { useThemeTokens } from '@/lib/theme'
import { normalizeLogoUrl } from '@/lib/mapping/logo'

/**
 * Logo do cliente nas telas do mapeamento. Sempre **acompanha** a marca
 * BeeTouch, nunca a substitui: nas telas de card ela entra num rodapé discreto
 * abaixo do conteúdo; nos cabeçalhos, ao lado do símbolo da BeeTouch.
 */

type MappingLogoVariant = 'footer' | 'header'

const HEIGHT_BY_VARIANT: Record<MappingLogoVariant, string> = {
  footer: '2.5rem',
  header: '2rem',
}

interface MappingLogoProps {
  src: string | null | undefined
  variant?: MappingLogoVariant
  className?: string
}

export function MappingLogo({ src, variant = 'footer', className }: Readonly<MappingLogoProps>) {
  const T = useThemeTokens()
  const safeSrc = normalizeLogoUrl(src)
  if (!safeSrc) return null

  if (variant === 'header') {
    return (
      <div className={className} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span aria-hidden style={{ width: 1, height: '1.75rem', backgroundColor: T.border }} />
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI não passa pelo otimizador do next/image */}
        <img
          src={safeSrc}
          alt="Logo da empresa"
          style={{ height: HEIGHT_BY_VARIANT.header, width: 'auto', maxWidth: '9rem', objectFit: 'contain' }}
        />
      </div>
    )
  }

  return (
    <div className={className}>
      <div
        className="mx-auto mt-6 flex flex-col items-center gap-2 border-t pt-5"
        style={{ borderColor: T.border }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI não passa pelo otimizador do next/image */}
        <img
          src={safeSrc}
          alt="Logo da empresa"
          style={{ height: HEIGHT_BY_VARIANT.footer, width: 'auto', maxWidth: '12rem', objectFit: 'contain' }}
        />
      </div>
    </div>
  )
}

/**
 * Busca a logo pela rota pública de configuração do mapeamento. Serve às telas
 * que ainda não carregam configuração nenhuma (consentimento, agradecimento,
 * login do gestor); quem já busca a config deve passar `src` direto para
 * `MappingLogo` em vez de fazer uma segunda requisição.
 */
export function useMappingLogo(mappingSlug: string | null | undefined): string | null {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!mappingSlug) return
    let active = true

    fetch(`/api/mapeamento/${mappingSlug}/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active) return
        setLogoUrl(normalizeLogoUrl(json?.mapping?.logo_url))
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [mappingSlug])

  return logoUrl
}
