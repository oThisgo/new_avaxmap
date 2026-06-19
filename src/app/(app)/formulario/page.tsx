import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { IetrForm } from '@/components/forms/IetrForm'

export default async function FormularioPage() {
  const cookieStore = await cookies()
  const collaboratorId = cookieStore.get('collaborator_id')?.value

  if (!collaboratorId) {
    redirect('/login')
  }

  return <IetrForm />
}
