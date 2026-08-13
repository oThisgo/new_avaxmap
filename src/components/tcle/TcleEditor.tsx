'use client'

import { useEffect, useRef, useState } from 'react'
import { useThemeTokens } from '@/lib/theme'
import { BRAND_COLORS } from '@/lib/brand'
import { isRichTextEmpty } from '@/lib/tcle/rich-text'

type TextAlign = 'left' | 'center' | 'right' | 'justify'

interface TcleFormatState {
  bold: boolean
  italic: boolean
  underline: boolean
  highlight: boolean
  align: TextAlign
}

const ALIGN_COMMAND: Record<TextAlign, string> = {
  left: 'justifyLeft',
  center: 'justifyCenter',
  right: 'justifyRight',
  justify: 'justifyFull',
}

const ALIGN_ICON_LINES: Record<TextAlign, ReadonlyArray<[number, number, number, number]>> = {
  left: [[3, 6, 21, 6], [3, 10, 17, 10], [3, 14, 21, 14], [3, 18, 17, 18]],
  center: [[3, 6, 21, 6], [6, 10, 18, 10], [3, 14, 21, 14], [6, 18, 18, 18]],
  right: [[3, 6, 21, 6], [7, 10, 21, 10], [3, 14, 21, 14], [7, 18, 21, 18]],
  justify: [[3, 6, 21, 6], [3, 10, 21, 10], [3, 14, 21, 14], [3, 18, 21, 18]],
}

const ALIGN_LABELS: Record<TextAlign, string> = {
  left: 'Alinhar à esquerda',
  center: 'Centralizar',
  right: 'Alinhar à direita',
  justify: 'Justificar',
}

interface TcleEditorProps {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
}

/**
 * Editor rico do TCLE (negrito, itálico, sublinhado, marca-texto e
 * alinhamento), usado tanto na criação quanto na edição do mapeamento — ver
 * src/app/(manager)/dashboard/client/create/page.tsx e .../client/[id]/page.tsx.
 * A sanitização (o que sobrevive ao salvar/exibir) mora em src/lib/tcle/rich-text.ts.
 */
export function TcleEditor({ value, onChange, disabled = false }: Readonly<TcleEditorProps>) {
  const T = useThemeTokens()
  const editorRef = useRef<HTMLDivElement>(null)
  const [formatState, setFormatState] = useState<TcleFormatState>({
    bold: false,
    italic: false,
    underline: false,
    highlight: false,
    align: 'left',
  })

  function isSelectionInsideEditor(): boolean {
    if (!editorRef.current) return false
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return false
    const anchorNode = selection.anchorNode
    return !!anchorNode && editorRef.current.contains(anchorNode)
  }

  function isHighlightValueActive(value: unknown): boolean {
    if (typeof value !== 'string') return false
    const normalized = value.toLowerCase().replace(/\s+/g, '')
    return normalized.includes('#fde68a') || normalized.includes('rgb(253,230,138)')
  }

  function refreshFormatState() {
    if (!isSelectionInsideEditor()) {
      setFormatState((prev) => ({ ...prev, bold: false, italic: false, underline: false, highlight: false }))
      return
    }

    const hiliteValue = document.queryCommandValue('hiliteColor')
    const backValue = document.queryCommandValue('backColor')
    const align: TextAlign = document.queryCommandState('justifyCenter')
      ? 'center'
      : document.queryCommandState('justifyRight')
        ? 'right'
        : document.queryCommandState('justifyFull')
          ? 'justify'
          : 'left'

    setFormatState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      highlight: isHighlightValueActive(hiliteValue) || isHighlightValueActive(backValue),
      align,
    })
  }

  function applyCommand(command: 'bold' | 'italic' | 'underline') {
    if (!editorRef.current || disabled) return
    editorRef.current.focus()
    document.execCommand(command)
    onChange(editorRef.current.innerHTML)
    refreshFormatState()
  }

  function applyHighlight() {
    if (!editorRef.current || disabled) return
    editorRef.current.focus()
    const shouldRemoveHighlight = formatState.highlight
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand('hiliteColor', false, shouldRemoveHighlight ? 'transparent' : '#FDE68A')
    document.execCommand('styleWithCSS', false, 'false')
    onChange(editorRef.current.innerHTML)
    refreshFormatState()
  }

  function applyAlign(align: TextAlign) {
    if (!editorRef.current || disabled) return
    editorRef.current.focus()
    // styleWithCSS garante `style="text-align: ...”` no <p> (o que o
    // sanitizador reconhece) em vez do atributo `align` legado.
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(ALIGN_COMMAND[align])
    document.execCommand('styleWithCSS', false, 'false')
    onChange(editorRef.current.innerHTML)
    refreshFormatState()
  }

  // Sem isto, o Chrome usa <div> a cada Enter — tag que o sanitizador não
  // reconhece (rich-text.ts só espera <p>) e que antes desaparecia inteira ao
  // salvar, colando o parágrafo seguinte no anterior sem nem um espaço no
  // lugar. Forçando <p>, a quebra de parágrafo fica estável de ponta a ponta.
  useEffect(() => {
    document.execCommand('defaultParagraphSeparator', false, 'p')
  }, [])

  useEffect(() => {
    if (!editorRef.current) return
    if (editorRef.current.innerHTML === value) return
    editorRef.current.innerHTML = value
  }, [value])

  useEffect(() => {
    function handleSelectionChange() {
      refreshFormatState()
    }

    const editor = editorRef.current
    if (editor) {
      editor.addEventListener('keyup', handleSelectionChange)
      editor.addEventListener('mouseup', handleSelectionChange)
    }
    document.addEventListener('selectionchange', handleSelectionChange)

    return () => {
      if (editor) {
        editor.removeEventListener('keyup', handleSelectionChange)
        editor.removeEventListener('mouseup', handleSelectionChange)
      }
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const buttonStyle = (active: boolean, isHighlightButton = false): React.CSSProperties => ({
    border: `1px solid ${active ? BRAND_COLORS.primary : T.border}`,
    backgroundColor: active
      ? `${BRAND_COLORS.primary}22`
      : (isHighlightButton ? '#FEF3C7' : T.surface2),
    color: active ? BRAND_COLORS.primary : (isHighlightButton ? '#92400E' : T.text),
  })

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => applyCommand('bold')}
          disabled={disabled}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={buttonStyle(formatState.bold)}
          aria-label="Negrito"
          title="Negrito"
          aria-pressed={formatState.bold}
        >
          <span style={{ fontWeight: 700 }}>B</span>
        </button>
        <button
          type="button"
          onClick={() => applyCommand('italic')}
          disabled={disabled}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm disabled:cursor-not-allowed disabled:opacity-50"
          style={buttonStyle(formatState.italic)}
          aria-label="Itálico"
          title="Itálico"
          aria-pressed={formatState.italic}
        >
          <span style={{ fontStyle: 'italic', fontWeight: 600 }}>I</span>
        </button>
        <button
          type="button"
          onClick={() => applyCommand('underline')}
          disabled={disabled}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm disabled:cursor-not-allowed disabled:opacity-50"
          style={buttonStyle(formatState.underline)}
          aria-label="Sublinhado"
          title="Sublinhado"
          aria-pressed={formatState.underline}
        >
          <span style={{ textDecoration: 'underline', fontWeight: 600 }}>U</span>
        </button>
        <button
          type="button"
          onClick={applyHighlight}
          disabled={disabled}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-50"
          style={buttonStyle(formatState.highlight, true)}
          aria-label="Marca-texto"
          title="Marca-texto"
          aria-pressed={formatState.highlight}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 5l4 4" />
            <path d="M4 20l5.5-1.5L20 8 16 4 5.5 14.5z" />
            <path d="M3 21h7" />
          </svg>
        </button>

        <div className="w-px self-stretch" style={{ backgroundColor: T.border }} aria-hidden />

        {(Object.keys(ALIGN_COMMAND) as TextAlign[]).map((align) => (
          <button
            key={align}
            type="button"
            onClick={() => applyAlign(align)}
            disabled={disabled}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-50"
            style={buttonStyle(formatState.align === align)}
            aria-label={ALIGN_LABELS[align]}
            title={ALIGN_LABELS[align]}
            aria-pressed={formatState.align === align}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {ALIGN_ICON_LINES[align].map(([x1, y1, x2, y2]) => (
                <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
              ))}
            </svg>
          </button>
        ))}
      </div>

      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={(e) => onChange((e.currentTarget as HTMLDivElement).innerHTML)}
        className="mt-2 min-h-[180px] w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2, color: T.text }}
      />
      {isRichTextEmpty(value) && (
        <p className="mt-2 text-xs" style={{ color: T.textFaint }}>
          Dica: selecione um trecho para aplicar formatação como negrito, itálico, sublinhado, marca-texto e alinhamento.
        </p>
      )}
    </div>
  )
}
