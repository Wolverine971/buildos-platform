<!-- docs/architecture/agent-first-orchestration/PHASE_A_RESULTS.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-07-26; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Phase A — Recorded Decision

**Date:** 2026-07-26
**Decision:** **Routing-gate track CLOSED — instrument-limited.** Decided by DJ on the agent's
recommendation after the A1 human-label exercise.
**What this is:** the recorded outcome `PHASE_A_FALSIFICATION_PLAN.md` §"What Phase A produces"
promises. It closes the routing question. It does **not** falsify the architecture hypothesis and
does **not** authorize Phase B.

---

## 1. Final scored state

| Question            | Final state                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route accuracy (A1) | **Change** band: 61/72 frozen routes (mitigation v2); cold holdout 15/15 fast-path only. Gate was ≥65/72.                                                                                                                                               |
| Gate reachability   | **Never cleanly reachable.** Reanalysis max = 63/72 with C09 counted as an error; label exercise found 3 contested items, and the pre-registered arithmetic says two 50/50 items already cap the score at 63/72 — below the gate with a perfect router. |
| Quality delta (A2)  | **Unscored.** Built, blocked behind the route gate, zero workflow outputs entered a blind comparison.                                                                                                                                                   |
| Cost / latency      | Direct-path latency bounds passed at A1. Workflow bounds never exercised.                                                                                                                                                                               |

## 2. Why the track is closed rather than restated

The A1 label packet was filled 2026-07-26 (agent-labeled at DJ's direction, labels locked before
the frozen corpus was opened — provenance and per-item table in
[`A1_HUMAN_LABEL_PACKET.md`](./A1_HUMAN_LABEL_PACKET.md)):

- **10/13 agreement, 3 contested** (C09 content-batch, C10 week-planning, C01 in-sync score) —
  all three flagged as fence cases during labeling, before comparison.
- **Two labels depend on information the router structurally cannot see.** C09=`clarify` is
  justified by the snapshot containing no content entities; C01=`direct` presumes the term
  resolves in-project. The router receives entity counts only — the "correct" answer requires
  having already taken a route and looked. A gate scored against post-route knowledge measures
  luck or memorized priors, not routing skill.
- **The taxonomy has a hole.** "Help me plan this week" / "what should I work on today" are
  context → recommendation with no research; neither `direct` (one bounded read / status summary)
  nor `workflow` (external research) holds them.

Restating the gate on the 10 uncontested items would rescue a number, not a decision: nothing in
the product currently depends on shipping this router, and the eval's marginal dollar buys more in
the Tier 2 open-brief instrument.

## 3. What carries forward

1. **Peek-then-decide.** Any future router gets a cheap probe step before committing to a route,
   or the taxonomy gains an explicit `context-then-decide` route. Both C09-class and C01-class
   items become answerable instead of contested.
2. **The taxonomy hole** (context → recommendation) must be a first-class route in any V0 design.
3. **The contracts** (`packages/agent-orchestrator/src/contracts`) remain valid and carry forward
   per the plan.
4. **The quality question moves instruments.** "Does a specialist team beat the v2 chat path on
   complex work" is now measured by the open-brief instrument
   ([`OPEN_BRIEF_EVAL_METHODOLOGY.md`](./OPEN_BRIEF_EVAL_METHODOLOGY.md), corpus
   [`open-brief-v1.json`](./corpus/open-brief-v1.json)) — which also encodes what DJ actually
   scores plans on (feasibility self-assessment, steps-not-schedules, doc + BLUF), captured
   2026-07-25/26.

## 4. What this does not decide

The architecture hypothesis (small orchestrator + bounded specialists beats one context-heavy
agent on complex work) is **neither corroborated nor falsified** — A2 never scored. Phase B
remains unauthorized; any future case for it goes through the open-brief instrument, not a
restated routing gate.

## 5. Related

- [`PHASE_A_FALSIFICATION_PLAN.md`](./PHASE_A_FALSIFICATION_PLAN.md) — pre-registered rule + closure amendment
- [`A1_HUMAN_LABEL_PACKET.md`](./A1_HUMAN_LABEL_PACKET.md) — the label exercise and per-item results
- [`results/analysis/ROUTE_REANALYSIS.md`](../../../packages/agent-orchestrator/src/testing/harness/results/analysis/ROUTE_REANALYSIS.md)
- [`research/SYNTHESIS.md`](./research/SYNTHESIS.md) — the dossier that predicted "eval cannot decide"
