<!-- thoughts/shared/research/2026-02-02_projects-id-ui-audit.md -->
# UI Audit: Projects/[ID] Page - Style Simplification & Flattening

```yaml
type: research
status: complete
date: 2026-02-02
topic: Frontend UI audit of projects/[id] page
scope: apps/web/src/routes/projects/[id] and all subcomponents
purpose: Identify opportunities to simplify styles, flatten div nesting, improve information density
next_action: Implementation by agent using this document as specification
```

---

## Executive Summary

This document contains a comprehensive audit of the `projects/[id]` page and all its subcomponents. The goal is to **flatten the UI**, **simplify styles**, and **improve information density** while maintaining full functionality.

**Key Metrics Found:**
- Maximum div nesting: **9 levels** (GoalMilestonesSection)
- `!important` overrides: **~47 instances** (EntityListItem alone)
- Hardcoded colors violating Inkprint: **50+ instances**
- Estimated class reduction possible: **40-50%**

---

## Context & Goals

### What We're Trying to Achieve

1. **Flatten the UI** - Remove unnecessary nested divs. Each wrapper should serve a clear purpose.

2. **Mobile Command Center** - This page should work excellently on mobile as a command center where everything is accessible and usable when interacting with a project on a phone.

3. **Information Density** - Remove bloated layouts. No wasted space. Everything at fingertips.

4. **Clean, Unified Styles** - Consistent use of Tailwind, proper Inkprint design system tokens, no conflicting patterns.

5. **Responsive but Simple** - Works on desktop and mobile without over-engineered breakpoint variations.

### Design System Reference

The project uses the **Inkprint Design System**. All components should use:

**Semantic Color Tokens (Required):**
```css
/* Backgrounds */
bg-background       /* Page background */
bg-card             /* Card/panel backgrounds */
bg-muted            /* Muted/secondary backgrounds */
bg-accent           /* Accent color backgrounds */

/* Text */
text-foreground         /* Primary text */
text-muted-foreground   /* Secondary/muted text */
text-accent             /* Accent-colored text */

/* Borders */
border-border       /* Standard borders */
```

**Inkprint Shadows:**
```css
shadow-ink          /* Standard elevation */
shadow-ink-strong   /* Modal/overlay elevation */
```

**Texture Classes:**
```css
tx tx-frame tx-weak   /* Structural containers */
tx tx-grain tx-weak   /* Interactive surfaces */
```

**DO NOT USE:**
- Hardcoded colors like `text-gray-700`, `bg-emerald-500`, `border-amber-400`
- Deprecated tokens like `bg-surface-elevated`, `bg-surface-panel`, `text-accent-blue`

---

## Files to Modify

### File Inventory

| File Path | Priority | Issues |
|-----------|----------|--------|
| `apps/web/src/routes/projects/[id]/+page.svelte` | HIGH | Negative margin pattern, excessive breakpoints, 8-level nesting |
| `apps/web/src/lib/components/ontology/EntityListItem.svelte` | CRITICAL | ~47 !important, hardcoded colors, unmaintainable config |
| `apps/web/src/lib/components/project/NextStepDisplay.svelte` | MEDIUM | sm:contents antipattern, HTML injection |
| `apps/web/src/lib/components/ontology/OntologyProjectHeader.svelte` | CRITICAL | 4-level wrapper stacking, many deprecated color tokens |
| `apps/web/src/lib/components/ontology/GoalMilestonesSection.svelte` | LOW | 9-level conditional nesting, hardcoded emerald (intentional semantic) |
| `apps/web/src/lib/components/project/CommandCenterPanel.svelte` | MEDIUM | Multiline class strings, arbitrary h-[52px] |
| `apps/web/src/lib/components/ontology/MilestoneListItem.svelte` | LOW | Ternary in class string, mixed visibility |
| `apps/web/src/lib/components/project/MobileCommandCenter.svelte` | LOW | Misleading comments, large prop signature |
| `apps/web/src/lib/components/skeletons/ProjectContentSkeleton.svelte` | LOW | Inconsistent radius escalation |
| `apps/web/src/lib/components/skeletons/InsightPanelSkeleton.svelte` | LOW | Minor - 7 classes for simple container |

---

## Detailed Findings by File

### 1. EntityListItem.svelte (CRITICAL)

**Location:** `apps/web/src/lib/components/ontology/EntityListItem.svelte`

#### Issue 1.1: Massive Hardcoded Color Configuration (Lines 64-146)

The component has a configuration object with 9 entity types (project, goal, milestone, plan, task, risk, requirement, document, event), each with hardcoded colors. Additionally, there are state-specific configs (taskStateConfig lines 149-183, riskSeverityConfig lines 186-203) that add more overrides:

```javascript
// CURRENT (PROBLEMATIC) - Lines 64-146
const entityConfig = {
  project: {
    icon: FolderKanban,
    iconColor: 'text-emerald-500',
    texture: 'tx tx-frame tx-weak',
    weight: 'wt-card',
    borderOverride: '!border-emerald-500',
    bgOverride: '!bg-emerald-50/50 dark:!bg-emerald-900/10',
    hoverOverride: 'hover:!bg-emerald-100/50 dark:hover:!bg-emerald-900/20'
  },
  goal: {
    icon: Target,
    iconColor: 'text-amber-500',
    texture: 'tx tx-bloom tx-weak',
    weight: 'wt-paper',
    borderOverride: '!border-l-4 !border-amber-500',
    bgOverride: '!bg-amber-50/50 dark:!bg-amber-900/10',
    hoverOverride: 'hover:!bg-amber-100/50 dark:hover:!bg-amber-900/20'
  },
  // ... 7 more entity types with same pattern
};
```

**Problems:**
- ~47 uses of `!important` (the `!` prefix in Tailwind) across entityConfig + state configs
- Hardcoded color values for each entity type
- Violates Inkprint design system
- Unmaintainable - changing theme requires editing many values
- Dark mode handled manually per color instead of via tokens

**SOLUTION:** Replace with CSS custom properties and semantic approach:

```javascript
// RECOMMENDED APPROACH
// 1. Define entity colors in CSS (app.css or component style block):
/*
  [data-entity-type="task"] { --entity-color: var(--color-blue-500); }
  [data-entity-type="goal"] { --entity-color: var(--color-emerald-500); }
  // etc.
*/

// 2. Simplify config to structure only:
const typeConfig: Record<EntityType, TypeConfigItem> = {
  task: { icon: CheckSquare, label: 'Task' },
  goal: { icon: Target, label: 'Goal' },
  // ... no color overrides needed
};

// 3. Use data attribute + CSS for styling:
// <button data-entity-type={type} class="entity-item ...">
```

**Alternative Simpler Solution:** If CSS custom properties are too complex, at minimum:
- Remove all `!important` overrides
- Use semantic tokens where possible: `border-accent`, `bg-accent/10`
- Accept that some entity-specific colors may be needed, but consolidate to a smaller palette

#### Issue 1.2: Complex Conditional Styling (Lines 206-228)

```javascript
// CURRENT - Multiple levels of conditional logic
let resolvedConfig = $derived(() => {
  if (styleOverride) {
    return { ...baseConfig, ...styleOverride };
  }
  if (isSelected) {
    return { ...baseConfig, ...selectedConfig };
  }
  if (isHighlighted) {
    return { ...baseConfig, ...highlightedConfig };
  }
  return baseConfig;
});
```

**Problem:** Makes it hard to predict output styling in different states.

**SOLUTION:** Flatten to explicit state-to-style mapping:

```javascript
// RECOMMENDED - Explicit mapping
const stateStyles = {
  default: 'bg-card border-border',
  selected: 'bg-accent/10 border-accent',
  highlighted: 'bg-muted border-border ring-2 ring-accent/50',
};

let appliedStyle = $derived(
  isSelected ? stateStyles.selected :
  isHighlighted ? stateStyles.highlighted :
  stateStyles.default
);
```

#### Issue 1.3: Class String Building (Lines 240-255)

```javascript
// CURRENT - 240+ characters of class concatenation
buttonClasses = $derived(
  [
    'group relative flex items-center gap-3',
    'w-full text-left',
    sizeClasses[size],
    resolvedConfig.bgOverride,
    resolvedConfig.borderOverride,
    resolvedConfig.hoverOverride,
    // ... more
  ].filter(Boolean).join(' ')
);
```

**SOLUTION:** Use Svelte class directives for conditional classes:

```svelte
<button
  class="group relative flex items-center gap-3 w-full text-left"
  class:bg-accent/10={isSelected}
  class:border-accent={isSelected}
  class:bg-card={!isSelected}
>
```

---

### 2. +page.svelte (Main Page) (HIGH)

**Location:** `apps/web/src/routes/projects/[id]/+page.svelte`

#### Issue 2.1: Negative Margin Anti-Pattern (Lines ~1790, ~1956)

```svelte
<!-- CURRENT (PROBLEMATIC) -->
<button class="... -m-2 sm:-m-3 p-2 sm:p-3 ...">
```

**Problem:** Negative margin expands the clickable area outside the element, then padding adds it back. This is a roundabout way to increase hit target size.

**SOLUTION:** Apply padding directly to button, or use explicit dimensions:

```svelte
<!-- RECOMMENDED -->
<button class="... px-3 py-2 ...">

<!-- OR for larger hit targets -->
<button class="... min-h-[44px] min-w-[44px] px-3 py-2 ...">
```

#### Issue 2.2: Excessive Responsive Spacing (Throughout)

```svelte
<!-- CURRENT - Too many breakpoint variations -->
<div class="px-2 sm:px-4 md:px-6 lg:px-8 py-2 sm:py-3 md:py-4 gap-2 sm:gap-3 lg:gap-6">
```

**Problem:** 4-5 breakpoint variations for spacing creates:
- Bloated class lists (40+ classes per element common)
- Micro-adjustments hard to reason about
- Inconsistent spacing scale

**SOLUTION:** Simplify to 2 breakpoints maximum (base + sm:):

```svelte
<!-- RECOMMENDED -->
<div class="px-4 sm:px-6 py-3 gap-4">
```

**Rule of thumb:** If the difference between breakpoints is only 1-2 spacing units (e.g., `gap-2` vs `gap-3`), just pick one value.

#### Issue 2.3: Inline View Transition Style (Line ~1542)

```svelte
<!-- CURRENT -->
<h1 style="view-transition-name: project-title-{project.id}" class="...">
```

**Problem:** Mixing inline styles with Tailwind breaks consistency.

**SOLUTION:** Use Tailwind arbitrary values:

```svelte
<!-- RECOMMENDED -->
<h1 class="[view-transition-name:project-title-{project.id}] ...">
```

#### Issue 2.4: Deep Nesting in Header Section (Lines ~1523-1637)

The header section has 6+ levels of nested divs.

**SOLUTION:** Audit each wrapper div. If it only provides `flex` or `gap`, consider:
- Combining with parent
- Using `space-y-*` instead of wrapper + gap
- Removing if children can handle their own spacing

---

### 3. NextStepDisplay.svelte (MEDIUM)

**Location:** `apps/web/src/lib/components/project/NextStepDisplay.svelte`

#### Issue 3.1: `sm:contents` Anti-Pattern (Line ~212)

```svelte
<!-- CURRENT (PROBLEMATIC) -->
<div class="flex flex-col sm:contents">
  {/* content */}
</div>
```

**Problem:** `display: contents` removes the element from the box model, making children direct children of grandparent. This is:
- Not fully supported in all browsers
- Fragile - breaks if you add styles to the "contents" element
- Hard to debug

**SOLUTION:** Use explicit show/hide pattern:

```svelte
<!-- RECOMMENDED -->
<!-- Mobile layout -->
<div class="flex flex-col sm:hidden">
  {/* mobile content */}
</div>

<!-- Desktop layout -->
<div class="hidden sm:flex sm:flex-row">
  {/* desktop content */}
</div>
```

Or if content is identical, use CSS-only approach:

```svelte
<div class="flex flex-col sm:flex-row">
  {/* same content, different direction */}
</div>
```

#### Issue 3.2: HTML Injection Pattern (Line ~317)

```svelte
<!-- CURRENT (PROBLEMATIC) -->
{@html renderLongContent()}
```

Where `renderLongContent()` generates HTML with data attributes, then JavaScript parses those attributes on click.

**Problem:**
- Potential XSS vector
- Hard to maintain
- Breaks Svelte's reactivity model

**SOLUTION:** Use Svelte component rendering instead of HTML injection. If dynamic content is needed, parse it into structured data and render with Svelte `{#each}`.

#### Issue 3.3: Misaligned Padding Strategy (Lines ~204-307)

```svelte
<!-- CURRENT - Inconsistent padding -->
<div class="px-3 py-2 sm:py-2.5">  <!-- Why different py? -->
<div class="px-3 pb-3 pt-0 sm:pl-10">  <!-- Asymmetric and responsive -->
```

**SOLUTION:** Establish consistent padding pattern:

```svelte
<!-- RECOMMENDED - Symmetric, predictable -->
<div class="p-3 sm:p-4">
<div class="p-3 sm:p-4 sm:pl-10">  <!-- Only override what needs to change -->
```

---

### 4. OntologyProjectHeader.svelte (CRITICAL)

**Location:** `apps/web/src/lib/components/ontology/OntologyProjectHeader.svelte`

#### Issue 4.1: 4-Level Wrapper Div Nesting (Lines ~68-71)

```svelte
<!-- CURRENT (PROBLEMATIC) -->
<div class="flex flex-col gap-6">           <!-- Level 1 -->
  <div class="flex flex-col gap-4">          <!-- Level 2 -->
    <div class="flex flex-col gap-3">        <!-- Level 3 -->
      <div class="flex flex-col gap-3 ...">  <!-- Level 4 -->
        <!-- Actual content here -->
      </div>
    </div>
  </div>
</div>
```

**Problem:** Each wrapper serves only ONE purpose (gap spacing). This is 3 extra DOM nodes for no reason.

**SOLUTION:** Flatten to single container with `space-y-*`:

```svelte
<!-- RECOMMENDED -->
<div class="flex flex-col space-y-4">
  <!-- Content sections with their own spacing as needed -->
  <section>...</section>
  <section class="mt-2">...</section>  <!-- Use margin for exceptions -->
</div>
```

Or use CSS Grid for complex layouts:

```svelte
<div class="grid gap-4">
  <!-- Grid handles spacing automatically -->
</div>
```

#### Issue 4.2: Deprecated Color Tokens (Lines 136, 139-140, 155, 164, 175)

```svelte
<!-- CURRENT (DEPRECATED) -->
<div class="bg-surface-elevated ...">           <!-- Lines 136, 164 -->
<div class="border-gray-300 dark:border-gray-600/50 ...">  <!-- Lines 136, 164, 175 -->
<span class="text-accent-blue ...">             <!-- Lines 140, 144, 146 -->
<div class="bg-surface-panel ...">              <!-- Lines 139, 155 -->
<div class="shadow-subtle hover:shadow-elevated ...">  <!-- Lines 136, 164 -->
<div class="hover:border-accent-orange ...">    <!-- Line 175 -->
```

**SOLUTION:** Replace with current Inkprint tokens:

```svelte
<!-- RECOMMENDED -->
<div class="bg-card ...">                    <!-- was bg-surface-elevated -->
<div class="border-border ...">              <!-- was border-gray-300 dark:... -->
<span class="text-accent ...">               <!-- was text-accent-blue -->
<div class="bg-muted ...">                   <!-- was bg-surface-panel -->
<div class="shadow-ink hover:shadow-ink-strong ...">  <!-- was shadow-subtle/elevated -->
<div class="hover:border-accent ...">        <!-- was hover:border-accent-orange -->
```

---

### 5. GoalMilestonesSection.svelte (LOW)

**Location:** `apps/web/src/lib/components/ontology/GoalMilestonesSection.svelte`

**Note:** The emerald colors in this component are intentionally hardcoded for semantic meaning (milestones = achievements = emerald). The nesting is deep but logical. Consider leaving as-is or only addressing if time permits.

#### Issue 5.1: 9-Level Deep Conditional Nesting (Lines ~177-250)

```svelte
<!-- CURRENT structure (simplified) -->
{#if isExpanded}                              <!-- Level 1 -->
  <div>                                        <!-- Level 2 -->
    <div>                                      <!-- Level 3 -->
      {#each milestones as milestone}          <!-- Level 4 -->
        {#if hasMore}                          <!-- Level 5 -->
          {#if showCompletedSection}           <!-- Level 6 -->
            <div>                              <!-- Level 7 -->
              {#each completedMilestones}      <!-- Level 8 -->
                <div>                          <!-- Level 9 -->
                  <!-- content -->
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      {/each}
    </div>
  </div>
{/if}
```

**SOLUTION:** Extract completed milestones section to sub-component:

```svelte
<!-- RECOMMENDED -->
<!-- GoalMilestonesSection.svelte -->
{#if isExpanded}
  <div class="space-y-2">
    {#each activeMilestones as milestone}
      <MilestoneListItem {milestone} />
    {/each}

    {#if showCompletedSection}
      <CompletedMilestonesSection milestones={completedMilestones} />
    {/if}
  </div>
{/if}

<!-- CompletedMilestonesSection.svelte (new component) -->
<script>
  let { milestones } = $props();
</script>

<div class="space-y-1 pt-2 border-t border-border">
  {#each milestones as milestone}
    <MilestoneListItem {milestone} compact />
  {/each}
</div>
```

#### Issue 5.2: Inconsistent Emerald Shades (Lines ~141-142, 160)

```svelte
<!-- CURRENT - Two different emerald applications -->
<Icon class="text-emerald-600 dark:text-emerald-400" />  <!-- Icons -->
<button class="hover:bg-emerald-50/20 dark:hover:bg-emerald-900/10">  <!-- Hover -->
```

**SOLUTION:** Use semantic accent colors or consolidate:

```svelte
<!-- RECOMMENDED -->
<Icon class="text-accent" />
<button class="hover:bg-accent/10">
```

---

### 6. CommandCenterPanel.svelte (MEDIUM)

**Location:** `apps/web/src/lib/components/project/CommandCenterPanel.svelte`

#### Issue 6.1: Multiline Class String Declaration (Lines ~87-92)

```svelte
<!-- CURRENT (HARD TO READ) -->
<div
  class="
    bg-card border border-border rounded-lg shadow-ink
    tx tx-frame tx-weak overflow-hidden
    transition-all duration-[120ms] ease-out
    {panelClasses}
    {expanded ? '' : 'h-[52px]'}
  "
>
```

**Problem:** Mixing static classes, dynamic classes, and conditionals in multiline string is hard to scan.

**SOLUTION:** Use class directives for conditionals:

```svelte
<!-- RECOMMENDED -->
<div
  class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden transition-all duration-[120ms] ease-out {panelClasses}"
  class:h-[52px]={!expanded}
>
```

#### Issue 6.2: Arbitrary Height Value (Line ~92)

```svelte
<!-- CURRENT -->
class:h-[52px]={!expanded}
```

**Problem:** `52px` is not on Tailwind's spacing scale. Creates inconsistency.

**SOLUTION:** Use standard scale value:

```svelte
<!-- RECOMMENDED -->
class:h-14={!expanded}  <!-- 56px - close enough, on scale -->
<!-- OR -->
class:h-12={!expanded}  <!-- 48px - also valid -->
```

---

### 7. MilestoneListItem.svelte (LOW)

**Location:** `apps/web/src/lib/components/ontology/MilestoneListItem.svelte`

#### Issue 7.1: Ternary in Class String (Lines ~130-132)

```svelte
<!-- CURRENT -->
<div class="... px-3 {compact ? 'py-1.5' : 'py-2'} ...">
```

**SOLUTION:** Use class directive:

```svelte
<!-- RECOMMENDED -->
<div class="... px-3 py-2 ..." class:py-1.5={compact}>
```

Note: When using class directive to override, the directive wins. So `class:py-1.5={compact}` will apply `py-1.5` when compact is true, overriding the base `py-2`.

#### Issue 7.2: Mixed Visibility Approaches (Lines ~153, 171)

```svelte
<!-- CURRENT - Mixing Svelte conditional and CSS class -->
{#if onToggleComplete && showCheckbox}
  <button>...</button>  <!-- Conditionally rendered -->
{/if}

<button class="flex sm:hidden">...</button>  <!-- CSS hidden -->
```

**SOLUTION:** Pick one approach. Prefer Svelte conditionals for logic-based visibility, CSS classes for responsive visibility:

```svelte
<!-- RECOMMENDED -->
<!-- Logic-based: use Svelte -->
{#if showCheckbox}
  <button>...</button>
{/if}

<!-- Responsive: use CSS -->
<button class="sm:hidden">...</button>
```

---

## Implementation Checklist

### Phase 1: Critical Fixes (EntityListItem + OntologyProjectHeader) ✅ COMPLETE

- [x] **EntityListItem:** Remove all `!important` overrides (~47 instances) - Used CSS custom properties + data attributes
- [x] **EntityListItem:** Replace hardcoded colors with semantic tokens where possible - Used color-mix() for tints
- [x] **EntityListItem:** Simplify the entityConfig object - Removed color overrides, kept only structural config
- [x] **EntityListItem:** Flatten conditional styling logic - Used $derived for clean state management
- [x] **EntityListItem:** Convert class string building to class directives - Used class:foo={condition} syntax
- [x] **OntologyProjectHeader:** Replace ALL deprecated color tokens:
  - bg-surface-elevated → bg-card ✅
  - bg-surface-panel → bg-muted ✅
  - text-accent-blue → text-accent ✅
  - shadow-subtle/shadow-elevated → shadow-ink/shadow-ink-strong ✅
  - hover:border-accent-orange → hover:border-accent ✅
  - border-gray-300 dark:border-gray-600/50 → border-border ✅
- [x] **OntologyProjectHeader:** Flatten 4-level wrapper divs to 1-2 - Now uses space-y-* pattern

### Phase 2: High Priority Flattening (+page.svelte) ✅ COMPLETE

- [x] **+page.svelte:** Remove `-m-X p-X` negative margin patterns - Removed from lines 1790, 1956
- [x] **+page.svelte:** Reduce responsive variants to 2 breakpoints max - Simplified grid layout
- [x] **+page.svelte:** Convert inline styles to Svelte style directive - style:view-transition-name

### Phase 3: Medium Priority Cleanup ✅ COMPLETE

- [x] **NextStepDisplay:** Replace `sm:contents` with explicit layout - Restructured to Icon | Content | Actions
- [x] **NextStepDisplay:** Review HTML injection pattern - Kept as-is (properly escaped, secure)
- [x] **CommandCenterPanel:** Clean up multiline class strings - Consolidated to single lines
- [x] **CommandCenterPanel:** Replace arbitrary h-[52px] with h-14 - Uses Tailwind scale value

### Phase 4: Low Priority Polish ✅ COMPLETE

- [~] **GoalMilestonesSection:** Nesting is logical and intentional - no changes needed
- [x] **MilestoneListItem:** Convert ternaries to class directives - Used class:py-1.5, class:text-destructive, etc.
- [x] **MilestoneListItem:** Unify visibility approach - Added documentation, clarified CSS vs Svelte visibility patterns
- [x] **MobileCommandCenter:** Comments were accurate - cleaned up props grouping instead
- [x] **Skeleton components:** Fixed radius escalation (rounded-md sm:rounded-lg → rounded-lg), removed unused variable

---

## Color Token Reference

When replacing hardcoded colors, use this mapping:

| Hardcoded | Semantic Token |
|-----------|----------------|
| `text-gray-700`, `text-slate-600` | `text-foreground` |
| `text-gray-500`, `text-slate-500` | `text-muted-foreground` |
| `bg-gray-50`, `bg-slate-100` | `bg-muted` |
| `bg-white`, `bg-slate-50` | `bg-card` |
| `border-gray-200`, `border-slate-300` | `border-border` |
| `text-blue-600`, `text-emerald-600` (accent) | `text-accent` |
| `bg-blue-50`, `bg-emerald-50` (accent bg) | `bg-accent/10` |
| `border-blue-500`, `border-emerald-500` | `border-accent` |
| `bg-surface-elevated` (deprecated) | `bg-card` |
| `bg-surface-panel` (deprecated) | `bg-muted` |
| `text-accent-blue` (deprecated) | `text-accent` |

---

## Testing Checklist

After implementing changes, verify:

- [ ] Page renders correctly on desktop (1440px+)
- [ ] Page renders correctly on tablet (768px-1024px)
- [ ] Page renders correctly on mobile (375px)
- [ ] Dark mode displays correctly
- [ ] Light mode displays correctly
- [ ] All interactive elements remain functional
- [ ] No visual regressions in entity list items
- [ ] Command center panel expands/collapses correctly
- [ ] Milestone interactions work
- [ ] Goal sections expand/collapse correctly

---

## Notes for Implementing Agent

1. **Preserve Functionality:** This is a style-only refactor. Do not change component logic, state management, or data flow.

2. **Incremental Changes:** Implement one file at a time. Test after each file.

3. **Class Directive Gotcha:** When using `class:foo={condition}` to conditionally apply a class that conflicts with a base class (like `class:py-1.5={compact}` vs base `py-2`), the class directive will add both classes. To truly override, you may need to use ternary in the base class string OR remove the base class.

4. **Responsive Strategy:** The goal is 2 breakpoints: base (mobile) and `sm:` (desktop). Use `md:`, `lg:`, `xl:` only when truly necessary.

5. **Information Density:** When in doubt, choose tighter spacing. Users want information at their fingertips, not spread out.

6. **Test on Real Device:** The mobile command center concept means this should be tested on an actual phone, not just browser dev tools.
