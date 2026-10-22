-- =============================================================================
-- Acervo Digital - Row Level Security + funcoes auxiliares
-- ---------------------------------------------------------------------
-- Estrategia de isolamento:
--   O backend define `app.user_id` em cada transacao (SET LOCAL app.user_id).
--   As policies comparam a linha com `app.current_user_id()`.
--   Nenhum cliente (browser) acessa o Postgres diretamente: o service role e
--   restrito ao servidor e nunca e exposto ao frontend.
-- =============================================================================

create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('app.user_id', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

create or replace function app.set_current_user(p_user_id uuid)
returns void
language sql
volatile
as $$
  select set_config('app.user_id', coalesce(p_user_id::text, ''), true);
$$;

-- Conceder uso do schema app apenas a roles que existem no ambiente.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant usage on schema app to %I', r);
      execute format('grant execute on all functions in schema app to %I', r);
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists profiles_owner on public.profiles;
create policy profiles_owner on public.profiles
  for all to public
  using (id = app.current_user_id())
  with check (id = app.current_user_id());

-- -----------------------------------------------------------------------------
-- files / albums / tags / favorites / album_files
-- -----------------------------------------------------------------------------
alter table public.files enable row level security;
drop policy if exists files_owner on public.files;
create policy files_owner on public.files
  for all to public
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

alter table public.albums enable row level security;
drop policy if exists albums_owner on public.albums;
create policy albums_owner on public.albums
  for all to public
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

alter table public.tags enable row level security;
drop policy if exists tags_owner on public.tags;
create policy tags_owner on public.tags
  for all to public
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

alter table public.favorites enable row level security;
drop policy if exists favorites_owner on public.favorites;
create policy favorites_owner on public.favorites
  for all to public
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

alter table public.album_files enable row level security;
drop policy if exists album_files_owner on public.album_files;
create policy album_files_owner on public.album_files
  for all to public
  using (
    exists (select 1 from public.albums a where a.id = album_id and a.user_id = app.current_user_id())
  )
  with check (
    exists (select 1 from public.albums a where a.id = album_id and a.user_id = app.current_user_id())
  );

alter table public.file_tags enable row level security;
drop policy if exists file_tags_owner on public.file_tags;
create policy file_tags_owner on public.file_tags
  for all to public
  using (
    exists (select 1 from public.files f where f.id = file_id and f.user_id = app.current_user_id())
  )
  with check (
    exists (select 1 from public.files f where f.id = file_id and f.user_id = app.current_user_id())
  );

-- -----------------------------------------------------------------------------
-- storage_providers: proprios + provedores de sistema (is_system)
-- -----------------------------------------------------------------------------
alter table public.storage_providers enable row level security;
drop policy if exists storage_providers_scope on public.storage_providers;
create policy storage_providers_scope on public.storage_providers
  for all to public
  using (is_system = true or user_id = app.current_user_id())
  with check (user_id = app.current_user_id() or is_system = true);

alter table public.storage_usage_cache enable row level security;
drop policy if exists storage_usage_cache_scope on public.storage_usage_cache;
create policy storage_usage_cache_scope on public.storage_usage_cache
  for all to public
  using (
    exists (
      select 1 from public.storage_providers p
      where p.id = provider_id and (p.is_system = true or p.user_id = app.current_user_id())
    )
  )
  with check (
    exists (
      select 1 from public.storage_providers p
      where p.id = provider_id and (p.is_system = true or p.user_id = app.current_user_id())
    )
  );

-- -----------------------------------------------------------------------------
-- integrations / upload_sessions / import_jobs / import_candidates / audit_logs
-- -----------------------------------------------------------------------------
alter table public.integrations enable row level security;
drop policy if exists integrations_owner on public.integrations;
create policy integrations_owner on public.integrations
  for all to public
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

alter table public.upload_sessions enable row level security;
drop policy if exists upload_sessions_owner on public.upload_sessions;
create policy upload_sessions_owner on public.upload_sessions
  for all to public
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

alter table public.import_jobs enable row level security;
drop policy if exists import_jobs_owner on public.import_jobs;
create policy import_jobs_owner on public.import_jobs
  for all to public
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

alter table public.import_candidates enable row level security;
drop policy if exists import_candidates_owner on public.import_candidates;
create policy import_candidates_owner on public.import_candidates
  for all to public
  using (
    exists (select 1 from public.import_jobs j where j.id = job_id and j.user_id = app.current_user_id())
  )
  with check (
    exists (select 1 from public.import_jobs j where j.id = job_id and j.user_id = app.current_user_id())
  );

alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_owner on public.audit_logs;
create policy audit_logs_owner on public.audit_logs
  for all to public
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

-- -----------------------------------------------------------------------------
-- Tabelas do driver local de autenticacao: acessiveis apenas ao servidor.
-- O servidor conecta como superusuario (o RLS e ignorado para o dono da tabela),
-- mas deixamos as policies explicitas para/documentar a intencao.
-- -----------------------------------------------------------------------------
alter table public.local_users enable row level security;
drop policy if exists local_users_server_only on public.local_users;
create policy local_users_server_only on public.local_users
  for all to public
  using (false)
  with check (false);

alter table public.local_sessions enable row level security;
drop policy if exists local_sessions_server_only on public.local_sessions;
create policy local_sessions_server_only on public.local_sessions
  for all to public
  using (false)
  with check (false);

alter table public.local_password_resets enable row level security;
drop policy if exists local_password_resets_server_only on public.local_password_resets;
create policy local_password_resets_server_only on public.local_password_resets
  for all to public
  using (false)
  with check (false);
