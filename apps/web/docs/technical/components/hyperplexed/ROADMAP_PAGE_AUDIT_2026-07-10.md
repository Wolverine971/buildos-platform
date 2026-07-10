<!-- apps/web/docs/technical/components/hyperplexed/ROADMAP_PAGE_AUDIT_2026-07-10.md -->

# Roadmap Page Audit — 2026-07-10

## Scope

Public `/road-map` route: hero, status model, roadmap sections, product-boundary statement, CTA,
SEO metadata, responsive layout, and light/dark presentation.

## Baseline

The page still presented an August 2025 month-by-month delivery plan. Several “future” items had
already shipped, the December 2025 premium launch had not happened, and community activities sat
beside product capabilities as though they were equivalent roadmap commitments. The structure made
the page read as an expired project plan rather than a trustworthy public product roadmap.

## Findings and disposition

### Tier 1 — cheap, high-impact

1. **The primary status was an old date rather than a useful product horizon.** **Shipped:** the hero
   now names the current update date once and introduces four plain-language states: Shipped, Now,
   Next, and Exploring. The status guide uses normal foreground text on semantic tints. → P4+P5+P6+P19
2. **Roadmap labels mixed dates, vague phases, emoji, and inconsistent status language.** **Shipped:**
   section labels now use `.micro-label`; Lucide icons come through the shared wrapper and sit in
   fixed containers; headings say what the section means without requiring the legend. → P5+P6+P9
3. **The old cards repeated the same visual weight while long feature strings carried the whole
   hierarchy.** **Shipped:** every card has a title, one supporting description, explicit shrink
   behavior, and a consistent two-radius composition. → P1+P2+P4

### Tier 2 — structural within the surface

1. **The month-by-month timeline conflated history, current work, speculative ideas, and missed
   launches.** **Shipped:** the page now separates current capabilities from active work, near-term
   extensions, and evidence-gated exploration. Dates are used for page freshness, not invented
   delivery certainty. → P6
2. **Community operations and product outcomes appeared as buildable features.** **Shipped:** Discord,
   AMAs, “hand-holding,” fabricated completion scoring, heavyweight portfolio optimization, and
   silent auto-rescheduling are removed. A short Deliberate Boundaries panel explains the product
   posture directly. → P4+P6
3. **The page used its own narrow shell and padding scale.** **Shipped:** every region now aligns to
   `max-w-7xl mx-auto px-2 sm:px-4 lg:px-6`, with narrower copy constrained inside the shared shell.
   → P3
4. **The roadmap omitted major capabilities that had become central to BuildOS.** **Shipped:** the
   Shipped section now covers project memory, project-aware chat, Agent Runs/Operatives, graph and
   collaboration, public documents, search, recurrence, calendar, and MCP-connected agents.

### Tier 3 — polish/signature

No signature effect was added. Semantic Inkprint textures distinguish work horizons while the page
keeps the motion-free, public-information surface restrained.

## Verification

- ✅ `pnpm --filter @buildos/web check` — 0 errors, 0 warnings.
- ✅ Prettier on the route.
- ✅ Local 1440×900 light/dark verification: one main, one H1, no horizontal overflow.
- ✅ Local 390×844 light/dark verification: status guide stacks cleanly, cards remain in flow,
  document width equals viewport width, and all seven content regions retain full-width geometry.
- ✅ DOM accessibility pass: ordered heading hierarchy, labeled regions, decorative icons hidden,
  and both CTA links remain keyboard-focusable 44px targets.
- 🔶 After-state screenshots were captured in the in-app browser; a matching saved before-state
  screenshot was not available because the implementation followed the approved content assessment
  directly.

## Files changed

- `apps/web/src/routes/road-map/+page.svelte`
- `apps/web/docs/technical/components/hyperplexed/ROADMAP_PAGE_AUDIT_2026-07-10.md`
- `apps/web/docs/technical/components/hyperplexed/HYPERPLEXED_AUDIT_TRACKER.md`
