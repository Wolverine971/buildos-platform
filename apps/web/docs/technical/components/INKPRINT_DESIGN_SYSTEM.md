# BuildOS Inkprint Design System

> **Version:** 1.0
> **Last Updated:** 2025-12-07
> **Status:** Active - Primary Design System

---

## Quick Reference

| Need to...                | Go to...                                                      |
| ------------------------- | ------------------------------------------------------------- |
| Understand the philosophy | [Section 1: Philosophy](#1-philosophy--principles)            |
| Find color tokens         | [Section 4: Color System](#4-color-system-paper--ink--accent) |
| Choose a texture          | [Section 3: Texture Grammar](#3-texture-grammar)              |
| Style a component         | [Section 7: Component Recipes](#7-component-recipes-svelte-5) |
| Migrate existing code     | [Section 9: Migration Playbook](#9-migration-playbook)        |
| Check before shipping     | [Section 10: Checklist](#10-before-you-ship-checklist)        |

---

## Table of Contents

1. [Philosophy & Principles](#1-philosophy--principles)
2. [The Laws (Non-Negotiables)](#2-the-laws-non-negotiables)
3. [Texture Grammar](#3-texture-grammar)
4. [Color System](#4-color-system-paper--ink--accent)
5. [Typography System](#5-typography-system)
6. [Layout & Spacing](#6-layout--spacing)
7. [Component Recipes (Svelte 5)](#7-component-recipes-svelte-5)
8. [Motion System](#8-motion-system)
9. [Migration Playbook](#9-migration-playbook)
10. [Before You Ship Checklist](#10-before-you-ship-checklist)

---

## 1. Philosophy & Principles

### What Inkprint Is

**Inkprint** is BuildOS's synesthetic texture-based design language. It draws from:

- **Halftone printing** — Dot patterns and gradients
- **Linocut/woodblock prints** — Bold, textured surfaces
- **Field notes** — Tactile, paper-like interfaces

The core metaphor: **Ink on paper. Carved printmaking. Field notes.**

### Why Inkprint Exists

Most SaaS design systems are "clean glass panels" — gradients, blur, soft shadows, perfect geometry. That's fine for neutral dashboards.

**BuildOS is not neutral.** BuildOS is:

- An **operating system for a messy mind**
- A **context engine**
- A **project ontology** that turns chaos into structure

The UI must:

1. **Support dense cognition** — Lots of information, fast scanning, minimal friction
2. **Communicate state without words** — Synesthetic textures you can _feel_

### What Inkprint Is NOT

- Not skeuomorphic "leather notebook"
- Not distressed grunge everywhere
- Not "texture as decoration"
- Not heavy noise that reduces readability

**Inkprint = semantic texture + disciplined layout + ruthless readability.**

---

## 2. The Laws (Non-Negotiables)

### Law 1: Readability Beats Texture

Textures are a _second channel_. If text contrast suffers or the surface feels noisy: lower texture intensity or remove it.

### Law 2: One Surface = One Texture

A single card/panel gets **at most one** texture token. Nested surfaces can have different textures only if the hierarchy is clear.

### Law 3: Meaning Is Consistent

If **Pulse** means urgency in one place, it means urgency everywhere. No remixing textures just because they "look cool."

### Law 4: Use Tokens, Not Random Colors

Don't sprinkle `bg-slate-950` or `text-gray-700` across the app. Use semantic tokens: `bg-background`, `bg-card`, `text-muted-foreground`, `bg-accent`, etc.

### Law 5: Printed, Not Plastic

**Prefer:**

- Crisp borders
- Subtle inner shadows
- Small, controlled outer shadows

**Avoid:**

- Strong glows
- Heavy blur "glass" for primary surfaces
- Neon gradients

---

## 3. Texture Grammar

Textures are **semantic tokens**. Each represents an internal state.

### 3.1 Texture Tokens

| Token      | Class          | Meaning                                    | Use For                                             |
| ---------- | -------------- | ------------------------------------------ | --------------------------------------------------- |
| **Bloom**  | `tx tx-bloom`  | Ideation, newness, creative expansion      | Creation flows, "new project", drafts, onboarding   |
| **Grain**  | `tx tx-grain`  | Execution, steady progress, craftsmanship  | Active work views, task lists, "in progress"        |
| **Pulse**  | `tx tx-pulse`  | Urgency, sprints, deadlines, momentum      | "Today focus", deadlines, priority zones            |
| **Static** | `tx tx-static` | Blockers, noise, overwhelm, risk           | Error states, warnings, "needs triage"              |
| **Thread** | `tx tx-thread` | Relationships, collaboration, dependencies | Shared projects, dependency graphs, linked entities |
| **Frame**  | `tx tx-frame`  | Canon, structure, decisions, officialness  | Primary containers, modals, canonical views         |
| **Strip**  | `tx tx-strip`  | Header band, separator, printed label      | Top borders, card headers, section transitions      |

### 3.2 Texture Intensities

```html
<!-- Weak (default): Most UI surfaces -->
<div class="tx tx-frame tx-weak">...</div>

<!-- Medium: Hero surfaces, section headers -->
<div class="tx tx-bloom tx-med">...</div>

<!-- Strong: Marketing hero, large banners (not behind text) -->
<div class="tx tx-pulse tx-strong">...</div>
```

| Intensity | Class       | Opacity | Use Case                 |
| --------- | ----------- | ------- | ------------------------ |
| Weak      | `tx-weak`   | ~3%     | Body text areas, most UI |
| Medium    | `tx-med`    | ~6%     | Headers, hero sections   |
| Strong    | `tx-strong` | ~10%    | Background-only areas    |

### 3.3 Texture Rules

**Do:**

- Frame on outer container, then Static inside an alert box
- Strip for headers, Frame for the card body

**Don't:**

- Static texture as background behind entire data tables
- Multiple textures stacked on the same surface
- Random textures "because variety"

### 3.4 Canonical Texture Mapping

| Product State                     | Texture |
| --------------------------------- | ------- |
| New / Draft / Idea capture        | Bloom   |
| Working / Executing               | Grain   |
| High priority / Deadline          | Pulse   |
| Blocked / Error / Risk            | Static  |
| Depends on / Shared with / Linked | Thread  |
| Approved / Canon / Primary UI     | Frame   |

**If you need a new meaning, create a new semantic token and document it. Do not overload existing ones.**

---

## 4. Color System (Paper + Ink + Accent)

### 4.1 Philosophy

Color is not the star. **Texture + hierarchy are the star.**

Color provides:

- Legibility
- Semantics (success/warn/danger/info)
- One brand accent (BuildOS "signal" color)

### 4.2 Semantic Tokens

Use these everywhere in Tailwind:

| Purpose         | Token                              | Example               |
| --------------- | ---------------------------------- | --------------------- |
| Page background | `bg-background`                    | Main page background  |
| Text            | `text-foreground`                  | Primary text          |
| Muted text      | `text-muted-foreground`            | Secondary/helper text |
| Cards           | `bg-card`                          | Card backgrounds      |
| Muted areas     | `bg-muted`                         | Subtle backgrounds    |
| Borders         | `border-border`                    | All borders           |
| Accent          | `bg-accent text-accent-foreground` | Primary actions       |
| Focus rings     | `ring-ring`                        | Focus states          |

### 4.3 CSS Variable Definitions

```css
/* Light mode (paper studio) */
:root {
	--background: 40 20% 98%; /* Warm off-white */
	--foreground: 240 10% 10%; /* Deep ink black */
	--card: 40 15% 96%; /* Slightly warmer */
	--muted: 40 10% 92%; /* Muted backgrounds */
	--muted-foreground: 240 5% 45%;
	--border: 40 10% 85%;
	--accent: 24 80% 55%; /* Warm orange-amber */
	--accent-foreground: 0 0% 100%;
	--ring: 24 80% 55%;
}

/* Dark mode (ink room) */
.dark {
	--background: 240 10% 6%; /* Near-black */
	--foreground: 40 10% 92%; /* Off-white */
	--card: 240 10% 10%;
	--muted: 240 10% 14%;
	--muted-foreground: 40 5% 55%;
	--border: 240 10% 18%;
	--accent: 24 85% 58%; /* Slightly brighter */
	--accent-foreground: 240 10% 6%;
	--ring: 24 85% 58%;
}
```

### 4.4 Status Colors + Texture Pairing

| Status  | Color         | Texture           |
| ------- | ------------- | ----------------- |
| Success | `emerald-600` | Grain             |
| Warning | `amber-600`   | Static            |
| Danger  | `red-600`     | Static (stronger) |
| Info    | `blue-600`    | Thread            |

### 4.5 Light vs Dark Mode Philosophy

- **Light mode:** "Paper studio" — warm whites, ink lines visible, textures subtle
- **Dark mode:** "Ink room" — near-black surfaces, textures switch to screen blend

**Key:** Light and dark should feel like the same printed artifact under different lighting, not like two different brands.

---

## 5. Typography System

### 5.1 Font Families

```css
/* Primary: UI/Actions (default) */
font-family:
	Inter,
	'Söhne',
	'GT America',
	system-ui,
	-apple-system,
	sans-serif;

/* Secondary: Notes/Scratch (optional surfaces) */
font-family: 'IBM Plex Serif', Literata, serif;
```

Use `font-ui` for commands, buttons, labels, navigation.
Use `font-notes` for longform thinking, journaling, scratchpad.

### 5.2 Type Hierarchy

| Role            | Size                   | Weight                        | Use             |
| --------------- | ---------------------- | ----------------------------- | --------------- |
| H1 / Hero       | `text-3xl sm:text-5xl` | `font-semibold`               | Page titles     |
| H2 / Section    | `text-2xl sm:text-3xl` | `font-semibold`               | Section headers |
| H3 / Card title | `text-lg`              | `font-semibold`               | Card headers    |
| Body            | `text-sm sm:text-base` | `font-normal`                 | Regular content |
| Small           | `text-xs`              | `font-normal`                 | Helper text     |
| Micro-label     | `text-[0.65rem]`       | `uppercase tracking-[0.15em]` | Metadata        |

### 5.3 Micro-Label Pattern

```svelte
<p class="micro-label text-accent">ONTOLOGY</p>
<!-- or -->
<p class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground">UPDATED: 2H AGO</p>
```

Use micro-labels for metadata anchors — users know what section they're in.

---

## 6. Layout & Spacing

### 6.1 Two Density Modes

BuildOS has both:

- **Comfort mode:** Marketing, onboarding, settings — generous spacing
- **Dense mode:** Ontology views, diffs, tables — tighter spacing

### 6.2 Spacing Scale (8px Grid)

```css
/* Standard spacing */
p-2   /* 8px - compact */
p-3   /* 12px - default */
p-4   /* 16px - comfortable */
p-6   /* 24px - spacious */

/* Dense spacing scale (available in tailwind.config.js) */
dense-3   /* 8px */
dense-4   /* 10px */
dense-5   /* 12px */
dense-8   /* 16px */
dense-12  /* 24px */
```

### 6.3 Surface Levels (Paper Stack)

| Level         | Use                  | Classes                                        |
| ------------- | -------------------- | ---------------------------------------------- |
| 1. Background | Page background      | `bg-background`                                |
| 2. Card/Panel | Main content sheets  | `bg-card border-border shadow-ink`             |
| 3. Inset      | Sub-surface in cards | `bg-background border-border shadow-ink-inner` |
| 4. Overlay    | Modals, popovers     | `bg-card shadow-ink-strong tx tx-frame`        |

### 6.4 Shadow Utilities

```css
shadow-ink         /* Subtle card shadow */
shadow-ink-strong  /* Overlay/modal shadow */
shadow-ink-inner   /* Input/inset shadow */
```

---

## 7. Component Recipes (Svelte 5)

### 7.1 Button

```svelte
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
</script>

<!-- Primary action -->
<Button variant="primary">Get Started</Button>

<!-- Secondary/ink button -->
<Button variant="secondary">Learn More</Button>

<!-- Outline button -->
<Button variant="outline">Cancel</Button>

<!-- Ghost button -->
<Button variant="ghost">Skip</Button>
```

**Variants:**

- `primary` — `bg-accent text-accent-foreground shadow-ink pressable`
- `secondary` — `bg-foreground text-background shadow-ink pressable`
- `outline` — `bg-card border-border hover:border-accent shadow-ink pressable`
- `ghost` — `bg-transparent hover:bg-muted/50`
- `danger` — `bg-red-600 text-white shadow-ink pressable`

### 7.2 Card

```svelte
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import CardFooter from '$lib/components/ui/CardFooter.svelte';
</script>

<Card variant="elevated" texture="frame">
	<CardHeader divider>
		<h3 class="text-lg font-semibold text-foreground">Card Title</h3>
	</CardHeader>
	<CardBody>
		<p class="text-muted-foreground">Card content here...</p>
	</CardBody>
	<CardFooter>
		<Button variant="outline">Cancel</Button>
		<Button variant="primary">Save</Button>
	</CardFooter>
</Card>
```

**Card Variants:**

- `default` — `bg-card border-border shadow-ink`
- `elevated` — `bg-card border-border shadow-ink-strong ink-frame`
- `interactive` — `hover:shadow-ink-strong hover:border-accent/50 cursor-pointer`
- `outline` — `bg-transparent border-border hover:border-accent`

**Texture prop:** `'none' | 'bloom' | 'grain' | 'thread' | 'frame' | 'static'`

### 7.3 Modal

```svelte
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let isOpen = $state(false);
</script>

<Button onclick={() => (isOpen = true)}>Open Modal</Button>

<Modal bind:isOpen title="Modal Title" size="md" onClose={() => (isOpen = false)}>
	<div class="p-4">
		<p class="text-muted-foreground">Modal content...</p>
	</div>

	{#snippet footer()}
		<Button variant="outline" onclick={() => (isOpen = false)}>Cancel</Button>
		<Button variant="primary">Confirm</Button>
	{/snippet}
</Modal>
```

Modal automatically applies: `tx tx-frame tx-weak ink-frame shadow-ink-strong`

### 7.4 Input

```svelte
<script lang="ts">
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';

	let value = $state('');
</script>

<!-- Text input -->
<TextInput bind:value placeholder="Enter text..." />

<!-- With error state -->
<TextInput bind:value invalid={true} />

<!-- Textarea -->
<Textarea bind:value placeholder="Enter description..." />
```

Input styling: `shadow-ink-inner border-border text-foreground focus:border-accent focus:ring-ring`

### 7.5 Alert

```svelte
<script lang="ts">
	import Alert from '$lib/components/ui/Alert.svelte';
</script>

<!-- Info alert (uses tx-thread) -->
<Alert variant="info">Information message</Alert>

<!-- Warning alert (uses tx-static) -->
<Alert variant="warning">Warning message</Alert>

<!-- Danger alert (uses tx-static) -->
<Alert variant="danger">Error message</Alert>

<!-- Success alert (uses tx-grain) -->
<Alert variant="success">Success message</Alert>
```

### 7.6 Badge

```svelte
<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
</script>

<Badge variant="neutral">Default</Badge>
<Badge variant="accent">Featured</Badge>
<Badge variant="success">Completed</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="danger">Blocked</Badge>
```

### 7.7 Interactive List Item

```svelte
<button
	class="w-full p-4 border border-border rounded-lg
  hover:border-accent hover:bg-accent/5
  transition-all text-left group
  shadow-ink pressable"
>
	<h3 class="font-semibold text-foreground group-hover:text-accent">Title</h3>
	<p class="text-sm text-muted-foreground">Description</p>
</button>
```

### 7.8 Empty State

```svelte
<div class="text-center py-12 border-2 border-dashed border-border rounded-lg">
	<Icon class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
	<p class="text-muted-foreground mb-4">No items yet</p>
	<Button variant="primary">Add First Item</Button>
</div>
```

### 7.9 Info Panel with Texture

```svelte
<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-thread tx-weak">
	<p class="micro-label text-accent mb-1">CONTEXT</p>
	<p class="text-muted-foreground">18 docs, 37 tasks linked</p>
</div>
```

### 7.10 Mobile Back Button

```svelte
<button
	class="inline-flex items-center gap-2 rounded-lg
  border border-border bg-card px-3 py-2
  text-sm font-semibold text-muted-foreground
  transition hover:border-accent hover:text-accent
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
  shadow-ink pressable"
>
	<ArrowLeft class="w-4 h-4" />
	Back
</button>
```

---

## 8. Motion System

### 8.1 Motion Personality

- Confident
- Quick
- Minimal flourish
- No "floaty bouncy"
- Tactile press feedback

### 8.2 Motion Tokens

| Token   | Duration | Use                  |
| ------- | -------- | -------------------- |
| Fast    | `120ms`  | Hover/press states   |
| Default | `180ms`  | Standard transitions |
| Slow    | `260ms`  | Complex animations   |

### 8.3 Animation Classes

```css
/* Entry animation */
.animate-ink-in {
	animation: ink-in 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* Exit animation */
.animate-ink-out {
	animation: ink-out 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* Pressable interaction */
.pressable {
	transition:
		transform 100ms ease,
		opacity 100ms ease;
}
.pressable:active {
	transform: translateY(1px);
}
```

### 8.4 Motion Guidelines

**Allowed:**

- Modal open/close
- Toast in/out
- Hover/press on buttons
- Small section reveals

**Avoid:**

- Constant looping animations (except shimmer)
- Large background motion textures
- Excessive parallax

**Always respect `prefers-reduced-motion`.**

---

## 9. Migration Playbook

### 9.1 Class Replacement Table

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

### 9.2 Step-by-Step Refactor Flow

#### Pass A: Tokenize Colors

Search and replace all hardcoded colors with semantic tokens.

```bash
# Example search patterns
text-gray-*  → text-foreground or text-muted-foreground
bg-white     → bg-card or bg-background
border-gray-* → border-border
```

#### Pass B: Normalize Surfaces

Wrap major sections in Card components.

```svelte
<!-- Before -->
<div class="bg-white dark:bg-gray-800 rounded shadow">...</div>

<!-- After -->
<Card variant="default">...</Card>
```

#### Pass C: Normalize Typography

- Use consistent heading scale
- Apply micro-label pattern for metadata
- Use `prose` only for markdown areas

#### Pass D: Add Semantic Textures

Only after structure is clean:

- Add Frame to canonical cards
- Add Grain to work-in-progress lists
- Add Static only to warnings/errors/triage areas

#### Pass E: Motion & Affordances

- Add `pressable` to clickable elements
- Ensure focus rings exist everywhere
- Replace custom animations with ink-in/out patterns

### 9.3 Adding Inkprint to New Components

```svelte
<script lang="ts">
	import { twMerge } from 'tailwind-merge';

	let {
		class: className = '',
		texture = 'none',
		...restProps
	}: {
		class?: string;
		texture?: 'none' | 'bloom' | 'grain' | 'thread' | 'frame' | 'static';
	} = $props();

	const textureClasses = {
		none: '',
		bloom: 'tx tx-bloom tx-weak',
		grain: 'tx tx-grain tx-weak',
		thread: 'tx tx-thread tx-weak',
		frame: 'tx tx-frame tx-weak',
		static: 'tx tx-static tx-weak'
	};

	let classes = $derived(
		twMerge(
			'rounded-lg border border-border bg-card shadow-ink',
			textureClasses[texture],
			className
		)
	);
</script>

<div class={classes} {...restProps}>
	<slot />
</div>
```

---

## 10. Before You Ship Checklist

- [ ] Did you use semantic color tokens (`bg-card`, `text-foreground`) instead of hardcoded colors?
- [ ] Is texture semantic, consistent, and low enough intensity for readability?
- [ ] Are surfaces clearly layered (background → card → inset → overlay)?
- [ ] Do buttons have `pressable` class and feel tactile?
- [ ] Can you scan the page in 3 seconds and understand the hierarchy?
- [ ] Does it still feel like BuildOS in both light and dark mode?
- [ ] Are focus states visible everywhere?
- [ ] Does reduced motion still work?
- [ ] Is the component responsive (mobile-first with `sm:`, `md:`, `lg:` breakpoints)?
- [ ] Are touch targets at least 44x44px?

---

## Related Documentation

- **Migration Tracker:** `/apps/web/docs/technical/INKPRINT_MIGRATION.md`
- **Component Reference:** `/apps/web/docs/technical/components/`
- **Modal System:** `/apps/web/docs/technical/components/modals/README.md`
- **Responsive Best Practices:** `/apps/web/docs/technical/MOBILE_RESPONSIVE_BEST_PRACTICES.md`

---

## Appendix: File Locations

| File                                    | Purpose                                    |
| --------------------------------------- | ------------------------------------------ |
| `/apps/web/src/lib/styles/inkprint.css` | CSS variables, textures, utilities         |
| `/apps/web/tailwind.config.js`          | Tailwind color tokens, shadows, animations |
| `/apps/web/src/app.css`                 | Global styles, imports inkprint.css        |
| `/apps/web/src/lib/utils/cn.ts`         | Class name merge utility                   |
| `/apps/web/src/lib/components/ui/`      | Base UI components                         |
