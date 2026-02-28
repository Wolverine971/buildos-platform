<!-- apps/web/docs/technical/audits/PROJECT_PAGE_ID_ROUTE_AUDIT_2026-02-27.md -->

# Project Page Audit: `/projects/[id]` (`+page.svelte`)

Date: 2026-02-27
File: `apps/web/src/routes/projects/[id]/+page.svelte`

## Summary

The page is currently a high-complexity controller/view hybrid.

- ~3,250 lines in one Svelte file
- 46 local functions
- 40 `$state` variables
- 24 lazy imports (`{#await import(...)}`)

The panel system is partially config-driven, but key behavior and rendering paths remain centralized in one file, which makes reasoning, regression control, and iteration speed difficult.

## Findings (Prioritized)

### 1) Null filter mismatch in generic filter logic (Medium)

In `filterEntity`, standard field filtering only rejects mismatches when `itemValue != null`.

Result: if user selects a filter value and an entity has `null`/`undefined` for that field, it can incorrectly pass through.

- Reference: `apps/web/src/routes/projects/[id]/+page.svelte:770-773`

### 2) Image panel create action is timing-sensitive (Medium)

For `images`, clicking panel `+` expands the panel and immediately calls `imageAssetsPanelRef?.openUploadModal()`. If the panel content has not mounted yet, the ref is still null and the modal does not open on first click.

- References:
    - `apps/web/src/routes/projects/[id]/+page.svelte:1132-1154`
    - `apps/web/src/routes/projects/[id]/+page.svelte:2680-2688`

### 3) Refresh success toast causes noisy/double feedback (Low)

`refreshData()` always toasts success, but many create/update handlers already toast success. This can produce duplicate notifications and UI noise.

- References:
    - `apps/web/src/routes/projects/[id]/+page.svelte:1416-1452`
    - `apps/web/src/routes/projects/[id]/+page.svelte:1648+`

### 4) Entity-open logic duplicated in 3 switch statements (Low)

The same mapping exists in:

- `handleNextStepEntityClick`
- `handleGraphNodeClick`
- `handleActivityLogEntityClick`

This is maintainability risk (drift bugs) and harder to test.

- References:
    - `apps/web/src/routes/projects/[id]/+page.svelte:1879-1994`

### 5) Type-safety erosion in panel data path (Low)

Multiple `any` and `as unknown as` conversions weaken static guarantees and make refactors riskier.

- References:
    - `apps/web/src/routes/projects/[id]/+page.svelte:247`
    - `apps/web/src/routes/projects/[id]/+page.svelte:846-970`

### 6) Dead/disabled icon studio path still adds state + markup surface area (Low)

`ENABLE_PROJECT_ICON_STUDIO_UI = false`, but related state, modal wiring, and handler path remain in the file.

- References:
    - `apps/web/src/routes/projects/[id]/+page.svelte:274-276`
    - `apps/web/src/routes/projects/[id]/+page.svelte:3078-3091`

## Complexity Hotspots

1. Mixed concerns in one script: hydration, state orchestration, API calls, panel filtering/sorting, modal control, and click routing.
2. Large inline conditional panel rendering branch in template.
3. Repeated optimistic CRUD patterns per entity.
4. Duplicated mobile/desktop history section lazy-import markup.

## Cleanup Plan (Staged)

### Phase 1: Behavior and UX correctness (small, low risk)

- Fix null-filter behavior so selected filters exclude null/undefined values.
- Fix image panel `+` action to reliably open upload modal on first click.
- Add `refreshData({ showSuccessToast?: boolean })` mode and use silent refreshes in callbacks that already toast.

### Phase 2: Extract panel data controller (small-medium)

- Move panel filter/sort logic (`filterEntity`, `sortEntities`, per-panel derived lists, state update helpers) into a typed module.
- Keep view file consuming a small typed interface.

### Phase 3: Split major view sections (medium)

Extract into focused components:

- `ProjectHeaderCard`
- `ProjectDocumentsSection`
- `ProjectInsightRail`
- `ProjectHistorySection`

Target: reduce `+page.svelte` to page wiring/composition.

### Phase 4: Unify entity routing + modal orchestration (small-medium)

- Create single `openEntity(type, id)` handler.
- Replace duplicated switch blocks.
- Consider central modal discriminated union state instead of many booleans.

### Phase 5: Type hardening + dead code removal (small)

- Replace image `any[]` with concrete image asset type.
- Remove or fully reinstate icon studio path.
- Reduce cast-heavy `unknown as` routes in panel logic.

### Phase 6: Regression coverage (small)

Add route-level client tests for:

- filter semantics (including null fields)
- image `+` first-click behavior
- entity click routing from Next Step / Graph / Activity Log

### Phase 7: Modal host extraction (small-medium)

- Move bottom-of-page modal rendering from `+page.svelte` into a dedicated host component.
- Keep state ownership in route file; pass explicit close/save/delete callbacks into host.
- Preserve lazy imports and existing modal behavior while reducing route template surface area.

## Execution Status

- [x] Audit complete
- [x] Phase 1 complete
- [x] Phase 2 complete
- [x] Phase 3 complete
- [x] Phase 4 complete (entity routing dedupe)
- [x] Phase 5 complete
- [x] Phase 6 complete
- [x] Phase 7 complete

## Implementation Updates (This Session)

### Completed in `+page.svelte`

1. Fixed null-field filtering behavior in generic panel filtering.
2. Fixed image panel `+` action so upload modal opens reliably even when panel content mounts asynchronously.
3. Added `refreshData({ showSuccessToast?: boolean })` and made callback-driven refreshes silent by default to avoid duplicate success toasts.
4. Consolidated duplicated entity-open switch logic into `openEntityEditor(...)` and reused it across:
    - next step entity clicks
    - graph node clicks
    - activity log entity clicks
5. Extracted panel filter/sort/count/state-update logic into:
    - `apps/web/src/lib/components/ontology/insight-panels/panel-data-controller.ts`
6. Rewired `+page.svelte` to use extracted helpers:
    - `buildTaskFilterGroups(...)`
    - `filterAndSortInsightEntities(...)`
    - `calculateInsightPanelCounts(...)`
    - `updateInsightPanelFilters(...)`
    - `updateInsightPanelSort(...)`
    - `updateInsightPanelToggle(...)`
7. Split major UI sections into focused components:
    - `apps/web/src/lib/components/project/ProjectHeaderCard.svelte`
    - `apps/web/src/lib/components/project/ProjectDocumentsSection.svelte`
    - `apps/web/src/lib/components/project/ProjectHistorySection.svelte`
    - `apps/web/src/lib/components/project/ProjectInsightRail.svelte`
8. Replaced large inline template blocks in `+page.svelte` with component composition.
9. Removed disabled icon-studio dead path from `+page.svelte`:
    - deleted `showProjectIconStudioModal` and `ENABLE_PROJECT_ICON_STUDIO_UI`
    - deleted icon-studio refresh handlers and modal block
10. Replaced `images: any[]` with `OntologyImageAsset[]` state typing.
11. Reduced cast-heavy sort-display callsites by broadening `getSortValueDisplay` input typing and removing repeated `unknown as Record<string, unknown>` casts.
12. Rewired remaining route interaction flows to extracted helper module `project-page-interactions.ts`:
    - pending image-upload open queue now uses `requestImageUploadOpen(...)` and `flushPendingImageUploadOpen(...)`
    - `openEntityEditor(...)` now uses `resolveEntityOpenAction(...)` mapping
13. Added phase-6 regression tests:
    - `apps/web/src/lib/components/project/project-page-interactions.test.ts`
        - image upload first-click queue/flush behavior
        - entity type routing map (supported, unsupported, unknown)
    - `apps/web/src/lib/components/ontology/insight-panels/panel-data-controller.test.ts`
        - selected filter excludes null field values
        - selected filter includes matching values
        - task assignee special filter semantics (`__unassigned__`)
14. Post-phase cleanup pass:
    - consolidated duplicated next-step/graph/activity-log entity click handling through a shared `handleEntityClick(...)` wrapper in `+page.svelte`
    - added `refreshProjectSilently()` callback helper and replaced repeated inline `onRefreshData={() => refreshData()}` handlers
15. Phase 7 implementation:
    - extracted bottom modal/graph rendering into `apps/web/src/lib/components/project/ProjectModalsHost.svelte`
    - rewired route to render one host instance with explicit state + action props:
        - `apps/web/src/routes/projects/[id]/+page.svelte`
    - added small route-side modal close/save helper callbacks (`closeDocumentModal`, `closeGraphModal`, `handleProjectSaved`, etc.) to keep state transitions centralized
    - reduced `+page.svelte` size from ~2132 lines to 1965 lines while preserving modal behavior and lazy-loading boundaries
