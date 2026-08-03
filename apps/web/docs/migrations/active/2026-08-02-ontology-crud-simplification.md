<!-- apps/web/docs/migrations/active/2026-08-02-ontology-crud-simplification.md -->

# Ontology CRUD Simplification

**Status:** Active  
**Started:** 2026-08-02  
**Last updated:** 2026-08-03
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
- [x] Document archive/restore/delete: update document state and tree structure atomically.
    - [x] Archive: document state, canonical tree, history, and changed child caches commit together.
    - [x] Restore: state and any legacy tree cleanup commit together; unchanged trees are not rewritten.
    - [x] Delete: active soft delete and archived permanent delete commit with tree cleanup.

Current failure mode: an endpoint can return an error after the primary entity row has already committed, or return success after a non-durable structural side effect failed.

#### Optimistic concurrency

- [x] Add a database-enforced compare-and-swap condition to ordinary document PATCH.
- [x] Return `409 Conflict` when another writer wins between access loading and the update.
- [x] Add regression coverage proving stale and racing writes cannot overwrite newer content.
- [x] Extend the same revision strategy to document-tree mutations.

Baseline failure mode: document PATCH and document-tree mutations compared versions in application code and then performed unconditional updates, leaving time-of-check/time-of-use windows. Ordinary metadata/content PATCH now enforces the expected timestamp on the write itself. Document-tree mutations now recheck the expected JSON structure version while holding the project row lock inside the same transaction that writes history and changed child caches.

### P1 — Document-tree performance and integrity

- [x] Avoid loading full document content for structural operations.
- [x] Replace application-level version comparison with a conditional database update.
- [x] Update only changed child/parent rows rather than every document in the tree.
- [x] Combine structure history and structural mutation in one transaction.
- [ ] Decide whether project JSON, normalized parent/order rows, or another representation is canonical.
- [ ] Remove duplicated `children` synchronization if it is not required as a canonical store.

Target complexity: a single add, move, archive, or restore should be proportional to the affected branch, not the total project document count.

### P1 — Relationship organization

- [x] Build a normalized relationship plan before issuing writes.
- [x] Validate references set-wise instead of one reference at a time.
- [x] Remove repeated validation between callers, `autoOrganizeConnections`, containment, and semantic-edge application.
    - [x] Goal create/update reuse their pre-mutation validation during relationship application.
    - [x] Other `autoOrganizeConnections` callers validate the exact connection set once before planning.
    - [x] The lower-level direct edge API retains its own guard without being called redundantly by the connection planner.
- [ ] Replace relationship edges in one transaction.
    - [x] Add and disposable-test the secured transactional plan applier.
    - [x] Apply and live-verify the transactional plan-applier migration.
    - [ ] Move CRUD callers onto the transactional boundary.
- [ ] Preserve all current tool-call relationship semantics and error messages where clients depend on them.

The canonical connection path now resolves intent into a serializable mutation plan containing exact containment and semantic edges before issuing writes. Existing-parent reads needed for merge behavior run concurrently, and merge-derived containment operations carry exact edge snapshots for compare-and-swap enforcement. The secured transactional plan applier is deployed and verified; production callers still use multiple database statements until the routes are migrated.

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

- [x] Introduce the transactional structure mutation primitive.
- [x] Migrate add, move, archive, restore, and delete.
    - [x] Add and move use the transactional structure primitive.
    - [x] Archive uses a lifecycle command that includes the document rows.
    - [x] Restore uses a lifecycle command and skips the normal no-op tree write.
    - [x] Delete uses one lifecycle command for soft and permanent modes.
- [x] Remove full-tree child synchronization from the hot path.

### Phase 4 — Relationship batching and durable side effects

- [ ] Introduce set-based relationship planning/application.
    - [x] Set-based validation and normalized mutation planning.
    - [x] Transactional set-based relationship application primitive.
    - [ ] Production caller migration.
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
| Archive/restore/delete integrity | ✅³      | ⬜   | ⬜   | ⬜   | ⬜      |
| Tool/API contract compatibility  | ✅²      | ⬜   | ⬜   | ⬜   | ⬜      |
| Side-effect retry/deduplication  | ⬜       | ⬜   | ⬜   | ⬜   | ⬜      |

¹ Ordinary document metadata/content PATCH and the canonical project document-tree update are covered. Structure history and changed per-document child caches commit with the canonical tree, archive includes the affected document rows, and restore includes any required legacy tree cleanup. Delete and relationship mutations remain.

² The document-tree tool definition, registry/execution path, transient structure-conflict handling, API responses, and affected-entity reporting are covered. The model-facing input schema and success payload remain unchanged.

³ Document archive, restore, active soft delete, and archived permanent delete now include the canonical tree, structure history, changed child caches, and document row mutation in one database transaction. Failure-injection regressions cover rollback after structural work has begun.

## Change log

### 2026-08-03

- Added and deployed migration `20260803015000_atomic_relationship_plan` with a fixed search path, project write-access enforcement, private entity-validation helper, project-row serialization, and explicit role grants.
- The transaction revalidates every raw connection reference, verifies planned endpoints and relationship tokens, applies containment/semantic/project-edge mutations, and rolls the entire plan back on any failure.
- Added merge-state compare-and-swap snapshots so a stale containment plan returns `relationship_containment_conflict` instead of overwriting newer parent state.
- Added a disposable schema fixture and PostgreSQL coverage for privileges, access denial, semantic replacement, unchanged-edge preservation, missing references, stale containment rollback, and forced insert-failure rollback. The deployed functions and migration ledger were also verified live; production routes do not use the transaction yet.
- Added a JSON-round-trippable relationship mutation plan that materializes containment precedence, canonical edge directions, semantic replacement modes, and callback-derived edge props before the write boundary.
- Extracted pure containment-edge materialization so the current applier and the future database transaction consume the same parent-precedence and primary-parent rules.
- Changed `autoOrganizeConnections` to validate once, load independent merge-parent state concurrently, build the complete mutation plan, and then apply it in the existing compatibility order.
- Fixed semantic replacement error handling so a failed delete now returns `AutoOrganizeError` instead of potentially reporting success with stale edges.
- Kept goal/plan/task/document route contracts and agentic tool definitions unchanged. Verified 46 focused relationship, goal-route, and agentic definition/executor tests, the shared package typecheck/declaration build, and a clean full web check.
- Replaced sequential per-reference relationship validation with deduplicated, set-wise validation: one concurrent query per entity kind while preserving project-mismatch, query-error, and kind-specific not-found contracts.
- Allowed `autoOrganizeConnections` to reuse an exact caller validation result. Goal create/update now avoid revalidating the same connections after their pre-mutation guard; other callers retain validation by default.
- Confirmed `create_onto_goal` still uses the same route and payload schema. The agent tool does not currently expose connections, while other relationship-capable agent/API workflows benefit from the shared validator automatically.
- Kept full transactional goal create/update pending because connections can reparent several entity kinds; the next command must consume the shared resolved relationship plan rather than duplicate those semantics in goal-specific SQL.
- Applied linked migrations `20260803010000` and `20260803011000` after disposable-database verification; confirmed both functions use a fixed search path, deny anonymous execution, and are recorded in the remote migration ledger.
- Added `onto_document_archive_atomic`, which locks the project and affected documents, checks both row and tree versions, and commits subtree archive state with the canonical tree, history, and changed child caches.
- Replaced the document PATCH archive chain (tree read, tree transaction, row update, row reload) with one structure-only read and one lifecycle transaction while preserving the HTTP response and agentic `update_onto_document` contract.
- Added database rollback coverage proving a document-row failure rolls back the tree, history, child cache, and every archive state change; added service/API coverage for subtree, unlinked-document, conflict, and replay-suppression behavior.
- Verified 109 focused document/API/agentic tests plus shared-package typecheck/build for the archive slice.
- Added and applied linked migration `20260803012000` for atomic document restore, with the same fixed-search-path and role-grant verification.
- Removed restore's normal no-op tree version/history write. The command now verifies the observed structure under the project lock, updates only the archived row, and performs transactional promote-style tree cleanup only for legacy archived nodes that are still linked.
- Routed state-only archived-to-active PATCH transitions through the restore command, preserving the existing `update_onto_document` schema while making agent-triggered state-only restores atomic.
- Added disposable-database rollback, conflict, access, and unchanged-tree coverage; verified 111 focused document/API/agentic tests plus shared-package typecheck/build.
- Added and applied linked migration `20260803013000` for atomic document delete. Active documents retain soft-delete semantics, archived documents retain permanent-delete semantics, and promote/cascade tree behavior remains request-compatible.
- Removed the route's nonfatal `structure_error` path that previously allowed a document row to be deleted after tree cleanup failed. Successful responses retain `structure_error: null`; failures now roll the whole command back.
- Kept the `delete_onto_document` definition, executor payload, and DELETE response schema unchanged; agentic deletes use the transactional command through the existing endpoint.
- Added disposable-database coverage for soft delete, permanent delete without a no-op tree write, stale conflicts, authorization, and post-tree rollback; verified 114 focused document/API/agentic tests, shared-package typecheck/build, and a clean full web check.
- Added the `onto_project_doc_structure_update_atomic` database primitive with write-access enforcement, project-row locking, expected-version validation, structure history, and changed child-cache updates in one transaction.
- Replaced the service's project update, separate history insert, and per-parent child updates with one atomic RPC while preserving the existing HTTP, agentic-tool, and conflict-response contracts.
- Reduced a representative two-parent move at the service boundary from five database round trips to two: one structure read and one transactional mutation call.
- Added a disposable PostgreSQL regression proving stale conflicts, access denial, and rollback of the canonical tree and history when child synchronization fails.
- Verified 158 focused CRUD/API/agentic tests plus shared-package typecheck/build. At that checkpoint, the full web check reached four TypeScript errors in concurrently modified `AgentChatModal.svelte` worker-adoption code; later verification returned to a clean baseline.

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
