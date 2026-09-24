<!-- docs/technical/reviews/MODAL_PERFORMANCE_AUDIT_2026-09-05.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-19; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Modal and Today navigation performance

Date: 2026-09-05

## Findings and implemented changes

The inspected flows had several avoidable waits and redundant operations. These changes remove that work without changing authentication, database schemas, or document version/conflict behavior.

| Flow                                              | Bottleneck                                                                                                          | Change                                                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today task and project task/document/goal opening | The click waited for the editor module before starting its entity request.                                          | Start the entity request on click while the module loads. A bounded, single-use handoff shares that request with the editor. Each reopening makes a fresh request.                    |
| First editor opening                              | Editor code was requested only after a click.                                                                       | Preload code on pointer/focus intent over task, goal, and document surfaces; respect Save Data. Hover does not fetch entity records.                                                  |
| Today → project                                   | Project links lacked explicit route preloading.                                                                     | Preload route code for visible links and route data on hover.                                                                                                                         |
| Task/goal Save                                    | Forms sent every field even when untouched, including reformatted dates. Unchanged Save wrote and refreshed anyway. | Compare normalized form snapshots, send only edited fields, and close unchanged forms without a write or refresh. Preserve the original stored date when the date input is untouched. |
| Task Save                                         | Presence of title/date fields triggered calendar reconciliation even when values were equivalent.                   | Compare actual title and timestamp values before scheduling reconciliation. Real title/date edits and completion behavior remain covered.                                             |
| Goal Save                                         | Main-form saves caused a full project refresh.                                                                      | Refresh the edited goal alone. Saves after linked-entity changes retain the broader refresh.                                                                                          |
| Hidden desktop Details drawer                     | Hidden children mounted and could start member/collaboration work.                                                  | Defer children until the drawer is first opened; retain them afterward. Inline mobile controls still render.                                                                          |
| Document Save                                     | Document-tree metadata was synchronized when title/description were included but unchanged.                         | Synchronize only when their actual values change. Explicit document version saves retain their existing semantics.                                                                    |
| Modal close                                       | Restoring focus could start scrolling after body scroll restoration.                                                | Restore focus to the connected opener with `preventScroll`.                                                                                                                           |

## Expected effect and limits

For click-driven opening, the module and entity read now overlap: their contribution to the critical path changes from approximately **module load + entity read** to **the slower of the two**, followed by rendering. The single-use handoff avoids a second entity GET; it is not a persistent entity cache. Abandoned handoffs expire, failed preparation can retry, and task/document cancellation remains connected while reading the response body.

An unchanged task or goal Save now requires **zero mutation requests and zero parent refreshes**. Description-only task saves no longer carry title, date, or assignee fields into unrelated update work. Ordinary goal form saves use an entity refresh instead of reloading the full project.

These are code-path and request-count improvements verified by tests. No production before/after latency percentiles were collected, so this audit does not claim a measured millisecond or percentage speedup. Database/authentication round trips, editor rendering, and intentional document version/live-document operations still contribute to latency.

## Verification

- **79 targeted tests passed** across form diffs, request handoff, TaskEditModal, GoalEditModal, DocumentModal, TodayAgendaRow, project mutation refresh, ProjectWorkspace, task calendar reconciliation, and document metadata/version behavior.
- Final `pnpm --filter @buildos/web check`: **zero errors and zero warnings**. Validation ran through the machine-wide test gate with the repository worker limits.
- Svelte analysis and formatting checked the edited components. Existing unrelated analyzer suggestions were left outside this change.
- Local browser checks: Today task opening/closing, unchanged task Save, focus restoration, Today → project navigation, and document opening/closing. An initial stale editor required a reload; a later stopped development server was replaced with an already-running instance from this checkout before completing document verification.
- Goal integration tests verify one shared opening GET, a scoped refresh after a main-form Save, and broader refresh after milestone changes.

## Main implementation locations

- `apps/web/src/lib/components/project/entity-modal-data.ts`
- `apps/web/src/lib/actions/preload-entity-modal.ts`
- `apps/web/src/lib/utils/form-patch.ts`
- `apps/web/src/lib/components/ontology/{TaskEditModal,GoalEditModal,DocumentModal,EntityModalDetailsDrawer}.svelte`
- `apps/web/src/lib/components/ui/Modal.svelte`
- `apps/web/src/routes/projects/[id]/{ProjectWorkspace,ProjectWorkspaceEntityModals}.svelte`
- `apps/web/src/routes/today/+page.svelte`
- `apps/web/src/routes/api/onto/{tasks,documents}/[id]/+server.ts`

Changes were implemented in the local checkout. Deployment and production timing verification were not part of this run.
