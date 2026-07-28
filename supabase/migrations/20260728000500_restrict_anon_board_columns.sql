revoke select on public.boards from anon;

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
