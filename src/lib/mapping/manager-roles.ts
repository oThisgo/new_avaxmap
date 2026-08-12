// Papéis selecionáveis ao cadastrar um gestor de mapeamento (mapping_managers.role
// / tenant_managers.role). 'owner' fica de fora de propósito: é atribuído
// automaticamente a quem cria o mapeamento (ver src/app/api/client/mappings/route.ts),
// nunca escolhido manualmente aqui.
//
// Antes deste arquivo existiam 5 opções (superuser, admin, manager, analyst,
// viewer), mas 'manager', 'analyst' e 'viewer' eram 100% redundantes entre si —
// nenhuma rota do backend (ver isMappingAdmin/isMappingSuperuser em
// src/lib/auth/roles.ts) distinguia entre elas, todas caíam no mesmo nível
// ("só visualiza o dashboard"). Colapsadas em uma única opção (ManagerRole
// 'viewer') para o seletor não mentir sobre diferenças que não existem no código.
export type ManagerRole = 'superuser' | 'admin' | 'viewer'

export const MANAGER_ROLE_OPTIONS: ReadonlyArray<{ value: ManagerRole; label: string; description: string }> = [
  {
    value: 'superuser',
    label: 'Superuser',
    description: 'Acesso completo: dashboard, insights de IA, relatório executivo, exportação de dados individuais e upload da base de colaboradores.',
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Dashboard completo e upload da base de colaboradores. Sem insights de IA, relatório executivo ou exportação de dados individuais.',
  },
  {
    value: 'viewer',
    label: 'Visualizador',
    description: 'Apenas visualização do dashboard (dados agregados). Sem upload, insights ou exportação.',
  },
]

/**
 * Rótulo de exibição para QUALQUER valor já persistido em mapping_managers.role
 * / tenant_managers.role — incluindo 'owner' (atribuído pelo sistema) e os
 * valores legados 'manager'/'analyst' (pré-colapso, ver comentário acima), que
 * continuam funcionando exatamente como 'viewer' mas não devem reaparecer como
 * opção no formulário. Mantém a tabela de gestores consistente com o seletor
 * sem exigir migração dos dados já gravados.
 */
export function managerRoleLabel(role: string): string {
  switch (role) {
    case 'owner':
      return 'Owner'
    case 'superuser':
      return 'Superuser'
    case 'admin':
      return 'Admin'
    case 'manager':
    case 'analyst':
    case 'viewer':
      return 'Visualizador'
    default:
      return role
  }
}
