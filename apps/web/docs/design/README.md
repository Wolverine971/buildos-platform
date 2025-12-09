<!-- apps/web/docs/design/README.md -->

# Design System & UI Documentation

> **⚠️ IMPORTANT: Design System Update (December 2025)**
>
> BuildOS has transitioned to the **Inkprint Design System**.
>
> **Primary Reference:** [`/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`](/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md)
>
> The documentation in this folder predates the Inkprint transition and should be used with caution. For UI implementation, **always refer to the Inkprint spec first**.

BuildOS keeps all product and interface guidance in this directory.

## Primary Design Reference

| Document                                                                                   | Purpose                                              | Status    |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | --------- |
| [INKPRINT_DESIGN_SYSTEM.md](/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md) | **PRIMARY** - Complete Inkprint design specification | ✅ Active |
| [INKPRINT_MIGRATION.md](/apps/web/docs/technical/INKPRINT_MIGRATION.md)                    | Migration tracker and progress                       | ✅ Active |

## Supporting Documentation

These documents remain useful for understanding BuildOS architecture and patterns:

- **[context-framework-philosophy.md](context-framework-philosophy.md)** and **[universal-project-context-format.md](universal-project-context-format.md)** define our context model
- **[calendar-per-project-architecture.md](calendar-per-project-architecture.md)** & **[calendar-webhook-integration.md](calendar-webhook-integration.md)** capture scheduling flows
- **[project-page-patterns.md](project-page-patterns.md)** outlines authenticated layouts
- **[design-principles-checklist.md](design-principles-checklist.md)** - lightweight review checklist before shipping

## Legacy Documentation (Historical Reference)

These documents describe the **previous** design system and are retained for historical reference:

| Document                                                       | Status          | Notes                        |
| -------------------------------------------------------------- | --------------- | ---------------------------- |
| [design-system.md](design-system.md)                           | ⚠️ **Outdated** | Old Apple-inspired patterns  |
| [components/modal-standards.md](components/modal-standards.md) | ⚠️ **Outdated** | See Modal docs in technical/ |

## Inkprint Design System Quick Reference

When building or updating components:

1. **Use semantic color tokens:** `bg-card`, `text-foreground`, `border-border`, `bg-muted`
2. **Use Inkprint shadows:** `shadow-ink`, `shadow-ink-strong`
3. **Apply texture classes:** `tx tx-frame tx-weak`, `tx tx-grain tx-weak`
4. **Add interactivity:** `pressable` class for buttons

**Do NOT use:**

- ❌ Hardcoded colors (`text-gray-700`, `bg-slate-100`)
- ❌ Old gradient patterns (`from-blue-50 to-purple-50`)
- ❌ Dithering classes (`dither-*`)
- ❌ Industrial/scratchpad patterns

## Repository Layout

```
design/
|-- README.md
|-- design-system.md (outdated - see Inkprint)
|-- design-principles-checklist.md
|-- components/
|   |-- modal-standards.md (outdated - see technical/)
|-- calendar-per-project-architecture.md
|-- calendar-webhook-integration.md
|-- context-framework-philosophy.md
|-- project-page-patterns.md
|-- ...
```

## Working Notes

- Design system version: 2.0.0 (Inkprint - December 2025)
- Component implementations live in `/apps/web/src/lib/components`
- Technical component guidance sits under `../technical/components/`
- Accessibility, dark mode, and performance remain non-negotiable requirements

_Last updated: 2025-12-08_
