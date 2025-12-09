<!-- apps/web/docs/technical/components/UI_DOCUMENTATION_INDEX.md -->

# BuildOS UI Documentation Index

## Complete Documentation Map

This index provides navigation to all BuildOS UI component documentation and resources.

---

## Quick Start (Read First!)

**New to BuildOS UI development?**

1. Start here: **[UI_QUICK_REFERENCE.md](./UI_QUICK_REFERENCE.md)** (10 min read)
    - Copy-paste ready component recipes
    - Common patterns with code examples
    - Essential imports

2. Then read: **[UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md)** (30 min read)
    - Comprehensive pattern documentation
    - Design philosophy and principles
    - Complete implementation guide

3. Reference: **[BUILDOS_STYLE_GUIDE.md](./BUILDOS_STYLE_GUIDE.md)** (official master guide)
    - Design system standards
    - Color palette and typography
    - Accessibility requirements

---

## Document Guide

### UI_QUICK_REFERENCE.md

**Purpose**: Quick copy-paste reference for common components
**Best for**: Getting started quickly, finding code examples
**Read time**: 10-15 minutes

**Contents**:

- Essential imports
- Simple card examples
- Form modal examples
- Button variants with code
- Badges and alerts
- Responsive grid patterns
- Complete CRUD implementation example
- Dark mode patterns
- Accessibility checklist
- Common mistakes to avoid

**When to use**: You know what you want to build, just need the exact code

### UI_PATTERNS_AND_CONVENTIONS.md

**Purpose**: Comprehensive guide to all UI patterns and conventions
**Best for**: Understanding the system, implementing new components
**Read time**: 30-45 minutes

**Contents**:

- Style guide philosophy and location
- Card component system (detailed)
- Button component and variants (detailed)
- Modal system architecture
- FormModal component (CRUD recommended pattern)
- Form inputs (TextInput, Textarea, Select, FormField)
- Status components (Badge, Alert)
- Color system explanation
- Spacing and layout system
- Dark mode implementation guide
- Responsive design patterns
- Animations and transitions
- WCAG AA accessibility requirements
- Typography scale
- Complete CRUD implementation pattern
- Implementation checklist

**When to use**: You're building a new component or feature and want to follow conventions

### BUILDOS_STYLE_GUIDE.md

**Purpose**: Official design system specification
**Best for**: Design decisions, color usage, accessibility standards
**Read time**: 45-60 minutes (reference document)

**Contents**:

- Design philosophy and principles
- Color system (brand colors, status colors, text colors)
- Typography (font stack, type scale, usage guidelines)
- Spacing system (8px grid, component standards)
- Layout system (container widths, breakpoints, grid system)
- Component specifications (buttons, cards, modals, forms)
- Visual effects (borders, shadows, animations)
- Dark mode rules
- Responsive design principles
- Accessibility requirements (WCAG AA checklist)
- Component library usage guide
- Refactoring guide with before/after examples
- Migration guide for updating existing components

**When to use**: You need to verify design decisions or follow official standards

### DESIGN_SYSTEM_GUIDE.md

**Purpose**: Secondary design reference
**Best for**: Additional design context
**Read time**: 20-30 minutes

---

## Component Reference Table

| Component  | File                                       | Quick ref | Full ref | Example |
| ---------- | ------------------------------------------ | --------- | -------- | ------- |
| Card       | `/src/lib/components/ui/Card.svelte`       | QR        | PC       | Yes     |
| CardHeader | `/src/lib/components/ui/CardHeader.svelte` | QR        | PC       | Yes     |
| CardBody   | `/src/lib/components/ui/CardBody.svelte`   | QR        | PC       | Yes     |
| CardFooter | `/src/lib/components/ui/CardFooter.svelte` | QR        | PC       | Yes     |
| Button     | `/src/lib/components/ui/Button.svelte`     | QR        | PC       | Yes     |
| Modal      | `/src/lib/components/ui/Modal.svelte`      | QR        | PC       | Yes     |
| FormModal  | `/src/lib/components/ui/FormModal.svelte`  | QR        | PC       | Yes     |
| TextInput  | `/src/lib/components/ui/TextInput.svelte`  | QR        | PC       | Yes     |
| Textarea   | `/src/lib/components/ui/Textarea.svelte`   | QR        | PC       | Yes     |
| Select     | `/src/lib/components/ui/Select.svelte`     | QR        | PC       | Yes     |
| FormField  | `/src/lib/components/ui/FormField.svelte`  | QR        | PC       | Yes     |
| Badge      | `/src/lib/components/ui/Badge.svelte`      | QR        | PC       | Yes     |
| Alert      | `/src/lib/components/ui/Alert.svelte`      | QR        | PC       | Yes     |

**Legend**:

- QR = UI_QUICK_REFERENCE.md
- PC = UI_PATTERNS_AND_CONVENTIONS.md
- Yes = Code example included

---

## By Use Case

### I want to...

**...create a list of items with edit/delete buttons**

1. Read: [UI_QUICK_REFERENCE.md - Interactive Card Grid](./UI_QUICK_REFERENCE.md#interactive-card-grid)
2. Reference: [UI_PATTERNS_AND_CONVENTIONS.md - CRUD Pattern](./UI_PATTERNS_AND_CONVENTIONS.md#16-crud-implementation-pattern-complete-example)
3. Check: Implementation checklist in PC

**...create a form modal for create/edit**

1. Read: [UI_QUICK_REFERENCE.md - Form Modal](./UI_QUICK_REFERENCE.md#form-modal-crud)
2. Reference: [UI_PATTERNS_AND_CONVENTIONS.md - FormModal Component](./UI_PATTERNS_AND_CONVENTIONS.md#5-formmodal-component-recommended-for-crud)
3. Example: [UI_QUICK_REFERENCE.md - CRUD List Example](./UI_QUICK_REFERENCE.md#crud-list-with-edit-modal)

**...make something responsive**

1. Read: [UI_QUICK_REFERENCE.md - Responsive Grid](./UI_QUICK_REFERENCE.md#responsive-grid)
2. Read: [UI_QUICK_REFERENCE.md - Mobile-First](./UI_QUICK_REFERENCE.md#mobile-first-responsive)
3. Reference: [UI_PATTERNS_AND_CONVENTIONS.md - Responsive Design](./UI_PATTERNS_AND_CONVENTIONS.md#12-responsive-design-patterns)

**...add dark mode support**

1. Quick patterns: [UI_QUICK_REFERENCE.md - Dark Mode](./UI_QUICK_REFERENCE.md#dark-mode)
2. Complete guide: [UI_PATTERNS_AND_CONVENTIONS.md - Dark Mode Implementation](./UI_PATTERNS_AND_CONVENTIONS.md#11-dark-mode-implementation)
3. Check checklist: [UI_PATTERNS_AND_CONVENTIONS.md - Implementation Checklist](./UI_PATTERNS_AND_CONVENTIONS.md#17-summary-implementation-checklist-for-new-components)

**...ensure accessibility**

1. Quick checklist: [UI_QUICK_REFERENCE.md - Accessibility Checklist](./UI_QUICK_REFERENCE.md#accessibility-checklist)
2. Full requirements: [UI_PATTERNS_AND_CONVENTIONS.md - WCAG AA Requirements](./UI_PATTERNS_AND_CONVENTIONS.md#14-accessibility-requirements-wcag-aa)
3. Check standards: [BUILDOS_STYLE_GUIDE.md - WCAG AA Compliance](./BUILDOS_STYLE_GUIDE.md#wcag-aa-compliance-checklist)

**...implement button variants**

1. Examples: [UI_QUICK_REFERENCE.md - Button Variants](./UI_QUICK_REFERENCE.md#button-variants)
2. Complete reference: [UI_PATTERNS_AND_CONVENTIONS.md - Button Component](./UI_PATTERNS_AND_CONVENTIONS.md#3-button-component-and-variants)

**...create status badges**

1. Example: [UI_QUICK_REFERENCE.md - Status Badges](./UI_QUICK_REFERENCE.md#status-badges)
2. Reference: [UI_PATTERNS_AND_CONVENTIONS.md - Badge Component](./UI_PATTERNS_AND_CONVENTIONS.md#badge-component)

**...avoid common mistakes**

1. Read: [UI_QUICK_REFERENCE.md - Common Mistakes](./UI_QUICK_REFERENCE.md#common-mistakes-to-avoid)

---

## Key Concepts Quick Links

### Design System

- **Philosophy**: [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#1-style-guide-location-and-philosophy)
- **Color System**: [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#9-color-system-and-theming)
- **Typography**: [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#15-typography-scale)
- **Spacing**: [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#10-spacing-and-layout-system)

### Components

- **Card System**: [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#2-card-component-system-primary-pattern)
- **Buttons**: [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#3-button-component-and-variants)
- **Modals**: [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#4-modal-system-for-createedit-operations)
- **Forms**: [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#5-formmodal-component-recommended-for-crud)

### Patterns

- **Dark Mode**: [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#11-dark-mode-implementation)
- **Responsive**: [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#12-responsive-design-patterns)
- **Animations**: [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#13-animations-and-transitions)
- **CRUD Implementation**: [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#16-crud-implementation-pattern-complete-example)

### Accessibility

- **WCAG AA Requirements**: [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#14-accessibility-requirements-wcag-aa)
- **Checklist**: [UI_QUICK_REFERENCE.md](./UI_QUICK_REFERENCE.md#accessibility-checklist)
- **Standards**: [BUILDOS_STYLE_GUIDE.md](./BUILDOS_STYLE_GUIDE.md#wcag-aa-compliance-checklist)

---

## Implementation Workflow

### Creating a New Component

1. **Understand requirements** (5 min)
    - What will the component do?
    - What data does it display?
    - What actions can users take?

2. **Review existing patterns** (10 min)
    - Check [UI_QUICK_REFERENCE.md](./UI_QUICK_REFERENCE.md) for similar components
    - Find closest existing implementation
    - Note what patterns it uses

3. **Plan structure** (5 min)
    - Use Card system if displaying data
    - Use FormModal if creating/editing
    - Reference [Implementation Checklist](./UI_PATTERNS_AND_CONVENTIONS.md#17-summary-implementation-checklist-for-new-components)

4. **Implement** (20-60 min)
    - Follow patterns from documentation
    - Use examples as templates
    - Refer to specific component docs as needed

5. **Validate** (10 min)
    - Run through implementation checklist
    - Test on mobile and desktop
    - Verify dark mode
    - Check accessibility

6. **Document** (5 min)
    - Add comments to complex logic
    - Update this index if adding new patterns
    - Link to related components

---

## Files Location

All UI documentation is in `/apps/web/docs/technical/components/`:

```
docs/technical/components/
├── BUILDOS_STYLE_GUIDE.md              (Official master guide)
├── UI_QUICK_REFERENCE.md               (Quick recipes - START HERE)
├── UI_PATTERNS_AND_CONVENTIONS.md      (Comprehensive guide)
├── UI_DOCUMENTATION_INDEX.md           (This file)
└── DESIGN_SYSTEM_GUIDE.md              (Additional reference)
```

All component source code is in `/apps/web/src/lib/components/ui/`:

```
src/lib/components/ui/
├── Card*.svelte          (Card system - PRIMARY)
├── Button.svelte         (Actions)
├── Modal.svelte          (Dialogs)
├── FormModal.svelte      (CRUD forms - RECOMMENDED)
├── *Input.svelte         (Form inputs)
├── FormField.svelte      (Form labels/errors)
├── Badge.svelte          (Status indicators)
├── Alert.svelte          (Messages)
└── [more components]
```

---

## Common Questions

**Q: Which component should I use for layouts?**
A: Card system (Card + CardHeader + CardBody + CardFooter). See [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#2-card-component-system-primary-pattern)

**Q: What about forms?**
A: Use FormModal for create/edit operations. See [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#5-formmodal-component-recommended-for-crud)

**Q: Do I need to implement dark mode?**
A: Yes, it's mandatory. All components must have `dark:` variants. See [UI_QUICK_REFERENCE.md](./UI_QUICK_REFERENCE.md#dark-mode)

**Q: What about mobile responsiveness?**
A: Mobile-first design is required. Test on actual mobile devices. See [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#12-responsive-design-patterns)

**Q: How do I ensure accessibility?**
A: Use the WCAG AA checklist. Minimum 44x44px touch targets, 4.5:1 contrast, proper ARIA labels. See [UI_QUICK_REFERENCE.md](./UI_QUICK_REFERENCE.md#accessibility-checklist)

**Q: Where do I find color values?**
A: Use Tailwind classes, not hardcoded hex values. See [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#9-color-system-and-theming)

**Q: What about animations?**
A: Use standard timing (300ms for most, 200ms for micro-interactions). See [UI_PATTERNS_AND_CONVENTIONS.md](./UI_PATTERNS_AND_CONVENTIONS.md#13-animations-and-transitions)

---

## Resources

**Official Links**:

- [Tailwind CSS Documentation](https://tailwindcss.com)
- [Lucide Icons](https://lucide.dev)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)

**BuildOS Docs**:

- [Web App CLAUDE.md](/apps/web/CLAUDE.md)
- [Technical Documentation Index](/docs/README.md)

---

## Document Versions

| Document                       | Version | Last Updated | Status  |
| ------------------------------ | ------- | ------------ | ------- |
| UI_QUICK_REFERENCE.md          | 1.0     | Nov 4, 2025  | Current |
| UI_PATTERNS_AND_CONVENTIONS.md | 1.0     | Nov 4, 2025  | Current |
| BUILDOS_STYLE_GUIDE.md         | 1.2.0   | Oct 25, 2025 | Current |
| UI_DOCUMENTATION_INDEX.md      | 1.0     | Nov 4, 2025  | Current |

---

## How to Update This Index

When adding new components or patterns:

1. Add entry to "Component Reference Table"
2. Add section to "By Use Case"
3. Update "Implementation Workflow" if needed
4. Update "Files Location" if new directories created

Keep the index alphabetically organized and cross-referenced.

---

**Last Updated**: November 4, 2025
**Maintained By**: BuildOS Development Team
**Status**: Complete and Ready for Use
