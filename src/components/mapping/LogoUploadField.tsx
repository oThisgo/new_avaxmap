'use client'

import { useRef, useState } from 'react'
import { useThemeTokens } from '@/lib/theme'
import { BRAND_COLORS } from '@/lib/brand'
import { Button } from '@/components/ui/button'
import {
  ALLOWED_LOGO_ACCEPT,
  ALLOWED_LOGO_MIME,
  LOGO_REJECTED_MESSAGE,
  MAX_LOGO_DATA_URL_BYTES,
  normalizeLogoUrl,
} from '@/lib/mapping/logo'

/** Maior lado da imagem gravada. Acima disso não há ganho visual nas telas. */
const MAX_LOGO_EDGE_PX = 480

/**
 * Redimensiona no navegador antes de gravar: o arquivo que o gestor escolhe
 * costuma ser bem maior do que qualquer tela usa, e a imagem viaja como data
 * URI na configuração do mapeamento. PNG na saída para preservar transparência,
 * que é o caso da maioria das logos.
 */
async function fileToResizedDataUrl(file: File): Promise<string> {
  const originalDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('read_failed'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode_failed'))
    img.src = originalDataUrl
  })

  const scale = Math.min(1, MAX_LOGO_EDGE_PX / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas_unavailable')
  context.drawImage(image, 0, 0, width, height)

  return canvas.toDataURL('image/png')
}

interface LogoUploadFieldProps {
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
}

export function LogoUploadField({ value, onChange, disabled = false }: Readonly<LogoUploadFieldProps>) {
  const T = useThemeTokens()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError('')

    if (!ALLOWED_LOGO_MIME.includes(file.type)) {
      setError(LOGO_REJECTED_MESSAGE)
      return
    }

    setProcessing(true)
    try {
      const dataUrl = await fileToResizedDataUrl(file)
      const normalized = normalizeLogoUrl(dataUrl)
      if (!normalized) {
        setError(
          `A imagem ficou acima de ${Math.round(MAX_LOGO_DATA_URL_BYTES / 1024)} KB mesmo depois de redimensionada. `
          + 'Tente uma versão mais simples ou com menos cores.',
        )
        return
      }
      onChange(normalized)
    } catch {
      setError('Não foi possível ler esta imagem. Tente outro arquivo.')
    } finally {
      setProcessing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <p className="text-xs" style={{ color: T.textFaint }}>
        Aparece nas telas de login, no formulário, na tela de agradecimento e no dashboard deste
        mapeamento, ao lado da marca BeeTouch. PNG, JPEG ou WebP — o ideal é uma imagem com fundo
        transparente.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div
          className="flex h-20 w-40 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl p-2"
          style={{ border: `1px dashed ${T.border}`, backgroundColor: T.surface2 }}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URI não passa pelo otimizador do next/image
            <img src={value} alt="Logo do cliente" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs" style={{ color: T.textFaint }}>Sem logo</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_LOGO_ACCEPT}
            className="hidden"
            disabled={disabled || processing}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={processing}
            disabled={disabled || processing}
            onClick={() => inputRef.current?.click()}
          >
            {value ? 'Trocar logo' : 'Enviar logo'}
          </Button>

          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || processing}
              onClick={() => { setError(''); onChange(null) }}
            >
              Remover
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs" style={{ color: BRAND_COLORS.danger }}>{error}</p>
      )}
    </div>
  )
}
