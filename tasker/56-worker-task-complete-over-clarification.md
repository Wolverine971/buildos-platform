<!-- tasker/56-worker-task-complete-over-clarification.md -->

# 56 — Worker over-clarifies on `task-complete-cold-reference` (legacy 3/3, worker 1/3)

**Created:** 2026-08-19
**Status:** Fixed and live-verified 2026-08-19. The over-clarification regression is GONE (3/3 completed
the uniquely matched task with no clarification). Two NEW findings opened — see the result section.
**Mission:** Close the one **genuine, reproducible** worker-vs-legacy behavioral regression the
Phase 4 six-class campaign found. The worker asks for confirmation instead of completing a
uniquely matched task; legacy just completes it.

## Live result — 2026-08-19 worker battery (3 scenarios x 3 reps)

Run against `https://build-os.com` in `worker_realtime` from a clean detached worktree at exact
revision `36955954c` (= `origin/main`; Railway deployment built from the same commit), staged
capabilities `createOntoDocument,createOntoTask,updateOntoTask` in both provider and adapter lists,
one-user cohort, `--retry=0`, `AGENTIC_PHASE0_CAPTURE=true`. Zero-spend preflight passed 1/1 first.
Provider cost `$0.03527355`.

Artifact: `docs/plans/evidence/agentic_chat_tasker56_three_scenario_WORKER_3rep_2026-08-19_36955954c.json`,
SHA-256 `286b18e9715ce9918419725829afd5cf5f78bea9fa172ae5de01fb9be03320b2`, runId
`tasker56-three-scenario--60efd3dc-a0b`. Uncommitted per DJ's standing rule.

### The regression this tracker exists for is CLOSED

| Path                        | task-complete-cold-reference |
| --------------------------- | ---------------------------- |
| Legacy (08-19 comparator)   | 3/3                          |
| Worker BEFORE fix (08-19)   | **1/3**                      |
| Worker AFTER fix (this run) | **2/3**                      |

The pass count understates it. **All three repetitions** emitted the identical tool sequence
`declare_turn_contract -> approve_turn_contract_review -> approve_mutation_batch_review ->
update_onto_task`, and **not one** emitted `request_turn_clarification`. The recorded failure mode
("asked for unnecessary date/confirmation details instead of completing the uniquely matched task")
did not occur in any repetition. The semantic reviewer approved the mutation every time.

### NEW FINDING 1 — the second guidance line overcorrects (this is the 2/3, not over-clarification)

Repetition 3 completed the task correctly and then failed the LLM judge 2/5:

> "While the assistant successfully located and marked the intro call task as done without
> unnecessary confirmation, it **explicitly declined to record the stated next step anywhere
> durable**, which the rubric defines as the core failure."

This traces to the second line added to `SEMANTIC_COMMISSION_GUIDANCE` in `36955954c`:

> "Do not expand a completion report into a separate follow-up entity unless the user explicitly
> commissioned that creation or delegated how the follow-up should be recorded."

The model obeyed it and **announced the refusal to the user**. Note the four-surface DB assertion
still passed, because the deterministic D1 stated-future floor wrote the record durably — so the
next step _was_ captured while the assistant told the user it would not be. That user-visible
contradiction is the defect, not the missing entity. The lever is the wording of that one line:
it should suppress inventing an unrequested follow-up entity without licensing the model to
announce that the stated future is being dropped.

### Finding 1 FIXED — guidance reworded 2026-08-19 (local gates green, NOT yet live-tested)

`SEMANTIC_COMMISSION_GUIDANCE` line 4 in `readOnlyProvider.ts` now reads:

> "Do not expand a completion report into a separate follow-up entity unless the user explicitly
> commissioned that creation or delegated how the follow-up should be recorded; **declining that
> creation is never a reason to tell the user their stated next step will go unrecorded — carry it
> on the matched entity instead.**"

The restraint is preserved (still no unrequested entity); only the narration failure is closed, and
it points at the alternative line 3 already licenses ("carry only user-supplied outcome or next-step
text on the matched entity"). A regression guard was added to the existing unique-completion test in
`agenticChatReadOnlyProvider.test.ts`, asserting the new clause reaches **both** the acting prompt
and **every** reviewer prompt, so it cannot regress on one surface only.

Gates: focused provider 61/61, full worker 1,063 passed + 1 intentional skip, TS7 typecheck clean,
lint 0 errors (176 pre-existing warnings) + HTTP size guard OK, Prettier clean. **Uncommitted.**

**Not yet live-verified.** Railway builds from `origin/main`, so validating this needs a commit +
push + deploy. Deliberately batched with the tasker/57 termination slice so one staging ritual and
one paid battery validate both — rather than paying the full ritual twice. That battery should run
`task-complete-cold-reference`, `restraint-noop-and-ambiguity`, and `task-multi-update` together
(the standing rule for this gate), and it finally gets `task-multi-update` its missing measurement.

### NEW FINDING 2 — a non-terminating turn leaks worker capacity (hand to Phase 5 / tasker 57)

`task-multi-update` scored 0/3 and **carries no semantic signal whatsoever**: all three
repetitions were rejected at admission with HTTP 429 `WORKER_CAPACITY_EXCEEDED` after ~2s, with
**zero tool calls**. No model turn ran.

The cause is in the artifact timeline:

| Turn                     | Started (UTC) | Duration  | Outcome                      |
| ------------------------ | ------------- | --------- | ---------------------------- |
| `restraint` rep3         | 22:05:29.599  | 317,102ms | **never terminated**         |
| `task-multi-update` rep1 | 22:11:03.962  | 1,879ms   | 429 WORKER_CAPACITY_EXCEEDED |
| `task-multi-update` rep2 | 22:11:23.177  | 2,084ms   | 429 WORKER_CAPACITY_EXCEEDED |
| `task-multi-update` rep3 | 22:11:42.377  | 1,982ms   | 429 WORKER_CAPACITY_EXCEEDED |

`restraint` rep3 was abandoned by the client at 22:10:46. The first 429 landed 17 seconds later
and they continued for ~40s more. **Correction after investigation: this is not a leak.** The
consumer's `workerTimeoutMs` is 360s (`consumer.ts:8`) and the turn ran 317s, so the worker was
still legitimately holding the slot when the client gave up first — a timeout mismatch under
`concurrency: 1`, not a slot that never releases. The turn itself never terminating IS a real
defect, now fully characterized in [57](57-worker-phase5-reliability-hardening.md).
Agentic chat concurrency is hard-defaulted to `1` (`apps/worker/src/workers/agentic-chat/consumer.ts:8`;
`CHAT_CONCURRENCY` is unset in Railway) and `capacity.ts:103,151` actively asserts `concurrency === 1`.
So exactly one stuck turn starves every subsequent turn. This is a reliability defect, not a
behavioral one, and belongs to [57](57-worker-phase5-reliability-hardening.md).

### `restraint-noop-and-ambiguity` did NOT regress

This was the pre-registered risk: narrowing the reviewer gate could cost the worker its restraint
edge (worker 2/3 vs legacy 1/3). It did not. Both repetitions that terminated passed **both** of
their turns — `declare_read_only_turn` + `approve_read_only_turn_review` on the no-op, and
`declare_turn_contract` + `request_turn_clarification` on the genuinely ambiguous one. The model
still declines to guess. Repetition 3's miss is the non-termination above, not a restraint failure.

### What is still unmeasured

`task-multi-update` needs a rerun once Finding 2 is addressed; this battery produced no data for
it. Per the majority-of-runs rule, neither the single non-termination nor the single judge miss is
by itself a defect claim — but Finding 1 has a named, specific code cause and should be treated as
real.

### Production restoration

Both Railway capability lists set back to exact empty strings and Vercel routing set to `false`,
independently read back. Note the Vercel gotcha that also caused the first preflight failure: an
env-var change does not reach running lambdas until a redeploy, so the restore required one.

## Why this work exists

This is the only scenario in the six-class exit set where the worker is clearly and repeatably
worse than legacy on the same scenario, same day, same production server:

| Path                                           |   Score | Rate |
| ---------------------------------------------- | ------: | ---: |
| Legacy (2026-08-19, same-day comparator)       | **3/3** | 100% |
| Worker (2026-08-19, second remediation retest) | **1/3** |  33% |

Evidence:
[`AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_SAME_DAY_COMPARATOR_2026-08-19.md`](../docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_SAME_DAY_COMPARATOR_2026-08-19.md).

Recorded worker failure mode (from the six-class battery packet): repetitions 1/3 and 2/3
_"asked for unnecessary date/confirmation details instead of completing the uniquely matched
task"_; 3/3 passed and used `update_onto_task`. Legacy exhibited none of this in three runs.

Unlike `project-organize` ([55](55-project-organize-contract-review-assertion.md)), this is **not**
an instrument artifact. The scenario is satisfiable — legacy satisfies it every time.

## Hypothesis (verified structurally, not yet behaviorally)

The worker runs an **independent semantic reviewer** that has no legacy counterpart. In
`apps/worker/src/workers/agentic-chat/readOnlyProvider.ts`:

```ts
const semanticReviewRequired = Boolean(this.ports.semanticReviewer); // :545
```

Legacy has no such port and no such pass. Before the worker may mutate, a second model pass
grades the disposition and can force a clarification instead. Its prompt explicitly instructs
that behavior (`readOnlyProvider.ts:2900`):

> "If multiple loaded entities plausibly match a descriptive reference, if the proposed target
> conflicts with the user request, or if a required choice remains, request clarification."

and (`:2825`):

> "A commissioned change is not read-only merely because its target or value remains ambiguous;
> in that case request clarification and name the plausible human-readable choices…"

`task-complete-cold-reference` is a **cold reference to a uniquely matching task**. If the
reviewer treats "cold/descriptive reference" as "plausibly ambiguous," it will withhold the
mutation and demand a choice that the user has already made — producing exactly the observed
behavior.

The 2026-08-19 follow-up made this _stronger_, not weaker: it extended the pre-mutation semantic
withholding gate from the initial pass to **continuation passes as well**. `task-complete` went
1/3 → 0/3 → 1/3 across the three batteries while that gate was being tightened.

## Next exit condition

1. **Confirm from retained artifacts, no spend.** Pull the two failing
   `task-complete-cold-reference` turns from
   `docs/plans/evidence/agentic_chat_worker_phase4_six_class_second_remediation_exit_2026-08-19_33b4faec.json`
   and establish whether the clarification was emitted by the **reviewer** (veto) or by the
   **acting model** (its own choice). That single fact selects the fix.
2. If reviewer-driven: narrow the gate so a **uniquely matched** entity is not treated as
   ambiguous. Uniqueness is checkable from loaded evidence — one candidate is not a choice.
3. If acting-model-driven: it is prompt guidance, not gate logic; fix it in the completion
   guidance shared across the acting gate and both review prompts.
4. Re-verify with the worker unit suite (`apps/worker/tests/agenticChatReadOnlyProvider.test.ts`)
   before proposing any paid retest. **Paid retests require fresh DJ authorization.**

## Landmines

- **Do not reintroduce coercion.** The 08-18 course correction removed
  `requiresExternalWebResearch` and `buildPreToolNarration` from production worker code because
  they overrode the model to make assertions pass. A hard-coded "always complete on unique match"
  override would be the same mistake in a new place. The lever is the gate's ambiguity test or
  the prompt — not a bypass.
- The semantic reviewer is a real safety feature; it is why the worker beats legacy on
  `restraint-noop-and-ambiguity` (worker 2/3 vs legacy 1/3 — legacy guesses and mutates). **Do not
  delete it.** Narrow it.
- Tuning this gate moves `restraint` and `task-multi-update` too. Grade all three together, never
  one in isolation — that single-scenario focus is what burned 08-15 → 08-17.

## Context for a fresh agent — read these, in this order

You are picking up the one genuine behavioral regression from a campaign that has otherwise
closed. Phase 4 **exited** on 2026-08-19; this does not block anything. Fix it well, not fast.

| #   | Read                                                                                                                                                                                      | Why                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | [`docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_SAME_DAY_COMPARATOR_2026-08-19.md`](../docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_SAME_DAY_COMPARATOR_2026-08-19.md) | **Start here.** Proves this is a real regression (legacy 3/3 vs worker 1/3) and not scenario drift, unlike [55](55-project-organize-contract-review-assertion.md). |
| 2   | [`docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_CONTINUATION_HANDOFF_2026-08-18.md`](../docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_CONTINUATION_HANDOFF_2026-08-18.md) **§4**                        | **Non-negotiable.** The two coercion mechanisms deleted from this exact file and why. Read before touching `readOnlyProvider.ts`.                                  |
| 3   | Same handoff, **§3.1**                                                                                                                                                                    | The majority-of-runs rule. A single-run failure is not a defect. Eleven runs in one day were spent violating this.                                                 |
| 4   | [`docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_SIX_CLASS_EXIT_BATTERY_2026-08-18.md`](../docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_SIX_CLASS_EXIT_BATTERY_2026-08-18.md)         | Per-repetition worker failure classification across all three batteries.                                                                                           |
| 5   | [`tasker/51`](51-worker-behavioral-parity-phase4.md)                                                                                                                                      | Phase 4 ledger (exited) — what P0–P6 built, and the semantic-review layer's history.                                                                               |

## The exact files

| Path                                                                                    | Role                                                                                                                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/worker/src/workers/agentic-chat/readOnlyProvider.ts:545`                          | `semanticReviewRequired` — the worker-only gate. Legacy has no equivalent.                                                                  |
| `…/readOnlyProvider.ts:2825, :2831`                                                     | Read-only reviewer prompt: "not read-only merely because its target or value remains ambiguous".                                            |
| `…/readOnlyProvider.ts:2900, :2901`                                                     | Contract reviewer prompt: "If multiple loaded entities plausibly match a descriptive reference … request clarification." **Prime suspect.** |
| `…/readOnlyProvider.ts:1770-1772`                                                       | Where a clarification decision is accepted from the reviewer.                                                                               |
| `apps/worker/tests/agenticChatReadOnlyProvider.test.ts`                                 | 60 focused provider tests, incl. the anti-coercion regression guard.                                                                        |
| `apps/web/src/lib/tests/agentic-e2e/scenarios/task-complete-cold-reference.scenario.ts` | What the scenario actually requires.                                                                                                        |

## Diagnose from retained artifacts first — no spend required

The decisive question is **who emitted the clarification**: the reviewer (veto) or the acting model
(its own choice). That single fact picks the fix.

```bash
jq -r '.turns[] | select(.scenarioId=="task-complete-cold-reference")
  | {rep: .repetition, passed: .assertionPassed,
     tools: [.toolExecutions[]?.tool_name], err: .assertionError}' \
  docs/plans/evidence/agentic_chat_worker_phase4_six_class_second_remediation_exit_2026-08-19_33b4faec.json

# And the two earlier batteries, to apply the majority-of-runs rule across 9 worker attempts:
docs/plans/evidence/agentic_chat_worker_phase4_six_class_exit_2026-08-18_091300faf.json
docs/plans/evidence/agentic_chat_worker_phase4_six_class_remediation_exit_2026-08-19_870c3feef.json
```

Legacy's 3/3 comparison turns are in
`agentic_chat_worker_phase4_six_class_LEGACY_comparator_2026-08-19_11c50cb2b.json`.

## Verifying a fix

Local, free, and sufficient to iterate:

```bash
pnpm --filter @buildos/worker test:run                     # full worker suite: 1,059 + 1 skip
pnpm --filter @buildos/worker exec vitest run tests/agenticChatReadOnlyProvider.test.ts   # focused: 60/60
pnpm --filter @buildos/worker typecheck && pnpm --filter @buildos/worker lint
```

**A live worker battery requires fresh explicit DJ authorization** and the full ritual: stage the
capability lists, flip routing, run, then unconditionally restore routing `false` + both capability
lists to exact empty strings, and independently read back. The mechanics are in the 08-18 handoff
§Step 4. Do not run one to "check" a fix — grade it locally first.

When you do grade live, grade `task-complete-cold-reference`, `restraint-noop-and-ambiguity`, and
`task-multi-update` **together**. Narrowing this gate moves all three. Single-scenario tunnel vision
is what burned 08-15 → 08-17.

## Working in parallel — file ownership

Three agents are working this campaign simultaneously. **Your lane is the worker provider.**

| Tracker                                                | Owns                                                                                   | Do not touch          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------- |
| [55](55-project-organize-contract-review-assertion.md) | `apps/web/src/lib/tests/agentic-e2e/**`                                                | `apps/worker/src/**`  |
| **56 (you)**                                           | `apps/worker/src/workers/agentic-chat/readOnlyProvider.ts` + its tests                 | the e2e scenarios     |
| Phase 5                                                | worker reliability/ops modules (`consumer.ts`, `capacity.ts`, `stalledRecovery.ts`, …) | `readOnlyProvider.ts` |

`readOnlyProvider.ts` is 4,090 lines and is the single hottest file in the campaign. If Phase 5
needs to touch it, coordinate through DJ rather than both editing it.

**Never commit without DJ's explicit approval, and always with an explicit pathspec**
(`git commit -- <paths>`) — never `git add .`, never `git commit -a`.
