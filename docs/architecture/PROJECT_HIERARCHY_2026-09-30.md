<!-- docs/architecture/PROJECT_HIERARCHY_2026-09-30.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-30; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Project hierarchy: inherited docs, moves, and the Organize view

Status (2026-09-30, evening, after the adversarial review and its fixes):

| Phase | Scope                                                             | State                                                                                                                                                                                                                                                           |
| ----- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Nesting and the shared-docs shelf                                 | **Live in production** (web `ef69ffd8c`, 18:50 UTC). No real project is nested yet. Attach/detach rules changed by `20260930211000` (see the review section).                                                                                                   |
| 2     | Moving docs and tasks between projects, Organize view, batch undo | **Schema + code live** (`39886266d` pushed 20:51 UTC). Review fixes applied and pushed (`e10cd5e68`). Live check passed 2026-10-01; image moves ON, dated-task moves OFF. Shared-doc consent → confirm card (DJ's pick): shipped, **prod live test passed 2026-10-01** ($0.035); misleading-toast fix `1ba3ef008` local. |
| 3     | Combine (fold one project into another), pre-sort, unfold         | Database foundation built and rehearsed (2026-10-01), **not applied**; 4 product questions open.                                                                                                                                                                |

Read **"Adversarial review and fixes (2026-09-30 evening)"** below first: it records what changed after the
progress sections were written, and which older statements are superseded.

Background and evidence:

- [project-evolution-and-workspace-organization-2026-09-29.md](../research/project-evolution-and-workspace-organization-2026-09-29.md): the original plan and its review.
- [project-structure-search-eval-2026-09-29/](../research/project-structure-search-eval-2026-09-29/README.md): the eval. Labeling client projects "part of" their business lifted cross-project search from 60% to 94%.

## Why

DJ's work outgrew one project per thing. Wayne Strategies (the business) has client projects that belong under it:

- Redline, Beyond Exit, UXM and The Cadre ×2;
- a twin project, DJ Wayne Studio;
- three small creator-proposal projects that should fold into it.

Search was half of it (see the eval). Working inside a hierarchy needs three answers the product couldn't give:

- which docs live in the child and which in the parent;
- what happens to documentation when projects combine;
- how to move anything between projects at all. Before this, only undated tasks could move, and only through chat.

## DJ's decisions (settled 2026-09-30)

- **Parent holds, kids inherit.**
- **What flows down:** a "Shared with sub-projects" folder in the parent. Its docs show as a read-only shelf at the top of each child's Docs tab, and the child's agent can read them.
- **Visibility:** the shelf and the "Part of" line show only to people who can open the parent. Collaborators on a child (for example The Cadre's) see nothing new.
- **Editing a shared doc from a child** (user or agent) edits the parent's copy after a warning. "Copy here" makes the child its own copy.
- **Interface:** the ambitious Organize view (Phase 2). Two projects side by side; drag docs and tasks across, up to the shared folder, or down to a child. Batch apply with undo.
    - Combine mode (Phase 3): the agent pre-sorts incoming docs and DJ confirms.

Settled later on 2026-09-30, after the review:

- **Attach needs admin on both projects.** Nesting a project under a hub needs admin on the child and on
  the hub (it used to need only write on the hub, so any collaborator could hang a project under DJ's
  hub, and DJ couldn't remove it).
- **Detach from either side.** An admin of the child or of its current parent can detach. The hub shows
  "Remove from <hub>" on each child row it may detach; the child's "Move under…" offers "Remove from
  <parent>".
- **Visibility is per level.** Someone invited to a project sees everything in that project and nothing
  above it. The UI, family RPC and chat context already hold this. Known residual: a child-only member
  can read the raw `onto_projects.parent_project_id` UUID through PostgREST (no name, no docs). Hiding
  it needs column-level grants that break 7 `select('*')` call sites (≈1.5–2 days); left as is unless DJ
  wants it closed.
- **Shared-doc consent needs fleshing out** (open, with DJ). Today consent is chat text judged by the
  reviewer model; the proposed direction is a confirm card whose click is the consent.

Vetoable defaults DJ has not objected to:

- One level of nesting in v1. A child can't have its own children yet; the queries already handle any depth.
- Outside agents (Codex/Claude connectors) see a child's shelf only if they're also granted the parent.
- The "shared with N" warning counts all children but names only those the viewer can see.
- Combine requires admin on both projects, blocks on members the destination lacks, and never copies connector grants.
- Combine undo lasts until the moved content is edited, and at most 30 days.

## Phase 1: nesting and the shared-docs shelf

### Live in production (database)

Both applied with DJ's OK, recorded with `supabase migration repair`, and types regenerated from prod.

**`supabase/migrations/20260930130000_project_hierarchy_shared_shelf.sql`**

- Columns on `onto_projects`:
    - `parent_project_id` (FK to `onto_projects`, on delete set null, indexed);
    - `shared_folder_document_id`, which is **deliberately not a foreign key** (see the incident below);
    - `merged_into_project_id` (FK to `onto_projects`), reserved for Phase 3 combine.
- A guard trigger, `trg_onto_projects_guard_hierarchy` → `private.onto_projects_guard_hierarchy_columns()`:
    - blocks any INSERT or UPDATE of the three columns unless the transaction-local setting `buildos.project_hierarchy_write` is `'on'`;
    - allows clearing a pointer whose target row is gone;
    - enforces one level of nesting (`project_parent_self`, `project_parent_is_a_child`, `project_has_children`).
- `public.onto_lock_projects_for_write(uuid[])` locks several projects in ascending id order (the tasker 105 lock-first rule). It is callable by `authenticated` and `service_role`. **Phase 2 moves should take their locks through this.**
- `public.onto_project_set_parent_atomic(p_project_id, p_parent_project_id | null)`: SECURITY DEFINER; checks `auth.uid()`.
    - Originally required admin on the child and write on the parent. **Superseded by
      `20260930211000`:** attach needs admin on both; detach needs admin on the child or on its current
      parent.
    - Creates the parent's "Shared with sub-projects" folder document on first use (type `document.default`, props `{role:'shared_with_sub_projects'}`) and prepends it to the parent's `doc_structure`.
    - Reuses the folder while it is live and recreates it if it was archived or deleted.
    - Writes no project log row, because log rows wake paid review loops.
- `public.onto_project_family_v1(p_project_id, p_actor_id default null)`: SECURITY DEFINER; returns everything already filtered to what the viewer can open.
    - The parent (with `can_write` and `child_count`).
    - The shelf: live descendants of the parent's shared folder.
    - The readable children (state, next step).
    - The project's own shared folder id.
    - The service role must pass an actor.

**`supabase/migrations/20260930150000_drop_project_shared_folder_fk.sql`**: the hotfix. It drops the `shared_folder_document_id` foreign key.

Test script: `supabase/tests/20260930130000_project_hierarchy_shared_shelf.check.sql`. Run it with `pnpm db:rehearse … --check <it>`. It covers:

- folder creation and reuse;
- the shelf;
- a collaborator who can't see the parent getting nothing;
- the one-level errors;
- direct UPDATEs being blocked;
- clearing;
- the service role needing an actor.

### Incident: prod document loads failed for about an hour (2026-09-30)

The first migration created `onto_projects.shared_folder_document_id → onto_documents`. That was a second relationship between `onto_documents` and `onto_projects`, next to `onto_documents.project_id`. From then on, every PostgREST embed between the two tables failed with **PGRST201 "more than one relationship was found"**, including the document window's `/api/onto/documents/[id]/full`.

- **Window:** about 14:50–15:50 UTC. The error log shows 2 failures, both from the local walkthrough. Paths that don't write to `error_logs`, such as connectors, aren't counted.
- **Fix:** hotfix `20260930150000` (above). The column stays. `set_parent` and `family` already treat a missing folder as "no folder".
- **Prevention:** `pnpm db:rehearse` now reports an `API:` finding whenever a new foreign key takes a public table pair from one relationship to two (`embed_ambiguity_findings` in `scripts/migration-rehearsal/rehearse.py`, with tests). Re-run against `20260930130000`, it flags exactly this constraint.
- **Rule for Phases 2 and 3:** don't add a second FK between two tables that code joins through PostgREST. If one is truly needed, first hint every existing embed (`table!constraint_name`) and ship that.

### Code (shipped in `ef69ffd8c`, live on web since 18:50 UTC)

Originally written as "built locally"; DJ committed and deployed it. The list below is the file map.

- **Types:**
    - `packages/shared-types/src/project-family.types.ts` (+ test): `ProjectFamilyV1`, `parseProjectFamilyV1`, `ProjectSetParentResultV1`; exported from `index.ts`.
    - `database.types.ts` was regenerated from prod. That also picked up functions other sessions applied, which is correct.
- **Server (web):**
    - `apps/web/src/lib/services/ontology/project-hierarchy.service.ts` (+ test): `getProjectFamily`, `tryGetProjectFamily`, `setProjectParent`, `loadVisibleParentIds`, and error mapping to plain messages.
    - Routes under `apps/web/src/routes/api/onto/projects/[id]/`:
        - `family/` (GET);
        - `parent/` (PUT `{parent_project_id: uuid | null}`);
        - `inherited-docs/copy/` (POST `{document_id}`), which creates a draft copy with `props.copied_from {document_id, project_id, copied_at}`.
    - `routes/projects/[id]/+page.server.ts` loads the family in parallel with the skeleton RPC (no added latency). `routes/projects/+page.server.ts` adds `parent_project_id` to list rows, but only when the viewer can see the parent.
- **UI (web):**
    - `lib/components/project/`: `ProjectBreadcrumb`, `ProjectChildrenSection`, `ProjectParentPickerModal` ("Move under…", admin only), `InheritedDocsShelf`, `project-family.ts` (client calls).
    - `ProjectWorkspace.svelte` and `ProjectWorkspaceOptionsMenu.svelte`.
    - `ProjectDocumentsSection.svelte`, `DocTreeView.svelte`, `DocTreeNode.svelte`: the shelf and the "Shared · N" pill.
    - `DocumentModal.svelte`: the `inheritance` prop, the banner, read-only until "Edit shared copy" is confirmed, and "Copy here".
    - Projects list: `project-list.ts` `nestProjectList()` (+ tests), `ProjectStateRow.svelte`, `routes/projects/+page.svelte` (collapse state in localStorage).
- **Chat (read side):**
    - `packages/agentic-chat-runtime/src/context/context-loader.ts`: `loadProjectFamily`, run alongside START HERE; it fails open.
    - `context-models.ts`: the `project_family` field.
    - `apps/web/src/lib/services/agentic-chat-lite/prompt/project-family-section.ts` (+ test): the "Project Hierarchy" prompt section, capped at 1,200 characters, for stewards and non-stewards.
        - A child sees "Part of X" and the shared docs, read-only from chat.
        - A hub sees its sub-projects and may read into them, but not write.
    - Wired in `build-lite-prompt.ts` and `types.ts`. `context-cache.ts` is bumped to version 7, and `prompt-cost-breakdown.ts` maps the new section.
    - `apps/worker/.../review/turn-contract.ts`: "Project Hierarchy" added to the acting and reviewer section lists.
    - `packages/agentic-chat-runtime/src/context-finder/load.ts`: passes `part_of` / `includes` to the global finder's project cards. The card code in `workspace.ts` shipped earlier in `baa0f470c`.
- **Unrelated fixes made along the way:**
    - **Local dev couldn't open any document** since `14c020589`. The runtime's `tools` entry pulls `shared-agent-ops/project-cleanup`, which uses Node `crypto`, into the browser through `apps/web/src/lib/utils/activity-log-summary.ts`. The fix adds a new runtime subpath, `@buildos/agentic-chat-runtime/tools/activity-log-summary` (`package.json`, `source-entrypoints.mts`). Production wasn't affected because its build tree-shakes the import.
    - The rehearsal `API:` check (above).
- **Eval harness:** `apps/worker/scripts/jev-global-context-eval.ts` and `docs/research/project-structure-search-eval-2026-09-29/`.

Commit with an explicit pathspec, never `git add -A`. The tree has several other sessions' uncommitted work. Before committing, skim `git diff` on the shared files: `DocumentModal.svelte`, `ProjectWorkspace.svelte`, `context-loader.ts`, `database.types.ts`.

### Verified

- **Checks:**
    - `pnpm --filter @buildos/web check`: 0 errors.
    - `tsc` clean for the runtime and the worker.
- **Tests:**
    - Hierarchy service and types: 11/11.
    - Prompt section: 7/7.
    - 75 component and page tests: DocumentModal, DocTreeNode/View, ProjectWorkspace, the project page loader, `project-list`.
    - Runtime `context-loader` / `workspace`; rehearsal tests 21/21.
- **Browser walkthrough** on two throwaway projects, in local dev pointed at prod. Both projects were soft-deleted afterwards.
    - "Move under…", the breadcrumb, and the hub's "Inside this project".
    - The pinned "Shared with sub-projects" folder with its "Shared · 1" pill, and the child's shelf.
    - The shared-doc banner, read-only mode, and the "Edit the shared copy?" confirm.
    - "Copy here" (lands as a draft with `copied_from`) and the nested projects list.
    - A 409 when trying to put a hub under its own child, and clearing the parent.

### Before shipping Phase 1

1. ~~Fix two small "Move under…" issues~~: lost keystrokes fixed (search is focused first on
   pointer devices); the header is not clipped (the body scrolls). Committed locally, not pushed.
2. Browser-check the collaborator view: a second account that's a member of a child but not the parent should see no breadcrumb and no shelf. So far only the rehearsal test script covers this. **Still open.**
3. ~~Commit (pathspec) and deploy web + worker.~~ Done by DJ (`ef69ffd8c`).
4. DJ nests Redline, Beyond Exit, UXM and The Cadre ×2 under Wayne Strategies, or asks an agent to. **Still open** (production has 0 nested projects).

Known gaps, deferred:

- **Dashboard parent labels:** the dashboard analytics RPC doesn't return `parent_project_id`. The UI is ready and stays dormant until it does.
- **The parent picker** can't grey out invalid parents up front, because `/api/onto/projects` doesn't return parent or access level. It relies on the server's 409/403 messages.
- **Shared folder drag lock:** addressed by the Phase 2 planner slice below (drag, cut/paste, and the drag affordance). The ordinary Docs tab still has no "drop docs here" ghost row.
- **No gateway rule was added:**
    - In-app chat reads parent docs through `actor_has_project_member_access`, which isn't scoped to the focused project.
    - Connectors need the parent granted (the vetoable default above).
    - Chat edits shared docs only through the confirmation flow (Phase 2, below).

## Phase 2 brief: moves and the Organize view (≈2 weeks)

For the next agent. Read DJ's decisions above first. Phase 1 is in the working tree but not committed. Build on it, don't revert or reformat it, and coordinate with DJ on committing Phase 1 first.

### Phase 2 progress: Organize planning slice (2026-09-30)

The first slice implements the frontend-first planning workflow. **It does not persist moves.**
There is no new migration, batch journal, apply endpoint, or live chat change in this slice.
Phase 1 and other sessions' changes remain in place; nothing was committed or deployed here.

Built locally:

- `/projects/[id]/organize?with=<other>` loads two independently authorized project snapshots.
  `GET /api/onto/organize/snapshot?project_id=<id>` supports changing the second pane.
  These reads use the signed-in client, check membership before reading contents, exclude
  deleted/archived documents, reject archived projects via `archived_at`, and paginate items
  rather than silently truncating at PostgREST's row limit. Family shortcuts come only from
  the existing visibility-filtered family RPC.
- `lib/components/organize/`: `OrganizeView`, `OrganizePane`, `OrganizeTreeRow`,
  `PendingChangesTray`, `OrganizeProjectPicker`, and `useOrganizeDrag.svelte.ts`.
  Desktop pointer dragging, Space/arrows/Enter pickup and drop, M for the destination sheet,
  phone pane switching, shared-folder destinations, dashed planned rows, subtree counts,
  staged Undo last/Discard all, and navigation protection are implemented.
- `organize-plan.ts` is a pure TypeScript replay model (no runes or network calls needed).
  It uses the existing `removeNodeFromTree` / `insertNodeIntoTree`, preserves subtree IDs
  and snapshot versions, handles unlinked live docs, rejects cycles/no-ops/invalid targets,
  caps plans at 200 operations, and blocks protected docs even inside a moved subtree.
  Task dates are preserved in the plan, with calendar reconciliation explicitly pending.
- `doc-tree/drop-geometry.ts` extracts the existing 30/70 drop thresholds, zone construction,
  cycle/no-op validation, and same-parent index adjustment. The ordinary tree now pins the
  shared folder against drag and cut/paste, including attempts through an ancestor.
- Entry points: project options → **Organize…**, and **Organize with…** on visible child rows.
  Navigation keeps project chat scoped while on `/organize`.

At this slice's completion, the UI labeled this as a planning preview and **Apply changes was disabled** (superseded by the UI wiring slice below). Its in-memory
**Undo last** is not the persisted batch undo described below. No fake history or save
success is shown. The snapshot's versions/timestamps are the baseline for a future server
preview; the browser plan is not an authorization decision or a trusted impact report.

Validation for this slice:

- **48 focused free tests passed** across the planner, read API/service, and affected components.
  Coverage includes plan replay/subtrees/pins, drop-geometry parity, pointer cancellation,
  keyboard and phone sheet staging plus undo, snapshot membership/pagination/errors, and the
  authenticated read endpoint. The existing doc-tree component tests also run.
- `pnpm --filter @buildos/web check` passed with 0 errors and 0 warnings.
- Read-only local browser walkthrough loaded Wayne Strategies and Redline and staged a
  seven-document subtree (one parent + six children). This exercised only in-memory planning;
  no project content was moved and no paid model calls were run. Short-screen pending-tray
  visibility was corrected and rechecked. Undo last restored both pane counts to their original
  values; the test plan was discarded. Only the sheet and desktop viewport were browser-checked;
  phone layout and the second-account collaborator view still need a browser pass.

Next implementation boundary:

1. **Schema applied; companion code local (next slice below):** the private mover,
   assets/storage policy, proposal conflicts, ordered locks and durable task-event reconciliation.
2. **Schema applied; server code local:** preview tokens, atomic apply, journal and inverse undo/redo.
   Fresh authorized snapshots rebuild trees in TypeScript; SQL independently checks the
   complete sequence and subtree identities inside the locked transaction.
3. **UI wiring built locally (slice below):** Apply, persisted Undo/History, accurate
   link/assignee/public-page impact, and single-item entry points. The shared-document chat
   confirmation branch remains next.
4. Rehearse each migration and obtain DJ's approval before production application or paid/live
   write validation, following the brief below.

### Phase 2 progress: persistence backend (2026-09-30)

The backend slice is implemented, and migration `20260930170110` was applied to production
and recorded in the migration ledger with DJ's approval on 2026-09-30 (verified at 17:45 UTC).
The companion web/worker code was local at this checkpoint. Apply was disabled then;
the UI wiring slice below now connects these APIs. No live content move or paid test was run.

- Migration: `supabase/migrations/20260930170110_organize_atomic_moves_and_journal.sql`.
  `private.onto_move_entity_set` takes explicit user identity, authorizes both projects and
  locks projects in UUID order before entity rows. Batch compilation independently replays
  all staged steps in SQL, validates subtree IDs and final trees against fresh state, then
  groups ownership changes by final source/destination. Links between items moving together
  survive even when those items were staged in separate steps. Limits are 200 operations and
  200 distinct affected entities, across at most 20 projects.
- Comments/read states, embeddings, eligible assignments, assets/links, public pages and
  publication review records follow their entities. Incompatible edges/assignees/local task
  links are previewed and detached. Pending proposals block; terminal proposals are journaled
  before removal. Shared assets attached to items staying behind and recurring task/event
  state block with explicit reasons. START HERE, thinking logs and the shared folder stay pinned.
- `storage_project_id` pins the physical upload owner without adding a second project FK.
  Storage policies authorize the asset's current project; the render/access helper accepts its
  immutable original path. Account deletion excludes objects transferred to a surviving project,
  even if storage still identifies the original uploader. Existing signed URLs retain their
  normal expiry; the move does not revoke previously minted links.
- `/api/onto/organize/preview`, `/apply`, `/undo`, and `/history` are authenticated server APIs.
  They rebuild from session-authorized snapshots, then use service-only SQL RPCs which recheck
  explicit user membership. The client cannot supply trees or a different acting user. Tokens
  cover the plan, project/entity versions and dependent-row fingerprints. Batch IDs make lost
  HTTP responses safely retryable. The journal has RLS enabled and no browser table grants;
  history is filtered by current access to every participating project.
- Undo reverses current placements, preserves content edits, and skips items moved/reordered
  since the batch or subtrees that gained/lost children. Skips are persisted in its receipt.
  Compatible detached records are restored only for items actually returned; newer records are
  never overwritten. Each inverse is another batch and can itself be undone to redo the move.
  A batch has at most one direct inverse. Position checks are conservative: unrelated reordering
  can make a document skip rather than risk undoing newer work.
- The existing task-move RPC now uses the same mover. Clean moves retain immediate execution;
  dates/assets/destructive effects require confirmation. Recovery from an archived source and
  idempotent retries still work. SQL logs both projects; the TS adapter avoids duplicate logs.
  Dated tasks retire their old events without deleting external mappings and enqueue a durable
  `sync_calendar` job. The worker reconciles the task's current project, serializes overlapping
  retries with a lease, repairs an event left without its edge, and honors cancellation.
- Schema-first deployment is protected by `private.organize_rollout`: both
  `calendar_sync_ready` and `asset_access_ready` start false. Preview and apply (including
  the existing task RPC) block affected moves until their companion code is deployed.
  Only the database operator can update these flags; service-role code can only read them.
  The production worker was still on commit `baa0f470ccc07f2802fdeef92db7b6cd869e558a`
  when the schema was applied, so both flags remain false.
- Old document URLs redirect using the already-authorized full-document read, including when
  the caller cannot open the former project. A separate RLS-scoped
  `get_document_route_location` RPC is also available.

Validation for this backend slice:

- **55 focused free tests passed**, covering compilation/repeated moves, inverse conflicts/content preservation,
  session authorization, strict HTTP contracts, replay, history redaction, asset paths,
  moved-document redirects and calendar retries. Web checking finished with 0 errors and 0 warnings; worker typechecking and both affected shared
  package builds passed.
- Rehearsal against the captured production schema exercises 59 SQL assertions, including
  actual moves, stale tokens, proposal/asset blockers, undo/redo, permissions, legacy task calls,
  storage access and account deletion. An injected failure at the final tree write proves that
  entities, assets, calendar jobs and the journal all roll back. Standing archived-scope checks
  and role probes pass as part of the rehearsal, with **0 SECURITY and 0 API findings**.
  The additional rollout assertions cover default blockers, rejected applies, legacy task
  calls, inability of service-role code to enable the flags, and no queued jobs or ownership changes.
  One pre-existing anonymous-role probe failure is unchanged; authenticated probes have no failures.
  The two DATA notes are the explicitly backfilled storage anchor and its small index; the read-only
  preflight below verifies the existing paths. The 19 NOTE findings identify intentional server-only
  functions. Concurrent traffic is not simulated.
- Read-only production preflight found **5 asset records, 0 invalid storage locations** and
  **4 storage objects with no asset row**. The new policies authorize known asset rows; those
  untracked objects are not exposed through the asset API and are not deleted by this migration.
- Read-only production verification confirmed the migration ledger entry, all 5 asset anchors
  populated with ownership unchanged, journal RLS and RPC grants, both rollout flags false,
  and zero Organize batches or new calendar jobs. Shared database types and schema reference
  were regenerated from the migrated production database; the shared-types build and web check
  (0 errors, 0 warnings) passed after regeneration.

Remaining release order: deploy and verify the compatible worker/calendar and web asset-access
code, then enable the corresponding readiness flags as the database operator:
`UPDATE private.organize_rollout SET calendar_sync_ready=true, asset_access_ready=true WHERE singleton;`
Keep each flag false until its deployment is verified. Deploy the Organize Apply/Undo/History
controls, single-item entry points and shared-document chat confirmation built below, then run
the approved live checks. Do not enable scheduled moves before the new calendar
job handler is deployed. (The SHA-256 recorded here earlier, `7db9b560…`, no longer matches the file;
the SQL body is identical to what production's ledger recorded, only the header comment changed.)

### Phase 2 progress: Review/Apply, saved history and single-item moves (2026-09-30)

Built locally while DJ deploys the preceding changes. This slice adds no migration and does
not change the production readiness flags.

- **Review changes** now requests the server's impact preview before showing an enabled Apply
  action. The review lists staged items, subtree/shared-shelf effects, relationship and task-link
  removals, assignees, proposals, attachments, comments, published pages and queued calendar work.
  Server blockers disable Apply and give a plain-language reason. Cmd/Ctrl+Enter opens review;
  it never skips confirmation.
- `useOrganizePersistence.svelte.ts` keeps the exact reviewed request, token and batch UUID
  together. Network/server failures retain them for **Retry save**; rejected/stale requests require
  a fresh review. An uncertain save prevents editing the plan or internal navigation. Reloading
  still loses the in-memory request; saved batches remain discoverable through History.
- Confirmed saves clear the staged plan, refresh both panes, and offer **Undo** in a toast and
  a persistent receipt. A failed refresh is shown as a refresh problem, preserving the successful
  save instead of inviting a duplicate write. New planning waits for the refresh to succeed.
- **History** loads the current user's latest authorized batches from the server. Undo previews
  current placements and skipped items before confirmation. Each saved reversal is itself undoable
  for redo. Pending local plans must be applied or discarded before undoing a saved batch.
- Document and task editors link directly into Organize with `?document=<id>` or `?task=<id>`.
  The route validates the focused item against its authorized snapshot and opens the existing
  destination sheet. Unsaved editor changes disable the entry action. The sheet can load another
  project without leaving the focused move.
- New reusable files: `organize-api.ts`, `useOrganizePersistence.svelte.ts`,
  `OrganizeDialogs.svelte` and `OrganizeEntryButton.svelte` under `lib/components/organize/`.

Validation for this UI slice:

- **21 focused free component/route tests passed**, covering authoritative review, apply and pane refresh,
  persisted Undo, rollout blockers, identical-request retries after lost responses, stale
  previews, successful saves with failed refreshes, saved history/partial undo, pending-plan
  guards, keyboard review and focused document/task entry points.
- **Full web check is not verified for this slice.** The initial check caught response-output
  inference and reactive form-baseline issues, which were fixed, plus concurrent errors in
  `permission-requests.service.ts` (shared-package exports and tool-schema types). The follow-up
  check was stopped after more than 12 minutes without diagnostics to release its machine-wide
  validation slot. Run `pnpm --filter @buildos/web check` through `test-gate` again before release.
  The dev-server Vite config was touched after the check to restore its generated proxy types.
- The browser walkthrough was interrupted when the Chrome connection disappeared before the
  updated Organize page could be inspected. Desktop/mobile visual verification of this slice
  remains pending. No content was moved, no paid model tests were run, and no live write
  walkthrough was attempted.

The shared-document chat confirmation branch is implemented in the next progress section.
Release still needs verified web/worker deployments before enabling the calendar/asset readiness flags, plus
the approved live move/undo and collaborator checks. The last verified production flag state
was both false at 17:45 UTC; DJ's deployment has not been independently verified in this slice.

### Phase 2 progress: confirmed shared-document edits in chat (2026-09-30)

> Superseded by "Phase 2 progress: confirm card for shared-doc edits" below; the token flow is removed.

Built locally. No new migration is needed: confirmation uses the existing service-only
`chat_turn_effects` ledger and the document writer's version comparison. Deploy the web and
worker together, with rebuilt `shared-agent-ops` and `agentic-chat-runtime` packages.

- From a child chat, the first `update_onto_document` call against an accessible, writable
  parent shared-shelf document returns `confirmation_required`. It names the parent and
  document, reports the shared-project count, and saves no content. The agent explains the
  exact edit and shared impact and waits for explicit confirmation in a later user turn.
- The token identifies that server-written preview receipt. It is bound to the same user,
  session, child, parent, shelf, document version, shared count and exact normalized edit.
  Same-turn, same-message, expired (24 hours), changed, missing and inaccessible confirmations
  fail before dispatch. Permission is checked again without the turn's cached access memo.
- Only the confirmed call receives a write scope containing the one parent. The gateway
  compares the authorized document version again and never rebases or retries a confirmed
  edit onto changed content. The existing database comparison prevents concurrent reuse;
  a successful edit changes the version and invalidates later reuse.
- Token-bearing calls always require independent semantic review, including for a focused
  document. Review-disabled execution fails closed. The reviewer must see the original
  preview, the disclosed impact and the later user's acceptance; a token alone is not consent.
  Parent document diffs can be previewed read-only for that review without broadening ordinary
  project writes. Shared-document archives still require opening the parent project.
- Web admission and prewarming retain the immediately prior assistant's pending calls and
  receipts together, before its warning. History compression preserves their exact bytes.
  Recall is bounded to three previews and 24,000 characters; oversized entries are omitted
  whole and need a fresh preview. Prepared-history version 3 retires older cached projections.
- Confirmation previews create no affected-entity toast or saved-write ledger entry.
  Completion handling lets the confirmation question finish the turn instead of retrying the
  pending edit or replacing the question with an unfinished-work fallback. Ordinary local
  document edits incur no additional hierarchy queries.

Validation for this chat slice:

- **603 focused free tests passed** across worker mutation/provider paths, document version
  guards, runtime catalogs/completion, prompt rendering, owned-history admission and compression.
  Coverage includes changed access/content, replay, exact parent scope, mandatory review and
  a complete preview → confirmation-question provider turn.
- Both affected shared-package builds and worker typechecking pass. Worker test types also
  pass with zero errors. **Full web check passes with 0 errors and 0 warnings**, resolving the
  unverified check from the preceding UI slice. The Vite config was touched afterward to
  restore local proxy types.
- No production content was changed, no migration was applied, and no paid model tests or
  browser write walkthrough ran. Live reviewer behavior and deployed web/worker versions
  remain unverified. This slice does not enable the calendar/asset rollout flags.

Next: verify the companion deployments and readiness flags, then the approved live Phase 2
move/undo and shared-edit checks. Phase 3's combine/unfold work remains separate below.

### Adversarial review and fixes (2026-09-30 evening)

Four read-only reviewers (SQL, server, chat, UI) audited everything above against the code and
production; fixes followed with DJ's go-ahead. Nothing here moved real content or ran a paid test.

**Applied to production (rehearsed with every check script, 0 SECURITY / 0 API findings, recorded in
the ledger):**

- `20260930210000_organize_guard_lock_order.sql`: `private.organize_dependent_guard` no longer takes
  `FOR UPDATE` on the project for every write to 12 dependent tables. It takes `FOR KEY SHARE` on the
  referenced documents then tasks (the mover's lock order), skips DELETE, and the triggers on
  `onto_assets` / `onto_project_members` are gone. `onto_task_update_with_relationships_atomic` now locks
  first whenever it syncs assignees: assignee rows take `FOR KEY SHARE` on the project through their
  foreign key after the task update bumped the context version, which deadlocked against lock-first
  creates **before** Organize too (probe `task-update-assignees+task-creates`: 11–12/25 deadlocks →
  0/25, as service and as member).
- `20260930211000_project_hierarchy_attach_detach.sql`: DJ's attach/detach rule (errors
  `project_parent_admin_required` / `project_parent_access_denied`); `can_detach` on the family's parent
  and children; restoring a soft-deleted project detaches it if keeping it would nest two deep (the
  restore is never blocked, and it is silent).
- `20260930212000_organize_hardening.sql`:
    - the confirmation token covers only the moved entities, their dependents, the trees for document
      moves, and the reported impact, so embedding upserts, read states, member changes and edits to
      other tasks no longer force re-confirmation (legacy chat task moves included);
    - dependent scans filter by project and entity ids;
    - preview no longer takes project write locks (apply recomputes under lock);
    - a retry of the same calendar job reclaims its lease (token = queue row id);
    - the 30-day privacy purge keeps a moved asset's file while its asset lives elsewhere, lists it when
      that asset or its current project expires, and no longer blocks or prematurely purges projects
      over moved files;
    - Organize tree writes go through `onto_project_doc_structure_update_atomic` (history row `move`),
      so "restore previous version" can't silently revert a move;
    - hard-deleting a project removes journal batches that reference it.
- These migrations are committed (local, not pushed) together with the three earlier ones that had
  been applied but untracked.

**Code fixes (committed locally with the review, not pushed):**

- Chat: the turn-completion check that shipped in `39886266d` suppressed the "unfinished work"
  continuation for _any_ `requires_user_action` result (for example a calendar reconnect on a write that
  saved). It now holds back only for a pending shared-document preview. A confirmed shared edit after a
  direct write in the same turn is held for review instead of failing the turn. Stale or invalid tokens
  are rejected before the paid reviewer pass (wired in `composition-root.ts`). Recalled preview calls
  use `shared-preview-<token>` ids.
- Web server: at most 20 distinct projects per request and write access checked before any contents
  load; a saved batch returns its receipt on retry (including after later access loss); fewer round
  trips; unknown errors return a generic message; the admin-client `user_id` filter is now actually
  tested; a copied thinking log becomes a plain document; the plan's project version is the doc-tree
  revision (`structure.version`), not `updated_at`, so renames don't force a re-review.
- UI: the editors' "Move between projects…" button works (it used to close the editor with
  `history.back()`, which cancels SvelteKit's in-flight `goto`); Space/Enter/arrows no longer stage moves
  while typing; "Discard and leave" no longer loops; toast Undo works during refresh and after leaving
  (opens History); focus follows keyboard moves; the shared folder can't be moved through "Move to…";
  inherited docs lock publish/collaboration/propose until "Edit shared copy"; "Copy here" waits for
  unsaved edits; pickers take typing immediately; phone picker fits; 44px touch targets; dead-end
  entries hidden; detach controls on both sides; `exact: true` removed from tests (CI red since
  `ef69ffd8c`).

**Production live check (2026-10-01, 01:05–01:25 UTC, DJ-approved free checks):** web `e10cd5e68`,
worker deployed 00:44 UTC. Two throwaway projects (`15bc0d0a…`, `d0e1a21e…`) were created without a
description (no paid icon call), used, and soft-deleted afterwards. The image asset skipped `/complete`,
which would queue a paid OCR call.

- Organize keyboard move → server review ("No linked items need to change") → Apply → toast + receipt
  → Undo from the receipt → redo offered from the reversal toast. All passed.
- Doc with an image: blocked with a plain reason while `asset_access_ready` was false; after enabling it,
  the move applied, the asset followed (`project_id` B, `storage_project_id` A), `/render` returned
  200 image/png, and undo restored it. **`asset_access_ready` is now true. `calendar_sync_ready` stays
  false** until DJ approves a calendar test (it would touch his Google Calendar).
- A folder with a child (Research + Notes) moved and undid from History; the trees nested correctly;
  every Organize write recorded a `move` row in `onto_project_structure_history`; the journal held 3
  applies + 2 reversals.
- Hierarchy: "Move under…" nested B under A (breadcrumb, hub row, `can_detach`); the shared folder was
  pinned with "Shared · 1"; its "Move to…" was refused; the editor's "Move between projects…" now
  lands on Organize with the item preselected; hub "Remove from A" asked to confirm and detached.
- Found and fixed (`9b728800f`, local): the notification stack covered the tray's Review button; the
  shared folder offered Archive / Share publicly (archiving it silently empties every shelf).
- Found, queued: History rows don't name what moved; "Move between projects…" is only in the
  collapsed Details panel; no "drop docs here" ghost row yet.

**Corrections to statements above:**

- The Phase 2 brief below ("Moves", "Batch and undo", "Web", "Chat editing shared docs") is the original
  plan. Where it differs from the progress sections, the progress sections and this one win: the token
  is a scoped row digest, not "an md5 over the impact"; finished proposals are journaled before removal;
  the planner file is `organize-plan.ts`; Cmd/Ctrl+Enter opens Review and never applies.
- "Web check passes" in earlier sections did not include `typecheck:tests`, which CI runs and which
  failed on the Organize tests.

**Still open:**

- Shared-doc consent redesign (DJ interview in progress). Known limits of the current flow: edits over
  24,000 characters, a fourth preview, or a clarifying turn before "yes" can never be confirmed; after a
  successful direct write the next pass has no tools, so "yes, and also do X" may leave the shared edit
  undone; a pending task-move confirmation no longer holds back the continuation (pre-`39886266d`
  behavior).
- Found, not fixed (outside this feature): **account deletion fails in production** at
  `finalize_account_deletion_database`, which sets a human actor's `user_id` to NULL and violates
  `chk_actor_identity`. Dormant (0 deletion requests).
- A purged single document's finished proposals stay copied in journal batches.
- The tree's right-click menu still shows "Move to…" on the shared folder (it now refuses with a message).
- Collaborator (second-account) browser pass, phone pass, and approved live move/undo and shared-edit
  checks. Readiness flags stay false until the worker/web deploys are verified.

### Phase 2 progress: confirm card for shared-doc edits (2026-09-30, late)

DJ's pick: a click on a card is the only consent, never typed text. This replaces the
`confirmation_token` flow in "confirmed shared-document edits in chat" above, and closes the
"Shared-doc consent redesign" item under "Still open". It is built locally, uncommitted and not deployed.
No migration was added.

- **Flow.** From a child chat, `update_onto_document` on a writable parent's shelf document saves
  nothing. It previews the edit as a dry run, then returns a card receipt (contract:
  `@buildos/shared-agent-ops/ontology/shared-document-edit-card`, client action kind
  `confirm_shared_document_edit`). The card shows title · parent, "Shared with N sub-projects", the
  diff, and **Update shared doc / Copy here / Cancel**. The turn ends on the card. The model sees
  only a compacted change, never the held edit, and is told to ask the user to choose in the card.
- **Click.** `POST /api/chat/shared-document-edits/[id]` takes `{choice, session_id}`. The edit
  arguments and document version are read from the card's `chat_turn_effects` row (admin client,
  ledger only), which is filtered to this user and session.
    - The card is single-use: the PK insert of a resolution row whose id is derived from the card
      claims it atomically, so a second click gets the first click's result.
    - Cards expire after 24h and can't be used while the turn is still running.
    - Apply re-checks parent write access, that the doc is still on the shelf, and the exact
      version. It then writes through `runGatewayWriteOp` with the user-scoped client and
      `documentWriteGuard`, and never rebases.
    - Copy re-checks child write access, then runs the shared `copyInheritedDocument` helper (the
      same one the inherited-docs copy route now uses) and applies the edit to the copy.
- **Outcome.** The resolution is recorded in the ledger row (succeeded / failed = stale /
  uncertain = unknown) and mirrored onto the card's `chat_tool_executions.result`, so the card
  comes back resolved after reload. The next turn gets one system note per card through the
  existing continuity query (no extra query). History compression keeps these notes whole, and
  prepared history is now v4.
- **Removed.** The token argument (both catalogs), the token dispatch and mandatory review, the
  composition-root check port, and web confirmation-history recall
  (`shared-document-confirmation-history.ts`).

Validation (free only): shared-agent-ops 6, runtime 60, worker 681 of 683, and web 158 focused
tests pass. The 2 worker failures fail without this change too: `_archive_review` is not in the
canonical schema, and the project surface is over its byte cap (this change shrinks it by about
190 B). Runtime and worker typechecks pass. The resolver's exact ledger write sequence was run
against a throwaway local Postgres with the real table and triggers. **Not verified:** browser
click-through, phone width, deployed web/worker, live model wording. Deploy web and worker
together with rebuilt packages. Version-1 (token) previews can't be resolved by the card.

**Production live test (2026-10-01, DJ-approved, $0.035 total).** Shipped in `4328cf7f4`. The test
used throwaway projects nested parent → child (soft-deleted afterwards), a "Rate card" on the
parent's shelf, three chat turns in the child on DeepSeek V4.1 Flash, and the deployed web and
worker. Desktop only.

- **Update shared doc.** Turn 1 asked for $1,500 → $1,800. Nothing was written until the click;
  the reply named the parent and told the user to choose in the card. The click wrote the parent
  copy, and the card read "Updated in … · shown in 1 project · Open".
- **Single use.** A second POST to the same card, with a different choice, returned the first
  resolution and wrote nothing.
- **Copy here.** In turn 2, the model said the first change was already saved and the new one was
  not. The click created the child's own Rate card ($4,500, with `props.copied_from`) and left the
  parent unchanged.
- **Cancel.** Turn 3 named "the parent's shared Rate card" after the child had its own copy. The
  model picked the parent doc, and Cancel changed nothing.
- **Reload.** Reopened from History, all three cards came back resolved: Updated, Copied,
  Cancelled.
- **Bug found and fixed (`1ba3ef008`, local).** The held edit showed an "Updated document" toast
  and activity line. Results with `requires_user_action` now skip the toast and the diff card,
  and read "Needs your choice to update document: …". Reopened sessions also listed worker review
  steps ("Used approve mutation batch review"). They are now hidden, as in the live stream.
- **Observed, not fixed.** The reviewer bounced a correct card edit once in turns 2 and 3
  (`request_proposal_revision`, then approve). That cost turn 2 two extra calls ($0.015 vs $0.006).
  Every chat document edit stamps `props.origin = external_agent` (gateway default), including
  card applies.

### Moves

- **One private SQL mover**, `private.onto_move_entity_set(source, dest, refs)`:
    - take the ordered project locks first with `onto_lock_projects_for_write(ARRAY[source, dest])`;
    - links whose both ends move go along; links that would leave the moved set are detached and reported;
    - comments follow their entity (generalize the comment trigger);
    - embeddings, public pages, asset links and assets move with the entity. `onto_assets` needs `storage_project_id` so asset ids and render URLs survive. Extend the guard in `20260923000100_pin_onto_asset_storage_paths.sql`;
    - pending doc proposals block the move, and finished ones are deleted;
    - START HERE and the thinking log can't move;
    - the move is logged in both projects.
- **Doc trees** are rebuilt in TypeScript with the existing `removeNodeFromTree` / `insertNodeIntoTree` (`packages/shared-agent-ops/src/ontology/doc-structure.service.ts`). SQL checks that the two id sets differ by exactly the moved subtree.
    - Moving into or out of a parent's shared folder is an in-project tree move, from the child's side: the folder lives in the parent. The folder id is `onto_projects.shared_folder_document_id`.
- **Refactor `onto_task_move_atomic`** onto the mover (template: `20260713000000_add_atomic_cross_project_task_move.sql`). The ordered locks fix the A→B / B→A deadlock noted in tasker 105.
- **Dated tasks:** remove their events, move the task, then run `syncTaskEvents` in the destination (`packages/shared-agent-ops/src/calendar/task-event-sync.ts`), which reconciles on retry. Today, moves block every dated task.
- **`get_document_route_location(doc_id)`** redirects old document URLs to the new project.

### Batch and undo

- **`onto_organize_apply_atomic(plan)`**:
    - preview first: an md5 token over the impact, the versions and each row's `updated_at`;
    - then apply: ordered locks, all or nothing, about 200 operations max.
- **The journal `onto_organize_batches`** records each batch. Undo builds the inverse against the current state, applies only what is still where the batch left it, and lists the rest. An undo is itself a batch, so it can be redone.
- **Naming:** use `/api/onto/organize/*`. `/api/onto/projects/[id]/reorganize` already exists and is the graph re-org.

### Web: `routes/projects/[id]/organize/+page.svelte` + `lib/components/organize/`

- Components: `OrganizeView`, `OrganizePane`, `OrganizeTreeRow`, and `PendingChangesTray` (styled like `InboxCleanupChangeList`).
- `organize-plan.svelte.ts`: pure; shows each tree with the pending changes applied.
- `useOrganizeDrag.svelte.ts`: a thin cross-pane layer using pointer events, `elementFromPoint` and `data-organize-drop`.
    - First extract `drop-geometry.ts` from `lib/components/ontology/doc-tree/useDragDrop.svelte.ts` with no behavior change, so both share the drop rules. Add `isPinned()` for the shared folder while there.
- **Entry points:**
    - "Organize…" in `ProjectWorkspaceOptionsMenu.svelte`, next to Phase 1's "Move under…";
    - "Organize with…" on each row of `ProjectChildrenSection.svelte`;
    - route `/projects/[id]/organize?with=<other>`.
- **Behavior:**
    - Pending changes show as ghost rows, with an impact line such as "unlinks 2 tasks" or "3 child docs move too".
    - Apply shows "Moved 6 items · **Undo**" through `toastService.add({action})`, and a History drawer lists past batches.
    - Keyboard: space to pick up, arrows to move, M for "Move to…", ⌘Enter to apply.
    - Phone: one pane at a time (segmented switch), a "Move to…" sheet, and a sticky "3 pending" bar.
- Widen the chat-scoping regex in `lib/components/layout/Navigation.svelte` (~:143) to include `/organize`.
- "Move to…" on single docs and tasks reuses the same move API.

### Chat editing shared docs (implemented above)

- Add an optional `confirmation_token` to `update_onto_document` in both catalogs: `packages/agentic-chat-runtime` `ontology-write.ts` and the worker's `tool-catalog.ts`.
- Add a new branch in the worker's `mutations/table-adapter.ts`, modeled on the archive special case (~:235):
    - the first call returns `confirmation_required` with the shared count;
    - the confirmed call widens the write fence to that one parent only.
- Tool description: "Never confirm on the user's behalf."
- `project-family-section.ts` now explains the preview and later-confirmation flow when the parent is writable, and retains read-only guidance otherwise.

### Phase 2 verification

- **Free:**
    - narrow vitest on `organize-plan`, `drop-geometry` (proving the extraction changed nothing), the mover's TS side, and the confirmation-token branch (token required, fence widened only to the parent, replayed tokens rejected);
    - OrganizeView component tests (keyboard move → pending change → apply → Undo toast);
    - `pnpm --filter @buildos/web check`;
    - every migration through `pnpm db:rehearse --role-probe` with a check script.
- **Needs DJ's OK:**
    - applying each migration to prod, one file at a time;
    - live chat checks (paid);
    - any browser walkthrough that writes data.

## Phase 3 progress: database foundation (2026-10-01) — NOT applied to production

`20260930220000_project_fold_foundation.sql` and `20260930220100_project_unfold.sql`, with checks
`supabase/tests/20260930220000_project_fold.check.sql` and the standing
`supabase/tests/project_fold_table_coverage.check.sql` (registered in `DEFAULT_CHECKS`; it skips with a
notice until the policy table exists). The full rehearsal passes (0 SECURITY / 0 API). **Not applied:**
the product questions below can change the contracts, and nothing calls these RPCs yet.

- **Contracts** (service-only, explicit user id; admin on both projects):
  `onto_project_fold_preview(user, source, dest, member_additions)` → `{confirmation_token, impact, info}`;
  `onto_project_fold_apply(user, source, dest, token, fold_id, member_additions)` (idempotent by fold id);
  `onto_project_unfold_preview(user, fold_id)` / `onto_project_unfold_apply(user, fold_id, token)`;
  `get_project_route_redirect(project_id)` (authenticated; only to readers of the destination);
  `cleanup_privacy_project_fold_manifests()` (30-day manifest purge; not yet wired to the cron).
- **Table policy:** 97 project-pointing columns classified — move 21, repoint 3 (chats, chat↔project
  links, contact links), rebuild 10, leave_behind 61 (logs, members, grants, proposals, calendars…).
  Any new `project_id` column now fails rehearsal until classified.
- **Behaviour:** the source tree lands under "From <source>"; START HERE / thinking log are demoted (and
  restored by unfold when possible); the source is archived with `merged_into_project_id`; 15 blockers
  (members missing, sub-projects, pending proposals, recurring/standalone events, rollout flags, size
  caps: 1,000 entities, 300 docs, 5,000 edges, 2,000 embeddings, 50 docs in one folder).
- **Timing:** DJ's largest projects fold in ≈0.3 s; at every cap ≈2.4 s (under the 8 s PostgREST
  timeout).
- **Landmine:** a document's `children` index overflows past ≈60 direct children; folds block with
  `too_many_documents_in_one_folder` (production's widest is 17).
- **Open for DJ:** should chats follow the fold (today: yes); should standalone/recurring events block
  (today) or get a re-home job; should members added by a fold stay after unfold (today: yes); should
  email rules stay with the source (today: yes).
- **Next slices:** worker bridge, gateway/writer forwarding (writes queued behind a fold currently land
  in the archived source), post-commit rebuilds, model pre-sort, the Combine UI. If
  `20260930185213_agent_permission_requests.sql` reaches production after this, it needs policy rows.

## Phase 3 (later): combine

`onto_project_fold`, run in the worker through a user-checked bridge (the task-move bridge in `20260811010000`):

- **Records:** every record moves with its id intact. The source tree lands under a "From <source>" folder. The source START HERE and thinking log are demoted.
- **Source project:** archived with `merged_into_project_id`, which is already live. Writing that column needs the hierarchy flag (see the landmines below).
- **Manifest:** kept for unfold, with a table-coverage policy that fails the rehearsal when a `project_id` table is unclassified.
- **Pre-sort:** one structured model call for docs (keep / share up / merge into / archive, with confidence and a reason). Merges become proposals.
- **Unfold:** preview, then confirm.

Details are in DJ's approved plan, summarized above. Nothing is built.

## Landmines (learned building Phase 1)

- **Writing the hierarchy columns:** set `set_config('buildos.project_hierarchy_write', 'on', true)` immediately before each protected UPDATE and reset it to `''` right after. Leaving it on for the whole transaction let a later direct UPDATE through (caught by the check script).
- **Second foreign keys:** see the incident. Rehearsal now flags them as `API:`. Treat that as blocking.
- **Local `pnpm dev` talks to the production Supabase.** Anything you click in local dev writes real rows.
    - The project DELETE route hard-deletes when not in production. Clean up test projects with `select public.soft_delete_onto_project('<id>')` through `supabase db query --linked`.
    - Create test projects through `/api/onto/projects/instantiate` with no description and no entities. The auto icon generation (a paid model call) needs a description and at least 3 items.
- **Stale dist:** after changing `packages/shared-types` or `packages/agentic-chat-runtime`, run `pnpm --filter <pkg> build`. The worker and parts of web dev load `dist`.
- **`svelte-check` kills a running dev server's proxy types:** run `touch apps/web/vite.config.ts` afterwards.
- **Rehearsal snapshots** can predate migrations applied today. Pass the earlier migration files first on the command line, in order.
- **Paid runs** (live chat, the battery, the pre-sort) need DJ's explicit OK each time, with the acting model and a cost estimate.
- **Foreign keys lock too.** A child row's foreign key to `onto_projects` takes `FOR KEY SHARE` on the
  project row. Any RPC that bumps the context version (by writing an entity) and then writes a row with a
  project foreign key must lock the project first, or it deadlocks with lock-first writers. Add a
  `concurrent-write-probe.mjs` scenario for any new write path.
- **Rehearsal ordering after an apply:** the cached snapshot (24 h) may predate today's applied files;
  pass them first, in ledger order, rather than `--refresh` while someone else is rehearsing.
- **Pre-existing test failures**, not caused by Phase 1:
    - `apps/worker/tests/agenticChatReviewRequestEvidence.test.ts`: commission guidance is 3,156 characters against a 3,000 cap.
    - `apps/web` `prompt-size-budget.test.ts`: payload is 79,661 against 79,250. The system prompt is at 11,946 of 12,000.
