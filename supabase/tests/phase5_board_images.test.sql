begin;
create extension if not exists pgtap with schema extensions;
select plan(104);

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
  'claim_board_image_cancellation',
  array['uuid', 'uuid'],
  'image cancellation claims use an authenticated RPC boundary'
);
select has_function(
  'public',
  'complete_board_image_cancellation',
  array['uuid', 'uuid', 'uuid'],
  'claimed image cancellation completion uses an explicit server-only boundary'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_board_image_cancellation(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.complete_board_image_cancellation(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.complete_board_image_cancellation(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'only service_role can execute cancellation completion'
);
select has_function(
  'public',
  'claim_board_image_deletion',
  array['uuid', 'uuid', 'bigint'],
  'ready image deletion starts at an authenticated claim boundary'
);
select has_function(
  'public',
  'complete_board_image_deletion',
  array['uuid', 'uuid', 'uuid'],
  'claimed ready image deletion has an explicit completion boundary'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.claim_board_image_deletion(uuid,uuid,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.complete_board_image_deletion(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.complete_board_image_deletion(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.complete_board_image_deletion(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'only service_role can complete a claimed ready image deletion'
);
select ok(
  to_regprocedure('public.delete_board_image_record(uuid)') is null,
  'the direct metadata deletion RPC is removed'
);
select has_function(
  'public',
  'claim_board_deletion',
  array['uuid'],
  'board deletion starts at an authenticated claim boundary'
);
select has_function(
  'public',
  'complete_board_deletion',
  array['uuid', 'uuid'],
  'claimed board deletion has an explicit completion boundary'
);
select ok(
  position(
    'FOR UPDATE' in upper(
      pg_get_functiondef(
        'public.claim_board_deletion(uuid)'::regprocedure
      )
    )
  ) > 0,
  'board deletion claims take a lock that conflicts with upload KEY SHARE'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.claim_board_deletion(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.complete_board_deletion(uuid,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.complete_board_deletion(uuid,uuid)',
    'EXECUTE'
  ),
  'only service_role can complete a claimed board deletion'
);
select ok(
  not has_table_privilege('authenticated', 'public.boards', 'DELETE'),
  'authenticated users cannot bypass board Storage cleanup'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.boards',
    'deletion_started_at',
    'UPDATE'
  ),
  'authenticated users cannot forge or clear a board deletion claim'
);
select ok(
  position(
    'DELETION_STARTED_AT IS NULL' in upper(
      pg_get_functiondef(
        'public.reserve_board_image(uuid,text,text,bigint)'::regprocedure
      )
    )
  ) > 0,
  'reservation excludes a board already claimed for deletion'
);
select ok(
  (
    select
      position('FOR KEY SHARE' in upper(with_check)) > 0
      and position(
        'DELETION_STARTED_AT IS NULL' in upper(with_check)
      ) > 0
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'board_image_reserved_insert'
  ),
  'Storage INSERT locks and excludes a board claimed for deletion'
);
select ok(
  position(
    'FOR KEY SHARE' in upper(
      pg_get_functiondef(
        'public.reserve_board_image(uuid,text,text,bigint)'::regprocedure
      )
    )
  ) > 0,
  'reservation locks the owned board before the profile row'
);
select results_eq(
  $$ with migration_statements as (
       select
         upper(btrim(statement)) as statement,
         ordinality
       from supabase_migrations.schema_migrations
       cross join lateral unnest(statements)
         with ordinality as migration_statement(statement, ordinality)
       where version = '20260729000100'
     )
     select coalesce(
       min(ordinality) filter (where statement = 'BEGIN')
         < min(ordinality) filter (
           where statement =
             'LOCK TABLE PUBLIC.ATTACHMENTS IN SHARE ROW EXCLUSIVE MODE'
         )
       and min(ordinality) filter (
         where statement =
           'LOCK TABLE PUBLIC.ATTACHMENTS IN SHARE ROW EXCLUSIVE MODE'
       ) < min(ordinality) filter (
         where statement =
           'SELECT PRIVATE.RECONCILE_BOARD_IMAGE_ATTACHMENTS()'
       )
       and min(ordinality) filter (
         where statement =
           'SELECT PRIVATE.RECONCILE_BOARD_IMAGE_ATTACHMENTS()'
       ) < min(ordinality) filter (where statement = 'COMMIT'),
       false
     )
     from migration_statements $$,
  array[true],
  'migration transaction locks legacy writes before reconciliation'
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
select results_eq(
  $$ select array_agg(cmd order by cmd)::text[]
     from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'board_image_reserved_insert'
       and roles @> array['authenticated'::name] $$,
  $$ values (array['INSERT']::text[]) $$,
  'authenticated board image storage access grants INSERT policy only'
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
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     select 'board-images', storage_path, auth.uid()
     from public.attachments
     where original_filename = 'poster.png' $$,
  'authenticated owners can upload only to a live reserved path'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values (
       'board-images',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000003/not-reserved',
       auth.uid()
     ) $$,
  '42501', null,
  'authenticated owners cannot upload to an unreserved path'
);
select results_eq(
  $$ select count(*)::bigint
     from storage.objects
     where bucket_id = 'board-images' $$,
  array[0::bigint],
  'the upload-only policy does not grant object listing'
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
  'P0001', 'image_invalid_size',
  'zero-byte files receive a stable application error'
);
select throws_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000003',
       'oversized.png', 'image/png', 10485761
     ) $$,
  'P0001', 'image_invalid_size',
  'files larger than 10 MB receive a stable application error'
);
select throws_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000003',
       'document.pdf', 'application/pdf', 1024
     ) $$,
  'P0001', 'image_invalid_mime_type',
  'unsupported MIME types receive a stable application error'
);
select results_eq(
  $$ select claimed.state
     from public.attachments
     cross join lateral public.claim_board_image_cancellation(
       attachments.board_id,
       attachments.id
     ) as claimed
     where attachments.original_filename = 'poster.png' $$,
  array['cancelling'::text],
  'cancellation atomically claims a reserved image'
);
select throws_ok(
  $$ select * from public.finalize_board_image(
       (select id from public.attachments
        where original_filename = 'poster.png'),
       'image/png', 10485760
     ) $$,
  'P0001', 'image_cancellation_in_progress',
  'finalization cannot race past a cancellation claim'
);
select results_eq(
  $$ select claimed.storage_path
     from public.attachments
     cross join lateral public.claim_board_image_cancellation(
       attachments.board_id,
       attachments.id
     ) as claimed
     where attachments.original_filename = 'poster.png' $$,
  $$ select storage_path
     from public.attachments
     where original_filename = 'poster.png' $$,
  'claiming an already-cancelling image is idempotent'
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[10485760::bigint],
  'cancelling bytes remain charged until trusted completion'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     select 'board-images', storage_path, auth.uid()
     from public.attachments
     where original_filename = 'poster.png' $$,
  '42501', null,
  'authenticated uploads are denied after cancellation is claimed'
);
select throws_ok(
  $$ select public.complete_board_image_cancellation(owner_id, board_id, id)
     from public.attachments
     where original_filename = 'poster.png' $$,
  '42501', null,
  'an authenticated owner cannot complete a claimed cancellation directly'
);
select set_config(
  'test.poster_attachment_id',
  (
    select id::text
    from public.attachments
    where original_filename = 'poster.png'
  ),
  true
);
reset role;
select results_eq(
  $$ select count(*)::bigint
     from storage.objects
     where bucket_id = 'board-images'
       and name = (
         select storage_path
         from public.attachments
         where original_filename = 'poster.png'
       ) $$,
  array[1::bigint],
  'denied direct completion leaves the stored object and metadata intact'
);
set local role service_role;
select lives_ok(
  $$ select public.complete_board_image_cancellation(
       '10000000-0000-4000-8000-000000000001',
       '30000000-0000-4000-8000-000000000003',
       current_setting('test.poster_attachment_id')::uuid
     ) $$,
  'service role completes a server-verified cancellation'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
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
  $$ select claimed.*
     from public.attachments
     cross join lateral public.claim_board_image_cancellation(
       attachments.board_id,
       attachments.id
     ) as claimed
     where attachments.original_filename = 'other-board.png' $$,
  'the separate-board count fixture can be claimed for cancellation'
);
select set_config(
  'test.other_board_attachment_id',
  (
    select id::text
    from public.attachments
    where original_filename = 'other-board.png'
  ),
  true
);
reset role;
set local role service_role;
select lives_ok(
  $$ select public.complete_board_image_cancellation(
       '10000000-0000-4000-8000-000000000001',
       '30000000-0000-4000-8000-000000000003',
       current_setting('test.other_board_attachment_id')::uuid
     ) $$,
  'service role completes the separate-board fixture cancellation'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[20::bigint],
  'all twenty reservations count toward storage'
);
select results_eq(
  $$ select claimed.id
     from public.claim_board_deletion(
       '30000000-0000-4000-8000-000000000004'
     ) as claimed $$,
  array['30000000-0000-4000-8000-000000000004'::uuid],
  'an owner claims a board before deleting its objects'
);
select results_eq(
  $$ select deletion_started_at is not null
     from public.boards
     where id = '30000000-0000-4000-8000-000000000004' $$,
  array[true],
  'the board claim persists while object cleanup is pending'
);
select results_eq(
  $$ with changed as (
       update public.boards
       set
         status = 'published',
         visibility = 'public',
         published_at = now()
       where id = '30000000-0000-4000-8000-000000000004'
       returning 1
     )
     select count(*)::bigint from changed $$,
  array[0::bigint],
  'an authenticated update cannot republish a claimed board'
);
select results_eq(
  $$ select count(*)::bigint
     from public.publish_board_with_password(
       '30000000-0000-4000-8000-000000000004',
       (
         select revision
         from public.boards
         where id = '30000000-0000-4000-8000-000000000004'
       ),
       '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
     ) $$,
  array[0::bigint],
  'password publication cannot republish a claimed board'
);
select throws_ok(
  $$ select * from public.reserve_board_image(
       '30000000-0000-4000-8000-000000000004',
       'late.png', 'image/png', 1
     ) $$,
  'P0001', 'image_not_found',
  'a board deletion claim closes later reservations'
);
select throws_ok(
  $$ delete from public.boards
     where id = '30000000-0000-4000-8000-000000000004' $$,
  '42501', null,
  'an authenticated owner cannot bypass board object cleanup'
);
select throws_ok(
  $$ select public.complete_board_deletion(
       '10000000-0000-4000-8000-000000000001',
       '30000000-0000-4000-8000-000000000004'
     ) $$,
  '42501', null,
  'an authenticated owner cannot complete claimed board deletion'
);
reset role;
set local role service_role;
select lives_ok(
  $$ select public.complete_board_deletion(
       '10000000-0000-4000-8000-000000000001',
       '30000000-0000-4000-8000-000000000004'
     ) $$,
  'service role completes board deletion after server object cleanup'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
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
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     select 'board-images', storage_path, auth.uid()
     from public.attachments
     where original_filename = 'expired.png' $$,
  '42501', null,
  'authenticated uploads are denied after reservation expiry'
);
select lives_ok(
  $$ select claimed.*
     from public.attachments
     cross join lateral public.claim_board_image_cancellation(
       attachments.board_id,
       attachments.id
     ) as claimed
     where attachments.original_filename = 'expired.png' $$,
  'an expired reservation can still be claimed for cancellation'
);
select set_config(
  'test.expired_attachment_id',
  (
    select id::text
    from public.attachments
    where original_filename = 'expired.png'
  ),
  true
);
reset role;
set local role service_role;
select lives_ok(
  $$ select public.complete_board_image_cancellation(
       '10000000-0000-4000-8000-000000000001',
       '30000000-0000-4000-8000-000000000003',
       current_setting('test.expired_attachment_id')::uuid
     ) $$,
  'service role completes the expired reservation cancellation'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
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
reset role;
select lives_ok(
  $$ delete from public.boards
     where id = '30000000-0000-4000-8000-000000000005' $$,
  'the size-growth fixture is removed by trusted test cleanup'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
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
select throws_ok(
  $$ select * from public.finalize_board_image(
       (select id from public.attachments
        where original_filename = 'ready.webp'),
       'image/webp', 0
     ) $$,
  'P0001', 'image_invalid_size',
  'finalization rejects an invalid actual size with a stable error'
);
select throws_ok(
  $$ select * from public.finalize_board_image(
       (select id from public.attachments
        where original_filename = 'ready.webp'),
       'application/pdf', 2048
     ) $$,
  'P0001', 'image_invalid_mime_type',
  'finalization rejects an invalid verified MIME with a stable error'
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[1024::bigint],
  'invalid finalization leaves reserved storage accounting unchanged'
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
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     select 'board-images', storage_path, auth.uid()
     from public.attachments
     where original_filename = 'ready.webp' $$,
  '42501', null,
  'authenticated uploads are denied after finalization'
);
select throws_ok(
  $$ select * from public.claim_board_image_deletion(
       (
         select board_id from public.attachments
         where original_filename = 'ready.webp'
       ),
       (
         select id from public.attachments
         where original_filename = 'ready.webp'
       ),
       (
         select revision - 1 from public.boards
         where id = '30000000-0000-4000-8000-000000000003'
       )
     ) $$,
  'P0001', 'image_board_changed',
  'ready image deletion rejects a stale saved-board revision'
);
select throws_ok(
  $$ select * from public.claim_board_image_deletion(
       (
         select board_id from public.attachments
         where original_filename = 'ready.webp'
       ),
       (
         select id from public.attachments
         where original_filename = 'ready.webp'
       ),
       null
     ) $$,
  'P0001', 'image_board_changed',
  'ready image deletion cannot bypass the revision fence with null'
);
select results_eq(
  $$ select claimed.state
     from public.attachments
     cross join lateral public.claim_board_image_deletion(
       attachments.board_id,
       attachments.id,
       (
         select revision
         from public.boards
         where boards.id = attachments.board_id
       )
     ) as claimed
     where attachments.original_filename = 'ready.webp' $$,
  array['deleting'::text],
  'an owner atomically claims a ready image for deletion'
);
select throws_ok(
  $$ select * from public.finalize_board_image(
       (select id from public.attachments
        where original_filename = 'ready.webp'),
       'image/webp', 2048
     ) $$,
  'P0001', 'image_deletion_in_progress',
  'a delayed or duplicate finalize cannot resurrect a deleting image'
);
select results_eq(
  $$ select state
     from public.attachments
     where original_filename = 'ready.webp' $$,
  array['deleting'::text],
  'a rejected finalize leaves the claimed deletion state intact'
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[2048::bigint],
  'a deleting ready image remains charged until trusted completion'
);
select throws_ok(
  $$ select public.complete_board_image_deletion(owner_id, board_id, id)
     from public.attachments
     where original_filename = 'ready.webp' $$,
  '42501', null,
  'an authenticated owner cannot complete ready image deletion directly'
);
select set_config(
  'test.ready_attachment_id',
  (
    select id::text
    from public.attachments
    where original_filename = 'ready.webp'
  ),
  true
);
reset role;
set local role service_role;
select lives_ok(
  $$ select public.complete_board_image_deletion(
       '10000000-0000-4000-8000-000000000001',
       '30000000-0000-4000-8000-000000000003',
       current_setting('test.ready_attachment_id')::uuid
     ) $$,
  'service role completes a server-verified ready image deletion'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[0::bigint],
  'trusted ready image deletion releases its bytes'
);
select throws_ok(
  $$ select * from public.claim_board_image_deletion(
       '30000000-0000-4000-8000-000000000003',
       '30000000-0000-4000-8000-000000000099',
       (
         select revision
         from public.boards
         where id = '30000000-0000-4000-8000-000000000003'
       )
     ) $$,
  'P0001', 'image_not_found',
  'claiming an absent ready image returns the generic lifecycle error'
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

alter table public.attachments
drop constraint attachments_mime_type;
alter table public.attachments
disable trigger attachments_apply_storage_delta;
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
) values
(
  '50000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  'legacy/supported-image',
  'legacy.png',
  'image/png',
  10485760,
  'ready',
  null
),
(
  '50000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  'legacy/document',
  'legacy.pdf',
  'application/pdf',
  2048,
  'ready',
  null
),
(
  '50000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  'legacy/vector',
  'legacy.svg',
  'image/svg+xml',
  4096,
  'ready',
  null
);
update public.profiles
set storage_bytes = 0
where id = '10000000-0000-4000-8000-000000000001';
alter table public.attachments
enable trigger attachments_apply_storage_delta;

select lives_ok(
  $$ select private.reconcile_board_image_attachments() $$,
  'legacy attachment reconciliation completes before image constraints'
);
select results_eq(
  $$ select count(*)::bigint
     from public.attachments
     where storage_path like 'legacy/%'
       and mime_type not in (
         'image/jpeg', 'image/png', 'image/webp', 'image/gif'
       ) $$,
  array[0::bigint],
  'legacy non-image attachment metadata is removed explicitly'
);
select results_eq(
  $$ select count(*)::bigint
     from public.attachments
     where id = '50000000-0000-4000-8000-000000000001' $$,
  array[1::bigint],
  'legacy supported image metadata is preserved'
);
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[10485760::bigint],
  'legacy supported image bytes are authoritatively backfilled'
);
select lives_ok(
  $$ alter table public.attachments
     add constraint attachments_mime_type
     check (
       mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
     ) $$,
  'the image-only MIME constraint validates after reconciliation'
);
delete from public.attachments
where storage_path like 'legacy/%';
select results_eq(
  $$ select storage_bytes from public.profiles
     where id = '10000000-0000-4000-8000-000000000001' $$,
  array[0::bigint],
  'legacy reconciliation fixture cleanup releases backfilled bytes'
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
    'public.claim_board_image_cancellation(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.complete_board_image_cancellation(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.claim_board_image_deletion(uuid,uuid,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.complete_board_image_deletion(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.claim_board_deletion(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.complete_board_deletion(uuid,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot execute image or board deletion lifecycle RPCs'
);

select * from finish();
rollback;
