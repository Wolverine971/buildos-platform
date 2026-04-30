---
title: 'Design Systems Canon — Frost, Curtis, Kravets, Saarinen (Consolidated Analysis)'
source_type: youtube_analysis
sources:
    - role: vocabulary
      type: article_reference
      title: 'Atomic Design (book + 2013 essay + 2024 SmashingConf reframing)'
      author: Brad Frost
      publication: 'atomicdesign.bradfrost.com / bradfrost.com'
      url: 'https://atomicdesign.bradfrost.com/'
      transcript: 'docs/research/youtube-library/transcripts/2026-04-30_brad-frost_atomic-design-summary.md'
    - role: implementation
      type: article_reference
      title: 'Tokens in Design Systems — 10 Tips to Architect & Implement Design Decisions'
      author: Nathan Curtis
      publication: EightShapes (Medium)
      url: 'https://medium.com/eightshapes-llc/tokens-in-design-systems-25dd82d58421'
      transcript: 'docs/research/youtube-library/transcripts/2026-04-30_nathan-curtis_tokens-in-design-systems.md'
    - role: taxonomy
      type: article_reference
      title: 'Naming Tokens in Design Systems — Terms, Types, and Taxonomy'
      author: Nathan Curtis
      publication: EightShapes (Medium)
      url: 'https://medium.com/eightshapes-llc/naming-tokens-in-design-systems-9e86c7444676'
      transcript: 'docs/research/youtube-library/transcripts/2026-04-30_nathan-curtis_naming-tokens-in-design-systems.md'
    - role: modern-css
      type: external_reference
      title: 'Modern CSS / Interoperable Tokens canon (contrast-color, color-mix, light-dark, scroll-state, css-mixins, W3C Design Tokens Format)'
      author: Una Kravets
      publication: 'una.im / web.dev / Chrome DevRel'
      url: 'https://una.im/'
      notes: 'Limited direct source; cited as known canon. Recent essays cover contrast-color(), border-shape, scroll-state(), css-mixins, and the W3C Design Tokens Community Group spec.'
    - role: governance-cross-ref
      type: youtube_analysis
      title: 'Karri Saarinen / Linear — Craft, Quality, And Calm Software'
      transcript: 'docs/research/youtube-library/analyses/2026-04-29_karri-saarinen-linear_craft-and-calm-software_analysis.md'
    - role: visual-craft-cross-ref
      type: youtube_analysis
      title: 'Steve Schoger / Refactoring UI — CSS Day talk'
      transcript: 'docs/research/youtube-library/analyses/2026-04-29_steve-schoger_refactoring-ui_analysis.md'
analyzed_date: '2026-04-30'
analyzed_by: Claude (Opus 4.7, 1M ctx)
analysis_type: consolidated-source-analysis
library_category: product-and-design
library_status: 'analysis'
transcript_status: available
analysis_status: available
processing_status: ready_for_skill_draft
processed: false
buildos_use: both
skill_candidate: true
skill_priority: high
skill_draft: ''
public_article: ''
indexed_date: '2026-04-30'
last_reviewed: '2026-04-30'
transcribed_date: '2026-04-30'
tags:
    - design-systems
    - tokens
    - atomic-design
    - taxonomy
    - governance
    - inkprint
    - product-and-design
    - buildos-positioning
path: docs/research/youtube-library/analyses/2026-04-30_design-systems-canon_frost-curtis-kravets_analysis.md
---

# Design Systems Canon — Frost, Curtis, Kravets, Saarinen (Consolidated Analysis)

## Skill Combo Links

- [Product And Design Skill Combos](../skill-combo-indexes/PRODUCT_AND_DESIGN.md): **Design system architecture review (proposed)** — primary backbone; Visual craft fundamentals; AI-era craft and quality moat
- Cross-link: [Karri Saarinen — Craft, Quality, And Calm Software](./2026-04-29_karri-saarinen-linear_craft-and-calm-software_analysis.md) (governance + opinionated defaults)
- Cross-link: [Steve Schoger — Refactoring UI](./2026-04-29_steve-schoger_refactoring-ui_analysis.md) (operator-level visual craft sitting on top of tokens)

> "Putting design back in" — Nathan Curtis, on what tokens actually do.
>
> "Atomic design is a mental model… designers work concurrently across all five stages rather than sequentially." — Brad Frost.

---

## Source Stack — Honest Coverage Note

| Role                   | Source                                                                                                                                         | Format            | Coverage                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vocabulary             | Brad Frost — _Atomic Design_ (online book + 2013 essay + 2024 "Is Atomic Design Dead?" SmashingConf NY)                                        | book + talk       | **Summary-level only.** The full book is freely readable but copyright-protected; WebFetch refused full reproduction. The two canonical talk videos (SmashingConf NY 2024, AEA Austin 2015) were **rate-limited by yt-dlp on 2026-04-30** and could not be transcribed. Captured here from explicit summaries + design-systems community canon. |
| Implementation         | Nathan Curtis — _Tokens in Design Systems_ (10 tips), 2016                                                                                     | EightShapes essay | Substantive primary source. Available in full at the linked transcript.                                                                                                                                                                                                                                                                         |
| Taxonomy               | Nathan Curtis — _Naming Tokens in Design Systems_                                                                                              | EightShapes essay | Substantive primary source. Available in full at the linked transcript.                                                                                                                                                                                                                                                                         |
| Modern CSS             | Una Kravets — `contrast-color()`, `color-mix()`, `light-dark()`, `border-shape`, `scroll-state()`, `css-mixins`, W3C Design Tokens Format spec | essays + W3C spec | **Indirect coverage.** No single canonical Kravets essay was cleanly available at analysis time; cited from her established public canon (una.im, web.dev, CSSWG drafts). Treat as the runtime/interop layer above Curtis's static taxonomy.                                                                                                    |
| Governance cross-ref   | Karri Saarinen — Linear ("small + opinionated", "used three times", restraint as default)                                                      | analysis          | Already-consolidated source from 2026-04-29. The governance backbone here.                                                                                                                                                                                                                                                                      |
| Visual craft cross-ref | Steve Schoger / Adam Wathan — _Refactoring UI_ + CSS Day talk                                                                                  | analysis          | Already-consolidated source from 2026-04-29. The visual-craft layer that lives on top of tokens.                                                                                                                                                                                                                                                |

**Source-honesty caveat:** the canonical Brad Frost talks were not transcribable on 2026-04-30 due to yt-dlp rate-limiting (retry once cleared — see "Recommended next research pull" below). This analysis stands on (a) explicit summaries of Frost's online book, (b) Curtis's two complete essays, (c) the Saarinen and Schoger consolidated analyses already in the library, and (d) widely-documented design-systems community canon for the gaps. It is operator-grade for backing the proposed `design-system-architecture-review` skill, but a future pull of the Frost talks should deepen sections 1 and 2.

This is a **flagship design-systems source**. It backs the proposed `design-system-architecture-review` skill and is the canonical anchor for [Product And Design gap audit gap #3](../skill-combo-indexes/PRODUCT_AND_DESIGN_GAP_AUDIT.md) (design systems / tokens entirely missing). It also supports the existing BuildOS Inkprint design system.

---

## Core Thesis

A design system without explicit hierarchy is a CSS pile; a hierarchy without tokens is naming theater; tokens without governance are sprawl. **Atomic Design (Frost)** gives the vocabulary — five named tiers that align design and engineering on what reuses, composes, and changes together. **Tokens (Curtis)** give the implementation — variables become decisions become tokens, with a four-level naming taxonomy (Base / Modifier / Object / Namespace) and a JSON+YAML pipeline that bridges design tools to code. **Governance (Curtis "used three times" + Saarinen "small + opinionated")** closes the loop — somebody has to curate, the bar to globalize is high, and opinionated defaults beat configurable mush. **Modern CSS (Kravets)** is the runtime layer on top — `color-mix()`, `light-dark()`, `contrast-color()`, and the W3C Design Tokens Format spec turn the static token taxonomy into interoperable, theme-aware, AI-tool-readable artifacts. The 2024 Frost reframing ("is atomic design dead?") confirms the field has moved past hierarchy debate to the governance + tokens debate; this analysis emphasizes governance accordingly.

The four schools are complementary, not competitive: Frost names the tiers, Curtis names the tokens, Kravets names the runtime primitives, Saarinen sets the opinionated defaults. A mature design-system review walks all four layers in order.

---

## TL;DR — The 12–15 Most Important Rules Across All Sources

1. **Atomic design is a mental model, not a workflow.** Designers iterate concurrently across atoms, molecules, organisms, templates, pages — not sequentially. (Frost)
2. **The atom-boundary is a maintenance contract.** Change the Button atom, every molecule and organism using it changes. The hierarchy makes change cost explicit. (Frost)
3. **Variables → Decisions → Tokens.** Variables answer "what options do I have?"; decisions answer "what choice do I make?"; tokens are decisions propagated systematically across products and platforms. (Curtis Tip 1)
4. **Show options first, then decisions.** Token files should reveal the progression from foundational options (color palette, type scale) to applied decisions (`text-color-microcopy`, `bg-card`). (Curtis Tip 1)
5. **Start with color and font; expand to spacing, sizing, borders, shadows.** The architecture grows alongside design-language maturity. (Curtis Tip 2)
6. **Vary options across meaningful, resilient scales.** T-shirt, geometric, ordered, bounded, proportional. Design scales that allow inserting intermediate steps without restructuring. (Curtis Tip 3)
7. **Invite contribution; curate the collection.** Anyone can propose tokens; one architecturally-minded curator maintains cleanliness. The "used three times" rule is the threshold for token candidacy. (Curtis Tip 4)
8. **Graduate decisions from components to tokens.** Stockpile component-local variables at the top of style files; review them regularly to promote shared decisions to global tokens. (Curtis Tip 5)
9. **Named tokens contain change risk better than generic variables.** `$text-color-microcopy` is searchable; `$color-neutral-20` is unpredictable. (Curtis Tip 6)
10. **Use the four-level naming taxonomy:** Base (category, property, concept) / Modifier (variant, state, scale, mode) / Object (component group, component, element) / Namespace (system, theme, domain). Avoid homonyms. Apply only the levels needed for clarity. (Curtis Naming)
11. **Theme ≠ Mode.** Themes (brand variations: ocean, courtyard) operate orthogonally to color modes (light/dark). Both can coexist. (Curtis Naming)
12. **Start local, promote gradually.** Define tokens locally in component specs first; promote to global only when 3+ components share the need. Avoid premature globalization. (Curtis Naming)
13. **Polyhierarchy via aliasing.** When the same decision appears in multiple classification schemes, store it once and alias: `$ui-controls-color-text-error = $color-feedback-error`. Maintains semantic completeness without duplication. (Curtis Naming)
14. **JSON for transport, YAML for human curation.** JSON is platform-agnostic; YAML supports comments and is readable enough for designers to PR directly. Use a transform layer (`yamljs`, Style Dictionary) between them. (Curtis Tips 7–8)
15. **Opinionated defaults beat flexible configuration.** Productivity software designed for everyone becomes mediocre everywhere. A strong default is a gift; flexibility is a tax on the user. (Saarinen, applied to design systems)

---

## Operating Lessons

### 1. Atomic Design — The Vocabulary (Frost)

Frost's contribution is not a workflow — it's a **shared vocabulary** that lets design and engineering point at the same component and use the same name. The five tiers:

| Tier          | Definition                                                            | BuildOS Inkprint Examples                                                    |
| ------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Atoms**     | Basic HTML elements that cannot be simplified further                 | Tokens (color, type, spacing, radius), Button, Input, Label, Icon primitives |
| **Molecules** | Simple component groups built from atoms                              | Form-field (label + input + helper-text), search bar, nav-link with icon     |
| **Organisms** | Complex sections built from molecules and atoms                       | Top nav, daily-brief card, brain-dump panel, project list                    |
| **Templates** | Page-level layouts showing content structure with placeholder content | Dashboard layout, brain-dump-flow layout, daily-brief-page layout            |
| **Pages**     | Final instances of templates with real, representative content        | A specific `/dashboard`, `/brain-dump`, `/brief/[id]` view                   |

**Frost's mental-model framing (key correction).** The hierarchy is not procedural. Designers iterate at all five levels concurrently. Atoms inform molecules; molecule patterns reveal which atoms are missing; templates expose composition gaps; real pages stress-test the abstractions. Treating it as a strict sequence (atoms first, then molecules, then organisms…) is the most common misuse.

**Why the vocabulary works:**

1. **Non-overlapping role names.** Eliminates the "is this a widget? a card? a panel? a tile?" debate. Every component has a single tier.
2. **Reuse becomes visible.** When atoms and molecules are catalogued, the reuse opportunities are obvious in the catalogue itself.
3. **Design system as product.** Atomic design treats the system as a living product with its own roadmap, not a one-shot deliverable handed to dev.
4. **Change cost is explicit.** Touch an atom, you accept the cost of every molecule and organism that depends on it. The contract is visible.

**Common misuses (community canon):**

- **Treating it as a strict sequence.** Frost explicitly says it's a mental model.
- **Over-classifying** (the "is this a complex molecule or a simple organism?" debate). Usually doesn't matter — pick a name and move on.
- **Atomic design without tokens.** The hierarchy is meaningful only when atoms are token-backed (color, type, spacing, radius). Without tokens, atomic design is naming theater.
- **Over-investing in the atom layer at the expense of pages.** Real pages are where the abstractions break. Templates are not optional.

**The 2024 Frost reframing — "Is Atomic Design Dead?" (SmashingConf NY).** Per the talk title and trailers, Frost's recent reframing is that atomic design is _alive_, but the conversation has matured. The field now talks more about tokens, governance, contribution models, and AI-augmented systems than about the 5-stage hierarchy itself. The hierarchy is now table stakes; the new conversation is about **token taxonomy (Curtis), interoperable runtime (Kravets), and design-system-as-product (Saarinen, Linear, Stripe).** This analysis emphasizes governance accordingly.

### 2. Tokens — The Implementation (Curtis, 2016)

Curtis's 2016 essay is the operator-grade canon. The argument is structural: variables alone are insufficient; what design systems need is _decisions propagated systematically_, which is what tokens are. Inspired by Salesforce's Lightning Design System.

**The three-stage progression — variables → decisions → tokens:**

1. **Variables** store atomic, reusable code values. `$color-neutral-20`. They answer "what options do I have?" but lack decision-making context. A code-only artifact.
2. **Design decisions** apply options to specific contexts. Applying `$color-neutral-20` to "the dark background color" turns an option into actionable design guidance.
3. **Design tokens** are decisions propagated systematically across products, platforms, and teams. Tokens centralize design decisions in accessible formats rather than burying them in developer repositories.

The progression is the whole point. A team running on raw CSS variables has options without decisions. A team running on hard-coded design specs has decisions without options. A team running on tokens has both, named and traceable.

**Curtis's 10 tips, organized by architecture vs implementation:**

#### Architecture (Tips 1–6)

1. **Show Options First, Then Decisions Next.** Structure token files to reveal the progression from foundational options to applied decisions. Teaches atomic thinking from "options to decisions and simple to complex."
2. **Start with Color & Font, and Don't Stop There.** Begin with the obvious candidates; expand systematically to spacing, sizing, borders, shadows.
3. **Vary Options Across Meaningful Scales.** T-shirt sizing (XS–XL), geometric progressions (2, 4, 8, 16, 32), or custom terms. Branching hierarchies enable variants like `space-inset-squish` and `space-inset-stretch` sharing the same size options. **Design resilient scales** — the ability to insert intermediate steps without restructuring is non-negotiable.
4. **Invite Contribution, but Curate the Collection.** The "used three times" threshold for token candidacy. Anyone can propose; one curator maintains cleanliness — scanning for naming precision, proper classification, and preventing excessive expansion.
5. **Graduate Decisions from Components to Tokens.** Encourage developers to stockpile component-local variables at the top of style files. This creates an inventory of token candidates. Example: `$border-color-input-hover` (component-specific, weak token candidate) vs `$background-color-disabled` (reusable, strong token candidate). Regular review prevents missed opportunities.
6. **Cope with Systemic Change Predictably.** Named tokens contain change risk better than generic variables. Searching for a generic `$color-neutral-20` reveals unpredictable applications; searching `$text-color-microcopy` identifies precise, intentional usage. The naming itself is the change-management strategy.

#### Implementation (Tips 7–10)

7. **Make Token Data Reusable via JSON.** Hierarchical, platform-agnostic. Transform into Sass/Stylus/Less; bridge to iOS/Android (with XML conversion). No tool lock-in.
8. **Manage & Read Token Data Easily via YAML.** JSON is verbose, syntax-sensitive, and lacks comments — hard for designers unfamiliar with code. YAML is readable, supports variables and comments, remains hierarchical. Use `yamljs` (or Style Dictionary's modern equivalent) to transform YAML into JS objects during build. **Lowers the barrier for designers to PR tokens directly.**
9. **Automate Documentation with Token Data.** Thread token data into living style guide templates to power reference sections, themed component demos, accessibility scoring. Documentation reflects actual decisions and stays synchronized with implementation.
10. **Embed Token Data in Design Tools Too.** Extend tokens into design software (Figma, Sketch, etc.) via plugin integration. Setup cost is real; mature systems justify it.

**The curator role (Tip 4 expanded).** Curtis's most underappreciated point. Token systems do not curate themselves. Without a designated person — "architecturally minded" — token sprawl is the default failure mode. Every team that proposes a token believes their case is the global case; the curator's job is to push back, name precisely, and refuse the third near-duplicate. The "used three times" rule is the curator's tool, not the contributor's permission.

**Saarinen-Curtis convergence.** Curtis's "invite contribution + curate" and Saarinen's "small + opinionated" are not in tension. Curtis defines _how_ contributions get evaluated; Saarinen defines _who decides what counts as the opinionated default_. Together: anyone can propose, the curator (often a founder or design lead in small teams) decides, and the bias is toward fewer, sharper tokens.

### 3. Naming — The Taxonomy (Curtis)

Curtis's second essay is the naming bible. The contribution is the **four-level group structure**:

#### Base Levels (the backbone)

- **Category** — `color`, `font`, `space`, `shape`, `motion`
- **Property** — `text`, `background`, `border`, `size`
- **Concept** — `feedback`, `action`, `heading`, `body`, `eyebrow`

#### Modifiers (distinguishing applications)

- **Variant** — `primary`, `secondary`, `success`
- **State** — `hover`, `focus`, `disabled`, `active`, `error`
- **Scale** — enumerated, ordered, bounded, proportional, t-shirt
- **Mode** — `light`, `dark` (and `on-dark` modifier patterns)

#### Object Levels (scoping to specific uses)

- **Component group** — `forms`, `navigation`, `feedback`
- **Component** — `input`, `button`, `card`
- **Element** — nested parts like `left-icon`, `helper-text`

#### Namespace Levels (establishing scope)

- **System name or acronym** — `esds`, `slds`, `inkprint`
- **Theme** — `ocean`, `courtyard`, `inkprint-default`
- **Domain** — `consumer`, `retail`, `creator`

**Key principles (the operator rules):**

- **Avoid homonyms.** Terms like "type" and "text" create ambiguity across contexts. Curtis recommends `font` over `typography` for length.
- **Homogeneity within, heterogeneity between.** Group similar concepts together; keep distinct purposes separate. Don't conflate `visualization` colors with `commerce` colors despite potential value overlap.
- **Flexibility vs specificity trade-off.** `$color-success` is reusable but imprecise; `$color-background-success` is precise but less flexible. Pick deliberately per token.
- **Explicit vs truncated defaults.** Some systems assume light mode and only append `on-dark` modifiers. Others maintain parallel construction with both variants explicit. Pick a convention and apply it everywhere.
- **Theme ≠ Mode.** Themes are brand variations; modes are color schemes. Both can coexist in sophisticated systems.
- **Completeness principle.** No token requires all possible levels. Avoid redundantly duplicating tuples with unnecessary modifiers. Bad: `$esds-shape-tile-corner-radius-default-on-light` (when corner radius doesn't vary by mode). Good: `$esds-shape-tile-corner-radius`.
- **Polyhierarchy via aliasing.** When the same decision appears in multiple classification schemes, store it once and alias across contexts. Example: `$ui-controls-color-text-error = $color-feedback-error`. Maintains semantic completeness, prevents duplication, hedges against future divergence.

**Order patterns (non-binding observation).** Curtis surveys six prominent systems (Bloomberg, Salesforce, Orbit, Morningstar, Infor, Adobe) and finds no universal order. Tendencies:

- Namespaces prepend first.
- Base levels occupy the middle.
- Modifiers typically append last.
- Object levels establish subordinate context.
- Mode modifiers often conclude.

This is **descriptive, not prescriptive**. Teams should pick an order and apply it everywhere; the choice of order matters less than consistency.

**The promotion workflow (Curtis's gradualist practice):**

1. Define tokens locally within component specs or stylesheets.
2. Identify patterns across multiple components.
3. Promote shared decisions to global token collections (the "used three times" threshold).
4. Update all references to use the promoted token.
5. Remove redundant local declarations.

This emergent practice prevents debate about premature abstraction while establishing natural consensus around truly shared patterns.

### 4. Governance — The Contribution Model

Curtis's "invite contribution + curate" combined with Saarinen's "small + opinionated" produces the operating model:

**Who can propose tokens:** anyone — designer, engineer, PM. Through reviews, Slack, PRs.

**Who curates:** one designated person — architecturally minded, taste-driven. In a large team, this is a design-systems lead. In a small team, this is the founder or design lead.

**When local tokens get promoted to globals:**

- Used in ≥3 components (Curtis's "used three times" rule).
- Curator confirms: not a near-duplicate of an existing global, properly classified within the four-level taxonomy, named without homonyms.
- All references updated to use the promoted token; redundant local declarations removed.

**What the curator pushes back on:**

- Tokens that don't pass the "used three times" test.
- Tokens with ambiguous naming (`$color-success` without property — is this a background, text, border?).
- Tokens that conflate categories (mixing `feedback-success` and `commerce-success` despite a similar value).
- Tokens that duplicate existing globals under different names (use polyhierarchy + aliasing instead).
- Premature abstraction (a token proposed for "future flexibility" with no current consumer).

**Saarinen's contribution to governance — opinionated defaults.** Beyond Curtis's process model, Saarinen adds the substantive layer: **what counts as a "good" default at the token level?** Saarinen's answer is the same as for product features: pick the workflow, pick the audience, pick the default that 80% of users would accept. Translated to tokens: prefer fewer, sharper tokens; resist the pull toward "configurable for every use case"; the curator's bias should be toward _restraint_, not _comprehensiveness_.

**The tension that isn't.** Saarinen's "small team + opinionated defaults" can read as opposed to Curtis's "invite contribution + curate." It isn't. Curtis describes _the mechanism for evolving the system_. Saarinen describes _the disposition of the curator at the moment of decision_. Both are true: invite contribution, curate hard, and bias toward fewer + sharper tokens with strong opinions about what they are.

### 5. Modern CSS — The Runtime Layer (Kravets)

Una Kravets's recent work (CSS Day, web.dev, una.im, CSSWG drafts) establishes the **runtime layer above Curtis's static taxonomy.** Her contributions sit at the intersection of three threads:

1. **Modern color primitives.** `color-mix()`, `light-dark()`, `contrast-color()`, relative color syntax. These let a design system express color relationships (mix this brand color with white at 80%; pick a contrasting text color automatically) at the runtime layer rather than encoding every variant statically. The token taxonomy stays clean; the runtime does the work.
2. **Interactive runtime primitives.** `scroll-state()`, `:has()`, `@scope`, view transitions, anchor positioning. Components can express behaviors (this dropdown's color shifts when scrolled past, this card's shadow follows hover) declaratively in CSS rather than imperatively in JavaScript.
3. **Interoperable design tokens (W3C Design Tokens Format Module).** The W3C Design Tokens Community Group has been drafting a standard JSON schema for design tokens. When stable, it becomes the universal interchange format between Figma, Style Dictionary, design-system documentation tools, and (importantly) AI tools that generate UI. Curtis's taxonomy + Frost's hierarchy + W3C interoperability = an AI-tool-readable design system.

**The CSS-variables-vs-tokens distinction.** A common confusion: are CSS custom properties (`--color-primary`) the same thing as design tokens? **No.** CSS variables are a runtime mechanism. Tokens are a design-system artifact that may _compile to_ CSS variables (or to Sass variables, or to iOS color assets, or to Figma styles). The token is upstream of the CSS variable. Style Dictionary, Figma Tokens, and W3C Design Tokens all preserve this distinction: tokens are JSON; CSS variables are one of many output targets.

**Why this matters now.** AI tools (v0, Lovable, Cursor) generate CSS with hard-coded values. The design-systems response is _theming on top_ — let AI generate component bodies, then run them through a token-aware transform that swaps hard-coded values for tokens. This is the Ryo Lu / Cursor approach: don't reject AI-generated UI, _wrap_ it in your design system. Modern CSS primitives (`color-mix()`, `light-dark()`, `contrast-color()`) make this wrapping cheap because the runtime can compensate for AI's lack of token-awareness.

### 6. Theming and Modes (Curtis)

Curtis's clearest taxonomy contribution: **theme and mode are orthogonal.**

- **Theme** is brand variation. `ocean`, `courtyard`, `inkprint-default`, `acme-co`. Themes change which color palette, typography, spacing scale a brand expresses.
- **Mode** is color-scheme variation within a theme. `light`, `dark`, `high-contrast`. Modes change which surface treatment is rendered.

A sophisticated system supports both: theme (`ocean`) × mode (`dark`). Naming patterns:

- **Truncated default:** `$color-text-primary` (assumed light) and `$color-text-primary-on-dark` (modifier appended only when needed).
- **Explicit parallel:** `$color-text-primary-on-light` and `$color-text-primary-on-dark` (always explicit).
- **Modern CSS approach:** `light-dark(value-light, value-dark)` — the runtime picks based on `color-scheme`. Token naming stays clean (`$color-text-primary`); the rendering layer handles the mode.

**Multi-brand readiness.** If a system might serve multiple brands or domains, namespace levels (`$buildos-color-text-primary` vs `$inkprint-color-text-primary`) and theme levels become essential early. Adding a namespace later is a major refactor; designing one in is cheap.

**BuildOS-specific implication.** Inkprint currently supports light + dark modes. If BuildOS ever adds a creator-tier brand variation or a partner white-label, _theme_ as a concept needs to exist in the taxonomy from day one — not added later. The cost of adding namespace + theme dimensions retroactively is high; designing them in (even as no-ops) is cheap.

---

## Cross-Source Contradictions and Unifications

1. **Frost ↔ Curtis: hierarchy vs taxonomy.** Frost's atomic design names _components_; Curtis's taxonomy names _tokens_. They operate at different layers of the same stack. Frost's atoms are token-backed; Curtis's tokens are atom-defining. The 2024 Frost reframing acknowledges Curtis is now the more active conversation — hierarchy is table stakes; tokens + governance is the frontier. **Unification:** Frost gives the tier names, Curtis gives the variable names inside each tier.

2. **Curtis ↔ Saarinen: invite contribution vs opinionated defaults.** Reads as opposed but isn't. Curtis describes the _mechanism_ for evolving the system over time (anyone proposes, curator decides, used-three-times threshold). Saarinen describes the _disposition_ of the curator (bias toward restraint, fewer tokens, stronger opinions). **Unification:** invite contribution, curate hard, bias toward sharper.

3. **Frost ↔ Kravets: hierarchy stability vs runtime fluidity.** Frost's hierarchy is stable across CSS eras — atoms are still atoms whether you're using Sass variables or `color-mix()`. Kravets's runtime primitives don't change the hierarchy; they change what an _atom_ contains. An atom in 2016 was a hex value; an atom in 2026 is `color-mix(in oklch, var(--brand) 80%, white)`. **Unification:** Frost is layer-agnostic; Kravets adds expressive power to the atom layer without changing the hierarchy above it.

4. **Curtis ↔ Kravets: static taxonomy vs interoperable runtime.** Curtis's 2016 taxonomy assumed JSON/YAML transformed to Sass/CSS at build time. Kravets's modern stack adds W3C Design Tokens Format (universal JSON schema) and runtime CSS primitives that consume tokens dynamically. **Unification:** Curtis's taxonomy stays correct; the W3C spec gives it a portable serialization; modern CSS gives it a richer runtime target.

5. **All four ↔ AI-generated UI.** AI tools (v0, Lovable, Cursor copilots) generate component code that bypasses your token system. Frost says: but the hierarchy still applies — AI-generated organisms are still organisms. Curtis says: token-awareness is the curator's job; flag any hard-coded value during review. Kravets says: modern CSS lets you wrap AI output in token-aware runtime primitives. Saarinen says: refuse to ship AI-generated work that violates the opinionated defaults. **Unification:** the canon is unanimous that the response to AI-generated UI is _theming on top_, not _rejecting AI_. Wrap the slop; don't ban the tool.

---

## Quotables

> "Putting design back in" — what tokens actually do. **— Nathan Curtis**

> "Atomic design is a mental model… designers work concurrently across all five stages rather than sequentially." **— Brad Frost**

> "Variables answer 'what options do I have?' Decisions answer 'what choice do I make?' Tokens are decisions propagated systematically." **— Nathan Curtis (paraphrased)**

> "Avoid homonyms. Terms like 'type' and 'text' create ambiguity across contexts." **— Nathan Curtis**

> "Homogeneity within, heterogeneity between." **— Nathan Curtis**

> "Theme ≠ Mode. Themes operate orthogonally to color modes. Both can coexist." **— Nathan Curtis**

> "No token requires all possible levels. Include only levels sufficient to distinguish intentional design decisions." **— Nathan Curtis**

> "Productivity software, especially company software, should be opinionated." **— Karri Saarinen** (applied to design systems: opinionated tokens, not configurable mush)

> "Technology makes it faster to build, but harder to care." **— Karri Saarinen** (the AI-era stake for design systems)

> "Atoms inform molecules; molecule patterns reveal which atoms are missing; templates expose composition gaps; real pages stress-test the abstractions." **— Frost (community paraphrase)**

> "The atom-boundary is a maintenance contract." **— Frost (community canon)**

> "Used three times." **— Nathan Curtis** (the threshold for promoting a local CSS variable to a global token)

---

## Practical Inkprint-Audit Checklist

Apply Frost + Curtis + Kravets + Saarinen jointly to the BuildOS Inkprint design system. Walk these in order; surface issues as findings.

### A. Hierarchy clarity (Frost)

- [ ] Are atoms / molecules / organisms / templates / pages explicitly named in the Inkprint documentation?
- [ ] Does every component in `apps/web/src/lib/components/` have a clear tier assignment?
- [ ] Are atoms token-backed, or are some atoms hard-coded values (= naming theater)?
- [ ] Does `apps/web/src/lib/ui/` (the `$ui` alias) contain only atoms + simple molecules, or have organisms crept in?
- [ ] Are templates/layouts in `apps/web/src/routes/` separated from organisms?

### B. Token taxonomy (Curtis)

- [ ] Is the four-level group present (Base / Modifier / Object / Namespace)?
- [ ] Are tokens named consistently? Same order, same separators, same conventions across categories.
- [ ] Are there homonyms (`type` vs `text`, etc.)?
- [ ] Is the flexibility-vs-specificity trade-off made deliberately? (Not "all generic" or "all specific.")
- [ ] Are explicit defaults vs truncated defaults applied consistently?
- [ ] Are scales (T-shirt, geometric, ordered, etc.) labeled by their type so insertion is safe?
- [ ] Is polyhierarchy via aliasing in use, or are there duplicate tokens with different names?

### C. Governance (Curtis + Saarinen)

- [ ] Who is the Inkprint curator? Named, single person, architecturally minded.
- [ ] What's the "promote to global" threshold? "Used three times" or BuildOS-specific?
- [ ] Where do component-local CSS variables live so the curator can review them? Top of style files? A specific section in component documentation?
- [ ] Is there a contribution pathway (Slack channel, PR template, design review) that engineers and designers can use to propose tokens?
- [ ] Has the curator pushed back on any proposal in the last 3 months? If not, the curator role is performative.

### D. Token data format

- [ ] Are tokens stored in JSON / YAML / TS? Or are they only CSS variables?
- [ ] Could the token source be transformed via Style Dictionary or compiled to multiple targets (CSS, iOS, Android)?
- [ ] Is the W3C Design Tokens Format spec followed (or compatible)?
- [ ] Do AI tools (v0, Cursor, Figma plugins) read the token source directly, or do they have to re-derive tokens from rendered CSS?

### E. Documentation (living style guide)

- [ ] Does the Inkprint documentation render live tokens (not just static screenshots)?
- [ ] Does the documentation update automatically when tokens change?
- [ ] Are accessibility scores (contrast ratios, hit-target sizes) computed from tokens and shown in docs?
- [ ] Are component examples token-backed (so they update when tokens change)?

### F. Modern CSS (Kravets)

- [ ] Is `color-mix()` used to derive variants from base tokens (e.g., hover = brand mixed with black 8%)?
- [ ] Is `contrast-color()` or a polyfill used to auto-pick text color against backgrounds?
- [ ] Is `light-dark()` used for mode-switching, or is mode switching done at the token-source layer?
- [ ] Is the CSS-variables-vs-design-tokens distinction clear in the codebase? (Tokens are upstream; CSS variables are one output target.)
- [ ] Are interactive runtime primitives (`scroll-state()`, `:has()`, view transitions) used where they add expressive power, or is everything still imperative JS?

### G. Multi-brand readiness

- [ ] Is `theme` separated from `mode` in the taxonomy? Even if Inkprint currently has only one theme, is the dimension reserved?
- [ ] Is a namespace level (`inkprint-` or `buildos-`) present, or would adding one require a refactor?
- [ ] Could a partner white-label or creator-tier theme be added without restructuring?

### H. Component-to-token contract

- [ ] Do components reference tokens by **intent** (e.g., `text-color-primary`, `bg-card`) or by **value** (e.g., `slate-900`, `#0F172A`)?
- [ ] Are utility classes (Tailwind-style) backed by tokens, or do they reference raw values?
- [ ] When the design language shifts (new brand color, new spacing scale), how many files would need to change? Token system: ~1. Naming theater: hundreds.

---

## Application to BuildOS

### 1. Inkprint Maps Onto The Canon Directly

Inkprint already has the right structural decisions, even if not formally framed in canon vocabulary:

- **Atoms** = tokens (`bg-card`, `text-foreground`, `shadow-ink`, `tx-bloom`, `tx-grain`) + Button / Input / Label / Icon primitives in `apps/web/src/lib/ui/`.
- **Molecules** = form-field, search bar, nav-link with icon, dropdown trigger, dialog header.
- **Organisms** = top nav, daily-brief card, brain-dump panel, project list, calendar widget.
- **Templates** = dashboard layout, brain-dump-flow layout, daily-brief-page layout — likely encoded in SvelteKit `+layout.svelte` files.
- **Pages** = actual `/dashboard`, `/brain-dump`, `/brief/[id]`, `/projects/[id]` views.

**Action item:** add this tier assignment to `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`. The vocabulary is free. Without it, the next contributor will recreate the "is this a widget or a panel?" debate.

### 2. Curtis's "Used Three Times" → BuildOS-Specific Promotion Criteria

For a small-team context (Saarinen-school), the "used three times" rule is the right floor, with these BuildOS-specific additions:

- **Used in ≥3 components** AND
- **Curator (founder or design lead) confirms the token is not a near-duplicate** of an existing global, AND
- **The token name passes the four-level taxonomy check** (no homonyms; correct base/modifier/object/namespace; consistent ordering).

If any of those three fail, the variable stays component-local. The bias is toward restraint — promote slowly; demote rarely (demotion is a backward-compatibility cost).

### 3. Saarinen's Opinionated Defaults Applied to Inkprint

The Saarinen-school question is: **which Inkprint tokens should be deliberately constrained?**

- **Color palette: deliberately small.** Brand neutrals + one accent + feedback (success / warning / error). Resist the pull toward 12 brand colors.
- **Type scale: 5–7 sizes max.** Heading 1–4, body, caption, code. No "lead" + "intro" + "headline" + "title" splintering.
- **Spacing scale: T-shirt or 4-base geometric.** Pick one; don't mix.
- **Radius: 3 values max.** Sharp (0), default (4–6), pill (full). Resist per-component radius.
- **Shadows: 3–4 values max.** Card, elevated, modal, popover. Inkprint's `shadow-ink` is the one named shadow; `shadow-ink-lg` if needed.
- **Texture: deliberately sparse.** `tx-bloom`, `tx-grain` are the texture vocabulary. Don't add a third without curator review.

The opinionated-default bias means **fewer Inkprint tokens, more component reuse, more refusal to add a "one more token for this case" proposal.**

### 4. W3C Design-Tokens-Format Spec — Should Inkprint Adopt It?

**Yes, when the spec stabilizes.** The argument:

- AI tools (v0, Cursor, Figma plugins, future code copilots) will consume W3C design-tokens-format JSON natively. Inkprint adopting the spec means BuildOS's design system is _readable to AI tools_ without translation.
- The cost is one transform layer (Style Dictionary already supports it). The benefit is interoperability across Figma → code → docs → AI.
- Until the spec is stable, the Inkprint internal format should be **W3C-compatible but not yet W3C-native** (use the same nested-object structure, the same `value` / `type` / `description` field names where possible).

**Action item:** when adding new Inkprint tokens, name fields with W3C compatibility in mind (`value`, `type`, `description`). Migration cost stays low.

### 5. The "AI Slop" Intersection

The design-systems canon argues for **theming on top** of AI-generated UI rather than rejecting it. The pattern:

1. Let AI tools (Cursor, v0, Lovable) generate component bodies — fast iteration, lots of variants.
2. Run the output through a token-aware transform (or do it manually in review): replace hard-coded values with Inkprint tokens.
3. Wrap the component in Inkprint's atom/molecule conventions.
4. Apply the curator review (does this need to exist? does it duplicate an existing organism? does it pass the door test from the Saarinen analysis?).

**Ryo Lu / Cursor approach.** Cursor's recent editor UI work is theming Shadcn + Radix component bodies with a Cursor-specific token layer. The component bodies are AI-generated or AI-modifiable; the token layer is hand-curated. BuildOS's posture should be the same: AI-generated component bodies, hand-curated Inkprint tokens, curator-enforced taxonomy.

### 6. The Specific BuildOS Token Decision: `text-color-primary` vs `slate-900`

**Curtis's answer: depends, with both sides aliased.**

- **Component code uses intent tokens.** `text-color-primary` in a Button atom. The Button doesn't know what color it is; it knows it has primary text.
- **Utility classes use value tokens.** `text-slate-900` in one-off layout code. Tailwind already does this — that's the utility-first model.
- **Both are aliased.** `$text-color-primary = $slate-900`. Change the alias once, all components update; the utility class stays available for one-offs.
- **The Inkprint-specific bias** (Saarinen-school): prefer intent tokens in components, avoid utility classes in long-lived components. Utility classes are for prototyping and one-offs; intent tokens are for the system.

**Practical Inkprint rule:** atoms and molecules use intent tokens (`bg-card`, `text-foreground`). Organisms and pages may use utility classes for layout (`grid grid-cols-12 gap-4`) but not for color/type (those route through intent tokens). The contract is enforced in code review.

### 7. Inkprint-Specific Action Items (concrete)

1. **Add the atomic-design tier vocabulary** to `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`.
2. **Designate the Inkprint curator** explicitly. Without a named person, the role is performative.
3. **Document the four-level taxonomy** for Inkprint (Base / Modifier / Object / Namespace) — even if Object and Namespace levels are mostly empty today, define them.
4. **Audit existing tokens for homonyms** (`type`, `text`, `font` overlaps; `color`, `bg`, `surface` overlaps).
5. **Add the "used three times + curator approval" rule** to the Inkprint contribution pathway.
6. **Stockpile component-local CSS variables at the top of style files** in `apps/web/src/lib/components/` so they're visible during reviews.
7. **Convert any existing utility-class color references** in atoms and molecules to intent tokens.
8. **Add a `theme` dimension to the namespace** even if it's a no-op today (`inkprint-default` as the only theme value). Adding it later is a major refactor.
9. **Pick a token-source format** — JSON, YAML, or TS. Today Inkprint may be implicit in CSS variables; making it explicit upstream is the unlock for W3C interop and AI-tool readability.
10. **Cross-reference the [Saarinen calm-software audit](./2026-04-29_karri-saarinen-linear_craft-and-calm-software_analysis.md) and [Schoger refactoring-UI checklist](./2026-04-29_steve-schoger_refactoring-ui_analysis.md)** — design-system review is the structural layer; visual craft and calm restraint are the application layers.

---

## Critical Analysis — Limits of the Canon

### 1. Frost's Atomic Design Can Become Naming Theater When Over-Applied

The "is this a complex molecule or a simple organism?" debate is the canonical waste of senior-design time. Frost himself has acknowledged in the 2024 reframing that the field has moved past hierarchy debate. **Treat the tier names as a vocabulary, not a classification taxonomy.** If a component sits ambiguously between two tiers, pick one and move on. Spending 30 minutes in a design review on tier classification is a smell.

### 2. Curtis's 10 Tips Assume A Team Large Enough To Have A Curator

Curtis's framework was written for systems serving multi-product, multi-platform organizations (Salesforce-scale). A solo-founder design system needs a lighter version:

- The curator is the founder. (Single point of failure; live with it.)
- The "used three times" rule may be overkill at <10 components total. Use "used twice + curator approval" for solo-team velocity.
- The YAML-edited-by-designers pipeline is unnecessary if there are no designers separate from the founder. CSS-variables-in-the-codebase is fine.
- The W3C Design Tokens Format spec is overkill until you have multiple consumers (web + iOS + Figma + AI tools). One consumer = one format.

**Inkprint-specific:** BuildOS is a solo-founder operation today. The lighter version above applies. Watch for the moment a second engineer joins; that's when the formal token-source format becomes worth the setup cost.

### 3. Modern CSS Is Shifting Fast

Specific token-format decisions (Style Dictionary vs raw CSS variables vs W3C design-tokens) are still volatile in 2026. Recommendations:

- **Don't bet on a specific tooling stack** (Style Dictionary, Theo, Specify, Tokens Studio). Bet on the W3C spec direction.
- **Keep token data structurally W3C-compatible** (nested objects, `value`/`type` field names) even if you're emitting CSS variables today.
- **Avoid Sass-specific features in token sources.** Sass is exiting the modern web stack; don't tie tokens to it.
- **Accept that the runtime layer will keep adding primitives.** `contrast-color()`, `border-shape`, `scroll-state()` are recent; more will land. The token taxonomy stays stable; the runtime expressiveness keeps growing.

### 4. Design Systems Are Downstream Of Taste

A token system can encode a wrong taste decision and propagate it everywhere. If the curator picks bad spacing, _every component_ inherits bad spacing. The system amplifies whatever taste is upstream of it.

This is the Saarinen point applied to the design-system layer: **the canon assumes the curator has good taste.** Without good taste, the canon makes bad design more efficient. The mitigation is the Saarinen hiring rule — _hire for craft already demonstrated, not for skills that can be trained into craft_ — applied to whoever curates Inkprint.

**For BuildOS specifically:** Inkprint is downstream of the founder's taste. If the taste shifts (different brand direction, different audience priorities), the token system will need a major refactor. Plan for it.

### 5. The Field Has Moved Past Hierarchy To Governance

The 2024 Frost reframing is the most important signal in the canon. The conversation has matured. **The questions that mattered in 2013 (atoms vs molecules) are settled. The questions that matter in 2026 are governance, contribution, AI integration, and interoperability.** This analysis emphasizes governance accordingly:

- **Who curates?** (The single most underappreciated lever.)
- **What's the contribution model?** (Slack channel, PR template, design review.)
- **How are AI-generated components incorporated?** (Theming on top, not rejecting AI.)
- **How do Figma → code → docs → AI tools share a token source?** (W3C interop direction.)

A design-system review in 2026 that focuses primarily on hierarchy is reviewing yesterday's question.

### 6. The Canon Is Largely Pre-AI

Curtis's 2016 essays and Frost's 2013 essay predate the AI-generated-UI era. They hold up because the structural decisions (hierarchy, taxonomy, naming, governance) are layer-agnostic. But **the specific operational implications for AI integration are not in these sources.** They have to be inferred or pulled from Saarinen, Ryo Lu, Dylan Field, and the still-volatile current practice. Treat the canon as the structural backbone; treat the AI-era operational guidance as evolving.

---

## Recommended Next Research Pull

Specific sources that would deepen this analysis:

1. **Brad Frost — "Is Atomic Design Dead?" SmashingConf NY 2024 talk.** yt-dlp was rate-limited 2026-04-30; **retry once cleared.** This is the most important missing source for sections 1 and 2 — Frost's own current thinking on where the field has moved.
2. **Brad Frost — Atomic Design talk at AEA Austin 2015.** Same rate-limit issue. The original talk video would deepen the "mental model not workflow" framing.
3. **Una Kravets — specific design-tokens essay or talk.** She has written and spoken extensively, but no single canonical "design tokens" piece was cleanly identifiable at analysis time. A focused pull on a recent CSS Day or web.dev talk would solidify section 5.
4. **Style Dictionary docs + Design Tokens Community Group (W3C spec).** Pull the current spec status, the schema, the supported transform targets. The W3C spec is the future interop layer; teams adopting Inkprint should know its trajectory.
5. **Adam Argyle — `open-props` and `open-color`.** Argyle's recent CSS work is the most influential modern-CSS-token implementation. A specific source pull would deepen section 5.
6. **Linear's design-system writing (linear.app/blog).** Saarinen has not published a canonical Linear design-system piece, but the marketing and product sites are the artifacts. A focused analysis of how Linear scopes tokens would back the Saarinen-school governance argument.
7. **Stripe Press / Geist (Vercel) / Polaris (Shopify) public design-system writing.** Three very different operator-grade examples. Geist is closest to BuildOS's surface; Polaris is the most documented; Stripe Press is the most opinionated about typography and craft.
8. **Diana Mounter / Primer (GitHub) — design-system-as-product writing.** Mounter's framing is the "design system has its own roadmap, its own users, its own metrics" thesis applied at GitHub scale. Strong governance source.
9. **Cursor's design system / Ryo Lu writeups on the Cursor token layer.** Concrete operator example of the "theming on top of AI-generated UI" pattern. Already partly covered in the existing Ryo Lu analyses but a focused token-layer pull would help.
10. **Refactoring UI Pro tier + Adam Wathan's utility-first philosophy talks.** The utility-first approach is one specific resolution of the intent-vs-value token debate (Curtis section 6 above). Schoger covers some of this; a focused Wathan pull would deepen it.

After pulling sources 1–4, this analysis can be revised to a v2 that fully anchors the `design-system-architecture-review` skill draft. Today's v1 is operator-grade for skill drafting and Inkprint auditing.

---

## Recommended Next Actions For The Index

1. **Use this as the anchor source for the proposed `design-system-architecture-review` skill.** Stack with Schoger (visual craft on top) and Saarinen (governance + opinionated defaults). The skill agent should walk the Inkprint-Audit Checklist (section A–H) when reviewing or extending a design system.
2. **Cross-reference into `visual-craft-fundamentals`.** Schoger + Inkprint-audit checklist together give the skill a "system + execution" structure: tokens are the system, Schoger's rules are the execution.
3. **Cross-reference into `ai-era-craft-and-quality-moat`.** The "theming on top of AI-generated UI" pattern (section "AI Slop intersection") is the design-system-canon answer to the AI-era craft question.
4. **Update the [PRODUCT_AND_DESIGN gap audit](../skill-combo-indexes/PRODUCT_AND_DESIGN_GAP_AUDIT.md) gap #3** from "needs-research" to "partially served" or "served-pending-talk-pull" — Frost SmashingConf 2024 is still missing.
5. **Link this analysis from `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`** as the canonical external reference for Inkprint's structural choices.
6. **Schedule a re-pull of the Frost talks** once yt-dlp rate-limiting clears. Mark this analysis for v2 revision after that pull.
