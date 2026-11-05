-- supabase/migrations/20261105120000_queue_jobs_server_only_writes.sql
--
-- Security audit 2026-11-05, bundle A. Signed-in users could UPDATE and DELETE their own
-- queue_jobs rows through the table API (queue_jobs_update / queue_jobs_delete policies plus a
-- table-wide grant). The worker trusts every column of a queue row (job_type, metadata,
-- priority, status, attempts, scheduled_for), so a user could rewrite one of their own finished
-- rows into a new job aimed at someone else: sync_calendar deleting another user's Google
-- events, agent_run resuming another user's run, buildos_project_loop auditing another user's
-- project, send_sms texting any number, embed_onto_entity dropping another tenant's
-- embeddings, workspace_suggest bypassing its daily cap, and priority games that starve the
-- shared worker.
--
-- queue_jobs is worker plumbing. After this migration a signed-in user can only read their own
-- rows (the realtime brief progress stream needs that). Cancels from the web app go through the
-- server with the service role, filtered to the caller's user_id. The queue helper functions
-- that were executable by anon/authenticated are only called by the worker (service role).

SET lock_timeout = '5s';
SET statement_timeout = '60s';

DROP POLICY IF EXISTS queue_jobs_update ON public.queue_jobs;
DROP POLICY IF EXISTS queue_jobs_delete ON public.queue_jobs;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.queue_jobs
	FROM anon, authenticated;

-- Worker-only queue functions. They are SECURITY INVOKER, so they already fail for a signed-in
-- caller once the table grants are gone; revoking EXECUTE makes the boundary explicit.
REVOKE EXECUTE ON FUNCTION public.cancel_brief_jobs_for_date(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_job_with_reason(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_jobs_atomic(uuid, text, jsonb, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_pending_jobs(text[], integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_old_completed_queue_jobs(integer, integer, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_queue_job(uuid, text, boolean, uuid) FROM PUBLIC, anon, authenticated;

-- handle_manual_brief_generation() is the daily_briefs trigger that cancels a user's pending
-- brief jobs. It is SECURITY INVOKER and nothing writes daily_briefs with a user session today
-- (the worker writes it as service_role). If a user-session writer is ever added, that write
-- will now fail at this trigger; make the trigger SECURITY DEFINER then.
