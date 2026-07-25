<!-- apps/web/docs/technical/components/hyperplexed/STYLE_SYSTEM_CONSOLIDATION_AUDIT_2026-07-24.md -->

# Style System Consolidation Audit — 2026-07-24

## Outcome

The cross-surface style consolidation is shipped and re-audited. Runtime Inkprint CSS is now the
canonical source, the public design-library package is generated from it, one-off typography is
blocked by a guardrail, and the two large chat shells use the shared modal presentation contract.
No confirmed Tier 1–3 regression remains in the implemented scope.

## Audited regions

| Region                              | Drift or duplication found                                                                               | Resolution                                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Inkprint runtime and public library | Runtime and downloadable CSS could evolve independently                                                  | Added a deterministic sync/check workflow; runtime CSS is authoritative                                             |
| Type scale                          | Repeated 8–13px arbitrary utilities and duplicated responsive sizes                                      | Mapped all Svelte typography to the canonical Tailwind/Inkprint scale; `micro-label` and `text-2xs` resolve to 11px |
| Modal shells                        | Agent and Brief chat repeated presentation behavior; non-scroll content lost flex sizing                 | Consolidated on `Modal` immersive presentation and restored the min-height-aware flex column contract               |
| Modal touch and overflow            | Small close targets and shrink-unsafe Brief header/panes                                                 | Raised shared and Brief close targets to 44px; added `min-w-0` and responsive divider ownership                     |
| PWA chrome                          | Theme hex values were duplicated in TypeScript; the installed body hid its scrollbar                     | `app.html` now owns browser theme colors; script reads the matching meta tag; page scrollbar remains visible        |
| Semantic surfaces                   | Time blocks, SMS monitoring, graph controls, and docs mixed literal/palette styling with semantic tokens | Moved themed UI to Inkprint semantic colors and contrast-aware foreground selection                                 |
| Design-system reference             | Mobile comparison matrix scrolled without an affordance                                                  | Added a labeled, keyboard-focusable scroll region, mobile cue, and retained scrollbar styling                       |

## Guardrails

- `guardrails:styles` verifies the generated public package matches runtime CSS.
- Arbitrary `text-[…]` utilities are rejected in Svelte files.
- The guard rejects cross-component modal CSS, duplicated PWA theme literals, hidden installed-PWA
  page scrollbars, and loss of the non-scroll modal flex contract.
- Component-scoped keyframes and integration-specific `!important` rules remain local where they
  are required; no global animation collision was found.

## Hyperplexed mapping

- **P1:** shrink-safe modal panes and a clear horizontal-scroll affordance.
- **P2:** shared radius and surface primitives replace local shell styling.
- **P5:** one readable 11px micro-label contract replaces one-off micro type.
- **P11:** motion ownership and reduced-motion handling remain centralized.
- **P13:** 44px close targets and keyboard-accessible overflow regions.
- **P19:** semantic light/dark tokens and contrast-aware event foregrounds.

## Verification

- Official Svelte analyzer run across all 191 changed Svelte components; components changed in the
  final correction pass are clean. Existing sanitizer-aware `{@html}` and intentional reset-effect
  notices were reviewed rather than mechanically rewritten.
- `svelte-check`: **0 errors, 0 warnings**.
- Vitest: **478 files, 2,948 tests passed**.
- Production Vercel build: **passed**. Optional non-host Sharp platform packages emitted the known
  dependency-discovery warning; the installed target build completed.
- Public Inkprint reference inspected at 1440 × 1000 and 390 × 844 in light and dark themes.
  At 390px: document overflow is **0px**, the comparison matrix remains internally scrollable, the
  default browser theme meta resolves to `#fbfaf9` / `#1d1c1b`, and micro-labels compute to **11px**.
- Style sync/ownership contracts and `git diff --check`: passed.

## Remaining verification boundary

The authenticated Brief Chat composition still merits a real-session desktop/iPhone light/dark
smoke pass. Its shared shell contract, compile diagnostics, and full component/unit suite pass; this
is a verification boundary, not a known defect. Visualization palettes and third-party integration
overrides remain intentionally local rather than being forced into semantic status colors.
