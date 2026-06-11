<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_taste_review/evals.md -->

# Evals — cold_email_taste_review

Golden tasks per `../../EVALS_GUIDE.md`. Run B gets the shell plus both references (`taste-scorecard.md`, `fake-warmth-detector-and-rewrites.md`).

---

## Task 1 — Fake-warmth email with question subject

### Task prompt

> Is this cold email good to send? It's a first touch, sales mode (volume-ish — we're sending variants of it to ~80 marketing leads). Be honest.
>
> **Subject:** Quick question?
>
> > Hi Sarah,
> >
> > I hope this email finds you well! I loved your recent post — so insightful. As a fellow dog mom I just had to reach out. 😊
> >
> > I was hoping to set up some time to show you how Acme helps marketing teams like yours boost campaign output by 312% while cutting busywork in half.
> >
> > Worth a quick chat next week? I'll keep checking in if I don't hear back!
> >
> > Warmly,
> > Jess

### Delta markers

1. **M1 (mode/trust first):** Identifies mode (volume sales) and trust level (cold, first touch) before scoring — per workflow step 1.
2. **M2 (full scorecard):** Scores ALL 8 dimensions 0–2 by name (two-people test, bridge integrity, them>you, readability, ask/trust, proof integrity, voice/automation smell, mode dignity), including passing ones.
3. **M3 (auto-fail named + quoted):** Fires the fake-warmth auto-fail and quotes the offending lines, naming the patterns: robot greeting ("I hope this email finds you well"), unanchored flattery ("loved your recent post" — no named post or point), manufactured kinship ("fellow dog mom").
4. **M4 (auto-fail overrides score):** Verdict is **do-not-send** because of the auto-fail, stated as non-negotiable regardless of total score — and the review stops polishing rather than line-editing the email into shape.
5. **M5 (guilt-language flag):** Flags "I'll keep checking in" as guilt/anxiety-relief follow-up language (Shepherd auto-fail family), not as a style nit.
6. **M6 (proof integrity):** Flags "312%" as an unsupported metric and "teams like yours" as vague proof — dimension 6 fail with the claim-matching rule cited.
7. **M7 (screenshot test by name):** Runs "the screenshot test" by name and reports its result.
8. **M8 (subject rejection with provenance):** Rejects the subject on the question rule and the "Quick Question" cliché, citing the Lavender delta (−56% opens) AND flagging it as directional vendor data, not a governing threshold.
9. **M9 (named rewrite moves):** Every dimension scored 0 or 1 gets a named move from the move library — e.g. decorative hook → causal bridge; passive → assumptive; meeting-first → artifact-first; guilt follow-up → numbered fork — not generic "make it more personal".
10. **M10 (calibration caveat):** States that the score cut lines are internal calibration defaults, not industry standards.
11. **M11 (output contract):** Output contains all contract fields: per-dimension scores, auto-fail flags quoted, screenshot result, verdict + caveat, named move per failed dimension, highest-risk line + smallest fix, routing recommendation.
12. **M12 (two-people detection rule):** Applies the detection rule explicitly: warmth that would survive a mail-merge is fake (the prompt admits ~80 recipients get variants of this "personalized" email).

### Expected load path

- `skill_load(cold_email_taste_review, full)` — the `## Output Contract` is outside short-format parsed sections.
- References: `taste_scorecard` (always, before scoring), then `fake_warmth_and_rewrites` (dimensions 1/2/7 fail and an auto-fail fires — workflow step 6).
- Should NOT load: compiler/offer-lab references — routing is by name only.

### Discovery probe

"Is this cold email cringe? Be honest — is it safe to send?" → catalog description matches on "scoring whether a cold email is specific, proportionate, credible, and reputation-safe enough … to send."

---

## Task 2 — Over-long feature-dump email

### Task prompt

> Tighten this up for me? It's our standard first-touch email to heads of RevOps (cold list, ~300 sends/month). I feel like it could be punchier but the content is all stuff we really do.
>
> **Subject:** Streamline Your Revenue Operations With DataPipe
>
> > Dear Valued RevOps Leader,
> >
> > My name is Marcus Webb and I am a Senior Account Executive at DataPipe Technologies, the leading provider of revenue data infrastructure solutions for modern go-to-market organizations. We were founded in 2019 and currently serve over 400 customers worldwide.
> >
> > At DataPipe, we help companies consolidate their revenue data through our six core capabilities: automated CRM hygiene, multi-source attribution modeling, pipeline forecasting powered by machine learning, territory planning, comp-plan administration, and executive dashboarding. Our platform integrates with over 80 tools in your existing stack and deploys in as little as two weeks.
> >
> > Our customers typically see significant improvements in data quality and forecasting accuracy within the first quarter of implementation, which is why we have been recognized as a leader in our category.
> >
> > I would welcome the opportunity to walk you through the platform. You can book a demo directly on my calendar here: [calendly link]. Alternatively, I can send over our 40-page State of RevOps whitepaper.
> >
> > Looking forward to connecting,
> > Marcus

### Delta markers

1. **M1 (refuses the framing):** Does not "tighten it up" — recognizes the ask as a line-edit request on a structurally failed draft and reviews it instead of polishing it.
2. **M2 (full scorecard):** All 8 dimensions scored 0–2 by name, passing dimensions included.
3. **M3 (honest auto-fail check):** Reports that NO auto-fail fires (nothing fabricated, no fake warmth, no guilt) — does not invent one to justify the verdict.
4. **M4 (them>you fail with rule):** Dimension 3 scored 0 citing the ≥3:1 you:we rule — the email opens with sender bio and is we/our-dominated ("My name is… we were founded… our six core capabilities").
5. **M5 (readability fail with thresholds):** Dimension 4 scored 0 with thresholds cited: ~170+ words vs ≤100 for volume, wall-of-text paragraphs vs 1-sentence paragraphs / one phone screen, 10th-grade+ register.
6. **M6 (ask/trust fail):** Dimension 5 fail: calendar link on first touch + demo ask at zero trust + a second "alternative" CTA (40-page whitepaper is not a smallest useful yes).
7. **M7 (proof integrity fail):** Flags "significant improvements", "recognized as a leader", "over 400 customers" as unanchored proof not matched to a specific claim.
8. **M8 (structural verdict + routing):** Total lands ≤8 → **do-not-send (structural)**, and per the cut-line table it routes instead of line-editing: offer problem → `cold_email_offer_lab` and/or full rebuild → `cold_email_outreach_compiler`, named explicitly.
9. **M9 (named move):** Prescribes feature-first → progress-first as the governing rewrite move (open on the buyer's struggling moment, not the sender's capabilities) and meeting-first → artifact-first for the CTA.
10. **M10 (highest-risk line):** Names a single highest-risk line (e.g. "Dear Valued RevOps Leader" or the calendly demo ask) with its smallest fix.
11. **M11 (north star + caveat):** Frames the verdict against "qualified conversations started per unit of market trust consumed" and flags cut lines as internal calibration.

### Expected load path

- `skill_load(cold_email_taste_review, full)`.
- References: `taste_scorecard` (always). `fake_warmth_and_rewrites` is justified here for the named rewrite moves (feature-first → progress-first, meeting-first → artifact-first live there), even though the trigger dimensions 1/2/8 mostly pass — note in the log whether the agent loaded it for the right reason.
- Should NOT load: anything from `cold_email_outreach_compiler` — the rebuild is routed, not performed.

### Discovery probe

"Can you tighten up our standard cold email? It feels long." → weakest probe of the four skills: the catalog description leads with "scoring … reputation-safe enough to send", while the user asks for an edit. An agent may reasonably pick `cold_email_outreach_compiler` (audit rewrite) instead. Record which skill a fresh agent picks — a compiler pick is a _discovery_ finding, not a content failure.

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

### 2026-06-10 — Task 1 — performer: Fable 5 (subagents), judge: Fable 5 (blind, X/Y labels)

| Marker                        | A (without) | B (with) |
| ----------------------------- | ----------- | -------- |
| M1 mode/trust first           | miss        | hit      |
| M2 full 8-dimension scorecard | miss        | hit      |
| M3 auto-fail named + quoted   | miss        | hit      |
| M4 auto-fail overrides score  | miss        | hit      |
| M5 guilt-language flag        | miss        | hit      |
| M6 proof integrity            | miss        | hit      |
| M7 screenshot test by name    | miss        | hit      |
| M8 subject rejection + caveat | miss        | hit      |
| M9 named rewrite moves        | miss        | hit      |
| M10 calibration caveat        | miss        | hit      |
| M11 output contract           | miss        | hit      |
| M12 two-people detection rule | miss        | hit      |

Verdict: **STRONG DELTA (0/12 → 12/12).** Load path: exactly as expected — SKILL.md → `taste_scorecard` (workflow step 2) → `fake_warmth_and_rewrites` (step 6, after dimensions 1/2/7/8 failed). Discovery probe: not run this pass.
Notes: Both runs reached the correct do-not-send verdict and flagged the same offending lines — the delta is rigor, reproducibility, and actionability, not raw judgment. Judge: the without-run was "a fluent, well-argued editorial teardown… but unfalsifiable"; the with-run "operates from a visible system." The without-run did contribute send-ops detail (throttling, domain rotation) outside this skill's lane — correctly so; that lane belongs to `cold_email_deliverability_readiness`.
