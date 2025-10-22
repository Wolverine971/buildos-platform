# Design System & UI Documentation

This directory contains the design system, UI/UX specifications, and component standards for the BuildOS web application.

## 📚 Key Documents

### Design System & Principles

- **[design-system.md](design-system.md)** - ⭐ Comprehensive design system v1.1.0
  - Color system with semantic mappings
  - Typography and spacing standards
  - Component patterns and guidelines
  - Animations and transitions
  - Accessibility requirements

- **[design-principles-checklist.md](design-principles-checklist.md)** - Design principles and quality checklist

### Component Standards

- **[components/modal-standards.md](components/modal-standards.md)** - Modal component standards (303 lines)
  - Dialog patterns
  - Modal lifecycle
  - Accessibility considerations

### Architecture & Frameworks

- **[context-framework-philosophy.md](context-framework-philosophy.md)** - Context framework design philosophy
- **[universal-project-context-format.md](universal-project-context-format.md)** - Project context data format

### Feature-Specific Design

- **[calendar-per-project-architecture.md](calendar-per-project-architecture.md)** - Per-project calendar design
- **[calendar-webhook-integration.md](calendar-webhook-integration.md)** - Calendar webhook integration spec
- **[email-flow-spec.md](email-flow-spec.md)** - Email flow and template design
- **[brain-dump-question-fix.md](brain-dump-question-fix.md)** - Brain dump question UI fix
- **[project-page-patterns.md](project-page-patterns.md)** - Project page component patterns
- **[prompt-template-refactoring-plan.md](prompt-template-refactoring-plan.md)** - Prompt template architecture

## 📂 Structure

```
/design/
├── README.md (this file)
├── design-system.md
├── design-principles-checklist.md
├── context-framework-philosophy.md
├── universal-project-context-format.md
├── calendar-per-project-architecture.md
├── calendar-webhook-integration.md
├── email-flow-spec.md
├── brain-dump-question-fix.md
├── project-page-patterns.md
├── prompt-template-refactoring-plan.md
└── /components/
    └── modal-standards.md
```

## 🎯 Quick Navigation

### For Designers
1. Start with [design-system.md](design-system.md) for complete system overview
2. Review [design-principles-checklist.md](design-principles-checklist.md)
3. Check component specs for your specific component

### For Developers
1. Reference [design-system.md](design-system.md) for implementation details
2. Use [components/modal-standards.md](components/modal-standards.md) for modal implementations
3. Check feature-specific design docs for UI requirements

### For Feature Implementation
1. Read feature-specific design doc (e.g., email-flow-spec.md)
2. Check component standards
3. Verify accessibility in design-principles-checklist.md

## 🔗 Related Documentation

- **Component Implementation**: `/apps/web/src/lib/components/`
- **Technical Components Guide**: `/apps/web/docs/technical/components/`
- **Feature Specs**: `/apps/web/docs/features/`

## 📝 Notes

- Design system is version 1.1.0 (last updated Oct 2025)
- All components should follow modal standards as reference
- Accessibility is mandatory for all designs
- See technical/components/ for implementation patterns

---

**Last Updated**: October 20, 2025
