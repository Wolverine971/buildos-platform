-- supabase/migrations/20260922221500_restrict_public_page_writes_to_server.sql
-- Public page publish state and content review verdicts are server-owned.
-- The member INSERT/UPDATE policies let any project writer set
-- published_content, status, and public_status on onto_public_pages, or insert
-- a forged "passed" onto_public_page_review_attempts row, directly through the
-- Data API, bypassing content review. The web app now writes these tables with
-- the service role only after it verifies the caller's project write access,
-- so drop every Data API write policy and revoke the underlying grants so a
-- future policy cannot silently reopen the path. Slug history is written only
-- by the SECURITY DEFINER slug trigger; member writes there could forge
-- redirects from retired slugs, so it is closed the same way.
-- SELECT policies stay. Member DELETE on onto_public_pages stays: deleting a
-- page cannot publish content.
-- Deploy order: web code that writes through the service role first, then this.

drop policy if exists public_page_insert_member on public.onto_public_pages;
drop policy if exists public_page_update_member on public.onto_public_pages;
drop policy if exists public_page_insert_admin on public.onto_public_pages;
drop policy if exists public_page_update_admin on public.onto_public_pages;

drop policy if exists public_page_reviews_insert_member on public.onto_public_page_review_attempts;
drop policy if exists public_page_reviews_insert_admin on public.onto_public_page_review_attempts;
drop policy if exists public_page_reviews_update_admin on public.onto_public_page_review_attempts;

drop policy if exists public_page_slug_history_insert_member on public.onto_public_page_slug_history;
drop policy if exists public_page_slug_history_update_member on public.onto_public_page_slug_history;
drop policy if exists public_page_slug_history_insert_admin on public.onto_public_page_slug_history;
drop policy if exists public_page_slug_history_update_admin on public.onto_public_page_slug_history;

revoke insert, update on table public.onto_public_pages from public, anon, authenticated;
revoke insert, update on table public.onto_public_page_review_attempts from public, anon, authenticated;
revoke insert, update on table public.onto_public_page_slug_history from public, anon, authenticated;

grant all privileges on table public.onto_public_pages to service_role;
grant all privileges on table public.onto_public_page_review_attempts to service_role;
grant all privileges on table public.onto_public_page_slug_history to service_role;
