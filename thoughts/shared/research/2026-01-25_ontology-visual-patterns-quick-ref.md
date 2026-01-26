---
title: "Ontology Visual Patterns - Quick Reference Card"
date: 2026-01-25
status: ready-for-implementation
tags: [design, ontology, quick-reference, cheat-sheet]
related:
  - /thoughts/shared/research/2026-01-25_ontology-entity-semantic-visual-design.md
  - /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
path: thoughts/shared/research/2026-01-25_ontology-visual-patterns-quick-ref.md
---

# Ontology Visual Patterns - Quick Reference

**One-page cheat sheet for implementing semantic ontology entity styles.**

---

## Entity Type Patterns (Copy-Paste Ready)

### 🗂️ Project

```svelte
<!-- List Item -->
<div class="px-3 py-2.5 rounded-lg border-2 border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-900/10 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20 tx tx-frame tx-weak wt-paper transition-colors pressable">
  <FolderKanban class="w-4 h-4 text-emerald-500" />
</div>

<!-- Graph Node -->
<div class="px-3 py-2 rounded-lg border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 tx tx-frame tx-weak shadow-ink">
  <FolderKanban class="w-4 h-4 text-emerald-500" />
</div>
```

**Quick ID:** `border-2` solid, `emerald-500`, `tx-frame`, `wt-card`

---

### 🎯 Goal

```svelte
<!-- List Item -->
<div class="px-3 py-2.5 rounded-lg border-l-4 border-amber-500 bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-100/50 dark:hover:bg-amber-900/20 tx tx-bloom tx-weak wt-paper transition-colors pressable">
  <Target class="w-4 h-4 text-amber-500" />
</div>

<!-- Graph Node -->
<div class="px-3 py-2.5 rounded-lg border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20 tx tx-bloom tx-weak shadow-ink">
  <Target class="w-4 h-4 text-amber-500" />
</div>
```

**Quick ID:** `border-l-4`, `amber-500`, `tx-bloom`, `wt-paper`

---

### 🚩 Milestone

```svelte
<!-- List Item (Compact) -->
<div class="px-3 py-1.5 rounded-md border border-emerald-500/30 bg-card hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition-colors pressable">
  <Flag class="w-3.5 h-3.5 text-emerald-500" />
</div>

<!-- Graph Node -->
<div class="px-3 py-2 rounded-lg border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 tx tx-frame tx-med shadow-ink">
  <Flag class="w-4 h-4 text-emerald-500" />
</div>
```

**Quick ID:** `border-2` solid, `emerald-500`, `tx-frame`, `wt-card`

---

### 📅 Plan

```svelte
<!-- List Item -->
<div class="px-3 py-2.5 rounded-lg border-l-4 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/20 tx tx-grain tx-weak wt-paper transition-colors pressable">
  <Calendar class="w-4 h-4 text-indigo-500" />
</div>

<!-- Graph Node -->
<div class="px-3 py-2.5 rounded-lg border-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 tx tx-grain tx-weak shadow-ink">
  <Calendar class="w-4 h-4 text-indigo-500" />
</div>
```

**Quick ID:** `border-l-4`, `indigo-500`, `tx-grain`, `wt-paper`

---

### ✓ Task

```svelte
<!-- Todo State -->
<div class="px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-muted/30 tx tx-grain tx-weak wt-ghost transition-colors pressable">
  <Circle class="w-4 h-4 text-slate-400" />
</div>

<!-- In Progress State -->
<div class="px-3 py-2.5 rounded-lg border border-amber-500/30 bg-amber-50/30 dark:bg-amber-900/10 hover:bg-amber-100/40 dark:hover:bg-amber-900/20 tx tx-grain tx-weak wt-paper transition-colors pressable">
  <CircleDot class="w-4 h-4 text-amber-500" />
</div>

<!-- Done State -->
<div class="px-3 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-900/10 hover:bg-emerald-100/40 dark:hover:bg-emerald-900/20 tx tx-grain tx-weak wt-card transition-colors pressable">
  <CheckCircle2 class="w-4 h-4 text-emerald-500" />
</div>

<!-- Graph Node (Pill Shape) -->
<div class="px-2.5 py-1.5 rounded-full border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20 tx tx-grain tx-weak shadow-ink">
  <ListChecks class="w-3.5 h-3.5 text-amber-500" />
</div>
```

**Quick ID:** `border` (1px), state color, `tx-grain`, `wt-ghost/paper/card` by state

---

### ⚠️ Risk

```svelte
<!-- Medium Severity -->
<div class="px-3 py-2.5 rounded-lg border-2 border-dashed border-red-500/40 bg-red-50/40 dark:bg-red-900/10 hover:bg-red-100/50 dark:hover:bg-red-900/20 tx tx-static tx-weak wt-paper transition-colors pressable">
  <AlertTriangle class="w-4 h-4 text-red-500" />
</div>

<!-- High Severity -->
<div class="px-3 py-2.5 rounded-lg border-2 border-dashed border-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 tx tx-static tx-med wt-card transition-colors pressable shadow-ink-strong">
  <AlertTriangle class="w-4 h-4 text-red-600 animate-pulse" />
</div>

<!-- Graph Node -->
<div class="px-3 py-2.5 rounded-lg border-2 border-dashed border-red-500 bg-red-50 dark:bg-red-900/20 tx tx-static tx-med shadow-ink">
  <AlertTriangle class="w-4 h-4 text-red-500" />
</div>
```

**Quick ID:** `border-2 dashed`, `red-500/600`, `tx-static`, `wt-ghost/paper/card` by severity

---

### 📋 Requirement

```svelte
<!-- List Item -->
<div class="px-3 py-2.5 rounded-lg border-2 border-dotted border-violet-500/40 bg-violet-50/40 dark:bg-violet-900/10 hover:bg-violet-100/50 dark:hover:bg-violet-900/20 tx tx-thread tx-weak wt-paper transition-colors pressable">
  <FileCheck class="w-4 h-4 text-violet-500" />
</div>

<!-- Graph Node -->
<div class="px-3 py-2.5 rounded-lg border-2 border-dotted border-violet-500 bg-violet-50 dark:bg-violet-900/20 tx tx-thread tx-weak shadow-ink">
  <FileCheck class="w-4 h-4 text-violet-500" />
</div>
```

**Quick ID:** `border-2 dotted`, `violet-500`, `tx-thread`, `wt-paper`

---

### 📄 Document

```svelte
<!-- List Item -->
<div class="px-3 py-2.5 rounded-lg border border-sky-500/30 bg-sky-50/40 dark:bg-sky-900/10 hover:bg-sky-100/50 dark:hover:bg-sky-900/20 tx tx-frame tx-weak wt-paper transition-colors pressable">
  <FileText class="w-4 h-4 text-sky-500" />
</div>

<!-- Graph Node -->
<div class="px-3 py-2.5 rounded-lg border-2 border-sky-500 bg-sky-50 dark:bg-sky-900/20 tx tx-frame tx-weak shadow-ink">
  <FileText class="w-4 h-4 text-sky-500" />
</div>
```

**Quick ID:** `border` (1px), `sky-500`, `tx-frame`, `wt-paper`

---

## Pattern Recognition Table

| Entity | Border | Color | Texture | Weight | Icon |
|--------|--------|-------|---------|--------|------|
| **Project** | `border-2` solid | `emerald-500` | `tx-frame` | `wt-card` | `FolderKanban` |
| **Goal** | `border-l-4` | `amber-500` | `tx-bloom` | `wt-paper` | `Target` |
| **Milestone** | `border-2` solid | `emerald-500` | `tx-frame` | `wt-card` | `Flag` |
| **Plan** | `border-l-4` | `indigo-500` | `tx-grain` | `wt-paper` | `Calendar` |
| **Task** | `border` (1px) | State-based | `tx-grain` | State-based | `ListChecks` |
| **Risk** | `border-2 dashed` | `red-500/600` | `tx-static` | Severity-based | `AlertTriangle` |
| **Requirement** | `border-2 dotted` | `violet-500` | `tx-thread` | `wt-paper` | `FileCheck` |
| **Document** | `border` (1px) | `sky-500` | `tx-frame` | `wt-paper` | `FileText` |

---

## Spacing Cheat Sheet

### List Items

```svelte
<!-- Standard -->
px-3 py-2.5  →  12px horizontal, 10px vertical
gap-3        →  12px gap between icon and text
w-4 h-4      →  16px icon
text-sm      →  14px text
text-xs      →  12px metadata

<!-- Compact (nested) -->
px-3 py-1.5  →  12px horizontal, 6px vertical
gap-2        →  8px gap
w-3.5 h-3.5  →  14px icon
text-xs      →  12px text
```

### Cards

```svelte
<!-- Standard -->
p-4          →  16px padding
rounded-lg   →  12px radius
gap-3        →  12px gap
mb-3         →  12px margin bottom
w-5 h-5      →  20px icon
text-base    →  16px text

<!-- Compact -->
p-3          →  12px padding
rounded-lg   →  12px radius
gap-2        →  8px gap
mb-2         →  8px margin bottom
w-4 h-4      →  16px icon
text-sm      →  14px text
```

### Graph Nodes

```svelte
<!-- Standard -->
px-3 py-2.5  →  12px horizontal, 10px vertical
rounded-lg   →  12px radius
gap-2        →  8px gap
w-4 h-4      →  16px icon
text-sm      →  14px text

<!-- Compact (Task pill) -->
px-2.5 py-1.5  →  10px horizontal, 6px vertical
rounded-full   →  Full pill shape
gap-1.5        →  6px gap
w-3.5 h-3.5    →  14px icon
text-xs        →  12px text
```

---

## Color Opacity Guide

### Backgrounds (Light Mode)

```svelte
bg-{color}-50/50      →  Very subtle tint (default)
bg-{color}-50/40      →  Lighter tint
bg-{color}-100/50     →  Hover state
bg-{color}-50         →  Solid light background
```

### Backgrounds (Dark Mode)

```svelte
dark:bg-{color}-900/10   →  Very subtle tint (default)
dark:bg-{color}-900/20   →  Medium tint
dark:bg-{color}-900/30   →  Hover state
dark:bg-{color}-950/30   →  Solid dark background
```

### Borders

```svelte
border-{color}-500/30    →  Subtle border (default for list items)
border-{color}-500/40    →  Medium border
border-{color}-500       →  Solid border (graph nodes, cards)
border-{color}-600       →  Emphasis border (high severity risks)
```

---

## Complete Component Template

```svelte
<!-- Entity List Item (Universal Template) -->
<script lang="ts">
  import { /* Icon */ } from 'lucide-svelte';

  type EntityType = 'project' | 'goal' | 'milestone' | 'plan' | 'task' | 'risk' | 'requirement' | 'document';

  let {
    type,
    title,
    metadata,
    onclick
  }: {
    type: EntityType;
    title: string;
    metadata: string;
    onclick: () => void;
  } = $props();

  // Entity visual config
  const config = {
    project: {
      icon: FolderKanban,
      color: 'emerald-500',
      border: 'border-2 border-emerald-500/30',
      bg: 'bg-emerald-50/50 dark:bg-emerald-900/10',
      hover: 'hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20',
      texture: 'tx tx-frame tx-weak',
      weight: 'wt-card'
    },
    goal: {
      icon: Target,
      color: 'amber-500',
      border: 'border-l-4 border-amber-500',
      bg: 'bg-amber-50/50 dark:bg-amber-900/10',
      hover: 'hover:bg-amber-100/50 dark:hover:bg-amber-900/20',
      texture: 'tx tx-bloom tx-weak',
      weight: 'wt-paper'
    },
    // ... etc
  };

  const visual = $derived(config[type]);
  const Icon = $derived(visual.icon);
</script>

<button
  {onclick}
  class="
    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
    {visual.border} {visual.bg} {visual.hover}
    {visual.texture} {visual.weight}
    transition-colors pressable
  "
>
  <Icon class="w-4 h-4 text-{visual.color} shrink-0" />
  <div class="min-w-0 flex-1">
    <p class="text-sm font-medium text-foreground truncate">{title}</p>
    <p class="text-xs text-muted-foreground">{metadata}</p>
  </div>
</button>
```

---

## Visual Memory Aids

**"I see a..."**

| Visual Cue | Entity Type |
|------------|-------------|
| Thick left border + Bloom texture + Amber | **Goal** |
| Dashed border + Static texture + Red | **Risk** |
| Dotted border + Thread texture + Violet | **Requirement** |
| Solid border + Frame texture + Emerald | **Project** or **Milestone** |
| Left border + Grain texture + Indigo | **Plan** |
| State colors + Grain texture | **Task** |
| Frame texture + Sky blue | **Document** |

---

## Common Mistakes to Avoid

❌ **Wrong:**
```svelte
<!-- Hardcoded colors -->
<div class="border-gray-300 bg-gray-100">

<!-- Missing texture -->
<div class="border-2 border-emerald-500 bg-card">

<!-- Wrong border for entity type -->
<div class="border-l-4 border-red-500"> <!-- Risk should be dashed -->

<!-- Inconsistent spacing -->
<div class="px-2 py-3">  <!-- Use px-3 py-2.5 -->

<!-- Wrong icon size -->
<Icon class="w-5 h-5" />  <!-- Use w-4 h-4 for list items -->
```

✅ **Right:**
```svelte
<!-- Semantic tokens -->
<div class="border-border bg-card">

<!-- Proper texture + weight -->
<div class="border-2 border-emerald-500 bg-card tx tx-frame tx-weak wt-card">

<!-- Correct border pattern -->
<div class="border-2 border-dashed border-red-500"> <!-- Risk -->

<!-- Consistent spacing -->
<div class="px-3 py-2.5">

<!-- Correct icon size -->
<Icon class="w-4 h-4" />
```

---

## Testing Checklist

When implementing entity visuals, verify:

- [ ] Texture applied correctly (`tx tx-{type} tx-weak`)
- [ ] Weight applied correctly (`wt-{weight}`)
- [ ] Border matches entity type (solid/dashed/dotted/left-accent)
- [ ] Color matches entity type
- [ ] Icon size correct for context (list/card/graph)
- [ ] Spacing follows 8px grid
- [ ] Hover state shows background tint
- [ ] Focus state has proper ring
- [ ] Text truncates, doesn't wrap
- [ ] Works in dark mode
- [ ] Mobile responsive

---

**Quick Tip:** When in doubt, copy-paste from this reference and adjust the content!
