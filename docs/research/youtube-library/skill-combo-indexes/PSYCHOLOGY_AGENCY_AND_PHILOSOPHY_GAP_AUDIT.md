<!-- docs/research/youtube-library/skill-combo-indexes/PSYCHOLOGY_AGENCY_AND_PHILOSOPHY_GAP_AUDIT.md -->

# Psychology, Agency, And Philosophy Gap Audit

## Purpose

This audit reviews the [Psychology, Agency, And Philosophy skill combos index](./PSYCHOLOGY_AGENCY_AND_PHILOSOPHY.md) before any of its four `needs-synthesis` combos (`designing-tools-that-preserve-agency`, `personal-knowledge-systems-file-over-app`, `taste-aliveness-soulful-ai-tools`, `constraint-driven-creative-systems`) are drafted into public skills. The category is the most _philosophically load-bearing_ index in the library — its stated job (per "Internal BuildOS Use") is to keep BuildOS from "becoming a generic automation product" by creating guardrails around agency, taste, and the assistance-vs-replacement line. That makes the bar high: a skill drafted from this index should change what an agent _refuses to build_, not just describe a vibe.

The headline finding is structural and blocking: **the three sources that carry the category's core thesis — Geoffrey Litt (malleable software), Linus Lee (aliveness), Steph Ango (file-over-app) — are raw, unprocessed transcript dumps with no analysis layer.** Every other index in the library drafts from `-ANALYSIS.md` or synthesized analyses; this index points its most important combos at 90K–140K-character single-line transcripts. Until those are synthesized, nothing here is draftable, and the category is also missing every _canonical_ philosophy-of-tools and psychology-of-agency voice (Illich, Engelbart, Self-Determination Theory, Turkle, Carr, Postman). Right now the index is four product/design opinions wearing a philosophy label.

## Status — Research Pull Executed 2026-06-22

The "Recommended Next Research Pull" below was run on 2026-06-22. Six analysis files were added under [`docs/research/youtube-library/analyses/`](../analyses/):

- ✅ **Gap 1 (unread transcripts) — RESOLVED.** [Litt](../analyses/2026-06-22_geoffrey-litt_malleable-software_analysis.md), [Lee](../analyses/2026-06-22_linus-lee_aliveness_analysis.md), and [Ango](../analyses/2026-06-22_steph-ango_file-over-app_analysis.md) are now synthesized into structured analyses with extracted, checkable design tests.
- ✅ **Gap 2 (no philosophy foundation) — RESOLVED.** [Ivan Illich, _Tools for Conviviality_](../analyses/2026-06-22_ivan-illich_tools-for-conviviality_analysis.md) added as the doctrinal spine, with a pass/fail Convivial-Tool Test.
- ✅ **Gap 3 (no agency psychology) — RESOLVED.** [Self-Determination Theory (Deci & Ryan)](../analyses/2026-06-22_deci-ryan_self-determination-theory_analysis.md) (Agency-Preserving Automation Test) and [Nicholas Carr, _The Glass Cage_](../analyses/2026-06-22_nicholas-carr_glass-cage_analysis.md) (Deskilling-Risk Test) added.
- ✅ **Gap 4 (no counter-school) — PARTIAL.** The existing [Jainek / Cultured Code analysis](../analyses/2026-04-29_werner-jainek-cultured-code_things-design-philosophy_analysis.md) is now cross-linked into the index as the calm/opinionated counter-school. **Bret Victor still to pull.**
- ⏳ **Gaps 5 & 6 (overlap boundary, agent-behavior contract) — OPEN.** These are synthesis/decision work, not research; resolve at draft time.

Result: the flagship combo "Designing tools that preserve agency" moved from `needs-research` to `ready-to-draft`. Remaining gaps are noted per-section below.

## Current Strengths

- **A coherent "soulful tools" lineage exists in source list form.** [Geoffrey Litt](../../../research-library/transcripts/podcast-geoffrey-litt-malleable-software.md) ([video](https://www.youtube.com/watch?v=RromJIXfYyI)), [Linus Lee](../../../research-library/transcripts/podcast-linus-lee-aliveness.md) ([video](https://www.youtube.com/watch?v=IaUYbNnOYUM)), and [Steph Ango](../../../research-library/transcripts/podcast-steph-ango-obsidian.md) ([video](https://www.youtube.com/watch?v=TDP8qzVK5XQ)) are exactly the right _names_ for malleability, aliveness, and file-over-app. The thesis lineage is correctly assembled — it is simply not yet _read_ (see Gap 1).
- **One genuinely synthesized cultural-systems source.** The [Tools for Thought Rocks session](../../../research-library/transcripts/podcast-tools-for-thought.md) (Maggie Appleton + Hunter Clarke) ([video](https://www.youtube.com/watch?v=t6uhvFGPUE0)) is fully analyzed and unusually deep: "tools for thought are practices, not apps," computation as meta-medium, end-user programming as cultural encoding, the divergence/convergence gap, and "prune without losing memory." This is the single strongest piece of draftable material in the index and it maps almost 1:1 onto BuildOS's own brain-dump→structure model.
- **A real taste framework, borrowed from product/design.** The [Dylan Field analysis](../../../marketing/growth/research/youtube-transcripts/2026-04-28-dylan-field-figma-ceo-design-craft-moat-ANALYSIS.md) ([video](https://www.youtube.com/watch?v=WyJV6VwEGA8)) contributes an articulated **taste loop** (experience → like/dislike → ask why → expand to canon → form a position), the taste-matcher vs taste-maker distinction, and "good enough is mediocre." This is operator-grade and gives the `taste-aliveness` combo something concrete to stand on.
- **A constraint-as-creative-material source.** The [Andrew nonfiction analysis](../../../marketing/growth/research/youtube-transcripts/2025-07-21-andrew-write-nonfiction-ANALYSIS.md) ([video](https://www.youtube.com/watch?v=WIP_hLaLnLo)) supplies usable craft constraints (hermit-crab/braided forms, "treat yourself as a character," subtractive process) for the `constraint-driven-creative-systems` combo.
- **A design-engineering walkthrough for "generic vs alive" diagnosis.** The [Ryo Lu / Peter Yang Cursor walkthrough](../../../research-library/transcripts/podcast-ryo-lu-peter-yang.md) ([video](https://www.youtube.com/watch?v=bdh8k6DyKxE)) gives the concrete "Shadcn slop" failure mode — what generic AI output actually looks like at the pixel level — which is the missing operational half of the otherwise-abstract "aliveness" claim.

**Net:** the index has _one_ draft-ready source (Tools for Thought), _two_ borrowed operator frameworks (Dylan taste, Andrew constraints), and _three_ unread thesis transcripts where the entire category's identity lives. It has zero canonical philosophy/psychology sources.

## Highest-Priority Gaps

### 1. The Three Core Thesis Sources Are Unread Transcript Dumps — ✅ RESOLVED 2026-06-22

**Why it matters:** Litt, Lee, and Ango appear in 3 of 4 combos and _are_ the category's reason to exist — but each file is a single 90K–140K-character line of raw transcript with no analysis, key-insights, or BuildOS-implications section. You cannot draft "Designing tools that preserve agency" from a source you have not extracted. Worse, drafting _anyway_ is how the index's own failure mode happens: "vibes essays disguised as skills." This single gap blocks all four combos.

**What to collect or improve:**

- Produce `-ANALYSIS.md` files for all three, matching the depth of the Dylan/Andrew analyses (core thesis, extracted principles, agent-behavior implications, BuildOS guardrails).
- From Litt specifically, extract the _operational_ claims, not just the slogan: end-user programming, "software you can reshape mid-use," the spectrum from configuration → scripting → forking, and where agentic editing fits.
- From Lee, extract what "aliveness" and "engaged vs instrumental" interfaces concretely _mean_ as design tests, not adjectives.
- From Ango, extract the file-over-app principles as checkable rules (own your data, plain-text durability, links over hierarchy, tools outlive vendors).

**Experts and sources to look for:**

- [Geoffrey Litt](https://www.geoffreylitt.com/) — Ink & Switch malleable software essays, "Malleable software in the age of LLMs," "End-user programming."
- [Linus Lee (thesephist)](https://thesephist.com/) — "Tools for thought as cybernetic systems," notation/representation essays.
- [Steph Ango](https://stephango.com/) — "File over app," Obsidian philosophy essays, "How I think when I write software."

**Search queries:**

```text
Geoffrey Litt malleable software end-user programming Ink and Switch
Linus Lee thesephist aliveness engaged instrumental interface tools for thought
Steph Ango file over app durable plain text obsidian philosophy
Ink and Switch local-first malleable software LLM
```

**Potential skill combo or update:** unblocks `designing-tools-that-preserve-agency` and `personal-knowledge-systems-file-over-app`.

### 2. No Canonical Philosophy-of-Tools Foundation — ✅ RESOLVED 2026-06-22 (Illich pulled; Engelbart/Postman optional next)

**Why it matters:** The category is named "Philosophy" but contains zero philosophers. Every claim ("preserve agency," "tools should disappear," "augment don't replace") has a canonical origin that is older, sharper, and more defensible than a 2024 podcast — and an agent that cites only podcast guests will produce shallow, dated guardrails. Without a foundation, `designing-tools-that-preserve-agency` cannot distinguish _augmentation_ from _automation_ in any principled way; it can only gesture.

**What to collect or improve:**

- **Ivan Illich, _Tools for Conviviality_** — the canonical text on tools that enlarge vs degrade human agency; the concept of the "convivial tool" and the "second watershed" where a tool starts dominating its user. This is the single most important missing source for the whole category.
- **Douglas Engelbart, "Augmenting Human Intellect"** — the founding augmentation-not-replacement framing.
- **Neil Postman, _Technopoly_ / _Amusing Ourselves to Death_** — technology-as-ideology, "every tool carries an embedded agenda."
- **Marshall McLuhan** — "the medium is the message," already gestured at by Maggie Appleton's meta-medium point; cite the origin.

**Experts and sources to look for:**

- [Ivan Illich — _Tools for Conviviality_](https://en.wikipedia.org/wiki/Tools_for_Conviviality) (full text widely available)
- [Douglas Engelbart — Augmenting Human Intellect (1962)](https://www.dougengelbart.org/content/view/138/)
- L.M. Sacasas — _The Convivial Society_ newsletter (modern Illich-lineage analysis of tools and agency)

**Search queries:**

```text
Ivan Illich Tools for Conviviality convivial tool second watershed summary
Douglas Engelbart augmenting human intellect augmentation not automation
Neil Postman Technopoly every technology has an embedded ideology
L.M. Sacasas convivial society questions to ask about technology
```

**Potential skill combo or update:** becomes the doctrinal spine of `designing-tools-that-preserve-agency`; gives every other combo a citation backbone.

### 3. "Agency" Has No Psychology Source — Only Design Opinion — ✅ RESOLVED 2026-06-22 (SDT + Carr pulled; Turkle optional next)

**Why it matters:** The word "agency" is in the category title and three combos, but there is no source from the actual _psychology of human agency and motivation_. Self-Determination Theory (Deci & Ryan) is the empirically grounded model of autonomy, competence, and relatedness — the three needs a tool either supports or undermines. Without it, "preserve agency" is an aesthetic preference; with it, it becomes a testable design contract (does this feature increase the user's sense of autonomy and competence, or outsource it?).

**What to collect or improve:**

- **Self-Determination Theory (Deci & Ryan)** — autonomy / competence / relatedness as the three psychological needs; intrinsic vs extrinsic motivation; how automation can crowd out intrinsic motivation.
- **Sherry Turkle, _Alone Together_ / _Reclaiming Conversation_** — the cost side of delegation to machines; when tools erode the capacities they were meant to support.
- **Nicholas Carr, _The Shallows_ / _The Glass Cage_** — automation complacency and skill atrophy; the "automation paradox" (the more capable the tool, the more it deskills the operator).
- **Cal Newport, _Deep Work_ / _Digital Minimalism_** — attention as the scarce resource agency depends on.

**Experts and sources to look for:**

- [Edward Deci & Richard Ryan — Self-Determination Theory](https://selfdeterminationtheory.org/)
- [Nicholas Carr — _The Glass Cage_](https://www.nicholascarr.com/?page_id=21) (automation and the deskilling argument)
- [Sherry Turkle — MIT, _Reclaiming Conversation_](https://sherryturkle.com/)

**Search queries:**

```text
Deci Ryan self-determination theory autonomy competence relatedness intrinsic motivation
Nicholas Carr Glass Cage automation paradox deskilling complacency
Sherry Turkle reclaiming conversation tools erode capacities
intrinsic motivation crowding out automation overjustification effect
```

**Potential skill combo or update:** new sub-skill `agency-preserving-automation-test` — a checklist an agent runs before adding any automation: does it increase autonomy/competence or outsource it?

### 4. No Counter-School — The Index Only Argues One Side — ◐ PARTIAL (Jainek cross-linked; Bret Victor still to pull)

**Why it matters:** Every source agrees with the thesis (tools should be malleable, alive, soulful, agency-preserving). A skill built only from agreeing sources has no judgment — it cannot tell a user _when malleability is wrong_ (most users don't want to program their tools; opinionated defaults often serve agency better than configurability). The strongest version of "preserve agency" must engage the calm/opinionated-software counter-position: that constraint and good defaults are _more_ convivial than infinite malleability.

**What to collect or improve:**

- **DHH / 37signals (_It Doesn't Have to Be Crazy at Work_, "calm company")** and **Jason Fried** — opinionated software, fewer options as respect for the user.
- **Werner Jainek (Cultured Code / Things)** — already analyzed in the [Product & Design index](./PRODUCT_AND_DESIGN.md) ("tools should disappear during use," "do not over-organize," deliberate non-features). Cross-link it here.
- **Bret Victor** — the contrarian high bar ("Inventing on Principle," "Magic Ink") on what tools _should_ let humans see and do; a sharper, less comfortable standard than "malleability."

**Experts and sources to look for:**

- [Werner Jainek / Cultured Code analysis](../analyses/2026-04-29_werner-jainek-cultured-code_things-design-philosophy_analysis.md) ([video](https://www.youtube.com/watch?v=XpI4sQybnm0)) — already in the library
- [Bret Victor — Inventing on Principle / worrydream.com](https://worrydream.com/)
- [37signals / Jason Fried — Signal v. Noise, REWORK podcast](https://37signals.com/)

**Search queries:**

```text
Bret Victor inventing on principle magic ink direct manipulation
Jason Fried DHH opinionated software calm defaults fewer options respect user
Cultured Code Things design philosophy tools should disappear non-features
malleable software criticism most users don't want to program their tools
```

**Potential skill combo or update:** sharpens all combos; gives `designing-tools-that-preserve-agency` a genuine decision ("when to offer malleability vs when to decide for the user").

### 5. Combos Overlap Heavily With Product/Design and Writing — Boundary Undefined

**Why it matters:** `taste-aliveness-soulful-ai-tools` shares Ryo Lu + Linus Lee + Steph Ango + Dylan Field with PRODUCT*AND_DESIGN's `taste-driven-toolmaking`. `constraint-driven-creative-systems` shares Andrew + Steph Ango with WRITING. If these get drafted independently, the library ships two near-identical skills with different names. The index even tells itself to "cross-link with product/design" four times without ever resolving \_who owns what*.

**What to collect or improve:**

- An explicit ownership rule: PRODUCT*AND_DESIGN owns \_building* the tool (operator how-to); this index owns _whether you should and what it does to the human_ (judgment/refusal). Same sources, different agent contract.
- Decide whether `taste-aliveness` and `taste-driven-toolmaking` should _merge_ into one skill with two modes, or stay split on the build-vs-judge line.

**Experts and sources to look for:** (no new sources — this is a synthesis/boundary decision, not a research gap)

**Search queries:** n/a — resolve by editing the two index files together.

**Potential skill combo or update:** possible merge of `taste-aliveness` into a single cross-index `taste-and-aliveness` skill; or a clean split where this index's version is purely a _refusal/guardrail_ skill.

### 6. No Agent-Behavior Contract — The "So What" Is Missing

**Why it matters:** Every combo's "Workflow Created" column is a _description_ ("Evaluate whether a tool expands user agency...") not a _contract_ (inputs, the actual test, the stop condition, what the agent refuses). The PRODUCT_AND_DESIGN audit flagged the identical disease (gap #8: "vibes essays disguised as skills"). For a philosophy category this is the highest risk: philosophy skills fail by being unfalsifiable.

**What to collect or improve:**

- For each combo, write a concrete agent contract before drafting: trigger, the 4–6 checkable questions, the score/verdict, and at least one "the agent should refuse / push back" case.
- Steal the _form_ from the already-strong `delightful-product-review` and `ui-ux-quality-review` drafts (checklist + grid + verdict), and fill it with this category's content.

**Experts and sources to look for:** n/a — internal synthesis using existing skill-draft structure.

**Search queries:** n/a

**Potential skill combo or update:** turns `designing-tools-that-preserve-agency` from an essay into an `agency-review` skill with a pass/fail rubric.

## Source Coverage Matrix

Updated 2026-06-22 to reflect the executed pull.

| Capability / Question                                      | Covered By                                                                       | Missing Or Thin                                                      | Priority |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| What "malleable / file-over-app" tools are                 | ✅ Litt + Ango — now synthesized                                                 | Resolved                                                             | done     |
| What "aliveness / engaged interface" means operationally   | ✅ Lee — synthesized (instrumental-vs-engaged moment test); Ryo Lu (Shadcn-slop) | "Come alive / wonder" language flagged as stance-only, not in rubric | low      |
| Tools-for-thought as practices, not apps                   | Tools for Thought (Appleton) — synthesized                                       | Well covered                                                         | low      |
| Articulated taste framework                                | Dylan Field — synthesized                                                        | Covered; borrowed from product/design                                | low      |
| Constraint as creative material                            | Andrew nonfiction — synthesized                                                  | Thin for tool design; add Bret Victor                                | medium   |
| Canonical philosophy of tools (conviviality, augmentation) | ✅ Illich — synthesized (convivial-tool test)                                    | Engelbart, Postman, McLuhan still optional depth                     | low      |
| Psychology of agency / motivation                          | ✅ SDT (Deci & Ryan) + Carr — synthesized (2 pass/fail tests)                    | Turkle (relatedness cost) optional                                   | low      |
| Counter-school (calm/opinionated > malleable)              | ◐ Jainek — now cross-linked                                                      | Bret Victor, DHH/Fried still to pull                                 | medium   |
| Agent-behavior contract for each combo                     | nobody                                                                           | All combos still descriptions; write rubric at draft time            | high     |
| Boundary vs PRODUCT_AND_DESIGN / WRITING                   | nobody                                                                           | Overlap unresolved; duplication risk                                 | medium   |

## Suggested New Directions

| Proposed Direction                                                 | Sources To Add                                            | What It Should Enable                                                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `agency-review` (rename of "designing-tools-that-preserve-agency") | Illich, Engelbart, Deci & Ryan (SDT), + analyzed Litt/Lee | Agent runs a pass/fail autonomy/competence test on any proposed feature and **refuses or flags** agency-degrading automation |
| `agency-preserving-automation-test` (sub-skill)                    | SDT, Nicholas Carr (Glass Cage), Postman                  | A pre-build checklist: does this automation increase user capability or outsource it? Names the deskilling risk              |
| `personal-knowledge-systems-file-over-app`                         | analyzed Ango + Litt + Tools for Thought                  | Build durable, portable, link-first knowledge workflows; data outlives the vendor                                            |
| `taste-and-aliveness` (merge candidate w/ P&D)                     | analyzed Lee + Ryo Lu + Dylan + Jainek                    | Diagnose generic-vs-alive output; preserve human authorship and taste                                                        |
| `constraint-driven-creative-systems`                               | Andrew + Ango + Bret Victor                               | Use constraints/defaults as creative power, not limitation — for both writing and tool design                                |

## Recommended Next Research Pull

**✅ This pull was executed 2026-06-22 — steps 1–5 below are complete.** The new highest-leverage move is now _drafting_, not sourcing: draft the `agency-review` skill from the three pass/fail tests now in the library.

Original plan (all done):

1. ✅ **Synthesize the three raw transcripts** (Litt, Lee, Ango) into analysis files. Done — see [Status](#status--research-pull-executed-2026-06-22).
2. ✅ **Pull Ivan Illich, _Tools for Conviviality_** — doctrinal spine. Done.
3. ✅ **Pull Self-Determination Theory (Deci & Ryan)** — testable agency. Done.
4. ✅ **Pull Nicholas Carr, _The Glass Cage_** — deskilling counterweight. Done.
5. ✅ **Cross-link the [Werner Jainek / Cultured Code analysis](../analyses/2026-04-29_werner-jainek-cultured-code_things-design-philosophy_analysis.md)** as the counter-school. Done.

**Optional next pulls (deepen, don't block):** Bret Victor (sharper constraint standard for gap 4), Engelbart "Augmenting Human Intellect" + Postman _Technopoly_ (philosophy depth for gap 2), Sherry Turkle (relatedness cost side for gap 3).

## Draft Readiness

`needs-synthesis` (as of 2026-06-22 — was `needs-research`)

The research blockers are cleared. After the 2026-06-22 pull, the flagship combo `designing-tools-that-preserve-agency` is **`ready-to-draft`**: it now has three checkable foundations (Illich's convivial-tool test, the SDT agency-preserving-automation test, Carr's deskilling-risk test) plus three synthesized practitioner sources (Litt, Lee, Ango) and a counter-school (Jainek). `personal-knowledge-systems-file-over-app` is also `ready-to-draft` (all three sources synthesized). The category as a whole is `needs-synthesis` rather than `ready-to-draft` only because of the two remaining _non-research_ tasks: resolving the overlap with PRODUCT_AND_DESIGN/WRITING (gap 5) and writing the explicit pass/fail agent contract per combo (gap 6) — both done at draft time, not by more sourcing. Optional future pulls that would deepen but don't block: Bret Victor (sharper constraint standard), Engelbart/Postman (philosophy depth), Sherry Turkle (relatedness cost side).
