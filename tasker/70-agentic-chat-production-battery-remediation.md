<!-- tasker/70-agentic-chat-production-battery-remediation.md -->

# 70 — Agentic Chat: production battery remediation

**Created:** 2026-08-28

**Status:** Active — production correctness and efficiency follow-up

**Priority:** P0 for the four correctness failures; P1 for the two control-loop efficiency misses

## Kernel

The current production worker can execute the simple product paths and batch independent reads and
writes correctly. The breadth battery nevertheless found four user-visible correctness failures and
two paths whose safety-control loops are too expensive for normal use:

- a task reschedule can fail before worker admission because a task-title noun phrase is mistaken
  for a connected-inbox read;
- project creation publishes a context shift but does not persist it for the next turn;
- a uniquely resolved task completion can spend eight provider attempts correcting its internal
  contract, then ask the user to repair that contract instead of acting;
- an ambiguous write can end as prose without a durable clarification and can claim an unrelated
  mutation that never happened;
- project organization and a three-task update eventually produce the correct state, but only after
  repeated invalid contract/reviewer cycles, 245 seconds, 413k tokens, and nearly $0.05 combined.

Fix the deterministic transport, session, and clarification defects first. Then make contract
correction converge without weakening the semantic reviewer. Re-run the same zero-retry production
battery as the release gate.

## Relationship to recently closed work

- **Tasker 64 remains closed and deleted.** Its canonical tool-call normalization, isolated flat
  compatibility parsers, 209-diagnostic reduction, and focused/live contract verification are
  complete. This battery found no canonical-versus-flat tool-call defect and does not reopen it.
- **Tasker 69 remains closed for its exact release gate.** Production release
  `8f30ae511e625bc7146ae20a24d0fddfe0fc3817` correctly admits “email the beta list” and still
  renegotiates genuine connected-inbox reads. This battery found a neighboring classifier hole:
  “beta list email thing” lets the noun `list` govern `email` in the current regex. Tasker 70 owns
  the generalized phrase-level regression.
- **Taskers 55, 56, and 58 remain closed.** The current findings are not the obsolete organize
  assertion, the original reviewer ambiguity rule, or provider argument parser/truncation defects.
  They are new production evidence about contract-shape convergence, durable clarification, and
  flow completion.
- **Tasker 67 keeps read-planning ownership.** Its current three-document replay passed 3/3 with
  zero exact duplicate reads. Tasker 70 owns the non-read failures and control-loop cost exposed by
  the wider battery; it should not grow a global stop-and-batch prompt from this evidence.

## Production test conditions

Both runs used the opt-in Agentic Chat API/runtime E2E harness against production with hard
telemetry and **zero harness retries**. The worker was healthy before and after the battery and
reported release:

`8f30ae511e625bc7146ae20a24d0fddfe0fc3817`

The reproducible lane is:

```bash
AGENTIC_E2E_BASE_URL=<production-url> \
AGENTIC_E2E_EXECUTION_MODE=worker_realtime \
AGENTIC_ASSERT_TELEMETRY=true \
AGENTIC_E2E_RETRY_COUNT=0 \
AGENTIC_SCENARIOS=<comma-separated-scenarios> \
pnpm --filter @buildos/web test:agentic
```

No automatic retry converted a model or product failure into a pass. The breadth battery's harness
run key began `022c791b-481`; a post-run service-role query found **zero** remaining harness
projects for that run.

The breadth selection was:

```text
document-create,project-organize,task-create,task-complete-cold-reference,restraint-noop-and-ambiguity,task-reschedule-cold-reference,task-multi-update,project-create-contract,read-default-global-status
```

The read baseline selected only `tool-graph-parallel-reads` and ran three independent repetitions.

## Baseline A — current read fixture

The `tool-graph-parallel-reads` fixture ran three times. All three passed grounding, no-mutation,
stream, and durable-terminal assertions.

| Turn / stream                                                                   | Durable time | Evidence calls and rounds | Provider attempts | Tokens |        Cost |
| ------------------------------------------------------------------------------- | -----------: | ------------------------- | ----------------: | -----: | ----------: |
| `518658e1-a882-4a34-b3d8-ed0d614dd7f1` / `8a059051-bb3d-4373-83dc-70f9ae6ef1b8` |      25.479s | 6 in `[3,3]`              |                 3 | 37,382 | $0.00166419 |
| `b6c72040-8eac-40b6-8bcf-a651fa0d16aa` / `ed132fa7-96f4-4726-8f34-18958f663abe` |      18.284s | 6 in `[3,3]`              |                 3 | 37,356 | $0.00116239 |
| `029f102b-db61-403b-8aaf-d6b828cf060f` / `38cf5a93-8ded-4993-aaa6-fd7ab519315e` |      23.014s | 6 in `[3,3]`              |                 3 | 37,145 | $0.00114331 |

Each turn emitted three distinct `get_document_outline` calls, then three distinct
`read_document_section` calls after the required heading anchors became available, then final
prose. Across all 18 calls there were zero exact duplicates, memo hits, tool failures, or
control/reviewer calls. The deployed model was `deepseek/deepseek-v4-flash` through DeepInfra.

**Conclusion:** current production already batches every independent read in this fixture. The
outline-to-section step is a real tool dependency, not forgotten turn memory. Do not treat the
breadth battery's control/reviewer calls as evidence-read planning failures.

## Baseline B — nine-scenario production battery

The second run exercised nine scenarios, attempted ten turns, admitted nine, and completed in
503.71 seconds wall time. Five scenarios passed and four failed. The nine admitted turns consumed
663,014 raw tokens and $0.07851217.

| Scenario                         | Result                                                | Durable turn time | Calls / tool rounds | Provider attempts |  Tokens |        Cost |
| -------------------------------- | ----------------------------------------------------- | ----------------: | ------------------: | ----------------: | ------: | ----------: |
| `document-create`                | Pass                                                  |           13.861s |               1 / 1 |                 2 |  15,760 | $0.00175248 |
| `project-organize`               | Pass; severe efficiency miss                          |          175.010s |             29 / 12 |                14 | 276,383 | $0.03009851 |
| `task-create`                    | Pass                                                  |           16.144s |               2 / 2 |                 3 |  29,726 | $0.00184126 |
| `task-complete-cold-reference`   | Fail; unnecessary clarification, no mutation          |           64.934s |               6 / 6 |                 8 | 102,960 | $0.01536059 |
| `restraint-noop-and-ambiguity`   | Fail on turn 2; no durable clarification              |  22.548s combined |               1 / 1 |        3 combined |  33,881 | $0.00182202 |
| `task-reschedule-cold-reference` | Fail before worker admission                          |                 — |                   — |                 — |       — |           — |
| `task-multi-update`              | Pass; severe control-loop cost                        |           69.538s |              10 / 8 |                10 | 136,933 | $0.01788670 |
| `project-create-contract`        | Domain create passed; flow failed after context shift |           72.306s |              10 / 7 |                 8 |  58,711 | $0.00923635 |
| `read-default-global-status`     | Pass                                                  |            6.357s |               1 / 1 |                 2 |   8,660 | $0.00051426 |

Across the breadth battery's 17 evidence reads there were zero exact duplicates and zero memo hits.
The six project-document outlines ran together, as did the six dependent section reads. No
scenario reproduced independent sibling reads serialized one per provider round.

## Exact scenario receipts and findings

### 1. `document-create` — healthy direct mutation

- Turn `5ec0a244-3bba-4a13-82aa-0be017c72fff`; stream
  `3a807b43-52fc-42a7-9261-c9a961ae2589`.
- One `create_onto_document` call in one tool round; two provider attempts.
- The stored document satisfied the fixture's structural and content assertions.

Keep this as a fast-path regression control. It demonstrates that a direct, fully specified create
does not inherently require contract/reviewer overhead.

### 2. `project-organize` — correct output, non-viable control loop

- Turn `64d1d566-379f-4eb6-b034-b21f32e2d92d`; stream
  `3811c243-209d-4763-884a-faf8ba5cf422`.
- Read path: one project tree, six outlines in one batch, six sections in one batch, and one project
  details read. There were no exact duplicate reads.
- Control path: three `declare_turn_contract` calls. The first two failed validation because three
  labelled container creates omitted their title changes; the third succeeded. Contract and both
  mutation batches then received reviewer approval.
- Mutation path: three `create_onto_document` calls in one batch and six
  `move_document_in_tree` calls in one batch.
- Final tree and source preservation assertions passed.
- DeepSeek handled acting passes and Luna handled reviewer passes.

The product operation is viable; the internal contract protocol is not converging. A known title
that is already represented by a labelled create must not require the acting model to rediscover
the same schema rule across two full validation cycles.

### 3. `task-create` — healthy simple read/write

- Turn `58c529ed-7b1c-4134-bb1e-11eb5403d8d0`; stream
  `f86fd6de-d04b-40f6-8aa3-4b11e7394547`.
- One `get_project_overview`, then one `create_onto_task`; three provider attempts.
- The task had the exact requested due date and priority. No contract or reviewer ran.

The overview may be avoidable when the focused project is already sufficient, but it is neither a
duplicate nor a correctness problem. Preserve this path while repairing the complex routes.

### 4. `task-complete-cold-reference` — uniquely resolved work returned to the user

- Turn `ad0e5aeb-ee60-4ce1-b159-411f84e17810`; stream
  `301bff1f-6010-4e71-b018-f8779dbf5975`.
- Calls: contract declaration, reviewer revision, corrected declaration, reviewer revision, third
  declaration, and `request_turn_clarification`; no mutation.
- The first reviewer correctly rejected an uncommissioned resume-task change and named the exact
  Northwind outcome set.
- The acting model then omitted `required_fields` twice. The final reviewer path asked the user to
  provide a corrected internal contract even though the target, completion, stated outcome, and
  next step were already present in the turn record.

This is not genuine ambiguity. The system resolved the target and the reviewer possessed the exact
correction. Internal schema repair must stay inside the agent loop and must have a bounded,
deterministic convergence path.

### 5. `restraint-noop-and-ambiguity` — safe no-op, unsafe finalization

- Turn 1: `bc55fe60-1ae4-4d19-b10c-e6dd44e5d8c0`; stream
  `447dc1cd-52d0-4491-b1cf-1748cc3cf690`; 18.515s, one `list_onto_tasks`, 22,140 tokens,
  $0.00125813. It correctly made no
  mutation for a passing mention.
- Turn 2: `84f6ac74-39ae-418d-a456-489e8fd0923d`; stream
  `656ae980-f03d-4f41-97cf-b2a2814328f9`; 4.033s, zero tools, 11,741 tokens, $0.00056389.
- The second turn asked a human-readable ambiguity question but did not call
  `request_turn_clarification`, so the session has no durable pending clarification.
- Its prose said, “Got it — marking the usage-based pricing migration done,” even though the user
  said “the email one” and no mutation ran.

Writing nothing was necessary but insufficient. A commissioned write with unresolved candidate
identity must finish through the durable clarification control, list the plausible candidates, and
never claim an effect that has no succeeded mutation receipt.

### 6. `task-reschedule-cold-reference` — deterministic false renegotiation

- The exact prompt was: “push the beta list email thing to friday, i'm not gonna get to it before
  then”.
- The web returned HTTP 409 `TRANSPORT_RENEGOTIATE` with “This turn requires the legacy tool
  surface.” No worker turn was admitted, so there is no durable model cost.
- `looksLikeExternalEmailReadTurn` in
  `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts` recognizes the substring
  `list email` as if the retrieval verb `list` governed an email object. Here, `list` belongs to the
  task title and `email` is an attributive noun.
- The selector then mounts legacy-only Gmail read tools; the worker's unavailable-tool gate
  correctly renegotiates. The gate must remain fail-closed—the lexical classifier feeding it is the
  defect.

The existing Tasker 69 regression “email the beta list” proves only the verb-object order. Add the
exact noun-phrase order and nearby dictated variants, while retaining positive tests for Gmail,
inbox, mailbox, accounts, and message retrieval.

### 7. `task-multi-update` — correct batch after repeated reviewer repair

- Turn `952b2ab2-20d9-4696-ba84-36613f44d77d`; stream
  `4d098b46-b1a2-4b53-8e80-26ea886c96ca`.
- There were no discovery reads. The seeded tasks were already available.
- Two complete contract revision cycles occurred because the acting model ignored the reviewer's
  explicit `priority=1` required-field correction once.
- After contract approval and mutation-batch approval, all three updates executed together. The
  final database state contained exactly the three commissioned changes.

The width-three mutation graph is healthy. The cost belongs to contract serialization and
acting/reviewer handoff, not execution concurrency.

### 8. `project-create-contract` — durable project, ephemeral context shift

- Turn `e1bd0b22-e5cf-4363-ad7b-34aa98c350f7`; stream
  `7a7758d2-e36a-4a52-88ab-52a14b0fd50e`.
- One initial contract declaration failed because the project outcome incorrectly included fields
  that belong only in `create_onto_project` arguments; the corrected declaration passed.
- The worker created the exact project, goal, and three tasks. The project ID was
  `62683d3b-b76e-41e1-84fa-6ac3ebf1a1cb`.
- The stream receipt emitted the correct `context_shift` and the fixture's stream assertion passed.
- The durable `chat_sessions` row still had `context_type=project_create`, a null entity, and no
  `fastchat_last_context_shift`; therefore the fixture stopped before its project-scoped follow-up.

The source trace matches the receipt. `apps/worker/src/workers/agentic-chat/turn-executor.ts`
copies the extracted shift into terminal context and publishes a semantic event. It does not
persist the session handoff. The legacy HTTP handler has an explicit
`fastchat_last_context_shift` metadata update after extracting the same receipt. The worker path
needs an idempotent durable equivalent, with the write ordered so a terminal turn cannot advertise
a shift that the next admission cannot load.

### 9. `read-default-global-status` — healthy one-read answer

- Turn `a64cb3e8-5421-4c06-8f44-651482ff28de`; stream
  `03744243-479b-4db4-a244-78577af5a2ca`.
- One `get_workspace_overview` call in one round; two provider attempts.
- The answer and durable assertions passed.

Keep this as the read-only fast-path regression control.

## Cross-cutting research conclusions

### The read planner is not the reproduced bottleneck

Current production batched every known independent evidence call in both batteries. Across 35
observed reads—18 in the dedicated replay and 17 in the breadth run—there were zero exact duplicate
calls and zero memo hits. Additional provider passes were dependency-ordered projections or
contract/reviewer controls. This evidence argues against adding general prompt prose about batching.

### Contract corrections are expressed but not compiled

The reviewer often knows the exact repair: remove the uncommissioned outcome, add `priority=1`, add
the required fields, or include the titles for labelled creates. The acting model must nevertheless
regenerate the entire JSON contract on a later provider pass and can repeat the same omission. The
important code surfaces are:

- `packages/agentic-chat-runtime/src/catalog/definitions/controls.ts` — public control schemas;
- `packages/agentic-chat-runtime/src/loop/turn-contract.ts` — contract parsing/normalization;
- `apps/worker/src/workers/agentic-chat/provider/validation.ts` — worker contract validation;
- `apps/worker/src/workers/agentic-chat/provider/review/turn-contract.ts` and
  `review/decision-handling.ts` — reviewer correction and return-to-actor instructions;
- `apps/worker/src/workers/agentic-chat/provider/review/controls.ts` — distinction between agent
  postconditions and real missing user values.

Do not solve this by weakening the reviewer or accepting incomplete contracts. Test a typed repair
receipt or deterministic normalization at the contract boundary so exact machine-readable
corrections need not be re-inferred from prose.

### Stream correctness and session correctness have diverged

Project creation proves that emitting a correct semantic event does not guarantee the next turn
will inherit the new context. Session state is part of the mutation's user-visible outcome. The
context handoff must be persisted, replay-safe, and covered by a two-turn production fixture.

### Prose cannot be the authority for writes or clarification

The ambiguity turn showed both halves of the same problem: prose asked a question without creating
durable clarification state, then claimed a mutation without a mutation receipt. Finalization must
derive write claims and pending-user-action state from executed controls/effects, not unverified
assistant text.

### The per-turn LLM aggregate is currently misleading

`chat_turn_runs.llm_pass_count` was `0` on all nine admitted turns even though durable
`provider_attempt_started` / `provider_attempt_ended` observations showed one to fourteen provider
attempts per turn. The battery metrics above use the provider observations. Fix or retire the
aggregate before any dashboard, alert, or cost decision depends on it.

Tasker 67 owns exact read/resource identity and evidence-round attribution. Tasker 70 owns the
provider-pass aggregate and the separation of acting, review, repair, and retry attempts required
to measure these control loops.

## Implementation progress — 2026-08-28

- **WP-1 is locally implemented.** The email-read selector now treats `list` as retrieval syntax
  only at an imperative/clause boundary. The exact production reschedule prompt plus
  reschedule/move/push variants retain the ordinary project task surface and mount no Gmail tools;
  explicit Gmail, inbox, mailbox, connected-account, list-message, and “who emailed me” cases still
  mount all three legacy email reads. Selector/preparation, worker admission, and fail-closed
  unavailable-tool policy suites pass. The isolated production reschedule repetition remains the
  release proof.
- **WP-2 is locally implemented.** A service-only, generation-fenced
  `persist_agentic_chat_session_handoff` RPC atomically updates `chat_sessions.context_type`,
  `entity_id`, and the `fastchat_last_context_shift` project-focus hint without replacing unrelated
  metadata. Exact replays return the original handoff timestamp; stale generations and inaccessible
  project targets fail closed. The executor invokes this port after the durable tool ledger receipt
  and before any public `context_shift` event. Unit, type, composition, and disposable PostgreSQL
  checks cover the boundary. The two-turn production fixture remains the release proof.
- **The WP-1/WP-2 deployment is verified, but the production exit is not yet green.** Web returned
  HTTP 200, and worker `/health` reported running release
  `0f579a4b8e9222082e688d317f8e7a06abdbf230` with all 20 reviewed mutation capabilities. The
  zero-spend worker-realtime preflight passed for `task-reschedule-cold-reference` and
  `project-create-contract`. One paid, zero-retry reschedule repetition reached the worker—proving
  the noun-phrase email classifier no longer renegotiates—but failed downstream before mutation.
  Turn `d41d9e86-22ea-4175-9c39-2da5df72f166`, stream
  `0d36bd74-8901-47ce-8a36-0e2d9630a52f`, session
  `2f292b81-b484-4a42-93b6-e32310e948a7` ended `provider_tool_not_allowlisted` after six control
  calls/rounds and zero validation failures or writes. The reviewer twice returned the exact
  single-task/date correction; the acting model repeated the invalid two-task contract; the final
  reviewer pass then incorrectly declared read-only. The next acting pass proposed
  `update_onto_task` against the intentionally reduced eight-tool read-only surface, and the worker
  rejected it fail-closed. This is new WP-3 convergence evidence, not a reason to weaken the
  allowlist. The project-create paid repetition was deliberately not started after this failure.
- **WP-4 is locally implemented for the reproduced bypass.** The exact stored production candidate
  (“marking the usage-based pricing migration done” followed by a two-task choice question) now
  triggers a narrow receipt-grounded terminal gate before any prose is emitted. Unreceipted
  mutation claims and unresolved target/value questions must choose the existing semantic contract
  or durable clarification path; ordinary final prose retains its one-pass fast path. Clarification
  controls can now carry a bounded structured candidate set with stable IDs, labels, and kinds; the
  deterministic executor echoes that set in its durable result and rejects a supplied candidate set
  whose labels are absent from the user-facing question. The terminal finalization guard also
  replaces “marking ... done” when a structured mutation was requested but no write succeeded.
  Focused runtime, provider, execution-adapter, preparation, catalog, snapshot, and type checks pass.
  A holistic review on 2026-08-28 found and fixed one defect in this slice: the harness candidate
  gate sliced its assembled question to 500 characters after the fact, so long references/titles
  could drop later labels and deterministically fail the new every-label validation with no author
  to repair it. The gate now derives the question and candidate labels from one shared truncation
  budget, the executor's label failure names the exact missing labels for one-shot repair, and
  `agenticChatReviewCandidateGate.test.ts` holds the regression.
- **WP-3 typed correction is locally implemented for the newly reproduced reschedule loop.** A
  contract reviewer revision now includes a complete `corrected_contract` in the durable
  `request_proposal_revision` receipt. The worker parses that exact contract, binds its canonical
  SHA, and sends it directly through a fresh independent review instead of asking the acting model
  to regenerate full control JSON from prose. The revision itself grants no write authority; only
  the second SHA-bound approval restores mutation tools. Once a reviewer has established that the
  user commissioned a durable change by returning a correction, later review surfaces omit the
  contradictory `declare_read_only_turn` exit. The exact beta-list reschedule regression now
  reaches correction approval with one acting contract pass and two reviewer decisions. Mutation
  batch repair remains on its existing acting-model route. The broader Northwind, multi-update,
  organize, and project-create deterministic traces are still required before WP-3 is complete.
- **The WP-3/WP-4 deployment is healthy, but its first release gate failed safely.** Production
  worker `/health` reports exact release `02ef0b404aa92e81f528a2a3466a6685a4b17248`, running with
  healthy realtime, zero active turns, and all 20 provider/adapter mutation capabilities aligned;
  web returned HTTP 200. The zero-spend worker-realtime preflight for reschedule plus project-create
  passed. One paid, zero-retry reschedule then completed with no write and a durable clarification,
  so project-create was not run. Turn `bdbfc878-917b-4aca-b2b7-fd458c55460a`, stream
  `b339b7b7-c6dd-45bc-baae-267e30bdc533`, session
  `a8be355a-49d1-41b9-b72b-7cd723080dbd` took 44.2 seconds, five provider attempts, 57,344 tokens,
  and $0.00697211. The acting model first emitted a malformed repeated-ID contract, repaired it to
  one target but omitted the `due_at` change, and the semantic reviewer then returned a tool call
  the worker classified as invalid or SHA-unbound. The fail-closed reviewer fallback durably called
  `request_turn_clarification`; the final acting pass rendered a Friday-date question. There were
  zero mutation effects, zero duplicates, and zero leftover harness projects. The aggregate again
  reported zero validation failures despite the first failed contract execution; WP-6 still owns
  that telemetry defect.
- **A reviewer-contract representation follow-up is now local and not deployed.** Review prompts
  previously showed the normalized internal contract (`entityKind`, `targetIds`,
  `minimumSuccessfulEffects`) even though the advertised correction tool requires provider-form
  fields (`entity_kind`, `target_ids`, `minimum_successful_effects`). The exact raw rejected reviewer
  arguments are not retained, so this is the strongest code-supported cause rather than a recovered
  provider payload. A shared serializer now projects normalized contracts back to the exact
  declaration schema before review. Semantically valid corrections that arrive in internal form—or
  otherwise fail only the external correction schema—are reserialized and revalidated; already
  valid provider calls retain their original canonical identity so durable feedback/replay hashes do
  not drift. The exact reschedule regression now feeds the old camelCase reviewer shape and proves
  that the worker emits a valid snake_case durable correction, re-reviews it, and never returns to
  the acting model for contract regeneration. Runtime/worker typechecks and the focused 84 runtime,
  164 worker, and 34 web tests pass.

- **The representation-boundary patch is deployed, and its release gate exposed a second exact
  reviewer-schema defect.** Commit `f188cc6dfa92f75654590f5002c3b86c4e50c687` deployed as Railway
  deployment `0c00a596-b59e-40bb-b999-59830bb87050`; `/health` reported that exact release,
  healthy realtime, zero active turns, and all 20 provider/adapter mutation capabilities aligned.
  The zero-spend reschedule/project-create preflight passed. One paid, zero-retry reschedule then
  failed safely, so project-create was not run: turn `85573d6f-f1b5-457e-ab37-a15f2b4ea0b8`, stream
  `c300de2e-735a-43f2-9653-38cba6ba7fb2`, session
  `8520374f-c949-450d-9f3f-c7528e92b44c` took 30.218 seconds, five provider attempts, 54,326
  tokens, and $0.00617625. The acting model uniquely resolved the existing beta-list task but
  declared an incomplete update contract without `due_at` in `required_fields` or `changes`; the
  semantic reviewer then returned a decision the worker rejected as invalid or unbound, producing
  the durable fail-closed clarification. Trace inspection found a direct protocol contradiction:
  the reviewer prompt requires `reference_candidates` before every judgment, while the contract
  `request_proposal_revision` schema used `additionalProperties: false` and neither permitted nor
  required that field. A reviewer following the prompt on a typed correction was therefore invalid
  before the correction could be parsed.
- **The reviewer candidate-schema alignment deployed in release `3572aedbb`.** Contract revisions
  require the same bounded `reference_candidates` evidence as approvals. The deterministic
  candidate ambiguity floor now evaluates the corrected contract as well as an approved original:
  one unique candidate can proceed to typed re-review, but a correction that chooses only one of
  several plausible loaded entities becomes a structured durable clarification. This aligns the
  prompt and tool schema without weakening ambiguity safety. Worker lint/typecheck and 89 focused
  provider/candidate-gate tests pass.
- **The `3572aedbb` release gate exposed action-inapplicable fields in the live typed correction.**
  Commit `3572aedbb3f36bfdf3d9f4ce7fbce29e215f3041` deployed as Railway deployment
  `45f4271a-5d86-4461-82e4-1258c5f34929`; exact-release health and the zero-spend two-scenario
  preflight passed. The one paid, zero-retry reschedule failed safely, so project-create was not
  run. Turn `75862b79-2099-4f52-a057-5082263cf26a`, stream
  `408a57bf-d020-4e3c-a6ca-2264b9ad087b`, session
  `27129ec9-70e5-4eba-85ef-22a5622085c5` completed in 19.770 seconds with two durable control calls,
  four provider attempts, 40,486 tokens, and $0.00581243. The reviewer fallback remained
  invalid/unbound; no mutation ran and the cleanup query found zero harness projects.
- **A read-only reviewer replay recovered the rejected shape without another user-data mutation.**
  Luna correctly returned `request_proposal_revision`, the unique task candidate, and the exact
  carried-over `2026-09-04T15:00:00+00:00` date. It also filled optional `label="result"` and
  `parent_label="destination"` fields on an ordinary task update and named the durable field
  `date`. The contract parser correctly rejected the first symbolic field because labels are only
  meaningful on creates; `parent_label` is likewise valid only for move/organize, and `date` would
  not be fulfilled by `update_onto_task.due_at`. The captured replay used 9,387 tokens and cost
  $0.00068270.
- **The action-aware correction normalization is local and not yet deployed.** Before parsing and
  canonical re-review, the worker now removes only symbolic fields that the declared action can
  never consume: `label` outside creates and `parent_label` outside move/organize. The reviewer
  prompt and correction-tool description now bind moving/pushing a task, its deadline, or its due
  date to `due_at`, reserve `start_at` for explicit start requests, and prohibit a generic `date`
  field. The exact regression supplies the live placeholder fields and proves the durable corrected
  contract omits them. Worker lint/typecheck and 89 focused provider/candidate-gate tests pass.

## Review handoff — post-deploy status and next local patch

This section is the handoff for an independent review. The deployed release and current local tree
are intentionally different:

- **Deployed and health-verified:** commit `3572aedbb3f36bfdf3d9f4ce7fbce29e215f3041`
  contains WP-1/WP-2, typed reviewer correction, durable clarification/final-output gates, the
  provider/internal representation fix, and aligned candidate evidence on corrections. Its
  zero-spend realtime preflight passed; the paid reschedule exposed action-inapplicable optional
  fields in the live typed correction.
- **Local and not yet deployed:** the worker removes only action-inapplicable symbolic decorations
  before parsing a reviewer correction, then canonicalizes and independently re-reviews the result.
  Reviewer guidance maps task due-date reschedules to `due_at` and explicit starts to `start_at`. No
  database migration is involved. Do not run another paid production repetition until this patch is
  deployed.

### Kernel and intended invariants

The current work is trying to remove two unsafe control-loop escape hatches without weakening the
fail-closed tool boundary:

1. When a reviewer can state the corrected contract exactly, preserve that correction as typed
   durable data and review the corrected SHA directly. Do not make the acting model repeatedly
   reconstruct the same JSON from prose.
2. When a write was commissioned but the target/value remains ambiguous, the turn must persist a
   structured clarification. It must not exit through ordinary prose, and it must not claim a
   mutation that has no succeeded effect or mutation receipt.

The production `provider_tool_not_allowlisted` error is evidence that the existing reduced
read-only surface failed closed correctly. **Do not fix it by remounting mutation tools, weakening
the allowlist, or treating reviewer revision as write authorization.**

### Local changes to review

#### WP-3 — typed contract correction and bounded re-review

- `request_proposal_revision` has a contract-review-specific schema that requires a complete
  `corrected_contract`. Mutation-batch revisions deliberately retain their existing prose /
  acting-model repair route.
- The worker parses the corrected contract from the completed reviewer decision, stores it in the
  durable revision control result, canonicalizes it, and binds a new SHA.
- The exact corrected contract is sent to a fresh contract-review pass. The correction decision
  itself grants no mutation access; only approval of the new SHA restores the write-capable
  surface.
- After a contract reviewer returns a typed correction, subsequent review surfaces omit
  `declare_read_only_turn`. This is based on the prior structured reviewer decision establishing
  that the user commissioned a durable effect, and prevents the live contradiction where a later
  reviewer reclassified the corrected write as read-only.
- The exact beta-list reschedule regression now reaches corrected-contract approval with one
  acting contract declaration and two reviewer decisions. The exact new test stops at contract
  approval; existing typed multi-update coverage continues through batch review and execution.

Primary files:

- `apps/worker/src/workers/agentic-chat/provider/review/controls.ts`
- `apps/worker/src/workers/agentic-chat/provider/review/decision-completion.ts`
- `apps/worker/src/workers/agentic-chat/provider/review/decision-handling.ts`
- `apps/worker/src/workers/agentic-chat/provider/turn-provider.ts`
- `apps/worker/src/workers/agentic-chat/tools/execution-adapter.ts`
- `apps/worker/tests/agenticChatTurnProvider.test.ts`
- `apps/worker/tests/agenticChatToolExecutionAdapter.test.ts`

#### WP-4 — terminal semantic gate, durable candidates, and claim sanitization

- A narrow assistant-output classifier detects the reproduced terminal shapes: an unreceipted
  mutation-completion claim and an unresolved target/value choice question. It inspects assistant
  output, not user text, so it does not introduce another user-intent regex classifier.
- Only suspicious terminal prose takes the extra semantic-disposition pass. Ordinary final prose
  retains the direct one-pass path.
- A suspicious turn must choose the existing semantic contract route or
  `request_turn_clarification` before text can be emitted.
- `request_turn_clarification` now accepts an optional bounded candidate set with stable `id`,
  `label`, and `kind`. When candidates are supplied, there must be at least two and every label must
  appear in the user-facing question. The deterministic executor echoes the candidates in the
  durable control result.
- The terminal finalization guard now replaces unreceipted “marking ... done” language when the
  structured turn state says a mutation was requested but no write succeeded.
- The exact stored production response—claiming the usage-based pricing task was marked done, then
  asking which of two email tasks was intended—is a regression fixture.

Primary files:

- `packages/agentic-chat-runtime/src/loop/repair-instructions.ts`
- `packages/agentic-chat-runtime/src/loop/turn-contract.ts`
- `packages/agentic-chat-runtime/src/catalog/definitions/controls.ts`
- `packages/agentic-chat-runtime/src/supervisor/finalization-guard.ts`
- `apps/worker/src/workers/agentic-chat/provider/turn-provider.ts`
- `apps/worker/src/workers/agentic-chat/provider/review/disposition.ts`
- `apps/worker/src/workers/agentic-chat/provider/review/turn-contract.ts`
- the adjacent runtime and worker test files for those modules

### Reviewer focus and known open questions

- **Typed-correction trust boundary:** verify that a corrected contract can never inherit write
  authorization from the revision decision, that the fresh approval is bound to the corrected SHA,
  and that replay/idempotency cannot substitute approval for a different contract.
- **Read-only after revision:** verify that suppressing `declare_read_only_turn` after a structured
  contract correction is the right invariant for every path. If a legitimate post-revision
  read-only outcome exists, it needs a safe explicit representation rather than reopening the live
  contradictory exit.
- **Candidate persistence across turns:** candidates are durable in the clarification tool ledger
  and result, but this slice did not add session metadata or a new RPC. Confirm with an end-to-end
  next-turn fixture that resume history actually reloads those IDs/labels without rediscovery before
  marking the WP-4 persistence item complete.
- **Classifier scope:** the terminal gate targets the known unsafe shapes; it is not a universal
  semantic verifier. Review false positives around harmless status language and optional offer
  questions, and false negatives for other mutation-claim phrasing.
- **Optional candidate schema:** candidates remain optional for backward compatibility. Decide
  whether every ambiguity that reaches this control should require them before the WP-4 exit is
  considered complete.
- **Catalog snapshot:** the snapshot update includes the candidate schema and also records the
  current `declare_turn_contract` catalog shape that had already drifted from the checked-in
  snapshot at this HEAD. Inspect that full snapshot diff rather than assuming every changed line is
  caused by WP-4.
- **Coverage still missing:** the broader deterministic Northwind completion, three-task update,
  labelled organization-create, and project-create traces remain WP-3 work. Do not call WP-3
  complete based only on the reschedule regression.

### Verification already run

The local runtime and worker typechecks pass. The focused runtime suites for turn contracts, repair
instructions, and finalization; worker suites for the provider, execution adapter, terminal text
integrity, provider boundary, catalog policy, and OpenRouter client; and web catalog/preparation
suites all pass. Prettier checking on the touched source/tests and `git diff --check` also pass.

### Next gate after review

1. Review the narrow action-aware stripping of `label` / `parent_label` and the task schedule-field
   guidance.
2. Deploy the action-aware correction normalization.
3. Re-run the zero-spend worker-realtime preflight for `task-reschedule-cold-reference` and
   `project-create-contract`.
4. Run exactly one paid, zero-retry reschedule repetition and require one existing-task update with
   no duplicate and no allowlist failure.
5. Only if that passes, run the project-create paid repetition and verify the same-session durable
   project context before its follow-up.

## Work packages

### WP-0 — Freeze regressions before implementation

- [x] Add the exact reschedule prompt and dictated variants to
      `tool-selector` tests. Assert that the worker surface contains task tools and no Gmail reads.
- [x] Retain positive connected-inbox cases and assert they still select legacy-only Gmail reads and
      renegotiate before worker admission.
- [x] Add a two-turn project-create fixture that asserts both the public shift event and the durable
      session context before admitting the follow-up.
- [ ] Add deterministic contract traces for Northwind completion, the three-task update, labelled
      organization creates, and project creation.
- [x] Add a finalization regression: an ambiguous commissioned write cannot finish with prose only;
      no succeeded effect means no completion claim.

**Exit:** all four production correctness failures reproduce locally or in deterministic fixtures
without paid retries.

### WP-1 — Generalize email-read intent without weakening renegotiation

- Make retrieval syntax require the retrieval verb to govern an email/message object. Do not let a
  noun inside a task title accidentally act as the verb.
- Cover both task wording orders: “email the beta list” and “beta list email thing.” Include
  “reschedule/push/move the … email task” dictated variants.
- Preserve explicit Gmail, inbox, mailbox, connected-account, search/read/open/list-message, and
  “who emailed me” positives.
- Re-run the selector, turn-preparation, worker-admission, and unavailable-tool policy suites.

**Exit:** the exact reschedule reaches the worker and updates the one existing task; no duplicate
task is created. Genuine inbox reads still return `TRANSPORT_RENEGOTIATE` before durable worker
admission.

### WP-2 — Persist worker context shifts as session state

- Define one idempotent session-handoff operation for `context_type`, `entity_id`, project focus,
  and `fastchat_last_context_shift` metadata.
- Execute it after the successful project-create effect is durable and before terminal completion
  becomes externally final. Retries/replays must converge on the same session state.
- Reconcile partial failure explicitly: a published shift must not silently outrun persistence.
- Ensure the next web admission reads the project context and worker artifact from the shifted
  session without relying on UI memory.
- Cover both the semantic event and durable row; keep legacy behavior compatible until legacy
  retirement is complete.

**Exit:** `project-create-contract` completes its project-scoped follow-up in the same session, with
one project and exactly the requested child entities.

### WP-3 — Make internal contract repair converge

- Represent reviewer corrections in a bounded machine-readable shape instead of relying only on
  prose instructions to regenerate a full contract.
- At the validation/reviewer boundary, distinguish:
    - a resolved internal schema/postcondition repair the system can apply;
    - an uncommissioned effect that must be removed;
    - a true target/value ambiguity that requires the user.
- Evaluate deterministic normalization or patching for exact corrections such as missing
  `required_fields`, `priority=1`, labelled-create titles, and project-outcome field removal.
- Allow at most one acting-model repair after a precise reviewer correction. If a second identical
  schema omission occurs, repair or fail internally; never ask the user to author the control JSON.
- Preserve reviewer vetoes for invented, destructive, broadened, or genuinely ambiguous work.
- Do not merge contract approval and mutation approval unless equivalent safety evidence is
  retained.

**Exit:** Northwind completion mutates in the same turn; multi-update and organize need no repeated
schema-validation cycle; project create emits a valid first declaration. No safety fixture regresses.

### WP-4 — Require durable clarification and receipt-grounded final prose

- When a commissioned durable change still has multiple plausible targets, require
  `request_turn_clarification`; a plain-text question cannot be the terminal disposition.
- Persist the candidate set and pending question so the next turn can resume without rediscovery.
- Ensure the user-facing question names all plausible candidates and asks only for the unresolved
  choice.
- Gate mutation-completion claims on succeeded effects or explicit mutation receipts. Sanitize or
  reject prose that claims a write when none occurred.
- Preserve the correct no-write behavior for passing mentions and genuinely ambiguous requests.

**Exit:** the restraint scenario writes nothing on turn 1; turn 2 creates durable pending
clarification, lists the candidates, and makes no completion claim.

### WP-5 — Reduce control-loop latency, tokens, and cost

- Record acting, contract-review, mutation-review, repair, retry, and final-response passes
  separately.
- Remove repeated full-prompt/full-contract work where a compact typed correction is sufficient.
- Preserve batched evidence and mutation widths; do not trade provider-pass savings for serial tool
  execution.
- Compare each candidate against the exact production baselines in this tracker.

Initial release targets, subject to one measured local rehearsal:

| Scenario                       | Release target                                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `project-organize`             | Correct tree; zero contract validation failures; no repeated reviewer correction; ≤10 provider attempts, <120k tokens, and <90s durable time |
| `task-multi-update`            | Exactly three changes in one final batch; ≤1 contract correction, ≤6 provider attempts, <80k tokens, and <40s                                |
| `task-complete-cold-reference` | Correct completion/forward carry in the same turn; no user clarification; ≤6 provider attempts                                               |
| `project-create-contract`      | Valid first declaration, correct create, persisted shift, and completed follow-up                                                            |

If a threshold proves structurally impossible while every pass is necessary, record the pass graph
and ratify a new target rather than silently weakening the gate.

### WP-6 — Repair provider-pass telemetry

- Trace why terminal worker runs leave `chat_turn_runs.llm_pass_count=0` while provider-attempt
  observations are durable.
- Choose one canonical definition: logical LLM passes should not be confused with transport retries.
- Backfill/update the terminal aggregate from durable observations or remove it from dashboards in
  favor of a correctly derived metric.
- Add a consistency assertion that fails when a completed model-driven turn has provider attempts
  but a zero logical-pass count.

**Exit:** each battery turn's per-turn aggregate reconciles with its classified observation rows,
and admin cost/latency summaries no longer undercount every worker turn.

### WP-7 — Zero-retry production release gate

Run in this order to contain spend and isolate regressions:

1. selector/admission checks with no paid model call;
2. three repetitions each of the four repaired correctness scenarios;
3. one repetition each of the two expensive control-loop scenarios;
4. the full nine-scenario battery once with hard telemetry and zero retries;
5. the three-repetition read fixture to prove batching/grounding did not regress;
6. service-role cleanup query proving zero harness projects remain.

Retain turn IDs, stream IDs, exact worker/web releases, model/provider routes, tool graph, classified
provider-pass graph, latency, tokens, cost, database assertions, and cleanup receipt.

## Acceptance criteria

1. All nine battery scenarios pass in one zero-retry production run.
2. Each of the four repaired correctness scenarios passes 3/3 isolated production repetitions
   before the full run.
3. `task-reschedule-cold-reference` reaches the worker, mutates the existing task's date, preserves
   its state, creates no duplicate, and mounts no legacy email tools.
4. `project-create-contract` durably shifts the session before terminal completion and its next turn
   uses the created project context.
5. `task-complete-cold-reference` executes the exact commissioned completion/outcome/next-step work
   without asking the user to repair an internal contract.
6. `restraint-noop-and-ambiguity` preserves no-op restraint and uses durable clarification for the
   ambiguous turn; assistant prose claims no unreceipted mutation.
7. `project-organize` and `task-multi-update` meet the ratified pass/token/latency targets while
   preserving exact final database state and reviewer safety.
8. Document creation, simple task creation, global status, and the `[3,3]` read fixture do not
   regress.
9. Completed worker turns report nonzero, reconcilable logical LLM-pass telemetry.
10. The harness cleanup query finds zero data left by the release run.

## Guardrails

- Do not weaken worker unavailable-tool renegotiation to fix a selector false positive.
- Do not delete or bypass the semantic reviewer; eliminate avoidable repair loops while preserving
  its veto over invented, destructive, broadened, or ambiguous mutations.
- Do not convert unresolved target ambiguity into a guessed write.
- Do not infer a successful write from assistant prose; effects and receipts are authoritative.
- Do not publish a context shift the next admission cannot durably recover.
- Do not optimize contract overhead by moving mutations outside the reviewed execution path.
- Do not add broad prompt prose from the read-round hypothesis; current production did not
  reproduce redundant read planning.
- Keep all paid production reruns zero-retry and tear down every harness-owned entity.

## Recommended implementation order

1. WP-0 regression fixtures.
2. WP-1 selector fix and admission-only verification.
3. WP-2 durable context handoff.
4. WP-4 clarification/final-prose invariant.
5. WP-3 contract repair convergence.
6. WP-6 telemetry repair in parallel with measurement work.
7. WP-5 bounded efficiency optimization.
8. WP-7 isolated repetitions, then the full production battery.

## Exit

Delete this tracker only after the zero-retry production gate and cleanup receipt are durable. Move
any genuinely independent residual into a narrower tracker; do not keep this file as a completion
archive.
