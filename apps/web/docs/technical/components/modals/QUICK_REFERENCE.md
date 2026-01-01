<!-- apps/web/docs/technical/components/modals/QUICK_REFERENCE.md -->

# Modal Components Quick Reference

**Last Updated**: January 1, 2026
**Status**: Active Reference Guide
**Category**: Component Documentation
**Location**: `/apps/web/docs/technical/components/modals/`

## File Locations

- **Base Modal:** `/apps/web/src/lib/components/ui/Modal.svelte`
- **Form Modal:** `/apps/web/src/lib/components/ui/FormModal.svelte`
- **Types:** `/apps/web/src/lib/types/form.ts`

## Quick Usage Guide

### Use Modal.svelte when:

- You need a simple dialog/popup
- Content is read-only or mostly static
- You want full control over interior layout
- You're displaying information, not collecting input

```svelte
<script>
	import Modal from '$lib/components/ui/Modal.svelte';
	let isOpen = $state(false);
</script>

<Modal {isOpen} onClose={() => (isOpen = false)} title="My Dialog" size="md">
	<p>Your content here</p>

	<div slot="footer">
		<Button on:click={() => (isOpen = false)}>Close</Button>
	</div>
</Modal>
```

### Use FormModal.svelte when:

- You're collecting form input
- You need validation
- You want consistent form styling
- You have a create/edit/delete workflow

```svelte
<script>
	import FormModal from '$lib/components/ui/FormModal.svelte';
	import type { FormConfig } from '$lib/types/form';

	let isOpen = $state(false);

	const formConfig: FormConfig = {
		name: {
			type: 'text',
			label: 'Project Name',
			required: true,
			placeholder: 'Enter project name'
		},
		description: {
			type: 'textarea',
			label: 'Description',
			rows: 4
		}
	};

	async function handleSubmit(data: Record<string, any>) {
		console.log('Form data:', data);
		// Submit to API
	}
</script>

<FormModal
	{isOpen}
	title="Create Project"
	submitText="Create"
	loadingText="Creating…"
	{formConfig}
	onSubmit={handleSubmit}
	onClose={() => (isOpen = false)}
	size="lg"
/>
```

---

## Modal Props Cheatsheet

### Modal.svelte

```typescript
isOpen: boolean                    // Required: controls visibility
onClose: () => void               // Required: close callback
title?: string                    // Header title (default: none)
size?: 'sm' | 'md' | 'lg' | 'xl' // Width (default: 'md')
showCloseButton?: boolean         // Show X in header (default: true)
closeOnBackdrop?: boolean         // Click backdrop to close (default: true)
closeOnEscape?: boolean           // Escape key closes (default: true)
persistent?: boolean              // Disable backdrop/escape closing (default: false)
customClasses?: string            // Extra Tailwind classes
ariaLabel?: string               // ARIA label if no title
ariaDescribedBy?: string         // ARIA description
```

### FormModal.svelte

```typescript
isOpen: boolean                              // Required
title: string                                // Required: header title
submitText: string                           // Required: submit button text
loadingText: string                          // Required: loading state text
formConfig: FormConfig                       // Required: field definitions
initialData?: Record<string, any>            // Form data to populate
onSubmit: (data: Record<string, any>) => Promise<void>  // Required: submit handler
onDelete?: ((id: string) => Promise<void>)   // Optional: delete handler
onClose: () => void                          // Required: close callback
size?: 'sm' | 'md' | 'lg' | 'xl'            // Width (default: 'md')
customClasses?: string                       // Extra Tailwind classes
```

---

## FormConfig Field Types

```typescript
// Text input
{ type: 'text', label: 'Name', required: true, placeholder: 'Enter name' }

// Textarea
{ type: 'textarea', label: 'Description', rows: 4, markdown: true }

// Select dropdown
{ type: 'select', label: 'Status', options: ['active', 'inactive'] }

// Date picker
{ type: 'date', label: 'Due Date', required: true }

// DateTime picker
{ type: 'datetime-local', label: 'Start Time', required: true }

// Number input
{ type: 'number', label: 'Priority', min: 1, max: 10 }

// Tags (comma-separated string converted to array)
{ type: 'tags', label: 'Tags', placeholder: 'Comma-separated' }

// Checkbox
{ type: 'checkbox', label: 'Send notifications', description: 'Get updates' }

// Radio (basic support)
{ type: 'radio', label: 'Option', options: ['Yes', 'No'] }
```

---

## Slots Reference

### Modal Slots

```svelte
<Modal {isOpen} {onClose} title="Dialog">
	<!-- Default: main content (scrollable) -->
	<p>Content goes here</p>

	<!-- header: custom header (replaces default) -->
	<div slot="header">Custom header content</div>

	<!-- footer: action buttons -->
	<div slot="footer" class="flex gap-2">
		<Button>Action</Button>
	</div>
</Modal>
```

### FormModal Slots

```svelte
<FormModal {isOpen} {formConfig} onSubmit={submit} onClose={close} ...>
	<!-- before-form: before form tag (e.g., template picker) -->
	<div slot="before-form">
		<!-- Custom UI before form -->
	</div>

	<!-- after-form: after form fields, before footer -->
	<div slot="after-form">
		<!-- Custom UI inside form, after fields -->
	</div>

	<!-- header: custom header (if you want) -->
	<div slot="header">Custom header</div>
</FormModal>
```

---

## Common Patterns

### Pattern: Modal with custom header

```svelte
<Modal {isOpen} {onClose} title="">
	<div slot="header">
		<div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
			<h2>Custom Title</h2>
		</div>
	</div>

	<p>Content here</p>
</Modal>
```

### Pattern: FormModal with before-form slot

```svelte
<FormModal {isOpen} {formConfig} onSubmit={submit} onClose={close} ...>
	<div slot="before-form">
		<!-- Template selection, tab navigation, etc -->
	</div>
</FormModal>
```

### Pattern: Two-column layout in Modal

```svelte
<Modal {isOpen} {onClose}>
	<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
		<main class="lg:col-span-2">Main content</main>
		<aside class="lg:col-span-1">Sidebar</aside>
	</div>

	<div slot="footer">
		<Button>Save</Button>
	</div>
</Modal>
```

### Pattern: Delete button in FormModal

```svelte
<script>
	let showDeleteConfirm = $state(false);

	async function handleDelete(id: string) {
		// Delete logic
	}
</script>

<FormModal
	{isOpen}
	{formConfig}
	initialData={editingItem}
	onDelete={handleDelete}
	onSubmit={handleSubmit}
	...
/>
```

---

## Size Mapping

```
sm:  max-w-md   (448px)   ← Small dialog
md:  max-w-2xl  (672px)   ← Default, forms
lg:  max-w-4xl  (896px)   ← Large, complex content
xl:  max-w-6xl  (1152px)  ← Extra large
```

---

## Keyboard & Accessibility

- **Escape:** Closes modal (unless `persistent: true`)
- **Tab:** Cycles focus through focusable elements, wraps at edges
- **Shift+Tab:** Reverse cycle
- **Click backdrop:** Closes modal (unless `closeOnBackdrop: false`)
- **Focus trap:** Automatically enabled when modal opens
- **Focus restoration:** Focus returns to opener when modal closes

---

## Mobile vs Desktop

### Breakpoint: 640px (sm:)

**Mobile (<640px):**

- Modal slides up from bottom
- Full width with top corners rounded
- Buttons stack vertically
- Safe area insets for iOS

**Desktop (≥640px):**

- Modal scales from center
- Centered with fixed max-width
- Buttons horizontal layout
- Standard padding

---

## Ontology Modal Spacing Standards

**Updated January 2026** - Standardized for mobile command center experience.

### Standard Spacing Pattern (Mobile-First)

```css
/* Header - Ultra-compact on mobile */
px-2 py-1.5 sm:px-4 sm:py-2.5

/* Body Container */
px-2 py-2 sm:px-6 sm:py-4

/* Footer */
px-2 py-2 sm:px-4 sm:py-3

/* Form Field Spacing */
space-y-3 sm:space-y-4

/* Type Selection Cards */
p-2.5 sm:p-4

/* Category Groups */
space-y-4 sm:space-y-6

/* Button Gaps */
gap-2 sm:gap-3
```

### Ontology Modals Using This Pattern

| Modal                | Location                                                   |
| -------------------- | ---------------------------------------------------------- |
| TaskCreateModal      | `/src/lib/components/ontology/TaskCreateModal.svelte`      |
| GoalCreateModal      | `/src/lib/components/ontology/GoalCreateModal.svelte`      |
| DecisionCreateModal  | `/src/lib/components/ontology/DecisionCreateModal.svelte`  |
| RiskCreateModal      | `/src/lib/components/ontology/RiskCreateModal.svelte`      |
| MilestoneCreateModal | `/src/lib/components/ontology/MilestoneCreateModal.svelte` |

### State Enums Reference

All ontology modals use enums from `$lib/types/onto.ts`:

```typescript
TASK_STATES: ['todo', 'in_progress', 'blocked', 'done'];
GOAL_STATES: ['draft', 'active', 'achieved', 'abandoned'];
MILESTONE_STATES: ['pending', 'in_progress', 'completed', 'missed'];
RISK_STATES: ['identified', 'mitigated', 'occurred', 'closed'];
DECISION_STATES: ['pending', 'made', 'deferred', 'reversed'];
```

**Full Audit:** See `/docs/reports/ontology-modal-audit-2025-01.md`

---

## Tips & Tricks

1. **Control max-height:** Use `max-h-[90vh]` on your content
2. **Prevent scroll under modal:** Modal automatically handles this via portal
3. **Markdown editing:** Set `markdown: true` in textarea field config
4. **Copy button:** Set `copyButton: true` for textarea fields
5. **Required fields:** Set `required: true` and FormModal validates automatically
6. **Custom validation:** Throw Error from `onSubmit` handler
7. **Loading state:** Disable buttons by checking `isLoading` before submitting
8. **Deep clone:** FormModal automatically deep-clones initialData to prevent mutations
9. **Date handling:** Use ISO strings, Modal handles conversion to input format
10. **Tags field:** Automatically converts comma-separated string to/from array

---

## Migration from Custom Modal to FormModal

**Before:**

```svelte
<button class="fixed inset-0 bg-black/50" onclick={onClose} />
<div class="fixed inset-0 flex items-center justify-center">
	<form>
		<!-- custom form markup -->
	</form>
</div>
```

**After:**

```svelte
<FormModal
	{isOpen}
	title="Create Item"
	submitText="Create"
	loadingText="Creating…"
	{formConfig}
	{initialData}
	onSubmit={handleSubmit}
	{onClose}
/>
```

**Benefits:**

- 20+ lines of code → 10 lines
- Built-in focus trap
- Built-in validation
- Consistent styling/animations
- Accessibility built-in

---

## Debug Tips

1. Check modal renders with `use:portal` action
2. Check z-index if modal appears behind other content
3. Check `isOpen` is bound correctly
4. Check `onClose` callback is updating state
5. Check `formConfig` field names match `initialData` keys
6. Check `onSubmit` handler is async and throws errors appropriately
7. Check required fields have `required: true` in config
8. Check date/datetime values are ISO strings
9. Check mobile responsiveness at <640px

---

## Related Components

- **Button.svelte** - Use with modal footer
- **Card.svelte** - Organize modal content
- **TextInput.svelte** - Text field (used in FormModal)
- **Textarea.svelte** - Large text (used in FormModal)
- **Select.svelte** - Dropdown (used in FormModal)
- **Alert.svelte** - Display errors/messages
- **Badge.svelte** - Status indicators
