<!-- docs/technical/reviews/2025-12-31-recent-changes-review.md -->

# Recent Changes Review (last 24 hours)

## Progress

- 2025-12-31: Fixed all findings (decision API validation, error logger scoping, voice send pending flag, decision datetime-local formatting, reversed decision state option, spec alignments).
- Remaining: None.

## Code Findings

- High: Decision create/update can throw 500 on non-string fields.
    - Impact: Passing non-string values for description/outcome/rationale causes TypeError on .trim(), returning 500 instead of 400.
    - Evidence: `apps/web/src/routes/api/onto/decisions/+server.ts:176-186`, `apps/web/src/routes/api/onto/decisions/[id]/+server.ts:158-167`.
    - Fix: Validate string types before trimming (or coerce safely), and return 400 on invalid input.

- Medium: ErrorLoggerService caches a per-request Supabase client in a process-wide singleton.
    - Impact: Subsequent requests can log with the wrong auth context (RLS failures or mis-attributed logs).
    - Evidence: `apps/web/src/lib/services/errorLogger.service.ts:13-28`.
    - Fix: Use per-request instances or cache by auth key/session rather than a single static instance.

- Medium: Send-while-recording flow can leave the UI stuck if transcription yields empty text.
    - Impact: `pendingSendAfterTranscription` stays true when transcription fails/returns empty, and `isSendDisabled` remains true, blocking sends until a non-empty input appears (and then auto-sends unexpectedly).
    - Evidence: `apps/web/src/lib/components/agent/AgentChatModal.svelte:1683-1704`.
    - Fix: Clear `pendingSendAfterTranscription` on transcription completion if input is empty or an error occurs, and surface a cancel path.

- Medium: DecisionEditModal uses UTC conversion for a `datetime-local` input.
    - Impact: Users in non-UTC timezones will see shifted times and can unknowingly change `decision_at` when saving without edits.
    - Evidence: `apps/web/src/lib/components/ontology/DecisionEditModal.svelte:124-157`.
    - Fix: Format and parse `datetime-local` in local time (or store and display with timezone offsets explicitly).

- Low: DecisionCreateModal does not include the `reversed` state option.
    - Impact: Users cannot create a decision in the `reversed` state even though it is part of the supported state machine.
    - Evidence: `apps/web/src/lib/components/ontology/DecisionCreateModal.svelte:34-38`, `apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md:237-242`.
    - Fix: Add `reversed` to the create state list or clarify spec intent.

## Spec Findings

- Low: Project context spec conflicts on whether risks include `created_at`.
    - Impact: Formatting rules require `created_at` for all entities, but the Risks section says title + id only.
    - Evidence: `docs/specs/PROJECT_CONTEXT_ENRICHMENT_SPEC.md:60-62`, `docs/specs/PROJECT_CONTEXT_ENRICHMENT_SPEC.md:102-105`.
    - Fix: Clarify the risk summary format (either include `created_at` or update the formatting rules).

- Low: Integration spec lists a task state (`cancelled`) that is not supported by current enums.
    - Impact: External integrators may expect a state that does not exist in the API.
    - Evidence: `apps/web/docs/features/integrations/INTEGRATION_OFFERINGS_SPEC.md:101-103`, `apps/web/src/lib/types/onto.ts:16-18`.
    - Fix: Update the spec to match current states or add `cancelled` to the task state enum and database.
