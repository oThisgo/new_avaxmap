#!/usr/bin/env node
// Wrapper cross-platform pro kysely-codegen. Existe porque montar a connection
// string via `$VAR` no script do package.json quebra no cmd.exe (shell que o
// `npm` usa por padrão no Windows, mesmo invocado de dentro do Git Bash/PowerShell) —
// aqui a URL é montada em JS, sem depender de expansão de variável do shell.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'

const required = ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'DEV_DATABASE_HOST', 'DEV_DATABASE_PORT', 'POSTGRES_DB']
const missing = required.filter((name) => !process.env[name])

if (missing.length > 0) {
  console.error(`[db:codegen] variáveis ausentes: ${missing.join(', ')} (rode com --env-file=.env.local ou exporte no ambiente)`)
  process.exit(1)
}

const { POSTGRES_USER, POSTGRES_PASSWORD, DEV_DATABASE_HOST, DEV_DATABASE_PORT, POSTGRES_DB } = process.env

const url = `postgres://${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(POSTGRES_PASSWORD)}@${DEV_DATABASE_HOST}:${DEV_DATABASE_PORT}/${POSTGRES_DB}`

// Chama o entry point JS direto (via `node`) em vez do shim .cmd/.bin — evita
// depender do shell (cmd.exe no Windows) pra resolver o binário, o mesmo tipo
// de problema que fez trocar o script original de $VAR por este wrapper.
const require = createRequire(import.meta.url)
const cliEntry = require.resolve('kysely-codegen/dist/cli/bin.js')

const outFile = 'src/types/kysely-db.ts'

const result = spawnSync(process.execPath, [cliEntry, '--url', url, '--out-file', outFile], {
  stdio: 'inherit',
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

// O `pg` devolve timestamptz como Date e numeric como string por padrão; o
// pool (src/lib/db/pool.ts) registra parsers que trazem isso de volta pro
// formato que o resto do app sempre assumiu (string ISO / number) — os dois
// aliases abaixo, gerados pelo kysely-codegen a partir do OID bruto do
// Postgres, precisam ser corrigidos pra combinar com o runtime real. Isso
// roda toda vez que o codegen é regenerado, então não precisa editar
// kysely-db.ts à mão depois de uma migration nova.
let content = readFileSync(outFile, 'utf-8')
content = content.replace(
  'export type Numeric = ColumnType<string, number | string, number | string>;',
  'export type Numeric = ColumnType<number, number | string, number | string>;',
)
content = content.replace(
  'export type Timestamp = ColumnType<Date, Date | string, Date | string>;',
  'export type Timestamp = ColumnType<string, string, string>;',
)
writeFileSync(outFile, content)
console.log('[db:codegen] aliases Timestamp/Numeric ajustados pro formato usado pelo app (ver src/lib/db/pool.ts)')
