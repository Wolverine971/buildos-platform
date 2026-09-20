<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/receipts/WP-B-tool-surface.md -->

# WP B-tool-surface — receipt (2026-09-10)

Package: `B-tool-surface` from `evidence/work-packages.json`. Findings F25, F28, F30, F35, F29, F37,
F33, F02 (this package's part), F117 (worker side, report-only).

Files edited (all inside the ownership list, all left unstaged):

- `packages/agentic-chat-runtime/src/catalog/surfaces.ts`
- `packages/agentic-chat-runtime/src/catalog/surfaces.test.ts`
- `packages/agentic-chat-runtime/src/catalog/definitions/email.ts`
- `packages/agentic-chat-runtime/src/catalog/definitions/ontology-read.ts`
- `packages/agentic-chat-runtime/src/catalog/definitions/ontology-write.ts`
- `packages/agentic-chat-runtime/src/worker-tool-policy.ts` (comment only)
- `apps/worker/src/workers/agentic-chat/mutationToolCatalog.ts`
- `apps/worker/src/workers/agentic-chat/createOntoProjectMutationAdapter.ts`
- `apps/worker/src/workers/agentic-chat/mutation-argument-normalizers.ts` (comment only)

`tableMutationAdapter.ts` was read and left unchanged (see F117).

## Per finding

### F25 — `delegate_task` mounted on `global` but can never succeed there — FIXED (option a, per the note)

- `surfaces.ts`: removed `delegate_task` from `GLOBAL_DIRECT_TOOL_NAMES`; added it explicitly to
  `PROJECT_DIRECT_TOOL_NAMES` (after `link_onto_entities`). Comments updated on both lists.
- `mutationToolCatalog.ts` `delegate_task.descriptionOverride`: added the one restraint sentence the
  note asked for, lifted from the review-delegation rules being deleted by F01: "Only delegate when
  the user asks for background or review-staged work; answer questions and brainstorming directly."
  The `project_id` text "Exact focused project UUID" is now true everywhere the tool is mounted.
- `surfaces.test.ts`: global pinned list drops `delegate_task`; project pinned list adds it; new test
  `mounts delegate_task only where its adapter can succeed`.
- Measured effect (worker surface budget test, stderr): global opening pass 31,085 B → **26,967 B**
  (−4.1 KB, 24 → 23 tools); project opening 34,771 B (cap 36,000 still holds).
- Verifier's "ontology context branch" item is in `mutationAdapterBoundary.ts:98` (not owned) — see
  Handoffs.

### F28 — `declare_read_only_turn` mounted everywhere and stripped at four sites — FIXED (verifier's version)

- `surfaces.ts`: removed the name from `GLOBAL_DIRECT_TOOL_NAMES` and
  `PROJECT_CREATE_DIRECT_TOOL_NAMES` (project derives from global). The definition stays in
  `GATEWAY_TOOL_DEFINITION_MAP` so the reviewer lane (`turn-phase.ts` builds its own copy from
  `DECLARE_READ_ONLY_TURN_TOOL_DEFINITION`) and any already-prepared artifact still resolve it.
- `worker-tool-policy.ts:81` strip **kept** as the verifier specified (already-prepared artifacts that
  still list the name are filtered, not refused as `capability_unavailable`); comment updated.
- `surfaces.test.ts:36` expectation updated (`CONTROL_TOOL_NAMES` is now three names); new test
  `mounts the retired read-only control on no static surface` pins both the absence and the
  on-demand resolvability.
- The two artifact-side strips at `tool-surface.ts:94` and `:163` (now dead once no new artifact
  carries the name) and the standard-control strip at `:185` that the reviewer still needs are outside
  this package — see Handoffs. Reviewer hardening (SHA-bound approvals, fail-closed clarification) is
  untouched.

### F30 — `update_onto_document` advertises `merge_llm` and a dead `merge_instructions` — FIXED (verifier's worker-only version)

- `mutationToolCatalog.ts` `update_onto_document`: `merge_instructions` removed from
  `reviewedArgumentNames`; new `propertyOverrides.content` ("Required when update_strategy is
  append"); `update_strategy` description now names only replace/append (the "does not support
  merge_llm" denial is gone too — with the enum restricted and no other mention, the denial only
  advertised the mode).
- The shared base definition in `ontology-write.ts` is untouched (web executor and MCP callers still
  run a real `merge_llm`).
- `reject_merge_llm_update_strategy` normalizer kept as the fail-closed second lock
  (`agenticChatTableMutationAdapter.test.ts` stays green: 3 files / 122 tests passed).
- The pinned reviewed-field list at `apps/worker/tests/agenticChatTurnProvider.test.ts:4252-4262`
  now fails by exactly `merge_instructions` — not owned, see Handoffs.

### F35 — `list_onto_tasks` undersells its payload; `update_onto_task.project_id` text is wrong — FIXED (description half)

- `ontology-read.ts:28`: `list_onto_tasks` description now lists the real fields (id, project_id,
  project_name, title, description, type_key, state_key, priority, start_at, due_at, completed_at,
  props), the newest-updated-first order, that the result carries the exact `total` (raise `limit`
  or filter when it exceeds the rows returned), and that only assignees and linked plans/goals/
  milestones/documents need `get_onto_task_details` (verified against
  `tools/ontology-task-detail.ts`). +303 B; `get_onto_task_details` is mounted on every profile that
  mounts `list_onto_tasks`, so the "never name an unmounted tool" guard holds.
- `ontology-write.ts:1039` (source text) and a new `propertyOverrides.project_id` on
  `update_onto_task` in `mutationToolCatalog.ts`: "Optional project UUID of the task; must match the
  admitted turn context. Not needed for assignee handles, which resolve against the task's own
  project." `project_id` stays a reviewed argument (it is the scope fence `resolveProjectFence`
  reads; test coverage kept).
- `mutation-argument-normalizers.ts` `drop_scope_only_project_id` comment corrected to say the same.
- NOT done: the payload message at `tools/ontology-reads.ts:835` ("Found N ontology tasks. Use
  get_onto_task_details for full information.") — outside ownership, see Handoffs. The optional
  `order: 'due_at'` / `due_before` parameter was not added (additive, larger decision; the
  description now surfaces `total` so the model can see truncation).

### F29 — `create_onto_project` requires two arrays that must be empty; realm vocabulary lost — FIXED with one deliberate deviation

- `mutationToolCatalog.ts` `create_onto_project`: `requiredNames` is now `['project']`; the
  "Pass empty entities and relationships arrays" sentence is gone from the description; the
  `type_key` override restores the realm list plus one example
  ("project.{realm}.{domain}[.{variant}]; realm is creative, technical, business, service,
  education, or personal, e.g. project.technical.software").
- `createOntoProjectMutationAdapter.ts` `normalizeProjectShell`: a missing (or null) `entities` /
  `relationships` now defaults to `[]`; a populated one is still refused with
  `mutation_arguments_not_admitted`. The boundary tolerates the arrays because they remain in
  `reviewedArgumentNames`.
- **Deviation from the verifier's "drop them from the projected schema":** the worker runs the
  runtime's `validateToolCalls` on every completed call (`provider/validation.ts:41`), whose
  `validateDirectOpArgs` → `validateProjectCreateArgs` (`loop/project-create-args.ts:389-403`)
  rejects a _missing_ `entities`/`relationships` with "Missing required parameter". Dropping the
  properties from the schema would therefore make every schema-conforming call fail validation and
  cost a repair pass — worse than today. `applySchemaDefaults` (`loop/tool-validation.ts:315`) fills
  top-level `default`s before that validator runs, so the two properties stay in the projection as
  **optional, `default: []`, `maxItems: 0`**, with one-line "Omit." descriptions (−52 B / −18 B
  each versus before, −27 B for `required`). Net for the projected tool: −41 B; the realm example
  adds +102 B. Once the shared validator defaults the arrays (Handoffs), the two properties can be
  deleted from the projection entirely.
- Shared validator untouched, as instructed. `agenticChatCreateOntoProjectMutationAdapter.test.ts`
  passes (7/7) — it still sends `[]`, which remains accepted. A regression test for the
  missing-array input belongs in that (unowned) file — exact text in Handoffs.

### F37 — stale comments and mismatched enums across sibling tools — FIXED (safe subset in owned files)

- `mutationToolCatalog.ts` `link_onto_entities.propertyOverrides.src_kind/dst_kind`: added
  `description` so the merged text no longer lists `project` (matches the enum). `rel` left
  required, types enums left alone, `search_buildos` left alone — as the verifier said.
- `ontology-write.ts:39-44` `create_onto_task.type_key`: now the same work-mode taxonomy text as
  `update_onto_task` ("Work mode taxonomy: task.{work_mode}[.{specialization}]. Modes: execute,
  create, refine, research, review, coordinate, admin, plan. Omit when unsure; the default is
  task.default."), keeping `default: 'task.default'` and the `^task\.` pattern.
- `mutation-argument-normalizers.ts` `drop_scope_only_project_id` comment corrected.
- The two stale comments in unowned files (`review/decision-handling.ts:223-226`,
  `tools/shared-read-dispatch.ts:92-93`) — see Handoffs.

### F33 — Gmail connect handoff mounted only for already-connected users — FIXED on the catalog side; one-line web change handed off

- `surfaces.ts`: the email group is split into `GATEWAY_EMAIL_CONNECTED_SURFACE_TOOL_NAMES` (the
  four read tools: `get_external_account_status`, `list_email_accounts`, `search_email_messages`,
  `get_email_message`) and `GATEWAY_EMAIL_UNCONNECTED_SURFACE_TOOL_NAMES`
  (`request_email_account_connection` only, 743 B), with
  `getGatewayEmailSurfaceToolNames(hasConnection)` selecting by state. The union
  `GATEWAY_EMAIL_SURFACE_TOOL_NAMES` is kept for policy/vocabulary checks. Both prepare
  (`worker-turn-preparation.server.ts:398`) and prewarm go through the same `applyEmailSurfaceMount`,
  so the harness sha stays in lockstep once that function selects through the helper (Handoffs).
- `email.ts` `request_email_account_connection` description rewritten: it no longer says "Call
  get_external_account_status first" (that tool is not on the same surface any more, which the
  per-profile description guard would flag) and now tells a weak model the two-call confirmation
  flow explicitly.
- `surfaces.test.ts`: new test `selects the email group by mailbox state`; the "never name a tool
  that is not mounted on the same worker-visible profile" guard now checks three shapes per profile
  (bare, +email_connected, +email_unconnected).
- Trade accepted per the verifier: connected users lose the in-chat handoff for a second account
  (743 B saved per connected turn); un-connected users pay +743 B per turn for a handoff that
  works.

### F02 (this package's part) — three opening-pass overrides said "otherwise declare_turn_contract first" — FIXED

- `mutationToolCatalog.ts` `update_onto_task`, `update_onto_document`, `link_onto_entities`
  `descriptionOverride`: the sentence now ends "…; the worker routes a target it did not resolve
  this turn to review." The direct-call conditions are unchanged and match `write-routing.ts`.
- Deliberately left alone: the six overrides on tools that ride no static surface
  (`create_task_document`, `tag_onto_entity`, `update_onto_goal/plan/milestone/risk`) still end with
  the old sentence; the note narrowed this finding to the three that ride the opening pass.
- Restraint canary ("keeps an update chosen from three plausible tasks on the contract route") —
  run alone, passes.

### F117 (worker side) — write receipts render instants in UTC — REPORT ONLY (nothing in owned files formats receipt dates)

Receipts built in `tableMutationAdapter.ts` / `mutation-argument-normalizers.ts` /
`createOntoProjectMutationAdapter.ts` pass the gateway rows through unchanged; the only date code in
owned files (`normalizeLegacyDate`, `normalizeProjectDate`) formats _arguments_, not receipts.
Projecting inside the adapters would also alter the durable effect-ledger receipt (the read path
deliberately projects at the dispatch boundary, not at storage). The correct site is the
model-visible boundary in `turn-executor.ts` — exact change in Handoffs.

## Tests run

All `pnpm --filter <pkg> exec vitest run <files>`, one command at a time, no suite runs.

| Command                                                                                                                                                                      | Result                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@buildos/agentic-chat-runtime` `src/catalog/surfaces.test.ts`                                                                                                               | 15/15 pass (3 new tests)                                                                                                                                                                                                                                                                                                                 |
| `@buildos/agentic-chat-runtime` `src/worker-tool-policy.test.ts src/catalog/registry.test.ts src/catalog/definitions/ontology-write.test.ts src/catalog/portability.test.ts` | 15/15 pass                                                                                                                                                                                                                                                                                                                               |
| `@buildos/worker` `tests/agenticChatCreateOntoProjectMutationAdapter.test.ts`                                                                                                | 7/7 pass                                                                                                                                                                                                                                                                                                                                 |
| `@buildos/worker` `tests/agenticChatWorkerSurfaceBudget.test.ts tests/agenticChatMutationSurfacePolicy.test.ts tests/agenticChatCatalogPolicy.test.ts`                       | 17 pass, **2 expected fails** in the unowned budget test: project admitted 39,126 B > 39,000 cap (delegate_task moved onto project; project_create would also read 12,500 B > 12,400 on the next line — it was ~12,377 B before, +123 B from the realm example and work-mode text); and the pinned "delegate_task on global" expectation |
| `@buildos/worker` `tests/agenticChatTableMutationAdapter.test.ts tests/agenticChatDelegateTaskMutationAdapter.test.ts tests/agenticChatDocumentContractFields.test.ts`       | 122 pass; 4 fails in `agenticChatDocumentContractFields.test.ts`, all `project_id` contract-field cases caused by another session's uncommitted `loop/turn-contract.ts` change (`SCOPE_FIELD = 'project_id'` filtering, F07) — not this package                                                                                          |
| `@buildos/worker` `tests/agenticChatTurnProvider.test.ts`                                                                                                                    | 107 pass; 7 fails: 1 is this package (pinned `merge_instructions` at :4252-4262, then `create_onto_project` `required` at ~:4598), 6 are other sessions' in-flight changes (contract `changes` normalization in `loop/turn-contract.ts`; provider `order` route pin in `provider/openrouter-client.ts`)                                  |
| `@buildos/worker` `tests/agenticChatTurnProvider.test.ts -t 'three plausible'` (restraint canary)                                                                            | 1/1 pass                                                                                                                                                                                                                                                                                                                                 |
| `@buildos/worker` `tests/agenticChatWriteRouting.test.ts tests/agenticChatMutationAdapterRouter.test.ts tests/agenticChatReviewedTurnContract.test.ts`                       | 50/50 pass                                                                                                                                                                                                                                                                                                                               |

Not run: web tests and typecheck (integration agent), the catalog fitness snapshot (unowned, see
Handoffs).

## Handoffs (exact changes in files this package does not own)

1. `apps/worker/tests/agenticChatWorkerSurfaceBudget.test.ts`
    - `:133` ratchet `project.admittedBytes` cap 39_000 → 40_000 and `:134` `projectCreate` 12_400 →
      12_700, with a dated comment: "2026-09-10 (harness audit F25/F29/F35/F37): delegate_task moved
      from global to project (global opening 31,085 → 26,967 B; project admitted 39,126 B);
      list_onto_tasks now states its payload (+303 B); realm example and work-mode text on the
      create tools (+~270 B on project_create, measured 12,500 B)".
    - `:170-184` "keeps the whole global surface executable": remove `'delegate_task'` from the
      global list and add `expect(measure('project').opening.map(t => t.function.name)).toContain('delegate_task')`
      plus `expect(names).not.toContain('delegate_task')` for global.
2. `apps/worker/tests/agenticChatTurnProvider.test.ts`
    - `:4252-4262` `reviewedFields.update_onto_document`: delete `'merge_instructions'`.
    - The definitions builder at `~:4374-4400` iterates `fields`, so deleting the entry is enough:
      the projected property set then equals the pinned list again.
    - `~:4596-4599` `create_onto_project ... parameters.required` → `['project']`; the following
      `entities`/`relationships` `toMatchObject({ maxItems: 0 })` assertions still hold (add
      `default: []` to them if you want the F29 shape pinned).
3. `apps/worker/tests/agenticChatCreateOntoProjectMutationAdapter.test.ts` — add the F29 regression:
    ```ts
    it('defaults missing entities and relationships to empty (harness audit F29)', async () => {
    	const runGateway = vi.fn(async () => ({ ok: true, data: successData() }));
    	const adapter = new AgenticChatCreateOntoProjectMutationAdapter({} as never, {
    		runGateway: runGateway as never,
    		now: () => NOW
    	});
    	const input = mutationInput() as any;
    	delete input.arguments.entities;
    	delete input.arguments.relationships;
    	await expect(adapter.execute(input)).resolves.toMatchObject({ project_id: PROJECT_ID });
    	expect(runGateway.mock.calls[0]?.[0].args).toMatchObject({
    		entities: [],
    		relationships: []
    	});
    });
    ```
    (match the file's existing gateway-stub shape; `successData` is already defined there).
4. `apps/web/src/lib/services/agentic-chat-v2/email-surface-mount.server.ts:11-14, 79-86` (F33):
   import `getGatewayEmailSurfaceToolNames` instead of `GATEWAY_EMAIL_SURFACE_TOOL_NAMES` and make
   `applyEmailSurfaceMount` `return materializeGatewayTools(tools, getGatewayEmailSurfaceToolNames(hasConnection)).tools;`
   (no early return). Update the header comment (lines 3-8) to say the read group mounts for
   connected users and the OAuth handoff for un-connected ones. Then
   `email-surface-mount.server.test.ts:108` becomes: `applyEmailSurfaceMount(base, false)` appends
   exactly `['request_email_account_connection']`; `applyEmailSurfaceMount(base, true)` appends the
   four read tools without the handoff; idempotence check unchanged. Prewarm
   (`routes/api/agent/v2/prewarm/+server.ts`) needs no edit — it already calls the same function.
   Optional: the ~100 B prompt hint for un-connected users the verifier mentioned is not needed once
   the handoff's own description explains the flow.
5. `apps/web/src/lib/services/agentic-chat-v2/turn-preparation.test.ts:32` remove
   `'declare_read_only_turn'` from the pinned project_create list. `:145`
   (`toContain('delegate_task')`) is a project turn and still holds; optionally add a global case
   asserting `not.toContain('delegate_task')`.
   `worker-turn-preparation.test.ts:2154` (calendar/global admission) remove `'delegate_task'` from
   the `arrayContaining` list and assert `not.toContain('delegate_task')`; `:686/:737` mocks that
   list `declare_read_only_turn` are fine (they test the strip).
6. `apps/web/src/lib/services/agentic-chat/tools/core/__snapshots__/catalog-fitness.test.ts.snap`:
   re-snapshot with `pnpm --filter web exec vitest run src/lib/services/agentic-chat/tools/core/catalog-fitness.test.ts -u`
   and confirm the diff is exactly: `staticProfiles`/`contextSurfaces` lose
   `declare_read_only_turn` on all three profiles and `delegate_task` on global (gains it on
   project after `link_onto_entities`); definition SHAs change for `list_onto_tasks`,
   `create_onto_task`, `update_onto_task`, `request_email_account_connection`; `catalogSerializedSha256`
   changes. Nothing else.
7. `apps/worker/src/workers/agentic-chat/turn-executor.ts:1492-1496` (F117 worker side): before
   building `chatToolResult`, project the model-visible copy —
   `result: projectReadResultInstantsToTimezone(mutation.downstreamReceipt, timezone)` — using the
   already-exported helper from `@buildos/agentic-chat-runtime` (runtime `index.ts:27`). Get
   `timezone` by exposing the memoized `turnTimezoneFor(userId, turnRunId)`
   (`tools/execution-adapter.ts:691`, currently private) as an optional method on
   `AgenticChatReadToolPortV1` and calling `this.ports.readTool.turnTimezoneFor?.(claim.userId, claim.turnRunId)`.
   Keep `persistMutation` and the effect ledger on the unprojected receipt (durable = UTC, exactly
   like the read path projects only at dispatch). Test: a `create_onto_task` receipt with
   `due_at: '2026-09-11T00:00:00+00:00'` for a user in `America/New_York` reaches the provider as
   `2026-09-10T20:00:00-04:00`.
8. `apps/worker/src/workers/agentic-chat/mutationAdapterBoundary.ts:98` (F25 verifier item): treat
   `context.type === 'ontology'` like `'project'` (`surfaces.ts` already routes ontology → project
   and `execution-adapter.ts:408` already pairs them), so a `delegate_task` on an ontology-context
   turn that carries only `entityId` resolves its fence instead of failing
   `mutation_project_scope_mismatch`.
9. `apps/worker/src/workers/agentic-chat/provider/tool-surface.ts` (F28, another session is editing
   this file): the artifact-only strips at `:94` (`WORKER_KNOWN_ARTIFACT_ONLY_TOOL_NAMES`) and
   `:163` (`productionToolsFor`) become dead once no new artifact carries the name and can go after
   the 90 s prepared-prompt window; keep `:185` (the standard-control strip the reviewer lane relies
   on) and the `worker-tool-policy.ts:81` entry.
10. `packages/agentic-chat-runtime/src/loop/project-create-args.ts:389-403` (F29 follow-up): default
    a missing `entities`/`relationships` to `[]` instead of pushing "Missing required parameter".
    After that lands, delete the two optional properties from the `create_onto_project`
    `propertyOverrides` in `mutationToolCatalog.ts` and drop them from `reviewedArgumentNames` (the
    adapter already tolerates their absence). Also then trim the three prompt lines that still say
    "entities: [] and relationships: []": `provider/review/turn-contract.ts:371, :380`,
    `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts:135, :150`, and
    `loop/repair-instructions.ts:577-580`.
11. `packages/agentic-chat-runtime/src/tools/ontology-reads.ts:835` (F35 payload half): change the
    message to
    `` `Found ${normalized.length} of ${count ?? normalized.length} tasks (newest-updated first; raise limit or filter by project/state to see more). get_onto_task_details adds assignees and linked plans, goals, milestones, and documents.` ``
    Note `provideAgenticChatToolPayloadHostPolicy({ advertiseMaterializedTools: false })` on the
    worker (tool-surface.ts:85) may already suppress tool-name advertisement in messages — check
    `tool-payload-compaction.ts` before wording it.
12. Stale comments (F37): `provider/review/decision-handling.ts:223-226` still describes the old
    "every candidate label verbatim in the question" rule that `loop/turn-contract.ts:1022-1026`
    dropped after the 2026-09-04 retest — reword to "the host renders candidates beneath the
    question, so the question and labels share one truncation budget only for length";
    `tools/shared-read-dispatch.ts:92-93` says the calendar writes "stay on the web executor and
    remain worker-unavailable" — false since 2026-09-04; say "Calendar READS; the writes execute on
    the worker through the reviewed mutation catalog".

## Behaviour changes (user- or model-visible)

- Global turns no longer carry `delegate_task` (−4.1 KB per opening pass); project turns still do,
  now with an explicit restraint sentence.
- No surface mounts `declare_read_only_turn`; the reviewer lane still gets its own copy.
- `update_onto_document` on the worker no longer accepts `merge_instructions` (a model that sends it
  gets `mutation_arguments_not_admitted` from the boundary — same class of error as any unreviewed
  argument) and no longer mentions `merge_llm` anywhere.
- `create_onto_project` on the worker accepts a call with no `entities`/`relationships`; the
  projected schema no longer requires them.
- `list_onto_tasks` describes its real payload; `update_onto_task.project_id` and
  `create_onto_task.type_key` describe what the code does.
- `link_onto_entities` kind descriptions on the worker no longer list `project`.
- Email group by mailbox state (effective once handoff 4 lands): un-connected users get the
  743 B OAuth handoff on every turn; connected users get the four read tools and lose the handoff.
- `request_email_account_connection` description changed for every host that renders it.

## Deliberately left alone

- The six "otherwise declare_turn_contract first" overrides on tools that ride no static surface
  (note narrowed F02 to the three opening-pass tools).
- The shared `validateProjectCreateArgs` and the shared `update_onto_document` base definition
  (verifier instructions).
- `rel` required on `link_onto_entities`, the `types` enum differences, and the `search_buildos`
  alias (verifier: not defects / separate cleanup).
- The optional `due_before`/`order` parameter on `list_onto_tasks`.
- `tableMutationAdapter.ts` — no receipt formats dates there (F117 belongs at the executor boundary).
- Did not run web vitest, svelte-check, or typecheck.
