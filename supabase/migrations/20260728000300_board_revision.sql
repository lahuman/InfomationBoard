alter table public.boards
add column revision bigint not null default 1;

alter table public.boards
add constraint boards_revision_positive check (revision > 0);

create function private.bump_board_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.revision = old.revision + 1;
  return new;
end;
$$;

create trigger boards_bump_revision
before update on public.boards
for each row execute function private.bump_board_revision();

