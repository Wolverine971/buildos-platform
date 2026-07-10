<!-- apps/web/docs/technical/components/hyperplexed/ENTITY_MODAL_LOADING_PERFORMANCE_AUDIT_2026-07-09.md -->

# Project Entity Modal Loading — Performance Audit (2026-07-09)

**Surface:** dashboard recent activity → project page → task, document, goal, and plan edit modals.
**Method:** static request/chunk trace plus production build verification, stacked on the existing
[task](./TASK_EDIT_MODAL_AUDIT_2026-07-06.md) and
[document](./DOCUMENT_MODAL_AUDIT_2026-07-06.md) audits. Fixes use
[P20](./HYPERPLEXED_FIX_PATTERNS.md#p20--critical-entity-first-secondary-context-after-first-paint).

## What was happening

The visible delay was not one problem:

- Dashboard task rows navigated to a separate task page, while document and goal rows only opened
  the project root. The clicked document/goal identity was lost.
- A direct project entity URL opened the modal but simultaneously started the broad
  `/api/onto/projects/[id]/full` hydration behind it.
- Every edit modal waited on its `/full` response. That response performed the entity/access work,
  then scanned edges and fetched up to five or six linked-entity kinds before returning the core
  form fields. The task modal discarded that linked payload and its `LinkedEntities` child fetched
  the same relationship data again.
- The project page loaded `ProjectModalsHost` first; only after that chunk resolved did the host
  request the actual editor. Goal, plan, and document editors then eagerly imported their nested
  task/document/goal/plan editors, widening the first-open chunk.
- Document desktop/mobile relationship panels could mount together and issue identical initial
  requests.

## Findings and disposition

### Tier 1 — directness and intent preloading ✅ shipped

- **Recent activity lost the selected entity.** Task, document, and goal rows now use one canonical
  project URL with `entity` + `entity_id`, so the destination project opens the exact selected
  modal. → P6+P20
- **Cold chunks started only after navigation.** Recent rows now preload the host and exact editor
  on pointer intent or keyboard focus. The destination repeats the preload for direct/external URLs,
  sharing cached import promises. → P13+P20

### Tier 2 — critical-path separation ✅ shipped

- **Relationship queries blocked the form.** The four modal requests now use
  `include_linked=false`; the existing `/full` endpoints keep their default response for other
  callers but skip the edge scan/detail fan-out for the modal's critical request. `LinkedEntities`
  loads progressively after the form renders and reports its result back to document/goal/plan
  parents for counts and goal milestones. → P20
- **Broad project hydration competed with direct modal opening.** Skeleton-first project hydration
  is deferred only for query-driven entity opens, then resumes as soon as the modal's core request
  settles or the user closes it. Normal project navigation is unchanged. → P20
- **Nested editors inflated first-open code.** Goal, plan, and document modals no longer statically
  import one another; nested editors load only when a linked entity is opened. The shared loader
  also removes the host→editor serial import waterfall. → P20
- **Concurrent relationship reads duplicated work.** Identical in-flight link requests now share a
  promise and are released immediately afterward, so mutation-driven refreshes are not served stale
  cached data. → P20
- **Goal milestone context could flash an incorrect empty state.** It now shows a stable,
  reduced-motion-safe loading skeleton until the deferred relationship result arrives. → P11+P20

### Tier 3 — none

Speed is the polish. These dense work modals do not earn an additional signature effect.

## Verification

- ✅ Focused Vitest: 18 tests passed (canonical entity URLs + concurrent relationship deduplication).
- ✅ Targeted ESLint: 0 errors; 6 existing warnings in goal/milestone files.
- ✅ `pnpm build:prod`: production client + SSR build succeeded.
- ✅ Current first-open editor chunks remain split: task 11.8 KB gzip, plan 8.1 KB, goal 12.2 KB,
  document 39.1 KB; `ProjectModalsHost` is 5.0 KB gzip.
- ✅ `pnpm check`: 0 errors / 0 warnings.
- ⬜ Authenticated live smoke remains: the in-app browser correctly redirected the unauthenticated
  dashboard request to login. Verify dashboard → task/document/goal at desktop and iPhone widths,
  and confirm the core form becomes interactive before Links/Milestones finish loading.
