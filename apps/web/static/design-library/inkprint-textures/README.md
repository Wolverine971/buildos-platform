# Inkprint Texture Library

A comprehensive collection of printmaking-inspired textures and design tokens for the BuildOS Inkprint Design System.

## 📦 What's Included

This library contains all the texture classes, color systems, and design utilities from the Inkprint design system, organized into modular CSS files for easy integration.

### Files Overview

| File                       | Description                                     | Use When                              |
| -------------------------- | ----------------------------------------------- | ------------------------------------- |
| `color-system.css`         | Semantic color tokens for light/dark mode       | Setting up color palette              |
| `textures-core.css`        | All 7 texture types + button texture            | Adding texture to surfaces            |
| `textures-intensities.css` | Weak/medium/strong intensity modifiers          | Controlling texture opacity           |
| `shadows.css`              | Inkprint shadow system                          | Adding depth and elevation            |
| `atmosphere.css`           | Atmospheric background layer                    | Creating depth in marketing/editorial |
| `weight-system.css`        | Semantic weight tokens (ghost/paper/card/plate) | Conveying hierarchy and permanence    |
| `interactive.css`          | Pressable, rim, and interactive states          | Adding tactile interactions           |
| `motion.css`               | Ink-in/ink-out animations                       | Adding micro-animations               |
| `utilities.css`            | Spatial, grid, and utility classes              | Layout and spacing                    |
| `all-textures.css`         | **Everything combined**                         | One-file import                       |

## 🚀 Quick Start

### Option 1: Import Everything

```html
<link rel="stylesheet" href="design-library/inkprint-textures/all-textures.css" />
```

### Option 2: Import Only What You Need

```html
<link rel="stylesheet" href="design-library/inkprint-textures/color-system.css" />
<link rel="stylesheet" href="design-library/inkprint-textures/textures-core.css" />
<link rel="stylesheet" href="design-library/inkprint-textures/textures-intensities.css" />
```

## 🎨 Texture Types & Semantic Meanings

### Core Textures

| Texture    | Semantic Meaning                           | CSS Class              | Example Use                     |
| ---------- | ------------------------------------------ | ---------------------- | ------------------------------- |
| **Bloom**  | Ideation, newness, creative expansion      | `tx tx-bloom tx-weak`  | Empty states, CTAs, inspiration |
| **Grain**  | Execution, steady progress, craftsmanship  | `tx tx-grain tx-weak`  | Task lists, work-in-progress    |
| **Pulse**  | Urgency, sprints, deadlines, momentum      | `tx tx-pulse tx-weak`  | Urgent tasks, deadlines         |
| **Static** | Blockers, noise, overwhelm, risk           | `tx tx-static tx-weak` | Error states, blockers          |
| **Thread** | Relationships, collaboration, dependencies | `tx tx-thread tx-weak` | Dependency views, collaboration |
| **Frame**  | Canon, structure, decisions, officialness  | `tx tx-frame tx-weak`  | Cards, panels, containers       |
| **Strip**  | Header band, separator, printed label      | `tx tx-strip tx-weak`  | Headers, separators             |
| **Button** | Brushed aluminum tactile texture           | `tx-button`            | Buttons, interactive elements   |

### Texture Intensities

```css
tx-weak    /* opacity: 0.03 - Subtle, ambient */
tx-med     /* opacity: 0.06 - Balanced, noticeable */
tx-strong  /* opacity: 0.1 - Bold, prominent */
```

## 📐 Usage Examples

### Basic Texture Application

```html
<!-- Card with frame texture -->
<div class="bg-card border border-border rounded-lg tx tx-frame tx-weak">
	<div class="p-4">
		<h2 class="text-foreground">Card Title</h2>
		<p class="text-muted-foreground">Card content</p>
	</div>
</div>

<!-- Button with grain texture -->
<button class="bg-accent text-accent-foreground px-4 py-2 rounded-lg tx tx-grain tx-weak pressable">
	Click Me
</button>

<!-- Alert with static texture (error state) -->
<div class="bg-destructive text-destructive-foreground p-4 rounded-lg tx tx-static tx-med">
	Error: Something went wrong
</div>
```

### Combining Textures with Weight System

```html
<!-- Ghost weight (ephemeral, uncommitted) -->
<div class="wt-ghost tx tx-bloom tx-weak">Draft idea...</div>

<!-- Paper weight (standard working state) -->
<div class="wt-paper tx tx-grain tx-weak">Active task</div>

<!-- Card weight (important, committed) -->
<div class="wt-card tx tx-frame tx-weak">Committed project</div>

<!-- Plate weight (canonical, immutable) -->
<div class="wt-plate tx tx-grain tx-med">System-critical element</div>
```

### Adding Atmosphere (Marketing/Editorial)

```html
<!-- Landing page hero with atmospheric depth -->
<section class="atmo atmo-med tx tx-bloom tx-weak">
	<div class="p-8">
		<h1 class="text-4xl font-bold">Welcome to BuildOS</h1>
	</div>
</section>
```

### Interactive States

```html
<!-- Pressable button with rim accent -->
<button class="rim-accent pressable tx-button">Primary Action</button>

<!-- Ink frame border effect -->
<div class="ink-frame bg-card p-4 rounded-lg">Framed content</div>
```

## 🌓 Dark Mode Support

All textures automatically adapt to dark mode using CSS custom properties:

```css
.dark .tx::before {
	mix-blend-mode: screen; /* Auto-inverts for dark mode */
}
```

No additional code needed - just add the `.dark` class to your root element.

## 🎯 Design Principles

1. **Semantic over Decorative** - Textures convey meaning, not just aesthetics
2. **Synesthetic Feedback** - Visual patterns trigger tactile and emotional associations
3. **Progressive Enhancement** - Works without textures, better with them
4. **Performance First** - All textures use CSS, no images (except tx-button)

## 📝 Color System Reference

### Light Mode (Paper Studio)

```css
--background: 40 20% 98%; /* Warm paper white */
--foreground: 240 10% 10%; /* Deep ink black */
--card: 40 15% 96%;
--muted: 40 10% 92%;
--border: 40 10% 85%;
--accent: 24 80% 55%; /* Warm orange-amber */
```

### Dark Mode (Ink Room)

```css
--background: 240 10% 6%; /* Near-black */
--foreground: 40 10% 92%; /* Off-white */
--card: 240 10% 10%;
--muted: 240 10% 14%;
--border: 240 10% 18%;
--accent: 24 85% 58%;
```

## 🔧 Advanced Usage

### Custom Texture Opacity

```html
<div class="tx tx-grain" style="--tx-opacity: 0.08">Custom intensity texture</div>
```

### Custom Atmosphere Intensity

```html
<div class="atmo" style="--atmo-opacity: 0.4">Extra strong atmosphere</div>
```

### Layering Textures (Advanced)

```html
<!-- Frame texture + atmosphere + weight -->
<div class="wt-card atmo atmo-weak tx tx-frame tx-weak">Multi-layer effect</div>
```

## 🚫 What NOT to Use

Avoid these deprecated patterns:

- ❌ Hardcoded colors: `text-gray-700`, `bg-slate-100`
- ❌ Old gradient patterns: `bg-gradient-to-r from-blue-50 to-purple-50`
- ❌ Dithering classes: `dither-*`
- ❌ Industrial/scratchpad metaphors

Instead, use Inkprint semantic tokens and texture classes.

## 📱 Responsive Design

Textures work across all screen sizes. Combine with Tailwind responsive prefixes:

```html
<div class="tx tx-frame tx-weak md:tx-med lg:tx-strong">Responsive texture intensity</div>
```

## 🎨 Copy & Paste Components

### Card Component

```html
<div class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak">
	<div class="px-4 py-3 border-b border-border">
		<h3 class="font-semibold text-foreground">Card Title</h3>
	</div>
	<div class="p-4">
		<p class="text-muted-foreground">Card content goes here</p>
	</div>
</div>
```

### Button Component

```html
<button
	class="px-4 py-2 bg-accent text-accent-foreground rounded-lg font-semibold shadow-ink pressable tx tx-grain tx-weak"
>
	Action Button
</button>
```

### Alert Component

```html
<div class="bg-muted border border-border rounded-lg p-4 tx tx-pulse tx-weak">
	<p class="text-sm text-foreground">Alert message</p>
</div>
```

## 📄 License

Part of the BuildOS Inkprint Design System.

---

**Need help?** See `/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md` for comprehensive design system documentation.
