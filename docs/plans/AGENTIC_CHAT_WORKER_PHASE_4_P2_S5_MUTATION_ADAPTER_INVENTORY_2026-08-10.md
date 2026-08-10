<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P2_S5_MUTATION_ADAPTER_INVENTORY_2026-08-10.md -->

# Phase 4 P2 S5 — Mutation Adapter Inventory and Expansion Order

**Prepared:** 2026-08-10

**Status:** inventory complete; `create_onto_task` adapter implemented and locally/hosted-SQL proven; production gates remain OFF

**Governing plan:** `AGENTIC_CHAT_WORKER_PHASE_4_P2_MUTATION_EFFECT_PARITY_PLAN_2026-08-09.md`

## Kernel

The signed legacy write surface is larger than the worker-safe execution surface.
Do not turn it on as a bundle. Admit one bounded adapter only after its exact
receipt, project fence, downstream idempotency/query behavior, post-commit side
effects, and uncertain-outcome policy are explicit.

The exhaustive signed write-category union contains **38 tools**:

- 28 ontology tools;
- 4 calendar tools;
- 6 contact, external, or control-plane tools.

The shared in-process gateway currently covers **22 of 38**: 18 ontology tools
and all 4 calendar tools. The remaining 16 are web-owned graph, move, tag,
delete, contact, external MCP, delegation, or staged-commit operations. Gateway
coverage alone is not worker admission; every tool still needs a provider
projection, an independently gated adapter, and a recovery classification.

## Inventory conventions

- **Owner `shared`** means a worker-callable handler already exists in
  `@buildos/shared-agent-ops`. `web` means the authoritative implementation still
  depends on the legacy web executor or web-only services.
- The effective legacy runner timeout is 30 seconds unless a row says otherwise.
- **Idempotent** means the downstream authoritative command atomically persists
  or can exactly resolve the stable effect-derived key. Generic effect-ledger or
  external-gateway reservation alone does not qualify.
- **One/uncertain** is the safe candidate policy when no exact downstream query
  exists: invoke once, treat an ambiguous response as
  `uncertain_external_commit`, and never retry automatically.
- Receipt labels name the primary public result and affected-entity evidence;
  they are not permission to discard secondary entities or side effects found by
  the adapter differential.

## Ontology surface — 28 tools

| Tool                            | Canonical op                      | Owner  | Timeout | Downstream/recovery classification                                                                                  | Primary receipt and notable effects                                                                        |
| ------------------------------- | --------------------------------- | ------ | ------: | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `create_onto_task`              | `onto.task.create`                | shared |     30s | **Idempotent now:** atomic task key receives `chat-effect:<effect_id>`                                              | `task`; task row, assignees, relationships, assignment/mention notifications, activity, task-calendar sync |
| `update_onto_task`              | `onto.task.update`                | shared |     30s | One/uncertain; no effect-key persistence/query                                                                      | `task`; row, assignees, relationships, assignment/mention notifications, activity, task-calendar sync      |
| `create_onto_document`          | `onto.document.create`            | shared |     30s | Unclassified; likely one/uncertain                                                                                  | `document`; document row, version, tree placement, activity                                                |
| `update_onto_document`          | `onto.document.update`            | shared |     45s | Unclassified; merge path has model/editor sub-call, likely one/uncertain                                            | `document`; row, version, optional merge/append, activity                                                  |
| `move_document_in_tree`         | `onto.document.tree.move`         | shared |     30s | Unclassified; exact tree-state reconciliation needed                                                                | tree/document placement; doc-structure version                                                             |
| `create_task_document`          | `onto.task.docs.create_or_attach` | shared |     30s | Unclassified; compound create-or-link needs exact branch receipt                                                    | `document` plus task-document edge; version/tree/activity as applicable                                    |
| `create_onto_goal`              | `onto.goal.create`                | shared |     30s | Unclassified; likely one/uncertain                                                                                  | `goal`; row, relationships, activity                                                                       |
| `update_onto_goal`              | `onto.goal.update`                | shared |     30s | Unclassified; likely one/uncertain                                                                                  | `goal`; row, relationships, activity                                                                       |
| `create_onto_plan`              | `onto.plan.create`                | shared |     30s | Unclassified; likely one/uncertain                                                                                  | `plan`; row, relationships, activity                                                                       |
| `update_onto_plan`              | `onto.plan.update`                | shared |     30s | Unclassified; likely one/uncertain                                                                                  | `plan`; row, relationships, activity                                                                       |
| `create_onto_milestone`         | `onto.milestone.create`           | shared |     30s | Unclassified; likely one/uncertain                                                                                  | `milestone`; row, relationships, activity                                                                  |
| `update_onto_milestone`         | `onto.milestone.update`           | shared |     30s | Unclassified; likely one/uncertain                                                                                  | `milestone`; row, relationships, activity                                                                  |
| `create_onto_risk`              | `onto.risk.create`                | shared |     30s | Unclassified; likely one/uncertain                                                                                  | `risk`; row, relationships, activity                                                                       |
| `update_onto_risk`              | `onto.risk.update`                | shared |     30s | Unclassified; likely one/uncertain                                                                                  | `risk`; row, relationships, activity                                                                       |
| `create_onto_project`           | `onto.project.create`             | shared |     30s | Instantiation has caller idempotency input, but effect-key semantics and compound receipt are not yet ratified      | `project`, entity counts, created entities/edges, caller-scope expansion                                   |
| `update_onto_project`           | `onto.project.update`             | shared |     30s | Unclassified; likely one/uncertain                                                                                  | `project`; row/facets/timeline/activity                                                                    |
| `link_onto_entities`            | `onto.edge.link`                  | shared |     30s | Unclassified; exact edge identity/query could make this queryable                                                   | `edge`; relationship/activity                                                                              |
| `unlink_onto_edge`              | `onto.edge.unlink`                | shared |     30s | Unclassified; delete reconciliation needs an exact prior edge identity                                              | removed edge; relationship/activity                                                                        |
| `reorganize_onto_project_graph` | `onto.project.graph.reorganize`   | web    |     30s | Web-only compound graph rewrite; one/uncertain is insufficient until partial-change receipt is defined              | graph plan/result; multiple containment and semantic edges                                                 |
| `move_onto_task`                | `onto.task.move`                  | web    |     30s | Web-only; destination state is inspectable but stale-confirmation and compound cleanup need a formal query contract | task move receipt; task, edges, assignees, links, source/destination activity                              |
| `tag_onto_entity`               | `x.misc.tag_onto_entity`          | web    |     30s | Web-only and registry taxonomy gap; one/uncertain candidate                                                         | entity/tag result; content mutation or manual ping plus notifications                                      |
| `delete_onto_project`           | `onto.project.delete`             | web    |     30s | Web-only irreversible delete; exact tombstone/query contract required                                               | deleted project and cascading effects                                                                      |
| `delete_onto_task`              | `onto.task.delete`                | web    |     30s | Web-only irreversible delete; exact tombstone/query contract required                                               | deleted task; edges/calendar cleanup/activity                                                              |
| `delete_onto_document`          | `onto.document.delete`            | web    |     30s | Web-only irreversible delete; exact tombstone/query contract required                                               | deleted document; tree/version/edge cleanup                                                                |
| `delete_onto_milestone`         | `onto.milestone.delete`           | web    |     30s | Web-only irreversible delete; exact tombstone/query contract required                                               | deleted milestone and edges                                                                                |
| `delete_onto_risk`              | `onto.risk.delete`                | web    |     30s | Web-only irreversible delete; exact tombstone/query contract required                                               | deleted risk and edges                                                                                     |
| `delete_onto_goal`              | `onto.goal.delete`                | web    |     30s | Web-only irreversible delete; exact tombstone/query contract required                                               | deleted goal and graph effects                                                                             |
| `delete_onto_plan`              | `onto.plan.delete`                | web    |     30s | Web-only irreversible delete; exact tombstone/query contract required                                               | deleted plan; tasks retained, containment effects                                                          |

## Calendar surface — 4 tools

| Tool                    | Canonical op       | Owner                      | Timeout | Downstream/recovery classification                                                      | Primary receipt and notable effects                                         |
| ----------------------- | ------------------ | -------------------------- | ------: | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `create_calendar_event` | `cal.event.create` | shared port + web provider |     30s | External/provider IDs exist, but no stable effect-key contract; one/uncertain candidate | `event`; ontology event, provider calendar event, edges/activity/sync state |
| `update_calendar_event` | `cal.event.update` | shared port + web provider |     30s | No exact effect-key contract; one/uncertain candidate                                   | `event`; ontology/provider update, edges/activity/sync state                |
| `delete_calendar_event` | `cal.event.delete` | shared port + web provider |     30s | Irreversible provider mutation; query/tombstone policy required                         | deleted event; provider deletion, edge/activity/sync state                  |
| `set_project_calendar`  | `cal.project.set`  | shared port + web provider |     30s | Project setting is queryable, but provider/setup side effects need exact reconciliation | `calendar`; project binding and provider metadata                           |

There is no signed email write/send/draft/modify operation in this inventory. The
registry's email surface is read-only.

## Contact, external, and control surface — 6 tools

| Tool                             | Canonical op                     | Owner        | Timeout | Downstream/recovery classification                                                                               | Primary receipt and notable effects                                 |
| -------------------------------- | -------------------------------- | ------------ | ------: | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `upsert_user_contact`            | `util.contact.upsert`            | web          |     30s | Strong-method matching may be queryable, but merge/update semantics are not an effect-key contract               | `contact`; contact/method rows and inbox-index invalidation         |
| `resolve_user_contact_candidate` | `util.contact.candidate.resolve` | web          |     30s | Candidate state is queryable; confirmed merge is compound and needs exact receipt reconciliation                 | candidate resolution plus optional contact merge/index invalidation |
| `link_user_contact`              | `util.contact.link`              | web          |     30s | Link identity may be queryable; no stable effect-key contract yet                                                | contact link to profile/actor/ontology entity                       |
| `call_corsair_mcp_tool`          | `util.corsair_mcp.tool.call`     | web/external |     30s | Remote arbitrary mutation; blocked until provider-specific idempotency/query metadata exists                     | opaque remote MCP content; affected entity generally unknown        |
| `delegate_task`                  | `util.agent.delegate`            | web/control  |     30s | Durable Agent Run is queryable, but enqueue/idempotency and staged-review semantics need a stable effect mapping | agent run/dispatch receipt; queue job and later conversation result |
| `commit_change_set`              | `util.agent.commit_changes`      | web/control  |     60s | Durable change-set status is queryable, but per-change partial success requires item-level reconciliation        | applied/failed/rejected counts and per-change effects               |

## Expansion order

1. **Task family:** `update_onto_task` is complete and one-attempt/uncertain;
   `create_onto_task` is the first truly idempotent adapter and is implemented in
   this unit.
2. **Document family:** create, update, tree move, and task-document attach share
   version/tree behavior and should be differentially proven together, while
   keeping independent capability gates.
3. **Core ontology rows:** goal, plan, milestone, and risk create/update pairs.
4. **Relationships and project:** link/unlink, then project update/create after
   compound-instantiation idempotency is pinned.
5. **Graph move/tag/deletes:** web-only, compound, or irreversible paths require
   extraction plus stronger reconciliation evidence.
6. **Calendar, contacts, external MCP, delegation, and staged commit:** keep last;
   these cross provider/control boundaries or can partially commit.

## `create_onto_task` bounded adapter result

This unit adds the next adapter without enabling it in production:

- The provider projection admits only the reviewed create fields and requires
  `project_id` plus `title`.
- Provider advertisement and adapter installation are independent, default-off
  capabilities. Advertising without the adapter fails assembly.
- A mutation router composes create and update adapters without coupling their
  gates.
- The adapter rechecks the immutable signed tool surface, canonical effect/key,
  provider-call correlation, reviewed arguments, cancellation, and turn-project
  fence before dispatch.
- `chat-effect:<effect_id>` reaches
  `onto_task_create_with_relationships_atomic` through the shared worker gateway.
  The task row, initial assignees, and relationship plan commit together.
- External-gateway caller keys are namespaced by caller and canonical operation
  before reaching the globally unique task column, preventing cross-caller key
  collisions. Public task receipts strip the internal idempotency column.
- Forward migration
  `20260810020000_atomic_task_create_milestone_relationship.sql` routes creation
  through the task-scoped relationship applier, so a create plan can include
  `targets_milestone` atomically.
- A same-key replay returns the original task and skips post-commit side effects.
  The authoritative mutation is safely idempotent. Notifications, activity, and
  calendar sync remain best-effort post-commit effects; a response loss before
  those effects run can leave them absent, but cannot duplicate the task.
- The canonical worker receipt is the legacy-compatible
  `{ task, message: "Task created successfully.", requires_user_action: false }`
  object, with the shared gateway-only `project_name` and internal
  `idempotency_key` fields removed.

## Local proof

- Full `@buildos/shared-agent-ops` suite: 82/82.
- Full worker suite: 849 passed, 1 intentional skip.
- Shared build/typecheck and worker typecheck: pass.
- Web external-gateway plus legacy task-create assignment/mention referee: 46/46.
- Disposable PostgreSQL create/milestone/replay proof: pass.
- Predecessor atomic task relationship and semantic update PostgreSQL suites:
  pass after the forward migration.
- Changed source formatting: pass; changed worker source ESLint has zero errors.

Hosted migration `20260810020000` is applied. The isolated preflight named only
that migration, its staged SHA-256 was
`bceeac1605353d14bf80e5bd1b1e69b2ea486204d857cd0b6ddd79fd11e50e15`, and the
post-apply dry run is empty. Hosted history contains the six-statement receipt;
live catalog checks confirm fixed `search_path=public`, no anonymous execute,
authenticated execute, an invoker wrapper, and delegation to the definer
task-scoped applier that handles `targets_milestone`.

Production provider capability, adapter capability, worker routing, worker
deploy, and live model mutation remain OFF.
