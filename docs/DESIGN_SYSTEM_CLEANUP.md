<!-- docs/DESIGN_SYSTEM_CLEANUP.md -->

# Design System Cleanup Tracker

> **Created:** 2026-02-12
> **Status:** Complete (all 10 items done)
> **Scope:** Inkprint design system, Tailwind config, CSS architecture

---

## Recommended Cleanup Priority

### 1. Consolidate CSS files -- DONE

- [x] Rewrote `performance-optimizations.css` - removed all duplicates, kept only unique utilities
- [x] Removed duplicate skeleton definitions (was in 4 places, now canonical in perf-opts)
- [x] Removed duplicate line-clamp definitions from `dashboard.css` (canonical in `app.css`)
- [x] Removed duplicate `.fade-transition` and `.smooth-scroll` (no longer in perf-opts)
- [x] Fixed `app.css` import order: `inkprint.css` now imported first

### 2. Fix hardcoded colors in CSS files -- DONE

- [x] `pwa.css` - replaced blues with `hsl(var(--muted/border/accent))`
- [x] `phase-transitions.css` - file no longer exists (already removed)
- [x] `performance-optimizations.css` - rewrote with semantic tokens
- [x] `dashboard.css` - removed hardcoded scrollbar grays, uses semantic tokens

### 3. Implement `tx-grid` or remove references -- DONE

- [x] Added `.tx-grid::before` CSS rule to `inkprint.css` (graph-paper pattern, 20px grid)
- [x] Added `Grid` to texture comment block
- [x] Verified existing usage across 15+ files now renders correctly

### 4. Remove weight `background` override from `wt-*` classes -- DONE

- [x] Removed `background` property from `wt-ghost`, `wt-paper`, `wt-card`, `wt-plate`
- [x] Removed `--wt-*-bg` CSS variables from `:root` and `.dark`
- [x] Updated `Card.svelte` with explicit `weightBgClasses` map so `bg-*` can override via `twMerge`

### 5. Tone down `containment.css` -- DONE

- [x] Removed all wildcard selectors (buttons, overflow, flex, img, SVG, td/th)
- [x] Rewrote as opt-in utilities only: `.contain-standard`, `.contain-strict`, `.contain-layout`, `.contain-style`, `.contain-paint`, `.contain-size`, `.contain-content`
- [x] Kept `.no-contain` escape hatch

### 6. Update `withOpacity` helper in Tailwind config -- DONE

- [x] Replaced deprecated `({ opacityValue })` callback with `hsl(var(--name) / <alpha-value>)` string
- [x] Renamed helper from `withOpacity` to `hslVar`
- [x] Moved `success` color from hardcoded hex to CSS variable reference

### 7. Remove legacy Tailwind tokens -- DONE

- [x] Removed `shadow-soft` and `shadow-card` from `boxShadow`
- [x] Removed `font-display` and `font-body` from `fontFamily`
- [x] Verified zero usage in `.svelte` files before removal

### 8. Move `success`/`danger`/`info` to CSS variables -- DONE

- [x] `success` moved to CSS variable (done in item 6)
- [x] Added `--danger`, `--danger-foreground`, `--info`, `--info-foreground` to `:root` and `.dark`
- [x] Updated Tailwind config to use `hslVar()` for `danger` and `info`
- [x] Removed unused `light`/`dark` subvariants (verified zero usage in `.svelte` files)
- [x] Dark mode values slightly brighter for visibility (matches destructive/warning pattern)

### 9. Fix `app.css` import order -- DONE (included in item 1)

- [x] `inkprint.css` now imported first, before utility CSS files
- [x] Tailwind compiles cleanly

### 10. Update design-update command -- DONE

- [x] Added Phase 0 pre-flight violation scan step (grep for hardcoded colors, dark: overrides, old shadows)
- [x] Added `tx-grid` and `tx-strip` to texture list; updated form field pattern to use `tx-grid`
- [x] Added weight system background guidance (default bg-card via @layer components, Tailwind bg-\* overrides)
- [x] Added "Protected Files" section: don't modify `src/lib/components/ui/`, don't create new CSS files
- [x] Removed emoji from initial response template
- [x] Added CSS file architecture listing (which files exist, what they do)
- [x] Added concrete Spatial Emphasis guidance with usage examples
- [x] Removed stale "NEW:" labels from Spatial Emphasis and Atmosphere sections
- [x] Updated texture checklist to include `tx-grid` for inputs

---

## Audit Findings (Reference)

### A. Critical CSS Architecture Problems

| Issue                     | Location                                                                             | Description                                              |
| ------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `tx-grid` not implemented | `inkprint.css`                                                                       | Documented texture has no CSS rule                       |
| Duplicate keyframes       | `inkprint.css` + `tailwind.config.js`                                                | `ink-in`/`ink-out` defined twice                         |
| Containment over-reach    | `containment.css`                                                                    | Broad selectors on buttons, overflow, flex, SVGs, images |
| CSS file overlap          | `performance-optimizations.css` + `containment.css`                                  | Duplicate containment rules                              |
| Hardcoded colors in CSS   | `pwa.css`, `phase-transitions.css`, `performance-optimizations.css`, `dashboard.css` | Blue hex values, gray hex values                         |

### B. Tailwind Config Issues

| Issue                    | Description                                                      |
| ------------------------ | ---------------------------------------------------------------- |
| Deprecated `withOpacity` | Uses `opacityValue` callback (removed in Tailwind v4)            |
| Legacy shadow aliases    | `shadow-soft`, `shadow-card` compete with Inkprint               |
| Legacy font aliases      | `font-display`, `font-body` compete with `font-ui`, `font-notes` |
| Hardcoded status colors  | `success`, `danger`, `info` use hex instead of CSS variables     |

### C. CSS Duplication

| What                 | Where                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Line-clamp utilities | `app.css` + `dashboard.css`                                                                      |
| Skeleton loading     | `performance-optimizations.css`, `dashboard.css`, `phase-transitions.css`, `animation-utils.css` |
| `.fade-transition`   | `animation-utils.css` + `performance-optimizations.css`                                          |
| `.smooth-scroll`     | `performance-optimizations.css` + `phase-transitions.css`                                        |

### D. Inkprint CSS Structural Issues

| Issue                      | Location               | Description                                             |
| -------------------------- | ---------------------- | ------------------------------------------------------- |
| `tx > *` z-index forcing   | `inkprint.css:541-543` | Forces `position: relative; z-index: 2` on all children |
| Weight classes override bg | `inkprint.css`         | `wt-paper` etc. set `background` property               |
| Import order               | `app.css`              | `inkprint.css` imported after utility CSS files         |

### E. Codebase Adoption Gap

| Token System                    | Violations | Files | Status         |
| ------------------------------- | ---------- | ----- | -------------- |
| Hardcoded gray/slate            | ~2,030     | 153   | Dominant       |
| Hardcoded blue                  | ~426       | 141   | Widespread     |
| Manual `dark:` overrides        | ~239       | 239   | Common         |
| Old shadows (`shadow-sm/md/lg`) | ~159       | 64    | Common         |
| Weight tokens (`wt-*`)          | ~170 uses  | -     | Low adoption   |
| Spatial tokens (`sp-*`)         | ~42 uses   | -     | Barely adopted |
| Atmosphere/rim                  | ~824 uses  | -     | Moderate       |

### F. Design System Doc Issues

- Section 11.3 uses `<slot />` (Svelte 4 syntax, should be `{@render children()}`)
- `tx-grid` documented but no CSS implementation
- `tx-button` implemented but not in Section 3.1 texture token table
- Status colors documented as Tailwind classes but should reference CSS variables

### G. Design-Update Command Issues

- No pre-flight violation scan step
- Missing `tx-grid` gap mention
- Missing weight system guidance
- Missing "don't modify `ui/` components" guard
- Has emoji in initial response template
- Missing CSS file cleanup guidance
- Missing Spatial Emphasis concrete guidance

---

## Progress Log

### 2026-02-12: Initial Audit + First Cleanup Pass

- Completed full design system audit
- Identified all issues and categorized by severity
- Created this tracking document

**Completed cleanup items 1, 2, 4, 5, 6, 7, 9:**

- `performance-optimizations.css` - rewrote from 256 lines to 116 lines, all semantic tokens
- `containment.css` - rewrote from 279 lines to 73 lines, opt-in only
- `pwa.css` - replaced hardcoded blue colors with Inkprint tokens
- `dashboard.css` - removed duplicate line-clamps, hardcoded scrollbar colors
- `inkprint.css` - removed `--wt-*-bg` variables and `background` from weight classes
- `Card.svelte` - added explicit `weightBgClasses` map for background (was relying on weight class)
- `tailwind.config.js` - modern `<alpha-value>` syntax, removed legacy tokens, `success` uses CSS var
- `app.css` - fixed import order so `inkprint.css` loads first

**Files modified:**

- `apps/web/src/lib/styles/performance-optimizations.css`
- `apps/web/src/lib/styles/containment.css`
- `apps/web/src/lib/styles/pwa.css`
- `apps/web/src/lib/styles/inkprint.css`
- `apps/web/src/routes/dashboard.css`
- `apps/web/src/app.css`
- `apps/web/tailwind.config.js`
- `apps/web/src/lib/components/ui/Card.svelte`

**Remaining:** Items 3 (tx-grid), 8 (danger/info CSS vars), 10 (design-update command)

### 2026-02-12: Second Cleanup Pass (Items 3, 8)

**Completed cleanup items 3, 8:**

- `inkprint.css` - added `.tx-grid::before` graph-paper pattern (20px grid, 0.035 opacity)
- `inkprint.css` - added `--danger`, `--danger-foreground`, `--info`, `--info-foreground` CSS variables (`:root` + `.dark`)
- `tailwind.config.js` - `danger` and `info` now use `hslVar()` instead of hardcoded hex; removed unused `light`/`dark` subvariants

**Files modified:**

- `apps/web/src/lib/styles/inkprint.css`
- `apps/web/tailwind.config.js`

**Remaining:** Item 10 (design-update command)

### 2026-02-12: Dark Mode Tuning + Design-Update Command (Item 10)

**Dark mode lightness fix:**

- Lifted entire dark mode surface scale by +5 lightness points (background 6%→11%, card 10%→15%, muted 14%→19%, border 18%→24%)
- Reduced blue saturation from 10% to 8% across all dark mode surfaces
- Added `noise-lines.png` body texture in dark mode (`background-blend-mode: overlay`)
- Restored weight class default backgrounds in `@layer components` (Tailwind `bg-*` overrides naturally)

**Design-update command fixes (item 10):**

- Added Phase 0 pre-flight violation scan
- Added "Protected Files" section (don't modify `ui/` components, don't create CSS files)
- Added CSS file architecture listing
- Added `tx-grid` and `tx-strip` to texture reference
- Added weight system background guidance
- Added concrete Spatial Emphasis examples
- Removed emoji from initial response
- Removed stale "NEW:" labels
- Updated form field pattern to use `tx-grid`
- Updated texture checklist

**Files modified:**

- `apps/web/src/lib/styles/inkprint.css`
- `apps/web/src/app.css`
- `.claude/commands/design-update.md`
- `docs/DESIGN_SYSTEM_CLEANUP.md`

**All 10 cleanup items complete.**

### 2026-02-12: Cohesion Pass — Hue Warmup, Shadow Standardization, Danger Merge, Color Migration

**Priority 1: Warm up dark mode hue (240→30)**

- Shifted all dark mode surface HSL values from hue 240 (cool blue) to hue 30 (warm charcoal)
- Reduces saturation from 8% to 6% for a subtler warm neutral
- Light mode (hue 40) and dark mode (hue 30) now feel like the same design language
- Updated `--accent-foreground` and `--warning-foreground` dark mode values to match

**Priority 2: Standardize shadows → shadow-ink variants**

- Replaced ~180 old Tailwind shadows (`shadow-sm/md/lg/xl/2xl`) with Inkprint equivalents
- Mapping: `shadow-sm/md` → `shadow-ink`, `shadow-lg/xl/2xl` → `shadow-ink-strong`
- Same mapping applied to `hover:` variants
- Preserved `drop-shadow-*` (CSS filter shadows, not box-shadows)
- Fixed 3 redundant `shadow-ink hover:shadow-ink` → `shadow-ink hover:shadow-ink-strong`
- 74 files modified, 0 old shadow classes remain (2 `drop-shadow-lg` correctly preserved)

**Priority 3: Merge danger into destructive**

- Removed redundant `--danger` and `--danger-foreground` CSS variables (identical to `--destructive`)
- Removed `danger` color entry from `tailwind.config.js`
- Component variant name `variant="danger"` preserved — it already maps to `bg-destructive` internally
- Zero Tailwind class usage of `text-danger/bg-danger/border-danger` confirmed before removal

**Priority 4: Migrate hardcoded colors to semantic tokens**

- Migrated ~5,300+ hardcoded gray/slate/zinc color references to semantic Inkprint tokens
- Paired replacements: `bg-white dark:bg-gray-800` → `bg-card`, `border-gray-200 dark:border-gray-700` → `border-border`, etc.
- Standalone replacements: `text-gray-500` → `text-muted-foreground`, `text-gray-900` → `text-foreground`, etc.
- Removed ~300+ orphaned `dark:` overrides made redundant by semantic tokens
- Replaced all `bg-white` → `bg-card` (83 instances)
- Remaining: 81 edge cases (tooltip backgrounds, gradient stops, chart colors) — contextual, not systematic violations
- 1 orphaned `dark:` override remaining (homework page)
- Build verified clean

**Before/After:**

| Metric                      | Before    | After    | Reduction   |
| --------------------------- | --------- | -------- | ----------- |
| Hardcoded gray/slate colors | ~5,445    | ~81      | **98.5%**   |
| Manual `dark:` overrides    | ~4,328    | ~1       | **99.97%**  |
| Old Tailwind shadows        | ~180      | 0        | **100%**    |
| Redundant `danger` token    | 1         | 0        | **100%**    |
| Dark mode hue mismatch      | 240 vs 40 | 30 vs 40 | **Unified** |

**Files modified:** ~180 `.svelte` files + `inkprint.css` + `tailwind.config.js`
