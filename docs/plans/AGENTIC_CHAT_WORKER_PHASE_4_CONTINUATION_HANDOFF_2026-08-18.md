<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_CONTINUATION_HANDOFF_2026-08-18.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-19; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Agentic Chat Worker Phase 4 — Continuation Handoff (2026-08-18)

**Prepared:** 2026-08-18
**Repository:** `/Users/djwayne/buildos-platform`
**Branch:** `main`
**Current implementation HEAD:** `00246a8fc05dac93914274625dc111a0e18a615a`
**Local state:** the worker remediation, post-retest provider-state follow-up, and its scoped CI
repair are committed and pushed. The repository remains a shared dirty worktree; unrelated local
changes are outside this campaign and must not be included in a campaign commit.

**This document supersedes
`docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_CONTINUATION_HANDOFF_2026-08-16.md`.** That file is still
worth reading for the P0–P6 package history and the deployment/restore mechanics, but its exit
policy, its "run the full 8×3 battery next" instruction, and its section 8 prerequisites are all
retired. Where the two disagree, this one wins.

**PHASE 4 EXITED — 2026-08-19 (DJ decision). This supersedes every "NO EXIT" verdict below.**

The exit was closed by measuring the thing nobody had measured: **legacy, on the exact current
scenario definitions, on the same production server, same day, 3 repetitions, zero retries.**

| Scenario                         |  07-31 bar |             Worker | **Legacy same-day** |
| -------------------------------- | ---------: | -----------------: | ------------------: |
| `project-catchup-cold`           |    100.00% |                3/3 |             **2/3** |
| `project-organize`               |     83.33% |                0/3 |             **0/3** |
| `restraint-noop-and-ambiguity`   |    100.00% |                2/3 |             **1/3** |
| `task-complete-cold-reference`   |     91.67% |                1/3 |             **3/3** |
| `task-multi-update`              |    100.00% |                2/3 |             **3/3** |
| `task-reschedule-cold-reference` |     75.00% |                3/3 |             **3/3** |
| **All six**                      | **91.67%** | **11/18 (61.11%)** |  **12/18 (66.67%)** |

**The gate was requiring the worker to beat the reference implementation by 25 points.** Legacy
scores 66.67% against a bar of 91.67%. That bar came from 2026-07-31 artifacts, and two of the six
scenarios were made materially stricter on 2026-08-15 (commit `665ba01fc`) — after it was measured.
`declare_turn_contract` first appears anywhere in the repository on 2026-08-15, so legacy's 83.33%
on `project-organize` was recorded against a scenario that could not have required it. Section 3.2
caught this pattern once ("the comparator was itself tuned until green"); it recurred in a new form
and went unnoticed for four days.

Run provenance: clean detached worktree at exact `11c50cb2bae7206d9f756f0990ccc6c706c124da`,
`AGENTIC_E2E_EXECUTION_MODE=legacy_sse` against `https://build-os.com`, `$0.29185278` provider cost
(plus a `$0.01031364` one-turn preflight). **No production routing, cohort, or capability value was
read, changed, or restored** — `legacy_sse` posts directly to `/api/agent/v2/stream` and performs no
transport negotiation, so it cannot reach the worker regardless of flag state. Legacy emitted
**0 stream errors and 0 capture errors** across 21 turns; the worker emitted 2, both in
`project-organize`, both repaired in `6c73357ae`.

Evidence:
`docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_SAME_DAY_COMPARATOR_2026-08-19.md`;
artifact `agentic_chat_worker_phase4_six_class_LEGACY_comparator_2026-08-19_11c50cb2b.json`
(SHA-256 `e973464ff64aff43609066d36ed770b51982cf64e7364fb314faa378f046996a`).

**Two residuals, tracked separately, neither blocking:**

1. **`project-organize` is unsatisfiable by any implementation** — `tasker/55`. Its 08-15
   assertion requires `approve_turn_contract_review`, which exists **only** in
   `apps/worker/src/workers/agentic-chat/readOnlyTool.ts`. There is no definition anywhere under
   `apps/web/src`, so legacy structurally cannot call it. Legacy performs the organization work
   correctly (repeated `move_document_in_tree`) and fails the assertion anyway. This scenario drove
   two rounds of worker provider repair while carrying no parity signal.
2. **`task-complete-cold-reference` is the one real worker regression** — `tasker/56`. Legacy 3/3,
   worker 1/3, worker over-clarifying instead of completing a uniquely matched task. Prime suspect
   is the worker-only independent semantic reviewer (`readOnlyProvider.ts:545`), which legacy has no
   counterpart for and whose withholding gate was _tightened_ during the 08-19 remediation.

**Latency is a runtime property, not a migration cost.** Legacy turns ran 90–151s against
production in this same comparator; the worker battery measured p50 53.7s / max 151.0s. Carry it to
Phase 5 as a product problem in its own right, not as worker debt.

**Next: Phase 5** — reliability verification and operational hardening
(`AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md` §Phase 5, line 889).

---

**Latest continuation update (2026-08-19):** The authorized exact-`33b4faec` second remediation
retest is complete. The zero-spend worker lease preflight passed 1/1 in 7.823 seconds; the one
six-class x3, zero-retry battery improved to **11/18 scenario repetitions** and 14/21 turn
assertions at `$0.11939497`, but Phase 4 still does not exit. Catch-up and reschedule were 3/3,
restraint and multi-update 2/3, completion 1/3, and organization 0/3. Two organization turns were
deterministic stream errors: one invented unavailable `skill_search`; one attempted another tool
after durable clarification had switched the request to tool-free synthesis. The other five misses
were semantic/judgment outcomes.

The raw artifact is
`docs/plans/evidence/agentic_chat_worker_phase4_six_class_second_remediation_exit_2026-08-19_33b4faec.json`
(SHA-256 `7b01ae2dce6d023d2861f5a6fde1feb801e0c20ef14b72ab0ca194d442738438`).
Production is restored and independently read back: Vercel
`dpl_HiFX44rvVcJE15DmK1B6LnuxCLpF` is Ready and aliased with routing exact false; Railway
`59ab22eb-b4cf-4c88-8de1-1b0bffea462f` is SUCCESS on exact `33b4faec` with both capability lists
empty; the cohort is unchanged; worker and site return HTTP 200.

A bounded two-file follow-up gives unavailable `skill_search` the same one-shot,
non-executing admitted-surface repair as `skill_load`, and routes post-clarification prose through
the existing buffered forced-synthesis retry so one stray tool attempt is discarded rather than
failing the turn. Every other unknown tool and a repeated unavailable skill remain fail-closed.
Focused provider proof is 60/60; full worker is 1,059 passed plus one intentional skip; worker
lint/HTTP guard/typecheck and Prettier are green. The worker change landed inside aggregate commit
`6c73357aed37d6b50062fa2fd896082157bdedf6` and Railway deployment
`2a3c25d5-6621-4445-bea3-cceebafeb9ca` is SUCCESS on that exact revision. Its first CI run
[`32279811296`](https://github.com/Wolverine971/buildos-platform/actions/runs/32279811296) exposed
four stale web tests from the same aggregate project-route promotion, not worker regressions. The
scoped three-test repair landed as `00246a8fc05dac93914274625dc111a0e18a615a`; authoritative CI
run [`32282265304`](https://github.com/Wolverine971/buildos-platform/actions/runs/32282265304) passed
every required job in 12m26s. Vercel `dpl_C2CYjyvoq8gLb52MMMkivpVdwJqS` is Ready on the repair
commit with routing exact false and the cohort unchanged. Both mutation capability lists are
empty, the worker and site are healthy/HTTP 200, and no later paid retest occurred. Any paid retest
requires fresh explicit authorization.

**Continuation update (2026-08-19):** The first remediation retest is complete and Phase 4 still
does not exit. The worker repair landed in aggregate revision
`f5f9917e42aa88651aef72099ef037f591ecb274`; the follow-up CI stabilization landed as
`870c3feef15cfa978ecbc28f78eb447058d95f85`. Authoritative GitHub Actions run
[`32212816674`](https://github.com/Wolverine971/buildos-platform/actions/runs/32212816674)
passed every required job. The exact Vercel `870c3feef` deployment is Ready, the Railway worker is
on exact `f5f9917e`, and the zero-spend worker-lease preflight passed 1/1.

The authorized six-class x3, zero-retry production retest again passed **8/18 repetitions** and
11/21 turn assertions at `$0.10674149`. Deterministic stream-error turns improved from four to one,
but the scenario distribution moved rather than converged: catch-up 3/3, reschedule 2/3, restraint
2/3, multi-update 1/3, completion 0/3, and organization 0/3. The typed deterministic failure was
`create_onto_document` losing its admitted capability inside the unavailable-`skill_load` repair's
transient reduced surface. The remaining nine failures were semantic/judgment misses dominated by
over-clarification, plus one ambiguous over-mutation and one 2/5 completion-forward-carry judge.
Evidence and raw JSON are retained in the six-class packet and
`agentic_chat_worker_phase4_six_class_remediation_exit_2026-08-19_870c3feef.json` (SHA-256
`4480352b27ab9b82d4008b544f4d729e04b0f2d95ec60f225c1d8c5ab43f0fb5`).

Production is safely restored: Vercel `dpl_DvmkNiQ5ibkCUJyd63YSgCeoUj8C` is Ready and aliased with
routing exact `false`; Railway `8e251601-efe3-4029-9409-a25be0d61a11` is SUCCESS with both mutation
capability lists empty; the cohort is unchanged, the worker is healthy, and `build-os.com` is HTTP 200. The two-file follow-up restores the stable admitted surface after unavailable-skill repair,
applies semantic withholding to continuation mutations, and shares the commission rules with both
semantic-review prompts. It landed as `33b4faec017264e87ecda102cbd5db12a962316c` after focused
provider 59/59, full worker 1,058 plus one intentional skip, lint/HTTP guard, and typecheck passed.
Authoritative CI run
[`32218882941`](https://github.com/Wolverine971/buildos-platform/actions/runs/32218882941) is green;
Railway `e2eab557-0ab1-488a-b778-d3afe10b48fc` is SUCCESS and healthy on the exact commit with both
capability lists empty. The current production Vercel alias is
`dpl_AiKGEXaz645PQjMxj5dkT7C3CUJo`, Ready with routing false, the cohort unchanged, and HTTP 200. A
future authorized retest must recheck and then stage
`createOntoDocument,createOntoTask,updateOntoTask,moveDocumentInTree` in both capability lists.

**Continuation update (2026-08-18):** Steps 1, 2, and 3 are complete. DJ pushed the original
six-test CI-baseline remediation in aggregate commit
`ae3a241bd9fc8e847048f5e28e26ac9400ccd0fb`. Its CI run
[`32164236966`](https://github.com/Wolverine971/buildos-platform/actions/runs/32164236966)
exposed an older Twilio clock race. The deterministic follow-up pinned that clock, replaced a
wall-clock-expired checkpoint fixture with transaction-relative times, and bounded two loaded
coverage-test budgets without changing production behavior. Those four fixes landed in DJ's
aggregate `091300faf4a254762ce02219e108cff4c56d8582` commit. Authoritative CI run
[`32174155571`](https://github.com/Wolverine971/buildos-platform/actions/runs/32174155571) is fully
green: typecheck, schema tooling, lint, coverage, deep-research database integration, and coverage
artifact upload all succeeded. The exact local `pnpm turbo test:coverage` gate also passed 17/17
tasks, including 593/593 web files and 3,786/3,786 web tests.

The current `091300faf4a254762ce02219e108cff4c56d8582` revision has successful Vercel and Railway
commit statuses. Railway deployment `f7e4a72d-0c1c-4ec1-af39-ad2d00c1cf5c` succeeded, Vercel
deployment `HUCifbpry3KaDmj3qaASd9RMoKrx` succeeded, and `https://build-os.com` returned HTTP 200.
The legacy comparator is retained at
`docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_COMPARATOR_2026-08-18.md`. The authorized
six-class production battery subsequently ran and is retained in
`docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_SIX_CLASS_EXIT_BATTERY_2026-08-18.md`. It passed
8/18 scenario repetitions at `$0.08247295`, so Phase 4 does not exit. Production was restored and
independently read back: routing exact `false`, the cohort unchanged, both worker capability lists
empty, Vercel/Railway healthy, and the public site HTTP 200. Campaign documentation remains local
and uncommitted. A bounded local repair now handles one unavailable `skill_load` attempt without
execution, retains the permanent fail-closed boundary on repetition or any other unadvertised tool,
and strengthens the semantic disposition guidance for the six-class misses. Focused provider
tests pass 59/59; the full worker suite passes 1,058 with one intentional skip; typecheck and lint
pass with zero errors. The repair has not been committed, deployed, or production-retested.

---

## 1. Read this first — the five things that will bite you

1. **Do not resume the 08-17 live-gate loop.** Fourteen production gate runs between 08-15 and
   08-17 (eleven on 08-17 alone, median 51 minutes per cycle) chased a gate that flaps. Section 3
   explains why. Running another canary before reading it repeats the loop.
2. **Do not make another commit without DJ's approval.** He pre-stages unrelated work and the
   worktree is shared with other sessions. The two originally staged worker files and the local
   calendar/style changes were included in DJ's aggregate `31a89acd6` commit, and the first six
   CI-remediation tests were included in DJ's `ae3a241bd` commit, and the four deterministic
   follow-ups were included in DJ's `091300faf` aggregate commit. A separate
   PulseStrip/ProjectWorkspace batch was staged when this update was recorded. Campaign docs
   remain modified/untracked. For any later approval, use an **explicit pathspec** — never
   `git commit -a`, never `git add .` — and recheck the index.
3. **Do not reintroduce the coercion removed in section 4**, and do not invent a new variant of it
   to make a scenario go green. If a scenario needs the model to behave differently, the lever is
   the scenario prompt or the system prompt — not a code path that overrides the model and fails
   the turn when it disagrees.
4. **Production is off and must stay off** until DJ authorizes a run: web routing exact `false`,
   cohort exactly `76c04859-837c-4d13-88ea-9a39ed15ed81`, both worker mutation-capability lists
   exact empty strings. Any run restores this unconditionally afterward, pass or fail.
5. **`main` is green, but all three exit batteries missed.** CI run `32218882941` passed every
   required job on `33b4faec`. The first two six-class batteries passed 8/18; the latest improved
   to 11/18 but still emitted two deterministic stream errors. See Step 4 and the retained evidence
   packet. Do not run another paid retest without fresh DJ authorization.

---

## 2. Where this actually stands

| Package                         | State                                               |
| ------------------------------- | --------------------------------------------------- |
| P0 — differential harness       | Complete                                            |
| P1 — read parity                | Complete (passed a 9/9 live gate on 08-09)          |
| P2 — mutation/effects           | Complete under a bounded 39/20/19 catalog partition |
| P3 — history/attachments/vision | Complete under gates                                |
| P4 — supervisor/finalization    | Complete deterministically                          |
| P5 — telemetry/billing/metadata | Complete deterministically and in hosted schema     |
| P6 — deterministic matrix       | Complete                                            |
| P6 — hosted quality battery     | **Re-scoped 2026-08-18 — see section 5**            |

**The implementation is done.** What was not done, and what burned the last three days, was the
exit ritual. Phase 4 opened 2026-08-07; the migration opened 2026-07-29. Routing has been `false`
with a one-user cohort that entire time, so **no user has received any benefit from any of it**,
and Phase 5 (reliability hardening) and Phase 6 (cohort ramp) both sit behind this gate.

---

## 3. Why the loop was not converging

All three findings are reproducible from `docs/plans/evidence/agentic_chat_worker_phase4_*.json`.

### 3.1 The gate flaps, and flaps were being treated as defects

`research-turn-finalizes`, across near-identical revisions:

| Time (08-17) | Result | Failure                         |
| ------------ | ------ | ------------------------------- |
| 16:47        | PASS   | —                               |
| 17:40        | PASS   | —                               |
| 18:53        | PASS   | —                               |
| 19:30        | FAIL   | LLM judge scored 1/5 (needed 3) |
| 20:15        | FAIL   | `provider_tool_not_allowlisted` |
| 20:59        | FAIL   | narration ordering              |
| 22:25        | PASS   | —                               |

Two of those three failures are stochastic assertions on model behavior. No code change makes an
LLM judge deterministic. **Rule going forward: a single-run failure is not a defect. Treat it as a
defect only when the same scenario fails on the same assertion in a majority of runs.**

### 3.2 The exit bar exceeded its own comparator

The retired bar was 24/24 scenario repetitions plus 30/30 turn assertions with zero retries — a
perfect score. Legacy's own Phase 0 baseline, on 2026-07-31, scored:

| Revision            | Result |
| ------------------- | ------ |
| `fa3987ba7` (00:48) | 25/30  |
| `90d99599c` (01:36) | 26/29  |
| `90796dc5e` (02:30) | 29/30  |
| `0f63e47bb` (03:33) | 30/30  |

Perfect **once in four**. And two of those four iterations were harness changes
(`harden phase 0 research gate`, `track every start here surface`), not product fixes — the
comparator was itself reached by tuning until green. Demanding a clean 30/30 from the worker was
demanding that it beat the thing it was supposed to match.

### 3.3 Effort concentrated on a quarter of the surface

Every run after 08-15 targeted only `research-turn-finalizes` and `research-log-readback`. From
the 08-15 full battery, six scenario classes were green and stayed untested for three days:
`restraint-noop-and-ambiguity` (6/6), `task-reschedule-cold-reference` (3/3), `task-multi-update`
(3/3), `project-catchup-cold` (3/3), plus `task-complete-cold-reference` and `project-organize`
(both green on the 08-15 remediation retest).

### 3.4 What the loop legitimately found — keep these

- **`ba6cac3e7`** — `latestUserMessage` was never forwarded into `selectFastChatTools`, so web
  tools were never admitted to the fast-chat tool surface. Both `/api/agent/v2/stream` and
  `worker-turn-preparation.server.ts` call `resolveFastChatTurnPreparation`, so **this was a live
  production bug on the legacy path too**, not just the worker. One line.
- **`e995c1c2`** — a dangling rejected provider promise escaped as an unhandled rejection after
  the typed timeout had already been surfaced, restarting the Railway worker. Verified fixed: the
  08-16 canary showed constant health timestamps and no `Unhandled Rejection`.
- **`5228551b6`** — the browser transport client allowed 3 seconds for negotiation while the
  server is allowed 5s of capacity observation plus a bounded 2.5s retry. Valid worker leases were
  being silently downgraded to legacy.

Total provider spend across all fourteen runs: **`$0.3908`**. Money was never the constraint.

---

## 4. What changed on 2026-08-18 (deployed in `31a89acd6`)

### 4.1 The coercion is removed

Commit `897e16465` had added two mechanisms to production worker code
(`apps/worker/src/workers/agentic-chat/readOnlyProvider.ts`) purely to satisfy scenario
assertions. Both are deleted.

**`requiresExternalWebResearch` — a regex over the user's own message.** It matched an
investigation verb (`look into|research|investigate|compare|benchmark|find out`) against a
market noun (`competitors?|alternatives?|market|landscape|industry|pricing|prices?|charge|costs?|…`).
On a match the worker forced at least two live web calls, injected a system directive telling the
model not to answer from memory, and after two repair rounds **hard-failed the entire turn** with
`provider_required_web_research_missing`.

> "compare my task costs across projects" matches both regexes. That is a purely internal
> question, and it would have been forced onto the open web with 30–60 seconds of added latency
> and turn failure as a possible outcome.

Removed with it: `buildRequiredWebResearchRequest`, `hasPendingRequiredWebResearch`,
`takeRequiredWebResearchRepair`, the `requiredWebResearchCalls` / `webResearchRepair` request
fields, the `MAX_REQUIRED_WEB_RESEARCH_REPAIR_ROUNDS` / `REQUIRED_EXTERNAL_WEB_RESEARCH_CALLS`
constants, the continuation `toolChoice` override, and both repair call sites (in `streamTurn`
and `streamContinuation`).

**`buildPreToolNarration` — canned prose attributed to the assistant.** When the model called a
tool without narrating first, the worker injected `"I'll check the relevant details before I
answer."` as a real `text_delta`, so **users saw words the model never wrote**. All three
injection sites are gone, along with the now-write-only `publicTextEmitted` flag.

The honest signal already existed and still fires on every tool round: `buildPlanningStep` emits
an `agent_state` event with `currentActivity: 'Planning the first step...'`. Neither removed
mechanism ever existed on the legacy path, so removing them moves the worker _toward_ parity.

Blast radius of the removal is zero — routing was `false` for the entire time this code existed
in production.

### 4.2 A regression guard is pinned

`apps/worker/tests/agenticChatReadOnlyProvider.test.ts` gains
**"never forces live web research or injects narration the model did not write"**: it sends the
exact market-research message with both web tools available and asserts a single provider pass, no
forced round, and no system message naming `web_search`/`web_visit`.

The test file also lost the forced-market-research test wholesale, fourteen narration
expectations, and three supervisor-observation lists that counted the injected
`assistant_text_delta`.

### 4.3 Verification

Net **−301 lines**. All green as of 2026-08-18:

| Gate                                     | Result                               |
| ---------------------------------------- | ------------------------------------ |
| `pnpm --filter @buildos/worker test:run` | 1056 passed, 1 skipped               |
| Focused `tests/agenticChat*`             | 458/458                              |
| `@buildos/agentic-chat-runtime`          | 243/243                              |
| Worker typecheck (native TS7)            | clean                                |
| Worker ESLint                            | 0 errors (176 pre-existing warnings) |
| Prettier, both touched files             | clean                                |

### 4.4 Landing boundary

DJ's aggregate commit `31a89acd68d475b436582e806cbd7130fc826241` landed the two worker files
alongside the calendar split, its tests, the two style-contract fixes, and generated schema/context
artifacts. It is on `origin/main`. This continuation did not stage, commit, or push it. The index
was empty after the shared worktree advanced; the comparator, this handoff, and tasker updates are
still local documentation and must not be swept into a later commit without explicit approval.

---

## 5. The redirected plan — three DJ-ratified decisions

### Decision 1 — split the exit bar into two lanes

Retire 24/24 + 30/30 zero-retry. Replace with:

**Deterministic lane — must be 100%, no exceptions.** Every turn must show exact
`worker_realtime/agentic_chat_worker_v1` attribution, a durable completed terminal, zero stream
errors, zero capture errors, a retained prompt snapshot, no worker restart or unhandled rejection,
and retained cost/timing/footprint evidence. A miss here is a real defect. Fix it.

**Judgment lane — statistical, graded against legacy.** LLM-judge scores and narration/ordering
assertions are scored as a rate across three battery runs and must be **no worse than legacy's
measured rate on the same scenario**. Perfection is not the bar; parity is.

Before grading anything, compute legacy's per-scenario rate from the four retained 07-31
artifacts (`agentic_chat_worker_phase0_gate_2026-07-31_*.json`). That number is the bar. Write it
down in the evidence packet so the next person does not have to re-derive it.

A judgment-lane miss is **never** grounds for a code change unless section 3.1's
majority-of-runs rule is met. Record flaps as flaps.

### Decision 2 — the coercion stays out

Section 4. If a scenario cannot pass without overriding the model, that is information about the
scenario or the prompt, not a defect in the provider.

### Decision 3 — exit Phase 4 on the six clean scenario classes

Certify Phase 4 on: `restraint-noop-and-ambiguity`, `task-reschedule-cold-reference`,
`task-multi-update`, `project-catchup-cold`, `task-complete-cold-reference`, `project-organize`.

Move `research-turn-finalizes` and `research-log-readback` to **Phase 5**, alongside the latency
work they are entangled with.

**Expect both research scenarios to fail their narration and research-call assertions on the next
run. That is the correct and predicted outcome** of removing the coercion. It is not a regression,
and it does not block the exit.

---

## 6. Exact next sequence

### Step 1 — get `main` green (do this first)

**Complete.**
[`tasker/54-calendar-route-size-guard.md`](../../tasker/54-calendar-route-size-guard.md) is
implemented and deployed: the route is 267 lines and its suite passes 13/13. DJ pushed the first
six test-contract remediations in `ae3a241bd`; its CI run exposed one Twilio clock race. The
four-file follow-up also repairs a date-expired PostgreSQL fixture and two loaded coverage-test
budgets. It landed in aggregate commit `091300faf4a254762ce02219e108cff4c56d8582`.
`pnpm turbo test:coverage` passed all 17 local tasks, including 593/593 web files and 3,786/3,786
tests, and authoritative CI run
[`32174155571`](https://github.com/Wolverine971/buildos-platform/actions/runs/32174155571) completed
successfully on that exact SHA.

The provider remediation later landed in `f5f9917e`, and the loaded document interaction test's
lazy-import CI stabilization landed in `870c3feef`. Authoritative run
[`32212816674`](https://github.com/Wolverine971/buildos-platform/actions/runs/32212816674)
passed every required job. Exact local coverage passed 17/17 tasks, including 595/595 web files and
3,800/3,800 web tests.

### Step 2 — get the removal committed and deployed

**Complete.** Exact revision `31a89acd68d475b436582e806cbd7130fc826241` is on `origin/main` and
verified on both surfaces:

- Vercel `dpl_4A7ZYnA1LvT6c4wemvmryX7b9iN6` — Ready, production target, aliased to
  `build-os.com`.
- Railway `833de648-4eab-489f-a1d5-7fd9f8d6ac8d` — SUCCESS for the exact SHA on
  `queue-worker / production` (GitHub deployment record `5966481319`).
- `https://build-os.com` — HTTP 200 after deployment.

### Step 3 — establish the legacy comparator (no spend, do it now)

**Complete.** The per-scenario rates, source hashes, aggregation rule, and reproduction command
are retained in
`docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_COMPARATOR_2026-08-18.md`.

### Step 4 — one six-class battery, DJ-authorized

**Complete — battery executed, missed, and restored.** Green CI was satisfied and DJ authorized
the single run. The result was 8/18 scenario repetitions, 11/21 turn assertions, four stream-error
turns, zero capture-error turns, and `$0.08247295` provider cost. Production restoration is
independently verified. Evidence:
[`AGENTIC_CHAT_WORKER_PHASE_4_SIX_CLASS_EXIT_BATTERY_2026-08-18.md`](evidence/AGENTIC_CHAT_WORKER_PHASE_4_SIX_CLASS_EXIT_BATTERY_2026-08-18.md).

**Remediation retest also complete — still 8/18, restored.** The 2026-08-19 run used clean exact
web revision `870c3feef`, worker revision `f5f9917e`, the corrected three-capability staging list,
and the same one-user cohort. The zero-spend preflight passed 1/1; the paid x3 battery again passed
8/18 repetitions and 11/21 turn assertions, with one stream-error turn, zero capture errors, and
`$0.10674149` provider cost. Production is restored off/empty and healthy. The checksum-backed
artifact is
`evidence/agentic_chat_worker_phase4_six_class_remediation_exit_2026-08-19_870c3feef.json`.

**Second remediation retest complete — 11/18, still no exit, restored.** The latest run used a
clean exact-`33b4faec` worktree, the four-capability inventory, and the same exact one-user cohort.
The zero-spend preflight passed 1/1; the one paid x3 battery passed 11/18 repetitions and 14/21 turn
assertions with two stream-error turns, zero capture errors, and `$0.11939497` provider cost. The
artifact is
`evidence/agentic_chat_worker_phase4_six_class_second_remediation_exit_2026-08-19_33b4faec.json`.
The EXIT path restored Vercel routing false and both Railway capability lists empty. Final receipts
are Vercel `dpl_HiFX44rvVcJE15DmK1B6LnuxCLpF` and Railway
`59ab22eb-b4cf-4c88-8de1-1b0bffea462f`; worker and public site are healthy.

Command shape (from the 08-16 handoff, scenario list changed):

```bash
AGENTIC_E2E_BASE_URL=https://build-os.com \
AGENTIC_E2E_EXECUTION_MODE=worker_realtime \
AGENTIC_ASSERT_TELEMETRY=true \
AGENTIC_PHASE0_CAPTURE=true \
AGENTIC_PHASE0_REPETITIONS=3 \
AGENTIC_E2E_RUN_LABEL=phase4-six-class-exit \
AGENTIC_SCENARIOS=restraint-noop-and-ambiguity,task-reschedule-cold-reference,task-multi-update,project-catchup-cold,task-complete-cold-reference,project-organize \
pnpm --filter @buildos/web exec vitest run \
  --config vitest.config.agentic.ts \
  src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts \
  --retry=0
```

**Pre-run mutation inventory (superseded by the retained result):**

| Scenario                         | Mutation tool           | Capability key       |
| -------------------------------- | ----------------------- | -------------------- |
| `task-complete-cold-reference`   | `update_onto_task`      | `updateOntoTask`     |
| `task-multi-update`              | `update_onto_task`      | `updateOntoTask`     |
| `task-reschedule-cold-reference` | `update_onto_task`      | `updateOntoTask`     |
| `project-organize`               | `move_document_in_tree` | `moveDocumentInTree` |
| `project-catchup-cold`           | none                    | —                    |
| `restraint-noop-and-ambiguity`   | none                    | —                    |

Enable exactly `updateOntoTask,moveDocumentInTree` in **both** the provider and adapter mutation
capability lists, and nothing else. Note this differs from the 08-16 handoff, which named
`createOntoTask` for a narrower research canary — that is not one of these six scenarios.

**Correction after the initial run:** this inventory was incomplete. Two `project-organize` repetitions
legitimately selected a create-parent-then-move strategy and failed closed when
`create_onto_document` was not advertised. A future authorized retest must include
`createOntoDocument` in addition to `updateOntoTask,moveDocumentInTree`, after rechecking the exact
scenario surface. The other two fail-closed calls were unavailable `skill_load`, which is a
provider/tool-surface contract defect rather than a mutation capability.

**Correction after the remediation retest:** `task-complete-cold-reference` permits and rewards a
model-authored follow-up task as one valid durable forward-carry strategy. The next exact inventory
is therefore `createOntoDocument,createOntoTask,updateOntoTask,moveDocumentInTree` in both lists,
subject to a fresh exact-surface recheck.

Expected cost: roughly `$0.10–0.15` based on the 08-15 battery's `$0.1445` for twenty turns.

### Step 5 — grade against the two lanes and exit

**NO EXIT.** The deterministic lane missed on four fail-closed non-allowlisted provider calls; the
judgment lane missed six more attempts through over-clarification. Only
`restraint-noop-and-ambiguity` and `project-catchup-cold` met their comparator rows. The checksum,
deployment receipts, comparator, typed failure diagnostics, timings, and restored values are in the
Step 4 evidence packet.

Fix the staged capability inventory and semantic/provider contract locally. Do not reintroduce the
removed coercion, and do not run another paid battery without fresh DJ authorization.

**First remediation was retested; its follow-up was deployed and has now also been retested.** The first repair
reduced deterministic stream-error turns from four to one, but its unavailable-skill retry retained
a transient semantic-gate subset and lost `create_onto_document` despite the staged capability.
The two-file follow-up:

1. restores the stable admitted surface after the one non-executing unavailable-`skill_load`
   retry, so a reviewed mutation does not become falsely unadvertised;
2. applies the pre-mutation semantic withholding gate to continuation passes as well as the initial
   pass, preventing a restored direct mutation from bypassing disposition and review;
3. keeps repeated `skill_load` and every other non-advertised tool permanently fail-closed;
4. shares completion, reschedule/priority, multi-change, and delegated-organization guidance
   across the acting gate and both independent semantic-review prompts; and
5. retains clarification for genuine multiple-target ambiguity.

Proof: focused provider 59/59, full worker 1,058 passed plus one intentional skip, worker typecheck
clean, worker lint/HTTP guard zero errors, and Prettier clean for both files. Commit `33b4faec0` is
on `origin/main`; CI run `32218882941` is green; Railway `e2eab557` is SUCCESS and healthy with
both capability lists empty. The corrected future capability list is
`createOntoDocument,createOntoTask,updateOntoTask,moveDocumentInTree` in both provider and adapter
configuration after an exact surface recheck. The exact follow-up retest is recorded above.

**Latest deterministic follow-up is shipped, but not paid-retested.** The latest evidence identifies two bounded state
machine defects: unavailable `skill_search` did not enter the existing unavailable-skill repair,
and tool-free synthesis after `request_turn_clarification` failed immediately on one stray tool
attempt instead of using the existing buffered retry. Both are repaired without executing the
rejected call or widening the advertised surface. Proof is focused provider 60/60, full worker
1,059 plus one intentional skip, worker check green, and Prettier clean. The two worker files are
deployed in exact Railway revision `6c73357ae`; the route-promotion test drift was repaired in
`00246a8fc`, whose CI run `32282265304` is green. Production remains routing false with both
capability lists empty. The paid gate still requires fresh authorization and unconditional
restoration.

---

## 7. Carried to Phase 5

1. **Latency is the real product problem and it is not in the gate.** Passing runs show p50
   terminal ~97s and max ~268s; `project-organize` _passed_ at 267.7 seconds. DJ's standing
   constraint holds and is not negotiable: **no chat-level hard wall.** Bound individual provider
   operations, fall back or recover when safe, preserve durable tool/effect work, and finish with
   honest partial/error state. Never silently discard a viable long-running chat.
2. **The provider long tail.** A 90-second configured request deadline against a ~140.5-second
   observed provider boundary. These are not the same measurement. Instrument the timeline —
   attempt start, `openRoute`/header time, deadline firing, body-read rejection, usage logging,
   terminal finalization — before proposing another timeout policy. Throughput-sorted provider
   routing is a mitigation, not a root cause.
3. **`research-turn-finalizes` and `research-log-readback`**, per Decision 3. Approach them as
   prompt/scenario work, not provider work.
4. **`agent_call_session_id` context linkage.** Worker mutation adapters pass a chat-session UUID
   through the legacy field, producing non-blocking activity-log foreign-key errors on Railway
   while the task writes themselves succeed.
5. **Prompt-snapshot capture noise.** `agentic_chat_prompt_snapshot_messages_mismatch` appeared in
   Railway logs during earlier canaries with the snapshot rows absent. The `ba6cac3e7` retest
   retained one snapshot per turn, so this may already be closed — confirm on the Step 4 battery
   rather than assuming.
6. **Green CI is restored.** DJ's `ae3a241bd` commit contains the six older contract remediations
   exposed by the route split. CI run `32164236966` kept typecheck, schema tooling, and full lint
   green, then found one unrelated Twilio clock race: constructing `now + 30 minutes` and flooring
   against a later `now` can render 29 minutes. The follow-up pins `Date` in that test. A complete
   local PostgreSQL-backed run then found three more time-dependent test-harness defects:
    - active checkpoint fixtures expired on the wall clock after their hard-coded 2026-08-14
      deadline; active/expired fixtures now use transaction-relative times;
    - `DocumentModal.test.ts` allowed its lazy-content wait the entire five-second Vitest test
      budget; the test now has a bounded ten-second envelope around the five-second wait;
    - `task-get-not-found.test.ts` charged a heavy route-module transform to the first test's
      five-second budget; the mocked route is now imported during collection.

    No production code or behavior changes. Focused Twilio coverage passed 9/9, the focused
    PostgreSQL contract passed 1/1, the two loaded web tests passed 12/12 with coverage, and exact
    `pnpm turbo test:coverage` passed 17/17 tasks, including 593/593 web files and 3,786/3,786 web
    tests. The fixes landed in `091300faf`; authoritative CI run `32174155571` passed every
    required job on that exact SHA. Vercel and Railway commit statuses succeeded and the production
    site returned HTTP 200. No production battery, flag change, or provider spend occurred.

---

## 8. File map

| Purpose                                                         | Path                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Authoritative ledger                                            | `tasker/51-worker-behavioral-parity-phase4.md`                                         |
| This handoff                                                    | `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_CONTINUATION_HANDOFF_2026-08-18.md`            |
| Prior handoff (history + deploy mechanics; exit policy retired) | `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_CONTINUATION_HANDOFF_2026-08-16.md`            |
| Master plan                                                     | `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md` §Phase 4        |
| Independent evaluation                                          | `docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_INDEPENDENT_EVALUATION_2026-08-13.md` |
| Legacy comparator source                                        | `docs/plans/evidence/agentic_chat_worker_phase0_gate_2026-07-31_*.json`                |
| Derived legacy comparator                                       | `docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_COMPARATOR_2026-08-18.md`      |
| All fourteen Phase 4 gate artifacts                             | `docs/plans/evidence/agentic_chat_worker_phase4_*.json`                                |
| Worker provider (the file that changed)                         | `apps/worker/src/workers/agentic-chat/readOnlyProvider.ts`                             |
| Regression guard                                                | `apps/worker/tests/agenticChatReadOnlyProvider.test.ts`                                |
| Route-size remediation ledger                                   | `tasker/54-calendar-route-size-guard.md`                                               |

---

## 9. Verdict

Phase 4's code has been finished for days. What was blocking it was a gate that demanded a
perfect score from a stochastic system, measured against a comparator that had itself been tuned
until it passed. The redirect is: grade the deterministic parts absolutely, grade the judgment
parts against what legacy actually achieves, ship the six scenario classes that have been green
since 08-15, and move research and latency into Phase 5 where they belong together.

The goal was never a green artifact. It was routing that can stay on for real users. Nothing in
this campaign has reached a user yet, and every day the gate stays closed is a day that stays
true.

**Latest 2026-08-19 verdict:** the second remediation retest improved to 11/18, so Phase 4 remains
closed and routing must remain off. The two deterministic stream-error causes are now repaired,
deployed, and green in authoritative CI, but they have not been paid-retested. Do not infer
readiness from the higher aggregate or from deterministic test coverage alone: four scenario
classes still miss their legacy comparator rows. A new production quality battery is the next
evidence step only after fresh explicit authorization; until then routing stays false and both
mutation capability lists stay empty.
