begin;

alter table public.boards
add column deletion_started_at timestamptz;

alter table public.attachments
drop constraint attachments_state,
drop constraint attachments_reservation_state,
add constraint attachments_state
  check (state in ('reserved', 'cancelling', 'ready', 'deleting')),
add constraint attachments_reservation_state
  check (
    (state in ('reserved', 'cancelling') and reservation_expires_at is not null)
    or (state in ('ready', 'deleting') and reservation_expires_at is null)
  );

create or replace function public.finalize_board_image(
  p_attachment_id uuid,
  p_mime_type text,
  p_actual_size_bytes bigint
)
returns table (
  id uuid,
  storage_path text,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  state text,
  reservation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  owned_attachment public.attachments%rowtype;
begin
  if account_id is null then
    raise exception 'image_not_found';
  end if;

  select attachments.*
  into owned_attachment
  from public.attachments
  where attachments.id = p_attachment_id
    and attachments.owner_id = account_id
  for update;

  if not found then
    raise exception 'image_not_found';
  end if;

  if owned_attachment.state = 'ready' then
    if owned_attachment.mime_type = p_mime_type
      and owned_attachment.size_bytes = p_actual_size_bytes
    then
      return query
      select
        owned_attachment.id,
        owned_attachment.storage_path,
        owned_attachment.original_filename,
        owned_attachment.mime_type,
        owned_attachment.size_bytes,
        owned_attachment.state,
        owned_attachment.reservation_expires_at;
      return;
    end if;

    raise exception 'image_already_finalized';
  end if;

  if owned_attachment.state = 'cancelling' then
    raise exception 'image_cancellation_in_progress';
  end if;

  if owned_attachment.state = 'deleting' then
    raise exception 'image_deletion_in_progress';
  end if;

  if owned_attachment.state <> 'reserved' then
    raise exception 'image_invalid_state';
  end if;

  if p_actual_size_bytes is null
    or p_actual_size_bytes <= 0
    or p_actual_size_bytes > 10485760
  then
    raise exception 'image_invalid_size';
  end if;

  if p_mime_type is null
    or p_mime_type not in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    )
  then
    raise exception 'image_invalid_mime_type';
  end if;

  if owned_attachment.reservation_expires_at <= now() then
    raise exception 'image_reservation_expired';
  end if;

  update public.attachments
  set
    mime_type = p_mime_type,
    size_bytes = p_actual_size_bytes,
    state = 'ready',
    reservation_expires_at = null
  where attachments.id = owned_attachment.id
  returning * into owned_attachment;

  return query
  select
    owned_attachment.id,
    owned_attachment.storage_path,
    owned_attachment.original_filename,
    owned_attachment.mime_type,
    owned_attachment.size_bytes,
    owned_attachment.state,
    owned_attachment.reservation_expires_at;
end;
$$;

drop policy board_image_reserved_insert on storage.objects;
create policy board_image_reserved_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'board-images'
  and exists (
    select 1
    from public.attachments
    join public.boards
      on boards.id = attachments.board_id
      and boards.owner_id = attachments.owner_id
    where attachments.owner_id = (select auth.uid())
      and attachments.storage_path = objects.name
      and attachments.state = 'reserved'
      and attachments.reservation_expires_at > now()
      and boards.deletion_started_at is null
    for key share of boards
  )
);

create or replace function public.reserve_board_image(
  p_board_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint
)
returns table (
  id uuid,
  storage_path text,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  reservation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  attachment_id uuid := gen_random_uuid();
  active_image_count bigint;
  current_storage_bytes bigint;
  reserved_attachment public.attachments%rowtype;
begin
  if account_id is null then
    raise exception 'image_not_found';
  end if;

  perform 1
  from public.boards
  where boards.id = p_board_id
    and boards.owner_id = account_id
    and boards.deletion_started_at is null
  for key share;

  if not found then
    raise exception 'image_not_found';
  end if;

  select profiles.storage_bytes
  into current_storage_bytes
  from public.profiles
  where profiles.id = account_id
  for update;

  if not found then
    raise exception 'image_not_found';
  end if;

  if p_size_bytes is not null
    and p_size_bytes > 52428800 - current_storage_bytes
  then
    raise exception 'image_quota_exceeded';
  end if;

  if p_size_bytes is null
    or p_size_bytes <= 0
    or p_size_bytes > 10485760
  then
    raise exception 'image_invalid_size';
  end if;

  if p_mime_type is null
    or p_mime_type not in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    )
  then
    raise exception 'image_invalid_mime_type';
  end if;

  select count(*)
  into active_image_count
  from public.attachments
  where attachments.board_id = p_board_id;

  if active_image_count >= 20 then
    raise exception 'image_limit_exceeded';
  end if;

  insert into public.attachments (
    id,
    board_id,
    owner_id,
    storage_path,
    original_filename,
    mime_type,
    size_bytes,
    state,
    reservation_expires_at
  ) values (
    attachment_id,
    p_board_id,
    account_id,
    account_id::text || '/' || p_board_id::text || '/' || attachment_id::text,
    p_original_filename,
    p_mime_type,
    p_size_bytes,
    'reserved',
    now() + interval '15 minutes'
  )
  returning * into reserved_attachment;

  return query
  select
    reserved_attachment.id,
    reserved_attachment.storage_path,
    reserved_attachment.original_filename,
    reserved_attachment.mime_type,
    reserved_attachment.size_bytes,
    reserved_attachment.reservation_expires_at;
end;
$$;

create function public.claim_board_image_deletion(
  p_board_id uuid,
  p_attachment_id uuid,
  p_board_revision bigint
)
returns table (
  id uuid,
  owner_id uuid,
  storage_path text,
  state text,
  board_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  owned_attachment public.attachments%rowtype;
  owned_board public.boards%rowtype;
  next_board_revision bigint;
begin
  if account_id is null then
    raise exception 'image_not_found';
  end if;

  select boards.*
  into owned_board
  from public.boards
  where boards.id = p_board_id
    and boards.owner_id = account_id
  for update;

  if not found then
    raise exception 'image_not_found';
  end if;

  if p_board_revision is null
    or owned_board.revision <> p_board_revision
  then
    raise exception 'image_board_changed';
  end if;

  select attachments.*
  into owned_attachment
  from public.attachments
  where attachments.id = p_attachment_id
    and attachments.board_id = p_board_id
    and attachments.owner_id = account_id
  for update;

  if not found then
    raise exception 'image_not_found';
  end if;

  if owned_attachment.state = 'ready' then
    update public.attachments
    set state = 'deleting'
    where attachments.id = owned_attachment.id
    returning * into owned_attachment;
  elsif owned_attachment.state <> 'deleting' then
    raise exception 'image_invalid_state';
  end if;

  update public.boards
  set updated_at = boards.updated_at
  where boards.id = owned_board.id
  returning boards.revision into next_board_revision;

  return query
  select
    owned_attachment.id,
    owned_attachment.owner_id,
    owned_attachment.storage_path,
    owned_attachment.state,
    next_board_revision;
end;
$$;

create function public.complete_board_image_deletion(
  p_owner_id uuid,
  p_board_id uuid,
  p_attachment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.attachments
  where attachments.id = p_attachment_id
    and attachments.board_id = p_board_id
    and attachments.owner_id = p_owner_id
    and attachments.state = 'deleting';

  if not found then
    raise exception 'image_not_found';
  end if;
end;
$$;

create function public.claim_board_deletion(p_board_id uuid)
returns table (
  id uuid,
  owner_id uuid,
  slug text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  owned_board public.boards%rowtype;
begin
  if account_id is null then
    return;
  end if;

  select boards.*
  into owned_board
  from public.boards
  where boards.id = p_board_id
    and boards.owner_id = account_id
  for update;

  if not found then
    return;
  end if;

  return query
  update public.boards
  set
    deletion_started_at = coalesce(boards.deletion_started_at, now()),
    status = 'draft',
    visibility = 'private',
    allow_indexing = false,
    published_at = null
  where boards.id = owned_board.id
  returning boards.id, boards.owner_id, boards.slug;
end;
$$;

create function public.complete_board_deletion(
  p_owner_id uuid,
  p_board_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.boards
  where boards.id = p_board_id
    and boards.owner_id = p_owner_id
    and boards.deletion_started_at is not null;

  if not found then
    raise exception 'board_not_found';
  end if;
end;
$$;

revoke all on function public.delete_board_image_record(uuid)
from public, anon, authenticated, service_role;
drop function public.delete_board_image_record(uuid);

drop policy boards_update_own on public.boards;
create policy boards_update_own
on public.boards
for update
to authenticated
using (
  owner_id = (select auth.uid())
  and deletion_started_at is null
)
with check (
  owner_id = (select auth.uid())
  and deletion_started_at is null
);

create or replace function public.publish_board_with_password(
  p_board_id uuid,
  p_revision bigint,
  p_password_hash text
)
returns table (revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_revision bigint;
  next_updated_at timestamptz;
begin
  if auth.uid() is null or nullif(p_password_hash, '') is null then
    return;
  end if;

  update public.boards
  set
    status = 'published',
    visibility = 'password',
    allow_indexing = false
  where id = p_board_id
    and owner_id = auth.uid()
    and boards.revision = p_revision
    and boards.deletion_started_at is null
  returning boards.revision, boards.updated_at
  into next_revision, next_updated_at;

  if not found then
    return;
  end if;

  insert into private.board_secrets (board_id, password_hash)
  values (p_board_id, p_password_hash)
  on conflict (board_id) do update
  set password_hash = excluded.password_hash;

  return query select next_revision, next_updated_at;
end;
$$;

revoke all on function public.claim_board_image_deletion(uuid, uuid, bigint)
from public, anon, authenticated;
revoke all on function public.complete_board_image_deletion(uuid, uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.claim_board_deletion(uuid)
from public, anon, authenticated;
revoke all on function public.complete_board_deletion(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.claim_board_image_deletion(uuid, uuid, bigint)
to authenticated;
grant execute on function public.complete_board_image_deletion(uuid, uuid, uuid)
to service_role;
grant execute on function public.claim_board_deletion(uuid)
to authenticated;
grant execute on function public.complete_board_deletion(uuid, uuid)
to service_role;

revoke update, delete on public.boards from authenticated;
grant update (
  title,
  summary,
  content_markdown,
  theme,
  visibility,
  status,
  allow_indexing,
  published_at
) on public.boards to authenticated;

commit;
