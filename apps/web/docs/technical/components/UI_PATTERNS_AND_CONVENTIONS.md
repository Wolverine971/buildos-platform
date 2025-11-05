# BuildOS UI Patterns and Style Conventions - Complete Analysis

## Overview

BuildOS follows a **premium Apple-inspired aesthetic** with focus on clarity, high information density, and sophisticated UX. All components must support:

- Responsive design (mobile-first)
- Light and dark modes
- WCAG AA accessibility standards (4.5:1 contrast ratio)
- High information density with Apple-style refinement

---

## 1. Style Guide Location and Philosophy

**Master Reference**: `/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md`

**Core Design Principles**:

1. Clarity First - every element has clear purpose and visual hierarchy
2. Subtle Sophistication - gradients and shadows used sparingly but effectively
3. Consistent Motion - smooth, predictable animations
4. Accessible by Default - WCAG AA standards required
5. Progressive Disclosure - complex information revealed gradually

---

## 2. Card Component System (Primary Pattern)

### Architecture

BuildOS uses a **composable Card system** for layouts - this is the recommended pattern for all new components.

**Components**:

- `Card.svelte` - Container (required)
- `CardHeader.svelte` - Optional header section
- `CardBody.svelte` - Main content area (required)
- `CardFooter.svelte` - Optional footer section

### Card Component

**File**: `/apps/web/src/lib/components/ui/Card.svelte`

**Props**:

```typescript
variant?: 'default' | 'elevated' | 'interactive' | 'outline'
padding?: 'none' | 'sm' | 'md' | 'lg'
hoverable?: boolean
class?: string
```

**Variants**:

- `default`: Basic card (border shadow-sm)
- `elevated`: Prominent card (shadow-md)
- `interactive`: Clickable card with hover effects
- `outline`: Minimal styling with just border

**Padding**:

- `none`: No padding (p-0)
- `sm`: Compact (p-2)
- `md`: Standard (p-3 sm:p-4) - RECOMMENDED
- `lg`: Comfortable (p-4 sm:p-6)

**Features**:

- All variants include dark mode support
- Optimized for high information density
- Smooth transitions (duration-300)
- If `hoverable=true`: hover:shadow-lg hover:scale-105 hover:-translate-y-0.5

### CardHeader Component

**File**: `/apps/web/src/lib/components/ui/CardHeader.svelte`

**Props**:

```typescript
variant?: 'default' | 'gradient' | 'accent'
class?: string
```

**Variants**:

- `default`: Neutral background (bg-gray-50 dark:bg-gray-800)
- `gradient`: Blue-indigo gradient (from-blue-50 to-indigo-50)
- `accent`: Purple-pink gradient (from-purple-50 to-pink-50)

**Styling**:

- Padding: px-3 py-2 sm:py-2.5 (compact, Apple-style)
- Border-bottom separates from body
- Dark mode opacity modifiers: /10 for gradients

### CardBody Component

**File**: `/apps/web/src/lib/components/ui/CardBody.svelte`

**Props**:

```typescript
padding?: 'sm' | 'md' | 'lg'
class?: string
```

**Padding Options**:

- `sm`: px-2 py-1.5 (ultra-compact)
- `md`: px-3 py-2.5 (standard) - RECOMMENDED
- `lg`: px-4 py-3 (comfortable)

### CardFooter Component

**File**: `/apps/web/src/lib/components/ui/CardFooter.svelte`

**Default Styling**:

- Padding: px-3 py-2 sm:py-2.5
- Border-top (separates from body)
- Background: bg-gray-50 dark:bg-gray-800/50
- Flexbox: flex items-center justify-between gap-3

### Card Usage Example

```svelte
<Card variant="elevated">
	<CardHeader variant="accent">
		<div class="flex items-center gap-2">
			<Icon class="h-5 w-5" />
			<h3>Card Title</h3>
		</div>
	</CardHeader>
	<CardBody padding="md">
		<!-- Main content -->
	</CardBody>
	<CardFooter>
		<!-- Optional action buttons -->
	</CardFooter>
</Card>
```

---

## 3. Button Component and Variants

**File**: `/apps/web/src/lib/components/ui/Button.svelte`

**Props**:

```typescript
variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success' | 'warning'
size?: 'sm' | 'md' | 'lg' | 'xl'
loading?: boolean
icon?: LucideIcon
iconPosition?: 'left' | 'right'
fullWidth?: boolean
disabled?: boolean
btnType?: 'container' | 'regular'
class?: string
```

**Size Standards** (with WCAG AA minimum 44x44px touch targets):

- `sm`: px-3 py-2 text-sm min-h-[44px] min-w-[44px]
- `md`: px-4 py-2.5 text-base min-h-[44px] min-w-[44px]
- `lg`: px-6 py-3 text-lg min-h-[48px] min-w-[48px]
- `xl`: px-8 py-4 text-xl min-h-[56px] min-w-[56px]

**Variant Patterns**:

1. **Primary** - Gradient with solid border (main actions)
    - Light: from-blue-50 to-purple-50, text-blue-700, border-2 border-blue-600
    - Hover: from-blue-100 to-purple-100, hover:border-purple-600
    - Dark: from-blue-950/30 to-purple-950/30, dark:text-blue-300, dark:border-blue-500

2. **Secondary** - Gradient, less prominent
    - Light: from-blue-100 to-indigo-100, text-blue-900, border-2 border-blue-500
    - Similar dark mode treatment

3. **Ghost** - Transparent, minimal styling
    - bg-transparent, hover:gradient to gray-50/slate-50
    - Used for secondary actions, close buttons

4. **Danger** - Red/rose gradient for destructive actions
    - from-rose-50 to-red-50, text-rose-700, border-rose-200

5. **Warning** - Amber/yellow gradient
    - from-amber-50 to-yellow-50, text-amber-700

6. **Success** - Green/emerald gradient
    - from-emerald-50 to-green-50, text-emerald-700

7. **Outline** - White background with gray border
    - border-2 border-gray-400, hover gradient effect

**All Variants**:

- Include dark mode support
- Have focus:ring-2 focus:ring-offset-2 focus states
- Support disabled state
- Support loading state with spinner
- Smooth transitions (duration-200)
- Shadow effects that increase on hover

**Icon Usage**:

- Icons scale with button size
- Icon spacing adjusts: sm=gap-1.5, others=gap-2
- Loading spinner replaces icon
- Position: left (default) or right

---

## 4. Modal System for Create/Edit Operations

**File**: `/apps/web/src/lib/components/ui/Modal.svelte`

**Props**:

```typescript
isOpen: boolean
onClose: () => void
title?: string
size?: 'sm' | 'md' | 'lg' | 'xl'
showCloseButton?: boolean
closeOnBackdrop?: boolean
closeOnEscape?: boolean
persistent?: boolean
customClasses?: string
ariaLabel?: string
ariaDescribedBy?: string
```

**Size Classes**:

- `sm`: max-w-md (448px)
- `md`: max-w-2xl (672px) - DEFAULT
- `lg`: max-w-4xl (896px)
- `xl`: max-w-6xl (1152px)

**Modal Features**:

- **Backdrop**: Fixed overlay with blur effect (bg-opacity-50 dark:bg-opacity-70 backdrop-blur-sm)
- **Mobile Animation**: Slide-up from bottom (rounded-t-lg)
- **Desktop Animation**: Scale animation with 0.15s ease-out
- **Focus Management**: Automatic focus trap and restoration
- **Keyboard Handling**: Escape to close (if enabled)
- **Accessibility**: Proper ARIA roles, label, describedby
- **Portal Rendering**: Uses portal action to render outside DOM hierarchy

**Modal Structure**:

```svelte
<Modal {isOpen} {onClose} title="Modal Title" size="md">
	<!-- Default slot: main content -->
	<div class="px-4 sm:px-6 py-4 sm:py-6">
		<!-- Content here -->
	</div>

	<!-- Named slot: header (optional custom header) -->
	<div slot="header">
		<!-- Custom header content -->
	</div>

	<!-- Named slot: footer (optional) -->
	<div slot="footer">
		<!-- Footer buttons -->
	</div>
</Modal>
```

**Default Header Structure**:

- Background: bg-gray-50 dark:bg-gray-900/50
- Flexbox with title on left, close button (ghost variant) on right
- Border-bottom separator
- Truncate text with pr-2 for close button space

---

## 5. FormModal Component (Recommended for CRUD)

**File**: `/apps/web/src/lib/components/ui/FormModal.svelte`

This is the **recommended pattern for create/edit operations** - provides complete form handling out of the box.

**Props**:

```typescript
isOpen: boolean
title: string
submitText: string
loadingText: string
formConfig: FormConfig
initialData?: Record<string, any>
onSubmit: (data: Record<string, any>) => Promise<void>
onDelete?: ((id: string) => Promise<void>) | null
onClose: () => void
size?: 'sm' | 'md' | 'lg' | 'xl'
customClasses?: string
```

**FormConfig Type**:

```typescript
interface FormConfig {
	[fieldName: string]: {
		label: string;
		type?:
			| 'text'
			| 'textarea'
			| 'date'
			| 'datetime-local'
			| 'number'
			| 'select'
			| 'checkbox'
			| 'tags';
		required?: boolean;
		placeholder?: string;
		description?: string;
		rows?: number;
		markdown?: boolean;
		copyButton?: boolean;
		options?: string[];
		min?: number;
		max?: number;
	};
}
```

**Key Features**:

1. **Automatic Field Rendering**: Based on formConfig
2. **Field Icons**: Context-aware icons (FileText for context, Calendar for dates, etc.)
3. **Validation**: Built-in required field validation
4. **Error Display**: Prominent error alert at top with icon
5. **State Management**: Handles data initialization and deep cloning
6. **Loading States**: Disables form during submission
7. **Delete Button**: Shows only for edit operations (when ID exists)

**Field Types**:

- `text` - TextInput
- `textarea` - Textarea with optional markdown support
- `date` - HTML date input
- `datetime-local` - HTML datetime input
- `number` - HTML number input with min/max
- `select` - HTML select with options
- `checkbox` - Checkbox input
- `tags` - Comma-separated text converted to array

**Card-Style Field Containers**:
Each field is rendered in a styled card with:

- Contextual background gradients:
    - context field: bg-gradient-to-br from-green-50 to-emerald-50
    - executive_summary: from-purple-50 to-pink-50
    - date fields: from-indigo-50 to-blue-50
    - others: white/gray-800
- Icon + label with uppercase tracking
- Field-specific background colors
- Hover shadow effect

**Form Layout**:

```svelte
<FormModal
	{isOpen}
	title="Edit Project"
	submitText="Save"
	loadingText="Saving..."
	{formConfig}
	{initialData}
	{onSubmit}
	{onDelete}
	{onClose}
>
	<!-- Optional named slots -->
	<div slot="header">
		<!-- Custom header if needed -->
	</div>
	<div slot="before-form">
		<!-- Content before form -->
	</div>
	<div slot="after-form">
		<!-- Content after form, before buttons -->
	</div>
</FormModal>
```

**Mobile vs Desktop Actions**:

- **Mobile** (sm:hidden): Stacked buttons with submit at top
- **Desktop** (hidden sm:flex): Delete on left, Cancel/Submit on right

---

## 6. Form Input Components

### TextInput Component

**File**: `/apps/web/src/lib/components/ui/TextInput.svelte`

**Props**:

```typescript
value?: string | number
size?: 'sm' | 'md' | 'lg'
error?: boolean
required?: boolean
disabled?: boolean
icon?: LucideIcon
iconPosition?: 'left' | 'right'
errorMessage?: string
helperText?: string
type?: string (all HTML input types supported)
class?: string
```

**Styling**:

- Border: 1px gray-300 / dark:gray-600
- Focus: ring-2 ring-blue-500 (or ring-red-500 if error)
- Rounded: rounded-lg
- Dark background: dark:bg-gray-800
- Minimum height: 44px for WCAG AA compliance

**With Icon Support**:

- Icons positioned absolutely within relative container
- Padding adjusts automatically (pl-9/11/12 or pr-9/11/12)
- Icon opacity: text-gray-400 dark:text-gray-500

### Textarea Component

**File**: `/apps/web/src/lib/components/ui/Textarea.svelte`

**Props**:

```typescript
value?: string
size?: 'sm' | 'md' | 'lg'
error?: boolean
required?: boolean
disabled?: boolean
autoResize?: boolean
maxRows?: number
rows?: number
errorMessage?: string
helperText?: string
class?: string
```

**Features**:

- Resizable (resize-y by default)
- Auto-resize support (calculates scroll height)
- Custom scrollbar styling (webkit)
- Line-height aware height calculations
- Smooth transitions for auto-resize
- Same dark mode support as TextInput

### Select Component

**File**: `/apps/web/src/lib/components/ui/Select.svelte`

**Props**:

```typescript
value?: string | number
size?: 'sm' | 'md' | 'lg'
error?: boolean
required?: boolean
disabled?: boolean
placeholder?: string
errorMessage?: string
helperText?: string
class?: string
```

**Features**:

- Custom styling with ChevronDown icon overlay
- Removes default browser appearance
- Platform-specific option styling (dark mode support)
- Accessible placeholder (disabled, hidden option)

---

## 7. Form Field Wrapper Component

**File**: `/apps/web/src/lib/components/ui/FormField.svelte`

**Props**:

```typescript
label?: string
labelFor?: string
error?: string
hint?: string
required?: boolean
showOptional?: boolean
uppercase?: boolean
class?: string
```

**Features**:

- Layout space for error/hint (prevents layout shift)
- Uppercase label option (tracking-wider)
- Required indicator (\*) or (optional) text
- Icon support for error/hint messages
- Proper role="alert" and aria-live="polite" for errors

---

## 8. Status Indicator Components

### Badge Component

**File**: `/apps/web/src/lib/components/ui/Badge.svelte`

**Props**:

```typescript
variant?: 'success' | 'warning' | 'error' | 'info'
size?: 'sm' | 'md' | 'lg'
class?: string
```

**Sizes**:

- `sm`: px-2 py-1 text-xs
- `md`: px-2.5 py-1.5 text-sm
- `lg`: px-3 py-2 text-base

**Variant Colors**:

- `success`: green-100 dark:green-900/30
- `warning`: amber-100 dark:amber-900/30
- `error`: red-100 dark:red-900/30
- `info`: blue-100 dark:blue-900/30

**Features**:

- Optional icon slot
- Inline-flex display
- Border adds visual definition

### Alert Component

**File**: `/apps/web/src/lib/components/ui/Alert.svelte`

**Props**:

```typescript
variant?: 'info' | 'success' | 'warning' | 'error'
title?: string
description?: string
closeable?: boolean
onClose?: () => void
class?: string
```

**Features**:

- Automatic icon selection per variant
- Flexbox layout with icon + content
- Closeable with X button
- Proper ARIA: role="alert", aria-live="polite"
- Full dark mode support

**Usage**:

```svelte
<Alert variant="error" title="Error" description="Something went wrong" closeable={true} />
<Alert variant="success">Changes saved successfully</Alert>
```

---

## 9. Color System and Theming

### Brand Colors

**Primary Gradient** (Blue to Purple):

```css
from-blue-600 to-purple-600  /* Solid */
from-blue-50 to-purple-50    /* Light variant */
from-blue-950/30 to-purple-950/30  /* Dark mode */
```

### Status Color System

All status colors follow pattern: Light variant + Dark opacity variant

**Success (Green/Emerald)**:

- Light: from-emerald-50 to-green-50
- Dark: from-emerald-900/20 to-green-900/20

**Warning (Amber/Yellow)**:

- Light: from-amber-50 to-yellow-50
- Dark: from-amber-900/20 to-yellow-900/20

**Error (Red/Rose)**:

- Light: from-rose-50 to-red-50
- Dark: from-rose-900/20 to-red-900/20

**Info (Blue/Indigo)**:

- Light: from-blue-50 to-indigo-50
- Dark: from-blue-900/20 to-indigo-900/20

### Text Colors

**Light Mode**:

- Primary: text-gray-900
- Secondary: text-gray-700
- Tertiary: text-gray-600
- Muted: text-gray-500
- Subtle: text-gray-400

**Dark Mode**: Invert appropriately with `dark:` prefix

---

## 10. Spacing and Layout System

### Base 8px Grid

```css
$space-1: 0.25rem; /* 4px */
$space-2: 0.5rem; /* 8px */
$space-3: 0.75rem; /* 12px */
$space-4: 1rem; /* 16px - Base unit */
$space-6: 1.5rem; /* 24px */
$space-8: 2rem; /* 32px */
$space-12: 3rem; /* 48px */
```

### Container Widths

- `.container-xs`: max-w-md (448px) - Forms, modals
- `.container-sm`: max-w-2xl (672px) - Articles
- `.container-md`: max-w-3xl (768px) - Content
- `.container-lg`: max-w-4xl (896px) - Wide content
- `.container-xl`: max-w-6xl (1152px) - Main layouts
- `.container-2xl`: max-w-7xl (1280px) - Full width

### Responsive Breakpoints

- `sm`: 640px (mobile landscape)
- `md`: 768px (tablet)
- `lg`: 1024px (desktop)
- `xl`: 1280px (large desktop)

**Mobile-First Pattern**:

```html
<div class="px-4 sm:px-6 lg:px-8">
	<h1 class="text-2xl sm:text-3xl lg:text-4xl">Responsive Heading</h1>
</div>
```

---

## 11. Dark Mode Implementation

**Critical Rules**:

1. ALWAYS provide dark variants using `dark:` prefix
2. Use opacity modifiers for dark backgrounds: `/20`, `/30`, `/40`
3. Invert gray scale appropriately
4. Maintain 4.5:1 contrast ratio in both modes

**Common Patterns**:

```scss
/* Background */
.bg-primary {
	@apply bg-white dark:bg-gray-900;
}

/* Text */
.text-primary {
	@apply text-gray-900 dark:text-white;
}

/* Borders */
.border-primary {
	@apply border-gray-200 dark:border-gray-700;
}

/* Gradients - use opacity for dark */
.gradient-primary {
	@apply bg-gradient-to-r from-blue-50 to-purple-50
         dark:from-blue-950/30 dark:to-purple-950/30;
}
```

**Focus Ring Offset** (dark mode CSS):

```css
:global(.dark) input:focus {
	--tw-ring-offset-color: rgb(31 41 55); /* gray-800 */
}
```

---

## 12. Responsive Design Patterns

### Text Sizing

```html
<h1 class="text-2xl sm:text-3xl lg:text-4xl">Responsive Heading</h1>
```

### Padding

```html
<div class="px-4 sm:px-6 lg:px-8">Responsive padding</div>
```

### Grid Layouts

```html
<!-- 1 column mobile, 2 on tablet, 3 on desktop -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
	<!-- Grid items -->
</div>
```

### Show/Hide

```html
<div class="hidden sm:block">Desktop only</div>
<div class="sm:hidden">Mobile only</div>
```

---

## 13. Animations and Transitions

### Timing

- **Fast**: 200ms (micro-interactions)
- **Base**: 300ms (standard transitions) - DEFAULT
- **Slow**: 500ms (complex animations)

### Hover Effects

**Lift Card**:

```html
<div class="hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
	<!-- Content -->
</div>
```

**Scale Hover**:

```html
<div class="hover:scale-105 transition-transform duration-200">
	<!-- Content -->
</div>
```

**Icon Hover**:

```html
<div class="group-hover:scale-110 transition-transform duration-200">
	<!-- Icon -->
</div>
```

### Loading States

- Spinner: `animate-spin` (on LoaderCircle)
- Skeleton: `animate-pulse` with bg-gray-200 dark:bg-gray-700

---

## 14. Accessibility Requirements (WCAG AA)

**Checklist for all new components**:

- Touch targets: All interactive elements ≥ 44×44px
- Contrast: Text ≥ 4.5:1 ratio (AA standard)
- ARIA attributes: aria-invalid, aria-required, aria-describedby
- Error display: role="alert" with aria-live="polite"
- Dark mode: All colors have dark: variants
- Focus states: Visible focus rings with 2px ring
- Keyboard navigation: All features accessible via keyboard

---

## 15. Typography Scale

### Display (Heroes)

- **display-1**: text-6xl font-bold (56px)
- **display-2**: text-5xl font-bold (48px)
- **display-3**: text-4xl font-bold (36px)

### Headings

- **heading-1**: text-3xl font-bold (30px) - Page titles
- **heading-2**: text-2xl font-bold (24px) - Section headers
- **heading-3**: text-xl font-semibold (20px) - Subsections
- **heading-4**: text-lg font-semibold (18px) - Card titles
- **heading-5**: text-base font-medium (16px) - Minor headings

### Body Text

- **body-large**: text-lg (18px) - Prominent text
- **body-base**: text-base (16px) - Default
- **body-small**: text-sm (14px) - Secondary text
- **caption**: text-xs (12px) - Labels, metadata

### Font Weights

- Bold (700): Primary headings, CTAs
- Semibold (600): Secondary headings, emphasis
- Medium (500): Labels, subtle emphasis
- Normal (400): Body text

---

## 16. CRUD Implementation Pattern (Complete Example)

### Example: Project Management

**Directory Structure**:

```
src/lib/components/projects/
├── ProjectsList.svelte        (List view)
├── ProjectCard.svelte         (Card component)
├── EditProjectModal.svelte    (Edit modal)
└── DeleteConfirmation.svelte  (Delete modal)

src/lib/services/
└── project.service.ts         (API calls)

src/routes/api/projects/
└── +server.ts                 (API endpoints)
```

**List Component with Card Display**:

```svelte
<script lang="ts">
	import { Card, CardBody, Button } from '$lib/components/ui';
	import ProjectCard from './ProjectCard.svelte';

	let projects = $state([]);
	let selectedProjectId = $state<string | null>(null);
	let showEditModal = $state(false);

	async function handleDelete(id: string) {
		await projectService.delete(id);
		projects = projects.filter((p) => p.id !== id);
	}

	function openEdit(id: string) {
		selectedProjectId = id;
		showEditModal = true;
	}
</script>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
	{#each projects as project (project.id)}
		<Card variant="interactive" hoverable={true}>
			<CardBody padding="md">
				<div class="flex items-start justify-between mb-2">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
						{project.name}
					</h3>
				</div>
				<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
					{project.description}
				</p>
				<div class="flex gap-2">
					<Button size="sm" variant="outline" on:click={() => openEdit(project.id)}>
						Edit
					</Button>
					<Button size="sm" variant="danger" on:click={() => handleDelete(project.id)}>
						Delete
					</Button>
				</div>
			</CardBody>
		</Card>
	{/each}
</div>
```

**Edit Modal using FormModal**:

```svelte
<script lang="ts">
	import { FormModal } from '$lib/components/ui';
	import { projectService } from '$lib/services/project.service';

	export let isOpen = false;
	export let selectedProjectId: string | null = null;

	let selectedProject = null;

	const formConfig = {
		name: {
			label: 'Project Name',
			type: 'text',
			required: true,
			placeholder: 'Enter project name'
		},
		description: {
			label: 'Description',
			type: 'textarea',
			required: false,
			placeholder: 'Project description',
			rows: 4
		},
		status: {
			label: 'Status',
			type: 'select',
			required: true,
			options: ['planning', 'active', 'completed']
		}
	};

	async function handleSubmit(data) {
		if (selectedProjectId) {
			await projectService.update(selectedProjectId, data);
		} else {
			await projectService.create(data);
		}
	}

	async function handleDelete(id) {
		await projectService.delete(id);
	}

	$effect(() => {
		if (selectedProjectId && isOpen) {
			selectedProject = projectService.getById(selectedProjectId);
		}
	});
</script>

<FormModal
	{isOpen}
	title={selectedProjectId ? 'Edit Project' : 'New Project'}
	submitText={selectedProjectId ? 'Update' : 'Create'}
	loadingText="Saving..."
	{formConfig}
	initialData={selectedProject || {}}
	{onSubmit}
	onDelete={selectedProjectId ? handleDelete : null}
	onClose={() => {
		isOpen = false;
		selectedProjectId = null;
	}}
/>
```

---

## 17. Summary: Implementation Checklist for New Components

When creating a new UI component or CRUD feature:

1. **Use Card System**
    - [ ] Wrap content in Card component
    - [ ] Use CardHeader for titles/icons
    - [ ] Use CardBody for main content
    - [ ] Use CardFooter for actions

2. **Responsive Design**
    - [ ] Mobile-first approach
    - [ ] Test on multiple screen sizes
    - [ ] Use Tailwind breakpoints (sm:, md:, lg:)

3. **Dark Mode**
    - [ ] All colors have dark: variants
    - [ ] Test contrast ratios in both modes
    - [ ] Use opacity modifiers for dark: /20, /30, /40

4. **Accessibility**
    - [ ] Minimum 44x44px touch targets
    - [ ] 4.5:1 contrast ratio
    - [ ] Proper ARIA labels and roles
    - [ ] Focus states visible with ring-2

5. **Forms**
    - [ ] Use FormModal for CRUD modals
    - [ ] Use FormField wrapper for labels/errors
    - [ ] Validate required fields
    - [ ] Show error messages with role="alert"
    - [ ] Support loading states

6. **Buttons**
    - [ ] Primary actions: variant="primary" (gradient)
    - [ ] Secondary actions: variant="secondary"
    - [ ] Destructive: variant="danger"
    - [ ] Support loading state
    - [ ] Minimum size="md"

7. **Status Indicators**
    - [ ] Use Badge for status tags
    - [ ] Use Alert for system messages
    - [ ] Support closeable on alerts

8. **Animations**
    - [ ] Smooth transitions (duration-300)
    - [ ] Hover effects on interactive elements
    - [ ] Loading spinners for async operations

9. **Documentation**
    - [ ] Document component usage
    - [ ] Include prop descriptions
    - [ ] Provide usage examples

---

## Key Files Reference

| Component   | File                                                | Purpose               |
| ----------- | --------------------------------------------------- | --------------------- |
| Card System | `/src/lib/components/ui/Card*.svelte`               | Layout containers     |
| Button      | `/src/lib/components/ui/Button.svelte`              | CTAs and actions      |
| Modal       | `/src/lib/components/ui/Modal.svelte`               | Dialog base           |
| FormModal   | `/src/lib/components/ui/FormModal.svelte`           | CRUD forms            |
| Form Inputs | `/src/lib/components/ui/TextInput.svelte`           | Text inputs           |
| Textarea    | `/src/lib/components/ui/Textarea.svelte`            | Multi-line text       |
| Select      | `/src/lib/components/ui/Select.svelte`              | Dropdowns             |
| FormField   | `/src/lib/components/ui/FormField.svelte`           | Label + error wrapper |
| Badge       | `/src/lib/components/ui/Badge.svelte`               | Status indicators     |
| Alert       | `/src/lib/components/ui/Alert.svelte`               | Messages              |
| Style Guide | `/docs/technical/components/BUILDOS_STYLE_GUIDE.md` | Master reference      |
