-- supabase/migrations/20260208000000_backfill_doc_structure_metadata.sql
-- Migration: Backfill doc_structure titles and descriptions
-- Ensures each doc_structure node includes title/description from onto_documents.

-- The existing doc_structure root index can exceed btree row size once metadata is added.
DROP INDEX IF EXISTS idx_onto_projects_doc_structure_nonempty;

DROP FUNCTION IF EXISTS hydrate_doc_node(uuid, jsonb);

CREATE OR REPLACE FUNCTION hydrate_doc_node(
    p_project_id uuid,
    p_node jsonb
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    doc_id uuid;
    id_text text;
    doc_title text;
    doc_description text;
    hydrated_children jsonb;
    has_children boolean;
BEGIN
    IF p_node IS NULL THEN
        RETURN NULL;
    END IF;

    id_text := p_node->>'id';
    IF id_text IS NOT NULL AND id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        doc_id := id_text::uuid;
    ELSE
        doc_id := NULL;
    END IF;

    IF doc_id IS NOT NULL THEN
        SELECT d.title, d.description
        INTO doc_title, doc_description
        FROM onto_documents d
        WHERE d.id = doc_id
          AND d.project_id = p_project_id
          AND d.deleted_at IS NULL
        LIMIT 1;
    END IF;

    IF doc_title IS NULL THEN
        doc_title := p_node->>'title';
    END IF;

    IF doc_description IS NULL THEN
        doc_description := p_node->>'description';
    END IF;

    has_children := jsonb_typeof(p_node->'children') = 'array';

    IF has_children THEN
        SELECT jsonb_agg(hydrate_doc_node(p_project_id, child) ORDER BY ord)
        INTO hydrated_children
        FROM jsonb_array_elements(p_node->'children') WITH ORDINALITY AS c(child, ord)
        WHERE child IS NOT NULL;
    END IF;

    p_node := p_node || jsonb_build_object(
        'title', doc_title,
        'description', doc_description
    );

    IF has_children THEN
        p_node := (p_node - 'children')
            || jsonb_build_object('children', COALESCE(hydrated_children, '[]'::jsonb));
    END IF;

    RETURN p_node;
END;
$$;

-- Update main project doc_structure
UPDATE onto_projects p
SET doc_structure = jsonb_set(
    p.doc_structure,
    '{root}',
    COALESCE(
        (
            SELECT jsonb_agg(hydrate_doc_node(p.id, node) ORDER BY ord)
            FROM jsonb_array_elements(p.doc_structure->'root') WITH ORDINALITY AS r(node, ord)
        ),
        '[]'::jsonb
    ),
    false
)
WHERE p.doc_structure IS NOT NULL
  AND jsonb_typeof(p.doc_structure) = 'object'
  AND jsonb_typeof(p.doc_structure->'root') = 'array';

-- Update history entries to keep versions consistent
UPDATE onto_project_structure_history h
SET doc_structure = jsonb_set(
    h.doc_structure,
    '{root}',
    COALESCE(
        (
            SELECT jsonb_agg(hydrate_doc_node(h.project_id, node) ORDER BY ord)
            FROM jsonb_array_elements(h.doc_structure->'root') WITH ORDINALITY AS r(node, ord)
        ),
        '[]'::jsonb
    ),
    false
)
WHERE h.doc_structure IS NOT NULL
  AND jsonb_typeof(h.doc_structure) = 'object'
  AND jsonb_typeof(h.doc_structure->'root') = 'array';

DROP FUNCTION IF EXISTS hydrate_doc_node(uuid, jsonb);

-- Recreate a safe, lightweight index for non-empty doc_structure roots.
CREATE INDEX IF NOT EXISTS idx_onto_projects_doc_structure_nonempty
ON onto_projects (id)
WHERE jsonb_typeof(doc_structure->'root') = 'array'
  AND doc_structure->'root' != '[]'::jsonb;
