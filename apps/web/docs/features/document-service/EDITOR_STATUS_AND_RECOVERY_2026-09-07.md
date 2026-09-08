<!-- apps/web/docs/features/document-service/EDITOR_STATUS_AND_RECOVERY_2026-09-07.md -->

# Document editor: current state and recovery

**Reviewed:** 2026-09-07. Code review, read-only production trigger inspection, a disposable
PostgreSQL reproduction, and focused UI/API regression tests. This is not a completed production
rollout or a new seven-step implementation commitment.

## What caused the false conflict

The proposal foundation added the stored generated `onto_documents.content_hash` column on
2026-08-27. The existing `update_onto_documents_updated_at()` BEFORE UPDATE trigger excluded
`search_vector` from whole-row comparisons, but not the new generated hash. Generated values
are computed after BEFORE triggers, so an outline-only update failed the equality test and
advanced `updated_at` as though someone edited the document.

The normal save path made this visible without another editor:

1. `writeDocumentHeadAndVersion()` writes the authored document and captures its returned timestamp.
2. Versioning calls `persistDocumentOutline()` and updates the derived outline.
3. The broken trigger advances the document timestamp again.
4. The browser receives the timestamp from step 1. Its next guarded save receives HTTP 409.

The linked production function was inspected on 2026-09-07 and has this exact missing exclusion.
The disposable PostgreSQL test fails against that function with
`Outline maintenance invalidated the loaded save token`, then passes after the new migration.
[PostgreSQL's generated-column timing documentation](https://www.postgresql.org/docs/current/ddl-generated-columns.html)
explains the underlying trigger constraint.

## Changes prepared in this update

- The header Brain Bolt opens the full `AgentChatModal` with `focusType: 'document'`, the active
  document ID, and its project. Document Interact remains the inline workbench. Both use the
  existing document-mutation refresh/conflict handling; stale document sessions cannot open chat.
- The migration `20260907162504_fix_document_content_hash_recency_guard.sql` excludes
  `content_hash` in both recency comparisons. It changes no authored content, history rows, or
  access policies. It also restores the preexisting START HERE managed-region recency behavior.
- Actual conflicts keep local edits intact and pause autosave, including after further typing.
  Ordinary Save cannot bypass the conflict. Explicit Overwrite bypasses the timestamp for that
  single request; a failed overwrite leaves the editor paused and retains its previous token.
- Reload only clears a conflict after a successful load. A newer agent mutation cannot be cleared
  by an older in-flight save response. The fallback chat-close path also pauses conflicting edits.
- A modal that closes while focus setup is awaiting a render no longer focuses a removed element.

**Deployment:** The migration was applied only to a disposable local PostgreSQL instance during
this review. The web changes and migration still need their normal production rollout. An open
editor holding a timestamp from before the fix can still require an explicit conflict resolution.

## Where the larger effort stands

The [revised roadmap](./SWITCHING_BAR_AND_REVISED_ROADMAP_2026-08-26.md) is the intended sequence.
The README's original “Steps 1 and 1.5 complete” statement described implementation at the time;
it did not protect against the later generated-column regression.

| Step                                      | Current evidence                                                                                                                                                            | Remaining work                                                                                                                                                                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 / 1.5: save trust and shared writes     | Shared guarded head/version writes, timestamp CAS, version-history warnings, explicit Save checkpoints, and document mutation events exist.                                 | Roll out this regression fix. Head and version are still separate writes; full transaction atomicity is unfinished.                                                                                                                                                         |
| 2: select → ask → proposal → diff → apply | `DocumentProposalReview`, proposal endpoints/service, shared anchor/patch kernel, voice/typed instructions, guarded apply, and forced revisions exist.                      | Complete the documented browser/E2E rollout, including selection/cursor preservation, slow saves, conflicts, voice interruption, and mobile use. The handoff still calls production observation pending.                                                                    |
| 3: START HERE live index                  | Overview memory projection, missing-document recovery, snapshot worker, and managed regions exist. The Sept 4 migration improved canonical selection with explicit markers. | `ensureProjectStartHereDocument()` still reads then inserts; atomic one-live-document creation is not established here. Structured current/stale/missing indexing and mutation-trigger coverage remain open. Historical backfill counts were not remeasured in this review. |
| 4: find and organize                      | Document tree, general ontology search, export, and direct document pages provide useful existing pieces.                                                                   | The planned complete document discovery/views/bulk-action workflow and rendering/mobile audit have not been signed off.                                                                                                                                                     |
| 5: ontology interactions                  | Linked entities, reference parsing, and mention notifications exist.                                                                                                        | The planned editor entity picker/chips and checklist-to-task interaction are not complete as a coherent flow.                                                                                                                                                               |
| 6: import                                 | The document export paths exist.                                                                                                                                            | No document preview/commit importer was found for `.md`, `.txt`, or `.docx`.                                                                                                                                                                                                |
| 7: collaboration                          | Optimistic conflict detection and comments exist.                                                                                                                           | Presence, section claims, and live multi-person coediting are not implemented by these safeguards. The warning was not evidence that realtime collaboration was complete.                                                                                                   |

A second relevant plan is
[`tasker/48-document-modal-decomposition.md`](../../../../../tasker/48-document-modal-decomposition.md).
It was explicitly deferred, not lost. The modal still owns session state, network calls, public-page
workflows, and presentation in roughly 4,800 lines. This update fixes the immediate failures;
it does not execute the entire decomposition plan.

## Next bounded completion pass

1. Roll out the timestamp migration and web changes, then exercise two consecutive autosaves on
   one real document and a real second-editor conflict.
2. Finish Step 2's interaction acceptance pass: save → select → type/speak → review → apply →
   history/restore, plus typing during slow saves, agent edits against dirty text, and narrow screens.
3. Use those concrete failure cases to extract the document-session/autosave controller described
   in task 48 before adding more editor behavior. Keep the user-facing interaction unchanged.
4. Resume Step 3's atomic creation and index maintenance work. Keep import and realtime coediting
   explicitly separate from finishing the existing editor interaction.

## Validation

- PostgreSQL: the regression probe fails with the old trigger and passes with the new one. It
  checks outline-only writes, consecutive guarded saves, generated hash refresh, stale authors,
  authored metadata changes, and managed versus authored START HERE edits.
- UI/API: **21 tests passed** across document-modal, document-agent-mutation, and PATCH concurrency. They cover
  Brain Bolt focus, conflict pause, failed overwrite, serialized autosaves, and write-time races.
- Required `pnpm --filter @buildos/web check`: **0 errors, 0 warnings**.
- Svelte autofixer: Modal has no issues; DocumentModal's existing raw-HTML advisory points to
  `renderMarkdown(preview.content)`, which sanitizes the result. Existing structural suggestions
  remain part of the deferred decomposition. Formatting and `git diff --check` pass.

The SQL probe is `supabase/tests/20260907162504_document_recency_guard.test.sql`; it operates on a
temporary table using the installed trigger function and rolls back. The reproduction used a
separate local PostgreSQL instance, never real user documents.
