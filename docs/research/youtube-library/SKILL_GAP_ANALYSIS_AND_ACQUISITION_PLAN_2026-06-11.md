<!-- docs/research/youtube-library/SKILL_GAP_ANALYSIS_AND_ACQUISITION_PLAN_2026-06-11.md -->

# Skill Gap Analysis & Acquisition Plan — 2026-06-11

The operating thesis this plan serves: **run less-capable models on an extremely good harness with extremely good skills, and still get top-tier output.** Every gap below is scored against that thesis: would closing it make a _weak_ model perform like a strong one?

Companion docs: `SKILL_QUALITY_AUDIT_2026-06-10.md` (quality standard + tracker), `SKILL_ARCHITECTURE_EVALUATION_2026-06-10.md` (root-vs-niche structure).

---

## Part 0 — Fixed today (obvious wins, shipped and tested)

- **Parser: `## Output` contracts now ship in short-format loads.** `markdown-skill.ts` parses the Output section into `SkillDefinition.outputContract`; `skill_load` returns it as `output_contract` in BOTH formats. Previously the default (`short`) load silently dropped the output contract of every `preserve_markdown` skill — the exact content the evals proved drives STRONG DELTA. Two new tests, including an exhaustive every-skill check. 30/30 passing.
- **Description de-collision:** `cold_email_taste_review` now explicitly owns "tighten this up / is this good?" requests on existing drafts; `cold_email_outreach_compiler` owns compiling from ingredients and executing rebuilds _routed from_ taste review.
- **`cold_email_outreach_compiler` "Tracking targets"** now sources from `cold_email_learning_review`'s benchmark bands ("do not invent target numbers here").
- **`cold_email_taste_review` trust level** now has an inline T0–T3 shorthand (full rubric cited in `cold_email_offer_lab`) — workflow step 1 no longer depends on an unloaded sibling.
- **`ui_ux_quality_review` preflight** no longer stalls on markup-only reviews ("reason directly from it; note unverifiable items").

---

## Part 1 — The weak-model design thesis

A less-capable model is weakest at: judgment/taste, planning, self-monitoring, calibration under ambiguity, and refusing bad requests. It is strongest at: following explicit procedure, matching named patterns, copying demonstrated formats, and looking things up. So a skill makes a weak agent smart by converting the former into the latter. **Seven ingredients, ranked by impact on weak models:**

1. **Worked examples (input → full output exemplars).** Imitation beats instruction for weak models — a completed scoresheet teaches more than the rubric. _This is the system's biggest gap: 25 of 43 skills have zero worked examples_ (survey 2026-06-11), including flagships `hook_craft_short_form`, `ui_ux_quality_review`, `story_driven_content_craft`, `viral_video_script_structure`, `going_viral`.
2. **Named patterns + closed vocabularies.** A weak model can _match_ a named pattern it could never _derive_: "the Delay pass," "AI gradient," "fake warmth," "decorative hook → causal bridge." Every named pattern is a unit of intelligence the model doesn't need to have.
3. **Numeric thresholds + closed scales.** Replace judgment with lookup: contrast ≥ 4.5:1, ≤12 words/sentence, 44px targets, spacing ∈ {4,8,12,16,24,32,48,64,96}. The eval baselines confirmed this: the without-skill run "knew" spacing was off but couldn't cite a scale.
4. **Templates and scaffolds.** Fill-in-the-blank beats generate-from-scratch (the compiler's 7 verbatim mode scaffolds are the model).
5. **Decision trees + routing tables.** Replace inference with branching: the 12-class reply taxonomy, the 0–5 gate tree, severity rubrics.
6. **Refusal + escalation rules.** Weak models over-comply. Explicit "refuse when X, route to Y" (the compiler's missing-ingredient refusal; taste review's auto-fails) is the guardrail that matters most as capability drops.
7. **Output contracts + stop conditions.** Replace formatting judgment with schema. (Now delivered on every load via today's parser fix.)

**What does NOT help a weak model:** long prose principles, vibes guidance ("don't over-index on taste"), source-attribution essays, and anything requiring the model to interpolate between abstract ideas. When auditing a skill for weak-model readiness, count ingredients 1–7 — prose doesn't count.

---

## Part 2 — Gaps that need NO new resources (manufacture, don't acquire)

These are the cheapest, highest-impact moves — the material already exists in the repo or can be generated.

### 2a. The worked-example manufacturing loop ⭐ top priority

Run each skill's golden task with a strong model (exactly what the eval harness does), keep the 12/12 output, embed it as the skill's exemplar (`## Examples` or `references/worked-example.md` with conditional `when_to_load`). The two existing STRONG-DELTA outputs in `/tmp/skill-evals/` are ready candidates today. Pipeline: eval task → strong-model run → judge confirms markers → trim → embed. This converts the eval system from a measurement tool into a **training-data factory for weak models.**

Priority order for manufacturing (zero-example flagships first): `hook_craft_short_form`, `ui_ux_quality_review`, `viral_video_script_structure`, `story_driven_content_craft`, `going_viral`, `landing_page_scorecard_funnel`, `viral_content_for_boring_brands`, `marketing_site_design_review`, `accessibility_inclusive_ui_review`, `cold_email_reply_os` (a worked classify→route→respond thread), `cold_email_learning_review` (a filled learning memo), `growth_diagnostics_for_stalled_products` (a completed five-layer diagnosis).

### 2b. Build the already-specced artifacts (specs exist, files don't)

- `cold_email_research_anchors` (2.4KB thin leaf): the **specificity ladder it references is not defined in the skill** — the L0–L5 ladder text now lives in the compiler's mode-templates. Build its four planned artifacts: graded ladder with per-level examples, bridge-integrity test + McKenna semantic-fit guard, research-surface map by mode, privacy/invasiveness boundary list.
- `cold_email_icp_signal_design`: four planned artifacts never built — signal scoring rubric, segment disqualifier checklist, buying-committee role map, persona×signal×reason-now schema.
- `information_architecture_review` (2.1KB): the 8-layer audit checklist (goal → archetype → conceptual model → affordance → signifier → convention → feedback → recovery) **already exists in the consolidated Norman+Cooper analysis, unported** — plus Krug's trunk test. Port first; acquire transcripts second.
- `usability_quick_research` (2.7KB): Erika Hall's bet-size → method matrix exists in the 2026-05-15 analysis, unported. Port it + add a fill-in moderated test script with a leading-question linter.
- `design_system_architecture_review` (3.0KB): operationalize Curtis's 4-level token naming taxonomy as a lintable audit + the "used three times" promotion rule + migration decision tree — all in the existing syntheses.

### 2c. Ready-to-draft skills (sources analyzed, no SKILL.md exists)

From combo indexes + INDEX.md, in rough value order: `youtube-channel-craft-for-founders` (**also a declared runtime catalog gap — register it when drafted**), `offer-to-call-funnel-diagnosis`, `newsletter-as-distribution-channel`, `anti-ai-marketing-discipline`, `anti-feed-publishing-system`, `positioning-for-crowded-categories`, `solo-founder-operating-system`, **Eric Nowoslawski email-finding waterfall** (feeds `lead_list_research`), **Jen Abel enterprise sales**, Casey Winters executive communication, harness-engineering architecture, AI developer productivity measurement.

### 2d. Analysis backlog (transcripts sitting unprocessed)

26 transcripts at `needs_analysis`, 15 files at `needs_synthesis`. Single most-flagged item (4 docs): **Daniel Priestley "How To Get Noticed"** — transcript exists, analysis doesn't, blocks two sales/marketing combos. Also notable: Erik Kennedy ×2, the Saarinen/Linear quality essays, the Norman/Cooper/Krug/Hall/Frost canon summaries.

### 2e. Small repairs

- `experiment-guide.md` corpus card scraped the wrong page (book blurbs, not Evan Miller's A/B article) — `learning_review` already carries the correct web-sourced rules; fix the card for provenance.
- Catalog-declared missing routers: `marketing_strategy_router`, `writing_craft`, `creator_growth_strategy` — thin router skills, draftable from existing material.
- BuildOS-internal: real outreach **reply corpus** once campaigns run — the only legitimate source for async objection examples and for calibrating the taste cut lines with data (currently labeled internal calibration; keep labels until then).

---

## Part 3 — Acquisition list (new external resources)

Politeness rules for all pulls: yt-dlp/transcript pulls spaced out, retry once after rate-limit clears, Wayback fallback for blocked pages, legitimate access only for books (no pirated PDFs — the queue's standing rule).

### Tier 1 — unblocks existing skills (most cross-flagged)

| #   | Topic to drill into                                                                                                                                                                                                                                                                                                                                                                                                                                | Resources (format)                                                                                                  | Feeds |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | **Platform-specific virality mechanics** — the 12 pending transcripts, all with IDs in `going-viral/references/` TODOs: Jenny Hoyos (Colin&Samir `As7abwNhG7Y`, MFM `ZpjGGbrcC8E`), MrBeast (`9IQ_ldV9z_A`), Brendan Kane (`pGXiK8b7d-E`), Brock Johnson (`N1ozk6TTdwU`, `-Qi9-ZT1_GE`), Mosseri direct (`96iwtsFbvpg`), Naval JRE (`3qHkcs3kG44`), Sahil Bloom (`f-s22uCixMw`), Welsh CS#109, Lara Acosta CS#241, Hala Taha masterclass (YouTube) | `going_viral` platform refs — currently built from secondary summaries; primary transcripts upgrade every threshold |
| 2   | **Design canon re-pulls** (blocked by the 2026-04-29 rate limit): Brad Frost `W-h1FtNYim4` + `-3Pji_frbII`, Steve Krug `35gq5GjIAvU`, Erika Hall `PpQKr2jhA_8`, Adam Wathan `17OBlxY2C_0` (YouTube)                                                                                                                                                                                                                                                | `design_system_architecture_review`, `usability_quick_research`, `visual_craft_fundamentals`                        |
| 3   | **Practical usability testing + quant instruments**: current NN/g or Krug _Rocket Surgery_ walkthrough (YouTube); Sauro & Lewis SUS/SEQ/task-success thresholds (book/articles)                                                                                                                                                                                                                                                                    | `usability_quick_research` — gives it scoring scales (weak-model ingredient #3)                                     |
| 4   | **Information architecture primary sources**: Abby Covert (talks), Peter Morville, Jared Spool, long-form Don Norman talk, Garrett's five-plane model (talks/books)                                                                                                                                                                                                                                                                                | `information_architecture_review`                                                                                   |
| 5   | **Sentence-level copywriting craft**: Joanna Wiebe/Copyhackers (blog + talks), Harry Dry Marketing Examples (blog — unusually rule-shaped, ideal for weak models), Eddie Shleyner, _Cashvertising_ (book)                                                                                                                                                                                                                                          | `landing_page_scorecard_funnel`, `marketing_site_design_review`, future `landing-page-copy-craft`                   |
| 6   | **Cold-email book extracts (P0, legitimate access)**: Dunford _Sales Pitch_ + _Obviously Awesome_, Moesta _Demand-Side Sales 101_, _The Challenger Customer_, Fitzpatrick _The Mom Test_ (books)                                                                                                                                                                                                                                                   | `offer_lab`, `icp_signal_design`, `research_anchors`                                                                |
| 7   | **JTBD primary sources**: Bob Moesta (talks/book), Tony Ulwick ODI (articles), Christensen milkshake (talk), Teresa Torres (talks)                                                                                                                                                                                                                                                                                                                 | product-strategy combos — currently over-anchored on Ash Maurya (6 of 14 analyses)                                  |
| 8   | **SEO/AEO for SaaS**: Eli Schwartz _Product-Led SEO_, Kevin Indig Growth Memo, Aleyda Solis, Mike King/iPullRank AI-citation work, Lily Ray E-E-A-T (blogs/reports/talks)                                                                                                                                                                                                                                                                          | proposed `topical-authority-and-aeo` — a whole missing lane in marketing                                            |

### Tier 2 — new high-value combos with zero current coverage

| #   | Topic                                                   | Resources                                                                                                                                                                                                                                                 | Why it matters for BuildOS                                      |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 9   | **Pricing & packaging**                                 | Madhavan Ramanujam _Monetizing Innovation_ (book/talks), Patrick Campbell/ProfitWell (blog+data reports), Kyle Poyar Growth Unhinged (newsletter), Kevin Hale YC pricing (YouTube)                                                                        | DJ prices BuildOS solo; zero skill support today                |
| 10  | **Product discovery & prioritization cadence**          | Marty Cagan, Teresa Torres _Continuous Discovery Habits_, Ryan Singer _Shape Up_ (free book), John Cutler                                                                                                                                                 | the daily "what do I build next" decision                       |
| 11  | **Founding team & first hires**                         | Claire Hughes Johnson _Scaling People_ (book + Stanford talk), Matt Mochary Method (free docs + talks), First Round Review (articles)                                                                                                                     | flagged highest-value next pull in founder-ops audit            |
| 12  | **Brand direction**                                     | Emily Heyward _Obsessed_ (book/talks), Linear/Notion/Figma brand case studies, Mailchimp/Atlassian voice guides (public style guides — very rule-shaped)                                                                                                  | named blocker for `brand-direction-for-thinking-products`       |
| 13  | **YouTube channel diagnostics**                         | Paddy Galloway (already partially analyzed), vidIQ/Creator Science packaging episodes, YouTube Creator Insider (official)                                                                                                                                 | catalog-declared gap ×2 domains                                 |
| 14  | **Writing craft** (process, revision, voice, structure) | only one strong source today (Writing with Andrew). Add: Steven Pinker _Sense of Style_, William Zinsser _On Writing Well_, Verlyn Klinkenborg _Several Short Sentences_ (books — all rule-extractable), Sahil Bloom/David Perell writing systems (talks) | catalog-declared `writing_craft` gap                            |
| 15  | **Design-system adoption metrics/ROI**                  | no source named anywhere yet — needs a research query first (Sparkbox design-system surveys, Nathan Curtis adoption articles are the likely starting points)                                                                                              | the declared "next gap" for `design_system_architecture_review` |

### Tier 3 — medium priority (acquire opportunistically)

Community-as-distribution (Rosie Sherry, David Spinks), PR/earned media + podcast-getting (Muck Rack reports — note their help-center 403s, use browser pull), paid acquisition craft (Common Thread, Nick Shackelford), activation mechanics (Casey Winters, Elena Verna, Sean Ellis PMF survey), category creation (_Play Bigger_, Mike Maples _Pattern Breakers_, Andy Raskin), founder psychology/endurance (Jerry Colonna, Brad Feld), hard conversations (Sheila Heen, Kim Scott, Lara Hogan), enterprise deal-room (Kazanjy _Founding Sales_, MEDDICC), cold-email P1/P2 books (_Influence_, _Never Split the Difference_, _Predictable Revenue_, Kohavi guardrail-metrics chapter), onboarding/first-run (Sam Hulick), mobile UX (Luke Wroblewski, HIG/Material), motion design (Val Head), inclusive content (Kat Holmes).

**Explicitly NOT acquiring:** Hormozi for the cold-email suite (list-email ≠ cold email — standing rule); pirated book PDFs; vendor benchmarks without stated methodology as governing thresholds; a "taste-for-AI-disclosure" source (none exists — stays unsourced and labeled).

---

## Part 4 — The plan, sequenced

**Phase A — manufacture (no acquisition, ~highest ROI/hour):**

1. Worked-example manufacturing loop on the 12 priority skills (§2a) — eval-generated exemplars embedded per skill.
2. Build the 8 specced cold-email artifacts (research_anchors ×4, icp_signal_design ×4) + port the unported IA/usability/design-system analysis material into the three thin design leaves (§2b).
3. Analyze Priestley "How To Get Noticed" (4-doc flag) + start the 26-transcript analysis backlog, highest-flagged first.
4. Draft + register `youtube_channel_craft_for_founders` (closes a catalog-declared gap with already-analyzed sources); fix the experiment-guide card.

**Phase B — structural (from the architecture evaluation, awaiting DJ approval):** 5. Fold unconditional "load always" references into shells (taste, reply*os, compiler packaging/lint, learning, offer_lab, algorithm content-games). Parser `## Output` fix is already done. 6. Design-review family fold decision — run the targeted-typography eval (Task 2) first to price it. 7. Deepen-or-fold verdicts on the four thin leaves \_after* §2b porting (porting may resolve three of them).

**Phase C — acquisition runs (politely, batched):** 8. Tier 1 items 1–2 (the transcript backlogs with known video IDs) — single batch, spaced pulls, Wayback/retry discipline. 9. Tier 1 items 3–8 by family as each family's enrichment comes up.

**Phase D — new lanes (Tier 2):** pricing & packaging first (zero coverage, direct BuildOS need), then discovery cadence, founding team, brand, writing craft.

**Ongoing:** every new/updated skill passes the 7-ingredient weak-model audit (Part 1) + the sizing scorecard (architecture evaluation §4) + gets a golden task in `evals.md`; every acquisition lands via the standard pipeline (transcript → analysis → INDEX → skill enrichment) with `status:` stamps.

---

_Inputs: consolidated gap-inventory sweep (gap-audits, 9 combo indexes, enrichment plan, acquisition queue, draft TODOs, INDEX.md, catalog.ts, 4 thin leaves — 2026-06-11), worked-example survey of all 43 skills (2026-06-11), eval results (2026-06-10), architecture evaluation (2026-06-10)._
