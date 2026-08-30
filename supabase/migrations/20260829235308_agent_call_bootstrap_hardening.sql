-- supabase/migrations/20260829235308_agent_call_bootstrap_hardening.sql
-- Bound the lifetime of bootstrap-link secrets that were never redeemed.
-- Successful redemption deletes the row atomically in the web service; this
-- function handles abandoned and expired links from the worker retention job.

CREATE INDEX IF NOT EXISTS idx_agent_call_bootstrap_links_expires_at
	ON public.agent_call_bootstrap_links (expires_at, id);

CREATE OR REPLACE FUNCTION public.cleanup_expired_agent_call_bootstrap_links(
	p_batch_size integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_batch_size integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT link.id
		FROM public.agent_call_bootstrap_links AS link
		WHERE link.expires_at <= clock_timestamp()
		ORDER BY link.expires_at, link.id
		LIMIT v_batch_size
		FOR UPDATE SKIP LOCKED
	), deleted AS (
		DELETE FROM public.agent_call_bootstrap_links AS link
		USING candidates
		WHERE link.id = candidates.id
		RETURNING link.id
	)
	SELECT count(*)::integer INTO v_deleted FROM deleted;

	RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_agent_call_bootstrap_links(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_agent_call_bootstrap_links(integer) FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_expired_agent_call_bootstrap_links(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_agent_call_bootstrap_links(integer) TO service_role;

COMMENT ON FUNCTION public.cleanup_expired_agent_call_bootstrap_links(integer) IS
	'Deletes a bounded batch of expired, unredeemed agent-call bootstrap links. Service-role retention only.';
