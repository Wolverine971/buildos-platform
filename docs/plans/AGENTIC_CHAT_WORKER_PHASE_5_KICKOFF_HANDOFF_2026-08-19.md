<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_5_KICKOFF_HANDOFF_2026-08-19.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-26; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Agentic Chat Worker Phase 5 — Kickoff Handoff (2026-08-19)

**Prepared:** 2026-08-19
**Repository:** `/Users/djwayne/buildos-platform`
**Branch:** `main`
**HEAD at preparation:** `11c50cb2bae7206d9f756f0990ccc6c706c124da`
**Tracker:** [`tasker/57-worker-phase5-reliability-hardening.md`](../../tasker/57-worker-phase5-reliability-hardening.md)
**Master plan:** `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md` §Phase 5 (line 889)

---

## 1. The one thing to understand before anything else

**Twenty-one days of work have reached zero users.**

Routing has been `false` with a one-user cohort (`76c04859-837c-4d13-88ea-9a39ed15ed81`) since the
migration opened on 2026-07-29. Phases 0 through 4 are complete and none of it is delivering value.
Phase 5 is reliability hardening; **Phase 6 is the cohort ramp** — the first phase where a real user
receives anything.

So the standing question for every piece of Phase 5 work is: _does this get us to a ramp, or is it
gate theater?_ Phase 4 lost four days to the second thing. Read §3 before designing any gate.

## 2. Where the migration actually stands

| Phase                                           | State                                 |
| ----------------------------------------------- | ------------------------------------- |
| 0 — baseline, contracts, audit lock             | Complete                              |
| 1 — shared runtime extraction                   | Complete                              |
| 2 — durable turn control plane + Realtime       | Complete                              |
| 3 — thin internal worker vertical slice         | Complete (exit packet GO, 2026-08-07) |
| 4 — full worker behavioral parity               | **Complete — EXITED 2026-08-19**      |
| **5 — reliability + operational hardening**     | **← you are here**                    |
| 6 — dedicated service + canary rollout          | Not started (the ramp)                |
| 7 — capacity validation, 100 simultaneous turns | Not started                           |
| 8 — default routing + legacy retirement         | Not started                           |

Phase 4 exited on a **same-day legacy comparator**: legacy scored 12/18 and the worker 11/18 on the
exact current scenarios. DJ ratified exit with the worker one repetition behind. Full detail:
[`evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_SAME_DAY_COMPARATOR_2026-08-19.md`](evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_SAME_DAY_COMPARATOR_2026-08-19.md).

## 3. Four rules earned the hard way — inherit them

These cost roughly a week of Phase 4. Do not rediscover them.

1. **Never grade against a historical comparator without diffing the scenarios since that date.**
   Phase 4's exit bar came from 2026-07-31 artifacts; two of six scenarios were made stricter on
   2026-08-15. The gate spent four days requiring the worker to beat the reference implementation by
   25 points. The whole check is
   `git log --since=<bar-date> -- <scenario files>`.
2. **A single-run failure of a stochastic assertion is not a defect.** Treat it as one only when the
   same scenario fails the same assertion in a **majority of runs**. `research-turn-finalizes` passed,
   passed, passed, failed, failed, failed, passed on near-identical code.
3. **Never write code that overrides the model to make an assertion pass.** Two such mechanisms
   reached production worker code and were deleted (08-18 handoff §4): a regex over the user's own
   message that forced live web calls, and injected canned prose attributed to the assistant. If a
   scenario needs different behavior, the lever is the scenario or the prompt.
4. **Don't hold the worker to a bar legacy cannot meet.** Before calling anything a worker defect,
   measure legacy on the same thing, the same day. It is nearly free — see §7.

## 4. What Phase 5 actually asks for

The master plan (line 889) lists nine deliverables and a **40+ case failure-injection matrix**. Do
not attempt it as one block; that shape is what produced Phase 4's slice sprawl (27 dead slice plans
in `docs/plans/`).

Deliverables, with what already exists in the tree:

| Deliverable                              | Existing code                                             | Gap                                                                                                                             |
| ---------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Chat-specific stale-turn sweeper         | `apps/worker/src/workers/agentic-chat/stalledRecovery.ts` | Verify it is productionized against turn progress, queue claim state, execution/irreversible boundaries, generation, wall clock |
| Phase 2 fencing coverage audit           | `executionControl.ts`, `effectControl.ts`                 | No automated proof that fencing is present on **every** checkpoint/event/snapshot/message/tool-exec/finalization write          |
| Stable effect-id inventory               | `effectIdentity.ts`, `mutationAdapterRouter.ts`           | No automated inventory proving the contract holds for every chat-reachable mutating tool                                        |
| Typed retry classification               | Phase 2 typed codes exist                                 | Expand to safe-before-start / transient-safe / permanent / cancelled / uncertain-external-commit                                |
| Uncertain-external-commit reconciliation | —                                                         | Not built                                                                                                                       |
| Graceful shutdown                        | `index.ts`, `worker.ts`, `capacity.ts` handle SIGTERM     | Verify: stop claims, broadcast draining, abort/drain within budget, leave work reclaimable                                      |
| Event/snapshot retention cleanup         | —                                                         | Not built                                                                                                                       |
| Realtime outage + polling fallback       | `cancellationObserver.ts`, client reconciliation          | Needs failure injection                                                                                                         |
| Health endpoint                          | `GET /health` exists                                      | Must report last successful claim, Realtime connectivity, DB connectivity, active turns, event-loop lag                         |

**Suggested first slice** (highest ramp value per unit effort): graceful shutdown + health endpoint

- stale-turn sweeper. Those three are what make a Railway restart during a live turn safe, and
  Railway restarts are the failure the campaign has actually observed in production (`e995c1c2`).

## 5. Inherited open items — carried from Phase 4

| Item                                                                                         | Detail                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Latency is the real product problem**                                                      | Passing worker runs: p50 ~97s, max ~268s; `project-organize` _passed_ at 267.7s. The 08-19 comparator showed **legacy at 90–151s** — this is a **runtime** property, not migration debt. DJ's standing constraint: **no chat-level hard wall.** Bound individual provider operations, fall back gracefully, preserve durable work, end honestly. |
| **Provider long tail**                                                                       | 90s configured request deadline vs ~140.5s observed provider boundary. **Instrument the timeline first** — attempt start, `openRoute`/header time, deadline firing, body-read rejection, usage logging, terminal finalization. Do not propose another timeout policy before measuring.                                                           |
| `research-turn-finalizes` / `research-log-readback`                                          | Moved here from Phase 4. Treat as **prompt/scenario work**, not provider work. Expect them to fail narration/research-call assertions — that is the correct, predicted consequence of removing the coercion.                                                                                                                                     |
| `agent_call_session_id` context linkage                                                      | Worker mutation adapters pass a chat-session UUID through the legacy field, producing non-blocking activity-log FK errors on Railway. Task writes succeed.                                                                                                                                                                                       |
| Prompt-snapshot capture noise                                                                | `agentic_chat_prompt_snapshot_messages_mismatch` seen in earlier canaries. May already be closed — confirm, don't assume.                                                                                                                                                                                                                        |
| [`tasker/50`](../../tasker/50-worker-provider-execution-hardening-slice16.md) operator gates | Two authorized production gates still open: prod-vs-disposable constraint diff, and a deliberate provider-budget overrun canary. **These gate the ramp.**                                                                                                                                                                                        |

## 6. Production state — verify before changing anything

| Surface                               | Required value                                 |
| ------------------------------------- | ---------------------------------------------- |
| Web routing exact                     | `false`                                        |
| Cohort                                | exactly `76c04859-837c-4d13-88ea-9a39ed15ed81` |
| Worker provider mutation capabilities | exact empty string                             |
| Worker adapter mutation capabilities  | exact empty string                             |

Any run that changes these **must restore them unconditionally afterward, pass or fail**, and
independently read them back. The mechanics are in the 08-18 handoff §Step 4.

## 7. The zero-risk measurement tool nobody knew existed

`AGENTIC_E2E_EXECUTION_MODE=legacy_sse` posts **directly** to `/api/agent/v2/stream` and performs no
transport negotiation, so it **cannot reach the worker regardless of flag state**. No routing flip,
no capability staging, no restoration ritual.

Seventeen Phase 4 gate runs each paid the full production ceremony. The run that actually closed the
phase needed none of it. Use this to measure legacy behavior any time you need a baseline.

```bash
git worktree add --detach /tmp/p5-wt HEAD
cp apps/web/.env /tmp/p5-wt/apps/web/.env          # gitignored, keeps the tree clean
cd /tmp/p5-wt && pnpm install --frozen-lockfile
pnpm turbo build --filter="./packages/*"            # REQUIRED — fresh worktrees have no dist

AGENTIC_E2E_BASE_URL=https://build-os.com \
AGENTIC_E2E_EXECUTION_MODE=legacy_sse \
AGENTIC_PHASE0_CAPTURE=true \
AGENTIC_PHASE0_REPETITIONS=3 \
AGENTIC_PHASE0_OUTPUT_PATH=/tmp/result.json \
AGENTIC_SCENARIOS=<scenario> \
pnpm --filter @buildos/web exec vitest run \
  --config vitest.config.agentic.ts \
  src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts --retry=0
```

Gotchas, both hit on 2026-08-19: `AGENTIC_PHASE0_CAPTURE=true` requires a **spotless** tree, so
write artifacts **outside** the worktree; and a fresh worktree needs
`pnpm turbo build --filter="./packages/*"` or collection fails on unresolved workspace entries.

Cost reference: six scenarios × 3 reps ≈ `$0.29` on legacy, `$0.12` on worker.

## 8. Working in parallel — file ownership

Three agents are working simultaneously as of 2026-08-19.

| Tracker                                                                      | Owns                                                                                                                                                                    | Do not touch                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| [`tasker/55`](../../tasker/55-project-organize-contract-review-assertion.md) | `apps/web/src/lib/tests/agentic-e2e/**`                                                                                                                                 | `apps/worker/src/**`                |
| [`tasker/56`](../../tasker/56-worker-task-complete-over-clarification.md)    | `apps/worker/src/workers/agentic-chat/readOnlyProvider.ts` + its tests                                                                                                  | the e2e scenarios                   |
| **Phase 5 (you)**                                                            | worker reliability/ops: `consumer.ts`, `consumerRuntime.ts`, `capacity.ts`, `stalledRecovery.ts`, `executionControl.ts`, `effectControl.ts`, health endpoint, scheduler | `readOnlyProvider.ts` — owned by 56 |

`readOnlyProvider.ts` is 4,090 lines and is the campaign's hottest file. If Phase 5 needs it,
coordinate through DJ rather than both sessions editing it.

## 9. Commit discipline — this bit is not optional

DJ pre-stages unrelated work and the worktree is shared across sessions. At the time of writing it
carries **~116 modified/untracked files** from other work.

- **Never commit without DJ's explicit approval.**
- **Always use an explicit pathspec:** `git commit -- <paths>`.
- **Never** `git add .`, **never** `git commit -a`. Re-check the index before every commit.
- Prior campaign work was repeatedly swept into DJ's own aggregate commits — that is his call to
  make, not yours.

## 10. File map

| Purpose                                   | Path                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| Phase 5 tracker                           | `tasker/57-worker-phase5-reliability-hardening.md`                                         |
| This handoff                              | `docs/plans/AGENTIC_CHAT_WORKER_PHASE_5_KICKOFF_HANDOFF_2026-08-19.md`                     |
| Master plan §Phase 5                      | `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md` line 889            |
| Phase 4 exit + history + deploy mechanics | `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_CONTINUATION_HANDOFF_2026-08-18.md`                |
| Phase 4 ledger (exited)                   | `tasker/51-worker-behavioral-parity-phase4.md`                                             |
| Same-day legacy comparator                | `docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_SAME_DAY_COMPARATOR_2026-08-19.md` |
| Phase 3 exit packet                       | `docs/plans/AGENTIC_CHAT_WORKER_PHASE_3_EXIT_GATE_PACKET_2026-08-07.md`                    |
| Operator gates blocking the ramp          | `tasker/50-worker-provider-execution-hardening-slice16.md`                                 |
| Harness reference                         | `apps/web/src/lib/tests/agentic-e2e/README.md`                                             |
| Worker agentic-chat modules (55 files)    | `apps/worker/src/workers/agentic-chat/`                                                    |

**Stale worktrees:** seven detached worktrees from prior gate runs are still registered
(`/private/tmp/buildos-phase4-*`, `~/buildos-baseline-wt`). Harmless, but `git worktree list` is
noisy until someone prunes them with DJ's okay.
