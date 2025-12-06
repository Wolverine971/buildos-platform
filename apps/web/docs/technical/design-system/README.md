# Scratchpad Ops Design System

The **Scratchpad Ops** design system is BuildOS's industrial-creative workspace aesthetic that transforms the UI from corporate sterility into a tactile workspace reflecting the app's core purpose: **turning messy thoughts into structured action**.

## Documentation Index

| Document                                               | Purpose                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| [SCRATCHPAD_OPS_SPEC.md](./SCRATCHPAD_OPS_SPEC.md)     | Complete design philosophy, visual motifs, and component patterns |
| [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)   | Developer guide for using design system classes and tokens        |
| [IMPLEMENTATION_REPORT.md](./IMPLEMENTATION_REPORT.md) | Full status of component transformations                          |
| [STYLE_UPDATE.md](./STYLE_UPDATE.md)                   | Comprehensive style changes and color replacements                |
| [DARK_MODE.md](./DARK_MODE.md)                         | Dark mode specific implementation details                         |

## Quick Reference

### Core Design Philosophy

The design follows three metaphors:

1. **Scratchpad** (chaos) - Where raw thoughts live (dithered input surfaces)
2. **Workbench** (order) - Where structure emerges (clean cards/panels)
3. **Tools** (action) - Where transformation happens (tactile buttons)

### Color Palette

```css
/* Accent Colors (No Purple!) */
--accent-orange: #d88a3a /* Primary actions */ --accent-blue: #3a6ea5
	/* Secondary/Info (light mode) */ --accent-olive: #687452 /* Success states */
	/* Surface Colors */ --surface-scratch: #f4f4f0 /* Scratchpad texture */
	--surface-panel: #ececec /* Clean panels */ --surface-elevated: #f8f8f8 /* Elevated cards */
	--surface-clarity: #ffffff /* AI output areas */;
```

### Dithering Classes

Apply texture to input surfaces:

- `dither-subtle` - Ultra-fine texture (12-18% opacity)
- `dither-soft` - Gentle texture (18-25% opacity) **[Most common]**
- `dither` - Default balanced texture (20-28% opacity)
- `dither-surface` - For card backgrounds (28-40% opacity)
- `dither-gradient` - For gradient backgrounds (22-28% opacity)
- `dither-accent` - For emphasis areas (22-30% opacity)

### Button Patterns

```html
<!-- Primary tactile button -->
<button class="btn-tactile">Process</button>

<!-- Secondary button -->
<button class="btn-secondary">Cancel</button>
```

### Card/Panel Patterns

```html
<!-- Industrial panel -->
<div class="industrial-panel">Content</div>

<!-- Card with optional dithering -->
<div class="card-industrial dither-surface">Content</div>

<!-- AI output (no dithering) -->
<div class="clarity-zone">AI Content</div>
```

### Input Surfaces

```html
<!-- Scratchpad textarea -->
<textarea class="input-scratchpad dither-soft">
```

## CSS Files

| File                                | Purpose                               |
| ----------------------------------- | ------------------------------------- |
| `src/lib/styles/dithering.css`      | Dithering patterns and textures       |
| `src/lib/styles/scratchpad-ops.css` | Component styles and utilities        |
| `src/app.css`                       | CSS variables and design tokens       |
| `tailwind.config.js`                | Tailwind color and utility extensions |

## Related Documentation

- [BUILDOS_STYLE_GUIDE.md](../components/BUILDOS_STYLE_GUIDE.md) - General style guide
- [DITHERING_MIGRATION_PLAN.md](../components/DITHERING_MIGRATION_PLAN.md) - Dithering migration details
- [Modal System](../components/modals/README.md) - Modal patterns

---

_The Scratchpad Ops design system transforms BuildOS from a tool into a workspace - where messy thoughts become structured action._
