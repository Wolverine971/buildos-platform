<!-- docs/research/youtube-library/skill-combo-indexes/PRODUCT_STRATEGY_GAP_AUDIT.md -->

# Product Strategy Gap Audit

## Purpose

This audit reviews the [Product Strategy skill combos index](./PRODUCT_STRATEGY.md) before drafting public skill files for `customer-discovery-through-switching-forces`, `right-mvp-and-offer-design`, and `activation-and-resurrection-design`. The aim is to surface where the current source stack can already carry a skill draft, where it is over-anchored on a single voice, and what canonical product-strategy sources should be pulled in next so the resulting skills are not just an "Ash Maurya-and-friends" rewrite.

## Current Strengths

The current source stack is unusually strong on **two specific layers** of product strategy:

- **Demand discovery from past behavior, not opinion.** The Ash Maurya cluster is one of the deepest single-voice transcripts collections in the library. It covers the [one customer-interview question](../../../marketing/growth/research/youtube-transcripts/2026-04-28-ash-maurya-1000-interviews-one-question-ANALYSIS.md), [persona-replacement via switching segmentation](../../../marketing/growth/research/youtube-transcripts/2026-04-28-ash-maurya-personas-fail-do-this-instead-ANALYSIS.md), [switching stories with hiring and firing criteria](../../../marketing/growth/research/youtube-transcripts/2026-04-28-ash-maurya-make-customers-switch-ANALYSIS.md), [why "talking to users" misuses interview time](../../../marketing/growth/research/youtube-transcripts/2026-04-28-ash-maurya-talking-to-users-bad-ANALYSIS.md), [the offer-not-product diagnosis](../../../marketing/growth/research/youtube-transcripts/2026-04-28-ash-maurya-not-a-product-problem-ANALYSIS.md), and [AI-assisted pattern-matching across switching stories](../../../marketing/growth/research/youtube-transcripts/2026-04-28-ash-maurya-ai-identify-right-customers-ANALYSIS.md). This is enough to draft a defensible `customer-discovery-through-switching-forces` skill today.

- **Stalled-growth diagnosis.** [Jason Cohen on Lenny's Podcast](../../../marketing/growth/research/youtube-transcripts/2026-04-27-jason-cohen-wp-engine-2-unicorns-advice-ANALYSIS.md) provides a strictly-ordered diagnostic (logo churn → pricing/positioning → NRR → channel saturation → "do you need to grow"), with concrete math (`max customers = new/mo ÷ churn rate`), pricing reframes (cost-cutting vs. growth-capture), and contrarian moves (rewriting the cancellation question, randomizing dropdowns). This is already drafted as `growth-diagnostics-for-stalled-products`.

- **Offer design and MVP cocktail.** [Mafia Offer](../../../marketing/growth/research/youtube-transcripts/2026-04-28-ash-maurya-mafia-offer-ANALYSIS.md) and [the right MVP](../../../marketing/growth/research/youtube-transcripts/2026-04-28-ash-maurya-build-the-right-mvp-ANALYSIS.md) give the four-act pitch and the Kano-based "one delighter + one performance axis + Wizard-of-Oz the must-haves" recipe. [Nesrine Changuel's delight grid](../../../marketing/growth/research/youtube-transcripts/2026-04-28-nesrine-changuel-4-step-delightful-products-framework-ANALYSIS.md) layers in motivators, the 50-40-10 roadmap rule, and inclusion guardrails.

- **AI-era product growth.** [Lovable / Elena Verna](../../../marketing/growth/research/youtube-transcripts/2026-04-28-lovable-200m-arr-ai-growth-playbook-2026-ANALYSIS.md) covers MLP vs MVP, "wow moment vs aha moment," and the "60–70% of the old playbook is dead" thesis. [Albert Cheng](../../../marketing/growth/research/youtube-transcripts/2026-04-28-albert-cheng-hidden-growth-opportunities-ANALYSIS.md) gives the resurrection-as-first-class-persona stat, the Grammarly reverse-trial-in-real-time pattern, and the Chess.com "reframe failure as positivity" UX move.

The main weakness: the index is **over-anchored on Ash Maurya for strategy** (six of fourteen analyses are his), thin on **canonical strategy and positioning sources** (no April Dunford, no Geoffrey Moore beyond a name-check, no Bob Moesta canonical JTBD), thin on **roadmap and prioritization frameworks** (no Marty Cagan, no Teresa Torres, no Shape Up), thin on **pricing depth** (no Madhavan Ramanujam, no direct Patrick Campbell), and missing **strategy doc / vision authoring** entirely.

## Highest-Priority Gaps

### 1. Canonical JTBD And Outcome-Driven Innovation

**Why it matters:** The "switching forces" combo currently rests almost entirely on Ash Maurya's interpretation of the four forces. Ash points the pen at the right page, but he is one popularizer in a much older lineage. An agent helping a founder run interviews, design segments, or write a switch-story protocol should reference the **primary** JTBD voices, not just one downstream interpreter. Without Bob Moesta's switch interview canon and Tony Ulwick's outcome-driven innovation, the skill cannot answer questions like "what do I do when there is no past purchase to anchor on?" or "how do I turn forces into outcome statements I can prioritize?"

**What to collect or improve:**

- Bob Moesta's canonical switch interview workflow (the timeline interview, the "first thought" question, the "anxieties" map).
- Clayton Christensen's original JTBD framing for product strategy.
- Tony Ulwick / Strategyn outcome-driven innovation: how to convert forces into desired-outcome statements (statements like "minimize the time it takes to \_\_\_ ").
- Examples of switch stories at different price points (B2C, prosumer, enterprise) so the skill does not assume a single segment.
- A workflow for what to do when there is no past purchase: pre-product, brand-new category, pivots.

**Experts and sources to look for:**

- Bob Moesta — _Demand-Side Sales 101_, _The Re-Wired Group_, _The JTBD Toolkit Podcast_.
- Tony Ulwick — _What Customers Want_, _Jobs to Be Done_ (Strategyn).
- Clayton Christensen — _Competing Against Luck_, "Milkshake" HBS interview.
- Mike Maples / Floodgate "Pattern Breakers" framing of inflections vs. insights.
- Teresa Torres — _Continuous Discovery Habits_ (opportunity solution trees as a JTBD-compatible artifact).

**Search queries:**

```text
Bob Moesta switch interview timeline first thought anxieties
Bob Moesta demand side sales 101 jobs to be done podcast
Tony Ulwick outcome driven innovation desired outcome statement
Clayton Christensen milkshake jobs to be done HBS
Teresa Torres opportunity solution tree continuous discovery
Mike Maples pattern breakers inflection insight startup
JTBD switch interview script template founder
```

**Potential skill combo or update:** Update `customer-discovery-through-switching-forces` to stack Ash Maurya + Bob Moesta + Tony Ulwick + Teresa Torres. Ash provides the question and the forces; Moesta provides the timeline interview and pre-purchase anxieties; Ulwick provides outcome-statement output; Torres provides the artifact (opportunity solution tree) the founder ships out of the interview.

### 2. Positioning As A Distinct Discipline

**Why it matters:** The index uses "positioning" inside the Mafia Offer and the Kano cocktail, but treats it as a side-effect of customer interviews and feature design. Positioning is its own craft: choosing the competitive frame of reference, naming the alternative, segmenting the market, and authoring positioning docs that survive a roadmap pivot. An agent that helps a founder pick which alternative to name, which buyer to write for, and which trade-offs to lean into needs **April Dunford-grade source material**, not Ash-derived positioning. Right now, BuildOS-style "thinking environment for people making complex things" positioning work has no skill that can validate or critique a positioning statement.

**What to collect or improve:**

- April Dunford's _Obviously Awesome_ and _Sales Pitch_ frameworks (positioning components, sales-pitch architecture, two-step "perfect-fit customer" filter).
- Geoffrey Moore's chasm and bowling-alley framing — Jason Cohen calls _Crossing the Chasm_ out by name, but the actual book is not in the source stack.
- Andy Raskin's strategic narrative pattern (old game vs. new game, named villain).
- Examples of repositioning under pressure (Buffer staying SMB, Linear vs. Jira/Asana, Superhuman positioning premium email).
- A failure-mode catalog: positioning statements that are too generic, too feature-led, too internal, or unable to survive a pricing change.

**Experts and sources to look for:**

- April Dunford — [_Obviously Awesome_ talk](https://www.youtube.com/results?search_query=april+dunford+obviously+awesome) and _Sales Pitch_ talks at SaaStr / First Round.
- Andy Raskin — _The Greatest Sales Deck I've Ever Seen_, _strategic narrative_ posts.
- Geoffrey Moore — _Crossing the Chasm_, _Inside the Tornado_.
- Wynter / Peep Laja — message testing posts and CXL content on positioning.
- Kyle Poyar (OpenView) — segment-driven positioning for PLG.

**Search queries:**

```text
April Dunford obviously awesome positioning components SaaStr
April Dunford sales pitch perfect fit customer
Andy Raskin strategic narrative old game new game
Geoffrey Moore crossing the chasm bowling alley B2B
Peep Laja Wynter positioning message testing B2B
Kyle Poyar OpenView product led positioning
positioning statement template B2B SaaS founder
```

**Potential skill combo or update:** New skill `positioning-for-crowded-categories`. Stack April Dunford + Andy Raskin + Geoffrey Moore + Ash's "name the villain" act. Output: an agent that can audit a landing page, founder pitch, or sales deck against a positioning checklist (frame of reference, alternatives, unique value, perfect-fit customer, trade-offs).

### 3. Roadmap, Discovery, And Prioritization Frameworks

**Why it matters:** The index treats roadmap as a downstream of interviews + offer + Kano. That is fine for a one-week MVP exercise, but every founder eventually has to make hundreds of "do we build this or not" calls, and the index has no canon for that. Without Marty Cagan (discovery vs. delivery, product trio, "outcome teams"), Teresa Torres (opportunity solution trees, weekly continuous discovery), or 37signals' Shape Up, an agent cannot help a founder structure a roadmap, run a weekly discovery cadence, or push back on feature requests.

**What to collect or improve:**

- Marty Cagan's _Inspired_, _Empowered_, and _Transformed_: product discovery, four risks (value, usability, feasibility, viability), product trio, outcome teams, vision-led roadmaps.
- Teresa Torres on continuous discovery: weekly customer interviews, opportunity solution trees, evidence-driven prioritization.
- 37signals Shape Up: bets, six-week cycles, hill charts, appetite vs. estimate.
- RICE / ICE / WSJF prioritization mechanics.
- Lenny's "North Star Metric" archive (Sean Ellis lineage).
- Ben Foster / Rajesh Nerlikar's _Build What Matters_ on outcome-driven roadmaps.

**Experts and sources to look for:**

- Marty Cagan — SVPG essays, talks on Lenny's Podcast and Mind the Product.
- Teresa Torres — _Continuous Discovery Habits_ podcast and book talks.
- Ryan Singer / 37signals — _Shape Up_ book and talks.
- Sean Ellis — _Hacking Growth_ and the original PMF survey ("how would you feel if you could no longer use this product").
- John Cutler — product operating system threads, north-star tree.

**Search queries:**

```text
Marty Cagan product discovery four risks empowered teams
Teresa Torres continuous discovery opportunity solution tree
Ryan Singer Shape Up bet appetite hill chart 37signals
Sean Ellis north star metric PMF survey
John Cutler product operating model North Star tree
RICE prioritization framework SaaS product
weekly customer discovery cadence founder PM
```

**Potential skill combo or update:** New skill `product-discovery-and-prioritization-cadence`. Stack Marty Cagan + Teresa Torres + Ryan Singer + Ash Maurya + Sean Ellis. Output: an agent that can help a founder set a weekly discovery cadence, write opportunity statements, score bets, and produce a hill-chart-style status without inventing a custom framework.

### 4. Strategy Doc And Product Vision Authoring

**Why it matters:** None of the current sources teach an agent how to write a product strategy doc, a vision narrative, or a near/far roadmap. This is the artifact a founder actually needs when fundraising, hiring, aligning the team, or running an offsite. The Mafia Offer is a sales pitch, not a strategy doc. The Kano cocktail is a feature decision, not a 12-month vision. Without source material from Will Lawrence, Ravi Mehta, Stripe / Bezos memo style, or Marty Cagan on vision, the skills produced from this index will all be tactical and short-horizon.

**What to collect or improve:**

- Will Lawrence on writing strategy docs at Stripe (Lenny's Podcast / Twitter threads).
- Ravi Mehta on the product strategy stack (vision, strategy, roadmap, OKRs).
- Bezos six-page narrative memo style for product strategy.
- Marty Cagan on product vision (the 10-year story, the "transformed" view).
- Lenny / Reforge on writing one-pager strategy and bet docs.
- Examples of strong public strategy docs (Stripe Atlas, Notion, Linear, Figma, Loom).

**Experts and sources to look for:**

- Will Lawrence — Stripe strategy doc method.
- Ravi Mehta — _Product Strategy Stack_ (medium / talks).
- Marty Cagan — product vision essays at SVPG.
- Lenny Rachitsky — strategy doc archive on lennysnewsletter.com.
- Shreyas Doshi — high-quality strategy thinking and "LNO" framework.

**Search queries:**

```text
Will Lawrence Stripe product strategy document Lenny podcast
Ravi Mehta product strategy stack vision OKR
Bezos six pager narrative memo product strategy
Marty Cagan product vision SVPG essay
Shreyas Doshi product strategy LNO framework
how to write a product strategy doc startup founder
```

**Potential skill combo or update:** New skill `product-strategy-doc-author`. Stack Will Lawrence + Ravi Mehta + Marty Cagan + Shreyas Doshi + Bezos memo style. Output: an agent that can take a brain dump from a founder and turn it into a structured strategy doc with vision, frame of reference, bets, near-roadmap, and metrics.

### 5. Pricing And Packaging Depth

**Why it matters:** Jason Cohen's "12x raise" anecdote and "pricing IS positioning IS strategy" line are gold, but the index has no pricing-only source. An agent helping a founder design tiers, choose seat-vs-usage-vs-outcome pricing, run a Van Westendorp study, or restructure a free tier needs Madhavan Ramanujam-grade material. This gap is especially visible for `right-mvp-and-offer-design`, where the offer is half-built without a pricing recipe.

**What to collect or improve:**

- Madhavan Ramanujam's _Monetizing Innovation_ — willingness-to-pay early, configure-to-value, four monetization-failure archetypes.
- Patrick Campbell / OpenView and ProfitWell pricing studies (per-seat vs. usage, value metric selection, pricing pages that convert).
- Kyle Poyar on PLG monetization and reverse trials.
- Kevin Hale (YC) on pricing for early-stage startups.
- Empirical case studies: Notion's per-seat vs. AI add-ons, Linear's pricing simplicity, Superhuman's premium pricing, Cursor's usage tier.

**Experts and sources to look for:**

- Madhavan Ramanujam — Simon-Kucher, _Monetizing Innovation_ talks.
- Patrick Campbell — _ProfitWell Recur_ archive, OpenView pricing benchmarks.
- Kyle Poyar — OpenView and Substack on PLG pricing.
- Kevin Hale — YC pricing talks on YouTube.
- Hiten Shah — pricing teardowns.

**Search queries:**

```text
Madhavan Ramanujam Monetizing Innovation willingness to pay
Patrick Campbell ProfitWell SaaS pricing study OpenView
Kyle Poyar product led growth pricing reverse trial
Kevin Hale YC pricing startup school
SaaS value metric selection seat usage outcome pricing
Notion AI pricing case study per seat add-on
```

**Potential skill combo or update:** New skill `pricing-and-packaging-design`. Stack Madhavan Ramanujam + Patrick Campbell + Kyle Poyar + Jason Cohen + Ash Maurya (Mafia Offer Act 4). Output: an agent that can review a pricing page or proposed tier and flag value-metric mismatch, undercharging, free-tier cannibalization, and missing willingness-to-pay evidence.

### 6. Activation And Aha-Moment Mechanics

**Why it matters:** "Activation and resurrection design" is one of the listed combos, but the source coverage skews to _philosophy_ (Lovable's wow moment, Albert's resurrected-user persona) over _mechanics_ (how to define an activation event, how to instrument it, how to design a multi-step activation funnel for a B2C product, how to convert a freemium signup to first-week retention). This combo is also where the AI-era playbook diverges most from the older one — and the index does not yet have a clear "old vs. new activation" map.

**What to collect or improve:**

- Casey Winters on activation, retention, and the Pinterest / Eventbrite playbook.
- Lenny Rachitsky's archive on activation: how to define the activation event, "magic moment" interviews, the activation/retention loop.
- Sean Ellis / Reforge on the PMF survey and habit moment.
- Andrew Chen on growth loops and activation under demand-generation collapse.
- Specific AI-product activation case studies: Cursor, Perplexity, Lovable, Granola.

**Experts and sources to look for:**

- Casey Winters — Lenny's Podcast appearances, Reforge content.
- Lenny Rachitsky — activation and retention archive.
- Sean Ellis — _Hacking Growth_, North Star Playbook.
- Andrew Chen — _The Cold Start Problem_ and a16z essays.
- Elena Verna — Lovable + earlier writing for SurveyMonkey, Miro, Netlify.

**Search queries:**

```text
Casey Winters activation retention Pinterest Eventbrite Reforge
Lenny activation magic moment definition retention curve
Sean Ellis North Star activation event habit moment
Andrew Chen cold start problem activation growth loop
Elena Verna activation product led growth wow moment
Cursor Perplexity Lovable activation case study
PMF survey 40 percent must have Sean Ellis
```

**Potential skill combo or update:** Sharpen `activation-and-resurrection-design`. Stack Albert Cheng + Casey Winters + Sean Ellis + Elena Verna + Andrew Chen. Output: an agent that can take a funnel snapshot and recommend (1) the activation event, (2) the magic-moment redesign, (3) the resurrection segment, and (4) the metric that tells you whether activation is improving.

### 7. Strategy Under Uncertainty And Category Creation

**Why it matters:** None of the current sources teach an agent how to think when the category itself is moving (which is exactly BuildOS's situation in the LLM-disrupted productivity space). The index has Ash on commodity offers and Lovable on shipping velocity, but no source on category creation, peacetime vs. wartime strategy, or how to write a "we are creating a new category" narrative. This is the gap that turns `right-mvp-and-offer-design` into a tactical skill rather than a strategic one.

**What to collect or improve:**

- _Play Bigger_ (Al Ramadan, Dave Peterson, Christopher Lochhead) on category design.
- Ben Horowitz on wartime vs. peacetime CEO and strategy.
- Mike Maples on inflections, jolts, and "pattern breakers."
- Paul Graham essays on default-alive, do things that don't scale, wave-vs-boat moves.
- Examples of category creation in adjacent spaces: Notion (workspaces), Linear (issue tracking), Superhuman (premium email), Cursor (AI editor).

**Experts and sources to look for:**

- Christopher Lochhead — _Play Bigger_, _Follow Your Different_ podcast.
- Ben Horowitz — _The Hard Thing About Hard Things_, a16z talks.
- Mike Maples — _Pattern Breakers_ book and Floodgate talks.
- Paul Graham — essays at paulgraham.com.
- Reid Hoffman — _Blitzscaling_ (use as a contrarian frame, not gospel).

**Search queries:**

```text
Play Bigger category design Christopher Lochhead Al Ramadan
Mike Maples pattern breakers inflection startup
Ben Horowitz wartime peacetime CEO a16z
Paul Graham default alive do things that don't scale
category creation playbook software founder
Cursor Linear Superhuman category design case study
```

**Potential skill combo or update:** New skill `category-and-strategic-narrative`. Stack Play Bigger + Andy Raskin + Mike Maples + Ben Horowitz + Ash Maurya's Mafia Offer Act 1. Output: an agent that can help a founder decide whether to compete inside an existing category, reposition into an adjacent one, or design a new one — and write the corresponding narrative.

### 8. Switching-Story Quantification And Pattern Synthesis

**Why it matters:** Ash Maurya's switching-story approach is qualitative. He admits "20–30 hours to properly analyze 10 interviews." The index has [Ash on AI-assisted analysis](../../../marketing/growth/research/youtube-transcripts/2026-04-28-ash-maurya-ai-identify-right-customers-ANALYSIS.md), but no source on the quantitative side: how to convert a stack of switch interviews into a segmentation, how to build a buyer-spec scorecard, how to triangulate qualitative interviews with cohort retention, and how to know when you've talked to enough customers. This is the gap between "we have insights" and "we have a strategy we can defend in a board meeting."

**What to collect or improve:**

- Tony Ulwick on outcome statement scoring and importance/satisfaction grids.
- Bob Moesta on triangulating switch stories with revenue data.
- Pete Koomen / Casey Winters on cohort retention as a strategic lens.
- Dan Olsen's _Lean Product Playbook_ on importance × satisfaction.
- Kevin Indig on technical SEO and lifecycle data triangulation as a sanity check on qualitative claims.

**Experts and sources to look for:**

- Tony Ulwick — Strategyn outcome scoring methodology.
- Dan Olsen — _Lean Product Playbook_.
- Pete Koomen — a16z growth essays.
- Casey Winters — cohort retention curves and survival analysis.
- Reforge — quantitative discovery tactics.

**Search queries:**

```text
Tony Ulwick outcome statement importance satisfaction matrix
Dan Olsen lean product playbook importance satisfaction
Casey Winters cohort retention curve survival analysis
Pete Koomen a16z growth retention triangulate qualitative
Reforge quantitative product discovery cohort
how many customer interviews enough founder discovery
```

**Potential skill combo or update:** Update `customer-discovery-through-switching-forces` with a Phase 2 step on synthesis: "after 10 interviews, score outcome statements, build importance/satisfaction grid, triangulate against retention cohorts." Without this, the skill ends at "you have insights" instead of "you have a defensible bet."

## Source Coverage Matrix

| Capability / Question                                               | Covered By                              | Missing Or Thin                                                     | Priority |
| ------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------- | -------- |
| Run behavior-anchored interviews using switching forces             | Ash Maurya (6 videos)                   | Bob Moesta canonical switch interview, pre-purchase anxiety map     | high     |
| Replace personas with switching-trigger segmentation                | Ash Maurya (Personas Fail)              | Tony Ulwick outcome scoring, importance/satisfaction grids          | high     |
| Diagnose stalled growth in order (churn → pricing → NRR → channels) | Jason Cohen                             | none — already drafted                                              | low      |
| Design four-act sales pitch / Mafia Offer                           | Ash Maurya                              | April Dunford sales pitch, Andy Raskin strategic narrative          | high     |
| Apply Kano model to MVP                                             | Ash Maurya, Nesrine Changuel            | Dan Olsen's lean product playbook (importance/satisfaction)         | medium   |
| Write a product positioning statement                               | side-effect of Ash + Nesrine            | April Dunford components, frame-of-reference, perfect-fit customer  | high     |
| Pick a frame of reference / category to compete in                  | brief mentions only                     | Geoffrey Moore, Play Bigger, Mike Maples pattern breakers           | high     |
| Author a product strategy doc / vision narrative                    | nothing                                 | Will Lawrence, Ravi Mehta, Marty Cagan vision, Bezos memo           | high     |
| Run weekly continuous discovery / opportunity solution tree         | nothing                                 | Teresa Torres, Marty Cagan, Reforge                                 | high     |
| Choose pricing model (seat / usage / outcome) and price level       | Jason Cohen (one anecdote)              | Madhavan Ramanujam, Patrick Campbell, Kyle Poyar                    | high     |
| Define activation event and magic moment                            | Albert Cheng, Lovable                   | Casey Winters, Sean Ellis PMF survey, Andrew Chen                   | high     |
| Resurrect dormant users as a first-class persona                    | Albert Cheng (strong)                   | sequence design + lifecycle messaging examples                      | medium   |
| Free vs. trial vs. reverse-trial decision                           | Albert Cheng, Lovable, Ash Maurya       | Kyle Poyar PLG playbook                                             | medium   |
| Translate switching-story trade-offs into delight grid features     | Ash Maurya + Nesrine Changuel           | concrete worked examples in B2B SaaS                                | low      |
| Roadmap balance ratio (functionality vs. delight vs. surface)       | Nesrine Changuel (50-40-10)             | RICE / Shape Up / WSJF alternatives                                 | medium   |
| Decide between optimization and innovation in growth                | Albert Cheng (explore/exploit), Lovable | none — already strong                                               | low      |
| Operate in a moving category / write a category-creation narrative  | nothing                                 | Play Bigger, Andy Raskin, Mike Maples                               | high     |
| Navigate "do we even need to grow" / lifestyle vs. venture          | Jason Cohen (Step 5)                    | DHH / 37signals counter-narrative, Tyler Tringas (calm company)     | low      |
| Quantify qualitative interviews into a defensible strategy          | partial via Ash AI video                | Ulwick scoring, Olsen importance/satisfaction, cohort triangulation | high     |
| Time-back productization (input → outcome shift)                    | Alpha School                            | DHH "calm company" framing, Linear "calm software" framing          | low      |

## Suggested New Directions

| Proposed Direction                                     | Sources To Add                                                             | What It Should Enable                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `positioning-for-crowded-categories`                   | April Dunford, Andy Raskin, Geoffrey Moore, Peep Laja                      | Audit a landing page or sales deck against a positioning checklist (frame of reference, alternative, value, perfect-fit, trade-offs). |
| `product-strategy-doc-author`                          | Will Lawrence, Ravi Mehta, Marty Cagan, Shreyas Doshi, Bezos memo style    | Convert a founder brain dump into a structured strategy doc with vision, bets, near-roadmap, and metrics.                             |
| `product-discovery-and-prioritization-cadence`         | Marty Cagan, Teresa Torres, Ryan Singer, Sean Ellis, John Cutler           | Set a weekly discovery cadence, write opportunity statements, score bets, and produce a hill-chart-style status.                      |
| `pricing-and-packaging-design`                         | Madhavan Ramanujam, Patrick Campbell, Kyle Poyar, Jason Cohen, Kevin Hale  | Review a pricing page for value-metric mismatch, undercharging, free-tier cannibalization, and missing WTP evidence.                  |
| `category-and-strategic-narrative`                     | Christopher Lochhead, Andy Raskin, Mike Maples, Ben Horowitz               | Decide whether to compete inside a category, reposition adjacent, or create a new category — and write the narrative.                 |
| `customer-discovery-through-switching-forces` (update) | Bob Moesta, Tony Ulwick, Teresa Torres added on top of Ash cluster         | End-to-end skill: timeline switch interview → forces → outcome statements → opportunity solution tree → defensible segmentation.      |
| `activation-and-resurrection-design` (sharpen)         | Casey Winters, Sean Ellis, Elena Verna, Andrew Chen on top of Albert Cheng | Recommend activation event, magic-moment redesign, resurrection segment, and the activation metric to instrument.                     |

## Recommended Next Research Pull

Start with **canonical JTBD (Bob Moesta) + April Dunford positioning**.

Reason: these two pulls fix the single biggest weakness in the index — that strategy and discovery rest on one popularizer (Ash Maurya). Adding Bob Moesta gives the switch-interview skill a primary-source backbone instead of a secondary interpretation, and it unlocks the synthesis step (importance/satisfaction scoring) that turns interviews into a defensible bet. Adding April Dunford unlocks a `positioning-for-crowded-categories` skill that can be drafted from a single canonical voice rather than reverse-engineered from Mafia Offer + delight grid, and it directly improves the BuildOS landing-page audit work the team already wants to do.

Both are also unusually well-served on YouTube and podcasts, so a single research session can produce four to six analyses.

Target first sources:

1. Bob Moesta — _The Re-Wired Group_ talk on switch interviews ([find on YouTube](https://www.youtube.com/results?search_query=bob+moesta+switch+interview)) and his appearance on _The JTBD Toolkit Podcast_.
2. Bob Moesta — _Demand-Side Sales 101_ book talk or summary podcast.
3. April Dunford — _Obviously Awesome_ talk at SaaStr or Business of Software.
4. April Dunford — _Sales Pitch_ talk on Lenny's Podcast or First Round.
5. Tony Ulwick — Strategyn outcome-driven innovation overview talk.

After this pull, second priority is **Marty Cagan + Teresa Torres** (to unlock `product-discovery-and-prioritization-cadence`) and third is **Madhavan Ramanujam + Kyle Poyar** (to unlock `pricing-and-packaging-design`).

## Draft Readiness

`draft-after-one-source` for `customer-discovery-through-switching-forces` and `activation-and-resurrection-design`. The Ash and Albert clusters are deep enough to draft today, but a single Bob Moesta pull (for switch interviews) and a single Casey Winters or Sean Ellis pull (for activation event definition) will make both skills meaningfully more defensible.

`needs-research` for the proposed new combos: `positioning-for-crowded-categories`, `product-strategy-doc-author`, `product-discovery-and-prioritization-cadence`, `pricing-and-packaging-design`, and `category-and-strategic-narrative`. Each of these is a real gap, but the index does not yet have the source material to back any of them.

`already-drafted` for `growth-diagnostics-for-stalled-products`. Jason Cohen's framework is strong enough on its own; the next move there is publishing rather than auditing.

`internal-only` for `time-back-productization`. The Alpha School analysis is rich but BuildOS-specific; it does not need expansion into a public skill until other gaps are closed.
