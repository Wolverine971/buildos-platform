<!-- apps/web/docs/technical/audits/MOBILE_RESPONSIVENESS_AUDIT_2026-04-27.md -->

# Mobile Responsiveness Audit — BuildOS Web

**Date:** 2026-04-27
**Scope:** `apps/web` — all routes, components, and global plumbing
**Reference standards:**

- `apps/web/docs/technical/MOBILE_RESPONSIVE_BEST_PRACTICES.md` (Nov 2025)
- `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`
- `apps/web/docs/technical/components/MODAL_STANDARDS.md`
- `apps/web/docs/technical/components/TEXTAREA_BUTTON_DESIGN_MOBILE.md`
- `apps/web/docs/technical/components/TEXTAREA_WITH_VOICE_MOBILE_OPTIMIZATION.md`

**Methodology:** Four parallel investigators across (1) layout & navigation, (2) modals/forms/primitives, (3) feature components, (4) public/auth/marketing/blog/onboarding. Findings cross-validated against the actual source for the highest-impact claims before being recorded.

> **Update 2026-04-27 (PM):** Five findings have been fixed in this same session. See [Fixes applied](#fixes-applied-2026-04-27-pm) at the bottom of the doc. The "Critical" / "High" sections below now mark fixed items inline with ✅ **FIXED**.

---

## TL;DR

The foundation is **strong**. Viewport, safe-area insets, `100dvh`, `overflow-x-hidden`, skip-link, and PWA setup are all in place at the root. Inputs are 16px (no iOS zoom). The Inkprint design system is real and broadly followed.

But several **Critical** mobile gaps remain — most of them in feature surfaces that were built before the mobile spec was solidified or that contain mouse-only interactions (time-blocks, ontology, calendar grids). Plus one whole category of forms (the auth pages) uses `100vh` arithmetic that breaks on Mobile Safari's dynamic toolbar.

### Top 8 fixes, sequenced

| #   | Fix                                                                                               | Severity | Effort | Status         |
| --- | ------------------------------------------------------------------------------------------------- | -------- | ------ | -------------- |
| 1   | Add touch-event handlers to `TimePlayCalendar` drag-to-create                                     | Critical | M      | open           |
| 2   | Replace `100vh - 64px` with `100dvh` math on auth pages                                           | Critical | XS     | ✅ fixed       |
| 3   | Add `sm:`/`md:` breakpoints to non-responsive grids (CalendarAnalysisResults, AnalyticsDashboard) | Critical | XS     | open           |
| 4   | Long-press fallback for `DocTreeNode` context menu                                                | Critical | S      | ✅ fixed       |
| 5   | Body-scroll lock + `aria-modal` + focus trap on Navigation mobile menu                            | High     | S      | ✅ fixed       |
| 6   | Bring Modal close button + Toast dismiss + Voice buttons up to 36–40px                            | High     | S      | ⚠️ voice fixed |
| 7   | Align `RichMarkdownEditor` and `CommentTextareaWithVoice` voice-button sizes with the spec        | High     | XS     | ✅ fixed       |
| 8   | Mobile-friendly view switch (or horizontal scroll) for week/month calendar grids                  | High     | M      | open           |

---

## What's already strong (do not regress)

- **Root layout:** `min-h-screen min-h-[100dvh]`, `overflow-x-hidden`, `safe-area-inset-left/right` on body, skip-to-main link, `viewport-fit=cover`, `interactive-widget=resizes-content`. (`apps/web/src/app.html`, `apps/web/src/routes/+layout.svelte:834`)
- **PWA plumbing:** Theme-color updates per mode, iOS splash screens, install-prompt, status-bar style, format-detection off for phone numbers.
- **Form inputs at 16px:** `TextInput.svelte` and `Textarea.svelte` both use `text-base` to prevent iOS zoom-on-focus.
- **Auth flow input attrs:** `register/+page.svelte:475–586` correctly distinguishes `autocomplete="new-password"` vs `current-password`, has `autocomplete="name"` and `"email"`. `forgot-password/+page.svelte:92–94` has `inputmode="email"` and `enterkeyhint`.
- **Modal infrastructure:** Scroll-lock on body, swipe-to-dismiss (mobile bottom-sheet), GPU-accelerated transforms, ESC + backdrop dismiss, safe-area-inset-bottom for sticky footers. (`apps/web/src/lib/components/ui/Modal.svelte`)
- **Toasts:** Bottom-anchored on mobile, top-right on desktop, swipe-to-dismiss, pause-on-hover, safe-area inset bottom. (`apps/web/src/lib/components/ui/ToastContainer.svelte`)
- **Brain-dump TextareaWithVoice:** Followed `TEXTAREA_WITH_VOICE_MOBILE_OPTIMIZATION.md` to the letter — responsive button sizes, `touch-manipulation`, tap-highlight removal, `pr-[90px]` button room, no layout shift. (`apps/web/src/lib/components/ui/TextareaWithVoice.svelte`)
- **Mobile-first feature components:** `BriefChatModal` (bottom-sheet with safe-area inset and swipe-dismiss), `MobileCommandCenter` (intentional one-panel-at-a-time density on small screens).
- **Hero typography:** Marketing pages consistently use `text-3xl sm:text-4xl lg:text-5xl` style scales — no oversized desktop type leaking onto mobile.
- **Public-page padding pattern:** `px-4 sm:px-6 lg:px-8` is applied uniformly.
- **Hierarchy at z-index:** nav (10) < overlays (100) < modals (9999) < toasts (10001) — no conflicts.

---

## Critical findings

> _Mobile is meaningfully broken or unusable for this surface._

### C1. Time-blocks calendar drag-to-create has zero touch support

**File:** `apps/web/src/lib/components/time-blocks/TimePlayCalendar.svelte:785,795,797`

Slot drag-to-create uses `onmousedown` / `onmousemove` / `onmouseup` with no `ontouchstart` / `ontouchmove` / `ontouchend` companions. On any phone or tablet, you cannot create a time block by dragging on the slot grid.

**Fix:** Add touch handlers that share the same handler logic, or use a Pointer Events polyfill (`pointerdown`/`pointermove`/`pointerup`). Pointer Events is the cleanest unified path.

### C2. Auth pages use `100vh` arithmetic instead of `100dvh` — ✅ FIXED 2026-04-27

**Files:**

- `apps/web/src/routes/auth/login/+page.svelte:323`
- `apps/web/src/routes/auth/register/+page.svelte:365`
- `apps/web/src/routes/auth/forgot-password/+page.svelte:37`
- `apps/web/src/routes/auth/reset-password/+page.svelte:22`
- `apps/web/src/routes/time-blocks/+page.svelte:231`

All four auth pages use inline `style="min-height: calc(100vh - 64px);"`. On Mobile Safari, `100vh` is the _largest possible_ viewport height (URL bar collapsed). When the URL bar is showing, the form sits in a container that exceeds the visible area, causing extra scroll and the dreaded "form taller than the screen for no reason" effect — especially noticeable on the password screen.

**Fix:** Switch to `min-h-[calc(100dvh-4rem)]` (or `100svh` if you specifically want the smallest stable height). This also frees you from hardcoding `64px` (the navbar height); `4rem` aligns with the existing nav `h-16` token.

### C3. Non-responsive feature grids force multi-column on mobile

**File:** `apps/web/src/lib/components/calendar/CalendarAnalysisResults.svelte:446`

```svelte
<div class="grid grid-cols-2 gap-3">
```

Two columns at every breakpoint, including 320–375px phones. Suggestion cards crush.

**File:** `apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte:680, 772, 827`

```svelte
<div class="grid gap-2 sm:gap-3 lg:grid-cols-2">   <!-- jumps 1→2 only at lg:1024 -->
<div class="grid gap-2 sm:gap-3 lg:grid-cols-2">
<div class="grid gap-3 lg:grid-cols-3">             <!-- 1→3 at lg:1024 (no md tier) -->
```

On tablet (md:768 → lg:1023), `lg:grid-cols-3` block is single column, wasting the screen; on mobile, `grid-cols-2` block is cramped.

**Fix:**

- `CalendarAnalysisResults:446` → `grid-cols-1 sm:grid-cols-2 gap-3`
- `AnalyticsDashboard:827` → `sm:grid-cols-2 lg:grid-cols-3` (intermediate tier for tablet)

### C4. DocTreeNode context menu is right-click only — ✅ FIXED 2026-04-27

**File:** `apps/web/src/lib/components/ontology/doc-tree/DocTreeNode.svelte:187`

```svelte
oncontextmenu={handleContextMenu}
```

The row has `ontouchstart` handlers, but they're scoped to the drag handle (`:204`) and to a propagation-stop on a child (`:289`). The actual context-menu trigger is `oncontextmenu`, which iOS and Android Chrome will not fire on a tap-and-hold without OS intervention (and on iOS Safari, long-press triggers the OS lookup/copy menu, not a JS event).

**Impact:** Mobile users cannot reach context-menu actions for tree nodes (rename / move / convert / cut etc.).

**Fix:** Add a long-press detector (`pointerdown` + 500–600ms timer canceled on `pointermove` > 5px or `pointerup`). Alternatively, surface a 3-dot kebab button on the row that's always visible on `<lg`.

### C5. Mobile menu does not lock body scroll — ✅ FIXED 2026-04-27

**File:** `apps/web/src/lib/components/layout/Navigation.svelte:53,830`

`showMobileMenu` toggles a drawer but no `body.style.overflow = 'hidden'` and no `overscroll-behavior: contain` on the menu surface. The page scrolls behind the open menu, which is jarring on phones and steals scroll-momentum from the menu's own scrollable region.

**Fix:** When `showMobileMenu === true`, set `document.body.style.overflow = 'hidden'` (and clear in `$effect` cleanup or on close). Also add `aria-modal="true"` and a focus trap inside the drawer; today, Tab cycles through background content. The toast container's own `overflow-hidden` rules can be a model.

---

## High findings

> _Works, but degraded UX on mobile._

### H1. Modal close button is 28×28px

**File:** `apps/web/src/lib/components/ui/Modal.svelte:546`

```svelte
class="relative flex h-7 w-7 shrink-0 items-center justify-center..."
```

Below the 36px Inkprint high-density floor and well below the 44px WCAG AA minimum. Top-right corner is also the hardest spot to reach one-handed on a tall phone.

**Fix:** `h-9 w-9` minimum (36px) on `<sm`, `h-8 w-8` on `sm+`. Or move the close affordance to a more reachable spot on mobile (use the existing drag handle for swipe-down on bottom-sheet modals).

### H2. Voice button sizes drift from spec in two textarea variants — ✅ FIXED 2026-04-27

| Component                                                                   | Current                         | Spec (`TEXTAREA_BUTTON_DESIGN_MOBILE.md`) | Status       |
| --------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------- | ------------ |
| `apps/web/src/lib/components/ui/TextareaWithVoice.svelte`                   | `h-9 w-9` mobile, padded        | 36–40px                                   | ✅ correct   |
| `apps/web/src/lib/components/ui/CommentTextareaWithVoice.svelte:1147`       | `h-7 w-7` (28px)                | 36–40px                                   | ❌ regressed |
| `apps/web/src/lib/components/ui/RichMarkdownEditor.svelte:1345, 1362, 1550` | `w-8 h-8 sm:w-7 sm:h-7` (32→28) | 36–40px                                   | ❌ regressed |

Both regressed components are below comfortable thumb-tap size on the very breakpoint where comfort matters most.

**Fix:** Mirror `TextareaWithVoice` exactly — same classes, same padding math (`pr-[90px]` for two-button trailing area).

### H3. Mobile menu missing `aria-modal` and focus trap — ✅ FIXED 2026-04-27

**File:** `apps/web/src/lib/components/layout/Navigation.svelte`

Menu opens, ESC closes, click-outside dismisses — but:

- No `aria-modal="true"` on the drawer container.
- Tab order leaks to background.
- (Correction from initial draft: the nav already has `data-fixed-element` on `Navigation.svelte:347`, so `pwa.css:6` safe-area-inset-top _does_ apply. The original claim was wrong.)

**Fix:** Set up a focus trap (or use `inert` on the rest of the layout while open).

### H4. Navigation hamburger and chat-launcher under 44px

**File:** `apps/web/src/lib/components/layout/Navigation.svelte:467, 575, 810`

Hamburger button is `px-3 h-9` (~36px). Chat launcher is `h-9`. WCAG AA target is 44×44.

**Fix:** Bump to `h-11 w-11` on `<sm`, keep current sizing from `sm:` up. Inside the button, the icon stays small — only the hit area grows.

### H5. Modal `FormModal` — adjacent button gap

**File:** `apps/web/src/lib/components/ui/FormModal.svelte`

Footer buttons stack `flex flex-col sm:flex-row`. On mobile, no explicit `gap-2`/`gap-3` ensures the ≥8px touch separation rule. Quick verification recommended; if missing, add it.

### H6. `text-[10px]` for primary metadata on the mobile project surface

**File:** `apps/web/src/lib/components/project/MobileCommandCenter.svelte:294–306`

Milestone counts at 10px are below the Inkprint 7.2 floor (`text-xs` = 12px on mobile) for primary content. They're labels not body, but they read as content.

**Fix:** `text-xs` (or `text-[11px]` if visual density is non-negotiable; flag for design review).

### H7. Toast positioning breakpoint feels abrupt at sm:640 — ✅ FIXED 2026-04-28

**File:** `apps/web/src/lib/components/ui/ToastContainer.svelte:35`

Bottom-center on mobile → top-right at 640px. Mid-range phones in landscape (640px wide) get a sudden corner toast.

**Fix:** Move the breakpoint to `md:768`. Bonus: large phones in portrait at 600+ px stay bottom-anchored where the thumb is.

### H8. Calendar week/month view is unreadable on phone

**File:** `apps/web/src/lib/components/time-blocks/TimePlayCalendar.svelte` (multiple lines including `:1411, 1481, 1535, 1574, 1958`)

Absolute-positioned blocks with fixed `HOUR_HEIGHT = 60px` and 7 columns. On 375px phone, each day column is ~54px wide — labels truncate, blocks overlap, no horizontal scroll.

**Fix:** Force day-view on `<sm` (or `<md`); offer a "view mode" prop that auto-resolves. Alternative: wrap the grid in `overflow-x-auto` with a min-width like `min-w-[700px]` so users can pan.

---

## Medium findings

### M1. Auth password fields lack a show/hide toggle

Standard mobile pattern; not present on login/register/reset.

### M2. Tablet density (768–1023px)

Navigation flips to desktop layout at `md:768`, but real iPads in portrait are 768px and feel cramped with full nav. Many feature grids skip the `md:` tier entirely (single → 3-col jump). Worth a tablet-specific pass.

### M3. Onboarding v3 progress indicator may overlap on <375px

**File:** `apps/web/src/lib/components/onboarding-v3/ProgressIndicatorV3.svelte:36–41`

`text-xs mt-1.5` for 4 step labels in a `flex justify-between`. iPhone SE narrow.

**Fix:** `text-[0.65rem] sm:text-xs`, or hide labels under a chosen viewport and rely on the dot count.

### M4. Onboarding has no escape hatch

**File:** `apps/web/src/routes/onboarding/+page.svelte`

No "skip for now" or back to home. Mobile users who change their mind are stuck mid-flow.

### M5. Blog code blocks may need explicit horizontal scroll

**File:** `apps/web/src/routes/blogs/[category]/[slug]/+page.svelte:362–374`

Tailwind Typography (Prose) usually applies `overflow-x-auto` to `<pre>` by default in v4+, but the project should confirm. If markdown ever renders a `<table>`, mobile breaks immediately — no responsive fallback in place.

**Fix:** Add explicit `prose-pre:overflow-x-auto prose-table:overflow-x-auto` (or wrap tables in `.table-wrap` divs at render time).

### M6. Footer columns and links are tight on phone

**File:** `apps/web/src/lib/components/layout/Footer.svelte:88, 104, 107, 109, 176–195`

`text-xs` for link content + minimal vertical padding = high mistap rate. 12px is borderline acceptable; combined with tight gap it gets uncomfortable.

**Fix:** `text-sm sm:text-xs`, increase per-link `py-2`.

### M7. Toast safe-area inset OK but home-indicator overlap when stacking

**File:** `apps/web/src/lib/components/ui/ToastContainer.svelte`

Stack of 3+ toasts on iPhone notch device pushes the oldest above the home-indicator zone but the freshest is fine. Cap `maxToasts` to 3 on mobile.

### M8. Search input and Help/Docs sidebar — assumed but not verified

`apps/web/src/routes/help/+page.svelte` and `apps/web/src/routes/docs/+layout.svelte` were not deep-audited. If docs has a sidebar, confirm it collapses to a drawer at `<md`.

---

## Low / nitpicks

- **Modal close button hover color is hardcoded** (`hover:border-red-600/50`) instead of the destructive token — `Modal.svelte:546`. Cosmetic but breaks Inkprint discipline. ✅ **FIXED 2026-04-28**
- **Modal drag handle is 32×3px** (`Modal.svelte:654-656`) — usable but ergonomically lean. Consider widening the touch wrapper. ✅ **FIXED 2026-04-28**
- **Footer link sizing** (`Footer.svelte:88, 104, 107, 109`) — `text-xs` not scaled up to `sm:text-sm` on mobile. 12px is borderline; on real device, links feel cramped. ✅ **FIXED 2026-04-28**
- **Padding math in `TextareaWithVoice` is hardcoded** (`pr-[90px]`, `pr-[54px]`) instead of computed — fine today but fragile if a third button is ever added. ⚪ **OBSOLETE 2026-04-28** — buttons no longer overlay the textarea (refactored to a separate flex row); zero `pr-[XXpx]` matches in current source.
- **Onboarding link hidden under md** (`Navigation.svelte:525`) — onboarding badge dot on hamburger is the only mobile cue. ✅ **FIXED 2026-04-28** — dot upgraded to a percentage chip (`{onboardingProgress}%`).
- **DocTreeNode chevron is 16×16** with `w-4 h-4` (`DocTreeNode.svelte:235`) — wrapped in a 16×16 button. Acceptable inside tap-target padding, but check on real device. ✅ **FIXED 2026-04-28** — tap zone bumped to 24×24 on `<sm` via negative-margin overflow (icon size unchanged).
- **Some marketing imgs missing `loading="lazy"`** — sample: `apps/web/src/routes/contact/+page.svelte:97-104` (video, no intrinsic dimensions). Note: `apps/web/src/routes/about/+page.svelte:345` _does_ have `loading="lazy"` already. ✅ **FIXED 2026-04-28** — video now has `width`/`height` and `preload="metadata"` (the correct lazy-equivalent for `<video>`).
- **`text-xs` concentration in dashboard** — many spots use `text-xs` for secondary labels; not broken, just dense on phone. ✅ **FIXED 2026-04-28 (partial)** — three navigational "View all" links bumped to `text-sm sm:text-xs`. Static metadata intentionally left at `text-xs`.
- **Toast dismiss button is `w-8 h-8 sm:w-7 sm:h-7`** (`Toast.svelte:223`) — 32px on mobile (acceptable), 28px on desktop (oddly inverted but desktop has cursor precision). ✅ **FIXED 2026-04-28** — bumped to `w-9 h-9 md:w-8 md:h-8` (36 → 32px), aligned with the new toast positioning breakpoint.

---

## Cross-cutting code-smell counts (sample, not exhaustive)

| Smell                                              | Count | Sample citations                                                                                                                                                               |
| -------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `100vh` math without `dvh` fallback                | 6+    | `auth/{login,register,forgot-password,reset-password}/+page.svelte`, `time-blocks/+page.svelte:231`, `admin/ontology/graph/+page.svelte:73`                                    |
| Fixed grid columns lacking `sm:` or `md:` variant  | 3+    | `CalendarAnalysisResults.svelte:446`, `AnalyticsDashboard.svelte:680/772/827`                                                                                                  |
| Voice / textarea action buttons drifting from spec | 3     | `CommentTextareaWithVoice.svelte:1147`, `RichMarkdownEditor.svelte:1345/1362/1550`, plus loading-spinner state in `TextareaWithVoice.svelte` (`h-8 w-8` vs spec'd `h-10 w-10`) |
| Drag-and-drop without touch support                | 2     | `TimePlayCalendar.svelte:785/795/797` (slot drag), `DocTreeNode.svelte:187` (context menu)                                                                                     |
| Click handlers on non-interactive elements         | ~0    | Nav and footer are clean; deep feature components partially audited                                                                                                            |
| `hover:` reveals without focus or touch fallback   | low   | Did not find critical patterns; noted ProjectInsightRail external-link button (auxiliary, not critical)                                                                        |
| Missing `inputmode`/`autocomplete` on auth forms   | low   | Auth flow is well-instrumented; isolated forgot-password/reset flows reviewed and clean                                                                                        |

---

## By area

### Layout & navigation

Strong root layout. Two upgrades unlock the rest:

1. **Mobile menu**: body-scroll-lock + `aria-modal` + focus trap.
2. **Navigation as fixed element**: ~~add `data-fixed-element`~~ — already in place on `Navigation.svelte:347` (initial audit was wrong about this).

### Modals, forms, primitives

- The base `Modal.svelte` is excellent. Only the close button is undersized (28px).
- `FormModal.svelte` worth a quick read for footer button gap and safe-area-inset-bottom application.
- Auth forms are arguably the strongest mobile surface in the app — they just need their `100vh` math fixed.
- Voice-textarea ecosystem has 3 components; only one (the brain-dump variant) follows the published spec.

### Feature components

- **Brain dump:** ✅ Strong mobile UX. Stays compliant with the documented spec.
- **Briefs:** ✅ `BriefChatModal` is a model bottom-sheet pattern. Reuse it.
- **Project / dashboard:** ✅ Mostly responsive grids. ❌ One unresponsive `lg:grid-cols-3` (AnalyticsDashboard:827), one `text-[10px]` in MobileCommandCenter.
- **Calendar / time-blocks:** ❌ Mouse-only drag. ❌ Week/month view unreadable on phone. ❌ One `100vh-4rem` page minimum. This is the area with the most mobile debt.
- **Chat / agent:** ✅ 16px input avoids zoom. ⚠️ Unverified: tool-call/JSON rendering inside agent messages may overflow; worth a real-device check.
- **Ontology graph:** ❌ Cytoscape graph initialized without explicit mobile viewport handling — touch zoom/pan not confirmed. Right-click context menu unreachable on touch.
- **Voice notes / homework / history:** Not deep-audited; quick scan didn't show responsive variants on the recorder. Worth a 30-min pass.

### Public, auth, marketing, blog, onboarding

- **Marketing pages:** ✅ Hero typography always responsive; padding pattern uniform.
- **Pricing:** ✅ Single-tier card layout safe on mobile. ⚠️ If multi-tier is ever added, do not use a side-by-side compare table.
- **Auth:** ✅ Excellent input attrs (autocomplete, inputmode, enterkeyhint). ❌ All four pages use `100vh - 64px`.
- **Onboarding:** ✅ V3 is the wired version. V1 and V2 in `lib/components/onboarding/` and `onboarding-v2/` look like dead code — worth confirming and archiving. ❌ No escape hatch. ⚠️ Step-label sizing on <375px.
- **Blog:** ✅ `max-w-3xl` reading line-length is right. ⚠️ Code blocks and tables in markdown content may not have explicit overflow handling; verify Prose defaults.
- **Help / docs:** Not deep-audited; if a sidebar exists, confirm drawer collapse on `<md`.

---

## Recommended fix plan

### Wave 1 — fast wins (1–2 days, mostly XS/S)

1. Replace `100vh - 64px` → `100dvh` math in `auth/{login,register,forgot-password,reset-password}/+page.svelte` and `time-blocks/+page.svelte:231`.
2. Add `sm:`/`md:` variants to non-responsive grids: `CalendarAnalysisResults.svelte:446`, `AnalyticsDashboard.svelte:827`.
3. Body-scroll-lock + `aria-modal="true"` on Navigation mobile menu (`data-fixed-element` is already in place).
4. Bump Modal close, Toast dismiss, Navigation hamburger, chat launcher to ≥36px (≥44 where reasonable).
5. Align `RichMarkdownEditor` and `CommentTextareaWithVoice` voice-button sizes to the published spec (mirror `TextareaWithVoice`).
6. Move ToastContainer breakpoint from `sm:640` → `md:768`.
7. Fix `text-[10px]` in `MobileCommandCenter.svelte:294–306`.

### Wave 2 — mid-effort (3–5 days)

1. Long-press handler for `DocTreeNode` context menu (or visible kebab button on `<lg`).
2. Convert `TimePlayCalendar` mouse handlers to Pointer Events so touch works alongside mouse.
3. Force day-view (or add horizontal scroll) on calendar at `<md`.
4. Focus-trap utility for the Navigation drawer (use the same pattern as Modal).
5. Skip / back-out CTA for onboarding flow.
6. Tablet (`md:`) density review: nav, dashboard grids, sidebar layouts.
7. Verify (or add) `prose-pre:overflow-x-auto` and table wrapping in blog template.

### Wave 3 — bigger lifts

1. Ontology graph: explicit responsive sizing, touch-pinch-zoom verification, mobile-readable node labels.
2. Voice-notes recorder mobile pass.
3. Real-device testing matrix (see Open Questions).
4. Archive or delete `onboarding/` and `onboarding-v2/` directories if they're dead code — audit overhead.

---

## Open questions / things this audit did not cover

- **Real-device testing** at iPhone SE (375×667), iPhone 14/15 Pro Max, iPad portrait (768×1024), and one mid-range Android. The audit was static; some claims need physical confirmation (e.g., onboarding step-label overlap, Cytoscape touch zoom, blog code-block overflow).
- **Performance on low-end mobile** (animation jank, time-to-interactive on 3G). Cross-reference `apps/web/docs/technical/MOBILE_PERFORMANCE_OPTIMIZATION_PLAN.md`.
- **Keyboard avoidance regression test** for forms inside modals — `interactive-widget=resizes-content` is set but verify push behavior on iOS 17+.
- **Locales / RTL** — not audited.
- **Accessibility deep dive** — touch targets and inputs were checked, but full WCAG AA review (contrast, focus-visible coverage, screen reader landmarks) is a separate exercise. Consider running the `accessibility-auditor` agent next.
- **Voice-notes, homework, history components** — only quick-scanned.
- **Calendar event creation modal** — not deep-audited; date-picker mobile UX is a common pain point and worth its own pass.

---

## Compliance scorecard against existing standards

| Standard                                             | Compliance | Notes                                                                    |
| ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| `MOBILE_RESPONSIVE_BEST_PRACTICES.md` modal patterns | ✅ mostly  | Bottom-sheet pattern present; missing only the close-button sizing       |
| `MOBILE_RESPONSIVE_BEST_PRACTICES.md` form keyboards | ✅         | Auth flow is exemplary; some other forms unaudited                       |
| `INKPRINT_DESIGN_SYSTEM.md` 7.2 type hierarchy       | ⚠️ drift   | `text-[10px]` and `text-[11px]` in MobileCommandCenter, debug panels     |
| `INKPRINT_DESIGN_SYSTEM.md` 8.4 surface levels       | ✅         |                                                                          |
| `INKPRINT_DESIGN_SYSTEM.md` 9.10 mobile back button  | ⚠️ partial | Onboarding lacks back/skip; otherwise fine                               |
| `MODAL_STANDARDS.md`                                 | ⚠️ partial | Close button 28px below implied 36/44px floor                            |
| `TEXTAREA_BUTTON_DESIGN_MOBILE.md`                   | ⚠️ partial | TextareaWithVoice ✅, RichMarkdownEditor ❌, CommentTextareaWithVoice ❌ |
| `TEXTAREA_WITH_VOICE_MOBILE_OPTIMIZATION.md`         | ✅         | Fully compliant in the brain-dump component                              |

---

_Generated 2026-04-27 by parallel investigation across layout/navigation, modals/forms/primitives, feature components, and public/auth/marketing/blog/onboarding scopes. Highest-impact claims verified against source before recording._

---

## Fixes applied — 2026-04-27 (PM)

Five findings from this audit were addressed in the same session. All edits passed `pnpm --filter=@buildos/web check` (svelte-check) with **0 new errors** (171 pre-existing warnings unchanged, all in unrelated files).

### 1. C2 — Auth pages now use `100dvh` ✅

**Files changed:**

- `apps/web/src/routes/auth/login/+page.svelte:320–322`
- `apps/web/src/routes/auth/register/+page.svelte:362–364`
- `apps/web/src/routes/auth/forgot-password/+page.svelte:34–36`
- `apps/web/src/routes/auth/reset-password/+page.svelte:19–21`
- `apps/web/src/routes/time-blocks/+page.svelte:231`

**Change:** Removed the inline `style="min-height: calc(100vh - 64px);"` and replaced with two stacked Tailwind classes — `min-h-[calc(100vh-4rem)]` first as a fallback, then `min-h-[calc(100dvh-4rem)]` which wins under the cascade in browsers that support `dvh` (iOS 16.4+, Chrome 108+, Firefox 101+). Also drops the magic `64px` literal in favor of `4rem` so it tracks the navbar's `h-16` token.

**Why this matters on mobile:** Mobile Safari's `100vh` is the largest possible viewport (URL bar collapsed). With the URL bar visible, `calc(100vh - 64px)` produced a container that overflowed the visible area, forcing extra scroll on the auth screens. `100dvh` is the dynamic viewport height — exactly what's visible right now.

### 2. C4 — DocTreeNode long-press context menu ✅

**File changed:** `apps/web/src/lib/components/ontology/doc-tree/DocTreeNode.svelte:140–183, 234–238`

**Change:** Added a long-press handler bound to Pointer Events that fires the same `handleContextMenu(e)` on touch devices. Implementation details:

- Only activates for `e.pointerType === 'touch'`; mouse and pen flow through to the existing `oncontextmenu`.
- 500ms timer with 8px movement tolerance (canceled on `pointermove > 8px`, `pointerup`, `pointercancel`, or `pointerleave`).
- Skips long-press if the press starts on an interactive child (`button`, `[role="button"]`, `a`) — drag handle, chevron, and open-document button are unaffected.
- Reuses the existing `handleContextMenu` signature (`PointerEvent extends MouseEvent`, so `clientX/Y` are valid for the parent's positioning logic).

**Why this matters on mobile:** iOS Safari does not fire a synthetic `contextmenu` event on long-press; instead it pops the OS lookup/copy menu. Tree nodes were unreachable for rename/move/cut/convert on phone or tablet.

### 3. C5 — Mobile menu locks body scroll ✅

**File changed:** `apps/web/src/lib/components/layout/Navigation.svelte:64–66, 277–301`

**Change:** Added a `$effect` that runs whenever `showMobileMenu` becomes truthy:

- Sets `document.body.style.overflow = 'hidden'` (saving the previous value).
- Captures `document.activeElement` so focus can be restored on close.
- Cleanup function reverses both — restores `overflow`, refocuses the prior element, and clears the captured ref.

**Why this matters on mobile:** Previously the page beneath the open drawer would scroll with the user's gesture, stealing momentum from the drawer's own scrollable region. Especially noticeable on long mobile menus.

### 4. H3 — Mobile menu has `aria-modal`, role=dialog, and focus trap ✅

**File changed:** `apps/web/src/lib/components/layout/Navigation.svelte:253–273, 882–893`

**Change:**

- The drawer container now has `role="dialog"`, `aria-modal="true"`, `aria-label="Mobile navigation menu"`, `tabindex="-1"`, and a `bind:this={mobileMenuElement}`.
- New `handleMobileMenuKeydown` traps `Tab` / `Shift+Tab` cycling within the drawer's focusable descendants (uses `Array.prototype.at()` for safe indexing under `noUncheckedIndexedAccess`).
- The `$effect` from C5 also handles focus-on-open (first focusable in the drawer) and focus-restore-on-close (the element that triggered the menu).

**Note on the audit:** The original draft said the nav lacked `data-fixed-element`. That was wrong — `Navigation.svelte:347` already has it, so `pwa.css:6`'s `safe-area-inset-top` rule was already applying. Doc has been corrected inline.

### 5. H2 / Wave-1 — Voice buttons aligned to spec ✅

**Files changed:**

- `apps/web/src/lib/components/ui/CommentTextareaWithVoice.svelte:1144–1163`
- `apps/web/src/lib/components/ui/RichMarkdownEditor.svelte:1547–1569`

**Change:** Both voice-button regressions (28px `h-7 w-7` and `h-8 w-8 sm:h-7 sm:w-7`) now use `h-10 w-10 xs:h-9 xs:w-9` — **40px on portrait phones (`<480px`)**, **36px from `xs:` and up**. This matches the canonical pattern in `TextareaWithVoice.svelte` and the published spec in `apps/web/docs/technical/components/TEXTAREA_BUTTON_DESIGN_MOBILE.md`. Icon sizes inside the buttons were also bumped (`h-3.5 w-3.5` → `h-4 w-4 xs:h-3.5 xs:w-3.5`) so glyphs scale with the container.

**Note:** The audit's "Fix #6" item was broader (Modal close button + Toast dismiss + Voice buttons all to 36–40px). Only the voice-button portion was addressed in this round. Modal close (`h-7 w-7`) and Toast dismiss (`w-8 h-8 sm:w-7 sm:h-7`) remain open.

### Verification

```
pnpm --filter=@buildos/web check
=> svelte-check found 0 errors and 171 warnings in 41 files
```

The 171 warnings are pre-existing `let X = $state(data.X)` patterns in `tasks/[task_id]/+page.svelte`, `tree-agent/`, and friends — unrelated to these changes.

Spot-grep verifications:

| Fix | Grep                                                                                | Result                                       |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| C2  | `grep "100dvh" auth/*/+page.svelte time-blocks/+page.svelte`                        | 5 matches (one per file, all paired with vh) |
| C2  | `grep "style=\".*100vh" auth/*/+page.svelte`                                        | 0 matches (inline styles removed)            |
| C4  | `grep "longPress\|onpointerdown" DocTreeNode.svelte`                                | handler defined and bound                    |
| C5  | `grep "body\.style\.overflow" Navigation.svelte`                                    | set to `hidden` on open, restored in cleanup |
| H3  | `grep "aria-modal\|handleMobileMenuKeydown" Navigation.svelte`                      | both present, drawer markup updated          |
| H2  | `grep "h-10 w-10 xs:h-9" CommentTextareaWithVoice.svelte RichMarkdownEditor.svelte` | 2 matches (one per file, voice button only)  |

### Things still open after this round

- **C1** TimePlayCalendar slot drag-to-create — still mouse-only.
- **C3** Non-responsive grids in `CalendarAnalysisResults.svelte:446` and `AnalyticsDashboard.svelte:680/772/827`.
- **H1** Modal close button (28px) and Toast dismiss (32→28px) still below 36–44px targets.
- **H4** Navigation hamburger and chat launcher still `h-9` (36px) — acceptable but below 44px.
- **H5–H8** All medium-and-below items unchanged.

### What was not regressed (good news)

- All four auth flows still render the same SEO heads, autocomplete attrs, and form layouts — only the outer container's min-height technique changed.
- `TextareaWithVoice.svelte` was not touched; the brain-dump primary input is untouched.
- The DocTreeNode change is additive — mouse-driven `oncontextmenu` and the existing drag-handle touch flow continue to work as before.
- No new error-level diagnostics from svelte-check; warning count stayed flat.

_Fixes applied 2026-04-27 PM, verified by svelte-check and targeted greps. The remaining open findings are tracked in the [Recommended fix plan](#recommended-fix-plan) section above._

---

## Fixes applied — 2026-04-28

### 6. H7 — Toast positioning breakpoint moved to `md:768` ✅

**Files changed:**

- `apps/web/src/lib/components/ui/ToastContainer.svelte:23–44, 53, 76–82`
- `apps/web/src/lib/components/ui/Toast.svelte:163, 263`

**Change:** All toast positioning, sizing, and animation classes that previously gated on `sm:` (≥640px) now gate on `md:` (≥768px). Specifically:

- **Container position:** `sm:top-4 sm:right-4 sm:bottom-auto sm:left-auto sm:pb-0 sm:px-0 sm:items-end sm:gap-3` → `md:` equivalents.
- **Toast width:** `sm:w-auto` (toast wrapper) → `md:w-auto`. `sm:max-w-md` (toast card) → `md:max-w-md`.
- **Swipe-hint indicator:** `sm:hidden` → `md:hidden`, so phones in landscape (which still see the bottom-anchored toast) keep the swipe-down affordance.
- **Exit-animation media query:** `@media (max-width: 639px)` → `@media (max-width: 767px)` so the slide-down exit pairs with the bottom-anchored layout across the whole `<md:` range.

**Why this matters on mobile:** Mid-range phones in landscape (typically 640–767px wide — iPhone 13 mini, SE, Pro in landscape) and large phones in portrait that creep above 600px were getting an abrupt corner toast at the bottom-thumb-zone breakpoint. Moving the flip to `md:768` keeps the bottom-anchored, full-width toast wherever the thumb actually reaches, and only switches to the corner pattern when there's real desktop/tablet horizontal real estate.

**Note:** The Toast.svelte dismiss-button sizing (`w-8 h-8 sm:w-7 sm:h-7`) was intentionally **not** changed in this round. That belongs to the H1/Low item ("Toast dismiss button is `w-8 h-8 sm:w-7 sm:h-7`") and is a separate sizing concern, not a positioning concern.

### Verification

```
pnpm --filter=@buildos/web check
=> svelte-check found 0 errors and 171 warnings in 41 files
```

Same pre-existing warning count as the 2026-04-27 PM round — no new diagnostics introduced.

| Fix | Grep                                                                | Result                                    |
| --- | ------------------------------------------------------------------- | ----------------------------------------- |
| H7  | `grep "sm:top-4\|sm:right-4\|sm:items-end" ToastContainer.svelte`   | 0 matches (all flipped to `md:`)          |
| H7  | `grep "md:top-4\|md:right-4\|md:bottom-auto" ToastContainer.svelte` | matches present in container class string |
| H7  | `grep "max-width: 767px" ToastContainer.svelte`                     | 1 match (exit-animation override)         |
| H7  | `grep "md:max-w-md\|md:hidden" Toast.svelte`                        | 2 matches (one each)                      |

### 7. Low / nitpick sweep — 8 of 9 items resolved ✅

**Files changed (8 total):**

- `apps/web/src/lib/components/ui/Modal.svelte:546` — close-button hover from hardcoded red to destructive token (light + dark unified to `hover:border-destructive/50 hover:text-destructive`).
- `apps/web/src/lib/components/ui/Modal.svelte:639–648` — drag-handle wrapper now uses `min-height: 36px` + `padding: 0.625rem 0` so the **tap zone** is ≥36px (Inkprint high-density floor) while the **visible bar** stays at the original 32×3px (40px on hover).
- `apps/web/src/lib/components/layout/Footer.svelte:88, 104` — authenticated footer copyright + nav containers bumped from `text-xs` to `text-sm sm:text-xs` (14px on phone, 12px on tablet+).
- `apps/web/src/lib/components/layout/Navigation.svelte:639–648` — mobile onboarding cue: replaced 10px ping dot with a `{onboardingProgress}%` accent chip in the same corner. Far more legible at a glance, same footprint, retains `aria-hidden="true"` (drawer entry already has its own labeling).
- `apps/web/src/lib/components/ontology/doc-tree/DocTreeNode.svelte:287` — chevron tap zone widened to `w-6 h-6 -m-1` on `<sm` (24×24 on phones, back to 16×16 on `sm:`+). Negative margin keeps siblings aligned. Added `touch-manipulation`.
- `apps/web/src/routes/contact/+page.svelte:97–107` — hero `<video>` now has `width="40" height="40" preload="metadata"`. (`loading="lazy"` doesn't apply to `<video>`; `preload="metadata"` is the correct lazy-equivalent, and the explicit dimensions prevent CLS.)
- `apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte:626, 766, 917` — three navigational "View all / All projects / All chats / Recent chats" anchor links bumped to `text-sm sm:text-xs`. Static metadata at `text-xs` left intentionally (audit explicitly says "not broken, just dense").
- `apps/web/src/lib/components/ui/Toast.svelte:223, 234` — dismiss button is now `w-9 h-9 md:w-8 md:h-8` (36px mobile, 32px desktop), icon scales `w-4 h-4 md:w-3.5 md:h-3.5`. Aligned to the new `md:` breakpoint introduced for the toast positioning fix above. Resolves the inverted-sizing weirdness called out in the audit.

**Item not changed:**

- `TextareaWithVoice.svelte` "padding math" nitpick is **OBSOLETE**. The audit referenced `pr-[90px]` / `pr-[54px]` overlay padding, but the component has been refactored — voice and action buttons are now in a separate flex row below the textarea (`mt-1.5 flex items-center gap-2 xs:hidden` on mobile, `xs:flex` row on desktop). `grep -rn "pr-\[" apps/web/src/lib/components/ui/{TextareaWithVoice,CommentTextareaWithVoice,RichMarkdownEditor}.svelte` returns zero matches. No fix required.

### Verification (combined H7 + Low pass)

```
pnpm --filter=@buildos/web check
=> svelte-check found 0 errors and 171 warnings in 41 files
```

Warning count unchanged from baseline.

| Fix | Grep                                                                                                 | Result                         |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| L1  | `grep "hover:border-red-600\|dark:hover:text-red-400" Modal.svelte`                                  | 0 matches (red tokens removed) |
| L1  | `grep "hover:border-destructive/50" Modal.svelte`                                                    | 1 match                        |
| L2  | `grep "min-height: 36px" Modal.svelte`                                                               | 1 match (drag-handle-wrapper)  |
| L3  | `grep "text-sm sm:text-xs font-semibold tracking-tight" Footer.svelte`                               | 2 matches (copyright + nav)    |
| L4  | `grep -r "pr-\[" TextareaWithVoice.svelte CommentTextareaWithVoice.svelte RichMarkdownEditor.svelte` | 0 matches (obsolete)           |
| L5  | `grep "onboardingProgress}%" Navigation.svelte`                                                      | match present in chip          |
| L6  | `grep "doc-tree-chevron w-6 h-6 sm:w-4" DocTreeNode.svelte`                                          | 1 match                        |
| L7  | `grep 'preload="metadata"' contact/+page.svelte`                                                     | 1 match                        |
| L8  | `grep -c "text-sm sm:text-xs" AnalyticsDashboard.svelte`                                             | 3 matches                      |
| L9  | `grep "w-9 h-9 md:w-8 md:h-8\|w-4 h-4 md:w-3.5 md:h-3.5" Toast.svelte`                               | 2 matches                      |
