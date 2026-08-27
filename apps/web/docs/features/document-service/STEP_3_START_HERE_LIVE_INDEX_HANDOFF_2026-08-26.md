<!-- apps/web/docs/features/document-service/STEP_3_START_HERE_LIVE_INDEX_HANDOFF_2026-08-26.md -->

# Step 3 START HERE live index — implementation handoff

**Date:** 2026-08-26
**Status:** In progress; first visible projection implemented and tested.
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

The existing backfill utility was then run in its default read-only mode. It found 55 untouched
`State: Unknown` placeholders across 55 projects: 53 are queueable and two have no resolvable user.
The 56th no-footer document contains meaningful older status and is intentionally outside this
placeholder-only backfill. No production jobs were queued. The script's inactive-project guard was
also corrected to check canonical `archived_at`, not only `state_key`.

The target-selection audit found no ambiguity: all 55 placeholders are the only live context
document in their project, and none would be displaced by a newer explicit START HERE candidate.

## First visible slice implemented

`ProjectMemoryCard.svelte` now appears at the top of the project Overview when a canonical START
HERE document is available. It projects:

- freshness: authored after snapshot, auto-refreshed, or never refreshed;
- the managed **Now** summary;
- the managed/project **Next step**;
- a bounded authored orientation paragraph;
- **Open Start Here**, which deep-links to the canonical document; and
- **Update project**, which opens a project-scoped agent conversation.

Only `onto_documents.content` is parsed. Legacy `props.body_markdown` is intentionally not used
because many production copies predate managed regions and would make refreshed memory appear stale.
The display never persists its own copy.

The workspace records `memory_snapshot_shown`, `start_here_opened`, and
`memory_update_started` without document content. Focused workspace tests cover parsed live state,
freshness telemetry, and the canonical-document deep link. The required Svelte analyzer reports no
issues in the new component.

## Next bounded slices

### 3A — Snapshot coverage and honest recovery

1. Resolve or intentionally exclude the two placeholder projects with no queue user.
2. With explicit approval, queue the 53 audited jobs.
3. Verify managed status/map output on a sample of old and new templates.
4. Give an existing project with no canonical START HERE an intentional create/seed recovery path.

This is an operational mutation and should not be hidden inside ordinary UI work.

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

- Project workspace focused suite: 9 tests passing, including the new memory projection.
- START HERE parser/kernel suite: 8 tests passing.
- Document patch kernel: 16 tests passing, including managed-region protection.
- `svelte-check`: 0 errors and 0 warnings after the workspace integration.
- The corrected backfill remains read-only by default and reproduced the 53 queueable / 2
  unresolved result after its archive guard changed.

## Deliberately not done in this slice

- No production snapshot backfill was queued.
- No direct “refresh now” privileged route was introduced.
- No second summary/index table was created.
- No claim is made that START HERE is fully live until mutation-trigger coverage and the
  current/stale/missing projection are complete.
