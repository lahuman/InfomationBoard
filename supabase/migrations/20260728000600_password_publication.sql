alter table public.boards
add constraint boards_published_content check (
  status <> 'published'
  or (
    char_length(btrim(title)) > 0
    and char_length(btrim(content_markdown)) > 0
  )
);

create function private.remove_obsolete_board_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.visibility = 'password' and new.visibility <> 'password' then
    delete from private.board_secrets
    where board_id = new.id;
  end if;

  return null;
end;
$$;

revoke all on function private.remove_obsolete_board_secret()
from public, anon, authenticated;

create trigger boards_remove_obsolete_secret
after update of visibility on public.boards
for each row execute function private.remove_obsolete_board_secret();

create function public.publish_board_with_password(
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

revoke all on function public.publish_board_with_password(uuid, bigint, text)
from public, anon;
grant execute on function public.publish_board_with_password(uuid, bigint, text)
to authenticated;
