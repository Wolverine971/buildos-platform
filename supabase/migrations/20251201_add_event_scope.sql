-- Migration: Add 'event' to onto_templates scope constraint
-- Purpose: Allow event templates in the ontology system
-- Date: 2025-12-01

-- Drop the existing constraint
ALTER TABLE onto_templates DROP CONSTRAINT IF EXISTS chk_scope_valid;

-- Add the updated constraint with 'event' included
ALTER TABLE onto_templates ADD CONSTRAINT chk_scope_valid
  CHECK (scope IN ('project', 'plan', 'task', 'output', 'document', 'goal', 'requirement', 'risk', 'milestone', 'metric', 'event'));

-- Completion log
DO $$
BEGIN
  RAISE NOTICE '✅ Added event to onto_templates scope constraint';
END $$;
