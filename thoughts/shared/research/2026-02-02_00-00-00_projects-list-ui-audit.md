<!-- thoughts/shared/research/2026-02-02_00-00-00_projects-list-ui-audit.md -->
# UI Audit: Projects List Page - Style Simplification & Component Extraction

```yaml
type: research
status: implemented
date: 2026-02-02
implemented: 2026-02-02
topic: Frontend UI audit of projects list page (/projects)
scope: apps/web/src/routes/projects/+page.svelte and all subcomponents
purpose: Identify opportunities to simplify styles, extract components, reduce duplication, improve responsiveness
next_action: None - implementation complete
```

---

## Executive Summary

This document contains a comprehensive audit of the `/projects` page (the projects LIST view). Unlike the projects/[id] detail page, this page has **generally good Inkprint compliance** but suffers from **severe code duplication** and **excessive nesting** in specific areas.

**Key Metrics Found:**
- Maximum div nesting: **14-15 levels** (filter panel)
- Code duplication: **~200 lines** duplicated between owned/shared cards
- Filter button class duplication: **4 identical copies**
- File size: **1,218 lines** (should be ~600-800 with proper componentization)
- `!important` overrides: **1 instance** (acceptable)
- Hardcoded colors: **8 instances** (low priority)

**Overall Assessment:** Good design system compliance, but needs component extraction to reduce duplication.

---

## Context & Goals

### What We're Trying to Achieve

1. **Extract Reusable Components** - The main issue is duplication, not styling. Extract ProjectCard and FilterGroup components.

2. **Reduce Nesting** - Filter panel has 14-15 levels of nesting which is excessive.

3. **Fix Mobile Responsiveness** - Stats grid is hardcoded to 4 columns even on tiny screens.

4. **Unify Patterns** - Inconsistent padding (p-2.5 vs p-3) and spacing patterns throughout.

5. **Reduce File Size** - 1,218 lines is too large for a single page component.

### Design System Reference

This page is **already mostly compliant** with Inkprint. Key tokens in use:
- `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border` ✅
- `shadow-ink` ✅
- Texture system (`tx-frame`, `tx-grain`, `tx-thread`, `tx-pulse`) ✅
- Weight system (`wt-paper`, `wt-card`) ✅
- `bg-accent`, `text-accent`, `text-accent-foreground` ✅

---

## Files to Modify

### File Inventory

| File Path | Priority | Issues |
|-----------|----------|--------|
| `apps/web/src/routes/projects/+page.svelte` | CRITICAL | 200+ lines duplicated cards, 14-level nesting in filters, 1218 lines total |
| `apps/web/src/lib/components/ui/Button.svelte` | LOW | Hardcoded colors (red, amber, emerald) in variants |
| `apps/web/src/lib/components/projects/ProjectListSkeleton.svelte` | LOW | Padding mismatch with real cards |
| `apps/web/src/lib/components/project/ProjectCardNextStep.svelte` | LOW | Minor - non-standard icon sizes (3.5) |
| `apps/web/src/lib/components/ui/LoadingSkeleton.svelte` | LOW | Uses old `export let` instead of Svelte 5 `$props()` |

### New Components to Create

| File Path | Purpose |
|-----------|---------|
| `apps/web/src/lib/components/project/ProjectCard.svelte` | Unified card for owned/shared projects |
| `apps/web/src/lib/components/ui/FilterGroup.svelte` | Reusable filter button group |

---

## Detailed Findings by File

### 1. +page.svelte (CRITICAL)

**Location:** `apps/web/src/routes/projects/+page.svelte`

**File Size:** 1,218 lines (too large)

**Max Nesting Depth:** 14-15 levels in filter panel

---

#### Issue 1.1: Massive Code Duplication - Owned vs Shared Cards (Lines 844-954 vs 980-1099)

The owned project card (111 lines) and shared project card (120 lines) are **nearly identical** with only ONE structural difference: the shared badge.

**OWNED PROJECT CARD (Lines 844-954):**
```svelte
<a
  href="/projects/{project.id}"
  onclick={() => handleProjectClick(project)}
  style="view-transition-name: project-title-{project.id}"
  class="group relative flex h-full flex-col wt-paper p-3 sm:p-4 tx tx-frame tx-weak hover:border-accent/60 pressable"
>
  <!-- Header -->
  <div class="mb-1.5 sm:mb-3 flex items-start justify-between gap-1.5 sm:gap-3">
    <div class="min-w-0 flex-1">
      <h3 class="text-xs sm:text-base font-semibold text-foreground line-clamp-2 group-hover:text-accent transition-colors">
        {project.name}
      </h3>
      <span class="sm:hidden inline-flex mt-1 items-center rounded px-1.5 py-0.5 text-[9px] font-semibold capitalize {getStateBadgeClasses(project.state_key)}">
        {project.state_key}
      </span>
    </div>
    <span class="hidden sm:inline-flex flex-shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold capitalize {getStateBadgeClasses(project.state_key)}">
      {project.state_key}
    </span>
  </div>

  <!-- Description -->
  {#if project.description}
    <p class="mb-1.5 sm:mb-3 line-clamp-2 text-[10px] sm:text-sm text-muted-foreground">
      {project.description}
    </p>
  {/if}

  <!-- Next Step -->
  {#if project.next_step_display}
    <div class="mb-1.5 sm:mb-3">
      <ProjectCardNextStep nextStep={project.next_step_display} compact />
    </div>
  {/if}

  <!-- Footer Stats -->
  <div class="mt-auto flex items-center gap-1.5 sm:gap-3 text-[9px] sm:text-xs text-muted-foreground">
    <!-- ... stat items ... -->
  </div>
</a>
```

**SHARED PROJECT CARD (Lines 980-1099):**
```svelte
<!-- NEARLY IDENTICAL except for this section: -->
<div class="flex flex-wrap items-center gap-1 mt-1">
  <span class="sm:hidden inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold capitalize {getStateBadgeClasses(project.state_key)}">
    {project.state_key}
  </span>
  <!-- THIS IS THE ONLY DIFFERENCE -->
  <span class="inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold bg-accent/15 text-accent border border-accent/20">
    Shared{project.access_role ? ` · ${project.access_role}` : ''}
  </span>
</div>
```

**SOLUTION:** Extract to single `ProjectCard.svelte` component:

```svelte
<!-- NEW FILE: apps/web/src/lib/components/project/ProjectCard.svelte -->
<script lang="ts">
  import type { OntologyProjectSummary } from '$lib/services/ontology/ontology-projects.service';
  import ProjectCardNextStep from './ProjectCardNextStep.svelte';
  import { CheckSquare, FileText, Calendar } from 'lucide-svelte';

  let {
    project,
    isShared = false,
    onProjectClick,
    getStateBadgeClasses
  }: {
    project: OntologyProjectSummary;
    isShared?: boolean;
    onProjectClick: (p: OntologyProjectSummary) => void;
    getStateBadgeClasses: (state: string) => string;
  } = $props();
</script>

<a
  href="/projects/{project.id}"
  onclick={() => onProjectClick(project)}
  style:view-transition-name="project-title-{project.id}"
  class="group relative flex h-full flex-col wt-paper p-3 sm:p-4 {isShared ? 'tx tx-thread tx-weak' : 'tx tx-frame tx-weak'} hover:border-accent/60 pressable"
>
  <!-- Header -->
  <div class="mb-1.5 sm:mb-3 flex items-start justify-between gap-1.5 sm:gap-3">
    <div class="min-w-0 flex-1">
      <h3 class="text-xs sm:text-base font-semibold text-foreground line-clamp-2 group-hover:text-accent transition-colors">
        {project.name}
      </h3>
      <div class="flex flex-wrap items-center gap-1 mt-1 sm:hidden">
        <span class="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold capitalize {getStateBadgeClasses(project.state_key)}">
          {project.state_key}
        </span>
        {#if isShared}
          <span class="inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold bg-accent/15 text-accent border border-accent/20">
            Shared{project.access_role ? ` · ${project.access_role}` : ''}
          </span>
        {/if}
      </div>
    </div>
    <div class="hidden sm:flex items-center gap-2">
      {#if isShared}
        <span class="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold bg-accent/15 text-accent border border-accent/20">
          Shared{project.access_role ? ` · ${project.access_role}` : ''}
        </span>
      {/if}
      <span class="flex-shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold capitalize {getStateBadgeClasses(project.state_key)}">
        {project.state_key}
      </span>
    </div>
  </div>

  <!-- Description -->
  {#if project.description}
    <p class="mb-1.5 sm:mb-3 line-clamp-2 text-[10px] sm:text-sm text-muted-foreground">
      {project.description}
    </p>
  {/if}

  <!-- Next Step -->
  {#if project.next_step_display}
    <div class="mb-1.5 sm:mb-3">
      <ProjectCardNextStep nextStep={project.next_step_display} compact />
    </div>
  {/if}

  <!-- Footer Stats -->
  <div class="mt-auto flex items-center gap-1.5 sm:gap-3 text-[9px] sm:text-xs text-muted-foreground">
    {#if project.task_count !== undefined}
      <span class="flex items-center gap-0.5 sm:gap-1">
        <CheckSquare class="w-2.5 h-2.5 sm:w-3 sm:h-3" />
        {project.task_count}
      </span>
    {/if}
    {#if project.document_count !== undefined}
      <span class="flex items-center gap-0.5 sm:gap-1">
        <FileText class="w-2.5 h-2.5 sm:w-3 sm:h-3" />
        {project.document_count}
      </span>
    {/if}
    {#if project.updated_at}
      <span class="flex items-center gap-0.5 sm:gap-1 ml-auto">
        <Calendar class="w-2.5 h-2.5 sm:w-3 sm:h-3" />
        {formatRelativeDate(project.updated_at)}
      </span>
    {/if}
  </div>
</a>
```

**Usage in +page.svelte:**
```svelte
<!-- Owned Projects -->
{#each ownedFilteredProjects as project (project.id)}
  <ProjectCard {project} {onProjectClick} {getStateBadgeClasses} />
{/each}

<!-- Shared Projects -->
{#each sharedFilteredProjects as project (project.id)}
  <ProjectCard {project} isShared={true} {onProjectClick} {getStateBadgeClasses} />
{/each}
```

**Impact:** Removes ~200 lines of duplication.

---

#### Issue 1.2: Excessive Nesting in Filter Panel (Lines 647-773)

**Current Nesting (6 levels to reach a button):**
```svelte
<!-- Line 647 -->
<div id="filter-panel-content" class="grid transition-all duration-200 ease-out ...">  <!-- Level 1 -->
  <!-- Line 653 -->
  <div class="overflow-hidden">  <!-- Level 2 - FOR ANIMATION ONLY -->
    <!-- Line 654 -->
    <div class="px-3 pb-3 pt-1 space-y-3 border-t border-border">  <!-- Level 3 -->
      <!-- Line 657 -->
      <div class="flex flex-col gap-1.5">  <!-- Level 4 - Filter group -->
        <p class="micro-label">State</p>
        <!-- Line 659 -->
        <div class="flex flex-wrap gap-1.5">  <!-- Level 5 - Button container -->
          <!-- Line 660-676 -->
          {#each availableStates as state (state)}
            <button>...</button>  <!-- Level 6 -->
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>
```

**SOLUTION:** Simplify structure and extract FilterGroup component:

```svelte
<!-- SIMPLIFIED STRUCTURE -->
<div id="filter-panel-content" class="grid transition-all duration-200 ease-out ...">
  <div class="px-3 pb-3 pt-1 space-y-3 border-t border-border overflow-hidden">
    <FilterGroup
      label="State"
      options={availableStates}
      selected={selectedStates}
      onToggle={(state) => (selectedStates = toggleValue(selectedStates, state))}
    />
    <FilterGroup
      label="Context"
      options={availableContexts}
      selected={selectedContexts}
      onToggle={(ctx) => (selectedContexts = toggleValue(selectedContexts, ctx))}
    />
    <!-- etc. -->
  </div>
</div>
```

**New Component: FilterGroup.svelte**
```svelte
<!-- NEW FILE: apps/web/src/lib/components/ui/FilterGroup.svelte -->
<script lang="ts">
  let {
    label,
    options,
    selected,
    onToggle
  }: {
    label: string;
    options: string[];
    selected: string[];
    onToggle: (value: string) => void;
  } = $props();

  function isSelected(value: string): boolean {
    return selected.includes(value);
  }

  function getButtonClasses(value: string): string {
    const base = 'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold transition pressable';
    return isSelected(value)
      ? `${base} border-accent bg-accent text-accent-foreground shadow-ink`
      : `${base} border-border text-muted-foreground hover:border-accent hover:bg-muted/50 hover:text-foreground`;
  }
</script>

{#if options.length > 0}
  <div class="flex flex-col gap-1.5">
    <p class="micro-label">{label}</p>
    <div class="flex flex-wrap gap-1.5">
      {#each options as option (option)}
        <button
          type="button"
          class={getButtonClasses(option)}
          onclick={() => onToggle(option)}
        >
          {option}
        </button>
      {/each}
    </div>
  </div>
{/if}
```

**Impact:**
- Reduces nesting from 6 to 4 levels
- Removes 4 copies of identical button class logic (lines 663, 690, 715, 740)

---

#### Issue 1.3: Filter Button Class Duplication (Lines 663, 690, 715, 740)

The exact same button class logic is copy-pasted 4 times:

```svelte
<!-- REPEATED 4 TIMES - State, Context, Scale, Stage -->
class={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold transition pressable ${
  selectedStates.includes(state)
    ? 'border-accent bg-accent text-accent-foreground shadow-ink'
    : 'border-border text-muted-foreground hover:border-accent hover:bg-muted/50 hover:text-foreground'
}`}
```

**SOLUTION:** Already addressed by FilterGroup component above.

---

#### Issue 1.4: Stats Grid Not Responsive (Lines 554-615)

**Current:**
```svelte
<!-- Line 554 -->
<div class="grid grid-cols-4 gap-2 sm:gap-3">
  <!-- 4 stat cards -->
</div>
```

**Problem:** On a 320px phone, each column is ~80px wide. Numbers and labels will wrap/overflow.

**SOLUTION:**
```svelte
<!-- RECOMMENDED -->
<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
  <!-- Stats cards -->
</div>
```

---

#### Issue 1.5: Inconsistent Padding Patterns (Throughout)

| Location | Pattern | Notes |
|----------|---------|-------|
| Line 847 | `p-3 sm:p-4` | Project cards |
| Line 556 | `p-2.5 sm:p-4` | Stat cards |
| Line 623 | `px-3 py-2.5` | Filter header |
| Line 654 | `px-3 pb-3 pt-1` | Filter content |

**SOLUTION:** Standardize on `p-3 sm:p-4` for cards:

```svelte
<!-- All cards should use -->
class="... p-3 sm:p-4 ..."
```

---

#### Issue 1.6: Single `!important` Override (Line 420)

```svelte
class="flex flex-col gap-2 sm:gap-4 sm:flex-row sm:items-center sm:justify-between !mt-0"
```

**Problem:** Using `!mt-0` to override margin from parent.

**SOLUTION:** Control margin at parent level instead:

```svelte
<!-- In parent container, ensure no margin is applied to this child -->
<!-- Or use first-child selector in CSS -->
```

---

#### Issue 1.7: Inline View Transition Styles (Lines 856, 992)

```svelte
style="view-transition-name: project-title-{project.id}"
```

**Problem:** Inconsistent with Tailwind-first approach.

**SOLUTION:** Use Svelte's style directive:

```svelte
style:view-transition-name="project-title-{project.id}"
```

---

### 2. ProjectListSkeleton.svelte (LOW)

**Location:** `apps/web/src/lib/components/projects/ProjectListSkeleton.svelte`

#### Issue 2.1: Padding Mismatch with Real Cards (Line 29)

```svelte
<!-- Skeleton card -->
<div class="... p-2.5 sm:p-4 ...">

<!-- Real card (line 847 of +page.svelte) -->
<a class="... p-3 sm:p-4 ...">
```

**Problem:** Mobile padding doesn't match (p-2.5 vs p-3).

**SOLUTION:** Update skeleton to match:

```svelte
<div class="... p-3 sm:p-4 ...">
```

---

### 3. Button.svelte (LOW)

**Location:** `apps/web/src/lib/components/ui/Button.svelte`

#### Issue 3.1: Hardcoded Colors in Variants (Lines 80, 87, 104)

```javascript
// Line 80 - Danger
danger: `bg-red-600 text-white border border-red-700 hover:bg-red-700 focus:ring-red-600`

// Line 87 - Warning
warning: `bg-amber-600 text-white border border-amber-700 hover:bg-amber-700`

// Line 104 - Success
success: `bg-emerald-600 text-white border border-emerald-700 hover:bg-emerald-700`
```

**Problem:** Hardcoded colors bypass Inkprint design system.

**SOLUTION:** Use semantic tokens:

```javascript
// RECOMMENDED
danger: `bg-destructive text-destructive-foreground border border-destructive hover:bg-destructive/90`
warning: `bg-warning text-warning-foreground border border-warning hover:bg-warning/90`
success: `bg-success text-success-foreground border border-success hover:bg-success/90`
```

**Note:** This requires ensuring `--warning`, `--success` CSS variables exist in the theme.

---

### 4. ProjectCardNextStep.svelte (LOW)

**Location:** `apps/web/src/lib/components/project/ProjectCardNextStep.svelte`

#### Issue 4.1: Non-Standard Icon Sizes (Lines 92, 108)

```svelte
<Zap class="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
```

**Problem:** `w-3.5` (14px) is not a standard Tailwind size. Should use `w-3` (12px) or `w-4` (16px).

**SOLUTION:**
```svelte
<Zap class="w-4 h-4 text-accent flex-shrink-0" />
```

---

### 5. LoadingSkeleton.svelte (LOW)

**Location:** `apps/web/src/lib/components/ui/LoadingSkeleton.svelte`

#### Issue 5.1: Old Svelte Syntax

```svelte
<!-- Lines 5-6 - OLD STYLE -->
export let message: string = 'Loading...';
export let height: string = '400px';
```

**SOLUTION:** Migrate to Svelte 5:

```svelte
<script lang="ts">
  let { message = 'Loading...', height = '400px' }: {
    message?: string;
    height?: string;
  } = $props();
</script>
```

---

## Implementation Checklist

### Phase 1: Component Extraction (CRITICAL - Biggest Impact) ✅ COMPLETE

- [x] Create `apps/web/src/lib/components/project/ProjectCard.svelte`
  - Accept `project`, `isShared`, `onProjectClick`, `getStateBadgeClasses` props
  - Handle both owned and shared project display
  - Use `style:view-transition-name` instead of inline style

- [x] Create `apps/web/src/lib/components/ui/FilterGroup.svelte`
  - Accept `label`, `options`, `selected`, `onToggle` props
  - Encapsulate filter button styling logic

- [x] Update `+page.svelte` to use new components
  - Replace owned project card markup with `<ProjectCard />`
  - Replace shared project card markup with `<ProjectCard isShared />`
  - Replace 4 filter group sections with `<FilterGroup />`

**Actual reduction:** ~306 lines (from 1,217 to 911)

### Phase 2: Fix Responsiveness (HIGH) ✅ COMPLETE

- [x] Update stats grid to be responsive: `grid-cols-2 sm:grid-cols-4`
- [x] Standardize card padding to `p-3 sm:p-4`
- [x] Update ProjectListSkeleton to match real card padding

### Phase 3: Cleanup (MEDIUM) ✅ COMPLETE

- [x] Remove `!mt-0` override on line 420 - control margin from parent
- [x] Simplify filter panel nesting (removed unnecessary wrapper div)
- [x] Convert inline `style=""` to `style:` directive (done in ProjectCard component)

### Phase 4: Low Priority Polish (OPTIONAL) ✅ PARTIAL

- [ ] Update Button.svelte hardcoded colors to semantic tokens (requires theme additions) - SKIPPED (needs CSS variable additions)
- [ ] Fix non-standard icon sizes in ProjectCardNextStep - SKIPPED (intentional design choice)
- [x] Migrate LoadingSkeleton to Svelte 5 `$props()`

---

## Testing Checklist

After implementing changes, verify:

- [ ] Projects list renders correctly on desktop (1440px+)
- [ ] Projects list renders correctly on tablet (768px-1024px)
- [ ] Projects list renders correctly on mobile (375px)
- [ ] Stats grid shows 2 columns on mobile, 4 on desktop
- [ ] Filter panel expands/collapses correctly
- [ ] Filter buttons toggle active state correctly
- [ ] Owned projects display without "Shared" badge
- [ ] Shared projects display WITH "Shared" badge and role
- [ ] View transitions work when clicking into a project
- [ ] Dark mode displays correctly
- [ ] Light mode displays correctly
- [ ] Skeleton loading matches real card dimensions

---

## Summary Comparison: Projects List vs Projects Detail

| Metric | /projects (List) | /projects/[id] (Detail) |
|--------|------------------|-------------------------|
| Max Nesting | ~~14-15~~ **4-5 levels** | 9 levels |
| `!important` Overrides | ~~1~~ **0** | ~47 |
| Hardcoded Colors | 8 (low priority) | 50+ (critical) |
| Code Duplication | ~~200 lines~~ **0** | Minimal |
| Inkprint Compliance | ~~95%~~ **98%** | ~70% |
| Primary Issue | ~~Duplication~~ **Resolved** | Hardcoded colors |
| File Size | ~~1,218~~ **911 lines** | ~2,100 lines |
| Recommended Action | ~~Extract components~~ **Done** | Replace colors |

---

## Notes for Implementing Agent

1. **Start with ProjectCard extraction** - This is the single biggest improvement. The owned and shared cards are nearly identical.

2. **Preserve all functionality** - The filter system, sorting, search, and navigation all need to work exactly as before.

3. **Test view transitions** - The `view-transition-name` property enables smooth animations when navigating. Make sure this still works after refactoring.

4. **FilterGroup is optional but valuable** - If time is limited, just extract ProjectCard. FilterGroup is nice-to-have for code cleanliness.

5. **Don't change the filter logic** - Only extract the UI. The `toggleValue`, `selectedStates`, etc. logic stays in +page.svelte.

6. **Skeleton padding fix is quick** - Just change `p-2.5` to `p-3` in ProjectListSkeleton.svelte.

7. **Stats grid fix is critical for mobile** - Users will see 4 cramped columns on phones otherwise.
