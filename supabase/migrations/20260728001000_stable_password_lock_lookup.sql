create or replace function public.get_password_lock_for_server(
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
    and access_attempts.locked_until > now();
end;
$$;
