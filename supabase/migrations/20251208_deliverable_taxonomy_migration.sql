-- supabase/migrations/20251208_deliverable_taxonomy_migration.sql
-- Migration: Deliverable Taxonomy Migration
-- Date: 2025-12-08
-- Description: Migrates output type_keys to deliverable.* taxonomy and adds
--              collection/external/event deliverable types
--
-- This migration:
-- 1. Fixes the template scope constraint to include 'event'
-- 2. Migrates output.* type_keys to deliverable.document.*
-- 3. Updates production onto_outputs rows with new type_keys
-- 4. Adds new templates for deliverable.collection.*, deliverable.external.*, deliverable.event.*
-- 5. Adds promotion-related columns to onto_outputs
--
-- IMPORTANT: This migration handles duplicate mappings by:
-- - Keeping the more specific template when two would merge
-- - Using proper idempotent patterns (WHERE NOT EXISTS, ON CONFLICT)

BEGIN;

-- ============================================================================
-- PART 1: Fix template scope constraint to include 'event'
-- ============================================================================

DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_scope_valid'
    AND table_name = 'onto_templates'
  ) THEN
    ALTER TABLE onto_templates DROP CONSTRAINT chk_scope_valid;
  END IF;

  -- Add updated constraint with 'event' scope
  ALTER TABLE onto_templates ADD CONSTRAINT chk_scope_valid CHECK (
    scope IN ('project', 'plan', 'task', 'output', 'document', 'goal',
              'requirement', 'risk', 'milestone', 'metric', 'event')
  );

  RAISE NOTICE 'Updated scope constraint to include event';
END $$;

-- ============================================================================
-- PART 2: Add source linking columns to onto_outputs for promotion flow
-- ============================================================================

-- Add columns for linking outputs to their source documents/events
DO $$
BEGIN
  -- Add source_document_id if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onto_outputs' AND column_name = 'source_document_id'
  ) THEN
    ALTER TABLE onto_outputs ADD COLUMN source_document_id uuid REFERENCES onto_documents(id) ON DELETE SET NULL;
  END IF;

  -- Add source_event_id if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onto_outputs' AND column_name = 'source_event_id'
  ) THEN
    ALTER TABLE onto_outputs ADD COLUMN source_event_id uuid REFERENCES onto_events(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add indexes for the new columns (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_onto_outputs_source_document ON onto_outputs(source_document_id) WHERE source_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_onto_outputs_source_event ON onto_outputs(source_event_id) WHERE source_event_id IS NOT NULL;

COMMENT ON COLUMN onto_outputs.source_document_id IS 'Reference to source document when output was promoted from a document';
COMMENT ON COLUMN onto_outputs.source_event_id IS 'Reference to source event when output was promoted from an event';

-- ============================================================================
-- PART 3: Clean up duplicate/redundant templates before migration
-- ============================================================================

-- The old taxonomy has both output.X and output.written.X patterns.
-- We need to consolidate these. Strategy:
-- 1. Re-parent any children of output.written.* to point to output.* (the template we're keeping)
-- 2. Then delete the redundant output.written.* templates
-- 3. Then rename output.* to deliverable.document.*

DO $$
DECLARE
  v_deleted_count integer := 0;
  v_reparented_count integer := 0;
  v_written_base_id uuid;
  v_document_id uuid;
BEGIN
  -- Step 1: Handle output.written.base -> output.document specifically
  -- Get the IDs
  SELECT id INTO v_written_base_id FROM onto_templates
    WHERE scope = 'output' AND type_key = 'output.written.base';
  SELECT id INTO v_document_id FROM onto_templates
    WHERE scope = 'output' AND type_key = 'output.document';

  -- If both exist, re-parent children of output.written.base to output.document
  IF v_written_base_id IS NOT NULL AND v_document_id IS NOT NULL THEN
    UPDATE onto_templates
    SET parent_template_id = v_document_id,
        updated_at = now()
    WHERE parent_template_id = v_written_base_id;
    GET DIAGNOSTICS v_reparented_count = ROW_COUNT;

    IF v_reparented_count > 0 THEN
      RAISE NOTICE 'Re-parented % templates from output.written.base to output.document', v_reparented_count;
    END IF;

    -- Now safe to delete output.written.base
    DELETE FROM onto_templates WHERE id = v_written_base_id;
    RAISE NOTICE 'Deleted redundant output.written.base template';
  END IF;

  -- Step 2: Handle other output.written.* templates
  -- For each output.written.X, if output.X exists, re-parent children and delete
  FOR v_written_base_id IN
    SELECT t1.id FROM onto_templates t1
    WHERE t1.scope = 'output'
      AND t1.type_key LIKE 'output.written.%'
      AND EXISTS (
        SELECT 1 FROM onto_templates t2
        WHERE t2.scope = 'output'
          AND t2.type_key = 'output.' || split_part(t1.type_key, '.', 3)
      )
  LOOP
    -- Get the corresponding output.X template id
    SELECT id INTO v_document_id FROM onto_templates
    WHERE scope = 'output'
      AND type_key = 'output.' || (
        SELECT split_part(type_key, '.', 3) FROM onto_templates WHERE id = v_written_base_id
      );

    -- Re-parent any children
    IF v_document_id IS NOT NULL THEN
      UPDATE onto_templates
      SET parent_template_id = v_document_id,
          updated_at = now()
      WHERE parent_template_id = v_written_base_id;
    END IF;

    -- Delete the redundant template
    DELETE FROM onto_templates WHERE id = v_written_base_id;
    v_deleted_count := v_deleted_count + 1;
  END LOOP;

  IF v_deleted_count > 0 THEN
    RAISE NOTICE 'Cleaned up % additional redundant output.written.* templates', v_deleted_count;
  END IF;

END $$;

-- ============================================================================
-- PART 4: Migrate output.* type_keys to deliverable.* in TEMPLATES
-- ============================================================================

-- Update base template first
UPDATE onto_templates
SET
  type_key = 'deliverable.base',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', '"output.base"'),
  fsm = jsonb_set(COALESCE(fsm, '{}'::jsonb), '{type_key}', '"deliverable.base"'),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.base'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.base');

-- Update output.document to deliverable.document.base
UPDATE onto_templates
SET
  type_key = 'deliverable.document.base',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', '"output.document"'),
  fsm = jsonb_set(COALESCE(fsm, '{}'::jsonb), '{type_key}', '"deliverable.document.base"'),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.document'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.base');

-- If output.written.base still exists (no output.document existed), migrate it
UPDATE onto_templates
SET
  type_key = 'deliverable.document.base',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', '"output.written.base"'),
  fsm = jsonb_set(COALESCE(fsm, '{}'::jsonb), '{type_key}', '"deliverable.document.base"'),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.written.base'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.base');

-- Migrate document type templates (output.X → deliverable.document.X)
-- Each statement only runs if target doesn't exist
UPDATE onto_templates SET type_key = 'deliverable.document.chapter',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  fsm = jsonb_set(COALESCE(fsm, '{}'::jsonb), '{type_key}', '"deliverable.document.chapter"'),
  updated_at = now()
WHERE scope = 'output' AND type_key IN ('output.chapter', 'output.written.chapter')
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.chapter');

UPDATE onto_templates SET type_key = 'deliverable.document.article',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  fsm = jsonb_set(COALESCE(fsm, '{}'::jsonb), '{type_key}', '"deliverable.document.article"'),
  updated_at = now()
WHERE scope = 'output' AND type_key IN ('output.article', 'output.written.article')
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.article');

UPDATE onto_templates SET type_key = 'deliverable.document.blog_post',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  fsm = jsonb_set(COALESCE(fsm, '{}'::jsonb), '{type_key}', '"deliverable.document.blog_post"'),
  updated_at = now()
WHERE scope = 'output' AND type_key IN ('output.blog_post', 'output.written.blog_post')
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.blog_post');

UPDATE onto_templates SET type_key = 'deliverable.document.case_study',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  fsm = jsonb_set(COALESCE(fsm, '{}'::jsonb), '{type_key}', '"deliverable.document.case_study"'),
  updated_at = now()
WHERE scope = 'output' AND type_key IN ('output.case_study', 'output.written.case_study')
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.case_study');

UPDATE onto_templates SET type_key = 'deliverable.document.whitepaper',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  fsm = jsonb_set(COALESCE(fsm, '{}'::jsonb), '{type_key}', '"deliverable.document.whitepaper"'),
  updated_at = now()
WHERE scope = 'output' AND type_key IN ('output.whitepaper', 'output.written.whitepaper')
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.whitepaper');

UPDATE onto_templates SET type_key = 'deliverable.document.newsletter',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  fsm = jsonb_set(COALESCE(fsm, '{}'::jsonb), '{type_key}', '"deliverable.document.newsletter"'),
  updated_at = now()
WHERE scope = 'output' AND type_key IN ('output.newsletter', 'output.written.newsletter')
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.newsletter');

-- Research outputs
UPDATE onto_templates SET type_key = 'deliverable.document.research_database',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.research.database'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.research_database');

UPDATE onto_templates SET type_key = 'deliverable.document.research_profile',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.research.profile'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.research_profile');

UPDATE onto_templates SET type_key = 'deliverable.document.research_visualization',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.research.visualization'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.research_visualization');

-- Book goes to collection
UPDATE onto_templates SET type_key = 'deliverable.collection.book',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', '"output.book"'),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.book'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.collection.book');

-- Other document types
UPDATE onto_templates SET type_key = 'deliverable.document.launch_plan',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.launch_plan'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.launch_plan');

UPDATE onto_templates SET type_key = 'deliverable.document.slide_deck',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.media.slide_deck'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.slide_deck');

-- Media outputs → deliverable.external
UPDATE onto_templates SET type_key = 'deliverable.external.media_base',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.media.base'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.external.media_base');

UPDATE onto_templates SET type_key = 'deliverable.external.design_mockup',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.media.design_mockup'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.external.design_mockup');

UPDATE onto_templates SET type_key = 'deliverable.external.video',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.media.video'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.external.video');

UPDATE onto_templates SET type_key = 'deliverable.external.audio',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.media.audio'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.external.audio');

-- Software outputs → deliverable.external
UPDATE onto_templates SET type_key = 'deliverable.external.software_base',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.software.base'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.external.software_base');

UPDATE onto_templates SET type_key = 'deliverable.external.software_feature',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.software.feature'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.external.software_feature');

UPDATE onto_templates SET type_key = 'deliverable.external.software_release',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.software.release'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.external.software_release');

UPDATE onto_templates SET type_key = 'deliverable.external.api',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.software.api'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.external.api');

-- Operational outputs
UPDATE onto_templates SET type_key = 'deliverable.document.operational_base',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.operational.base'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.operational_base');

UPDATE onto_templates SET type_key = 'deliverable.document.report',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.operational.report'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.report');

UPDATE onto_templates SET type_key = 'deliverable.external.dashboard',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.operational.dashboard'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.external.dashboard');

UPDATE onto_templates SET type_key = 'deliverable.document.contract',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.operational.contract'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.contract');

UPDATE onto_templates SET type_key = 'deliverable.document.playbook',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.operational.playbook'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.playbook');

-- Coach/service outputs
UPDATE onto_templates SET type_key = 'deliverable.document.workout_plan',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.workout_plan'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.workout_plan');

UPDATE onto_templates SET type_key = 'deliverable.document.meal_plan',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.meal_plan'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.meal_plan');

UPDATE onto_templates SET type_key = 'deliverable.document.session_plan',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.session_plan'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.session_plan');

UPDATE onto_templates SET type_key = 'deliverable.document.progress_report',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE scope = 'output' AND type_key = 'output.progress_report'
  AND NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.progress_report');

-- Log template migration
DO $$
DECLARE
  v_migrated_count integer;
  v_remaining_count integer;
BEGIN
  SELECT COUNT(*) INTO v_migrated_count FROM onto_templates
    WHERE scope = 'output' AND type_key LIKE 'deliverable.%';
  SELECT COUNT(*) INTO v_remaining_count FROM onto_templates
    WHERE scope = 'output' AND type_key LIKE 'output.%';
  RAISE NOTICE 'Template migration: % migrated to deliverable.*, % remaining with output.* prefix', v_migrated_count, v_remaining_count;
END $$;

-- ============================================================================
-- PART 5: Migrate production onto_outputs rows
-- ============================================================================

-- Update production data - map old type_keys to new ones
-- Using a series of targeted updates for safety

UPDATE onto_outputs SET
  type_key = 'deliverable.document.chapter',
  props = jsonb_set(COALESCE(props, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE type_key IN ('output.chapter', 'output.written.chapter');

UPDATE onto_outputs SET
  type_key = 'deliverable.document.article',
  props = jsonb_set(COALESCE(props, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE type_key IN ('output.article', 'output.written.article');

UPDATE onto_outputs SET
  type_key = 'deliverable.document.blog_post',
  props = jsonb_set(COALESCE(props, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE type_key IN ('output.blog_post', 'output.written.blog_post');

UPDATE onto_outputs SET
  type_key = 'deliverable.document.newsletter',
  props = jsonb_set(COALESCE(props, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE type_key IN ('output.newsletter', 'output.written.newsletter');

UPDATE onto_outputs SET
  type_key = 'deliverable.document.case_study',
  props = jsonb_set(COALESCE(props, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE type_key IN ('output.case_study', 'output.written.case_study');

UPDATE onto_outputs SET
  type_key = 'deliverable.document.whitepaper',
  props = jsonb_set(COALESCE(props, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE type_key IN ('output.whitepaper', 'output.written.whitepaper');

UPDATE onto_outputs SET
  type_key = 'deliverable.collection.book',
  props = jsonb_set(COALESCE(props, '{}'::jsonb), '{legacy_type_key}', '"output.book"'),
  updated_at = now()
WHERE type_key = 'output.book';

UPDATE onto_outputs SET
  type_key = 'deliverable.external.software_feature',
  props = jsonb_set(COALESCE(props, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE type_key = 'output.software.feature';

UPDATE onto_outputs SET
  type_key = 'deliverable.external.video',
  props = jsonb_set(COALESCE(props, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE type_key = 'output.media.video';

-- Catch-all: Convert any remaining output.* to deliverable.document.*
-- This handles any type_keys we didn't explicitly map
UPDATE onto_outputs
SET
  type_key = 'deliverable.document.' || replace(substring(type_key from 8), '.', '_'),
  props = jsonb_set(COALESCE(props, '{}'::jsonb), '{legacy_type_key}', to_jsonb(type_key)),
  updated_at = now()
WHERE type_key LIKE 'output.%';

-- Log production data migration
DO $$
DECLARE
  v_migrated_count integer;
BEGIN
  SELECT COUNT(*) INTO v_migrated_count FROM onto_outputs WHERE props->>'legacy_type_key' IS NOT NULL;
  RAISE NOTICE 'Migrated % production onto_outputs rows', v_migrated_count;
END $$;

-- ============================================================================
-- PART 6: Add new deliverable.collection.* templates
-- ============================================================================

-- Collection base template
INSERT INTO onto_templates (
  scope, type_key, name, status, is_abstract, parent_template_id,
  schema, fsm, default_props, metadata, created_by, created_at, updated_at
)
SELECT
  'output',
  'deliverable.collection.base',
  'Collection (Base)',
  'active',
  true,
  (SELECT id FROM onto_templates WHERE type_key = 'deliverable.base' AND scope = 'output' LIMIT 1),
  '{"type": "object", "properties": {"description": {"type": "string"}, "child_count": {"type": "integer", "default": 0}}}'::jsonb,
  '{"type_key": "deliverable.collection.base", "initial": "planning", "states": ["planning", "drafting", "review", "complete", "published"], "transitions": [{"from": "planning", "to": "drafting", "event": "start_drafting"}, {"from": "drafting", "to": "review", "event": "submit_for_review"}, {"from": "review", "to": "complete", "event": "approve"}, {"from": "complete", "to": "published", "event": "publish"}]}'::jsonb,
  '{"primitive": "COLLECTION"}'::jsonb,
  '{"realm": "general", "description": "Base template for multi-document collections", "primitive": "COLLECTION"}'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid,
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.collection.base' AND scope = 'output');

-- Book collection
INSERT INTO onto_templates (scope, type_key, name, status, is_abstract, parent_template_id, schema, fsm, default_props, metadata, created_by, created_at, updated_at)
SELECT 'output', 'deliverable.collection.book', 'Book', 'active', false,
  (SELECT id FROM onto_templates WHERE type_key = 'deliverable.collection.base' LIMIT 1),
  '{"type": "object", "properties": {"title": {"type": "string"}, "chapters": {"type": "array"}}, "required": ["title"]}'::jsonb,
  '{"type_key": "deliverable.collection.book", "initial": "planning", "states": ["planning", "outlining", "drafting", "revision", "complete", "published"], "transitions": [{"from": "planning", "to": "outlining", "event": "start_outline"}, {"from": "outlining", "to": "drafting", "event": "start_writing"}, {"from": "drafting", "to": "revision", "event": "complete_first_draft"}, {"from": "revision", "to": "complete", "event": "approve"}, {"from": "complete", "to": "published", "event": "publish"}]}'::jsonb,
  '{"primitive": "COLLECTION", "collection_type": "book"}'::jsonb,
  '{"realm": "creative", "description": "Book project with chapters as child deliverables", "primitive": "COLLECTION"}'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.collection.book' AND scope = 'output');

-- Course collection
INSERT INTO onto_templates (scope, type_key, name, status, is_abstract, parent_template_id, schema, fsm, default_props, metadata, created_by, created_at, updated_at)
SELECT 'output', 'deliverable.collection.course', 'Course', 'active', false,
  (SELECT id FROM onto_templates WHERE type_key = 'deliverable.collection.base' LIMIT 1),
  '{"type": "object", "properties": {"title": {"type": "string"}, "modules": {"type": "array"}}, "required": ["title"]}'::jsonb,
  '{"type_key": "deliverable.collection.course", "initial": "planning", "states": ["planning", "content_creation", "recording", "review", "published"], "transitions": [{"from": "planning", "to": "content_creation", "event": "start_content"}, {"from": "content_creation", "to": "recording", "event": "start_recording"}, {"from": "recording", "to": "review", "event": "submit_for_review"}, {"from": "review", "to": "published", "event": "publish"}]}'::jsonb,
  '{"primitive": "COLLECTION", "collection_type": "course"}'::jsonb,
  '{"realm": "education", "description": "Online course with modules and lessons", "primitive": "COLLECTION"}'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.collection.course' AND scope = 'output');

-- Email sequence collection
INSERT INTO onto_templates (scope, type_key, name, status, is_abstract, parent_template_id, schema, fsm, default_props, metadata, created_by, created_at, updated_at)
SELECT 'output', 'deliverable.collection.email_sequence', 'Email Sequence', 'active', false,
  (SELECT id FROM onto_templates WHERE type_key = 'deliverable.collection.base' LIMIT 1),
  '{"type": "object", "properties": {"name": {"type": "string"}, "emails": {"type": "array"}}, "required": ["name"]}'::jsonb,
  '{"type_key": "deliverable.collection.email_sequence", "initial": "drafting", "states": ["drafting", "review", "scheduled", "active", "complete"], "transitions": [{"from": "drafting", "to": "review", "event": "submit_for_review"}, {"from": "review", "to": "scheduled", "event": "approve"}, {"from": "scheduled", "to": "active", "event": "activate"}, {"from": "active", "to": "complete", "event": "complete"}]}'::jsonb,
  '{"primitive": "COLLECTION", "collection_type": "email_sequence"}'::jsonb,
  '{"realm": "marketing", "description": "Email drip campaign or nurture sequence", "primitive": "COLLECTION"}'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.collection.email_sequence' AND scope = 'output');

-- ============================================================================
-- PART 7: Add new deliverable.external.* templates
-- ============================================================================

-- External base template
INSERT INTO onto_templates (scope, type_key, name, status, is_abstract, parent_template_id, schema, fsm, default_props, metadata, created_by, created_at, updated_at)
SELECT 'output', 'deliverable.external.base', 'External Artifact (Base)', 'active', true,
  (SELECT id FROM onto_templates WHERE type_key = 'deliverable.base' AND scope = 'output' LIMIT 1),
  '{"type": "object", "properties": {"external_uri": {"type": "string"}, "external_type": {"type": "string"}}, "required": ["external_uri"]}'::jsonb,
  '{"type_key": "deliverable.external.base", "initial": "tracking", "states": ["tracking", "in_progress", "blocked", "complete", "archived"], "transitions": [{"from": "tracking", "to": "in_progress", "event": "start_work"}, {"from": "in_progress", "to": "blocked", "event": "block"}, {"from": "blocked", "to": "in_progress", "event": "unblock"}, {"from": "in_progress", "to": "complete", "event": "complete"}, {"from": "complete", "to": "archived", "event": "archive"}]}'::jsonb,
  '{"primitive": "EXTERNAL"}'::jsonb,
  '{"realm": "general", "description": "Base template for external artifacts", "primitive": "EXTERNAL"}'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.external.base' AND scope = 'output');

-- Design file template
INSERT INTO onto_templates (scope, type_key, name, status, is_abstract, parent_template_id, schema, fsm, default_props, metadata, created_by, created_at, updated_at)
SELECT 'output', 'deliverable.external.design_file', 'Design File', 'active', false,
  (SELECT id FROM onto_templates WHERE type_key = 'deliverable.external.base' LIMIT 1),
  '{"type": "object", "properties": {"external_uri": {"type": "string"}, "design_name": {"type": "string"}, "thumbnail_url": {"type": "string"}}, "required": ["design_name", "external_uri"]}'::jsonb,
  '{"type_key": "deliverable.external.design_file", "initial": "drafting", "states": ["drafting", "review", "approved", "archived"], "transitions": [{"from": "drafting", "to": "review", "event": "submit_for_review"}, {"from": "review", "to": "approved", "event": "approve"}, {"from": "approved", "to": "archived", "event": "archive"}]}'::jsonb,
  '{"primitive": "EXTERNAL", "external_type": "design"}'::jsonb,
  '{"realm": "design", "description": "Design file in Figma, Sketch, or other design tool", "primitive": "EXTERNAL"}'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.external.design_file' AND scope = 'output');

-- ============================================================================
-- PART 8: Add new deliverable.event.* templates
-- ============================================================================

-- Event base template
INSERT INTO onto_templates (scope, type_key, name, status, is_abstract, parent_template_id, schema, fsm, default_props, metadata, created_by, created_at, updated_at)
SELECT 'output', 'deliverable.event.base', 'Event Deliverable (Base)', 'active', true,
  (SELECT id FROM onto_templates WHERE type_key = 'deliverable.base' AND scope = 'output' LIMIT 1),
  '{"type": "object", "properties": {"event_date": {"type": "string", "format": "date-time"}, "duration_minutes": {"type": "integer"}, "location": {"type": "string"}}}'::jsonb,
  '{"type_key": "deliverable.event.base", "initial": "planning", "states": ["planning", "scheduled", "in_progress", "completed", "archived"], "transitions": [{"from": "planning", "to": "scheduled", "event": "schedule"}, {"from": "scheduled", "to": "in_progress", "event": "start"}, {"from": "in_progress", "to": "completed", "event": "complete"}, {"from": "completed", "to": "archived", "event": "archive"}]}'::jsonb,
  '{"primitive": "EVENT"}'::jsonb,
  '{"realm": "general", "description": "Base template for event-based deliverables", "primitive": "EVENT"}'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.event.base' AND scope = 'output');

-- Workshop template
INSERT INTO onto_templates (scope, type_key, name, status, is_abstract, parent_template_id, schema, fsm, default_props, metadata, created_by, created_at, updated_at)
SELECT 'output', 'deliverable.event.workshop', 'Workshop', 'active', false,
  (SELECT id FROM onto_templates WHERE type_key = 'deliverable.event.base' LIMIT 1),
  '{"type": "object", "properties": {"title": {"type": "string"}, "event_date": {"type": "string"}, "max_participants": {"type": "integer"}}, "required": ["title"]}'::jsonb,
  '{"type_key": "deliverable.event.workshop", "initial": "planning", "states": ["planning", "content_prep", "scheduled", "delivered", "complete"], "transitions": [{"from": "planning", "to": "content_prep", "event": "start_prep"}, {"from": "content_prep", "to": "scheduled", "event": "schedule"}, {"from": "scheduled", "to": "delivered", "event": "deliver"}, {"from": "delivered", "to": "complete", "event": "complete"}]}'::jsonb,
  '{"primitive": "EVENT", "event_type": "workshop"}'::jsonb,
  '{"realm": "education", "description": "Interactive workshop or training session", "primitive": "EVENT"}'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.event.workshop' AND scope = 'output');

-- Webinar template
INSERT INTO onto_templates (scope, type_key, name, status, is_abstract, parent_template_id, schema, fsm, default_props, metadata, created_by, created_at, updated_at)
SELECT 'output', 'deliverable.event.webinar', 'Webinar', 'active', false,
  (SELECT id FROM onto_templates WHERE type_key = 'deliverable.event.base' LIMIT 1),
  '{"type": "object", "properties": {"title": {"type": "string"}, "event_date": {"type": "string"}, "platform": {"type": "string"}}, "required": ["title"]}'::jsonb,
  '{"type_key": "deliverable.event.webinar", "initial": "planning", "states": ["planning", "content_prep", "scheduled", "live", "published"], "transitions": [{"from": "planning", "to": "content_prep", "event": "start_prep"}, {"from": "content_prep", "to": "scheduled", "event": "schedule"}, {"from": "scheduled", "to": "live", "event": "go_live"}, {"from": "live", "to": "published", "event": "publish_recording"}]}'::jsonb,
  '{"primitive": "EVENT", "event_type": "webinar"}'::jsonb,
  '{"realm": "marketing", "description": "Live webinar or virtual presentation", "primitive": "EVENT"}'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.event.webinar' AND scope = 'output');

-- Masterclass template
INSERT INTO onto_templates (scope, type_key, name, status, is_abstract, parent_template_id, schema, fsm, default_props, metadata, created_by, created_at, updated_at)
SELECT 'output', 'deliverable.event.masterclass', 'Masterclass', 'active', false,
  (SELECT id FROM onto_templates WHERE type_key = 'deliverable.event.base' LIMIT 1),
  '{"type": "object", "properties": {"title": {"type": "string"}, "instructor": {"type": "string"}}, "required": ["title"]}'::jsonb,
  '{"type_key": "deliverable.event.masterclass", "initial": "planning", "states": ["planning", "scheduled", "delivered", "complete"], "transitions": [{"from": "planning", "to": "scheduled", "event": "schedule"}, {"from": "scheduled", "to": "delivered", "event": "deliver"}, {"from": "delivered", "to": "complete", "event": "complete"}]}'::jsonb,
  '{"primitive": "EVENT", "event_type": "masterclass"}'::jsonb,
  '{"realm": "education", "description": "Expert-led deep-dive session", "primitive": "EVENT"}'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.event.masterclass' AND scope = 'output');

-- Keynote template
INSERT INTO onto_templates (scope, type_key, name, status, is_abstract, parent_template_id, schema, fsm, default_props, metadata, created_by, created_at, updated_at)
SELECT 'output', 'deliverable.event.keynote', 'Keynote', 'active', false,
  (SELECT id FROM onto_templates WHERE type_key = 'deliverable.event.base' LIMIT 1),
  '{"type": "object", "properties": {"title": {"type": "string"}, "event_name": {"type": "string"}, "venue": {"type": "string"}}, "required": ["title"]}'::jsonb,
  '{"type_key": "deliverable.event.keynote", "initial": "accepted", "states": ["accepted", "preparing", "rehearsing", "delivered", "complete"], "transitions": [{"from": "accepted", "to": "preparing", "event": "start_prep"}, {"from": "preparing", "to": "rehearsing", "event": "start_rehearsal"}, {"from": "rehearsing", "to": "delivered", "event": "deliver"}, {"from": "delivered", "to": "complete", "event": "complete"}]}'::jsonb,
  '{"primitive": "EVENT", "event_type": "keynote"}'::jsonb,
  '{"realm": "speaking", "description": "Conference keynote or featured presentation", "primitive": "EVENT"}'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.event.keynote' AND scope = 'output');

-- ============================================================================
-- PART 9: Add additional document deliverable templates
-- ============================================================================

-- Email template (for email sequences)
INSERT INTO onto_templates (scope, type_key, name, status, is_abstract, parent_template_id, schema, fsm, default_props, metadata, created_by, created_at, updated_at)
SELECT 'output', 'deliverable.document.email', 'Email', 'active', false,
  (SELECT id FROM onto_templates WHERE type_key = 'deliverable.document.base' LIMIT 1),
  '{"type": "object", "properties": {"subject": {"type": "string"}, "body": {"type": "string"}}, "required": ["subject"]}'::jsonb,
  '{"type_key": "deliverable.document.email", "initial": "draft", "states": ["draft", "review", "approved", "sent"], "transitions": [{"from": "draft", "to": "review", "event": "submit"}, {"from": "review", "to": "approved", "event": "approve"}, {"from": "approved", "to": "sent", "event": "send"}]}'::jsonb,
  '{"primitive": "TEXT_DOCUMENT"}'::jsonb,
  '{"realm": "marketing", "description": "Email content for campaigns or sequences", "primitive": "TEXT_DOCUMENT"}'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.email' AND scope = 'output');

-- Lesson template
INSERT INTO onto_templates (scope, type_key, name, status, is_abstract, parent_template_id, schema, fsm, default_props, metadata, created_by, created_at, updated_at)
SELECT 'output', 'deliverable.document.lesson', 'Lesson', 'active', false,
  (SELECT id FROM onto_templates WHERE type_key = 'deliverable.document.base' LIMIT 1),
  '{"type": "object", "properties": {"title": {"type": "string"}, "content": {"type": "string"}}, "required": ["title"]}'::jsonb,
  '{"type_key": "deliverable.document.lesson", "initial": "draft", "states": ["draft", "review", "approved", "published"], "transitions": [{"from": "draft", "to": "review", "event": "submit"}, {"from": "review", "to": "approved", "event": "approve"}, {"from": "approved", "to": "published", "event": "publish"}]}'::jsonb,
  '{"primitive": "TEXT_DOCUMENT"}'::jsonb,
  '{"realm": "education", "description": "Course lesson content", "primitive": "TEXT_DOCUMENT"}'::jsonb,
  '00000000-0000-0000-0000-000000000000'::uuid, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM onto_templates WHERE type_key = 'deliverable.document.lesson' AND scope = 'output');

-- ============================================================================
-- PART 10: Create helper function for getting primitive from type_key
-- ============================================================================

CREATE OR REPLACE FUNCTION get_deliverable_primitive(p_type_key text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Extract primitive from deliverable.{primitive}.* pattern
  IF p_type_key LIKE 'deliverable.%' THEN
    RETURN split_part(p_type_key, '.', 2);
  END IF;

  -- Legacy output.* patterns
  IF p_type_key LIKE 'output.written.%' OR p_type_key LIKE 'output.chapter%'
     OR p_type_key LIKE 'output.article%' OR p_type_key LIKE 'output.blog%' THEN
    RETURN 'document';
  END IF;

  IF p_type_key LIKE 'output.media.%' OR p_type_key LIKE 'output.software.%' THEN
    RETURN 'external';
  END IF;

  -- Default
  RETURN 'document';
END;
$$;

COMMENT ON FUNCTION get_deliverable_primitive IS 'Extracts the primitive type (document, event, collection, external) from a deliverable type_key';

-- ============================================================================
-- FINAL: Summary and verification
-- ============================================================================

DO $$
DECLARE
  v_template_count integer;
  v_output_count integer;
  v_deliverable_templates integer;
  v_legacy_templates integer;
BEGIN
  SELECT COUNT(*) INTO v_template_count FROM onto_templates WHERE scope = 'output';
  SELECT COUNT(*) INTO v_output_count FROM onto_outputs;
  SELECT COUNT(*) INTO v_deliverable_templates FROM onto_templates WHERE type_key LIKE 'deliverable.%';
  SELECT COUNT(*) INTO v_legacy_templates FROM onto_templates WHERE scope = 'output' AND type_key LIKE 'output.%';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration Complete Summary:';
  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE 'Total output templates: %', v_template_count;
  RAISE NOTICE 'Templates with deliverable.* prefix: %', v_deliverable_templates;
  RAISE NOTICE 'Remaining legacy output.* templates: %', v_legacy_templates;
  RAISE NOTICE 'Production onto_outputs rows: %', v_output_count;
  RAISE NOTICE '========================================';
END $$;

COMMIT;
