---
name: Cold Email Learning Review
description: Child skill for converting cold outreach campaign results, replies, objections, and buyer language into a staged diagnosis, a gated stop/iterate/recycle/scale decision, and a learning memo — with sample-size discipline before any rate verdict.
parent_id: cold_email_engagement_first_outreach
depth: 1
preserve_markdown: true
legacy_paths:
    - cold_email_outreach.learning_review
    - cold_email_outreach.campaign_review
reference_modules:
    - id: cold_email_learning_review.metric_diagnostics
      name: Metric Diagnostics and Benchmark Bands
      summary: Metric-to-failure diagnostic table, directional benchmark bands with vendor caveats inline (Mailshake, Cognism, Lavender, Schneider, Predictable Revenue), 2026 placement context, and mode quarantine (recruiting 32% vs sales 1–4%).
      when_to_load:
          - When interpreting campaign numbers or comparing results against "normal" for the mode.
          - When deciding which funnel stage (sender, segment, offer, body, proof, cadence, reply handling) a weak metric implicates.
      path: references/metric-diagnostics-and-benchmarks.md
      visibility: internal
    - id: cold_email_learning_review.decision_gates_and_memo
      name: Decision Gates and Learning Memo
      summary: Sample-size table and no-peeking rule (Evan Miller), one-variable holding rules, the trust/sample/positive-reply/quality gate tree for stop/iterate/recycle/scale/dead, the learning memo template, and the buyer-language extraction worksheet.
      when_to_load:
          - When deciding what to do next after a test, before declaring any verdict.
          - When writing the learning memo or mining replies for buyer language and objections.
      path: references/decision-gates-and-learning-memo.md
      visibility: internal
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_learning_review/SKILL.md
---

# Cold Email Learning Review

Use this child skill when a campaign or test has results and the user needs to learn what to do next. The north star is qualified conversations started per unit of market trust consumed — never replies, meetings booked, or emails sent.

## When to Use

- A campaign has send, open, reply, positive-reply, meeting, bounce, complaint, or objection data
- The user asks whether to scale, stop, recycle, or change the offer
- Replies contain useful buyer language
- The team needs a learning memo after a test

## Workflow

1. Gather the raw counts, not just rates: sent, delivered, bounces, opens, replies, positive replies, meetings booked, meetings held, complaints, opt-outs, angry replies. Separate by variant and persona. Confirm the mode — recruiting, PR, and investor outreach use their own bands, never sales bands.
2. Load `cold_email_learning_review.metric_diagnostics` and run the diagnostic table stage by stage: delivered/bounce → opens → replies → positive replies → meetings booked → meetings held → trust cost. Name exactly one most-likely failing layer (sender | segment | offer | body | proof | cadence | reply-handling). In 2026, treat low opens as a compliance/placement suspect before a copy suspect.
3. Check sample validity BEFORE concluding anything. Load `cold_email_learning_review.decision_gates_and_memo`: below ~200 delivered per variant (or mixed personas) there is no rate verdict — downgrade to qualitative evidence only. If the test was monitored mid-flight and stopped on a "significant" result, flag the read as peeking-inflated and do not treat it as confirmed.
4. Extract buyer language and objection patterns with the worksheet: verbatim phrases, named incumbents, timeline state, evidence grade, decision dynamics. Negative replies count.
5. Run the gate tree in order — trust gate first (it overrides everything), then sample gate, positive-reply gate, quality gate — and decide: stop, iterate, recycle, scale, or dead. State which gate fired and why.
6. Propose the next test with exactly one variable changed, holding CTA, persona × signal, list source, and sending infrastructure constant. Pre-commit the sample size per arm from the fixed-sample table.
7. Write the learning memo using the template, including the sample verdict, trust cost, and nurture adds.

## Output Contract

- Metrics summary (counts + rates, per variant, with mode named)
- Sample verdict: rate-readable (n≥~200/arm) or qualitative only
- Diagnosis: the one most-likely failing layer, with the metric evidence that implicates it
- Buyer-language findings (verbatim) and objection mix
- Winning/losing lines
- Trust-cost signals (bounces, complaints, opt-outs, angry replies — flagged as the internal proxy composite)
- Gate decision: stop | iterate | recycle | scale | dead, plus which gate fired and the reasoning
- Next test: one variable, pre-committed sample size per arm
- Learning memo (filled template)

## Guardrails

- Do not optimize a single composite reply rate — diagnose stage by stage.
- Do not scale from tiny or mixed samples, and issue no rate verdict below the sample gate (~200 delivered per variant); below ~100 sends, results are qualitative evidence only.
- Do not peek: no early stops on mid-flight "significance" — repeated checking inflates a 5% false-positive rate to as much as 26.1% (Evan Miller). Pre-commit sample size; read once at the end.
- Trust gate overrides all other reads: complaints >0.3% (or >0.1% sustained), bounce >5%, or spam-foldering evidence means stop sending and fix sender/list before interpreting copy or offer metrics.
- Do not treat opens as buying intent, and treat open-rate deltas under 10pts as noise.
- Do not ignore negative replies, opt-outs, or complaints — they are trust-cost data and buyer-language data.
- Vendor benchmarks (Mailshake, Cognism, Lavender, Gem, Schneider) are directional only — triangulate before treating any band as governing, and never grade one mode against another mode's bands.
- Never optimize for emails sent — the north star is qualified conversations started per unit of market trust consumed.
- Do not declare a segment dead from a no-meetings result alone — count nurture adds first, and only after two failed recycle attempts with no usable buyer language.

## Notes

- Reference modules: `cold_email_learning_review.metric_diagnostics` (reading the numbers), `cold_email_learning_review.decision_gates_and_memo` (deciding and documenting).
- Primary sources: Connor Murray (stage-by-stage rate diagnostics), Mailshake State of Cold Email 2025 (508-sender survey, self-reported), Cognism State of Outbound 2026 ("directional, not diagnostic"), Lavender benchmark (directional-vendor), Austin Schneider / Instantly (practitioner patterns), Predictable Revenue (validation gates, nurture asymmetry), Evan Miller + Kohavi (experiment validity).
- Maintainers: enrichment lineage lives at `docs/research/youtube-library/cold-email-children-enrichment-plan-2026-06-10.md` (not available at runtime).
