-- supabase/migrations/20260428000018_cleanup_legacy_context_document_column.sql
-- Purpose: Retire legacy onto_projects.context_document_id in favor of canonical
--          project -> has_context_document -> document edges, while preserving
--          document tree visibility in onto_projects.doc_structure.

CREATE OR REPLACE FUNCTION public._doc_structure_contains_document(
	p_structure jsonb,
	p_doc_id uuid
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT jsonb_path_exists(
		COALESCE(p_structure, '{"version": 1, "root": []}'::jsonb),
		'$.root.** ? (@.id == $doc_id)',
		jsonb_build_object('doc_id', to_jsonb(p_doc_id::text))
	);
$$;

CREATE OR REPLACE FUNCTION public._doc_structure_append_root_document(
	p_structure jsonb,
	p_doc_id uuid,
	p_title text,
	p_description text
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
	WITH normalized AS (
		SELECT CASE
			WHEN jsonb_typeof(COALESCE(p_structure, '{"version": 1, "root": []}'::jsonb)) = 'object'
				THEN COALESCE(p_structure, '{"version": 1, "root": []}'::jsonb)
			ELSE '{"version": 1, "root": []}'::jsonb
		END AS structure
	),
	root_nodes AS (
		SELECT
			structure,
			CASE
				WHEN jsonb_typeof(structure->'root') = 'array' THEN structure->'root'
				ELSE '[]'::jsonb
			END AS root
		FROM normalized
	)
	SELECT jsonb_set(
		root_nodes.structure,
		'{root}',
		root_nodes.root || jsonb_build_array(
			jsonb_strip_nulls(
				jsonb_build_object(
					'id', p_doc_id,
					'type', 'doc',
					'order', jsonb_array_length(root_nodes.root),
					'title', p_title,
					'description', p_description
				)
			)
		),
		true
	)
	FROM root_nodes;
$$;

DO $$
DECLARE
	has_context_document_column boolean;
	has_doc_structure_column boolean;
BEGIN
	SELECT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'onto_projects'
			AND column_name = 'context_document_id'
	) INTO has_context_document_column;

	SELECT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'onto_projects'
			AND column_name = 'doc_structure'
	) INTO has_doc_structure_column;

	-- Active loaders expect at most one canonical context document edge per project.
	WITH ranked_context_edges AS (
		SELECT
			e.id,
			ROW_NUMBER() OVER (
				PARTITION BY e.src_id
				ORDER BY
					CASE
						WHEN e.props->'is_primary' = 'true'::jsonb THEN 0
						ELSE 1
					END,
					e.created_at,
					e.id
			) AS rn
		FROM onto_edges e
		WHERE e.src_kind = 'project'
			AND e.dst_kind = 'document'
			AND e.rel = 'has_context_document'
	)
	DELETE FROM onto_edges e
	USING ranked_context_edges ranked
	WHERE e.id = ranked.id
		AND ranked.rn > 1;

	IF has_context_document_column THEN
		INSERT INTO onto_edges (
			project_id,
			src_kind,
			src_id,
			rel,
			dst_kind,
			dst_id,
			props
		)
		SELECT
			p.id,
			'project',
			p.id,
			'has_context_document',
			'document',
			d.id,
			jsonb_build_object('migrated_from', 'onto_projects.context_document_id')
		FROM onto_projects p
		JOIN onto_documents d
			ON d.id = p.context_document_id
			AND d.project_id = p.id
			AND d.deleted_at IS NULL
		LEFT JOIN LATERAL (
			SELECT e.id
			FROM onto_edges e
			WHERE e.src_kind = 'project'
				AND e.src_id = p.id
				AND e.dst_kind = 'document'
				AND e.rel = 'has_context_document'
			LIMIT 1
		) existing ON true
		WHERE p.context_document_id IS NOT NULL
			AND existing.id IS NULL;
	END IF;

	IF has_doc_structure_column THEN
		IF has_context_document_column THEN
			WITH canonical_context_docs AS (
				SELECT
					p.id AS project_id,
					COALESCE(
						(
							SELECT e.dst_id
							FROM onto_edges e
							WHERE e.src_kind = 'project'
								AND e.src_id = p.id
								AND e.dst_kind = 'document'
								AND e.rel = 'has_context_document'
							ORDER BY
								CASE
									WHEN e.props->'is_primary' = 'true'::jsonb THEN 0
									ELSE 1
								END,
								e.created_at,
								e.id
							LIMIT 1
						),
						p.context_document_id
					) AS document_id
				FROM onto_projects p
				WHERE p.context_document_id IS NOT NULL
					OR EXISTS (
						SELECT 1
						FROM onto_edges e
						WHERE e.src_kind = 'project'
							AND e.src_id = p.id
							AND e.dst_kind = 'document'
							AND e.rel = 'has_context_document'
					)
			)
			UPDATE onto_projects p
			SET doc_structure = public._doc_structure_append_root_document(
				p.doc_structure,
				d.id,
				d.title,
				d.description
			)
			FROM canonical_context_docs c
			JOIN onto_documents d
				ON d.id = c.document_id
				AND d.project_id = c.project_id
				AND d.deleted_at IS NULL
			WHERE p.id = c.project_id
				AND c.document_id IS NOT NULL
				AND NOT public._doc_structure_contains_document(p.doc_structure, d.id);
		ELSE
			WITH canonical_context_docs AS (
				SELECT
					p.id AS project_id,
					(
						SELECT e.dst_id
						FROM onto_edges e
						WHERE e.src_kind = 'project'
							AND e.src_id = p.id
							AND e.dst_kind = 'document'
							AND e.rel = 'has_context_document'
						ORDER BY
							CASE
								WHEN e.props->'is_primary' = 'true'::jsonb THEN 0
								ELSE 1
							END,
							e.created_at,
							e.id
						LIMIT 1
					) AS document_id
				FROM onto_projects p
				WHERE EXISTS (
					SELECT 1
					FROM onto_edges e
					WHERE e.src_kind = 'project'
						AND e.src_id = p.id
						AND e.dst_kind = 'document'
						AND e.rel = 'has_context_document'
				)
			)
			UPDATE onto_projects p
			SET doc_structure = public._doc_structure_append_root_document(
				p.doc_structure,
				d.id,
				d.title,
				d.description
			)
			FROM canonical_context_docs c
			JOIN onto_documents d
				ON d.id = c.document_id
				AND d.project_id = c.project_id
				AND d.deleted_at IS NULL
			WHERE p.id = c.project_id
				AND c.document_id IS NOT NULL
				AND NOT public._doc_structure_contains_document(p.doc_structure, d.id);
		END IF;
	END IF;

	IF has_context_document_column THEN
		ALTER TABLE onto_projects
			DROP CONSTRAINT IF EXISTS fk_context_document;

		ALTER TABLE onto_projects
			DROP COLUMN IF EXISTS context_document_id;
	END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_onto_edges_unique_project_context_document
	ON onto_edges (src_id)
	WHERE src_kind = 'project'
		AND dst_kind = 'document'
		AND rel = 'has_context_document';

DROP FUNCTION IF EXISTS public._doc_structure_append_root_document(jsonb, uuid, text, text);
DROP FUNCTION IF EXISTS public._doc_structure_contains_document(jsonb, uuid);
