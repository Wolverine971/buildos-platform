-- packages/shared-types/src/functions/upsert_legacy_entity_mapping.sql
-- upsert_legacy_entity_mapping(uuid, uuid, text, uuid)
-- Upsert legacy entity mapping
-- Source: supabase/migrations/20251122_legacy_mapping_backfill.sql

CREATE OR REPLACE FUNCTION upsert_legacy_entity_mapping(
  p_user_id uuid,
  p_legacy_id uuid,
  p_legacy_type text,
  p_onto_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO legacy_entity_mappings (user_id, legacy_id, legacy_type, onto_id)
  VALUES (p_user_id, p_legacy_id, p_legacy_type, p_onto_id)
  ON CONFLICT (user_id, legacy_id, legacy_type)
  DO UPDATE SET onto_id = EXCLUDED.onto_id, updated_at = NOW();
END;
$$;
