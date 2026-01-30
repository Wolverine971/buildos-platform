-- supabase/migrations/applied_backup/20260129_hierarchical_documents/20260129000003_add_structure_history.sql
-- Migration: Add onto_project_structure_history table
-- Purpose: Enable undo/redo and audit trail for document tree structure changes
-- Date: 2026-01-29

-- Create the structure history table
CREATE TABLE IF NOT EXISTS onto_project_structure_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
    doc_structure JSONB NOT NULL,
    version INTEGER NOT NULL,
    changed_by UUID REFERENCES onto_actors(id),
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    change_type TEXT NOT NULL  -- 'create', 'move', 'delete', 'reorder', 'reorganize'
);

-- Add comments
COMMENT ON TABLE onto_project_structure_history IS 'Audit trail and undo history for project document tree structure changes';
COMMENT ON COLUMN onto_project_structure_history.version IS 'Incrementing version number for optimistic locking';
COMMENT ON COLUMN onto_project_structure_history.change_type IS 'Type of change: create, move, delete, reorder, reorganize';

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_structure_history_project
ON onto_project_structure_history(project_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_structure_history_changed_at
ON onto_project_structure_history(project_id, changed_at DESC);

-- Enable RLS
ALTER TABLE onto_project_structure_history ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can view history for projects they have access to
CREATE POLICY "Users can view structure history for accessible projects"
ON onto_project_structure_history
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM onto_projects p
        WHERE p.id = project_id
        AND (
            p.created_by = auth.uid()
            OR p.is_public = true
            OR EXISTS (
                SELECT 1 FROM project_memberships pm
                WHERE pm.project_id = p.id
                AND pm.user_id = auth.uid()
            )
        )
    )
);

-- RLS policy: Users can insert history for projects they can edit
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
                SELECT 1 FROM project_memberships pm
                WHERE pm.project_id = p.id
                AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'editor')
            )
        )
    )
);

-- Function to clean up old history (keep last 50 versions or 90 days)
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
