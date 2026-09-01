<!-- apps/web/docs/technical/components/hyperplexed/CROSS_SURFACE_UI_AUDIT_2026-09-01.md -->

<!-- doc-status: point-in-time -->

# Cross-surface UI audit — 2026-09-01

## Outcome

BuildOS has a strong Inkprint foundation, but the remaining UI debt is systemic rather than isolated:
motion ownership, touch targets, mobile data presentation, and a few first-run surfaces were the
highest-leverage problems. This pass audited the full route/component inventory, repaired the
shared primitives that propagate across the product, polished the onboarding surfaces, and added a
mobile card presentation to the primary admin security event stream.

The result is a meaningful first repair batch, not a claim that every authenticated state has been
visually signed off. The remaining work is explicitly prioritized below.

## Scope and method

- Static inventory: 108 `+page.svelte` routes and 355 shared Svelte components.
- Reviewed modal primitives and the existing modal audit backlog before touching leaf modals.
- Reviewed shared controls, onboarding v2/v3, auth, dashboard/admin hotspots, and the prior design,
  mobile, and onboarding audits.
- Live-smoked the public login surface at 1440 px and 390 px in dark mode; the 390 px page had no
  horizontal overflow. The public homepage also rendered cleanly at 1280 px in light mode.
  Authenticated and full phone light-mode capture coverage remains open.
- Ran repository-wide heuristic scans after the repair batch. Counts include admin and design-system
  examples, so they identify hotspots rather than representing 184 independent user-facing bugs.

| Heuristic                                                                   | Remaining occurrences |
| --------------------------------------------------------------------------- | --------------------: |
| `transition-all`                                                            |                   184 |
| large radii (`rounded-xl` / `2xl` / `3xl`)                                  |                   144 |
| pressable controls with a second transition/duration owner on the same line |                   367 |
| raw Tailwind palette text colors                                            |                   220 |
| arbitrary tracking values                                                   |                   135 |

## Tier 1 — trust and interaction defects

### Shared controls animated too much (P11, P26) — fixed in the foundation

`Button`, `TextInput`, `Textarea`, and `Select` used `transition-all`, which can animate layout and
texture changes and can conflict with the shared `pressable` transform owner. They now transition
only the visual properties they actually change and opt out under reduced motion. Loading spinners
also stop under reduced-motion preferences.

The style guardrail now rejects `transition-all` in the core control and modal primitives so the
problem does not silently return.

### Compact dismiss actions missed the 44 px mobile target (P13) — fixed

The `FormModal` and closeable `Alert` dismiss actions now retain a 44×44 px target with a visible
focus treatment. `Modal`, `FormModal`, and the touched controls also use the shared Lucide wrapper.

### Onboarding motion ignored user preferences (P11) — fixed

The v2/v3 first-run transitions and pulsing/spinning states now honor reduced motion. Interactive
links, prompt chips, change-answer actions, and verification actions use full mobile touch targets.

## Tier 2 — hierarchy, responsive layout, and mode resilience

### First-run cards were too soft and inconsistently layered (P2, P5, P19) — fixed

The onboarding surfaces now use the two-radius system, canonical micro-labels, semantic status tint
text, and texture classes on the actual card instead of absolutely positioned overlay children.
Mobile padding and wrapping were tightened, inputs retain readable phone sizing, and the ready-state
copy now describes the product's brain-dump workflow directly.

### Security events depended on a wide table on phones (P12) — partially fixed

The primary live security event stream now renders a compact mobile card with event, time, category,
severity, outcome, actor, target, and reason; the table remains the desktop presentation. Other
secondary tables on the security page still need the same treatment.

### Broad visual debt remains concentrated (P1, P2, P11, P26) — open

The scan shows that blanket transitions and competing press feedback remain the largest cross-page
craft issue. The highest-value next targets are `Navigation`, `DocumentModal`, time/calendar
controls, and the dashboard modal family. Large-radius and palette hits should be reviewed in
context: many live in admin/design-system surfaces, where a mechanical replacement would be worse
than a deliberate pass.

## Tier 3 — signature effect

No new signature animation was added. The right move in this pass was restraint: fix hierarchy,
touch, motion, and mode contracts before introducing more visual movement.

## Shipped in this pass

- Shared primitives: `Button`, `TextInput`, `Textarea`, `Select`, `Alert`, `LoadingSkeleton`,
  `Modal`, and `FormModal`.
- First-run flow: v2 project capture and phone verification; v3 intent/stakes, notifications, and
  ready state; legacy onboarding modal radius cleanup.
- Admin security: responsive card fallback for the main live event stream.
- Regression protection: shared style-contract checks for explicit motion and 44 px dismiss targets.

## Verification

- `pnpm --filter @buildos/web check`: 0 errors, 0 warnings.
- `pnpm --filter @buildos/web guardrails:styles`: pass.
- Focused tests: `WelcomeModal` 2/2, `TextareaWithVoice` 2/2,
  `ProgressIndicatorV3` 2/2, onboarding server flow 7/7.
- `git diff --check`: pass.
- The official Svelte autofixer passed on `Button.svelte`. Batch autofixing was blocked because the
  tool exports component source to `svelte.dev`; no source was sent after that sandbox rejection.
- A broad test command also surfaced two unrelated pre-existing failures in agentic-chat catalog
  size/snapshots; neither overlaps this UI patch.

## Next repair order

1. Resolve P26 press/transition conflicts in `Navigation`, `DocumentModal`, and time/calendar UI.
2. Finish mobile card fallbacks for the remaining admin security tables.
3. Audit and repair the dashboard modal family as one system.
4. Run authenticated 390/1440 light/dark captures across onboarding, dashboard, project, briefs,
   and settings states.
5. Address the shell mobile bottom-navigation structural item from the mobile audit.
