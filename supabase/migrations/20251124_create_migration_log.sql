-- supabase/migrations/20251124_create_migration_log.sql
-- Migration: Create migration_log table for ontology migrations
-- Description: Tracks project/task migration batches, progress, and errors
-- Author: Codex (Agent)
-- Date: 2025-11-24

CREATE TABLE IF NOT EXISTS migration_log (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL,
    batch_id TEXT,
    org_id UUID,
    entity_type TEXT NOT NULL,
    operation TEXT NOT NULL DEFAULT 'migrate',
    legacy_table TEXT,
    legacy_id UUID,
    onto_table TEXT,
    onto_id UUID,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_migration_log_run
    ON migration_log (run_id);

CREATE INDEX IF NOT EXISTS idx_migration_log_entity
    ON migration_log (entity_type, status);

CREATE INDEX IF NOT EXISTS idx_migration_log_legacy
    ON migration_log (legacy_table, legacy_id);

CREATE INDEX IF NOT EXISTS idx_migration_log_onto
    ON migration_log (onto_table, onto_id);

CREATE INDEX IF NOT EXISTS idx_migration_log_org
    ON migration_log (org_id);

CREATE TRIGGER trg_migration_log_updated
    BEFORE UPDATE ON migration_log
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
