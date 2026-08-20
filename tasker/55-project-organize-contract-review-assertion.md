<!-- tasker/55-project-organize-contract-review-assertion.md -->

# 55 — `project-organize` asserts a worker-only tool on both paths

**Created:** 2026-08-19
**Status:** Resolved. Corrected legacy scenario passed a retained **3/3** no-retry battery 2026-08-19.
**Mission:** Make `project-organize` gradeable. At tracker creation it failed 0/3 on **both** the
worker and legacy, so it carried no signal about parity and could not legitimately gate anything.

## Legacy 3-repetition rate established — 2026-08-19 (supersedes the 1/1 smoke)

The corrected scenario was run against `https://build-os.com` in `legacy_sse`, 3 repetitions,
`--retry=0`, from a clean detached worktree at exact revision `36955954c`, with
`AGENTIC_PHASE0_CAPTURE=true`. **It passed 3/3** with **zero stream errors and zero capture
errors**, at `$0.11538665` provider cost. Terminal durations were 142.7s / 134.2s / 120.1s
(p50 122.0s).

This replaces the earlier 1/1 smoke as the legacy rate for this scenario. `project-organize` on
legacy is therefore **0/3 → 3/3** purely from removing the worker-only assertion; no product code
changed between the two measurements.

Per-repetition tool lists confirm the root-cause diagnosis exactly:

- `declare_turn_contract` — called in **all three** repetitions (the properly shared tool).
- `approve_turn_contract_review` — called in **none** (worker-only, now correctly path-conditional).
- `move_document_in_tree` — **six calls in every repetition**; the organize work genuinely happens.

Retained artifact: `docs/plans/evidence/agentic_chat_tasker55_project_organize_LEGACY_3rep_2026-08-19_36955954c.json`,
SHA-256 `df98f503bbf186498769c0500d08b50e6a84114f7577100d4d02691bf04a3d81`, runId
`tasker55-organize-legacy-21fdd7e9-200`. Uncommitted per DJ's standing rule. No worker routing or
production flags were changed by this run — `legacy_sse` cannot reach the worker.

**Still open:** the worker-side rerun of the corrected definition. Until that exists, the
cross-path behavioral set this tracker makes eligible has only its legacy half.

## Resolution — 2026-08-19

The second candidate was true: `approve_turn_contract_review` is observable on the worker when
the semantic reviewer approves. The retained artifacts store tool names under
`toolExecutions[].name` (not `.tool_name`):

- `agentic_chat_worker_phase4_six_class_remediation_exit_2026-08-19_870c3feef.json` includes the
  approval in `project-organize` repetitions 1 and 2. Repetition 2 proceeds past that assertion
  and fails later because it asks for clarification without moving documents.
- `agentic_chat_worker_phase4_six_class_second_remediation_exit_2026-08-19_33b4faec.json` includes
  the approval in repetition 3 before the provider-disabled stream failure. Repetition 2 omits it
  because the reviewer emits `request_turn_clarification` instead.

The scenario now receives the selected execution mode through `ScenarioContext` and asserts
`approve_turn_contract_review` only for `worker_realtime`. Both paths still have to satisfy the
shared behavioral surface: `declare_turn_contract`, a real document-tree move, completed run,
source-document/content preservation, canonical nesting/grouping, and the organization-quality
judge. No worker provider code changed and no paid battery was run.

`project-organize` is eligible for a future cross-path behavioral set after both paths are rerun
against this corrected definition. The retained 0/3 results cannot be rescored because the bad
assertion short-circuited the remaining DB assertions and judge. Cross-path reporting should treat
the shared organization outcome as the parity signal and the worker-only approval as a separate
safety invariant; it must not use the pre-08-19 aggregate pass rate as a legacy bar.

### Live verification

A single no-retry `legacy_sse` repetition ran against `https://build-os.com` after the fix and
passed 1/1 in 130.448 seconds (142.95 seconds total test duration). Because this was a quick smoke
rather than a Phase 0 capture, it produced no retained evidence JSON and must not be treated as a
new three-repetition legacy rate. The harness completed its normal fixture/session cleanup. No
worker routing or production flags changed.

## Why this work exists

`project-organize` scored 0/3 on all three worker exit batteries (2026-08-18, and both 08-19
remediation retests). It was read as a worker defect and drove two rounds of worker provider
repairs.

The 2026-08-19 same-day legacy comparator run showed **legacy also scores 0/3**, failing on the
identical assertion. Evidence:
[`AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_SAME_DAY_COMPARATOR_2026-08-19.md`](../docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_SAME_DAY_COMPARATOR_2026-08-19.md).

## Root cause (verified firsthand, 2026-08-19)

Before this fix, `apps/web/src/lib/tests/agentic-e2e/scenarios/project-organize.scenario.ts:124`
asserted unconditionally:

```ts
assertAnyToolCalled(turn, ['approve_turn_contract_review']);
```

That assertion was added **2026-08-15** in commit `665ba01fc`, together with the
`declare_turn_contract` assertion on the line above it.

**`approve_turn_contract_review` does not exist on the legacy web path.** A repository-wide
search finds it in exactly three places:

| Location                                                  | Kind                                |
| --------------------------------------------------------- | ----------------------------------- |
| `apps/worker/src/workers/agentic-chat/readOnlyTool.ts:62` | worker source — the only definition |
| `apps/worker/tests/agenticChat*.test.ts`                  | worker tests                        |
| `apps/web/.../scenarios/project-organize.scenario.ts:124` | **this assertion**                  |

There is no definition anywhere under `apps/web/src` or `packages/`. Contrast
`declare_turn_contract`, which is properly shared — it lives in
`packages/agentic-chat-runtime/src/loop/turn-contract.ts` and
`apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts`, and legacy calls it
successfully in all three comparator repetitions.

`approve_turn_contract_review` is emitted by the worker's **independent semantic reviewer** — a
separate model pass inside the provider (`readOnlyProvider.ts:1652`,
`const approval = call.name === APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME`). It is an internal
review-control decision rather than a user-facing product tool, but the worker publishes it as a
durable tool call and the harness observes it.

**So the scenario asserts an implementation detail of one of the two implementations it is
supposed to compare.** Legacy can never satisfy it. That is why legacy is 0/3.

The legacy failures confirm the work itself succeeds — only the assertion fails:

```
rep3: [assert] expected one of [approve_turn_contract_review]; got
[declare_turn_contract, get_document_tree, move_document_in_tree, move_document_in_tree,
 move_document_in_tree, move_document_in_tree, move_document_in_tree, ...]
```

Legacy declared the contract, read the tree, and performed the moves correctly.

## Resolved question — why did the worker also fail it?

This was the unresolved part at tracker creation. The retained artifacts now distinguish the two
candidate explanations.

The worker _does_ have the tool, and its semantic reviewer _does_ emit it — worker unit tests at
`apps/worker/tests/agenticChatReadOnlyProvider.test.ts:1473+` pin exactly that. Yet the worker
scored 0/3 in production on this scenario.

The two candidates were:

1. **Visibility (rejected)** — approval calls appear in the captured worker tool-execution list.
2. **The reviewer did not approve (confirmed for the assertion misses)** — the recorded 08-19
   worker misses include _"inspected the
   tree but asked the user to choose the organization despite the explicit delegation"_, which
   means the reviewer chose `request_turn_clarification`. Other repetitions failed earlier on
   provider allowlisting/disablement rather than on this assertion.

The decisive evidence came from the existing captured worker `project-organize` tool lists, with
no additional paid battery:
`docs/plans/evidence/agentic_chat_worker_phase4_six_class_second_remediation_exit_2026-08-19_33b4faec.json`.

## Exit condition — complete locally

1. **Complete:** determine visibility from retained artifacts without spend.
2. **Complete:** make the observable worker approval path-conditional and grade legacy on the
   shared organization surface.
3. **Complete:** retain the scenario as eligible for a future cross-path outcome set, but do not
   rescore or reuse the short-circuited pre-fix runs.

**Do not "fix" this by changing worker provider code.** Two rounds of provider repair have already
been spent on a scenario that legacy cannot pass either.

## Landmines

- The 07-31 legacy comparator in
  `AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_COMPARATOR_2026-08-18.md` lists `project-organize` at
  **83.33%**. That number predates this assertion by two weeks and must not be used as a bar for
  the current scenario.
- `project-organize` is expensive: the legacy 3-rep run alone cost `$0.1486` — roughly half the
  entire six-class battery. Diagnose from retained artifacts first.

## Context for a fresh agent — read these, in this order

You are picking up one residual of a finished campaign. You do **not** need to read the whole
campaign; you need the exit state and this scenario.

| #   | Read                                                                                                                                                                                      | Why                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [`docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_SAME_DAY_COMPARATOR_2026-08-19.md`](../docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_SAME_DAY_COMPARATOR_2026-08-19.md) | **Start here.** The measurement that created this tracker. Has the full six-scenario table and the exact legacy failure text.     |
| 2   | [`tasker/51`](51-worker-behavioral-parity-phase4.md)                                                                                                                                      | Phase 4 ledger — now **EXITED**. Explains what the six-class exit set was and why.                                                |
| 3   | [`docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_CONTINUATION_HANDOFF_2026-08-18.md`](../docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_CONTINUATION_HANDOFF_2026-08-18.md)                               | Top section = the exit. §3 = why the 08-15→08-17 loop failed to converge. §4 = the coercion that was removed and must not return. |
| 4   | [`apps/web/src/lib/tests/agentic-e2e/README.md`](../apps/web/src/lib/tests/agentic-e2e/README.md)                                                                                         | How the harness works: three assertion surfaces, LLM judge, cost warning.                                                         |

**Do NOT treat as authoritative:**
[`AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_COMPARATOR_2026-08-18.md`](../docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_COMPARATOR_2026-08-18.md)
— the 07-31-derived bar. It predates the 08-15 assertions and is the thing that caused this bug to
be misread for four days. It is retained for history only.

## The exact files

| Path                                                                            | Role                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `apps/web/src/lib/tests/agentic-e2e/scenarios/project-organize.scenario.ts:124` | **The fixed, path-conditional assertion.**                          |
| `apps/worker/src/workers/agentic-chat/readOnlyTool.ts:62`                       | The only definition of `approve_turn_contract_review`, worker-only. |
| `apps/worker/src/workers/agentic-chat/readOnlyProvider.ts:1652`                 | Where the semantic reviewer's approval decision is read.            |
| `packages/agentic-chat-runtime/src/loop/turn-contract.ts`                       | `declare_turn_contract` — the properly shared contrast case.        |
| `apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts`      | Legacy's `declare_turn_contract` definition.                        |
| `apps/web/src/lib/tests/agentic-e2e/harness/assertions.ts`                      | `assertAnyToolCalled` — what "observable tool call" actually means. |

## Diagnose from retained artifacts first — no spend required

```bash
# Worker's project-organize turns (the 0/3 the campaign kept re-fixing)
jq -r '.turns[] | select(.scenarioId=="project-organize")
  | {rep: .repetition, passed: .assertionPassed,
     tools: [.toolExecutions[]?.name], err: .assertionError}' \
  docs/plans/evidence/agentic_chat_worker_phase4_six_class_second_remediation_exit_2026-08-19_33b4faec.json

# Legacy's, from today's comparator
jq -r '.turns[] | select(.scenarioId=="project-organize")
  | {rep: .repetition, tools: [.toolExecutions[]?.name]}' \
  docs/plans/evidence/agentic_chat_worker_phase4_six_class_LEGACY_comparator_2026-08-19_11c50cb2b.json
```

The corrected query shows `approve_turn_contract_review` on worker repetitions that approved and
never on legacy. That is the evidence for the path condition.

## If you must run the harness live

This recipe was proven on 2026-08-19 and costs **`$0.1486`** for `project-organize` ×3 — the most
expensive scenario in the set. Prefer artifacts.

```bash
# 1. Clean detached worktree — PHASE0_CAPTURE requires a spotless tree and the
#    shared repo is permanently dirty with other sessions' work.
git worktree add --detach /tmp/organize-wt HEAD
cp apps/web/.env /tmp/organize-wt/apps/web/.env          # .env is gitignored, stays clean
cd /tmp/organize-wt && pnpm install --frozen-lockfile
pnpm turbo build --filter="./packages/*"                  # REQUIRED: fresh worktrees have no dist

# 2. Legacy mode needs NO production flag changes — it posts straight to
#    /api/agent/v2/stream and cannot reach the worker. Swap to worker_realtime
#    ONLY with DJ's explicit authorization plus the full staging/restore ritual.
AGENTIC_E2E_BASE_URL=https://build-os.com \
AGENTIC_E2E_EXECUTION_MODE=legacy_sse \
AGENTIC_ASSERT_TELEMETRY=true \
AGENTIC_PHASE0_CAPTURE=true \
AGENTIC_PHASE0_REPETITIONS=3 \
AGENTIC_PHASE0_OUTPUT_PATH=/tmp/organize-result.json \
AGENTIC_SCENARIOS=project-organize \
pnpm --filter @buildos/web exec vitest run \
  --config vitest.config.agentic.ts \
  src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts --retry=0

# 3. Write the artifact OUTSIDE the worktree — writing inside trips the clean-tree
#    guard on the next run. Clean up: git worktree remove --force /tmp/organize-wt
```

## Working in parallel — file ownership

Three agents are working this campaign simultaneously. **Your lane is the web test scenario.**

| Tracker                                             | Owns                                                                   | Do not touch         |
| --------------------------------------------------- | ---------------------------------------------------------------------- | -------------------- |
| **55 (you)**                                        | `apps/web/src/lib/tests/agentic-e2e/**`                                | `apps/worker/src/**` |
| [56](56-worker-task-complete-over-clarification.md) | `apps/worker/src/workers/agentic-chat/readOnlyProvider.ts` + its tests | the e2e scenarios    |
| Phase 5                                             | worker reliability/ops modules                                         | both of the above    |

**Never commit without DJ's explicit approval, and always with an explicit pathspec**
(`git commit -- <paths>`) — never `git add .`, never `git commit -a`. The worktree is shared and
permanently carries ~100+ unrelated modified files from other sessions.
