<!-- docs/architecture/agent-first-orchestration/A2_PROGRESS.md -->

# A2 workflow-lane progress

**Status:** Local implementation complete and audit-corrected; fresh control complete; the
evaluation-only non-ZDR transport opt-in is implemented and verified. Routing mitigation v2
returned **Change** at 61/72 frozen routes (cold holdout 15/15 on the fast path only), so the
scored workflow cohort remains blocked. Zero workflow outputs have entered the score. See
[`NEXT_ITERATION.md`](./NEXT_ITERATION.md).
**Date:** 2026-07-25 (amended after [`PHASE_A_AUDIT_2026-07-25.md`](./PHASE_A_AUDIT_2026-07-25.md))

## Implemented and verified

- Deterministic librarian builds a schema-valid bounded `ContextPacket` without an LLM. For C08,
  lexical expansion resolves “this” to the iPhone PVT-baseline task and retrieves the measurement
  and broad-transfer caveat documents.
- Bounded researcher uses the existing worker `WebResearchPort`, visits every cited source, and
  marks its `AgentResult` partial unless every cited URL was actually observed and the minimum
  citation count is met.
- In-memory engine executes ready steps with `Promise.all`, stores typed artifact envelopes,
  builds a bounded `WorkflowStateDigest`, calls the pinned transition model, appends the C08
  research stage, and synthesizes a final answer. It enforces five stages, two replans, USD and
  wall-clock budgets, read-only permission, and a write-call safety stop.
- Gate 4's prompt, user packet template, strict JSON schema, three pins, deterministic SHA mapping,
  majority aggregation, workflow-win eligibility, 7/9 DJ validation, and complete-scenario
  inversion test are frozen at
  `720a42ef192d961c77068c49aceec24c027cbf633259ddf0b91b73271619f4d8`.
- Package verification: 13 Vitest files and **95/95 tests** green; package TypeScript green; paid
  worker harness TypeScript green.

## Fresh control cohort

The canonical fresh 9-run control report is
`packages/agent-orchestrator/src/testing/harness/results/control-a2-v1.json` with SHA-256
`735a445023a62c37ceec538349f5c77499da3e5dc04cb9a7d7207f5f36ee2338`.

| Measure                     |               Result |
| --------------------------- | -------------------: |
| Scored runs                 |                  9/9 |
| Infrastructure-invalid runs |                    0 |
| Required-check passes       |                  0/9 |
| Clean completions           |                  6/9 |
| Total-duration p50 / p95    | 105,109 / 198,425 ms |
| Mean cost / run             |            $0.007787 |
| Total cost                  |            $0.070084 |
| Mutation calls              |                    0 |

All three C07 runs terminated with `finishedReason: "error"` and
`errors: ["An error occurred while streaming."]` after 3–6 `skill_load` / `skill_reference_load`
calls, producing 89, 173, and 73 characters of preamble and no research. **Correction:** these
were previously described here as a model-matched timeout after the control's internal retry. The
artifact does not show a timeout; it shows a stream error after skill loading, matching the known
turn-budget/finalization pattern. They remain valid, retained control outcomes — but the three C07
blind pairs compare a real answer against a crashed turn, so the amended decision rule reports them
separately and additionally requires ≥3/6 wins on C06+C08. C06 consistently omitted required source
citations. C08 consistently missed its two-citation requirement. No failure is replaced or upgraded
by judgment.

## Researcher-pin infrastructure block

The first C06 workflow logical run and its one permitted infrastructure replacement both reached
the pinned researcher but OpenRouter rejected `deepseek/deepseek-v4-pro` before inference:

> 404 — No endpoints found matching your data policy (Zero data retention).

Both attempts have zero DeepSeek prompt/completion tokens and a released billing reservation, so
they are infrastructure-invalid and no workflow output has entered the score. Their canonical raw
report is
`packages/agent-orchestrator/src/testing/harness/results/workflow-eval-invalid-zdr-v1.json` with
SHA-256 `25576e641bf8db1e9527b65e02ec15041038155739128eee921d88bbc15d60ca`.
A later logical attempt was interrupted while diagnosing the repeated condition and is excluded
from the score; no completed output from it was paired or judged.

SmartLLM's default transport requests `data_collection: deny` and `zdr: true`. OpenRouter had no
DeepSeek V4 Pro endpoint satisfying that request. The two options presented to DJ were:

1. authorize a narrowly scoped, evaluation-only non-ZDR OpenRouter request for the already
   anonymized Phase A researcher inputs while retaining the frozen DeepSeek pin; or
2. retain ZDR and approve a replacement researcher model pin, update the ADR, and rerun the whole
   workflow cohort under that revised pin.

DJ chose option 1 on 2026-07-25: non-ZDR provider handling is acceptable for the already
anonymized Phase A corpus and fixture. The transport change was implemented as SmartLLM's explicit
`evaluationOnlyAllowNonZdr` option. The default remains `data_collection: deny` with `zdr: true`;
the opt-in retains `data_collection: deny` and omits only `zdr`. The Phase A worker passes it only
to the DeepSeek researcher model port, while route, transition, and synthesis calls keep the safe
default. SmartLLM's focused default/opt-in tests, its full 70/70 package suite, and SmartLLM plus
worker typechecks are green. No provider request was made during this implementation.

No blind packet or judge result will be generated until nine scored workflow outputs exist.

## Audit corrections applied 2026-07-25

Implemented before any workflow output was scored, so nothing measured is invalidated:

- Blind mapping counterbalanced (`phase-a-a2-blind-v2`, hash `ba2602e8…774d2`). The v1 mapping put
  the workflow lane on side A for all three C07 pairs.
- Transition gates with one legal action are decided in code; only branching gates call GLM 5.2.
  Phase A therefore does not test decision-gate reasoning.
- Researcher visit budget and citation floor derived from the assignment instead of scenario ids;
  the two-way fan-out foci are domain-neutral instead of restating C07's acceptance sections.
- Per-role model-pin verification; an untagged usage event is itself infrastructure-invalid.
- Cost bound evaluated on model spend only, with all-in reported beside it.
- `null` rather than `false` when a bound has no sample — the source of the confusing "false
  latency bounds" in the ZDR-invalid report.

Current package verification: 14 files, **108/108 tests** green; typecheck green across
the package, `apps/worker`, and `apps/web`.
