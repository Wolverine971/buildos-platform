-- Migration: Add generate_brief_email job type - PART 1 (Enum Only)
-- Description: Adds new enum value for email job type
-- Date: 2025-09-30
-- Related: PHASE2_REVISED_IMPLEMENTATION.md in apps/worker
-- IMPORTANT: This must be run before part 2

-- Add new job type to queue_type enum
-- Note: New enum values must be committed before they can be used
DO $$
BEGIN
    -- Check if the enum value already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'generate_brief_email'
        AND enumtypid = 'queue_type'::regtype
    ) THEN
        ALTER TYPE queue_type ADD VALUE 'generate_brief_email';
        RAISE NOTICE 'Added generate_brief_email to queue_type enum';
    ELSE
        RAISE NOTICE 'generate_brief_email already exists in queue_type enum';
    END IF;
END $$;
