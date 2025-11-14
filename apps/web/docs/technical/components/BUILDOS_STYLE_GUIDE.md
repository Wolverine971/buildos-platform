<!-- apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md -->

# BuildOS Style Guide

> A comprehensive design system for BuildOS - High-end Apple-inspired design with ADHD-optimized UX

**📍 Status**: Phase 3 Complete - Badge & Alert components added (v1.2.0)
**✅ Design Health Score**: 92/100
**🔗 Related**: See [DESIGN_REFACTOR_STATUS.md](./DESIGN_REFACTOR_STATUS.md) for refactoring progress and implementation guidance.

## Design Philosophy

BuildOS follows a **premium Apple-inspired aesthetic** with subtle gradients, generous whitespace, and smooth animations. The design prioritizes clarity, focus, and reduced cognitive load for ADHD users while maintaining a sophisticated, modern appearance.

### Core Principles

1. **Clarity First**: Every element should have a clear purpose and visual hierarchy
2. **Subtle Sophistication**: Use gradients and shadows sparingly but effectively
3. **Consistent Motion**: Smooth, predictable animations that don't distract
4. **Accessible by Default**: All components meet WCAG AA standards
5. **Progressive Disclosure**: Complex information revealed gradually

---

## Color System

### Brand Colors

#### Primary Palette (Blue to Purple Gradient)

```scss
// Core brand gradient
$gradient-primary: from-blue-600 to-purple-600;
$gradient-primary-hover: from-blue-700 to-purple-700;

// Light variants
$gradient-primary-light: from-blue-50 to-purple-50;
$gradient-primary-subtle: from-blue-50/50 to-purple-50/50;

// Dark mode
$gradient-primary-dark: from-blue-950/30 to-purple-950/30;
```

**Usage**: Primary actions, key CTAs, brand elements

#### Status Colors

##### Success (Green/Emerald)

```scss
$success-gradient: from-emerald-50 to-green-50;
$success-text: text-emerald-700;
$success-border: border-emerald-200;
$success-dark: from-emerald-900/20 to-green-900/20;
```

##### Warning (Amber/Yellow)

```scss
$warning-gradient: from-amber-50 to-yellow-50;
$warning-text: text-amber-700;
$warning-border: border-amber-200;
$warning-dark: from-amber-900/20 to-yellow-900/20;
```

##### Error (Red/Rose)

```scss
$error-gradient: from-rose-50 to-red-50;
$error-text: text-rose-700;
$error-border: border-rose-200;
$error-dark: from-rose-900/20 to-red-900/20;
```

##### Info (Blue/Indigo)

```scss
$info-gradient: from-blue-50 to-indigo-50;
$info-text: text-blue-700;
$info-border: border-blue-200;
$info-dark: from-blue-900/20 to-indigo-900/20;
```

### Text Colors

#### Light Mode

```scss
$text-primary: text-gray-900; // Headings, important content
$text-secondary: text-gray-700; // Body text
$text-tertiary: text-gray-600; // Descriptions
$text-muted: text-gray-500; // Labels, metadata
$text-subtle: text-gray-400; // Disabled, hints
```

#### Dark Mode

```scss
$text-primary-dark: text-white;
$text-secondary-dark: text-gray-300;
$text-tertiary-dark: text-gray-400;
$text-muted-dark: text-gray-500;
$text-subtle-dark: text-gray-600;
```

### Implementation Rules

- **Always** provide dark mode variants using `dark:` prefix
- **Use gradients** for primary actions and key visual elements
- **Use solid colors** for secondary elements and data displays
- **Maintain 4.5:1 contrast ratio** for all text

---

## Typography

### Font Stack

```css
font-family:
	-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', system-ui,
	sans-serif;
```

### Type Scale

#### Display (Heroes & Landing Pages)

```scss
.text-display-1 {
	@apply text-6xl font-bold leading-tight;
} // 56px
.text-display-2 {
	@apply text-5xl font-bold leading-tight;
} // 48px
.text-display-3 {
	@apply text-4xl font-bold;
} // 36px
```

#### Headings

```scss
.heading-1 {
	@apply text-3xl font-bold;
} // 30px - Page titles
.heading-2 {
	@apply text-2xl font-bold;
} // 24px - Section headers
.heading-3 {
	@apply text-xl font-semibold;
} // 20px - Subsections
.heading-4 {
	@apply text-lg font-semibold;
} // 18px - Card titles
.heading-5 {
	@apply text-base font-medium;
} // 16px - Minor headings
```

#### Body Text

```scss
.body-large {
	@apply text-lg;
} // 18px - Prominent body text
.body-base {
	@apply text-base;
} // 16px - Default body text
.body-small {
	@apply text-sm;
} // 14px - Secondary text
.caption {
	@apply text-xs;
} // 12px - Labels, metadata
```

### Font Weights

- **Bold (700)**: Primary headings, CTAs
- **Semibold (600)**: Secondary headings, emphasis
- **Medium (500)**: Labels, subtle emphasis
- **Normal (400)**: Body text

### Usage Guidelines

- **Limit font sizes** per page: Maximum 4 different sizes
- **Consistent hierarchy**: Never skip heading levels
- **Line height**: Use `leading-relaxed` for body text
- **Letter spacing**: Use `tracking-tight` only for display text

---

## Spacing System

### Base Unit

Our spacing system is based on an 8px grid with half-steps where needed.

### Spacing Scale

```scss
$space-0: 0; // 0px
$space-1: 0.25rem; // 4px
$space-2: 0.5rem; // 8px
$space-3: 0.75rem; // 12px
$space-4: 1rem; // 16px - Base unit
$space-6: 1.5rem; // 24px
$space-8: 2rem; // 32px
$space-12: 3rem; // 48px
$space-16: 4rem; // 64px
$space-20: 5rem; // 80px
```

### Component Spacing

#### Padding Standards

```scss
// Buttons
.btn-sm {
	@apply px-3 py-2;
} // 12px / 8px
.btn-md {
	@apply px-4 py-2.5;
} // 16px / 10px
.btn-lg {
	@apply px-6 py-3;
} // 24px / 12px

// Cards
.card {
	@apply p-4 sm:p-6 lg:p-8;
} // Responsive padding

// Sections
.section {
	@apply py-20 px-4 sm:px-6 lg:px-8;
}
```

#### Margin Patterns

```scss
// Text hierarchy
.mb-text-xs {
	@apply mb-2;
} // 8px - Small elements
.mb-text-sm {
	@apply mb-4;
} // 16px - Paragraphs
.mb-text-md {
	@apply mb-6;
} // 24px - Section headers
.mb-text-lg {
	@apply mb-8;
} // 32px - Major sections
```

#### Gap Utilities

```scss
// Flex/Grid gaps
.gap-tight {
	@apply gap-2;
} // 8px
.gap-base {
	@apply gap-4;
} // 16px - Default
.gap-loose {
	@apply gap-6;
} // 24px
.gap-extra {
	@apply gap-8;
} // 32px
```

---

## Layout System

### Container Widths

```scss
.container-xs {
	@apply max-w-md mx-auto;
} // 448px - Forms, modals
.container-sm {
	@apply max-w-2xl mx-auto;
} // 672px - Articles
.container-md {
	@apply max-w-3xl mx-auto;
} // 768px - Content
.container-lg {
	@apply max-w-4xl mx-auto;
} // 896px - Wide content
.container-xl {
	@apply max-w-6xl mx-auto;
} // 1152px - Main layouts
.container-2xl {
	@apply max-w-7xl mx-auto;
} // 1280px - Full width
```

### Responsive Breakpoints

```scss
$breakpoint-sm: 640px; // Mobile landscape
$breakpoint-md: 768px; // Tablet
$breakpoint-lg: 1024px; // Desktop
$breakpoint-xl: 1280px; // Large desktop
```

### Grid System

```scss
// Responsive grid patterns
.grid-responsive-2 {
	@apply grid grid-cols-1 md:grid-cols-2 gap-6;
}
.grid-responsive-3 {
	@apply grid grid-cols-1 md:grid-cols-3 gap-6;
}
.grid-responsive-4 {
	@apply grid grid-cols-2 lg:grid-cols-4 gap-6;
}
```

### Standard Layout Pattern

```html
<section class="py-20 px-4 sm:px-6 lg:px-8">
	<div class="max-w-6xl mx-auto">
		<!-- Content -->
	</div>
</section>
```

---

## Components

### Buttons

#### Variants

```scss
// Primary - Gradient with solid border
.btn-primary {
	@apply bg-gradient-to-r from-blue-50 to-purple-50
         text-blue-700 border-2 border-blue-600
         hover:from-blue-100 hover:to-purple-100
         hover:border-purple-600 hover:text-purple-700;
}

// Secondary - Subtle gradient
.btn-secondary {
	@apply bg-gradient-to-r from-indigo-50 to-cyan-50
         text-indigo-700 border-2 border-indigo-400;
}

// Ghost - Minimal style
.btn-ghost {
	@apply bg-transparent text-gray-700
         hover:bg-gradient-to-br hover:from-gray-50 hover:to-slate-50;
}
```

**Decision**: Use gradient buttons for primary actions, solid for secondary

### Cards (Component System)

#### New Card System (v1.1.0+)

BuildOS now uses a composable Card component system for consistency and maintainability:

**Base Components**:

- `Card.svelte` - Container with 4 variants
- `CardHeader.svelte` - Optional header section with 3 styling variants
- `CardBody.svelte` - Content area with responsive padding
- `CardFooter.svelte` - Optional footer section

**Card Variants**: `default`, `elevated`, `interactive`, `outline`
**CardHeader Variants**: `default`, `gradient`, `accent`
**Padding Options**: `sm`, `md`, `lg`

```svelte
<!-- Modern approach -->
<Card variant="elevated">
	<CardHeader variant="accent">
		<div class="flex items-center gap-2">
			<Icon class="h-5 w-5" />
			<h3>Card Title</h3>
		</div>
	</CardHeader>
	<CardBody padding="md">
		<!-- Content here -->
	</CardBody>
	<CardFooter>
		<!-- Optional footer -->
	</CardFooter>
</Card>
```

**Legacy Card Classes** (for reference):

```scss
.card {
	@apply bg-white dark:bg-gray-800
         rounded-xl p-6
         shadow-md hover:shadow-lg
         transition-all duration-300;
}

.card-interactive {
	@apply card hover:scale-105 cursor-pointer;
}

.card-processing {
	@apply bg-gradient-to-br from-blue-50 to-purple-50
         dark:from-blue-900/20 dark:to-purple-900/20;
}
```

**📝 Note**: New components should use the Card system. See [Component Refactoring Guide](#component-refactoring-guide) for migration steps.

### Modals

#### Size Classes

```scss
.modal-sm {
	@apply max-w-md;
} // 448px
.modal-md {
	@apply max-w-2xl;
} // 672px - Default
.modal-lg {
	@apply max-w-4xl;
} // 896px
.modal-xl {
	@apply max-w-6xl;
} // 1152px
```

#### Modal Structure

```html
<div class="modal-backdrop">
	<div class="modal-content rounded-xl shadow-2xl">
		<div class="modal-header bg-gradient-to-r from-purple-50/50 to-pink-50/50">
			<!-- Header content -->
		</div>
		<div class="modal-body p-6">
			<!-- Body content -->
		</div>
		<div class="modal-footer border-t p-4">
			<!-- Actions -->
		</div>
	</div>
</div>
```

### Forms

#### Input Fields

```scss
.input {
	@apply w-full rounded-lg border border-gray-300
         px-4 py-2.5 text-base
         focus:outline-none focus:ring-2 focus:ring-purple-500
         dark:bg-gray-800 dark:border-gray-600;
}
```

#### Field Groups

```html
<div class="form-field mb-6">
	<label class="block text-sm font-medium text-gray-700 mb-2">
		Label <span class="text-red-500">*</span>
	</label>
	<input class="input" />
	<p class="mt-2 text-sm text-gray-500">Help text</p>
</div>
```

---

## Visual Effects

### Border Radius

```scss
$radius-sm: 0.375rem; // 6px - Small elements
$radius-md: 0.5rem; // 8px - Default
$radius-lg: 0.75rem; // 12px - Cards, modals
$radius-xl: 1rem; // 16px - Large elements
$radius-full: 9999px; // Pills, badges
```

### Shadows

```scss
$shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
$shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1); // Default cards
$shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1); // Hover states
$shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1); // Modals
```

### Animations

#### Transitions

```scss
$transition-fast: 200ms; // Micro-interactions
$transition-base: 300ms; // Standard transitions
$transition-slow: 500ms; // Complex animations

// Standard transition
.transition-standard {
	@apply transition-all duration-300 ease-out;
}
```

#### Hover Patterns

```scss
// Card hover
.hover-lift {
	@apply hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300;
}

// Scale hover
.hover-scale {
	@apply hover:scale-105 transition-transform duration-200;
}

// Icon hover
.hover-icon {
	@apply group-hover:scale-110 transition-transform duration-200;
}
```

#### Loading States

```scss
// Spinner
.loading-spinner {
	@apply animate-spin;
}

// Skeleton
.skeleton {
	@apply animate-pulse bg-gray-200 dark:bg-gray-700 rounded;
}
```

---

## Dark Mode

### Implementation Rules

1. **Always provide dark variants** for every color
2. **Use opacity modifiers** for dark backgrounds: `/20`, `/30`, `/40`
3. **Invert gray scale** appropriately
4. **Test contrast ratios** in both modes

### Common Patterns

```scss
// Background
.bg-primary {
	@apply bg-white dark:bg-gray-900;
}

// Text
.text-primary {
	@apply text-gray-900 dark:text-white;
}

// Borders
.border-primary {
	@apply border-gray-200 dark:border-gray-700;
}

// Gradients
.gradient-primary {
	@apply bg-gradient-to-r from-blue-50 to-purple-50
         dark:from-blue-950/30 dark:to-purple-950/30;
}
```

---

## Responsive Design

### Mobile-First Approach

Always design for mobile first, then enhance for larger screens.

### Common Responsive Patterns

#### Text Sizing

```html
<h1 class="text-2xl sm:text-3xl lg:text-4xl">Responsive Heading</h1>
```

#### Padding

```html
<div class="px-4 sm:px-6 lg:px-8">Responsive padding</div>
```

#### Grid Layout

```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
	<!-- Grid items -->
</div>
```

#### Show/Hide

```html
<div class="hidden sm:block">Desktop only</div>
<div class="sm:hidden">Mobile only</div>
```

---

## Accessibility

### Core Requirements

1. **Color Contrast**: Minimum 4.5:1 for normal text, 3:1 for large text
2. **Focus States**: Visible focus rings on all interactive elements
3. **Touch Targets**: Minimum 44x44px for all interactive elements
4. **Screen Readers**: Proper ARIA labels and roles
5. **Keyboard Navigation**: All features accessible via keyboard

### Focus Styles

```scss
.focus-ring {
	@apply focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2;
}
```

### ARIA Patterns

```html
<!-- Loading state -->
<div role="status" aria-live="polite">
	<span class="sr-only">Loading...</span>
</div>

<!-- Required field -->
<input aria-required="true" aria-describedby="field-error" />
```

---

## Component Library Usage

### When to Use Each Component

#### Card System (Primary for Layouts)

**`Card.svelte`** - Container wrapper (required)

- Use `variant="default"` for standard cards
- Use `variant="elevated"` for prominent cards
- Use `variant="interactive"` for clickable cards
- Use `variant="outline"` for minimal styling

**`CardHeader.svelte`** - Optional header section

- Use `variant="default"` for neutral headers
- Use `variant="gradient"` for blue-indigo gradient accent
- Use `variant="accent"` for purple-pink gradient accent

**`CardBody.svelte`** - Main content area (required)

- Use `padding="sm"` for compact spacing
- Use `padding="md"` for standard spacing (recommended)
- Use `padding="lg"` for generous spacing

**`CardFooter.svelte`** - Optional footer section

- Action buttons
- Additional metadata
- Status information

#### Button.svelte

- Primary actions (gradient style)
- Secondary actions (solid colors)
- Destructive actions (danger variant)
- Loading states with spinner

#### Modal.svelte

- Forms and data entry
- Confirmations
- Information display
- Complex workflows

#### Form Components

- Consistent form layouts
- Validation feedback (error messages, aria-invalid)
- Accessible input groups
- Error and helper text support

#### Badge.svelte

**Status Indicators & Labels** - New in Phase 3

```svelte
<!-- Success status -->
<Badge variant="success" size="md">
	<svelte:fragment slot="icon">
		<CheckCircle class="w-3 h-3" />
	</svelte:fragment>
	Completed
</Badge>

<!-- Warning status -->
<Badge variant="warning" size="lg">At Risk</Badge>

<!-- Custom sizes -->
<Badge variant="info" size="sm">v1.0</Badge>
```

**Variants**: `success`, `warning`, `error`, `info`
**Sizes**: `sm` (text-xs), `md` (text-sm), `lg` (text-base)
**Features**:

- Optional icon via named slot
- Full dark mode support
- Semantic color coding
- Compact inline display

**Use Cases**: Status badges, version tags, priority indicators, labels

#### Alert.svelte

**System Messages & Notifications** - New in Phase 3

```svelte
<!-- Info alert with close button -->
<Alert variant="info" title="Update Available" closeable={true} onClose={handleClose}>
	<svelte:fragment slot="icon">
		<Info class="w-5 h-5" />
	</svelte:fragment>
	A new version is available. Update now to get the latest features.
</Alert>

<!-- Success alert with description -->
<Alert variant="success" description="Your changes have been saved successfully." />

<!-- Error alert -->
<Alert variant="error" title="Error">Something went wrong. Please try again.</Alert>
```

**Variants**: `info`, `success`, `warning`, `error`
**Features**:

- Automatic icon selection per variant
- Optional title + description + close button
- Full ARIA support (role="alert", aria-live="polite")
- Callback support for close action

**Use Cases**: Form feedback, system notifications, user confirmations, error messages

---

## Component Refactoring Guide

### Migrating to Card System

**Pattern**: Replace raw `<div>` card structures with the new Card component system.

#### Before (Legacy)

```svelte
<div
	class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md p-6"
>
	<div class="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
		<Icon />
		<h3>Title</h3>
	</div>
	<div class="mt-4">
		<!-- Content -->
	</div>
</div>
```

#### After (Card System)

```svelte
<Card variant="elevated">
	<CardHeader variant="default">
		<div class="flex items-center gap-3">
			<Icon />
			<h3>Title</h3>
		</div>
	</CardHeader>
	<CardBody padding="md">
		<!-- Content -->
	</CardBody>
</Card>
```

#### Benefits

1. **Consistency**: Unified card styling across the application
2. **Maintainability**: Update styling in one place, affects all cards
3. **Accessibility**: Proper structure and spacing built-in
4. **Dark Mode**: Full dark mode support pre-configured
5. **Responsive**: Mobile-first responsive padding included

### Implementation Steps

1. Add imports at top of component
2. Identify the card's structure (header/content/footer)
3. Replace `<div>` with appropriate Card components
4. Choose variant and padding options
5. Remove duplicate styling classes

For detailed refactoring progress and identified components, see [DESIGN_REFACTOR_STATUS.md](./DESIGN_REFACTOR_STATUS.md#phase-3-remaining-refactoring-in-progress).

---

## Implementation Notes

### CSS Framework

- **Tailwind CSS** with custom configuration
- **CSS-in-JS** avoided for performance
- **PostCSS** for optimizations

### Performance Considerations

1. **Lazy load** heavy components
2. **Use CSS containment** for animations
3. **Optimize images** with progressive loading
4. **Minimize bundle size** with tree-shaking

### Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- iOS Safari 14+
- Chrome Android 90+

---

## WCAG AA Compliance Checklist

When implementing new components or updating existing ones:

- ✅ **Touch Targets**: All interactive elements ≥ 44×44px
- ✅ **Contrast Ratios**: Text ≥ 4.5:1 (AA standard)
- ✅ **ARIA Attributes**: Form inputs have aria-invalid, aria-required, aria-describedby
- ✅ **Error Display**: Error messages use role="alert" with aria-live="polite"
- ✅ **Dark Mode**: All colors have dark: variants
- ✅ **Focus States**: Visible focus rings on all interactive elements
- ✅ **Keyboard Navigation**: All features accessible via keyboard

**Status**: See [DESIGN_REFACTOR_STATUS.md](./DESIGN_REFACTOR_STATUS.md#wcag-aa-compliance-status) for current compliance metrics.

## Migration Guide

When adapting existing or new components to this style guide:

### General Component Updates

1. **Audit current styling** against this guide
2. **Update color usage** to match semantic color system
3. **Standardize spacing** using the 8px grid
4. **Ensure dark mode** support
5. **Add proper transitions** for interactions
6. **Test accessibility** with screen readers
7. **Verify responsive behavior** across breakpoints

### Button Migration Example

```svelte
<!-- Before -->
<button class="bg-blue-500 px-2 py-1 text-white"> Click me </button>

<!-- After -->
<Button
	variant="primary"
	size="md"
	class="bg-gradient-to-r from-blue-50 to-purple-50
         text-blue-700 border-2 border-blue-600"
>
	Click me
</Button>
```

### Card Migration Example

```svelte
<!-- Before -->
<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 shadow-md p-6">
	<!-- Content -->
</div>

<!-- After -->
<Card variant="elevated">
	<CardBody padding="md">
		<!-- Content -->
	</CardBody>
</Card>
```

For comprehensive refactoring patterns and migration guides, see [DESIGN_REFACTOR_STATUS.md](./DESIGN_REFACTOR_STATUS.md#phase-3-remaining-refactoring-in-progress).

---

## Decision Log

### Resolved Decisions

1. **Gradient buttons** for primary actions only
2. **Solid backgrounds** for static content
3. **Gradient backgrounds** for processing/active states
4. **text-5xl** as standard hero size
5. **Modal sizes** standardized to 4 sizes (sm, md, lg, xl)

### Pending Decisions

- [ ] Icon size standardization (currently mixed 4x4 and 5x5)
- [ ] Toast notification positioning (top vs bottom)
- [ ] Form validation approach (inline vs summary)

---

## Version History

- **v1.2.0** (2025-10-25): Phase 3 Complete - Added Badge.svelte and Alert.svelte components. Refactored 10 additional components to use Card system. Design health score improved from 79/100 to 92/100. Component library now includes 6 base components.
- **v1.1.0** (2025-10-24): Major update - Added new Card component system with CardHeader/CardBody/CardFooter. Added WCAG AA compliance section. Added refactoring guide and links to DESIGN_REFACTOR_STATUS.md. Design health score improved from 62/100 to 79/100.
- **v1.0.1** (2025-09-27): Updated Button.svelte color refinements for improved contrast
- **v1.0.0** (2025-09-26): Initial style guide creation based on existing patterns
- Last Updated: October 25, 2025

---

## Resources

- [Tailwind CSS Documentation](https://tailwindcss.com)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
