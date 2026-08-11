<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P2_S5_MUTATION_ADAPTER_INVENTORY_2026-08-10.md -->

# Phase 4 P2 S5 — Mutation Adapter Inventory and Expansion Order

**Prepared:** 2026-08-10

**Status:** inventory complete; 16 mutation tools have reviewed adapters, including bounded document relationships and exact edge link/unlink; required task SQL hosted; production gates remain OFF

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
| `create_onto_document`          | `onto.document.create`            | shared |     30s | **One/uncertain:** no effect-key persistence/query; adapter implemented                                             | `document`; row/version/tree/mentions/activity; project-loop burst remains web-only                        |
| `update_onto_document`          | `onto.document.update`            | shared |     45s | **One/uncertain adapter implemented** for replace/append; `merge_llm` remains web-owned                             | `document`; row/version, append, tree metadata, mentions, activity; public-page/project-loop sync web-only |
| `move_document_in_tree`         | `onto.document.tree.move`         | shared |     30s | **One/uncertain exact-UUID adapter implemented**; parent-by-title creation excluded                                 | tree/document placement; doc-structure version                                                             |
| `create_task_document`          | `onto.task.docs.create_or_attach` | shared |     30s | **Queryable/replayable attach-existing adapter implemented**; new-document branch excluded                          | existing `document` plus exact task-document edge                                                          |
| `create_onto_goal`              | `onto.goal.create`                | shared |     30s | **One/uncertain adapter implemented**                                                                               | `goal`; row, props mirrors, mentions, activity                                                             |
| `update_onto_goal`              | `onto.goal.update`                | shared |     30s | **One/uncertain adapter implemented**                                                                               | `goal`; row/state timestamp, merged props, mention diff, activity                                          |
| `create_onto_plan`              | `onto.plan.create`                | shared |     30s | **One/uncertain row-only adapter implemented**; relationship inputs excluded                                        | `plan`; row/props mirrors/activity                                                                         |
| `update_onto_plan`              | `onto.plan.update`                | shared |     30s | **One/uncertain row-only adapter implemented**                                                                      | `plan`; row/merged props/activity                                                                          |
| `create_onto_milestone`         | `onto.milestone.create`           | shared |     30s | **One/uncertain adapter implemented**; canonical goal UUID required                                                 | `milestone`; row, required goal edge, compatibility state, activity                                        |
| `update_onto_milestone`         | `onto.milestone.update`           | shared |     30s | **One/uncertain row-only adapter implemented**                                                                      | `milestone`; row/completion timestamp, merged props/activity                                               |
| `create_onto_risk`              | `onto.risk.create`                | shared |     30s | **One/uncertain row-only adapter implemented**; relationship/opaque props excluded                                  | `risk`; row/props mirrors/activity                                                                         |
| `update_onto_risk`              | `onto.risk.update`                | shared |     30s | **One/uncertain row-only adapter implemented**                                                                      | `risk`; row/mitigation timestamp, merged props/activity                                                    |
| `create_onto_project`           | `onto.project.create`             | shared |     30s | Instantiation has caller idempotency input, but effect-key semantics and compound receipt are not yet ratified      | `project`, entity counts, created entities/edges, caller-scope expansion                                   |
| `update_onto_project`           | `onto.project.update`             | shared |     30s | Unclassified; likely one/uncertain                                                                                  | `project`; row/facets/timeline/activity                                                                    |
| `link_onto_entities`            | `onto.edge.link`                  | shared |     30s | **One/uncertain non-project adapter implemented**; no general uniqueness constraint                                 | `edge`; canonical relationship/props/activity                                                              |
| `unlink_onto_edge`              | `onto.edge.unlink`                | shared |     30s | **One/uncertain exact-edge adapter implemented**; no durable delete tombstone                                       | removed edge; relationship/activity                                                                        |
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
2. **Document family:** create, replace/append update, exact-UUID tree move, and
   attach-existing task-document subsets are complete and independently gated.
   `merge_llm`, parent-by-title creation, and new task-document creation remain
   excluded because model/editor and multi-commit behavior need separate proofs.
3. **Core ontology rows:** goal, plan, milestone, and risk create/update pairs
   are complete behind independent default-off gates. Compound plan/risk/
   milestone relationship fields remain excluded except the milestone's
   required goal edge.
4. **Relationships and project:** exact non-project link/unlink are complete;
   project update/create follow after compound-instantiation idempotency is
   pinned.
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

## Pause-point audit hardening (2026-08-10)

A post-unit audit found and closed one recovery edge before the document family:

- After an idempotent adapter attempt became ambiguous, caller cancellation or
  a later known recovery failure could previously downgrade a possible commit
  to `failed`. Recovery now reuses the exact stable downstream key with an
  independent signal, and any later failure remains
  `uncertain_external_commit` unless replay proves success.
- The duplicated effect identity, signed-surface, argument allowlist, project
  context, gateway-failure, receipt-canonicalization, and receipt-size checks
  now live in one fail-closed `mutationAdapterBoundary` used by both task
  adapters. Tool-specific scope and receipt checks remain local.
- Assembly now uses an explicit mutation-adapter entry type instead of nested
  tuple assertions. This is the stable extension seam for the document family.

Audit gates: focused task-adapter/router/assembly/effect suite 39/39; full worker
suite 851 passed with one intentional skip; worker lint/typecheck and changed-
source formatting/diff checks pass. The hosted SQL receipt and all production-
off gates are unchanged.

## `create_onto_document` bounded adapter result

The first document-family adapter is locally complete without enabling it in
production:

- The provider projection requires the signed `project_id`, `title`, and
  `description` fields and admits only the reviewed legacy fields: type/state,
  content, parent placement, and position. The adapter trims and rejects an
  empty description. Legacy `props` remain excluded because the current web
  create route accepts but does not persist them.
- The signed chat field `parent_id` is translated to the shared gateway's
  canonical `parent_document_id`. Description trimming, blank-parent handling,
  and invalid-position omission preserve the legacy chat route's preflight
  behavior before dispatch.
- Provider advertisement and adapter installation remain independent,
  default-off gates. Assembly fails closed if the provider advertises document
  create without the corresponding adapter.
- The shared gateway creates the row and preserves the core document version,
  tree-placement, mention-notification, and activity side effects. The worker
  returns the legacy-compatible `{ document, message }` receipt and removes only
  gateway-only `project_name` plus `props.origin = "external_agent"` provenance
  from the public copy; the authoritative row retains provenance.
- No document effect key is atomically stored or exactly queryable. The provider,
  executor, and adapter now cross-check that classification as
  `downstreamIdempotencySupported = false`; the adapter gets one attempt and any
  thrown or ambiguous post-dispatch outcome remains uncertain.
- The provider mutation catalog is now declarative, so operation name, reviewed
  projection, capability, and idempotency classification cannot drift across
  separate create/update branches. The adapter boundary independently checks
  the provider's idempotency classification before any write.
- Legacy duplicate-title prevention depends on web executor context and its
  same-turn registry, while the route-owned project-loop burst is not part of
  the shared gateway. Both remain live-enablement prerequisites, not reasons to
  widen this adapter's database behavior. Invalid non-empty parent IDs also fail
  before create in the shared gateway instead of producing the legacy route's
  post-create tree error; this intentional fail-closed difference must remain
  visible in any future golden.
- No schema change or migration is needed for this one-attempt adapter.

Document-create proof: focused provider/adapter/executor/assembly matrix 68/68;
full worker suite 860 passed with one intentional skip; worker lint/typecheck and
HTTP module-size guard pass with zero errors; external shared-gateway plus legacy
document-create/mention/schema referees 53/53. Production provider capability,
adapter capability, routing, deploy, and live model mutation remain OFF.

## Straightforward document/core-entity bundle (2026-08-10)

The next bounded unit migrates every remaining mutation whose authoritative
path can be expressed as one reviewed shared-gateway attempt without an exact
replay query:

- `update_onto_document`, limited to replace/append;
- goal create/update;
- plan create/update;
- milestone create/update; and
- risk create/update.

One central mutation catalog now owns all 12 implemented tool/capability/op/
idempotency/projection contracts. Provider advertisement and adapter
installation are still separate default-off gates, and assembly checks every
catalog entry fail-closed. The nine tools in this unit share one entity adapter;
task create/update and document create retain their specialized adapters.

The shared adapter performs one gateway call, never retries an uncertain
outcome, validates canonical effect/provider/entity/project identity, and
returns legacy-compatible entity/message receipts without gateway-only
`project_name`. It additionally preserves the legacy goal date-only end boundary,
milestone date normalization and computed state fields, create-milestone
`goal_id`, and external document provenance stripping in the public receipt.

The admitted surface is deliberately narrower than the signed web surface:

- document `merge_llm` remains on the web model/editor path;
- plan goal/milestone/parent/connection fields are excluded;
- milestone parent/connection and create `props` fields are excluded, while a
  canonical `goal_id` is required because the authoritative route requires a
  goal edge;
- risk parent/connection and create `props` fields are excluded; and
- parent-by-title move, new task-document creation, projects, graph/edge tools,
  deletes, calendar/provider writes, contacts, MCP, delegation, and staged
  commit remain separate units.

Shared-handler parity hardening in the same unit validates goal/plan type keys,
normalizes blank compatibility values, restores goal/plan/milestone/risk props
mirrors, applies milestone completion and risk mitigation timestamps, and adds
goal mention diffing. Document update now retains version/activity behavior and
also performs best-effort tree-metadata sync plus mention diffing. The web-owned
public-page sync and project-loop burst remain explicit document-update live-
enablement prerequisites.

No SQL or migration was required. Full local evidence after the bundle:

- shared-agent-ops: 89/89;
- worker: 876 passed, 1 intentional skip;
- external shared-gateway referee: 42/42;
- shared and worker typechecks: pass;
- provider projection, assembly gates, one-attempt failure classification,
  receipt validation, date normalization, and all nine adapters have focused
  coverage.

Production provider capabilities, adapter capabilities, routing, deployment,
and live model mutations remain OFF.

## Document relationship subset (2026-08-10)

This unit adds two more reviewed tools without enabling either in production:

- `move_document_in_tree` admits only exact project/document/optional-parent
  UUIDs and a non-negative safe-integer position. It is one-attempt/uncertain
  because no effect key is atomically persisted or queryable. A successful
  worker receipt recursively proves exactly one placement under the requested
  parent at the clamped sibling index.
- `create_task_document` admits only its attach-existing branch: task UUID,
  document UUID, and optional role. The shared edge path queries the exact
  task/document/`task_has_document` identity before inserting, so a lost response
  can safely replay and recover the original edge. Receipt validation pins the
  project, endpoint kinds and IDs, relationship, and role.
- Parent-by-title move and new task-document creation remain excluded because
  each may commit a new document before a later tree/edge operation fails. The
  provider descriptions make these narrower worker semantics explicit.
- The shared tree service rejects self-parenting and unlinked exact parents
  instead of silently falling back to root. Gateway and web-route error mapping
  preserve those as pre-commit validation failures. The shared title branch now
  creates its parent through the canonical document/tree service so stricter
  validation does not break existing external callers, but the worker still
  excludes that compound branch.
- No SQL or migration was needed. Focused worker projection/assembly/adapter
  coverage passes 41/41. Full proof passes worker 882 plus one intentional skip,
  shared-agent-ops 92/92, agentic-chat-runtime 183/183, web gateway/tree referees
  71/71, all relevant typechecks, and Svelte check with zero diagnostics.

Production provider capabilities, adapter capabilities, routing, deployment,
and live model mutations remain OFF. The next bounded shared family is project
update/create after their reconciliation contracts are pinned.

## Exact edge link/unlink subset (2026-08-11)

This unit adds two more reviewed tools without enabling either in production:

- `link_onto_entities` admits exact UUID endpoints for plan, goal, milestone,
  task, document, risk, metric, and source entities. Project endpoints are
  excluded because the legacy web route skips them while the shared gateway can
  persist them. The adapter rejects self-links and normalizes arbitrary or
  deprecated relationships to the legacy canonical direction before dispatch.
- `unlink_onto_edge` admits only an exact edge UUID from a prior relationship or
  graph read. Its success receipt must include that same deleted edge and the
  admitted project.
- Both adapters are one-attempt/uncertain. General edges have no uniqueness
  constraint, leaving a race between an ambiguous insert and an exact recovery
  query. Edge deletion has no durable tombstone. Automatic replay would
  therefore overstate safety for both operations.
- The shared gateway's existing-edge lookup now checks the complete stored
  identity: project, endpoint kinds and UUIDs, and canonical relationship. This
  removes cross-table UUID collision ambiguity without changing the established
  Agent Run alias-validation path.
- Worker receipts retain the legacy public shapes: `{ created, message }` for
  link and `{ deleted, message }` for unlink. Gateway-only edge details are used
  for post-dispatch proof and are not exposed in the public receipt.
- No SQL or migration was needed. Focused projection/assembly/adapter coverage
  passes 42/42. Full proof passes worker 889 plus one intentional skip,
  shared-agent-ops 95/95, agentic-chat-runtime 183/183, the external gateway
  referee 42/42, all relevant typechecks, and Svelte check with zero diagnostics.

Production provider capabilities, adapter capabilities, routing, deployment,
and live model mutations remain OFF. Project update is the next bounded shared
candidate; project creation remains behind its larger instantiation and caller-
idempotency differential.
