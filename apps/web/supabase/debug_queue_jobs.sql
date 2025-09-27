-- Debug script to identify queue_jobs constraint violations
-- Run this before applying the migration to understand the data

-- 1. Show summary of queue_jobs
SELECT
    job_type,
    status,
    COUNT(*) as count,
    COUNT(CASE WHEN metadata IS NULL THEN 1 END) as null_metadata_count,
    COUNT(CASE WHEN metadata = '{}'::jsonb THEN 1 END) as empty_metadata_count
FROM queue_jobs
GROUP BY job_type, status
ORDER BY job_type, status;

-- 2. Show sample of active jobs with their metadata
SELECT
    id,
    job_type,
    status,
    CASE
        WHEN metadata IS NULL THEN 'NULL'
        WHEN metadata = '{}'::jsonb THEN 'EMPTY'
        ELSE metadata::text
    END as metadata_preview,
    created_at
FROM queue_jobs
WHERE status NOT IN ('completed', 'cancelled', 'failed')
LIMIT 20;

-- 3. Check specific job types that require metadata
SELECT
    id,
    job_type,
    status,
    metadata,
    CASE
        WHEN job_type = 'generate_daily_brief' THEN
            CASE
                WHEN metadata IS NULL THEN 'ERROR: NULL metadata'
                WHEN NOT (metadata ? 'briefDate' OR metadata ? 'brief_date' OR metadata ? 'date') THEN 'ERROR: Missing date field'
                WHEN NOT (metadata ? 'timezone' OR metadata ? 'time_zone' OR metadata ? 'tz') THEN 'ERROR: Missing timezone field'
                ELSE 'OK'
            END
        WHEN job_type = 'generate_phases' THEN
            CASE
                WHEN metadata IS NULL THEN 'ERROR: NULL metadata'
                WHEN NOT (metadata ? 'projectId' OR metadata ? 'project_id' OR metadata ? 'projectID' OR metadata ? 'project') THEN 'ERROR: Missing project field'
                ELSE 'OK'
            END
        ELSE 'N/A'
    END as validation_result
FROM queue_jobs
WHERE status NOT IN ('completed', 'cancelled', 'failed')
AND job_type IN ('generate_daily_brief', 'generate_phases')
ORDER BY job_type, created_at DESC;

-- 4. Find all unique metadata field names being used
WITH metadata_keys AS (
    SELECT DISTINCT
        job_type,
        jsonb_object_keys(metadata) as key
    FROM queue_jobs
    WHERE metadata IS NOT NULL
    AND status NOT IN ('completed', 'cancelled', 'failed')
)
SELECT
    job_type,
    string_agg(DISTINCT key, ', ' ORDER BY key) as metadata_keys
FROM metadata_keys
GROUP BY job_type
ORDER BY job_type;

-- 5. Check if there are any jobs with completely invalid metadata structure
SELECT
    id,
    job_type,
    status,
    metadata,
    pg_typeof(metadata::text) as metadata_type,
    CASE
        WHEN metadata IS NULL THEN 'NULL'
        WHEN jsonb_typeof(metadata) != 'object' THEN 'INVALID: Not an object'
        ELSE 'Valid structure'
    END as structure_check
FROM queue_jobs
WHERE status NOT IN ('completed', 'cancelled', 'failed')
AND (
    metadata IS NULL OR
    jsonb_typeof(metadata) != 'object'
)
LIMIT 10;

-- 6. Create a test to see what would fail the constraint
WITH constraint_test AS (
    SELECT
        id,
        job_type,
        status,
        metadata,
        CASE
            WHEN status IN ('completed', 'cancelled', 'failed') THEN TRUE
            WHEN job_type = 'generate_daily_brief' THEN
                metadata IS NOT NULL AND
                (metadata ? 'briefDate' OR metadata ? 'brief_date') AND
                (metadata ? 'timezone' OR metadata ? 'time_zone')
            WHEN job_type = 'generate_phases' THEN
                metadata IS NOT NULL AND
                (metadata ? 'projectId' OR metadata ? 'project_id' OR metadata ? 'projectID')
            ELSE TRUE
        END as would_pass_constraint
    FROM queue_jobs
)
SELECT
    COUNT(*) as total_jobs,
    COUNT(CASE WHEN NOT would_pass_constraint THEN 1 END) as would_fail,
    COUNT(CASE WHEN would_pass_constraint THEN 1 END) as would_pass
FROM constraint_test;

-- 7. Show exactly which jobs would fail and why
WITH failing_jobs AS (
    SELECT
        id,
        job_type,
        status,
        metadata,
        created_at,
        CASE
            WHEN job_type = 'generate_daily_brief' AND metadata IS NULL THEN
                'generate_daily_brief requires metadata'
            WHEN job_type = 'generate_daily_brief' AND NOT (metadata ? 'briefDate' OR metadata ? 'brief_date') THEN
                'generate_daily_brief missing date field'
            WHEN job_type = 'generate_daily_brief' AND NOT (metadata ? 'timezone' OR metadata ? 'time_zone') THEN
                'generate_daily_brief missing timezone field'
            WHEN job_type = 'generate_phases' AND metadata IS NULL THEN
                'generate_phases requires metadata'
            WHEN job_type = 'generate_phases' AND NOT (metadata ? 'projectId' OR metadata ? 'project_id' OR metadata ? 'projectID') THEN
                'generate_phases missing project field'
            ELSE 'Unknown reason'
        END as failure_reason
    FROM queue_jobs
    WHERE status NOT IN ('completed', 'cancelled', 'failed')
    AND (
        (job_type = 'generate_daily_brief' AND (
            metadata IS NULL OR
            NOT (metadata ? 'briefDate' OR metadata ? 'brief_date') OR
            NOT (metadata ? 'timezone' OR metadata ? 'time_zone')
        )) OR
        (job_type = 'generate_phases' AND (
            metadata IS NULL OR
            NOT (metadata ? 'projectId' OR metadata ? 'project_id' OR metadata ? 'projectID')
        ))
    )
)
SELECT * FROM failing_jobs
ORDER BY job_type, created_at DESC;