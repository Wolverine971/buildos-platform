-- supabase/tests/remove_legacy_chat_session_context_caches.check.sql
-- Rehearsal-only regression: evict old context without changing chat activity or other state.
INSERT INTO auth.users (id, email)
VALUES ('acac0000-0000-4000-8000-000000000001', 'context-cache-cleanup@example.test');
INSERT INTO public.users (id, email)
VALUES ('acac0000-0000-4000-8000-000000000001', 'context-cache-cleanup@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.chat_sessions (id, user_id, context_type, updated_at, last_message_at, agent_metadata)
VALUES (
  'acac0000-0000-4000-8000-000000000002',
  'acac0000-0000-4000-8000-000000000001',
  'global', '2026-01-01T00:00:00Z', '2025-12-31T00:00:00Z',
  '{"focus":{"focusType":"project-wide"},"pending_change":{"id":"keep"},"fastchat_context_cache":{"context":{"data":"discard"}}}'::jsonb
);

\ir ../migrations/20261019161423_remove_legacy_chat_session_context_caches.sql

DO $$
DECLARE
  v_session public.chat_sessions%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_session FROM public.chat_sessions
  WHERE id = 'acac0000-0000-4000-8000-000000000002';
  IF v_session.updated_at <> '2026-01-01T00:00:00Z'::timestamptz
    OR v_session.last_message_at <> '2025-12-31T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'Cache eviction changed chat activity';
  END IF;
  IF v_session.agent_metadata IS DISTINCT FROM
    '{"focus":{"focusType":"project-wide"},"pending_change":{"id":"keep"}}'::jsonb THEN
    RAISE EXCEPTION 'Cache eviction lost other metadata or retained the cache';
  END IF;
END;
$$;
