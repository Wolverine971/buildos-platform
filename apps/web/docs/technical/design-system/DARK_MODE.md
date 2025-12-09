<!-- apps/web/docs/technical/design-system/DARK_MODE.md -->

# Scratchpad Ops Dark Mode Specification

## Design Philosophy

The dark mode for Scratchpad Ops maintains the industrial-creative aesthetic while providing a comfortable viewing experience in low-light environments. The design preserves the tactile, workspace feel while inverting the visual hierarchy appropriately.

## Core Principles

1. **Maintain Industrial Feel**: Dark mode should feel like a nightshift workspace - purposeful, focused, with subtle illumination
2. **Preserve Texture**: Dithering and grain effects should be visible but inverted for dark surfaces
3. **Contrast Management**: Ensure sufficient contrast while avoiding harsh whites
4. **Accent Consistency**: Accent colors should maintain their identity but adjust saturation for dark backgrounds

## Color System

### Base Colors (Dark Mode)

```css
/* Deep Industrial Darks */
--slate-950: #0f1420 /* Deepest background */ --slate-900: #1e293b /* Primary background */
	--slate-800: #334155 /* Secondary background/panels */ --slate-700: #475569
	/* Borders/dividers */ --slate-600: #64748b /* Muted text */ --slate-500: #94a3b8
	/* Secondary text */ --slate-400: #cbd5e1 /* Primary text */ --slate-300: #e2e8f0 /* Headings */
	--slate-200: #f1f5f9 /* High emphasis text */ --slate-100: #f8fafc /* Maximum contrast text */;
```

### Surface Colors (Dark Mode)

```css
/* Workspace Surfaces */
--surface-scratch-dark: #1a1f2e /* Scratchpad background */ --surface-panel-dark: #1e293b
	/* Clean panels */ --surface-elevated-dark: #2d3548 /* Elevated cards */
	--surface-clarity-dark: #0f1420 /* AI output zones */;
```

### Accent Colors (Dark Mode Adjusted)

```css
/* Purposeful Action Colors - Adjusted for dark mode */
--accent-orange-dark: #d88a3a /* Maintains vibrancy */ --accent-blue-dark: #5b9fe3
	/* Slightly brighter for visibility */ --accent-olive-dark: #8fa678
	/* Softer for dark backgrounds */;
```

## Component Specifications

### 1. Input Fields & Textareas (Dark Mode)

**Background**: `--surface-scratch-dark` (#1a1f2e)
**Dithering**: White dots at 15% opacity with soft-light blend
**Border**: 2px solid rgba(148, 163, 184, 0.3) (slate-500 at 30%)
**Text**: `--slate-200` (#f1f5f9)
**Placeholder**: `--slate-500` (#94a3b8)

```css
/* Dark mode scratchpad inputs */
.dark .input-scratchpad {
	background-color: #1a1f2e;
	border: 2px solid rgba(148, 163, 184, 0.3);
	color: #f1f5f9;
}
```

### 2. Buttons (Dark Mode)

**Primary**:

- Background: `--accent-orange-dark` (#D88A3A)
- Border: 2px solid #1e293b
- Text: White
- Shadow: 0 2px 0 rgba(0,0,0,0.5)

**Secondary**:

- Background: `--slate-800` (#334155)
- Border: 2px solid `--slate-600` (#64748b)
- Text: `--slate-200` (#f1f5f9)
- Shadow: 0 2px 0 rgba(0,0,0,0.3)

### 3. Cards/Panels (Dark Mode)

**Background**: `--surface-panel-dark` (#1e293b)
**Border**: 2px solid rgba(100, 116, 139, 0.3)
**Shadow**: 0 1px 3px rgba(0,0,0,0.2)

### 4. Navigation (Dark Mode)

**Background**: `--slate-900` (#1e293b)
**Active Item**:

- Background: rgba(216, 138, 58, 0.2)
- Border: 2px solid rgba(216, 138, 58, 0.3)
- Text: `--accent-orange-dark`

### 5. AI Output Areas (Dark Mode)

**Background**: `--surface-clarity-dark` (#0f1420)
**Border**: 1px solid `--slate-700` (#475569)
**Text**: `--slate-100` (#f8fafc)
**No dithering** - maintains clarity

## Dithering Adjustments for Dark Mode

### Pattern Inversions

```css
/* Light mode uses black dots */
.dither-soft::before {
	background-image: url("data:image/svg+xml,%3Csvg...%3Ccircle...fill='rgb(0,0,0)'...%3C/svg%3E");
	mix-blend-mode: overlay;
	opacity: 0.1;
}

/* Dark mode uses white dots */
.dark .dither-soft::before {
	background-image: url("data:image/svg+xml,%3Csvg...%3Ccircle...fill='rgb(255,255,255)'...%3C/svg%3E");
	mix-blend-mode: soft-light;
	opacity: 0.15;
}
```

### Opacity Adjustments

- **Light mode**: 10-12% opacity with overlay blend
- **Dark mode**: 15-18% opacity with soft-light blend

## Implementation Guidelines

### Text Hierarchy (Dark Mode)

1. **Headings**: `--slate-100` (#f8fafc) - Maximum contrast
2. **Body Text**: `--slate-200` (#f1f5f9) - Comfortable reading
3. **Secondary Text**: `--slate-400` (#cbd5e1) - Supporting information
4. **Muted Text**: `--slate-500` (#94a3b8) - De-emphasized content
5. **Disabled**: `--slate-600` (#64748b) - Inactive elements

### Border System (Dark Mode)

- **Primary Borders**: 2px solid rgba(100, 116, 139, 0.3) - slate-600 at 30%
- **Secondary Borders**: 2px solid rgba(148, 163, 184, 0.2) - slate-500 at 20%
- **Active Borders**: 2px solid accent color at full opacity

### Shadow System (Dark Mode)

```css
/* Darker, deeper shadows for dark mode */
--shadow-subtle-dark: 0 1px 3px rgba(0, 0, 0, 0.2);
--shadow-pressable-dark: 0 2px 0 rgba(0, 0, 0, 0.5);
--shadow-elevated-dark: 0 4px 6px rgba(0, 0, 0, 0.3);
```

## Visual Examples

### Dark Mode Palette Overview

```
Background Layers:
┌─────────────────────────────────────┐
│ Deepest:    #0f1420 (slate-950)    │ <- Modal overlays, dropdowns
│ Primary:    #1e293b (slate-900)    │ <- Main background
│ Secondary:  #334155 (slate-800)    │ <- Cards, panels
│ Elevated:   #2d3548 (custom)       │ <- Hover states, elevated cards
└─────────────────────────────────────┘

Text Hierarchy:
┌─────────────────────────────────────┐
│ Maximum:    #f8fafc (slate-100)    │ <- Headings
│ Primary:    #f1f5f9 (slate-200)    │ <- Body text
│ Secondary:  #cbd5e1 (slate-400)    │ <- Supporting text
│ Muted:      #94a3b8 (slate-500)    │ <- Placeholder, disabled
└─────────────────────────────────────┘

Accent Colors (Dark Adjusted):
┌─────────────────────────────────────┐
│ Orange:     #D88A3A (maintained)   │
│ Blue:       #5B9FE3 (brightened)   │
│ Olive:      #8FA678 (softened)     │
└─────────────────────────────────────┘
```

## Testing Checklist

- [ ] All text has minimum WCAG AA contrast (4.5:1)
- [ ] Interactive elements have 3:1 contrast ratio
- [ ] Dithering patterns are visible but not distracting
- [ ] Accent colors maintain their identity
- [ ] Shadows provide appropriate depth
- [ ] Focus states are clearly visible
- [ ] Disabled states are distinguishable
- [ ] No pure white (#FFFFFF) except for maximum emphasis
- [ ] No pure black (#000000) except for deepest shadows

## CSS Variables Setup

```css
:root {
	/* Light mode variables */
	--surface-scratch: #f4f4f0;
	--surface-panel: #ececec;
	--surface-elevated: #f8f8f8;
}

.dark {
	/* Dark mode overrides */
	--surface-scratch: #1a1f2e;
	--surface-panel: #1e293b;
	--surface-elevated: #2d3548;
	--surface-clarity: #0f1420;

	/* Adjusted accent colors */
	--accent-blue: #5b9fe3;
	--accent-olive: #8fa678;
}
```
