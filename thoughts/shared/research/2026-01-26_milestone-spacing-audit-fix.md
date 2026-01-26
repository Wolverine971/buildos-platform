---
title: 'Milestone Section - Spacing Audit & Standards Compliance'
date: 2026-01-26T12:00:00Z
status: active
tags: [design-system, spacing, audit, standards-compliance]
path: thoughts/shared/research/2026-01-26_milestone-spacing-audit-fix.md
---

# Milestone Section - Spacing Audit & Standards Compliance

**Issue Found:** Milestone section uses Ultra-Compact spacing when canonical standards specify Compact/Nested pattern.

---

## The Problem

### Current Implementation (Ultra-Compact)

```svelte
<!-- GoalMilestonesSection.svelte -->
<button class="px-2.5 py-1 ...">  <!-- 10px/4px -->
  <Flag class="w-2.5 h-2.5 ..." />  <!-- 10px icon -->
  <span class="text-[10px]">2/5 milestones</span>
</button>

<!-- MilestoneListItem.svelte -->
<div class="px-2.5 py-1 gap-1.5 ...">  <!-- 10px/4px, 6px gap -->
  <StateIcon class="w-2.5 h-2.5 ..." />  <!-- 10px icon -->
  <p class="text-[10px]">Title</p>
</div>
```

### Canonical Standard (Compact/Nested)

From `/apps/web/docs/technical/components/SPACING_BORDER_STANDARDS.md` lines 77-91:

```svelte
<!-- For nested items (milestones under goals) -->
<div class="px-3 py-1.5 ...">  <!-- 12px horizontal, 6px vertical -->
  <div class="flex items-center gap-2">  <!-- 8px gap -->
    <Icon class="w-3.5 h-3.5 shrink-0" />  <!-- 14px icon -->
    <p class="text-xs">Title</p>  <!-- 12px -->
  </div>
</div>
```

**The document EXPLICITLY mentions "milestones under goals" should use this pattern!**

---

## Comparison: Current vs Standards

| Element | Current (Ultra-Compact) | Standard (Compact/Nested) | Delta |
|---------|-------------------------|---------------------------|-------|
| **Horizontal padding** | `px-2.5` (10px) | `px-3` (12px) | +2px |
| **Vertical padding** | `py-1` (4px) | `py-1.5` (6px) | +2px |
| **Gap** | `gap-1.5` (6px) | `gap-2` (8px) | +2px |
| **Icon size** | `w-2.5 h-2.5` (10px) | `w-3.5 h-3.5` (14px) | +4px |
| **Text size** | `text-[10px]` (10px) | `text-xs` (12px) | +2px |

**Every dimension is smaller than the canonical standard.**

---

## Page-Wide Spacing Patterns

### Standard List Items (EntityListItem)

```svelte
<!-- From EntityListItem.svelte line 243 -->
'px-3 py-2.5',  // 12px horizontal, 10px vertical
'gap-3',        // 12px gap
```

**Icons:** `w-4 h-4` (16px)
**Text:** `text-sm` (14px) primary, `text-xs` (12px) metadata

### Nested Items (Milestones under Goals)

**Should use:** `px-3 py-1.5, gap-2, w-3.5 h-3.5, text-xs`
**Currently using:** `px-2.5 py-1, gap-1.5, w-2.5 h-2.5, text-[10px]`

### Badge/Counter (Milestone Count)

```svelte
<!-- From +page.svelte line 2016 -->
<span class="px-2.5 py-1 text-[10px]">
```

**This is correct** - badges should be ultra-compact.

---

## Why This Matters

### 1. Consistency with Standards

SPACING_BORDER_STANDARDS.md is the **canonical reference** for all spacing decisions. It exists to prevent exactly this kind of inconsistency.

### 2. Visual Hierarchy

The current ultra-compact spacing creates poor visual hierarchy:

```
Goal (px-3 py-2.5)          ← 12px/10px
  ▼ Milestones (px-2.5 py-1) ← 10px/4px (TOO SMALL GAP)
```

**Should be:**

```
Goal (px-3 py-2.5)          ← 12px/10px
  ▼ Milestones (px-3 py-1.5) ← 12px/6px (PROPER NESTING)
```

The horizontal padding should MATCH the parent (px-3) to maintain alignment. Only vertical padding reduces to show nesting.

### 3. Readability

- 10px icons (`w-2.5 h-2.5`) are too small to scan quickly
- 10px text (`text-[10px]`) is below comfortable reading size
- 6px gap (`gap-1.5`) is too tight for icon+text pairs

### 4. Touch Targets

Mobile tap targets should be minimum 44x44px. Current 4px vertical padding creates targets that are too small:

- Current: 10px (icon) + 4px (top) + 4px (bottom) = 18px ❌
- Standard: 14px (icon) + 6px (top) + 6px (bottom) = 26px (still small but better)

---

## The Fix

### GoalMilestonesSection.svelte

**Section Header:**

```svelte
<!-- BEFORE -->
<button class="... gap-1.5 px-2.5 py-1 ...">
  <Flag class="w-2.5 h-2.5 ..." />
  <span class="text-[10px]">2/5 milestones</span>
</button>

<!-- AFTER -->
<button class="... gap-2 px-3 py-1.5 ...">
  <Flag class="w-3.5 h-3.5 ..." />
  <span class="text-xs">2/5 milestones</span>
</button>
```

**Empty State Button:**

```svelte
<!-- BEFORE -->
<button class="... px-2.5 py-1.5 ... text-[10px] ...">

<!-- AFTER -->
<button class="... px-3 py-2 ... text-xs ...">
  <!-- Buttons can be slightly more spacious -->
```

**Add Milestone Button:**

```svelte
<!-- BEFORE -->
<button class="... gap-1 px-2.5 py-1.5 ... text-[10px] ...">

<!-- AFTER -->
<button class="... gap-2 px-3 py-2 ... text-xs ...">
```

**Show More Button:**

```svelte
<!-- BEFORE -->
<button class="... px-2.5 py-1 text-[10px] ...">

<!-- AFTER -->
<button class="... px-3 py-1.5 text-xs ...">
```

**Completed Section Header:**

```svelte
<!-- BEFORE -->
<button class="... px-2.5 py-1 ... text-[10px] ...">

<!-- AFTER -->
<button class="... px-3 py-1.5 ... text-xs ...">
```

### MilestoneListItem.svelte

**Main Container:**

```svelte
<!-- BEFORE -->
<div class="... gap-1.5 ... px-2.5 {compact ? 'py-1' : 'py-1.5'} ...">
  <StateIcon class="w-2.5 h-2.5 ..." />
  <p class="text-[10px] ...">

<!-- AFTER -->
<div class="... gap-2 ... px-3 {compact ? 'py-1.5' : 'py-2'} ...">
  <StateIcon class="w-3.5 h-3.5 ..." />
  <p class="text-xs ...">
```

**Date Display:**

```svelte
<!-- BEFORE -->
<span class="text-[10px] ...">

<!-- AFTER -->
<span class="text-xs ...">
```

**Complete Button:**

```svelte
<!-- Icon stays same size (w-2.5 h-2.5 inside w-4 h-4 container) -->
<button class="... w-4 h-4 ...">
  <Check class="w-2.5 h-2.5" />
</button>
```

**Edit Button:**

```svelte
<!-- Icon can be slightly larger -->
<button class="... w-4 h-4 ...">
  <MoreHorizontal class="w-3 h-3" />
</button>
```

### +page.svelte (Milestone Badge)

**Keep as-is** - badges should be ultra-compact:

```svelte
<!-- CORRECT - no changes needed -->
<span class="px-2.5 py-1 text-[10px]">
  {completedCount}/{goalMilestones.length}
</span>
```

---

## Alignment with Page-Wide Patterns

### Horizontal Padding Hierarchy

```
Page container:     px-4            (16px)
Panel sections:     px-4            (16px)
Entity list items:  px-3            (12px) ← STANDARD
Nested milestones:  px-3            (12px) ← MATCHES PARENT
Badges/counters:    px-2.5          (10px) ← ULTRA-COMPACT
```

**Key insight:** Nested items match parent horizontal padding (px-3) to maintain left alignment. Only vertical padding reduces.

### Vertical Padding Hierarchy

```
Panel headers:      py-3            (12px)
Entity list items:  py-2.5          (10px) ← STANDARD
Nested milestones:  py-1.5          (6px)  ← COMPACT
Badges/counters:    py-1            (4px)  ← ULTRA-COMPACT
```

### Gap Hierarchy

```
Panel elements:     gap-3           (12px)
Entity list items:  gap-3           (12px) ← STANDARD
Nested milestones:  gap-2           (8px)  ← COMPACT
Action buttons:     gap-1 or gap-2  (4-8px)
```

### Icon Size Hierarchy

```
Modal headers:      w-6 h-6         (24px)
Card headers:       w-5 h-5         (20px)
Entity list items:  w-4 h-4         (16px) ← STANDARD
Nested milestones:  w-3.5 h-3.5     (14px) ← COMPACT
Button icons:       w-3 h-3         (12px)
Micro icons:        w-2.5 h-2.5     (10px) ← Only for tiny actions
```

### Text Size Hierarchy

```
Modal headers:      text-lg         (18px)
Card headers:       text-base       (16px)
Entity titles:      text-sm         (14px) ← STANDARD
Nested titles:      text-xs         (12px) ← COMPACT
Badges/micro:       text-[10px]     (10px) ← ULTRA-COMPACT (rare)
```

---

## Benefits of Compact/Nested Pattern

### ✅ Readability

- 14px icons are easier to recognize at a glance
- 12px text (`text-xs`) is comfortable to read
- 8px gap creates clear icon+text pairing

### ✅ Consistency

- Matches documented SPACING_BORDER_STANDARDS.md
- Horizontal padding (px-3) matches parent goals
- Creates proper visual subordination through vertical reduction only

### ✅ Touch-Friendly

- Larger tap targets for mobile
- Better for accessibility

### ✅ Visual Hierarchy

```
Goal EntityListItem
├─ px-3 py-2.5               (12px/10px)  WEIGHT: 10/10
└─ Milestone Section
   ├─ Header: px-3 py-1.5    (12px/6px)   WEIGHT: 4/10
   └─ Items: px-3 py-1.5     (12px/6px)   WEIGHT: 3/10
```

Clear hierarchy through vertical padding reduction while maintaining horizontal alignment.

---

## Implementation Checklist

### GoalMilestonesSection.svelte

- [ ] Section header: `px-3 py-1.5 gap-2`
- [ ] Flag icon: `w-3.5 h-3.5`
- [ ] Chevron icon: `w-3.5 h-3.5`
- [ ] Text: `text-xs`
- [ ] Empty state button: `px-3 py-2 text-xs`
- [ ] Add milestone button: `px-3 py-2 gap-2 text-xs`
- [ ] Show more button: `px-3 py-1.5 text-xs`
- [ ] Completed header: `px-3 py-1.5 gap-2 text-xs`
- [ ] Chevron in completed: `w-3.5 h-3.5`

### MilestoneListItem.svelte

- [ ] Container: `px-3 py-1.5 gap-2` (when compact)
- [ ] Container: `px-3 py-2 gap-2` (when not compact)
- [ ] State icon: `w-3.5 h-3.5`
- [ ] Title text: `text-xs`
- [ ] Date text: `text-xs`
- [ ] Complete button: keep `w-4 h-4` container, icon `w-2.5 h-2.5`
- [ ] Edit button: `w-4 h-4` container, icon `w-3 h-3`

### +page.svelte

- [ ] Badge counter: **NO CHANGES** (px-2.5 py-1 text-[10px] is correct)

---

## Documentation Updates Needed

After implementing:

1. Update `/thoughts/shared/research/2026-01-26_10-00-00_milestone-final-consistent.md` to reflect Compact/Nested spacing
2. Create completion doc showing before/after comparison
3. Note alignment with SPACING_BORDER_STANDARDS.md

---

**Status:** 🔄 Ready to implement - Standards-compliant spacing pattern

**Next Steps:**
1. Update GoalMilestonesSection.svelte
2. Update MilestoneListItem.svelte
3. Test visual hierarchy and readability
4. Verify alignment with parent goals
5. Create completion documentation

---

**Key Principle:** Follow SPACING_BORDER_STANDARDS.md for ALL spacing decisions. Don't invent custom patterns.
