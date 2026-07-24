-- supabase/migrations/20260724030000_gmail_relevance_metadata_retention_enforcement.sql
-- Gmail relevance Phase A: make expiry unreadable immediately and leave physical cleanup to the
-- bounded authenticated retention job. This is a forward migration; do not edit the deployed
-- 20260723223402 metadata-retrieval migration.

BEGIN;

DROP POLICY IF EXISTS email_relevance_observations_owner_select
	ON public.email_relevance_message_observations;
CREATE POLICY email_relevance_observations_owner_select
	ON public.email_relevance_message_observations FOR SELECT
	TO authenticated
	USING ((SELECT auth.uid()) = user_id AND retention_expires_at > now());

DROP POLICY IF EXISTS email_relevance_candidates_owner_select
	ON public.email_relevance_project_candidates;
CREATE POLICY email_relevance_candidates_owner_select
	ON public.email_relevance_project_candidates FOR SELECT
	TO authenticated
	USING ((SELECT auth.uid()) = user_id AND retention_expires_at > now());

COMMIT;
