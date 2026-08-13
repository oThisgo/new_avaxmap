import { NextResponse } from 'next/server'
import { sql } from 'kysely'
import { db } from '@/lib/db/pool'

// Usado pelo health check do target group da AWS (ALB) — sem autenticação,
// sem depender de nenhum mapeamento/colaborador específico. Faz um SELECT 1
// pra confirmar que a instância consegue mesmo falar com o RDS, não só que o
// processo Next.js está de pé; isso é o que teria detectado a instância antes
// de receber tráfego real se as env vars do banco estivessem erradas.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await sql`SELECT 1`.execute(db)
    return NextResponse.json({ status: 'ok' })
  } catch (err) {
    console.error('[health] falha ao conectar no banco', err instanceof Error ? err.message : err)
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
}
