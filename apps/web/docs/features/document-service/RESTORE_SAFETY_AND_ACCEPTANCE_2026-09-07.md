<!-- apps/web/docs/features/document-service/RESTORE_SAFETY_AND_ACCEPTANCE_2026-09-07.md -->

# Document restore safety and acceptance

**Date:** 2026-09-07. Continuation of the [Step 2 editor pass](./STEP_2_EDITOR_ACCEPTANCE_2026-09-07.md).

## What changed

Version restore previously wrote the document directly, checked only the latest history number,
and inserted a restore row without retrying version-number collisions. A concurrent edit could be
overwritten even when it remained within the same autosave version. A failed restore-history write
was returned as an ordinary success.

The restore flow now:

1. Waits for any in-flight save, then saves a forced recovery checkpoint containing the current
   editor buffer. It stops if saving or writing that checkpoint fails.
2. Sends the checkpoint's exact document timestamp and the reviewed version's snapshot hash.
3. Uses the shared guarded head/version writer. A changed head or reviewed snapshot returns a
   conflict. Older clients retain their history-number precondition and also receive a write-time
   head guard based on the server's access read.
4. Creates a restore checkpoint through the shared version allocator, including collision retry,
   snapshot hashing, outline refresh, and restore provenance. If the head commits but history
   fails, the API and UI surface the existing saved-without-history warning.
5. Keeps ordinary saves, document edits, and dismissal locked through restore and refresh. The
   editor reopens with restored content and keyboard focus; failed refreshes are reported clearly.

Restore checkpoints are sealed: a later autosave creates a new version rather than changing the
restored snapshot. Version listings also show them as sealed. Historical props cannot overwrite
server-owned `agent_workspace` routing state. Archive/tree transitions remain with the dedicated
archive commands; version restore rejects attempts to bypass them.

No schema changes or production writes were made in this pass. Head and history writes remain
separate transactions under the existing warning contract; this does not claim full atomicity.

## Verification

- **39 web tests passed:** restore route (8), restore dialog (6), document modal (19), version
  listing route (5), and history panel (1).
- **13 shared tests passed:** version allocator and guarded document writer, including restore
  provenance, contention, unchanged-content restore, and subsequent autosave boundaries.
- The shared package build and declaration generation completed successfully.
- Required `pnpm --filter @buildos/web check`: **0 errors, 0 warnings**.
- Svelte component analysis reports no issues in the restore dialog. The parent modal retains
  its existing sanitized Markdown rendering advisory and structural suggestions.

Regression cases include dirty edits before restore, forced-checkpoint failure, stale timestamps,
write-time races, a changed reviewed snapshot, late responses after switching documents, admin
access enforcement, malformed requests, and history-write warnings.

### Browser acceptance

The real document, comparison, history, and restore components were tested with synthetic API
responses at **1440 × 1000** and **390 × 844**. The fixture blocks external API requests.

- Added a note, reviewed an earlier version, and restored it. The forced checkpoint was written
  before the restore request, using the returned document timestamp.
- Reopened history, compared the recovery checkpoint against the current document, and restored
  that checkpoint. The note returned intact; both restore entries remained in history.
- Both restores returned keyboard focus to the editor. The phone view had no page-level horizontal
  overflow, and the browser reported no errors.

Evidence and the archived fixture are in `output/playwright/document-restore/`. The fixture was
removed from application source and static assets after the check. These results verify the UI
contract; they do not prove live database persistence.

## Production observation

A read-only check in this pass found that the production
`update_onto_documents_updated_at()` function now excludes `content_hash` in both recency
comparisons. The prepared migration version `20260907162504` was absent from the migration ledger
at that check. Reconcile the deployment record before treating the earlier migration as pending
work or claiming a fully verified rollout. This pass did not apply or ledger-align a migration.

## Remaining acceptance

Use a disposable real document to verify this flow through the deployed API and database, including
restore history persistence and later autosaves. Live proposal/model, physical microphone, and
production telemetry acceptance also remain. The synthetic browser fixture is not evidence that
those production gates passed.
