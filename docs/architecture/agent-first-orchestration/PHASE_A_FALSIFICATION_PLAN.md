<!-- docs/architecture/agent-first-orchestration/PHASE_A_FALSIFICATION_PLAN.md -->

# Phase A: Falsification Plan

**Status:** Ready to start
**Date:** 2026-07-24
**Depends on:** [README](./README.md), [V0 Architecture Plan](./V0_ARCHITECTURE_PLAN.md),
[Audit 2026-07-24](./AUDIT_2026-07-24.md)
**Duration target:** 1–2 weeks
**Gate:** Phase B (the durable kernel) starts only on a recorded **go** from this phase.

## Purpose

Test the product hypothesis before building any durable infrastructure:

> A small orchestrator with a limited world model, plus bounded specialists, beats one
> context-heavy agent on complex work — without making simple work unacceptably slow.

This is a claim about **model behavior**. It needs no database, no queue, no leases, no RLS, and
no UI to measure. Phase A measures it with in-process code and real scenarios, against the real
production chat path as the control.

Phase A code is allowed to be disposable — **except the contracts**, which live in
`packages/agent-orchestrator/src/contracts` from day one and carry forward into Phase B.

## What Phase A produces

1. **Route accuracy** — can the CEO route mode, given only a lightweight world card, correctly
   pick `direct | workflow | clarify | capability_gap` on labeled real requests?
2. **Quality delta on complex work** — does the specialist workflow lane beat the existing v2
   chat path in blind comparison on multi-source/synthesis scenarios?
3. **True cost and latency multiples** — what does the team approach actually cost relative to
   the control, per scenario class?
4. A recorded **go / change / stop** decision in `PHASE_A_RESULTS.md`, scored against the
   pre-registered rule below.

## Pre-registered decision rule

Finalized at the end of Slice A0 (after baselines are measured), **before** any comparison run.
Template from the README, restated here as the working numbers:

- **Go:** workflow lane wins ≥60% of blind comparisons on complex scenarios at ≤3× control cost,
  AND route accuracy ≥90% on the labeled corpus.
- **Change:** quality win but cost/latency bounds violated, or route accuracy 75–90% → revise
  prompts/world card and re-run Phase A. Do not start Phase B.
- **Stop:** no blind-preference win on complex work, or direct-lane p50 latency >1.5× current
  chat TTFT with no identified mitigation.

Baselines to measure in A0 before locking numbers: current v2 chat p50/p95 time-to-first-token
and cost per scenario class. A marginal result is a stop, not a go.

## Lanes

| Lane | What runs | Status |
| --- | --- | --- |
| Control | Existing agentic-chat v2 stream path via the `pnpm test:agentic` harness (`apps/web/src/lib/tests/agentic-e2e/`), which drives the real endpoint with scenario files | Already built |
| Workflow | In-process harness: route → stages → `Promise.all` specialists → digest → transition → synthesis | Built in A2 |

CEO-direct and sequential-baseline lanes are deferred to Phase B Slice B5 — two lanes are enough
for the first read, and four lanes triples the work.

## Corpus (Slice A0)

~8 scenarios, drawn from **real production chat sessions** (`chat_sessions` / `chat_turn_runs`)
wherever possible, anonymized as needed, plus a frozen project snapshot (precedent:
`tests/integration/fixtures/deep-research-base.sql`). Target mix:

| # | Class | Expected route |
| --- | --- | --- |
| 1–2 | Simple project question / entity read | `direct` |
| 3 | Project status summary | `direct` (borderline — this is the routing stress test) |
| 4 | Single-source external lookup | `workflow` (1 researcher) |
| 5 | Multi-source parallel research + synthesis | `workflow` (fan-out) |
| 6 | BuildOS context gathering → research → recommendation | `workflow` (sequential stages) |
| 7 | Ambiguous request | `clarify` |
| 8 | Unsupported capability (e.g. send an email) | `capability_gap` |

Each scenario gets: the request text, project snapshot reference, a hand-labeled expected route,
and machine-checkable acceptance checks (facts that must appear, citations that must resolve,
claims that must not appear). Route labeling happens before any prompt work, so labels can't
drift toward what the router does.

Every comparison scenario runs ≥3 times per lane; route accuracy is scored over ≥3 runs per
scenario (~72+ route calls — cheap).

## Work breakdown

### Slice A0 — Corpus, baselines, contracts (~2–3 days)

- [ ] Scaffold `packages/agent-orchestrator` (package.json, tsconfig, vitest; no app imports —
      dependency direction enforced from day one).
- [ ] Define contracts as zod schemas + inferred types: `RouteDecision` (with the closed
      `reason_code` union), `StepSpec`, `WorkflowStageSpec`, `AgentResult`, `ArtifactEnvelope`,
      `WorkflowStateDigest`, `TransitionDecision`. Contract tests: valid/invalid/oversized.
- [ ] Extract 8 scenarios from real transcripts; freeze the project snapshot; hand-label routes
      and acceptance checks. Store under `packages/agent-orchestrator/src/testing/harness/corpus/`.
- [ ] Measure control-lane baselines (TTFT p50/p95, cost) by running the corpus once through
      `pnpm test:agentic`.
- [ ] Pin the CEO model (§18 Q5) and record it.
- [ ] Finalize the decision rule with real baseline numbers; commit it before A2 runs.

**Done when:** corpus is frozen and labeled, baselines are recorded, decision rule is committed.

### Slice A1 — Route mode (~2 days)

- [ ] World card v0: BuildOS object model summary, project identity, direct-capability cards,
      agent-catalog cards (librarian, researcher), workflow grammar, permission ceiling. Built by
      deterministic code from the snapshot; hard token budget.
- [ ] Route function: world card + request → validated `RouteDecision` (one bounded repair
      attempt on schema failure, matching §14).
- [ ] Score route accuracy, per-call latency, and cost across repeated runs. Log every
      `reason_code`.

**Done when:** route accuracy number exists with per-scenario breakdown. If accuracy is already
<75% here, stop and diagnose before building A2 — the architecture depends on routing.

### Slice A2 — In-process workflow lane + comparison (~3–4 days)

- [ ] Deterministic librarian: code-built `ContextPacket` artifact from the snapshot (no LLM).
- [ ] Researcher: single LLM specialist over the existing `WebResearchPort` implementation,
      returning `AgentResult` with research-packet artifact drafts; citation validation in code
      (precedent: deep-research evidence normalizer).
- [ ] Engine-as-a-function: route → compile stage → `Promise.all` steps → build bounded digest
      (§6.7 rules) → transition call → next stage or synthesis. Artifacts in memory, typed via
      the real codecs. Enforce `max_stages=5`, `max_replans=2`, USD budget accounting in memory.
- [ ] Run the comparison: workflow lane vs. control lane, ≥3 runs each on scenarios 4–6; blind
      A/B of outputs (randomized order, rubric-scored); acceptance checks run in code.
- [ ] Write `PHASE_A_RESULTS.md`: route accuracy, blind-preference results, cost/latency
      multiples, violations, decision (go/change/stop), and what surprised us.

**Done when:** the decision is recorded against the pre-registered rule.

## What Phase A deliberately skips

Persistence, queue jobs, leases, fencing, RLS, reconciliation, signals, events tables, realtime
projection, any UI, pause/cancel, per-user caps, and mutation scenarios (all comparison scenarios
are read-only in Phase A; staged-proposal comparability is a Phase B concern). None of these
change what the models do, and all of them have production precedent waiting in the substrate
(§2.9 of the V0 plan).

## Cost estimate

Roughly: ~72 route calls (small), ~36 workflow-lane runs × (1 route + 1–2 specialists + 1–2 CEO
turns + synthesis) + ~36 control runs. At current model pricing this lands in the tens of
dollars, not hundreds. Trivial relative to one week of Phase B engineering.

## Day-1 checklist (the first step)

1. `pnpm` scaffold `packages/agent-orchestrator` with contracts + vitest.
2. Write `RouteDecision` + `StepSpec` zod schemas and their contract tests.
3. Pull 10–12 candidate transcripts from production chat history; pick the 8; label routes.
4. Run the existing `test:agentic` corpus once to capture baseline TTFT/cost.
