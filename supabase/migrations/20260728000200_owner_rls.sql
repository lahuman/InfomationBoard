create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy boards_select_own
on public.boards
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy boards_insert_own
on public.boards
for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy boards_update_own
on public.boards
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy boards_delete_own
on public.boards
for delete
to authenticated
using (owner_id = (select auth.uid()));

create policy attachments_select_own
on public.attachments
for select
to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.boards
    where boards.id = attachments.board_id
      and boards.owner_id = (select auth.uid())
  )
);

create policy attachments_insert_own
on public.attachments
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.boards
    where boards.id = attachments.board_id
      and boards.owner_id = (select auth.uid())
  )
);

create policy attachments_update_own
on public.attachments
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.boards
    where boards.id = attachments.board_id
      and boards.owner_id = (select auth.uid())
  )
);

create policy attachments_delete_own
on public.attachments
for delete
to authenticated
using (owner_id = (select auth.uid()));
