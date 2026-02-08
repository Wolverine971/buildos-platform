---
title: "Ontology Entity Semantic Visual Design - Production Patterns"
date: 2026-01-25
status: ready-for-implementation
tags: [design, ontology, inkprint, ui-components]
related:
  - /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
  - /thoughts/shared/research/2026-01-16_milestones-under-goals-ux-proposal.md
  - /apps/web/src/routes/projects/[id]/+page.svelte
path: thoughts/shared/research/2026-01-25_00-00-00_ontology-entity-semantic-visual-design.md
---

# Ontology Entity Semantic Visual Design

**Goal:** Create semantically meaningful, instantly recognizable visual patterns for all ontology entities (Projects, Goals, Milestones, Plans, Tasks, Risks, Requirements, Documents) using Inkprint's texture + weight + color system with high information density and clean spacing.

---

## Design Principles

### 1. Three-Channel Semantic Communication

Each entity communicates through **three visual channels**:

1. **Texture** (qualitative) → What kind of thing is this?
2. **Weight** (quantitative) → How important/permanent is this?
3. **Color + Border** (state/type) → What's the status and category?

### 2. High Information Density

- **Compact spacing:** Use `dense-*` scale for list views
- **Smart truncation:** Text should truncate gracefully, not wrap
- **Minimal padding:** `px-3 py-2` for list items, `p-4` for cards
- **Clear hierarchy:** Icon → Title → Metadata on single line when possible

### 3. Consistent Visual Grammar

- **Border radius:** `rounded-lg` (12px) for cards, `rounded-md` (8px) for small elements
- **Border width:** `border` (1px) default, `border-2` for emphasis
- **Shadows:** `shadow-ink` default, `shadow-ink-strong` for modals/elevated
- **Spacing:** 8px grid (`p-2, p-3, p-4, gap-2, gap-3`)

---

## Entity Type Specifications

### 1. **Project** - The Container

**Semantic Role:** Structural foundation, canonical source of truth, contains all other entities

**Visual Properties:**
- **Texture:** `tx tx-frame tx-weak` (canonical, structured)
- **Weight:** `wt-card` (elevated, important)
- **Color:** `emerald-500`
- **Border:** `border-2 border-emerald-500` (strong presence)
- **Radius:** `rounded-lg` (12px)
- **Shadow:** `shadow-ink-strong`

**Code Patterns:**

```svelte
<!-- List Item (Insight Panel / Dashboard) -->
<button
  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
    border-2 border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-900/10
    hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20
    tx tx-frame tx-weak wt-paper transition-colors pressable"
>
  <div class="w-8 h-8 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
    <FolderKanban class="w-4 h-4 text-emerald-500" />
  </div>
  <div class="min-w-0 flex-1">
    <p class="text-sm font-semibold text-foreground truncate">Project Name</p>
    <p class="text-xs text-muted-foreground">Active · 12 tasks</p>
  </div>
</button>

<!-- Card (Full View) -->
<div class="p-4 rounded-lg border-2 border-emerald-500 bg-card
  tx tx-frame tx-weak wt-card shadow-ink-strong">
  <div class="flex items-center gap-3 mb-3">
    <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
      <FolderKanban class="w-5 h-5 text-emerald-500" />
    </div>
    <div class="min-w-0 flex-1">
      <h2 class="text-lg font-semibold text-foreground">Project Name</h2>
      <p class="text-sm text-muted-foreground">Active</p>
    </div>
  </div>
  <!-- Project content -->
</div>

<!-- Graph Node (Compact) -->
<div class="px-3 py-2 rounded-lg border-2 border-emerald-500
  bg-emerald-50 dark:bg-emerald-900/20 tx tx-frame tx-weak shadow-ink">
  <div class="flex items-center gap-2">
    <FolderKanban class="w-4 h-4 text-emerald-500 shrink-0" />
    <span class="text-sm font-bold text-emerald-700 dark:text-emerald-300 truncate">
      Project Name
    </span>
  </div>
</div>
```

---

### 2. **Goal** - The Aspiration

**Semantic Role:** Creative expansion, target outcomes, "what we're aiming for"

**Visual Properties:**
- **Texture:** `tx tx-bloom tx-weak` (ideation, expansion)
- **Weight:** `wt-paper` (flexible, evolving)
- **Color:** `amber-500`
- **Border:** `border-l-4 border-amber-500` (left accent)
- **Radius:** `rounded-lg`
- **Shadow:** `shadow-ink`

**Code Patterns:**

```svelte
<!-- List Item (Insight Panel) -->
<button
  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
    border-l-4 border-amber-500 bg-amber-50/50 dark:bg-amber-900/10
    hover:bg-amber-100/50 dark:hover:bg-amber-900/20
    tx tx-bloom tx-weak wt-paper transition-colors pressable"
>
  <Target class="w-4 h-4 text-amber-500 shrink-0" />
  <div class="min-w-0 flex-1">
    <p class="text-sm font-medium text-foreground truncate">Goal Name</p>
    <p class="text-xs text-muted-foreground">In progress · 3 milestones</p>
  </div>
</button>

<!-- Card (Full View) -->
<div class="p-4 rounded-lg border-l-4 border-amber-500 bg-card
  tx tx-bloom tx-weak wt-paper shadow-ink">
  <div class="flex items-center gap-3 mb-3">
    <Target class="w-5 h-5 text-amber-500" />
    <div class="min-w-0 flex-1">
      <h3 class="text-base font-semibold text-foreground">Goal Name</h3>
      <p class="text-sm text-muted-foreground">In progress</p>
    </div>
  </div>
  <!-- Goal content -->
</div>

<!-- Graph Node -->
<div class="px-3 py-2.5 rounded-lg border-2 border-amber-500
  bg-amber-50 dark:bg-amber-900/20 tx tx-bloom tx-weak shadow-ink">
  <div class="flex items-center gap-2">
    <Target class="w-4 h-4 text-amber-500 shrink-0" />
    <span class="text-sm font-bold text-amber-700 dark:text-amber-300 truncate">
      Goal Name
    </span>
  </div>
</div>
```

---

### 3. **Milestone** - The Achievement

**Semantic Role:** Critical checkpoint, significant accomplishment

**Visual Properties:**
- **Texture:** `tx tx-frame tx-med` (canonical achievement)
- **Weight:** `wt-card` (important, elevated)
- **Color:** `emerald-500`
- **Border:** `border-2 border-emerald-500`
- **Radius:** `rounded-lg`
- **Shadow:** `shadow-ink` (normal), `shadow-ink-strong` when completed

**Code Patterns:**

```svelte
<!-- List Item (Compact under Goal) -->
<button
  class="w-full flex items-center gap-2 px-3 py-1.5 rounded-md
    border border-emerald-500/30 bg-card hover:bg-emerald-50/30
    dark:hover:bg-emerald-900/10 transition-colors pressable"
>
  <Flag class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
  <div class="min-w-0 flex-1">
    <p class="text-xs font-medium text-foreground truncate">Milestone Name</p>
  </div>
  <span class="text-[10px] text-muted-foreground shrink-0">Jan 30</span>
</button>

<!-- Card (Full View) -->
<div class="p-4 rounded-lg border-2 border-emerald-500 bg-card
  tx tx-frame tx-med wt-card shadow-ink-strong">
  <div class="flex items-center gap-3 mb-3">
    <Flag class="w-5 h-5 text-emerald-500" />
    <div class="min-w-0 flex-1">
      <h3 class="text-base font-semibold text-foreground">Milestone Name</h3>
      <p class="text-sm text-muted-foreground">Due: Jan 30, 2026</p>
    </div>
  </div>
  <!-- Milestone content -->
</div>

<!-- Graph Node -->
<div class="px-3 py-2 rounded-lg border-2 border-emerald-500
  bg-emerald-50 dark:bg-emerald-900/20 tx tx-frame tx-med shadow-ink">
  <div class="flex items-center gap-2">
    <Flag class="w-4 h-4 text-emerald-500 shrink-0" />
    <span class="text-sm font-bold text-emerald-700 dark:text-emerald-300 truncate">
      Milestone
    </span>
  </div>
</div>
```

---

### 4. **Plan** - The Roadmap

**Semantic Role:** Execution timeline, scheduled work, temporal structure

**Visual Properties:**
- **Texture:** `tx tx-grain tx-weak` (execution, steady progress)
- **Weight:** `wt-paper`
- **Color:** `indigo-500`
- **Border:** `border-l-4 border-indigo-500` (timeline metaphor)
- **Radius:** `rounded-lg`
- **Shadow:** `shadow-ink`

**Code Patterns:**

```svelte
<!-- List Item (Insight Panel) -->
<button
  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
    border-l-4 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10
    hover:bg-indigo-100/50 dark:hover:bg-indigo-900/20
    tx tx-grain tx-weak wt-paper transition-colors pressable"
>
  <Calendar class="w-4 h-4 text-indigo-500 shrink-0" />
  <div class="min-w-0 flex-1">
    <p class="text-sm font-medium text-foreground truncate">Plan Name</p>
    <p class="text-xs text-muted-foreground">Active · 8 tasks</p>
  </div>
</button>

<!-- Card (Full View) -->
<div class="p-4 rounded-lg border-l-4 border-indigo-500 bg-card
  tx tx-grain tx-weak wt-paper shadow-ink">
  <div class="flex items-center gap-3 mb-3">
    <Calendar class="w-5 h-5 text-indigo-500" />
    <div class="min-w-0 flex-1">
      <h3 class="text-base font-semibold text-foreground">Plan Name</h3>
      <p class="text-sm text-muted-foreground">Active · 8 tasks</p>
    </div>
  </div>
  <!-- Plan content -->
</div>

<!-- Graph Node -->
<div class="px-3 py-2.5 rounded-lg border-2 border-indigo-500
  bg-indigo-50 dark:bg-indigo-900/20 tx tx-grain tx-weak shadow-ink">
  <div class="flex items-center gap-2">
    <Calendar class="w-4 h-4 text-indigo-500 shrink-0" />
    <span class="text-sm font-bold text-indigo-700 dark:text-indigo-300 truncate">
      Plan Name
    </span>
  </div>
</div>
```

---

### 5. **Task** - The Work

**Semantic Role:** Actionable execution, hands-on work

**Visual Properties:**
- **Texture:** `tx tx-grain tx-weak` (execution, work)
- **Weight:** State-dependent:
  - Draft/Todo: `wt-ghost` (uncommitted)
  - In Progress: `wt-paper` (active)
  - Done: `wt-card` (completed)
- **Color:** State-dependent:
  - Todo: `slate-400` (neutral)
  - In Progress: `amber-500` (active)
  - Done: `emerald-500` (success)
- **Border:** `border` (1px)
- **Radius:** `rounded-lg`
- **Shadow:** `shadow-ink`

**Code Patterns:**

```svelte
<!-- List Item - Todo State -->
<button
  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
    border border-border bg-card hover:bg-muted/30
    tx tx-grain tx-weak wt-ghost transition-colors pressable"
>
  <Circle class="w-4 h-4 text-slate-400 shrink-0" />
  <div class="min-w-0 flex-1">
    <p class="text-sm text-foreground truncate">Task Name</p>
    <p class="text-xs text-muted-foreground">Todo · Low priority</p>
  </div>
</button>

<!-- List Item - In Progress State -->
<button
  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
    border border-amber-500/30 bg-amber-50/30 dark:bg-amber-900/10
    hover:bg-amber-100/40 dark:hover:bg-amber-900/20
    tx tx-grain tx-weak wt-paper transition-colors pressable"
>
  <CircleDot class="w-4 h-4 text-amber-500 shrink-0" />
  <div class="min-w-0 flex-1">
    <p class="text-sm font-medium text-foreground truncate">Task Name</p>
    <p class="text-xs text-muted-foreground">In progress · High priority</p>
  </div>
</button>

<!-- List Item - Done State -->
<button
  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
    border border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-900/10
    hover:bg-emerald-100/40 dark:hover:bg-emerald-900/20
    tx tx-grain tx-weak wt-card transition-colors pressable"
>
  <CheckCircle2 class="w-4 h-4 text-emerald-500 shrink-0" />
  <div class="min-w-0 flex-1">
    <p class="text-sm text-muted-foreground line-through truncate">Task Name</p>
    <p class="text-xs text-muted-foreground">Done · Completed 2h ago</p>
  </div>
</button>

<!-- Graph Node (In Progress) -->
<div class="px-2.5 py-1.5 rounded-full border-2 border-amber-500
  bg-amber-50 dark:bg-amber-900/20 tx tx-grain tx-weak shadow-ink">
  <div class="flex items-center gap-1.5">
    <ListChecks class="w-3.5 h-3.5 text-amber-500 shrink-0" />
    <span class="text-xs font-medium text-foreground truncate max-w-[120px]">
      Task Name
    </span>
  </div>
</div>
```

---

### 6. **Risk** - The Warning

**Semantic Role:** Blockers, concerns, things that need attention

**Visual Properties:**
- **Texture:** `tx tx-static tx-weak` (blockers, risk)
- **Weight:** Severity-dependent:
  - Low: `wt-ghost`
  - Medium: `wt-paper`
  - High: `wt-card` (demands attention)
- **Color:** `red-500` to `red-600`
- **Border:** `border-2 border-dashed` (unstable, warning)
- **Radius:** `rounded-lg`
- **Shadow:** `shadow-ink`

**Code Patterns:**

```svelte
<!-- List Item - Medium Severity -->
<button
  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
    border-2 border-dashed border-red-500/40 bg-red-50/40 dark:bg-red-900/10
    hover:bg-red-100/50 dark:hover:bg-red-900/20
    tx tx-static tx-weak wt-paper transition-colors pressable"
>
  <AlertTriangle class="w-4 h-4 text-red-500 shrink-0" />
  <div class="min-w-0 flex-1">
    <p class="text-sm font-medium text-foreground truncate">Risk Name</p>
    <p class="text-xs text-muted-foreground">Medium severity · Open</p>
  </div>
</button>

<!-- List Item - High Severity -->
<button
  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
    border-2 border-dashed border-red-600 bg-red-50 dark:bg-red-900/20
    hover:bg-red-100 dark:hover:bg-red-900/30
    tx tx-static tx-med wt-card transition-colors pressable shadow-ink-strong"
>
  <AlertTriangle class="w-4 h-4 text-red-600 shrink-0 animate-pulse" />
  <div class="min-w-0 flex-1">
    <p class="text-sm font-semibold text-red-900 dark:text-red-100 truncate">
      Critical Risk Name
    </p>
    <p class="text-xs text-red-700 dark:text-red-300">High severity · Requires action</p>
  </div>
</button>

<!-- Card (Full View) -->
<div class="p-4 rounded-lg border-2 border-dashed border-red-500 bg-card
  tx tx-static tx-med wt-card shadow-ink-strong">
  <div class="flex items-center gap-3 mb-3">
    <AlertTriangle class="w-5 h-5 text-red-500" />
    <div class="min-w-0 flex-1">
      <h3 class="text-base font-semibold text-foreground">Risk Name</h3>
      <p class="text-sm text-muted-foreground">Medium severity · Open</p>
    </div>
  </div>
  <!-- Risk content -->
</div>

<!-- Graph Node -->
<div class="px-3 py-2.5 rounded-lg border-2 border-dashed border-red-500
  bg-red-50 dark:bg-red-900/20 tx tx-static tx-med shadow-ink">
  <div class="flex items-center gap-2">
    <AlertTriangle class="w-4 h-4 text-red-500 shrink-0" />
    <span class="text-sm font-bold text-red-700 dark:text-red-300 truncate">
      Risk Name
    </span>
  </div>
</div>
```

---

### 7. **Requirement** - The Constraint

**Semantic Role:** Specifications, constraints, boundaries, dependencies

**Visual Properties:**
- **Texture:** `tx tx-thread tx-weak` (relationships, dependencies)
- **Weight:** `wt-paper`
- **Color:** `violet-500`
- **Border:** `border-2 border-dotted` (constraint boundary)
- **Radius:** `rounded-lg`
- **Shadow:** `shadow-ink`

**Code Patterns:**

```svelte
<!-- List Item (Insight Panel) -->
<button
  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
    border-2 border-dotted border-violet-500/40 bg-violet-50/40 dark:bg-violet-900/10
    hover:bg-violet-100/50 dark:hover:bg-violet-900/20
    tx tx-thread tx-weak wt-paper transition-colors pressable"
>
  <FileCheck class="w-4 h-4 text-violet-500 shrink-0" />
  <div class="min-w-0 flex-1">
    <p class="text-sm font-medium text-foreground truncate">Requirement Name</p>
    <p class="text-xs text-muted-foreground">Must have · Unmet</p>
  </div>
</button>

<!-- Card (Full View) -->
<div class="p-4 rounded-lg border-2 border-dotted border-violet-500 bg-card
  tx tx-thread tx-weak wt-paper shadow-ink">
  <div class="flex items-center gap-3 mb-3">
    <FileCheck class="w-5 h-5 text-violet-500" />
    <div class="min-w-0 flex-1">
      <h3 class="text-base font-semibold text-foreground">Requirement Name</h3>
      <p class="text-sm text-muted-foreground">Must have · Unmet</p>
    </div>
  </div>
  <!-- Requirement content -->
</div>

<!-- Graph Node -->
<div class="px-3 py-2.5 rounded-lg border-2 border-dotted border-violet-500
  bg-violet-50 dark:bg-violet-900/20 tx tx-thread tx-weak shadow-ink">
  <div class="flex items-center gap-2">
    <FileCheck class="w-4 h-4 text-violet-500 shrink-0" />
    <span class="text-sm font-bold text-violet-700 dark:text-violet-300 truncate">
      Requirement
    </span>
  </div>
</div>
```

---

### 8. **Document** - The Reference

**Semantic Role:** Knowledge base, context, supporting material

**Visual Properties:**
- **Texture:** `tx tx-frame tx-weak` (reference, structure)
- **Weight:** `wt-paper`
- **Color:** `sky-500` (formerly `blue-500`)
- **Border:** `border` (1px)
- **Radius:** `rounded-lg`
- **Shadow:** `shadow-ink`

**Code Patterns:**

```svelte
<!-- List Item (Insight Panel) -->
<button
  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
    border border-sky-500/30 bg-sky-50/40 dark:bg-sky-900/10
    hover:bg-sky-100/50 dark:hover:bg-sky-900/20
    tx tx-frame tx-weak wt-paper transition-colors pressable"
>
  <FileText class="w-4 h-4 text-sky-500 shrink-0" />
  <div class="min-w-0 flex-1">
    <p class="text-sm font-medium text-foreground truncate">Document Name</p>
    <p class="text-xs text-muted-foreground">Spec · Updated 1d ago</p>
  </div>
</button>

<!-- Card (Full View) -->
<div class="p-4 rounded-lg border border-sky-500 bg-card
  tx tx-frame tx-weak wt-paper shadow-ink">
  <div class="flex items-center gap-3 mb-3">
    <FileText class="w-5 h-5 text-sky-500" />
    <div class="min-w-0 flex-1">
      <h3 class="text-base font-semibold text-foreground">Document Name</h3>
      <p class="text-sm text-muted-foreground">Specification · Updated 1d ago</p>
    </div>
  </div>
  <!-- Document content -->
</div>

<!-- Graph Node -->
<div class="px-3 py-2.5 rounded-lg border-2 border-sky-500
  bg-sky-50 dark:bg-sky-900/20 tx tx-frame tx-weak shadow-ink">
  <div class="flex items-center gap-2">
    <FileText class="w-4 h-4 text-sky-500 shrink-0" />
    <span class="text-sm font-bold text-sky-700 dark:text-sky-300 truncate">
      Document
    </span>
  </div>
</div>
```

---

## Visual Recognition Matrix

Quick reference table for semantic patterns:

| Entity | Texture | Weight | Border Style | Color | Icon |
|--------|---------|--------|--------------|-------|------|
| **Project** | `tx-frame` | `wt-card` | `border-2 solid` | `emerald-500` | `FolderKanban` |
| **Goal** | `tx-bloom` | `wt-paper` | `border-l-4` | `amber-500` | `Target` |
| **Milestone** | `tx-frame` | `wt-card` | `border-2 solid` | `emerald-500` | `Flag` |
| **Plan** | `tx-grain` | `wt-paper` | `border-l-4` | `indigo-500` | `Calendar` |
| **Task** | `tx-grain` | `wt-ghost/paper/card` | `border` | State-based | `ListChecks` |
| **Risk** | `tx-static` | `wt-ghost/paper/card` | `border-2 dashed` | `red-500/600` | `AlertTriangle` |
| **Requirement** | `tx-thread` | `wt-paper` | `border-2 dotted` | `violet-500` | `FileCheck` |
| **Document** | `tx-frame` | `wt-paper` | `border` | `sky-500` | `FileText` |

---

## Spacing & Layout Standards

### List Item Spacing (Insight Panels)

```svelte
<!-- Standard list item -->
<div class="px-3 py-2.5 ...">  <!-- 12px horizontal, 10px vertical -->
  <div class="flex items-center gap-3"> <!-- 12px gap -->
    <Icon class="w-4 h-4 shrink-0" />  <!-- 16px icon -->
    <div class="min-w-0 flex-1">
      <p class="text-sm truncate">Title</p>  <!-- 14px text -->
      <p class="text-xs">Metadata</p>  <!-- 12px text -->
    </div>
  </div>
</div>

<!-- Compact list item (nested) -->
<div class="px-3 py-1.5 ...">  <!-- 12px horizontal, 6px vertical -->
  <div class="flex items-center gap-2"> <!-- 8px gap -->
    <Icon class="w-3.5 h-3.5 shrink-0" />  <!-- 14px icon -->
    <p class="text-xs truncate">Title</p>  <!-- 12px text -->
  </div>
</div>
```

### Card Spacing

```svelte
<!-- Standard card -->
<div class="p-4 rounded-lg ...">  <!-- 16px padding, 12px radius -->
  <div class="flex items-center gap-3 mb-3"> <!-- 12px gap, 12px margin bottom -->
    <Icon class="w-5 h-5" />  <!-- 20px icon -->
    <h3 class="text-base font-semibold">Title</h3>  <!-- 16px text -->
  </div>
  <!-- Content -->
</div>

<!-- Compact card -->
<div class="p-3 rounded-lg ...">  <!-- 12px padding, 12px radius -->
  <div class="flex items-center gap-2 mb-2"> <!-- 8px gap, 8px margin bottom -->
    <Icon class="w-4 h-4" />  <!-- 16px icon -->
    <h4 class="text-sm font-semibold">Title</h4>  <!-- 14px text -->
  </div>
  <!-- Content -->
</div>
```

### Graph Node Spacing

```svelte
<!-- Standard graph node -->
<div class="px-3 py-2.5 rounded-lg ...">  <!-- 12px horizontal, 10px vertical -->
  <div class="flex items-center gap-2">  <!-- 8px gap -->
    <Icon class="w-4 h-4 shrink-0" />  <!-- 16px icon -->
    <span class="text-sm font-bold truncate">Label</span>  <!-- 14px text -->
  </div>
</div>

<!-- Compact graph node (Task pill) -->
<div class="px-2.5 py-1.5 rounded-full ...">  <!-- 10px horizontal, 6px vertical -->
  <div class="flex items-center gap-1.5">  <!-- 6px gap -->
    <Icon class="w-3.5 h-3.5 shrink-0" />  <!-- 14px icon -->
    <span class="text-xs font-medium truncate max-w-[120px]">Label</span>
  </div>
</div>
```

---

## Border Radius Standards

- **Cards:** `rounded-lg` (12px)
- **List items:** `rounded-lg` (12px)
- **Small elements:** `rounded-md` (8px)
- **Icon containers:** `rounded-md` (8px) or `rounded-lg` (12px)
- **Pills/badges:** `rounded-full`
- **Graph nodes:** `rounded-lg` (12px) or `rounded-full` (tasks)

---

## Implementation Checklist

### For Each Entity Type:

- [ ] List item component with proper texture + weight + color
- [ ] Card component with proper spacing and shadow
- [ ] Graph node component with compact layout
- [ ] Hover states with subtle background tint
- [ ] Focus states with proper ring
- [ ] Responsive sizing (mobile vs desktop)
- [ ] Dark mode color adjustments
- [ ] Icon + label + metadata layout
- [ ] Proper truncation for long text
- [ ] State-specific styling (when applicable)

### Global Consistency:

- [ ] All borders use semantic token colors
- [ ] All spacing follows 8px grid
- [ ] All text uses proper type scale
- [ ] All icons use consistent sizing
- [ ] All shadows use Inkprint tokens
- [ ] All hover states use `pressable` class
- [ ] All transitions use `transition-colors`
- [ ] All truncation uses `truncate` utility

---

## Usage Guidelines

### When to Use Each Pattern

**List Items:**
- Insight panels (right sidebar)
- Search results
- Quick access lists
- Nested entity lists (milestones under goals)

**Cards:**
- Detail views
- Modal content
- Dashboard grid items
- Feature highlights

**Graph Nodes:**
- Relationship graphs
- Dependency visualizations
- Project maps
- Flow diagrams

### Avoid These Patterns

❌ **Don't:**
- Mix textures on the same surface
- Use multiple border colors on one element
- Add texture to text-heavy areas (readability)
- Stack heavy shadows
- Use `wt-plate` for non-system-critical UI
- Hardcode color values (use semantic tokens)
- Skip responsive sizing
- Ignore dark mode

✅ **Do:**
- Use one texture per component
- Match border color to entity type
- Keep textures weak (`tx-weak`) for readability
- Use proper weight for semantic importance
- Use semantic color tokens everywhere
- Test in both light and dark mode
- Ensure mobile-friendly sizing

---

## Next Steps

1. **Create reusable components:**
   - `EntityListItem.svelte` (with entity type prop)
   - `EntityCard.svelte` (with entity type prop)
   - `EntityGraphNode.svelte` (with entity type prop)

2. **Update existing components:**
   - Insight panels in `/projects/[id]/+page.svelte`
   - Graph nodes in `/lib/components/ontology/graph/svelteflow/nodes/`
   - Modal content throughout the app

3. **Document component props:**
   - `entityType: 'project' | 'goal' | 'milestone' | 'plan' | 'task' | 'risk' | 'requirement' | 'document'`
   - `variant: 'list' | 'card' | 'graph'`
   - `compact: boolean`

4. **Create Storybook examples:**
   - All entity types in all variants
   - All states (todo, in progress, done, etc.)
   - Light and dark mode examples

---

## Related Documentation

- **Inkprint Design System:** `/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`
- **Milestones Under Goals:** `/thoughts/shared/research/2026-01-16_milestones-under-goals-ux-proposal.md`
- **Current Implementation:** `/apps/web/src/routes/projects/[id]/+page.svelte`
- **Graph Components:** `/apps/web/src/lib/components/ontology/graph/`
- **Icon Conventions:** Section 13 of INKPRINT_DESIGN_SYSTEM.md

---

**Status:** ✅ Ready for Implementation

**Author:** Claude Code (Sonnet 4.5)

**Date:** 2026-01-25
