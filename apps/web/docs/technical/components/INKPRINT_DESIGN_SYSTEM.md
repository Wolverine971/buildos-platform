<!-- apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md -->

# BuildOS Inkprint Design System

> **Version:** 1.0
> **Last Updated:** 2025-12-07
> **Status:** Active - Primary Design System

---

## Quick Reference

| Need to...                | Go to...                                                      |
| ------------------------- | ------------------------------------------------------------- |
| Understand the philosophy | [Section 1: Philosophy](#1-philosophy--principles)            |
| Choose a texture          | [Section 3: Texture Grammar](#3-texture-grammar)              |
| Choose a weight           | [Section 4: Weight System](#4-weight-system)                  |
| Combine texture + weight  | [Section 5: Texture × Weight Matrix](#5-texture--weight-matrix) |
| Find color tokens         | [Section 6: Color System](#6-color-system-paper--ink--accent) |
| Style a component         | [Section 9: Component Recipes](#9-component-recipes-svelte-5) |
| Migrate existing code     | [Section 11: Migration Playbook](#11-migration-playbook)      |
| Check before shipping     | [Section 12: Checklist](#12-before-you-ship-checklist)        |

---

## Table of Contents

1. [Philosophy & Principles](#1-philosophy--principles)
2. [The Laws (Non-Negotiables)](#2-the-laws-non-negotiables)
3. [Texture Grammar](#3-texture-grammar)
4. [Weight System](#4-weight-system)
5. [Texture × Weight Matrix](#5-texture--weight-matrix)
6. [Color System](#6-color-system-paper--ink--accent)
7. [Typography System](#7-typography-system)
8. [Layout & Spacing](#8-layout--spacing)
9. [Component Recipes (Svelte 5)](#9-component-recipes-svelte-5)
10. [Motion System](#10-motion-system)
11. [Migration Playbook](#11-migration-playbook)
12. [Before You Ship Checklist](#12-before-you-ship-checklist)
13. [Data Model Icon Conventions](#13-data-model-icon-conventions)

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

## 4. Weight System

Weight is the **second semantic dimension** of the Inkprint system. While texture communicates *what kind of thing* something is, weight communicates *how important* it is.

### 4.1 What Weight Communicates

Weight expresses three aspects simultaneously:

| Aspect        | Light (Ghost)                | Heavy (Plate)                   |
| ------------- | ---------------------------- | ------------------------------- |
| **Permanence**| Ephemeral, draft, suggestion | Canonical, committed, historical|
| **Attention** | Ambient, ignorable           | Demands focus, requires decision|
| **Hierarchy** | Supporting, contextual       | Primary, authoritative          |

### 4.2 The Print Shop Metaphor

Think of weight like paper types in a print shop:

- **Onionskin (Ghost)** — So light you can see through it. Scratch notes. Disposable.
- **Bond (Paper)** — Standard working paper. Most things live here.
- **Cardstock (Card)** — Substantial. This matters. Keep this.
- **Plate** — Carved in metal. Immutable. System-level.

### 4.3 Weight Tokens

| Token       | Class       | Meaning                            | Use For                                    |
| ----------- | ----------- | ---------------------------------- | ------------------------------------------ |
| **Ghost**   | `wt-ghost`  | Ephemeral, uncommitted, suggestion | AI suggestions, empty slots, draft states  |
| **Paper**   | `wt-paper`  | Standard UI, working state         | Most cards, panels, default surfaces       |
| **Card**    | `wt-card`   | Important, elevated, committed     | Milestones, key decisions, commitments     |
| **Plate**   | `wt-plate`  | System-critical, immutable         | Modals, system alerts, canonical views     |

### 4.4 Weight Visual Properties

Each weight level affects multiple visual properties:

| Weight    | Shadow              | Border      | Radius    | Motion Duration |
| --------- | ------------------- | ----------- | --------- | --------------- |
| `ghost`   | None                | 1px dashed  | 0.75rem   | 100ms (snappy)  |
| `paper`   | `shadow-ink`        | 1px solid   | 0.5rem    | 150ms (default) |
| `card`    | `shadow-ink-strong` | 1.5px solid | 0.5rem    | 200ms (deliberate) |
| `plate`   | Deep + inset        | 2px solid   | 0.375rem  | 280ms (weighty) |

### 4.5 Weight and Motion

**Key principle:** Weight affects motion. Heavier elements move slower (more inertia).

| Weight  | Duration | Easing               | Feeling                    |
| ------- | -------- | -------------------- | -------------------------- |
| `ghost` | 100ms    | `ease-out`           | Snappy, immediate, nimble  |
| `paper` | 150ms    | `ease`               | Standard, comfortable      |
| `card`  | 200ms    | `ease-in-out`        | Deliberate, confident      |
| `plate` | 280ms    | `cubic-bezier(...)` | Weighty, authoritative     |

### 4.6 Weight Rules

**Do:**

- Use `wt-paper` as the implicit default (no class needed)
- Explicitly add weight classes only when deviating from paper
- Match weight to semantic importance, not just visual preference
- Use `wt-ghost` for truly ephemeral, dismissible content

**Don't:**

- Inherit weight from parent elements (always explicit)
- Use `wt-plate` for non-system-critical UI
- Mix heavy weights on minor UI elements
- Forget that weight affects motion timing

### 4.7 Light vs Dark Mode

Weight must feel consistent across modes, but implementation differs:

**Light Mode:**
- Shadows convey weight naturally
- Borders are subtle dividers
- Ghost elements nearly invisible

**Dark Mode:**
- Shadows less visible; compensate with rim glows
- Borders become luminous hints
- Ghost elements use subtle luminous borders
- Plate elements get luminous edge highlights

The CSS variables automatically handle these differences.

---

## 5. Texture × Weight Matrix

Texture and weight work together to create a **two-axis semantic system**:

- **Texture** = *What kind of thing is this?* (qualitative)
- **Weight** = *How important is this?* (quantitative)

### 5.1 Usage Syntax

```html
<element class="tx tx-[texture] tx-[intensity] wt-[weight]">
```

Example:
```html
<!-- Draft task: grain texture (in-progress) + ghost weight (uncommitted) -->
<div class="tx tx-grain tx-weak wt-ghost">Draft: Review PR</div>

<!-- Completed milestone: frame texture (canonical) + card weight (important) -->
<div class="tx tx-frame tx-med wt-card">✓ MVP Shipped</div>

<!-- System modal: frame texture + plate weight -->
<div class="tx tx-frame tx-weak wt-plate">Confirm Deletion</div>
```

### 5.2 The Semantic Matrix

This matrix shows recommended texture × weight combinations:

|             | Ghost              | Paper              | Card               | Plate              |
| ----------- | ------------------ | ------------------ | ------------------ | ------------------ |
| **Bloom**   | AI suggestion      | New idea card      | —                  | —                  |
| **Grain**   | Draft task         | Active task        | —                  | —                  |
| **Pulse**   | —                  | Upcoming deadline  | Urgent deadline    | —                  |
| **Static**  | Dismissible warning| Error notice       | Critical error     | System failure     |
| **Thread**  | Weak link hint     | Dependency card    | Key relationship   | —                  |
| **Frame**   | —                  | Standard panel     | Milestone/decision | Modal, system view |

### 5.3 Component Examples

```svelte
<!-- Suggestion chip: ephemeral, ignorable -->
<div class="px-3 py-1.5 tx tx-bloom tx-weak wt-ghost">
  Add a deadline?
</div>

<!-- Standard task card: working state -->
<div class="p-3 tx tx-grain tx-weak wt-paper">
  <h4 class="font-medium text-foreground">Write documentation</h4>
  <p class="text-sm text-muted-foreground">In progress</p>
</div>

<!-- Completed milestone: canonical, important -->
<div class="p-4 tx tx-frame tx-med wt-card">
  <div class="flex items-center gap-2">
    <span class="text-emerald-500">✓</span>
    <h3 class="font-semibold text-foreground">MVP Shipped</h3>
  </div>
</div>

<!-- System modal: demands attention, authoritative -->
<div class="p-6 tx tx-frame tx-weak wt-plate">
  <h2 class="text-lg font-semibold text-foreground">Confirm Deletion</h2>
  <p class="text-muted-foreground">This action cannot be undone.</p>
</div>

<!-- Error that requires decision -->
<div class="p-3 tx tx-static tx-med wt-card">
  <p class="text-red-600 font-medium">Payment failed</p>
  <p class="text-sm text-muted-foreground">Update billing info?</p>
</div>
```

### 5.4 Card Component Integration

The Card component supports both texture and weight:

```svelte
<Card texture="frame" weight="paper">
  Standard panel
</Card>

<Card texture="grain" weight="ghost">
  Draft state
</Card>

<Card texture="frame" weight="plate">
  Modal-level importance
</Card>
```

---

## 6. Color System (Paper + Ink + Accent)

### 6.1 Philosophy

Color is not the star. **Texture + hierarchy are the star.**

Color provides:

- Legibility
- Semantics (success/warn/danger/info)
- One brand accent (BuildOS "signal" color)

### 6.2 Semantic Tokens

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

### 6.3 CSS Variable Definitions

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

### 6.4 Status Colors + Texture Pairing

| Status  | Color         | Texture           |
| ------- | ------------- | ----------------- |
| Success | `emerald-600` | Grain             |
| Warning | `amber-600`   | Static            |
| Danger  | `red-600`     | Static (stronger) |
| Info    | `blue-600`    | Thread            |

### 6.5 Light vs Dark Mode Philosophy

- **Light mode:** "Paper studio" — warm whites, ink lines visible, textures subtle
- **Dark mode:** "Ink room" — near-black surfaces, textures switch to screen blend

**Key:** Light and dark should feel like the same printed artifact under different lighting, not like two different brands.

---

## 7. Typography System

### 7.1 Font Families

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

### 7.2 Type Hierarchy

| Role            | Size                   | Weight                        | Use             |
| --------------- | ---------------------- | ----------------------------- | --------------- |
| H1 / Hero       | `text-3xl sm:text-5xl` | `font-semibold`               | Page titles     |
| H2 / Section    | `text-2xl sm:text-3xl` | `font-semibold`               | Section headers |
| H3 / Card title | `text-lg`              | `font-semibold`               | Card headers    |
| Body            | `text-sm sm:text-base` | `font-normal`                 | Regular content |
| Small           | `text-xs`              | `font-normal`                 | Helper text     |
| Micro-label     | `text-[0.65rem]`       | `uppercase tracking-[0.15em]` | Metadata        |

### 7.3 Micro-Label Pattern

```svelte
<p class="micro-label text-accent">ONTOLOGY</p>
<!-- or -->
<p class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground">UPDATED: 2H AGO</p>
```

Use micro-labels for metadata anchors — users know what section they're in.

---

## 8. Layout & Spacing

### 8.1 Two Density Modes

BuildOS has both:

- **Comfort mode:** Marketing, onboarding, settings — generous spacing
- **Dense mode:** Ontology views, diffs, tables — tighter spacing

### 8.2 Spacing Scale (8px Grid)

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

### 8.3 Surface Levels (Paper Stack)

| Level         | Use                  | Classes                                        |
| ------------- | -------------------- | ---------------------------------------------- |
| 1. Background | Page background      | `bg-background`                                |
| 2. Card/Panel | Main content sheets  | `bg-card border-border shadow-ink`             |
| 3. Inset      | Sub-surface in cards | `bg-background border-border shadow-ink-inner` |
| 4. Overlay    | Modals, popovers     | `bg-card shadow-ink-strong tx tx-frame`        |

### 8.4 Shadow Utilities

```css
shadow-ink         /* Subtle card shadow */
shadow-ink-strong  /* Overlay/modal shadow */
shadow-ink-inner   /* Input/inset shadow */
```

---

## 9. Component Recipes (Svelte 5)

### 9.1 Button

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

### 9.2 Card

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

### 9.3 Modal

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

### 9.4 Input

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

### 9.5 Alert

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

### 9.6 Badge

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

### 9.7 Interactive List Item

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

### 9.8 Empty State

```svelte
<div class="text-center py-12 border-2 border-dashed border-border rounded-lg">
	<Icon class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
	<p class="text-muted-foreground mb-4">No items yet</p>
	<Button variant="primary">Add First Item</Button>
</div>
```

### 9.9 Info Panel with Texture

```svelte
<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-thread tx-weak">
	<p class="micro-label text-accent mb-1">CONTEXT</p>
	<p class="text-muted-foreground">18 docs, 37 tasks linked</p>
</div>
```

### 9.10 Mobile Back Button

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

## 10. Motion System

### 10.1 Motion Personality

- Confident
- Quick
- Minimal flourish
- No "floaty bouncy"
- Tactile press feedback

### 10.2 Motion Tokens

| Token   | Duration | Use                  |
| ------- | -------- | -------------------- |
| Fast    | `120ms`  | Hover/press states   |
| Default | `180ms`  | Standard transitions |
| Slow    | `260ms`  | Complex animations   |

### 10.3 Animation Classes

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

### 10.4 Motion Guidelines

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

## 11. Migration Playbook

### 11.1 Class Replacement Table

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

### 11.2 Step-by-Step Refactor Flow

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

### 11.3 Adding Inkprint to New Components

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

## 12. Before You Ship Checklist

### Color & Tokens
- [ ] Did you use semantic color tokens (`bg-card`, `text-foreground`) instead of hardcoded colors?
- [ ] Does it work in both light and dark mode without manual `dark:` overrides?

### Texture & Weight
- [ ] Is texture semantic and consistent with the meaning table (Section 3)?
- [ ] Is texture intensity appropriate (weak for text areas, med for headers)?
- [ ] Is weight appropriate for the element's importance (Section 4)?
- [ ] Did you avoid using `wt-plate` for non-system-critical UI?
- [ ] Does the texture × weight combination match the semantic matrix (Section 5)?

### Hierarchy & Readability
- [ ] Are surfaces clearly layered (background → card → inset → overlay)?
- [ ] Can you scan the page in 3 seconds and understand the hierarchy?
- [ ] Is information density appropriate (compact but not cramped)?

### Interaction & Motion
- [ ] Do buttons have `pressable` class and feel tactile?
- [ ] Does motion timing feel appropriate for the element's weight?
- [ ] Does `prefers-reduced-motion` disable animations?
- [ ] Are focus states visible everywhere?

### Responsiveness & Accessibility
- [ ] Is the component responsive (mobile-first with `sm:`, `md:`, `lg:` breakpoints)?
- [ ] Are touch targets at least 44x44px?
- [ ] Is contrast ratio WCAG AA compliant (4.5:1 for text)?

---

## 13. Data Model Icon Conventions

BuildOS uses consistent icons from Lucide for all core data models. **These icons must be used everywhere a data model is represented visually.**

### Canonical Icon Mapping

| Data Model    | Icon            | Color Class        | Import                      |
| ------------- | --------------- | ------------------ | --------------------------- |
| **Project**   | `FolderKanban`  | `text-emerald-500` | `FolderKanban` from lucide  |
| **Goal**      | `Target`        | `text-amber-500`   | `Target` from lucide        |
| **Plan**      | `Calendar`      | `text-indigo-500`  | `Calendar` from lucide      |
| **Task**      | `ListChecks`    | `text-slate-500`   | `ListChecks` from lucide    |
| **Milestone** | `Flag`          | `text-emerald-500` | `Flag` from lucide          |
| **Output**    | `Layers`        | `text-purple-500`  | `Layers` from lucide        |
| **Document**  | `FileText`      | `text-sky-500`     | `FileText` from lucide      |
| **Risk**      | `AlertTriangle` | `text-red-500`     | `AlertTriangle` from lucide |
| **Decision**  | `Scale`         | `text-violet-500`  | `Scale` from lucide         |

### Canonical Source

The **authoritative source** for these icons is the InsightPanels in `/apps/web/src/routes/projects/[id]/+page.svelte` (lines 346-382).

### Usage Locations

These icons should be used consistently in:

1. **InsightPanels** (`/projects/[id]`) - Right rail entity panels
2. **Dashboard** - Project cards with entity counts
3. **Graph Nodes** - Svelte Flow graph visualization nodes
4. **Graph Legend** - `GraphControls.svelte` legend section
5. **Landing Page** - "Under the hood" data model cards
6. **Example Project Graph** - Stats row and node previews
7. **Node Details Panel** - Entity type headers

### Example Usage

```svelte
<script lang="ts">
	import {
		Target,
		Calendar,
		ListChecks,
		Flag,
		FileText,
		AlertTriangle,
		Layers
	} from 'lucide-svelte';
</script>

<!-- Goal with canonical icon -->
<div class="flex items-center gap-2">
	<Target class="w-4 h-4 text-amber-500" />
	<span>Goals</span>
</div>

<!-- Task with canonical icon -->
<div class="flex items-center gap-2">
	<ListChecks class="w-4 h-4 text-slate-500" />
	<span>Tasks</span>
</div>
```

### Common Mistakes to Avoid

| ❌ Wrong Icon  | ✅ Correct Icon | Entity    |
| -------------- | --------------- | --------- |
| `CheckCircle2` | `ListChecks`    | Task      |
| `ListTodo`     | `Calendar`      | Plan      |
| `File`         | `FileText`      | Document  |
| `Bookmark`     | `Flag`          | Milestone |

### Icon Size Guidelines

| Context           | Size Class    |
| ----------------- | ------------- |
| Inline with text  | `w-3.5 h-3.5` |
| Panel headers     | `w-4 h-4`     |
| Card headers      | `w-5 h-5`     |
| Hero/empty states | `w-6 h-6`+    |

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
