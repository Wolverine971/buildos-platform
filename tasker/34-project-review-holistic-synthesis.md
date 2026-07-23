<!-- tasker/34-project-review-holistic-synthesis.md -->

# 34 - Holistic Project Review Synthesis

**Created:** 2026-07-22
**Priority:** P2, after the remaining Project Review freshness/live-smoke closure
**Type:** Product/engineering shaping + bounded build
**Terminology:** `docs/product/PROJECT_REVIEW_TAXONOMY.md`
**Origin:** Extracted from tasker 28 Phase 2 so it remains visible as a distinct outcome.

## Why This Task Exists

The lightweight Project Review path is a real per-project review pass, but it is not yet a
holistic synthesis/reconciliation pass.

Today the worker:

1. builds `project_loop_runs.brief` before generating findings;
2. runs four separate review families: document organization, outdated documents, drift,
   and task conflicts;
3. concatenates the results, then applies deterministic suppression, rotation, freshness,
   and the per-project attention budget.

The brief therefore cannot synthesize the findings produced later in the same pass. The
deterministic layer can remove exact/semantic-key duplicates and rank admission, but it
cannot reconcile cross-family overlap, explain tensions, or produce one coherent answer to
"What changed, what matters, and what needs my judgment?"

Complete Project Audit already provides a deeper evidence-scaffold + LLM synthesis and
durable report. This task must complement that path, not recreate it on a daily cadence.

## Desired Outcome

Every materially useful light review pass ends with one bounded project-level synthesis
that:

- summarizes what changed or was re-confirmed;
- reconciles overlaps and contradictions across review families;
- identifies the few findings that matter now and why;
- separates information, safe cleanup, and decisions requiring judgment;
- cites the candidate/evidence rows it relied on;
- preserves every underlying candidate and user decision trail;
- can explicitly conclude that no user attention is needed.

The synthesis is contextual parent metadata for Project Review. Actionable child review
items remain the objects the user accepts, addresses, discusses, or dismisses.

## Recommended Shape

### 1. Move from pre-generator brief to final synthesis

Keep a zero/low-cost orientation summary if generators need it, but persist the user-facing
brief only after candidate generation and deterministic suppression. Its input should
include:

- the bounded project snapshot and material change summary;
- the four families' candidates, including suppressed/re-confirmed relationships;
- prior decisions and dismissal feedback;
- latest Complete Project Audit headline/dimensions when available;
- the current attention budget and admission result.

### 2. Produce a typed, evidence-bound result

At minimum:

- `state_summary`
- `what_changed[]`
- `what_matters_now[]`
- `tensions_or_contradictions[]`
- `decision_item_ids[]`
- `safe_cleanup_item_ids[]`
- `cluster_members[]` for cross-kind overlap
- `no_attention_reason` when nothing should interrupt the user
- evidence/candidate references for every substantive claim

The exact persistence choice may extend `project_loop_runs.brief` or introduce a versioned
run-synthesis payload. Avoid a second competing project-summary source of truth.

### 3. Keep compaction reversible

If multiple candidates become one surfaced decision item, record the member IDs and a
`merged_into`/cluster disposition. The model may group and prioritize; it must not silently
delete, hard-dismiss, or mutate source candidates.

### 4. Preserve the audit boundary

| Light Project Review synthesis                             | Complete Project Audit                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| Recent-change and current-attention oriented               | Whole-project, report-quality assessment                             |
| Small bounded context and existing review budget           | Broader evidence scaffold and higher budget                          |
| Parent context plus a few review items                     | Durable report, dimensions, confidence, risks, questions, follow-ups |
| Runs after ordinary review triggers when materially useful | Manual/scheduled/qualified-burst cadence                             |

The light synthesis may reference the latest audit; it must not regenerate audit dimensions
or a second audit report.

## Trigger And Cost Decision

Default recommendation: synthesize after a successful light review when there are new or
re-confirmed candidates, a material project change, or attention-budget overflow. Persist a
deterministic no-change summary when none apply. Keep the call inside the existing review
cost cap or define an explicit sub-budget; never create an unbounded follow-on run.

## Evaluation And Telemetry

Before broad exposure, create a small fixture/eval set covering:

- overlapping outdated-doc + drift findings;
- contradictory task-conflict + next-action signals;
- all-low-value candidates where no interruption is correct;
- prior dismissals that should change framing or ranking;
- a recent Complete Project Audit that the light synthesis should reference, not repeat;
- evidence missing or conflicting, where uncertainty must be explicit.

Track synthesis attempted/skipped/fallback, cost, cluster count, candidates reduced to
surfaced items, evidence-reference validity, user accept/dismiss/address rates, and whether
the pass produced a no-attention outcome.

## Non-Goals

- Do not turn Project Reviews into a model-directed agent loop.
- Do not add autonomous project mutations.
- Do not replace the four existing review families.
- Do not replace or duplicate Complete Project Audit.
- Do not rename legacy schema, queue, route, or code identifiers as part of this build.
- Do not add a global cross-project broker here; that remains a separate follow-on in
  tasker 28 unless it is deliberately re-scoped.

## Done When

- A final cross-family synthesis consumes the current pass's candidate set.
- The persisted Project Review brief reflects generated findings rather than preceding them.
- Every claim and cluster is traceable to project evidence or candidate IDs.
- Underlying candidates and user-decision history remain intact and reversible.
- Complete Project Audit retains its distinct report role.
- Project Inbox can render the synthesis as parent context without making it another inbox
  decision item.
- Focused tests/evals cover overlap, contradiction, no-attention, prior-feedback, audit-boundary,
  cost-cap, and model-fallback behavior.
- A live/manual Project Review smoke confirms the final synthesis, child review items, and
  attention-budget behavior agree.
