import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireMappingAccess } from '@/lib/auth/mapping-scope'
import { normalizeMappingConfig } from '@/lib/mapping/config'

export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  const mappingScope = await requireMappingAccess(request, supabase)
  if ('error' in mappingScope) {
    return NextResponse.json({ error: mappingScope.error }, { status: mappingScope.status })
  }

  const { data: mapping, error } = await supabase
    .from('mappings')
    .select('id, name, slug, status, tcle_text, config')
    .eq('id', mappingScope.mappingId)
    .single()

  if (error || !mapping || mapping.status !== 'active') {
    return NextResponse.json({ error: 'Mapeamento não encontrado ou inativo.' }, { status: 404 })
  }

  return NextResponse.json({
    mapping: {
      id: mapping.id,
      name: mapping.name,
      slug: mapping.slug,
      tcle_text: mapping.tcle_text ?? null,
    },
    config: normalizeMappingConfig(mapping.config),
  })
}
