<!-- apps/web/docs/technical/components/modals/TECHNICAL_ANALYSIS.md -->

# Modal Components Technical Analysis

**Last Updated**: November 4, 2025
**Status**: Complete Analysis
**Category**: Component Documentation
**Location**: `/apps/web/docs/technical/components/modals/`

## Overview

Technical deep-dive into BuildOS's two foundational modal components that serve as the basis for all modal interactions in the application:

1. **Modal.svelte** - Low-level base modal component with essential functionality
2. **FormModal.svelte** - Higher-level form-specialized modal with built-in form handling

Both are located in `/apps/web/src/lib/components/ui/` and are heavily used throughout the codebase.

---

## 1. Modal.svelte

**Location:** `/apps/web/src/lib/components/ui/Modal.svelte`

### Purpose

The base Modal component provides the foundational modal functionality: backdrop, animations, focus management, keyboard handling, and accessibility features. It's designed to be flexible and composable with any content.

### Key Props

```typescript
{
  isOpen: boolean;                    // Controls modal visibility
  onClose: () => void;               // Callback when modal should close (required)
  title?: string;                    // Optional modal header title
  size?: 'sm' | 'md' | 'lg' | 'xl';  // Modal width (default: 'md')
  showCloseButton?: boolean;         // Show X button in header (default: true)
  closeOnBackdrop?: boolean;         // Close when clicking backdrop (default: true)
  closeOnEscape?: boolean;           // Close when pressing Escape (default: true)
  persistent?: boolean;              // When true, disables close on backdrop/escape
  customClasses?: string;            // Extra Tailwind classes for modal content
  ariaLabel?: string;               // Accessibility label
  ariaDescribedBy?: string;         // Accessibility description
}
```

### Size Classes Mapping

```typescript
const sizeClasses = {
	sm: 'max-w-md', // ~28rem (448px)
	md: 'max-w-2xl', // ~42rem (672px)  [DEFAULT]
	lg: 'max-w-4xl', // ~56rem (896px)
	xl: 'max-w-6xl' // ~72rem (1152px)
};
```

### Slots

1. **Default slot** - Main modal content (scrollable)
2. **`header` slot** - Custom header (overrides default title bar if provided)
3. **`footer` slot** - Modal footer actions (typically buttons)

### Core Features

#### Focus Management

- **Focus Trap:** When modal opens, focus moves to the first focusable element
- **Tab Cycling:** Tab key wraps around to last element; Shift+Tab wraps to first
- **Focus Restoration:** When modal closes, focus returns to the element that opened it
- Implementation: `trapFocus()` and `restoreFocus()` functions

#### Keyboard Handling

- **Escape Key:** Closes modal (unless `persistent: true` or `closeOnEscape: false`)
- **Event Propagation:** Prevents bubbling of keyboard events to page beneath
- Prevents multiple escape handlers from conflicting

#### Animations

- **Mobile (sm breakpoint):** Slides up from bottom (`modal-slide-up`)
- **Desktop:** Scales from center with fade (`modal-scale`)
- **Duration:** 150ms fade, 150ms scale

#### Accessibility

- Proper ARIA attributes: `aria-modal="true"`, `aria-labelledby`, `aria-describedby`
- Uses portal action to render outside component tree
- Semantic role="dialog"
- Auto-generated unique IDs for title and content

#### Responsive Design

- Mobile: Rounds only top corners (`rounded-t-lg`), full width, slides from bottom
- Desktop: Rounds all corners (`rounded-lg`), centered, scales with fade
- No padding on mobile, 1rem padding on desktop and up

### HTML Structure

```html
<div use:portal>
	<!-- Portal renders outside normal DOM tree -->
	<div class="fixed inset-0 backdrop"></div>
	<!-- Semi-transparent overlay -->
	<div class="fixed inset-0 z-[100] overflow-y-auto">
		<!-- Scroll container -->
		<div class="flex items-end sm:items-center justify-center">
			<!-- Centering -->
			<div class="modal content with animations">
				<!-- Header (default or custom) -->
				<!-- Content (scrollable) -->
				<!-- Footer -->
			</div>
		</div>
	</div>
</div>
```

### Default Header Behavior

If no custom header slot is provided and either `title` or `showCloseButton` is true:

```
┌──────────────────────────────────┐
│ Title                         [X] │  (X only shown if !persistent)
└──────────────────────────────────┘
```

---

## 2. FormModal.svelte

**Location:** `/apps/web/src/lib/components/ui/FormModal.svelte`

### Purpose

A specialized modal wrapper around Modal.svelte that provides complete form handling, validation, error display, and action buttons. Ideal for create/edit operations with structured data.

### Key Props

```typescript
{
  isOpen: boolean;                              // Controls modal visibility
  title: string;                                // Modal header title
  submitText: string;                           // Text for submit button
  loadingText: string;                          // Text shown during submission
  formConfig: FormConfig;                       // Field configuration
  initialData?: Record<string, any>;            // Data to populate form
  onSubmit: (data: Record<string, any>) => Promise<void>;  // Form submit handler
  onDelete?: ((id: string) => Promise<void>) | null;       // Optional delete handler
  onClose: () => void;                          // Close callback
  size?: 'sm' | 'md' | 'lg' | 'xl';            // Modal size (default: 'md')
  customClasses?: string;                       // Extra classes for modal
}
```

### FormConfig Type

```typescript
interface FieldConfig {
	type:
		| 'text'
		| 'textarea'
		| 'select'
		| 'date'
		| 'datetime'
		| 'datetime-local'
		| 'number'
		| 'tags'
		| 'checkbox'
		| 'radio';
	label: string; // Display label
	required?: boolean; // Mark as required
	placeholder?: string; // Placeholder text
	description?: string; // Help text below label
	options?: string[]; // For select/radio types
	min?: number; // For number inputs
	max?: number; // For number inputs
	rows?: number; // For textarea
	markdown?: boolean; // Enable markdown editor for textarea
	defaultValue?: any; // Default value if not in initialData
	copyButton?: boolean; // Show copy button for textarea fields
}
```

### Slots

1. **Default slot** - Rendered inside the form, after error messages but before fields
2. **`header` slot** - Custom header replacement
3. **`before-form` slot** - Rendered BEFORE the form starts (outside form tag)
4. **`after-form` slot** - Rendered AFTER the form content, inside form but before footer

### Core Features

#### Form Initialization

- Deep clones `initialData` to avoid mutations
- Automatically re-initializes when `initialData` changes
- Preserves Date objects correctly during cloning
- Resets initialization flag when modal closes

#### Field Types Supported

| Type                           | Input Element                   | Notes                               |
| ------------------------------ | ------------------------------- | ----------------------------------- |
| `text`                         | TextInput                       | Regular text field                  |
| `textarea`                     | Textarea or MarkdownToggleField | Can enable markdown editing         |
| `select`                       | Select dropdown                 | Requires `options` array            |
| `date`                         | HTML date input                 | YYYY-MM-DD format                   |
| `datetime` or `datetime-local` | HTML datetime-local input       | ISO format with time                |
| `number`                       | TextInput type="number"         | Supports min/max                    |
| `tags`                         | TextInput                       | Comma-separated, converted to array |
| `checkbox`                     | HTML checkbox                   | Boolean value                       |
| `radio`                        | Not fully implemented           | Basic support                       |

#### Validation

- **Client-side only** before submission
- Checks for required fields (not empty/null)
- Displays all validation errors at once
- Custom error handling in submit callback

#### Error Handling

- Error banner at top of form with AlertCircle icon
- Displays all errors as a list
- Errors cleared on form submission start
- Submit handler can throw Error for validation

#### Responsive Layout

**Mobile (< 640px):**

- Stack buttons vertically
- Submit button at top (primary action first)
- Delete button in 2-column grid with Cancel
- Full-width buttons

**Desktop (≥ 640px):**

- Buttons in horizontal row
- Delete button on left, Cancel/Submit on right
- Buttons inline with proper spacing

#### Field Styling

Each field gets a card-style container with:

- Contextual gradient backgrounds (depends on field name)
- Icon in label (based on field name)
- Description text below label
- Rounded corners and shadow

**Special gradient backgrounds:**

- `context` field: Green to emerald gradient
- `executive_summary` field: Purple to pink gradient
- Date fields: Indigo to blue gradient
- Default: White background

#### Date/DateTime Handling

- Automatically converts between ISO strings and input format
- Handles timezone-safe conversion using noon offset
- Rounds datetime to nearest 15 minutes when needed
- Preserves date values correctly across timezones

#### Built-in Features

- Loading state disables all inputs
- Copy button for textarea fields (copies to clipboard)
- Mobile grab handle for modal
- Safe area support for iOS devices
- Responsive form width and padding

### Error Alert Styling

```
┌─────────────────────────────────────┐
│ ⚠ Error 1                           │
│   Error 2                           │
└─────────────────────────────────────┘
```

### Footer Button Layout

**Mobile:**

```
[     Submit Button      ]
[Cancel]  [Delete or <blank>]
```

**Desktop:**

```
[Delete or <blank>]  [Cancel] [Submit Button]
```

---

## Real-World Usage Examples

### Example 1: TimeBlockCreateModal (FormModal usage)

```svelte
<FormModal
	isOpen={true}
	title="Create Focus Block"
	submitText="Create block"
	loadingText="Creating…"
	{formConfig}
	{initialData}
	onSubmit={handleSubmit}
	onClose={() => dispatch('close')}
	size="lg"
>
	<!-- Block type selector BEFORE the form -->
	<div slot="before-form" class="px-6 pt-6 pb-0 space-y-5">
		<fieldset>
			<!-- Custom UI for selecting block type -->
		</fieldset>
	</div>
</FormModal>
```

Where formConfig:

```typescript
const formConfig: FormConfig = {
	startTime: {
		type: 'datetime-local',
		label: 'Start time',
		required: true
	},
	endTime: {
		type: 'datetime-local',
		label: 'End time',
		required: true
	}
};
```

### Example 2: TimeBlockDetailModal (Base Modal usage)

```svelte
<Modal isOpen={true} {onClose} size="lg" title={blockTitle}>
	<!-- Rich content with custom styling -->
	<div class="px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
		<!-- Two-column layout for display -->
		<section class="lg:col-span-3">
			<!-- Main content -->
		</section>
		<aside class="lg:col-span-1">
			<!-- Sidebar with controls -->
		</aside>
	</div>

	<!-- Footer with custom buttons -->
	<div slot="footer" class="flex justify-between">
		<Button on:click={handleDelete} variant="danger">Delete</Button>
		<Button on:click={onClose}>Close</Button>
	</div>
</Modal>
```

### Example 3: TaskCreateModal (Custom modal - doesn't use base components)

These ontology modals (`TaskCreateModal`, `GoalCreateModal`) currently:

- Create their own backdrop with custom styling
- Don't use Modal.svelte or FormModal.svelte
- Have duplicated modal logic
- Could benefit from refactoring to use the base components

Current pattern:

```svelte
<!-- Manual backdrop -->
<button class="fixed inset-0 bg-black/50..." onclick={onClose} />

<!-- Manual content container -->
<div class="fixed inset-0 z-50 flex items-center justify-center">
	<!-- Custom modal content -->
</div>
```

---

## Key Differences: Modal vs FormModal

| Feature        | Modal                | FormModal                         |
| -------------- | -------------------- | --------------------------------- |
| Purpose        | Generic container    | Form handling                     |
| Content        | Any Svelte markup    | Form with specific structure      |
| Validation     | None                 | Built-in client validation        |
| Error Display  | Manual               | Automatic error banner            |
| Buttons        | Custom (footer slot) | Auto-generated with loading state |
| Initial Data   | None                 | Supports with deep cloning        |
| Field Types    | N/A                  | 9+ built-in types                 |
| Delete Button  | No                   | Optional `onDelete` prop          |
| Size           | 4 options            | 4 options (same)                  |
| Keyboard Close | Yes                  | Yes (disabled during submit)      |
| Focus Trap     | Yes                  | Yes (inherited)                   |

---

## Accessibility Features

### Modal.svelte

- ✅ `role="dialog"` and `aria-modal="true"`
- ✅ Focus trap with Tab cycling
- ✅ Escape key to close
- ✅ Backdrop click to close
- ✅ Auto-generated unique IDs
- ✅ ARIA labels from props
- ✅ Focus restoration on close

### FormModal.svelte (inherits Modal features)

- ✅ All Modal features above
- ✅ `aria-invalid` on fields with errors
- ✅ `aria-required` on required fields
- ✅ `aria-describedby` for field descriptions
- ✅ Semantic form structure
- ✅ Proper label-input associations

---

## Common Patterns Observed

### Pattern 1: Custom Header

```svelte
<Modal isOpen={true} {onClose} title="">
	<div slot="header">
		<!-- Custom gradient header -->
	</div>
</Modal>
```

### Pattern 2: Sidebar Layout

Modals often use a grid layout with main content and sidebar:

```svelte
<div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
	<section class="lg:col-span-3">Main content</section>
	<aside class="lg:col-span-1">Sidebar controls</aside>
</div>
```

### Pattern 3: before-form and after-form

FormModal provides strategic slots for custom content:

```svelte
<FormModal>
	<div slot="before-form">
		<!-- Custom UI before form fields -->
	</div>

	<div slot="after-form">
		<!-- Custom UI after form fields, before buttons -->
	</div>
</FormModal>
```

### Pattern 4: Conditional Footer

Buttons in footer slot often conditionally render:

```svelte
<div slot="footer">
  {#if editMode}
    <Button on:click={save}>Save</Button>
  {:else}
    <Button on:click={delete}>Delete</Button>
  {/if}
</div>
```

---

## Current Codebase Usage

### Using FormModal.svelte

- TimeBlockCreateModal
- TimeBlockModal
- ProjectEditModal (and variants)
- Various ontology modals could use this

### Using Modal.svelte

- TimeBlockDetailModal
- CalendarEventDetailModal
- Various info/detail modals
- ProjectContextDocModal
- ProjectHistoryModal

### Custom Modal Implementation

- TaskCreateModal (ontology)
- GoalCreateModal (ontology)
- PlanCreateModal (ontology)
- OutputCreateModal (ontology)

These custom implementations reinvent modal logic and could be refactored to use FormModal.svelte.

---

## Recommendations for Ontology Modals

### Current Issues with TaskCreateModal, GoalCreateModal, etc.

1. **No focus management** - no focus trap or restoration
2. **Duplicated backdrop code** - each modal creates its own
3. **No accessibility** - missing ARIA attributes, semantic structure
4. **Inconsistent with app standards** - different animation timing, sizing
5. **No reusable form handling** - custom validation per modal

### Migration Strategy

Refactor ontology modals to use FormModal.svelte:

```typescript
// Before: Custom modal with manual backdrop
<button class="fixed inset-0 bg-black/50..." />
<div class="fixed inset-0 flex items-center justify-center">
  <!-- custom form -->
</div>

// After: Using FormModal
<FormModal
  {isOpen}
  title="Create Goal"
  submitText="Create"
  loadingText="Creating…"
  formConfig={goalFormConfig}
  {initialData}
  onSubmit={handleCreate}
  onClose={onClose}
  size="lg"
>
  <!-- Optional: template selection before form -->
  <div slot="before-form">
    <!-- Template picker -->
  </div>
</FormModal>
```

**Benefits:**

- Consistent UX with rest of app
- Proper accessibility out of the box
- Less code to maintain
- Better focus/keyboard handling
- Animations consistent with other modals

---

## Technical Details

### Portal Action

Modal uses Svelte action `use:portal` to render outside the normal component tree:

```typescript
import { portal } from '$lib/actions/portal';
// Renders to document.body by default
<div use:portal>...</div>
```

### Z-Index Strategy

- Modal backdrop & container: `z-[100]`
- Modal content: inherits z-100, other components adjust as needed

### Responsive Breakpoint

BuildOS uses Tailwind's `sm:` breakpoint (640px):

- Below 640px: Mobile layout
- 640px and above: Desktop layout

### Animation Timing

- **Fade (backdrop):** 150ms ease-out
- **Scale/Slide:** 150ms ease-out
- Synchronized for smooth appearance

---

## Summary

The Modal and FormModal components provide:

- A solid foundation for all modal interactions
- Proper accessibility out of the box
- Consistent animations and styling
- Focus management and keyboard handling
- FormModal adds intelligent form handling with validation

For the ontology modals refactoring, migrating to FormModal.svelte would significantly improve code quality, consistency, and maintainability while providing better user experience with proper focus management and accessibility.
