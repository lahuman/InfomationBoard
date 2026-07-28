create or replace function public.record_password_failure_for_server(
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
  v_now timestamptz := clock_timestamp();
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
      v_now,
      null
    );
    return query select 1, null::timestamptz;
    return;
  end if;

  if current_attempt.locked_until > v_now then
    return query
    select current_attempt.failed_count, current_attempt.locked_until;
    return;
  end if;

  if current_attempt.window_started_at <= v_now - interval '15 minutes' then
    next_count := 1;
  else
    next_count := current_attempt.failed_count + 1;
  end if;

  next_lock := case
    when next_count >= 5 then v_now + interval '15 minutes'
    else null
  end;

  update private.access_attempts
  set
    failed_count = next_count,
    window_started_at = case
      when current_attempt.window_started_at <= v_now - interval '15 minutes'
        then v_now
      else current_attempt.window_started_at
    end,
    locked_until = next_lock
  where access_attempts.board_id = p_board_id
    and access_attempts.anonymous_key_hash = p_anonymous_key_hash;

  return query select next_count, next_lock;
end;
$$;
