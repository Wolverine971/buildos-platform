<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_6_POST_DEPLOY_ISOLATED_TEST_REPORT_2026-08-21.md -->

# Agentic Chat Worker Phase 6 — Post-deploy isolated test report

**Date:** 2026-08-21  
**Purpose:** reviewer-ready account of the first isolated `project-organize` and
`task-multi-update` battery after restoring the dedicated Railway service's GitHub auto-deploy
connection.  
**Production application revision:** `8135a71e22b4b568954b0178cb7a5534032a67e5`  
**Execution mode:** required `worker_realtime`  
**Headline result:** **0/6 end-to-end passes**, consisting of three behavior failures and three
fail-closed mutation-capability/tool-surface failures.  
**Primary evidence:**
[`agentic_chat_worker_phase6_post_skill_org_isolated_2026-08-21_8135a71e2.json`](./evidence/agentic_chat_worker_phase6_post_skill_org_isolated_2026-08-21_8135a71e2.json)

## 1. Bottom line

The dedicated Railway service is connected correctly and processed the test turns. The failed
battery is **not evidence of a broken GitHub-to-Railway connection, a stale deployment, a database
outage, or a Realtime/queue failure**.

The run instead exposed two product/runtime conditions:

1. **The contract reviewer still over-clarified three otherwise executable requests.** Two
   `project-organize` repetitions and one `task-multi-update` repetition stopped after revision and
   clarification, with no mutation.
2. **The production worker is still intentionally configured as read-only.** Both
   `AGENTIC_CHAT_MUTATION_PROVIDER_CAPABILITIES` and
   `AGENTIC_CHAT_MUTATION_ADAPTER_CAPABILITIES` are exact empty strings. Once the reviewer approved
   execution, the acting model requested the correct canonical mutation tools, but the worker
   rejected `create_onto_document` once and `update_onto_task` twice because those tools were not in
   the 12-tool advertised provider surface.

This distinction matters: the mutation tools and adapters exist in source. The immediate hard
failure is a rollout/configuration gate, not proof that the adapters are unimplemented. Enabling
them is a production mutation-rollout decision and must not be treated as a routine secret or
deployment repair.

The earlier `skill_load` prompt/tool-surface mismatch is improved: **no `skill_load` rejection
occurred**. The model now progressed to the intended canonical mutation tools. The next mismatch is
between those mutation intents and the worker's deliberately empty production capability lists.

## 2. What was verified before and during the run

### Railway/GitHub deployment connection

The dedicated service was independently read back as:

| Item              | Verified value                                                 |
| ----------------- | -------------------------------------------------------------- |
| Railway project   | `queue-worker` (`22ef1ec4-fdb9-41b9-9fdc-c52237427115`)        |
| Environment       | `production` (`a28f09cc-2133-4701-9232-2984106db6ac`)          |
| Service           | `agentic-chat-worker` (`1e9aab7d-fa38-495a-8869-ac8bfa0c3e11`) |
| Repository        | `Wolverine971/buildos-platform`                                |
| Tracked branch    | `main`                                                         |
| Deployment        | `b03daf6d-dd7d-47d3-ab1a-9de085562818`                         |
| Deployed revision | `8135a71e22b4b568954b0178cb7a5534032a67e5`                     |
| Railway config    | [`/railway.chat.toml`](../../railway.chat.toml)                |
| Start command     | `node apps/worker/dist/chat-worker.js`                         |
| Public health URL | `https://agentic-chat-worker-production.up.railway.app/health` |

The source configuration includes watch patterns for `apps/worker/**`, `packages/**`, root workspace
files, patches, and `railway.chat.toml`. This deployment was exact proof that a push to `main`
triggered the dedicated service after the missing branch connection was restored.

At the final post-test health check:

- release was still exact `8135a71e22b4b568954b0178cb7a5534032a67e5`;
- service and runtime state were `healthy` / `running`;
- database was connected with zero consecutive claim failures;
- Realtime was connected with one active channel and zero consecutive failures;
- queue and stalled-turn recovery were healthy;
- `activeTurns` was `0`; and
- the queue was neither processing nor draining.

One deployment hardening item remains: Railway reported `checkSuites: false`, so auto-deploy does
not wait for GitHub checks. Auto-deploy works, but “Wait for CI” should be enabled after confirming
the repository checks are the intended deployment gate.

### Test checkout and transport preflight

The battery ran from an isolated, clean clone rather than the dirty shared worktree:

| Item             | Value                                      |
| ---------------- | ------------------------------------------ |
| Branch           | `main`                                     |
| HEAD             | `8135a71e22b4b568954b0178cb7a5534032a67e5` |
| Tree             | `8282a21597304b61e907e60e5fd1ba0311aa0a1e` |
| Repository dirty | `false`                                    |
| Base URL         | `https://build-os.com`                     |
| Execution mode   | `worker_realtime`                          |

A zero-model-spend production preflight passed first. It proved authentication, the private
Realtime subscription, and acquisition of an exact worker lease against the newly deployed
release. This prevented a web-routing, cohort, lease, or worker-claiming defect from being confused
with model behavior.

## 3. Battery configuration and aggregate result

The paid isolated battery used:

- scenarios: `project-organize,task-multi-update`;
- repetitions: 3 per scenario;
- accepted turns: 6;
- harness retries: 0;
- telemetry assertions: enabled;
- evidence schema: version 2; and
- run label: `phase6-post-skill-org-isolated-20260821-8135a71e2`.

Aggregate result:

| Measure                              |                               Result |
| ------------------------------------ | -----------------------------------: |
| End-to-end assertion passes          |                              **0/6** |
| Deterministic passes                 |                              **0/6** |
| Durable turns completed/terminalized |                              **6/6** |
| Behavior failures                    |                                **3** |
| Transport/tool-surface failures      |                                **3** |
| Stream-error turns                   |                              **3/6** |
| Judge-eligible turns                 |                              **0/6** |
| Judge scores                         | **None; all six were `not_reached`** |
| Evidence-capture errors              |                                **0** |
| Retained subchecks                   |                  6 passed, 15 failed |
| Total model cost                     |                    **`$0.06549983`** |

The absence of judge scores is important. A `0/6` headline does not mean the quality judge assigned
six zeroes. Every repetition failed the deterministic/transport gate before the judge was allowed
to run.

## 4. `project-organize`: what the test asks

The scenario seeds six loose top-level project documents—notes, a raw meeting dump, a TODO dump,
pricing ideas, random thoughts, and an unfinished customer-email draft—and sends:

> This project's documents are a mess — loose notes, raw meeting dumps, half-baked ideas, all piled
> at the top level. Help me get it organized into something sensible.

The test expects the worker to:

1. read enough of the project to form a safe plan;
2. declare and pass semantic review of a mutation contract;
3. create/use sensible grouping parents and move documents;
4. retain all six original document IDs and body contents;
5. nest at least two originals and group at least two under one parent; and
6. only then reach the 1–5 quality judge, with `3` as the passing threshold.

The fixture and assertions live in
[`project-organize.scenario.ts`](../../apps/web/src/lib/tests/agentic-e2e/scenarios/project-organize.scenario.ts).
The rationale and historical legitimacy analysis live in
[`AGENTIC_CHAT_PROJECT_ORGANIZATION_TEST_DEEP_DIVE_2026-08-21.md`](./AGENTIC_CHAT_PROJECT_ORGANIZATION_TEST_DEEP_DIVE_2026-08-21.md).

## 5. `project-organize`: exact results

| Rep | Classification                     |          Cost | What happened                                                                                                                                                                                             | Why it failed                                                                                                                                                                                 |
| --: | ---------------------------------- | ------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Behavior failure                   | `$0.01790990` | The model read all six outlines, the tree, six document sections, and project details. It declared a contract, received a reviewer revision, re-declared, and then received `request_turn_clarification`. | The worker never produced `approve_turn_contract_review` and never attempted a document mutation. The test correctly rejected the no-op outcome.                                              |
|   2 | Behavior failure                   | `$0.01609109` | Nearly the same path as rep 1: comprehensive reads, contract declaration, reviewer revision, re-declaration, then clarification.                                                                          | No contract approval and no document move. The user had already delegated a sensible organization; the reviewer/candidate path asked instead of acting.                                       |
|   3 | Tool-surface/configuration failure | `$0.00635940` | The model read the outlines and tree, declared a contract, and the reviewer approved it. The next acting-model pass requested `create_onto_document`.                                                     | Production advertised only 12 tools because mutation capabilities were empty. The worker failed closed with `provider_tool_not_allowlisted` before a grouping document or move could execute. |

Scenario total: **0/3**, costing **`$0.04036039`**.

### What was messed up in organization

There are two independent problems:

1. **Reviewer behavior:** reps 1 and 2 performed enough discovery to propose a structure, but the
   review loop converged to clarification rather than a safe executable contract. This preserves
   safety but fails the product promise to organize the project.
2. **Mutation rollout mismatch:** rep 3 finally reached approval and chose a legitimate first write
   for the scenario—creating a grouping document—but production was still read-only. The codebase
   has a reviewed `create_onto_document` catalog entry and adapter, yet its provider/adapter
   capability gates were off.

No repetition moved a document. Therefore the persisted organization outcome truly failed, and the
quality judge never had an organization to score.

Railway's safe typed-failure record for rep 3 identified:

| Field            | Value                                  |
| ---------------- | -------------------------------------- |
| Worker turn      | `7561a074-5358-4564-a332-8fbf78df7e9d` |
| Durable turn run | `3c38b38f-8ad5-4914-bd6a-da36231a99dd` |
| Queue job        | `003f78c8-d5c9-4257-9300-b3563b13f869` |
| Rejected tool    | `create_onto_document`                 |
| Advertised tools | `12`                                   |
| Failure class    | `permanent` / fail closed              |

## 6. `task-multi-update`: what the test asks

The scenario seeds four job-search tasks and sends one informal dictated sentence:

> ok so i knocked out the resume update and the linkedin thing this morning, and the halcyon prep
> needs to be top priority now, they moved the onsite up

Expected persisted effects:

1. `Update resume with the orchestration work` becomes `done`.
2. `Refresh the LinkedIn headline and about section` becomes `done`.
3. `Prep system design answers for Halcyon Labs` moves from priority `4` to priority `1` or `2`.
4. The unrelated `Write the take-home postmortem` task stays untouched.
5. No duplicate task is created and no unapproved material field changes.

The fixture and database assertions live in
[`task-multi-update.scenario.ts`](../../apps/web/src/lib/tests/agentic-e2e/scenarios/task-multi-update.scenario.ts).
The rationale, historical results, and scoring analysis live in
[`AGENTIC_CHAT_MULTI_TASK_UPDATE_TEST_DEEP_DIVE_2026-08-21.md`](./AGENTIC_CHAT_MULTI_TASK_UPDATE_TEST_DEEP_DIVE_2026-08-21.md).

## 7. `task-multi-update`: exact results

| Rep | Classification                     |          Cost | What happened                                                                                                                               | Why it failed                                                                                                                                                                                                          |
| --: | ---------------------------------- | ------------: | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Behavior failure                   | `$0.01023113` | The model listed the tasks, declared a contract, received a reviewer revision, re-declared, and then received `request_turn_clarification`. | No contract approval and no canonical mutation ran. All three requested effects remained unchanged: resume `todo`, LinkedIn `todo`, Halcyon priority `4`. The unrelated control task was preserved.                    |
|   2 | Tool-surface/configuration failure | `$0.00738128` | The revised contract was approved. The acting model then requested `update_onto_task`.                                                      | The correct task-mutation tool was not advertised because both mutation capability lists were empty. The worker failed closed with `provider_tool_not_allowlisted`; all requested database effects remained unchanged. |
|   3 | Tool-surface/configuration failure | `$0.00752703` | Same meaningful path as rep 2: revision, re-declaration, reviewer approval, then `update_onto_task`.                                        | The tool was again absent from the 12-tool provider surface and rejected. No requested mutation landed; collateral remained preserved.                                                                                 |

Scenario total: **0/3**, costing **`$0.02513944`**.

### What was messed up in multi-update

Again, there are two independent problems:

1. **Unnecessary clarification:** rep 1 had exact seeded task identities and a clear natural-language
   instruction. Asking the user to disambiguate “top priority” was unnecessary for this product
   contract; the test intentionally accepts either priority `1` or `2`.
2. **Read-only production gate:** reps 2 and 3 passed semantic review and selected the correct
   canonical mutation tool. The worker rejected it before execution because `updateOntoTask` was
   not enabled in either capability variable.

The database-backed test found that **all three requested clauses failed in all three repetitions**.
The collateral-preservation subcheck did pass: the worker did not damage the fourth task or create
duplicates while failing to perform the requested work.

Railway's typed-failure records identified:

| Rep | Worker turn                            | Durable turn run                       | Queue job                              | Rejected tool      | Advertised tools |
| --: | -------------------------------------- | -------------------------------------- | -------------------------------------- | ------------------ | ---------------: |
|   2 | `45f93d27-42b5-4a78-b421-cab710e65e76` | `3519facc-9a2b-4d7a-b30f-d8aed0b83f31` | `1dbc9d5e-09c1-458f-bcf7-977abdf7eaf3` | `update_onto_task` |               12 |
|   3 | `f3a09984-9e8c-40a3-96a4-aa10df1cf859` | `e0d9d3cd-351d-4ddc-964e-159ab978235c` | `bf19ffc2-16ab-47c2-8536-e02f6d8973ff` | `update_onto_task` |               12 |

## 8. What improved versus the previous isolated run

The direct comparator is
[`AGENTIC_CHAT_WORKER_TASKER58_ISOLATED_TWO_SCENARIO_RERUN_2026-08-21.md`](./AGENTIC_CHAT_WORKER_TASKER58_ISOLATED_TWO_SCENARIO_RERUN_2026-08-21.md),
with its retained
[`schema-v2 artifact`](./evidence/agentic_chat_worker_tasker58_isolated_two_scenario_2026-08-21_ff6e8eed6.json).

| Previous issue                                         | This run              | Interpretation                                                                                                                            |
| ------------------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Two `skill_load` allowlist rejections                  | **0**                 | The skill prompt/tool-surface repair worked.                                                                                              |
| One `provider_round_budget_exceeded` organization turn | **0**                 | The prior organization read-loop budget failure did not recur.                                                                            |
| Tasker 58 validation/truncation error family           | **0**                 | The closed parser/validation fixes continued to hold. See [`tasker 58`](../../tasker/58-agentic-chat-provider-tool-validation-errors.md). |
| No approved multi-task contract in the hard-error reps | Reps 2 and 3 approved | Reviewer progress improved, but execution was blocked by configuration.                                                                   |
| No approved organization contract                      | Rep 3 approved        | The flow progressed farther, then exposed the read-only mutation gate.                                                                    |
| Reviewer clarification behavior                        | Still 3 total turns   | This is the principal remaining behavior defect.                                                                                          |

The headline remained 0/6, but the failure frontier moved forward. The worker is no longer failing
on `skill_load`, provider argument truncation, validation-repair exhaustion, or a repeated read-loop
budget cap. It is now failing at reviewer disposition or at the explicitly disabled mutation gate.

## 9. Root cause of the mutation-tool rejections

Current Railway readback, limited to the two non-secret capability values:

```text
AGENTIC_CHAT_MUTATION_ADAPTER_CAPABILITIES=
AGENTIC_CHAT_MUTATION_PROVIDER_CAPABILITIES=
```

Relevant source ownership:

| Concern                                                         | Source                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Parse and validate the two capability lists                     | [`phase3Config.ts`](../../apps/worker/src/workers/agentic-chat/phase3Config.ts)                                                             |
| Require provider capability to have matching adapter capability | [`phase3Assembly.ts`](../../apps/worker/src/workers/agentic-chat/phase3Assembly.ts)                                                         |
| Reviewed mutation specs and capability names                    | [`mutationToolCatalog.ts`](../../apps/worker/src/workers/agentic-chat/mutationToolCatalog.ts)                                               |
| Document-create adapter                                         | [`createOntoDocumentMutationAdapter.ts`](../../apps/worker/src/workers/agentic-chat/createOntoDocumentMutationAdapter.ts)                   |
| Document-tree move adapter                                      | [`gatewayDocumentRelationshipMutationAdapter.ts`](../../apps/worker/src/workers/agentic-chat/gatewayDocumentRelationshipMutationAdapter.ts) |
| Task-update adapter                                             | [`updateOntoTaskMutationAdapter.ts`](../../apps/worker/src/workers/agentic-chat/updateOntoTaskMutationAdapter.ts)                           |
| Provider allowlist rejection boundary                           | [`readOnlyProvider.ts`](../../apps/worker/src/workers/agentic-chat/readOnlyProvider.ts)                                                     |

The minimum capabilities needed by these two scenarios are:

```text
createOntoDocument,moveDocumentInTree,updateOntoTask
```

They must be enabled in **both** provider and adapter capability lists. Enabling only the provider
list is intentionally rejected at startup. Enabling only the adapter list would leave the tools
unadvertised to the model.

This is why another agent should not “fix the allowlist” by weakening
`provider_tool_not_allowlisted`. The rejection is doing the safe thing. The decision is whether the
one-user Railway canary is now authorized to execute this narrow mutation set.

## 10. Recommended next work, in order

### P0 — Make the mutation-rollout decision

Choose one of these explicitly:

1. **Proceed with the narrow mutation canary.** With operator approval, configure both capability
   variables on `agentic-chat-worker` to
   `createOntoDocument,moveDocumentInTree,updateOntoTask`, preserving the exact one-user worker
   cohort. Deploy only while `activeTurns=0`, then read back health and the non-secret capability
   names without printing secrets.
2. **Keep production read-only.** If this is the intended Phase 6 state, do not interpret these
   mutation scenarios as a model-quality release gate for that environment. Mark their hard
   failures as expected rollout-gate outcomes and run them only against a separately authorized
   mutation-enabled environment/cohort.

Do not widen the user cohort at the same time as enabling mutations. Change one risk dimension at a
time.

### P1 — Verify the mutation path locally before changing Railway

Before production configuration changes:

- prove the exact three capability names parse and assemble matching provider tools/adapters;
- run focused tests for `create_onto_document`, `move_document_in_tree`, and `update_onto_task`;
- verify provider capability without its adapter still fails startup;
- verify contract review remains mandatory before writes;
- verify document content/IDs and the multi-task collateral fingerprint remain protected; and
- run worker typecheck plus the focused provider/assembly/config suites.

This should be mostly verification because the catalog entries and adapters already exist. If a
focused test fails, fix that concrete defect before changing production variables.

### P2 — Fix reviewer over-clarification in parallel

Investigate the three clarification paths without weakening semantic review:

- compare the first and revised contracts and the reviewer's safe reason code;
- for `project-organize`, require exact source IDs and concrete parent/move outcomes, but allow the
  agent to choose sensible parent titles without asking the user to design the taxonomy;
- for `task-multi-update`, encode that “top priority” is executable as priority `1` or `2` when the
  target is uniquely resolved;
- keep clarification for genuinely missing target IDs, destructive ambiguity, or unsupported
  effects; and
- add payload-minimized regression coverage for the observed revision-to-clarification shapes.

The two existing scenario deep dives should remain the behavioral source of truth; do not replace
the live natural-language tests with deterministic model fixtures.

### P3 — Improve evidence capture

The schema-v2 artifact still records only `provider_tool_not_allowlisted`; the rejected tool name was
recoverable only from Railway logs. Add these safe fields to durable execution observations and the
evidence artifact:

- `rejected_provider_tool_name`;
- `advertised_tool_count`;
- execution generation/round;
- stream and durable turn IDs; and
- capability-gate state as names/counts only, never secret values.

Also add independent `project-organize` subchecks like the multi-task scenario already has. The
current organization turns have no per-layer subcheck array, so the report must reconstruct whether
stream, review, mutation, persistence, and quality were reached.

### P4 — Rerun in two stages

After P0–P3 are deployed:

1. Run the zero-spend exact worker preflight again.
2. Run one paid smoke repetition of each scenario with zero retries.
3. Inspect rejected-tool logs, contract disposition, database effects, and collateral preservation.
4. Only if both smoke turns are structurally healthy, run at least five repetitions per scenario for
   a more credible behavioral estimate.

Do not jump directly to another six-turn battery while production capabilities remain empty; it
would only reproduce the expected fail-closed condition and spend model budget.

### P5 — Harden auto-deploy

Enable Railway “Wait for CI” for `agentic-chat-worker`, then make a harmless watched-file change in a
controlled follow-up and verify:

- GitHub checks pass first;
- exactly the expected Railway service deploys;
- the deployed release matches the Git SHA;
- the service drains/restarts with no abandoned active turn; and
- final health is green.

## 11. Reviewer checklist and safety constraints

The next agent should independently verify, not merely repeat, these claims:

- [ ] Railway source is `Wolverine971/buildos-platform`, branch `main`.
- [ ] Current release equals the intended Git SHA.
- [ ] `railway.chat.toml` remains the selected config and starts only `chat-worker.js`.
- [ ] The legacy/general worker does not also own Agentic Chat claims.
- [ ] Both mutation capability variables are currently empty before any approved change.
- [ ] The three rejected tool names are present in the reviewed catalog and have matching adapters.
- [ ] The one-user routing and internal execution cohorts still match exactly.
- [ ] Database, Realtime, queue, recovery, and event-loop health are green.
- [ ] No secret value is printed or copied into a report.
- [ ] No mutation capability or cohort is widened without explicit operator approval.
- [ ] No paid rerun begins until the environment under test can legitimately execute the scenarios.

## 12. Relevant documents and evidence

### Start here

1. This report.
2. [Current schema-v2 run artifact](./evidence/agentic_chat_worker_phase6_post_skill_org_isolated_2026-08-21_8135a71e2.json).
3. [Previous isolated two-scenario report](./AGENTIC_CHAT_WORKER_TASKER58_ISOLATED_TWO_SCENARIO_RERUN_2026-08-21.md).
4. [Project organization test deep dive](./AGENTIC_CHAT_PROJECT_ORGANIZATION_TEST_DEEP_DIVE_2026-08-21.md).
5. [Multi-task update test deep dive](./AGENTIC_CHAT_MULTI_TASK_UPDATE_TEST_DEEP_DIVE_2026-08-21.md).

### Railway and Phase 6 context

- [Phase 6 kickoff handoff](./AGENTIC_CHAT_WORKER_PHASE_6_KICKOFF_HANDOFF_2026-08-20.md)
- [Dedicated Railway service review handoff](./AGENTIC_CHAT_WORKER_PHASE_6_RAILWAY_SERVICE_REVIEW_HANDOFF_2026-08-20.md)
- [Dedicated Railway service review report](./AGENTIC_CHAT_WORKER_PHASE_6_RAILWAY_SERVICE_REVIEW_REPORT_2026-08-20.md)
- [Dedicated Railway deployment configuration](../../railway.chat.toml)

The Railway review documents predate restoration of the dedicated service's `main` branch trigger.
Where they describe an auto-deploy gap, this report supersedes that status with deployment
`b03daf6d-dd7d-47d3-ab1a-9de085562818` on exact revision `8135a71e...`.

### Earlier failure investigation

- [Tasker 58 provider/tool-validation investigation](../../tasker/58-agentic-chat-provider-tool-validation-errors.md)
- [Phase 6 Phase 4 battery root-cause report](./AGENTIC_CHAT_WORKER_PHASE_6_PHASE_4_BATTERY_ROOT_CAUSE_REPORT_2026-08-20.md)
- [Previous schema-v2 evidence artifact](./evidence/agentic_chat_worker_tasker58_isolated_two_scenario_2026-08-21_ff6e8eed6.json)
- [Original Phase 6 Phase 4 rerun artifact](./evidence/agentic_chat_worker_phase6_phase4_rerun_2026-08-20_0ee9cb82f.json)

### Test and harness implementation

- [Scenario battery runner](../../apps/web/src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts)
- [Project organization scenario](../../apps/web/src/lib/tests/agentic-e2e/scenarios/project-organize.scenario.ts)
- [Multi-task update scenario](../../apps/web/src/lib/tests/agentic-e2e/scenarios/task-multi-update.scenario.ts)
- [Assertion helpers](../../apps/web/src/lib/tests/agentic-e2e/harness/assertions.ts)
- [Deterministic-before-judge sequencing](../../apps/web/src/lib/tests/agentic-e2e/harness/turn-sequencing.ts)
- [Judge implementation](../../apps/web/src/lib/tests/agentic-e2e/harness/judge.ts)
- [Telemetry/database evidence helpers](../../apps/web/src/lib/tests/agentic-e2e/harness/telemetry.ts)

## 13. Artifact receipt

| Field            | Value                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| File             | `docs/plans/evidence/agentic_chat_worker_phase6_post_skill_org_isolated_2026-08-21_8135a71e2.json` |
| Schema           | `2`                                                                                                |
| Run ID           | `phase6-post-skill-org-is-cae16448-629`                                                            |
| Generated        | `2026-08-21T18:54:35.278Z`                                                                         |
| Bytes            | `237072`                                                                                           |
| SHA-256          | `7e729e2dae24baf0a965eb81164ceb170bb8e8d8a16f1a77f9fc61bcb4e98d10`                                 |
| Repository dirty | `false`                                                                                            |
| Capture errors   | `0`                                                                                                |
