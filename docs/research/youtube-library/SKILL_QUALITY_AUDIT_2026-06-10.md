<!-- docs/research/youtube-library/SKILL_QUALITY_AUDIT_2026-06-10.md -->

# Skill System Quality Audit — 2026-06-10

An end-to-end assessment of the YouTube → skill pipeline: what's working, which skills are actually usable by the agent, where the system is leaking value, and a proposed quality standard.

---

## Work Tracker

_Last updated 2026-06-10. This is the live status of the audit's recommendations — update this section as work lands._

### ✅ Done — P1: Rescue the thin shells (completed 2026-06-10)

All six design-review skills promoted from fat drafts to runtime shells + reference modules, following the pilot template (lean ~100-line SKILL.md, `preserve_markdown: true`, `## Output` contract with severity rubric, references split by load occasion, drafts stamped `promoted_to`/`last_promoted`):

- [x] `ui_ux_quality_review` (pilot — the template) — 3 refs: foundation-checks, polish-and-fit-checks, ai-ui-smoke-test
- [x] `accessibility_inclusive_ui_review` — 3 refs: screen-audit-checklist, component-patterns, failure-modes-and-spa-pitfalls
- [x] `calm_software_design_review` — 3 refs: surface-audit-checklist, simplicity-rubric, operations-and-roadmap
- [x] `delightful_product_review` — 2 refs: delight-audit-core, delight-gates-and-antipatterns (canonical runtime home of the Changuel framework)
- [x] `visual_craft_fundamentals` — 3 refs: depth-color-surfaces, type-spacing-emphasis, ai-slop-corrections
- [x] `marketing_site_design_review` — 2 refs: foundation-rules, section-scorecards
- [x] Safety net: exhaustive test in `skill-reference-load.test.ts` that loads every declared reference module in the registry (28/28 passing)

### ✅ Done — P1: Register or archive the 10 stranded drafts (completed 2026-06-10)

Registry grew 35 → 43 skills. Each registration: `definitions/<id>/` shell (+ references), wrapper export (`sales-growth.skill.ts`, `founder-craft.skill.ts`, or `marketing-content.skill.ts`), `registry.ts` entry, domain catalog `useWhen` link, draft stamped `status: registered` + `promoted_to` + `last_promoted`.

- [x] `landing_page_scorecard_funnel` — root; Dunford setup-layer + Priestley funnel-spec references; linked in `sales_and_growth`
- [x] `viral_content_for_boring_brands` — root; 3 refs (attention filters, spread checks, honesty overlays); lane locked to brand-account/boring-product vs the hook/script/story siblings; linked in `marketing.content_strategy`
- [x] `going_viral` — registered as CHILD of `content_strategy_beyond_blogging`; duplicate family content cut and replaced with escalation pointers; unique assets kept (4 platform-algorithm references, sharing psychology, seven tensions); linked in `marketing.content_strategy`
- [x] `ai_era_craft_and_quality_moat` — root; 5 refs; linked in `marketing` (flag: a `product_strategy` domain would be the right home if one is ever added)
- [x] `growth_diagnostics_for_stalled_products` — root; 1 ref (five-layer diagnostic); linked in `sales_and_growth`
- [x] `context_engineering_for_agent_work` — root; single shell, no refs; **catalog row only — no domain fits** (future `technology`/`agent_systems` domain candidate)
- [x] `lead_list_research` (renamed from lead-list-research-with-claude-code) — root; de-tooled; linked in `sales_and_growth` + `sales_and_growth.cold_email`
- [x] `nonfiction_writing_from_lived_conviction` — root; linked in `writing`
- [x] `local-ai-services-sales` — **archived** (`status: archived`, off-strategy)
- [x] `cold-email-contextual-outbound` — **superseded** (`superseded_by: cold_email_engagement_first_outreach`)
- [x] Cross-link restored: `viral_content_for_boring_brands` → `going_viral` for platform-algorithm escalation
- [ ] Still open: `marketing_site_design_review` and `visual_craft_fundamentals` could now cross-link to `landing_page_scorecard_funnel` (dropped during the rescue when it didn't exist) — low priority

### ✅ Done — P2: Split `algorithm_aware_publishing` (completed 2026-06-10)

- [x] 40.5KB → 145-line shell (~62% smaller per full load) + 4 reference modules by operating mode: content-games (every mode), matching-loop/platforms (plan + diagnose), quality-gate tactics (score), BuildOS dual audit (every ship decision)
- [x] Line-by-line completeness diff: zero content dropped; workflow consolidated into a single parseable `## Workflow`

### ✅ Done — P2: Enrich the thin `cold_email_*` five (completed 2026-06-10)

Research-first approach: a research agent mined the cleaned 45-card corpus + existing source-analyses and web-verified flagged benchmarks, producing `docs/research/youtube-library/cold-email-children-enrichment-plan-2026-06-10.md`. Five enrichment agents then built reference modules from the plan; a sixth folded confirmed 2025/2026 provider changes into the deliverability matrix.

- [x] `cold_email_reply_os` — 94L shell + 3 new refs: 12-class reply taxonomy + SLA matrix, async-adapted 7-objection route table (Gong/Voss, derivation caveats inline), fork library (qualification/ghosted/Hail Mary + revival cadences). Ported the never-promoted `reply-handling.md` draft doc verbatim.
- [x] `cold_email_offer_lab` — 97L shell + 2 new refs: 8-mode artifact library (Shepherd worked examples), T0–T3 trust/ask rubric + meeting-ask exception register + 4 false-positive checks (Mom Test/Dunford/Moesta).
- [x] `cold_email_outreach_compiler` — 95L shell + 3 refs: 7 mode scaffolds verbatim (Murray/Seibel/Kai Davis/Gem/strategic anchor anatomy), subject/preview rules with Lavender deltas (vendor caveats inline), 9-point lint + cadence map; refuses to compile when ingredients missing, routes to producing sibling.
- [x] `cold_email_learning_review` — 79L shell + 2 refs: metric→failure diagnostic table, caveated benchmark bands, Evan Miller sample-size/no-peeking math, 0–5 stop/iterate/recycle/scale gate tree, learning memo template; sample check enforced BEFORE conclusions.
- [x] `cold_email_taste_review` — 80L shell + 2 refs: 8-dimension scorecard with auto-fails + verdict routing, fake-warmth detector, 5 bad→good rewrites; cut lines flagged "internal calibration — disclose when reporting verdicts."
- [x] `cold_email_deliverability_readiness` — provider matrix updated: Google server-level rejection (Nov 2025) + Postmaster v2 binary Pass/Fail, Microsoft `550 5.7.515` at 5k+/day; decision rule added: low opens in 2026 = compliance suspect before copy suspect.
- Notable research findings: all four Lavender corpus cards were scrape failures (data recovered via web fetch — **re-scrape recommended**, see plan §8); Hormozi excluded entirely per Do-Not-Import (list-email ≠ cold email); genuinely unsourced items flagged, not faked (trust-composite metric, async objection examples, taste cut lines).

### ✅ Done — P3: Golden-task evals (infrastructure + first runs, 2026-06-10)

- [x] `EVALS_GUIDE.md` (with/without protocol, blind judging, delta markers, expected load paths, discovery probes) + `evals.md` for 4 skills: `ui_ux_quality_review`, `hook_craft_short_form`, `cold_email_outreach_compiler`, `cold_email_taste_review`
- [x] Executed Task 1 with/without for two skills, blind-judged: `cold_email_taste_review` **0/12 → 12/12 STRONG DELTA**; `ui_ux_quality_review` **6/12 → 12/12 STRONG DELTA**. Both with-skill runs followed the expected reference load path exactly. Results logged in each `evals.md`.
- [x] Eval authoring surfaced 5 skill-quality findings (vague rules, cross-skill dependency gaps, sibling description collision) — queued in the architecture evaluation §6
- [ ] Remaining: run Task 2s (targeted-typography path, missing-offer refusal, hook audit), run discovery probes, extend evals to more skills over time

### ✅ Done — P3: Lineage right-sizing + hygiene (2026-06-10)

- [x] Right-sizing policy recorded in `SKILL_LINEAGE_SCHEMA.md` (sources required; claims/edges optional for flagship combos; confidence deprecated)
- [x] Repo-root `/youtube-transcripts/` migrated into the library (turned out to be indexed + referenced by 8 files — all references repaired, frontmatter normalized, INDEX updated)
- [x] `status:` frontmatter on all 25 drafts (every draft has a runtime twin — library is fully promoted; none queued)
- [x] Lavender corpus cards re-scraped (4/4 from origin, politely; benchmark JS table uncapturable — flagged). Provenance fixes applied to runtime skills: "81% mobile" → "first opens ~8x more likely on phone"; "money words banned" dropped (unverified); attribution loosened where the page credits Salesloft
- [x] Cross-links added: `marketing_site_design_review` + `visual_craft_fundamentals` → `landing_page_scorecard_funnel`

### 🆕 Follow-on: Root-vs-niche architecture evaluation (2026-06-10) — PARTIALLY EXECUTED 2026-06-11

Full evaluation: `SKILL_ARCHITECTURE_EVALUATION_2026-06-10.md`. Headlines: (1) **`skill_load` defaults to `short`, which silently drops the `## Output` contract and all custom sections of `preserve_markdown` skills** — parser fix recommended; (2) several enrichment references have unconditional "load always" conditions, making them mandatory second hops — fold-into-shell candidates listed with hop savings; (3) four thin leaves (~2–3KB) need deepen-or-fold decisions; (4) proposed 7-rule sizing scorecard (one-load primary job, conditional-only references, hop budget, 20KB split threshold, thin-child test, short-format survival, description collision rule).

### ✅ Done — 2026-06-11: obvious wins from the architecture evaluation

- [x] **Parser fix shipped:** `## Output` sections now parse into `output_contract` and ship in BOTH load formats (`markdown-skill.ts`, `types.ts`, `skill-load.ts` + 2 new tests, 30/30 passing)
- [x] Description de-collision: taste_review owns "tighten this draft"; compiler owns compile-from-ingredients + routed rebuilds
- [x] Compiler "Tracking targets" sourced from learning_review bands; taste_review inline T0–T3 shorthand; ui_ux preflight markup-only fallback
- [ ] Still structural (awaiting DJ): fold unconditional refs into shells; design-review fold decision (run Task 2 evals first); thin-leaf verdicts (do §2b porting first — may resolve three of four)

### ✅ Done — 2026-06-11 (later): Phase A manufacture + Phase B folds + authoring rules

**Phase A (manufacture):**

- [x] Priestley "Everyone Who Uses This Playbook Makes $1 Million" analyzed (5-step playbook, notice/know/rate ladder, LAPS 100/15/10/3, ACPS/ACPL math) → `analyses/2026-06-11_daniel-priestley_million-dollar-playbook_analysis.md`; INDEX + both combo indexes + gap audit unblocked; `landing_page_scorecard_funnel` gained a "Funnel KPIs and scale gates" section
- [x] Erika Hall material ported into `usability_quick_research` (45 → 107 lines): 9 agent rules, derived bet-size→method matrix (derivation labeled), fill-in 3-user script, output contract; NN/g severity + SUS/SEQ left as named unsourced gaps. Note: the gap plan overstated the analysis — no literal matrix existed; built honestly from Hall's rule + Krug's reversibility limit
- [x] Worked examples embedded in 4 flagship skills (the #1 weak-model lever): `hook_craft_short_form` (manufactured 12/12), `ui_ux_quality_review` + `cold_email_taste_review` (trimmed from the 2026-06-10 STRONG-DELTA outputs), `cold_email_outreach_compiler` (manufactured 13/13 compile + 8/8 REFUSAL exemplar)
- [x] Live-test prompt pack for DJ: `LIVE_SKILL_TEST_PROMPTS.md` (6 paste-into-chat prompts incl. discovery probes, refusal discipline, test-project end-to-end; run with a weaker model and compare against embedded exemplars)

**Phase B (folds — unconditional refs into shells, hop reduction):**

- [x] `cold_email_taste_review` (scorecard inline; 1 conditional ref left) — grade = 1 hop, was 2–3
- [x] `cold_email_reply_os` (taxonomy+SLA inline; 3 conditional refs) — classify = 1 hop
- [x] `cold_email_outreach_compiler` (packaging+lint inline; mode_templates only ref) — compile = 2 hops, was 4; refusal = 1 hop, 26KB shell (over guidance, justified: every section fires every compile)
- [x] `cold_email_learning_review` + `cold_email_offer_lab` — single shells (19–20KB, 0 refs; offer_lab folded all three including the pre-existing rubric whose triggers matched the skill's When-to-Use)
- [x] `algorithm_aware_publishing` (Pillar 0 inline; 3 mode-conditional refs)
- [x] All 51 tests green (30 skill + 21 domain) after every fold

**Authoring rules codified:**

- [x] `apps/web/src/lib/services/agentic-chat/tools/skills/AUTHORING_GUIDE.md` — delta test + one-load principle, 7 weak-model ingredients, inline→reference→child decision tree (a child needs own phrasing + ≥4KB own machinery + clean boundary), sizing table, parser facts, birth checklist, maintenance triggers. `.claude/skills/create-skill` now routes agentic-chat skill work here.

**Not folded (deliberate):** design-review family (`ui_ux_quality_review` etc.) — the targeted-question path makes its references genuinely conditional; revisit only if live load logs show all-refs-every-time.

### 🆕 Gap analysis + acquisition plan (2026-06-11)

Full plan: `SKILL_GAP_ANALYSIS_AND_ACQUISITION_PLAN_2026-06-11.md`. Built for the weak-model strategy (7-ingredient audit: worked examples > named patterns > thresholds > templates > decision trees > refusal rules > output contracts). Headlines: **25 of 43 skills have zero worked examples** — the eval harness doubles as the exemplar factory (strong-model 12/12 outputs become embedded examples); §2 lists manufacture-don't-acquire moves (8 specced-but-unbuilt cold-email artifacts, unported IA/usability/design-system analysis material, 12 ready-to-draft skills, 26-transcript analysis backlog); §3 is the tiered acquisition list (going-viral transcript batch with video IDs, design canon re-pulls, copy-craft, cold-email P0 books, JTBD primaries, SEO/AEO — then pricing, discovery cadence, founding team, brand, writing craft); §4 sequences it (Phase A manufacture → B structural → C acquisition → D new lanes).

---

## TL;DR

Your pipeline discipline is genuinely good — the lineage tracking, frontmatter schemas, and ingestion flow are more rigorous than most teams' internal tooling. But the system has **one structural leak that undermines the whole point**: the deep, agent-checkable expertise you distill from videos mostly lives in `docs/research/youtube-library/skill-drafts/` (250–400 line files with thresholds and rules), while the runtime skills the agent actually loads are often **~45-line compressed shells that lost the expertise in promotion**. An agent loading `ui_ux_quality_review` gets "review spacing, alignment, type scale" — advice the base model already knows — while the 399-line draft with named patterns and numeric thresholds sits in a directory the production agent can never read.

Secondary issues: ~10 finished drafts were never registered in the runtime at all, one skill is a 40KB monolith (~10k tokens per load), and you're maintaining three diverging copies of each skill (draft, runtime, public blog) with no declared source of truth.

The fix is not more lineage or more format rules. It's: **(1) define the quality bar as "the delta test," (2) move stranded draft expertise into runtime `reference_modules`, (3) declare the draft canonical and treat runtime + blog as derived artifacts.**

---

## 1. How the system actually works (verified against code)

You have **three parallel artifact layers**, and only one of them reaches the agent:

| Layer                | Location                                                                        | Who consumes it                                                             | Count  |
| -------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------ |
| Research drafts      | `docs/research/youtube-library/skill-drafts/<slug>/SKILL.md` (+ `lineage.yaml`) | You + Claude Code sessions. **Never the production agent.**                 | 25     |
| Runtime skills       | `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/<id>/SKILL.md` | **The agentic chat agent.** This is the only layer that matters at runtime. | 35     |
| Public blog articles | `apps/web/src/content/blogs/agent-skills/` + `source-analyses/`                 | Humans / SEO / marketing. Never loaded into the agent.                      | 8 + 30 |

Runtime mechanics that should anchor every quality decision (all verified in code):

- Skills are imported via `?raw` and parsed at module load in `markdown-skill.ts` (`defineMarkdownSkill`, lines 277–322). **No database, no build step.** Registry: `registry.ts` (`ALL_SKILLS`, 35 skills).
- **The only frontmatter fields the runtime reads:** `name`, `description`, `parent_id`, `depth`, `preserve_markdown`, `legacy_paths`, `child_skills`, `reference_modules`. Everything else — `skill_id`, `skill_type`, `categories`, `lineage`, `path` — is **silently ignored**. (Harmless, but know which fields are load-bearing.)
- **The only body sections parsed:** `## When to Use` (bullets), `## Workflow` (ordered list; headings starting or ending with "workflow" also match), `## Related Tools`, `## Guardrails`, `## Examples` (### titles + bullets), `## Notes`. Anything else — your Pillars, Core Principles, tables — only survives in `full` format loads, and only if `preserve_markdown: true`.
- **Nothing is preloaded.** The system prompt carries only a catalog table (skill ID + description, ~500–1000 tokens for all 35). The agent must call `skill_load(skill, format)` to get content. `domain_load` returns only skill IDs + `useWhen` hints, not bodies.
- Consequence: **the `description` frontmatter line and the domain `useWhen` string are the entire discovery API for a skill.** If they don't match how a user phrases the request, the skill effectively doesn't exist.

> **Correction to your mental model:** domains don't "preload" skills. They return a hint list. The skill body only enters context when the agent decides to call `skill_load`. So a skill's usefulness = (discoverability of its description/useWhen) × (quality of what `skill_load` returns).

---

## 2. The quality standard: what makes a skill useful to an agent

Define it as one test plus five properties.

### The Delta Test (the only test that matters)

> **Would the agent's output on a concrete task be materially different — and better — with this skill loaded vs. without it?**

The base model already knows "use visual hierarchy," "personalize cold emails," "hooks should create curiosity." A skill earns its existence only by carrying things the model **wouldn't reliably produce on its own**:

1. **Decision rules** — "pick the archetype from the available key visual, not the topic"
2. **Numeric thresholds** — "3–5 words in the text overlay," "≤12 words per sentence," "topic noun in the first 5–7 words"
3. **Named procedures run in a fixed order** — "archetype → slot grammar → three beats → four-mistake diagnostic"
4. **Refusal rules / guardrails** — "if the body can't pay off the hook's promise, refuse to ship, regardless of cleverness"
5. **Output contracts** — "return a hook bundle with these 14 labelled fields, never a single line"

A skill that summarizes a video's _ideas_ fails the delta test. A skill that operationalizes a video's _judgment_ passes it.

### Five properties of a runtime-usable skill

1. **Discoverable.** `description` ≤ 2 sentences, written in the vocabulary a _user request_ would use ("rewrite my hook," "audit this screen"), not the source's vocabulary ("Kallaway's framework").
2. **Parser-aligned.** Has literal `## When to Use`, `## Workflow` (or `## Workflow: ...`), `## Guardrails`. If it relies on tables/pillars outside those sections, it must set `preserve_markdown: true` — and accept that `short` format loads will drop that content.
3. **Right-sized.** Target **4–12KB** (~1–3k tokens) for the SKILL.md. Below ~3KB it's almost certainly a shell that fails the delta test. Above ~15KB, split depth into `reference_modules` so the agent pays for detail only when needed.
4. **Self-sufficient at runtime.** Never point the agent at `docs/research/...` paths — those files are not deployed. Depth goes in `references/*.md` registered as `reference_modules` (loadable via `skill_reference_load`).
5. **Closed with an output contract.** An explicit `## Output` (or output-shaped final workflow step) telling the agent exactly what artifact to return. This is the single biggest difference between your best and worst skills.

### Gold standard, by your own hand

`hook_craft_short_form` (18.7KB) is the model: stacked frameworks with a fixed execution order, numeric thresholds everywhere, two distinct workflows (generate vs. audit), a refuse-to-ship guardrail set, a 14-field output bundle, a BuildOS voice-translation layer, and honest source attribution. **Use it as the template every other combo skill is graded against.**

---

## 3. Audit findings: the 35 runtime skills, tiered

### Tier A — Genuinely strong (pass the delta test today)

| Skill                                                                                                                                                                                                                                           | Size       | Why it works                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hook_craft_short_form`                                                                                                                                                                                                                         | 18.7KB     | See above. The reference implementation.                                                                                                                                                   |
| `story_driven_content_craft`                                                                                                                                                                                                                    | 22.7KB     | Same architecture as hook_craft.                                                                                                                                                           |
| `viral_video_script_structure`                                                                                                                                                                                                                  | 23.1KB     | Same architecture.                                                                                                                                                                         |
| `cold_email_engagement_first_outreach`                                                                                                                                                                                                          | 11.7KB     | Procedural, has examples.                                                                                                                                                                  |
| `cold_email_icp_signal_design`                                                                                                                                                                                                                  | 10.2KB     | Same.                                                                                                                                                                                      |
| `content_strategy_beyond_blogging`                                                                                                                                                                                                              | 11KB       | Good strategic-layer parent.                                                                                                                                                               |
| Core ops: `task_management`, `plan_management`, `project_audit`, `project_creation`, `project_forecast`, `task_state_updates`, `document_workspace`, `calendar_management`, `people_context`, `libri_knowledge`, `linkedin_company_page_growth` | 2.6–10.8KB | Different genre (tool-orchestration playbooks) — these fit the parser format perfectly, carry exact tool-call patterns and anti-patterns (`update_onto_task({})` is wrong, etc.). Healthy. |

### Tier B — Rich but structurally risky

| Skill                        | Size       | Problem                                                                                                                                                                                                                                  |
| ---------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `algorithm_aware_publishing` | **40.5KB** | ~10k tokens on every `full` load. This needs its depth split into 2–3 `reference_modules` (platform-specific playbooks are the natural seam). Also: no `## Workflow` heading match risk — verify its workflow parses for `short` format. |

Also in B: the Tier-A combo skills (18–23KB) are all `preserve_markdown: true` monoliths with **zero reference modules**. They work, but every full load pays full price. Worth splitting eventually; not urgent.

### Tier C — Thin shells: the real quality problem (≈11 skills)

These are ~2KB runtime skills whose drafts contain 250–400 lines of real, threshold-laden expertise that **never made the jump**:

| Runtime skill                                                                                                                                                           | Runtime size      | Draft size    | Stranded delta                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------- | ---------------------------------------------------------------------- |
| `ui_ux_quality_review`                                                                                                                                                  | 2.4KB / ~45 lines | **399 lines** | Named patterns, severity rubric, agent-checkable rules with thresholds |
| `accessibility_inclusive_ui_review`                                                                                                                                     | 2.2KB             | **373 lines** | WCAG-style concrete checks                                             |
| `calm_software_design_review`                                                                                                                                           | 2.2KB             | **320 lines** | The actual calm-software criteria                                      |
| `delightful_product_review`                                                                                                                                             | 1.9KB             | **266 lines** | Changuel's 4-step framework detail                                     |
| `visual_craft_fundamentals`                                                                                                                                             | 2.0KB             | **253 lines** | Typography/color/spacing numbers                                       |
| `marketing_site_design_review`                                                                                                                                          | 2.2KB             | **187 lines** | Scorecard detail                                                       |
| `cold_email_learning_review`                                                                                                                                            | 1.6KB             | —             | Thinnest file in the registry                                          |
| `cold_email_taste_review`, `cold_email_offer_lab`, `cold_email_reply_os`, `cold_email_outreach_compiler`, `information_architecture_review`, `usability_quick_research` | ~2–2.7KB          | varies        | Generic 5-step workflows                                               |

The failure mode, concretely: the runtime `ui_ux_quality_review` workflow says _"Review visual fundamentals: spacing rhythm, alignment, type scale, contrast…"_ — that is a list of nouns, not a skill. Any frontier model does this unprompted. Meanwhile your draft (and the 518-line public blog!) ships each principle in two layers — human principle + **agent-checkable rule with thresholds** — which is exactly the right idea. The irony: **your blog readers get the agent-usable version; your agent gets the summary.**

Worse, several Tier-C skills end with `Notes → "Source-backed draft: docs/research/youtube-library/..."` — a path the deployed agent cannot read. That's a dangling pointer masquerading as depth.

**Caveat:** thin is correct for _router_ skills. `build_quality_ui_ux` (8.4KB parent that routes to children) and `design_system_architecture_review` are doing the hub job fine. The standard for a _leaf_ review skill is different from a _router_.

### Tier D — Stranded drafts (finished work the agent can't use at all)

Ten drafts exist in the research library but were never registered in `registry.ts`:

- `viral-content-for-boring-brands` (394 lines — **and it has a public blog page advertising it as an agent skill**)
- `landing-page-scorecard-funnel` (161 lines — **also publicly advertised**, with the deepest lineage in the library)
- `going-viral` (301), `ai-era-craft-and-quality-moat` (359), `growth-diagnostics-for-stalled-products` (171), `context-engineering-for-agent-work` (132), `lead-list-research-with-claude-code` (94), `nonfiction-writing-from-lived-conviction` (86), `local-ai-services-sales` (87), `cold-email-contextual-outbound` (92 — likely superseded by the cold*email*\* suite; archive it explicitly)

The two **bolded** ones are publicly promised. A user who reads the blog and asks the chat agent to "run the landing page scorecard" gets nothing. Decide for each: **register, or archive with a status note.** Don't leave them ambiguous.

---

## 4. The blog layers (quick assessment)

- **`source-analyses/` (30 files):** These are good _for what they are_ — public deep-reads with clean lineage frontmatter (verified: April Dunford file is well-structured, honest about caveats, links to the skill it feeds). They are **source material and marketing, not skills**. No quality problem here; just don't confuse their health with skill health.
- **`agent-skills/` (8 files):** Good public artifacts. But note `lineageStats`, `skillId`, `skillType`, `stackWith` etc. are blog-rendering metadata only — keep them, but document that they're display-layer, not runtime.
- **Drift risk is real:** `ui-ux-quality-review` exists as a 399-line draft, a 43-line runtime skill, and a 518-line blog — three hand-maintained versions, already divergent. See §6, recommendation 3.

---

## 5. The lineage system: honest take

**What's working:** Where applied, it's genuinely consistent — I sampled `ui-ux-quality-review` and `hook-craft-short-form` lineage files and every `local_path` resolves; combo-index cross-references are accurate; the transcript → analysis → draft → combo chain is traceable. This is rare discipline. The lineage also powers the blog's credibility display (`lineageStats`), which fits the BuildOS "show your sources" brand.

**What's not:**

1. **Adoption is 27%** (7 of 26 drafts have `lineage.yaml`). A standard that 73% of artifacts skip is a aspiration, not a standard.
2. **The per-claim edge graph (`source_claims`, `edges` with confidence scores) is more ontology than you need.** Nothing consumes it programmatically — not the runtime, not the blog build (blog stats are hand-copied). You're paying full graph-maintenance cost for documentation value.
3. **It's answering a question nobody is blocked on.** The questions that matter — "is this skill any good?", "can the agent use it?" — are not lineage questions.

**Recommendation:** Keep lineage, but right-size it. Required for every skill: `sources` list (title, creator, url, local analysis path) — that's it. Optional, only for flagship combos you'll write blogs about: the full claims/edges graph. Drop confidence scores entirely. Redirect the saved effort into the promotion pipeline (§6).

Housekeeping: one orphaned transcript at repo-root `/youtube-transcripts/` (the manufactured-viral-content-economy file) — move it into the library or delete the directory.

---

## 6. Recommendations, prioritized

### P1 — Rescue the Tier-C shells (highest value-per-hour in the whole system) — ✅ DONE 2026-06-10, see Work Tracker

For each thin leaf skill with a fat draft (start with `ui_ux_quality_review`, `visual_craft_fundamentals`, `accessibility_inclusive_ui_review`, `calm_software_design_review`, `delightful_product_review`):

1. Extract the agent-checkable rules/thresholds from the draft into `definitions/<id>/references/<topic>.md`.
2. Register them in frontmatter as `reference_modules` with sharp `when_to_load` hints (the `task_management` skill shows the pattern: `references/state-coverage.md`).
3. Replace the dangling `docs/research/...` pointers in `## Notes` with the reference-module IDs.
4. Add an `## Output` contract (findings format: severity / evidence / fix / which child skill to escalate to).

This keeps `short` loads cheap while making depth actually reachable. Roughly an afternoon per skill.

### P1 — Decide the fate of the 10 stranded drafts

Register `viral-content-for-boring-brands` and `landing-page-scorecard-funnel` first (publicly promised). For each remaining draft add a one-line `status:` to its frontmatter: `registered | queued | archived | superseded-by: <id>`. `cold-email-contextual-outbound` → `superseded-by: cold_email_engagement_first_outreach`.

### P2 — Declare a single source of truth and a promotion checklist

The draft in `docs/research/youtube-library/skill-drafts/` is **canonical**. Runtime and blog are _derived_. Add to the draft frontmatter: `promoted_to:` (runtime path) and `published_as:` (blog path), plus `last_promoted:` date. Then promotion = a checklist (this could become a `/promote-skill` command):

```
□ Delta test: name 3 things in this skill the base model wouldn't do unprompted
□ description rewritten in user-request vocabulary
□ ## When to Use / ## Workflow / ## Guardrails present and parser-aligned
□ Depth >15KB split into reference_modules
□ No docs/research/ paths in the body
□ ## Output contract present
□ Registered in registry.ts + linked in domains/catalog.ts with a useWhen
□ Draft frontmatter stamped: promoted_to + last_promoted
```

### P2 — Split `algorithm_aware_publishing` (40KB)

Platform-specific sections → 2–3 reference modules. Verify its workflow section parses for `short` format while you're in there.

### P3 — Build the eval you're missing

The real test of "is this skill useful" is empirical. For each flagship skill, write **2–3 golden tasks** (e.g., for hook_craft: "here's a topic + available footage, produce the hook bundle") and run them with and without the skill loaded. Diff the outputs. If the diff is small, the skill fails the delta test no matter how clean its lineage is. Store these as `definitions/<id>/evals.md` even if execution is manual at first. This converts "I'm not sure my skills are good" from a feeling into a measurement.

### P3 — Lineage right-sizing + hygiene

Per §5: sources-list mandatory, claims/edges optional, confidence scores dropped. Migrate or delete repo-root `/youtube-transcripts/`.

---

## 7. Direct answers to your questions

**"Are my skills actually usable?"** Split verdict. The 6 big combo skills and 11 core ops skills: yes, genuinely good — `hook_craft_short_form` is better than most published agent skills anywhere. The ~11 thin review/cold-email leaf skills: no — they're table-of-contents entries whose books are in a building the agent can't enter. The 10 unregistered drafts: not usable by definition.

**"Do I need standards for what makes a skill useful?"** Yes, but one test and five properties (§2), not more schema. Your instinct to add more _format_ would have missed the actual problem, which was a _pipeline_ problem (promotion loses the expertise).

**"Is my lineage setup working?"** Mechanically yes, strategically over-built. It's documentation infrastructure, and it's consuming effort that the promotion/eval layer needs more. Keep the sources list, make the graph optional.

**"Is the whole setup working as I hope?"** The ingestion half (video → transcript → analysis → draft) works and is well-documented. The delivery half (draft → runtime → agent actually performing better) is where value leaks: compression-on-promotion, unregistered drafts, no eval loop. Fix delivery before ingesting more sources — you have ~10 drafts of inventory waiting on it already.

---

_Verified against: `markdown-skill.ts`, `registry.ts`, `skill-load.ts`, `skill-search.ts`, `domains/catalog.ts`, `build-lite-prompt.ts`, all 35 runtime SKILL.md files, all 25 draft SKILL.md files, lineage samples (`ui-ux-quality-review`, `hook-craft-short-form`, `landing-page-scorecard-funnel`), `FRONTMATTER_SCHEMA.md`, `SKILL_LINEAGE_SCHEMA.md`, `INGESTION_FLOW.md`._
