import { buildMappingConfig } from '../config-payload'
import { normalizeMappingConfig } from '../config'

let failures = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}`, detail !== undefined ? JSON.stringify(detail) : '')
  }
}

console.log('\n1) Perfis de coluna derivam filtros e demográficos')
{
  const built = buildMappingConfig({
    modules: ['hse'],
    csv_columns: ['Nome', 'CPF', 'Setor', 'Genero'],
    credential_column: 'CPF',
    column_mapping: { full_name: 'Nome', cpf: 'CPF', gender: 'Genero' },
    column_profiles: [
      { source_name: 'Nome', display_name: 'Nome', is_dashboard_filter: true, is_demographic: true, locked: true },
      { source_name: 'Setor', display_name: 'Área', is_dashboard_filter: true, is_demographic: false },
      { source_name: 'Genero', display_name: 'Gênero', is_dashboard_filter: false, is_demographic: true },
    ],
  })
  const cfg = built.config as Record<string, unknown>
  check('módulo hse preservado', JSON.stringify(cfg.modules) === '["hse"]', cfg.modules)
  check('coluna sensível (Nome) barrada de filtros', !(cfg.dashboard_filters as string[]).includes('Nome'), cfg.dashboard_filters)
  check('coluna sensível (Nome) barrada de demográficos', !(cfg.demographic_columns as string[]).includes('Nome'), cfg.demographic_columns)
  check('Setor virou filtro', (cfg.dashboard_filters as string[]).includes('Setor'), cfg.dashboard_filters)
  check('Genero virou demográfico', (cfg.demographic_columns as string[]).includes('Genero'), cfg.demographic_columns)
  check('module_type inferido HSE', built.moduleType === 'HSE', built.moduleType)
  check('estratificação cai para filtros', JSON.stringify(cfg.stratification_columns) === JSON.stringify(cfg.dashboard_filters), cfg.stratification_columns)
}

console.log('\n2) Edição sem reenviar CSV usa fallbackCsvColumns')
{
  const semFallback = buildMappingConfig({
    modules: ['hse'],
    column_profiles: [{ source_name: 'Setor', display_name: 'Área', is_dashboard_filter: true }],
  })
  check('sem fallback, perfil é descartado', (semFallback.config.column_profiles as unknown[]).length === 0)

  const comFallback = buildMappingConfig(
    { modules: ['hse'], column_profiles: [{ source_name: 'Setor', display_name: 'Área', is_dashboard_filter: true }] },
    { fallbackCsvColumns: ['Setor'] },
  )
  check('com fallback, perfil sobrevive', (comFallback.config.column_profiles as unknown[]).length === 1)
  check('com fallback, filtro sobrevive', (comFallback.config.dashboard_filters as string[]).includes('Setor'))
}

console.log('\n3) normalizeMappingConfig resolve rótulos e estratos')
{
  const built = buildMappingConfig({
    modules: ['hse', 'ietr'],
    csv_columns: ['Setor', 'Genero'],
    column_mapping: { gender: 'Genero' },
    column_profiles: [
      { source_name: 'Setor', display_name: 'Unidade', is_dashboard_filter: true },
      { source_name: 'Genero', display_name: 'Gênero', is_dashboard_filter: true, is_demographic: true },
    ],
  })
  const norm = normalizeMappingConfig(built.config)
  check('Genero resolvido para chave canônica gender', norm.dashboard_filters.includes('gender'), norm.dashboard_filters)
  check('Setor virou chave custom', norm.dashboard_filters.some((k) => k.startsWith('custom:')), norm.dashboard_filters)
  check('rótulo customizado preservado', Object.values(norm.field_labels).includes('Unidade'), norm.field_labels)
  check('stratification_columns exposto', norm.stratification_columns.length > 0, norm.stratification_columns)
  check('ordem HSE completa', norm.hse_question_order.length === 35, norm.hse_question_order.length)
}

console.log('\n4) Config vazia cai nos defaults')
{
  const norm = normalizeMappingConfig(null)
  check('módulos default', norm.modules.length === 3, norm.modules)
  check('filtros default', norm.dashboard_filters.length > 0, norm.dashboard_filters)
  check('estratos default = filtros', JSON.stringify(norm.stratification_columns) === JSON.stringify(norm.dashboard_filters))
}

console.log(failures === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${failures} TESTE(S) FALHARAM`)
process.exit(failures === 0 ? 0 : 1)
