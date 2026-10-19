-- Frozen, reviewed chat publications. Only server endpoints may write or read publicly.
BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE TABLE public.chat_session_shares (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9]{22}$'),
    session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title text NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
    show_author boolean NOT NULL DEFAULT true,
    -- Freeze the reviewed byline as well: changing a profile must not publish unreviewed text.
    author_name text NOT NULL DEFAULT 'BuildOS user' CHECK (length(author_name) BETWEEN 1 AND 200),
    included_message_ids uuid[] NOT NULL CHECK (cardinality(included_message_ids) BETWEEN 1 AND 100),
    snapshot jsonb NOT NULL CHECK (
        snapshot->>'version' = '1' AND jsonb_typeof(snapshot->'messages') = 'array'
    ),
    review jsonb,
    policy_version text NOT NULL,
    view_count integer NOT NULL DEFAULT 0 CHECK (view_count >= 0),
    last_viewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
);

CREATE UNIQUE INDEX chat_session_shares_one_live_session
    ON public.chat_session_shares (session_id) WHERE revoked_at IS NULL;
CREATE INDEX chat_session_shares_user_id_idx ON public.chat_session_shares (user_id);
-- The token UNIQUE constraint supplies its lookup index.
ALTER TABLE public.chat_session_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_session_shares FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.chat_session_shares TO authenticated;
GRANT ALL ON public.chat_session_shares TO service_role;
CREATE POLICY chat_session_shares_owner_read ON public.chat_session_shares
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

COMMIT;
