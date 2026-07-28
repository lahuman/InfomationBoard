begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_function(
  'public', 'get_password_board_for_server', array['text'],
  'server password lookup exists'
);
select has_function(
  'public', 'get_password_lock_for_server', array['uuid', 'text'],
  'server lock lookup exists'
);
select has_function(
  'public', 'record_password_failure_for_server', array['uuid', 'text'],
  'server failure recorder exists'
);
select has_function(
  'public', 'clear_password_failures_for_server', array['uuid', 'text'],
  'server failure cleanup exists'
);

select ok(
  has_function_privilege(
    'service_role', 'public.get_password_board_for_server(text)', 'EXECUTE'
  ),
  'service role can read password boards'
);
select ok(
  not has_function_privilege(
    'anon', 'public.get_password_board_for_server(text)', 'EXECUTE'
  ),
  'anonymous visitors cannot read password boards'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.get_password_board_for_server(text)', 'EXECUTE'
  ),
  'authenticated browser clients cannot read password boards'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.record_password_failure_for_server(uuid,text)',
    'EXECUTE'
  ),
  'anonymous visitors cannot write lockout records'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '51000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'access@example.test', '',
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now()
);

insert into public.boards (
  id, owner_id, slug, title, content_markdown, template,
  status, visibility, allow_indexing
) values
(
  '53000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  'locked-board', 'Locked board', '# Protected', 'meeting',
  'draft', 'private', false
),
(
  '53000000-0000-4000-8000-000000000002',
  '51000000-0000-4000-8000-000000000001',
  'private-access-board', 'Private board', '# Private', 'store',
  'draft', 'private', false
);

update public.boards
set status = 'published', visibility = 'password'
where id = '53000000-0000-4000-8000-000000000001';

insert into private.board_secrets (board_id, password_hash)
values (
  '53000000-0000-4000-8000-000000000001',
  '$argon2id$server-only-hash'
);

select results_eq(
  $$ select password_hash
     from public.get_password_board_for_server('locked-board') $$,
  array['$argon2id$server-only-hash'::text],
  'server lookup returns the protected board hash'
);
select is_empty(
  $$ select board_id
     from public.get_password_board_for_server('private-access-board') $$,
  'server lookup hides drafts and private boards'
);

select is_empty(
  $$ select locked_until
     from public.get_password_lock_for_server(
       '53000000-0000-4000-8000-000000000001',
       repeat('a', 64)
     ) $$,
  'a new visitor has no lock'
);

select results_eq(
  $$ select failed_count
     from public.record_password_failure_for_server(
       '53000000-0000-4000-8000-000000000001',
       repeat('a', 64)
     ) $$,
  array[1],
  'the first failure starts the window'
);

select * from public.record_password_failure_for_server(
  '53000000-0000-4000-8000-000000000001', repeat('a', 64)
);
select * from public.record_password_failure_for_server(
  '53000000-0000-4000-8000-000000000001', repeat('a', 64)
);
select * from public.record_password_failure_for_server(
  '53000000-0000-4000-8000-000000000001', repeat('a', 64)
);

select results_eq(
  $$ select failed_count, locked_until is not null
     from public.record_password_failure_for_server(
       '53000000-0000-4000-8000-000000000001',
       repeat('a', 64)
     ) $$,
  $$ values (5, true) $$,
  'the fifth failure starts a lock'
);
select results_eq(
  $$ select locked_until is not null
     from public.get_password_lock_for_server(
       '53000000-0000-4000-8000-000000000001',
       repeat('a', 64)
     ) $$,
  array[true],
  'the active lock is visible to the server'
);
select results_eq(
  $$ select failed_count
     from public.record_password_failure_for_server(
       '53000000-0000-4000-8000-000000000001',
       repeat('b', 64)
     ) $$,
  array[1],
  'a different HMAC key has an independent window'
);

select public.clear_password_failures_for_server(
  '53000000-0000-4000-8000-000000000001', repeat('a', 64)
);
select is_empty(
  $$ select locked_until
     from public.get_password_lock_for_server(
       '53000000-0000-4000-8000-000000000001',
       repeat('a', 64)
     ) $$,
  'successful verification can clear the visitor record'
);

select throws_ok(
  $$ select * from public.record_password_failure_for_server(
       '53000000-0000-4000-8000-000000000001', '192.0.2.10'
     ) $$,
  '22023', null,
  'the RPC rejects a raw visitor address'
);
select throws_ok(
  $$ insert into private.access_attempts (
       board_id, anonymous_key_hash, window_started_at
     ) values (
       '53000000-0000-4000-8000-000000000001', 'raw-key', now()
     ) $$,
  '23514', null,
  'the table accepts only HMAC-shaped visitor keys'
);

select * from finish();
rollback;
