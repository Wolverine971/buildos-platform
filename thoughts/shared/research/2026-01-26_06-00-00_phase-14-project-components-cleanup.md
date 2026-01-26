---
title: "Phase 14: Project Components - Inkprint Design System Cleanup"
date: 2026-01-26T06:00:00
status: in-progress
category: design-system-compliance
related_phases:
  - phase-13: "Time Blocks components (188 fixes)"
  - phase-12: "Agent & Calendar components (195 fixes)"
compliance_target: "99.95%+"
path: thoughts/shared/research/2026-01-26_06-00-00_phase-14-project-components-cleanup.md
---

# Phase 14: Project Components Cleanup

## Overview

Systematic cleanup of project components following Inkprint Design System specifications. This is the **largest component directory** with 39 files containing violations - the core of BuildOS's project management functionality.

## Scope

**Total files with violations:** 39 files
**Estimated total fixes:** 1000+ across all project components

### Complexity Distribution

| Complexity | Files | Violations Range | Examples |
|------------|-------|------------------|----------|
| Very High | 3 | 100-150 | TaskModal, ProjectHeader, PhaseGenerationConfirmationModal |
| High | 7 | 50-99 | TasksList, ProjectSynthesis, ProjectHeaderMinimal, etc. |
| Medium | 15 | 20-49 | NotesSection, PhaseSchedulingModal, QuickProjectModal, etc. |
| Low | 14 | 1-19 | DeleteConfirmationModal, ProjectBriefCard, etc. |

## Components Cleaned

### Small Components (< 20 violations, < 300 lines)

#### 1. DeleteConfirmationModal.svelte (✅ Complete - 4 fixes)
**Purpose:** Confirmation dialog for deleting projects
**Complexity:** Very Low - simple text-only modal

**Fixes:**
- `text-gray-500 dark:text-gray-400` → `text-muted-foreground` (2x)

**Result:** Clean deletion confirmation with semantic colors.

#### 2. ProjectCalendarConnectModal.svelte (✅ Complete - 13 fixes)
**Purpose:** Modal to initiate Google Calendar connection for a project
**Complexity:** Low - form with feature list

**Batch Replacements:**
- `text-gray-600 dark:text-gray-300` → `text-foreground` (2x)
- `border-gray-100 ... dark:border-gray-700 dark:bg-gray-900/40` → `border-border bg-card shadow-ink` (3x list items)

**Manual Fixes:**
- Error message: Removed opacity from `dark:bg-red-900/30` → `dark:bg-red-900`

**Result:** Clean calendar connection flow with proper Inkprint styling.

#### 3. ProjectBriefCard.svelte (✅ Complete - 15 fixes)
**Purpose:** Card displaying daily brief summary for a project
**Complexity:** Low - card with metadata badges

**Batch Replacements:**
- `text-gray-900 dark:text-white` → `text-foreground`
- `text-gray-600 dark:text-gray-400` → `text-muted-foreground` (5x)
- `text-gray-700 dark:text-gray-300` → `text-foreground`
- `border-gray-300` → `border-muted-foreground`

**Manual Fixes:**
- Metadata badges: Removed opacity from all `/30` modifiers → solid colors with `shadow-ink`
  - `bg-blue-100 dark:bg-blue-900/30` → `bg-blue-100 dark:bg-blue-900 shadow-ink`
  - `bg-green-100 dark:bg-green-900/30` → `bg-green-100 dark:bg-green-900 shadow-ink`
  - `bg-orange-100 dark:bg-orange-900/30` → `bg-orange-100 dark:bg-orange-900 shadow-ink`

**Result:** Clean brief card with proper badge styling and semantic colors.

#### 4. ProjectManyToOneComparisonModal.svelte (✅ Complete - 16 fixes)
**Purpose:** Compare multiple project versions against a reference version
**Complexity:** Low - wrapper modal with comparison view

**Batch Replacements:**
- `border-gray-200 dark:border-gray-700` → `border-border` (3x)
- `text-gray-600 dark:text-gray-400` → `text-muted-foreground` (4x)
- `text-gray-700 dark:text-gray-300` → `text-foreground`
- `border-gray-300 dark:border-gray-600` → `border-border`

**Result:** Clean comparison modal with consistent semantic styling.

## Progress Summary (Partial)

| Component | Type | Fixes | Lines | Status |
|-----------|------|-------|-------|--------|
| DeleteConfirmationModal | Modal | 4 | 60 | ✅ Complete |
| ProjectCalendarConnectModal | Modal | 13 | 144 | ✅ Complete |
| ProjectBriefCard | Card | 15 | 186 | ✅ Complete |
| ProjectManyToOneComparisonModal | Modal | 16 | 166 | ✅ Complete |

**Total Phase 14 So Far:** 48 fixes across 4 files (4/39 project components complete)

## Remaining High-Priority Components

### Medium Complexity (Next targets)
1. TaskMoveConfirmationModal.svelte - 18 violations, 311 lines
2. NoteModal.svelte - 18 violations, 315 lines
3. CoreDimensionsField.svelte - 19 violations, 228 lines
4. BraindumpProjectCard.svelte - 22 violations, 224 lines
5. BraindumpsSection.svelte - 24 violations, 281 lines

### High Complexity (Later)
1. TaskModal.svelte - 145 violations, 1707 lines ⚠️
2. ProjectHeader.svelte - 125 violations, 1654 lines ⚠️
3. PhaseGenerationConfirmationModal.svelte - 119 violations, 1060 lines ⚠️
4. TaskMappingVisualization.svelte - 103 violations, 675 lines ⚠️

**Estimated remaining:** 950+ fixes across 35 files

## Key Patterns Applied

### 1. Metadata Badge Styling
```svelte
<!-- ❌ Before -->
<span class="bg-blue-100 dark:bg-blue-900/30 text-blue-700">

<!-- ✅ After -->
<span class="bg-blue-100 dark:bg-blue-900 text-blue-700 shadow-ink">
```

**Rationale:** Badges should have solid backgrounds with proper shadows, not opacity

### 2. Semantic Color Tokens
```svelte
<!-- ❌ Before -->
<p class="text-gray-600 dark:text-gray-400">

<!-- ✅ After -->
<p class="text-muted-foreground">
```

**Rationale:** Use semantic tokens for automatic theme adaptation

### 3. Border Consistency
```svelte
<!-- ❌ Before -->
<div class="border-gray-200 dark:border-gray-700">

<!-- ✅ After -->
<div class="border-border">
```

**Rationale:** Semantic border token ensures consistency across light/dark modes

## Technical Debt Eliminated

1. **Removed gray color palette** - All gray-X colors replaced with semantic tokens
2. **Eliminated opacity on structural backgrounds** - Badges and cards now use solid colors
3. **Consistent borders** - All borders use `border-border` semantic token
4. **Proper shadows** - Added `shadow-ink` to badges and interactive elements

## Cumulative Progress (Phases 1-14)

| Phase | Component Type | Files | Fixes | Status |
|-------|---------------|-------|-------|---------|
| 1-11 | Various | 48 | 391 | ✅ Complete |
| 12 | Agent + Calendar | 8 | 195 | ✅ Complete |
| 13 | Time Blocks | 8 | 188 | ✅ Complete |
| 14 | Project (partial) | 4 | 48 | 🔄 In progress |

**Grand Total:** 822 fixes across 68 files

## Next Steps

1. Continue with medium-complexity project files (18-26 violations)
2. Work up to high-complexity files (40-60 violations)
3. Tackle very high-complexity files last (100+ violations each)
4. Create comprehensive validation report when project directory complete

---

**End Phase 14 Summary** (In Progress - 4/39 project components complete)
