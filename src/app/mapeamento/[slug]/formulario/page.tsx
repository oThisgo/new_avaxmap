import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { IetrForm } from '@/components/forms/IetrForm'

interface FormularioPageProps {
  params: Promise<{ slug: string }>
}

export default async function MappingFormularioPage({ params }: Readonly<FormularioPageProps>) {
  const { slug } = await params
  const cookieStore = await cookies()
  const collaboratorId = cookieStore.get('collaborator_id')?.value
  const collaboratorMappingSlug = cookieStore.get('collaborator_mapping_slug')?.value

  if (!collaboratorId || collaboratorMappingSlug !== slug) {
    redirect(`/mapeamento/${slug}/login`)
  }

  return <IetrForm thankYouPath={`/mapeamento/${slug}/agradecimento`} />
}
