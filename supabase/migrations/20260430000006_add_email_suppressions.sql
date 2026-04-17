-- supabase/migrations/20260430000006_add_email_suppressions.sql
--
-- Phase 1 of the welcome email sequence system: lifecycle compliance floor.
--
-- See: docs/specs/buildos-welcome-email-sequence-system.md §5.5 and §12.
--
-- This table is the durable opt-out / suppression record for lifecycle and
-- marketing emails. It is required to:
--
--   1. Satisfy Gmail/Yahoo bulk-sender policy (Feb 2024): every lifecycle
--      email must ship with `List-Unsubscribe: One-Click` and every click
--      must be honored immediately and durably.
--   2. Give the send path a single, cheap check ("is this email suppressed?")
--      at send time, not enrollment time, so users who unsubscribe mid-sequence
--      stop receiving emails immediately.
--   3. Record hard bounces and spam complaints so we stop mailing bad
--      addresses — eventually driven by provider webhooks (Phase 6).
--
-- Design notes:
--
--   - `email` is normalized lowercase + trimmed, enforced by CHECK. Callers
--     MUST normalize or use the `upsert_email_suppression` RPC below which
--     normalizes for them.
--   - `email` is globally unique. If a user unsubscribes from `marketing`
--     and later from `lifecycle` (or vice versa), the scope escalates to
--     `all` via the upsert helper. One row per email, scope tells you what
--     is suppressed.
--   - Service role writes; no RLS read/write for anon or authenticated users.
--     Suppression state is admin-only data. If the admin UI needs to surface
--     this, it goes through a server-only admin endpoint.

BEGIN;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_suppressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    scope TEXT NOT NULL CHECK (scope IN ('lifecycle', 'marketing', 'all')),
    reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'hard_bounce', 'manual', 'complaint')),
    source TEXT NOT NULL CHECK (source IN ('email_link', 'admin', 'provider_webhook', 'list_header')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT email_suppressions_email_normalized CHECK (email = lower(trim(email)))
);

CREATE INDEX IF NOT EXISTS idx_email_suppressions_scope
    ON public.email_suppressions(scope);

CREATE INDEX IF NOT EXISTS idx_email_suppressions_reason
    ON public.email_suppressions(reason);

-- Reuse the shared updated_at trigger used across the schema.
DROP TRIGGER IF EXISTS trg_email_suppressions_updated_at
    ON public.email_suppressions;

CREATE TRIGGER trg_email_suppressions_updated_at
    BEFORE UPDATE ON public.email_suppressions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.email_suppressions IS
    'Durable lifecycle/marketing opt-out record. Checked at send time. Required for Gmail/Yahoo bulk-sender compliance and legal opt-out.';

COMMENT ON COLUMN public.email_suppressions.email IS
    'Normalized lowercase + trimmed email. Enforced by CHECK constraint. Callers should use upsert_email_suppression() to avoid violations.';

COMMENT ON COLUMN public.email_suppressions.scope IS
    'lifecycle | marketing | all. lifecycle = welcome/onboarding/activation. marketing = broadcasts. all = everything non-transactional.';

COMMENT ON COLUMN public.email_suppressions.reason IS
    'unsubscribe = user-initiated. hard_bounce = provider says address is dead. manual = admin added. complaint = spam complaint from provider webhook.';

COMMENT ON COLUMN public.email_suppressions.source IS
    'Where the suppression was recorded. email_link = one-click unsubscribe. admin = manual entry. provider_webhook = ESP callback. list_header = List-Unsubscribe header click (RFC 8058).';

-- ---------------------------------------------------------------------------
-- RLS — service role only. No direct user access.
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

-- Deny all by default. Service role bypasses RLS automatically.
-- Admin UI must route reads through a server endpoint, not direct Supabase
-- client queries, so no SELECT policy for authenticated users is needed.

-- ---------------------------------------------------------------------------
-- Upsert RPC — idempotent, handles scope escalation.
-- ---------------------------------------------------------------------------
--
-- Callers (unsubscribe endpoint, admin action, provider webhook, list-header
-- handler) invoke this instead of writing rows directly.
--
-- Behavior:
--   - New email: inserts with the given scope/reason/source.
--   - Existing email with same scope: updates reason/source/metadata but not
--     scope (already covered).
--   - Existing email with different scope: escalates to 'all'. Two distinct
--     scopes mean the user effectively opted out of everything non-transactional.
--   - Existing email with scope='all': no-op on scope; updates reason/source
--     to the more recent signal.
--
-- Metadata is merged: new keys overwrite, existing keys are preserved where
-- the new payload omits them. This keeps historical context (e.g. which
-- welcome_sequence enrollment triggered the unsubscribe).

CREATE OR REPLACE FUNCTION public.upsert_email_suppression(
    p_email TEXT,
    p_scope TEXT,
    p_reason TEXT,
    p_source TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
    v_existing_id UUID;
    v_existing_scope TEXT;
    v_existing_metadata JSONB;
    v_new_scope TEXT;
BEGIN
    IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
        RAISE EXCEPTION 'email must not be empty';
    END IF;

    v_email := lower(trim(p_email));

    IF p_scope NOT IN ('lifecycle', 'marketing', 'all') THEN
        RAISE EXCEPTION 'scope must be lifecycle, marketing, or all; got %', p_scope;
    END IF;

    IF p_reason NOT IN ('unsubscribe', 'hard_bounce', 'manual', 'complaint') THEN
        RAISE EXCEPTION 'reason must be unsubscribe, hard_bounce, manual, or complaint; got %', p_reason;
    END IF;

    IF p_source NOT IN ('email_link', 'admin', 'provider_webhook', 'list_header') THEN
        RAISE EXCEPTION 'source must be email_link, admin, provider_webhook, or list_header; got %', p_source;
    END IF;

    SELECT id, scope, metadata
      INTO v_existing_id, v_existing_scope, v_existing_metadata
      FROM public.email_suppressions
     WHERE email = v_email;

    IF v_existing_id IS NULL THEN
        INSERT INTO public.email_suppressions (email, scope, reason, source, metadata)
        VALUES (v_email, p_scope, p_reason, p_source, COALESCE(p_metadata, '{}'::jsonb))
        RETURNING id INTO v_existing_id;

        RETURN v_existing_id;
    END IF;

    v_new_scope := CASE
        WHEN v_existing_scope = 'all' THEN 'all'
        WHEN p_scope = 'all' THEN 'all'
        WHEN v_existing_scope = p_scope THEN v_existing_scope
        ELSE 'all'
    END;

    UPDATE public.email_suppressions
       SET scope = v_new_scope,
           reason = p_reason,
           source = p_source,
           metadata = COALESCE(v_existing_metadata, '{}'::jsonb)
                    || COALESCE(p_metadata, '{}'::jsonb),
           updated_at = NOW()
     WHERE id = v_existing_id;

    RETURN v_existing_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_email_suppression IS
    'Idempotent suppression write. Normalizes email, validates enums, escalates scope on conflict, merges metadata. Use this instead of direct INSERT/UPDATE.';

GRANT EXECUTE ON FUNCTION public.upsert_email_suppression(TEXT, TEXT, TEXT, TEXT, JSONB)
    TO service_role;

-- ---------------------------------------------------------------------------
-- Read helper — cheap send-time suppression check.
-- ---------------------------------------------------------------------------
--
-- Returns TRUE if the email is suppressed for the given scope. Lifecycle send
-- paths call this with p_scope = 'lifecycle'; marketing paths with 'marketing'.
-- A row with scope='all' suppresses every scope.

CREATE OR REPLACE FUNCTION public.is_email_suppressed(
    p_email TEXT,
    p_scope TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.email_suppressions
         WHERE email = lower(trim(p_email))
           AND (scope = p_scope OR scope = 'all')
    );
$$;

COMMENT ON FUNCTION public.is_email_suppressed IS
    'Returns TRUE if the email is suppressed for the given scope. Checks scope= p_scope OR scope=''all''. Call at send time, not enrollment time.';

GRANT EXECUTE ON FUNCTION public.is_email_suppressed(TEXT, TEXT)
    TO service_role;

COMMIT;
