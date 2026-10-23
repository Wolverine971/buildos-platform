-- supabase/migrations/20261019161423_remove_legacy_chat_session_context_caches.sql
-- Deploy the prewarm change that stops session-cache writes before applying this cleanup.
-- Prepared prompts and the shared context snapshot cache remain in use.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- This is cache eviction, not user activity: deliberately preserve updated_at,
-- last_message_at, and every other metadata key. Do not use the metadata merge RPC.
UPDATE public.chat_sessions
SET agent_metadata = agent_metadata - 'fastchat_context_cache'
WHERE jsonb_typeof(agent_metadata) = 'object'
  AND agent_metadata ? 'fastchat_context_cache';

COMMIT;
