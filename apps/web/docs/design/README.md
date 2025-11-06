# Design System & UI Documentation

BuildOS keeps all product and interface guidance in this directory.

## Key References

- **[design-system.md](design-system.md)** - canonical color, typography, spacing, and component rules
- **[design-principles-checklist.md](design-principles-checklist.md)** - lightweight review checklist before shipping
- **[components/modal-standards.md](components/modal-standards.md)** - modal lifecycle, accessibility, and motion specifications

## Supporting Specs

- **[context-framework-philosophy.md](context-framework-philosophy.md)** and **[universal-project-context-format.md](universal-project-context-format.md)** define our context model
- **[calendar-per-project-architecture.md](calendar-per-project-architecture.md)** & **[calendar-webhook-integration.md](calendar-webhook-integration.md)** capture scheduling flows
- **[project-page-patterns.md](project-page-patterns.md)** outlines authenticated layouts
- Additional docs cover prompts, audits, integrations, and feature deep dives across the `design/` subtree

## Tailwind-First Implementation (Nov 2025 Refresh)

- Use Tailwind utilities as the default styling surface; add CSS only when utilities cannot express the intent
- Page shells should default to `max-w-[1200px]` with compact `px-4 sm:px-6 lg:px-8` gutters for higher information density
- Loading affordances now rely on the shared `animate-pulse-accent` helper; legacy `.pulse`/`.pulse-mobile` classes were removed
- Safe-area padding lives inline or via narrow utilities; avoid blanket padding rules that bloat the bundle
- When custom rules are unavoidable, place them in `@layer components` or `@layer utilities` so Tailwind can tree-shake correctly

## Repository Layout

```
design/
|-- README.md
|-- design-system.md
|-- design-principles-checklist.md
|-- components/
|   |-- modal-standards.md
|-- calendar-per-project-architecture.md
|-- calendar-webhook-integration.md
|-- context-framework-philosophy.md
|-- project-page-patterns.md
|-- prompt-template-refactoring-plan.md
|-- ...
```

## Working Notes

- Design system version: 1.1.0 (cleanup applied November 2025)
- Component implementations live in `/apps/web/src/lib/components`
- Technical component guidance sits under `../technical`
- Accessibility, dark mode, and performance remain non-negotiable requirements

_Last updated: 2025-11-06_
