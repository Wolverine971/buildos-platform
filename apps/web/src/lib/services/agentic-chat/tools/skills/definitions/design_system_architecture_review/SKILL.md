---
name: Design System Architecture Review
description: >-
    Child skill under Build Quality UI/UX for design-system architecture: atomic-design taxonomy, token taxonomy and tiering, naming, governance, releases, intake, adoption, and product outcomes.
parent_id: build_quality_ui_ux
depth: 1
preserve_markdown: true
legacy_paths:
    - product-and-design.design-system-architecture-review.skill
    - product-and-design/design-system-architecture-review
    - docs/research/youtube-library/skill-drafts/design-system-architecture-review/SKILL.md
reference_modules:
    - id: design_system_architecture_review.token_taxonomy_and_ai_context
      name: Token Taxonomy, Tiering & AI-on-Grain Context
      summary: Three-tier token taxonomy (option/core, semantic, component/recipe) with naming and indirection rules; tokens as single source of truth published to code/Figma/docs/native; core + child/recipe systems; un-styled base + token themes; web components as cross-framework single source of truth; AI-on-grain rules (light component table-of-contents context, not fine-tuning; generate/translate/retrofit; Sentient Design). Cites Frost 2024 and Curtis.
      when_to_load:
          - When the review goes deep on tokens — naming, tiering, scope, promotion, theming, or cross-platform/native publishing.
          - When reviewing or designing an AI feature that generates, scaffolds, translates, or retrofits UI from the design system.
      path: references/token-taxonomy-and-ai-context.md
    - id: design_system_architecture_review.adoption_diagnosis
      name: Adoption Diagnosis — Distance, Virtuous Circle & Interface Inventory
      summary: Diagnoses low design-system adoption — root cause is distance between system and products; requires the virtuous circle (system→product AND product→system); names the two failure poles (pattern police, product capture); the interface-inventory audit + buy-in protocol; continuous-improvement/agency/native-controls/performance-is-design governance; and the 2015→2024 maturity diagnostic. Cites Frost 2015 and 2024.
      when_to_load:
          - When the bottleneck is adoption ("nobody uses the system"), the system feels isolated, or the question is design-system ROI.
          - When you need the interface-inventory protocol, the virtuous-circle check, or the 2015→2024 maturity diagnostic.
      path: references/adoption-diagnosis.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/design_system_architecture_review/SKILL.md
---

# Design System Architecture Review

Use this child when UI quality depends on the system behind the screen. Two things to settle before architecture detail: **product outcome** (what gets faster/safer/clearer) and **adoption** (is the system serving the products or policing them). A perfectly-built system nobody uses returns nothing.

## When to Use

- Reviewing or creating a design system, component library, token system, Figma/code parity model, documentation site, release process, or contribution workflow.
- The user asks about Atomic Design, design tokens, system governance, component naming, adoption, roadmaps, or design-system ROI.
- A screen-level review keeps finding repeated inconsistencies that need systemic correction.

## Workflow

1. Map the system layers using the **atomic-design taxonomy** below: atoms/tokens, molecules, organisms, templates, pages, documentation, release channels, adoption surfaces. Treat it as a mental model, not a waterfall (Frost: "create the whole and the parts simultaneously").
2. Tie the work to product outcomes before architecture detail. Name what becomes faster, safer, clearer, more accessible, easier to migrate, or more coherent.
3. Run the **adoption check** (below). If the bottleneck is adoption, the system feels isolated, or the question is ROI, load `adoption-diagnosis` for the distance/virtuous-circle/interface-inventory protocol.
4. Check token and component taxonomy: semantic roles, naming, scope, variants, states, promotion rules, cross-platform fit. For token tiering/naming mechanics, core+child systems, un-styled+token theming, or AI-generates-UI features, load `token-taxonomy-and-ai-context`.
5. Review operations: feature definition, planning, specs, owners, library matrix, VQA, accessibility, release cadence, comms, roadmap, and intake routing.
6. Classify the migration path — keep template, customize, parity rebuild, flow-by-flow migration, or rebuild — then return findings with evidence, product value, owner, migration path, and the next operating change.

## Atomic-design taxonomy (the mental model — Frost 2015, "more relevant" per Frost 2024)

Map every part of the system to a stage. The payoff is **abstract ↔ concrete traversal**: zoom out to elemental pieces, zoom in to the assembled UI.

| Stage | Definition (as applied) | Agent check |
| --- | --- | --- |
| **Atoms** | Smallest blocks; can't break down further and stay useful. Includes the invisible: color palette, font stacks, animations → these are the **token layer**. | Are foundational values (color/type/space/motion) articulated as named atoms/tokens, not scattered literals? |
| **Molecules** | A few atoms combined into a simple reusable unit; the combination creates new behavior (label defines input). | Plug-in-anywhere? No business logic baked in? |
| **Organisms** | Complex components from molecules+atoms working as one unit (header, footer, product grid). | Reused across surfaces, or a one-off? |
| **Templates** | Organisms in a page layout articulating **content structure** — not final content (image widths, title character lengths, scaffolding laid bare). | Does the system separate content **structure** from content? |
| **Pages** | Templates filled with **real representative content**; the **resiliency test** for the patterns underneath. | When real content is poured in, what breaks? Fix it "at a more atomic level," not on the page. |

Rules that fire every review:
- **Non-sequential.** The five stages happen collectively. Don't treat it as buttons-first-and-pray. Reject any plan that sequences them as a waterfall.
- **Template-vs-page is load-bearing.** A system that never separates content scaffolding from real content ships brittle layouts. Flag it.
- **Page = resiliency test.** No page stage (no real-content stress test) → predicted brittleness; require it.
- **Vocabulary is optional, the system isn't.** If the team rejects atom/molecule/organism naming, that's fine — the methodology survives renaming. Do not litigate the words; litigate whether the structure exists.
- **Lineage / DRY.** Patterns nest (includes / web components); "change one pattern, every instance updates." Duplicate components that should be one pattern → consolidation finding with the lineage as evidence.

## Adoption check (run on every review — Frost 2024)

The 2024 defining problem isn't "how to build a system," it's "**nobody uses the system**." Root cause: **distance between the system and the products it serves** (the team "went inward"). The fix is the **virtuous circle**: system informs products AND products inform the system.

Binary checks (load `adoption-diagnosis` if any fail or the user asks about adoption/ROI):
- Does the loop run **both** directions (build-with AND contribute-back)?
- Is the system in a failure pole — **pattern police** (compliance-enforcing the product) or **product capture** (swept up in one product's whims)? Name neither, one, or which.
- Was an **interface inventory** run before standardizing (the audit + stakeholder buy-in tool)?
- Is **adoption/reuse** measured, not just consistency?

Reframe to apply: the system team's job is to "go **outwards**, be a service to the product org," at the tool level and "above all at a real human level."

## Governance rules (fire every review — Frost 2024)

- **Continuous improvement is mandatory.** "Set it up once and never touch it again" is "a recipe for disaster." A design-system feature isn't done until release path, docs, library status, VQA, and accessibility owners are clear.
- **You have agency** — change when new best practices are proven, with due diligence. Don't run governance theater; don't freeze the system.
- **Native/OS controls win by default** — don't reinvent OS-level controls for vanity styling ("a drop shadow the world has never seen" is not a reason to break with native).
- **Performance is design** — "design isn't how it looks, it's how it works" (Jobs, via Frost). Interactivity, animation, performance, font-loading, browser quirks are all part of the design; race competitors (WebPageTest) when someone wants 4 fonts × many weights.

## Guardrails

- Do not treat design systems as component inventories only. Workflow, trust, releases, and adoption are part of the system.
- Do not recommend broad token flexibility without naming and tiering rules — every token sits in exactly one tier (option/core, semantic, component/recipe); components consume the semantic tier, never raw core values. Load `token-taxonomy-and-ai-context` for the mechanics.
- Do not use consistency as the only success metric — measure adoption and reuse.
- Do not recommend standardizing components without first running (or referencing) an **interface inventory**.
- Do not recommend more governance/compliance to a **pattern-police** system — prescribe service-orientation (go outward) instead.
- Do not recommend component-by-component migration when a product-flow or page-area migration would produce clearer value and less visible fragmentation.
- Do not call a design-system feature done until the release path, docs, library status, VQA, and accessibility responsibilities are clear.
- Do not propose fine-tuning a model to generate on-grain UI when a light component/props/token "table of contents" as context is the correct tool. Keep AI claims agent-checkable, not hype.

## Notes

- Primary sources: Brad Frost, Nathan Curtis, Una Kravets, Steve Schoger, and Karri Saarinen.
- 2026-05-15 synthesis: `docs/research/youtube-library/analyses/2026-05-15_brad-frost_design-systems-product-outcomes_analysis.md` and `docs/research/youtube-library/analyses/2026-05-15_nathan-curtis_design-systems-operations_analysis.md`.
- 2026-06-11 enrichment (atomic-design + governance/adoption gap): `docs/research/youtube-library/analyses/2026-06-11_brad-frost_atomic-design_analysis.md` (2015 taxonomy, interface inventory, template-vs-page, lineage/DRY) and `docs/research/youtube-library/analyses/2026-06-11_brad-frost_is-atomic-design-dead_analysis.md` (2024 tokens, virtuous circle, pattern-police/product-capture, governance, performance-is-design, AI-on-grain). Atomic taxonomy + adoption + governance checks landed inline; token tiering/AI and adoption-diagnosis protocols in the two reference modules.
- Use Frost for product-outcome, taxonomy, adoption, and migration judgment. Use Curtis for operations, release, DRI, library matrix, and intake checks.
