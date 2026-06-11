<!-- docs/research/youtube-library/NEXT_STEPS_TASKER_2026-06-11.md -->

# Skill System — Next Steps Tasker (handoff, 2026-06-11)

Self-contained work order for the next agent/session. Execute top-to-bottom within each priority band; tasks in the same band are parallel-safe unless noted. Everything from the 2026-06-10/11 program is **uncommitted in the working tree** — do not assume a clean baseline; do not revert existing changes.

## Required reading before any task

1. `apps/web/src/lib/services/agentic-chat/tools/skills/AUTHORING_GUIDE.md` — the rules every skill change must follow (delta test, one-load principle, 7 weak-model ingredients, inline→reference→child decision tree, birth checklist).
2. `apps/web/src/lib/services/agentic-chat/tools/skills/EVALS_GUIDE.md` — the with/without blind eval protocol.
3. `docs/research/youtube-library/SKILL_QUALITY_AUDIT_2026-06-10.md` — Work Tracker section = live program status. **Update it as tasks land.**
4. `docs/research/youtube-library/SKILL_GAP_ANALYSIS_AND_ACQUISITION_PLAN_2026-06-11.md` — the acquisition tiers behind tasks T8–T10.

## Standing rules

- Verify after every runtime-skill change: `cd apps/web && pnpm vitest run src/lib/services/agentic-chat/tools/skills/ src/lib/services/agentic-chat/tools/domains/` — must stay green (51 tests as of handoff; new tests welcome).
- `registry.ts`, `domains/catalog.ts`, and `*.skill.ts` wrappers are shared files — if parallelizing with subagents, have subagents build `definitions/` content only and do shared-file wiring centrally.
- Web/YouTube etiquette: sequential pulls, ≥60s gaps, one retry max after 120s, stop entirely on any 429 and report. Standalone `sleep` is blocked in the agent harness — put `time.sleep()` INSIDE a Python batch script and run it in chunks under the 600s Bash timeout (this pattern is proven; see the 2026-06-11 batch).
- Vendor numbers carry methodology caveats inline; unsourced thresholds get "internal default" labels; never fake attribution. Hormozi stays excluded from the cold-email suite (list-email ≠ cold email).
- VS Code linter warnings on runtime SKILL.md frontmatter are false positives — ignore.
- Source pipeline: transcript → analysis (operating material only) → INDEX row + frontmatter status flip → skill enrichment. Always flip frontmatter when you write an analysis (see T1 for why).

---

## P0 — Hygiene that unblocks everything else

### T1. Frontmatter-reconciliation pass over the analysis backlog

**Why:** The "26 transcripts at needs_analysis" count is partly false. Four items (Erik Kennedy ×2, Saarinen 10-rules, Linear quality essay) were found on 2026-06-11 to have full analyses from 2026-04-29 with frontmatter never flipped. More items likely have the same defect (suspects named by that agent: Norman/Cooper/Krug/Hall/Frost canon summaries, the 12 Kallaway transcripts).

**Do:** For every file in `docs/research/youtube-library/transcripts/` (and the satellite dir `docs/marketing/growth/research/youtube-transcripts/`) with `analysis_status: missing` or `processing_status: needs_analysis`: search `docs/research/youtube-library/analyses/` (and the satellite dir) for an existing analysis. If found: flip frontmatter (`analysis_status: available`, appropriate `processing_status` per `FRONTMATTER_SCHEMA.md`, `last_reviewed: '2026-06-12'` or current date), add the analysis link to the file body, fix the INDEX.md row. If genuinely missing: leave flagged.

**Accept:** A report table (file → was/now status → analysis path or "genuinely missing") + the true count of remaining needs_analysis items. INDEX.md consistent.

### T2. Apply the ready-made enrichment lists (no new sources needed)

These checkable rules were extracted on 2026-06-11 from existing analyses and verified ABSENT from the target runtime skills. Apply them where they belong (inline vs reference per the skill's current structure); cite the source analysis; run tests.

**→ `definitions/visual_craft_fundamentals/`** (source: `analyses/2026-04-29_erik-kennedy_7-rules-gorgeous-ui_analysis.md`):
1. Grayscale-first sequencing rule — design the screen in B&W first, add ONE accent hue only after structure/spacing/hierarchy pass ("if a screen looks bad in B&W, color cannot fix it"). Fits as a workflow preflight check.
2. Four-cue button lighting recipe — dark bottom edge + slightly brighter top + subtle under-shadow + pressed state overall darker. Extends the inset/outset taxonomy in `references/depth-color-surfaces.md`.
3. Brightness-as-elevation for flat systems — higher surfaces are brighter; convey elevation by surface brightness when shadows are minimal. Directly relevant to Inkprint's low-shadow texture language; same reference.
4. Hover recolor rule — white elements turn colored / colored turn white, darken the background behind them.
5. Pre-design imitation step ("the Mobbin test") — pull 5+ real references per pattern before designing; copy moves not screens; never mimic AI output. Workflow step or `ai-slop-corrections.md` bullet.

**→ `definitions/ai_era_craft_and_quality_moat/`** (source: `analyses/2026-04-29_karri-saarinen-linear_craft-and-calm-software_analysis.md`):
1. Leadership-commitment rubric line — a quality posture must name a leadership owner + implementation plan + business rationale, else it's aspiration not strategy (Coinbase example). → `references/hiring-and-roadmap-rubrics.md` or core-thesis ref.
2. Organic-mentions qualitative north star — success = the product appearing in organic conversations about quality (the positive replacement for the banned per-feature-WAU metric).
3. Principles-over-process — values + judgment freedom within a defined standard; design review as cadence (weekly + pre-release), not checkpoint queues.
4. "Surprise users" extension of no-A/B — even research can't specify the differentiating move; team intuition generates it.
5. Quality-is-a-daily-individual-choice framing + craft-cycle stage as a positioning diagnostic (deeper in the speed-focus stage = higher rarity premium on craft).

**→ `definitions/calm_software_design_review/`** (same Saarinen source):
1. Org red flag: quality-as-aspiration (no owner/plan/rationale) → `references/operations-and-roadmap.md`.
2. Principles-over-process as a calm-operations checklist item (rigid checkpoint queues = red flag).
3. Makers-in-direct-user-contact as its own ops item (shared customer Slack, founder-handled support — the compensating mechanism that makes no-A/B safe).
4. The organic-mentions qualitative KPI.

**Accept:** Rules landed with citations, tests green, one-line note in each skill's `## Notes`.

### T3. Small vague-rule fixes (from eval authoring findings)

1. `definitions/viral_video_script_structure/SKILL.md` — the `## Output` contract demands "Hook variants — 5–8 iterations" unconditionally, contradicting the locked-hook workflow that defers hooks to `hook_craft_short_form`. Amend: variants only when the hook is NOT supplied locked.
2. `definitions/story_driven_content_craft/SKILL.md` — guardrail cites a sentence-length standard-deviation threshold that is never defined. Either define it (internal default, labeled) or rewrite the guardrail around the binary jagged-edge/read-aloud test the eval used.
3. `definitions/hook_craft_short_form/` — note-only: "on-target curiosity," snapback "different direction," and the motion calibration are not judge-checkable. Acceptable for craft; add a one-line Notes acknowledgment so future eval authors don't re-discover it.

**Accept:** Edits made, tests green.

---

## P1 — Convert the new transcripts into skill upgrades

### T4. Analyze the 13 new transcripts (pulled 2026-06-11, all at `needs_analysis`)

Files: `docs/research/youtube-library/transcripts/2026-06-11_*.md` (13 files). Follow the analysis format of `analyses/2026-06-11_daniel-priestley_million-dollar-playbook_analysis.md` — operating material only (named frameworks, thresholds, decision rules, worked examples, quotable lines). Flip frontmatter + INDEX per the standing rule. Priority order:

1. **Instagram set** (Mosseri direct, Brock Johnson ×2) → feeds `going_viral` `references/instagram.md`
2. **Shorts/TikTok set** (Jenny Hoyos ×2, MrBeast, Brendan Kane) → feeds `going_viral` `references/tiktok.md` + possibly `viral_video_script_structure`
3. **Design canon** (Brad Frost ×2 → `design_system_architecture_review`; Erika Hall BayCHI → `usability_quick_research`; Adam Wathan → `visual_craft_fundamentals`)
4. **Naval JRE + Sahil Bloom** (psychology/writing — analyze, note target skills, enrichment optional this pass)

### T5. Upgrade `going_viral` platform references from secondary to primary

After T4 sets 1–2: the platform refs (`references/instagram.md`, `references/tiktok.md`) were built from secondary summaries (the draft's TODO blockquotes said so). Verify every threshold in them against the new primary transcripts — confirm, correct, or annotate each; add new primary-sourced rules; update the source attributions. Same for any X/LinkedIn claims the Naval transcript touches. Report corrections found (a number that changed = important finding).

### T6. Enrich the three design skills from the canon analyses

After T4 set 3: `design_system_architecture_review` (Frost's atomic-design + is-it-dead retrospective — token taxonomy, governance, the adoption/ROI angle if present — this is the skill's declared "next gap"); `usability_quick_research` (Hall BayCHI — strengthen the derived bet-size matrix with primary-source rules; remove the "derived" caveat where the transcript now confirms it); `visual_craft_fundamentals` (Wathan — RefactoringUI build process rules). Per AUTHORING_GUIDE placement rules.

**Accept (T4–T6):** Analyses written + lineage flipped; per-skill diffs cite the new analyses; tests green; tracker updated.

---

## P2 — Eval rigor + coverage

### T7. Blind A/B pairs for the manufactured tasks

The 2026-06-11 worked examples were with-skill self-checks, not blind A/B. Run the full EVALS_GUIDE protocol (performer-without via a repo-blind subagent, performer-with following the skill, blind judge scoring X/Y) for at least: `reply_os` T1, `learning_review` T1, `viral_video_script_structure` T1, `story_driven_content_craft` T1, `landing_page_scorecard_funnel` T1, `growth_diagnostics` T1 — plus the never-run Task 2s: `ui_ux_quality_review` T2 (targeted typography), `cold_email_taste_review` T2, `hook_craft` T2 (audit), `youtube_channel_craft_for_founders` T1. Log every result in the Results logs. Any WEAK/NO DELTA verdict = a skill defect to report, not bury.

### T8. Worked-example wave 3

Author evals + manufacture exemplars (same protocol as wave 2) for the remaining zero-example skills, in this order: `accessibility_inclusive_ui_review`, `marketing_site_design_review`, `viral_content_for_boring_brands`, `going_viral` (after T5), `calm_software_design_review`, `delightful_product_review`, `content_strategy_beyond_blogging`, `ai_era_craft_and_quality_moat`, `lead_list_research`, `nonfiction_writing_from_lived_conviction`, `context_engineering_for_agent_work`, `algorithm_aware_publishing`. (Core ops skills already have parser-native `## Examples`; skip.)

---

## P3 — Acquisitions (per the gap plan tiers)

### T9. Source repairs + unresolved IDs

- Find a replacement Steve Krug talk ID (35gq5GjIAvU is dead — private/removed). One polite search pass; verify before pulling.
- Resolve the three skipped IDs if findable in one polite pass each: Justin Welsh Creator Science #109, Lara Acosta Creator Science #241, Hala Taha LinkedIn masterclass. Optional: the actual Colin & Samir Jenny Hoyos episode + Creator Science #243 (the 2026-06-11 batch pulled same-creator substitutes).
- Fix the `experiment-guide.md` corpus card (wrong page scraped — replace with a real Evan Miller A/B article extract): `docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/`.

### T10. Tier-1 web acquisitions (etiquette rules apply)

In order: (a) copy-craft — Harry Dry/Marketing Examples (most rule-shaped), Joanna Wiebe/Copyhackers, Eddie Shleyner → feeds `landing_page_scorecard_funnel`, `marketing_site_design_review`; (b) JTBD primaries — Moesta/Ulwick/Torres talks → product-strategy combos; (c) SEO/AEO — Eli Schwartz, Kevin Indig, Aleyda Solis, iPullRank → new `topical-authority-and-aeo` lane. Each: pull → analysis → INDEX → enrichment target noted. **Books (Dunford/Moesta/Mom Test/Challenger) are DJ-side** — legitimate access only; flag, don't scrape.

### T11. Phase D opener: pricing & packaging lane

New lane with zero coverage. Acquire first (Kevin Hale YC pricing video, Patrick Campbell/ProfitWell articles, Kyle Poyar Growth Unhinged — Ramanujam book is DJ-side), then draft `pricing_and_packaging_design` as a root skill per the AUTHORING_GUIDE birth checklist (evals + worked example included), wire centrally, and consider the `product_strategy` domain question flagged in the tracker (ai_era_craft also wants that home).

---

## DJ-side (flag, don't do)

- Run `docs/research/youtube-library/LIVE_SKILL_TEST_PROMPTS.md` prompts in real BuildOS chat — ideally with a weaker model; log results in the evals.md files.
- Review + commit the working tree (everything from 2026-06-10/11 is uncommitted).
- Book extracts (P0 cold-email books, Ramanujam) via legitimate access.
- Decide: `marketing_strategy_router` / `creator_growth_strategy` / `writing_craft` thin routers — worth catalog rows, or wait?

## Definition of done for this tasker

Tracker updated per task · all tests green · INDEX/frontmatter consistent · every new analysis flips its source's status · no unverified numbers introduced without caveats · a closing report listing per-task outcome, corrections found (especially T5), and any WEAK/NO DELTA eval verdicts.
