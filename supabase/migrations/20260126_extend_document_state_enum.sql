-- supabase/migrations/20260126_extend_document_state_enum.sql
-- Extend document_state enum to align with task-document workspace spec

DO $$
BEGIN
  ALTER TYPE document_state ADD VALUE IF NOT EXISTS 'in_review';
  ALTER TYPE document_state ADD VALUE IF NOT EXISTS 'ready';
  ALTER TYPE document_state ADD VALUE IF NOT EXISTS 'archived';
END$$;

COMMENT ON TYPE document_state IS
  'Valid states for documents: draft → in_review → ready → published → archived (legacy: review)';
