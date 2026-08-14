import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import { requireMappingAccess } from '@/lib/auth/mapping-scope'
import { normalizeMappingConfig } from '@/lib/mapping/config'
import { normalizeLogoUrl } from '@/lib/mapping/logo'

export async function GET(request: NextRequest) {
  const mappingScope = await requireMappingAccess(request)
  if ('error' in mappingScope) {
    return NextResponse.json({ error: mappingScope.error }, { status: mappingScope.status })
  }

  const mapping = await db
    .selectFrom('mappings')
    .select(['id', 'name', 'slug', 'status', 'tcle_text', 'logo_url', 'config'])
    .where('id', '=', mappingScope.mappingId)
    .executeTakeFirst()

  if (!mapping || mapping.status !== 'active') {
    return NextResponse.json({ error: 'Mapeamento não encontrado ou inativo.' }, { status: 404 })
  }

  return NextResponse.json({
    mapping: {
      id: mapping.id,
      name: mapping.name,
      slug: mapping.slug,
      tcle_text: mapping.tcle_text ?? null,
      logo_url: normalizeLogoUrl(mapping.logo_url),
    },
    config: normalizeMappingConfig(mapping.config),
  })
}
