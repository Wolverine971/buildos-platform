-- supabase/migrations/applied_backup/20260129_hierarchical_documents/20260129000002_add_document_children.sql
-- Migration: Add children column to onto_documents
-- Purpose: Enable documents to know their immediate children for efficient queries
-- Date: 2026-01-29

-- Add children JSONB column to onto_documents
-- This stores lightweight references to child documents
-- Format: { "children": [{ "id": "uuid", "order": 0 }] }
ALTER TABLE onto_documents
ADD COLUMN IF NOT EXISTS children JSONB DEFAULT '{"children": []}'::jsonb;

-- Add comment explaining the column
COMMENT ON COLUMN onto_documents.children IS 'Immediate child documents. JSON format: { children: Array<{ id: string, order: number }> }. Dynamically updated when child docs change.';

-- Create index for efficient querying of documents with children
CREATE INDEX IF NOT EXISTS idx_onto_documents_has_children
ON onto_documents ((children->'children'))
WHERE children->'children' != '[]'::jsonb;
