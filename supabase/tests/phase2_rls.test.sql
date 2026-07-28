begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'owner@example.test', '',
  now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}',
  now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '20000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 'other@example.test', '',
  now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Other"}',
  now(), now()
);

select results_eq(
  $$ select count(*)::bigint from public.profiles
     where id in (
       '10000000-0000-0000-0000-000000000001',
       '20000000-0000-0000-0000-000000000002'
     ) $$,
  array[2::bigint],
  'auth trigger creates profiles'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$ insert into public.boards (
       id, owner_id, slug, title, template
     ) values (
       '30000000-0000-0000-0000-000000000003',
       '10000000-0000-0000-0000-000000000001',
       'owner-board', 'Owner board', 'event'
     ) $$,
  'owner can insert a board'
);

select results_eq(
  $$ select revision from public.boards
     where id = '30000000-0000-0000-0000-000000000003' $$,
  array[1::bigint],
  'a new board starts at revision one'
);

select results_eq(
  $$ select count(*)::bigint from public.boards $$,
  array[1::bigint],
  'owner can select the board'
);

select results_eq(
  $$ update public.boards
     set title = 'Updated owner board'
     where id = '30000000-0000-0000-0000-000000000003'
       and revision = 1
     returning revision $$,
  array[2::bigint],
  'an owner update increments the board revision'
);

select lives_ok(
  $$ insert into public.attachments (
       board_id, owner_id, storage_path, original_filename,
       mime_type, size_bytes, reservation_expires_at
     ) values (
       '30000000-0000-0000-0000-000000000003',
       '10000000-0000-0000-0000-000000000001',
       'owner/random-file', 'guide.pdf',
       'application/pdf', 1024, now() + interval '15 minutes'
     ) $$,
  'owner can insert attachment metadata'
);

select results_eq(
  $$ select count(*)::bigint from public.attachments $$,
  array[1::bigint],
  'owner can select attachment metadata'
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);

select results_eq(
  $$ select count(*)::bigint from public.boards $$,
  array[0::bigint],
  'another user cannot read the board'
);

select results_eq(
  $$ select count(*)::bigint from public.attachments $$,
  array[0::bigint],
  'another user cannot read the attachment'
);

select results_eq(
  $$ with changed as (
       update public.boards
       set title = 'Forged update'
       where id = '30000000-0000-0000-0000-000000000003'
         and revision = 2
       returning 1
     )
     select count(*)::bigint from changed $$,
  array[0::bigint],
  'another user cannot update the board by revision'
);

select throws_ok(
  $$ insert into public.boards (
       owner_id, slug, title, template
     ) values (
       '10000000-0000-0000-0000-000000000001',
       'forged-board', 'Forged', 'meeting'
     ) $$,
  '42501',
  null,
  'another user cannot insert for the owner'
);

select throws_ok(
  $$ insert into public.attachments (
       board_id, owner_id, storage_path, original_filename,
       mime_type, size_bytes, reservation_expires_at
     ) values (
       '30000000-0000-0000-0000-000000000003',
       '20000000-0000-0000-0000-000000000002',
       'other/forged-file', 'forged.pdf',
       'application/pdf', 1024, now() + interval '15 minutes'
     ) $$,
  '42501',
  null,
  'another user cannot attach metadata to the owner board'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select results_eq(
  $$ select count(*)::bigint from public.boards $$,
  array[0::bigint],
  'anonymous users cannot read boards'
);

reset role;
select ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated cannot use the private schema'
);
select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anonymous users cannot use the private schema'
);

select * from finish();
rollback;
