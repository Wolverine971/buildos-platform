---
title: 'Spacing & Border Standards - Inkprint Design System'
date: 2026-01-25
status: canonical
tags: [design-system, spacing, borders, inkprint]
related:
    - /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
path: apps/web/docs/technical/components/SPACING_BORDER_STANDARDS.md
---

# Spacing & Border Standards

**Canonical reference for all spacing, padding, margin, border radius, and border width decisions in BuildOS.**

---

## Core Principles

1. **8px Grid System** - All spacing must be divisible by 8px (or 4px for micro-spacing)
2. **High Information Density** - Maximize useful information without overwhelming
3. **Consistent Hierarchy** - Same spacing for same semantic purpose
4. **Mobile-First** - Base sizes work on mobile, scale up for desktop

---

## Spacing Scale (8px Grid)

### Standard Scale

| Token | Tailwind    | Pixels | Use Case                                         |
| ----- | ----------- | ------ | ------------------------------------------------ |
| `0.5` | `space-0.5` | 2px    | Micro gaps (between icon + text in tight spaces) |
| `1`   | `space-1`   | 4px    | Tiny gaps                                        |
| `1.5` | `space-1.5` | 6px    | Compact gaps                                     |
| `2`   | `space-2`   | 8px    | Small gaps, compact padding                      |
| `2.5` | `space-2.5` | 10px   | List item vertical padding                       |
| `3`   | `space-3`   | 12px   | **DEFAULT** list item horizontal padding         |
| `4`   | `space-4`   | 16px   | **DEFAULT** card padding                         |
| `6`   | `space-6`   | 24px   | Spacious card padding                            |

### Gap Scale (Between Elements)

| Use Case                      | Class     | Pixels | Example                         |
| ----------------------------- | --------- | ------ | ------------------------------- |
| **Icon + Text (compact)**     | `gap-1.5` | 6px    | Milestone rows, micro elements  |
| **Icon + Text (standard)**    | `gap-2`   | 8px    | Graph nodes, compact lists      |
| **Icon + Text (comfortable)** | `gap-3`   | 12px   | **DEFAULT** - List items, cards |
| **Section gaps**              | `gap-4`   | 16px   | Between card sections           |
| **Panel gaps**                | `gap-6`   | 24px   | Between major sections          |

---

## Component Spacing Standards

### List Items (Insight Panels, Entity Lists)

**Standard List Item:**

```svelte
<!-- CANONICAL PATTERN -->
<div class="px-3 py-2.5 ...">
	<!-- 12px horizontal, 10px vertical -->
	<div class="flex items-center gap-3">
		<!-- 12px between icon and text -->
		<Icon class="w-4 h-4 shrink-0" />
		<!-- 16px icon -->
		<div class="min-w-0 flex-1">
			<p class="text-sm">Title</p>
			<!-- 14px -->
			<p class="text-xs">Metadata</p>
			<!-- 12px -->
		</div>
	</div>
</div>
```

**Compact/Nested List Item:**

```svelte
<!-- For nested items (milestones under goals) -->
<div class="px-3 py-1.5 ...">
	<!-- 12px horizontal, 6px vertical -->
	<div class="flex items-center gap-2">
		<!-- 8px gap -->
		<Icon class="w-3.5 h-3.5 shrink-0" />
		<!-- 14px icon -->
		<p class="text-xs">Title</p>
		<!-- 12px -->
	</div>
</div>
```

**Ultra-Compact List Item:**

```svelte
<!-- For deeply nested or sidebar items -->
<div class="px-2.5 py-1 ...">
	<!-- 10px horizontal, 4px vertical -->
	<div class="flex items-center gap-1.5">
		<!-- 6px gap -->
		<Icon class="w-3 h-3 shrink-0" />
		<!-- 12px icon -->
		<p class="text-[10px]">Title</p>
		<!-- 10px -->
	</div>
</div>
```

### Cards

**Standard Card:**

```svelte
<div class="p-4 ...">
	<!-- 16px padding all sides -->
	<div class="flex items-center gap-3 mb-3">
		<!-- Header with 12px gap, 12px margin bottom -->
		<Icon class="w-5 h-5" />
		<!-- 20px icon -->
		<h3 class="text-base font-semibold">Title</h3>
		<!-- 16px -->
	</div>
	<div class="space-y-3">
		<!-- 12px vertical gap between sections -->
		<!-- Content -->
	</div>
</div>
```

**Compact Card:**

```svelte
<div class="p-3 ...">
	<!-- 12px padding -->
	<div class="flex items-center gap-2 mb-2">
		<!-- 8px gap, 8px margin -->
		<Icon class="w-4 h-4" />
		<!-- 16px icon -->
		<h4 class="text-sm font-semibold">Title</h4>
		<!-- 14px -->
	</div>
	<div class="space-y-2">
		<!-- 8px vertical gap -->
		<!-- Content -->
	</div>
</div>
```

**Spacious Card (Modal Content):**

```svelte
<div class="p-6 ...">
	<!-- 24px padding -->
	<div class="flex items-center gap-4 mb-4">
		<!-- 16px gap and margin -->
		<Icon class="w-6 h-6" />
		<!-- 24px icon -->
		<h2 class="text-lg font-semibold">Title</h2>
		<!-- 18px -->
	</div>
	<div class="space-y-4">
		<!-- 16px vertical gap -->
		<!-- Content -->
	</div>
</div>
```

### Graph Nodes

**Standard Node:**

```svelte
<div class="px-3 py-2.5 ...">
	<!-- 12px horizontal, 10px vertical -->
	<div class="flex items-center gap-2">
		<!-- 8px gap -->
		<Icon class="w-4 h-4 shrink-0" />
		<!-- 16px icon -->
		<span class="text-sm font-bold">Label</span>
		<!-- 14px -->
	</div>
</div>
```

**Compact Node (Task Pill):**

```svelte
<div class="px-2.5 py-1.5 ...">
	<!-- 10px horizontal, 6px vertical -->
	<div class="flex items-center gap-1.5">
		<!-- 6px gap -->
		<Icon class="w-3.5 h-3.5 shrink-0" />
		<!-- 14px icon -->
		<span class="text-xs">Label</span>
		<!-- 12px -->
	</div>
</div>
```

### Modal Headers

**Standard Modal Header:**

```svelte
<div class="px-6 py-4 border-b border-border ...">
	<!-- 24px horizontal, 16px vertical -->
	<div class="flex items-center gap-3">
		<!-- 12px gap -->
		<Icon class="w-5 h-5" />
		<!-- 20px icon -->
		<h2 class="text-lg font-semibold">Modal Title</h2>
		<!-- 18px -->
	</div>
</div>
```

---

## Border Radius Standards

### Standard Radii

| Use Case           | Class          | Pixels | When to Use                             |
| ------------------ | -------------- | ------ | --------------------------------------- |
| **Small elements** | `rounded-md`   | 8px    | Badges, chips, small buttons            |
| **Standard**       | `rounded-lg`   | 12px   | **DEFAULT** - Cards, list items, panels |
| **Large surfaces** | `rounded-xl`   | 16px   | Page-level containers, large cards      |
| **Pills**          | `rounded-full` | 9999px | Task nodes, badges, status indicators   |

### Component Patterns

```svelte
<!-- Cards: rounded-lg (12px) -->
<div class="rounded-lg border border-border ...">

<!-- List items: rounded-lg (12px) -->
<button class="rounded-lg hover:bg-muted/30 ...">

<!-- Icon containers: rounded-md (8px) for small, rounded-lg (12px) for standard -->
<div class="w-8 h-8 rounded-md bg-accent/10 ...">
<div class="w-10 h-10 rounded-lg bg-accent/10 ...">

<!-- Badges/pills: rounded-full -->
<span class="px-2 py-0.5 rounded-full ...">

<!-- Graph nodes: rounded-lg for standard, rounded-full for tasks -->
<div class="rounded-lg ...">  <!-- Goals, Plans, etc -->
<div class="rounded-full ...">  <!-- Tasks -->
```

### ❌ Avoid These

```svelte
<!-- DON'T mix radius sizes on nested elements -->
<div class="rounded-xl">  <!-- Parent -->
  <div class="rounded-sm">  <!-- Child - jarring transition -->
  </div>
</div>

<!-- DON'T use arbitrary radius values -->
<div class="rounded-[10px]">  <!-- Use rounded-lg instead -->

<!-- DON'T skip radius on interactive elements -->
<button class="hover:bg-muted">  <!-- Missing rounded-lg -->
```

---

## Border Width Standards

### Standard Widths

| Width           | Class        | Pixels | Use Case                                           |
| --------------- | ------------ | ------ | -------------------------------------------------- |
| **Hairline**    | `border`     | 1px    | **DEFAULT** - Dividers, standard cards             |
| **Emphasis**    | `border-2`   | 2px    | Important entities (Projects, Risks, Requirements) |
| **Accent Left** | `border-l-4` | 4px    | Timeline elements (Goals, Plans)                   |

### Entity-Specific Patterns

```svelte
<!-- Standard entities: 1px border -->
<div class="border border-border ...">
	<!-- Tasks, Documents, Events -->
</div>

<!-- Important entities: 2px border -->
<div class="border-2 border-emerald-500 ...">
	<!-- Projects, Milestones -->
</div>

<div class="border-2 border-dashed border-red-500 ...">
	<!-- Risks (dashed) -->
</div>

<div class="border-2 border-dotted border-violet-500 ...">
	<!-- Requirements (dotted) -->
</div>

<!-- Timeline entities: 4px left accent -->
<div class="border-l-4 border-amber-500 ...">
	<!-- Goals -->
</div>

<div class="border-l-4 border-indigo-500 ...">
	<!-- Plans -->
</div>
```

---

## Icon Size Standards

### Size Scale

| Context      | Class         | Pixels | Use Case                        |
| ------------ | ------------- | ------ | ------------------------------- |
| **Micro**    | `w-2.5 h-2.5` | 10px   | Ultra-compact nested items      |
| **Tiny**     | `w-3 h-3`     | 12px   | Very compact items              |
| **Small**    | `w-3.5 h-3.5` | 14px   | Compact list items, graph nodes |
| **Standard** | `w-4 h-4`     | 16px   | **DEFAULT** - List items        |
| **Medium**   | `w-5 h-5`     | 20px   | Card headers, larger buttons    |
| **Large**    | `w-6 h-6`     | 24px   | Modal headers, page headers     |

### Component Patterns

```svelte
<!-- Ultra-compact nested items -->
<Icon class="w-2.5 h-2.5" />
<!-- Milestone section header -->

<!-- Compact list items -->
<Icon class="w-3.5 h-3.5" />
<!-- Nested milestones -->

<!-- Standard list items (DEFAULT) -->
<Icon class="w-4 h-4" />
<!-- Tasks, Plans, Goals, Risks -->

<!-- Card headers -->
<Icon class="w-5 h-5" />
<!-- Card headers, detail views -->

<!-- Modal headers -->
<Icon class="w-6 h-6" />
<!-- Modal titles, page headers -->

<!-- Icon containers (add 2px per side = icon + 4px) -->
<div class="w-8 h-8">
	<!-- For w-4 h-4 icon -->
	<Icon class="w-4 h-4" />
</div>

<div class="w-10 h-10">
	<!-- For w-6 h-6 icon -->
	<Icon class="w-6 h-6" />
</div>
```

---

## Typography Scale

| Use Case        | Class         | Size | Line Height | Weight   | Use For                  |
| --------------- | ------------- | ---- | ----------- | -------- | ------------------------ |
| **Micro**       | `text-[10px]` | 10px | tight       | normal   | Ultra-compact metadata   |
| **Extra Small** | `text-xs`     | 12px | normal      | normal   | **DEFAULT** metadata     |
| **Small**       | `text-sm`     | 14px | normal      | medium   | **DEFAULT** primary text |
| **Base**        | `text-base`   | 16px | relaxed     | semibold | Card headers             |
| **Large**       | `text-lg`     | 18px | relaxed     | semibold | Modal headers            |
| **Extra Large** | `text-xl`     | 20px | relaxed     | semibold | Page headers             |

### Component Patterns

```svelte
<!-- List item primary text -->
<p class="text-sm font-medium text-foreground">Title</p>

<!-- List item metadata -->
<p class="text-xs text-muted-foreground">Metadata</p>

<!-- Card header -->
<h3 class="text-base font-semibold text-foreground">Card Title</h3>

<!-- Modal header -->
<h2 class="text-lg font-semibold text-foreground">Modal Title</h2>

<!-- Ultra-compact nested items -->
<p class="text-[10px] text-muted-foreground">Milestone count</p>
```

---

## Divider Standards

### Horizontal Dividers

```svelte
<!-- Between list items -->
<ul class="divide-y divide-border/80">
  <li>Item 1</li>
  <li>Item 2</li>
</ul>

<!-- Between card sections -->
<div class="border-t border-border">

<!-- Subtle section divider -->
<div class="border-t border-border/30">
```

### Vertical Dividers

```svelte
<!-- Between inline elements -->
<span class="mx-1 opacity-50">·</span>

<!-- Structural vertical line -->
<div class="border-l border-border"></div>
```

---

## Responsive Patterns

### Mobile-First Approach

```svelte
<!-- Base sizes work on mobile, scale up for desktop -->
<div class="px-3 py-2.5 sm:px-4 sm:py-3">
	<!-- Grows on desktop -->
	<div class="flex items-center gap-2 sm:gap-3">
		<!-- Gap grows -->
		<Icon class="w-4 h-4 sm:w-5 sm:h-5" />
		<!-- Icon grows -->
		<p class="text-xs sm:text-sm">Text</p>
		<!-- Text grows -->
	</div>
</div>
```

### When to Use Responsive Sizing

✅ **Use responsive sizing for:**

- Top-level page containers
- Card padding on major views
- Header elements
- Icon containers in headers

❌ **Don't use responsive sizing for:**

- List items (keep consistent density)
- Graph nodes (need consistent layout)
- Compact nested items (already optimized)
- Badges and pills (fixed size)

---

## Migration Checklist

### Spacing Audit

- [ ] All padding uses values from spacing scale (no `p-7` or `px-5`)
- [ ] All gaps use consistent values (prefer `gap-2` or `gap-3`)
- [ ] All margins use spacing scale
- [ ] No arbitrary spacing values (`p-[13px]`)

### Border Audit

- [ ] All border radius uses `rounded-md`, `rounded-lg`, `rounded-xl`, or `rounded-full`
- [ ] No mixed radius on parent/child elements
- [ ] Border widths follow entity patterns (1px default, 2px emphasis, 4px accent)
- [ ] Dashed/dotted borders only on Risks/Requirements

### Icon Audit

- [ ] All icons use standard sizes (w-3.5, w-4, w-5, w-6)
- [ ] Icon size matches context (w-4 for lists, w-5 for cards, w-6 for modals)
- [ ] All icons have `shrink-0` class to prevent squishing
- [ ] Icon containers properly sized (icon + 4px per side)

### Typography Audit

- [ ] List item titles use `text-sm`
- [ ] Metadata uses `text-xs`
- [ ] Card headers use `text-base`
- [ ] Modal headers use `text-lg`
- [ ] Ultra-compact items use `text-[10px]`

---

## Common Patterns Summary

### Entity List Item (Canonical)

```svelte
<div
	class="px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
>
	<div class="flex items-center gap-3">
		<Icon class="w-4 h-4 shrink-0 text-accent" />
		<div class="min-w-0 flex-1">
			<p class="text-sm font-medium text-foreground truncate">Title</p>
			<p class="text-xs text-muted-foreground">Metadata</p>
		</div>
	</div>
</div>
```

### Entity Card (Canonical)

```svelte
<div class="p-4 rounded-lg border border-border bg-card shadow-ink">
	<div class="flex items-center gap-3 mb-3">
		<Icon class="w-5 h-5 text-accent" />
		<h3 class="text-base font-semibold text-foreground">Card Title</h3>
	</div>
	<div class="space-y-3">
		<!-- Card content -->
	</div>
</div>
```

### Graph Node (Canonical)

```svelte
<div class="px-3 py-2.5 rounded-lg border-2 border-accent bg-accent/5 shadow-ink">
	<div class="flex items-center gap-2">
		<Icon class="w-4 h-4 shrink-0 text-accent" />
		<span class="text-sm font-bold text-foreground truncate">Node Label</span>
	</div>
</div>
```

---

**Status:** ✅ Canonical - All spacing/border decisions reference this doc

**Last Updated:** 2026-01-25
