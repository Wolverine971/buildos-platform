-- supabase/migrations/20261026171609_email_campaign_atomic_daily_cap.sql
-- Reserve the rolling daily allowance in the same transaction as a queue claim.
-- Deployment order: apply this migration before deploying the updated sender.
BEGIN;

CREATE TABLE private.email_campaign_send_reservations (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	recipient_id UUID REFERENCES public.email_campaign_recipients(id) ON DELETE SET NULL,
	attempt_count INTEGER NOT NULL,
	reserved_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
	sent_at TIMESTAMPTZ,
	UNIQUE (recipient_id, attempt_count)
);
CREATE INDEX email_campaign_send_reservations_time_idx
	ON private.email_campaign_send_reservations ((coalesce(sent_at, reserved_at)));
ALTER TABLE private.email_campaign_send_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.email_campaign_send_reservations FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.email_campaign_send_reservations TO service_role;

-- Count existing sends and uncertain attempts during the deployment transition.
-- No address or content is retained; recipient deletion removes the reference.
INSERT INTO private.email_campaign_send_reservations (recipient_id, attempt_count, reserved_at, sent_at)
SELECT id, attempt_count, coalesce(sent_at, updated_at), sent_at
FROM public.email_campaign_recipients
WHERE sent_at >= clock_timestamp() - interval '24 hours'
	OR status = 'sending'
	OR (status = 'failed' AND updated_at >= clock_timestamp() - interval '24 hours');

CREATE FUNCTION public.get_email_campaign_daily_allowance(p_daily_cap INTEGER DEFAULT 400)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
	SELECT greatest(0, coalesce(p_daily_cap, 0) - count(*)::integer)
	FROM private.email_campaign_send_reservations
	WHERE coalesce(sent_at, reserved_at) >= statement_timestamp() - interval '24 hours';
$$;
REVOKE ALL ON FUNCTION public.get_email_campaign_daily_allowance(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_campaign_daily_allowance(INTEGER) TO service_role;

-- Drop the two-argument signature to avoid ambiguous PostgREST overloads.
-- Old callers remain safe: omitted p_daily_cap defaults to the existing 400.
DROP FUNCTION public.claim_email_campaign_sends(INTEGER, INTEGER);
CREATE FUNCTION public.claim_email_campaign_sends(
	p_limit INTEGER,
	p_lease_seconds INTEGER DEFAULT 120,
	p_daily_cap INTEGER DEFAULT 400
)
RETURNS SETOF public.email_campaign_recipients
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
	v_available INTEGER;
	v_now TIMESTAMPTZ;
BEGIN
	IF p_limit IS NULL OR p_limit <= 0 OR p_daily_cap IS NULL OR p_daily_cap <= 0 THEN
		RETURN;
	END IF;
	-- One shared budget across campaigns and cron processes. Only the short
	-- claim transaction holds this lock; no network/email work happens here.
	PERFORM pg_advisory_xact_lock(173402, 1);
	v_now := clock_timestamp();
	DELETE FROM private.email_campaign_send_reservations
	WHERE coalesce(sent_at, reserved_at) < v_now - interval '24 hours';
	SELECT greatest(0, p_daily_cap - count(*)::integer) INTO v_available
	FROM private.email_campaign_send_reservations;
	IF v_available = 0 THEN RETURN; END IF;

	RETURN QUERY
	WITH due AS (
		SELECT r.id FROM public.email_campaign_recipients r
		JOIN public.email_campaigns c ON c.id = r.campaign_id
		WHERE r.status = 'queued' AND r.included
			AND r.scheduled_for <= v_now AND c.status = 'sending'
		ORDER BY r.scheduled_for, r.id
		FOR UPDATE OF r SKIP LOCKED
		LIMIT least(p_limit, v_available, 200)
	), claimed AS (
		UPDATE public.email_campaign_recipients r
		SET status = 'sending',
			lease_expires_at = v_now + make_interval(secs => greatest(p_lease_seconds, 30)),
			attempt_count = r.attempt_count + 1
		FROM due WHERE r.id = due.id RETURNING r.*
	), reserved AS (
		INSERT INTO private.email_campaign_send_reservations (recipient_id, attempt_count, reserved_at)
		SELECT id, attempt_count, v_now FROM claimed RETURNING recipient_id
	)
	SELECT claimed.* FROM claimed JOIN reserved ON reserved.recipient_id = claimed.id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_email_campaign_sends(INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_campaign_sends(INTEGER, INTEGER, INTEGER) TO service_role;

-- Keep uncertain failures reserved, including a manual retry's earlier attempt.
-- Release only paths known not to have sent; successful sends count from completion.
CREATE FUNCTION private.finish_email_campaign_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
	IF OLD.status = 'sending' AND NEW.status IN ('queued', 'skipped', 'sent') THEN
		PERFORM pg_advisory_xact_lock(173402, 1);
		IF NEW.status = 'sent' THEN
			INSERT INTO private.email_campaign_send_reservations (recipient_id, attempt_count, sent_at)
			VALUES (NEW.id, NEW.attempt_count, coalesce(NEW.sent_at, clock_timestamp()))
			ON CONFLICT (recipient_id, attempt_count) DO UPDATE SET sent_at = EXCLUDED.sent_at;
		ELSE
			DELETE FROM private.email_campaign_send_reservations
			WHERE recipient_id = NEW.id AND attempt_count = NEW.attempt_count;
		END IF;
	END IF;
	RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.finish_email_campaign_reservation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER finish_email_campaign_reservation
	AFTER UPDATE OF status ON public.email_campaign_recipients
	FOR EACH ROW EXECUTE FUNCTION private.finish_email_campaign_reservation();

COMMENT ON TABLE private.email_campaign_send_reservations IS
	'Rolling campaign budget per attempt. Uncertain outcomes retain their allowance for 24h; no personal content. Pruned on claims.';
COMMIT;
