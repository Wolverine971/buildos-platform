# Inkprint Design System Migration

> **Status:** In Progress
> **Started:** 2025-12-07
> **Last Updated:** 2025-12-07

---

## Quick Links

| Resource                                                                | Description                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| **[INKPRINT_DESIGN_SYSTEM.md](./components/INKPRINT_DESIGN_SYSTEM.md)** | Complete design system reference (START HERE for new work) |
| **[BUILDOS_STYLE_GUIDE.md](./components/BUILDOS_STYLE_GUIDE.md)**       | Legacy style guide (historical reference)                  |
| **[inkprint.css](../../src/lib/styles/inkprint.css)**                   | CSS variables and texture classes                          |
| **[tailwind.config.js](../../tailwind.config.js)**                      | Tailwind color tokens and utilities                        |

---

## Overview

This document tracks the migration from the previous "Scratchpad Ops" / "Apple-inspired" design system to the new **Inkprint** design system. Inkprint is a halftone/linocut-inspired synesthetic texture-based design language featuring semantic textures, warm accent colors, and tactile visual feedback.

## Design Philosophy

Inkprint draws inspiration from:

- **Halftone printing** - Dot patterns and gradients
- **Linocut/woodblock prints** - Bold, textured surfaces
- **Synesthetic textures** - Visual textures that convey meaning (ideation, execution, urgency, etc.)

### Core Principles

1. **Semantic textures** - Each texture type conveys meaning about the content
2. **Warm accent palette** - Orange-based accent color for energy and action
3. **Tactile feedback** - Pressable elements, shadows that suggest depth
4. **Clean typography** - High contrast, readable text with clear hierarchy

---

## Files Created

### 1. Inkprint CSS Foundation

**File:** `/apps/web/src/lib/styles/inkprint.css`

Core CSS foundation containing:

#### Color System (CSS Variables)

```css
:root {
	--background: 40 20% 98%; /* Warm off-white */
	--foreground: 240 10% 10%; /* Near-black */
	--card: 40 15% 96%; /* Slightly warmer than background */
	--muted: 40 10% 92%; /* Muted backgrounds */
	--accent: 24 80% 55%; /* Warm orange */
	--border: 40 10% 85%; /* Subtle borders */
	--ring: 24 80% 55%; /* Focus rings match accent */
}
```

#### Texture Classes

| Class        | Purpose                    | Visual Effect            |
| ------------ | -------------------------- | ------------------------ |
| `.tx-bloom`  | Ideation, creativity       | Radial halftone gradient |
| `.tx-grain`  | Execution, work items      | Diagonal line pattern    |
| `.tx-pulse`  | Urgency, attention         | Concentric rings         |
| `.tx-static` | Blockers, errors           | Random noise             |
| `.tx-thread` | Relationships, connections | Horizontal lines         |
| `.tx-frame`  | Structure, containers      | Corner accents           |
| `.tx-strip`  | Headers, banners           | Horizontal bar           |

#### Intensity Modifiers

- `.tx-weak` - 3% opacity (subtle)
- `.tx-med` - 6% opacity (moderate)
- `.tx-strong` - 10% opacity (prominent)

#### Shadow Utilities

```css
--shadow-ink: 0 1px 2px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04);
--shadow-ink-strong: 0 2px 4px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.06);
--shadow-ink-inner: inset 0 1px 2px rgba(0, 0, 0, 0.06);
```

#### Interactive Utilities

- `.pressable` - Subtle press animation on click
- `.ink-frame` - Inner box-shadow frame effect
- `.micro-label` - Tiny uppercase labels (0.65rem, tracking 0.15em)

#### Animations

- `ink-in` - Fade in with slight upward motion
- `ink-out` - Fade out with slight downward motion

---

## Files Modified

### 2. Tailwind Configuration

**File:** `/apps/web/tailwind.config.js`

Added Inkprint color tokens and shadow utilities:

```javascript
colors: {
  background: withOpacity('--background'),
  foreground: withOpacity('--foreground'),
  card: { DEFAULT: withOpacity('--card'), foreground: withOpacity('--card-foreground') },
  muted: { DEFAULT: withOpacity('--muted'), foreground: withOpacity('--muted-foreground') },
  accent: { DEFAULT: withOpacity('--accent'), foreground: withOpacity('--accent-foreground') },
  border: withOpacity('--border'),
  ring: withOpacity('--ring'),
}

boxShadow: {
  ink: 'var(--shadow-ink)',
  'ink-strong': 'var(--shadow-ink-strong)',
  'ink-inner': 'var(--shadow-ink-inner)'
}
```

### 3. Global Styles

**File:** `/apps/web/src/app.css`

Added import for inkprint.css:

```css
@import './lib/styles/inkprint.css';
```

---

## Component Updates

### Base UI Components

#### Button (`/apps/web/src/lib/components/ui/Button.svelte`)

- Updated variant classes to use Inkprint tokens
- Primary: `bg-accent text-accent-foreground shadow-ink pressable`
- Outline: `bg-card text-foreground border-border hover:border-accent`
- Ghost: `text-muted-foreground hover:text-accent`

#### Card (`/apps/web/src/lib/components/ui/Card.svelte`)

- Added `texture` prop: `'none' | 'bloom' | 'grain' | 'thread' | 'frame' | 'static'`
- Updated variants:
    - `default`: `bg-card border-border shadow-ink`
    - `elevated`: `bg-card border-border shadow-ink-strong ink-frame`
    - `interactive`: `hover:shadow-ink-strong hover:border-accent/50`

#### CardHeader (`/apps/web/src/lib/components/ui/CardHeader.svelte`)

- Added `texture` prop
- Updated variants with Inkprint tokens

#### CardBody (`/apps/web/src/lib/components/ui/CardBody.svelte`)

- Added `texture` prop
- Removed old dithering styles

#### Badge (`/apps/web/src/lib/components/ui/Badge.svelte`)

- Added new variants: `'default'`, `'accent'`
- Default: `bg-muted text-muted-foreground border-border`
- Accent: `bg-accent/10 text-accent border-accent/30`

#### Alert (`/apps/web/src/lib/components/ui/Alert.svelte`)

- Added semantic textures per variant:
    - Info: `tx tx-thread tx-weak`
    - Success: `tx tx-bloom tx-weak`
    - Warning: `tx tx-pulse tx-weak`
    - Error: `tx tx-static tx-weak`

#### TextInput (`/apps/web/src/lib/components/ui/TextInput.svelte`)

- Updated to Inkprint styling
- `shadow-ink-inner`, `border-border`, `text-foreground`
- Focus: `focus:border-accent focus:ring-ring`

#### Modal (`/apps/web/src/lib/components/ui/Modal.svelte`)

- Updated container: `bg-card border-border shadow-ink-strong`
- Added texture: `tx tx-frame tx-weak ink-frame rounded-2xl`

---

## Route Updates

### Ontology Layout

**File:** `/apps/web/src/routes/ontology/+layout.svelte`

- Sidebar: `bg-card border-r border-border`
- Branding box: `bg-muted/30 shadow-ink tx tx-frame tx-weak ink-frame`
- Nav links active state: `bg-accent/10 text-accent border-accent/30`
- Back button: `border-border hover:border-accent shadow-ink pressable`

### Create Project Page

**File:** `/apps/web/src/routes/ontology/create/+page.svelte`

- Mobile back button with Inkprint styling
- Section headers: `text-foreground`
- Helper text: `text-muted-foreground`
- Template cards: `hover:border-accent hover:bg-accent/5`
- Form sections with consistent typography

### Templates List Page

**File:** `/apps/web/src/routes/ontology/templates/+page.svelte`

- Header and subheader with Inkprint tokens
- Info panel: `bg-card shadow-ink tx tx-thread tx-weak`
- Facet filters: `bg-card border-border` with accent states
- Filter status panel: `bg-muted/30 border-border`
- Group by buttons: `bg-accent/10 text-accent` when active
- Scope insight panels: `shadow-ink tx tx-frame tx-weak`
- Empty state: `border-dashed border-border`
- Realm/scope headers: `text-foreground`

### New Template Wizard

**File:** `/apps/web/src/routes/ontology/templates/new/+page.svelte`

- Mobile back button with Inkprint styling
- Header: `text-foreground` / `text-muted-foreground`
- Progress indicator:
    - Active step: `bg-accent text-accent-foreground`
    - Completed step: `bg-emerald-500`
    - Pending step: `bg-muted text-muted-foreground`
- Error displays: `bg-red-50 border-red-200`

### Project Detail Page

**File:** `/apps/web/src/routes/ontology/projects/[id]/+page.svelte`

- Mobile back button: `border-border bg-card shadow-ink pressable`
- Sync status: `text-muted-foreground` with `text-accent` spinner
- Tab section headers: `text-foreground`
- Empty states: `border-dashed border-border rounded-lg`
- List items (tasks, outputs, plans):
    - `border-border rounded-lg shadow-ink pressable`
    - `hover:border-accent hover:bg-accent/5`
    - Icons: `text-muted-foreground group-hover:text-accent`
    - Titles: `text-foreground group-hover:text-accent`
- Priority badges: `bg-muted text-foreground`

---

## Styling Patterns Reference

### Common Class Combinations

#### Mobile Back Button

```svelte
<button class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-ink pressable">
```

#### Section Header

```svelte
<h3 class="text-lg font-semibold text-foreground">Section Title</h3>
<p class="text-sm text-muted-foreground">Description text</p>
```

#### Micro Label

```svelte
<p class="micro-label text-accent">LABEL TEXT</p>
```

#### Interactive List Item

```svelte
<button
	class="w-full p-4 border border-border rounded-lg hover:border-accent hover:bg-accent/5 transition-all text-left group shadow-ink pressable"
>
	<h3 class="font-semibold text-foreground group-hover:text-accent">Title</h3>
	<p class="text-sm text-muted-foreground">Description</p>
</button>
```

#### Empty State

```svelte
<div class="text-center py-12 border-2 border-dashed border-border rounded-lg">
	<Icon class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
	<p class="text-muted-foreground mb-4">Empty state message</p>
	<Button variant="primary">Action</Button>
</div>
```

#### Info Panel with Texture

```svelte
<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-thread tx-weak">
	<p class="micro-label text-accent mb-1">LABEL</p>
	<p class="text-muted-foreground">Content</p>
</div>
```

---

## Remaining Work

### Pending Updates

1. **Graph Components**
    - `OntologyGraph.svelte`
    - `GraphControls.svelte`
    - `NodeDetailsPanel.svelte`

2. **Template Components**
    - `TemplateCard.svelte`
    - `TemplateForm.svelte`
    - `TemplateDetailModal.svelte`
    - `MetadataEditor.svelte`
    - `FacetDefaultsEditor.svelte`
    - `FsmEditor.svelte`
    - `SchemaBuilder.svelte`

3. **Modal Components**
    - `TaskCreateModal.svelte`
    - `TaskEditModal.svelte`
    - `GoalCreateModal.svelte`
    - `GoalEditModal.svelte`
    - `PlanCreateModal.svelte`
    - `PlanEditModal.svelte`
    - `OutputCreateModal.svelte`
    - `OutputEditModal.svelte`
    - `DocumentModal.svelte`

4. **Other Priority Areas** (from original scope)
    - `/profile` routes
    - `AgentChatModal`
    - Homepage (if not complete)
    - Navigation component

---

## Migration Checklist

When migrating a component or route, replace:

| Old Class                                      | New Class               |
| ---------------------------------------------- | ----------------------- |
| `text-gray-900 dark:text-white`                | `text-foreground`       |
| `text-gray-600 dark:text-gray-400`             | `text-muted-foreground` |
| `text-gray-500 dark:text-gray-400`             | `text-muted-foreground` |
| `bg-white dark:bg-gray-800`                    | `bg-card`               |
| `bg-gray-100 dark:bg-gray-700`                 | `bg-muted`              |
| `border-gray-200 dark:border-gray-700`         | `border-border`         |
| `border-slate-700/30 dark:border-slate-500/30` | `border-border`         |
| `text-blue-600 dark:text-blue-400`             | `text-accent`           |
| `bg-blue-600`                                  | `bg-accent`             |
| `hover:border-blue-500`                        | `hover:border-accent`   |
| `focus:ring-blue-500`                          | `focus:ring-ring`       |
| `shadow-subtle` / `shadow-sm`                  | `shadow-ink`            |
| `rounded`                                      | `rounded-lg`            |

Add where appropriate:

- `pressable` - for clickable elements
- `shadow-ink` - for elevated elements
- `tx tx-[type] tx-weak` - for textured panels
- `micro-label` - for tiny uppercase labels
- `ink-frame` - for framed containers

---

## Notes

- The Inkprint system uses HSL color values with CSS custom properties
- Dark mode support is maintained through the CSS variables (dark mode values defined in inkprint.css)
- Textures are applied via `::before` pseudo-elements with SVG data URIs
- The `pressable` class provides tactile feedback without JavaScript
- Badge state classes (`getTaskStateBadgeClass`, etc.) remain unchanged as they use semantic colors

---

## How to Use This Document

### For New Development

1. **Start with** [INKPRINT_DESIGN_SYSTEM.md](./components/INKPRINT_DESIGN_SYSTEM.md) — the complete design reference
2. Use the component recipes and patterns documented there
3. Reference this migration doc only for tracking what's been migrated

### For Migrating Existing Components

1. Find the component in the "Remaining Work" section above
2. Use the "Migration Checklist" table to replace old classes
3. Reference the "Styling Patterns Reference" for common patterns
4. Mark the component as migrated once complete

### For Understanding the System

- **Philosophy & Laws:** [Design System Section 1-2](./components/INKPRINT_DESIGN_SYSTEM.md#1-philosophy--principles)
- **Texture Grammar:** [Design System Section 3](./components/INKPRINT_DESIGN_SYSTEM.md#3-texture-grammar)
- **Color Tokens:** [Design System Section 4](./components/INKPRINT_DESIGN_SYSTEM.md#4-color-system-paper--ink--accent)
- **Svelte 5 Recipes:** [Design System Section 7](./components/INKPRINT_DESIGN_SYSTEM.md#7-component-recipes-svelte-5)
