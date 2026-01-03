-- supabase/migrations/20260125_add_type_key_to_onto_decisions.sql
-- Add type_key to onto_decisions for LLM classification

ALTER TABLE onto_decisions
ADD COLUMN IF NOT EXISTS type_key TEXT;

UPDATE onto_decisions
SET type_key = 'decision.default'
WHERE type_key IS NULL;

ALTER TABLE onto_decisions
ALTER COLUMN type_key SET DEFAULT 'decision.default';

ALTER TABLE onto_decisions
ALTER COLUMN type_key SET NOT NULL;

COMMENT ON COLUMN onto_decisions.type_key IS 'Decision classification type key';
