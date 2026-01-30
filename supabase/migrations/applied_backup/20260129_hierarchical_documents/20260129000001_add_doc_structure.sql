-- supabase/migrations/applied_backup/20260129_hierarchical_documents/20260129000001_add_doc_structure.sql
-- Migration: Add doc_structure column to onto_projects
-- Purpose: Enable hierarchical document organization within projects
-- Date: 2026-01-29

-- Add doc_structure JSONB column to onto_projects
-- This stores the hierarchical tree structure of documents
-- Format: { "version": 1, "root": [{ "id": "uuid", "type": "folder|doc", "order": 0, "children": [...] }] }
ALTER TABLE onto_projects
ADD COLUMN IF NOT EXISTS doc_structure JSONB DEFAULT '{"version": 1, "root": []}'::jsonb;

-- Add comment explaining the column
COMMENT ON COLUMN onto_projects.doc_structure IS 'Hierarchical document tree structure. JSON format: { version: number, root: DocTreeNode[] }';

-- Create index for efficient querying of projects with non-empty doc structures
CREATE INDEX IF NOT EXISTS idx_onto_projects_doc_structure_nonempty
ON onto_projects ((doc_structure->'root'))
WHERE doc_structure->'root' != '[]'::jsonb;
