<!-- docs/reports/ontology-modal-audit-2025-01.md -->
# Ontology Modal Audit Report

**Date:** January 2025
**Scope:** Ontology modals used in `/projects/[id]`
**Purpose:** Standardize UI for mobile command center experience

---

## Executive Summary

This audit examines all ontology create/edit modals to:
1. Document current spacing/padding patterns
2. Validate state enums and data columns
3. Identify inconsistencies
4. Propose standardized layouts for mobile (ultra-compact) and desktop

---

## Modals Audited

| Modal | File | Two-Step Flow | State Enum |
|-------|------|---------------|------------|
| Task | `TaskCreateModal.svelte` | ✅ Yes | `TASK_STATES` |
| Goal | `GoalCreateModal.svelte` | ✅ Yes | `GOAL_STATES` |
| Plan | `PlanCreateModal.svelte` | ✅ Yes | `PLAN_STATES` |
| Milestone | `MilestoneCreateModal.svelte` | ✅ Yes | `MILESTONE_STATES` |
| Risk | `RiskCreateModal.svelte` | ✅ Yes | `RISK_STATES` |
| Decision | `DecisionCreateModal.svelte` | ✅ Yes | `DECISION_STATES` |

---

## State Enum Validation

All modals correctly use state enums from `/apps/web/src/lib/types/onto.ts`:

```typescript
// ✅ VALIDATED - All enums match database schema
export const TASK_STATES = ['todo', 'in_progress', 'blocked', 'done'] as const;
export const GOAL_STATES = ['draft', 'active', 'achieved', 'abandoned'] as const;
export const PLAN_STATES = ['draft', 'active', 'completed'] as const;
export const MILESTONE_STATES = ['pending', 'in_progress', 'completed', 'missed'] as const;
export const RISK_STATES = ['identified', 'mitigated', 'occurred', 'closed'] as const;
export const DECISION_STATES = ['pending', 'made', 'deferred', 'reversed'] as const;
```

### Type Taxonomies

| Entity | Types | Format |
|--------|-------|--------|
| Task | execute, research, review, communicate, plan, delegate | `task.{type}` |
| Goal | outcome.project, outcome.business, development.skill, development.habit, milestone | `goal.{category}.{subtype}` |
| Plan | timebox.sprint, timebox.quarter, strategic.okr, project.phase | `plan.{category}.{subtype}` |
| Milestone | deadline, deliverable, checkpoint, launch | `milestone.{type}` |
| Risk | technical, resource, external, scope, timeline | `risk.{type}` |
| Decision | strategic, tactical, technical, resource | `decision.{type}` |

---

## Current Spacing Patterns

### Header Section
```css
/* Current - CONSISTENT across modals */
px-3 py-2 sm:px-4 sm:py-2.5
```

### Body Section
```css
/* Current */
px-3 py-3 sm:px-6 sm:py-6

/* Issue: py-3 and py-6 are too loose for mobile command center */
```

### Footer Section
```css
/* INCONSISTENT across modals */
p-2 sm:p-6    /* Risk, Milestone */
p-2 sm:p-4    /* Task, Goal, Decision */
```

### Form Spacing
```css
/* Current */
space-y-6    /* Too loose for mobile */
gap-1.5      /* Label-to-input gap - acceptable */
```

---

## Issues Identified

### 1. Footer Padding Inconsistency
- **Risk/Milestone:** `p-2 sm:p-6` (desktop too loose)
- **Task/Goal/Decision:** `p-2 sm:p-4` (better)
- **Fix:** Standardize to `p-2 sm:p-4`

### 2. Body Padding Too Loose for Mobile
- **Current:** `px-3 py-3 sm:px-6 sm:py-6`
- **Issue:** `py-3` creates 12px vertical padding - could be tighter
- **Fix:** `px-2 py-2 sm:px-6 sm:py-4`

### 3. Form Spacing Too Loose
- **Current:** `space-y-6` (24px between fields)
- **Issue:** Wastes vertical space on mobile
- **Fix:** `space-y-3 sm:space-y-4` (12px mobile, 16px desktop)

### 4. Input Field Heights
- **Current:** Standard height inputs
- **Recommendation:** Use `h-9` (36px) on mobile for touch targets

### 5. Two-Column Grids on Mobile
- **Current:** Some modals use `grid-cols-2` on mobile
- **Issue:** Can be cramped
- **Keep:** For related fields (state + priority)
- **Change:** To single column for unrelated fields

---

## Proposed Standardized Layouts

### Mobile Layout (< 640px) - "Command Center" Compact

```svelte
<!-- HEADER: Ultra-compact -->
<div class="px-2 py-1.5 border-b border-border">
  <h3 class="text-base font-semibold">{title}</h3>
  <p class="text-xs text-muted-foreground">{subtitle}</p>
</div>

<!-- BODY: Tight spacing -->
<div class="px-2 py-2 space-y-3">
  <!-- Form fields with minimal gaps -->
  <div class="space-y-3">
    <!-- Label + Input pairs -->
    <div class="space-y-1">
      <label class="text-xs font-medium">Field</label>
      <input class="h-9 text-sm" />
    </div>
  </div>
</div>

<!-- FOOTER: Minimal padding -->
<div class="px-2 py-2 border-t border-border flex justify-end gap-2">
  <button class="h-8 px-3 text-sm">Cancel</button>
  <button class="h-8 px-3 text-sm">Create</button>
</div>
```

**Mobile Spacing Summary:**
| Section | Padding | Internal Spacing |
|---------|---------|------------------|
| Header | `px-2 py-1.5` | - |
| Body | `px-2 py-2` | `space-y-3` |
| Footer | `px-2 py-2` | `gap-2` |
| Field Groups | - | `space-y-1` (label to input) |

### Desktop Layout (≥ 640px) - Comfortable

```svelte
<!-- HEADER: Balanced -->
<div class="px-4 py-2.5 border-b border-border">
  <h3 class="text-lg font-semibold">{title}</h3>
  <p class="text-sm text-muted-foreground">{subtitle}</p>
</div>

<!-- BODY: Comfortable spacing -->
<div class="px-6 py-4 space-y-4">
  <!-- Form fields -->
  <div class="space-y-4">
    <div class="space-y-1.5">
      <label class="text-sm font-medium">Field</label>
      <input class="h-10" />
    </div>
  </div>
</div>

<!-- FOOTER: Standard -->
<div class="px-4 py-3 border-t border-border flex justify-end gap-3">
  <button class="h-9 px-4">Cancel</button>
  <button class="h-9 px-4">Create</button>
</div>
```

**Desktop Spacing Summary:**
| Section | Padding | Internal Spacing |
|---------|---------|------------------|
| Header | `px-4 py-2.5` | - |
| Body | `px-6 py-4` | `space-y-4` |
| Footer | `px-4 py-3` | `gap-3` |
| Field Groups | - | `space-y-1.5` (label to input) |

---

## Responsive Classes Reference

### Standardized Pattern (Mobile-First)

```css
/* Header */
px-2 py-1.5 sm:px-4 sm:py-2.5

/* Body Container */
px-2 py-2 sm:px-6 sm:py-4

/* Form Spacing */
space-y-3 sm:space-y-4

/* Label-to-Input Gap */
space-y-1 sm:space-y-1.5

/* Footer */
px-2 py-2 sm:px-4 sm:py-3

/* Button Gaps */
gap-2 sm:gap-3

/* Text Sizes */
text-xs sm:text-sm        /* Labels */
text-sm sm:text-base      /* Inputs */
text-base sm:text-lg      /* Titles */

/* Button Heights */
h-8 sm:h-9                /* Buttons */
h-9 sm:h-10               /* Inputs */
```

---

## Data Columns Validation

### Task Modal
| Field | DB Column | Type | ✅ Valid |
|-------|-----------|------|---------|
| Title | `title` | text | ✅ |
| Description | `description` | text | ✅ |
| State | `state` | enum | ✅ |
| Priority | `priority` | enum | ✅ |
| Due Date | `due_date` | date | ✅ |
| Type | `type` | text | ✅ |

### Goal Modal
| Field | DB Column | Type | ✅ Valid |
|-------|-----------|------|---------|
| Title | `title` | text | ✅ |
| Description | `description` | text | ✅ |
| State | `state` | enum | ✅ |
| Type | `type` | text | ✅ |
| Target Date | `target_date` | date | ✅ |

### Milestone Modal
| Field | DB Column | Type | ✅ Valid |
|-------|-----------|------|---------|
| Title | `title` | text | ✅ |
| Description | `description` | text | ✅ |
| State | `state` | enum | ✅ |
| Type | `type` | text | ✅ |
| Due Date | `due_date` | date | ✅ |

### Risk Modal
| Field | DB Column | Type | ✅ Valid |
|-------|-----------|------|---------|
| Title | `title` | text | ✅ |
| Description | `description` | text | ✅ |
| State | `state` | enum | ✅ |
| Type | `type` | text | ✅ |
| Impact | `impact` | enum | ✅ |
| Probability | `probability` | float | ✅ |
| Mitigation | `mitigation_strategy` | text | ✅ |

### Decision Modal
| Field | DB Column | Type | ✅ Valid |
|-------|-----------|------|---------|
| Title | `title` | text | ✅ |
| Description | `description` | text | ✅ |
| State | `state` | enum | ✅ |
| Type | `type` | text | ✅ |
| Rationale | `rationale` | text | ✅ |
| Alternatives | `alternatives` | jsonb | ✅ |

---

## Implementation Status

### ✅ Phase 1: Standardize Spacing (COMPLETED)

- [x] Update header padding: `px-2 py-1.5 sm:px-4 sm:py-2.5`
- [x] Update body padding: `px-2 py-2 sm:px-6 sm:py-4`
- [x] Update footer padding: `px-2 py-2 sm:px-4 sm:py-3`
- [x] Update form spacing: `space-y-3 sm:space-y-4`
- [x] Update type card padding: `p-2.5 sm:p-4`
- [x] Update selected type badge padding: `p-2.5 sm:p-4`

### Phase 2: Responsive Text & Elements (Future)

- [ ] Update title sizes: `text-base sm:text-lg`
- [ ] Update label sizes: `text-xs sm:text-sm`
- [ ] Update input heights: `h-9 sm:h-10`
- [ ] Update button heights: `h-8 sm:h-9`

### Phase 3: Two-Step Type Selection (Future)

- [ ] Standardize type card grid: `grid-cols-2` on mobile
- [ ] Type card icon size: `w-4 h-4 sm:w-5 sm:h-5`

---

## Modals Updated

| Modal | Header | Body | Footer | Form Spacing | Type Cards | Status |
|-------|--------|------|--------|--------------|------------|--------|
| TaskCreateModal | ✅ | ✅ | ✅ | ✅ | ✅ | **Done** |
| GoalCreateModal | ✅ | ✅ | ✅ | ✅ | ✅ | **Done** |
| DecisionCreateModal | ✅ | ✅ | ✅ | ✅ | N/A | **Done** |
| RiskCreateModal | ✅ | ✅ | ✅ | ✅ | ✅ | **Done** |
| MilestoneCreateModal | ✅ | ✅ | ✅ | ✅ | ✅ | **Done** |
| PlanCreateModal | - | - | - | - | - | TBD |

---

## Changes Applied (January 2025)

### Spacing Changes

| Component | Before | After |
|-----------|--------|-------|
| Header | `px-3 py-2 sm:px-4 sm:py-2.5` | `px-2 py-1.5 sm:px-4 sm:py-2.5` |
| Body | `px-3 py-3 sm:px-6 sm:py-6` | `px-2 py-2 sm:px-6 sm:py-4` |
| Footer | `p-2 sm:p-6` | `px-2 py-2 sm:px-4 sm:py-3` |
| Form | `space-y-6` | `space-y-3 sm:space-y-4` |
| Type Cards | `p-4` | `p-2.5 sm:p-4` |
| Category Groups | `space-y-6` | `space-y-4 sm:space-y-6` |

### Files Modified

1. `apps/web/src/lib/components/ontology/TaskCreateModal.svelte`
2. `apps/web/src/lib/components/ontology/GoalCreateModal.svelte`
3. `apps/web/src/lib/components/ontology/DecisionCreateModal.svelte`
4. `apps/web/src/lib/components/ontology/RiskCreateModal.svelte`
5. `apps/web/src/lib/components/ontology/MilestoneCreateModal.svelte`

---

## Next Steps

1. **Test on mobile** to verify "command center" feel
2. **Consider PlanCreateModal** when needed
3. **Document in QUICK_REFERENCE.md** for future development
4. **Optional:** Create shared modal layout component for consistency
