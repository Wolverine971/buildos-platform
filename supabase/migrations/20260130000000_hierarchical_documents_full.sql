-- supabase/migrations/20260130000000_hierarchical_documents_full.sql
-- Migration: Hierarchical documents (doc_structure + children + history + conversion)
-- Purpose: Apply all hierarchical document tree changes in one pass
-- Date: 2026-01-30

-- ============================================
-- 1) Add doc_structure column to onto_projects
-- ============================================

ALTER TABLE onto_projects
ADD COLUMN IF NOT EXISTS doc_structure JSONB DEFAULT '{"version": 1, "root": []}'::jsonb;

COMMENT ON COLUMN onto_projects.doc_structure IS 'Hierarchical document tree structure. JSON format: { version: number, root: DocTreeNode[] }';

CREATE INDEX IF NOT EXISTS idx_onto_projects_doc_structure_nonempty
ON onto_projects ((doc_structure->'root'))
WHERE doc_structure->'root' != '[]'::jsonb;

-- ============================================
-- 2) Add children column to onto_documents
-- ============================================

ALTER TABLE onto_documents
ADD COLUMN IF NOT EXISTS children JSONB DEFAULT '{"children": []}'::jsonb;

COMMENT ON COLUMN onto_documents.children IS 'Immediate child documents. JSON format: { children: Array<{ id: string, order: number }> }. Dynamically updated when child docs change.';

CREATE INDEX IF NOT EXISTS idx_onto_documents_has_children
ON onto_documents ((children->'children'))
WHERE children->'children' != '[]'::jsonb;

-- ============================================
-- 3) Add structure history table + RLS
-- ============================================

CREATE TABLE IF NOT EXISTS onto_project_structure_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
    doc_structure JSONB NOT NULL,
    version INTEGER NOT NULL,
    changed_by UUID REFERENCES onto_actors(id),
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    change_type TEXT NOT NULL  -- 'create', 'move', 'delete', 'reorder', 'reorganize'
);

COMMENT ON TABLE onto_project_structure_history IS 'Audit trail and undo history for project document tree structure changes';
COMMENT ON COLUMN onto_project_structure_history.version IS 'Incrementing version number for optimistic locking';
COMMENT ON COLUMN onto_project_structure_history.change_type IS 'Type of change: create, move, delete, reorder, reorganize';

CREATE INDEX IF NOT EXISTS idx_structure_history_project
ON onto_project_structure_history(project_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_structure_history_changed_at
ON onto_project_structure_history(project_id, changed_at DESC);

ALTER TABLE onto_project_structure_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view structure history for accessible projects"
ON onto_project_structure_history
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM onto_projects p
        WHERE p.id = project_id
        AND (
            p.created_by = auth.uid()
            OR EXISTS (
                SELECT 1 FROM onto_actors a
                WHERE a.id = p.created_by
                AND a.user_id = auth.uid()
            )
            OR p.is_public = true
            OR EXISTS (
                SELECT 1 FROM onto_project_members pm
                JOIN onto_actors a ON a.id = pm.actor_id
                WHERE pm.project_id = p.id
                AND a.user_id = auth.uid()
            )
        )
    )
);

CREATE POLICY "Users can insert structure history for editable projects"
ON onto_project_structure_history
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM onto_projects p
        WHERE p.id = project_id
        AND (
            p.created_by = auth.uid()
            OR EXISTS (
                SELECT 1 FROM onto_actors a
                WHERE a.id = p.created_by
                AND a.user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM onto_project_members pm
                JOIN onto_actors a ON a.id = pm.actor_id
                WHERE pm.project_id = p.id
                AND a.user_id = auth.uid()
                AND pm.role_key IN ('owner', 'editor')
            )
        )
    )
);

CREATE OR REPLACE FUNCTION cleanup_structure_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delete entries older than 90 days, keeping at least the last 50 per project
    DELETE FROM onto_project_structure_history h
    WHERE h.id IN (
        SELECT h2.id
        FROM onto_project_structure_history h2
        WHERE h2.changed_at < NOW() - INTERVAL '90 days'
        AND h2.version NOT IN (
            SELECT version FROM (
                SELECT version
                FROM onto_project_structure_history
                WHERE project_id = h2.project_id
                ORDER BY version DESC
                LIMIT 50
            ) AS recent_versions
        )
    );
END;
$$;

COMMENT ON FUNCTION cleanup_structure_history IS 'Removes old structure history entries, keeping last 50 versions or 90 days per project';

-- ============================================
-- 4) Convert document has_part edges to doc_structure + children
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

-- ============================================
-- 5) Delete document-to-document containment edges
-- ============================================

DELETE FROM onto_edges
WHERE src_kind = 'document' AND dst_kind = 'document'
AND rel = 'has_part';

DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % document containment edges', deleted_count;
END $$;
