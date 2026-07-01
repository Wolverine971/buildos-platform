---
name: Cold Email Learning Review
description: Child skill for converting cold outreach campaign results, replies, objections, and buyer language into a staged diagnosis, a gated stop/iterate/recycle/scale decision, and a learning memo — with sample-size discipline before any rate verdict.
skill_type: strategy # procedure | reference | strategy | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
parent_id: cold_email_engagement_first_outreach
depth: 1
preserve_markdown: true
dependencies:
    - id: cold_email_deliverability_readiness
      owns: Provider/deliverability rules and compliance/placement remediation (its `references/provider-requirement-matrix.md` holds the provider requirements — not duplicated here).
    - id: cold_email_reply_os
      owns: Reply handling and the one follow-through question per reply; logs and feeds the buyer-language file.
    - id: cold_email_icp_signal_design
      owns: ICP + signal design and the buying-committee map that decision-dynamics evidence feeds.
legacy_paths:
    - cold_email_outreach.learning_review
    - cold_email_outreach.campaign_review
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_learning_review/SKILL.md
---

# Cold Email Learning Review

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Examples → Provenance.
  This file is skill_type: strategy, so Judgment carries the weight — the metric-diagnostic rubric, the
  sample-size / test-validity rules, the stop/iterate/recycle/scale gate tree, and the buyer-language grading
  worksheet all live there. Procedure is the diagnose → gate → memo runbook. Knowledge holds the volatile,
  voluminous vendor benchmark bands (flagged as a reference-extraction candidate; no references/ dir yet).
-->

## Identity

Use this child skill when a campaign or test has results and the user needs to learn what to do next. The north star is qualified conversations started per unit of market trust consumed — never replies, meetings booked, or emails sent.

This is a **strategy** skill at **domain** altitude — the dominant verb is _decide_ (diagnose the one failing layer → run the gate tree → write the memo). It carries an ordered **Procedure** as a secondary shape and routes narrow sub-problems to sibling skills (see **Routing**).

## Activation

**Load this skill when:**

- A campaign has send, open, reply, positive-reply, meeting, bounce, complaint, or objection data
- The user asks whether to scale, stop, recycle, or change the offer
- Replies contain useful buyer language
- The team needs a learning memo after a test

## Judgment

The decision spine — the diagnostic rubric, the sample-size and validity rules, and the stop/iterate/recycle/scale gate tree that the Procedure reasons with. Do not read any rate as a verdict before passing the sample gate below; the vendor benchmark bands it leans on live in **Knowledge**.

### Metric diagnostic table (which metric diagnoses which failure)

Sources: Connor Murray's three-rate diagnostic (practitioner method: track three inputs, not one), extended with Austin Schneider / Instantly deliverability context and 2026 provider-enforcement changes.

| Metric                                      | What it diagnoses                                 | If low, suspect (in order)                                                                                   |
| ------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Delivered rate / bounce rate                | List hygiene + domain health                      | List source quality, verification skipped, domain reputation                                                 |
| Open rate                                   | Subject + preview + sender reputation + placement | 2026 note: compliance/placement failure first (auth, complaint rate), then subject/preview, then send timing |
| Reply rate (all)                            | Body craft + CTA friction                         | Passive language, multi-CTA, ask too large, no artifact offer                                                |
| **Positive** reply rate                     | Offer + segment fit                               | Offer not useful pre-meeting, wrong persona, stale signal                                                    |
| Meeting-booked rate (from positive replies) | Relevance paragraph + reply handling speed        | "Why I'm relevant" misses persona priorities; slow reply routing                                             |
| Meeting held rate                           | Qualification + expectation set in thread         | Front-end offer attracted bad-fit; no pre-call filter                                                        |
| Complaint / opt-out / angry-reply rate      | Trust consumed                                    | Segment too broad, cadence too long, fake personalization                                                    |

Hard rule (Connor Murray): **never optimize a single composite "reply rate."** Replies include "no," "stop," and "wrong person." Diagnose stage by stage.

Hard rule (Mailshake, State of Cold Email 2025): open rate is "a directional metric, not a definitive one... Use reply rate as your true north, not open rate." Opens are additionally unreliable due to privacy proxies — treat open deltas >10pts as signal, smaller moves as noise.

2026 placement context: Google began server-level rejection (not just spam-foldering) of non-compliant bulk mail in Nov 2025, and Microsoft rejects unauthenticated 5k+/day senders (`550 5.7.515`). **Low opens in 2026 are more likely a compliance/placement failure than a copy failure.** Route to → `cold_email_deliverability_readiness` (its `references/provider-requirement-matrix.md` holds the provider rules — do not duplicate them here).

### Sample-size and test-validity rules

Validity rules come first because the gate tree is meaningless on an invalid read.

Sources: Evan Miller, "How Not To Run An A/B Test" (https://www.evanmiller.org/how-not-to-run-an-ab-test.html); Kohavi et al., _Trustworthy Online Controlled Experiments_ ch. 1 (official excerpt) — usable principles: define an Overall Evaluation Criterion, test trustworthiness before interpreting, implement guardrail metrics, beware Twyman's law / carryover effects.

- **No peeking** (Evan Miller). Checking repeatedly and stopping at the first significant result inflates a nominal 5% false-positive rate to as much as **26.1%**. Decide sample size in advance; read once at the end.
- **Fixed-sample formula** (Evan Miller): n ≈ 16·(σ²/δ²) per arm, with σ² = p(1−p) for rates. Practical cold-email table (baseline 3% positive-reply rate):
    - detect 3% → 6% (doubling): ≈ **n=560 per arm**.
    - detect 3% → 4.5%: ≈ **n=2,100 per arm**.
    - detect 3% → 3.5%: ≈ **n=18,000 per arm** — i.e., micro-segment campaigns can only detect _large_ effects. If the campaign is <100 sends, treat results as qualitative evidence (buyer language, objection mix), never as a rate comparison.
- **One variable per test.** Holding rules: same CTA across variants, one persona × one signal, same list source per variant, same sending infrastructure per variant — otherwise placement differences masquerade as copy differences.
- **OEC for this suite** (Kohavi's OEC concept applied to the suite's north star): qualified conversations started per unit of market trust consumed — not replies, not meetings booked. The trust-consumed composite is internal methodology, not sourced fact; flag it as such.

### Stop / Iterate / Recycle / Scale decision tree

Assembled from: Schneider non-responder recycling, Mailshake bands, Aaron Shepherd volume-as-data and back-end qualification, Close "no response is a response," Predictable Revenue nurture asymmetry. **Gate values are defaults to tune per market — internal calibration, not industry standards.**

```text
0. TRUST GATE (check first, overrides everything):
   complaints >0.3% absolute or >0.1% sustained, bounce >5%,
   or spam-foldering evidence → STOP SENDING. Fix sender/list before
   reading any copy/offer metric. (Google/Yahoo 0.3% ceiling, 0.1% target;
   Mailshake bounce threshold.)

1. SAMPLE GATE: fewer than ~200 delivered per variant, or mixed personas
   → NO RATE VERDICT. Extract buyer language + objections only.
   Next action: keep sending or widen the same segment.

2. POSITIVE-REPLY GATE (offer/segment signal):
   positive reply ≥3% → candidate to SCALE (step 4).
   positive reply 1–3% → ITERATE: change ONE of offer artifact / persona
     priorities paragraph / signal freshness. Re-test same segment.
   positive reply <1% AND opens ≥30% → offer or segment is wrong:
     RECYCLE non-responders into a new campaign with a different
     opener + different artifact offer (Schneider replacement for touches 3–7).
   positive reply <1% AND opens <20% → packaging or placement problem:
     route to deliverability child first, then subject/preview rework.

3. QUALITY GATE (before scaling):
   meetings from positive replies <40%, or bad-fit replies >50% of replies
   → fix reply routing / qualification before scale (Shepherd back-end filter).

4. SCALE: widen the same persona × signal, add adjacent micro-segments
   (keep each <50–500 recipients per Schneider relevance cliff), add domains
   not per-inbox volume. Re-run gates at each expansion.

5. DEAD: two recycle attempts on the same segment with <1% positive reply
   and no usable buyer language → declare segment dead, document why,
   move budget. Keep the buyer-language file.
```

### Buyer-language extraction worksheet

Sources: Close Hail Mary dead-leads case, Fitzpatrick's Mom Test rules, Moesta's demand-side timeline.

For every reply (including negative), capture:

1. **Verbatim objection phrase** (not paraphrase — buyer words feed future copy).
2. **Named alternative/incumbent** ("going with [competitor] because…" — the Close Hail Mary case surfaced a previously unknown objection: easier hiring for the bigger-brand CRM).
3. **Timeline state** (Moesta): passive looking / active looking / deciding / onboarding / habit. "Not now" is timeline data → nurture, not failure.
4. **Evidence grade** (Mom Test): past behavior and current spend = strong; compliments and hypotheticals = weak. Tag compliments as weak unless paired with behavior.
5. **Decision dynamics** ("CEO made the call," "loved it but no power") → feeds the buying-committee map in → `cold_email_icp_signal_design`.

Hail Mary corollary: don't end the conversation at the first reply — the price objection in the Close case only surfaced on the _second_ exchange. One follow-through question per reply minimum.

## Procedure

Diagnose → gate → memo. Sequence and intent only; the rubric, thresholds, and gate logic each step leans on live in **Judgment** above.

1. Gather the raw counts, not just rates: sent, delivered, bounces, opens, replies, positive replies, meetings booked, meetings held, complaints, opt-outs, angry replies. Separate by variant and persona. Confirm the mode — recruiting, PR, and investor outreach use their own bands, never sales bands.
2. Run the diagnostic table in **Judgment** above, stage by stage: delivered/bounce → opens → replies → positive replies → meetings booked → meetings held → trust cost. Name exactly one most-likely failing layer (sender | segment | offer | body | proof | cadence | reply-handling). In 2026, treat low opens as a compliance/placement suspect before a copy suspect.
3. Check sample validity BEFORE concluding anything, using the sample-size and test-validity rules in **Judgment** above: below ~200 delivered per variant (or mixed personas) there is no rate verdict — downgrade to qualitative evidence only. If the test was monitored mid-flight and stopped on a "significant" result, flag the read as peeking-inflated and do not treat it as confirmed.
4. Extract buyer language and objection patterns with the worksheet: verbatim phrases, named incumbents, timeline state, evidence grade, decision dynamics. Negative replies count.
5. Run the gate tree in order — trust gate first (it overrides everything), then sample gate, positive-reply gate, quality gate — and decide: stop, iterate, recycle, scale, or dead. State which gate fired and why.
6. Propose the next test with exactly one variable changed, holding CTA, persona × signal, list source, and sending infrastructure constant. Pre-commit the sample size per arm from the fixed-sample table.
7. Write the learning memo using the template, including the sample verdict, trust cost, and nurture adds.

## Routing

Ownership map for the narrow sub-problems this skill hands off. It diagnoses and decides; these siblings own what it routes to.

| Trigger in the review                                                                           | Route to                              | That skill owns                                                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Compliance/placement suspected (low opens + auth/complaint signals; gate-tree placement branch) | `cold_email_deliverability_readiness` | Provider/deliverability rules (`references/provider-requirement-matrix.md`); compliance/placement fix |
| A reply needs its one follow-through question; buyer-language logging                           | `cold_email_reply_os`                 | Reply handling and the buyer-language log/feed                                                        |
| Decision-dynamics evidence (buying-committee) captured in the worksheet                         | `cold_email_icp_signal_design`        | ICP + signal design and the buying-committee map                                                      |

## Contract

- Metrics summary (counts + rates, per variant, with mode named)
- Sample verdict: rate-readable (n≥~200/arm) or qualitative only
- Diagnosis: the one most-likely failing layer, with the metric evidence that implicates it
- Buyer-language findings (verbatim) and objection mix
- Winning/losing lines
- Trust-cost signals (bounces, complaints, opt-outs, angry replies — flagged as the internal proxy composite)
- Gate decision: stop | iterate | recycle | scale | dead, plus which gate fired and the reasoning
- Next test: one variable, pre-committed sample size per arm
- Learning memo (filled template)

### Learning memo template

Structure is internal; content fields sourced as cited above.

```markdown
# Learning Memo — [campaign] — [date]

Mode / segment / signal: [persona × signal, n delivered]
Test variable (exactly one): [what changed vs control]
Funnel: delivered % | open % | reply % | positive reply % | meetings | held
Trust cost: bounces % | complaints % | opt-outs % | angry replies (count)
Sample verdict: [rate-readable (n≥~200/arm) | qualitative only]
Diagnosis (one layer): [sender | segment | offer | body | proof | cadence | reply-handling]
Buyer language (verbatim): - ...
Objection mix: [counts by class]
Winning / losing lines: ...
Decision: [stop | iterate | recycle | scale | dead] + which gate fired
Next test (one variable): ...
Nurture adds: [count of good-fit, not-now accounts added]
```

Nurture accounting (Predictable Revenue): assume only ~5% of created opportunities buy within 90 days; 95% of outbound value is the nurture pipeline; the channel takes 12–18 months to mature. A memo with zero meetings but real nurture adds and verbatim buyer language is a partial win, not a failure.

## Policy

- Do not optimize a single composite reply rate — diagnose stage by stage.
- Do not scale from tiny or mixed samples, and issue no rate verdict below the sample gate (~200 delivered per variant); below ~100 sends, results are qualitative evidence only.
- Do not peek: no early stops on mid-flight "significance" — repeated checking inflates a 5% false-positive rate to as much as 26.1% (Evan Miller). Pre-commit sample size; read once at the end.
- Trust gate overrides all other reads: complaints >0.3% (or >0.1% sustained), bounce >5%, or spam-foldering evidence means stop sending and fix sender/list before interpreting copy or offer metrics.
- Do not treat opens as buying intent, and treat open-rate deltas under 10pts as noise.
- Do not ignore negative replies, opt-outs, or complaints — they are trust-cost data and buyer-language data.
- Vendor benchmarks (Mailshake, Cognism, Lavender, Gem, Schneider) are directional only — triangulate before treating any band as governing, and never grade one mode against another mode's bands.
- Never optimize for emails sent — the north star is qualified conversations started per unit of market trust consumed.
- Do not declare a segment dead from a no-meetings result alone — count nurture adds first, and only after two failed recycle attempts with no usable buyer language.

## Knowledge

Volatile, voluminous, and dated: the vendor benchmark bands and the internal trust-cost proxy. Every benchmark here is vendor data — the caveat next to each number is part of the number. Do not read any rate as a verdict before passing the sample gate in **Judgment**.

### Benchmark bands (all directional-vendor; triangulate before treating as governing)

Methodology status governs how hard each number may be leaned on:

- **Methodology stated** (usable as directional bands): Mailshake (508-respondent survey, self-reported), Cognism (internal-team dataset with counts, labeled "directional, not diagnostic").
- **Sample stated, selection bias not characterized** (keep directional): Lavender.
- **Methodology NOT stated** (named-practitioner patterns only, never governing thresholds): Gem's 32% recruiting reply rate, Schneider's touch-decay percentages, infrastructure economics claims.

#### Mailshake State of Cold Email 2025 — [PRIMARY] (508 self-reporting senders, survey early 2025; methodology stated; self-reported caveat applies)

- Most common reply-rate band: **1–4%**. Only **~16% of senders exceed 5%** reply rate.
- Most common open-rate band: **10–30%**; few exceed 40%.
- Bounce: nearly half of senders report **2–5%**; **15% exceed 6%**. "Bounce rates above 5% signal risky list hygiene and can cripple sender reputation." Monitor weekly.
- **69% of respondents** said performance declined YoY (spam filtering + AI-content fatigue).
- Top performers who personalize 1:1 report **2–3x higher reply rates**; only **5% of senders** personalize every email individually.
- High-volume senders (1,000+/mo) were **not** more likely to generate more leads than low/mid volume senders.

#### Austin Schneider / Instantly — [practitioner] (named-practitioner pattern; methodology not stated — never a governing threshold)

- Industry-average reply rates fell **~5% → ~1%** after AI spam filters (Gmail 2024, Microsoft 2025); bulk-sender inbox placement fell **10–27%** Q1-2024→Q1-2025.
- Campaigns **<50 recipients: 5.8% reply** vs **>1,000 recipients: 2.1%** — the relevance ceiling.
- Touch effects: follow-up #1 **+49% replies**; email 3 **−20%** (2026 vs +9% in 2023); email 4+ **−55%** and trains filters to flag the sender as bulk.

#### Cognism State of Outbound 2026 — [PRIMARY] (internal Cognism team data; methodology stated: 149,376 emails, 451,895 calls, 39,679 meetings; their own label: "directional, not diagnostic")

- SDR cold-call answered rate **13.3%** vs AE warm-call **14.4%** — list quality and timing, not volume, drive connection.
- Channel task mix in their top motion: calls **57%**, LinkedIn **27%**, email **15%** — email-only learning loops under-read the market when the motion is multichannel.
- ~70% of SDR calls came from sequences; structure drives consistency, personalization drives meetings.

#### Lavender Cold Email Benchmark — [PRIMARY] (231,818 cold emails as of 2026-02-04, ~50k inboxes; directional-vendor — sample stated, selection bias not characterized; https://www.lavender.ai/blog/the-cold-email-benchmark-report)

- A-grade emails to operations: **5.4% reply** (58% lift over baseline). Finance: **79% lift** for A-grade, but only **6.1% of finance emails earn an A**. Technical buyers baseline ≈ **5.2%**.
- Use: quality lift is real and measurable per persona — when a campaign underperforms, grade the email quality before declaring the segment dead.

#### Gem — [practitioner] (vendor, recruiting mode; methodology not stated)

- Average **32% reply rate for a 4-stage recruiting sequence** — recruiting benchmarks are an order of magnitude above sales benchmarks; **never grade recruiting campaigns against sales bands**, and never let recruiting bands leak into sales-mode guidance (mode quarantine).

#### Predictable Revenue methodology — [practitioner] — validation-phase gates and nurture asymmetry

- Validation-phase gates for an outbound system: open rate **>40%**, meeting acceptance **>80%**, ~**20% of opportunities "go deep,"** SDR task on-time execution **>90%**.
- Nurture asymmetry: assume only **~5% of created opportunities buy within 90 days**; **95% of outbound value is the nurture pipeline**; the channel takes **12–18 months** to mature.
- Implication: a campaign is not "dead" because it produced no near-term meetings — count nurture-pipeline adds.

### Trust-cost proxy set — [internal-default] (internal methodology — not sourced fact)

No external source measures "market trust consumed." The proxy set is: complaint rate, opt-out rate, negative-reply share, spam-foldering trend. The component thresholds come from deliverability and benchmark sources above; the composite is internal BuildOS methodology. Flag it as such whenever it appears in output.

## Examples

### Worked Example

Condensed from a full campaign review; the input is in `evals.md` Task 1. Match this order — trust gate, sample gate, stage diagnostics, ONE layer, gate decision, memo — and never skip the gates to get to the verdict.

**Input:** Sales mode, one variant, one segment (heads of data, Series B SaaS × first-data-engineer hire signal), offering a "pipeline health checklist." 400 sent · 0.9% bounce · ~38% opens · 2 replies · 1 positive · 0 meetings · 0 complaints · 1 opt-out. Replies: _"Sure — send the checklist over… the pipeline alerting situation is rough"_ and _"We already use Monte Carlo for this. Not interested."_ User's ask: "38% opens — subject's working, double the volume next month?"

**Gate 0 — trust (first, overrides everything):** bounce 0.9% < 5% stop line; complaints 0 < 0.3% ceiling (0.1% sustained target); no spam-foldering evidence → **pass**. Safe to read further.

**Gate 1 — sample (before ANY rate verdict):** 400 sent − ~4 bounces ≈ **396 delivered**, single variant, single persona × signal ≥ ~200/variant floor → **rate-readable**, with the qualifier that n≈400 detects only large effects (per the fixed-sample table).

**Stage diagnostics (never a composite reply rate — replies include "no"):**

| Stage          | Value             | Read                                                                                                                                         |
| -------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Delivered      | ~99.1%            | List hygiene + domain healthy                                                                                                                |
| Opens          | ~38%              | Above Mailshake's common 10–30% band (508-sender self-reported survey — directional); privacy-proxy-inflated, directional, NOT buying intent |
| Replies (all)  | 2/396 ≈ 0.5%      | Low — but diagnose the next stage before blaming body copy                                                                                   |
| Positive reply | 1/396 ≈ **0.25%** | The diagnostic stage: positive-reply rate reads **offer + segment fit**                                                                      |
| Meetings       | 0                 | Not a death sentence — see nurture accounting                                                                                                |

2026 placement check: opens ≥30% and bounce <1% → compliance/placement is **ruled out**; no deliverability routing.

**Diagnosis (one layer):** **offer** — checklist not useful enough pre-meeting to this persona (segment is the secondary suspect). Evidence: positive 0.25% (<1%) while opens ≥30% — the funnel dies exactly where the offer is judged.

**Buyer language (worksheet, verbatim):** _"the pipeline alerting situation is rough"_ — pain language for the next opener; behavior (asked for the artifact) = strong-ish evidence. _"We already use Monte Carlo"_ — **named incumbent**, current spend = strong evidence the segment buys the category; objection class: already-solved/competitor. Hail Mary corollary: one follow-through learning question owed on the Monte Carlo reply (route via → `cold_email_reply_os`).

**Gate decision:** Positive-reply gate fired on the `<1% positive AND opens ≥30%` branch → **RECYCLE** non-responders into a new campaign with a different opener + different artifact offer (Schneider replacement for touches 3–7). The scale ask is refused: opens are not the gate metric. _Gate values are internal calibration defaults, not industry standards._

**Learning memo (filled template):**

```markdown
# Learning Memo — DataPilot heads-of-data v1 — 2026-06-11

Mode / segment / signal: sales; heads of data, Series B SaaS × first-data-eng hire; n≈396 delivered
Test variable (exactly one): n/a — single-variant baseline
Funnel: delivered 99.1% | open ~38% | reply 0.5% | positive reply 0.25% | meetings 0 | held 0
Trust cost: bounces 0.9% | complaints 0% | opt-outs 1 | angry 0 — internal proxy composite: low
Sample verdict: rate-readable (≈396 ≥ ~200/variant, single persona; large effects only)
Diagnosis (one layer): offer — positive <1% with opens ≥30%; placement and list ruled out
Buyer language (verbatim): - "the pipeline alerting situation is rough" - "We already use Monte Carlo for this"
Objection mix: already-solved/competitor ×1 (Monte Carlo)
Winning / losing lines: subject/preview earning opens (keep) | checklist offer not converting (replace)
Decision: recycle — positive-reply gate (<1% positive AND opens ≥30%); do NOT scale on opens
Next test (one variable): swap artifact to an alert-noise teardown built on the verbatim pain; hold CTA,
persona × signal, list source, sending infra; pre-commit ≈560/arm (3%→6% detection), read once at end
Nurture adds: 1 (positive replier — artifact sent, conversation live)
```

**Nurture accounting:** 0 meetings ≠ dead (Predictable Revenue: ~5% of opportunities buy within 90 days; 95% of outbound value is nurture). One live conversation + a named incumbent + verbatim pain language = a partial win, documented.

## Provenance

### Known gaps (do not paper over)

- The trust-consumed composite is internal methodology (see the trust-cost proxy set in **Knowledge**).
- No source covers _time-decay of learning_ (how long a memo stays valid). Until sourced, re-validate any memo older than one provider-enforcement cycle before reusing its verdicts.

### Notes

- Single-shell skill: the former reference modules (metric diagnostics/benchmarks and decision gates/learning memo) are folded inline — re-slotted across the **Judgment** (diagnostics, sample rules, gate tree, worksheet), **Knowledge** (benchmark bands, trust-cost proxy), and **Contract** (learning memo template) blocks — because both fire on every campaign review — diagnose → gate → memo is the primary job. Shell is ~280 lines / ~25KB incl. the worked example, acceptable per the `hook_craft` single-shell precedent (no conditional seam).
- Primary sources: Connor Murray (stage-by-stage rate diagnostics), Mailshake State of Cold Email 2025 (508-sender survey, self-reported), Cognism State of Outbound 2026 ("directional, not diagnostic"), Lavender benchmark (directional-vendor), Austin Schneider / Instantly (practitioner patterns), Predictable Revenue (validation gates, nurture asymmetry), Evan Miller + Kohavi (experiment validity).
- Maintainers: enrichment lineage lives at `docs/research/youtube-library/cold-email-children-enrichment-plan-2026-06-10.md` (not available at runtime).
