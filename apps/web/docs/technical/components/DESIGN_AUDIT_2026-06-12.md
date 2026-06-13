<!-- apps/web/docs/technical/components/DESIGN_AUDIT_2026-06-12.md -->

# BuildOS Complete Design Audit — 2026-06-12

Full-system design audit: color theory, contrast math, hierarchy, rhythm, spacing, proportion, repetition, white space, plus design-system bugs. Audited against the Inkprint design system (`apps/web/src/lib/styles/inkprint.css`, `tailwind.config.js`) and the canonical brand docs.

**Overall verdict:** The Inkprint foundation is genuinely good — a coherent warm-paper/ink identity with a thought-through semantic layer (textures, weights, shadows) that most design systems never reach. The problems are not in the system's design; they're in (1) light-mode contrast math, (2) a split-brained radius story, (3) micro-typography anarchy in the metadata layer, and (4) a large raw-Tailwind status-color shadow palette that means users mostly never see the carefully tuned Inkprint status hues.

---

## 1. The intended vibe (doc synthesis)

The canonical aesthetic target (per `INKPRINT_DESIGN_SYSTEM.md` Dec 2025, `BUILDOS_BRAND_AESTHETIC_COMPLETE.md` Jan 2026, `SPACING_BORDER_STANDARDS.md` Jan 2026): **workshop/letterpress — ink on warm paper, field notes, halftone printing.** Warm, tactile, intentional; "empire builder" energy expressed through craftsmanship rather than tech-gloss. Paper-not-glass: crisp borders and ink shadows, explicitly rejecting glassmorphism and gradients. Texture carries meaning (bloom=ideation, grain=execution, pulse=urgency, static=blockers, grid=writable). Marketing follows "receipts over vibes" — real screenshots, real founder footage, no AI imagery.

### Stale docs actively teaching the wrong thing

| Doc                         | Problem                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BUILDOS_STYLE_GUIDE.md`    | Teaches blue→purple gradients, glassmorphism (pre-Inkprint, Oct–Nov 2025)                                                                                                      |
| `DESIGN_SYSTEM_GUIDE.md`    | Same era; gradient buttons, cool grays                                                                                                                                         |
| `DESIGN_REFACTOR_STATUS.md` | Tracks a refactor that has since been superseded                                                                                                                               |
| `MODAL_STANDARDS.md`        | Svelte 4 syntax (`export let`, `slot=`, `on:click`) + raw `bg-blue-600`/`text-gray-700`; padding spec drifted from the living convention (`px-3 sm:px-4 lg:px-6 py-3 sm:py-4`) |

Anyone (human or agent) following these literally produces non-Inkprint code. **Recommend: add a STALE banner at the top of each pointing to INKPRINT_DESIGN_SYSTEM.md, or delete.**

---

## 2. Color & contrast (computed WCAG 2.1 ratios)

### 2a. Confirmed contrast failures in the token layer

**Light mode:**

| Pair                                 | Ratio                 | Notes                                                                                                                |
| ------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| accent-foreground / accent           | **2.89:1**            | White on orange — fails on every primary CTA. Dark mode already solved this correctly (dark ink on orange = 6.41:1). |
| accent / background                  | 2.78:1                | `text-accent` body text on paper fails                                                                               |
| warning / background                 | **1.61:1**            | Yellow text on paper unreadable — never allow `text-warning` in light mode                                           |
| success / background                 | 2.97:1                |                                                                                                                      |
| info / background                    | 2.92:1                |                                                                                                                      |
| success-foreground / success         | 3.09:1                |                                                                                                                      |
| info-foreground / info               | 3.04:1                |                                                                                                                      |
| destructive-foreground / destructive | 4.42:1                | borderline                                                                                                           |
| muted-foreground / card              | 4.50:1, /muted 4.14:1 | borderline                                                                                                           |
| border / background                  | 1.43:1                | fine for decorative card edges; fails WCAG 1.4.11 for inputs/controls                                                |

**Dark mode:**

| Pair                                 | Ratio      | Notes                                                                       |
| ------------------------------------ | ---------- | --------------------------------------------------------------------------- |
| success-foreground / success         | **2.34:1** | White on green — status colors got lighter in dark mode but kept white text |
| info-foreground / info               | **2.52:1** | Same problem                                                                |
| destructive-foreground / destructive | 3.73:1     | borderline                                                                  |
| muted-foreground / muted             | 4.39:1     | borderline                                                                  |

**The unifying rule that fixes most of this:** any status surface at L≥50 takes the dark-ink foreground (`30 10% 12%`-style), as accent and warning already do in dark mode. Apply uniformly:

1. Light `--accent-foreground`: white → dark ink (2.89 → ~7:1). One line, fixes every CTA.
2. Dark `--success-foreground` and `--info-foreground`: white → dark ink.
3. Darken light-mode status colors used as text: success L42→~36, info L52→~45, destructive L52→~47.
4. Add `--border-strong` (~L62 light / ~L40 dark) for input/control boundaries; keep `--border` for decorative edges.
5. Nudge `--muted-foreground`: light L45→43, dark L58→62 (clears all borderline failures, visually invisible).

### 2b. Color harmony assessment

- **Warm/cool architecture is sound.** Paper 40° vs ink 240° is the classic letterpress relationship. Status hues bias warm (6°, 24°, 45°) with cool counterweights (150°, 200°). Info at 200° (teal-leaning, not candy blue) is the right call for warm paper.
- **Deuteranopia collision: destructive (6°) vs accent (24°).** Only 18° apart, nearly identical lightness in light mode (L52 vs L55). Under deuteranopia both collapse to brownish-yellow with no lightness cue. Darkening destructive (fix #3 above) opens the luminance gap. Also: destructive UI should always pair color with icon/label.
- **Accent vs warning is safe** despite 21° separation — the ~1.7× luminance gap survives colorblindness.
- **Success is the runt of the palette** (S55/L42 light): muted AND dark, reads slightly gray next to its siblings. Worth a small lift.
- Dark-mode lightness landing zone is tight and intentional (58/58/58/60) except success at 50 — bring into the band.

### 2c. The shadow palettes (token bypass sweep)

**4,787 raw Tailwind palette classes** in `apps/web/src` vs ~15,700 semantic token usages. Two distinct shadow systems:

1. **Raw status palette has displaced the semantic status tokens almost entirely.** red 931 + emerald 847 + amber 701 + green 309 + rose 230 + yellow 78 ≈ 3,100 raw status usages vs ~135 total uses of bg/text-success/warning/info/destructive variants. **Status coloring bypasses Inkprint ~85% of the time** — the tuned terracotta/sage/teal hues are invisible in most of the product; users see stock red-500/emerald-500.
2. **A residual cool blue/purple brand** (blue 793 + purple 315 + indigo 158 + sky 140 + violet 45 = 1,451) competes with the orange accent — heaviest in admin/beta, homework runs, time-blocks, analytics, email components. This is the old pre-Inkprint identity still alive in the codebase.

Distribution: admin + design-system pages hold 47%, but **`lib/components` (user-facing) holds 44%** — not just a backstage problem.

Worst offenders: `routes/homework/runs/[id]/+page.svelte` (141), `ontology/DocumentModal.svelte` (133), `routes/admin/beta/+page.svelte` (129), `admin/UserContextPanel.svelte` (118), `ontology/graph/NodeDetailsPanel.svelte` (106).

**318 hardcoded hex values** in .svelte files — mostly charts/graphs (`TimeAllocationPanel` 74, SMS monitoring charts 111 combined, G6Graph 23, TreeAgentGraph 19). Should read CSS vars so dark mode and any rebrand propagate.

---

## 3. Hierarchy, rhythm, proportion (component audit)

### 3a. Micro-typography anarchy — the #1 rhythm failure

**1,362 arbitrary `text-[...]` font sizes, 23 distinct values, 12+ distinct sizes between 7px and 11px**: `text-[10px]` ×384, `text-[0.65rem]` ×317, `text-[11px]` ×259, `text-[0.6rem]` ×182, `text-[0.55rem]` ×88, `text-[9px]` ×31, `text-[0.5rem]` ×30…

The metadata layer (chips, timestamps, counts, eyebrows) is the app's most-repeated visual element and it's rendered differently per file. `.micro-label` exists (0.65rem/0.15em) but loses to hand-rolling ~12:1 (88 uses vs ~760 hand-rolled equivalents across 9 distinct letter-spacing values). The landing page alone hand-rolls the eyebrow pattern ~30 times with 3 font sizes × 5 trackings.

**Fix:** add `text-2xs` (e.g. 0.6875rem/11px) and optionally `text-3xs` to the Tailwind scale, promote `.micro-label`, then ban `text-[` via lint or review convention.

### 3b. The radius system is split-brained

Three sources of truth disagree:

- Tailwind override: `rounded-lg` = **12px** (used 1,601×)
- Weight classes: wt-ghost 12px, wt-paper/wt-card **8px**, wt-plate **6px**
- 55 elements stack `rounded-*` on top of `wt-*` — and because `inkprint.css` is imported **before** `@tailwind utilities` (`app.css:5-9`), the Tailwind utility silently wins, defeating weight semantics.

Concrete symptoms:

- `Modal.svelte:160` comment claims `rounded-lg // 0.5rem` — wrong twice (it's 12px, and the element also carries `wt-plate` = 6px). Modals render at 12px believing they're plates.
- Buttons (`rounded-lg` = 12px) are rounder than the 8px cards containing them — inverted proportion (inner radius should be ≤ outer).
- Navigation mixes 6px, 8px, and 12px controls in one 64px bar (`Navigation.svelte:521` vs `:584` vs `:442`).
- Hand-rolled cards (`ProjectHeaderCard.svelte:63`, dashboard invite cards) are 12px next to Card-primitive 8px siblings.

**Fix:** pick one story. Cleanest: declare a 3-tier radius vocabulary (controls 8px / cards 8px / modals-hero 12px or follow weight semantics), align the Tailwind `rounded-lg` value or the wt-_ radii with it, and strip stacked `rounded-_`from`wt-\*` elements.

### 3c. The 8px grid doesn't exist — the real grid is 2px

~2,900 fractional spacing utilities (`p-1.5` ×534, `gap-1.5` ×440, `py-1.5` ×342, `mt-0.5` ×329, `py-0.5` ×311, `px-2.5` ×175…) vs ~7,000 whole-step. Seeded by the primitives themselves: Button md bakes in `py-2.5` (`Button.svelte:51`), Card sm is `p-2.5 sm:p-3` under a comment claiming "8px grid." Individually invisible; collectively why sibling rows never quite align and no two cards breathe the same.

**Fix:** accept reality and declare a 4px grid with documented half-step exceptions, OR fix the primitives first (they cascade) and converge opportunistically. Don't keep claiming 8px.

### 3d. No committed weight hierarchy

`font-medium` (1,603) and `font-semibold` (1,571) are statistically interchangeable for identical roles. Nav links are `font-bold tracking-tight` while every Button primitive is `font-semibold` — the shell speaks a heavier dialect than the system. Dropdown items mix bold/semibold at one tier. In an interface dominated by text-xs/text-sm, weight is the primary hierarchy lever and it currently carries no signal.

**Fix:** commit to a role table (e.g. page title = semibold, section header = semibold smaller, body = normal, emphasis/labels = medium, bold reserved for brand moments) and align nav to the Button dialect.

### 3e. Dominance collapses on mobile

- Project title is `text-sm sm:text-xl` (`ProjectHeaderCard.svelte:74`) — on phones, the page's namesake element is the same size and weight as a task row title.
- Modal titles are `text-sm font-semibold` (`Modal.svelte:640`) — identical to list items inside the modal body. No step between chrome and content.
- Dashboard h1 is one step above its sections; everything below is a uniform xs/sm field.
- Inverted responsive type exists: `text-sm sm:text-xs` (6 instances repo-wide) — text shrinking as screens grow.
- The scale has a hollow middle: text-xs+sm = 5,085 uses vs text-base = 243.

**Fix:** give every view exactly one dominant element. Minimum: project title ≥ `text-lg` on mobile, modal titles `text-base`, kill the inverted responsive sizes.

### 3f. White space & containers — mostly good

Dashboard, projects list/detail, history, profile share an identical frame: `max-w-7xl px-2 sm:px-4 lg:px-6 py-2 sm:py-4 lg:py-6`. Real repetition discipline. Outliers: briefs (`max-w-6xl px-4`), time-blocks (`px-3`), and the nav adds `xl:px-8` that pages don't have — nav content misaligns with page content by 8px at ≥1280px (`Navigation.svelte:407`).

Landing page (`HomepageV2.svelte`) is the best-composed surface: hero `text-4xl→6xl semibold tracking-tight` over `text-base/lg` lede, consistent section skeleton (`max-w-6xl px-4 py-12 sm:py-16`). The 6xl-marketing/7xl-app split is defensible.

---

## 4. Confirmed bugs (with fixes)

> **Status 2026-06-12:** Bugs #1–#10 FIXED same day (CSS compile verified). Remaining: #11 (MODAL_STANDARDS rewrite) and #12 (4 modal bypassers) — folded into Tier 2/3 work. Note: the `$ui` alias (#10) was fixed by pointing it at `src/lib/components/ui` rather than deleting it; CLAUDE.md's alias description now matches reality only after this change.

| #   | Bug                                                                                                                                                                                                                                 | Severity  | Fix                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `app.css:86` `:global(...)` in plain CSS — invalid pseudo-class, entire rule dropped by browsers. Dead weight; would _conflict_ with the Tailwind-styled skip link if ever valid                                                    | Low       | Delete app.css:86–95                                                                                  |
| 2   | `inkprint.css:439-448` `.float-left/.float-right` shadow Tailwind core utilities **with surprise margins**. One current usage survives by coincidence (`AgentMessageList.svelte:299`); next `float-right` user gets phantom margins | Medium    | Rename to `.ink-float-*` (Mode B variant has zero consumers — free)                                   |
| 3   | Admin migration pages: `bg-gray-900 ... text-foreground` (`routes/admin/migration/users/[userId]/+page.svelte:584`, `errors/+page.svelte:436`) — in light mode, near-black ink on near-black bg = invisible text                    | Medium    | `bg-muted text-foreground` or `text-gray-100`                                                         |
| 4   | Public docs page dark-mode hover flash: `bg-muted ... hover:bg-gray-300` (`routes/docs/api/+page.svelte:23,30,37`) — dark surface flips light on hover                                                                              | Medium    | `hover:bg-muted/80`                                                                                   |
| 5   | `CalendarConnectionOverlay.svelte:61,67` at `z-[100]` while modals sit at 9999 — any modal covers this "blocking" overlay. Also `TimeBlockCreateModal.svelte:182` passes meaningless `z-[100]`                                      | Medium    | Lift into the modal band; define a documented z-scale (overlay 90 / modal 100 / menu 110 / toast 120) |
| 6   | Duplicate ink animation systems: `tailwind.config.js:100-122` AND `inkprint.css:522-550` both define `animate-ink-in/out` (identical timing today, will drift)                                                                      | Low       | Delete inkprint.css:522–550                                                                           |
| 7   | Hand-rolled `line-clamp-1..4` in `app.css:153-186` duplicate Tailwind ≥3.3 core (project is on 3.4)                                                                                                                                 | Low       | Delete the block; 112 usages unaffected                                                               |
| 8   | `prose-slate` leaks cool gray into `lead`, `figcaption`, `kbd` (the only prose elements the custom typography config doesn't override) on warm paper, both modes                                                                    | Low       | Drop `prose-slate`; add `--tw-prose-lead/captions/kbd` to DEFAULT + invert configs                    |
| 9   | `dark:!bg-gray-800` / `dark:!bg-gray-700` overrides fighting tokens (`SvelteFlowGraph.svelte:203`, `EmailManager.svelte:324`)                                                                                                       | Low       | Drop the dark overrides; tokens already flip                                                          |
| 10  | Dead `$ui` alias: `svelte.config.js` points to `src/lib/ui` which doesn't exist (primitives live in `src/lib/components/ui/`); CLAUDE.md also documents it                                                                          | Low       | Fix the alias or delete it + update CLAUDE.md                                                         |
| 11  | `MODAL_STANDARDS.md` teaches Svelte 4 + pre-Inkprint colors                                                                                                                                                                         | Med (doc) | Rewrite to Svelte 5 + tokens, codify the living padding convention                                    |
| 12  | 4 modals bypass the base Modal (`BriefChatModal` hand-rolls overlay + unique `rounded-t-2xl md:rounded-lg`, `ErrorDetailsModal`, `OnboardingModal`, `WelcomeModal`)                                                                 | Low       | Migrate to base Modal                                                                                 |

**Denied suspicions** (checked, clean): texture PNGs exist; no widespread dark-mode gaps (0 standalone `dark:bg-gray-800/900` surfaces, 0 `text-gray-900`-without-dark); no `bg-card`+`text-gray-*` mixing; focus coverage is strong (global `:focus-visible` + 688 ring usages).

---

## 5. What you're doing right (keep doing / do more of)

1. **Shadow/elevation discipline: 98.8% Inkprint** (990 shadow-ink\* vs 12 stock Tailwind shadows). The most consistently applied part of the system.
2. **Modal architecture: 54/56 modals on the base component**, and the base is excellent engineering (modal stack Escape routing, inert backgrounds, focus-trap re-query, reduced-motion).
3. **The Card primitive's semantic design** — variant→texture/weight mapping with bg separated from weight. The system was _thought_, not just themed.
4. **Texture semantics honored** — tx-grid ("writable") consistently on inputs; texture grammar (::before) kept separate from atmosphere (::after).
5. **Page-container repetition** across all core app routes.
6. **Dark mode at the token layer** — near-zero hand-rolled dark surfaces; the dark palette's warm charcoal is tonally consistent with light paper.
7. **Landing-page composition** — textbook dominance, repeating section skeleton.
8. **Dark-mode accent already uses ink-on-orange** — the correct pattern; light mode just needs to follow it.
9. **A11y plumbing**: 44px touch floors in primitives, global focus-visible ring, reduced-motion handling everywhere, scrollbar-gutter, safe-area insets.

**Do more of:** the weight system (wt-_) and spatial tokens (sp-_, atmo) are well-designed but barely used compared to their potential — they're the differentiated part of Inkprint. **Do less of:** hand-rolling card chrome, per-file micro-type, raw status colors.

---

## 6. Prioritized action plan

**Tier 1 — token-layer one-liners — ✅ DONE 2026-06-12:**

1. ✅ Light `--accent-foreground` → ink `30 6% 11%` (2.89 → 5.87:1 on every CTA).
2. ✅ Dark `--success/--info/--destructive-foreground` → ink (7.28 / 6.72 / 4.55:1) — uniform "L≥50 takes ink" rule now holds across all status colors in dark mode.
3. ✅ Light `--success` L42→33 (4.55:1 as text), `--info` L52→40 (4.55:1), `--destructive` L52→47 (4.93:1 + CVD luminance gap vs accent); `--muted-foreground` light L45→42, dark L58→62.
4. ✅ `--border-strong` added both modes (3.34:1 light / 3.63:1 dark vs bg) + `border-border-strong` Tailwind utility. Adoption on inputs/controls is Tier 2 work.
5. ✅ Bug fixes #1–#10 (see §4 status note). Also fixed the one hand-rolled `bg-accent text-white` (`routes/briefs/+page.svelte:874`) → `text-accent-foreground`.

**Warning token follow-up 2026-06-12 (DJ: "yellow too light in light mode"):** light `--warning` 45 95% 52% → **45 88% 38%** (goldenrod). 1.61 → 3.00:1 on bg (passes icons/large text/UI), ink foreground 5.3:1 on fills, luminance stays ~1.7× accent so CVD separation survives. Body-size `text-warning` still <4.5:1 — pair with an icon or use foreground. Dark mode unchanged.

**Tier 1 open question — RESOLVED (darken accent), prototyped 2026-06-12:** DJ approved darkening `--accent`, homepage-first for visual review. Math note: there is no lightness where BOTH ink-foreground and `text-accent` pass — at L40 white CTA text passes again (4.82:1) AND `text-accent` on bg passes (4.62:1), so the deep accent pairs with white foreground. Prototype: `.accent-deep` class in `inkprint.css` (`--accent: 24 80% 40%`, white fg; dark mode keeps global values which already pass). Applied by `HomepageV2.svelte` on its root div + `document.body` while mounted, so nav/footer follow on the homepage only. Pixel-verified: homepage light = rgb(184,80,16), other pages = original rgb(232,120,48), dark mode unchanged. **PROMOTED GLOBALLY 2026-06-12:** `:root --accent: 24 80% 40%`, `--accent-foreground` white, ring follows; prototype `.accent-deep` block + body-class effect deleted; verified on /pricing (deep accent renders app-wide in light mode, dark mode untouched).

**Tier 2 — system convergence (a focused week):**

6. ✅ Radius split-brain resolved 2026-06-12 (Option A): `--wt-paper/card/plate-radius` all → 0.75rem; nav bare `rounded` → `rounded-md`; BriefChatModal `rounded-t-2xl` → `rounded-t-lg`; ~50 stacked `rounded-lg`+`wt-*` sites de-stacked; radius vocabulary added to INKPRINT_DESIGN_SYSTEM.md §4.8.
7. 🔶 IN PROGRESS — `text-2xs` token added (0.6875rem, tailwind.config). Homepage fully converged 2026-06-12: 44 hand-rolled eyebrows → `.micro-label`, zero arbitrary font sizes remain in HomepageV2. Remaining: dashboard, triage modals, nav tagline (~1,300 arbitrary sizes app-wide).
8. Commit a font-weight role table; align Navigation to the Button dialect.
9. ✅ Mobile dominance restored 2026-06-12: project title `text-sm→text-lg` mobile (ProjectHeaderCard), modal titles `text-sm→text-base` (base Modal → inherits to 54 modals), inverted `text-sm sm:text-xs` links → constant `text-sm` (Footer ×2, AnalyticsDashboard ×3). Input `text-base sm:text-sm` kept — deliberate iOS-zoom guard, not an inversion.
10. Documented z-index scale.
11. ✅ Stale-doc banners added 2026-06-12: BUILDOS_STYLE_GUIDE, DESIGN_SYSTEM_GUIDE, DESIGN_REFACTOR_STATUS (full warning), MODAL_STANDARDS (partial — structure valid, templates stale).

**Radius recommendation (item 6, needs DJ sign-off):** accept de facto reality — 12px (`rounded-lg`) is what modals, buttons, and 1,601 call sites already render. Proposal: cards/modals/buttons standardize on 12px; chips/badges stay `rounded-full`; small controls `rounded-md` 8px; align `wt-*` radii to 12px so the weight system stops silently losing to utilities; strip redundant stacked `rounded-*` opportunistically. Alternative (more letterpress, more churn): everything to 8px — crisper, but visibly changes 1,601 sites.

**Tier 3 status-token migration — ✅ EXECUTED 2026-06-12 (items 11+12):** six parallel agents migrated **~4,100 raw palette occurrences → 51 documented exceptions** across ~140 files (ontology 561→6, lib/admin 999→32, routes/admin 1,045→4, core user components ~1,100→~5, remaining user surfaces 233→8, mop-up sweep of 16 missed files ~120→0). All paired `dark:` variants deleted (tokens flip themselves); all gradients replaced with flat token tints per Inkprint doctrine; class-map objects in scripts migrated. Remaining exceptions (intentional): chart legends paired to literal canvas/SVG series colors (ActivityTimelineChart 26, VisitorContributionChart 8, ProjectActivityChart 6, GraphControls 6), terminal JSON panes (admin/migration ×2 ×2), NotificationStack overflow pill (1), test pages, `routes/design-system` (204 — spec/showcase pages, intentionally raw). Chart hex piping (item 13) still pending. Notable judgment calls logged in agent reports: entity-type color language unified (tasks/events=info, goals=warning, milestones=success, plans=accent, risks=destructive, docs=muted); toggle switches unified on accent; Toast redesigned to bg-card + token accents (most visible change); severity ladders compressed to 5 tokens with labels carrying distinctions.

**Tier 3 — the long campaign (opportunistic):** 11. Status-token migration codemod: red→destructive, emerald/green→success, amber/yellow→warning, blue/sky→info — start with the 10 worst files (~1,050 occurrences = 22% of all bypasses). 12. Kill the blue/purple shadow brand in user-facing components (time-blocks, email, analytics, ontology panels). 13. Pipe chart hex colors through CSS vars (~280 of 318 hexes). 14. Stale-doc cleanup: banner or delete BUILDOS_STYLE_GUIDE, DESIGN_SYSTEM_GUIDE, DESIGN_REFACTOR_STATUS; rewrite MODAL_STANDARDS. 15. Duration tokens (180/120ms) and converge the duration soup.
