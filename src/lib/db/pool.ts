import { Pool, types } from 'pg'
import { Kysely, PostgresDialect } from 'kysely'
import type { DB } from '@/types/kysely-db'

declare global {
  var __pgPool: Pool | undefined
}

// O driver `pg` não formata timestamp/numeric como o PostgREST do Supabase
// fazia (Date object e string, respectivamente, em vez de string ISO e
// number) — o resto do código (e o front) já assume o formato antigo em
// dezenas de lugares. Em vez de reescrever tudo, alinhamos o parser do driver
// de volta ao formato de sempre. Os aliases Timestamp/Numeric em
// kysely-db.ts são corrigidos automaticamente por scripts/db-codegen.mjs
// pra combinar com isso.
// Todas as colunas de timestamp do schema são `timestamp with time zone` — só
// esse OID precisa de override (não há coluna `timestamp` sem fuso no banco).
types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => new Date(val).toISOString())
types.setTypeParser(types.builtins.NUMERIC, (val) => (val === null ? null : Number.parseFloat(val)))

function createPool(): Pool {
  const { POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, DEV_DATABASE_HOST, DEV_DATABASE_PORT } = process.env

  if (!POSTGRES_DB || !POSTGRES_USER || !POSTGRES_PASSWORD || !DEV_DATABASE_HOST) {
    throw new Error(
      'Variáveis de banco ausentes: configure POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD e DEV_DATABASE_HOST (ver .env.example).',
    )
  }

  return new Pool({
    host: DEV_DATABASE_HOST,
    port: DEV_DATABASE_PORT ? Number(DEV_DATABASE_PORT) : 5432,
    database: POSTGRES_DB,
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    // RDS exige TLS. Sem o CA bundle da AWS carregado aqui, isso ainda cobre a
    // criptografia do tráfego, só não valida a cadeia do certificado — dá pra
    // endurecer depois com o bundle oficial (https://truststore.pki.rds.amazonaws.com)
    // se o time quiser.
    ssl: { rejectUnauthorized: false },
    max: 10,
  })
}

// Reusa o pool entre hot-reloads do `next dev` — o Next recarrega módulos a
// cada mudança de arquivo; sem isso, cada reload abriria um pool novo e
// vazaria conexões até estourar o limite do Postgres.
function getPool(): Pool {
  const pool = globalThis.__pgPool ?? createPool()
  if (process.env.NODE_ENV !== 'production') {
    globalThis.__pgPool = pool
  }
  return pool
}

// Kysely aceita `pool` como valor pronto OU como função lazy (`() => Promise<Pool>`).
// Usar a função lazy é o que faz esse módulo poder ser importado sem as env vars
// do banco presentes — necessário porque o `next build` importa os módulos de
// rota na fase "Collecting page data" mesmo sem executar handler nenhum; com o
// Pool construído (e validado) direto no topo do arquivo, isso derrubava o build
// dentro do Docker (onde não há `.env.local`, só o `--env-file` do `docker run`
// em runtime). Com a função lazy, a validação só roda na primeira query real.
export const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool: () => Promise.resolve(getPool()) }),
})
