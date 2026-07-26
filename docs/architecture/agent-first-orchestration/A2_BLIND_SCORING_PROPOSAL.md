<!-- docs/architecture/agent-first-orchestration/A2_BLIND_SCORING_PROPOSAL.md -->

# A2 blind-scoring proposal — DJ gate 4

**Status:** Approved by DJ; mechanic amended to `phase-a-a2-blind-v2` on 2026-07-25
**Date:** 2026-07-25
**Applies to:** C06, C07, and C08 workflow-versus-control comparison

## Recommendation

Score exactly **nine blind pairs**: three fresh workflow outputs and three fresh control outputs
for each of C06, C07, and C08, paired by scenario and run index. This matches the frozen 6/9 win
threshold; no extra pairs or selective reruns enter the denominator.

### Blind packet

- Label outputs A/B using the **counterbalanced** `phase-a-a2-blind-v2` mapping (see the amendment
  below). Store the mapping outside the judge packet.
- Strip lane, model, provider, latency, cost, and tool-trace metadata. Preserve response text,
  citations, and user-visible artifacts exactly.
- Run the frozen machine acceptance checks before judging. A tie, error, empty response, or
  required-check failure cannot count as a workflow win, regardless of judge preference.

### Automated panel

Use three exact-pinned judges that are outside every compared execution role:

1. `openai/gpt-5.6-luna`
2. `x-ai/grok-4.5`
3. `moonshotai/kimi-k3`

Each judge sees the same request, acceptance criteria, and A/B outputs and returns strict JSON at
temperature 0. A judge scores correctness, completeness, grounding/citations, usefulness, and
constraint adherence from 0–4, then chooses `A`, `B`, or `tie` with a short rationale and
confidence. The pair winner is the majority choice; no majority is a tie. Ties are non-wins.

The judge prompt, JSON schema, rubric, pins, A/B mapping algorithm, and aggregation code are hashed
and frozen before workflow/control generation. A judge transport failure is replaced once; a
model-matched bad judgment remains in the panel and cannot be silently swapped.

### DJ validation

Because the final set is only nine pairs, DJ blind-scores **all nine**, independently and before
seeing the panel result. The panel is validated only if its pair winner agrees with DJ on at least
7/9 pairs and there is no complete scenario-level inversion. If validation fails, the blind score
is invalid: stop, diagnose the rubric/judge bias, and seek a new gate-4 approval. Do not choose the
more favorable scorer after seeing results.

### Frozen outcome rule

- Workflow needs at least **6/9 wins**. Ties and invalid/bad outputs are non-wins.
- Workflow mean complex-run cost must be ≤$0.022479.
- Workflow total-duration p50/p95 must be ≤193,325/297,738 ms.
- Any mutation/write call is an immediate stop for the run set.
- All raw outputs, blinded packets, individual judgments, DJ labels, mappings, acceptance results,
  token/cost/latency records, and aggregate decisions are persisted.

## Approval record

DJ approved gate 4 on 2026-07-25, approving all three together:

1. the three-model panel above;
2. DJ independently scoring all nine blind pairs;
3. the 7/9 panel-validation floor and invalidation behavior.

The prompt/schema, model pins, mapping algorithm, aggregation rule, and validation rule must be
implemented and hashed before any scored workflow or control output is generated. A2 may now
proceed under that frozen mechanic.

The executable mechanic was first frozen at
`720a42ef192d961c77068c49aceec24c027cbf633259ddf0b91b73271619f4d8` (`phase-a-a2-blind-v1`). Its
source and regression tests live in `packages/agent-orchestrator/src/testing/harness/blind-judge.ts`
and `blind-judge.test.ts`.

## Amendment — counterbalanced A/B mapping (`phase-a-a2-blind-v2`)

The v1 mapping hashed each `(scenario, run)` pair independently, which left the A/B split to
chance. Computed against the real corpus it produced:

| Scenario | r1    | r2    | r3    |
| -------- | ----- | ----- | ----- |
| C06      | B     | B     | A     |
| **C07**  | **A** | **A** | **A** |
| C08      | A     | A     | B     |

Workflow sat on side A in 6 of 9 pairs and in **all three C07 pairs** — the scenario whose control
runs are a crashed turn. Any position bias in a judge or in DJ would correlate directly with lane
inside that scenario.

v2 uses the hash only to pick a rotation, then assigns sides structurally: sort the scenario ids;
`rotation = first byte of sha256(policy_version + "\n" + corpus_version) mod 2`; for the scenario
at sorted index `i`, workflow takes side A on odd run indexes when `(i + rotation)` is even and on
even run indexes otherwise. That guarantees every scenario is split 2:1 or 1:2, that adjacent
scenarios invert so run index does not correlate with lane globally, and an overall 5:4 split:

| Scenario | r1  | r2  | r3  |
| -------- | --- | --- | --- |
| C06      | A   | B   | A   |
| C07      | B   | A   | B   |
| C08      | A   | B   | A   |

**Nothing was invalidated by this change.** No workflow output had been scored, no blind pair had
been generated, and no judge had been called. Changing the mechanic after the first scored output
would not be legitimate; changing it before is free, and the regression test in
`blind-judge.test.ts` now asserts the counterbalance properties directly.

Every other element of gate 4 — the three pins, the prompt, the JSON schema, the rubric, majority
aggregation, workflow-win eligibility, 7/9 DJ validation, and the scenario-inversion rule — is
unchanged. The recomputed mechanic hash is
`ba2602e89290f76688b61ffc957f58591405de01547be0e493c657059ca774d2` (SHA-256), frozen 2026-07-25
before any output generation.

Recommended by [`PHASE_A_AUDIT_2026-07-25.md`](./PHASE_A_AUDIT_2026-07-25.md) S3; DJ authorized
the audit's recommended changes on 2026-07-25.
