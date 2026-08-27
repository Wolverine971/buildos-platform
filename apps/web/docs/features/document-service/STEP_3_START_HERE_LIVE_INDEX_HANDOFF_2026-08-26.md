<!-- apps/web/docs/features/document-service/STEP_3_START_HERE_LIVE_INDEX_HANDOFF_2026-08-26.md -->

# Step 3 START HERE live index — implementation handoff

**Date:** 2026-08-27
**Status:** In progress; live projection, production coverage backfill, and missing-index recovery implemented and tested.
**Roadmap scope:** Switching Bar 3.1 and 3.4.

## Kernel

START HERE is the project README that Google Drive does not have. It must answer, without requiring
a search session: what this project is, what is happening now, what should happen next, where the
detail lives, and whether that answer is current.

There is one canonical source: the `document.context.project` document. UI cards, agent context,
briefs, and external tools may project it, but they must not create a second persistent summary that
can drift independently.

## What already existed

- START HERE creation and canonical selection.
- Human/agent-authored sections plus machine-owned `managed:status` and `managed:map` regions.
- Deterministic region rendering, merging, preservation, and generic-patch protection.
- A project-context snapshot worker that renders task/milestone/next-step status and the document
  tree map.
- Prompt-safe extraction and external-agent project orientation.
- Project data loading and a Brief / Start Here modal that renders the full canonical document.
- Status parsing and orientation extraction for both current template dialects.

Step 3 is therefore a quality, visibility, and maintenance problem—not a new document model.

## Production baseline checked 2026-08-26

Read-only production counts:

| Measure                                               | Count |
| ----------------------------------------------------- | ----: |
| Live `document.context.project` documents             |   118 |
| Projects represented by those documents               |   103 |
| Documents with a managed status region                |    81 |
| Documents with at least one recorded snapshot refresh |    25 |
| Managed documents without a recorded snapshot footer  |    56 |

The first user-facing slice must therefore degrade honestly. It says **Not refreshed yet** instead
of presenting template placeholders as project truth.

The existing backfill utility first ran in its default read-only mode. It found 55 untouched
`State: Unknown` placeholders across 55 projects: 53 had a resolvable user and two fixture-like
projects did not. The 56th no-footer document contains meaningful older status and is intentionally
outside this placeholder-only backfill.

The target-selection audit found no ambiguity: all 55 placeholders are the only live context
document in their project, and none would be displaced by a newer explicit START HERE candidate.

## Production backfill completed 2026-08-27

The audited backfill was applied after explicit approval. Production verification—not only queue
status—found:

| Result                                                                | Count |
| --------------------------------------------------------------------- | ----: |
| Snapshot jobs queued                                                  |    53 |
| Snapshot jobs completed                                               |    53 |
| Snapshot jobs failed                                                  |     0 |
| Active/planning START HERE documents refreshed                        |    49 |
| Jobs intentionally skipped by worker lifecycle gate                   |     4 |
| Remaining no-user fixture placeholders intentionally outside mutation |     2 |

The four completed jobs without document writes were not hidden failures: three projects are paused
and one is completed, so the worker correctly returned `project_paused` / `project_completed`.
The script had treated them as queueable because its lifecycle filter was broader than the worker's.
It now uses the same `planning` / `active` eligibility rule. A corrected dry run reports zero
queueable jobs: four lifecycle skips and the same two projects with no user authority.

## First visible slice implemented

`ProjectMemoryCard.svelte` now appears at the top of the hydrated project Overview. With a canonical
START HERE document, it projects:

- freshness: authored after snapshot, auto-refreshed, or never refreshed;
- the managed **Now** summary;
- the managed/project **Next step**;
- a bounded authored orientation paragraph;
- **Open Start Here**, which deep-links to the canonical document; and
- **Update project**, which opens a project-scoped agent conversation.

Only `onto_documents.content` is parsed. Legacy `props.body_markdown` is intentionally not used
because many production copies predate managed regions and would make refreshed memory appear stale.
The display never persists its own copy.

The workspace records `memory_snapshot_shown`, `start_here_opened`, `memory_update_started`,
`start_here_recovery_started`, and `start_here_recovery_completed` without document content.
Focused workspace tests cover parsed live state, freshness telemetry, missing recovery, and the
canonical-document deep link. The required Svelte analyzer reports no issues in the new component.

## Missing-index recovery implemented

An existing active/planning project with no canonical START HERE now shows an explicit **Missing**
state in the Overview instead of omitting the memory surface. Editors can choose **Create Start
Here**. The authenticated project route:

1. verifies write access and the same planning/active lifecycle gate as the snapshot worker;
2. calls the canonical `ensureProjectStartHereDocument` service, so repeat requests return the
   selected existing document;
3. records the initial document revision when a document is created;
4. queues one forced, deduplicated project-context snapshot to populate managed status/map regions;
   and
5. returns the document immediately so the UI can replace Missing with the canonical artifact.

The route reports a non-fatal `refresh_queued` state separately from document creation. The UI
therefore never claims the managed regions are current merely because the seed document exists.
After a queued recovery, the workspace performs three bounded, best-effort document rechecks. It
replaces the seed with the rendered snapshot as soon as the worker finishes, so the card normally
becomes live without a manual page refresh. The recheck stops when the document changes, the
snapshot is observed, or the short retry window ends; normal project reload remains the fallback.

The planning/active maintenance rule now lives in the shared `PROJECT_OPERATIONAL_STATES` policy
used by both the API route and worker. The standalone backfill script cannot import unbuilt
workspace TypeScript, so its two-value mirror is documented beside the constant instead of being
left as an unexplained second policy.

## Structural constraint found during the hardening audit

Production currently has 103 projects with live `document.context.project` documents. Six of those
projects have more than one live context document, representing 15 extra rows; the largest set has
eight documents. The canonical selector makes reads deterministic, so this does not invalidate the
current card or recovery flow. It does mean the database does **not** yet enforce the intended
"exactly one live START HERE per project" invariant.

This should be resolved before broadly expanding automatic creation:

1. choose and retain each project's deterministic canonical document;
2. define and run an explicit archive/retention policy for non-canonical rows rather than silently
   merging or deleting authored content; and
3. replace query-then-insert creation with an atomic database operation, backed by a partial unique
   index or equivalent lock-protected invariant for live project-context documents.

Until that cleanup is ratified, concurrent first-time recovery requests on separate server
instances can still race and create another duplicate. The current UI suppresses repeat clicks and
the service reuses an existing canonical document, which narrows but does not eliminate that race.
No production documents were archived or rewritten during this audit.

## Next bounded slices

### 3A — Snapshot coverage and honest recovery

1. ✅ Intentionally exclude the two fixture-like placeholder projects with no queue user.
2. ✅ Queue and complete the 53 audited jobs after explicit approval.
3. ✅ Verify all 49 eligible documents have rendered managed output and no placeholder status.
4. ✅ Give an existing project with no canonical START HERE an intentional create/seed recovery path.

3A is complete. The two no-user fixtures remain visible in production counts but are not assigned an
invented service user.

### 3B — The actual index: current, stale, missing

1. Define a pure `StartHereIndexSnapshot` projection from the canonical document, document tree,
   and current project entities.
2. Show document-map coverage and explicit current/stale/missing signals rather than only raw
   Markdown.
3. Deep-link every index row to its canonical document/entity.
4. Keep authored prose separate from machine-owned health signals.

No new table is justified until this projection proves that the existing document/tree timestamps
cannot answer freshness cheaply and correctly.

### 3C — Maintenance loop

1. Audit which project mutations currently enqueue `build_project_context_snapshot`.
2. Debounce/coalesce document, task, milestone, goal, and next-step changes into bounded refreshes.
3. Never overwrite authored regions; use the existing managed-region merger.
4. Expose last successful refresh and non-destructive failure/retry state.

## Correctness rules

- START HERE remains a normal versioned document with protected machine regions.
- Machine refreshes may only own `managed:*` regions.
- Generic agent proposals may not edit managed regions.
- A projection must identify its source document and never imply freshness it cannot prove.
- Duplicate `document.context.project` rows must be resolved through the canonical selector, not by
  silently merging bodies.
- Snapshot jobs must be idempotent and coalesced; maintenance should not create noisy revisions or
  fight a person editing authored sections.

## Current verification

- Production backfill: 53 completed / 0 failed; 49 refreshed; 4 intentional lifecycle skips.
- Corrected dry run: 0 queueable; 4 lifecycle skips; 2 no-user fixtures.
- Project workspace focused suite: 10 tests passing, including live, missing, recovery, and deep-link states.
- START HERE recovery route: 4 tests passing for create/version/queue, idempotency, non-fatal
  history failure, and inactive gating.
- Shared project lifecycle policy: 7 cases passing across operational and inactive states.
- START HERE parser/kernel suite: 8 tests passing.
- Document patch kernel: 16 tests passing, including managed-region protection.
- `svelte-check`: 0 errors and 0 warnings after the workspace integration.
- Required Svelte analyzer: 0 issues in the memory card and workspace.

## Deliberately not done in this slice

- No direct “refresh now” privileged route was introduced.
- No second summary/index table was created.
- The two no-user fixture projects were not assigned synthetic authority or mutated.
- No claim is made that START HERE is fully live until mutation-trigger coverage and the
  current/stale/missing projection are complete.
