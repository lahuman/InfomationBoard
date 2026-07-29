begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

select has_function(
  'public',
  'reserve_board_image',
  array['uuid', 'text', 'text', 'bigint'],
  'image reservations use an authenticated RPC boundary'
);
select has_function(
  'public',
  'finalize_board_image',
  array['uuid', 'text', 'bigint'],
  'image finalization uses an authenticated RPC boundary'
);
select has_function(
  'public',
  'cancel_board_image',
  array['uuid'],
  'image cancellation uses an authenticated RPC boundary'
);
select has_function(
  'public',
  'delete_board_image_record',
  array['uuid'],
  'ready image deletion uses an authenticated RPC boundary'
);

select results_eq(
  $$ select count(*)::bigint
     from storage.buckets
     where id = 'board-images' $$,
  array[1::bigint],
  'the board-images bucket exists'
);
select results_eq(
  $$ select public
     from storage.buckets
     where id = 'board-images' $$,
  array[false],
  'the board-images bucket is private'
);
select results_eq(
  $$ select file_size_limit
     from storage.buckets
     where id = 'board-images' $$,
  array[10485760::bigint],
  'the board-images bucket enforces the 10 MB object limit'
);
select results_eq(
  $$ select allowed_mime_types
     from storage.buckets
     where id = 'board-images' $$,
  $$ values (
       array['image/jpeg','image/png','image/webp','image/gif']::text[]
     ) $$,
  'the board-images bucket accepts only the four supported MIME types'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'owner@example.test', '',
  now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}',
  now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '20000000-0000-4000-8000-000000000002',
  'authenticated', 'authenticated', 'other@example.test', '',
  now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Other"}',
  now(), now()
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

insert into public.boards (
  id, owner_id, slug, title, template
) values
(
  '30000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  'owner-images', 'Owner images', 'event'
),
(
  '30000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',
  'count-images', 'Count images', 'event'
),
(
  '30000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  'growth-images', 'Growth images', 'event'
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);
insert into public.boards (
  id, owner_id, slug, title, template
) values (
  '30000000-0000-4000-8000-000000000006',
  '20000000-0000-4000-8000-000000000002',
  'other-images', 'Other images', 'event'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000003',
       'poster.png', 'image/png', 10485760
     ) $$,
  'owner reserves a 10 MB PNG'
);
select results_eq(
  $$ select storage_path like
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000003/%'
     from public.attachments
     where original_filename = 'poster.png' $$,
  array[true],
  'a reservation receives an owner and board scoped storage path'
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[10485760::bigint],
  'reserved bytes count immediately'
);
select throws_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000003',
       'overflow.png', 'image/png', 41943041
     ) $$,
  'P0001', 'image_quota_exceeded',
  'the account cannot exceed 50 MB'
);
select throws_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000003',
       'zero.png', 'image/png', 0
     ) $$,
  '23514', null,
  'zero-byte files are rejected'
);
select throws_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000003',
       'oversized.png', 'image/png', 10485761
     ) $$,
  '23514', null,
  'files larger than 10 MB are rejected'
);
select throws_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000003',
       'document.pdf', 'application/pdf', 1024
     ) $$,
  '23514', null,
  'unsupported MIME types are rejected'
);
select lives_ok(
  $$ select public.cancel_board_image(id)
     from public.attachments
     where original_filename = 'poster.png' $$,
  'an owner cancels a reserved image'
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[0::bigint],
  'cancelling a reservation releases its bytes'
);

select throws_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000006',
       'foreign.png', 'image/png', 1024
     ) $$,
  'P0001', 'image_not_found',
  'an owner cannot reserve against a foreign board'
);

select results_eq(
  $$ select count(*)::bigint
     from generate_series(1, 20) as image_number
     cross join lateral public.reserve_board_image(
       '30000000-0000-4000-8000-000000000004',
       'count-' || image_number::text || '.png',
       'image/png',
       1
     ) $$,
  array[20::bigint],
  'an account can reserve twenty active image rows'
);
select throws_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000004',
       'count-21.png', 'image/png', 1
     ) $$,
  'P0001', 'image_limit_exceeded',
  'the twenty-first active image row is rejected'
);
select lives_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000003',
       'other-board.png', 'image/png', 1
     ) $$,
  'a full board does not consume another board image count'
);
select lives_ok(
  $$ select public.cancel_board_image(id)
     from public.attachments
     where original_filename = 'other-board.png' $$,
  'the separate-board count fixture can be cancelled'
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[20::bigint],
  'all twenty reservations count toward storage'
);
select lives_ok(
  $$ delete from public.boards
     where id = '30000000-0000-4000-8000-000000000004' $$,
  'an owner deletes a board with reserved images'
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[0::bigint],
  'board cascade deletion releases reserved bytes'
);

select lives_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000003',
       'expired.png', 'image/png', 1024
     ) $$,
  'an owner creates a reservation for expiry coverage'
);
reset role;
update public.attachments
set reservation_expires_at = now() - interval '1 second'
where original_filename = 'expired.png';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select throws_ok(
  $$ select * from public.finalize_board_image(
       (select id from public.attachments
        where original_filename = 'expired.png'),
       'image/png', 1024
     ) $$,
  'P0001', 'image_reservation_expired',
  'an expired reservation cannot be finalized'
);
select lives_ok(
  $$ select public.cancel_board_image(id)
     from public.attachments
     where original_filename = 'expired.png' $$,
  'an expired reservation can still be cancelled'
);

select results_eq(
  $$ select count(*)::bigint
     from (
       select reservation.*
       from generate_series(1, 4) as image_number
       cross join lateral public.reserve_board_image(
         '30000000-0000-4000-8000-000000000005',
         'growth-full-' || image_number::text || '.png',
         'image/png',
         10485760
       ) as reservation
       union all
       select *
       from public.reserve_board_image(
         '30000000-0000-4000-8000-000000000005',
         'growth-one.png', 'image/png', 1
       )
       union all
       select *
       from public.reserve_board_image(
         '30000000-0000-4000-8000-000000000005',
         'growth-target.png', 'image/png', 10485759
       )
     ) as reservations $$,
  array[6::bigint],
  'size-growth coverage fills the exact 50 MB account limit'
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[52428800::bigint],
  'the exact 50 MB account total is accepted'
);
select throws_ok(
  $$ select * from public.finalize_board_image(
       (select id from public.attachments
        where original_filename = 'growth-target.png'),
       'image/png', 10485760
     ) $$,
  'P0001', 'image_quota_exceeded',
  'finalization cannot grow the account beyond 50 MB'
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[52428800::bigint],
  'a rejected size growth leaves storage accounting unchanged'
);
select lives_ok(
  $$ delete from public.boards
     where id = '30000000-0000-4000-8000-000000000005' $$,
  'the size-growth fixture can be cascade deleted'
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[0::bigint],
  'size-growth fixture cleanup releases every byte'
);

select lives_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000003',
       'ready.webp', 'image/png', 1024
     ) $$,
  'an owner creates a reservation for finalization'
);
select results_eq(
  $$ select finalized.state || ':' ||
       finalized.mime_type || ':' || finalized.size_bytes::text
     from public.finalize_board_image(
       (select id from public.attachments
        where original_filename = 'ready.webp'),
       'image/webp', 2048
     ) as finalized $$,
  array['ready:image/webp:2048'::text],
  'finalization stores verified MIME and actual size'
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[2048::bigint],
  'finalization accounts for the verified size delta'
);
select results_eq(
  $$ select finalized.state || ':' ||
       finalized.mime_type || ':' || finalized.size_bytes::text
     from public.finalize_board_image(
       (select id from public.attachments
        where original_filename = 'ready.webp'),
       'image/webp', 2048
     ) as finalized $$,
  array['ready:image/webp:2048'::text],
  'identical finalization is idempotent'
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[2048::bigint],
  'idempotent finalization does not double count bytes'
);
select results_eq(
  $$ select public.delete_board_image_record(id)
     from public.attachments
     where original_filename = 'ready.webp' $$,
  array[true],
  'an owner deletes a ready image record'
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[0::bigint],
  'deleting a ready image releases its bytes'
);
select results_eq(
  $$ select public.delete_board_image_record(
       '30000000-0000-4000-8000-000000000099'
     ) $$,
  array[false],
  'deleting an absent ready image reports false'
);

select throws_ok(
  $$ insert into public.attachments (
       board_id, owner_id, storage_path, original_filename,
       mime_type, size_bytes, reservation_expires_at
     ) values (
       '30000000-0000-4000-8000-000000000003',
       '10000000-0000-4000-8000-000000000001',
       'direct/insert', 'direct.png',
       'image/png', 1, now() + interval '15 minutes'
     ) $$,
  '42501', null,
  'authenticated users cannot directly insert attachments'
);
select throws_ok(
  $$ update public.attachments set size_bytes = size_bytes + 1 $$,
  '42501', null,
  'authenticated users cannot directly update attachments'
);
select throws_ok(
  $$ delete from public.attachments $$,
  '42501', null,
  'authenticated users cannot directly delete attachments'
);
select throws_ok(
  $$ update public.profiles
     set storage_bytes = 1
     where id = '10000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'authenticated users cannot directly update storage accounting'
);
select lives_ok(
  $$ update public.profiles
     set display_name = 'Renamed owner'
     where id = '10000000-0000-4000-8000-000000000001' $$,
  'authenticated users retain display-name updates'
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);
select lives_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000006',
       'account-cleanup.png', 'image/png', 4096
     ) $$,
  'account cleanup coverage starts with an active reservation'
);
reset role;
select lives_ok(
  $$ delete from auth.users
     where id = '20000000-0000-4000-8000-000000000002' $$,
  'account deletion cascades through boards and image reservations'
);
select results_eq(
  $$ select count(*)::bigint
     from public.attachments
     where owner_id = '20000000-0000-4000-8000-000000000002' $$,
  array[0::bigint],
  'account cleanup removes every owned image reservation'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select ok(
  not has_function_privilege(
    'anon',
    'public.reserve_board_image(uuid,text,text,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.finalize_board_image(uuid,text,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.cancel_board_image(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.delete_board_image_record(uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot execute image lifecycle RPCs'
);

select * from finish();
rollback;
