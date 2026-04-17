'use client'

import { useEffect } from 'react'
import Script from 'next/script'

declare global {
  interface Window {
    Tally?: {
      loadEmbeds: () => void
    }
  }
}

interface TallyEmbedProps {
  src: string
  title?: string
}

export function TallyEmbed({ src, title = 'Pesquisa de Saúde e Bem-Estar no Trabalho' }: TallyEmbedProps) {
  useEffect(() => {
    // Se o embed.js já estava carregado de uma navegação anterior, força o re-scan do DOM
    if (window.Tally) {
      window.Tally.loadEmbeds()
    }
  }, [src])

  return (
    <>
      <Script
        src="https://tally.so/widgets/embed.js"
        strategy="afterInteractive"
        onLoad={() => window.Tally?.loadEmbeds()}
      />
      <iframe
        data-tally-src={src}
        width="100%"
        height="100%"
        frameBorder={0}
        marginHeight={0}
        marginWidth={0}
        title={title}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          border: 'none',
        }}
      />
    </>
  )
}
