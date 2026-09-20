<!-- docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/lane-C-tools.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time appendix.** Lane report for the 2026-09-02 turn executor audit, written against commit `53a77af1f`. Line numbers drift; verify before acting. Parent: [AGENTIC_CHAT_TURN_EXECUTOR_AUDIT_2026-09-02.md](../AGENTIC_CHAT_TURN_EXECUTOR_AUDIT_2026-09-02.md).

# Lane C — Agentic Chat Tool Surface Audit (2026-09-02)

Read-only audit of definitions, schemas, surface selection, discovery, validation, execution graph and
mutation routing. All sizes measured with a one-off tsx script importing the real catalog
(`scratchpad/measure.ts`, `scratchpad/worker-measure.ts`; raw tables in `inventory.md`,
`worker-inventory.md`, `all-tools.json`, `descs.md`). Bytes = `JSON.stringify(tool).length`
(same measure `tool-surface-size-report.ts:227-229` uses); the repo estimator is chars/4
(`apps/web/src/lib/services/agentic-chat-v2/context-usage.ts:42-45`).

Two execution hosts exist and matter for every finding:

- **Worker path** (`worker_realtime`, production default for compatible turns): immutable artifact
  surface, `productionToolsFor` projection, reviewed mutation specs, no discovery.
- **Legacy web path** (`legacy_sse`): reached only by `TRANSPORT_RENEGOTIATE` when the selected
  surface contains a worker-unavailable tool (`worker-turn-preparation.server.ts:376-383`,
  client fallback `agent-chat-stream-controller.svelte.ts:714-729`). Result-driven tool
  materialization exists only here (`stream-orchestrator/tool-round-runner.ts:228`).

---

## 1. Tool inventory by surface

### 1.1 Vocabulary

`AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY` = 108 definitions (`definitions/index.ts:41-48`), 96,318 bytes.
Registry derives 91 ops (`registry.ts:110-184`). Classification: 39 mutation (`TOOL_METADATA.category='write'`),
39 read/search/utility, 13 discovery (`discovery.ts`), 4 controls (`controls.ts`), plus 13 more
read tools. Three catalog cross-reference defects (script output):

- `search_buildos` is in `TOOL_CATEGORIES` (`taxonomy.ts:57`), `TOOL_METADATA` (`metadata.ts:36-45`) and the
  shared-read registry (`tools/shared-read-dispatch.ts:64`) but has **no definition** — dead alias.
- `resolve_libri_resource`, `query_libri_library` in `TOOL_METADATA` and worker policy
  (`worker-tool-policy.ts:72-73`) with no definition.
- `read_document_section`, `tag_onto_entity`, `change_chat_context` derive no canonical op and land in
  `x.misc.*` (`registry.ts:192` regex only matches `list|search|get|create|update|delete`). Consequence:
  `read_document_section` / `get_document_outline` get **no UUID validation** (`tool-validation.ts:308-311`
  requires `_onto_` in the name or membership in `UUID_VALIDATED_TOOL_NAMES:29-40`), so a truncated
  `document_id` reaches the adapter instead of the repair loop.

### 1.2 Ten largest schemas (web/artifact bytes)

| #   | tool                          | bytes | ~tok (/4) | props | notes                                                                   |
| --- | ----------------------------- | ----: | --------: | ----: | ----------------------------------------------------------------------- |
| 1   | create_onto_project           | 5,823 |     1,456 |     6 | nested entities/relationships/context_document; worker narrows to 3,561 |
| 2   | delegate_task                 | 3,142 |       786 |    12 | 1,273-char description                                                  |
| 3   | declare_turn_contract         | 2,732 |       683 |     2 | 14-verb action enum, 11-kind enum, label/parent_label regex fields      |
| 4   | update_onto_task              | 1,996 |       499 |    14 |                                                                         |
| 5   | reorganize_onto_project_graph | 1,941 |       485 |     3 | worker-deferred, never mounted                                          |
| 6   | create_onto_task              | 1,809 |       452 |    15 |                                                                         |
| 7   | create_onto_plan              | 1,798 |       450 |    13 | parent + parents + goal_id + milestone_id                               |
| 8   | update_onto_document          | 1,739 |       435 |     9 | worked example in description                                           |
| 9   | update_calendar_event         | 1,661 |       415 |    13 | 0 required                                                              |
| 10  | web_visit                     | 1,657 |       414 |    10 | worker narrows to 4 props (`tool-surface.ts:211-232`)                   |

### 1.3 Static surface profiles (web artifact as admitted, `surfaces.ts:68-192`)

Every profile below mounts the 4 controls (`declare_turn_contract`, `declare_read_only_turn`,
`request_turn_clarification`, `cancel_turn_contract`) plus lean discovery (`skill_search`,
`domain_search`, `surfaces.ts:28`) except the two project_create profiles.

| profile                    | context routing (`surfaces.ts:226-251`, `tool-selector.ts:146-159`) | tools |  bytes | −contract |
| -------------------------- | ------------------------------------------------------------------- | ----: | -----: | --------: |
| global_basic               | global/general                                                      |    12 | 10,516 |     7,784 |
| global_write               | daily_brief                                                         |    19 | 20,066 |    17,334 |
| project_basic              | (never selected by routing; only explicit)                          |    15 | 12,001 |     9,269 |
| project_write              | (never selected by routing)                                         |    19 | 19,099 |    16,367 |
| project_document           | (never selected by routing)                                         |    19 | 17,244 |    14,512 |
| **project_write_document** | project / ontology (all project turns)                              |    21 | 21,049 |    18,317 |
| project_calendar           | calendar                                                            |    13 | 12,576 |     9,844 |
| project_create_compound    | project_create (web)                                                |     1 |  5,823 |         — |
| project_create_minimal     | project_create (worker `reviewed_shell`)                            |     7 | 13,547 |    10,815 |

Per-tool tables with classification are in `scratchpad/inventory.md`. Note `project_basic`,
`project_write`, `project_document` are dead profiles in production routing: `resolveFastChatSurfaceProfileForTurn`
returns `project_write_document` for every project/ontology turn (`tool-selector.ts:155-157`).

### 1.4 Worker-projected surfaces (what the model is actually billed for)

`productionToolsFor` (`provider/tool-surface.ts:119-167`) drops `declare_read_only_turn`, drops any name not
in the production read allowlist or an enabled mutation, narrows mutation schemas to
`reviewedArgumentNames` (`:208-265`) and **adds a `call_ref`/`after` sidecar to every tool** (`:169-206`, 349
bytes each). `deferComplexWriteContractForInitialPass` (`:102-117`) removes `declare_turn_contract` on the
opening pass of the seven lazy profiles.

| profile                | worker tools | bytes (all passes) | opening pass | renegotiates to legacy?                         |
| ---------------------- | -----------: | -----------------: | -----------: | ----------------------------------------------- |
| global_basic           |            9 |             12,377 |    8 / 9,297 | no                                              |
| global_write           |           12 |             17,613 |  11 / 14,533 | **yes — always** (4 calendar tools unavailable) |
| project_write_document |           18 |             26,302 |  17 / 23,222 | no                                              |
| project_calendar       |            4 |              6,296 |    3 / 3,216 | **yes — always** (6 calendar tools unavailable) |
| project_create_minimal |            6 |             12,605 |    5 / 9,525 | no                                              |

Worker bytes exceed web bytes on every read surface because sidecars (18 × 349 = 6,282 bytes on
`project_write_document`, ~1,570 tok at /4) outweigh the mutation narrowing.

---

## 2. Description quality

### 2.1 Fifteen descriptions, verbatim, with flags

1. `resource_search` — "Find domain resources." Props `query`, `domain`, `skill` have **no descriptions**
   (`discovery.ts:194-217`). Vague.
2. `domain_load` — "Load one domain card." Vague; "domain card" undefined for the model.
3. `list_onto_documents` — "List document metadata, not body content. Use get_onto_document_details for a
   full document." **Cross-references a tool not mounted on any project surface**; on the worker a call to
   it is a permanent turn kill (§4.3).
4. `get_document_outline` — "…Prefer over get_onto_document_details for scanning." Same unmounted reference.
5. `get_onto_project_details` — "…after identifying it with list_onto_projects." `list_onto_projects` is
   mounted on **no** surface.
6. `create_onto_task` — "…Load task_management for complex flows." `skill_load` is never callable on the
   worker (`worker-tool-policy.ts:88-93`) and not launch-mounted on web.
7. `search_ontology` — "Compatibility search… Use only when older instructions specifically mention
   search_ontology." Legacy cruft addressed to old prompts, still in the catalog and registry.
8. `move_onto_task` (913 chars) — multi-turn confirmation protocol in a description, three negations
   ("Never confirm… or retry… in the same turn", "blocked"). Worker override is 500+ chars too
   (`mutationToolCatalog.ts` `move_onto_task.descriptionOverride`).
9. `delegate_task` (1,273 chars) — five policies in one paragraph (scope, review, cost floor/ceiling, templates,
   polling). Longest description in the catalog.
10. `change_chat_context` (439 chars) — prompt-grade policy prose ("Do not use for ambiguous names, brief
    mentions, or one-off comparisons"), billed on every global/project pass (F2, still open).
11. `update_onto_document` — embeds a worked JSON example and names `merge_llm`, which the worker adapter
    rejects (`gatewayEntityMutationAdapter.ts:226-231`); the worker override correctly narrows the enum to
    `replace|append` (`mutationToolCatalog.ts` `update_onto_document.propertyOverrides`) but web keeps it.
12. `tool_search` — three negations in 255 chars ("only when…", "Do not rediscover…", "not workspace data").
    Never launch-mounted; on worker never callable.
13. `declare_read_only_turn` — "Never use this to replace a commissioned action." Never mounted on the
    worker (omitted) yet still in every web artifact.
14. `get_linked_entities` (538 chars) — bulleted use-cases; worker-unavailable, so the prose is legacy-only.
15. `create_onto_document.type_key` (389-char property description) — a full taxonomy in one property;
    the schema has no enum so the model must parse prose.

Good ones worth keeping as the pattern: `search_all_projects` (tells the model AND-semantics and when to
pass `project_id`), `explore_project`, `get_document_outline`/`read_document_section` (cheap→expensive
guidance), worker `web_visit` override (`tool-surface.ts:221`).

### 2.2 Argument schema inconsistencies (model-hostile)

- **Parent placement, five spellings**: `parent_id`+`position` (create_onto_document); `new_parent_id`
  / `new_parent_title` / `new_position` (move_document_in_tree); `parent:{}` object (create_onto_task);
  `parent` + `parents[]` + `connections[]` (plan/milestone/risk creates); `parent_label` and
  `required_fields: ["parent_id","position"]` in the contract (`controls.ts:98,133`).
- **Kind vs type**: `entity_kind` (get_linked_entities, contract), `entity_type` (tag_onto_entity,
  get_field_info, link_user_contact), `src_kind/dst_kind` (link_onto_entities).
- **Dates**: `start_at/due_at` (task), `start_at/end_at` (project, calendar), `start_date/end_date` (plan),
  `target_date` (goal), `due_at` (milestone). The adapter has to normalise legacy date shapes for
  goal/milestone (`gatewayEntityMutationAdapter.ts:246-259`).
- **priority** is `integer` on task, `string|number` on goal.
- **name vs title**: goal/plan/project `name`; task/document/milestone/risk/event `title`.
- **Calendar optional soup**: `update_calendar_event`/`delete_calendar_event`/`get_calendar_event_details`
  have **zero required fields** and 6-13 optional ids (`onto_event_id`, `event_id`, `calendar_id`,
  `calendar_source_id`, `calendar_scope`, `project_id`). Only `validateCanonicalCalendarUpdateArgs`
  (`tool-validation.ts:522-551`) enforces "one of".
- `search_*` use `query`; `explore_project` uses `theme`.
- `skill_load` accepts `skill|reference|id|path` as aliases in the argument normaliser
  (`tool-arguments.ts:104-114`) — a tell that the schema was ambiguous enough that models guessed.
- **Sidecar on controls**: `call_ref`/`after` are appended to `declare_turn_contract`,
  `request_turn_clarification`, `cancel_turn_contract` (`tool-surface.ts:145,163`) where they are meaningless,
  and to mutation tools where using them is a trap: any mutation carrying `call_ref` or `after` is
  reclassified `contract_required` (`write-routing.ts:72-83`).

---

## 3. Overlap and gaps

### 3.1 Duplicates

- **18 listing/search reads** for one need: `search_all_projects`, `search_buildos` (dead), `search_ontology`
  (compat), `search_project`, `explore_project`, 7 × `search_onto_*` (4 hidden from discovery:
  `metadata.ts` chatDiscovery hidden → `registry.ts:172`), 7 × `list_onto_*`. Production project surface
  mounts 6 of them.
- **Three ways to read a document body**: outline+section, `get_onto_document_details`,
  `get_document_tree(include_content)`. Only the first is mounted (tasker 67 item, still open, §7).
- `outcome_card_search`/`outcome_card_load` and their aliases `work_capability_search`/`_load` are both
  full definitions (`discovery.ts:52-159`); `normalizeGatewayToolName` folds them (`surfaces.ts:206-210`).
- Four discovery searches (`tool_search`, `skill_search`, `domain_search`, `resource_search`) plus
  `tool_schema`.
- `create_task_document` (worker: attach-only) overlaps `create_onto_document` + `link_onto_entities`.

### 3.2 Dead on the worker path (production)

- All 13 discovery tools: `domain_search`/`skill_search`/`skill_load` are stripped before admission
  (`worker-tool-policy.ts:88-93`, `worker-prompt-surface.ts:26-28`); the other ten are never mounted and not
  in `AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1` (`tools/execution-adapter.ts:164-170`).
- `declare_read_only_turn` (omitted; `tool-surface.ts:134`).
- 35 names in `AGENTIC_CHAT_WORKER_UNAVAILABLE_TOOL_NAMES_V1` (`worker-tool-policy.ts:43-79`): 7 calendar,
  5 email, 5 contacts, 7 deletes, `reorganize_onto_project_graph`, relationship reads, Corsair, BuildOS docs,
  `commit_change_set`, profile overview. If any of them is selected, the whole turn renegotiates to legacy.
- **Executable but unreachable**: the worker has adapters for `create/update_onto_goal`, `_plan`,
  `_milestone`, `_risk`, `update_onto_project`, `link_onto_entities`, `unlink_onto_edge`, `tag_onto_entity`,
  `create_task_document`, `get_onto_*_details` (goal/plan/milestone/risk/document/task), `list_onto_projects`,
  `search_onto_*`, `get_onto_project_graph`, `get_document_path`, `list_task_documents`, `get_field_info`
  (`composition-root.ts:315-370`, `shared-read-dispatch.ts:47-84`) — but none is on `project_write_document`
  or `global_basic`, and the worker surface is immutable (`execution-adapter.ts:353-359`, README:11). In a
  project chat on the worker a user cannot add a goal, a milestone, a risk, link two entities, or rename the
  project. `move_onto_task`, `delegate_task`, `web_search/web_visit` are reachable only through message
  regexes at admission (`tool-selector.ts:92-126`).

### 3.3 Capability gaps (no tool at all)

- No asset read in chat although the gateway has `onto.asset.search/get` (`agent-call.types.ts` read ops).
- No "complete task" / "archive" primitive; `outcomeActionAuthorizesCall` (`validation.ts:329-352`) maps
  contract actions `complete/archive/restore` onto `update_onto_task.state_key`, so the model must know the
  enum trick.
- No bulk update; direct lane caps at 3 (`write-routing.ts:5`), everything above needs the contract lane.
- No undo/tombstone reads; deletes are deferred for lack of tombstones
  (`AGENTIC_CHAT_DEFERRED_MUTATION_TOOLS_V1`).

### 3.4 Discovery mechanics end-to-end

- **Web/legacy**: `skill_search` result carries `materialized_tools:['skill_load']`, `skill_load` carries
  related-op tools, search results carry `materialized_tools` (`tools/ontology-search.ts:476`,
  `ontology-explore.ts:209`); `tool-round-runner.ts:228` materialises them; `applyExactOpDiscoveryExecutionGuards`
  (`tool-validation.ts:337-369`) stops same-round schema+execute. Works.
- **Worker**: no discovery tool is callable, the surface never changes between passes
  (`request-builders.ts:176-181` builds tools once; continuation reuses `request.tools`), and `change_chat_context`
  is executed with `resolveDirectToolNames: () => []` (`execution-adapter.ts:353-359`). Yet the model is
  still told tools were materialised: `buildToolPayloadForModel` (`request-builders.ts:254`) routes
  `search_project`/`search_all_projects` through `compactOntologySearchPayload`, which **injects
  `materialized_tools` hints, including inferred ones like `get_onto_document_details` / `get_onto_task_details`**
  (`tool-payload-compaction.ts:766-781`, `entity-result-materialization.ts:3-11`). Calling any of them is
  `provider_tool_not_allowlisted` → permanent (§4.3). The comment at `surfaces.ts:109-113` promising that
  `get_onto_document_details` "materializes after document results" is false on this path.

---

## 4. Validation and repair

### 4.1 What runs, in order (worker)

1. Stream assembly: ≤40 calls/round (`stream-tool-calls.ts:18,53-59`), ≤64 KB args (`:94-96`),
   strict `JSON.parse` (`:219-227`), repeated-name normalisation (`:287-306`), scheduling sidecar parse
   (`:248-285`). All failures are `permanent`.
2. `assertAllowlistedCall` (`:308-315`) unless the only rejected names are `skill_load`/`skill_search`
   (`repair-policy.ts:14,21-61`, one bounded repair, and **only when the surface has a mutation tool +
   both controls** `disposition.ts:16-25`) or reviewer-only controls (`:68-94`).
3. Deterministic validation `validateToolCalls` (`tool-validation.ts:113-226`): required params (schema
   defaults applied `:228-245`), contract semantic parse (`:166-174`), op-specific args (`:391-445`),
   UUID shape (`:313-335`), durable-text violations, update-has-a-field (`:269-306`), task-schedule
   requirement (`:195-205`). Plus worker extras: contract target UUIDs, project-create name preservation,
   shell contract shape (`provider/validation.ts:29-216`), approved-contract authorisation (`:224-265`).
4. Supervisor observation, then direct-write assessment / semantic gates (§5).

### 4.2 Repairs and budgets

- Validation repair: failing calls are echoed back as `role:tool` messages with
  `{error, details:{field_errors}, op, help_path}` (`request-builders.ts:330-380`) plus
  `buildToolValidationRepairInstruction` prose (`repair-instructions.ts:941-…`). Budget
  `MAX_VALIDATION_REPAIR_ROUNDS = 2` (`turn-provider.ts:163`), then
  `provider_tool_validation_repair_exhausted` permanent (`:1908-1912`).
- Contract/mutation-batch revisions: 2 each per lane (`turn-provider.ts:170-171`).
- Forced synthesis: 1 retry then `provider_forced_synthesis_failed` permanent (`:164,2130-2135`).
- Rounds: `DEFAULT_MAX_PROVIDER_ROUNDS = 16` (`:162`), config default 16 rounds / 40 calls / concurrency 4
  (`turn-executor.ts:129-131`); read-loop escalation → tool-free synthesis (`:1044-1099`).
- Read memo: exact repeat reads are served from `turnReadMemo` (`feedback.ts:170-208`), cleared on writes.

### 4.3 Ways one bad call ends the turn permanently (no repair, no retry)

| trigger                                                                                                                                                                            | code                                                                      | where                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| any tool name not in `request.tools` other than skill\_\*/reviewer controls (e.g. the `materialized_tools` hint, `get_onto_document_details`, `list_onto_projects`, `tool_search`) | `provider_tool_not_allowlisted`                                           | `stream-tool-calls.ts:308-348`, `turn-provider.ts:1217,1828` |
| `skill_search` call on a read-only surface (repair requires a mutation tool present)                                                                                               | same                                                                      | `repair-policy.ts:48` + `disposition.ts:16-25`               |
| malformed / truncated JSON args (web path recovers via `recoverToolArgumentObject`, `tool-arguments.ts:639-671`; worker does not)                                                  | `provider_tool_arguments_invalid/_truncated`                              | `stream-tool-calls.ts:219-227`                               |
| >40 calls or >64 KB args in one response                                                                                                                                           | `provider_tool_call_count_exceeded` / `_too_large`                        | `:53-59,94-96`                                               |
| any tool call on a tool-free synthesis pass (post-round final, forced synthesis, clarification)                                                                                    | `provider_additional_tool_round_disabled` / `provider_tool_call_disabled` | `turn-provider.ts:2205-2208,2231-2233,1962-1968`             |
| bad `call_ref`/`after` (duplicate ref, missing dep, cycle)                                                                                                                         | `provider_tool_execution_graph_invalid`                                   | `turn-executor.ts:1259-1291`                                 |
| `provider_tool_validation_repair_exhausted` after 2 repairs                                                                                                                        | permanent                                                                 | `turn-provider.ts:1908`                                      |

The "control-round tool call = permanent kill" from tasker 70 / PC1 is still exactly the fifth row.
Permanent failures reach the terminal `failed` state (`turn-executor.ts:1579,3068`).

No infinite-loop path found: every repair carries `logicalProviderRound + 1`, the round cap is 16, and each
repair kind is single-shot (`unavailableSkillRepairAttempted`).

---

## 5. Execution graph and mutation routing

### 5.1 call_ref / after

- Parsed in `stream-tool-calls.ts:248-285`, stripped from domain args (`:230-235`) and from the canonical
  argument hash, preserved in provider history (`canonicalProviderArguments`).
- Compiled into a DAG per provider response: model `after` edges + worker conflict edges, cycle check,
  layers (`toolExecutionGraph.ts:87-224`); executed with bounded fan-out, dependency-failed skips, cancel
  propagation (`:276-427`).
- The model is told about it in one system message per request (`request-builders.ts:190-196`) plus the
  sidecar property descriptions on every tool. The message does **not** say that using `after`/`call_ref`
  on a mutation forces the contract route (`write-routing.ts:72-83`), so the two instructions contradict.

### 5.2 Concurrency policy (`toolExecutionPolicy.ts`)

- Reads: parallel; resources = every `*_id` arg as `read` (`:44-48,69-85`).
- Mutations: only `ROW_LOCAL_MUTATIONS` (`:21-35`) are `parallel_safe`; everything else serial
  (`move_document_in_tree`, `link/unlink`, `move_onto_task`, `tag`, `delegate`, `create_task_document`,
  `create_onto_project`).
- **Creates are keyed on `project_id` as a write resource** (`:29-34,58-66`). Two `create_onto_task` in the
  same project conflict on `project:<id>` and serialise (`toolExecutionGraph.ts:499-517`). The
  "three create_onto_document calls in one batch" in tasker 70 §2 ran as three layers. Same for a read
  of `get_onto_project_details(project_id)` beside a create.
- Defaults on: `concurrentReadsEnabled`/`concurrentMutationsEnabled = true` (`turn-executor.ts:345-346`),
  `CHAT_MAX_TOOL_CONCURRENCY=4`.

### 5.3 Direct-write floor (`write-routing.ts:41-118`)

Simple ⇔ one response, only mutations, ≤3, all `directWriteClass:'ordinary'`, no sidecars, and each call's
`directWriteSelectionPolicy` passes: `new_entity` (create in the focused project with no existing-entity
refs), `focused_project` (update_onto_project on the focused project), never `resolved_existing`. Everything
else → `contract_required` with a reason (`:120-143`) and the semantic disposition gate mounts the contract
(`turn-provider.ts:519-535`). A `simple` batch bypasses contract and mutation-batch review
(`turn-provider.ts:598,625`).

**Legibility to the model**: the rule is spelled out in `buildWorkerSemanticMutationOrdering`
(`review/turn-contract.ts:268-276`) and its opening-pass variant (`:258-266`). Two problems:
(a) the prose's own "simple" examples include "rename this focused project", but `update_onto_project` is not
mounted on any project surface (`surfaces.ts:137-145`), so the `focused_project` lane at `write-routing.ts:94-97`
is unreachable in production; (b) every `update_onto_*` is `resolved_existing`, so **every update of an
existing task/document is contract-routed** even with an exact id from a read in the same turn — the
"direct lane" is effectively creates-only. That is the structural reason tasker 70's single task
reschedule needed the compiled-contract shortcut (`turn-provider.ts:480-509`).

### 5.4 Adapter coverage vs catalog

- 39 signed writes → 21 reviewed/executable (`mutationToolCatalog.ts` specs; adapters wired in
  `composition-root.ts:315-370`: doc create, task create/update/move, tag, project update/create, delegate,
  gateway-entity adapter for doc update + goal/plan/milestone/risk create/update, document-relationship
  adapter for `move_document_in_tree`/`create_task_document`, edge adapter for link/unlink) and 18
  explicitly deferred with reasons (`AGENTIC_CHAT_DEFERRED_MUTATION_TOOLS_V1`). Drift is fail-closed by
  `auditAgenticChatMutationSurfaceV1` and `auditAgenticChatWorkerToolPolicyV1` (`worker-tool-policy.ts:121-141`).
- Gateway op coverage: every reviewed op except `onto.task.move`, `x.misc.tag_onto_entity`,
  `util.agent.delegate` maps to `BUILDOS_AGENT_WRITE_OPS` (`agent-call.types.ts:65-86`); those three use
  dedicated adapters. No adapter exists without a catalog spec (router rejects unknown names,
  `mutationAdapterRouter.ts:23-35`).
- Worker narrowing vs web: `create_onto_project` loses `context_document`/`clarifications`/`meta` and
  requires empty `entities`/`relationships`; `create_task_document` becomes attach-only; `tag_onto_entity`
  ping-only; `link_onto_entities` excludes project endpoints; `create_onto_plan` loses `goal_id`/`milestone_id`/
  `parent`/`parents`; `create_onto_milestone` loses `parent(s)`/`connections`. All documented in
  `descriptionOverride`s — good.

---

## 6. Status of prior findings

| item                                    | status                                                                                                                                                                                                                                                                                                                                                                                                              | evidence                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| F1 declare_turn_contract cost           | **partly closed**: deferred on the opening pass of lazy profiles when semantic review is on; still on every later pass; schema unchanged (label/parent_label, 14 verbs); worker adds sidecar → 3,080 B                                                                                                                                                                                                              | `tool-surface.ts:60-68,102-117`, `request-builders.ts:177-181`, `controls.ts:19-143`                               |
| F2 change_chat_context                  | **open**, D3 undecided                                                                                                                                                                                                                                                                                                                                                                                              | `surfaces.ts:73,102`; `tasker/65:163`; on worker returns `materialized_tools: []` (`execution-adapter.ts:353-359`) |
| F4 phantom tool_search prose            | **closed**                                                                                                                                                                                                                                                                                                                                                                                                          | `build-lite-prompt.ts:977-979`                                                                                     |
| F5 Current Tool Surface duplicate       | **open, now three copies**: section still rendered (`build-lite-prompt.ts:1209-1228`); worker prompt is built from the stripped list (`worker-turn-preparation.server.ts:554-556`), but because the artifact keeps `declare_turn_contract` and the opening pass defers it, `buildWorkerToolSurfaceOverride` fires on **every** write-capable opening pass and re-lists all callable names (`tool-surface.ts:74-94`) |                                                                                                                    |
| tasker 67 outline→section dependency    | **open**; catalog comment still promises materialisation                                                                                                                                                                                                                                                                                                                                                            | `surfaces.ts:109-115`, `execution-adapter.ts:353-359`                                                              |
| tasker 70 "beta list email thing" regex | fixed in code (imperative boundary for `list`) though WP-1 boxes are unchecked                                                                                                                                                                                                                                                                                                                                      | `tool-selector.ts:273-282`                                                                                         |
| tasker 70 contract convergence          | partially: compiled single-task schedule contract; revisions capped at 2; WP-3 typed repair still open                                                                                                                                                                                                                                                                                                              | `turn-provider.ts:170-171,480-509`                                                                                 |
| tasker 70 control-round tool call kill  | **open**                                                                                                                                                                                                                                                                                                                                                                                                            | `turn-provider.ts:2205-2233`                                                                                       |

---

## 7. Findings, ranked

### P0

**P0-1 — Tool results advertise tools that kill the turn when called.** Worker search feedback carries
`materialized_tools` (raw: `ontology-search.ts:476`, `ontology-explore.ts:209`; compaction adds inferred
`get_onto_document_details`/`get_onto_task_details`: `tool-payload-compaction.ts:766-781`) but the worker
never mounts them; the model's next call hits `provider_tool_not_allowlisted` → terminal failure
(`stream-tool-calls.ts:308-348`, `turn-provider.ts:1828`). Same for descriptions that name unmounted tools
(§2.1 items 3-6). _User impact_: "read those three docs / show me task X's details" can end as a hard failure
with no answer. _Fix_: (a) strip `materialized_tools` in `buildToolPayloadForModel` when the host is the
worker, or honour it by re-mounting from `admittedTools` on the next pass; (b) convert
`provider_tool_not_allowlisted` for a name that exists in the catalog into a one-shot repair message like
the skill repair (`repair-policy.ts:21-61`) instead of a permanent error; (c) lint descriptions so no
mounted tool references an unmounted one per profile (a unit test over `getGatewaySurfaceForProfile`).

**P0-2 — Daily brief and calendar contexts can never run on the worker.** `global_write` mounts four
calendar tools and `project_calendar` six (`surfaces.ts:86-95,147-159`); all are worker-unavailable
(`worker-tool-policy.ts:46-52`), so admission throws `transport_renegotiate` on every such turn
(`worker-turn-preparation.server.ts:376-383`) and the client re-sends on `legacy_sse`. _User impact_: every
daily-brief action turn pays a 409 round trip and runs on the path without the reviewer, write ledger
persistence, or concurrency work. _Fix_: split calendar tools out of `global_write` (mount task tools
only; materialise calendar tools by regex as `tool-selector.ts:134-136` already does), or route
`daily_brief` to a worker-safe profile and keep the renegotiation for explicit calendar asks.

### P1

**P1-1 — Executable mutations are unreachable on the production project surface.** Goal/plan/milestone/risk
create+update, `update_onto_project`, link/unlink, tag, attach — all have worker adapters
(`composition-root.ts:315-370`) but none is on `project_write_document` (`surfaces.ts:137-145`) and there is
no discovery on the worker. The routing prose even cites "rename this focused project" as a simple case
(`review/turn-contract.ts:271`) with no tool to do it. _Fix_: mount `update_onto_project`, `create/update_onto_goal`
and `_milestone` on the project write surface (≈+6 KB), or implement true on-miss materialisation from
`admittedTools` for catalog names (the plumbing exists: `materializeGatewayTools`, `allowToolName`).

**P1-2 — The scheduling sidecar costs more than it saves and contradicts the write floor.** 349 B on each
of 17-18 tools per pass (≈1,500-1,750 tok on `project_write_document`, more than `declare_turn_contract`
itself), attached to controls where it is meaningless, and any mutation that uses it is reclassified
`contract_required` (`write-routing.ts:72-83`) while the batching message tells the model to use it
(`request-builders.ts:190-196`). _Fix_: drop the per-tool properties; keep one short system line; accept
`call_ref`/`after` as top-level optional args validated leniently (they are already stripped before
validation, `stream-tool-calls.ts:230-235`).

**P1-3 — Every update of an existing entity is contract-routed.** All `update_onto_*`, `create_task_document`,
`link_onto_entities`, `tag_onto_entity` are `directWriteSelectionPolicy:'resolved_existing'`
(`mutationToolCatalog.ts`), which `assessDirectWriteBatch` always sends to the contract lane
(`write-routing.ts:88`). The "≤3 ordinary ops" direct lane is therefore creates-in-focused-project only, and
the reviewer/contract cycles measured in tasker 70 (245 s, 413k tokens) are the norm for edits, not the
exception. _Fix_: allow `resolved_existing` in the direct lane when the target id was returned by a read in
the **same turn** (the read memo already knows: `feedback.ts:170-182`) and the batch is ≤3 — keeping the
contract lane for cold references.

**P1-4 — Worker has no argument recovery.** Strict `JSON.parse` failure is permanent
(`stream-tool-calls.ts:219-227`) while the runtime ships fence-stripping and segment merging that only the
legacy path uses (`tool-arguments.ts:639-671`). _Fix_: on parse failure, run `recoverToolArgumentObject`;
if it recovers, continue with a `recovered` diagnostic; otherwise feed the error back once as a validation
repair instead of a permanent error.

### P2

**P2-1 — Same-project creates serialise.** `ROW_LOCAL_MUTATIONS` keys creates on `project_id` as a write
(`toolExecutionPolicy.ts:29-34,58-66`), so N creates in one project run in N layers. Either key creates on a
synthetic per-call resource (they cannot conflict row-wise) or document creates only (tree positions).

**P2-2 — F5 has grown to three drifting tool lists** (tools array, "Current Tool Surface" section, and the
per-pass override paragraph). Delete the prompt section; make the artifact's `toolNames` equal the opening
callable set so the override never fires on the happy path (`tool-surface.ts:74-94`).

**P2-3 — Inconsistent argument vocabulary** (§2.2): parent placement ×5, `entity_kind` vs `entity_type`,
date field names ×5, `priority` type. Pick one spelling per concept in the catalog and alias the rest in
the gateway normaliser (`op-execution-gateway.normalization.ts`), not in the model-facing schema.

**P2-4 — change_chat_context still on every surface with 0 measured calls** and inert on the worker
(`execution-adapter.ts:353-359`; tasker 70 WP-2 open). Decide D3; the lean option is regex-gated
materialisation like calendar/email.

**P2-5 — `skill_search` repair only works on write surfaces.** `buildUnavailableSkillRepairRequest` returns
null when `canRequirePreMutationSemanticDisposition` is false (`repair-policy.ts:48`), i.e. on
`global_basic`/read-only artifacts a `skill_search` call is a permanent kill. Drop that guard for the
skill-repair case.

### P3

- `search_buildos`, `resolve_libri_resource`, `query_libri_library` metadata without definitions; `search_ontology`
  "older instructions" description; `work_capability_*` duplicate definitions — delete or fold.
- `read_document_section`/`get_document_outline` skip UUID validation (`tool-validation.ts:308-311`).
- `declare_read_only_turn` still in every web artifact though retired from the worker; `project_basic`,
  `project_write`, `project_document` profiles are unreachable by routing.
- `getDefaultToolNamesForContextType` yields 93 tools for project context (`taxonomy.ts:29-40`) and is only
  used by a test helper (`lite-turn-runner.ts:129`).
- `web_visit` web schema exposes `persist`/`force_refresh`/`include_links` that the worker strips — align the
  catalog to the worker's 4-prop shape.

---

## 8. What's right (do not undo)

- The reviewed mutation catalog is a single source for projection, gating, and adapters, with fail-closed
  drift audits (`mutationToolCatalog.ts` audit, `worker-tool-policy.ts:121-141`).
- Worker narrowing of schemas (`create_onto_project` 5,823→3,561 B; `web_visit` 10→4 props;
  `update_onto_document` enum) is exactly the right direction.
- The execution graph is deterministic, hashed, acyclic-checked, with dependency-failed skips and cancel
  propagation; conflict barriers are worker-owned, never model-supplied.
- Direct-write floor is deterministic and its reasons are specific (`write-routing.ts:120-143`).
- Validation repair names the exact field/outcome (`tool-validation.ts:166-174`, `provider/validation.ts:47-79`),
  and the task-schedule guard closes the 07-31 echo-update loop.
- Repeated tool-name normalisation (`stream-tool-calls.ts:287-306`) and the read memo
  (`feedback.ts:170-208`) are cheap, real wins.
- Lean discovery at launch and the F4 prompt fix are correct.

---

## 9. Open questions needing telemetry

1. Per-tool call frequency on the worker path by surface, plus the `rejected_tool_name` diagnostic
   distribution (`stream-tool-calls.ts:337-346`) — how often is P0-1 actually hit, and which names?
2. Share of daily-brief turns that renegotiate (P0-2) and their legacy-path latency/cost vs project turns.
3. Fraction of `update_onto_*` batches that were `contract_required` only because of `resolved_existing`
   (P1-3) versus genuinely ambiguous targets.
4. Whether any production call has ever used `call_ref`/`after` (P1-2); if ~0, remove the sidecar outright.
5. Layer widths for same-project multi-create batches (P2-1) — is serialisation measurable in
   `parallelSavingsMs`?
6. `change_chat_context` call count since 08-27 (D3).
7. Validation-repair exhaustion and forced-synthesis-failure rates by model route, to size P1-4 and the
   control-round kill.
