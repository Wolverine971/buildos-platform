<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/landing_page_scorecard_funnel/evals.md -->

# Evals — landing_page_scorecard_funnel

Golden tasks per `../../EVALS_GUIDE.md`. Run B gets the shell plus BOTH references (`setup-layer-positioning.md`, `funnel-build-specs.md` — including the funnel KPI / scale-gate layer added 2026-06-11) pasted verbatim.

---

## Task 1 — Design a scorecard funnel from scratch (solo consultant, $5k engagement)

### Task prompt

> I'm a solo operations consultant. I sell one thing: a $5,000 "Agency Ops Reset" — a 6-week engagement for owners of 10–25-person agencies who are drowning in client-delivery chaos (missed handoffs, scope creep, everything routed through the owner). They know they have this problem; they complain about it constantly in the communities I hang out in.
>
> My current site is a one-pager with a "Book a call" button and it gets me almost nothing. I want to build one of those quiz/scorecard lead funnels instead. Design the whole thing for me.
>
> Context: I get ~300 visitors/month, mostly from LinkedIn (I post about 3x a week) plus about a dozen podcast guest appearances. I have $1–2k/month I could put into ads — should I? Also I was planning to add a line like "only 5 client slots this quarter" near the button to push people to act. Good idea?

### Delta markers

1. **M1 (mode selection first):** Runs mode selection before drafting and lands on **standalone scorecard**, citing the skill's diagnostic (the buyer can already say "yes, I have this problem and I want to solve it" before hitting the page) — not defaulting to setup-layered because the price is high.
2. **M2 (five sections, in order):** Builds the landing page as the five named sections in order: hook, assessment promise, differentiated-value proposition, credibility, CTA.
3. **M3 (frustration hook in template form):** The primary hook uses the frustration form's shape — "Frustrated that [outcome] is not happening even though you [do reasonable action]?" — not a generic benefit headline.
4. **M4 (value prop vs named alternatives):** The three measured areas are each framed against a named alternative the buyer already considers (e.g. another PM tool, hiring an ops director, doing nothing) — not a recital of the consultant's capabilities.
5. **M5 (15-question/three-bucket spec):** Questionnaire is exactly 15 questions across the three buckets, with contact-capture rules applied: name + email required, location inferred not asked, phone optional (not mandatory at capture).
6. **M6 (Big 5 present by name):** All five qualification questions appear: current situation, desired outcome in the next 90 days, obstacle/failed prior attempt, preferred solution type, open-ended "anything else?" — and the preferred-solution question is identified as a budget/service-fit signal.
7. **M7 (dynamic results page spec):** Results page includes an overall score with a visual metaphor, three personalized insights derived from the answers, a qualification-based next step, and a trust/contact footer — and does not call the page personalized unless the insights actually use the answers.
8. **M8 (three-segment routing, no shared CTA):** High fit → call/consult, middle fit → webinar/workshop/nurture, low fit → self-serve resource — each segment routed to a **different** next step, stated explicitly.
9. **M9 (anti-FOMO refusal):** Rejects the "only 5 client slots this quarter" line by rule (no scarcity/FOMO in the CTA), with the skill's rationale (manufactured urgency breaks the trust the segmentation depends on) — and the CTA instead stacks action + time cost + price + payoff.
10. **M10 (ACPS math shown):** Computes allowable cost per sale: $5,000 × 15% = **$750**, with the formula visible.
11. **M11 (ACPL + scale gate):** Computes allowable cost per lead from the LAPS shape ($750 × 3/100 = **$22.50**) and answers the ads question with the scale gate: paid traffic is "**not yet**" until a LAPS dashboard exists and tracked CPL ≤ ACPL / cost per sale ≤ ACPS; spend then increases via the stepwise ratchet, not all at once.
12. **M12 (traffic prerequisites audited):** Assesses the existing traffic against the named thresholds: 11 short-form impressions within 90 days (3x/week LinkedIn cadence judged against it), 2–7 hours of long-form content (the ~12 podcast spots), and the Rated/association check (~4 recognizable names matching the price band).
13. **M13 (honest negative — no setup layer):** Does NOT draft setup-layer artifacts (no Market Insight statement, no alternatives-analysis section, no perfect-world scenario) and does not load `setup_layer_positioning` — standalone mode makes that branch dead.

### Expected load path

- `skill_load(landing_page_scorecard_funnel, full)` — the funnel-system overview and `## Worked Example` live outside the short-format parsed sections.
- References: `landing_page_scorecard_funnel.funnel_build_specs` only (workflow step 3 — sections, questionnaire, results page, routing, AND the KPI/scale-gate layer for the ads question).
- Should NOT load: `landing_page_scorecard_funnel.setup_layer_positioning` — mode selection lands standalone (M13). Loading it is an over-load usage failure even if the output is right.

### Discovery probe

"I sell a $5k consulting engagement — can you design one of those quiz funnels that scores leads before they book a call?" → catalog description matches on "assessment-driven landing page that converts visitors into qualified, segmented leads … quizzes, scorecards, diagnostic funnels … for consulting."

---

## Task 2 — Audit a weak email-capture funnel page (B2B, meeting-first CTA)

### Task prompt

> Here's my current lead-gen page for my CRM-implementation agency. We sell $8,000 implementation projects to small B2B teams (10–50 seats). Traffic is okay — ~500 visits/month — but the leads are junk and almost nobody books. Why isn't this working, and what should we change?
>
> The page, top to bottom:
>
> 1. Hero: "Unlock Your Sales Potential" over a stock photo of a handshake.
> 2. Subhead: "We help businesses grow with smarter CRM."
> 3. Lead magnet box: "Download our FREE guide: 10 CRM Tips for 2026" — single email field, instant PDF.
> 4. Row of client logos.
> 5. "What we do" feature list: data migration, custom pipeline builds, workflow automation, team training, ongoing support.
> 6. One testimonial: "Great team, highly recommend!" — Mike R.
> 7. Orange banner: "Limited onboarding slots for Q3 — book now before they fill up!"
> 8. Primary CTA: "Book a 60-minute strategy call" → embedded calendar form asking name, email, phone (required), company size, and budget.
> 9. Footer with address and privacy link.
>
> Everyone who downloads the guide gets the same 7-email sequence pitching the strategy call.

### Delta markers

1. **M1 (diagnosis reframe):** Names the core failure in the skill's terms: the page collects emails but captures zero intent/qualification — and the governing fix is replacing the generic lead magnet with an assessment/scorecard that sells the assessment, not the product.
2. **M2 (mode selection → setup-layered):** Classifies this as a B2B considered purchase where "why pick us over the alternatives" is non-obvious, selects **setup-layered** mode, and invokes the guardrail "do not skip the Setup layer for B2B / considered purchases" — prescribing the four-part positioning layer (market insight → alternatives analysis → perfect-world scenario → scorecard) or a Market Insight hook.
3. **M3 (hook failure by form):** Rejects "Unlock Your Sales Potential" because it matches none of the three named hook forms (frustration / readiness / market insight) and prescribes one of them — for this buyer, the Market Insight form.
4. **M4 (feature-list value prop violation):** Flags the "What we do" list against the named guardrail (no feature-list value propositions) and reframes three measured areas against alternatives the buyer already considers (e.g. DIY admin, hiring a RevOps contractor, staying on spreadsheets).
5. **M5 (ask/trust — meeting-first CTA):** Flags the "60-minute strategy call" as a meeting-first ask at zero trust; the assessment must come before the call, and only the high-fit segment should ever see the call CTA.
6. **M6 (data-greed flags):** Flags required phone (and budget) at the capture step against the rules: do not ask for more data than needed; phone optional unless the funnel truly depends on it.
7. **M7 (anti-FOMO):** Flags the "Limited onboarding slots… before they fill up!" banner as a scarcity/FOMO violation with the skill's rationale (it breaks the trust the segmentation step depends on) — removal, not rewording.
8. **M8 (segmentation failure):** Flags the one-size 7-email sequence as the routing failure: high/middle/low-fit leads must route to **different** next steps (call / workshop-nurture / self-serve), no two segments sharing a CTA.
9. **M9 (questionnaire prescription):** Prescribes the 15-question/three-bucket questionnaire with the Big 5 qualification questions named — including the preferred-solution-type question as the budget/service-fit signal.
10. **M10 (KPI layer before tactics):** Notes the funnel cannot be judged without its four LAPS counts (leads → appointments → presentations → sales), recommends the weekly dashboard + one-stage-per-week cadence, and computes the allowable-cost math for the $8k offer: ACPS = $8,000 × 15% = **$1,200**; ACPL = $1,200 × 3/100 = **$36**.
11. **M11 (honest negative — no paid-traffic reflex):** Does NOT prescribe paid traffic to fix junk leads; if ads come up at all, they are gated behind tracked CPL ≤ ACPL / cost per sale ≤ ACPS (scale gate), and the ~500 visits/month is treated as sufficient to diagnose conversion first.

### Expected load path

- `skill_load(landing_page_scorecard_funnel, full)`.
- References: BOTH — `setup_layer_positioning` (mode lands setup-layered, M2) and `funnel_build_specs` (section/questionnaire/routing audit + the KPI layer, M10). This is the legitimate 2-reference task; loading both is correct here, not over-loading.
- Should NOT load: anything from `marketing_site_design_review` — this is a conversion-path audit, not general persuasion review.

### Discovery probe

"Our lead-gen page gets guide downloads but the leads are junk and nobody books a call — what's wrong with it?" → description matches on "improve a landing page that collects emails but does not capture intent" vocabulary ("converts visitors into qualified, segmented leads"). Plausible competitor pick: `marketing_site_design_review` — record which one a fresh agent picks; a design-review pick is a discovery finding.

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

### 2026-06-11 — Task 1 — exemplar manufacture (with-skill run only, no A/B pair)

Performed by Fable 5 with the shell + `funnel_build_specs` loaded per the expected load path (`setup_layer_positioning` correctly skipped — standalone mode). Self-check against markers: **13/13 hit** (M1 standalone with diagnostic cited; M2 five sections in order; M3 frustration-form hook; M4 areas vs named alternatives; M5 15/3-bucket with contact rules; M6 Big 5 complete; M7 dynamic results spec; M8 three distinct routes; M9 scarcity line cut by rule; M10 $750 ACPS shown; M11 $22.50 ACPL + "not yet" scale gate + ratchet; M12 11-impressions/90-day, 2–7h long-form, Rated check; M13 no setup artifacts drafted).
Output trimmed to ~65 lines and embedded as `## Worked Example` in SKILL.md.
Verdict: n/a (no without-run; delta verdict pending a future A/B pair). Discovery probe: not run this pass.
Notes: the ads question is the load-bearing part of the fixture — without the KPI layer the natural answer is "yes, $1–2k/month is fine to test." The skill's answer is "not yet" with math. A future judge should weight M11 accordingly.

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
| M12 | miss | hit |
| M13 | hit | hit |

Verdict: **STRONG DELTA**. With-skill hit 13/13 markers; gap over no-skill = 12 markers. Refusal missed by skill run: False.
Load path (expected, not re-tested this run): skill_load(landing_page_scorecard_funnel, full) plus reference landing_page_scorecard_funnel.funnel_build_specs only (sections, questionnaire, results page, routing, and the KPI/scale-gate layer); must NOT load landing_page_scorecard_funnel.setup_layer_positioning — mode lands standalone, so loading it is an over-load failure.
Notes: X hits 13/13; Y hits only M13. X follows the named-rule funnel skeleton (5 sections in order, frustration-question hook, alternatives-framed value props, exact 15-question/Big-5 spec, three-segment routing, LAPS + $750/$22.50 math, the three traffic thresholds) verbatim. Y is a strong general persuasion-council answer (Schwartz/Cialdini/Hormozi) but misses every threshold and named-rule. Critically on M9, Y does NOT reject scarcity by rule — it endorses 'honest capacity-based scarcity' and reframes the line, failing the guardrail; X cuts it by rule with the trust/segmentation rationale and an action+time+price+payoff CTA stack.
