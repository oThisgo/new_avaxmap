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
  cpf text unique,
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
  updated_at timestamptz not null default now()
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