-- supabase/migrations/20251121_ontology_calendar_foundation.sql
-- Migration: Ontology calendar foundation tables
-- Description: Adds legacy mapping registry plus onto_events and onto_event_sync tables
-- Author: Codex (Agent)
-- Date: 2025-11-21

-- ============================================================================
-- PART 1: Legacy entity mappings table
-- ============================================================================

CREATE TABLE IF NOT EXISTS legacy_entity_mappings (
	id BIGSERIAL PRIMARY KEY,
	legacy_table TEXT NOT NULL,
	legacy_id UUID NOT NULL,
	onto_table TEXT NOT NULL,
	onto_id UUID NOT NULL,
	migrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	checksum TEXT,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	UNIQUE (legacy_table, legacy_id),
	UNIQUE (onto_table, onto_id)
);

CREATE INDEX IF NOT EXISTS idx_legacy_entity_mappings_legacy
	ON legacy_entity_mappings (legacy_table, legacy_id);

CREATE INDEX IF NOT EXISTS idx_legacy_entity_mappings_onto
	ON legacy_entity_mappings (onto_table, onto_id);

-- ============================================================================
-- PART 2: Core onto_events table
-- ============================================================================

CREATE TABLE IF NOT EXISTS onto_events (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	org_id UUID,
	project_id UUID REFERENCES onto_projects(id) ON DELETE CASCADE,
	owner_entity_type TEXT NOT NULL CHECK (
		owner_entity_type IN ('project', 'plan', 'task', 'goal', 'output', 'actor', 'standalone')
	),
	owner_entity_id UUID,
	type_key TEXT NOT NULL,
	state_key TEXT NOT NULL DEFAULT 'scheduled',
	template_id UUID REFERENCES onto_templates(id),
	template_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
	title TEXT NOT NULL,
	description TEXT,
	location TEXT,
	start_at TIMESTAMPTZ NOT NULL,
	end_at TIMESTAMPTZ,
	all_day BOOLEAN NOT NULL DEFAULT FALSE,
	timezone TEXT,
	recurrence JSONB NOT NULL DEFAULT '{}'::jsonb,
	external_link TEXT,
	props JSONB NOT NULL DEFAULT '{}'::jsonb,
	last_synced_at TIMESTAMPTZ,
	sync_status TEXT NOT NULL DEFAULT 'pending',
	sync_error TEXT,
	deleted_at TIMESTAMPTZ,
	facet_context TEXT GENERATED ALWAYS AS (props->'facets'->>'context') STORED,
	facet_scale TEXT GENERATED ALWAYS AS (props->'facets'->>'scale') STORED,
	facet_stage TEXT GENERATED ALWAYS AS (props->'facets'->>'stage') STORED,
	created_by UUID NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	CONSTRAINT owner_requires_id CHECK (
		(owner_entity_type = 'standalone' AND owner_entity_id IS NULL)
		OR (owner_entity_type <> 'standalone' AND owner_entity_id IS NOT NULL)
	),
	CONSTRAINT valid_time_range CHECK (
		all_day = TRUE OR end_at IS NULL OR end_at > start_at
	)
);

CREATE INDEX IF NOT EXISTS idx_onto_events_org ON onto_events (org_id);
CREATE INDEX IF NOT EXISTS idx_onto_events_project ON onto_events (project_id);
CREATE INDEX IF NOT EXISTS idx_onto_events_owner ON onto_events (owner_entity_type, owner_entity_id);
CREATE INDEX IF NOT EXISTS idx_onto_events_type_key ON onto_events (type_key);
CREATE INDEX IF NOT EXISTS idx_onto_events_state_key ON onto_events (state_key);
CREATE INDEX IF NOT EXISTS idx_onto_events_start_at ON onto_events (start_at);
CREATE INDEX IF NOT EXISTS idx_onto_events_facets ON onto_events USING GIN ((props->'facets'));
CREATE INDEX IF NOT EXISTS idx_onto_events_props_path ON onto_events USING GIN (props jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_onto_events_sync_status ON onto_events (sync_status);
CREATE INDEX IF NOT EXISTS idx_onto_events_active ON onto_events (deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_onto_events_updated
	BEFORE UPDATE ON onto_events
	FOR EACH ROW
	EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- PART 3: Event sync bridge table
-- ============================================================================

CREATE TABLE IF NOT EXISTS onto_event_sync (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	event_id UUID NOT NULL REFERENCES onto_events(id) ON DELETE CASCADE,
	calendar_id UUID NOT NULL REFERENCES project_calendars(id) ON DELETE CASCADE,
	provider TEXT NOT NULL DEFAULT 'google',
	external_event_id TEXT NOT NULL,
	sync_token TEXT,
	sync_status TEXT NOT NULL DEFAULT 'pending',
	sync_error TEXT,
	last_synced_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (calendar_id, provider, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_onto_event_sync_event ON onto_event_sync (event_id);
CREATE INDEX IF NOT EXISTS idx_onto_event_sync_calendar ON onto_event_sync (calendar_id);

CREATE TRIGGER trg_onto_event_sync_updated
	BEFORE UPDATE ON onto_event_sync
	FOR EACH ROW
	EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- PART 4: Project calendar linkage helper
-- ============================================================================

ALTER TABLE project_calendars
	ADD COLUMN IF NOT EXISTS onto_project_id UUID REFERENCES onto_projects(id);
