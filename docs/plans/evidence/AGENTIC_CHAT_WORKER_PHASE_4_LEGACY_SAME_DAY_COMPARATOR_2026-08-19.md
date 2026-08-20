<!-- docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_SAME_DAY_COMPARATOR_2026-08-19.md -->

# Agentic Chat Worker Phase 4 — Legacy Same-Day Comparator

**Run date:** 2026-08-19
**Execution mode:** `legacy_sse` (direct `POST /api/agent/v2/stream`)
**Source revision:** `11c50cb2bae7206d9f756f0990ccc6c706c124da` (clean detached worktree)
**Server:** `https://build-os.com` (production)
**Artifact:** `agentic_chat_worker_phase4_six_class_LEGACY_comparator_2026-08-19_11c50cb2b.json`
**Artifact SHA-256:** `e973464ff64aff43609066d36ed770b51982cf64e7364fb314faa378f046996a`
**Provider cost:** `$0.29185278` (plus `$0.01031364` one-turn preflight)

## Why this run exists

The 2026-08-18 exit policy grades the worker's judgment lane against "legacy's measured
rate," derived in `AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_COMPARATOR_2026-08-18.md` from four
Phase 0 artifacts captured **2026-07-31**.

Two of the six exit scenarios were made materially stricter _after_ that measurement:

| Scenario                       | Assertion added                                                                                       | Commit      | Date       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| `project-organize`             | `declare_turn_contract` **and** `approve_turn_contract_review` must be called                         | `665ba01fc` | 2026-08-15 |
| `restraint-noop-and-ambiguity` | `request_turn_clarification` must be called; session must not retain `fastchat_pending_turn_contract` | `665ba01fc` | 2026-08-15 |

`declare_turn_contract` first appears anywhere in the repository on **2026-08-15**. Legacy's
83.33% on `project-organize` was therefore measured against a scenario that could not have
required it. The 07-31 comparator is not a valid bar for the 08-15+ scenario definitions.

This run measures legacy against the **exact current scenario definitions**, on the same
production server, on the same day, at the same repetitions and zero retries.

## Validity

- Chat-runtime and scenario drift between the worker battery revision (`33b4faec`) and this
  run's revision (`11c50cb2b`) is **zero** across `apps/web/src/lib/tests/agentic-e2e`,
  `apps/web/src/routes/api/agent`, `packages/agentic-chat-runtime`,
  `apps/web/src/lib/server/agentic-chat`, and `apps/web/src/lib/services/agentic-chat-v2`.
- `legacy_sse` posts directly to `/api/agent/v2/stream` and performs no transport
  negotiation, so it cannot reach the worker regardless of flag state. **No production
  routing, cohort, or capability values were read, changed, or restored for this run.**
- Each scenario ran as its own capture with a clean exact tree; artifacts merged post-run.

## Result — legacy vs worker on identical scenarios

A repetition passes only when every turn in it has `assertionPassed: true`.

| Scenario                         |  07-31 bar |     Worker (08-19) | **Legacy (08-19)** | Delta     |
| -------------------------------- | ---------: | -----------------: | -----------------: | --------- |
| `project-catchup-cold`           |    100.00% |                3/3 |            **2/3** | worker +1 |
| `project-organize`               |     83.33% |                0/3 |            **0/3** | tie       |
| `restraint-noop-and-ambiguity`   |    100.00% |                2/3 |            **1/3** | worker +1 |
| `task-complete-cold-reference`   |     91.67% |                1/3 |            **3/3** | legacy +2 |
| `task-multi-update`              |    100.00% |                2/3 |            **3/3** | legacy +1 |
| `task-reschedule-cold-reference` |     75.00% |                3/3 |            **3/3** | tie       |
| **All six**                      | **91.67%** | **11/18 (61.11%)** | **12/18 (66.67%)** | legacy +1 |

Turn assertions: legacy **15/21**, worker 14/21.
Stream-error turns: legacy **0/21**, worker 2/21.
Capture-error turns: legacy **0/21**, worker 0/21.

## Findings

### 1. The 91.67% bar is not achievable by legacy itself

Legacy scores **66.67%** on the current six-class definitions. The exit gate has been
requiring the worker to beat the reference implementation by 25 points.

### 2. `project-organize` is unsatisfiable on both paths

Legacy failed all three repetitions on exactly the assertion added 08-15:

```
[assert] expected one of [approve_turn_contract_review]; got
[declare_turn_contract, get_document_tree, move_document_in_tree, move_document_in_tree, ...]
```

Legacy declares the contract and performs the organization work correctly — repetition 3
issued repeated `move_document_in_tree` calls — but never calls `approve_turn_contract_review`.
The worker fails identically. This is a defect in the assertion or in the contract-approval
surface, **not a worker parity gap**. It should not gate Phase 4.

### 3. `restraint-noop-and-ambiguity` penalizes the worker for legacy behavior

Both legacy failures were the 08-15 assertion:

```
[assert] expected one of [request_turn_clarification]; got [update_onto_task]
Assistant text: "Let me mark that off."
```

Legacy guesses and mutates on the deliberately ambiguous follow-up in 2 of 3 runs. The worker
does it in 1 of 3 — i.e. the worker is **better** here, while being graded a miss against a
100% bar.

### 4. `task-complete-cold-reference` is a genuine worker regression

Legacy 3/3, worker 1/3. The recorded worker failures asked for unnecessary date/confirmation
detail instead of completing the uniquely matched task. Legacy does not exhibit this. This is
the one real, reproducible worker defect the six-class battery has surfaced, and it points at
the pre-mutation semantic withholding gate added during remediation.

### 5. `task-multi-update` is a one-repetition gap

Legacy 3/3, worker 2/3. Inside the flap band; not a defect under the majority-of-runs rule.

### 6. Latency is a runtime property, not a worker property

Legacy turns ran 90–151s against production. The worker battery measured p50 53.7s / max
151.0s. The Phase 5 latency item is not caused by the migration.

## Recommended reading of the exit gate

- **Deterministic lane:** legacy emitted 0 stream errors and 0 capture errors; the worker
  emitted 2, both in `project-organize`, and both have local repairs committed in `6c73357ae`.
  This lane is legitimately close and is the correct thing to hold to 100%.
- **Judgment lane:** graded against a same-day legacy comparator rather than the 07-31 one,
  the worker is at **11/18 vs 12/18** — one repetition apart, with the worker ahead on two
  scenarios and behind on two.
- `project-organize` should be removed from the exit set or its `approve_turn_contract_review`
  assertion fixed, since no implementation satisfies it.
- `task-complete-cold-reference` is the single item that warrants a code fix.
