create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (display_name is null or char_length(btrim(display_name)) <= 80)
);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  slug text not null unique,
  title text not null default '',
  summary text not null default '',
  content_markdown text not null default '',
  template text not null,
  theme jsonb not null default '{}'::jsonb,
  visibility text not null default 'private',
  status text not null default 'draft',
  allow_indexing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint boards_id_owner_unique unique (id, owner_id),
  constraint boards_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint boards_title_length check (char_length(title) <= 120),
  constraint boards_summary_length check (char_length(summary) <= 300),
  constraint boards_template check (template in ('store', 'event', 'meeting')),
  constraint boards_visibility check (visibility in ('public', 'password', 'private')),
  constraint boards_status check (status in ('draft', 'published')),
  constraint boards_lifecycle check (
    (status = 'draft' and published_at is null)
    or (status = 'published' and published_at is not null)
  ),
  constraint boards_indexing check (
    not allow_indexing
    or (visibility = 'public' and status = 'published')
  )
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  owner_id uuid not null,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  state text not null default 'reserved',
  reservation_expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attachments_board_owner_fk
    foreign key (board_id, owner_id)
    references public.boards(id, owner_id)
    on delete cascade,
  constraint attachments_state check (state in ('reserved', 'ready')),
  constraint attachments_reservation_state check (
    (state = 'reserved' and reservation_expires_at is not null)
    or (state = 'ready' and reservation_expires_at is null)
  )
);

create table private.board_secrets (
  board_id uuid primary key references public.boards(id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table private.access_attempts (
  board_id uuid not null references public.boards(id) on delete cascade,
  anonymous_key_hash text not null,
  failed_count integer not null default 0 check (failed_count >= 0),
  window_started_at timestamptz not null,
  locked_until timestamptz,
  primary key (board_id, anonymous_key_hash)
);

create index boards_owner_updated_idx
  on public.boards (owner_id, updated_at desc);
create index attachments_board_created_idx
  on public.attachments (board_id, created_at);
create index attachments_owner_state_idx
  on public.attachments (owner_id, state);

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger boards_set_updated_at
before update on public.boards
for each row execute function private.set_updated_at();

create trigger board_secrets_set_updated_at
before update on private.board_secrets
for each row execute function private.set_updated_at();

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_name text;
begin
  candidate_name := nullif(
    btrim(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))),
    ''
  );

  insert into public.profiles (id, display_name)
  values (new.id, left(candidate_name, 80));

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.boards enable row level security;
alter table public.boards force row level security;
alter table public.attachments enable row level security;
alter table public.attachments force row level security;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.boards to authenticated;
grant select, insert, update, delete on public.attachments to authenticated;
