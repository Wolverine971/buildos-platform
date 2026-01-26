# Quick Start Guide

## Installation

### 1. Copy the folder

Copy the `inkprint-textures/` folder into your project's static assets directory.

### 2. Import CSS

Choose one of these options:

**Option A: Import everything (easiest)**

```html
<link rel="stylesheet" href="/design-library/inkprint-textures/all-textures.css" />
```

**Option B: Import only what you need**

```html
<link rel="stylesheet" href="/design-library/inkprint-textures/color-system.css" />
<link rel="stylesheet" href="/design-library/inkprint-textures/textures-core.css" />
<link rel="stylesheet" href="/design-library/inkprint-textures/textures-intensities.css" />
<link rel="stylesheet" href="/design-library/inkprint-textures/shadows.css" />
```

## Basic Usage

### 1. Add texture to a card

```html
<div class="bg-card border border-border rounded-lg p-6 tx tx-frame tx-weak">
	<h3>Card Title</h3>
	<p class="text-muted-foreground">Card content</p>
</div>
```

### 2. Create a button with texture

```html
<button
	class="px-4 py-2 bg-accent text-accent-foreground rounded-lg shadow-ink pressable tx tx-grain tx-weak"
>
	Click Me
</button>
```

### 3. Add semantic weight

```html
<!-- Draft/ephemeral -->
<div class="wt-ghost p-4">Draft content</div>

<!-- Standard -->
<div class="wt-paper p-4">Working state</div>

<!-- Important -->
<div class="wt-card p-4">Committed content</div>

<!-- Critical -->
<div class="wt-plate p-4">System-critical</div>
```

## Cheat Sheet

| What you want                | CSS Classes                                                      |
| ---------------------------- | ---------------------------------------------------------------- |
| **Card with subtle texture** | `bg-card border border-border tx tx-frame tx-weak`               |
| **Button with grain**        | `bg-accent text-accent-foreground pressable tx tx-grain tx-weak` |
| **Alert with urgency**       | `bg-muted p-4 tx tx-pulse tx-med`                                |
| **Error state**              | `bg-destructive text-destructive-foreground tx tx-static tx-med` |
| **Hero section with depth**  | `atmo atmo-med tx tx-bloom tx-weak`                              |
| **Standard shadow**          | `shadow-ink`                                                     |
| **Modal shadow**             | `shadow-ink-strong`                                              |
| **Carved border**            | `ink-frame`                                                      |

## Texture Meanings

| Texture     | When to use                                |
| ----------- | ------------------------------------------ |
| `tx-bloom`  | Empty states, CTAs, inspiration, newness   |
| `tx-grain`  | Work in progress, tasks, execution         |
| `tx-pulse`  | Urgent items, deadlines, momentum          |
| `tx-static` | Errors, blockers, warnings                 |
| `tx-thread` | Relationships, dependencies, collaboration |
| `tx-frame`  | Cards, containers, structure               |
| `tx-strip`  | Headers, separators, labels                |
| `tx-button` | Buttons (tactile texture)                  |

## Dark Mode

Add the `.dark` class to your root element (html or body):

```html
<html class="dark">
	<!-- Everything auto-adapts -->
</html>
```

Toggle dark mode with JavaScript:

```javascript
document.documentElement.classList.toggle('dark');
```

## View the Demo

Open `demo.html` in your browser to see all textures, weights, shadows, and interactive states in action.

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Browse individual CSS files for specific features
- Experiment with combining textures, weights, and atmosphere
