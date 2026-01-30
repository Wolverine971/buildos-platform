-- supabase/migrations/20260129000004_remove_document_edges.sql
-- Migration: Convert document containment edges to doc_structure, then remove edges
-- Purpose: Preserve document hierarchy while moving to doc_structure storage
-- Date: 2026-01-29

-- ============================================
-- 1) Build doc_structure from document->document has_part edges
--    - Choose a single parent per child (earliest edge)
--    - Order siblings by edge.created_at, then child_id
--    - Roots = docs with no incoming has_part edge
--    - If no roots (cycle), fall back to all docs as roots
--    - Only populate doc_structure when empty
-- ============================================

DROP TABLE IF EXISTS doc_parent_map;

CREATE TEMP TABLE doc_parent_map AS
WITH doc_edges AS (
	SELECT
		e.project_id,
		e.src_id AS parent_id,
		e.dst_id AS child_id,
		e.created_at,
		e.id
	FROM onto_edges e
	JOIN onto_documents dp ON dp.id = e.src_id AND dp.deleted_at IS NULL
	JOIN onto_documents dc ON dc.id = e.dst_id AND dc.deleted_at IS NULL
	WHERE e.src_kind = 'document'
	  AND e.dst_kind = 'document'
	  AND e.rel = 'has_part'
	  AND dp.project_id = e.project_id
	  AND dc.project_id = e.project_id
),
ranked_parent AS (
	SELECT
		*,
		ROW_NUMBER() OVER (PARTITION BY project_id, child_id ORDER BY created_at, id) AS parent_rank
	FROM doc_edges
),
chosen_parent AS (
	SELECT project_id, parent_id, child_id, created_at
	FROM ranked_parent
	WHERE parent_rank = 1
),
ordered_children AS (
	SELECT
		project_id,
		parent_id,
		child_id,
		ROW_NUMBER() OVER (PARTITION BY project_id, parent_id ORDER BY created_at, child_id) - 1 AS child_order
	FROM chosen_parent
)
SELECT * FROM ordered_children;

DROP FUNCTION IF EXISTS build_doc_node(uuid, uuid, uuid[]);

CREATE OR REPLACE FUNCTION build_doc_node(
	p_project_id uuid,
	p_doc_id uuid,
	p_visited uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
	child_nodes jsonb;
BEGIN
	IF p_doc_id = ANY(p_visited) THEN
		RETURN NULL;
	END IF;

	SELECT jsonb_agg(child.node ORDER BY child.child_order)
	INTO child_nodes
	FROM (
		SELECT
			m.child_order,
			(
				build_doc_node(p_project_id, m.child_id, array_append(p_visited, p_doc_id))
				|| jsonb_build_object('order', m.child_order)
			) AS node
		FROM doc_parent_map m
		WHERE m.project_id = p_project_id
		  AND m.parent_id = p_doc_id
	) child
	WHERE child.node IS NOT NULL;

	IF child_nodes IS NULL THEN
		RETURN jsonb_build_object('id', p_doc_id, 'order', 0);
	END IF;

	RETURN jsonb_build_object(
		'id', p_doc_id,
		'order', 0,
		'children', child_nodes
	);
END;
$$;

DO $$
DECLARE
	proj RECORD;
	root_ids uuid[];
	root_nodes jsonb;
BEGIN
	FOR proj IN SELECT id FROM onto_projects LOOP
		-- Roots = docs without incoming has_part edges
		SELECT array_agg(d.id ORDER BY d.created_at, d.id)
		INTO root_ids
		FROM onto_documents d
		WHERE d.project_id = proj.id
		  AND d.deleted_at IS NULL
		  AND NOT EXISTS (
			  SELECT 1
			  FROM doc_parent_map m
			  WHERE m.project_id = proj.id
				AND m.child_id = d.id
		  );

		-- If no roots (cycle or full mesh), fall back to all docs
		IF root_ids IS NULL OR array_length(root_ids, 1) = 0 THEN
			SELECT array_agg(d.id ORDER BY d.created_at, d.id)
			INTO root_ids
			FROM onto_documents d
			WHERE d.project_id = proj.id
			  AND d.deleted_at IS NULL;
		END IF;

		IF root_ids IS NULL OR array_length(root_ids, 1) = 0 THEN
			CONTINUE;
		END IF;

		SELECT jsonb_agg(node ORDER BY ord)
		INTO root_nodes
		FROM (
			SELECT
				(build_doc_node(proj.id, r.doc_id, ARRAY[r.doc_id]) || jsonb_build_object('order', r.ord)) AS node,
				r.ord
			FROM (
				SELECT
					doc_id,
					(ord - 1) AS ord
				FROM unnest(root_ids) WITH ORDINALITY AS u(doc_id, ord)
			) r
		) built
		WHERE node IS NOT NULL;

		UPDATE onto_projects
		SET doc_structure = jsonb_build_object('version', 1, 'root', COALESCE(root_nodes, '[]'::jsonb))
		WHERE id = proj.id
		  AND (doc_structure IS NULL OR doc_structure->'root' = '[]'::jsonb);
	END LOOP;
END $$;

-- Backfill onto_documents.children for parents with children
UPDATE onto_documents d
SET children = jsonb_build_object('children', c.children)
FROM (
	SELECT
		project_id,
		parent_id,
		jsonb_agg(
			jsonb_build_object('id', child_id, 'order', child_order)
			ORDER BY child_order
		) AS children
	FROM doc_parent_map
	GROUP BY project_id, parent_id
) c
WHERE d.project_id = c.project_id
  AND d.id = c.parent_id;

DROP FUNCTION IF EXISTS build_doc_node(uuid, uuid, uuid[]);
DROP TABLE IF EXISTS doc_parent_map;

-- Delete document-to-document edges (has_part relationships)
-- Keep task_has_document edges and other semantic edges
DELETE FROM onto_edges
WHERE src_kind = 'document' AND dst_kind = 'document'
AND rel = 'has_part';

-- Log the cleanup
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % document containment edges', deleted_count;
END $$;
