---
title: Comprehensive UI/UX & Svelte 5 Audit - Projects, Project Detail, and AgentChatModal
date: 2026-02-05
scope: apps/web (routes/projects, routes/projects/[id], components/agent, components/project, components/ontology)
status: complete
files_audited: 80+
path: thoughts/shared/research/2026-02-05_comprehensive-ui-ux-svelte5-audit.md
---

# Comprehensive UI/UX & Svelte 5 Audit Report

## Scope

Full audit of three critical surfaces in BuildOS:

1. **Projects listing page** (`/projects`) -- 16 files
2. **Project detail page** (`/projects/[id]`) -- 18 files
3. **AgentChatModal** + all sub-components -- 17 files
4. **Project modals** + ontology components -- 21 files

**Audited against:**
- Svelte 5 runes patterns (`$state`, `$derived`, `$effect`, `$props()`)
- Inkprint Design System (semantic tokens, textures, weights, shadows)
- Dark mode compliance
- Accessibility (WCAG AA)
- Responsive design (mobile-first)
- Code quality and consistency

---

## Executive Summary

| Area | Svelte 5 Compliance | Inkprint Compliance | Overall Grade |
|------|---------------------|---------------------|---------------|
| **Projects listing** (`/projects`) | Mixed -- main page good, 6/8 sub-components legacy Svelte 4 | Good on main page, poor on sub-components | **B-** |
| **Project detail** (`/projects/[id]`) | Mixed -- newer CommandCenter good, older sections fully legacy | Severe split: new components A, old components F | **C** |
| **AgentChatModal** | Excellent -- all components use proper Svelte 5 runes | Good overall, some hardcoded status colors | **A-** |
| **Project modals** | Poor -- most modals are legacy Svelte 4 | Severe gap: ontology modals A, project modals F | **D+** |

### Top-Level Finding: Two-Era Codebase

The codebase has a clear generational split:

- **"New era"** components (ontology, CommandCenter, AgentChat) use proper Svelte 5 runes, Inkprint tokens, textures, weights, and `pressable` classes
- **"Old era"** components (ProjectHeader, TasksList, PhasesSection, NotesSection, TaskModal, most project modals) use Svelte 4 syntax (`export let`, `$:`, `createEventDispatcher`) and hardcoded colors with manual `dark:` overrides

This creates a **jarring visual inconsistency** for users navigating between features and **broken dark mode** in all old-era components.

---

## Issue Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **Critical** | 22 | Legacy Svelte 4 syntax, missing Inkprint tokens, race conditions, invalid snippets |
| **Major** | 30 | Mixed event patterns, `window.location.reload()`, native `confirm()`, XSS risk, broken Set reactivity |
| **Minor** | 45 | Accessibility gaps, dead code, naming inconsistencies, duplicate CSS, fragile patterns |

---

## Section 1: Projects Listing Page (`/projects`)

### Critical Issues

| ID | File | Line(s) | Issue |
|----|------|---------|-------|
| PL-C1 | `ProjectsHeader.svelte` | 6-11 | Uses `export let`, `createEventDispatcher` (Svelte 4) |
| PL-C2 | `ProjectsFilterBar.svelte` | 4-33 | All props use `export let`, uses `createEventDispatcher` |
| PL-C3 | `ProjectsEmptyState.svelte` | 6-13 | `export let`, `createEventDispatcher` |
| PL-C4 | `ProjectsEmptyState.svelte` | 30-33 | `$:` reactive statements instead of `$derived` |
| PL-C5 | `NewProjectModal.svelte` | 7-19 | `export let`, `createEventDispatcher` |
| PL-C6 | `ProjectStats.svelte` | 4-13 | `export let` for props |
| PL-C7 | `BriefsGrid.svelte` | 6-13 | `export let`, `createEventDispatcher`, `on:open` (Svelte 4 event) |
| PL-C8 | `ProjectsGrid.svelte` | 3-12 | References stale `Project` type, appears to be dead code |

### Major Issues

| ID | File | Line(s) | Issue |
|----|------|---------|-------|
| PL-M1 | `+page.svelte` | 69 | `window.location.reload()` on chat modal close -- destroys client state. Use `invalidateAll()` |
| PL-M2 | `+page.svelte` | 9, 109 | `get()` from `svelte/store` for initialization -- code smell in Svelte 5 |
| PL-M3 | `+page.svelte` | 511-516 | Missing `aria-label` on search input |
| PL-M4 | `+page.svelte` | 439-467 | View toggle uses `aria-pressed` instead of proper `role="tablist"` / `aria-selected` |
| PL-M5 | `+error.svelte` | 51-53 | "Go to Dashboard" navigates to `/ontology` (stale URL). Title says "Ontology" |
| PL-M6 | `ProjectsGrid.svelte` | 5 | Uses stale `Project` type, not `OntologyProjectSummary` |
| PL-M7 | `ProjectCard.svelte` | 125-136 | Mobile stat icons have `title` (doesn't work on touch) but no `aria-label` |
| PL-M8 | Multiple | -- | Excessive use of `any` type (`AgentChatModal`, `ProjectsGrid`, `BriefsGrid`) |
| PL-M9 | `ProjectCard.svelte` | 103-105 | Redundant JS truncation + CSS `line-clamp-2` |

### Minor Issues

| ID | File | Issue |
|----|------|-------|
| PL-m1 | `+page.svelte:139` | `projectsStreamVersion` mutated in `$effect` without `$state` |
| PL-m2 | `+page.svelte:517-548` | Inline SVGs instead of lucide-svelte icons (Search, Plus, FolderOpen) |
| PL-m3 | `+page.svelte:179` | Redundant `projects` alias: `$derived(projectSummaries)` |
| PL-m4 | `+layout.svelte:6,9` | Redundant `rounded-md` on full-page wrapper, redundant `min-h-screen` + `min-h-[100dvh]` |
| PL-m5 | `ProjectCardNextStep.svelte:130-137` | Duplicates Tailwind's `line-clamp-2` utility in custom CSS |
| PL-m6 | Skeleton vs real grid | Gap values differ: `gap-3` vs `gap-2.5` causing layout shift |

### Design System Compliance

| Component | Semantic Tokens | Shadows | Textures | Pressable | Weight | Grade |
|-----------|----------------|---------|----------|-----------|--------|-------|
| `+page.svelte` | Yes | Yes | Yes (frame, grain, thread, pulse, static) | Yes | Yes (wt-paper, wt-card) | **A** |
| `ProjectCard.svelte` | Yes | -- | tx-frame, tx-thread | pressable | wt-paper | **A-** |
| `ProjectsHeader.svelte` | Partial | No | No | No | No | **C** |
| `ProjectsFilterBar.svelte` | Partial | No | No | No | No | **C** |
| `ProjectsEmptyState.svelte` | Yes | shadow-ink | tx-bloom | No | No | **B-** |
| `NewProjectModal.svelte` | Yes | shadow-ink | tx-bloom, tx-frame | pressable | No | **A-** |
| `ProjectStats.svelte` | Yes | shadow-ink | tx-frame, tx-pulse, tx-static, tx-grain | No | No | **B** |

---

## Section 2: Project Detail Page (`/projects/[id]`)

### Critical Issues

| ID | File | Line(s) | Issue |
|----|------|---------|-------|
| PD-C1 | `NotesSection.svelte` | 12-29 | Entirely Svelte 4: `export let`, `$:`, plain `let` without `$state` |
| PD-C2 | `ProjectSynthesis.svelte` | 36-471 | Entirely Svelte 4: 1039 lines, `export let`, extensive `$:` blocks |
| PD-C3 | `ProjectBriefsSection.svelte` | 10-18 | Entirely Svelte 4: `export let`, `$:` |
| PD-C4 | `ProjectHeader.svelte` | all | 1655 lines, zero Inkprint tokens. All hardcoded: `bg-white`, `dark:bg-gray-800`, `text-gray-900`, etc. |
| PD-C5 | `ProjectHeaderMinimal.svelte` | 700-979 | Hardcoded `rgba()` in CSS with `:global(.dark)` overrides |
| PD-C6 | `TasksList.svelte` | all | Svelte 5 compliant but zero Inkprint tokens (1545 lines hardcoded colors) |
| PD-C7 | `PhasesSection.svelte` | all | No Inkprint tokens in 760 lines |
| PD-C8 | `ProjectTabs.svelte` | all | Hardcoded CSS custom properties with RGB color values |
| PD-C9 | `ProjectTimelineCompact.svelte` | 613-619 | Hardcoded `white` and `rgb(17 24 39)` for borders |
| PD-C10 | `ProjectSynthesis.svelte` | all | No Inkprint tokens in 1039 lines |
| PD-C11 | `BraindumpsSection.svelte` | all | No Inkprint tokens |
| PD-C12 | `NotesSection.svelte` | all | No Inkprint tokens |

### Major Issues

| ID | File | Line(s) | Issue |
|----|------|---------|-------|
| PD-M1 | `ProjectHeader.svelte` | 60, 88, 643-644 | Non-`$state` reactive variables (`phaseTaskMap`, `desktopMenuButton`, caching vars) |
| PD-M2 | `ProjectHeader.svelte` | 373, 383, 531, 720-725 | Console.log statements left in production code |
| PD-M3 | `PhasesSection.svelte` | 1, 68 | Has `<svelte:options runes={true} />` but uses `createEventDispatcher` and `on:` events |
| PD-M4 | `ProjectTabs.svelte` | 30 | Uses `createEventDispatcher` instead of callback props |
| PD-M5 | `ProjectModals.svelte` | -- | Mixes `on:close`/`on:updated` (Svelte 4) with callback props |
| PD-M6 | `ProjectModals.svelte` | 872-874 | Sets `scroll-behavior: smooth` on `*` globally -- affects entire app |
| PD-M7 | `CommandCenterDocumentsPanel.svelte` | 176 | `on:click` on `<svelte:window>` (Svelte 4 syntax) |
| PD-M8 | `PhasesSection.svelte` | 581 | Deprecated `on:beforeunload` syntax |
| PD-M9 | `BraindumpsSection.svelte` | 105 | Uses browser `confirm()` instead of styled ConfirmationModal |
| PD-M10 | `+page.server.ts` | 210 | `loadFullData` returns `Promise<any>` -- untyped |
| PD-M11 | `ProjectHeaderMinimal.svelte` | 204 | `let TimelineVisualization: any = null` without `$state` |
| PD-M12 | Multiple | -- | Inconsistent loading state patterns (skeleton vs text vs spinner) |
| PD-M13 | Multiple | -- | Inconsistent empty state patterns across sections |
| PD-M14 | Multiple | -- | Clear design system compliance gap between component groups |
| PD-M15 | `TasksList.svelte`, `BraindumpsSection.svelte` | -- | Both duplicate `@keyframes animate-spin` (Tailwind built-in) |

### Minor Issues

| ID | File | Issue |
|----|------|-------|
| PD-m1 | `ProjectHeaderMinimal.svelte:709` | CSS typo: `.title-sectionfocus` should be `.title-section:focus` |
| PD-m2 | `ProjectHeader.svelte` | 1655 lines -- needs decomposition |
| PD-m3 | `TasksList.svelte` | 1545 lines -- needs decomposition |
| PD-m4 | `ProjectSynthesis.svelte` | 1039 lines -- needs decomposition |
| PD-m5 | Multiple | Inconsistent `pressable` usage (only CommandCenter components use it) |
| PD-m6 | Multiple | Missing `aria-label` on icon-only buttons in ProjectHeader, TasksList, PhasesSection |
| PD-m7 | Multiple | Inconsistent border radius (`rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full`) |
| PD-m8 | `ProjectTabs.svelte` | Proper `role="tablist"` but missing left/right arrow key navigation |
| PD-m9 | `CommandCenterDocumentsPanel.svelte:283` | Context menu positioning can go off-screen near edges |
| PD-m10 | `ProjectHeader.svelte` | `phaseTaskMap` and `cachedTaskDots` never cleared -- potential stale cache |

### Component Group Compliance Split

| Group | Components | Inkprint Status |
|-------|-----------|-----------------|
| **New (Compliant)** | CommandCenterPanel, CommandCenterDocumentsPanel, CommandCenterRow, MobileCommandCenter, +error.svelte | Full: `bg-card`, `shadow-ink`, `tx` classes, `pressable` |
| **Old (Non-compliant)** | ProjectHeader, ProjectHeaderMinimal, ProjectTabs, TasksList, PhasesSection, NotesSection, BraindumpsSection, ProjectSynthesis, ProjectBriefsSection, ProjectTimelineCompact | Zero: all hardcoded colors |

---

## Section 3: AgentChatModal

### Critical Issues

| ID | File | Line(s) | Issue |
|----|------|---------|-------|
| AC-C1 | `AgentChatModal.svelte` | 282 | `currentStreamController` is plain `let`, not `$state`. Asymmetry with reactive `isStreaming` creates race condition vector for dangling streams |
| AC-C2 | `AgentChatModal.svelte` | 1088-1108 | `$effect` fires async IIFE without cancellation token. Context change during in-flight prewarm causes stale promise to overwrite `currentSession` |
| AC-C3 | `AgentChatModal.svelte` | 1407-1419 | `$effect` triggers `runAgentToAgentTurn()` without debounce. Multiple reactive dependencies could cause duplicate agent turns |

### Major Issues

| ID | File | Line(s) | Issue |
|----|------|---------|-------|
| AC-M1 | `AgentChatModal.svelte` | all | 3813 lines, 50+ `$state` vars, 15+ `$derived`, 10+ `$effect`, 543-line SSE handler switch. Extreme single-responsibility violation |
| AC-M2 | `AgentChatModal.svelte` | 371 | `sessionLoadController` not reactive, potential stale state on rapid open/close |
| AC-M3 | `AgentChatHeader.svelte` | 88-98 | Duplicate `<img>` tags for dark/light mode using same source image |
| AC-M4 | `AgentMessageList.svelte` | 137, 180 | `{@html renderMarkdown(message.content)}` -- XSS risk if markdown renderer doesn't sanitize |
| AC-M5 | `OperationsLog.svelte` | 136-150 | `$effect` mutates Set in-place via `.add()` without reassignment -- broken auto-expand |
| AC-M6 | `OperationsQueue.svelte` | multiple | `selectedOperations` Set mutations rely on fragile reassignment pattern |
| AC-M7 | `AgentChatModal.svelte` | 1191-1200 | No loading indicator when resuming chat session with `initialChatSessionId` |
| AC-M8 | `AgentChatModal.svelte` | 308 | `hasFinalizedSession` is plain boolean reset inside reactive `$effect` -- inconsistent |

### Minor Issues

| ID | File | Issue |
|----|------|-------|
| AC-m1 | `agent-chat.constants.ts:48-57` | `CONTEXT_BADGE_CLASSES` uses hardcoded colors with `dark:` variants instead of semantic tokens |
| AC-m2 | `AgentChatHeader.svelte:55-57` | Context status colors hardcoded instead of semantic tokens |
| AC-m3 | `ThinkingBlock.svelte:129-136` | Duplicates `formatTime` (different format than `agent-chat-formatters.ts`) |
| AC-m4 | `AgentChatModal.svelte:3384` | Message list missing `role="log"` or `aria-live="polite"` for streaming content |
| AC-m5 | `AgentChatModal.svelte:271-276` | `isTouchDevice` uses `$derived` for static value -- unnecessary reactivity |
| AC-m6 | `AgentChatModal.svelte` | Mixes `onDestroy` and `$effect` cleanup patterns |
| AC-m7 | `DraftsList.svelte:131` | Empty `class=""` on Button component |
| AC-m8 | `ProjectActionSelector.svelte:16` | `projectId` and `onBack` props declared but never used |
| AC-m9 | `AgentChatModal.svelte` | No focus management to composer after context selection |
| AC-m10 | `ThinkingBlock.svelte:21-29` | `planCollapseStates` Map workaround: `new Map(...)` on every toggle is O(n) |
| AC-m11 | `DraftsList.svelte:100-104` | Uses `onMount` instead of `$effect` for auto-expand (won't handle prop changes) |
| AC-m12 | `DraftsList.svelte:57-61` | `setTimeout` in `handleRefresh` not cleaned up on unmount |
| AC-m13 | `PlanVisualization.svelte:188-194` | Progress bar missing `aria-valuetext` |
| AC-m14 | `ThinkingBlock.svelte`, `PlanVisualization.svelte` | Extensive hardcoded status colors |
| AC-m15 | `OperationsLog.svelte`, `OperationsQueue.svelte` | Hardcoded `operationColors` and `statusColors` maps |
| AC-m16 | `AgentMessageList.svelte:66-79` | Suggestion items are plain text, not clickable buttons |
| AC-m17 | `ProjectFocusIndicator.svelte:67` | Button has `title` but no `aria-label` |

### Positive Observations

The AgentChatModal system is the **best-maintained area** of the codebase:

- All 12 components use proper `$props()` with `interface Props`
- Consistent `$state`, `$derived`, `$effect` usage -- no old `$:` syntax anywhere
- Proper `$bindable()` pattern in AgentComposer and AgentMessageList
- Callback props throughout (no `createEventDispatcher`)
- Good array reactivity (spread for new references)
- Comprehensive abort controller management with `runId` stale-stream guards
- Memory leak prevention via `setTrackedTimeout` + `pendingTimeouts` Set + `onDestroy` cleanup
- Strong Inkprint compliance: `shadow-ink`, `tx tx-frame`, `tx tx-grain`, `tx tx-bloom`, `pressable`, semantic tokens
- Comprehensive responsive breakpoints with `dvh` units and landscape media queries
- Good accessibility: `aria-label`, `aria-expanded`, `aria-pressed`, `role="alert"`, `role="status"`, `aria-live`

---

## Section 4: Project Modals & Ontology Components

### Critical Issues

| ID | File | Line(s) | Issue |
|----|------|---------|-------|
| PM-C1 | `TaskModal.svelte` | all | 1708 lines entirely Svelte 4. `export let` (47-67), `$:` throughout (73-1067), `on:confirm`/`on:cancel` events. Zero Inkprint tokens -- 100+ hardcoded color references (slate-*, gray-*, white, rose-*, emerald-*, amber-*, blue-*) |
| PM-C2 | `ProjectContextModal.svelte` | 40-56 | Invalid nested snippets (`{#snippet header()}` inside `{#snippet children()}`). Will cause runtime errors in Svelte 5. Plus `export let`, `createEventDispatcher`, hardcoded colors |
| PM-C3 | `ProjectDatesModal.svelte` | 8-29 | `export let`, `createEventDispatcher`, `$:` reactive statement |
| PM-C4 | `ProjectCalendarConnectModal.svelte` | 9-16 | `export let`, `createEventDispatcher`, plain `let` without `$state` |

### Major Issues

| ID | File | Issue |
|----|------|-------|
| PM-M1 | 5 files | Mixed `createEventDispatcher` + callback props: ConfirmationModal, ProjectHistoryModal, QuickProjectModal, ProjectContextModal, ProjectDatesModal, ProjectCalendarConnectModal |
| PM-M2 | Multiple | Massive design system divergence: project modals use hardcoded colors, ontology modals use proper Inkprint |
| PM-M3 | `QuickProjectModal.svelte:303-326` | Native HTML `<input>` and `<textarea>` instead of design system components |
| PM-M4 | `ProjectShareModal.svelte:274,380` | Uses native `window.confirm()` instead of ConfirmationModal |
| PM-M5 | `ProjectEditModal.svelte:709-730` | Hardcoded `rgba()` colors in `<style>` block |
| PM-M6 | `ProjectHistoryModal.svelte` | Partially migrated: uses `$props()` + `$state` but still has `createEventDispatcher` and hardcoded colors |

### Minor Issues

| ID | File | Issue |
|----|------|-------|
| PM-m1 | `ConfirmationModal.svelte:3-4,49-57` | Legacy dispatch compatibility layer (dispatches both callback + event) |
| PM-m2 | `DocumentEditor.svelte:77` | Unusual non-destructured `$props()` pattern |
| PM-m3 | `StateDisplay.svelte:58-67` | Hardcoded status colors (includes dark mode variants, acceptable) |
| PM-m4 | `OntologyProjectEditModal.svelte:932-994` | Emoji in select labels inconsistent with other ontology components |
| PM-m5 | Multiple project modals | Missing loading states during async operations |
| PM-m6 | Multiple | Inconsistent modal close patterns: `dispatch('close')`, `dispatch('cancel')`, `onClose`, `onCancel` |
| PM-m7 | `TaskEditModal.svelte:34` | Self-referential import for nested modal navigation |

### Design System Divergence

| Component Group | Tokens Used |
|-----------------|-------------|
| **Ontology modals** (TaskCreateModal, TaskEditModal, DocumentModal, OntologyProjectEditModal) | `bg-card`, `text-foreground`, `border-border`, `shadow-ink`, `pressable`, `wt-paper`, `wt-card`, `tx tx-frame`, `tx tx-grain`, `tx tx-strip` |
| **Project modals** (TaskModal, NoteModal, QuickProjectModal, ProjectEditModal, ProjectHistoryModal) | `slate-*`, `gray-*`, `white`, `black`, `rose-*`, `emerald-*`, `amber-*`, `blue-*`, `indigo-*`, `primary-*` (hardcoded) |

---

## Priority Action Plan

### Tier 1: Breaking / Correctness Issues (Fix Now)

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| 1 | **PM-C2**: Fix `ProjectContextModal.svelte` invalid snippet nesting | Runtime errors in Svelte 5 | Small |
| 2 | **AC-C2**: Add cancellation tokens to async `$effect` in AgentChatModal (prewarm) | State corruption on rapid context changes | Small |
| 3 | **AC-C3**: Debounce/guard agent-to-agent turn `$effect` | Potential duplicate concurrent agent turns | Small |
| 4 | **AC-M5**: Fix OperationsLog Set reactivity (reassign after `.add()`) | Broken auto-expand feature | Small |
| 5 | **AC-M4**: Verify `renderMarkdown` sanitizes output (XSS) | Security vulnerability | Small |

### Tier 2: Svelte 5 Migration (Plan and Execute)

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| 6 | **PM-C1**: Migrate `TaskModal.svelte` to Svelte 5 + Inkprint | Largest legacy component (1708 lines) | Large |
| 7 | **PD-C1-C3**: Migrate `NotesSection`, `ProjectSynthesis`, `ProjectBriefsSection` | Will break when runes enforced | Medium each |
| 8 | **PL-C1-C7**: Audit which listing sub-components are actually used; remove dead code, migrate remaining | 6 of 8 sub-components are legacy | Medium |
| 9 | **PM-C3, PM-C4**: Migrate `ProjectDatesModal`, `ProjectCalendarConnectModal` | Small files, quick wins | Small |
| 10 | **PM-M1**: Remove all `createEventDispatcher` usage | Mixed event patterns across codebase | Medium |

### Tier 3: Inkprint Design System Migration (Incremental)

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| 11 | **PD-C4**: Migrate `ProjectHeader.svelte` to Inkprint tokens | Most visible component, 1655 lines | Large |
| 12 | **PD-C6**: Migrate `TasksList.svelte` to Inkprint tokens | Already Svelte 5, just needs token swap | Medium |
| 13 | **PD-C7-C8**: Migrate `PhasesSection`, `ProjectTabs` to Inkprint | Visible tabs and phases | Medium |
| 14 | **PM-M2**: Migrate project modals to Inkprint (NoteModal, QuickProjectModal, ProjectEditModal, ProjectHistoryModal) | Visual consistency with ontology modals | Medium each |
| 15 | **PD-C5, C9**: Fix hardcoded CSS in `ProjectHeaderMinimal`, `ProjectTimelineCompact` | `rgba()` values and `:global(.dark)` overrides | Medium |

### Tier 4: UX and Polish

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| 16 | **PL-M1**: Replace `window.location.reload()` with `invalidateAll()` | Preserves client state on chat close | Small |
| 17 | **PD-M6**: Remove global `* { scroll-behavior: smooth }` from ProjectModals | Performance + side effects | Small |
| 18 | **PD-M2**: Remove console.log statements from ProjectHeader | Info leakage, performance | Small |
| 19 | **PM-M4**: Replace native `confirm()` in ProjectShareModal with ConfirmationModal | Visual consistency | Small |
| 20 | **PD-M12-M13**: Standardize loading/empty state patterns across sections | Consistent UX | Medium |
| 21 | **AC-M1**: Decompose AgentChatModal (extract SSE handler, tool formatters, mutation tracking) | Maintainability | Large |
| 22 | **PD-m2-m4**: Decompose large components (ProjectHeader 1655, TasksList 1545, ProjectSynthesis 1039) | Maintainability | Large |

### Tier 5: Accessibility and Minor Fixes

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| 23 | **PL-M3**: Add `aria-label` to search input | Screen reader accessibility | Tiny |
| 24 | **PL-M4**: Fix tab semantics (`role="tablist"`, `aria-selected`) | Correct screen reader announcements | Small |
| 25 | **PD-m6**: Add `aria-label` to icon-only buttons in ProjectHeader, TasksList, PhasesSection | Accessibility | Small |
| 26 | **AC-m4**: Add `role="log"` / `aria-live="polite"` to message list | Streaming content accessibility | Small |
| 27 | **AC-m13**: Add `aria-valuetext` to PlanVisualization progress bar | Screen reader context | Tiny |
| 28 | **PL-M5**: Fix stale `/ontology` navigation in `+error.svelte` | Broken navigation | Tiny |
| 29 | **PD-m1**: Fix CSS typo `.title-sectionfocus` -> `.title-section:focus` | Broken focus styles | Tiny |

---

## Reference: Components That Are Good Examples

These components demonstrate correct patterns and can serve as migration references:

| Component | Why It's Good |
|-----------|---------------|
| `CommandCenterPanel.svelte` | Perfect Inkprint: `bg-card`, `border-border`, `shadow-ink`, `tx tx-frame tx-weak`, `pressable`, `text-foreground`, `text-muted-foreground`, `text-accent` |
| `+error.svelte` (projects/[id]) | Clean Svelte 5 + Inkprint: `bg-background`, `bg-card`, `bg-muted`, semantic tokens, `$derived` |
| `AgentChatModal.svelte` (template) | Comprehensive Inkprint in template: textures per semantic context (frame for containers, grain for active, bloom for creation, static for errors, thread for connections) |
| `EntityListItem.svelte` | Full weight system: `wt-card`, `wt-paper`, `wt-ghost` + textures + `pressable` + CSS custom properties |
| `TaskEditModal.svelte` | Full Inkprint modal: `wt-paper`, `wt-card`, `tx tx-strip`, `tx tx-frame`, `tx tx-grain`, `pressable` |

---

## Appendix: Files Audited

<details>
<summary>Complete file list (80+ files)</summary>

### Projects Listing Page
- `apps/web/src/routes/projects/+page.svelte`
- `apps/web/src/routes/projects/+page.server.ts`
- `apps/web/src/routes/projects/+layout.svelte`
- `apps/web/src/routes/projects/+layout.server.ts`
- `apps/web/src/routes/projects/+error.svelte`
- `apps/web/src/lib/components/projects/ProjectListSkeleton.svelte`
- `apps/web/src/lib/components/projects/ProjectsGrid.svelte`
- `apps/web/src/lib/components/projects/ProjectsHeader.svelte`
- `apps/web/src/lib/components/projects/ProjectsFilterBar.svelte`
- `apps/web/src/lib/components/projects/ProjectsEmptyState.svelte`
- `apps/web/src/lib/components/projects/NewProjectModal.svelte`
- `apps/web/src/lib/components/projects/ProjectStats.svelte`
- `apps/web/src/lib/components/projects/BriefsGrid.svelte`
- `apps/web/src/lib/components/project/ProjectCard.svelte`
- `apps/web/src/lib/components/project/ProjectCardNextStep.svelte`
- `apps/web/src/lib/components/project/NextStepDisplay.svelte`

### Project Detail Page
- `apps/web/src/routes/projects/[id]/+page.svelte`
- `apps/web/src/routes/projects/[id]/+page.server.ts`
- `apps/web/src/routes/projects/[id]/+error.svelte`
- `apps/web/src/lib/components/project/ProjectHeader.svelte`
- `apps/web/src/lib/components/project/ProjectHeaderMinimal.svelte`
- `apps/web/src/lib/components/project/ProjectTabs.svelte`
- `apps/web/src/lib/components/project/ProjectModals.svelte`
- `apps/web/src/lib/components/project/PhasesSection.svelte`
- `apps/web/src/lib/components/project/TasksList.svelte`
- `apps/web/src/lib/components/project/NotesSection.svelte`
- `apps/web/src/lib/components/project/BraindumpsSection.svelte`
- `apps/web/src/lib/components/project/CommandCenterPanel.svelte`
- `apps/web/src/lib/components/project/CommandCenterDocumentsPanel.svelte`
- `apps/web/src/lib/components/project/CommandCenterRow.svelte`
- `apps/web/src/lib/components/project/MobileCommandCenter.svelte`
- `apps/web/src/lib/components/project/ProjectSynthesis.svelte`
- `apps/web/src/lib/components/project/ProjectBriefsSection.svelte`
- `apps/web/src/lib/components/project/ProjectTimelineCompact.svelte`

### AgentChatModal
- `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- `apps/web/src/lib/components/agent/AgentChatHeader.svelte`
- `apps/web/src/lib/components/agent/AgentComposer.svelte`
- `apps/web/src/lib/components/agent/AgentMessageList.svelte`
- `apps/web/src/lib/components/agent/AgentAutomationWizard.svelte`
- `apps/web/src/lib/components/agent/ProjectFocusSelector.svelte`
- `apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte`
- `apps/web/src/lib/components/agent/ProjectActionSelector.svelte`
- `apps/web/src/lib/components/agent/ThinkingBlock.svelte`
- `apps/web/src/lib/components/agent/PlanVisualization.svelte`
- `apps/web/src/lib/components/agent/DraftsList.svelte`
- `apps/web/src/lib/components/agent/OperationsLog.svelte`
- `apps/web/src/lib/components/agent/OperationsQueue.svelte`
- `apps/web/src/lib/components/agent/agent-chat.types.ts`
- `apps/web/src/lib/components/agent/agent-chat-formatters.ts`
- `apps/web/src/lib/components/agent/agent-chat.constants.ts`
- `apps/web/src/lib/types/agent-chat-enhancement.ts`

### Project Modals
- `apps/web/src/lib/components/project/ProjectEditModal.svelte`
- `apps/web/src/lib/components/project/DeleteConfirmationModal.svelte`
- `apps/web/src/lib/components/project/QuickProjectModal.svelte`
- `apps/web/src/lib/components/project/TaskModal.svelte`
- `apps/web/src/lib/components/project/NoteModal.svelte`
- `apps/web/src/lib/components/project/ProjectContextModal.svelte`
- `apps/web/src/lib/components/project/ProjectDatesModal.svelte`
- `apps/web/src/lib/components/project/ProjectShareModal.svelte`
- `apps/web/src/lib/components/project/ProjectHistoryModal.svelte`
- `apps/web/src/lib/components/project/ProjectCalendarConnectModal.svelte`

### Ontology Components
- `apps/web/src/lib/components/ontology/OntologyProjectHeader.svelte`
- `apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte`
- `apps/web/src/lib/components/ontology/StateDisplay.svelte`
- `apps/web/src/lib/components/ontology/EntityListItem.svelte`
- `apps/web/src/lib/components/ontology/TaskCreateModal.svelte`
- `apps/web/src/lib/components/ontology/TaskEditModal.svelte`
- `apps/web/src/lib/components/ontology/DocumentModal.svelte`
- `apps/web/src/lib/components/ontology/DocumentEditor.svelte`

### Base UI Components
- `apps/web/src/lib/components/ui/Modal.svelte`
- `apps/web/src/lib/components/ui/FormModal.svelte`
- `apps/web/src/lib/components/ui/ConfirmationModal.svelte`

</details>
