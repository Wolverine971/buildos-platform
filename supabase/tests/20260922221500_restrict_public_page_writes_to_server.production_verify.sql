-- supabase/tests/20260922221500_restrict_public_page_writes_to_server.production_verify.sql
-- Read-only structural verification. Safe for the hosted project after migration.
DO $verify$
DECLARE
 target_table TEXT;
 target_role TEXT;
BEGIN
 FOREACH target_table IN ARRAY ARRAY[
  'public.onto_public_pages',
  'public.onto_public_page_review_attempts',
  'public.onto_public_page_slug_history'
 ] LOOP
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
   IF has_any_column_privilege(target_role, target_table, 'INSERT')
    OR has_any_column_privilege(target_role, target_table, 'UPDATE') THEN
    RAISE EXCEPTION '% can still write % directly', target_role, target_table;
   END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', target_table, 'INSERT')
   OR NOT has_table_privilege('service_role', target_table, 'UPDATE') THEN
   RAISE EXCEPTION 'service_role lost write access to %', target_table;
  END IF;
 END LOOP;

 IF EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public'
   AND tablename IN (
    'onto_public_pages',
    'onto_public_page_review_attempts',
    'onto_public_page_slug_history'
   )
   AND cmd IN ('INSERT', 'UPDATE', 'ALL')
 ) THEN
  RAISE EXCEPTION 'A Data API write policy remains on a public page table';
 END IF;

 IF NOT has_table_privilege('authenticated', 'public.onto_public_pages', 'SELECT')
  OR NOT has_table_privilege('authenticated', 'public.onto_public_page_review_attempts', 'SELECT') THEN
  RAISE EXCEPTION 'Members lost read access to public page tables';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'onto_public_pages'
   AND policyname = 'public_page_select_member'
 ) OR NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'onto_public_page_review_attempts'
   AND policyname = 'public_page_reviews_select_member'
 ) THEN
  RAISE EXCEPTION 'Member SELECT policies on public page tables are missing';
 END IF;
END;
$verify$;
