-- supabase/migrations/20260723040000_chat_message_idempotency.sql
-- 2026-07-23 queue audit P1: DB-enforced chat message idempotency.
--
-- persistMessage implemented idempotency as check-then-insert against a JSON
-- metadata key with no unique constraint — two concurrent calls (or a lookup
-- that errored and degraded open) could both insert. The agent-run completion
-- injection had the same gap. This index makes the database authoritative;
-- writers treat 23505 as "already delivered" and return the existing row.

-- Dedupe existing duplicates first (keep the earliest row per key).
DELETE FROM chat_messages cm
WHERE cm.metadata->>'idempotency_key' IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM chat_messages keeper
    WHERE keeper.session_id = cm.session_id
      AND keeper.metadata->>'idempotency_key' = cm.metadata->>'idempotency_key'
      AND (
        keeper.created_at < cm.created_at
        OR (keeper.created_at = cm.created_at AND keeper.id < cm.id)
      )
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_session_idempotency_key
  ON chat_messages (session_id, (metadata->>'idempotency_key'))
  WHERE metadata->>'idempotency_key' IS NOT NULL;

COMMENT ON INDEX uq_chat_messages_session_idempotency_key IS
  'One chat message per (session, idempotency_key). Backs persistMessage and agent-run completion injection idempotency (2026-07-23 queue audit).';
