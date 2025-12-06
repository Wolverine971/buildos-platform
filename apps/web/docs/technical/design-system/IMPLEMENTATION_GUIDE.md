# Scratchpad Ops Design System - Implementation Guide

## Overview

The **Scratchpad Ops** design system has been fully integrated into the BuildOS platform. This industrial-creative aesthetic transforms the UI from corporate sterility into a tactile workspace that reflects BuildOS's core purpose: turning messy thoughts into structured action.

## Core Philosophy

The design follows three metaphors:

1. **Scratchpad** (chaos) - Where raw thoughts live
2. **Workbench** (order) - Where structure emerges
3. **Tools** (action) - Where transformation happens

## Files Updated

### CSS Architecture

- **`apps/web/src/app.css`** - Main stylesheet with design system imports and CSS variables
- **`apps/web/src/lib/styles/scratchpad-ops.css`** - Core design system implementation
- **`apps/web/src/routes/dashboard.css`** - Dashboard-specific styles using new colors
- **`apps/web/tailwind.config.js`** - Tailwind configuration with design tokens

### Design Tokens Available

#### Colors (CSS Variables & Tailwind)

```css
/* CSS Variables */
--slate-900: #1a1f2b /* Deep slate */ --slate-700: #2d3242 /* Steel gray */ --slate-500: #3e4459
	/* Mid slate */ --accent-orange: #d88a3a /* Utility orange */ --accent-blue: #3a6ea5
	/* Signal blue */ --accent-olive: #687452 /* Field olive */ --surface-scratch: #f4f4f0
	/* Scratchpad surface */ --surface-panel: #ececec /* Panel background */
	--surface-elevated: #f8f8f8 /* Elevated cards */ --surface-clarity: #ffffff
	/* AI output areas */;
```

#### Tailwind Classes

```jsx
// Colors
(bg - slate - 900, text - slate - 700, border - slate - 500);
(bg - accent - orange, text - accent - blue, border - accent - olive);
(bg - surface - scratch, bg - surface - panel);

// Shadows
shadow - subtle; // 0 1px 3px rgba(0,0,0,0.08)
shadow - pressable; // 0 2px 0 rgba(0,0,0,0.3)
shadow - elevated; // 0 4px 6px rgba(0,0,0,0.1)

// Border radius
rounded - sm; // 3px
rounded; // 4px (default)
rounded - md; // 6px

// Fonts
font - ui; // Inter, system fonts
font - notes; // IBM Plex Serif, serif fonts
```

## Component Patterns

### 1. Input Fields & Textareas (Scratchpad Areas)

```jsx
// Using CSS classes
<textarea class="input-scratchpad dither-soft" />

// Using Tailwind utilities
<input class="bg-surface-scratch border-2 border-slate-900/10
              rounded p-4 focus:border-accent-orange
              focus:shadow-[0_0_0_3px_rgba(216,138,58,0.1)]" />
```

### 2. Buttons (Tactile Tools)

```jsx
// Primary action button
<button class="btn-tactile">
  Process Brain Dump
</button>

// Secondary button
<button class="btn-secondary">
  Cancel
</button>

// Using Tailwind
<button class="bg-slate-900 border-2 border-slate-700
               text-white font-semibold px-4 py-2 rounded
               shadow-pressable hover:translate-y-[-1px]
               active:translate-y-[2px] active:shadow-none
               transition-all duration-100">
  Action
</button>
```

### 3. Cards & Panels (Work Containers)

```jsx
// Industrial panel
<div class="industrial-panel">
  <h3 class="text-slate-900 dark:text-white font-semibold">Panel Title</h3>
  <p class="text-slate-700 dark:text-slate-400">Content</p>
</div>

// Card with dithering
<div class="card-industrial dither-surface">
  <!-- Card content -->
</div>
```

### 4. AI Output Areas (Clarity Zones)

```jsx
// Clean, high-contrast area for AI-generated content
<div class="clarity-zone">
  <div class="prose prose-slate dark:prose-invert">
    <!-- AI output -->
  </div>
</div>
```

### 5. Status Badges

```jsx
// Draft status
<span class="badge-draft">Draft</span>

// Active status
<span class="badge-active">In Progress</span>

// Complete status
<span class="badge-complete">Done</span>
```

## Dithering System

The dithering system adds texture to surfaces. Use sparingly for best effect:

```jsx
// Intensity levels
dither - subtle; // 8-12% opacity
dither - soft; // 10-15% opacity
dither; // 12-18% opacity (default)
dither - strong; // 30-40% opacity
dither - intense; // 35-40% opacity

// Context-specific
dither - gradient; // For gradient backgrounds
dither - surface; // For cards/panels
dither - accent; // For emphasis areas

// Pattern sizes
dither - fine; // 2x2 matrix
dither - detailed; // 8x8 matrix
```

## Dark Mode Support

All components automatically support dark mode through CSS variables and Tailwind's `dark:` prefix:

```jsx
// Text that adapts to dark mode
<h1 class="text-slate-900 dark:text-white">Title</h1>

// Background that changes in dark mode
<div class="bg-surface-panel dark:bg-slate-800">
  <!-- Content -->
</div>
```

## Migration Guide

### Updating Existing Components

1. **Replace generic colors with design system colors:**

    ```jsx
    // Before
    <div class="bg-gray-100 text-gray-900">

    // After
    <div class="bg-surface-panel text-slate-900 dark:text-white">
    ```

2. **Add tactile properties to buttons:**

    ```jsx
    // Before
    <button class="bg-blue-500 text-white px-4 py-2 rounded">

    // After
    <button class="btn-tactile">
    ```

3. **Apply dithering to input areas:**

    ```jsx
    // Before
    <textarea class="border rounded p-4">

    // After
    <textarea class="input-scratchpad dither-soft">
    ```

## Best Practices

### Do's

- ✅ Use dithering on input surfaces to create the "scratchpad" feel
- ✅ Apply tactile shadows to buttons for depth
- ✅ Keep AI output areas clean and distraction-free
- ✅ Use accent colors sparingly for emphasis
- ✅ Maintain consistent 4px border radius

### Don'ts

- ❌ Don't overuse dithering - it should enhance, not dominate
- ❌ Avoid mixing old gradient styles with new industrial aesthetic
- ❌ Don't use bright, saturated colors - stick to muted palette
- ❌ Avoid rounded corners larger than 8px

## Performance Considerations

1. **Dithering uses CSS pseudo-elements** - No JavaScript overhead
2. **Shadows are GPU-accelerated** - Use `shadow-*` utilities
3. **Transitions are optimized** - Only animate transform and opacity
4. **Dark mode uses CSS variables** - No re-rendering needed

## Component Examples

### Brain Dump Input

```jsx
<div class="industrial-panel">
	<h2 class="text-xl font-semibold text-slate-900 dark:text-white mb-4">Brain Dump</h2>
	<textarea
		class="input-scratchpad dither-soft w-full h-64 resize-none"
		placeholder="Start typing your thoughts..."
	/>
	<div class="mt-4 flex gap-3">
		<button class="btn-tactile flex-1">Process</button>
		<button class="btn-secondary">Clear</button>
	</div>
</div>
```

### Task Card

```jsx
<div class="card-industrial hover:shadow-elevated transition-shadow">
	<div class="p-4">
		<div class="flex items-start justify-between mb-2">
			<h3 class="font-semibold text-slate-900 dark:text-white">Task Title</h3>
			<span class="badge-active">Active</span>
		</div>
		<p class="text-sm text-slate-700 dark:text-slate-400">Task description goes here...</p>
	</div>
</div>
```

## Troubleshooting

### Issue: Dithering not visible

- Check that the element has `position: relative`
- Ensure no conflicting `overflow: hidden` on parent
- Verify the dithering class is applied correctly

### Issue: Dark mode colors not switching

- Ensure `class="dark"` is on the `<html>` element
- Check that CSS variables are defined in both `:root` and `.dark`
- Use `dark:` prefix for Tailwind utilities

### Issue: Buttons not pressing down

- Add `tactile-press` class or implement active state
- Ensure no conflicting transform styles
- Check transition duration (should be ~100ms)

## Future Enhancements

- [ ] Animated grain textures for living surfaces
- [ ] More granular dithering patterns
- [ ] Additional accent color variants
- [ ] Custom font integration (Inter, IBM Plex)
- [ ] Component animation presets

## Resources

- Design specification: `/apps/web/new-design.md`
- Core CSS: `/apps/web/src/lib/styles/scratchpad-ops.css`
- Tailwind config: `/apps/web/tailwind.config.js`

---

_The Scratchpad Ops design system transforms BuildOS from a tool into a workspace - where messy thoughts become structured action._
