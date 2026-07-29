begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(2);

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
        ) values (
          '72000000-0000-4000-8000-000000000002',
          '71000000-0000-4000-8000-000000000001',
          'lock-board', 'Lock board', 'event'
        );
      end
      $setup$;
    $remote$
  );

  perform extensions.dblink_exec('upload_holder', 'begin');
  perform locked.id
  from extensions.dblink(
    'upload_holder',
    $remote$
      select id
      from public.boards
      where id = '72000000-0000-4000-8000-000000000002'
      for key share
    $remote$
  ) as locked(id uuid);

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
        select id, owner_id, slug
        from public.claim_board_deletion(
          '72000000-0000-4000-8000-000000000002'
        )
      $remote$,
      false
    ) as claim(id uuid, owner_id uuid, slug text)
  $test$,
  array[0::bigint],
  'board deletion waits for an in-flight upload-side KEY SHARE lock'
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
  'the blocked board deletion failed specifically on the held row lock'
);

do $$
begin
  perform extensions.dblink_exec('claim_waiter', 'rollback');
  perform extensions.dblink_exec('upload_holder', 'rollback');
  perform extensions.dblink_exec(
    'upload_holder',
    $remote$
      delete from auth.users
      where id = '71000000-0000-4000-8000-000000000001'
    $remote$
  );
  perform extensions.dblink_disconnect('claim_waiter');
  perform extensions.dblink_disconnect('upload_holder');
end;
$$;

select * from finish();
rollback;
