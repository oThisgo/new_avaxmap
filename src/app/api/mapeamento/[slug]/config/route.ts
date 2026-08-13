import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import { normalizeMappingConfig } from '@/lib/mapping/config'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function GET(_: NextRequest, { params }: Readonly<RouteParams>) {
  const { slug } = await params
  const normalizedSlug = slug.trim().toLowerCase()

  const mapping = await db
    .selectFrom('mappings')
    .select(['id', 'name', 'slug', 'status', 'tcle_text', 'config'])
    .where('slug', '=', normalizedSlug)
    .executeTakeFirst()

  if (!mapping || mapping.status !== 'active') {
    return NextResponse.json({ error: 'Mapeamento não encontrado ou inativo.' }, { status: 404 })
  }

  const config = normalizeMappingConfig(mapping.config)

  return NextResponse.json({
    mapping: {
      id: mapping.id,
      name: mapping.name,
      slug: mapping.slug,
      tcle_text: mapping.tcle_text ?? null,
    },
    config,
  })
}
