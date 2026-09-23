<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/lane-B-tool-surface.md -->

# Lane B — Tool surface and catalog

Agentic chat harness audit, 2026-09-08. Working tree at `226e51c31` (HEAD moved from `6d70b36e1` during
the audit; no lane-B source file changed between the two). Read-only; all numbers are computed from the
built `packages/agentic-chat-runtime/dist` (built 2026-09-08 22:09, newer than every catalog source) and
from `apps/worker/src/workers/agentic-chat/mutations/tool-catalog.ts` imported directly under Node 24 type
stripping. Scripts and raw outputs live in `evidence/lane-B-*`.

The question for this lane: what does the acting model actually see in the `tools` array, what does it
cost, what does it teach a cheap model, and which of it is dead, duplicated, or missing.

---

## 0. Summary

| Measure                                                 | Value                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Catalog vocabulary                                      | 105 definitions, 99,005 B (90 direct + 11 discovery + 4 controls)                     |
| Direct tools reachable on any chat surface              | 37 of 90 (32 static + 5 email group)                                                  |
| Worker opening pass, `global`                           | 24 tools, **28,350 B** (~7.1k tokens)                                                 |
| Worker opening pass, `project`                          | 31 tools, **34,425 B** (~8.6k tokens)                                                 |
| Worker opening pass, `project_create`                   | 6 tools, **12,377 B**                                                                 |
| Worker all-passes (admitted) `project`                  | 32 tools, 38,780 B (cap 39,000 — 220 B headroom)                                      |
| Email group when mailbox connected                      | +5 tools, +3,342 B                                                                    |
| Heaviest single schema                                  | `declare_turn_contract` 4,354 B (35% of it is symbolic-label plumbing)                |
| Tools on the `global` surface that cannot succeed there | 1 (`delegate_task`, 1,805 B; 60% failure in 14-day prod)                              |
| Reviewed mutation specs with an adapter but no surface  | 11 of 25                                                                              |
| Normalizers that can never run                          | 1 (`strip_calendar_attendees_and_reminders`), plus 6 attached only to unmounted tools |
| Battery `declare_turn_contract` validation failures     | 6 of 23 calls (26%); 4 of 6 are `label` misuse                                        |
| Lean proposal (capability-preserving)                   | global 28,350 → 23,845 B (−16%); project 34,425 → 31,223 B (−9%)                      |

Three things dominate: (1) the surface carries machinery for a discovery/materialization world that the
worker cannot enter (discovery tools, `declare_read_only_turn`, hint stripping, capability flags); (2) the
contract schema's symbolic-label sub-language is the single largest source of weak-model validation
failures and has no observed successful use; (3) the project surface is missing the writes users most
plausibly ask for in a focused project (rename the project, add a goal/milestone/risk) while carrying
writes they rarely use.

---

## 1. How the surface is built today

1. `resolveGatewaySurfaceProfileForContextType` maps every chat context to one of three profiles
   (`packages/agentic-chat-runtime/src/catalog/surfaces.ts:221-233`). Nothing reads the message.
2. `getGatewaySurfaceForProfile` concatenates two discovery names (`skill_search`, `domain_search`,
   `surfaces.ts:28,255-268`) with the profile's direct names (`surfaces.ts:76-163`) and resolves
   definitions from the catalog map (`surfaces.ts:188-211`).
3. Web admission strips `declare_read_only_turn`, `domain_search`, `skill_search`, `skill_load`
   (`packages/agentic-chat-runtime/src/worker-tool-policy.ts:80-85`;
   `apps/web/src/lib/services/agentic-chat-v2/worker-prompt-surface.ts:22-41`), appends the Gmail group for
   users with an active connection (`email-surface-mount.server.ts:43-86`), refuses the turn if any name
   is not worker-executable (`worker-turn-preparation.server.ts:428-444`), and signs the artifact.
4. The worker re-projects the artifact: drops `declare_read_only_turn` again, keeps only production
   reads and enabled mutations, and rewrites every mutation schema to its reviewed subset with
   description/property overrides (`apps/worker/src/workers/agentic-chat/provider/tool-surface.ts:146-194,
270-327`).
5. `declare_turn_contract` is removed from the opening pass on `global`/`project`
   (`tool-surface.ts:129-144`; `request-builders.ts:181-186`) and re-mounted by the disposition gate or a
   surface repair (`turn-phase.ts:213-234`; `repair-policy.ts:122-182`).
6. The surface is immutable for the turn: no production code path calls `materializeGatewayTools`
   mid-turn (only `email-surface-mount.server.ts:85` at admission and the size report).

Net effect: the catalog mounts 28/35/7 tools; the model sees 24/31/6 on the opening pass.

---

## 2. Measurements

### 2.1 Bytes per surface (evidence/lane-B-worker-projected-bytes.txt)

| Profile         |       Catalog |  Signed (web) | Admitted (worker, all passes) |      Opening pass |
| --------------- | ------------: | ------------: | ----------------------------: | ----------------: |
| global          | 28 / 39,621 B | 25 / 38,347 B |                 25 / 32,705 B | **24 / 28,350 B** |
| global + email  | 28 / 39,621 B | 30 / 41,694 B |                 30 / 36,052 B |     29 / 31,697 B |
| project         | 35 / 41,649 B | 32 / 40,375 B |                 32 / 38,780 B | **31 / 34,425 B** |
| project + email | 35 / 41,649 B | 37 / 43,722 B |                 37 / 42,127 B |     36 / 37,772 B |
| project_create  |  7 / 16,443 B |  6 / 15,993 B |                  6 / 12,377 B |  **6 / 12,377 B** |

The worker projection shrinks two tools a lot (`create_onto_project` 6,028 → 2,383 B; `web_visit`
1,657 → 750 B) and inflates five, because the description overrides are longer than the catalog
descriptions and `additionalProperties:false` is added: `update_onto_task` 3,062 → 3,256, `link_onto_entities`
1,189 → 1,506, `move_document_in_tree` 1,102 → 1,410, `update_calendar_event` 1,661 → 1,827,
`delete_calendar_event` 986 → 1,155.

### 2.2 The twelve heaviest schemas as the model sees them

| Tool                  | Opening bytes | Where                     | Props (req)              | Notes                           |
| --------------------- | ------------: | ------------------------- | ------------------------ | ------------------------------- |
| declare_turn_contract |         4,354 | gate/contract passes only | 2 (1) top, 12 nested (3) | see §4                          |
| update_onto_task      |         3,256 | global, project           | 15 (1)                   | 14 optional                     |
| create_onto_task      |         2,818 | all three                 | 16 (2)                   | 14 optional                     |
| create_onto_project   |         2,383 | global, project_create    | 3 (3)                    | two required-but-empty arrays   |
| update_calendar_event |         1,827 | global, project           | 13 (0)                   | 5 addressing knobs              |
| create_onto_document  |         1,806 | project                   | 8 (3)                    |                                 |
| delegate_task         |         1,805 | global, project           | 7 (2)                    | cannot succeed on global (§5.1) |
| update_onto_document  |         1,642 | project                   | 9 (1)                    | advertises merge_llm ×3         |
| link_onto_entities    |         1,506 | project                   | 6 (5)                    |                                 |
| create_calendar_event |         1,487 | global, project           | 12 (2)                   |                                 |
| move_document_in_tree |         1,410 | project                   | 5 (2)                    |                                 |
| move_onto_task        |         1,299 | global, project           | 4 (3)                    | two-turn confirmation protocol  |

### 2.3 Per-tool classification (mounted tools)

R = read, M = mutation, C = control. "Prod" = calls in the 14-day production table
(`docs/technical/reviews/AGENTIC_CHAT_TURN_EXECUTOR_AUDIT_2026-09-02.md` §2.5, post-08-28 column) and in the
four 09-04 battery `*runs.json` artifacts (60 turns; evidence/lane-B-battery-tool-calls.txt).

| Tool                                                                     | Kind | Surfaces              | Worker-executable          | Prod / battery calls           | Verdict                                 |
| ------------------------------------------------------------------------ | ---- | --------------------- | -------------------------- | ------------------------------ | --------------------------------------- |
| declare_turn_contract                                                    | C    | all (deferred on g/p) | yes                        | 32 / 23 (6 failed)             | keep; simplify schema                   |
| request_turn_clarification                                               | C    | all                   | yes                        | — / 14 (5 failed, cause fixed) | keep                                    |
| cancel_turn_contract                                                     | C    | all                   | yes                        | 0 / 0                          | mount only with a pending contract      |
| declare_read_only_turn                                                   | C    | all (catalog)         | stripped ×4                | 2 (reviewer) / 1               | delete from surfaces                    |
| skill_search, domain_search                                              | —    | g, p (catalog)        | stripped                   | 1 / 1 (pre-one-engine)         | delete from surfaces                    |
| get_workspace_overview                                                   | R    | g, p                  | yes                        | — / 0                          | keep on g; drop on p                    |
| get_project_overview                                                     | R    | g, p                  | yes                        | 23 / 6                         | keep                                    |
| search_onto_projects                                                     | R    | g                     | yes                        | — / 1                          | keep (only state-filtered project list) |
| search_all_projects                                                      | R    | g                     | yes                        | 15 / 6                         | keep                                    |
| explore_project                                                          | R    | g, p                  | yes (needs embeddings key) | 9 / 0                          | keep                                    |
| get_document_outline / read_document_section / get_onto_document_details | R    | g, p                  | yes                        | 67+65 / 16+31+6                | keep                                    |
| list_onto_tasks / get_onto_task_details                                  | R    | g, p                  | yes                        | 16 / 11+11                     | keep; fix description                   |
| create_onto_task / update_onto_task                                      | M    | g, p (+pc)            | yes                        | 13+12 / 15+3                   | keep; trim                              |
| move_onto_task                                                           | M    | g, p                  | yes                        | — / 0                          | keep                                    |
| create_onto_project                                                      | M    | g, pc                 | yes                        | — / 3                          | keep; drop empty arrays                 |
| delegate_task                                                            | M    | g, p                  | yes on p only              | 10 (6 failed) / 0              | **remove from global**                  |
| web_search / web_visit                                                   | R    | g, p                  | yes                        | — / 0 in battery               | keep                                    |
| list_calendar_events / get_calendar_event_details                        | R    | g, p                  | yes                        | — / 9+0                        | keep; trim knobs                        |
| create/update/delete_calendar_event                                      | M    | g, p                  | yes                        | — / 0                          | keep; trim knobs                        |
| get_onto_project_details, search_project                                 | R    | p                     | yes                        | 1 / 1+4                        | keep                                    |
| list_onto_documents, get_document_tree                                   | R    | p                     | yes                        | — / 0+3                        | keep                                    |
| create_onto_document / update_onto_document                              | M    | p                     | yes                        | — / 6+1                        | keep; fix merge_llm text                |
| move_document_in_tree, link_onto_entities                                | M    | p                     | yes                        | — / 0+0                        | keep                                    |
| get_project_calendar / set_project_calendar                              | R/M  | p                     | yes                        | — / 0                          | keep                                    |
| create_onto_goal                                                         | M    | pc only               | yes                        | — / 0                          | **also mount on project**               |
| email group (5)                                                          | R    | per-user              | yes                        | 3+1                            | keep; fix gating (§5.4)                 |

---

## 3. Dead and unreachable machinery (delete)

### 3.1 Discovery tools and mid-turn materialization

- `getGatewaySurfaceForProfile` mounts `skill_search` and `domain_search` on every global/project turn
  (`surfaces.ts:28,255-268,285-291`); web admission removes them one call later
  (`worker-prompt-surface.ts:26-28` via `worker-tool-policy.ts:80-85`). Net contribution: 0 bytes, two
  tests pinning them.
- `isLeanDiscoveryEnabled()` and `isGatewayToolEnabled()` return constant `true` (`surfaces.ts:30-32,209-211`).
- If `FASTCHAT_LEAN_DISCOVERY=false` is ever set (`scaffold-variant.ts:80,131`), the six-name discovery set
  mounts (`surfaces.ts:13-20`); `skill_reference_load`, `tool_search`, `tool_schema` are neither executable
  nor in the omitted list (`worker-tool-policy.ts:80-98`), so `findAgenticChatWorkerUnavailableToolNamesV1`
  flags them and **every turn is refused** with `capability_unavailable`
  (`worker-turn-preparation.server.ts:437-444`). A config flag that can only break production.
- `extractGatewayToolMaterializations`, `extractGatewayMaterializedToolNames`, the
  `GatewayToolMaterializationSource` union, and the `allowToolName` option of `materializeGatewayTools`
  (`surfaces.ts:46-58,241-252,299-357,379-381`) have no production caller. Roughly 100 of 415 lines.
- The 11 discovery definitions (`definitions/discovery.ts`, 5,919 B) are callable on no host.
  `tool-payload-compaction.ts:183-195` still special-cases them plus the retired
  `work_capability_search`/`work_capability_load` names that `surfaces.ts:184-187` says are gone.
- Search payloads still emit `materialized_tools` (`ontology-search.ts:476`, `ontology-explore.ts:209`) and
  the worker host policy strips them again (`tool-surface.ts:83`; `tool-payload-compaction.ts:199-201`).

Cheap-model impact: none directly (all stripped), but every one of these is a place where a future
edit re-exposes a tool the worker cannot run, and the "never mention an unmounted tool" tests must carve
out an `omitted` set to stay green (`surfaces.test.ts:137-151, 192-224`).

### 3.2 `declare_read_only_turn` on the acting surfaces

Mounted in all three direct-name lists (`surfaces.ts:80,159`), then removed at four sites:
`worker-tool-policy.ts:81`, `tool-surface.ts:92` (artifact-only set), `tool-surface.ts:161`,
`tool-surface.ts:185`. 57 non-test references across worker/runtime/web. Its one live use is the reviewer
lane, which builds its own copy anyway (`turn-phase.ts:284-288,304-312`). The definition should stay for
the reviewer; the mounts and three of the four strips should go.

### 3.3 `delegate_task` on the global surface (also a bug)

`GLOBAL_DIRECT_TOOL_NAMES` includes it (`surfaces.ts:107`). The adapter requires the argument
`project_id` to equal the admitted context project and throws `mutation_project_scope_mismatch` otherwise
(`delegateTaskMutationAdapter.ts:81-88`); on a global turn `requestProjectId` returns the explicit
context project, which is null (`mutationAdapterBoundary.ts:90-110`). So every global call fails after
the model has already paid a round. Production agrees: 10 calls, 6 failed (60%) in the 14-day table.
Its override description (660 chars, `mutationToolCatalog.ts:1073`) says "Exact focused project UUID"
while the tool is mounted where nothing is focused. Cost: 1,805 B on every global opening pass.

### 3.4 Unreachable normalizers and overrides

- `strip_calendar_attendees_and_reminders` (`mutation-argument-normalizers.ts:345-357`) is attached to
  four calendar specs and documents itself as "the second lock ... records what it took off so the receipt
  can say so". It never runs: `assertMutationAdapterBoundary` throws `mutation_arguments_not_admitted` for
  any argument outside `reviewedArgumentNames` (`mutationAdapterBoundary.ts:74-83`) and runs before the
  normalizer loop (`tableMutationAdapter.ts:128` vs `:147`). A model that sends `attendees` for "set up a
  meeting with Bob" gets a hard failure, not the graceful strip the comment promises.
- 6 of 17 normalizers (`require_signed_impact`, `normalize_project_row_update`, `reduce_to_edge_id`,
  `normalize_task_document_arguments`, `normalize_entity_ping_arguments`, `normalize_due_at_start_of_day`)
  and 8 of 17 `descriptionOverride`s belong only to specs on no surface (§5.2). They are neither dead nor
  live: they wait for a mount decision.
- `reject_merge_llm_update_strategy` is reachable only because the provider validator does not enforce
  enums ("Generic validation intentionally does not interpret every nested JSON Schema keyword",
  `tool-validation.ts:173-178`); the schema override already restricts `update_strategy` to
  `replace|append` (`mutationToolCatalog.ts:280-287`).

### 3.5 Per-tool capability flags that are always on

Every reviewed spec carries a `capability` name; `ALL_AGENTIC_CHAT_MUTATION_CAPABILITIES_V1` sets all 25
to `true` (`mutationToolCatalog.ts:1296-1300`) and bootstrap passes exactly that (`bootstrap.ts:383`).
`AgenticChatProviderMutationCapabilitiesV1`, `normalizeAgenticChatMutationCapabilitiesV1`,
`isEnabledMutationTool`, and the capability-keyed router make 57 references across 8 files for a switch
with no off position. The spec key is already the identity.

---

## 4. The controls, read as a weak model would

| Control                    | Bytes | Required                          | Nested objects                    | Enums                    | Distinct ways to fail validation |
| -------------------------- | ----: | --------------------------------- | --------------------------------- | ------------------------ | -------------------------------- |
| declare_turn_contract      | 4,354 | 1 top (`outcomes`), 3 per outcome | 2 levels (`outcomes[].changes[]`) | 2 (14 actions, 11 kinds) | **30**                           |
| request_turn_clarification | 1,277 | 2                                 | 1 (`candidates[]`, min 2)         | 0                        | 4                                |
| cancel_turn_contract       |   420 | 1                                 | 0                                 | 0                        | 1                                |
| declare_read_only_turn     |   449 | 1                                 | 0                                 | 0                        | 1 (never mounted for the actor)  |

`declare_turn_contract` (`definitions/controls.ts:18-159`): 12 nested properties, of which `label`,
`src_label`, `dst_label`, `parent_label` total 1,532 B (35% of the schema); the `label` description
alone is 575 B and carries the schema's only worked example. The runtime rejects an outcome for 21
per-outcome reasons (`packages/agentic-chat-runtime/src/loop/turn-contract.ts:445-663`), 5 cross-outcome
reasons (`:668-724`), 2 top-level reasons (`:726-746`), and the worker adds 2 field checks
(`provider/contract-fields.ts:17-45`). Eleven of the 30 concern labels.

What the cheap model actually did with it (battery, evidence/lane-B-battery-tool-calls.txt):

| Prompt                                              | Rejection                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| "create exactly these five tasks"                   | labelled create with `minimum_successful_effects: 5`              |
| "create exactly these five tasks"                   | `required_fields: ["project_id"]`                                 |
| "create exactly these five tasks" (×2, earlier run) | `required_fields: ["estimated_minutes"]` / `["estimate_minutes"]` |
| "complete those exact three document edits" (×2)    | `label` on an update outcome                                      |

Four of six failures are label misuse on requests that needed no label at all; the other two are the
model naming a "field" for a user-stated estimate because the only place `props.duration_minutes` is
taught is the `create_onto_task` description, not the contract schema. No successful `link_onto_entities`
or `move_document_in_tree` call — the two consumers of labels — appears in any battery run. The
symbolic-label sub-language is costing failures on the common path to enable a path with no observed use.

`request_turn_clarification`: the five battery failures ("question must name every supplied candidate
label verbatim") are already fixed in the tree (`turn-contract.ts:955-960`). A stale comment still
describes the old rule (`provider/review/decision-handling.ts:223-226`).

`cancel_turn_contract`: correctly wired (`turn-provider.ts:520-525`; pending-contract carry-forward is
live via DB trigger `apply_agentic_chat_terminal_pending_contract_v1`), but it is only meaningful on a turn
whose session carries `fastchat_pending_turn_contract`. Zero calls in production and battery. Mount it
only on those turns.

`declare_read_only_turn`: §3.2.

---

## 5. Capability gaps (add)

### 5.1 Global: nothing to delegate to

Covered in §3.3 — the surface advertises a capability the context cannot exercise.

### 5.2 Project: cannot touch the project itself, or its goals, milestones, risks

`PROJECT_DIRECT_TOOL_NAMES` (`surfaces.ts:127-146`) adds documents, links, and the calendar binding to the
global set. It does not add `update_onto_project`, `create_onto_goal`, `update_onto_goal`,
`create_onto_milestone`, `update_onto_milestone`, `create_onto_risk`, `update_onto_risk`,
`create_onto_plan`, `update_onto_plan`, `create_task_document`, or `unlink_onto_edge` — all eleven have a
reviewed spec and a working table adapter (`mutationToolCatalog.ts:646-905, 1021-1049`).

Consequences a user hits:

- "Rename this project" / "mark this project paused" / "update the project description": impossible.
  The worker's own routing message lists "rename this focused project" as the first example of a simple
  direct write (`provider/review/turn-contract.ts:404`) and says "or an update to that focused project
  itself" (`:403`). The model is coached toward a tool that is not there.
- "Add a goal for Q4" / "add a milestone for the launch" / "log the risk that the vendor slips":
  impossible in project context; `create_onto_goal` exists only on `project_create`
  (`surfaces.ts:161`). `get_onto_project_details` returns goals and milestones (`ontology-reads.ts:549-577`),
  so the model can read them and then must tell the user it cannot write them.
- The `project_create` surface after the shell returns can create goals and tasks but not milestones
  or risks, so a fully specified brief ("with a milestone on Nov 20") is partially fulfilled by design.

Cheap-model impact: with no tool, a weak model either says it cannot (best case) or reaches for
`update_onto_document`/`create_onto_task` to fake it. Byte cost of adding the four most-asked writes
(`update_onto_project` ~700 B, `create_onto_goal` 1,118 B, `create_onto_milestone` ~900 B,
`create_onto_risk` ~900 B) is about 3.6 KB on the project surface, which the trims in §7 more than pay for.

### 5.3 Global: task scans are bounded and unsorted

`list_onto_tasks` orders by `updated_at desc`, caps at 50 (`ontology-reads.ts:803,815-816`), and has no
due-date filter or sort. "What is due this week across my projects" on a workspace with more than 50
active tasks is silently incomplete, and the model has no way to know. The schema description also
says the tool returns "id, title, state, and type" (`definitions/ontology-read.ts:28`) while the
implementation returns `description, priority, start_at, due_at, completed_at, props, project_name` too
(`:788-802`), and the payload message says "Use get_onto_task_details for full information" (`:832`) —
which nudges a weak model into N+1 detail reads for data it already has.

### 5.4 Gmail: the connect flow is mounted only for people who are already connected

The email group, including `request_email_account_connection` (the OAuth handoff) and
`get_external_account_status`, is appended only when `user_email_connections` has an active readable row
(`email-surface-mount.server.ts:43-86`; `surfaces.ts:169-175`). A user with no mailbox who asks "connect my
Gmail" or "check my inbox" gets a turn with no email tool and a model that cannot even stage the
handoff. For connected users the handoff tool is 743 B of dead weight unless they add a second account.

### 5.5 Smaller gaps

- No `list_onto_projects` on any surface; "list all my projects" goes through
  `get_workspace_overview` (max 20) or `search_onto_projects` (query required, `minLength: 1`).
- No way to attach an existing document to a task (`create_task_document` unmounted).
- Deletes are deferred by design (`mutationToolCatalog.ts:1216-1230`) — not a finding, but the model has
  no tool that says so; it learns only when the user asks.

---

## 6. Schema and description problems for a weak model

### 6.1 Contradiction: "declare_turn_contract first" on a pass without it

Eight `descriptionOverride`s end with the 170-character sentence "Direct call is fine when the target id
is the focused entity ... otherwise declare_turn_contract first" (`mutationToolCatalog.ts` — 8 matches).
Three of them ride the opening pass, where the contract tool is deferred: `update_onto_task` (global,
project), `update_onto_document` and `link_onto_entities` (project). The system routing message for that
pass says the opposite ("the large complex-write contract route is deferred in this opening pass ...
propose the complete concrete mutation batch", `provider/review/turn-contract.ts:396-399`). A weak model
that obeys the tool text emits `declare_turn_contract`, which is not in `request.tools`; the harness
catches it with one surface-repair pass (`repair-policy.ts:122-182`, `turn-provider.ts:1274-1290`) —
one extra provider round with the full tool list re-sent. The guard test compares descriptions against
`admitted`, not `opening` (`apps/worker/tests/agenticChatWorkerSurfaceBudget.test.ts:231-251`), so it
cannot see this.

### 6.2 `create_onto_project`: two required arrays whose only legal value is `[]`

The worker override keeps `entities` and `relationships` required with `maxItems: 0`
(`mutationToolCatalog.ts:915-916, 983-1010`) because the shared validator demands the arrays
(`packages/agentic-chat-runtime/src/loop/project-create-args.ts:390-405`). The description says "Pass
empty entities and relationships arrays" — a rule that exists to satisfy a validator, not the user. The
override also replaces the catalog's `type_key` guidance and drops the realm vocabulary the catalog had
("realm is creative, technical, business, service, education, or personal",
`definitions/ontology-write.ts:767` vs `mutationToolCatalog.ts:936-941`), leaving a regex
`^project\.[a-z_]+\.[a-z_]+` and no example. 459 B of the 2,383 B schema is the two dead arrays.

### 6.3 `update_onto_document` advertises `merge_llm` three times while rejecting it

`content`: "Required when update_strategy is append or merge_llm"; `merge_instructions`: "Used with
append/merge_llm"; `update_strategy` override: "This tool does not support merge_llm"
(evidence/lane-B-top8-schemas.txt). `merge_instructions` has no reviewed consumer on the worker path
(the gateway only sees replace/append) yet is a reviewed argument (`mutationToolCatalog.ts:270`). A weak
model reads three mentions of a mode and one denial; when it tries the mode, the normalizer throws
`mutation_arguments_not_admitted` (`mutation-argument-normalizers.ts:107-115`). Trim measured: −436 B.

### 6.4 Calendar: five addressing knobs and a second date convention

`create/update/delete_calendar_event`, `get_calendar_event_details`, `list_calendar_events` each carry
`calendar_scope` (enum), `calendar_id`, `calendar_source_id`, `project_id`, and (writes) `sync_to_calendar`.
`calendar_scope` is derivable — the port defaults it from `project_id` presence
(`tools/calendar-write-port.ts:317`); `calendar_id`'s own sibling says "Prefer [calendar_source_id] over
calendar_id". Task tools teach one date rule ("YYYY-MM-DD for day-level intent ... never convert a date
to a timestamp yourself", `definitions/ontology-write.ts:97-105`); calendar tools teach another ("ISO 8601. Include timezone offset or Z unless timezone is provided"). Dropping `calendar_scope`,
`calendar_id`, `sync_to_calendar` from the five tools measures −1,486 B on both surfaces with no lost
capability (`calendar_source_id` + `project_id` still address every case the port handles).

### 6.5 Task tools

- `update_onto_task.project_id` is described as "used for assignee handle resolution", is a reviewed
  argument (`mutationToolCatalog.ts:466`), and is deleted unconditionally by `drop_scope_only_project_id`
  before the gateway sees it (`mutation-argument-normalizers.ts:167-169`). The description is false on
  this host.
- `create_onto_task.type_key` says "Task type key." with default `task.default` and pattern `^task\.`;
  `update_onto_task.type_key` says "Work mode taxonomy: task.{work_mode}[.{specialization}]. Modes:
  execute, create, refine, research, review, coordinate, admin, plan." Two vocabularies for one column.
- 14 optional parameters on each; `parent` is a nested object (`kind`, `id`, `is_primary`) kept after
  `parents`/`connections` were dropped for having zero recorded use (`definitions/ontology-write.ts:82-96`).
  No evidence either way for `parent`, `plan_id`, `assignee_actor_ids` in the artifacts; the same audit
  that removed `parents` should be re-run for them.
- Free-text conventions a weak model must get right: priority word→integer mapping (in description,
  good), `calendar_sync: 'none'` trigger words (in description, good), the date rule (good),
  `props.duration_minutes` (good in the task tool, absent from the contract schema — see §4).

### 6.6 Smaller inconsistencies

- `link_onto_entities` `src_kind`/`dst_kind` descriptions list `project` (catalog text) while the
  override enum excludes it (`mutationToolCatalog.ts:337-346`). `rel` is required but the resolver
  defaults it from the kind pair (`packages/shared-agent-ops/src/ontology/edge-relationship-resolver.ts:31-120`).
- `explore_project.types` enum has `event`; `search_all_projects.types` and `search_project.types` do not.
- `shared-read-dispatch.ts:88-91` still says "The four calendar writes and set_project_calendar stay on
  the web executor and remain worker-unavailable" — false since 09-04.
- `search_buildos` survives as an alias in the read registry and metadata (`shared-read-dispatch.ts:72`,
  `metadata.ts:36`) against the one-name rule in `surfaces.ts:184-187`.

---

## 7. Leanest surface per context (capability-preserving)

Measured with evidence/lane-B-lean-proposal.mjs (transforms applied to the worker-projected opening pass):

| Change                                                                                            |                       global |                     project |        project_create |
| ------------------------------------------------------------------------------------------------- | ---------------------------: | --------------------------: | --------------------: |
| drop `delegate_task` (cannot succeed off a focused project)                                       |                       −1,805 |                           — |                     — |
| mount `cancel_turn_contract` only with a pending contract                                         |                         −420 |                        −420 |                  −420 |
| drop `get_workspace_overview` on the focused surface                                              |                            — |                        −412 |                     — |
| `create_onto_project`: drop the two empty arrays                                                  |                         −459 |                           — |                  −459 |
| `update_onto_task`: drop `project_id`, drop the contract sentence                                 |                         −333 |                        −333 |                     — |
| `update_onto_document`: drop `merge_instructions`, fix merge_llm text, drop the contract sentence |                            — |                        −436 |                     — |
| `link_onto_entities`: drop the contract sentence, fix kind text                                   |                            — |                        −113 |                     — |
| calendar ×5: drop `calendar_scope`, `calendar_id`, `sync_to_calendar`                             |                       −1,486 |                      −1,486 |                     — |
| **Opening pass**                                                                                  | **28,350 → 23,845 B (−16%)** | **34,425 → 31,223 B (−9%)** | **12,377 → 11,497 B** |

Everything a user can reach today stays reachable. The `declare_turn_contract` label trim (§4) is not
counted above because it changes what one contract can express (decision for DJ); it would remove a
further ~1,200 B from the gate pass and 11 rejection rules.

Optional, decision-level: gate the five calendar tools per user on a connected Google calendar the way
Gmail is gated (A8). Measured: global 28,350 → 18,589 B (−34%), project 34,425 → 24,948 B (−28%) for
users without a calendar. Caveat: BuildOS events exist without Google (`create_calendar_event`: "Create an
ontology calendar event and optionally sync it"), so this removes native-event capability for
un-connected users; it is a product call, not a cleanup.

Adding the §5.2 writes to the project surface (+~3.6 KB) still lands below today's 34,425 B after the
trims above.

---

## 8. What is right and must not be undone

- One surface per context, chosen without reading the message (`surfaces.ts:221-233`); the immutable
  per-turn artifact and the fail-closed worker projection (`tool-surface.ts:146-194`).
- The worker narrowing of mutation schemas to `reviewedArgumentNames` and the argument fence at the
  adapter boundary (`mutationAdapterBoundary.ts:74-83`) — the reason a weak model cannot smuggle a
  compound field into a write.
- The table-driven mutation catalog with named normalizers/receipts instead of per-tool adapter classes
  (`mutationToolCatalog.ts:48-58`); the drift audits that throw at import time
  (`worker-tool-policy.ts:112-132`, `mutationToolCatalog.ts:1234-1262`).
- Point-of-use guidance in descriptions: the priority word map, the `calendar_sync: none` triggers, the
  date rule, `props.duration_minutes`, and `move_document_in_tree`'s `new_parent_title` grouping path.
- The deferred contract on the opening pass and the sidecar-only-on-write-passes rule
  (`tool-surface.ts:129-144, 196-214`).
- The per-user Gmail gating pattern (`email-surface-mount.server.ts`) — the right shape, wrong predicate
  for the connect tool.
- The permissive `rel` resolver (`edge-relationship-resolver.ts`) — invented relationship names degrade to
  a sensible default instead of failing.
- The improved missing-parameter error that carries the property description
  (`tool-validation.ts:343-360`).
- The surface budget ratchet test and its "never advertise an unmounted tool" check
  (`agenticChatWorkerSurfaceBudget.test.ts`) — extend it to the opening pass rather than remove it.

---

## 9. Findings index

| ID  | Sev | Kind                         | Title                                                                                                 |
| --- | --- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| B1  | P1  | bug / delete                 | `delegate_task` is mounted on `global` but can never succeed there                                    |
| B2  | P1  | prompt_quality / simplify    | Contract symbolic-label sub-schema drives most weak-model contract failures, has no observed use      |
| B3  | P1  | capability_gap / add         | Project surface cannot update the project or create goals/milestones/risks; prompt coaches toward it  |
| B4  | P1  | prompt_quality / prompt_edit | Three opening-pass tool descriptions order a tool that is deferred off that pass                      |
| B5  | P2  | overengineering / delete     | Discovery + materialization machinery is dead on the only host; one env flag refuses every turn       |
| B6  | P2  | overengineering / delete     | `declare_read_only_turn` mounted on all surfaces and stripped at four sites                           |
| B7  | P2  | tool_design / schema_edit    | `create_onto_project` requires two arrays that must be empty; realm vocabulary lost in override       |
| B8  | P2  | tool_design / schema_edit    | `update_onto_document` advertises `merge_llm` ×3 and a dead `merge_instructions` param                |
| B9  | P2  | tool_design / schema_edit    | Calendar tools carry three derivable/superseded addressing knobs across five schemas                  |
| B10 | P2  | bug / code_change            | `strip_calendar_attendees_and_reminders` is unreachable; attendees hard-fail instead of degrading     |
| B11 | P2  | capability_gap / config      | Gmail connect handoff is mounted only for users already connected                                     |
| B12 | P2  | overengineering / simplify   | 25 always-true capability flags and five overlapping read/write classifiers                           |
| B13 | P3  | tool_design / prompt_edit    | `list_onto_tasks` undersells its payload and nudges N+1 reads; `update_onto_task.project_id` is a lie |
| B14 | P3  | cost / config                | `cancel_turn_contract` rides every turn; only meaningful with a pending contract                      |
| B15 | P3  | prompt_quality / prompt_edit | Stale comments and mismatched enums/vocabularies across sibling tools                                 |
| B16 | P3  | eval_gap / eval              | Guard tests check `admitted` not `opening`, and never execute a mounted tool in its own context       |

---

## Appendix: evidence files

- `evidence/lane-B-measure-catalog.mjs` → `lane-B-catalog-bytes.txt` — per-tool bytes for the catalog surfaces and the full vocabulary.
- `evidence/lane-B-worker-surface.mjs` → `lane-B-worker-projected-bytes.txt` — replica of web strip + worker projection + contract deferral; opening/admitted bytes per profile, with and without the email group.
- `evidence/lane-B-lean-proposal.mjs` → `lane-B-lean-proposal-bytes.txt` — §7 transforms and their measured savings.
- `evidence/lane-B-dump-top8.mjs` → `lane-B-top8-schemas.txt` — worker-projected schemas of the eight most-used tools, property by property.
- `evidence/lane-B-reviewed-vs-catalog.mjs` → `lane-B-reviewed-vs-catalog.txt` — per-spec catalog vs reviewed property sets; unmounted specs; unmounted reads.
- `evidence/lane-B-battery-tool-calls.cjs` → `lane-B-battery-tool-calls.txt` — tool call outcomes and failure messages across the four battery `*runs.json` artifacts.
