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

The ontology route baseline still contains 33 grandfathered oversized routes, and every CRUD route touched here remains under its recorded ceiling. The repository-wide guard is currently blocked by concurrent work in `src/routes/api/agent/v2/turns/+server.ts` at 401 lines; this is outside the CRUD refactor but means the global command is not presently green.

### Validation baseline

- 35 focused tests passed across seven CRUD/service test files during the assessment.
- Svelte diagnostics were clean for the inspected document, task, and project surfaces.
- Existing tests did **not** cover partial rollback, lost-update concurrency, or serverless background-work durability.

## Findings and work items

### P0 — Correctness and transaction boundaries

#### Atomic entity mutations

- [x] Goal create: validate and apply relationships in the same transaction as the row insert.
    - [x] Interim guard: validate requested relationship references before inserting the row.
    - [x] Add and disposable-test the atomic goal-create command and wire the route.
    - [x] Apply and live-verify the goal mutation migration.
- [x] Goal update: apply the row and relationship replacement atomically.
    - [x] Interim guard: validate requested relationship references before updating the row.
    - [x] Add and disposable-test the atomic goal-update command and wire the route.
    - [x] Apply and live-verify the goal mutation migration.
- [x] Plan create: apply the row and containment/relationship changes atomically.
    - [x] Add and disposable-test the atomic plan-create command and wire the route.
    - [x] Apply and live-verify migration `20260803018000_atomic_plan_mutations`.
- [x] Plan update: apply the row and containment/relationship changes atomically.
    - [x] Add and disposable-test the atomic plan-update command and wire the route.
    - [x] Apply and live-verify migration `20260803018000_atomic_plan_mutations`.
- [x] Task create: include relationships with the existing task/assignee atomic command.
    - [x] Characterize the current boundary: row, assignees, and idempotency are atomic; relationships commit afterward and failure triggers compensating deletes.
    - [x] Extend and disposable-test the command with the shared relationship plan, then remove orphan cleanup from the route.
    - [x] Apply and live-verify migration `20260803019000_atomic_task_relationship_mutations`.
- [x] Task update: include relationships with the existing task/assignee atomic command.
    - [x] Characterize the current boundary: row and assignees are atomic; relationship replacement still commits afterward without compensation.
    - [x] Extend and disposable-test the command with the shared relationship plan while preserving semantic-only `skipContainment` behavior.
    - [x] Apply and live-verify migration `20260803019000_atomic_task_relationship_mutations`.
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
- [x] Replace relationship edges in one transaction.
    - [x] Add and disposable-test the secured transactional plan applier.
    - [x] Apply and live-verify the transactional plan-applier migration.
    - [x] Move CRUD callers onto the transactional boundary.
- [x] Preserve all current tool-call relationship semantics and error messages where clients depend on them.

The canonical connection path now resolves intent into a serializable mutation plan containing exact containment and semantic edges before issuing writes. Existing-parent reads needed for merge behavior run concurrently, and merge-derived containment operations carry exact edge snapshots for compare-and-swap enforcement. The secured transactional plan applier is deployed, and the shared auto-organizer now sends each completed plan through that single RPC. Existing CRUD and agentic callers inherit the atomic edge boundary without changing their route or tool contracts.

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
- [x] Add rollback tests for invalid or failed relationship changes.
- [x] Add document-tree concurrent-update tests.

### Phase 2 — Transactional CRUD commands

- [x] Goals.
- [x] Plans.
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
| Create rollback                  | ⬜       | ✅⁵  | ✅⁴  | ⬜   | ⬜      |
| Update rollback                  | ⬜       | ✅⁵  | ✅⁴  | ⬜   | ⬜      |
| Concurrent update conflict       | ✅¹      | ⬜   | ⬜   | ⬜   | ⬜      |
| Relationship replacement         | ⬜       | ✅⁵  | ✅⁴  | ⬜   | N/A     |
| Archive/restore/delete integrity | ✅³      | ⬜   | ⬜   | ⬜   | ⬜      |
| Tool/API contract compatibility  | ✅²      | ✅⁵  | ✅⁴  | ⬜   | ⬜      |
| Side-effect retry/deduplication  | ⬜       | ✅⁵  | ⬜   | ⬜   | ⬜      |

¹ Ordinary document metadata/content PATCH and the canonical project document-tree update are covered. Structure history and changed per-document child caches commit with the canonical tree, archive includes the affected document rows, and restore includes any required legacy tree cleanup. Delete and relationship mutations remain.

² The document-tree tool definition, registry/execution path, transient structure-conflict handling, API responses, and affected-entity reporting are covered. The model-facing input schema and success payload remain unchanged.

³ Document archive, restore, active soft delete, and archived permanent delete now include the canonical tree, structure history, changed child caches, and document row mutation in one database transaction. Failure-injection regressions cover rollback after structural work has begun.

⁴ Plan create/update use the existing HTTP and agentic payload contracts. Disposable PostgreSQL tests cover row/relationship rollback and containment replacement; route and agentic regressions cover the unchanged API/tool boundary. Migration `20260803018000` is deployed and live-security verified.

⁵ Task create/update retain the existing HTTP and agentic payload contracts, assignee synchronization, create idempotency, and update relationship policy. Disposable PostgreSQL tests cover replay suppression and rollback across task rows, assignees, and relationships. Migration `20260803019000` is deployed, ledger-aligned, and live-security verified.

## Change log

### 2026-08-03

- Applied and ledger-aligned migration `20260803019000_atomic_task_relationship_mutations`. Live catalog checks confirmed the existing and relationship-aware task commands use `SECURITY INVOKER`, `search_path=public`, authenticated/service-role grants, and no anonymous execution. Re-ran the combined disposable relationship/goal/plan/task PostgreSQL suite, 75 focused task-route/helper and agentic definition/executor tests, both shared typechecks, the shared-types declaration build, scoped formatting, and the full web check with zero errors or warnings. The unchanged model-facing task tool definitions remain correct because both tools still use the same HTTP payload and response contracts; only the endpoints' internal transaction boundary changed.
- Applied and ledger-aligned migration `20260803018000_atomic_plan_mutations`. Live checks confirmed both plan commands use `SECURITY DEFINER`, `search_path=public`, authenticated/service-role grants, and no anonymous execution; 81 post-deploy relationship, plan-route, goal-route, and agentic regressions passed.
- Added migration `20260803019000_atomic_task_relationship_mutations`. It preserves the existing task create/update commands, adds a caller-supplied create UUID for preplanned relationships, wraps row/assignee/relationship writes in one transaction, keeps stable idempotent replay as a no-op, fixes search paths, and removes anonymous execution from the underlying commands and new wrappers.
- Wired task create/update through the relationship-aware commands without changing HTTP or agentic tool schemas. Create no longer needs three compensating deletes after an edge failure. Extracted update relationship-mode selection into a small tested helper that preserves `explicitKinds` and semantic-only `skipContainment` behavior while reducing the task `[id]` handler from its 1,000-line assessment baseline to 990 lines.
- Added disposable PostgreSQL coverage for task/assignee/relationship create and update rollback, containment replacement, authorization, grants, and idempotent replay. The combined goal/plan/task migration suite passes from a fresh database, along with 75 focused task-route/helper and agentic definition/executor tests, both shared typechecks, the shared-types declaration build, and a clean full web check. Migration `019` was subsequently deployed and live-verified.
- Began the task slice by tracing create/update through the existing `onto_task_create_atomic` and `onto_task_update_atomic` commands. Those commands already protect task rows, assignees, create idempotency, and update row locking, but relationship planning/application remains post-commit. Create attempts a three-delete compensation sequence after edge failure; update can return an edge error after task fields and assignees have committed.
- Confirmed internal agentic `create_onto_task` and `update_onto_task` use the same HTTP routes, including stable tool-call idempotency keys and assignee-handle resolution. No model-facing tool-definition change is needed for the transaction refactor; the deployed command preserves create replay short-circuiting and update's `explicitKinds`/semantic-only `skipContainment` semantics.
- Added migration `20260803018000_atomic_plan_mutations` with secured create and partial-update commands that apply the normalized relationship plan in the same PostgreSQL transaction. The migration deliberately skips the unrelated `20260803017000_gmail_refresh_token_expiry` filename; `017` was applied independently by concurrent work.
- Wired plan POST/PATCH through the atomic commands while preserving validation, normalization, response payloads, classification, activity logging, containment precedence, and `explicitKinds` replacement behavior. Internal agentic `create_onto_plan` and `update_onto_plan` already use these HTTP endpoints, so their definitions and executors required no changes.
- Added disposable PostgreSQL coverage for privileges, access denial, containment replacement, and rollback of plan inserts/updates after relationship failure. Verified 81 focused relationship, goal, plan-route, and agentic definition/executor tests, shared-agent-ops and shared-types typechecks, and the shared-types declaration build. An initial full web check was blocked while concurrent Gmail schema/types work was incomplete; after that migration landed, the full web check passed with zero errors and warnings. The separate route-size guard remains blocked only by the unrelated 401-line agent-v2 turn route.
- Added and deployed migration `20260803016000_atomic_goal_mutations` with secured create and partial-update commands that call the normalized relationship-plan applier inside the same PostgreSQL transaction.
- Added disposable PostgreSQL coverage proving goal create/update and relationship changes commit together, relationship failures roll back the row mutation, authenticated callers without write access are denied, and the existing relationship fixture/regressions remain compatible. A read-only linked-schema check also confirmed the live goal columns, enum, and defaults used by the migration.
- Split relationship planning from application in the shared auto-organizer so goal routes can prepare once, pass the exact serializable plan into the atomic goal command, and keep all relationship policy in TypeScript.
- Wired goal POST/PATCH to the typed commands without changing request/response shapes, mention notifications, activity logging, classification, agentic tool definitions, or affected-entity reporting. Verified 32 focused relationship/goal-route tests and 42 agentic definition/executor tests. Live checks confirmed both functions use `SECURITY DEFINER`, `search_path=public`, authenticated/service-role execution grants, and no anonymous execution grant.
- Moved the shared relationship-plan write boundary from sequential containment, project-edge, semantic, and child-containment statements to one `onto_apply_relationship_plan_atomic` RPC call. All existing `autoOrganizeConnections` CRUD and agentic callers inherit the transaction without route or tool-schema changes.
- Added application coverage for the exact RPC payload, eliminated direct edge writes from the normalized-plan path, preserved kind-specific not-found errors for transaction-time reference races, and mapped stale merge snapshots to `409 Conflict`.
- Verified 30 focused relationship and goal-route tests, 42 agentic tool-definition/executor tests, shared-types typecheck/build, and shared-agent-ops typecheck/declaration build after the caller migration.
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
