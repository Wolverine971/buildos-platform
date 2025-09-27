# Preserve Historical Phases During Regeneration

## Goals

- Keep completed phase history intact when generating a fresh schedule for an in-flight project.
- Truncate any phase that overlaps "now" so it ends immediately and is marked as completed.
- Reassign completed or deleted tasks from future phases to the most recent preserved phase so completion history stays intact.
- Remove scheduled-but-not-started phases, then generate new phases that begin immediately from the current timestamp using the existing LLM flow.

## Current Observations

- `PhaseGenerationOrchestrator.handleHistoricalPreservation` already splits phases into completed/current/future buckets, but only updates `end_date` and ignores phase status/completion markers.
- Completed-task reallocation only considers `tasks.status === 'done'`; tasks that were soft-deleted (`deleted_at` set) remain orphaned or are dropped.
- When preserved phases exist, `BaseSchedulingStrategy.createPhases` shifts new phase start dates to the day after the last preserved phase, which violates the "start today" requirement.
- Prompt templates (`PromptTemplateService.buildPhaseGenerationSystemPrompt`) explicitly instruct the LLM that new phases must begin after the preserved timeline.

## Target Behavior

1. Preserve all historical phases (completed + truncated current) exactly as they stood at regeneration time.
2. If a phase overlaps the current time, cut its `end_date` to `now`, mark it completed, and treat it as the latest historical anchor.
3. Collapse all future phases:
    - Completed tasks and soft-deleted tasks that pointed to those phases should be reassigned to the latest preserved phase.
    - Incomplete (i.e., not completed and not deleted) tasks should be released so the LLM can place them into newly generated phases.
4. Newly generated phases should:
    - Start from the current timestamp (no forced 1-day gap).
    - Continue ordering after the preserved phases.
    - Respect the existing scheduling method logic and project boundary checks.
5. Phase generation prompts and context must describe the preserved timeline correctly ("new phases start now"), to keep LLM output aligned with the new behavior.

## Implementation Outline

1. **Historical Preservation Pass** (`src/lib/services/phase-generation/orchestrator.ts`):
    - Fetch phases with additional `status`, `completed_at`, and task metadata (`deleted_at`) so we can update them correctly.
    - Update each overlapping phase: set `end_date = now`, mark `status = 'completed'`, and populate `completed_at = now` (confirm actual column names; add migration if missing).
    - Extend completed/deleted task collection to include soft-deleted tasks (`deleted_at` not null) and avoid double-counting when tasks already belong to the target phase.
    - Ensure reassignment deletes the old `phase_tasks` rows before inserting into the preserved target phase and logs any skipped rows.
    - After reassignment, recalc phase completion states: mark a preserved phase as completed only if every `phase_task` pointing to it is tied to a completed or deleted task.
    - Delete remaining future phases (and their phase_tasks) once reassignments are complete.
    - Refresh `this.preservedPhases` with the updated records so downstream logic has accurate `status`, `end_date`, and ordering information.
2. **Phase Creation Adjustments** (`BaseSchedulingStrategy.createPhases`):
    - Compute the starting timestamp for new phases as `now` (or `now plus a minimal offset`) instead of `dayAfterLastPhase`.
    - Preserve duration ratios from the LLM output, but clamp start dates so they do not precede the preserved `end_date`.
    - Double-check order numbering continues from `lastPreserved.order + 1`.
3. **Prompt/Context Updates** (`PromptTemplateService`):
    - Revise preserved-phase instructions to say "new phases should begin at or after <current timestamp>" rather than "after the preserved end date".
    - Clarify that historical phases already finished as of now, so the LLM should schedule immediate next steps.
    - Include the truncated phase’s updated `end_date`/status in the preserved context.
4. **Task Selection & Reassignment Validation**:
    - Ensure `selectTasksForRegeneration` still includes all in-progress tasks after future phases are wiped.
    - Add safeguards so tasks tied to deleted phases but already marked done stay attached to the preserved history.
5. **UI Flow Review**:
    - Confirm the Schedule All Phases modal requests `preserve_historical_phases = true` (or defaults to true) and surfaces any backend errors about reassignment.
    - Decide whether we need to surface a toast summarizing how many tasks were reattached to historical phases (optional UX follow-up).

## Edge Cases & Data Considerations

- Projects without any preserved phases: skip reassignment and proceed with a fresh schedule (make sure we do not throw).
- Projects where all future-phase tasks were deleted: reassignment should silently no-op, leaving `phase_tasks` empty.
- Timezone nuances: ensure `now` is consistently generated server-side in UTC so comparisons with stored ISO strings are reliable.
- If the schema currently lacks `status`/`completed_at` on `phases`, coordinate a migration and update generated types (`database.types.ts`).

## Testing Plan

- **Unit coverage**: add focused tests for `handleHistoricalPreservation` (mock Supabase client) to validate phase truncation, task reassignment, and future phase deletion branches.
- **Integration/manual**:
    - Seed a project with completed/current/future phases, including completed and deleted tasks in future phases; run regeneration and confirm new timeline + historical integrity.
    - Verify tasks previously in future phases now appear under the preserved phase and retain completion metadata.
    - Confirm new phases start on the regeneration date with correct order numbers.
    - Re-run regeneration when there are no current phases to confirm graceful behavior.
- **Regression**: ensure first-time generation (no existing phases) still works and that calendar-optimized paths continue to function.
