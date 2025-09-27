# Database Migrations

## 001_add_phases_generation.sql

This migration adds support for AI-generated project phases following the same pattern as brief generation.

### Changes:

1. **Renames `brief_generation_jobs` to `queue_jobs`**
   - Makes the job tracking table generic for all job types
   - Adds `metadata` JSONB column for job-specific data
   - Adds indexes for better performance

2. **Creates `project_phases_generation` table**
   - Tracks the overall phases generation job for a project
   - Stores generation status, progress, and results
   - Similar to `daily_briefs` table pattern

3. **Creates `generated_phases` table**
   - Stores individual phase suggestions
   - Includes suggested timing, objectives, deliverables
   - Links to actual phases once approved
   - Similar to `project_daily_briefs` pattern

4. **Creates `generated_phase_tasks` table**
   - Stores AI suggestions for task-to-phase assignments
   - Includes confidence scores and reasoning
   - Allows selective approval of suggestions

5. **Adds `approve_generated_phases()` function**
   - Converts approved AI suggestions into actual phase records
   - Handles task assignments
   - Ensures data integrity

### Usage Pattern:

1. When phases generation is triggered:
   - Create job in `queue_jobs` with `job_type = 'project_phases'`
   - Create record in `project_phases_generation`

2. During generation:
   - Update progress in `project_phases_generation`
   - Store results in `phases_data` JSON

3. After generation:
   - Create individual records in `generated_phases`
   - Create task suggestions in `generated_phase_tasks`

4. User approval:
   - Call `approve_generated_phases()` to create actual phases
   - System creates records in `phases` and `phase_tasks` tables

### Rollback:

To rollback this migration, run `001_add_phases_generation_rollback.sql`

### Running the Migration:

In Supabase:

1. Go to SQL Editor
2. Paste the migration SQL
3. Run the query
4. Verify with: `SELECT * FROM queue_jobs LIMIT 1;`
