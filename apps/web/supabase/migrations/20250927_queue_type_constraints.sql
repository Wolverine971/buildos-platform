-- Migration: Add type constraints for queue jobs
-- Description: Adds validation constraints and ensures queue job metadata consistency

-- Ensure queue_type enum has all required values
DO $$
BEGIN
    -- Verify the queue_type enum exists with correct values
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'queue_type'
        AND e.enumlabel IN (
            'generate_daily_brief',
            'generate_phases',
            'sync_calendar',
            'process_brain_dump',
            'send_email',
            'update_recurring_tasks',
            'cleanup_old_data',
            'onboarding_analysis',
            'other'
        )
    ) THEN
        RAISE NOTICE 'queue_type enum may be missing expected values';
    END IF;

    -- Verify the queue_status enum exists with correct values
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'queue_status'
        AND e.enumlabel IN (
            'pending',
            'processing',
            'completed',
            'failed',
            'cancelled',
            'retrying'
        )
    ) THEN
        RAISE NOTICE 'queue_status enum may be missing expected values';
    END IF;
END $$;

-- First, update existing data to meet new requirements
DO $$
DECLARE
    v_job RECORD;
    v_updated_count INTEGER := 0;
    v_failed_count INTEGER := 0;
BEGIN
    -- Update existing queue_jobs to have valid metadata
    FOR v_job IN
        SELECT id, job_type, metadata, status
        FROM queue_jobs
        WHERE status NOT IN ('completed', 'cancelled', 'failed')
    LOOP
        BEGIN
            -- Fix metadata based on job type
            CASE v_job.job_type
                WHEN 'generate_daily_brief' THEN
                    -- Ensure required fields exist for daily brief jobs
                    IF v_job.metadata IS NULL OR
                       NOT (v_job.metadata ? 'briefDate' AND v_job.metadata ? 'timezone') THEN

                        UPDATE queue_jobs
                        SET metadata = COALESCE(v_job.metadata, '{}'::JSONB) ||
                            jsonb_build_object(
                                'briefDate', COALESCE(
                                    v_job.metadata->>'briefDate',
                                    v_job.metadata->>'brief_date',
                                    TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
                                ),
                                'timezone', COALESCE(
                                    v_job.metadata->>'timezone',
                                    v_job.metadata->>'time_zone',
                                    'UTC'
                                )
                            )
                        WHERE id = v_job.id;

                        v_updated_count := v_updated_count + 1;
                    END IF;

                WHEN 'generate_phases' THEN
                    -- Ensure projectId exists
                    IF v_job.metadata IS NULL OR NOT v_job.metadata ? 'projectId' THEN
                        -- Try to get projectId from various possible fields
                        IF v_job.metadata ? 'project_id' THEN
                            UPDATE queue_jobs
                            SET metadata = v_job.metadata ||
                                jsonb_build_object('projectId', v_job.metadata->>'project_id')
                            WHERE id = v_job.id;
                            v_updated_count := v_updated_count + 1;
                        ELSIF v_job.metadata ? 'projectID' THEN
                            UPDATE queue_jobs
                            SET metadata = v_job.metadata ||
                                jsonb_build_object('projectId', v_job.metadata->>'projectID')
                            WHERE id = v_job.id;
                            v_updated_count := v_updated_count + 1;
                        ELSE
                            -- Can't fix without projectId - skip this job
                            v_failed_count := v_failed_count + 1;
                        END IF;
                    END IF;

                WHEN 'onboarding_analysis' THEN
                    -- Ensure userId exists
                    IF v_job.metadata IS NULL OR NOT v_job.metadata ? 'userId' THEN
                        IF v_job.metadata ? 'user_id' THEN
                            UPDATE queue_jobs
                            SET metadata = v_job.metadata ||
                                jsonb_build_object('userId', v_job.metadata->>'user_id')
                            WHERE id = v_job.id;
                            v_updated_count := v_updated_count + 1;
                        END IF;
                    END IF;

                ELSE
                    -- Other job types don't require specific metadata
                    NULL;
            END CASE;

        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error processing job %: %', v_job.id, SQLERRM;
            v_failed_count := v_failed_count + 1;
        END;
    END LOOP;

    RAISE NOTICE 'Updated % jobs, failed to update % jobs', v_updated_count, v_failed_count;
END $$;

-- Drop existing constraint if it exists
ALTER TABLE queue_jobs
DROP CONSTRAINT IF EXISTS valid_job_metadata;

-- Add comprehensive metadata validation constraint (more lenient version)
ALTER TABLE queue_jobs
ADD CONSTRAINT valid_job_metadata CHECK (
    CASE
        -- Daily brief jobs must have required metadata (accepting both camelCase and snake_case)
        WHEN job_type = 'generate_daily_brief' THEN
            metadata IS NOT NULL AND
            (metadata ? 'briefDate' OR metadata ? 'brief_date') AND
            (metadata ? 'timezone' OR metadata ? 'time_zone') AND
            -- Validate date format (YYYY-MM-DD) - check both field names
            (
                (metadata ? 'briefDate' AND (metadata->>'briefDate') ~ '^\d{4}-\d{2}-\d{2}$') OR
                (metadata ? 'brief_date' AND (metadata->>'brief_date') ~ '^\d{4}-\d{2}-\d{2}$')
            ) AND
            -- Ensure timezone is not empty - check both field names
            (
                (metadata ? 'timezone' AND length(metadata->>'timezone') > 0) OR
                (metadata ? 'time_zone' AND length(metadata->>'time_zone') > 0)
            )

        -- Phase generation jobs must have projectId (accepting various field names)
        WHEN job_type = 'generate_phases' THEN
            metadata IS NOT NULL AND
            (metadata ? 'projectId' OR metadata ? 'project_id' OR metadata ? 'projectID') AND
            -- Validate that projectId exists and is not empty (relaxed UUID validation)
            (
                (metadata ? 'projectId' AND length(metadata->>'projectId') > 0) OR
                (metadata ? 'project_id' AND length(metadata->>'project_id') > 0) OR
                (metadata ? 'projectID' AND length(metadata->>'projectID') > 0)
            )

        -- Onboarding analysis jobs must have userId (accepting both camelCase and snake_case)
        WHEN job_type = 'onboarding_analysis' THEN
            metadata IS NOT NULL AND
            (metadata ? 'userId' OR metadata ? 'user_id') AND
            -- If step is provided, it must be valid
            (NOT metadata ? 'step' OR metadata->>'step' IN ('initial', 'preferences', 'complete'))

        -- Calendar sync jobs must have calendarId (accepting various field names)
        WHEN job_type = 'sync_calendar' THEN
            metadata IS NOT NULL AND
            (metadata ? 'calendarId' OR metadata ? 'calendar_id') AND
            -- If syncDirection is provided, it must be valid (check both field names)
            (NOT (metadata ? 'syncDirection' OR metadata ? 'sync_direction') OR
             COALESCE(metadata->>'syncDirection', metadata->>'sync_direction') IN ('to_google', 'from_google', 'bidirectional'))

        -- Brain dump process jobs must have brainDumpId (accepting various field names)
        WHEN job_type = 'process_brain_dump' THEN
            metadata IS NOT NULL AND
            (metadata ? 'brainDumpId' OR metadata ? 'brain_dump_id') AND
            -- If processMode is provided, it must be valid (check both field names)
            (NOT (metadata ? 'processMode' OR metadata ? 'process_mode') OR
             COALESCE(metadata->>'processMode', metadata->>'process_mode') IN ('full', 'quick'))

        -- Email jobs must have recipientUserId and emailType (accepting various field names)
        WHEN job_type = 'send_email' THEN
            metadata IS NOT NULL AND
            (metadata ? 'recipientUserId' OR metadata ? 'recipient_user_id' OR metadata ? 'user_id') AND
            (metadata ? 'emailType' OR metadata ? 'email_type') AND
            COALESCE(metadata->>'emailType', metadata->>'email_type') IN ('daily_brief', 'welcome', 'trial_ending', 'payment_failed', 'weekly_summary')

        -- Other job types have optional metadata
        ELSE TRUE
    END
);

-- Add constraint to ensure status transitions are valid
ALTER TABLE queue_jobs
DROP CONSTRAINT IF EXISTS valid_status_transition;

-- Function to validate status transitions
CREATE OR REPLACE FUNCTION validate_queue_job_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- If this is a new record, any status is allowed
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    -- Check valid status transitions
    IF OLD.status != NEW.status THEN
        -- From pending, can go to processing, cancelled, or failed
        IF OLD.status = 'pending' AND NEW.status NOT IN ('processing', 'cancelled', 'failed') THEN
            RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
        END IF;

        -- From processing, can go to completed, failed, cancelled, or retrying
        IF OLD.status = 'processing' AND NEW.status NOT IN ('completed', 'failed', 'cancelled', 'retrying') THEN
            RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
        END IF;

        -- From retrying, can go to processing, failed, or cancelled
        IF OLD.status = 'retrying' AND NEW.status NOT IN ('processing', 'failed', 'cancelled') THEN
            RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
        END IF;

        -- Completed, failed, and cancelled are terminal states (no transitions allowed)
        IF OLD.status IN ('completed', 'failed', 'cancelled') AND OLD.status != NEW.status THEN
            RAISE EXCEPTION 'Cannot transition from terminal status %', OLD.status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for status transition validation
DROP TRIGGER IF EXISTS validate_queue_job_status_transition_trigger ON queue_jobs;
CREATE TRIGGER validate_queue_job_status_transition_trigger
BEFORE UPDATE ON queue_jobs
FOR EACH ROW
EXECUTE FUNCTION validate_queue_job_status_transition();

-- Add index for better query performance on job_type and status
CREATE INDEX IF NOT EXISTS idx_queue_jobs_type_status
ON queue_jobs(job_type, status)
WHERE status IN ('pending', 'processing', 'retrying');

-- Add index for scheduled jobs
CREATE INDEX IF NOT EXISTS idx_queue_jobs_scheduled
ON queue_jobs(scheduled_for, status)
WHERE status = 'pending';

-- Function to validate and fix existing job metadata
CREATE OR REPLACE FUNCTION fix_invalid_queue_job_metadata()
RETURNS TABLE(
    fixed_count INTEGER,
    failed_count INTEGER,
    details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_fixed_count INTEGER := 0;
    v_failed_count INTEGER := 0;
    v_details JSONB := '[]'::JSONB;
    v_job RECORD;
BEGIN
    -- Find jobs with invalid metadata
    FOR v_job IN
        SELECT id, job_type, metadata
        FROM queue_jobs
        WHERE status NOT IN ('completed', 'cancelled')
    LOOP
        BEGIN
            -- Fix common metadata issues
            CASE v_job.job_type
                WHEN 'generate_daily_brief' THEN
                    -- Ensure required fields exist
                    IF v_job.metadata IS NULL OR
                       NOT v_job.metadata ? 'briefDate' OR
                       NOT v_job.metadata ? 'timezone' THEN

                        UPDATE queue_jobs
                        SET metadata = COALESCE(v_job.metadata, '{}'::JSONB) ||
                            jsonb_build_object(
                                'briefDate', COALESCE(v_job.metadata->>'briefDate', TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')),
                                'timezone', COALESCE(v_job.metadata->>'timezone', 'UTC')
                            )
                        WHERE id = v_job.id;

                        v_fixed_count := v_fixed_count + 1;
                        v_details := v_details || jsonb_build_object('id', v_job.id, 'action', 'fixed_metadata');
                    END IF;

                WHEN 'generate_phases' THEN
                    -- Check for projectId
                    IF v_job.metadata IS NULL OR NOT v_job.metadata ? 'projectId' THEN
                        -- Can't fix without projectId, mark as failed
                        UPDATE queue_jobs
                        SET status = 'failed',
                            error_message = 'Missing required projectId in metadata'
                        WHERE id = v_job.id;

                        v_failed_count := v_failed_count + 1;
                        v_details := v_details || jsonb_build_object('id', v_job.id, 'action', 'marked_failed');
                    END IF;

                ELSE
                    -- Other job types don't require specific metadata
                    NULL;
            END CASE;

        EXCEPTION WHEN OTHERS THEN
            v_failed_count := v_failed_count + 1;
            v_details := v_details || jsonb_build_object(
                'id', v_job.id,
                'action', 'error',
                'message', SQLERRM
            );
        END;
    END LOOP;

    RETURN QUERY
    SELECT v_fixed_count, v_failed_count, v_details;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION validate_queue_job_status_transition() TO authenticated;
GRANT EXECUTE ON FUNCTION fix_invalid_queue_job_metadata() TO authenticated;

-- Add comment documentation
COMMENT ON CONSTRAINT valid_job_metadata ON queue_jobs IS
'Ensures job metadata contains required fields based on job_type';

COMMENT ON FUNCTION validate_queue_job_status_transition() IS
'Validates that queue job status transitions follow allowed paths';

COMMENT ON FUNCTION fix_invalid_queue_job_metadata() IS
'Utility function to fix or mark as failed jobs with invalid metadata';

-- Check if any rows would violate the constraint before applying it
DO $$
DECLARE
    v_violating_rows INTEGER;
    v_sample_violations TEXT;
BEGIN
    -- Count rows that would violate the constraint
    SELECT COUNT(*) INTO v_violating_rows
    FROM queue_jobs
    WHERE status NOT IN ('completed', 'cancelled', 'failed')
    AND NOT (
        CASE
            WHEN job_type = 'generate_daily_brief' THEN
                metadata IS NOT NULL AND
                (metadata ? 'briefDate' OR metadata ? 'brief_date') AND
                (metadata ? 'timezone' OR metadata ? 'time_zone')
            WHEN job_type = 'generate_phases' THEN
                metadata IS NOT NULL AND
                (metadata ? 'projectId' OR metadata ? 'project_id' OR metadata ? 'projectID')
            WHEN job_type = 'onboarding_analysis' THEN
                metadata IS NOT NULL AND
                (metadata ? 'userId' OR metadata ? 'user_id')
            WHEN job_type = 'sync_calendar' THEN
                metadata IS NOT NULL AND
                (metadata ? 'calendarId' OR metadata ? 'calendar_id')
            WHEN job_type = 'process_brain_dump' THEN
                metadata IS NOT NULL AND
                (metadata ? 'brainDumpId' OR metadata ? 'brain_dump_id')
            WHEN job_type = 'send_email' THEN
                metadata IS NOT NULL AND
                (metadata ? 'recipientUserId' OR metadata ? 'recipient_user_id' OR metadata ? 'user_id') AND
                (metadata ? 'emailType' OR metadata ? 'email_type')
            ELSE TRUE
        END
    );

    IF v_violating_rows > 0 THEN
        -- Get sample of violating rows for debugging
        SELECT string_agg(
            format('Job ID: %s, Type: %s, Metadata: %s',
                   id::text,
                   job_type::text,
                   COALESCE(metadata::text, 'NULL')
            ),
            E'\n'
        ) INTO v_sample_violations
        FROM (
            SELECT id, job_type, metadata
            FROM queue_jobs
            WHERE status NOT IN ('completed', 'cancelled', 'failed')
            AND NOT (
                CASE
                    WHEN job_type = 'generate_daily_brief' THEN
                        metadata IS NOT NULL AND
                        (metadata ? 'briefDate' OR metadata ? 'brief_date') AND
                        (metadata ? 'timezone' OR metadata ? 'time_zone')
                    WHEN job_type = 'generate_phases' THEN
                        metadata IS NOT NULL AND
                        (metadata ? 'projectId' OR metadata ? 'project_id' OR metadata ? 'projectID')
                    WHEN job_type = 'onboarding_analysis' THEN
                        metadata IS NOT NULL AND
                        (metadata ? 'userId' OR metadata ? 'user_id')
                    WHEN job_type = 'sync_calendar' THEN
                        metadata IS NOT NULL AND
                        (metadata ? 'calendarId' OR metadata ? 'calendar_id')
                    WHEN job_type = 'process_brain_dump' THEN
                        metadata IS NOT NULL AND
                        (metadata ? 'brainDumpId' OR metadata ? 'brain_dump_id')
                    WHEN job_type = 'send_email' THEN
                        metadata IS NOT NULL AND
                        (metadata ? 'recipientUserId' OR metadata ? 'recipient_user_id' OR metadata ? 'user_id') AND
                        (metadata ? 'emailType' OR metadata ? 'email_type')
                    ELSE TRUE
                END
            )
            LIMIT 5
        ) AS violations;

        RAISE WARNING 'Found % rows that would violate the constraint. Sample violations: %',
                      v_violating_rows, v_sample_violations;

        -- Try to fix these violations by marking them as failed
        UPDATE queue_jobs
        SET status = 'failed',
            error_message = 'Invalid metadata format - marked as failed during migration'
        WHERE status NOT IN ('completed', 'cancelled', 'failed')
        AND NOT (
            CASE
                WHEN job_type = 'generate_daily_brief' THEN
                    metadata IS NOT NULL AND
                    (metadata ? 'briefDate' OR metadata ? 'brief_date') AND
                    (metadata ? 'timezone' OR metadata ? 'time_zone')
                WHEN job_type = 'generate_phases' THEN
                    metadata IS NOT NULL AND
                    (metadata ? 'projectId' OR metadata ? 'project_id' OR metadata ? 'projectID')
                WHEN job_type = 'onboarding_analysis' THEN
                    metadata IS NOT NULL AND
                    (metadata ? 'userId' OR metadata ? 'user_id')
                WHEN job_type = 'sync_calendar' THEN
                    metadata IS NOT NULL AND
                    (metadata ? 'calendarId' OR metadata ? 'calendar_id')
                WHEN job_type = 'process_brain_dump' THEN
                    metadata IS NOT NULL AND
                    (metadata ? 'brainDumpId' OR metadata ? 'brain_dump_id')
                WHEN job_type = 'send_email' THEN
                    metadata IS NOT NULL AND
                    (metadata ? 'recipientUserId' OR metadata ? 'recipient_user_id' OR metadata ? 'user_id') AND
                    (metadata ? 'emailType' OR metadata ? 'email_type')
                ELSE TRUE
            END
        );

        RAISE NOTICE 'Marked % invalid jobs as failed', v_violating_rows;
    ELSE
        RAISE NOTICE 'No constraint violations found - safe to apply constraint';
    END IF;
END $$;

-- Run the fix function to clean up existing data (optional, can be run manually)
-- SELECT * FROM fix_invalid_queue_job_metadata();