begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'board-images',
  'board-images',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists board_image_reserved_insert on storage.objects;
create policy board_image_reserved_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'board-images'
  and exists (
    select 1
    from public.attachments
    where attachments.owner_id = (select auth.uid())
      and attachments.storage_path = objects.name
      and attachments.state = 'reserved'
      and attachments.reservation_expires_at > now()
  )
);

revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
revoke insert, update, delete on public.attachments from authenticated;
grant select on public.attachments to authenticated;

lock table public.attachments in share row exclusive mode;

create function private.normalize_board_image_filename(p_filename text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized_filename text;
begin
  if p_filename is null then
    return null;
  end if;

  normalized_filename := regexp_replace(
    p_filename,
    '[[:cntrl:]]',
    '',
    'g'
  );
  normalized_filename := regexp_replace(
    normalized_filename,
    '^.*[/\\]',
    ''
  );
  normalized_filename := normalize(btrim(normalized_filename), NFC);

  if normalized_filename = '' then
    normalized_filename := 'image';
  end if;

  return left(normalized_filename, 180);
end;
$$;

revoke all on function private.normalize_board_image_filename(text)
from public, anon, authenticated;

create function private.reconcile_board_image_attachments()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  unsupported_attachment_count bigint;
  over_limit_owner_id uuid;
  recorded_storage_bytes bigint;
  attachment_storage_bytes bigint;
begin
  select count(*)
  into unsupported_attachment_count
  from public.attachments
  where attachments.mime_type not in (
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  );

  if unsupported_attachment_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'board_image_migration_unsupported_attachments',
      detail = format(
        '%s attachment row(s) use a MIME type outside JPEG, PNG, WebP, and GIF.',
        unsupported_attachment_count
      ),
      hint = 'Inventory and migrate or remove unsupported attachment metadata and Storage objects before applying 20260729000100.';
  end if;

  select
    profiles.id,
    profiles.storage_bytes,
    coalesce(sum(attachments.size_bytes), 0)
  into
    over_limit_owner_id,
    recorded_storage_bytes,
    attachment_storage_bytes
  from public.profiles
  left join public.attachments
    on attachments.owner_id = profiles.id
  group by profiles.id, profiles.storage_bytes
  having profiles.storage_bytes > 52428800
    or coalesce(sum(attachments.size_bytes), 0) > 52428800
  order by profiles.id
  limit 1;

  if found then
    raise exception using
      errcode = 'P0001',
      message = 'board_image_migration_account_over_quota',
      detail = format(
        'Owner %s has %s recorded byte(s) and %s attachment byte(s).',
        over_limit_owner_id,
        recorded_storage_bytes,
        attachment_storage_bytes
      ),
      hint = 'Reduce both recorded and attachment-backed usage to 52428800 bytes or less before applying 20260729000100.';
  end if;

  update public.attachments
  set original_filename =
    private.normalize_board_image_filename(attachments.original_filename);

  update public.profiles
  set storage_bytes = coalesce(
    (
      select sum(attachments.size_bytes)
      from public.attachments
      where attachments.owner_id = profiles.id
    ),
    0
  );
end;
$$;

revoke all on function private.reconcile_board_image_attachments()
from public, anon, authenticated;

select private.reconcile_board_image_attachments();

alter table public.attachments
drop constraint if exists attachments_size_bytes_check,
drop constraint if exists attachments_state,
drop constraint if exists attachments_reservation_state,
add constraint attachments_size_bytes_bounds
  check (size_bytes > 0 and size_bytes <= 10485760),
add constraint attachments_mime_type
  check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
add constraint attachments_original_filename_boundary
  check (
    original_filename =
      private.normalize_board_image_filename(original_filename)
    and char_length(original_filename) between 1 and 180
    and original_filename !~ '[[:cntrl:]]'
  ),
add constraint attachments_state
  check (state in ('reserved', 'cancelling', 'ready')),
add constraint attachments_reservation_state
  check (
    (state in ('reserved', 'cancelling') and reservation_expires_at is not null)
    or (state = 'ready' and reservation_expires_at is null)
  );

create function private.apply_attachment_storage_delta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_storage_bytes bigint;
  storage_delta bigint;
  next_storage_bytes bigint;
begin
  select profiles.storage_bytes
  into current_storage_bytes
  from public.profiles
  where profiles.id = new.owner_id
  for update;

  if not found then
    raise exception 'image_not_found';
  end if;

  storage_delta := new.size_bytes - case
    when tg_op = 'UPDATE' then old.size_bytes
    else 0
  end;
  next_storage_bytes := current_storage_bytes + storage_delta;

  if next_storage_bytes < 0 or next_storage_bytes > 52428800 then
    raise exception 'image_quota_exceeded';
  end if;

  update public.profiles
  set storage_bytes = next_storage_bytes
  where profiles.id = new.owner_id;

  return new;
end;
$$;

create trigger attachments_apply_storage_delta
before insert or update of size_bytes on public.attachments
for each row execute function private.apply_attachment_storage_delta();

create function private.release_attachment_storage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set storage_bytes = greatest(0, profiles.storage_bytes - old.size_bytes)
  where profiles.id = old.owner_id;

  return old;
end;
$$;

create trigger attachments_release_storage
after delete on public.attachments
for each row execute function private.release_attachment_storage();

revoke all on function private.apply_attachment_storage_delta()
from public, anon, authenticated;
revoke all on function private.release_attachment_storage()
from public, anon, authenticated;

create function public.reserve_board_image(
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
  normalized_filename text;
begin
  if account_id is null then
    raise exception 'image_not_found';
  end if;

  perform 1
  from public.boards
  where boards.id = p_board_id
    and boards.owner_id = account_id
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

  normalized_filename :=
    private.normalize_board_image_filename(p_original_filename);

  if normalized_filename is null then
    raise exception 'image_invalid_filename';
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
    normalized_filename,
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

create function public.finalize_board_image(
  p_owner_id uuid,
  p_board_id uuid,
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
  owned_attachment public.attachments%rowtype;
begin
  select attachments.*
  into owned_attachment
  from public.attachments
  where attachments.id = p_attachment_id
    and attachments.board_id = p_board_id
    and attachments.owner_id = p_owner_id
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

create function public.claim_board_image_cancellation(
  p_board_id uuid,
  p_attachment_id uuid
)
returns table (
  id uuid,
  owner_id uuid,
  storage_path text,
  state text
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
    and attachments.board_id = p_board_id
    and attachments.owner_id = account_id
  for update;

  if not found then
    raise exception 'image_not_found';
  end if;

  if owned_attachment.state = 'ready' then
    raise exception 'image_already_finalized';
  end if;

  if owned_attachment.state = 'reserved' then
    update public.attachments
    set state = 'cancelling'
    where attachments.id = owned_attachment.id
    returning * into owned_attachment;
  elsif owned_attachment.state <> 'cancelling' then
    raise exception 'image_invalid_state';
  end if;

  return query
  select
    owned_attachment.id,
    owned_attachment.owner_id,
    owned_attachment.storage_path,
    owned_attachment.state;
end;
$$;

create function public.complete_board_image_cancellation(
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
    and attachments.state = 'cancelling';

  if not found then
    raise exception 'image_not_found';
  end if;
end;
$$;

create function public.delete_board_image_record(p_attachment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
begin
  if account_id is null then
    return false;
  end if;

  delete from public.attachments
  where attachments.id = p_attachment_id
    and attachments.owner_id = account_id
    and attachments.state = 'ready';

  return found;
end;
$$;

revoke all on function public.reserve_board_image(uuid, text, text, bigint)
from public, anon, authenticated;
revoke all on function public.finalize_board_image(
  uuid, uuid, uuid, text, bigint
)
from public, anon, authenticated, service_role;
revoke all on function public.claim_board_image_cancellation(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.complete_board_image_cancellation(uuid, uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.delete_board_image_record(uuid)
from public, anon, authenticated;

grant execute on function public.reserve_board_image(uuid, text, text, bigint)
to authenticated;
grant execute on function public.finalize_board_image(
  uuid, uuid, uuid, text, bigint
)
to service_role;
grant execute on function public.claim_board_image_cancellation(uuid, uuid)
to authenticated;
grant execute on function public.complete_board_image_cancellation(uuid, uuid, uuid)
to service_role;
grant execute on function public.delete_board_image_record(uuid)
to authenticated;

commit;
