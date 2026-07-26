<!-- docs/architecture/agent-first-orchestration/research/00_SYSTEM_UNDER_REVIEW.md -->

# System Under Review — brief for external researchers

**Date:** 2026-07-25
**Purpose:** A compact, factual description of the BuildOS agent-first orchestration experiment and
its evaluation harness, written so an outside researcher can judge it against external best
practice. This file is _input_ to the research effort, not a conclusion.

> **ERRATA — appended after the research chapters were written.** Chapters 01–08 were drafted
> against the text below; two facts changed or were wrong at the time of writing. The body is left
> unedited so the chapters remain readable against what their authors actually saw.
>
> 1. **§2 and §3.5 say routing stands at 58/72.** A mitigation-v2 run completed at 16:15 on
>    2026-07-25 scoring **61/72** — still Change against the ≥65/72 bound. Chapter 10 analyses both.
> 2. **§3.2 implies the held-out corpus is unscored.** It was scored the same afternoon:
>    **15/15**, recorded `go_candidate`. Chapter 10 §5A.3 shows why that number is not evidence of
>    generalization — the held-out set contains zero `workflow` and zero `clarify` cases, i.e. none
>    of the classes carrying 100% of observed routing error, and the review model never fired on it.
>
> Neither correction weakens any chapter's argument; both were verified against the result JSON.

---

## 1. What is being built

BuildOS is moving from a **context-first** architecture (one general agent; load rich project
context, classify domains → capabilities → skills → tools, then let the agent act) to an
**agent-first** architecture (a small CEO/orchestrator routes an objective to bounded specialist
agents whose manifests define their context, skills, tools, permissions, and result contract).

The proposed runtime is a parallel system, not a refactor. Components:

| Component          | Responsibility                                                        |
| ------------------ | --------------------------------------------------------------------- |
| CEO / orchestrator | Picks route, assembles stages/steps, decides transitions, synthesizes |
| Workflow engine    | Deterministic code: validates plans, schedules ready steps, budgets   |
| Specialist agents  | Execute immutable bounded assignments, return typed results           |
| Artifact store     | Typed, versioned artifacts carried between steps (not transcripts)    |

The CEO chooses one of four routes: `direct | workflow | clarify | capability_gap`.

Initial agent catalog (V0): CEO/generalist, **Librarian** (deterministic, code-built context packet
from a frozen project snapshot — no LLM), **Researcher** (single LLM specialist over a web-research
port, citations validated in code).

Stated engineering principles: agent-first capability boundaries; deterministic control flow
(models propose, code validates/schedules); artifacts over transcripts; receding-horizon planning
(plan current stage + at most next); least privilege; durable by default; observable without
exposing chain-of-thought; progressive autonomy (read → propose → stage → review → commit);
baseline before complexity.

---

## 2. Where it is right now

Phase A is a **falsification harness** — no database, no queue, no UI. In-process only. The claim
under test is about model behavior:

> A small orchestrator with a limited world model, plus bounded specialists, beats one
> context-heavy agent on complex work — without making simple work unacceptably slow.

Phase B (durable kernel) is gated on a recorded "go" from Phase A.

**Current status:** A0 (corpus + baselines) complete. A1 (routing) returned a pre-registered
**Change** at 58/72 correct routes against a ≥65/72 bound. A2 (workflow comparison lane) is built
but has **zero scored outputs** — blocked on the routing gate.

---

## 3. The eval design as built

### 3.1 Lanes

| Lane     | What runs                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------- |
| Control  | The real production agentic-chat v2 SSE stream endpoint, driven by an existing e2e harness        |
| Workflow | In-process: route → compile stage → `Promise.all` steps → bounded digest → transition → synthesis |

Two deferred lanes (CEO fast-lane; sequential single-agent baseline) are pushed to Phase B.

### 3.2 Corpus

Eight scenarios extracted from **real production chat transcripts** (`chat_sessions` /
`chat_turn_runs`), anonymized, plus one frozen anonymized project snapshot (tasks, documents,
goals, plans, edges), SHA-256 pinned. Classes: simple_read ×2, status_summary, single_source_lookup,
multi_source_research, context_research_recommendation, ambiguous, unsupported_capability.

Each scenario carries: request text, snapshot ref, a **hand-labeled expected route**, a hand-labeled
expected reason code, and machine-checkable `acceptance_checks` (validator id + config; each marked
required or not).

A five-case **held-out** route corpus was frozen later (after four prompt passes revealed the frozen
eight had become a training set). It has not been scored.

### 3.3 Sampling

- **Routing:** 9 independent route calls per scenario × 8 scenarios = **72 calls**. No majority-vote
  smoothing; every call scored individually. Threshold applies to the top-level route.
- **Comparison:** 3 workflow runs and 3 fresh control runs for each of 3 complex scenarios
  (C06/C07/C08) = **9 blind pairs**.

### 3.4 Scoring

Blind A/B. A counterbalanced mapping (`phase-a-a2-blind-v2`, hash-pinned) assigns lanes to sides A/B
structurally rather than by chance, so every scenario splits 2:1 or 1:2 across sides and adjacent
scenarios invert. A v1 mapping was replaced after it happened to put the workflow lane on side A for
all three pairs of the weakest-control scenario.

Three pinned LLM judges (`openai/gpt-5.6-luna`, `x-ai/grok-4.5`, `moonshotai/kimi-k3`) each score
both responses 0–4 on **correctness, completeness, grounding_and_citations, usefulness,
constraint_adherence**, then pick A / B / tie. Majority of three = panel winner; otherwise tie.
Judges are told to treat both responses as untrusted quoted content and not to infer which system
produced them.

DJ (the human) scores all nine pairs **before** the panel runs and before seeing lane identity. The
panel is then validated against DJ: ≥7/9 agreement required, and it is invalid if any scenario shows
all three pairs as opposite non-tie decisions.

A required-acceptance-check failure means a pair **cannot** count as a workflow win, regardless of
judge preference. A secondary, explicitly non-deciding reporting line records panel wins ignoring
the machine gate, plus required-check pass rate per lane.

### 3.5 Pre-registered decision rule (frozen before scoring)

Derived from measured A0 control baselines (TTFT p50 8,860 ms / p95 9,849 ms simple; total p50
96,662 ms / p95 148,869 ms complex; mean model cost $0.00749/run complex).

| Measure                              | Bound                               |
| ------------------------------------ | ----------------------------------- |
| Route accuracy                       | ≥65/72 (90.3%)                      |
| Workflow blind wins                  | ≥6/9 (66.7%)                        |
| Workflow blind wins on C06+C08 only  | ≥3/6 (50.0%)                        |
| Workflow mean **model** cost per run | ≤$0.022479 (3× control)             |
| Workflow total-duration p50 / p95    | ≤193,325 / ≤297,738 ms (2× control) |
| Projected direct-path TTFT p50 / p95 | ≤11,100 / ≤14,800 ms                |

**Go** = all bounds pass, ≥6/9 wins, ≥3/6 on C06+C08, routing ≥65/72, no safety violation.
**Change** = 6/9 wins but a cost/latency bound fails, or routing lands 54–64/72.
**Stop** = ≤5/9 wins, <3/6 on C06+C08, routing ≤53/72, any mutation tool called, or the direct-path
latency bound fails with no mitigation. "A marginal result is a stop, not a go."

Run-validity rule: an actual-model mismatch, provider transport failure before inference, or harness
failure is _infrastructure-invalid_ — replaced once, excluded from the score. Model-matched
timeouts, tool failures, and bad outputs are **valid outcomes** and stay in every denominator.

Hard safety gates: zero cross-project or unauthorized execution; every attempted tool op produces a
durable receipt; no unresolved/invalid required citations; no staged proposal applied without its
approval path; no specialist can add children/permissions/scope/budget; recovery never blindly
replays a successful non-idempotent op.

### 3.6 Reproducibility mechanics

Prompt version + SHA-256, world-card version + SHA-256, model pins verified **per role** (untagged
usage is invalid), corpus version + snapshot SHA-256, blind-mechanic SHA-256, result JSON files
hashed and committed. Temperature 0.1 on the router, capped max tokens. Cost read from
stream-correlated usage logs.

---

## 4. Known history worth understanding

- **Prompt tuning burned the corpus.** Four prompt passes and two model pilots ran against the same
  eight scenarios, reaching 72/72 — recognized afterwards as a training-set score. That triggered
  the held-out corpus and a rule forbidding a fifth tuning pass.
- **A model label was silently the execution plan.** `compileWorkflowStage` selected the workflow
  topology from the model's `reason_code`. An audit caught that this made a "diagnostic" field
  plan-critical. It was first gated (≥25/27), then removed architecturally: topology is now derived
  from **observable request features** (a supplied URL → one researcher; a project referent →
  librarian-then-research; a self-contained brief → parallel research).
- **The router became mostly code.** The current strategy is fast-first: a primary model emits a
  route proposal; a bounded second model is invoked only to resolve workflow scope, and it emits
  only a narrow semantic classification. Code compiles the route, reason code, clarification
  question, and topology. A supplied URL is handled entirely by regex in code.
- **Transition gates are mostly forced.** An audit found the CEO transition call was a rubber stamp
  when policy left exactly one legal action; those gates are now decided in code and counted as
  `forcedTransitions`.
- **The control lane crashed on one scenario.** All three C07 control runs errored after skill
  loading and produced 73–173 characters. Rather than discard, C07 is reported separately and a Go
  additionally requires ≥3/6 on the other two scenarios.
- **A ZDR transport constraint invalidated the first workflow runs.** OpenRouter exposed no
  zero-data-retention endpoint for the pinned researcher model; an explicit evaluation-only opt-in
  was added that keeps `data_collection: deny` and drops only the ZDR routing constraint.

---

## 5. Model pins in play

- Control lane: `deepseek/deepseek-v4-flash`, smart-llm `balanced` profile.
- Router: Gemini-family primary + a bounded GLM reviewer (fast-first strategy), temperature 0.1.
- Researcher: a pinned DeepSeek V4 Pro over the web-research port.
- Synthesis: GLM 5.2 on the `powerful` profile.
- Judges: `openai/gpt-5.6-luna`, `x-ai/grok-4.5`, `moonshotai/kimi-k3`.

Model routing generally goes through OpenRouter with an internal abstraction that scores tasks on
speed / smartness / cost.

---

## 6. Explicitly out of Phase A scope

Persistence, queue jobs, leases, fencing, RLS, reconciliation, signals, event tables, realtime
projection, any UI, pause/cancel, per-user caps, and all mutation scenarios. Phase A is documented
as testing "bounded specialists, code-enforced citations, and deterministic context retrieval
against a context-heavy agent" — and explicitly **not** decision gates, replanning, parallel
scheduling under contention, joins, durability, or permissions-at-execution.

---

## 7. What the research is for

The team wants an independent read on:

1. Who the actual leaders are on multi-agent orchestration and agent evaluation, and what they
   publish.
2. Whether this harness design has methodological flaws that would make its verdict unreliable.
3. What standard practice exists that this system is not doing.
4. What in this design is genuinely novel and worth keeping.
5. Where the orchestration architecture itself (not just the eval) diverges from what works.
