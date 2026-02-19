-- supabase/migrations/20260426000000_add_ontology_assets_with_ocr.sql
-- Ontology image assets with OCR extraction support.

DO $$ BEGIN
	ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'extract_onto_asset_ocr';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS onto_assets (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id UUID NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
	kind TEXT NOT NULL DEFAULT 'image',
	storage_bucket TEXT NOT NULL DEFAULT 'onto-assets',
	storage_path TEXT NOT NULL,
	original_filename TEXT,
	content_type TEXT NOT NULL,
	file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
	checksum_sha256 TEXT,
	width INTEGER,
	height INTEGER,
	alt_text TEXT,
	caption TEXT,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	ocr_status TEXT NOT NULL DEFAULT 'pending'
		CHECK (ocr_status IN ('pending', 'processing', 'complete', 'failed', 'skipped')),
	ocr_error TEXT,
	ocr_model TEXT,
	ocr_version INTEGER NOT NULL DEFAULT 1 CHECK (ocr_version >= 1),
	ocr_started_at TIMESTAMPTZ,
	ocr_completed_at TIMESTAMPTZ,
	extracted_text TEXT,
	extracted_text_source TEXT NOT NULL DEFAULT 'ocr'
		CHECK (extracted_text_source IN ('ocr', 'manual')),
	extracted_text_updated_at TIMESTAMPTZ,
	extracted_text_updated_by UUID REFERENCES onto_actors(id),
	extraction_summary TEXT,
	extraction_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	search_vector tsvector,
	created_by UUID NOT NULL REFERENCES onto_actors(id),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS onto_asset_links (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id UUID NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
	asset_id UUID NOT NULL REFERENCES onto_assets(id) ON DELETE CASCADE,
	entity_kind TEXT NOT NULL
		CHECK (entity_kind IN ('project', 'task', 'document', 'plan', 'goal', 'risk', 'milestone')),
	entity_id UUID NOT NULL,
	role TEXT NOT NULL DEFAULT 'attachment'
		CHECK (role IN ('attachment', 'inline', 'gallery', 'cover')),
	props JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_by UUID NOT NULL REFERENCES onto_actors(id),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (asset_id, entity_kind, entity_id, role)
);

CREATE INDEX IF NOT EXISTS idx_onto_assets_project
	ON onto_assets(project_id);

CREATE INDEX IF NOT EXISTS idx_onto_assets_deleted
	ON onto_assets(deleted_at)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_assets_ocr_status
	ON onto_assets(ocr_status);

CREATE INDEX IF NOT EXISTS idx_onto_assets_search_vector
	ON onto_assets USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_onto_asset_links_entity
	ON onto_asset_links(entity_kind, entity_id);

CREATE INDEX IF NOT EXISTS idx_onto_asset_links_asset
	ON onto_asset_links(asset_id);

CREATE INDEX IF NOT EXISTS idx_onto_asset_links_project
	ON onto_asset_links(project_id);

CREATE OR REPLACE FUNCTION public.set_onto_assets_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.search_vector := to_tsvector(
		'english',
		concat_ws(
			' ',
			coalesce(NEW.alt_text, ''),
			coalesce(NEW.caption, ''),
			coalesce(NEW.extraction_summary, ''),
			coalesce(NEW.extracted_text, '')
		)
	);
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onto_assets_search_vector ON onto_assets;
CREATE TRIGGER trg_onto_assets_search_vector
	BEFORE INSERT OR UPDATE OF alt_text, caption, extraction_summary, extracted_text
	ON onto_assets
	FOR EACH ROW
	EXECUTE FUNCTION public.set_onto_assets_search_vector();

DROP TRIGGER IF EXISTS trg_onto_assets_updated_at ON onto_assets;
CREATE TRIGGER trg_onto_assets_updated_at
	BEFORE UPDATE ON onto_assets
	FOR EACH ROW
	EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_onto_asset_link_project_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	v_asset_project_id UUID;
BEGIN
	SELECT project_id INTO v_asset_project_id
	FROM onto_assets
	WHERE id = NEW.asset_id;

	IF v_asset_project_id IS NULL THEN
		RAISE EXCEPTION 'Asset % not found', NEW.asset_id;
	END IF;

	IF v_asset_project_id <> NEW.project_id THEN
		RAISE EXCEPTION 'Asset project mismatch: asset project % does not match link project %',
			v_asset_project_id, NEW.project_id;
	END IF;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_onto_asset_link_project_match ON onto_asset_links;
CREATE TRIGGER trg_validate_onto_asset_link_project_match
	BEFORE INSERT OR UPDATE OF asset_id, project_id
	ON onto_asset_links
	FOR EACH ROW
	EXECUTE FUNCTION public.validate_onto_asset_link_project_match();

ALTER TABLE onto_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE onto_asset_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onto_assets_select_read ON onto_assets;
CREATE POLICY onto_assets_select_read
	ON onto_assets FOR SELECT
	USING (current_actor_has_project_access(project_id, 'read'));

DROP POLICY IF EXISTS onto_assets_insert_write ON onto_assets;
CREATE POLICY onto_assets_insert_write
	ON onto_assets FOR INSERT
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS onto_assets_update_write ON onto_assets;
CREATE POLICY onto_assets_update_write
	ON onto_assets FOR UPDATE
	USING (current_actor_has_project_access(project_id, 'write'))
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS onto_assets_delete_write ON onto_assets;
CREATE POLICY onto_assets_delete_write
	ON onto_assets FOR DELETE
	USING (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS onto_asset_links_select_read ON onto_asset_links;
CREATE POLICY onto_asset_links_select_read
	ON onto_asset_links FOR SELECT
	USING (current_actor_has_project_access(project_id, 'read'));

DROP POLICY IF EXISTS onto_asset_links_insert_write ON onto_asset_links;
CREATE POLICY onto_asset_links_insert_write
	ON onto_asset_links FOR INSERT
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS onto_asset_links_update_write ON onto_asset_links;
CREATE POLICY onto_asset_links_update_write
	ON onto_asset_links FOR UPDATE
	USING (current_actor_has_project_access(project_id, 'write'))
	WITH CHECK (current_actor_has_project_access(project_id, 'write'));

DROP POLICY IF EXISTS onto_asset_links_delete_write ON onto_asset_links;
CREATE POLICY onto_asset_links_delete_write
	ON onto_asset_links FOR DELETE
	USING (current_actor_has_project_access(project_id, 'write'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('onto-assets', 'onto-assets', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS onto_assets_storage_upload ON storage.objects;
CREATE POLICY onto_assets_storage_upload
	ON storage.objects
	FOR INSERT
	WITH CHECK (
		bucket_id = 'onto-assets'
		AND auth.role() = 'authenticated'
		AND (storage.foldername(name))[1] = 'projects'
		AND EXISTS (
			SELECT 1
			FROM onto_projects p
			WHERE p.id::text = (storage.foldername(name))[2]
				AND current_actor_has_project_access(p.id, 'write')
		)
	);

DROP POLICY IF EXISTS onto_assets_storage_read ON storage.objects;
CREATE POLICY onto_assets_storage_read
	ON storage.objects
	FOR SELECT
	USING (
		bucket_id = 'onto-assets'
		AND auth.role() = 'authenticated'
		AND (storage.foldername(name))[1] = 'projects'
		AND EXISTS (
			SELECT 1
			FROM onto_projects p
			WHERE p.id::text = (storage.foldername(name))[2]
				AND current_actor_has_project_access(p.id, 'read')
		)
	);

DROP POLICY IF EXISTS onto_assets_storage_delete ON storage.objects;
CREATE POLICY onto_assets_storage_delete
	ON storage.objects
	FOR DELETE
	USING (
		bucket_id = 'onto-assets'
		AND auth.role() = 'authenticated'
		AND (storage.foldername(name))[1] = 'projects'
		AND EXISTS (
			SELECT 1
			FROM onto_projects p
			WHERE p.id::text = (storage.foldername(name))[2]
				AND current_actor_has_project_access(p.id, 'write')
		)
	);

CREATE OR REPLACE FUNCTION get_project_skeleton(
	p_project_id uuid,
	p_actor_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
	SELECT jsonb_build_object(
		'id', p.id,
		'name', p.name,
		'description', p.description,
		'icon_svg', p.icon_svg,
		'icon_concept', p.icon_concept,
		'icon_generated_at', p.icon_generated_at,
		'icon_generation_source', p.icon_generation_source,
		'icon_generation_prompt', p.icon_generation_prompt,
		'state_key', p.state_key,
		'type_key', p.type_key,
		'next_step_short', p.next_step_short,
		'next_step_long', p.next_step_long,
		'next_step_source', p.next_step_source,
		'next_step_updated_at', p.next_step_updated_at,
		'created_at', p.created_at,
		'updated_at', p.updated_at,
		'task_count', (SELECT count(*) FROM onto_tasks WHERE project_id = p.id AND deleted_at IS NULL),
		'document_count', (SELECT count(*) FROM onto_documents WHERE project_id = p.id AND deleted_at IS NULL),
		'goal_count', (SELECT count(*) FROM onto_goals WHERE project_id = p.id AND deleted_at IS NULL),
		'plan_count', (SELECT count(*) FROM onto_plans WHERE project_id = p.id AND deleted_at IS NULL),
		'milestone_count', (SELECT count(*) FROM onto_milestones WHERE project_id = p.id AND deleted_at IS NULL),
		'risk_count', (SELECT count(*) FROM onto_risks WHERE project_id = p.id AND deleted_at IS NULL),
		'decision_count', (SELECT count(*) FROM onto_decisions WHERE project_id = p.id AND deleted_at IS NULL),
		'image_count', (SELECT count(*) FROM onto_assets WHERE project_id = p.id AND deleted_at IS NULL)
	)
	FROM onto_projects p
	WHERE p.id = p_project_id
		AND p.deleted_at IS NULL
		AND current_actor_has_project_access(p.id, 'read');
$$;

GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO anon;

CREATE OR REPLACE FUNCTION get_project_full(
	p_project_id uuid,
	p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
	v_project jsonb;
	v_result jsonb;
BEGIN
	IF NOT current_actor_has_project_access(p_project_id, 'read') THEN
		RETURN NULL;
	END IF;

	SELECT to_jsonb(p.*)
	INTO v_project
	FROM onto_projects p
	WHERE p.id = p_project_id
		AND p.deleted_at IS NULL;

	IF v_project IS NULL THEN
		RETURN NULL;
	END IF;

	SELECT jsonb_build_object(
		'project', v_project,
		'goals', COALESCE((
			SELECT jsonb_agg(to_jsonb(g.*) ORDER BY g.created_at)
			FROM onto_goals g
			WHERE g.project_id = p_project_id
				AND g.deleted_at IS NULL
		), '[]'::jsonb),
		'requirements', COALESCE((
			SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at)
			FROM onto_requirements r
			WHERE r.project_id = p_project_id
				AND r.deleted_at IS NULL
		), '[]'::jsonb),
		'plans', COALESCE((
			SELECT jsonb_agg(to_jsonb(pl.*) ORDER BY pl.created_at)
			FROM onto_plans pl
			WHERE pl.project_id = p_project_id
				AND pl.deleted_at IS NULL
		), '[]'::jsonb),
		'tasks', COALESCE((
			SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.created_at)
			FROM onto_tasks t
			WHERE t.project_id = p_project_id
				AND t.deleted_at IS NULL
		), '[]'::jsonb),
		'outputs', COALESCE((
			SELECT jsonb_agg(to_jsonb(o.*) ORDER BY o.created_at)
			FROM onto_outputs o
			WHERE o.project_id = p_project_id
				AND o.deleted_at IS NULL
		), '[]'::jsonb),
		'documents', COALESCE((
			SELECT jsonb_agg(to_jsonb(d.*) ORDER BY d.created_at)
			FROM onto_documents d
			WHERE d.project_id = p_project_id
				AND d.deleted_at IS NULL
		), '[]'::jsonb),
		'images', COALESCE((
			SELECT jsonb_agg(to_jsonb(a.*) ORDER BY a.created_at DESC)
			FROM onto_assets a
			WHERE a.project_id = p_project_id
				AND a.deleted_at IS NULL
		), '[]'::jsonb),
		'sources', COALESCE((
			SELECT jsonb_agg(to_jsonb(s.*) ORDER BY s.created_at)
			FROM onto_sources s
			WHERE s.project_id = p_project_id
		), '[]'::jsonb),
		'milestones', COALESCE((
			SELECT jsonb_agg(to_jsonb(m.*) ORDER BY m.due_at)
			FROM onto_milestones m
			WHERE m.project_id = p_project_id
				AND m.deleted_at IS NULL
		), '[]'::jsonb),
		'risks', COALESCE((
			SELECT jsonb_agg(to_jsonb(rk.*) ORDER BY rk.created_at)
			FROM onto_risks rk
			WHERE rk.project_id = p_project_id
				AND rk.deleted_at IS NULL
		), '[]'::jsonb),
		'decisions', COALESCE((
			SELECT jsonb_agg(to_jsonb(dc.*) ORDER BY dc.decision_at)
			FROM onto_decisions dc
			WHERE dc.project_id = p_project_id
				AND dc.deleted_at IS NULL
		), '[]'::jsonb),
		'metrics', COALESCE((
			SELECT jsonb_agg(to_jsonb(mt.*) ORDER BY mt.created_at)
			FROM onto_metrics mt
			WHERE mt.project_id = p_project_id
		), '[]'::jsonb),
		'context_document', (
			SELECT to_jsonb(d.*)
			FROM onto_edges e
			JOIN onto_documents d ON d.id = e.dst_id
			WHERE e.src_kind = 'project'
				AND e.src_id = p_project_id
				AND e.rel = 'has_context_document'
				AND e.dst_kind = 'document'
				AND d.deleted_at IS NULL
			LIMIT 1
		)
	)
	INTO v_result;

	RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_project_full(uuid, uuid) TO anon;
