-- Migration: Minimal queue type constraints
-- Description: Adds only the most essential constraints with maximum compatibility

-- Step 1: Fix any NULL metadata for critical job types
UPDATE queue_jobs
SET metadata = CASE
    WHEN job_type = 'generate_daily_brief' THEN
        COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'briefDate', COALESCE(
                metadata->>'briefDate',
                metadata->>'brief_date',
                TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
            ),
            'timezone', COALESCE(
                metadata->>'timezone',
                metadata->>'time_zone',
                'UTC'
            )
        )
    WHEN job_type = 'generate_phases' THEN
        COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'projectId', COALESCE(
                metadata->>'projectId',
                metadata->>'project_id',
                metadata->>'projectID',
                '00000000-0000-0000-0000-000000000000'
            )
        )
    ELSE COALESCE(metadata, '{}'::jsonb)
END
WHERE status NOT IN ('completed', 'cancelled', 'failed')
AND metadata IS NULL;

-- Step 2: Drop any existing constraint
ALTER TABLE queue_jobs
DROP CONSTRAINT IF EXISTS valid_job_metadata;

-- Step 3: Add a minimal constraint that should work with all data
-- This only prevents NULL metadata for specific job types in active state
ALTER TABLE queue_jobs
ADD CONSTRAINT valid_job_metadata CHECK (
    -- Terminal states can have any metadata
    status IN ('completed', 'cancelled', 'failed')
    OR
    -- Active states need non-null metadata for certain types
    NOT (
        status NOT IN ('completed', 'cancelled', 'failed')
        AND job_type IN ('generate_daily_brief', 'generate_phases')
        AND metadata IS NULL
    )
);

-- Step 4: Add comment explaining the constraint
COMMENT ON CONSTRAINT valid_job_metadata ON queue_jobs IS
'Minimal constraint: Only prevents NULL metadata for daily_brief and phases generation in active jobs';