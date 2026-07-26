<!-- docs/architecture/agent-first-orchestration/research/README.md -->

# Agent-first orchestration — external research dossier

**Date:** 2026-07-25
**Why this exists:** the Phase A falsification harness was built from first principles. This dossier
asks an independent question — _who does this well, what do they do, and where does BuildOS
diverge?_ — across nine parallel research streams, then compares the answers to the system as built.

**Start with [`SYNTHESIS.md`](./SYNTHESIS.md).** Everything else is supporting evidence.

## Reading order

1. **[`SYNTHESIS.md`](./SYNTHESIS.md)** — the verdict, the gap analysis, the ordered plan, and the
   decisions that need DJ.
2. **[`10_ROUTING_FAILURE_FORENSICS.md`](./10_ROUTING_FAILURE_FORENSICS.md)** — what the 58/72 and
   61/72 route scores actually are. Read this before touching the routing gate.
3. **[`09_INTERNAL_GROUND_TRUTH_MAP.md`](./09_INTERNAL_GROUND_TRUTH_MAP.md)** — code-level audit and
   every docs-vs-code discrepancy. Read this before running anything paid.
4. Then the external chapters as needed (01–08).

## Chapters

| #   | File                                                                                             | Focus                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 00  | [`00_SYSTEM_UNDER_REVIEW.md`](./00_SYSTEM_UNDER_REVIEW.md)                                       | The brief every external chapter was written against, plus errata                                      |
| 01  | [`01_FRONTIER_LAB_DOCTRINE.md`](./01_FRONTIER_LAB_DOCTRINE.md)                                   | What Anthropic, OpenAI and Google actually prescribe for orchestrator + subagent design and evaluation |
| 02  | [`02_MULTI_AGENT_SKEPTICS_AND_FAILURE_MODES.md`](./02_MULTI_AGENT_SKEPTICS_AND_FAILURE_MODES.md) | The adversarial case, the MAST failure taxonomy, and a falsification lens                              |
| 03  | [`03_EVAL_METHODOLOGY_PRACTITIONERS.md`](./03_EVAL_METHODOLOGY_PRACTITIONERS.md)                 | Judge validation, error analysis, and the worked statistics of the decision rule                       |
| 04  | [`04_AGENT_BENCHMARKS_AND_HARNESS_DESIGN.md`](./04_AGENT_BENCHMARKS_AND_HARNESS_DESIGN.md)       | How serious agent benchmarks are built and scored; cost-controlled evaluation                          |
| 05  | [`05_ROUTING_AND_CLASSIFICATION_EVALS.md`](./05_ROUTING_AND_CLASSIFICATION_EVALS.md)             | Production routers, calibrated abstention, label ceilings, prompt optimizers                           |
| 06  | [`06_OSS_HARNESSES_OPENCLAW_HERMES.md`](./06_OSS_HARNESSES_OPENCLAW_HERMES.md)                   | OpenClaw, Hermes, and a 16-system comparative survey of delegation contracts                           |
| 07  | [`07_EVAL_OPS_AND_OBSERVABILITY.md`](./07_EVAL_OPS_AND_OBSERVABILITY.md)                         | Tracing, trajectory metrics, OTel GenAI conventions, build-vs-buy                                      |
| 08  | [`08_CONTEXT_ENGINEERING_AND_SECURITY.md`](./08_CONTEXT_ENGINEERING_AND_SECURITY.md)             | Handoff payload design, context rot, prompt injection and the lethal trifecta                          |
| 09  | [`09_INTERNAL_GROUND_TRUTH_MAP.md`](./09_INTERNAL_GROUND_TRUTH_MAP.md)                           | Code-level ground truth; what is measured vs what is claimed                                           |
| 10  | [`10_ROUTING_FAILURE_FORENSICS.md`](./10_ROUTING_FAILURE_FORENSICS.md)                           | Per-scenario forensics on the routing failure                                                          |

## Method and its limits

Nine agents worked in parallel: eight external research streams (web search and fetch against
primary sources) and one internal code auditor. Each was told to cite every substantive claim with a
URL, to mark anything it could not verify as `UNVERIFIED` rather than fill the gap, and to name
disagreements between sources instead of smoothing them.

Caveats worth carrying:

- Chapters were written independently and were not reconciled against each other before synthesis.
  Where they conflict, `SYNTHESIS.md` §5 adjudicates rather than averages.
- Chapters 01–08 were drafted against the `00_` brief before two result files landed; see the errata
  in that file.
- One chapter (06) documents that it began integrating content from another stream before that
  stream reported, caught it, re-verified against primary sources, and corrected three claims. Those
  corrections are recorded in its Confidence section. `UNVERIFIED` markers throughout are load-bearing.
- Nothing here has been approved or actioned. No code, corpus, prompt, or threshold was changed in
  producing this dossier.
