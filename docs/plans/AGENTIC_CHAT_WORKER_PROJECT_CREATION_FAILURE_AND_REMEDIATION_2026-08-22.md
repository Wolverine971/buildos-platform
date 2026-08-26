<!-- docs/plans/AGENTIC_CHAT_WORKER_PROJECT_CREATION_FAILURE_AND_REMEDIATION_2026-08-22.md -->

# Agentic Chat Worker Project-Creation Failure and Remediation

**Test date:** 2026-08-22 ET (2026-08-23 UTC)  
**Environment:** production (`https://build-os.com`)  
**Worker release:** `489aff88c27c3012b2ff60cb9063a44af6e02b8b`  
**Result:** failed behavior test; transport and safety enforcement remained healthy

## Executive result

The fully specified project-creation test did not create a project. The worker advertised
`create_onto_project`, completed the durable turn over `worker_realtime`, and attempted the expected
mutation twice. Both attempts were correctly rejected because no independently reviewed turn
contract authorized the mutation. The assistant then exposed an internal recovery proposal as a
user confirmation question instead of repairing the contract and completing the requested work.

This is an orchestration defect at the contract-first boundary. It is not a missing-tool,
connectivity, persistence, or safety-gate defect.

## Reproduction

Prompt:

> Create a project called Agentic Worker PC1 2026-08-22 2232 ET. The goal is to publish the first 3
> podcast episodes by September 15, 2026. Tasks I already know about: define the show format, book
> the first 3 guests, and record the trailer.

Expected behavior:

1. Treat the request as fully specified; do not ask for confirmation.
2. Declare and independently review the exact project-creation contract.
3. Create one project shell and its generated Context document.
4. Shift the active context from `project_create` to the new project.
5. Preserve the stated goal and three tasks through their separately reviewed canonical mutations.
6. Ground a follow-up mutation in the newly created project.

Observed behavior:

| Surface              | Observation                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Durable turn         | Completed with `finished_reason=stop` after 83.833 seconds                                 |
| Transport            | `worker_realtime`, contract `agentic_chat_worker_v1`                                       |
| Capability           | `create_onto_project` was advertised and called twice                                      |
| Contract enforcement | Both calls failed closed: mutation was outside the independently approved turn contract    |
| Persistence          | Zero matching projects existed after the turn                                              |
| Context              | No `context_shift` event was emitted                                                       |
| User experience      | Assistant asked “May I proceed with this exact payload?” despite a fully specified command |
| Continuation         | Not reached because no project existed                                                     |

Durable identities:

- Session: `903ca0ed-df78-4471-8a8f-5f2a0db02c58`
- Turn: `adfe2221-391a-4aae-8c3f-db019cc0c81f`
- Stream run: `4b1492af-3272-4cd2-b875-9f183a08bb4d`

Raw evidence:
[`agentic_chat_worker_project_creation_pc1_2026-08-22_489aff88c.json`](./evidence/agentic_chat_worker_project_creation_pc1_2026-08-22_489aff88c.json)

## Root cause

The failure came from an incomplete admitted surface plus contradictory recovery guidance:

1. The immutable `project_create_minimal` artifact admitted `create_onto_project` but omitted the
   non-mutating semantic control tools. The acting model therefore had no admitted way to declare
   the contract that the worker correctly required before execution.
2. The semantic mutation boundary requires a declared contract whose hash matches the independently
   approved contract before any canonical mutation may execute. The two rejected writes prove this
   boundary is active and working.
3. The project-create no-execution repair instruction tells the acting model that its next response
   should directly emit `create_onto_project`, without first telling it to declare and obtain review
   of the missing contract.
4. The same repair instruction says to add a goal and tasks to the project-create payload, while the
   reviewed `create_onto_project` adapter deliberately accepts only a bounded project shell with
   `entities: []` and `relationships: []`. Goals and tasks must use separately reviewed tools after
   the shell exists.

The first live attempt followed the obsolete compound-payload idea and included four entities. The
second attempt corrected the payload to an empty shell, but neither attempt repaired the absent
contract. Contract validation therefore rejected both before the adapter could create anything.

Relevant implementation surfaces:

- `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts`
- `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts`
- `packages/agentic-chat-runtime/src/loop/repair-instructions.ts`
- `packages/agentic-chat-runtime/src/loop/turn-contract.ts`
- `apps/worker/src/workers/agentic-chat/readOnlyProvider.ts`
- `apps/worker/src/workers/agentic-chat/createOntoProjectMutationAdapter.ts`
- `apps/worker/src/workers/agentic-chat/mutationToolCatalog.ts`

## Required remediation

Keep the fail-closed validator. Repair the orchestration around it:

1. When a fully specified `project_create` turn lacks an approved creation outcome, direct the model
   to declare the exact project-shell contract first—not to retry the mutation directly.
2. Admit the standard non-mutating semantic controls plus only the reviewed mutations needed for the
   bounded flow: `create_onto_project`, `create_onto_goal`, and `create_onto_task`. Do not broaden the
   surface to relationships, arbitrary edits, or discovery tools.
3. Make the repair instruction match the reviewed adapter: `create_onto_project` receives one
   project shell plus empty `entities` and `relationships` arrays.
4. After independent approval, execute the project-shell mutation once. Never replay an uncertain
   project create.
5. Emit and persist the returned project context shift.
6. If the original request contains explicit goals or tasks, continue using separately declared,
   reviewed canonical mutations scoped to the returned project ID. Do not silently discard them or
   weaken the project adapter to accept an unreviewed compound graph.
7. Do not turn an internal contract declaration into a redundant user confirmation when all
   required user intent is already present.

## Implementation status

The remediation is implemented in the local worktree:

- The web-owned immutable `project_create_minimal` surface now admits exactly four non-mutating
  semantic controls plus `create_onto_project`, `create_onto_goal`, and `create_onto_task`.
- The worker mounts canonical control schemas for older project-create artifacts, requires an
  initial contract disposition, and sends the declared contract through independent SHA review.
- Approved composite creation is phased: the project shell is the only first mutation; after its
  durable receipt returns the project ID, only unresolved goal/task creates are exposed.
- Deterministic validation requires exactly one empty project-shell outcome and rejects unsupported
  entity kinds. The adapter still requires `entities: []` and `relationships: []`.
- Completion routing removes fulfilled create tools, preventing duplicate project creation while
  the remaining goal/task outcomes finish.
- Project-create repair instructions now restore the contract-first sequence and never recommend a
  compound shell payload or redundant confirmation.

Local verification completed:

| Check                                              |               Result |
| -------------------------------------------------- | -------------------: |
| Runtime contract and repair tests                  |         61/61 passed |
| Worker provider regression tests                   |         83/83 passed |
| Web surface, selector, preparation, and size tests |         51/51 passed |
| Runtime build                                      |               passed |
| Worker typecheck                                   |               passed |
| Full web `svelte-check`                            | 0 errors, 0 warnings |
| Relevant ESLint, Prettier, and diff checks         |               passed |

The repaired code has not been committed or deployed in this work. Production therefore still
needs the post-deploy live gate below; this report does not claim that the old production release
now passes PC1.

## Regression gate

The automated E2E scenario added with this remediation must begin in `project_create` with no seeded
project and use the same fully specified podcast request under a unique, sweepable harness name. It
must prove all of the following:

- clean terminal stream and completed durable turn;
- `declare_turn_contract`, worker review, and successful `create_onto_project` execution;
- exactly one persisted project with the requested name and a generated Context document;
- a `context_shift` event targeting that exact project;
- no confirmation or permission question in the assistant response;
- the stated goal and three tasks are persisted through reviewed canonical writes;
- a follow-up task is created in the new project, not in global or another project context;
- no duplicate project rows or failed `create_onto_project` executions;
- teardown removes the agent-created project by captured ID, with exact-name cleanup as a backstop.

The deterministic gate should run locally against the harness and then run three consecutive times
against the deployed worker release. A release is acceptable only if all three repetitions pass and
the safety boundary remains fail closed in its focused contract tests.

Single worker run:

```bash
pnpm --filter @buildos/web test:agentic:project-create:worker
```

Three-run release gate with strict telemetry and retained evidence:

```bash
AGENTIC_PHASE0_CAPTURE=true \
AGENTIC_ASSERT_TELEMETRY=true \
AGENTIC_PHASE0_REPETITIONS=3 \
AGENTIC_E2E_RETRY_COUNT=0 \
AGENTIC_E2E_RUN_LABEL=project-create-release \
AGENTIC_E2E_BASE_URL=https://build-os.com \
AGENTIC_PHASE0_OUTPUT_PATH=/tmp/buildos-project-create-release.json \
pnpm --filter @buildos/web test:agentic:project-create:worker
```

---

## Status 2026-08-24: post-deploy release gate ran — original defect GONE, gate 0/3 on two NEW defects

The three-run release gate ran against the deployed worker (`5e2ad1bda`, all 20 capabilities).
Artifact: `docs/plans/evidence/agentic_chat_worker_project_create_release_gate_2026-08-24_5e2ad1bda.json`.

**The PC1 defect this document describes is fixed.** All three reps: `declare_turn_contract` →
`approve_turn_contract_review` → `approve_mutation_batch_review` → `create_onto_project` succeeded,
with the correct `context_shift` to the created project. The contract-first boundary no longer
rejects the creation or surfaces a recovery proposal as a confirmation question.

**The gate still failed 0/3 on two defects downstream of the shell create:**

1. **The contract never covers the goal/tasks, so the turn cannot finish the commission.**
   All three declared contracts contained exactly one shell outcome
   (`[{action: create, entity_kind: project, minimum_successful_effects: 1}]`). Rep 1's first
   declare tried `required_fields: ["project"]` and was rejected by the worker's project-create
   validation ("shell outcome must omit required_fields and changes", `readOnlyProvider.ts:4533`),
   teaching the model to strip the contract to the bare shell. Once the shell create executes, the
   contract is fully fulfilled, so `takeContractCompletionContinuation` has nothing to continue —
   the goal + 3 tasks are never authorized work.
2. **The post-mutation round then either stops politely or kills the turn.**
   After the fulfilled contract, the post-mutation semantic-disposition round offers only
   control tools. Rep 2's model answered with prose ending "Shall I go ahead and add those now?" —
   the exact redundant-confirmation pattern the scenario bans (behavior_failure; goal/tasks never
   persisted; counts goals=0 tasks=0). Reps 1 and 3's model instead tried to continue the work with
   a real tool call, which `assertAllowlistedCall` converts into a permanent
   `provider_tool_not_allowlisted` error — the whole turn dies AFTER the project was durably created
   (transport_failure; `finished_reason: error`, `assistant_message_id: null`). There is a one-shot
   repair for reviewer mimicry but none for a work-tool call in a control-only round.

Also observed: reps 2/3 shortened the requested project title ("AE2E", "AE2E Podcast" instead of the
full unique harness name), which both failed the exact-name assertion path and defeated the
exact-name teardown backstop. The two leaked projects were deleted by ID the same day
(`onto_projects` cascade); prod verified clean.

**Fix directions (not yet decided):** (a) let the project-create contract carry goal/task create
outcomes (schema already supports multiple outcomes; the validator only constrains the shell one) so
the completion continuation drives them; (b) give control-only rounds a one-shot repair when the
model calls an advertised work tool instead of failing the turn permanently; (c) require title
fidelity for the shell create the same way labelled creates pin titles.
