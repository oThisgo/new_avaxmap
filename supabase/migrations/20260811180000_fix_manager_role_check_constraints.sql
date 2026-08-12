-- Corrige os CHECK constraints de tenant_managers.role e mapping_managers.role,
-- que ficaram para trás em relação ao vocabulário de papéis usado pela aplicação
-- (ManagerRole em src/app/(manager)/dashboard/client/[id]/page.tsx e os tipos
-- ManagerPayload em src/app/api/client/mappings/route.ts e
-- src/app/api/client/mappings/[id]/route.ts): 'owner' | 'superuser' | 'admin' |
-- 'manager' | 'analyst' | 'viewer'.
--
-- Sintoma: ao cadastrar um gestor com papel "Superuser" num mapeamento, o
-- upsert em tenant_managers falhava com
--   23514 "new row for relation tenant_managers violates check constraint
--   tenant_managers_role_check"
-- Na criação do mapeamento (src/app/api/client/mappings/route.ts) esse erro era
-- descartado silenciosamente, então o gestor parecia nunca ter sido salvo. Ao
-- tentar adicioná-lo depois pela tela de edição
-- (src/app/api/client/mappings/[id]/route.ts), o mesmo upsert falhava mas
-- dessa vez o erro era propagado como "Falha ao vincular gestor ao tenant.".
--
-- Confirmado por reprodução direta contra o banco (upsert de teste, revertido
-- em seguida): tenant_managers aceitava apenas owner/admin/analyst/viewer, e
-- mapping_managers aceitava apenas owner/manager/analyst/viewer — nenhum dos
-- dois aceitava 'superuser', e cada um também rejeitava um valor que o outro
-- aceitava ('manager' em tenant_managers, 'admin' em mapping_managers).
--
-- Rode este arquivo no SQL Editor do Supabase do projeto (não há CLI/migrations
-- automatizadas neste repositório).

alter table tenant_managers
  drop constraint if exists tenant_managers_role_check;

alter table tenant_managers
  add constraint tenant_managers_role_check
  check (role in ('owner', 'superuser', 'admin', 'manager', 'analyst', 'viewer'));

alter table mapping_managers
  drop constraint if exists mapping_managers_role_check;

alter table mapping_managers
  add constraint mapping_managers_role_check
  check (role in ('owner', 'superuser', 'admin', 'manager', 'analyst', 'viewer'));
