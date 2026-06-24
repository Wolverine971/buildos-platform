-- supabase/migrations/20260624000000_start_here_managed_region_recency_guard.sql
-- Preserve human-facing document recency when the Start Here document changes
-- only inside deterministic managed regions.

create or replace function public.strip_start_here_managed_regions(p_content text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      coalesce(p_content, ''),
      '<!--[[:space:]]*managed:[a-z0-9_-]+[[:space:]]+v=[0-9]+[[:space:]]*-->(.|\n)*?<!--[[:space:]]*/managed:[a-z0-9_-]+[[:space:]]*-->',
      '',
      'gi'
    )
  );
$$;

create or replace function update_onto_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  -- Derived outline cache refresh: not a user-visible edit.
  if (to_jsonb(new) - 'outline' - 'updated_at')
       = (to_jsonb(old) - 'outline' - 'updated_at') then
    new.updated_at = old.updated_at;
    return new;
  end if;

  -- Start Here managed regions are deterministic projections of project state.
  -- If only `content` and/or `outline` changed, and the authored body outside
  -- managed fences is identical, preserve the prior recency timestamp.
  if old.type_key = 'document.context.project'
     and new.type_key = old.type_key
     and (to_jsonb(new) - 'outline' - 'updated_at' - 'content')
       = (to_jsonb(old) - 'outline' - 'updated_at' - 'content')
     and public.strip_start_here_managed_regions(new.content)
       = public.strip_start_here_managed_regions(old.content) then
    new.updated_at = old.updated_at;
  end if;

  return new;
end;
$$;
