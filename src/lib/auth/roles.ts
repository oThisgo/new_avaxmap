// Funções puras de checagem de papel (sem I/O), para poderem ser importadas
// tanto em rotas de API (server) quanto em componentes client (ex.: DashboardShell)
// sem arrastar o cliente Supabase server-only para o bundle do browser.

export function isAdmin(role: string): boolean {
  return role === 'superuser' || role === 'admin'
}

export function isSuperuser(role: string): boolean {
  return role === 'superuser'
}

/**
 * Admin efetivo para um mapeamento específico: admin/superuser global (equipe
 * AvaxMap, atua em qualquer mapeamento), OU papel de owner/admin/superuser
 * nesse mapeamento em particular (mapping_managers.role, ver getMappingManagerRole
 * em src/lib/auth/mapping-scope.ts).
 */
export function isMappingAdmin(globalRole: string, mappingRole: string | null): boolean {
  if (isAdmin(globalRole)) return true
  return mappingRole === 'owner' || mappingRole === 'admin' || mappingRole === 'superuser'
}

/**
 * Superuser efetivo para um mapeamento específico: superuser global, OU papel
 * de owner/superuser nesse mapeamento (gestor "superuser" cadastrado na
 * criação/gestão do mapeamento — restrito a ele, não um privilégio global).
 */
export function isMappingSuperuser(globalRole: string, mappingRole: string | null): boolean {
  if (isSuperuser(globalRole)) return true
  return mappingRole === 'owner' || mappingRole === 'superuser'
}
