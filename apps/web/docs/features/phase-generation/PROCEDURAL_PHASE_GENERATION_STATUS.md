<!-- apps/web/docs/features/phase-generation/PROCEDURAL_PHASE_GENERATION_STATUS.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2025-12-09; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Procedural Phase Generation – Implementation Status (October 2025)

This document captures the current status of the procedural phase-generation redesign, summarizes what has been implemented, and outlines the remaining work needed to satisfy the full specification (`thoughts/shared/research/2025-10-12_22-51-12_phase-generation-procedural-redesign-spec.md`).

---

## ✅ Delivered In This Iteration

### Database & Types

- Added `phase_tasks.order` column with backfill, index, and shared-type updates (`20251012_add_order_to_phase_tasks.sql`).
- Added organizer/attendee metadata to `task_calendar_events` plus type coverage (`20251012_add_calendar_event_organizer_fields.sql`).

### Calendar Service Enhancements

- `scheduleTask` and `updateCalendarEvent` now persist organizer and attendee data.
- Update API supports `sendUpdates` and mirrors remote changes back into Supabase.
- Graceful fallback if an update fails (stale or deleted events): cleans up stale rows and re-creates the event.

### Procedural Pipeline (New Entry Point)

- Introduced `generatePhasesProcedural` in `apps/web/src/lib/services/phase-generation/generate-phases-procedural.ts` with the step-by-step flow described in the spec.
- Integrated feature flag + request opt-in and legacy fallback in `/api/projects/[id]/phases/generate/+server.ts`.

Key flow elements:

1. **Validation & Data fetch** – single query for project, tasks, phases; regeneration detection.
2. **Historical handling** – completed/current phases preserved, future phases removed via helper that deletes associated `phase_tasks`.
3. **Task reset** – unfinished tasks cleared (skipping sensitive recurring events).
4. **LLM Call 1** – generates high-level phases and task grouping.
5. **Task assignment normalization** – ensures each task appears once; unassigned tasks flow into a fallback phase.
6. **LLM Call 2** – orders tasks using explicit schema guidance.
7. **Persistence** – old phase assignments for targeted tasks removed before inserting new phases/phase_tasks.
8. **Time slot scheduling** – reuses TaskTimeSlotFinder’s new `findNextAvailableSlot`.
9. **Calendar handling** – update/clear modes respect ownership and attendee rules.
10. **Result packaging** – returns normalized shapes compatible with existing UI/notifications.

### Prompt Work

- Added dedicated procedural prompts for both LLM calls with explicit instructions and formatting expectations, including “work from now through project end” guidance.

### Safety Measures & Utilities

- Central helper for phase deletion to ensure referential cleanup.
- Normalized handling of unassigned or duplicate tasks after LLM call.
- Enhanced TaskTimeSlotFinder with single-slot lookup used by calendar-optimized flow.

---

## 🔄 Still Outstanding

These items remain open to fully match the specification and existing checklist:

### Tests & Quality Gates

- Unit tests for each procedural helper (validation, loaders, resets, calendar handling).
- Integration test harness for `generatePhasesProcedural` with mock LLM.
- LLM prompt “quality” tests (`pnpm run test:llm`) and guardrails.
- Resolve failing ESLint invocation (`Minimatch expand` error) and re-run full lint/test suite.

### Feature Completeness

- UI/UX updates to surface the new `order` field (timeline, board views, drag-and-drop adjustments).
- Documentation updates referenced in the spec (architecture diagrams, README refresh).
- Feature flag rollout plan (currently configurable, but no staged rollout script/ops docs).
- Backfill script for organizer/attendee metadata on existing `task_calendar_events` (not yet implemented).
- Optional: partial regeneration controls, manual reorder UI, confidence score (future enhancements from “Questions for Future Consideration”).

### Operational Tasks

- Run the new migrations across environments and regenerate shared types (`pnpm run gen:types`) once merged.
- Verify Supabase RLS grants or policies remain valid after new columns (no policy changes were required yet).
- Update onboarding/runbooks to document the new API flag (`USE_PROCEDURAL_PHASE_GENERATION`) and request body switch `use_procedural`.

---

## How To Exercise the New Flow

1. **Migrations** – apply `20251012_add_order_to_phase_tasks.sql` and `20251012_add_calendar_event_organizer_fields.sql`.
2. **Type Sync** – run `pnpm run gen:types` if shared-types consumers require refresh.
3. **Enable** – set `USE_PROCEDURAL_PHASE_GENERATION=true` or send `{"use_procedural": true}` in the POST body.
4. **Invoke** – call `POST /api/projects/{id}/phases/generate` as usual; payload mirrors the legacy orchestrator.
5. **Verify** – inspect Supabase tables (`phase_tasks.order`, `task_calendar_events.organizer_*`, `attendees`) and UI behavior.

---

## Appendix: File Touchpoints

- `apps/web/src/lib/services/phase-generation/generate-phases-procedural.ts`
- `apps/web/src/lib/services/promptTemplate.service.ts`
- `apps/web/src/lib/services/task-time-slot-finder.ts`
- `apps/web/src/lib/services/calendar-service.ts`
- `apps/web/src/routes/api/projects/[id]/phases/generate/+server.ts`
- `packages/shared-types/src/database.schema.ts`
- `supabase/migrations/20251012_add_order_to_phase_tasks.sql`
- `supabase/migrations/20251012_add_calendar_event_organizer_fields.sql`

---

For any new development, reference this checklist, update the outstanding items, and expand the documentation with implementation details, testing results, and rollout notes as they become available.
