<!-- docs/research/youtube-library/skill-combo-indexes/PRODUCT_AND_DESIGN_GAP_AUDIT.md -->

# Product And Design Gap Audit

## Purpose

This audit reviews the [Product And Design skill combos index](./PRODUCT_AND_DESIGN.md) before drafting the four "needs-synthesis" combos (`delightful-product-review`, `ai-era-craft-and-quality-moat`, `design-to-code-workflow`, `taste-driven-toolmaking`) and before extending the already-drafted [`ui-ux-quality-review`](../skill-drafts/ui-ux-quality-review/SKILL.md). The aim is to surface where the current source stack is strong enough to draft today, where the index has loaded "craft is the moat" _opinion_ without operator-level _how_, and which canonical design and design-engineering voices need to be pulled in next so the resulting skills do not collapse into "five Lenny's Podcast guests said design matters."

## Current Strengths

The current source stack is unusually strong on **three specific layers** of product and design:

- **Atomic UI/UX fixes for self-taught designers and developers.** The Kole Jain pair ([7 UI/UX mistakes](../../../marketing/growth/research/youtube-transcripts/2025-06-07-kole-jain-7-ui-ux-mistakes-beginner-ANALYSIS.md), [Every UI/UX Concept](../../../../youtube-design.md)) is a tight, repeatable checklist: corner-radius standardization, shadow recipe, grid+auto-layout discipline, icon-library consistency, feedback-on-click, and chart-readability. This is enough to carry [`ui-ux-quality-review`](../skill-drafts/ui-ux-quality-review/SKILL.md) as a stand-alone skill and is the most operator-grade material in the index.

- **Delight as an operating model.** The [Nesrine Changuel analysis](../../../marketing/growth/research/youtube-transcripts/2026-04-28-nesrine-changuel-4-step-delightful-products-framework-ANALYSIS.md) is unusually deep for a single source: motivator + demotivator inversion, the delight grid (low / surface / deep), the delight checklist (impact, feasibility, familiarity, inclusion, maintainability of surprise), the 50-40-10 roadmap rule, the habituation-effect cadence, and the "B2H" framing. This is enough to draft `delightful-product-review` today without waiting for the broader synthesis.

- **A "craft is the moat" thesis from three different vantage points.** [Dylan Field](../../../marketing/growth/research/youtube-transcripts/2026-04-28-dylan-field-figma-ceo-design-craft-moat-ANALYSIS.md) (CEO frame, "good enough is mediocre"), [Jenny Wen at Anthropic](../../../marketing/growth/research/youtube-transcripts/2026-03-01_jenny-wen_design-process-dead.md) (the design process is dead, prototype-in-code, three new design archetypes), and the [Ryo Lu / Peter Yang Cursor walkthrough](../../../../research-library/transcripts/podcast-ryo-lu-peter-yang.md) (plan mode, spec-first prompting, "Shadcn slop" diagnosis, theming on top of Radix primitives) form a three-way agreement that _something_ about craft has changed in the AI era.

- **A "soulful tools" lineage.** [Linus Lee](../../../../research-library/transcripts/podcast-linus-lee-aliveness.md), [Steph Ango](../../../../research-library/transcripts/podcast-steph-ango-obsidian.md), and (cross-linked) Geoffrey Litt give a coherent philosophical position on agency, instrumental-vs-engaged interfaces, file-over-app, and constraint-driven creativity. Useful for _positioning_ a tool — less useful for actually building one.

The main weaknesses: the index is **CEO/founder-heavy and operator-light**. Five of nine sources are senior leaders giving thesis-level talks (Dylan, Jenny, Ryo, Linus, Steph). The two operator sources (Kole Jain) cover one slice of UI craft only. The index is missing **canonical design fundamentals** (Don Norman, Steve Krug, Alan Cooper), **canonical design-engineering** (Adam Wathan / _Refactoring UI_, Josh Comeau, Sara Soueidan), **accessibility entirely**, **design systems entirely** (Brad Frost, Nathan Curtis, Una Kravets), and any source on **calm software as a counter-school to delight** (DHH/37signals, Linear, Things 3) — which is the school BuildOS's own anti-feed positioning actually fits.

The other structural problem: `taste-driven-toolmaking` and `ai-era-craft-and-quality-moat` overlap heavily (Dylan + Ryo + Nesrine appear in both) and neither has a clear agent-behavior contract. They risk becoming "vibes essays disguised as skills."

## Highest-Priority Gaps

### 1. Operator-Level Visual Craft Canon (Refactoring UI)

**Why it matters:** The `ui-ux-quality-review` skill rests almost entirely on Kole Jain's 7-mistakes checklist. That gets a screen out of "amateur" but does not teach a non-designer how to _make_ a screen well. _Refactoring UI_ by Adam Wathan and Steve Schoger is the canonical operator-grade text for exactly this audience — the founder/engineer who needs to ship UI without a designer — and it is missing from the source stack entirely. Also missing: Erik Kennedy's Learn UI Design lessons (visual hierarchy, color systems, type scales), Josh Comeau on CSS spacing systems, and Sara Soueidan on inclusive front-end patterns. Without these, `ui-ux-quality-review` cannot deepen past atomic fixes, and `ai-era-craft-and-quality-moat` cannot tell anyone _how_ to raise the craft bar — only that they should.

**What to collect or improve:**

- _Refactoring UI_ book and Adam Wathan's accompanying talks (the "personality through hierarchy" pattern, type-scale-as-product-language, optical adjustments, color-system construction).
- Erik Kennedy / Learn UI Design — visual hierarchy, alignment, color theory, density.
- Steve Schoger Twitter threads and demos (the "remove a card" minimalism move, halftone shadows, accent color discipline).
- Josh Comeau on CSS spacing scales, color modes, dark-mode contrast.
- Sara Soueidan on inclusive components and CSS-grade craft.
- Linear and Stripe public design-system writing (representative AI-era operator examples).

**Experts and sources to look for:**

- Adam Wathan and Steve Schoger — _Refactoring UI_, Tailwind Labs talks.
- Erik Kennedy — Learn UI Design course, "7 Rules for Creating Gorgeous UI" essays.
- Josh Comeau — joshwcomeau.com, _The Joy of React_, CSS-spacing essays.
- Sara Soueidan — sarasoueidan.com, inclusive components.
- Lea Verou — _CSS Secrets_, Houdini and modern-CSS talks.
- Linear blog (linear.app/blog) and Stripe Press posts on craft and design.

**Search queries:**

```text
Adam Wathan Steve Schoger Refactoring UI hierarchy spacing
Erik Kennedy Learn UI Design 7 rules visual hierarchy
Steve Schoger refactoring UI live redesign
Josh Comeau CSS spacing scale dark mode contrast
Sara Soueidan inclusive components front end
Linear design philosophy calm software craft
Stripe Press design craft engineering
```

**Potential skill combo or update:** Update `ui-ux-quality-review` with a "Refactoring UI canon" section covering type scale, optical adjustments, color/contrast discipline, and density. Spin off a sibling skill `visual-craft-fundamentals` stacking Refactoring UI + Erik Kennedy + Josh Comeau when there is enough source coverage — this is the operator counterpart to the Dylan/Jenny/Ryo "craft is the moat" thesis.

### 2. Accessibility And Inclusive Design (Totally Absent)

**Why it matters:** The current `ui-ux-quality-review` skill explicitly says _"do not use this skill for accessibility audits that require WCAG-specific testing"_ and there is no other skill in the index that picks up the slack. That is an unacceptable gap for any agent expected to review production UI. Beyond compliance, accessibility is also the discipline that catches a large fraction of generic UI bugs (focus state, keyboard navigation, color contrast, screen-reader labels, motion sensitivity) that the Kole Jain checklist does not name. BuildOS itself has an `accessibility-auditor` agent listed but no source-backed skill behind it. This is also the highest-stakes inclusion failure mode in the Nesrine Changuel checklist (the Apple-reactions-during-therapy story is, structurally, an accessibility/inclusion miss).

**What to collect or improve:**

- WCAG 2.2 AA canonical reference (W3C) plus WebAIM practical write-ups.
- Sara Soueidan's accessibility deep dives (focus states, ARIA, dialogs, comboboxes).
- Heydon Pickering — _Inclusive Components_, _Inclusive Design Patterns_.
- Léonie Watson on screen-reader testing and accessibility.
- Adrian Roselli — accessible tables, accessible name computation, real-world ARIA traps.
- Apple HIG and Material Accessibility docs as canonical platform sources.
- Inclusive design at Microsoft (Kat Holmes, _Mismatch_).
- Practical eval tooling: axe DevTools, Lighthouse, screen-reader walkthroughs.

**Experts and sources to look for:**

- Heydon Pickering — _Inclusive Components_ and Smashing Magazine essays.
- Sara Soueidan — accessibility-focused workshops and articles.
- Léonie Watson — TPGi / Tetralogical talks.
- Adrian Roselli — adrianroselli.com.
- Marcy Sutton — accessibility engineering talks.
- Kat Holmes — _Mismatch_, inclusive design talks at Microsoft Design.

**Search queries:**

```text
Heydon Pickering inclusive components accessible dialog menu
Sara Soueidan accessible focus state keyboard navigation
Léonie Watson screen reader testing methodology
Adrian Roselli accessible name computation ARIA traps
WCAG 2.2 AA practical checklist founder engineer
Kat Holmes inclusive design mismatch Microsoft
axe DevTools accessibility audit workflow
```

**Potential skill combo or update:** New skill `accessibility-and-inclusive-ui-review`. Stack WCAG 2.2 AA + Heydon Pickering + Sara Soueidan + Adrian Roselli + Kat Holmes. Output: an agent that can audit a screen against keyboard navigation, focus management, contrast, screen-reader semantics, motion reduction, and inclusive content. This is also the obvious source backbone for the existing `accessibility-auditor` agent.

### 3. Design Systems, Tokens, And Component Libraries

**Why it matters:** "Consistency" is mentioned across the existing `ui-ux-quality-review` skill, but the index has no source on how to _build_ or _audit_ a design system, define tokens, or operate a component library at scale. Ryo Lu's "Shadcn + Radix + theming" pattern is excellent but is one operator's tactic — not a system. For BuildOS specifically, the Inkprint design system already exists as a documented set of tokens; an agent helping the team extend or audit it has no canonical source to reason against. Without Brad Frost's atomic design lineage, Nathan Curtis on tokens and contribution models, or Una Kravets on the modern CSS/design-token stack, the design-system question collapses into "use Tailwind."

**What to collect or improve:**

- Brad Frost — _Atomic Design_, "Design Systems Pyramid," design-system governance talks.
- Nathan Curtis (EightShapes) — token taxonomies, contribution models, multi-brand systems.
- Una Kravets — design tokens, container queries, modern CSS at Google / Chrome.
- Adam Wathan on utility-first vs component-library trade-offs.
- Josh Comeau on theming and dark mode systems.
- Linear, Stripe, Vercel (Geist), Shopify (Polaris), Atlassian (ADS) public design-system writing.
- shadcn / Radix documentation and threads on the Radix-as-headless-primitive philosophy.

**Experts and sources to look for:**

- Brad Frost — bradfrost.com, _Atomic Design_ book, Smashing Magazine.
- Nathan Curtis — EightShapes Medium publication.
- Una Kravets — una.im, Google Chrome talks at I/O and CSS Day.
- Diana Mounter / Primer (GitHub) — design-system-as-product writing.
- Lukas Oppermann (GitHub Primer) and Jina Anne (formerly Salesforce Lightning).
- Shadcn (shadcn-ui) and Radix Primitives documentation.

**Search queries:**

```text
Brad Frost atomic design system pyramid governance
Nathan Curtis EightShapes design tokens contribution model
Una Kravets design tokens container queries Chrome
Diana Mounter Primer GitHub design system product
shadcn Radix headless primitive theming pattern
Linear design system Inkprint Stripe Geist Vercel
multi brand design tokens architecture founder
```

**Potential skill combo or update:** New skill `design-system-architecture-review`. Stack Brad Frost + Nathan Curtis + Una Kravets + Radix/shadcn philosophy + Adam Wathan utility-first. Output: an agent that can audit a token system, identify naming/contract drift, recommend a contribution model, and flag missing primitives. Inkprint specifically is the BuildOS use case.

### 4. AI-Generated UI Critique And "Shadcn Slop" Patterns

**Why it matters:** Ryo Lu's "AI really knows Shadcn well; your job is to paint over it without it looking like AI slop" is one of the most useful sentences in the entire source stack — and the index does not develop it. As of 2026, every founder using Cursor, v0, Lovable, or Bolt is shipping the same ten components in the same five typefaces with the same three radii. The agent skill that detects, names, and fixes "AI slop" UI patterns is high-leverage and currently unbacked. Dylan Field also names this directly ("ideas die on the vine because the visual expression doesn't match expectations") but neither he nor Ryo gets specific. Need _visual_ counter-examples, not just thesis statements.

**What to collect or improve:**

- A taxonomy of "AI slop" UI patterns: Inter + slate-500 + rounded-2xl + lucide icons + linear gradients + emoji-heavy empty states + identical hero-section structure.
- Side-by-side rewrites of v0 / Lovable / Bolt outputs against well-crafted equivalents (Linear, Stripe, Cursor, Granola).
- The Refactoring UI canon (gap 1) as the corrective lens.
- Designer commentary on AI-generated UI: Soren Iverson, Tobias van Schneider, Wes Bos, Ben Holliday.
- Vercel v0 team posts on generative UI patterns and where they break.
- The Shadcn maintainer's own writing on theming, component contracts, and what "owning your components" enables.

**Experts and sources to look for:**

- Soren Iverson — daily UI critiques, often cited for catching AI-era patterns.
- Tobias van Schneider — _DESK Magazine_, design taste essays.
- Adam Wathan / Steve Schoger — _Refactoring UI_ applied to AI output.
- Vercel v0 / Lovable founder talks and engineering posts.
- shadcn (Shad Co) — interview content and Twitter threads.
- Brad Frost on AI design system risks.

**Search queries:**

```text
AI generated UI slop pattern critique design
v0 Lovable Bolt generic interface critique
shadcn ui theming custom design language
Soren Iverson UI critique AI generated
Refactoring UI applied to AI generated components
how to make AI code not look generic
designer review v0 output Vercel
```

**Potential skill combo or update:** New skill `ai-ui-slop-detector-and-rewrite`. Stack Refactoring UI + Ryo Lu + Soren Iverson + Adam Wathan + shadcn theming. Output: an agent that can review a screenshot of v0/Lovable/Cursor-generated UI and (1) name the slop pattern, (2) rewrite the typography/color/density, (3) propose a theming layer. This is also a strong public agent-skill blog candidate.

### 5. Calm Software As A Counter-School To Delight

**Why it matters:** The current `delightful-product-review` combo treats delight as the universal craft goal, but BuildOS's own anti-feed / "thinking environment for people making complex things" positioning is much closer to _calm software_ than to _delightful product_ — and the two schools disagree. Linear, Things 3, Notion (early), iA Writer, Apple Notes, and Obsidian are calm-school products; Spotify, Duolingo, Airbnb's Superhost moments are delight-school. The index has Steph Ango (Obsidian) but does not extract his calm-software argument. It is also missing John Maeda's _Laws of Simplicity_, the 37signals "calm company" canon, Cal Newport on attention as a design constraint, and Tony Fadell on restraint. A skill that only knows Nesrine Changuel will tell BuildOS to add confetti to the daily brief — exactly the move the brand cannot make.

**What to collect or improve:**

- Linear's "calm software" public essays (linear.app/blog).
- Things 3 / Cultured Code design philosophy interviews.
- 37signals / DHH on calm-company and _It Doesn't Have to Be Crazy at Work_.
- John Maeda — _The Laws of Simplicity_, _Design in Tech_ reports.
- Tony Fadell — _Build_, restraint and "atomic accountability" in product.
- Cal Newport — _Deep Work_, _A World Without Email_ (constraint as design).
- Mark Boulton / Ethan Marcotte on type-and-space-led design.
- Steph Ango full breakdown beyond what is currently in the transcript.

**Experts and sources to look for:**

- Karri Saarinen / Linear — calm software and craft talks.
- Ken Case / Cultured Code — Things design philosophy interviews.
- DHH and Jason Fried — 37signals podcast and books.
- John Maeda — _Laws of Simplicity_.
- Tony Fadell — _Build_, podcast appearances on restraint.
- Cal Newport — Computer Science Department talks and _Deep Questions_ podcast.

**Search queries:**

```text
Linear calm software design philosophy Karri Saarinen
Things 3 Cultured Code design philosophy interview
DHH calm company 37signals it doesn't have to be crazy
John Maeda laws of simplicity design
Tony Fadell Build restraint atomic accountability
Cal Newport deep work attention design constraint
calm productivity software design language
restraint vs delight product design school
```

**Potential skill combo or update:** New skill `calm-software-design-review` (alternative to or paired with `delightful-product-review`). Stack Linear + Cultured Code + 37signals + John Maeda + Steph Ango. Output: an agent that can audit a screen for restraint — "what can be removed," motion budget, surface count, attention-cost — instead of for delight opportunities. For BuildOS specifically this is more on-brand than the delight skill.

### 6. Usability Testing, User Research, And UX Evaluation Methods

**Why it matters:** The `delightful-product-review` and `ai-era-craft-and-quality-moat` combos repeatedly invoke "users" but the index has no source on _how to actually study them_. Nesrine Changuel mentions demotivator interviews and the Buffer email pattern; Jenny Wen mentions internal nightly users; Dylan Field mentions the Blockers team — none of these are methodology. Without Steve Krug's _Don't Make Me Think_ / _Rocket Surgery Made Easy_, Erika Hall's _Just Enough Research_, Tomer Sharon's _Validating Product Ideas_, Jakob Nielsen's heuristics, and the canonical NN/g body of work, the agent cannot help a founder run a usability test, choose between moderated and unmoderated study designs, or interpret a session recording. This is also the critical gap for the "AI-era craft" combo: Dylan says ship fast and get to market; you cannot do that without a usability cadence.

**What to collect or improve:**

- Steve Krug — _Don't Make Me Think_ (heuristics), _Rocket Surgery Made Easy_ (3-user testing).
- Erika Hall — _Just Enough Research_, _Conversational Design_.
- Tomer Sharon — _Validating Product Ideas_, _It's Our Research_.
- Jakob Nielsen / NN/g — 10 usability heuristics, severity scoring, eyetracking studies.
- Jeff Sauro and James Lewis — _Quantifying the User Experience_, SUS, SEQ, PSSUQ.
- Lookback / Maze / UserTesting case studies.
- Behavioral psychology basics: Daniel Kahneman _Thinking, Fast and Slow_, BJ Fogg _Tiny Habits_ (already partially in PRODUCT_STRATEGY).

**Experts and sources to look for:**

- Steve Krug — _Don't Make Me Think_ talks, Rosenfeld Media.
- Erika Hall — Mule Design talks, _A Book Apart_.
- Jakob Nielsen — NN/g newsletter and YouTube channel.
- Jeff Sauro — MeasuringU.com.
- Teresa Torres (cross-link from PRODUCT_STRATEGY) — continuous discovery.
- Tomer Sharon — _Validating Product Ideas_.

**Search queries:**

```text
Steve Krug Rocket Surgery Made Easy 3 user usability test
Erika Hall Just Enough Research methodology
Jakob Nielsen 10 usability heuristics severity
Jeff Sauro SUS SEQ usability metrics MeasuringU
Tomer Sharon Validating Product Ideas
moderated vs unmoderated usability study founder
NN/g eyetracking F pattern reading research
```

**Potential skill combo or update:** New skill `usability-evaluation-and-quick-research`. Stack Steve Krug + Erika Hall + NN/g + Sauro/Lewis + Tomer Sharon. Output: an agent that can recommend a study design for a question, write a moderated test script, score a session against Nielsen's heuristics, and produce SUS/SEQ-grade quantitative output. Strong cross-link with PRODUCT_STRATEGY's `customer-discovery-through-switching-forces`.

### 7. Information Architecture And Interaction Design Fundamentals

**Why it matters:** None of the current sources teach an agent the _fundamentals_ of how a screen should be structured around a task. Don Norman's _Design of Everyday Things_ (affordances, signifiers, mappings, feedback, constraints) is the canonical text and is missing entirely. Alan Cooper's _About Face_ and _The Inmates Are Running the Asylum_ (interaction design, archetypes-not-personas) is missing. Peter Morville on information architecture is missing. This is the layer that decides whether a navigation makes sense at all — before any of Kole Jain's atomic fixes apply. Without it, an agent reviewing a complicated tool (BuildOS, Linear, Notion-class apps) cannot diagnose IA problems; it can only style them better.

**What to collect or improve:**

- Don Norman — _The Design of Everyday Things_, NN/g lectures, affordance/signifier talks.
- Alan Cooper — _About Face_, _The Inmates Are Running the Asylum_, archetypes vs personas.
- Peter Morville — _Information Architecture_, _Search Patterns_.
- Bruce "Tog" Tognazzini — first principles of interaction design.
- Bill Buxton — _Sketching User Experiences_.
- Jesse James Garrett — _The Elements of User Experience_ (the five-plane model).
- Apple HIG and Material Design as canonical platform IA references.

**Experts and sources to look for:**

- Don Norman — Nielsen Norman Group YouTube and HBR essays.
- Alan Cooper — _Cooper Talks_ / Cooper Journal.
- Peter Morville — Semantic Studios.
- Bill Buxton — Microsoft Research talks.
- Jesse James Garrett — _Elements of UX_.

**Search queries:**

```text
Don Norman design of everyday things affordance signifier
Alan Cooper About Face interaction design archetype persona
Peter Morville information architecture search patterns
Bill Buxton sketching user experiences interaction design
Jesse James Garrett elements of user experience five planes
NN/g information architecture navigation taxonomy
Apple Human Interface Guidelines navigation patterns
```

**Potential skill combo or update:** New skill `information-architecture-and-interaction-fundamentals`. Stack Don Norman + Alan Cooper + Peter Morville + Bill Buxton + Jesse James Garrett. Output: an agent that can audit a screen at the IA/IxD layer (task → affordance → signifier → feedback → recovery) before recommending visual fixes. Also the right anchor for `design-to-code-workflow` to keep code generation grounded in task models.

### 8. The "Taste-Driven Toolmaking" Combo Lacks An Agent Contract

**Why it matters:** This is the most under-defined combo in the index. Stacking Ryo Lu + Linus Lee + Steph Ango + Dylan Field produces a beautiful philosophy essay, not a skill — the four sources agree on values (agency, soul, taste, constraint, file-over-app, instrumental-vs-engaged interfaces) but disagree on _what to do on Monday morning_. As the combo currently stands, the agent behavior would be "write something poetic about the tool you are building." That is not a skill. The combo needs either (a) a sharper agent contract — for example, "audit a tool design brief for soul-vs-slop trade-offs" with a checklist drawn from these voices — or (b) absorption into the [Psychology, Agency, And Philosophy index](./PSYCHOLOGY_AGENCY_AND_PHILOSOPHY.md), which is where it cross-links anyway.

**What to collect or improve:**

- A sharp agent-behavior contract: review a product design brief, identify where it falls into "instrumental tool" vs "engaged tool" framing (Linus), where it is "file-over-app" vs "service-over-data" (Steph), where it preserves vs strips agency (Geoffrey Litt), and where it confuses "AI does it for you" with "AI helps you do it" (Ryo).
- More canonical "tools for thought" voices to anchor the combo: Andy Matuschak (working memory, evergreen notes, _How can we develop transformative tools for thought?_), Bret Victor (_Inventing on Principle_, _Magic Ink_), Maggie Appleton (Tools for Thought essays, already in TECHNOLOGY index).
- Concrete craft examples to keep it from going abstract: Tana, Reflect, Roam Research, Granola, Cursor itself.
- A specific cross-link plan with Psychology/Agency rather than a duplicate listing.

**Experts and sources to look for:**

- Andy Matuschak — andymatuschak.org, _How can we develop transformative tools for thought?_
- Bret Victor — worrydream.com, _Inventing on Principle_, _Magic Ink_.
- Maggie Appleton — maggieappleton.com (Tools for Thought).
- Geoffrey Litt — geoffreylitt.com, malleable software talks (already partly in TECHNOLOGY index).
- Steph Ango — Obsidian additional talks beyond the current transcript.
- Linus Lee — additional Notion-era and Thrive-era talks beyond Dialectic.

**Search queries:**

```text
Andy Matuschak tools for thought transformative working memory
Bret Victor inventing on principle magic ink dynamic medium
Maggie Appleton tools for thought essays
Linus Lee instrumental engaged interfaces super agency
Steph Ango Obsidian file over app constraints
Geoffrey Litt malleable software end user programming
soul vs slop AI tool design checklist
```

**Potential skill combo or update:** Either (a) sharpen `taste-driven-toolmaking` into `tool-design-soul-vs-slop-review` with a checklist contract (instrumental/engaged, file-over-app, agency-preserving, taste signals), or (b) absorb it into the Psychology/Agency index and replace the slot here with `ai-ui-slop-detector-and-rewrite` from gap 4 — which is the _operator_ version of the same intuition.

## Source Coverage Matrix

| Capability / Question                                                           | Covered By                                              | Missing Or Thin                                                             | Priority |
| ------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- | -------- |
| Atomic UI fixes (radius, shadow, spacing, icons, feedback, charts)              | Kole Jain (2 videos)                                    | none — already drafted                                                      | low      |
| Operator-grade visual craft (type scale, color systems, density, optical adj.)  | partial via Kole Jain                                   | Refactoring UI (Wathan/Schoger), Erik Kennedy, Josh Comeau                  | high     |
| Diagnose and fix AI-generated "Shadcn slop" UI                                  | Ryo Lu (1 quote)                                        | Soren Iverson critique pattern, Refactoring UI applied to v0/Lovable        | high     |
| Audit a screen for accessibility (WCAG 2.2 AA, keyboard, focus, screen reader)  | nothing                                                 | Heydon Pickering, Sara Soueidan, Adrian Roselli, Léonie Watson, WCAG canon  | high     |
| Audit / build a design system, tokens, component contracts                      | nothing (Inkprint exists internally; not source-backed) | Brad Frost, Nathan Curtis, Una Kravets, Primer/Polaris/Geist case studies   | high     |
| Apply Nesrine's delight grid, 50-40-10, demotivator inversion                   | Nesrine Changuel (deep)                                 | B2B SaaS-specific delight worked examples                                   | medium   |
| Apply _calm software_ / restraint as a counter-school to delight                | Steph Ango (partial)                                    | Linear, Cultured Code, 37signals/DHH, John Maeda, Tony Fadell               | high     |
| Run a usability test, score against heuristics, produce SUS/SEQ                 | nothing                                                 | Steve Krug, Erika Hall, Jakob Nielsen, Sauro & Lewis, Tomer Sharon          | high     |
| Reason about IA / IxD fundamentals (affordance, signifier, archetype, taxonomy) | nothing                                                 | Don Norman, Alan Cooper, Peter Morville, Bill Buxton, Jesse James Garrett   | high     |
| Move from design intent to code without losing taste                            | Ryo Lu (strong), Jenny Wen (strong)                     | Adam Wathan utility-first, Brad Frost AI-augmented design systems, v0 posts | medium   |
| Articulate a "craft is the moat" thesis                                         | Dylan Field, Jenny Wen, Ryo Lu                          | none — already over-served                                                  | low      |
| Audit a tool for soul, agency, instrumental-vs-engaged                          | Linus Lee, Steph Ango, Geoffrey Litt (cross-link)       | Andy Matuschak, Bret Victor, Maggie Appleton additional sources             | medium   |
| Onboarding / first-run / empty-state UX                                         | nothing in this index                                   | Sam Hulick (UserOnboard), Wes O'Haire, Aji Sharma teardowns                 | medium   |
| Mobile-specific UX patterns and constraints                                     | brief mentions in Kole Jain                             | Luke Wroblewski, Apple HIG, Material guidelines                             | medium   |
| Motion design, micro-interactions as a pattern language                         | brief mentions in Kole Jain                             | Val Head, Pasquale D'Silva, Rachel Nabors, Apple motion guidelines          | medium   |
| Quantitative UX metrics (SUS, SEQ, CSAT, task success rate)                     | nothing                                                 | Sauro & Lewis, NN/g, MeasuringU                                             | medium   |
| Time-to-value as a UX discipline (blockers, magic moment, first-run)            | Dylan Field (anecdote)                                  | Casey Winters cross-link, Sam Hulick onboarding teardowns, perf canon       | medium   |
| Designing UI for AI features (chat, generative UI, agent surfaces)              | Jenny Wen (strong), Ryo Lu (strong)                     | Vercel v0 design team posts, Maggie Appleton, Generative UI patterns        | medium   |
| Inclusive content and copy (language, edge cases, bereavement, mental health)   | Nesrine Changuel (one example)                          | Sara Wachter-Boettcher _Technically Wrong_, Kat Holmes _Mismatch_           | medium   |
| Information density / B2B SaaS dashboard UX patterns                            | nothing                                                 | Stripe Dashboard talks, Linear UX writing, Atlassian / GitHub Primer        | medium   |

## Suggested New Directions

| Proposed Direction                                      | Sources To Add                                                                                 | What It Should Enable                                                                                                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visual-craft-fundamentals`                             | Adam Wathan + Steve Schoger (_Refactoring UI_), Erik Kennedy, Josh Comeau, Sara Soueidan       | Take a Kole-level audit deeper: type scale, color/contrast systems, optical adjustments, density tuning, and dark-mode discipline.                             |
| `accessibility-and-inclusive-ui-review`                 | Heydon Pickering, Sara Soueidan, Adrian Roselli, Léonie Watson, WCAG 2.2 AA, Kat Holmes        | Audit a screen for keyboard, focus, contrast, screen-reader semantics, motion sensitivity, and inclusive content. Powers the existing `accessibility-auditor`. |
| `design-system-architecture-review`                     | Brad Frost, Nathan Curtis, Una Kravets, Adam Wathan, Radix/shadcn philosophy                   | Audit a token system, identify naming/contract drift, recommend a contribution model, flag missing primitives. Direct fit for Inkprint.                        |
| `ai-ui-slop-detector-and-rewrite`                       | _Refactoring UI_, Soren Iverson, Ryo Lu, Adam Wathan, shadcn theming docs                      | Review v0/Lovable/Cursor-generated UI, name the slop pattern, rewrite typography/color/density, propose a theming layer.                                       |
| `calm-software-design-review`                           | Linear, Cultured Code, 37signals/DHH, John Maeda, Tony Fadell, Steph Ango                      | Audit a screen for restraint — what to remove, motion budget, surface count, attention cost. Specifically on-brand for BuildOS.                                |
| `usability-evaluation-and-quick-research`               | Steve Krug, Erika Hall, Jakob Nielsen, Sauro & Lewis, Tomer Sharon, Teresa Torres (cross-link) | Recommend a study design, write a moderated test script, score a session against Nielsen's heuristics, produce SUS/SEQ output.                                 |
| `information-architecture-and-interaction-fundamentals` | Don Norman, Alan Cooper, Peter Morville, Bill Buxton, Jesse James Garrett                      | Audit a screen at the IA/IxD layer (task → affordance → signifier → feedback → recovery) before any visual fix.                                                |
| `taste-driven-toolmaking` (sharpen)                     | Andy Matuschak, Bret Victor, Maggie Appleton on top of Linus / Steph / Ryo / Dylan             | Audit a tool design brief for instrumental-vs-engaged, file-over-app, agency-preserving, and AI-helps-you-do-it framing.                                       |
| `delightful-product-review` (no new sources)            | already-stacked Nesrine + Dylan + Kole Jain                                                    | Draft today; add B2B-SaaS worked examples post-draft.                                                                                                          |
| `ui-ux-quality-review` (extend)                         | add Refactoring UI canon + small accessibility wedge + Inkprint cross-link                     | Keep the core Kole Jain checklist; add a "next-level" section for type/color/density and a hand-off to `accessibility-and-inclusive-ui-review`.                |

## Recommended Next Research Pull

Start with **Refactoring UI canon (Adam Wathan + Steve Schoger) + accessibility canon (Heydon Pickering + Sara Soueidan) + a calm-software pull (Linear blog + Cultured Code + 37signals)**.

Reason: these three pulls fix the three biggest weaknesses in the index in one pass. Refactoring UI gives the operator counterpart to the Dylan/Jenny/Ryo "craft is the moat" thesis, which is the largest CEO-vs-operator imbalance in the source stack and the gap that prevents `ai-era-craft-and-quality-moat` from becoming a real skill. Accessibility canon fixes a category that is currently a hard "do not use this skill for that" disclaimer in the existing draft and unlocks the BuildOS `accessibility-auditor` agent. Calm-software canon fixes the most BuildOS-specific weakness — the index would otherwise produce skills that argue _against_ BuildOS's anti-feed positioning.

Each of these is well-served on YouTube, podcasts, and long-form writing, so a single research session can produce six to ten analyses.

Target first sources:

1. Adam Wathan and Steve Schoger — _Refactoring UI_ book + companion talks (Tailwind Connect, Adam's YouTube live redesigns).
2. Erik Kennedy — Learn UI Design lessons and "7 Rules" essays.
3. Heydon Pickering — _Inclusive Components_ talks and Smashing Magazine articles.
4. Sara Soueidan — focus management, accessible patterns workshops.
5. Linear — calm-software essays from the Linear blog.
6. Cultured Code / Things 3 — design philosophy interviews.
7. DHH and Jason Fried — _It Doesn't Have to Be Crazy at Work_ talks and 37signals podcast on calm operations.
8. John Maeda — _Laws of Simplicity_ talk + _Design in Tech_ report.

After this pull, second priority is **design-systems canon (Brad Frost + Nathan Curtis + Una Kravets)** — to unlock `design-system-architecture-review` and back the existing Inkprint system. Third priority is **usability/IA canon (Steve Krug + Erika Hall + Don Norman + Alan Cooper)** — the foundational layer that makes every other skill in this index trustworthy.

## Draft Readiness

`ready-to-draft` for `delightful-product-review`. The Nesrine Changuel analysis alone is deep enough to draft a defensible skill today, and Dylan and Kole Jain provide complementary craft and atomic-fix layers. The first draft does not need to wait for any new research pull.

`ready-to-draft` for an **extended** `ui-ux-quality-review`. The current draft can be extended with Refactoring UI cross-references after gap 1 is filled, but the existing version is already shippable; treat the extension as a v2.

`needs-research` for `ai-era-craft-and-quality-moat` and `design-to-code-workflow`. Both combos are over-anchored on CEO/founder thesis material and under-anchored on operator how-to content. They should not be drafted until at least the Refactoring UI canon pull lands; otherwise both will collapse into "shipped fast, made it pretty, vibes."

`needs-synthesis` for `taste-driven-toolmaking` even after research. The combo's core problem is not source coverage — it is that the agent contract is undefined. Either sharpen it into `tool-design-soul-vs-slop-review` or absorb it into the Psychology/Agency index.

`needs-research` for the proposed new combos: `accessibility-and-inclusive-ui-review`, `design-system-architecture-review`, `calm-software-design-review`, `usability-evaluation-and-quick-research`, `information-architecture-and-interaction-fundamentals`, and `ai-ui-slop-detector-and-rewrite`. Each is a real gap, but the index does not yet have the source material to back any of them. Start with the recommended pull above.

`already-drafted` for `ui-ux-quality-review` v1. Continue to ship and iterate; do not block on extension work.
