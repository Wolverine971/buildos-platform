-- Migration: Add 'project.' prefix to all project template type_keys
-- Date: December 1, 2025
-- Purpose: Align project templates with the unified naming convention where all entities use scope prefixes
--
-- This migration updates:
-- 1. onto_templates.type_key for all project-scope templates
-- 2. onto_projects.type_key for all existing ontology projects
--
-- The new format is: project.{domain}.{deliverable}[.{variant}]
-- Example: writer.book -> project.writer.book

-- ============================================
-- STEP 0: Fix type_keys that use 'project' as a segment
-- Replace 'project' with 'work' when it appears as a deliverable/variant segment
-- This prevents conflicts like 'musician.project.xxx' becoming 'project.musician.project.xxx'
-- ============================================

-- Fix templates that ALREADY have project. prefix but also have .project. in the middle
-- e.g., 'project.musician.project.dad_rapper' -> 'project.musician.work.dad_rapper'
UPDATE onto_templates
SET type_key = regexp_replace(type_key, '^project\.(.*)\.project\.(.*)$', 'project.\1.work.\2')
WHERE scope = 'project'
  AND type_key LIKE 'project.%'
  AND type_key ~ '^project\..*\.project\.';

-- Fix templates where 'project' appears as a segment (not at start) - before prefixing
UPDATE onto_templates
SET type_key = regexp_replace(type_key, '\.project\.', '.work.', 'g')
WHERE scope = 'project'
  AND type_key ~ '\.project\.'
  AND type_key NOT LIKE 'project.%';

-- Fix templates where 'project' is the deliverable (second segment) - before prefixing
UPDATE onto_templates
SET type_key = regexp_replace(type_key, '^([a-z_]+)\.project$', '\1.work', 'g')
WHERE scope = 'project'
  AND type_key ~ '^[a-z_]+\.project$';

-- Fix projects that already have project. prefix with .project. in middle
UPDATE onto_projects
SET type_key = regexp_replace(type_key, '^project\.(.*)\.project\.(.*)$', 'project.\1.work.\2')
WHERE type_key IS NOT NULL
  AND type_key LIKE 'project.%'
  AND type_key ~ '^project\..*\.project\.';

-- Fix projects with same pattern - before prefixing
UPDATE onto_projects
SET type_key = regexp_replace(type_key, '\.project\.', '.work.', 'g')
WHERE type_key IS NOT NULL
  AND type_key ~ '\.project\.'
  AND type_key NOT LIKE 'project.%';

UPDATE onto_projects
SET type_key = regexp_replace(type_key, '^([a-z_]+)\.project$', '\1.work', 'g')
WHERE type_key IS NOT NULL
  AND type_key ~ '^[a-z_]+\.project$';

-- ============================================
-- STEP 1: Update onto_templates
-- Update all project-scope templates to use the 'project.' prefix
-- ============================================

UPDATE onto_templates
SET type_key = 'project.' || type_key
WHERE scope = 'project'
  AND type_key NOT LIKE 'project.%';

-- ============================================
-- STEP 2: Update onto_projects
-- Update all existing ontology projects to use the new type_key format
-- ============================================

UPDATE onto_projects
SET type_key = 'project.' || type_key
WHERE type_key IS NOT NULL
  AND type_key NOT LIKE 'project.%';

-- ============================================
-- STEP 3: Create fallback migration template if not exists
-- This template is used by the migration service for unmapped projects
-- ============================================

INSERT INTO onto_templates (
    scope,
    type_key,
    name,
    status,
    is_abstract,
    metadata,
    facet_defaults,
    schema,
    fsm,
    default_props,
    default_views,
    created_by
)
SELECT
    'project',
    'project.migration.generic',
    'Generic Migration Project',
    'active',
    false,
    '{"realm":"migration","description":"Fallback template for migrated projects that dont match any specific template"}'::jsonb,
    '{"context":"personal","scale":"medium","stage":"execution"}'::jsonb,
    '{
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Project title"},
            "description": {"type": "string", "description": "Project description"},
            "legacy_source": {"type": "string", "description": "Source of migrated project"}
        },
        "required": ["title"]
    }'::jsonb,
    '{
        "type_key": "project.migration.generic",
        "initial": "planning",
        "states": ["planning", "execution", "complete"],
        "transitions": [
            {"from": "planning", "to": "execution", "event": "start", "guards": [], "actions": []},
            {"from": "execution", "to": "complete", "event": "complete", "guards": [], "actions": []}
        ]
    }'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb,
    '00000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (
    SELECT 1 FROM onto_templates WHERE type_key = 'project.migration.generic'
);

-- ============================================
-- STEP 4: Add comment documenting the migration
-- ============================================

COMMENT ON TABLE onto_templates IS 'Ontology templates with unified naming convention. Project templates use project.{domain}.{deliverable}[.{variant}] format. Updated Dec 1, 2025.';

-- ============================================
-- Verification queries (run manually to confirm)
-- ============================================

-- Check all project templates now have project. prefix:
-- SELECT type_key FROM onto_templates WHERE scope = 'project' ORDER BY type_key;

-- Check all onto_projects have proper type_key:
-- SELECT DISTINCT type_key FROM onto_projects ORDER BY type_key;
