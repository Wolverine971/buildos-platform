---
doc_type: skill-reference
skill: cold_email_learning_review
reference: decision-gates-and-learning-memo
visibility: internal
publish: false
created: 2026-06-10
purpose: Sample-size and test-validity rules, the stop/iterate/recycle/scale gate tree, the learning memo template, and the buyer-language extraction worksheet for cold email learning reviews.
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_learning_review/references/decision-gates-and-learning-memo.md
---

# Decision Gates, Learning Memo, and Buyer-Language Worksheet

Load when deciding what to do next after a test, writing up results, or mining replies. Validity rules come first because the gate tree is meaningless on an invalid read.

## Sample-size and test-validity rules

Sources: Evan Miller, "How Not To Run An A/B Test" (https://www.evanmiller.org/how-not-to-run-an-ab-test.html); Kohavi et al., _Trustworthy Online Controlled Experiments_ ch. 1 (official excerpt) — usable principles: define an Overall Evaluation Criterion, test trustworthiness before interpreting, implement guardrail metrics, beware Twyman's law / carryover effects.

- **No peeking** (Evan Miller). Checking repeatedly and stopping at the first significant result inflates a nominal 5% false-positive rate to as much as **26.1%**. Decide sample size in advance; read once at the end.
- **Fixed-sample formula** (Evan Miller): n ≈ 16·(σ²/δ²) per arm, with σ² = p(1−p) for rates. Practical cold-email table (baseline 3% positive-reply rate):
    - detect 3% → 6% (doubling): ≈ **n=560 per arm**.
    - detect 3% → 4.5%: ≈ **n=2,100 per arm**.
    - detect 3% → 3.5%: ≈ **n=18,000 per arm** — i.e., micro-segment campaigns can only detect _large_ effects. If the campaign is <100 sends, treat results as qualitative evidence (buyer language, objection mix), never as a rate comparison.
- **One variable per test.** Holding rules: same CTA across variants, one persona × one signal, same list source per variant, same sending infrastructure per variant — otherwise placement differences masquerade as copy differences.
- **OEC for this suite** (Kohavi's OEC concept applied to the suite's north star): qualified conversations started per unit of market trust consumed — not replies, not meetings booked. The trust-consumed composite is internal methodology, not sourced fact; flag it as such.

## Stop / Iterate / Recycle / Scale decision tree

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

## Buyer-language extraction worksheet

Sources: Close Hail Mary dead-leads case, Fitzpatrick's Mom Test rules, Moesta's demand-side timeline.

For every reply (including negative), capture:

1. **Verbatim objection phrase** (not paraphrase — buyer words feed future copy).
2. **Named alternative/incumbent** ("going with [competitor] because…" — the Close Hail Mary case surfaced a previously unknown objection: easier hiring for the bigger-brand CRM).
3. **Timeline state** (Moesta): passive looking / active looking / deciding / onboarding / habit. "Not now" is timeline data → nurture, not failure.
4. **Evidence grade** (Mom Test): past behavior and current spend = strong; compliments and hypotheticals = weak. Tag compliments as weak unless paired with behavior.
5. **Decision dynamics** ("CEO made the call," "loved it but no power") → feeds the buying-committee map in `cold_email_icp_signal_design`.

Hail Mary corollary: don't end the conversation at the first reply — the price objection in the Close case only surfaced on the _second_ exchange. One follow-through question per reply minimum.

## Learning memo template

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

## Known gaps (do not paper over)

- The trust-consumed composite is internal methodology (see above).
- No source covers _time-decay of learning_ (how long a memo stays valid). Until sourced, re-validate any memo older than one provider-enforcement cycle before reusing its verdicts.
