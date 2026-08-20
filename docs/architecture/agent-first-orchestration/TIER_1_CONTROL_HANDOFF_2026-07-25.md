<!-- docs/architecture/agent-first-orchestration/TIER_1_CONTROL_HANDOFF_2026-07-25.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-07-26; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Handoff — Tier 1: make the Phase A comparison identifiable

**Date:** 2026-07-25
**Audience:** an agent picking this up cold, with no prior session context
**Authorized by:** DJ, 2026-07-25 ("run this complete tier one control")
**Budget:** ~$15–20 model spend, ~2 days of work, plus 2–3 hours of DJ's labeling time
**Prerequisite:** Tier 0 is complete and green (see §3). Do not redo it.

---

## 0. STOP — "Tier 1" is ambiguous in this repo. Read this first.

There are **two unrelated things called Tier 1** in `docs/architecture/agent-first-orchestration/`:

|         | This document                                                     | Not this document                                                       |
| ------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Name    | **Tier 1 — the control confound**                                 | Tier 1 — breadth gap list                                               |
| Source  | [`research/SYNTHESIS.md`](./research/SYNTHESIS.md) §6             | [`OPEN_BRIEF_EVAL_METHODOLOGY.md`](./OPEN_BRIEF_EVAL_METHODOLOGY.md) §3 |
| Goal    | Make the Phase A workflow-vs-control comparison **interpretable** | Add 6 deterministic e2e scenarios to the verifiable-baseline suite      |
| Touches | `packages/agent-orchestrator`, both paid harnesses                | `apps/web/src/lib/tests/agentic-e2e/scenarios/`                         |

**You are doing the first one.** If you find yourself writing scenarios in
`agentic-e2e/scenarios/catalog.ts`, you are in the wrong document.

---

## 1. What this project is, in one page

BuildOS is testing whether an **agent-first** architecture (a small CEO/orchestrator routing work to
bounded specialist agents) beats the existing **context-first** architecture (one general agent with
a large context and tool surface).

Phase A is a deliberately cheap falsification harness — no database, no queue, no UI — that tests
one claim about model behavior:

> A small orchestrator with a limited world model, plus bounded specialists, beats one
> context-heavy agent on complex work, without making simple work unacceptably slow.

Two lanes:

- **Control lane** — the real production agentic-chat v2 SSE endpoint (`/api/agent/v2/stream`),
  driven by `apps/web/src/lib/tests/agentic-e2e/phase-a/phase-a-control.test.ts`.
- **Workflow lane** — the in-process orchestrator: route → compile stage → `Promise.all` steps →
  digest → transition → synthesis, driven by
  `apps/worker/tests/phase-a/phaseAWorkflowEval.test.ts`.

Everything is pre-registered: bounds, prompts, model pins, corpus, and blind-scoring mechanic were
frozen before measurement, and results are hashed. **Read [§7 Rules of engagement](#7-rules-of-engagement-non-negotiable) before changing
anything** — this is an experiment, not a feature branch.

**Current state:** Routing (A1) sits at 61/72 against a ≥65/72 bound → recorded **Change**. The
workflow comparison (A2) is built but has **zero scored outputs**. No Phase A verdict exists.

### Required reading, in order

1. [`research/SYNTHESIS.md`](./research/SYNTHESIS.md) — the verdict and the tiered plan. §6 Tier 1
   is your scope; §2.1 is your primary problem.
2. [`research/10_ROUTING_FAILURE_FORENSICS.md`](./research/10_ROUTING_FAILURE_FORENSICS.md) — why
   the routing number is not what it looks like.
3. [`research/09_INTERNAL_GROUND_TRUTH_MAP.md`](./research/09_INTERNAL_GROUND_TRUTH_MAP.md) —
   code-level ground truth and every docs-vs-code discrepancy. Trust this over prose docs.
4. [`PHASE_A_FALSIFICATION_PLAN.md`](./PHASE_A_FALSIFICATION_PLAN.md) — the frozen decision rule and
   amendments 1–4. **Amendment 4 records what Tier 0 changed.**
5. [`NEXT_ITERATION.md`](./NEXT_ITERATION.md) — operational runbook. Note its STOP block.

Skim only if needed: `research/04_AGENT_BENCHMARKS_AND_HARNESS_DESIGN.md` (why the confound is
fatal), `research/03_EVAL_METHODOLOGY_PRACTITIONERS.md` (the statistics).

---

## 2. Why Tier 1 exists — the problem in one paragraph

**The two lanes run different models, so the architecture claim is unidentifiable at any sample
size.** The control runs `deepseek/deepseek-v4-flash` on the `balanced` profile. The workflow lane
ends with **GLM 5.2 on `powerful` writing the synthesis text a judge actually reads**. So the
measured contrast is "multi-agent + a better writer + web tools" versus "single agent + a cheap
writer." Three independent research chapters flagged this; Anthropic reports token budget alone
explains ~80% of variance on BrowseComp. Controlled-comparison practice (GAIA, HAL's 9-model ×
9-benchmark grid) holds the model fixed and varies only the scaffold.

If you score the comparison without fixing this, a workflow win means nothing, and everyone's time
is wasted. **That is the whole point of Tier 1.**

---

## 3. What Tier 0 already did (do not redo)

All complete, tests green, **uncommitted**. Recorded as amendment 4 in the falsification plan.

- The three corpus validators that returned `passed: false` in the workflow lane are implemented;
  both lanes now score through **one** module (`testing/harness/acceptance-eval.ts`). An
  unimplemented validator id now **throws** instead of failing a check.
- Both paid harnesses are typechecked: `pnpm typecheck:phase-a` in `apps/web` and `apps/worker`.
- `pnpm test:agentic:phase-a-route-v5` was **removed** — it had drifted to be byte-identical to
  `test:agentic:phase-a-route-mitigation-v2`.
- `pnpm --filter @buildos/agent-orchestrator reanalyze:routes` derives item accuracy, `pass@k`,
  `pass^k`, self-consistency, and a 4×4 confusion matrix from already-paid results without touching
  them.
- Two result files were restored to their exact original bytes so their recorded SHA-256 values
  reproduce again. `results-manifest.test.ts` now fails if any hash stops reproducing, and the
  evidence directories are in `.prettierignore`.
- `summary.decision` → `summary.routeAccuracyDecision` (it was never the pre-registered verdict).
- `ROUTE_MODEL_MAX_TOKENS` 900 → 2,400; `finish_reason=length` is now infrastructure-invalid.
- C07 excluded from the primary blind-win denominator (`testing/harness/comparison-eligibility.ts`).

Verify before starting:

```bash
cd /Users/djwayne/buildos-platform
pnpm --filter @buildos/agent-orchestrator test:run        # expect 19 files / 149 tests green
cd apps/web && pnpm typecheck:phase-a                     # expect clean
cd ../worker && pnpm typecheck:phase-a                    # expect clean
```

---

## 4. The four work items

### 4.1 — WI-1: Pin the control lane's model (the whole point)

**The mechanism exists.** `apps/web/src/routes/api/agent/v2/stream/+server.ts:324` reads:

```ts
const FASTCHAT_EVAL_PINNED_MODELS = parseFastChatPinnedModels(
	process.env.FASTCHAT_EVAL_PINNED_MODELS
);
```

and passes it as `pinnedModels` at `:2808`. In
`lib/services/agentic-chat-v2/model-tiering.ts:239-289`, a non-empty `pinnedModels` **overrides all
tiering** — it short-circuits `useFastInitialPlan`, `useDedicatedForcedSynthesis`, and the
`modelTieringVariant` reporting, and sets `models` directly. Format is comma-separated
(`model-tiering.ts:153`).

**Three landmines, all of which will silently ruin the run:**

1. **It is read at module load**, as a top-level `const` from `process.env`. It cannot be set
   per-request and it will not pick up a change while the dev server is running. **You must restart
   the dev server with the variable set**, and it goes in the _server's_ environment, not the test
   process's.
2. **The control test hard-codes the old pin in its validity check.**
   `phase-a-control.test.ts:69-73` marks any run whose model is not `deepseek/deepseek-v4-flash`
   as invalid. If you pin GLM 5.2 without changing this, **every single run comes back
   infrastructure-invalid.** Parameterize it (read the expected pin from an env var, defaulting to
   the current value so historical behavior is unchanged) — do not delete the check. Per-role pin
   verification is a deliberate audit fix (S4); weakening it is a regression.
3. **Verify the pin actually took effect** before spending a full cohort. Do one run, then confirm
   the report's observed model list is the pinned model. `eval_pinned_models` is already emitted in
   observability at `+server.ts:3631` — use it.

**Which model to pin — a real design decision, not a mechanical step.**

The workflow lane is a _pipeline_ of three models (Gemini router → DeepSeek researcher → GLM 5.2
synthesis). A single-model control cannot be matched to all three. The recommendation:

> **Pin the control to the workflow lane's synthesis model (GLM 5.2), because that is the model
> writing the text the judge reads.** This removes the single largest confound — "the multi-agent
> lane just had a better writer." The remaining differences (a router, a researcher, web access) are
> _the architecture being tested_, not confounds.

State this explicitly in the write-up. If DJ prefers matching on the cheap model instead (pin both
lanes to `deepseek-v4-flash`), that is also defensible and cheaper — it asks "does the scaffold help
a weak model?" rather than "does the scaffold help at all." **Surface the choice; do not pick
silently.**

**Consequence you must not skip:** the pre-registered cost bound `COST_BOUND_USD = 0.022479`
(`testing/harness/workflow-eval-report.ts:7`) is 3 × the measured **deepseek** control mean of
$0.00749/run. Re-running the control on a more expensive model **invalidates that derivation**.
Recompute the control mean, and record the new bound as a new amendment _before_ scoring — with the
old and new numbers side by side. Do not silently keep 0.022479, and do not silently replace it.

**Run it:**

```bash
# Terminal 1 — dev server with the pin (restart required for the env var to take)
cd apps/web
FASTCHAT_EVAL_PINNED_MODELS=z-ai/glm-5.2 pnpm dev

# Terminal 2 — the 9-run complex control cohort (C06/C07/C08 x 3)
# The script already sets AGENTIC_PHASE_A_CONTROL, CONTROL_MODE=a2-complex,
# AGENTIC_E2E_BASE_URL=http://127.0.0.1:5173 and --retry=0. Only the output path needs overriding.
cd apps/web
PHASE_A_CONTROL_OUTPUT_PATH=/tmp/buildos-phase-a-control-glm-v1.json \
pnpm test:agentic:phase-a-control-a2
```

The cohort asserts `scoredRuns.length === 9` (`phase-a-control.test.ts:185`) — if the pin check is
still hard-coded, this is where it will blow up, after you have paid for nine runs.

Then copy to `packages/agent-orchestrator/src/testing/harness/results/control-a2-glm-v1.json`, hash
it, and **add the hash to `results-manifest.test.ts`** (the manifest test fails on any unlisted
artifact — that is intentional).

### 4.2 — WI-2: Add the prompt-only baseline arm

The rival Anthropic explicitly warns usually wins, and the one Phase A deferred to Phase B:

> "Teams invest months building elaborate multi-agent architectures only to discover that improved
> prompting on a single agent achieved equivalent results."

Build the cheapest possible version: **one LLM call, same pinned model, with the deterministic
Librarian's `ContextPacket` inlined into the prompt, and no orchestration** — no router, no
transition, no stages. `runDeterministicLibrarian` is pure and LLM-free
(`packages/agent-orchestrator/src/agents/librarian/deterministic-librarian.ts`), so this is cheap.

This isolates the actual question: **does the orchestration add anything beyond good context?** If
the prompt-only arm matches the workflow lane, the orchestration is not what is producing the win.

Put it in the worker harness alongside the workflow lane so it shares pin verification, cost
accounting, and acceptance scoring. Same 3 scenarios × 3 runs.

### 4.3 — WI-3: Add a null lane (establishes the noise floor)

Run the **workflow lane against itself** — same config, different runs — and push those pairs
through the identical blind mechanic and judge panel.

Whatever win rate this produces is the noise floor of the measuring apparatus. If workflow-vs-
workflow returns something like 5/9 "wins," then a 6/9 workflow-vs-control result is
indistinguishable from noise, and you will know that _before_ interpreting the real cohort rather
than after. This is cheap, it is the single most informative diagnostic available, and nothing in
the current design provides it.

### 4.4 — WI-4: Prepare the human label-ceiling packet ($0, unblocks the routing gate)

The routing gate assumes a human label ceiling that **was never measured**. 90% raw agreement on a
4-way route implies κ ≈ 0.86 ("almost perfect") against a _single un-replicated annotator_, and the
corpus itself flags one class as contested.

Build a labeling packet: for each of the 8 frozen + 5 held-out scenarios, present **only the request
text and the exact world card the router sees** — not the full snapshot — and ask for one of
`direct | workflow | clarify | capability_gap`. Randomize order. Ship it as a single markdown file
or a tiny static page DJ can hand to 2–3 people.

Then compute pairwise agreement and Cohen's κ. **If humans disagree on `a0-c09-missing-content-scope`,
that single result reframes the entire routing blocker** — see the forensics chapter. The agent's job
is the packet and the scoring script; recruiting labelers is DJ's.

---

## 5. Order of work

```
WI-1 control pin  ──┬──> one verification run ──> full 9-run cohort ──> recompute cost bound
                    │
WI-4 label packet ──┘  (do early; it is $0 and unblocks a separate decision)

WI-2 prompt-only arm ──┐
                       ├──> both need the same pinned model as WI-1
WI-3 null lane ────────┘
```

Do **WI-1's single verification run before anything else costs money.** If the pin does not take
effect, everything downstream is invalid and you will have burned the budget discovering it.

---

## 6. Definition of done

1. A control cohort exists that used the same synthesis model as the workflow lane, with per-run pin
   verification proving it, and its hash is in `results-manifest.test.ts`.
2. The cost bound is recomputed from the new control and recorded as an amendment with old and new
   values side by side.
3. A prompt-only baseline arm exists and has been run on the same scenarios.
4. A null lane result exists, and the noise floor is stated as a number.
5. A human label-ceiling packet exists, plus the script that scores agreement and κ.
6. `pnpm --filter @buildos/agent-orchestrator test:run` is green and both `typecheck:phase-a`
   commands are clean.
7. A short `TIER_1_RESULTS.md` records: what was pinned and why, the new control baselines, the
   noise floor, the prompt-only comparison, what is now interpretable that was not before, and
   **what still is not**.

**Explicitly NOT in scope:** running the blind comparison, scoring the panel, or declaring a Phase A
verdict. Tier 1 makes the comparison _possible_. Deciding it needs Tier 2 (a bigger corpus) — the
6-pair denominator that remains after C07's exclusion cannot support a Go at any threshold.

---

## 7. Rules of engagement (non-negotiable)

1. **Pre-registration discipline.** Any change to a bound, denominator, pin, or scoring rule is an
   **amendment**, written into `PHASE_A_FALSIFICATION_PLAN.md` _before_ the affected run, stating it
   was made before scoring. Changing a threshold after seeing a result it failed is the one thing
   that destroys this experiment's value. The legitimate test: does the justification rest on a
   property of the instrument that was true before measurement?
2. **Never rewrite a hashed artifact.** `results/*.json` are evidence. If a hash mismatches,
   _restore the file_ — do not update the recorded hash — unless you are deliberately adding a new
   run. Never run `pnpm format` over the results, corpus, or fixtures directories.
3. **Commit only with explicit pathspecs.** The repo carries substantial unrelated staged and
   unstaged work. Never `git add -A`, never `git commit` bare, never `git reset`/`restore` broad
   paths. Do not commit at all unless DJ asks.
4. **Do not tune the route prompt against the frozen eight.** Four passes already burned that
   corpus; a fifth is explicitly forbidden. Routing is not your scope anyway.
5. **A model-matched timeout, tool failure, or bad output is a VALID outcome** and stays in every
   denominator. Only pin mismatches, pre-inference transport failures, and harness failures are
   infrastructure-invalid, and each gets exactly one replacement.
6. **Any mutation/write tool call is an immediate stop** for the whole run set. Phase A is read-only.
7. **Report what happened, not what was hoped for.** A failed result recorded honestly is this
   project's most valuable asset so far. If the pin will not take, or a cohort comes back
   uninterpretable, say so plainly and stop.

---

## 8. Landmines discovered the hard way

- `FASTCHAT_EVAL_PINNED_MODELS` is module-scope; **restart the dev server**, and set it on the
  server, not the test.
- `phase-a-control.test.ts:69-73` hard-codes the deepseek pin; unparameterized, it invalidates 100%
  of a re-pinned cohort.
- `packages/smart-llm/dist/*.d.ts` goes stale independently of `dist/*.js`. If a SmartLLM option
  "doesn't exist" in types but works at runtime, run `pnpm build --filter=@buildos/smart-llm`.
- The default `apps/web` vitest config **excludes** `agentic-e2e`; use
  `--config vitest.config.agentic.ts`.
- The worker resolves the orchestrator package by **relative path**, not by workspace dependency.
- C07's three control runs crashed (`finishedReason: "error"` after `skill_load`). If your re-pinned
  control also crashes on C07, that is a finding about the production path, not about architecture —
  report it and keep C07 out of the primary denominator either way.
- `route-eval-v5.json` is **not reproducible** from the current tree (its review policy no longer
  exists). Don't try.

---

## 9. Related documents

| Document                                                                                                     | Why you'd open it                                           |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| [`research/SYNTHESIS.md`](./research/SYNTHESIS.md)                                                           | The verdict, the tiered plan, the open decisions for DJ     |
| [`research/09_INTERNAL_GROUND_TRUTH_MAP.md`](./research/09_INTERNAL_GROUND_TRUTH_MAP.md)                     | Ground truth on what the code does vs what docs claim       |
| [`research/10_ROUTING_FAILURE_FORENSICS.md`](./research/10_ROUTING_FAILURE_FORENSICS.md)                     | The routing blocker, and the C09 label problem              |
| [`PHASE_A_FALSIFICATION_PLAN.md`](./PHASE_A_FALSIFICATION_PLAN.md)                                           | Frozen decision rule; amendments 1–4                        |
| [`NEXT_ITERATION.md`](./NEXT_ITERATION.md)                                                                   | Operational runbook and its STOP block                      |
| [`research/04_AGENT_BENCHMARKS_AND_HARNESS_DESIGN.md`](./research/04_AGENT_BENCHMARKS_AND_HARNESS_DESIGN.md) | Why the model confound is fatal; cost-controlled evaluation |
| [`research/03_EVAL_METHODOLOGY_PRACTITIONERS.md`](./research/03_EVAL_METHODOLOGY_PRACTITIONERS.md)           | The statistics behind the denominator problem               |
| [`OPEN_BRIEF_EVAL_METHODOLOGY.md`](./OPEN_BRIEF_EVAL_METHODOLOGY.md)                                         | The _follow-on_ work. Not this. See §0.                     |

**Key source files**

| Path                                                                           | What it is                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------ |
| `apps/web/src/routes/api/agent/v2/stream/+server.ts:324,2808`                  | The pinned-models hook                           |
| `apps/web/src/lib/services/agentic-chat-v2/model-tiering.ts:239-289`           | Where `pinnedModels` overrides tiering           |
| `apps/web/src/lib/tests/agentic-e2e/phase-a/phase-a-control.test.ts:69-73`     | The hard-coded control pin check to parameterize |
| `apps/worker/tests/phase-a/phaseAWorkflowEval.test.ts`                         | The workflow lane harness                        |
| `packages/agent-orchestrator/src/testing/harness/workflow-eval-report.ts:7-10` | The cost and latency bounds                      |
| `packages/agent-orchestrator/src/testing/harness/comparison-eligibility.ts`    | C07 exclusion + `binomialTailProbability`        |
| `packages/agent-orchestrator/src/testing/harness/results-manifest.test.ts`     | Hash manifest — add new artifacts here           |
| `packages/agent-orchestrator/src/agents/librarian/deterministic-librarian.ts`  | The LLM-free context builder for WI-2            |
