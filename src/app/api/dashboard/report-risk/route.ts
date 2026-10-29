import { NextRequest, NextResponse } from 'next/server'
import { getManagerFromSession, isMappingSuperuser } from '@/lib/auth/manager'
import { getMappingScopeContext, getMappingManagerRole } from '@/lib/auth/mapping-scope'
import { buildRiskReport, DEFAULT_TECHNICAL_RESPONSIBLES } from '@/lib/reports/risk-pptx'
import {
  buildMappingReportPayload,
  getReportOptionsMeta,
  ReportBuildError,
  type ReportOptions,
} from '@/lib/reports/report-data'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Geração e opções do relatório são restritas a superuser do mapeamento ativo. */
async function requireSuperuserMapping(request: NextRequest): Promise<{ mappingId: string } | NextResponse> {
  const manager = await getManagerFromSession(request.cookies.get('manager_session')?.value)
  if (!manager) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const scope = await getMappingScopeContext(request, { requireMappingScope: true })
  if ('error' in scope) return NextResponse.json({ error: scope.error }, { status: scope.status })

  const mappingId = scope.mappingId as string
  const role = await getMappingManagerRole(manager.id, mappingId)
  if (!isMappingSuperuser(manager.role, role)) {
    return NextResponse.json({ error: 'Apenas superuser pode gerar relatórios.' }, { status: 403 })
  }
  return { mappingId }
}

function errorResponse(err: unknown, fallback: string) {
  if (err instanceof ReportBuildError) return NextResponse.json({ error: err.message }, { status: err.status })
  console.error('[report-risk]', err instanceof Error ? err.message : err)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperuserMapping(request)
  if (auth instanceof NextResponse) return auth

  try {
    const meta = await getReportOptionsMeta(auth.mappingId)
    return NextResponse.json({ ...meta, defaultTechnicalResponsibles: DEFAULT_TECHNICAL_RESPONSIBLES })
  } catch (err) {
    return errorResponse(err, 'Erro ao carregar as opções do relatório.')
  }
}

const MAX_IMAGE_DATA_URL = 3 * 1024 * 1024

function sanitizeImage(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string' || !value) return undefined
  if (value.length > MAX_IMAGE_DATA_URL || !/^data:image\/(png|jpeg|webp);base64,/.test(value)) return undefined
  return value
}

function sanitizeStringMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, string[]> = {}
  for (const [key, list] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(list)) out[key] = list.filter((v): v is string => typeof v === 'string').slice(0, 500)
  }
  return out
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperuserMapping(request)
  if (auth instanceof NextResponse) return auth

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const notes = (body.riskControlNotes && typeof body.riskControlNotes === 'object') ? body.riskControlNotes as Record<string, unknown> : {}
  const byDomainNotes = (notes.byDomain && typeof notes.byDomain === 'object') ? notes.byDomain as Record<string, unknown> : {}
  const controls = (body.riskControlByDomain && typeof body.riskControlByDomain === 'object') ? body.riskControlByDomain as Record<string, unknown> : {}

  const options: ReportOptions = {
    clientName: typeof body.clientName === 'string' ? body.clientName : '',
    clientDescription: typeof body.clientDescription === 'string' ? body.clientDescription.slice(0, 600) : '',
    clientLogoBase64: sanitizeImage(body.clientLogoBase64),
    coverImageBase64: sanitizeImage(body.coverImageBase64),
    filters: sanitizeStringMap(body.filters),
    strata: Array.isArray(body.strata) ? body.strata.filter((v): v is string => typeof v === 'string') : undefined,
    excludedCategories: sanitizeStringMap(body.excludedCategories),
    excludeOmittedFromBase: body.excludeOmittedFromBase === true,
    sections: Array.isArray(body.sections) ? body.sections.filter((v): v is never => typeof v === 'string') : undefined,
    minGroupSize: typeof body.minGroupSize === 'number' ? body.minGroupSize : undefined,
    riskControlByDomain: Object.fromEntries(
      Object.entries(controls).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)) as Array<[string, number]>,
    ),
  }

  try {
    const payload = await buildMappingReportPayload(auth.mappingId, options)
    payload.riskControlNotes = {
      general: typeof notes.general === 'string' ? notes.general.slice(0, 1200) : undefined,
      conclusion: typeof notes.conclusion === 'string' ? notes.conclusion.slice(0, 1200) : undefined,
      byDomain: Object.fromEntries(
        Object.entries(byDomainNotes)
          .filter(([, v]) => typeof v === 'string' && v.trim())
          .map(([k, v]) => [k, (v as string).slice(0, 600)]),
      ),
    }
    if (Array.isArray(body.technicalResponsibles)) {
      payload.technicalResponsibles = body.technicalResponsibles
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim().slice(0, 120))
        .slice(0, 6)
    }

    const pptx = await buildRiskReport(payload)
    const slug = payload.clientName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cliente'
    const filename = `relatorio-riscos-${slug}-${new Date().toISOString().slice(0, 10)}.pptx`

    return new NextResponse(Buffer.from(pptx), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return errorResponse(err, 'Erro ao gerar o relatório.')
  }
}
