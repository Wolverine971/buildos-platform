<!-- apps/web/docs/migrations/active/2026-08-02-ontology-crud-simplification.md -->

# Ontology CRUD Simplification

**Status:** Active  
**Started:** 2026-08-02  
**Last updated:** 2026-08-02  
**Scope:** Documents, tasks, plans, goals, and projects  
**Out of scope:** Broad agentic-chat redesign and unrelated UI redesign. Compatibility checks and narrowly scoped executor fixes are in scope when CRUD changes affect tool calls.

## Objective

Make ontology CRUD operations simpler, safer, and faster without changing their public behavior. The work focuses on:

- atomic database mutations;
- shorter request-time operation chains;
- fewer duplicate database reads and validations;
- document-tree updates that scale with the changed nodes rather than every document;
- durable asynchronous side effects;
- smaller route and UI responsibilities;
- one canonical representation for migrated fields.

## Safety constraints

- [ ] Preserve existing HTTP request and response contracts unless a change is explicitly documented.
- [ ] Preserve agentic-chat tool names, input schemas, output shapes, and affected-entity reporting.
- [ ] Do not edit or regenerate agentic-chat/shared contract files as a side effect of this work.
- [ ] Add characterization or failure-mode tests before changing a mutation boundary.
- [ ] Keep each implementation slice independently reviewable and reversible.
- [ ] Use forward-only database migrations; do not rewrite already-applied migrations.
- [ ] Run focused CRUD tests after every slice and broader guardrails before declaring a phase complete.
- [ ] Treat notification, calendar, public-page, analytics, and agent-triggered follow-up behavior as compatibility-sensitive.

## Baseline assessment

### Route and component size indicators

These sizes are indicators of mixed responsibilities, not defects by themselves:

| Surface                | Approximate size at assessment |
| ---------------------- | -----------------------------: |
| Document `[id]` route  |                    1,101 lines |
| Project `[id]` route   |                    1,002 lines |
| Task `[id]` route      |                    1,000 lines |
| Plan `[id]` route      |                      640 lines |
| Goal `[id]` route      |                      605 lines |
| `DocumentModal.svelte` |                    4,477 lines |
| `TaskEditModal.svelte` |                    1,743 lines |
| `GoalEditModal.svelte` |                    1,170 lines |
| `PlanEditModal.svelte` |                    1,032 lines |

The server-route guardrail currently passes because 33 oversized routes are grandfathered.

### Validation baseline

- 35 focused tests passed across seven CRUD/service test files during the assessment.
- Svelte diagnostics were clean for the inspected document, task, and project surfaces.
- Existing tests did **not** cover partial rollback, lost-update concurrency, or serverless background-work durability.

## Findings and work items

### P0 — Correctness and transaction boundaries

#### Atomic entity mutations

- [ ] Goal create: validate and apply relationships in the same transaction as the row insert.
    - [x] Interim guard: validate requested relationship references before inserting the row.
- [ ] Goal update: apply the row and relationship replacement atomically.
    - [x] Interim guard: validate requested relationship references before updating the row.
- [ ] Plan create: apply the row and containment/relationship changes atomically.
- [ ] Plan update: apply the row and containment/relationship changes atomically.
- [ ] Task create: include relationships with the existing task/assignee atomic command.
- [ ] Task update: include relationships with the existing task/assignee atomic command.
- [ ] Document create: make the row and critical tree/relationship state atomic.
- [ ] Document update: make the row and relationship state atomic.
- [ ] Document archive/restore/delete: update document state and tree structure atomically.

Current failure mode: an endpoint can return an error after the primary entity row has already committed, or return success after a non-durable structural side effect failed.

#### Optimistic concurrency

- [x] Add a database-enforced compare-and-swap condition to ordinary document PATCH.
- [x] Return `409 Conflict` when another writer wins between access loading and the update.
- [x] Add regression coverage proving stale and racing writes cannot overwrite newer content.
- [x] Extend the same revision strategy to document-tree mutations.

Baseline failure mode: document PATCH and document-tree mutations compared versions in application code and then performed unconditional updates, leaving time-of-check/time-of-use windows. Ordinary metadata/content PATCH now enforces the expected timestamp on the write itself, and document-tree mutations condition the canonical project update on the expected JSON structure version.

### P1 — Document-tree performance and integrity

- [x] Avoid loading full document content for structural operations.
- [x] Replace application-level version comparison with a conditional database update.
- [x] Update only changed child/parent rows rather than every document in the tree.
- [ ] Combine structure history and structural mutation in one transaction.
- [ ] Decide whether project JSON, normalized parent/order rows, or another representation is canonical.
- [ ] Remove duplicated `children` synchronization if it is not required as a canonical store.

Target complexity: a single add, move, archive, or restore should be proportional to the affected branch, not the total project document count.

### P1 — Relationship organization

- [ ] Build a normalized relationship plan before issuing writes.
- [ ] Validate references set-wise instead of one reference at a time.
- [ ] Remove repeated validation between callers, `autoOrganizeConnections`, containment, and semantic-edge application.
- [ ] Replace relationship edges in one transaction.
- [ ] Preserve all current tool-call relationship semantics and error messages where clients depend on them.

Current failure mode: one mutation can validate the same references multiple times and perform eight or more database round trips before side effects.

Transaction design note: goal connections can also reparent existing milestones, plans, tasks, risks, requirements, and metrics. A goal-only SQL implementation would duplicate the shared relationship planner and risk UI/tool behavior drift. Atomic entity work should therefore consume one shared edge-mutation plan rather than reimplementing connection semantics per route.

### P1 — Durable side effects and request latency

- [ ] Inventory synchronous and fire-and-forget side effects for each entity mutation.
- [ ] Define which work is core transaction state and which work is eventually consistent.
- [ ] Add a transactional outbox/job record for durable calendar, notification, public-page, and project-loop work.
- [ ] Use the platform request lifetime mechanism only for truly noncritical logging.
- [ ] Add retry, deduplication, and observability for outbox consumers.
- [ ] Return core mutation results without waiting for unrelated external calls.

Compatibility-sensitive consumers include task calendar synchronization, mention notifications, public document synchronization, activity logs, project-loop bursts, and agentic workflows observing changed entities.

### P2 — Read-path and API consolidation

- [ ] Consolidate actor resolution, project access, and entity loading where possible.
- [ ] Collapse redundant base and `/full` entity endpoints into query profiles or typed loaders.
- [ ] Preserve the project full-profile pattern: one profile RPC followed by parallel independent enrichment.
- [ ] Make `/api/onto/projects` the canonical project API.
- [ ] Move legacy project search, filtering, and pagination into SQL or the canonical selector service.
- [ ] Align project selector limits between route validation and service implementation.

### P2 — Route and UI responsibility cleanup

- [ ] Extract document mutation commands from the document route.
- [ ] Extract shared authentication, access, error-mapping, and props-merge scaffolding without creating a generic mega-handler.
- [ ] Split `DocumentModal` into a shell plus focused editor, versioning, publishing, asset, tree, and navigation controllers.
- [ ] Share safe load/save/delete lifecycle handling across goal, plan, and task editors.
- [ ] Add cancellation/session guards to goal and plan editor loading.
- [ ] Split project-page hydration, modal routing, realtime refresh, and task-coverage orchestration.

### P2 — Canonical fields

- [ ] Choose one canonical source for plan fields currently duplicated in columns and `props`.
- [ ] Choose one canonical source for goal fields currently duplicated in columns and `props`.
- [ ] Choose one canonical source for document content currently duplicated in `content` and `props.body_markdown`.
- [ ] Keep temporary response adapters for legacy clients instead of permanent dual-writing in each handler.

## Recommended implementation sequence

### Phase 1 — Failure-mode coverage and bounded correctness fixes

- [x] Add document lost-update tests.
- [x] Enforce document PATCH compare-and-swap at write time.
- [x] Add a goal-create regression proving invalid relationship references cannot leave a row behind.
- [x] Add a goal-update regression proving invalid relationship references cannot mutate the row.
- [ ] Add rollback tests for invalid or failed relationship changes.
- [x] Add document-tree concurrent-update tests.

### Phase 2 — Transactional CRUD commands

- [ ] Goals.
- [ ] Plans.
- [ ] Tasks.
- [ ] Documents.
- [ ] Projects.

Each command should own one business intent and return the complete core result required by HTTP and agentic callers.

### Phase 3 — Document-tree rewrite

- [ ] Introduce the transactional structure mutation primitive.
- [ ] Migrate add, move, archive, restore, and delete.
- [x] Remove full-tree child synchronization from the hot path.

### Phase 4 — Relationship batching and durable side effects

- [ ] Introduce set-based relationship planning/application.
- [ ] Introduce the outbox and worker path.
- [ ] Migrate side effects incrementally with compatibility tests.

### Phase 5 — API and UI simplification

- [ ] Consolidate read loaders and legacy project APIs.
- [ ] Split oversized UI orchestration.
- [ ] Complete canonical-field migrations.

## Verification matrix

Every affected entity should eventually have coverage for:

| Behavior                         | Document | Task | Plan | Goal | Project |
| -------------------------------- | -------- | ---- | ---- | ---- | ------- |
| Create rollback                  | ⬜       | ⬜   | ⬜   | ⬜   | ⬜      |
| Update rollback                  | ⬜       | ⬜   | ⬜   | ⬜   | ⬜      |
| Concurrent update conflict       | ✅¹      | ⬜   | ⬜   | ⬜   | ⬜      |
| Relationship replacement         | ⬜       | ⬜   | ⬜   | ⬜   | N/A     |
| Archive/restore/delete integrity | ⬜       | ⬜   | ⬜   | ⬜   | ⬜      |
| Tool/API contract compatibility  | ✅²      | ⬜   | ⬜   | ⬜   | ⬜      |
| Side-effect retry/deduplication  | ⬜       | ⬜   | ⬜   | ⬜   | ⬜      |

¹ Ordinary document metadata/content PATCH and the canonical project document-tree update are covered. Structure history and per-document child synchronization remain outside that transaction.

² The document-tree tool definition, registry/execution path, transient structure-conflict handling, API responses, and affected-entity reporting are covered. The model-facing input schema and success payload remain unchanged.

## Change log

### 2026-08-02

- Completed the initial CRUD architecture and performance assessment.
- Established the implementation order and safety constraints.
- Selected document PATCH lost-update prevention as the first bounded change.
- Added a write-time `updated_at` compare-and-swap condition to ordinary document PATCH.
- Added three document concurrency regression tests covering a racing write, a matching write, and an already-stale request.
- Moved goal-create relationship prevalidation ahead of the insert, preventing invalid references from leaving a partial goal behind.
- Added a goal-create ordering regression while retaining the later fully transactional command as pending work.
- Verified 36 focused CRUD and agentic-tool compatibility tests, the web type/Svelte check, formatting, and the server-route size guardrail.
- Moved goal-update relationship prevalidation ahead of the row update, preventing invalid references from leaving partially updated goal fields.
- Added a goal-update ordering regression and verified 57 focused CRUD and agentic-tool executor tests plus the web type/Svelte check.
- Added a write-time JSON structure-version guard to the canonical project document-tree update.
- Added service and API regressions proving a losing tree writer receives a conflict before history or child synchronization begins.
- Verified the shared ontology package build/typecheck, 57 focused document-tree and agentic executor tests, and the web type/Svelte check.
- Changed document removal to load only the project structure instead of every document row and body.
- Removed the redundant full-document fetch from tree recomputation; it now performs only its explicit metadata query.
- Added hot-path regressions for removal and recomputation, then verified 69 focused document CRUD/tree and agentic executor tests, shared package build/typecheck, and the web type/Svelte check.
- Audited the agentic `move_document_in_tree` definition, executor, registry path, API contract, and affected-entity inference. No model-facing tool-definition change was required.
- Added one bounded retry for a transient document-tree structure conflict. The retry remains inside the executor, so agents do not need to read or provide structure versions.
- Added explicit affected-entity inference for `move_document_in_tree`, preserving the moved document and project in tool-call results and follow-up context.
- Changed document-child synchronization to write only newly added nodes and parents whose direct child list changed. A representative six-node move now performs two child updates instead of six.
- Added conflict-retry, affected-entity, and changed-parent synchronization regressions, then verified 157 focused CRUD/API/agentic tests, the shared package build/typecheck, and a clean web type/Svelte check.

## Rollback guidance

- TypeScript-only changes should remain isolated enough to revert per slice.
- Database changes must be reversed with a new forward migration when already deployed.
- Do not roll back by editing migration history.
- If a new transactional command causes compatibility issues, retain the prior route path behind an explicit temporary fallback while gathering diagnostics; do not silently mix both mutation paths.
