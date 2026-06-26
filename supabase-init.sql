-- AvaxMap / BeeTouch - Bootstrap SQL para novo projeto Supabase
--
-- Objetivo:
-- 1. Criar o schema mínimo compatível com a aplicação atual
-- 2. Aplicar GRANTs explícitos compatíveis com a mudança do Supabase
-- 3. Ativar RLS em todas as tabelas
-- 4. Manter acesso apenas via backend (service_role / secret key)
-- 5. Eliminar o aviso visual de "RLS enabled, but no policies are set"
--    usando policies explícitas de negação para anon/authenticated
--
-- Observação importante:
-- Esta aplicação NÃO usa Supabase Auth para autorizar acesso às tabelas.
-- O controle atual ocorre via cookies próprios e rotas server-side.
-- Portanto, não crie policies permissivas para anon/authenticated.

begin;

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabelas principais
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.collaborators (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid,
  cpf text,
  name text,
  email text,
  has_answered boolean not null default false,
  area text,
  role text,
  employment_type text,
  organization text,
  birth_date text,
  gender text,
  race_color text,
  marital_status text,
  education_level text,
  disability text,
  which_disability text,
  remote_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mapping_id, cpf)
);

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null unique references public.collaborators(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  completion_percent numeric(5,2),
  answers jsonb,
  hse_domains jsonb,
  remote_domains jsonb,
  hse_score numeric(10,4),
  hse_class text,
  remote_score numeric(10,4),
  remote_class text,
  job_observations text,
  created_at timestamptz not null default now()
);

create table if not exists public.managers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role text not null default 'manager' check (role in ('superuser', 'admin', 'manager')),
  password_hash text not null,
  temp_password_plain text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Índices úteis
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists idx_collaborators_area on public.collaborators(area);
create index if not exists idx_collaborators_mapping on public.collaborators(mapping_id);
create index if not exists idx_collaborators_role on public.collaborators(role);
create index if not exists idx_collaborators_gender on public.collaborators(gender);
create index if not exists idx_collaborators_race_color on public.collaborators(race_color);
create index if not exists idx_collaborators_employment_type on public.collaborators(employment_type);
create index if not exists idx_collaborators_has_answered on public.collaborators(has_answered);
create index if not exists idx_responses_submitted_at on public.responses(submitted_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger de updated_at
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_collaborators_updated_at on public.collaborators;
create trigger trg_touch_collaborators_updated_at
before update on public.collaborators
for each row
execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC usada pela aplicação
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.save_optional_collaborator_fields(
  p_id uuid,
  p_remote_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.collaborators
  set remote_status = p_remote_status,
      updated_at = now()
  where id = p_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- GRANTs explícitos para Data API
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O Supabase exige GRANT explícito em projetos novos.
-- Como esta aplicação usa acesso server-side com chave secreta,
-- vamos liberar apenas service_role.

revoke all on table public.collaborators from anon, authenticated;
revoke all on table public.responses from anon, authenticated;
revoke all on table public.managers from anon, authenticated;

grant select, insert, update, delete on table public.collaborators to service_role;
grant select, insert, update, delete on table public.responses to service_role;
grant select, insert, update, delete on table public.managers to service_role;

grant execute on function public.save_optional_collaborator_fields(uuid, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.collaborators enable row level security;
alter table public.responses enable row level security;
alter table public.managers enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- Policies explícitas de negação
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Servem para:
-- 1. Remover o aviso do dashboard do Supabase sobre ausência de policies
-- 2. Manter anon/authenticated sem acesso real às tabelas

drop policy if exists deny_select_anon_collaborators on public.collaborators;
create policy deny_select_anon_collaborators
on public.collaborators
for select
to anon
using (false);

drop policy if exists deny_select_authenticated_collaborators on public.collaborators;
create policy deny_select_authenticated_collaborators
on public.collaborators
for select
to authenticated
using (false);

drop policy if exists deny_insert_anon_collaborators on public.collaborators;
create policy deny_insert_anon_collaborators
on public.collaborators
for insert
to anon
with check (false);

drop policy if exists deny_insert_authenticated_collaborators on public.collaborators;
create policy deny_insert_authenticated_collaborators
on public.collaborators
for insert
to authenticated
with check (false);

drop policy if exists deny_update_anon_collaborators on public.collaborators;
create policy deny_update_anon_collaborators
on public.collaborators
for update
to anon
using (false)
with check (false);

drop policy if exists deny_update_authenticated_collaborators on public.collaborators;
create policy deny_update_authenticated_collaborators
on public.collaborators
for update
to authenticated
using (false)
with check (false);

drop policy if exists deny_delete_anon_collaborators on public.collaborators;
create policy deny_delete_anon_collaborators
on public.collaborators
for delete
to anon
using (false);

drop policy if exists deny_delete_authenticated_collaborators on public.collaborators;
create policy deny_delete_authenticated_collaborators
on public.collaborators
for delete
to authenticated
using (false);

drop policy if exists deny_select_anon_responses on public.responses;
create policy deny_select_anon_responses
on public.responses
for select
to anon
using (false);

drop policy if exists deny_select_authenticated_responses on public.responses;
create policy deny_select_authenticated_responses
on public.responses
for select
to authenticated
using (false);

drop policy if exists deny_insert_anon_responses on public.responses;
create policy deny_insert_anon_responses
on public.responses
for insert
to anon
with check (false);

drop policy if exists deny_insert_authenticated_responses on public.responses;
create policy deny_insert_authenticated_responses
on public.responses
for insert
to authenticated
with check (false);

drop policy if exists deny_update_anon_responses on public.responses;
create policy deny_update_anon_responses
on public.responses
for update
to anon
using (false)
with check (false);

drop policy if exists deny_update_authenticated_responses on public.responses;
create policy deny_update_authenticated_responses
on public.responses
for update
to authenticated
using (false)
with check (false);

drop policy if exists deny_delete_anon_responses on public.responses;
create policy deny_delete_anon_responses
on public.responses
for delete
to anon
using (false);

drop policy if exists deny_delete_authenticated_responses on public.responses;
create policy deny_delete_authenticated_responses
on public.responses
for delete
to authenticated
using (false);

drop policy if exists deny_select_anon_managers on public.managers;
create policy deny_select_anon_managers
on public.managers
for select
to anon
using (false);

drop policy if exists deny_select_authenticated_managers on public.managers;
create policy deny_select_authenticated_managers
on public.managers
for select
to authenticated
using (false);

drop policy if exists deny_insert_anon_managers on public.managers;
create policy deny_insert_anon_managers
on public.managers
for insert
to anon
with check (false);

drop policy if exists deny_insert_authenticated_managers on public.managers;
create policy deny_insert_authenticated_managers
on public.managers
for insert
to authenticated
with check (false);

drop policy if exists deny_update_anon_managers on public.managers;
create policy deny_update_anon_managers
on public.managers
for update
to anon
using (false)
with check (false);

drop policy if exists deny_update_authenticated_managers on public.managers;
create policy deny_update_authenticated_managers
on public.managers
for update
to authenticated
using (false)
with check (false);

drop policy if exists deny_delete_anon_managers on public.managers;
create policy deny_delete_anon_managers
on public.managers
for delete
to anon
using (false);

drop policy if exists deny_delete_authenticated_managers on public.managers;
create policy deny_delete_authenticated_managers
on public.managers
for delete
to authenticated
using (false);

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Inserção opcional do primeiro superuser
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Rode separadamente, ajustando nome/email/senha.
-- O hash abaixo usa o modo legado aceito pela aplicação atual.
--
-- insert into public.managers (name, email, role, is_active, password_hash)
-- values (
--   'Admin Inicial',
--   'seu-email@empresa.com',
--   'superuser',
--   true,
--   encode(digest('SuaSenhaForte123!', 'sha256'), 'hex')
-- );

-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 1 - Estrutura mínima multi-tenant
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_managers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  manager_id uuid not null references public.managers(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'analyst', 'viewer')),
  created_at timestamptz not null default now(),
  unique (tenant_id, manager_id)
);

create table if not exists public.mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  module_type text check (module_type in ('HSE', 'REMOTE')),
  is_demo boolean not null default false,
  tcle_text text,
  csv_columns jsonb,
  config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table if not exists public.mapping_managers (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references public.mappings(id) on delete cascade,
  manager_id uuid not null references public.managers(id) on delete cascade,
  role text not null default 'manager' check (role in ('owner', 'manager', 'analyst', 'viewer')),
  created_at timestamptz not null default now(),
  unique (mapping_id, manager_id)
);

create index if not exists idx_tenant_managers_manager on public.tenant_managers(manager_id);
create index if not exists idx_mappings_tenant on public.mappings(tenant_id);
create index if not exists idx_mappings_status on public.mappings(status);
create index if not exists idx_mapping_managers_mapping on public.mapping_managers(mapping_id);
create index if not exists idx_mapping_managers_manager on public.mapping_managers(manager_id);

drop trigger if exists trg_touch_mappings_updated_at on public.mappings;
create trigger trg_touch_mappings_updated_at
before update on public.mappings
for each row
execute function public.touch_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_collaborators_mapping'
      and conrelid = 'public.collaborators'::regclass
  ) then
    alter table public.collaborators
      add constraint fk_collaborators_mapping
      foreign key (mapping_id)
      references public.mappings(id)
      on delete cascade;
  end if;
end
$$;

revoke all on table public.tenants from anon, authenticated;
revoke all on table public.tenant_managers from anon, authenticated;
revoke all on table public.mappings from anon, authenticated;
revoke all on table public.mapping_managers from anon, authenticated;

grant select, insert, update, delete on table public.tenants to service_role;
grant select, insert, update, delete on table public.tenant_managers to service_role;
grant select, insert, update, delete on table public.mappings to service_role;
grant select, insert, update, delete on table public.mapping_managers to service_role;

alter table public.tenants enable row level security;
alter table public.tenant_managers enable row level security;
alter table public.mappings enable row level security;
alter table public.mapping_managers enable row level security;

drop policy if exists deny_select_anon_tenants on public.tenants;
create policy deny_select_anon_tenants on public.tenants for select to anon using (false);
drop policy if exists deny_select_authenticated_tenants on public.tenants;
create policy deny_select_authenticated_tenants on public.tenants for select to authenticated using (false);
drop policy if exists deny_insert_anon_tenants on public.tenants;
create policy deny_insert_anon_tenants on public.tenants for insert to anon with check (false);
drop policy if exists deny_insert_authenticated_tenants on public.tenants;
create policy deny_insert_authenticated_tenants on public.tenants for insert to authenticated with check (false);
drop policy if exists deny_update_anon_tenants on public.tenants;
create policy deny_update_anon_tenants on public.tenants for update to anon using (false) with check (false);
drop policy if exists deny_update_authenticated_tenants on public.tenants;
create policy deny_update_authenticated_tenants on public.tenants for update to authenticated using (false) with check (false);
drop policy if exists deny_delete_anon_tenants on public.tenants;
create policy deny_delete_anon_tenants on public.tenants for delete to anon using (false);
drop policy if exists deny_delete_authenticated_tenants on public.tenants;
create policy deny_delete_authenticated_tenants on public.tenants for delete to authenticated using (false);

drop policy if exists deny_select_anon_tenant_managers on public.tenant_managers;
create policy deny_select_anon_tenant_managers on public.tenant_managers for select to anon using (false);
drop policy if exists deny_select_authenticated_tenant_managers on public.tenant_managers;
create policy deny_select_authenticated_tenant_managers on public.tenant_managers for select to authenticated using (false);
drop policy if exists deny_insert_anon_tenant_managers on public.tenant_managers;
create policy deny_insert_anon_tenant_managers on public.tenant_managers for insert to anon with check (false);
drop policy if exists deny_insert_authenticated_tenant_managers on public.tenant_managers;
create policy deny_insert_authenticated_tenant_managers on public.tenant_managers for insert to authenticated with check (false);
drop policy if exists deny_update_anon_tenant_managers on public.tenant_managers;
create policy deny_update_anon_tenant_managers on public.tenant_managers for update to anon using (false) with check (false);
drop policy if exists deny_update_authenticated_tenant_managers on public.tenant_managers;
create policy deny_update_authenticated_tenant_managers on public.tenant_managers for update to authenticated using (false) with check (false);
drop policy if exists deny_delete_anon_tenant_managers on public.tenant_managers;
create policy deny_delete_anon_tenant_managers on public.tenant_managers for delete to anon using (false);
drop policy if exists deny_delete_authenticated_tenant_managers on public.tenant_managers;
create policy deny_delete_authenticated_tenant_managers on public.tenant_managers for delete to authenticated using (false);

drop policy if exists deny_select_anon_mappings on public.mappings;
create policy deny_select_anon_mappings on public.mappings for select to anon using (false);
drop policy if exists deny_select_authenticated_mappings on public.mappings;
create policy deny_select_authenticated_mappings on public.mappings for select to authenticated using (false);
drop policy if exists deny_insert_anon_mappings on public.mappings;
create policy deny_insert_anon_mappings on public.mappings for insert to anon with check (false);
drop policy if exists deny_insert_authenticated_mappings on public.mappings;
create policy deny_insert_authenticated_mappings on public.mappings for insert to authenticated with check (false);
drop policy if exists deny_update_anon_mappings on public.mappings;
create policy deny_update_anon_mappings on public.mappings for update to anon using (false) with check (false);
drop policy if exists deny_update_authenticated_mappings on public.mappings;
create policy deny_update_authenticated_mappings on public.mappings for update to authenticated using (false) with check (false);
drop policy if exists deny_delete_anon_mappings on public.mappings;
create policy deny_delete_anon_mappings on public.mappings for delete to anon using (false);
drop policy if exists deny_delete_authenticated_mappings on public.mappings;
create policy deny_delete_authenticated_mappings on public.mappings for delete to authenticated using (false);

drop policy if exists deny_select_anon_mapping_managers on public.mapping_managers;
create policy deny_select_anon_mapping_managers on public.mapping_managers for select to anon using (false);
drop policy if exists deny_select_authenticated_mapping_managers on public.mapping_managers;
create policy deny_select_authenticated_mapping_managers on public.mapping_managers for select to authenticated using (false);
drop policy if exists deny_insert_anon_mapping_managers on public.mapping_managers;
create policy deny_insert_anon_mapping_managers on public.mapping_managers for insert to anon with check (false);
drop policy if exists deny_insert_authenticated_mapping_managers on public.mapping_managers;
create policy deny_insert_authenticated_mapping_managers on public.mapping_managers for insert to authenticated with check (false);
drop policy if exists deny_update_anon_mapping_managers on public.mapping_managers;
create policy deny_update_anon_mapping_managers on public.mapping_managers for update to anon using (false) with check (false);
drop policy if exists deny_update_authenticated_mapping_managers on public.mapping_managers;
create policy deny_update_authenticated_mapping_managers on public.mapping_managers for update to authenticated using (false) with check (false);
drop policy if exists deny_delete_anon_mapping_managers on public.mapping_managers;
create policy deny_delete_anon_mapping_managers on public.mapping_managers for delete to anon using (false);
drop policy if exists deny_delete_authenticated_mapping_managers on public.mapping_managers;
create policy deny_delete_authenticated_mapping_managers on public.mapping_managers for delete to authenticated using (false);

commit;

-- Seed opcional (rode separadamente): cliente + vínculo + demo

-- insert into public.tenants (name, slug)
-- values ('Cliente Demo', 'cliente-demo')
-- on conflict (slug) do nothing;

-- insert into public.tenant_managers (tenant_id, manager_id, role)
-- select t.id, m.id, 'owner'
-- from public.tenants t
-- join public.managers m on m.email = 'cliente.owner@cliente-demo.com'
-- where t.slug = 'cliente-demo'
-- on conflict (tenant_id, manager_id) do nothing;

-- insert into public.mappings (
--   tenant_id,
--   name,
--   slug,
--   description,
--   status,
--   module_type,
--   is_demo,
--   tcle_text,
--   csv_columns,
--   config
-- )
-- select
--   t.id,
--   'Mapeamento Psicossocial Demo',
--   'demo-hse-ietr',
--   'Demonstração inicial com módulos HSE e IETR.',
--   'active',
--   'HSE',
--   true,
--   'Este é um TCLE de demonstração. Personalize por cliente.',
--   '["Nome completo", "CPF", "Data de nascimento", "E-mail", "Area", "Cargo", "Genero", "Raca", "Idade", "Vinculo", "Escolaridade", "Estado Civil", "Deficiencia"]'::jsonb,
--   '{"modules":["sociodemografico","hse","ietr"],"report":"dynamic"}'::jsonb
-- from public.tenants t
-- where t.slug = 'cliente-demo'
-- on conflict (tenant_id, slug) do nothing;

-- insert into public.mapping_managers (mapping_id, manager_id, role)
-- select mp.id, m.id, 'manager'
-- from public.mappings mp
-- join public.managers m on m.email = 'gestor1@cliente-demo.com'
-- where mp.slug = 'demo-hse-ietr'
-- on conflict (mapping_id, manager_id) do nothing;