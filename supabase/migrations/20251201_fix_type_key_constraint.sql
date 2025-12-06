-- Migration: Fix type_key check constraint to allow project. prefix
-- Date: December 1, 2025
-- Purpose: Update the chk_type_key_format constraint to allow 4-segment project type_keys
--
-- The new project format is: project.{domain}.{deliverable}[.{variant}]
-- This means project type_keys can have 3 or 4 segments (including the 'project.' prefix)
--
-- Examples:
--   project.writer.book (3 segments)
--   project.developer.app.mobile (4 segments)

-- First, drop the existing constraint
ALTER TABLE onto_templates DROP CONSTRAINT IF EXISTS chk_type_key_format;

-- Add new constraint that allows:
-- - Project scope: 3-4 segments starting with 'project.'
-- - Other scopes: 2-3 segments starting with scope prefix (task., plan., goal., etc.)
ALTER TABLE onto_templates ADD CONSTRAINT chk_type_key_format CHECK (
    -- Valid type_key format check:
    -- All type_keys must be lowercase, dot-separated, with alphanumeric and underscores
    type_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$'
);

-- Note: The regex allows 2-4 segments total:
-- - 2 segments: scope.type (e.g., goal.outcome)
-- - 3 segments: scope.type.variant OR project.domain.deliverable
-- - 4 segments: project.domain.deliverable.variant

COMMENT ON CONSTRAINT chk_type_key_format ON onto_templates IS
'Validates type_key format: lowercase dot-separated segments (2-4 total). Projects use project.{domain}.{deliverable}[.{variant}] format.';
