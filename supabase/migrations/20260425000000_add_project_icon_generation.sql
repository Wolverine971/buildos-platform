-- supabase/migrations/20260425000000_add_project_icon_generation.sql
-- Add project icon generation schema, queue type, and access policies

DO $$ BEGIN
	ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'generate_project_icon';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE onto_projects
	ADD COLUMN IF NOT EXISTS icon_svg text,
	ADD COLUMN IF NOT EXISTS icon_concept text,
	ADD COLUMN IF NOT EXISTS icon_generated_at timestamptz,
	ADD COLUMN IF NOT EXISTS icon_generation_source text,
	ADD COLUMN IF NOT EXISTS icon_generation_prompt text;

CREATE TABLE IF NOT EXISTS onto_project_icon_generations (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
	requested_by uuid NOT NULL,
	trigger_source text NOT NULL CHECK (trigger_source IN ('auto', 'manual', 'regenerate')),
	steering_prompt text,
	candidate_count integer NOT NULL DEFAULT 4 CHECK (candidate_count >= 1 AND candidate_count <= 8),
	status text NOT NULL DEFAULT 'queued'
		CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
	selected_candidate_id uuid NULL,
	error_message text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_onto_project_icon_generations_project
	ON onto_project_icon_generations(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS onto_project_icon_candidates (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	generation_id uuid NOT NULL REFERENCES onto_project_icon_generations(id) ON DELETE CASCADE,
	project_id uuid NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
	candidate_index integer NOT NULL CHECK (candidate_index >= 0),
	concept text NOT NULL,
	svg_raw text NOT NULL,
	svg_sanitized text NOT NULL,
	svg_byte_size integer NOT NULL,
	llm_model text,
	created_at timestamptz NOT NULL DEFAULT now(),
	selected_at timestamptz NULL,
	UNIQUE (generation_id, candidate_index)
);

CREATE INDEX IF NOT EXISTS idx_onto_project_icon_candidates_generation
	ON onto_project_icon_candidates(generation_id, candidate_index);

DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'fk_onto_project_icon_generation_selected_candidate'
	) THEN
		ALTER TABLE onto_project_icon_generations
			ADD CONSTRAINT fk_onto_project_icon_generation_selected_candidate
			FOREIGN KEY (selected_candidate_id)
			REFERENCES onto_project_icon_candidates(id)
			ON DELETE SET NULL;
	END IF;
END $$;

DROP TRIGGER IF EXISTS trg_onto_project_icon_generations_updated_at
	ON onto_project_icon_generations;
CREATE TRIGGER trg_onto_project_icon_generations_updated_at
	BEFORE UPDATE ON onto_project_icon_generations
	FOR EACH ROW
	EXECUTE FUNCTION set_updated_at();

ALTER TABLE onto_project_icon_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE onto_project_icon_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_icon_generations_read ON onto_project_icon_generations;
CREATE POLICY project_icon_generations_read
	ON onto_project_icon_generations FOR SELECT
	USING (current_actor_has_project_access(project_id, 'read'));

DROP POLICY IF EXISTS project_icon_generations_insert ON onto_project_icon_generations;
CREATE POLICY project_icon_generations_insert
	ON onto_project_icon_generations FOR INSERT
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS project_icon_generations_update ON onto_project_icon_generations;
CREATE POLICY project_icon_generations_update
	ON onto_project_icon_generations FOR UPDATE
	USING (current_actor_has_project_access(project_id, 'write'))
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS project_icon_generations_delete ON onto_project_icon_generations;
CREATE POLICY project_icon_generations_delete
	ON onto_project_icon_generations FOR DELETE
	USING (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS project_icon_candidates_read ON onto_project_icon_candidates;
CREATE POLICY project_icon_candidates_read
	ON onto_project_icon_candidates FOR SELECT
	USING (current_actor_has_project_access(project_id, 'read'));

DROP POLICY IF EXISTS project_icon_candidates_insert ON onto_project_icon_candidates;
CREATE POLICY project_icon_candidates_insert
	ON onto_project_icon_candidates FOR INSERT
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS project_icon_candidates_update ON onto_project_icon_candidates;
CREATE POLICY project_icon_candidates_update
	ON onto_project_icon_candidates FOR UPDATE
	USING (current_actor_has_project_access(project_id, 'write'))
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS project_icon_candidates_delete ON onto_project_icon_candidates;
CREATE POLICY project_icon_candidates_delete
	ON onto_project_icon_candidates FOR DELETE
	USING (current_actor_has_project_access(project_id, 'write'));
