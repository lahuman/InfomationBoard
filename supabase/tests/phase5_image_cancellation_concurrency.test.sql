begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(17);

do $$
declare
  connection_string text :=
    'host=host.docker.internal port=54322 dbname=' || current_database()
    || ' user=postgres password=postgres';
begin
  perform extensions.dblink_connect('image_upload_session', connection_string);
  perform extensions.dblink_connect('image_cancel_session', connection_string);

  perform extensions.dblink_exec(
    'image_upload_session',
    $remote$
      do $setup$
      begin
        perform set_config('storage.allow_delete_query', 'true', true);
        delete from storage.objects
        where bucket_id = 'board-images'
          and name like '73000000-0000-4000-8000-000000000001/%';
        delete from auth.users
        where id = '73000000-0000-4000-8000-000000000001';

        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at
        ) values (
          '00000000-0000-0000-0000-000000000000',
          '73000000-0000-4000-8000-000000000001',
          'authenticated', 'authenticated', 'image-race@example.test', '',
          now(), '{"provider":"email","providers":["email"]}',
          '{"full_name":"Image race owner"}', now(), now()
        );

        insert into public.boards (
          id, owner_id, slug, title, template
        ) values
          (
            '74000000-0000-4000-8000-000000000001',
            '73000000-0000-4000-8000-000000000001',
            'upload-wins-image-race', 'Upload wins image race', 'event'
          ),
          (
            '74000000-0000-4000-8000-000000000002',
            '73000000-0000-4000-8000-000000000001',
            'cancel-wins-image-race', 'Cancel wins image race', 'event'
          );
      end
      $setup$;
    $remote$
  );
end;
$$;

do $$
begin
  perform extensions.dblink_exec('image_upload_session', 'begin');
  perform extensions.dblink_exec(
    'image_upload_session',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'image_upload_session',
    $remote$
      set local "request.jwt.claim.sub"
        = '73000000-0000-4000-8000-000000000001'
    $remote$
  );
end;
$$;

select results_eq(
  $test$
    select count(*)::bigint
    from extensions.dblink(
      'image_upload_session',
      $remote$
        select *
        from public.reserve_board_image(
          '74000000-0000-4000-8000-000000000001',
          'upload-wins.png', 'image/png', 1024
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
  'the upload-winning fixture is reserved through the real RPC'
);
select is(
  extensions.dblink_exec('image_upload_session', 'commit'),
  'COMMIT',
  'the upload-winning reservation commits'
);

do $$
begin
  perform extensions.dblink_exec('image_upload_session', 'begin');
  perform extensions.dblink_exec(
    'image_upload_session',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'image_upload_session',
    $remote$
      set local "request.jwt.claim.sub"
        = '73000000-0000-4000-8000-000000000001'
    $remote$
  );
end;
$$;

select is(
  extensions.dblink_exec(
    'image_upload_session',
    $remote$
      insert into storage.objects (bucket_id, name, owner_id)
      select 'board-images', storage_path, auth.uid()
      from public.attachments
      where board_id = '74000000-0000-4000-8000-000000000001'
    $remote$
  ),
  'INSERT 0 1',
  'the real Storage INSERT policy accepts the upload-winning path'
);

do $$
begin
  perform extensions.dblink_exec('image_cancel_session', 'begin');
  perform extensions.dblink_exec(
    'image_cancel_session',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'image_cancel_session',
    $remote$
      set local "request.jwt.claim.sub"
        = '73000000-0000-4000-8000-000000000001'
    $remote$
  );
  perform extensions.dblink_exec(
    'image_cancel_session',
    'set local lock_timeout = 250'
  );
end;
$$;

select results_eq(
  $test$
    select count(*)::bigint
    from extensions.dblink(
      'image_cancel_session',
      $remote$
        select claimed.*
        from public.attachments
        cross join lateral public.claim_board_image_cancellation(
          attachments.board_id,
          attachments.id
        ) as claimed
        where attachments.board_id =
          '74000000-0000-4000-8000-000000000001'
      $remote$,
      false
    ) as claim(id uuid, owner_id uuid, storage_path text, state text)
  $test$,
  array[0::bigint],
  'image cancellation blocks behind the Storage INSERT board lock'
);
select ok(
  position(
    'ERROR:  canceling statement due to lock timeout'
    in extensions.dblink_error_message('image_cancel_session')
  ) = 1
  and position(
    'while locking tuple'
    in extensions.dblink_error_message('image_cancel_session')
  ) > 0
  and position(
    'deadlock detected'
    in extensions.dblink_error_message('image_cancel_session')
  ) = 0,
  'the upload-first race waits on the board tuple without deadlocking'
);

do $$
begin
  perform extensions.dblink_exec('image_cancel_session', 'rollback');
  perform extensions.dblink_exec('image_upload_session', 'commit');
end;
$$;

select results_eq(
  $$ select count(*)::bigint
     from storage.objects
     join public.attachments
       on attachments.storage_path = objects.name
     where objects.bucket_id = 'board-images'
       and attachments.board_id =
         '74000000-0000-4000-8000-000000000001' $$,
  array[1::bigint],
  'the upload that wins the race is visible with its reserved attachment'
);

do $$
begin
  perform extensions.dblink_exec('image_cancel_session', 'begin');
  perform extensions.dblink_exec(
    'image_cancel_session',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'image_cancel_session',
    $remote$
      set local "request.jwt.claim.sub"
        = '73000000-0000-4000-8000-000000000001'
    $remote$
  );
end;
$$;

select results_eq(
  $test$
    select count(*)::bigint
    from extensions.dblink(
      'image_cancel_session',
      $remote$
        select claimed.*
        from public.attachments
        cross join lateral public.claim_board_image_cancellation(
          attachments.board_id,
          attachments.id
        ) as claimed
        where attachments.board_id =
          '74000000-0000-4000-8000-000000000001'
      $remote$
    ) as claim(id uuid, owner_id uuid, storage_path text, state text)
  $test$,
  array[1::bigint],
  'image cancellation proceeds after the Storage INSERT commits'
);
select is(
  extensions.dblink_exec('image_cancel_session', 'commit'),
  'COMMIT',
  'the post-upload cancellation claim commits'
);

do $$
begin
  perform extensions.dblink_exec('image_upload_session', 'begin');
  perform extensions.dblink_exec(
    'image_upload_session',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'image_upload_session',
    $remote$
      set local "request.jwt.claim.sub"
        = '73000000-0000-4000-8000-000000000001'
    $remote$
  );
end;
$$;

select results_eq(
  $test$
    select count(*)::bigint
    from extensions.dblink(
      'image_upload_session',
      $remote$
        select *
        from public.reserve_board_image(
          '74000000-0000-4000-8000-000000000002',
          'cancel-wins.png', 'image/png', 2048
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
  'the cancellation-winning fixture is reserved through the real RPC'
);
select is(
  extensions.dblink_exec('image_upload_session', 'commit'),
  'COMMIT',
  'the cancellation-winning reservation commits'
);

do $$
begin
  perform extensions.dblink_exec('image_cancel_session', 'begin');
  perform extensions.dblink_exec(
    'image_cancel_session',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'image_cancel_session',
    $remote$
      set local "request.jwt.claim.sub"
        = '73000000-0000-4000-8000-000000000001'
    $remote$
  );
end;
$$;

select results_eq(
  $test$
    select count(*)::bigint
    from extensions.dblink(
      'image_cancel_session',
      $remote$
        select claimed.*
        from public.attachments
        cross join lateral public.claim_board_image_cancellation(
          attachments.board_id,
          attachments.id
        ) as claimed
        where attachments.board_id =
          '74000000-0000-4000-8000-000000000002'
      $remote$
    ) as claim(id uuid, owner_id uuid, storage_path text, state text)
  $test$,
  array[1::bigint],
  'the cancellation claim can acquire the board lock first'
);

do $$
begin
  perform extensions.dblink_exec('image_upload_session', 'begin');
  perform extensions.dblink_exec(
    'image_upload_session',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'image_upload_session',
    $remote$
      set local "request.jwt.claim.sub"
        = '73000000-0000-4000-8000-000000000001'
    $remote$
  );
  perform extensions.dblink_exec(
    'image_upload_session',
    'set local lock_timeout = 250'
  );
end;
$$;

select is(
  extensions.dblink_exec(
    'image_upload_session',
    $remote$
      insert into storage.objects (bucket_id, name, owner_id)
      select 'board-images', storage_path, auth.uid()
      from public.attachments
      where board_id = '74000000-0000-4000-8000-000000000002'
    $remote$,
    false
  ),
  'ERROR',
  'a Storage INSERT blocks behind the cancellation board lock'
);
select ok(
  position(
    'canceling statement due to lock timeout'
    in extensions.dblink_error_message('image_upload_session')
  ) > 0
  and position(
    'while locking tuple'
    in extensions.dblink_error_message('image_upload_session')
  ) > 0
  and position(
    'deadlock detected'
    in extensions.dblink_error_message('image_upload_session')
  ) = 0,
  'the cancellation-first race waits on the board tuple without deadlocking'
);

do $$
begin
  perform extensions.dblink_exec('image_upload_session', 'rollback');
end;
$$;

select is(
  extensions.dblink_exec('image_cancel_session', 'commit'),
  'COMMIT',
  'the cancellation-winning transaction commits'
);
select results_eq(
  $$ select state
     from public.attachments
     where board_id = '74000000-0000-4000-8000-000000000002' $$,
  array['cancelling'::text],
  'the committed cancellation keeps the reservation non-uploadable'
);

do $$
begin
  perform extensions.dblink_exec('image_upload_session', 'begin');
  perform extensions.dblink_exec(
    'image_upload_session',
    'set local role authenticated'
  );
  perform extensions.dblink_exec(
    'image_upload_session',
    $remote$
      set local "request.jwt.claim.sub"
        = '73000000-0000-4000-8000-000000000001'
    $remote$
  );
end;
$$;

select is(
  extensions.dblink_exec(
    'image_upload_session',
    $remote$
      insert into storage.objects (bucket_id, name, owner_id)
      select 'board-images', storage_path, auth.uid()
      from public.attachments
      where board_id = '74000000-0000-4000-8000-000000000002'
    $remote$,
    false
  ),
  'ERROR',
  'a Storage INSERT retry loses after cancellation commits'
);
select ok(
  position(
    'violates row-level security policy'
    in extensions.dblink_error_message('image_upload_session')
  ) > 0,
  'the real policy rejects the retry because the attachment is cancelling'
);

do $$
begin
  perform extensions.dblink_exec('image_upload_session', 'rollback');
  perform extensions.dblink_exec(
    'image_upload_session',
    $remote$
      select set_config('storage.allow_delete_query', 'true', true);
      delete from storage.objects
      where bucket_id = 'board-images'
        and name like '73000000-0000-4000-8000-000000000001/%';
      delete from auth.users
      where id = '73000000-0000-4000-8000-000000000001';
    $remote$
  );
  perform extensions.dblink_disconnect('image_cancel_session');
  perform extensions.dblink_disconnect('image_upload_session');
end;
$$;

select * from finish();
rollback;
