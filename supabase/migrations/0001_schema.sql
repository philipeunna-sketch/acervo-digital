-- =============================================================================
-- Acervo Digital - schema inicial (PostgreSQL)
-- Compativel com Supabase Postgres e com PGlite (dev local).
-- Execucao: `npm run migrate` (usa o runner do projeto) ou via Supabase CLI.
-- =============================================================================

create schema if not exists app;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null,
  full_name             text,
  role                  text not null default 'user' check (role in ('admin', 'user')),
  avatar_url            text,
  must_change_password  boolean not null default false,
  quota_bytes           bigint,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists profiles_email_lower_key on public.profiles (lower(email));

-- -----------------------------------------------------------------------------
-- local_users / local_sessions / local_password_resets
-- Usados apenas pelo driver de autenticacao local (desenvolvimento).
-- O driver Supabase usa auth.users e nao toca nestas tabelas.
-- -----------------------------------------------------------------------------
create table if not exists public.local_users (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null,
  password_hash         text not null,
  password_salt         text not null,
  role                  text not null default 'user' check (role in ('admin', 'user')),
  must_change_password  boolean not null default false,
  last_login_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists local_users_email_lower_key on public.local_users (lower(email));

create table if not exists public.local_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.local_users (id) on delete cascade,
  token_hash  text not null,
  user_agent  text,
  ip_address  text,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create unique index if not exists local_sessions_token_hash_key on public.local_sessions (token_hash);
create index if not exists local_sessions_user_id_idx on public.local_sessions (user_id);
create index if not exists local_sessions_expires_at_idx on public.local_sessions (expires_at);

create table if not exists public.local_password_resets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.local_users (id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create unique index if not exists local_password_resets_token_hash_key on public.local_password_resets (token_hash);

-- -----------------------------------------------------------------------------
-- storage_providers
-- Credenciais de storage sao cifradas (AES-256-GCM) antes de persistir.
-- -----------------------------------------------------------------------------
create table if not exists public.storage_providers (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.profiles (id) on delete cascade,
  is_system           boolean not null default false,
  name                text not null,
  kind                text not null check (kind in ('s3', 'local')),
  endpoint            text,
  region              text,
  bucket              text,
  access_key_id       text,
  secret_access_key   text,           -- cifrado
  is_default          boolean not null default false,
  is_active           boolean not null default true,
  config              jsonb not null default '{}'::jsonb,
  last_tested_at      timestamptz,
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists storage_providers_user_id_idx on public.storage_providers (user_id);
create unique index if not exists storage_providers_default_key
  on public.storage_providers (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_default;

-- -----------------------------------------------------------------------------
-- files
-- Metadados apenas. O binario vive no storage (S3/Wasabi ou driver local).
-- -----------------------------------------------------------------------------
create table if not exists public.files (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  name            text not null,
  original_name   text not null,
  extension       text,
  mime_type       text not null,
  size_bytes      bigint not null default 0 check (size_bytes >= 0),
  category        text not null default 'other'
                  check (category in ('document', 'image', 'video', 'audio', 'archive', 'other')),
  provider_id     uuid references public.storage_providers (id) on delete set null,
  provider_kind   text not null default 's3',
  storage_key     text not null,
  external_id     text,
  external_url    text,
  checksum        text,
  status          text not null default 'active'
                  check (status in ('active', 'processing', 'trashed', 'failed')),
  source          text not null default 'upload'
                  check (source in ('upload', 'import', 'drive', 'telegram')),
  source_url      text,
  source_meta     jsonb not null default '{}'::jsonb,
  media_meta      jsonb not null default '{}'::jsonb,
  text_extracted  boolean not null default false,
  excerpt         text,
  description     text,
  trashed_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists files_user_created_idx on public.files (user_id, created_at desc);
create index if not exists files_user_status_idx on public.files (user_id, status);
create index if not exists files_user_category_idx on public.files (user_id, category);
create index if not exists files_user_size_idx on public.files (user_id, size_bytes desc);
create index if not exists files_user_name_idx on public.files (user_id, lower(name));
create index if not exists files_provider_idx on public.files (provider_id);
create index if not exists files_storage_key_idx on public.files (storage_key);
create index if not exists files_source_idx on public.files (source, source_url);
-- busca textual por nome/descricao
create index if not exists files_search_idx on public.files
  using gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(excerpt, '')));

-- -----------------------------------------------------------------------------
-- albums
-- -----------------------------------------------------------------------------
create table if not exists public.albums (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  name          text not null,
  description   text,
  cover_file_id uuid references public.files (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists albums_user_created_idx on public.albums (user_id, created_at desc);
create index if not exists albums_user_name_idx on public.albums (user_id, lower(name));

-- -----------------------------------------------------------------------------
-- album_files (N:N)
-- -----------------------------------------------------------------------------
create table if not exists public.album_files (
  album_id  uuid not null references public.albums (id) on delete cascade,
  file_id   uuid not null references public.files (id) on delete cascade,
  position  integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (album_id, file_id)
);

create index if not exists album_files_file_id_idx on public.album_files (file_id);

-- -----------------------------------------------------------------------------
-- tags
-- -----------------------------------------------------------------------------
create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists tags_user_name_key on public.tags (user_id, lower(name));

create table if not exists public.file_tags (
  file_id    uuid not null references public.files (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (file_id, tag_id)
);

create index if not exists file_tags_tag_id_idx on public.file_tags (tag_id);

-- -----------------------------------------------------------------------------
-- favorites
-- -----------------------------------------------------------------------------
create table if not exists public.favorites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  file_id    uuid not null references public.files (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, file_id)
);

create index if not exists favorites_user_created_idx on public.favorites (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- integrations
-- Tokens/chaves de terceiros sao cifrados (AES-256-GCM) antes de persistir.
-- -----------------------------------------------------------------------------
create table if not exists public.integrations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  provider          text not null check (provider in ('google_drive', 'telegram', 'ai', 'search')),
  status            text not null default 'disconnected'
                    check (status in ('connected', 'disconnected', 'requires_config')),
  account_label     text,
  account_email     text,
  access_token      text,           -- cifrado
  refresh_token     text,           -- cifrado
  expires_at        timestamptz,
  scopes            text,
  config            jsonb not null default '{}'::jsonb,   -- segredos cifrados dentro de `secrets`
  last_tested_at    timestamptz,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists integrations_user_provider_key on public.integrations (user_id, provider);
create index if not exists integrations_user_idx on public.integrations (user_id);

-- -----------------------------------------------------------------------------
-- upload_sessions
-- -----------------------------------------------------------------------------
create table if not exists public.upload_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  file_name         text not null,
  size_bytes        bigint not null default 0,
  mime_type         text not null,
  provider_id       uuid references public.storage_providers (id) on delete set null,
  storage_key       text not null,
  multipart_upload_id text,
  part_size         integer,
  status            text not null default 'preparing'
                    check (status in ('preparing', 'uploading', 'paused', 'completing', 'completed', 'failed', 'canceled')),
  uploaded_bytes    bigint not null default 0,
  parts             jsonb not null default '[]'::jsonb,
  file_id           uuid references public.files (id) on delete set null,
  error_message     text,
  checksum          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz
);

create index if not exists upload_sessions_user_status_idx on public.upload_sessions (user_id, status);
create index if not exists upload_sessions_created_idx on public.upload_sessions (created_at desc);

-- -----------------------------------------------------------------------------
-- import_jobs / import_candidates (modulo Salvar conteudo)
-- -----------------------------------------------------------------------------
create table if not exists public.import_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  mode          text not null check (mode in ('search', 'url')),
  query         text,
  url           text,
  status        text not null default 'pending'
                check (status in ('pending', 'running', 'completed', 'failed', 'partial')),
  provider      text,
  ai_model      text,
  album_id      uuid references public.albums (id) on delete set null,
  provider_id   uuid references public.storage_providers (id) on delete set null,
  stats         jsonb not null default '{}'::jsonb,
  error_message text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists import_jobs_user_created_idx on public.import_jobs (user_id, created_at desc);

create table if not exists public.import_candidates (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references public.import_jobs (id) on delete cascade,
  media_type        text not null default 'unknown'
                    check (media_type in ('image', 'video', 'audio', 'document', 'unknown')),
  title             text,
  description       text,
  source_url        text not null,
  download_url      text,
  thumbnail_url     text,
  mime_type         text,
  size_bytes        bigint,
  width             integer,
  height            integer,
  duration_seconds  integer,
  suggested_name    text,
  suggested_tags    jsonb not null default '[]'::jsonb,
  ai_confidence     numeric(4,3),
  selected          boolean not null default false,
  status            text not null default 'found'
                    check (status in ('found', 'importing', 'imported', 'failed', 'skipped')),
  imported_file_id  uuid references public.files (id) on delete set null,
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists import_candidates_job_idx on public.import_candidates (job_id);

-- -----------------------------------------------------------------------------
-- audit_logs
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id) on delete set null,
  action       text not null,
  entity_type  text,
  entity_id    text,
  metadata     jsonb not null default '{}'::jsonb,
  ip_address   text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists audit_logs_user_created_idx on public.audit_logs (user_id, created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action);

-- -----------------------------------------------------------------------------
-- storage_usage_cache (uso reportado pelo provedor, quando disponivel)
-- -----------------------------------------------------------------------------
create table if not exists public.storage_usage_cache (
  provider_id  uuid primary key references public.storage_providers (id) on delete cascade,
  used_bytes   bigint not null default 0,
  total_bytes  bigint,
  captured_at  timestamptz not null default now()
);
