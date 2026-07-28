alter table private.access_attempts
add constraint access_attempts_hmac_key_hash
check (anonymous_key_hash ~ '^[0-9a-f]{64}$');

create function public.get_password_board_for_server(p_slug text)
returns table (
  board_id uuid,
  slug text,
  title text,
  summary text,
  content_markdown text,
  template text,
  theme jsonb,
  updated_at timestamptz,
  published_at timestamptz,
  password_hash text,
  secret_version timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    boards.id,
    boards.slug,
    boards.title,
    boards.summary,
    boards.content_markdown,
    boards.template,
    boards.theme,
    boards.updated_at,
    boards.published_at,
    board_secrets.password_hash,
    board_secrets.updated_at
  from public.boards
  join private.board_secrets
    on board_secrets.board_id = boards.id
  where boards.slug = p_slug
    and boards.status = 'published'
    and boards.visibility = 'password'
    and boards.published_at is not null
  limit 1;
$$;

create function public.get_password_lock_for_server(
  p_board_id uuid,
  p_anonymous_key_hash text
)
returns table (locked_until timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_anonymous_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid anonymous key hash' using errcode = '22023';
  end if;

  return query
  select access_attempts.locked_until
  from private.access_attempts
  where access_attempts.board_id = p_board_id
    and access_attempts.anonymous_key_hash = p_anonymous_key_hash
    and access_attempts.locked_until > clock_timestamp();
end;
$$;

create function public.record_password_failure_for_server(
  p_board_id uuid,
  p_anonymous_key_hash text
)
returns table (failed_count integer, locked_until timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_attempt private.access_attempts%rowtype;
  current_time timestamptz := clock_timestamp();
  next_count integer;
  next_lock timestamptz;
begin
  if p_anonymous_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid anonymous key hash' using errcode = '22023';
  end if;

  select *
  into current_attempt
  from private.access_attempts
  where access_attempts.board_id = p_board_id
    and access_attempts.anonymous_key_hash = p_anonymous_key_hash
  for update;

  if not found then
    insert into private.access_attempts (
      board_id,
      anonymous_key_hash,
      failed_count,
      window_started_at,
      locked_until
    ) values (
      p_board_id,
      p_anonymous_key_hash,
      1,
      current_time,
      null
    );
    return query select 1, null::timestamptz;
    return;
  end if;

  if current_attempt.locked_until > current_time then
    return query
    select current_attempt.failed_count, current_attempt.locked_until;
    return;
  end if;

  if current_attempt.window_started_at <= current_time - interval '15 minutes' then
    next_count := 1;
  else
    next_count := current_attempt.failed_count + 1;
  end if;

  next_lock := case
    when next_count >= 5 then current_time + interval '15 minutes'
    else null
  end;

  update private.access_attempts
  set
    failed_count = next_count,
    window_started_at = case
      when current_attempt.window_started_at <= current_time - interval '15 minutes'
        then current_time
      else current_attempt.window_started_at
    end,
    locked_until = next_lock
  where access_attempts.board_id = p_board_id
    and access_attempts.anonymous_key_hash = p_anonymous_key_hash;

  return query select next_count, next_lock;
end;
$$;

create function public.clear_password_failures_for_server(
  p_board_id uuid,
  p_anonymous_key_hash text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_anonymous_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid anonymous key hash' using errcode = '22023';
  end if;

  delete from private.access_attempts
  where access_attempts.board_id = p_board_id
    and access_attempts.anonymous_key_hash = p_anonymous_key_hash;
end;
$$;

revoke all on function public.get_password_board_for_server(text)
from public, anon, authenticated;
revoke all on function public.get_password_lock_for_server(uuid, text)
from public, anon, authenticated;
revoke all on function public.record_password_failure_for_server(uuid, text)
from public, anon, authenticated;
revoke all on function public.clear_password_failures_for_server(uuid, text)
from public, anon, authenticated;

grant execute on function public.get_password_board_for_server(text)
to service_role;
grant execute on function public.get_password_lock_for_server(uuid, text)
to service_role;
grant execute on function public.record_password_failure_for_server(uuid, text)
to service_role;
grant execute on function public.clear_password_failures_for_server(uuid, text)
to service_role;
