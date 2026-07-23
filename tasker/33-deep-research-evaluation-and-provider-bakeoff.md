<!-- tasker/33-deep-research-evaluation-and-provider-bakeoff.md -->

# 33 — Deep Research Evaluation, Quality Gates & Provider Bakeoff

**Created 2026-07-19.** Owner: applied AI / product quality engineer.  
**Type:** evaluation and rollout handoff.  
**Depends on:** task 30 evidence schema for full citation scoring; can begin with recorded V0.1 runs.

## Outcome

Model, search, fanout, and budget choices are based on repeatable evidence. Production rollout has
explicit quality, safety, latency, and cost gates rather than anecdotal “looks good” checks.

## Work packages

### WP-1 — Evaluation corpus (P0)

Build a versioned set spanning current-fact research, ambiguous strategy, technical comparison,
contradictory sources, sparse evidence, adversarial/prompt-injected pages, and questions that
should decline or ask for clarification. Include project-scoped and global examples.

### WP-2 — Automated metrics (P0)

Measure source validity, citation entailment, claim coverage, contradiction handling, unsupported
claim rate, freshness, duplicate-source rate, tool/permission violations, completion/partial rate,
latency, tokens, Tavily credits, and total/root/leaf cost.

### WP-3 — Human rubric (P0)

Blind-review decision usefulness, completeness, calibration, structure, and whether uncertainty is
honest. Require reviewers to inspect cited evidence, not grade prose polish alone.

> **Live data points (2026-07-20 and 2026-07-22):** a final clean four-case batch passed the runtime
> envelope but failed the quality gate. Fan-out produced typed live evidence yet remained partial;
> one Q1 synthesis was the schema-valid placeholder `...`. Both single runs completed more cheaply,
> but cited candidate results never visited, and Q2 falsely concluded that OpenRouter `max_price`
> does not exist. There is **no defensible architecture winner**: direct single is more complete but
> currently less trustworthy, while fan-out enforces provenance but lacks coverage and robust
> synthesis. Do not run another ad-hoc batch; build the corpus/scorer and apply the evidence contract
> to the single baseline first. See
> `apps/web/docs/technical/audits/DEEP_RESEARCH_V01_AUDIT_2026-07-20.md`.

### WP-4 — Architecture bakeoff (P1)

Compare at minimum:

- one coordinator + two bounded children (current V0.1);
- sequential search/reason/synthesize without fanout;
- different planner/synthesizer reasoning levels;
- basic vs advanced Tavily and alternative search providers;
- two vs additional children only after budget/concurrency policy supports them.

Hold the dataset and spend ceiling constant. Track marginal quality per dollar and p50/p95 latency.

### WP-5 — Regression gate and rollout thresholds (P0)

Add a CI/offline regression suite and a periodic live canary with tiny capped spend. Set explicit
maximums for unsupported claims, invalid citations, permission violations, p95 cost, and p95
latency. A provider/model route change must rerun the gate.

## Definition of done

- The current architecture beats or justifies its cost over the sequential baseline.
- Citation/claim correctness and adversarial-page behavior meet written thresholds.
- Cost includes Tavily and LLM spend from the durable ledger.
- A model/provider/routing change cannot reach broad rollout without a recorded eval result.
