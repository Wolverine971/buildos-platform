-- supabase/migrations/20261105120400_public_role_policies_rescope.sql
--
-- Security audit 2026-11-05, bundle C2. Three production policies (created outside the repo's
-- migrations) were granted to PUBLIC with WITH CHECK (true), so anon and any signed-in user
-- could write them:
--   * llm_usage_logs_service_insert: insert usage rows under ANY user_id. Quota and billing
--     readers count those rows, so a stranger could pause another user's capture sort or push
--     them into a billing freeze. Negative costs could also lower a user's own counted spend.
--   * llm_usage_summary_service_all: insert summary rows for anyone.
--   * "Allow email attachment uploads" on storage.objects: anyone with the public anon key could
--     upload into the public email-attachments bucket, bypassing the admin-only upload route.
--
-- Fix, without moving the ~20 web code paths that log usage with a user-scoped client:
--   * usage rows: a signed-in user may insert only rows for themselves; anon may not insert.
--     The service role (worker, admin clients) bypasses RLS as before.
--   * token and cost columns must be non-negative (NOT VALID: enforced for new rows only, so
--     legacy rows are not rescanned).
--   * usage summary rows: server only (update_llm_usage_summary is SECURITY DEFINER).
--   * email attachment uploads: signed-in admins only (the admin route uploads with the admin's
--     own session).

SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- llm_usage_logs -----------------------------------------------------------------------------
DROP POLICY IF EXISTS llm_usage_logs_service_insert ON public.llm_usage_logs;
DROP POLICY IF EXISTS llm_usage_logs_user_insert_own ON public.llm_usage_logs;
CREATE POLICY llm_usage_logs_user_insert_own ON public.llm_usage_logs
	FOR INSERT TO authenticated
	WITH CHECK (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.llm_usage_logs FROM anon;
-- Signed-in users only ever insert (the logger uses insert, or upsert with ignoreDuplicates,
-- which is INSERT ... ON CONFLICT DO NOTHING). Admin edits go through the service role.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.llm_usage_logs FROM authenticated;

ALTER TABLE public.llm_usage_logs
	DROP CONSTRAINT IF EXISTS llm_usage_logs_non_negative;
ALTER TABLE public.llm_usage_logs
	ADD CONSTRAINT llm_usage_logs_non_negative CHECK (
		prompt_tokens >= 0
		AND completion_tokens >= 0
		AND total_tokens >= 0
		AND reasoning_tokens >= 0
		AND cached_prompt_tokens >= 0
		AND cache_write_tokens >= 0
		AND input_cost_usd >= 0
		AND output_cost_usd >= 0
		AND total_cost_usd >= 0
		AND (openrouter_usage_cost_usd IS NULL OR openrouter_usage_cost_usd >= 0)
		AND (openrouter_upstream_inference_cost_usd IS NULL OR openrouter_upstream_inference_cost_usd >= 0)
	) NOT VALID;

-- llm_usage_summary --------------------------------------------------------------------------
DROP POLICY IF EXISTS llm_usage_summary_service_all ON public.llm_usage_summary;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.llm_usage_summary
	FROM anon, authenticated;

-- storage: email-attachments uploads ---------------------------------------------------------
DROP POLICY IF EXISTS "Allow email attachment uploads" ON storage.objects;
CREATE POLICY "Allow email attachment uploads" ON storage.objects
	FOR INSERT TO authenticated
	WITH CHECK (bucket_id = 'email-attachments' AND public.is_admin());
