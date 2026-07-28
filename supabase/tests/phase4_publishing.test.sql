begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '41000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'publisher@example.test', '',
  now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Publisher"}',
  now(), now()
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '41000000-0000-4000-8000-000000000001',
  true
);

insert into public.boards (
  id, owner_id, slug, title, content_markdown, template
) values
(
  '43000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  'public-board', 'Public board', '# Public', 'event'
),
(
  '43000000-0000-4000-8000-000000000002',
  '41000000-0000-4000-8000-000000000001',
  'password-board', 'Password board', '# Password', 'meeting'
),
(
  '43000000-0000-4000-8000-000000000003',
  '41000000-0000-4000-8000-000000000001',
  'private-board', 'Private board', '# Private', 'store'
);

update public.boards
set status = 'published', visibility = 'public', allow_indexing = true
where id = '43000000-0000-4000-8000-000000000001';

select ok(
  (
    select published_at is not null
    from public.boards
    where id = '43000000-0000-4000-8000-000000000001'
  ),
  'publishing sets published_at'
);

select results_eq(
  $$ select slug from public.boards
     where id = '43000000-0000-4000-8000-000000000001' $$,
  array['public-board'::text],
  'publishing preserves the slug'
);

update public.boards
set status = 'published', visibility = 'password'
where id = '43000000-0000-4000-8000-000000000002';

select throws_ok(
  $$ update public.boards
     set allow_indexing = true
     where id = '43000000-0000-4000-8000-000000000002' $$,
  '23514',
  null,
  'password boards cannot enable indexing'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select results_eq(
  $$ select slug from public.boards
     where id in (
       '43000000-0000-4000-8000-000000000001',
       '43000000-0000-4000-8000-000000000002',
       '43000000-0000-4000-8000-000000000003'
     )
     order by slug $$,
  array['public-board'::text],
  'anonymous visitors see only published public boards'
);

select results_eq(
  $$ select title from public.boards where slug = 'public-board' $$,
  array['Public board'::text],
  'anonymous visitors can read a public presentation field'
);

select ok(
  not has_column_privilege('anon', 'public.boards', 'owner_id', 'SELECT'),
  'anonymous visitors cannot select owner identifiers'
);

select ok(
  not has_column_privilege('anon', 'public.boards', 'status', 'SELECT'),
  'anonymous visitors cannot select lifecycle internals'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '41000000-0000-4000-8000-000000000001',
  true
);

update public.boards
set status = 'draft', visibility = 'private', allow_indexing = false
where id = '43000000-0000-4000-8000-000000000001';

select ok(
  (
    select published_at is null
    from public.boards
    where id = '43000000-0000-4000-8000-000000000001'
  ),
  'returning to draft clears published_at'
);

reset role;
set local role anon;

select results_eq(
  $$ select count(*)::bigint from public.boards
     where id in (
       '43000000-0000-4000-8000-000000000001',
       '43000000-0000-4000-8000-000000000002',
       '43000000-0000-4000-8000-000000000003'
     ) $$,
  array[0::bigint],
  'withdrawn boards disappear from anonymous reads'
);

select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anonymous visitors cannot use the private schema'
);

select * from finish();
rollback;
