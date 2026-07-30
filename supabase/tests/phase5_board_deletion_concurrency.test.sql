begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(18);

do $$
declare
  connection_string text :=
    'host=host.docker.internal port=54322 dbname=' || current_database()
    || ' user=postgres password=postgres';
begin
  perform extensions.dblink_connect('upload_holder', connection_string);
  perform extensions.dblink_connect('claim_waiter', connection_string);

  perform extensions.dblink_exec(
    'upload_holder',
    $remote$
      do $setup$
      begin
        perform set_config('storage.allow_delete_query', 'true', true);
        delete from storage.objects
        where bucket_id = 'board-images'
          and name like '71000000-0000-4000-8000-000000000001/%';
        delete from auth.users
        where id = '71000000-0000-4000-8000-000000000001';

        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at
        ) values (
          '00000000-0000-0000-0000-000000000000',
          '71000000-0000-4000-8000-000000000001',
          'authenticated', 'authenticated', 'lock-owner@example.test', '',
          now(), '{"provider":"email","providers":["email"]}',
          '{"full_name":"Lock owner"}', now(), now()
        );

        insert into public.boards (
          id, owner_id, slug, title, template
        ) values
          (
            '72000000-0000-4000-8000-000000000001',
            '71000000-0000-4000-8000-000000000001',
            'reserve-lock-board', 'Reserve lock board', 'event'
          ),
          (
            '72000000-0000-4000-8000-000000000002',
            '71000000-0000-4000-8000-000000000001',
            'storage-lock-board', 'Storage lock board', 'event'
          ),
          (
            '72000000-0000-4000-8000-000000000003',
            '71000000-0000-4000-8000-000000000001',
            'claim-wins-board', 'Claim wins board', 'event'
          );
      end
      $setup$;
    $remote$
  );

  perform extensions.dblink_exec('upload_holder', 'begin');
  perform extensions.dblink_exec(
    'upload_holder',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'upload_holder',
    $remote$
      set local "request.jwt.claim.sub"
        = '71000000-0000-4000-8000-000000000001'
    $remote$
  );
end;
$$;

select results_eq(
  $test$
    select count(*)::bigint
    from extensions.dblink(
      'upload_holder',
      $remote$
        select *
        from public.reserve_board_image(
          '72000000-0000-4000-8000-000000000001',
          'reserve-lock.png', 'image/png', 1024
        )
      $remote$
    ) as reserved(
      id uuid,
      storage_path text,
      original_filename text,
      mime_type text,
      size_bytes bigint,
      reservation_expires_at timestamptz
    )
  $test$,
  array[1::bigint],
  'the real reservation RPC creates a row while holding its transaction open'
);

do $$
begin
  perform extensions.dblink_exec('claim_waiter', 'begin');
  perform extensions.dblink_exec(
    'claim_waiter',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'claim_waiter',
    $remote$
      set local "request.jwt.claim.sub"
        = '71000000-0000-4000-8000-000000000001'
    $remote$
  );
  perform extensions.dblink_exec(
    'claim_waiter',
    'set local lock_timeout = 250'
  );
end;
$$;

select results_eq(
  $test$
    select count(*)::bigint
    from extensions.dblink(
      'claim_waiter',
      $remote$
        select *
        from public.claim_board_deletion(
          '72000000-0000-4000-8000-000000000001'
        )
      $remote$,
      false
    ) as claim(id uuid, owner_id uuid, slug text)
  $test$,
  array[0::bigint],
  'board deletion blocks behind the real reservation RPC board lock'
);
select ok(
  position(
    'ERROR:  canceling statement due to lock timeout'
    in extensions.dblink_error_message('claim_waiter')
  ) = 1
  and position(
    'while locking tuple'
    in extensions.dblink_error_message('claim_waiter')
  ) > 0,
  'the reservation race blocks specifically on the board row lock'
);

do $$
begin
  perform extensions.dblink_exec('claim_waiter', 'rollback');
  perform extensions.dblink_exec('upload_holder', 'commit');
end;
$$;

select results_eq(
  $$ select count(*)::bigint
     from public.attachments
     where board_id = '72000000-0000-4000-8000-000000000001'
       and original_filename = 'reserve-lock.png' $$,
  array[1::bigint],
  'the reservation that wins the race is visible for path enumeration'
);

do $$
begin
  perform extensions.dblink_exec('claim_waiter', 'begin');
  perform extensions.dblink_exec(
    'claim_waiter',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'claim_waiter',
    $remote$
      set local "request.jwt.claim.sub"
        = '71000000-0000-4000-8000-000000000001'
    $remote$
  );
end;
$$;

select results_eq(
  $test$
    select count(*)::bigint
    from extensions.dblink(
      'claim_waiter',
      $remote$
        select *
        from public.claim_board_deletion(
          '72000000-0000-4000-8000-000000000001'
        )
      $remote$
    ) as claim(id uuid, owner_id uuid, slug text)
  $test$,
  array[1::bigint],
  'board deletion proceeds after the real reservation transaction commits'
);
select is(
  extensions.dblink_exec('claim_waiter', 'commit'),
  'COMMIT',
  'the successful reservation-race deletion claim commits'
);

do $$
declare
  reserved record;
begin
  perform extensions.dblink_exec('upload_holder', 'begin');
  perform extensions.dblink_exec(
    'upload_holder',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'upload_holder',
    $remote$
      set local "request.jwt.claim.sub"
        = '71000000-0000-4000-8000-000000000001'
    $remote$
  );
  select * into reserved
  from extensions.dblink(
    'upload_holder',
    $remote$
      select id
      from public.reserve_board_image(
        '72000000-0000-4000-8000-000000000002',
        'storage-lock.png', 'image/png', 2048
      )
    $remote$
  ) as reservation(id uuid);
  perform extensions.dblink_exec('upload_holder', 'commit');

  perform extensions.dblink_exec('upload_holder', 'begin');
  perform extensions.dblink_exec(
    'upload_holder',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'upload_holder',
    $remote$
      set local "request.jwt.claim.sub"
        = '71000000-0000-4000-8000-000000000001'
    $remote$
  );
end;
$$;

select is(
  extensions.dblink_exec(
    'upload_holder',
    $remote$
      insert into storage.objects (bucket_id, name, owner_id)
      select 'board-images', storage_path, auth.uid()
      from public.attachments
      where board_id = '72000000-0000-4000-8000-000000000002'
    $remote$
  ),
  'INSERT 0 1',
  'the actual Storage INSERT policy accepts a live reserved path'
);

do $$
begin
  perform extensions.dblink_exec('claim_waiter', 'begin');
  perform extensions.dblink_exec(
    'claim_waiter',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'claim_waiter',
    $remote$
      set local "request.jwt.claim.sub"
        = '71000000-0000-4000-8000-000000000001'
    $remote$
  );
  perform extensions.dblink_exec(
    'claim_waiter',
    'set local lock_timeout = 250'
  );
end;
$$;

select results_eq(
  $test$
    select count(*)::bigint
    from extensions.dblink(
      'claim_waiter',
      $remote$
        select *
        from public.claim_board_deletion(
          '72000000-0000-4000-8000-000000000002'
        )
      $remote$,
      false
    ) as claim(id uuid, owner_id uuid, slug text)
  $test$,
  array[0::bigint],
  'board deletion blocks behind the real Storage INSERT policy lock'
);
select ok(
  position(
    'ERROR:  canceling statement due to lock timeout'
    in extensions.dblink_error_message('claim_waiter')
  ) = 1
  and position(
    'while locking tuple'
    in extensions.dblink_error_message('claim_waiter')
  ) > 0,
  'the Storage INSERT race blocks specifically on the board row lock'
);

do $$
begin
  perform extensions.dblink_exec('claim_waiter', 'rollback');
  perform extensions.dblink_exec('upload_holder', 'commit');
end;
$$;

select results_eq(
  $$ select count(*)::bigint
     from storage.objects
     join public.attachments
       on attachments.storage_path = objects.name
     where objects.bucket_id = 'board-images'
       and attachments.board_id = '72000000-0000-4000-8000-000000000002' $$,
  array[1::bigint],
  'the Storage upload that wins remains server-enumerable with its attachment'
);

do $$
begin
  perform extensions.dblink_exec('claim_waiter', 'begin');
  perform extensions.dblink_exec(
    'claim_waiter',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'claim_waiter',
    $remote$
      set local "request.jwt.claim.sub"
        = '71000000-0000-4000-8000-000000000001'
    $remote$
  );
end;
$$;

select results_eq(
  $test$
    select count(*)::bigint
    from extensions.dblink(
      'claim_waiter',
      $remote$
        select *
        from public.claim_board_deletion(
          '72000000-0000-4000-8000-000000000002'
        )
      $remote$
    ) as claim(id uuid, owner_id uuid, slug text)
  $test$,
  array[1::bigint],
  'board deletion proceeds after the real Storage INSERT commits'
);
select is(
  extensions.dblink_exec('claim_waiter', 'commit'),
  'COMMIT',
  'the successful Storage-race deletion claim commits'
);

do $$
declare
  reserved record;
begin
  perform extensions.dblink_exec('upload_holder', 'begin');
  perform extensions.dblink_exec(
    'upload_holder',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'upload_holder',
    $remote$
      set local "request.jwt.claim.sub"
        = '71000000-0000-4000-8000-000000000001'
    $remote$
  );
  select * into reserved
  from extensions.dblink(
    'upload_holder',
    $remote$
      select id
      from public.reserve_board_image(
        '72000000-0000-4000-8000-000000000003',
        'claim-wins.png', 'image/png', 4096
      )
    $remote$
  ) as reservation(id uuid);
  perform extensions.dblink_exec('upload_holder', 'commit');

  perform extensions.dblink_exec('claim_waiter', 'begin');
  perform extensions.dblink_exec(
    'claim_waiter',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'claim_waiter',
    $remote$
      set local "request.jwt.claim.sub"
        = '71000000-0000-4000-8000-000000000001'
    $remote$
  );
end;
$$;

select results_eq(
  $test$
    select count(*)::bigint
    from extensions.dblink(
      'claim_waiter',
      $remote$
        select *
        from public.claim_board_deletion(
          '72000000-0000-4000-8000-000000000003'
        )
      $remote$
    ) as claim(id uuid, owner_id uuid, slug text)
  $test$,
  array[1::bigint],
  'the real board claim can win before later reservation and upload attempts'
);
select is(
  extensions.dblink_exec('claim_waiter', 'commit'),
  'COMMIT',
  'the claim-winning deletion transaction commits'
);

do $$
begin
  perform extensions.dblink_exec('upload_holder', 'begin');
  perform extensions.dblink_exec(
    'upload_holder',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'upload_holder',
    $remote$
      set local "request.jwt.claim.sub"
        = '71000000-0000-4000-8000-000000000001'
    $remote$
  );
end;
$$;

select results_eq(
  $test$
    select count(*)::bigint
    from extensions.dblink(
      'upload_holder',
      $remote$
        select *
        from public.reserve_board_image(
          '72000000-0000-4000-8000-000000000003',
          'too-late.png', 'image/png', 1
        )
      $remote$,
      false
    ) as reserved(
      id uuid,
      storage_path text,
      original_filename text,
      mime_type text,
      size_bytes bigint,
      reservation_expires_at timestamptz
    )
  $test$,
  array[0::bigint],
  'a real reservation RPC loses after the board deletion claim commits'
);
select ok(
  position('image_not_found'
    in extensions.dblink_error_message('upload_holder')) > 0,
  'the losing reservation receives the stable claimed-board error'
);

do $$
begin
  perform extensions.dblink_exec('upload_holder', 'rollback');
  perform extensions.dblink_exec('upload_holder', 'begin');
  perform extensions.dblink_exec(
    'upload_holder',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'upload_holder',
    $remote$
      set local "request.jwt.claim.sub"
        = '71000000-0000-4000-8000-000000000001'
    $remote$
  );
end;
$$;

select is(
  extensions.dblink_exec(
    'upload_holder',
    $remote$
      insert into storage.objects (bucket_id, name, owner_id)
      select 'board-images', storage_path, auth.uid()
      from public.attachments
      where board_id = '72000000-0000-4000-8000-000000000003'
    $remote$,
    false
  ),
  'ERROR',
  'an actual Storage INSERT loses after the board deletion claim commits'
);
select ok(
  position(
    'violates row-level security policy'
    in extensions.dblink_error_message('upload_holder')
  ) > 0,
  'the losing Storage INSERT is rejected by the real policy'
);

do $$
begin
  perform extensions.dblink_exec('upload_holder', 'rollback');
  perform extensions.dblink_exec(
    'upload_holder',
    $remote$
      select set_config('storage.allow_delete_query', 'true', true);
      delete from storage.objects
      where bucket_id = 'board-images'
        and name like '71000000-0000-4000-8000-000000000001/%';
      delete from auth.users
      where id = '71000000-0000-4000-8000-000000000001';
    $remote$
  );
  perform extensions.dblink_disconnect('claim_waiter');
  perform extensions.dblink_disconnect('upload_holder');
end;
$$;

select * from finish();
rollback;
