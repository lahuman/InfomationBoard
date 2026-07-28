create function private.set_board_published_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status = 'draft' then
    new.published_at = now();
  elsif new.status = 'draft' then
    new.published_at = null;
  end if;

  return new;
end;
$$;

create trigger boards_set_published_at
before update on public.boards
for each row execute function private.set_board_published_at();

create policy boards_select_published_public
on public.boards
for select
to anon
using (
  status = 'published'
  and visibility = 'public'
);

grant select (
  id,
  slug,
  title,
  summary,
  content_markdown,
  template,
  theme,
  allow_indexing,
  updated_at,
  published_at
) on public.boards to anon;
