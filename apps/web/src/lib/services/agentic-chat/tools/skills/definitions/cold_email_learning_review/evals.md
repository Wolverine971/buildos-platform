<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_learning_review/evals.md -->

# Evals — cold_email_learning_review

Golden tasks per `../../EVALS_GUIDE.md`. Run B gets the shell only — this is a single-shell skill (diagnostics, benchmark bands, gates, sample rules, and the memo template were folded inline 2026-06-11; zero reference modules).

---

## Task 1 — Campaign diagnosis: high opens, dead replies

### Task prompt

> First real campaign for DataPilot is done and I want a read before next month. Sales outreach, one segment: heads of data at Series B SaaS companies, picked off a fresh signal (they just hired their first data engineer). One email variant, offering our "pipeline health checklist."
>
> Numbers: **400 sent, 0.9% bounce, ~38% opened, 2 replies, 1 positive, 0 meetings booked.** Zero spam complaints, one unsubscribe, no angry replies.
>
> The two replies:
>
> > "Sure — send the checklist over. We just hired our first data eng and honestly the pipeline alerting situation is rough."
>
> > "We already use Monte Carlo for this. Not interested."
>
> A 38% open rate seems great, so the subject line is clearly working — I'm thinking we double the volume next month. Sound right?

### Delta markers

1. **M1 (trust gate first):** Checks the trust gate BEFORE reading any copy/offer metric, with thresholds cited: bounce 0.9% vs the >5% stop line, complaints 0 vs the 0.3% ceiling / 0.1% sustained target — passes, stated explicitly as gate 0.
2. **M2 (sample gate before conclusions, math shown):** Runs the sample check BEFORE any rate verdict, showing the arithmetic: ~396 delivered, single variant, single persona × signal ≥ the ~200-delivered-per-variant floor → **rate-readable** (with the qualifier that n≈400 detects only large effects).
3. **M3 (stage-by-stage, never composite):** Lays the funnel out stage by stage (delivered → opens → replies → positive replies → meetings) and cites the hard rule: never optimize a single composite reply rate — replies include "no," "stop," and "wrong person."
4. **M4 (one failing layer, from the closed list):** Names exactly ONE most-likely failing layer from {sender | segment | offer | body | proof | cadence | reply-handling} — **offer** (with segment as the explicit secondary suspect) — with the implicating evidence: positive reply 1/396 ≈ 0.25% (<1%) while opens ≥30%, which is the offer/segment-is-wrong branch.
5. **M5 (honest negative — placement ruled out):** Does NOT route to `cold_email_deliverability_readiness` — explicitly rules out the 2026 compliance/placement suspect because opens are ≥30% and bounce is under the 5% line.
6. **M6 (benchmarks caveated):** Every vendor band used carries its methodology caveat — Mailshake bands as a 508-respondent self-reported survey (directional), Schneider figures as practitioner patterns never governing thresholds, Lavender as directional-vendor — and opens are treated as a directional metric inflated by privacy proxies, never as buying intent.
7. **M7 (gate decision with which-gate-fired):** Refuses the "double the volume" ask and issues **RECYCLE** — positive-reply gate fired on the `<1% positive AND opens ≥30%` branch: recycle non-responders into a new campaign with a different opener + different artifact offer (Schneider replacement for touches 3–7) — and flags the gate values as internal calibration defaults, not industry standards.
8. **M8 (buyer-language worksheet):** Extracts both replies per the worksheet: verbatim phrases (not paraphrase — "the pipeline alerting situation is rough"), the named incumbent (**Monte Carlo** = current spend, strong evidence), evidence grades, and the Hail Mary corollary (one follow-through question owed on the Monte Carlo reply — don't end at the first exchange).
9. **M9 (next test, one variable, pre-committed n):** Proposes the next test changing exactly ONE variable (the artifact offer), names the holding rules (same CTA, same persona × signal, same list source, same sending infrastructure), and pre-commits a sample size per arm from the fixed-sample table (≈560/arm at the 3%→6% detection scale) with the read-once / no-peeking commitment.
10. **M10 (filled learning memo):** Produces the learning memo with every template field filled: mode/segment/signal, test variable, funnel line, trust cost, sample verdict, one-layer diagnosis, verbatim buyer language, objection mix, winning/losing lines, decision + which gate fired, next test, nurture adds.
11. **M11 (nurture + internal-methodology flags):** Does not grade the campaign a failure for 0 meetings — counts the positive replier as a nurture/live-conversation add (Predictable Revenue asymmetry: ~5% buy within 90 days; 95% of value is the nurture pipeline) — and flags the trust-cost composite as internal methodology, not sourced fact.

### Expected load path

- `skill_load(cold_email_learning_review, full)` — the diagnostic table, benchmark bands, gate tree, sample rules, memo template, and `## Output Contract` all live outside the short-format parsed sections.
- References: none exist (single-shell skill). Any `skill_reference_load` attempt is a usage failure.
- Should NOT load: `cold_email_deliverability_readiness` content — placement is ruled out by the numbers, not investigated.

### Discovery probe

"Campaign results are in — 400 sends, 38% opens, only 2 replies. Should I scale it next month?" → catalog description matches on "converting cold outreach campaign results… into a staged diagnosis, a gated stop/iterate/recycle/scale decision, and a learning memo."

---

## Task 2 — Premature-conclusion trap: kill a segment at 60 sends

### Task prompt

> Quick gut-check. We're 60 sends into a planned 300-send campaign to compliance officers at fintech startups. I've been watching the dashboard every morning. Split test: variant A (pain-point subject line) is at 30 sends with zero replies; variant B (question subject line) is at 30 sends with one reply — and that reply was a no ("we handle this internally, please remove me").
>
> So: B beats A, and honestly the whole segment feels dead — zero meetings, basically zero interest. I'm going to kill the fintech segment today and move the rest of the sends to insurance companies. Reasonable?

### Delta markers

1. **M1 (sample-gate refusal):** Refuses to issue any rate verdict, citing the sample gate by its threshold: ~200 delivered per variant minimum (these arms are 30 each, 60 total); below ~100 sends results are **qualitative evidence only**.
2. **M2 (math shown):** Shows why 30/arm can't be read: per the fixed-sample table, even detecting a 3%→6% doubling needs ≈560 per arm (Evan Miller n ≈ 16·σ²/δ²); at n=30 the expected reply count difference is fractions of one reply — 0 vs 1 is noise.
3. **M3 (no-peeking flag):** Flags the daily dashboard-watching as peeking — repeated checks with intent to act inflate a nominal 5% false-positive rate to as much as **26.1%** — and prescribes pre-committing the sample size and reading once at the end.
4. **M4 (no variant winner):** Does NOT crown variant B over variant A. One reply (a negative one) at 30 sends is not a subject-line verdict.
5. **M5 (refuses the dead declaration):** Refuses to declare the segment dead, citing the dead-gate criteria: two recycle attempts on the same segment with <1% positive reply AND no usable buyer language — none of which has occurred — and the rule that a no-meetings result alone never kills a segment (nurture accounting comes first).
6. **M6 (gate decision: sample gate fired):** Names the decision and the gate: sample gate fired → NO RATE VERDICT; next action is to keep sending the pre-committed 300 (or widen the same segment) — not stop, not segment-switch mid-test.
7. **M7 (qualitative downgrade done properly):** Extracts what the 60 sends DID produce: the verbatim "we handle this internally, please remove me" → objection class (already solved, in-house), suppression honored on the remove-me, and the buyer-language file started; notes the Hail Mary corollary does NOT apply here (an opt-out gets no follow-through question).
8. **M8 (output contract):** Output follows the contract with the sample verdict field reading **qualitative only**, the gate decision naming which gate fired, and trust-cost signals reported (1 opt-out flagged as part of the internal proxy composite).
9. **M9 (honest negative — no benchmark adjudication):** Does NOT lean on vendor benchmark bands (Mailshake reply bands etc.) to adjudicate 30-send arms; if bands are mentioned at all they are caveated as directional and explicitly inapplicable below the sample gate.

### Expected load path

- `skill_load(cold_email_learning_review, full)` — sample rules and gate tree are outside the short-format sections.
- References: none exist; no reference loads.
- Should NOT route elsewhere: this is squarely the learning-review job (the user asks for a scale/kill read).

### Discovery probe

"Only 60 sends in and zero traction — can I kill this segment and move on?" → catalog description matches on "gated stop/iterate/recycle/scale decision… with sample-size discipline before any rate verdict."

---

## Results log

<!-- Append per EVALS_GUIDE.md. Template: -->
<!--
### YYYY-MM-DD — Task N — performer: <model>, judge: <model>
| Marker | A (without) | B (with) |
| --- | --- | --- |
| M1 | miss | hit |
Verdict: STRONG/WEAK/NO DELTA. Load path: as expected / deviations. Discovery probe: pass/fail.
Notes:
-->

### 2026-06-11 — Task 1 — manufacturing run — performer: Fable 5 (with skill), judge: self-check (not blind)

Single with-skill run to manufacture the `## Worked Example` for SKILL.md, per AUTHORING_GUIDE ingredient 1 — not a with/without A/B pair; no Run A, no verdict.

Self-assessed markers: **11/11 hit** (M1–M11). Load path honored in-manufacture: shell only (single-shell skill, no references exist). Output trimmed to ~65 lines — the filled learning memo kept whole as the heart of the exemplar — and embedded as `## Worked Example` in SKILL.md after `## Output Contract`.
Notes: The "38% opens = subject works, double the volume" trap is the load-bearing part of the fixture — the gate tree's `<1% positive AND opens ≥30%` branch is what converts the user's scale instinct into RECYCLE. First pass cited the Mailshake open band without its self-reported caveat; fixed before embedding (M6). A real blind A/B pair is still owed for both tasks.

### 2026-06-12 — Task 1 — BLIND A/B (the owed pair; prior wave-2 entry was a with-skill self-check) — performer (with/without) + blind judge: claude-opus-4-8 (workflow subagents)

| Marker | without | with |
| --- | --- | --- |
| M1 | miss | hit |
| M2 | miss | hit |
| M3 | miss | hit |
| M4 | miss | hit |
| M5 | miss | hit |
| M6 | miss | hit |
| M7 | miss | hit |
| M8 | miss | hit |
| M9 | miss | hit |
| M10 | miss | hit |
| M11 | miss | hit |

Verdict: **STRONG DELTA**. With-skill hit 11/11 markers; gap over no-skill = 11 markers. Refusal missed by skill run: False.
Load path (expected, not re-tested this run): skill_load(cold_email_learning_review, full) — full shell only (single-shell skill: diagnostic table, benchmark bands, gate tree, sample rules, memo template, and Output Contract all live outside the short-format parsed sections); no references exist so any reference load is a usage failure; must NOT load cold_email_deliverability_readiness (placement is ruled out by the numbers, not investigated).
Notes: Output Y (skill run) hits all 11 markers: ordered gate tree (trust gate 0 first with thresholds), sample arithmetic with ~200/variant floor and n~400 caveat, stage funnel + "never composite reply rate," one-layer offer diagnosis, placement explicitly ruled out, vendor methodology caveats, RECYCLE refusal naming the fired gate, verbatim buyer-language worksheet + Monte Carlo + Hail Mary, one-variable next test with ~560/arm + no-peeking, full learning memo, and nurture asymmetry. Output X is a competent generic read (correctly rejects doubling, flags opens as privacy-inflated) but hits 0 markers — no gate tree, no sample discipline, no fixed-sample table, no memo, no RECYCLE verdict, no methodology caveats. Surprising near-miss in X: it independently got "don't scale on opens" and the segment/incumbent insight, but never in the skill's named-rule form, so all score as partial=miss. No marker-wording problems.
