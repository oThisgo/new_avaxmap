import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Viewport } from 'next'
import { TallyEmbed } from '@/components/TallyEmbed'

const TALLY_FORM_ID = 'b5ONKL'

// Replicar o viewport recomendado pelo Tally para embeds full-page
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default async function FormularioPage() {
  const cookieStore = await cookies()
  const collaboratorId = cookieStore.get('collaborator_id')?.value

  if (!collaboratorId) {
    redirect('/login')
  }

  // O user_id passado ao Tally é o UUID interno do colaborador.
  // Nunca passamos nome, CPF ou e-mail — apenas o identificador técnico.
  const tallySrc = `https://tally.so/r/${TALLY_FORM_ID}?user_id=${collaboratorId}`

  return <TallyEmbed src={tallySrc} />
}
