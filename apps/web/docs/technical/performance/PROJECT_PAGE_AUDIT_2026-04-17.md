<!-- apps/web/docs/technical/performance/PROJECT_PAGE_AUDIT_2026-04-17.md -->

# Project Detail Page Smoothness & Loading Audit - `/projects/[id]`

**Date:** 2026-04-17
**Scope:** `apps/web/src/routes/projects/[id]/` and the components/endpoints it pulls from
**Context:** Follow-up audit after consolidating the SSR hot path into `get_project_skeleton_with_access` in this worktree (see `supabase/migrations/20260430000008_get_project_skeleton_with_access.sql`). SSR is now designed around 1 DB round-trip. This audit focuses on everything downstream: hydration, post-mount fetches, mutation refreshes, and skeleton-to-content transitions.

**Implementation update, 2026-04-18:** Recommended items #1-#6 have been applied in this worktree. Generic refresh now uses `/full` and no longer force-refreshes members/settings; `/full` now includes user-scoped events and public page counts; `PublishedPanel` lazy-loads page details; and `DocTreeView` is seeded from hydrated project/documents data with visibility-gated, structure-only polling. The remaining planned work starts at member loading and perceived smoothness.

> Round-trip counts below are static path counts from the current code, not a production trace. Confirm final deltas with browser network timing and Supabase query timing after each PR.

---

## TL;DR

The direction is right: SSR is tight, and the biggest remaining UX cost is client-side fan-out after first paint.

- **First paint:** fast, via `get_project_skeleton_with_access`.
- **Automatic post-load fetches after applied chunks:** `/full` plus `/members`; `/events` and doc-tree data are folded into the hydrated path, and public-page details are lazy unless live pages need an open panel.
- **Lazy fetches:** `/briefs` and `/logs` are already lazy behind collapsed history panels.
- **Mutation refreshes after applied chunks:** `refreshData()` uses the canonical `/full` snapshot and no longer force-refreshes unrelated member or notification settings data.

Applied changes so far:

1. `fetchProjectSnapshot()` now uses `/api/onto/projects/[id]/full` as the tactical canonical snapshot path.
2. Generic `refreshData()` no longer force-refreshes members or notification settings.
3. `/full` fans in events through `OntoEventSyncService.listProjectEvents()` so per-user sync rows remain scoped to the current user.
4. `/full` includes public page counts, and `PublishedPanel` uses those counts before fetching page details.
5. The page builds a seeded doc-tree model from `project.doc_structure` and `documents[]`, including `unlinked` and `archived` buckets derived with the shared doc-tree normalization helpers.
6. `DocTreeView` accepts the seeded model, skips the mount-time `/doc-tree` fetch when present, and polls only structure/version data while the document is visible.

---

## Original Hot Path

| Phase                        | Work                                                                                                                                              | Current cost                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **SSR**                      | `get_project_skeleton_with_access` RPC returns skeleton + access flags.                                                                           | 1 DB RPC on the intended path, with a full-data fallback if the RPC errors.                                     |
| **Hydration fetch**          | `GET /api/onto/projects/[id]/full` resolves actor, calls `get_project_full`, then enriches task assignees and last-changed-by actors in parallel. | 1 API call; DB side is actor resolve + 1 RPC + 2 enrichment queries.                                            |
| **Automatic post-hydration** | `/events` + `/members` after hydration; `/public-pages` and `/doc-tree` mount in the desktop layout.                                              | 4 more API calls after `/full` on the common desktop path.                                                      |
| **Lazy panels**              | `/briefs` and `/logs` load only when their collapsed panels are expanded.                                                                         | Good as-is; do not count these as mount-time fetches.                                                           |
| **Generic mutation refresh** | `refreshData()` -> `/api/onto/projects/[id]` plus `/events`, `/members?force`, and `/notification-settings?force` for collab-capable users.       | Up to 4 API calls; the project snapshot endpoint performs an 11-entity query batch plus access/enrichment work. |

Not every mutation uses this path: deletes and milestone completion toggles are already optimistic, and event create/update only reload events. The expensive path applies to most task/plan/goal/risk/milestone create/update flows plus project/document save refreshes.

## Current Hot Path After Applied Chunks

| Phase                        | Current behavior                                                                                                                                                                   | Remaining cost                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **SSR**                      | Unchanged: skeleton/access data comes from `get_project_skeleton_with_access`.                                                                                                     | 1 DB RPC on the intended path, with the existing fallback retained.                                            |
| **Hydration fetch**          | `/full` is now the canonical client snapshot. It returns core project data, user-scoped events, public page counts, and enough project/document data to seed the doc tree.         | 1 API call; DB side is still the core RPC plus parallel server-side enrichment/fan-in.                         |
| **Automatic post-hydration** | `/events`, `/doc-tree`, and zero-count `/public-pages` no longer fire as separate mount requests. `/members` still loads after hydration to preserve current actor/person filters. | Common no-live-page desktop path is `/full` + `/members`; live public pages may still fetch details by design. |
| **Generic mutation refresh** | `refreshData()` now calls `/full` and consumes included events/counts without forcing member or notification-settings refreshes.                                                   | 1 canonical snapshot call; document/public-page actions can still explicitly refresh their own panel data.     |

---

## Original Findings By Severity

### Critical

#### C1. Generic refresh still uses the unoptimized project endpoint

- `apps/web/src/lib/components/project/project-page-data-controller.ts:173` - `fetchProjectSnapshot()` calls `/api/onto/projects/[id]`.
- `apps/web/src/routes/api/onto/projects/[id]/+server.ts` still does a broad parallel entity fetch instead of using `get_project_full`.
- `/api/onto/projects/[id]/full` is the canonical optimized loader and already reflects the newer `goal_milestone_edges` work from `supabase/migrations/20260430000007_get_project_full_with_goal_edges.sql`.

**Fix:** Prefer making `/api/onto/projects/[id]` GET delegate to the same RPC-backed implementation as `/full` so there is only one server-side read contract. The smaller tactical fix is to point `fetchProjectSnapshot()` at `/full`, but that leaves two endpoint implementations to drift.

#### C2. `refreshData()` force-refreshes unrelated member/settings data

- `apps/web/src/routes/projects/[id]/+page.svelte:1043` runs `loadProjectEvents()`, forced notification settings, and forced members after every generic snapshot refresh.
- Members do not change when a task, plan, goal, risk, or milestone changes.
- Notification settings do not change when project entities change.

**Fix:** Remove member and notification settings force-refreshes from generic `refreshData()`. Refresh members only after collaboration membership changes. Refresh notification settings only after notification settings mutations or when opening the menu/collaboration surface.

### High

#### H1. Events are absent from `/full`, but must keep user-scoped sync semantics

- `get_project_full` currently returns project, goals, requirements, plans, tasks, documents, images, sources, milestones, risks, metrics, context document, and goal-milestone edges. It does not return `events`.
- `+page.svelte` immediately calls `/api/onto/projects/[id]/events` after `/full` hydrates.
- The events endpoint uses `OntoEventSyncService.listProjectEvents()` and scopes `onto_event_sync` rows to the current user. A naive RPC-side JSON aggregation could leak or misreport sync state.

**Fix:** Include `events` in the `/full` response, but preserve the current shape and user scoping. Two acceptable implementations:

1. Extend `get_project_full` with events plus a safe way to include only the current user's sync rows.
2. Keep the RPC focused on core project data and have `/full/+server.ts` fan in `listProjectEvents()` server-side in parallel with task enrichment.

The first option reduces DB calls more, but the second option is safer and still removes the extra browser round-trip.

#### H2. `DocTreeView` re-fetches data that `/full` already mostly has

- `DocTreeView.svelte:475` calls `fetchTree()` on mount.
- `fetchTree()` pulls `/api/onto/projects/[id]/doc-tree` even though the hydrated project payload includes `project.doc_structure` and `/full` already returns `documents[]`.
- The current doc-tree API also computes `unlinked` and `archived`, so the seed needs more than just root structure.

**Fix:** Pass initial tree data into `DocTreeView`: `structure` from `project.doc_structure`, a `documents` lookup built from `documents[]`, plus derived `unlinked` and `archived` lists using the same state normalization as `getDocTree()`. Only call `/doc-tree` on explicit refresh, drag/drop conflict recovery, or if the initial payload is missing.

#### H3. Doc-tree polling is too expensive for a background tab

- `DocTreeView.svelte:460` starts a 30s interval.
- The polling call reuses full `fetchTree(true)`, which fetches the complete doc tree and documents.
- There is no visibility-state gating.

**Fix:** If polling remains, pause it when `document.visibilityState !== 'visible'` and resume on `visibilitychange`. Also make the poll lightweight: either request structure-only data (`include_documents=false`) or add a cheap version endpoint. Full tree/documents should load only when the user accepts an update or explicitly refreshes.

#### H4. `PublishedPanel` fetches on mount and defaults open

- `PublishedPanel.svelte:45` defaults `expanded = true`.
- `PublishedPanel.svelte:74` fetches `/public-pages` on mount even when the user never interacts with the panel.

**Fix:** Do not simply collapse it without signal. Add a cheap `public_page_counts` or `live_public_page_count` field to `/full`, render the badge from that count, default collapsed when count is zero, and fetch page details only on expand or after publish/unpublish.

#### H5. Cold-cache dynamic imports can cause a second skeleton flash

- After hydration ends, the page switches from the main skeleton to `{#await import(...)}` blocks for `ProjectDocumentsSection`, `ProjectInsightRail`, and `MobileCommandCenter`.
- On a cold cache this can show skeleton A -> skeleton B -> content.

**Fix:** Warm the dynamic imports in `onMount` in parallel with `hydrateFullData()`. This is a perceived-smoothness fix, not a data-loading fix.

### Medium

#### M1. Creates and updates discard returned entities, blocking optimistic state updates

- The create/update endpoints generally return the created/updated entity.
- The modal callbacks currently pass only IDs back to the page, for example `TaskCreateModal` calls `onCreated(result.data.task.id)`.
- The page then calls `refreshData()` to see data the client already received.

**Fix:** Change modal callback contracts to pass the returned entity object, merge it into local page state, and keep `refreshData()` only for pull-to-refresh, reconciliation, and error recovery. This is a dedicated PR because it touches several modal contracts and needs tests around rollback/reconciliation.

#### M2. Members are fetched on every page load, but lazy-loading needs a `currentActorId` plan

- `+page.svelte:364` and `+page.svelte:427` call `ensureProjectMembersLoaded()` after hydration.
- The member endpoint also provides `actorId`, which powers "Assigned to me" and person-focus filters.
- `taskAssigneeFilterMembersFromTasks` can derive assignee options from loaded tasks, but it cannot identify "me" without `currentProjectActorId`.

**Fix:** Add `current_actor_id` to the skeleton access bundle or the `/full` response, then derive filter members from task assignees by default. Lazy-load the full member roster only when the filter UI opens or after collaboration membership changes. Do not remove the member request first unless the "me" filters are preserved.

#### M3. Desktop and mobile document panels can duplicate doc-tree work

- Desktop `ProjectDocumentsSection` mounts `DocTreeView`, which fetches `/doc-tree`.
- Mobile `CommandCenterDocumentsPanel` can also fetch `/doc-tree` when expanded and parent tree data has not arrived.

**Fix:** Lift doc-tree state to the page and pass one seeded tree model to both desktop and mobile document panels. Combined with H2, both layouts consume hydrated data first and use the API only for explicit refresh/reconciliation.

#### M4. `+page.server.ts` fallback duplicates `/full` enrichment logic

- The fallback in `+page.server.ts` duplicates sanitize, milestone decoration, assignee, and last-changed-by enrichment.
- It is useful while `get_project_skeleton_with_access` is newly introduced.

**Fix:** Keep the fallback for now, but track it for cleanup after the skeleton/access RPC is deployed and observed stable. The prior recommendation to delete it as a quick win was too aggressive.

### Low

- **L1.** `NextStepDisplay` does not trigger an LLM call on mount. It calls `generateProjectNextStep()` only from explicit button handlers, so no action is needed.
- **L2.** Derived filter/sort chains recompute often. This is acceptable until real projects approach ~1,000 tasks/items in one page.
- **L3.** The root page imports several Lucide icons. This is minor relative to network and endpoint fan-out and is not worth prioritizing.
- **L4.** `/briefs` and `/logs` are already lazy behind collapsed panels. Keep that behavior.

---

## Recommended Work, Ordered

| #   | Change                                                                                                                                        | Effort       | Status                                                   | Impact                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Make `/api/onto/projects/[id]` GET delegate to the `/full` RPC-backed loader, or point `fetchProjectSnapshot()` at `/full` as a tactical step | S            | Done tactically: client snapshot now uses `/full`        | Removes the 11-entity fan-out from generic refresh                 |
| 2   | Remove forced members and notification-settings refreshes from `refreshData()`                                                                | XS           | Done                                                     | Removes up to 2 unrelated API calls per generic refresh            |
| 3   | Include events in the `/full` response while preserving `onto_event_sync` user scoping                                                        | S/M          | Done via server-side fan-in using `OntoEventSyncService` | Removes the automatic `/events` browser request                    |
| 4   | Seed `DocTreeView` from hydrated `project.doc_structure` + `documents[]`, including derived unlinked/archived lists                           | M            | Done                                                     | Removes the automatic `/doc-tree` browser request                  |
| 5   | Visibility-gate doc-tree polling and make polling structure/version-only                                                                      | S            | Done                                                     | Reduces background network and DB load                             |
| 6   | Add public-page count to `/full`; lazy-load `PublishedPanel` details on expand                                                                | S            | Done                                                     | Removes mount-time `/public-pages` for projects with no live pages |
| 7   | Add `current_actor_id` to the hydrated/access payload, then lazy-load full members only on filter/collab need                                 | S            | Next                                                     | Removes mount-time `/members` without breaking "me" filters        |
| 8   | Warm dynamic imports in `onMount` alongside hydration                                                                                         | S            | Pending                                                  | Reduces skeleton-to-skeleton flicker                               |
| 9   | Convert create/update modal callbacks to pass returned entities and merge local state optimistically                                          | M/L          | Pending                                                  | Removes most happy-path generic refreshes                          |
| 10  | Remove the `+page.server.ts` full-data fallback after production observation                                                                  | XS, deferred | Deferred                                                 | Simplifies code after the new RPC is proven                        |

### Expected Combined Effect

- **Automatic cold desktop visit after HTML:** originally `/full` + `/events` + `/members` + `/public-pages` + `/doc-tree`; after applied chunks, common no-live-page desktop path is `/full` + `/members`.
- **Generic mutation refresh before optimistic updates:** originally up to 4 API calls and broad fan-out; after applied chunks, this is 1 canonical `/full` snapshot call.
- **Generic mutation happy path after optimistic updates:** local merge, with background reconciliation only when needed.

---

## What Not To Do Yet

- Do not add SSE/streaming for the project page yet. Pull-to-refresh plus explicit reconciliation is enough until collaborative editing gets heavier.
- Do not delete the `+page.server.ts` fallback until the new skeleton/access RPC has been observed stable in production for at least a week or two.
- Do not collapse `PublishedPanel` without adding a count/badge source. Users with live public pages still need a visible signal.
- Do not lazy-remove the members load until `currentProjectActorId` is available without it.
- Do not put events into `get_project_full` in a way that returns other users' `onto_event_sync` rows.
- Do not optimize filter/sort derivations or Lucide imports before fixing network fan-out.

---

## Suggested Sequencing

1. **Small PR 1 - generic refresh cleanup:** #1 and #2. This is the highest confidence win and reduces mutation cost immediately.
2. **Small PR 2 - safe hydration fan-in:** #3 and #6. Keep user-scoped event sync and public-page counts explicit in tests.
3. **Medium PR - document tree contract:** #4 and #5. This changes component props and refresh behavior, so review it separately.
4. **Small PR 3 - member loading:** #7 after `current_actor_id` is present in hydrated data.
5. **Small PR 4 - perceived smoothness:** #8. Low risk, but validate the visual result on cold cache.
6. **Dedicated PR - optimistic creates/updates:** #9. This crosses modal contracts and should include tests for success and reconciliation paths.
7. **Deferred cleanup:** #10 after production observation.

---

## Files Referenced

- `apps/web/src/routes/projects/[id]/+page.server.ts`
- `apps/web/src/routes/projects/[id]/+page.svelte`
- `apps/web/src/routes/api/onto/projects/[id]/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/events/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/doc-tree/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/public-pages/+server.ts`
- `apps/web/src/lib/components/project/project-page-data-controller.ts`
- `apps/web/src/lib/components/project/PublishedPanel.svelte`
- `apps/web/src/lib/components/project/ProjectDocumentsSection.svelte`
- `apps/web/src/lib/components/project/CommandCenterDocumentsPanel.svelte`
- `apps/web/src/lib/components/project/MobileCommandCenter.svelte`
- `apps/web/src/lib/components/project/NextStepDisplay.svelte`
- `apps/web/src/lib/components/ontology/doc-tree/DocTreeView.svelte`
- `apps/web/src/lib/services/ontology/doc-structure.service.ts`
- `apps/web/src/lib/services/ontology/onto-event-sync.service.ts`
- `supabase/migrations/20260430000007_get_project_full_with_goal_edges.sql`
- `supabase/migrations/20260430000008_get_project_skeleton_with_access.sql`
