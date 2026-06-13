<!-- apps/web/docs/technical/components/TASK_RADIUS_CONVERGENCE_2026-06-12.md -->

# TASK: Border-Radius Convergence (Inkprint)

> **Handoff doc.** Self-contained task for an agent to resolve the BuildOS radius split-brain. Source finding: [DESIGN_AUDIT_2026-06-12.md](./DESIGN_AUDIT_2026-06-12.md) §3b. Created 2026-06-12.

## The problem (read this first)

Three sources of truth disagree about border radius, and the cascade silently picks a winner:

1. **Tailwind scale is overridden** in `apps/web/tailwind.config.js` (`borderRadius` block): `rounded-sm`=4px, `rounded`=6px, `rounded-md`=8px, **`rounded-lg`=12px**, `rounded-xl`=16px. NOT the Tailwind defaults — `rounded-lg` here is 12px, not 8px.
2. **The weight system encodes radius semantically** in `apps/web/src/lib/styles/inkprint.css` (`--wt-*-radius` vars): `wt-ghost` 0.75rem (12px), `wt-paper`/`wt-card` 0.5rem (8px), `wt-plate` 0.375rem (6px).
3. **55 class attributes stack both** (`rounded-*` + `wt-*` on the same element). Because `inkprint.css` is `@import`ed BEFORE `@tailwind utilities` in `apps/web/src/app.css`, **the Tailwind utility always wins** — the weight system's radius semantics are silently dead at those sites.

Visible symptoms:

- Modals carry `wt-plate` (6px) + `rounded-lg` → render 12px.
- The Card primitive (`apps/web/src/lib/components/ui/Card.svelte`) renders 8px via `wt-paper`/`wt-card`, while hand-rolled cards (`ProjectHeaderCard.svelte:63`, dashboard invite cards in `AnalyticsDashboard.svelte`) use `rounded-lg` 12px — mismatched siblings on the same screens.
- Buttons (`Button.svelte` ~line 128, `rounded-lg` 12px) are rounder than the 8px Card containers — inverted proportion (inner radius should be ≤ outer).
- `Navigation.svelte` mixes three radii on adjacent controls in one 64px bar: `rounded` 6px (~lines 521, 629, 661, 878), `rounded-lg` 12px (~lines 584, 859, 865), `rounded-md` 8px avatars (~lines 442, 532).

Usage counts (apps/web/src, .svelte): `rounded-lg` ×1,601 · `rounded-full` ×673 · `rounded` ×665 · `rounded-md` ×475 · `rounded-xl` ×99 · `rounded-2xl` ×32 · `rounded-sm` ×25.

## The decision

**Option A — RECOMMENDED (standardize on 12px, minimal visual churn):** 12px is what modals, buttons, and 1,601 call sites already render. Make the system match reality.

**Option B (everything to 8px, letterpress-crisp, high churn):** visibly changes 1,601 sites. Only do this if DJ explicitly asks for it.

**Implement Option A unless the prompt that hands you this doc says otherwise.**

## Option A — implementation steps

### Step 1: align the weight-system radii to the de facto standard

In `apps/web/src/lib/styles/inkprint.css`, the `:root` weight block:

```
--wt-ghost-radius: 0.75rem;   /* keep 12px */
--wt-paper-radius: 0.5rem;    /* CHANGE → 0.75rem */
--wt-card-radius:  0.5rem;    /* CHANGE → 0.75rem */
--wt-plate-radius: 0.375rem;  /* CHANGE → 0.75rem */
```

This makes `wt-*` elements agree with the `rounded-lg` sites instead of silently losing to them. (Weight differentiation survives through shadow/border-width/motion, which were always its stronger axes.)

### Step 2: codify the radius vocabulary

Add a short "Radius" section to `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`:

- **Cards, modals, buttons, large inputs: `rounded-lg` (12px)** — or no class at all when a `wt-*` class is present (now equivalent).
- **Small/dense controls (icon buttons, selects in toolbars, table controls): `rounded-md` (8px).**
- **Chips, pills, badges, avatars: `rounded-full`.**
- **Do not stack `rounded-*` with `wt-*`** — the weight class now provides 12px; a stacked utility is redundant or a deliberate (documented) exception.

### Step 3: fix the worst visible inconsistencies (do these by hand, read context first)

1. `apps/web/src/lib/components/layout/Navigation.svelte` — converge the nav bar controls. Recommendation: all square-ish icon/action buttons in the bar → `rounded-md` (8px, dense-control tier); the History/brain-dump CTA pills can stay `rounded-lg` or `rounded-full` if they're pill-shaped. Eliminate the bare `rounded` (6px) usages (~lines 521, 629, 661, 878).
2. `apps/web/src/lib/components/ui/Card.svelte` + hand-rolled cards (`ProjectHeaderCard.svelte`, invite cards in `AnalyticsDashboard.svelte`) — after Step 1 these agree at 12px automatically. Verify visually; remove any now-redundant stacked `rounded-lg` on `wt-*` elements you touch.
3. `apps/web/src/lib/components/briefs/BriefChatModal.svelte` (~line 220-242) — hand-rolled `rounded-t-2xl md:rounded-lg`, a one-off pair. Normalize to the base Modal's `rounded-t-lg sm:rounded-lg` (or better: migrate it to the base Modal component — it's one of 4 bypassers, see audit §4 bug #12).

### Step 4: sweep the stacked-radius sites (mechanical)

Find the ~55 stacked sites:

```bash
cd apps/web && grep -rEn 'class="[^"]*\bwt-(ghost|paper|card|plate)\b[^"]*\brounded(-[a-z0-9]+)?\b|class="[^"]*\brounded(-[a-z0-9]+)?\b[^"]*\bwt-(ghost|paper|card|plate)\b' src --include="*.svelte"
```

For each: if the `rounded-*` is `rounded-lg`, delete it (redundant after Step 1). If it's something else (`rounded-xl`, `rounded-t-lg`...), it's a deliberate shape — leave it and move on. Do NOT bulk-sed this; class attributes wrap across lines in Svelte.

### Step 5: verify

```bash
cd apps/web
npx prettier --check <every file you touched>
npx tailwindcss -c tailwind.config.js -i src/app.css -o /tmp/radius-check.css   # must compile clean
pnpm dev   # then eyeball: a project page (cards), any modal, the nav bar, /landing-v2
```

Acceptance criteria:

- [x] `--wt-paper/card/plate-radius` all 0.75rem.
- [x] Modal renders 12px AND its `wt-plate` agrees (no silent cascade fight). Comments updated to "12px, agrees with wt-plate".
- [x] Navigation bar has at most 2 radius values (8px controls, 12px/full pills) — not 3.
- [x] No `rounded-lg` stacked on `wt-*` elements (grep returns only Modal.svelte intentional stacks).
- [x] Radius section added to INKPRINT_DESIGN_SYSTEM.md §4.8.
- [x] DESIGN_AUDIT_2026-06-12.md Tier 2 item 6 → ✅.

## Gotchas

- **pnpm, never npm.** Prettier config: tabs, single quotes, 100 char width.
- `inkprint.css` is imported before `@tailwind utilities` — that load order is WHY utilities win over `wt-*`. Do not "fix" the ordering as a shortcut; it would flip the winner at all 55 stacked sites at once with unaudited visual fallout.
- `rounded-full` (673 uses) and `rounded-t-*` directional variants are out of scope — don't touch.
- The overridden Tailwind `borderRadius` scale itself (config) should NOT change in Option A — 1,601 `rounded-lg` call sites depend on it meaning 12px.
- Admin routes are lower priority than `lib/components` and user-facing routes if you need to triage.
- Svelte 5 runes syntax only. All components must keep light + dark mode working (radius changes don't touch color, but if you migrate BriefChatModal, preserve its dark: classes).

## Context: what's already done (don't redo)

- Modal's wrong radius comments already corrected (2026-06-12).
- The audit doc tracks everything: `apps/web/docs/technical/components/DESIGN_AUDIT_2026-06-12.md`.
- Accent token was darkened globally (L55→L40, white foreground) — unrelated to radius, just don't be surprised by the deep orange.

## Completion record (2026-06-12)

All 5 steps executed. Extended sweep caught additional issues in the post-step-4 review:

**Original scope (Steps 1–5) — done:**
- `inkprint.css`: `--wt-paper/card/plate-radius` all → 0.75rem (from 0.5rem / 0.375rem)
- Navigation: 6 bare `rounded` (6px) → `rounded-md`; admin badge → `rounded-full`
- BriefChatModal: `rounded-t-2xl` → `rounded-t-lg`
- Modal: cascade-fight comments updated to "agrees with wt-plate"
- ~50 stacked `rounded-lg` + `wt-*` sites de-stacked across ~17 files
- `INKPRINT_DESIGN_SYSTEM.md`: §4.4 table updated, §4.8 Radius Vocabulary added
- `DESIGN_AUDIT_2026-06-12.md`: Tier 2 item 6 marked ✅

**Extended sweep (post-step-4 review) — done:**
- `ProjectStateChip.svelte`: `rounded` → `rounded-full` (chips/badges rule)
- `ProjectStateRow.svelte`: inline share badge `rounded` → `rounded-full`
- `OwnerBar.svelte`: status pill `rounded` → `rounded-full`
- `Textarea.svelte`: inner textarea `rounded` → `rounded-md` (dense form control)
- `Alert.svelte`: close button `rounded` → `rounded-md`
- `routes/projects/[id]/tasks/[task_id]/+page.svelte`: view-switcher tab buttons `rounded` → `rounded-md` (inside `rounded-lg` container)
- `routes/privacy/+page.svelte`: all card/icon containers `rounded` → `rounded-lg`

**Intentionally left as bare `rounded` (6px) — documented exceptions:**
- `routes/time-blocks/+page.svelte:263,275`: tab buttons inside a `rounded-md` container with `p-0.5` — the 6px is mathematically correct for nesting (inner = outer − padding).
- Checkboxes (`h-4 w-4 rounded border-border`): HTML form input, standard browser pattern.
- Skeleton/pulse loaders (`bg-muted rounded animate-pulse`): invisible at runtime, irrelevant.
- `prose-code:rounded` in blog prose styles: markdown typography, small inline code.
- Admin pages: lower priority per task spec.
