-- supabase/migrations/20261105150000_document_digest.sql
--
-- Document cards (tasker 152). `digest` holds a short AI-written summary of a document that
-- has no description, so previews (Workspace cards, chat document cards) never need the body:
--   {summary, content_hash, model, at}  or  {failed_at, content_hash}  after a failed attempt.
-- It is a derived cache like `outline`: fresh while digest.content_hash = content_hash.
--
-- The worker's summary sweep writes it in the background, so the recency guard must ignore
-- it the way it ignores `outline`; otherwise a summary would move updated_at, which eight
-- callers use as an edit-conflict check. This redefines the live guard (20260907162504 +
-- search_path hardening from 20260907200711) with `digest` added to every comparison.

ALTER TABLE public.onto_documents ADD COLUMN IF NOT EXISTS digest jsonb;

COMMENT ON COLUMN public.onto_documents.digest IS
	'Derived cache: AI summary for documents without a description {summary, content_hash, model, at} (or {failed_at, content_hash}). Fresh while content_hash matches. Ignored by the updated_at guard.';

CREATE OR REPLACE FUNCTION public.update_onto_documents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
begin
  new.updated_at = now();

  -- Derived caches: `outline` and `digest` are app-maintained caches; `search_vector` is a
  -- generated column, like `content_hash`, unavailable in NEW at BEFORE-trigger time (computed
  -- after this trigger), so it must be excluded from row comparisons.
  if (to_jsonb(new) - 'outline' - 'digest' - 'updated_at' - 'search_vector' - 'content_hash')
       = (to_jsonb(old) - 'outline' - 'digest' - 'updated_at' - 'search_vector' - 'content_hash') then
    new.updated_at = old.updated_at;
    return new;
  end if;

  -- Start Here managed regions are deterministic projections of project state.
  -- If only `content`, `outline` and/or `digest` changed, and the authored body outside
  -- managed fences is identical, preserve the prior recency timestamp.
  if old.type_key = 'document.context.project'
     and new.type_key = old.type_key
     and (to_jsonb(new) - 'outline' - 'digest' - 'updated_at' - 'content' - 'search_vector' - 'content_hash')
       = (to_jsonb(old) - 'outline' - 'digest' - 'updated_at' - 'content' - 'search_vector' - 'content_hash')
     and public.strip_start_here_managed_regions(new.content)
       = public.strip_start_here_managed_regions(old.content) then
    new.updated_at = old.updated_at;
  end if;

  return new;
end;
$function$;
