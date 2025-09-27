-- Fix race condition in projects_history trigger by using atomic version numbering
-- This replaces the COUNT(*) approach with a more robust atomic increment

-- Drop the existing trigger function if it exists
DROP FUNCTION IF EXISTS save_project_version() CASCADE;

-- Create the new trigger function with atomic version numbering
CREATE OR REPLACE FUNCTION save_project_version()
RETURNS TRIGGER AS $$
DECLARE
    next_version INTEGER;
    existing_count INTEGER;
BEGIN
    -- Prevent recursion from cleanup function
    IF current_setting('app.skip_history_trigger', TRUE) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Handle INSERT operations (create initial version)
    IF TG_OP = 'INSERT' THEN
        -- Use advisory lock based on project_id to prevent race conditions for this specific project
        PERFORM pg_advisory_xact_lock(hashtext(NEW.id::text));
        
        -- Use COALESCE with MAX to handle empty table case
        SELECT COALESCE(MAX(version_number), 0) + 1 
        INTO next_version
        FROM projects_history
        WHERE project_id = NEW.id;

        INSERT INTO projects_history (
            project_id,
            version_number,
            is_first_version,
            project_data,
            created_by
        ) VALUES (
            NEW.id,
            next_version,
            (next_version = 1), -- TRUE if this is version 1, FALSE otherwise
            row_to_json(NEW)::jsonb,
            NEW.user_id
        );

    -- Handle UPDATE operations (create new version with updated data)
    ELSIF TG_OP = 'UPDATE' THEN
        -- Only save if there are actual changes in the data
        IF row_to_json(OLD)::jsonb != row_to_json(NEW)::jsonb THEN
            -- Use advisory lock based on project_id to prevent race conditions for this specific project
            PERFORM pg_advisory_xact_lock(hashtext(NEW.id::text));
            
            -- Use atomic increment without FOR UPDATE
            SELECT COALESCE(MAX(version_number), 0) + 1 
            INTO next_version
            FROM projects_history
            WHERE project_id = NEW.id;

            INSERT INTO projects_history (
                project_id,
                version_number,
                is_first_version,
                project_data,
                created_by
            ) VALUES (
                NEW.id,
                next_version,
                FALSE, -- Updates are never first version
                row_to_json(NEW)::jsonb,
                NEW.user_id
            );

            -- Get count for cleanup check (after insert to ensure accurate count)
            SELECT COUNT(*)
            INTO existing_count
            FROM projects_history
            WHERE project_id = NEW.id;

            -- Clean up history (with recursion protection)
            IF existing_count > 5 THEN
                PERFORM set_config('app.skip_history_trigger', 'true', TRUE);
                PERFORM cleanup_project_history(NEW.id);
                PERFORM set_config('app.skip_history_trigger', 'false', TRUE);
            END IF;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS projects_history_trigger ON projects;
CREATE TRIGGER projects_history_trigger
    AFTER INSERT OR UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION save_project_version();

-- Add a comment explaining the fix
COMMENT ON FUNCTION save_project_version() IS 
'Handles project history versioning with atomic version numbering to prevent race conditions. Uses advisory locks per project to ensure atomic increment of version numbers.';