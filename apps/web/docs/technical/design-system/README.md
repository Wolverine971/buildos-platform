<!-- apps/web/docs/technical/design-system/README.md -->

# BuildOS Design System

> **⚠️ IMPORTANT: Design System Update (December 2025)**
>
> BuildOS has transitioned to the **Inkprint Design System**.
>
> **Primary Reference:** [`/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`](../components/INKPRINT_DESIGN_SYSTEM.md)
>
> The previous "Scratchpad Ops" design system (dithering, industrial aesthetic) has been **deprecated**. All new components should use Inkprint patterns.

---

## Current Design System: Inkprint

The **Inkprint** design system is BuildOS's printmaking-inspired aesthetic with semantic textures, warm accent colors, and high information density.

### Quick Start

When building or updating components:

1. **Read the spec:** [INKPRINT_DESIGN_SYSTEM.md](../components/INKPRINT_DESIGN_SYSTEM.md)
2. **Use semantic tokens** (NOT hardcoded colors)
3. **Apply textures** for synesthetic feedback
4. **Follow the migration checklist** in the spec

### Core Principles

| Principle              | Implementation                                          |
| ---------------------- | ------------------------------------------------------- |
| **Semantic Colors**    | Use `bg-card`, `text-foreground`, `border-border`, etc. |
| **Inkprint Shadows**   | Use `shadow-ink`, `shadow-ink-strong`                   |
| **Texture Feedback**   | Use `tx tx-frame tx-weak`, `tx tx-grain tx-weak`, etc.  |
| **Interactive States** | Use `pressable` class for buttons                       |

### Key Resources

| Document                                                             | Purpose                                     |
| -------------------------------------------------------------------- | ------------------------------------------- |
| [INKPRINT_DESIGN_SYSTEM.md](../components/INKPRINT_DESIGN_SYSTEM.md) | **PRIMARY** - Complete design specification |
| [INKPRINT_MIGRATION.md](../INKPRINT_MIGRATION.md)                    | Migration tracker and progress              |
| [Modal System](../components/modals/README.md)                       | Modal-specific patterns                     |

---

## Deprecated Documentation (Historical Reference)

The following documents describe the **previous** design system and are retained for historical reference only. **Do NOT use these patterns for new development.**

| Document                                                                 | Status            | Notes                              |
| ------------------------------------------------------------------------ | ----------------- | ---------------------------------- |
| [SCRATCHPAD_OPS_SPEC.md](./SCRATCHPAD_OPS_SPEC.md)                       | ❌ **DEPRECATED** | Old industrial-creative aesthetic  |
| [BUILDOS_STYLE_GUIDE.md](../components/BUILDOS_STYLE_GUIDE.md)           | ❌ **DEPRECATED** | Old Apple-inspired gradients       |
| [DITHERING_MIGRATION_PLAN.md](../components/DITHERING_MIGRATION_PLAN.md) | ❌ **DEPRECATED** | Dithering is no longer used        |
| [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)                     | ⚠️ **Outdated**   | May contain useful patterns        |
| [DARK_MODE.md](./DARK_MODE.md)                                           | ⚠️ **Outdated**   | Dark mode now uses semantic tokens |

### What NOT to Use

These patterns from older design systems should **NOT** be used:

- ❌ **Dithering classes:** `dither-*`, `dither-subtle`, `dither-soft`
- ❌ **Industrial design patterns:** `btn-tactile`, `industrial-panel`, `card-industrial`
- ❌ **Scratchpad/workbench metaphors**
- ❌ **Hardcoded colors:** `text-gray-700`, `bg-slate-100`, `border-gray-200`
- ❌ **Old gradient patterns:** `bg-gradient-to-r from-blue-50 to-purple-50`

### What TO Use Instead

| Old Pattern       | New Inkprint Pattern                         |
| ----------------- | -------------------------------------------- |
| `dither-soft`     | `tx tx-grain tx-weak`                        |
| `bg-gray-100`     | `bg-muted`                                   |
| `text-gray-700`   | `text-muted-foreground`                      |
| `border-gray-200` | `border-border`                              |
| `shadow-md`       | `shadow-ink`                                 |
| `btn-tactile`     | `bg-accent text-accent-foreground pressable` |

---

## CSS Files

| File                                | Purpose                                       | Status        |
| ----------------------------------- | --------------------------------------------- | ------------- |
| `src/lib/styles/inkprint.css`       | **PRIMARY** - Inkprint textures and utilities | ✅ Active     |
| `src/app.css`                       | CSS variables and design tokens               | ✅ Active     |
| `tailwind.config.js`                | Tailwind color and utility extensions         | ✅ Active     |
| `src/lib/styles/dithering.css`      | Dithering patterns                            | ❌ Deprecated |
| `src/lib/styles/scratchpad-ops.css` | Old component styles                          | ❌ Deprecated |

---

_The Inkprint design system transforms BuildOS into a focused workspace with printmaking-inspired textures and semantic design patterns._
