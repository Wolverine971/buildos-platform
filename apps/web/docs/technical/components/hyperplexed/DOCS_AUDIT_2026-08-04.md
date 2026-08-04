<!-- apps/web/docs/technical/components/hyperplexed/DOCS_AUDIT_2026-08-04.md -->

# Public Docs Audit — 2026-08-04

**Status:** Tier 1–3 remediation shipped and live-verified locally.

## Scope

- `/docs` index and its task-oriented entry paths.
- Shared docs shell and responsive section navigation.
- `/docs/[slug]` article header, prose overflow, and previous/next navigation.
- Static and live review at 320, 390, and 1440 CSS pixels in light and dark mode.

This pass stacks on `BUILDOS_HEALTH_AUDIT_2026-07-16.md`, which had already removed the nested
`<main>` landmark from the docs layout. The single-main fix remains intact.

## Region inventory

1. Public site header and docs shell.
2. Desktop section rail and mobile section navigator.
3. Docs index hero.
4. Task-oriented featured paths.
5. Complete guide library.
6. Article breadcrumb, title, summary, and metadata.
7. Markdown content and wide-content overflow.
8. Previous/next and return navigation.

## Tier 1 — cheap, high-impact

- **Shell:** the docs wrapper used a one-off `max-w-6xl` plus `px-4/6/8`, leaving its edges inset
  from the public shell. It now uses the shared `max-w-7xl` and `px-2 sm:px-4 lg:px-6` contract.
  → P3
- **Navigation:** docs links were 32px tall, used bare `rounded`, and lacked the full visible-focus
  contract. Every section link is now a 44px, `rounded-md`, shrink-safe target with an explicit
  focus ring and active-page semantics. → P1+P2+P13
- **Labels and icons:** hand-rolled uppercase labels and 14px icon boxes drifted from Inkprint.
  Labels now use `.micro-label`; icons sit in fixed 16px or 40px containers and route through the
  local Lucide wrapper. → P5+P9
- **Article metadata:** the visible update value exposed the full ISO timestamp. It now reads like
  `Updated Apr 17, 2026` while preserving the machine-readable `datetime`. → P4+P6
- **Article navigation:** breadcrumb, previous/next, and “All docs” links now have bounded titles,
  44px targets where compact controls are used, visible focus, and reduced-motion-safe transitions.
  → P1+P11+P13

## Tier 2 — structural within the surface

- **Mobile shell:** the entire eleven-link docs rail was placed after the page content. On `/docs`
  it began around 3,954px down the page, so navigation was functionally absent when users needed it.
  A compact native `<details>/<summary>` navigator now appears before content and keeps the current
  section visible without an overlay or custom focus management. → P8+P13
- **Index hierarchy:** the hero offered two competing actions, including “Start in chat” pointing to
  registration, and a five-card capability map repeated concepts before the actual guide library.
  The index now offers one truthful “Read getting started” action, three task-oriented paths, then
  the complete guide list. → P6+P8
- **Featured paths:** tiny primary links and chip-like secondary links fell below the touch-target
  floor. Paths now use one obvious 44px primary guide and 44px related-guide links with explicit
  overflow handling. → P1+P4+P13
- **Markdown content:** wide preformatted blocks and tables relied on chance at phone widths. Both
  now declare bounded horizontal overflow inside the content region. → P1

## Tier 3 — polish and restraint

- **Hero:** the looping brand video and layered atmosphere treatment made the documentation entry
  feel like another marketing hero and ignored the reduced-motion preference at the media source.
  A static, fixed-container Book icon and one semantic Frame texture now provide a quieter
  orientation moment with no ambient motion. → P9+P11
- **Cards:** hover feedback now changes color and border without translating arrows or adding a
  second signature effect. The documentation hierarchy, not motion, carries the page. → P11

No new P-pattern was required.

## Shipped result

- Unified the docs shell with the public `max-w-7xl` geometry.
- Replaced the mobile bottom-of-page rail with a compact, native, top-of-page navigator.
- Reduced the index from hero + two CTAs + paths + capability map + library to hero + one CTA +
  paths + library.
- Removed the autoplaying hero video and kept one restrained Inkprint texture per surface.
- Standardized radius, micro-label, icon-container, focus, touch-target, overflow, and
  reduced-motion contracts across the index, rail, breadcrumb, and pagination.
- Formatted article dates for people and preserved semantic timestamps for machines.
- Added explicit overflow containment to docs code blocks and tables.

The result is also materially denser without feeling cramped:

| Viewport | Before page height | After page height | Change |
| -------- | -----------------: | ----------------: | -----: |
| 390px    |            5,154px |           3,871px |   -25% |
| 1440px   |            2,973px |           2,188px |   -26% |

## Verification

- **Responsive:** `/docs` and `/docs/getting-started` have zero document-level horizontal overflow
  at 320, 390, and 1440px.
- **Structure:** one `<main>` and one H1 on the index and article route.
- **Mobile navigator:** opens natively; all eleven links measure 44px; the active guide is announced
  with `aria-current="page"`.
- **Themes:** index and article surfaces were checked in light and dark mode. After-state browser
  captures were taken at 1440×900 and 390×844; the before-state is recorded by DOM and geometry
  measurements rather than a committed screenshot artifact.
- **Formatting:** scoped Prettier and `git diff --check` pass.
- **Lint:** scoped ESLint passes with zero warnings or errors.
- **Svelte compiler:** the final repository-wide `pnpm --filter @buildos/web check` reaches only four
  unrelated export errors in `src/lib/services/agentic-chat-v2/last-turn-context.ts`; it reports no
  docs diagnostics. The official Svelte autofixer was attempted, but its external reference fetch
  was not permitted because it would transmit the local components to `svelte.dev`.

## Deferred

- A committed visual-regression fixture would make future before/after comparisons durable. This
  audit verified the real route in-browser but did not add screenshot infrastructure.
