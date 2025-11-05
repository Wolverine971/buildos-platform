# Modal Components Documentation

**Last Updated**: November 4, 2025
**Location**: `/apps/web/docs/technical/components/modals/`

## Overview

This directory contains comprehensive analysis and documentation of the BuildOS modal components (Modal.svelte and FormModal.svelte), including usage patterns, best practices, and refactoring guidelines.

## Documentation Files

### 📖 [ANALYSIS_SUMMARY.md](./ANALYSIS_SUMMARY.md)

**5 min read** - Executive Summary

- Component overview and features
- Current usage in the codebase
- Issues with custom modal implementations
- Refactoring recommendations

### 🚀 [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)

**10 min read** - Developer Quick Reference

- When to use Modal vs FormModal
- Props cheatsheet with examples
- Field types reference (9+ types)
- Common patterns and tips
- Copy-paste examples

### 🎨 [VISUAL_GUIDE.md](./VISUAL_GUIDE.md)

**10 min read** - Visual Documentation

- Layout diagrams and structure
- Focus management flow
- Animation sequences (mobile/desktop)
- Keyboard navigation map
- Component hierarchy

### 🔬 [TECHNICAL_ANALYSIS.md](./TECHNICAL_ANALYSIS.md)

**20 min read** - Deep Technical Dive

- Detailed component breakdown
- All props and their effects
    - Focus/keyboard/animation implementation
    - Real-world usage examples
    - Migration strategy for ontology modals

## Files Overview

| File                         | Size | Type     | Best For           |
| ---------------------------- | ---- | -------- | ------------------ |
| MODAL_ANALYSIS_SUMMARY.txt   | 5KB  | Text     | Executive overview |
| MODAL_QUICK_REFERENCE.md     | 9KB  | Markdown | Quick lookup       |
| MODAL_VISUAL_GUIDE.md        | 16KB | Markdown | Visual learners    |
| MODAL_COMPONENTS_ANALYSIS.md | 17KB | Markdown | Deep understanding |

**Total:** ~45KB, 1600+ lines of documentation

## Component Locations

```
/apps/web/src/lib/components/ui/
├── Modal.svelte          (282 lines)
├── FormModal.svelte      (636 lines)
└── ... other UI components

/apps/web/src/lib/types/
└── form.ts              (FormConfig type definitions)
```

## Key Findings

### Modal.svelte

- **Purpose:** Low-level, flexible modal container
- **Best For:** Display-only dialogs, custom layouts
- **Key Features:** Focus trap, keyboard handling, animations, responsive design
- **Slots:** header, default content, footer

### FormModal.svelte

- **Purpose:** Form-specific modal with validation
- **Best For:** Create/edit/delete operations
- **Key Features:** Form handling, validation, error display, auto-generated buttons
- **Slots:** header, before-form, after-form, default

### Current Usage

- **FormModal used by:** TimeBlockCreateModal, TimeBlockModal, ProjectEditModal
- **Modal used by:** TimeBlockDetailModal, CalendarEventDetailModal, detail views
- **Custom modals (need refactoring):** TaskCreateModal, GoalCreateModal, PlanCreateModal, OutputCreateModal

## Why This Matters

The ontology modals are currently using **custom modal implementations** that:

- Lack focus management (no focus trap)
- Have duplicated backdrop code
- Missing accessibility features
- Use inconsistent animations
- Have manual validation logic

**By refactoring to FormModal.svelte, you get:**

- Consistent UX with rest of the app
- Proper accessibility compliance
- Better keyboard/focus handling
- 20+ lines of code → 10 lines
- Reduced code duplication
- Easier maintenance

## Example: Before and After

### Before (Custom Modal)

```svelte
<!-- Manual backdrop -->
<button class="fixed inset-0 bg-black/50..." onclick={onClose} />

<!-- Manual modal container -->
<div class="fixed inset-0 z-50 flex items-center justify-center">
	<div class="...">
		<!-- Custom form markup (20+ lines) -->
	</div>
</div>
```

### After (Using FormModal)

```svelte
<FormModal
	{isOpen}
	title="Create Goal"
	submitText="Create"
	loadingText="Creating…"
	{formConfig}
	{initialData}
	onSubmit={handleCreate}
	{onClose}
>
	<div slot="before-form">
		<!-- Template selection -->
	</div>
</FormModal>
```

## Next Steps

### For Ontology Modal Refactoring

1. **Study existing implementations**
    - TimeBlockCreateModal (FormModal with before-form slot)
    - TimeBlockDetailModal (Modal with custom layout)

2. **Define FormConfig for each entity**
    - Task fields: title, description, priority, state, etc.
    - Goal fields: name, description, target_date, measurement_criteria, etc.
    - Plan fields: name, description, etc.
    - Output fields: title, description, etc.

3. **Refactor modals**
    - Replace custom backdrop/container with FormModal
    - Move custom UI to before-form or after-form slots
    - Use FormConfig for field definitions
    - Implement onSubmit handler

4. **Test thoroughly**
    - Focus trap (Tab/Shift+Tab)
    - Keyboard navigation (Escape)
    - Mobile responsiveness (<640px)
    - Accessibility (ARIA attributes)
    - Error handling

## Key Concepts

### Focus Management

- Modal automatically traps focus when opened
- Tab cycles through focusable elements with wrap-around
- Focus returns to opener when modal closes
- No manual focus management needed

### Keyboard Handling

- Escape key closes modal (unless persistent=true)
- Tab/Shift+Tab navigate focusable elements
- Modal prevents key events from reaching page beneath

### Responsive Design

- Breakpoint: 640px (Tailwind's `sm:`)
- Mobile: Slide up from bottom, full width, stacked buttons
- Desktop: Scale from center, centered, horizontal buttons

### Accessibility

- `aria-modal="true"` and `role="dialog"`
- Auto-generated unique IDs
- Proper ARIA labels and descriptions
- Semantic form structure
- Focus management built-in

## Common Patterns

### Pattern 1: FormModal with before-form slot

```svelte
<FormModal {isOpen} {formConfig} onSubmit={submit} onClose={close} ...>
	<div slot="before-form">
		<!-- Template picker, tab navigation, etc -->
	</div>
</FormModal>
```

### Pattern 2: Modal with custom header

```svelte
<Modal {isOpen} {onClose} title="">
	<div slot="header">
		<!-- Custom gradient header -->
	</div>
	<!-- Content and footer -->
</Modal>
```

### Pattern 3: Two-column layout

```svelte
<Modal {isOpen} {onClose}>
	<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
		<main class="lg:col-span-2">Main content</main>
		<aside class="lg:col-span-1">Sidebar</aside>
	</div>
</Modal>
```

## Tips & Tricks

1. **Use before-form for custom UI before fields** - Perfect for template selection
2. **Use after-form for custom UI between fields and buttons** - For additional explanations
3. **Set markdown: true in FormConfig** - Enable markdown editor for textarea
4. **Set copyButton: true** - Add copy button for textarea fields
5. **Use tags type** - Automatically converts string ↔ array
6. **Deep clone is automatic** - No need to manually clone initialData
7. **Validation errors show in banner** - All errors display at once
8. **Loading state disables all inputs** - No manual disabling needed
9. **Date handling is automatic** - Timezone-safe conversion
10. **Mobile buttons auto-stack** - Responsive layout built-in

## Troubleshooting

### Modal won't close

- Check `onClose` is updating parent state
- Check `isOpen` binding
- Check `persistent: true` isn't set

### Focus doesn't trap

- Ensure modal has focusable elements
- Check browser console for errors
- Verify portal action is working

### Form data not saving

- Verify `formConfig` keys match `initialData`
- Check `onSubmit` is async
- Check error handling in submit

### Mobile layout broken

- Test at <640px width
- Use `sm:` prefix for desktop styles
- Verify viewport meta tag present

## Related Documentation

- Main project docs: `/docs/README.md`
- Web app docs: `/apps/web/docs/README.md`
- Component documentation: `/apps/web/docs/technical/components/`
- Style guide: `/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md`

## Summary

This documentation provides everything needed to understand and refactor the modal components in BuildOS:

- **Executive Summary** for decision makers
- **Quick Reference** for developers looking things up
- **Visual Guide** for understanding structure and flow
- **Comprehensive Analysis** for deep technical understanding

The modal components are well-designed, highly composable, and provide excellent accessibility and responsiveness out of the box. The ontology modals should be refactored to use them for consistency and better code quality.

## Related Documentation

### Navigation & Overview

- 🧭 **[Navigation Index](/apps/web/docs/NAVIGATION_INDEX.md)** - Find any documentation quickly
- 📚 **[Web App Documentation Hub](/apps/web/docs/README.md)** - Web app overview

### Features Using Modal Components

- 🎯 **[Ontology System](/apps/web/docs/features/ontology/README.md)** - Complete ontology documentation
- 🔧 **[Ontology Implementation](/apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md)** - How modals are used in practice
- 📊 **[Ontology Data Models](/apps/web/docs/features/ontology/DATA_MODELS.md)** - Entity relationships

### Component Documentation

- 🎨 **[BuildOS Style Guide](/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md)** - Design system
- 📚 **[Form Types](/apps/web/src/lib/types/form.ts)** - FormConfig type definitions

### Implementation Examples

- **Task Creation**: [`/apps/web/src/lib/components/ontology/TaskCreateModal.svelte`](/apps/web/src/lib/components/ontology/TaskCreateModal.svelte)
- **Plan Creation**: [`/apps/web/src/lib/components/ontology/PlanCreateModal.svelte`](/apps/web/src/lib/components/ontology/PlanCreateModal.svelte)
- **Goal Creation**: [`/apps/web/src/lib/components/ontology/GoalCreateModal.svelte`](/apps/web/src/lib/components/ontology/GoalCreateModal.svelte)
- **Task Editing**: [`/apps/web/src/lib/components/ontology/TaskEditModal.svelte`](/apps/web/src/lib/components/ontology/TaskEditModal.svelte)

---

**Created:** November 4, 2025
**Coverage:** Modal.svelte (282 lines), FormModal.svelte (636 lines), form.ts types
**Analysis Depth:** Comprehensive - includes props, slots, accessibility, animations, responsive design, focus management, real-world examples, and migration strategy
