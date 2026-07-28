'use client'

import { useState } from 'react'
import { useThemeTokens } from '@/lib/theme'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/input'

export type EditableQuestion = {
  code: string
  domain: string
  text: string
}

interface QuestionOrderEditorProps {
  questions: readonly EditableQuestion[]
  order: string[]
  textOverrides: Record<string, string>
  onOrderChange: (order: string[]) => void
  onTextChange: (code: string, text: string) => void
  onResetText: (code: string) => void
}

/** Lista reordenável (drag'n'drop nativo) + edição de enunciado por questão, agrupada visualmente por domínio via badge. */
export function QuestionOrderEditor({
  questions,
  order,
  textOverrides,
  onOrderChange,
  onTextChange,
  onResetText,
}: Readonly<QuestionOrderEditorProps>) {
  const T = useThemeTokens()
  const [dragCode, setDragCode] = useState<string | null>(null)

  const byCode = new Map(questions.map((q) => [q.code, q]))
  const orderedQuestions = order
    .map((code) => byCode.get(code))
    .filter((q): q is EditableQuestion => q !== undefined)

  function handleDragOver(e: React.DragEvent, overCode: string) {
    e.preventDefault()
    if (!dragCode || dragCode === overCode) return
    const from = order.indexOf(dragCode)
    const to = order.indexOf(overCode)
    if (from === -1 || to === -1) return
    const next = [...order]
    next.splice(from, 1)
    next.splice(to, 0, dragCode)
    onOrderChange(next)
  }

  return (
    <div className="space-y-2">
      {orderedQuestions.map((q) => {
        const customText = textOverrides[q.code]
        const isDragging = dragCode === q.code
        return (
          <div
            key={q.code}
            draggable
            onDragStart={() => setDragCode(q.code)}
            onDragOver={(e) => handleDragOver(e, q.code)}
            onDragEnd={() => setDragCode(null)}
            className="flex items-start gap-2 rounded-xl p-3 transition-colors"
            style={{
              border: `1px solid ${T.border}`,
              backgroundColor: isDragging ? T.surface2 : T.surface,
              opacity: isDragging ? 0.5 : 1,
            }}
          >
            <span
              className="mt-2 flex-shrink-0 cursor-grab select-none touch-none"
              style={{ color: T.textFaint }}
              title="Arraste para reordenar"
              aria-hidden
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="8" cy="6" r="1.6" />
                <circle cx="16" cy="6" r="1.6" />
                <circle cx="8" cy="12" r="1.6" />
                <circle cx="16" cy="12" r="1.6" />
                <circle cx="8" cy="18" r="1.6" />
                <circle cx="16" cy="18" r="1.6" />
              </svg>
            </span>

            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs" style={{ color: T.textFaint }}>{q.code}</span>
                <Badge tone="primary">{q.domain}</Badge>
                {customText && (
                  <button
                    type="button"
                    onClick={() => onResetText(q.code)}
                    className="text-xs underline-offset-2 hover:underline"
                    style={{ color: T.textMuted }}
                  >
                    Restaurar enunciado original
                  </button>
                )}
              </div>
              <Textarea
                value={customText ?? q.text}
                onChange={(e) => onTextChange(q.code, e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
