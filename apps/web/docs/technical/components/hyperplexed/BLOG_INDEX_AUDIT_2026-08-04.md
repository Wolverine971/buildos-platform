<!-- apps/web/docs/technical/components/hyperplexed/BLOG_INDEX_AUDIT_2026-08-04.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-04; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Blog Index Hyperplexed Audit — 2026-08-04

## Scope

`/blogs`, centered on `src/routes/blogs/+page.svelte` and the route's search/filter state test.
The pass covered the public shell handoff, discovery hero, search, category filters, latest article,
article grid, progressive disclosure, search results, empty states, and footer handoff.

This stacks on the blog accessibility and card-contract work already shipped in
[`PUBLIC_WEB_FOUNDATION_AUDIT_2026-07-09.md`](./PUBLIC_WEB_FOUNDATION_AUDIT_2026-07-09.md).
The goal was a deeper density and hierarchy pass, not a visual redesign.

## Baseline

At 390 × 844, the hero and always-visible category pills consumed 477px before the first article
(236px hero + 241px filters). Only part of the latest article fit in the first viewport, and all 59
articles produced a 14,822px default document. Desktop was orderly but visually flat: the latest
article read as a wider version of the same card, and the remaining grid had no section-level
orientation.

## Tier 1 — cheap, high-impact (alignment/padding/labels)

- **Discovery hero:** generous mobile padding delayed the content without adding meaning. Compact
  the shell while retaining the existing message and search control. → P3+P4
- **Latest article:** add one restrained `Latest` micro-label, give the card the correct elevated
  weight, and shorten `Read article` to contextual `Read latest`. → P4+P5+P6
- **Article grid:** add `Keep reading` / `More articles` orientation plus a quiet count; shorten the
  repeated card affordance to `Read`. → P4+P5+P6
- **Card metadata:** keep category/date rows shrink-safe and use a two-line phone description cap so
  long copy cannot distort card geometry. → P1+P4

## Tier 2 — structural within the surface (declutter/hierarchy)

- **Mobile filters:** replace the 241px always-open pill field with one 44px `Filters` disclosure.
  The expanded panel remains a clear two-column choice set, closes on selection, and leaves the
  active category visible as a removable chip. Desktop keeps the pills because they fit. → P7+P8+P13
- **Default article run:** render the latest article plus 12 grid articles (four complete desktop
  rows) by default, with one 44px show-all/show-fewer control. Search and category result sets remain
  complete, so discovery is not hidden. → P7+P8+P13
- **Search and empty states:** provide one clear-search path, keep the result count in a focused live
  region, and repair the no-results/no-content heading level. → P6+P8+P13

## Tier 3 — polish/signature

- No signature effect was added. The surface earns more from calmer scanning and reduced default
  length than from animation; existing `.pressable` feedback remains the only motion. → P11

## Shipped result

| Evidence                                          |    Before |     After |
| ------------------------------------------------- | --------: | --------: |
| 390 × 844 hero height                             |     236px |   217.5px |
| 390 × 844 default filter height                   |     241px |      69px |
| 390 × 844 default document height                 |  14,822px |   4,045px |
| Articles rendered by default                      |        59 |        13 |
| Article regions entering the first phone viewport |         1 |         2 |
| 1440 × 900 default document height                |   5,836px |   2,077px |
| Horizontal overflow at 390 / 1440                 | 0px / 0px | 0px / 0px |

The explicit show-all state restores all 59 articles and measures 13,377px at 390px wide with zero
horizontal overflow. Selecting `Source Analyses` closes the filter panel, exposes one removable
selected-state chip, and renders all 30 matching articles. A no-match search exposes one clear
action, an H2 empty heading, and a result-only live region.

## Verification

- ✅ Before and after states captured live at 1440 × 900 and 390 × 844 in light and dark mode.
- ✅ One main landmark, one H1, and zero horizontal overflow at both widths.
- ✅ Mobile filter open/select/clear state, default show-all/show-fewer state, search/no-results/clear
  state, and complete 59-article expansion verified in the browser.
- ✅ Fresh isolated-preview smoke reports no browser console warnings or errors.
- ✅ Svelte autofixer clean after formatting.
- ✅ Focused route suite: 4 tests pass (URL-owned search state, filter disclosure, article
  disclosure, and no-results semantics).
- 🔶 Full `pnpm --filter @buildos/web check` reaches repository diagnostics and reports 4 errors / 0
  warnings, all in the unrelated `src/lib/services/agentic-chat-v2/last-turn-context.ts` re-export;
  no `/blogs` diagnostic is reported.

## Deferred

None from this surface. Pagination or server-backed search would be a separate product/performance
decision; this pass preserves the current in-memory search and complete filtered result behavior.
