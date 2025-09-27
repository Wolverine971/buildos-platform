# Modal Standards & Guidelines

## Overview

All modals in the Build OS application follow a standardized approach for consistency, accessibility, and mobile responsiveness.

## Base Components

### 1. Modal.svelte - Base Modal Component

The foundation for all modals with the following features:

#### Key Features:

- **Mobile-First Design**: Bottom sheet behavior on mobile, centered on desktop
- **Responsive Sizing**: 4 size options (sm, md, lg, xl) with mobile breakpoints
- **Multiple Close Methods**: Close button, backdrop click, escape key
- **Accessibility**: Proper ARIA attributes, focus management
- **Body Scroll Locking**: Prevents background scrolling
- **Dark Mode Support**: Complete dark theme styling

#### Mobile Optimizations:

```svelte
<!-- Mobile: bottom sheet, Desktop: centered -->
<div class="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4">

<!-- Mobile: rounded top only, Desktop: all corners -->
class="rounded-t-lg sm:rounded-lg"

<!-- Mobile: smaller padding, Desktop: standard -->
class="px-4 sm:px-6 py-4"

<!-- Mobile: larger touch targets -->
class="touch-manipulation"
```

### 2. FormModal.svelte - Form-Specific Modal

Built on top of Modal.svelte, specifically for form interactions:

#### Features:

- **Form Validation**: Built-in field validation
- **Multiple Field Types**: text, textarea, select, date, datetime, tags, markdown
- **Mobile-Optimized Actions**: Stacked buttons on mobile, inline on desktop
- **Error Handling**: Consistent error display

#### Mobile Optimizations:

```svelte
<!-- Mobile: stacked buttons, Desktop: inline -->
<div class="flex flex-col sm:flex-row gap-3">

<!-- Mobile: full width buttons with larger touch targets -->
class="w-full sm:w-auto px-4 py-3 sm:py-2 touch-manipulation"

<!-- Mobile: primary action first (visual hierarchy) -->
class="order-1 sm:order-2"
```

## Implementation Guidelines

### 1. Use Base Components

Always use the base Modal or FormModal components instead of creating custom implementations:

```svelte
<!-- ✅ Good: Uses standardized base -->
<Modal {isOpen} {onClose} title="My Modal" size="md">
	<p>Content here</p>
</Modal>

<!-- ❌ Bad: Custom implementation -->
<div class="fixed inset-0 z-50">
	<!-- Custom modal code -->
</div>
```

### 2. Size Guidelines

Choose appropriate sizes based on content:

- **sm (max-w-md)**: Confirmations, simple forms
- **md (max-w-2xl)**: Standard forms, moderate content
- **lg (max-w-4xl)**: Complex forms, detailed content
- **xl (max-w-6xl)**: Full-featured interfaces, data tables

### 3. Close Button Standards

All modals should have accessible close options:

```svelte
<!-- Required props -->
<Modal
  {isOpen}
  {onClose}
  showCloseButton={true}  <!-- Default: true -->
  closeOnBackdrop={true}  <!-- Default: true -->
  closeOnEscape={true}    <!-- Default: true -->
  persistent={false}      <!-- Only true for loading states -->
>
```

### 4. Mobile Touch Targets

All interactive elements must meet minimum touch target sizes:

```svelte
<!-- ✅ Good: 44px+ touch target -->
class="p-2 touch-manipulation" <!-- p-2 = 8px padding = 32px + content -->

<!-- ✅ Better: Explicit larger touch target -->
class="px-4 py-3 sm:py-2 touch-manipulation"

<!-- ❌ Bad: Too small for mobile -->
class="p-1"
```

### 5. Button Hierarchy on Mobile

On mobile, arrange buttons with clear visual hierarchy:

```svelte
<!-- Primary action appears first visually but last in DOM order -->
<div class="flex flex-col sm:flex-row gap-3">
	<button class="order-2 sm:order-1">Cancel</button>
	<button class="order-1 sm:order-2 bg-blue-600">Save</button>
</div>
```

## Component Templates

### Simple Modal Template

```svelte
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';

	export let isOpen = false;
	export let onClose: () => void;
</script>

<Modal {isOpen} {onClose} title="Modal Title" size="md">
	<div class="space-y-4">
		<!-- Content here -->
	</div>

	<div class="flex flex-col sm:flex-row gap-3 pt-4" slot="footer">
		<button
			on:click={onClose}
			class="order-2 sm:order-1 w-full sm:w-auto px-4 py-3 sm:py-2 text-gray-700 bg-white border rounded-lg touch-manipulation"
		>
			Cancel
		</button>
		<button
			class="order-1 sm:order-2 w-full sm:w-auto px-4 py-3 sm:py-2 text-white bg-blue-600 rounded-lg touch-manipulation"
		>
			Confirm
		</button>
	</div>
</Modal>
```

### Form Modal Template

```svelte
<script lang="ts">
	import FormModal from '$lib/components/ui/FormModal.svelte';
	import type { FormConfig } from '$lib/types/form';

	export let isOpen = false;
	export let onClose: () => void;

	const formConfig: FormConfig = {
		name: {
			type: 'text',
			label: 'Name',
			required: true,
			placeholder: 'Enter name...'
		},
		description: {
			type: 'textarea',
			label: 'Description',
			rows: 4,
			markdown: true
		}
	};

	let initialData = {};

	async function handleSubmit(formData: Record<string, any>) {
		// Handle form submission
		onClose();
	}
</script>

<FormModal
	{isOpen}
	title="Form Title"
	submitText="Save"
	loadingText="Saving..."
	{formConfig}
	{initialData}
	onSubmit={handleSubmit}
	{onClose}
	size="md"
/>
```

## Accessibility Requirements

### 1. ARIA Attributes

```svelte
<Modal role="dialog" aria-modal="true" aria-labelledby="modal-title">
	<h3 id="modal-title">Modal Title</h3>
</Modal>
```

### 2. Focus Management

- Modal should trap focus within the modal container
- First focusable element should receive focus when opened
- Focus should return to trigger element when closed

### 3. Screen Reader Support

- Provide descriptive titles and labels
- Use proper heading hierarchy
- Include loading states for async operations

## Testing Checklist

### Mobile Testing

- [ ] Modal appears as bottom sheet on mobile
- [ ] Close button is easily tappable (44px+)
- [ ] Buttons stack vertically on small screens
- [ ] Content scrolls properly within modal bounds
- [ ] Backdrop dismissal works on touch

### Desktop Testing

- [ ] Modal appears centered
- [ ] Proper size constraints for different screen sizes
- [ ] Keyboard navigation works (Tab, Escape)
- [ ] Backdrop dismissal works with mouse

### Accessibility Testing

- [ ] Screen reader announces modal properly
- [ ] Focus trapping works correctly
- [ ] All interactive elements are keyboard accessible
- [ ] Color contrast meets WCAG standards

## Common Issues & Solutions

### Issue: Modal Too Tall on Mobile

```svelte
<!-- ✅ Solution: Use max-height and overflow -->
<div class="max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
```

### Issue: Buttons Too Small on Mobile

```svelte
<!-- ✅ Solution: Larger padding and touch-manipulation -->
class="px-4 py-3 sm:py-2 touch-manipulation"
```

### Issue: Modal Doesn't Scroll on Mobile

```svelte
<!-- ✅ Solution: Proper overflow handling -->
<div class="overflow-y-auto flex-1">
```

### Issue: Close Button Hard to Tap

```svelte
<!-- ✅ Solution: Larger touch target -->
class="p-2 touch-manipulation" <!-- Minimum 44px touch target -->
```

## Migration Guide

If you have existing modals that don't follow these standards:

1. **Replace custom modal implementations** with base Modal component
2. **Update button layouts** for mobile stacking
3. **Add touch-manipulation** class to interactive elements
4. **Ensure proper close button implementation**
5. **Test on actual mobile devices**

## Future Considerations

- Consider adding swipe-to-dismiss for mobile
- Implement modal stacking for complex workflows
- Add animation preferences for reduced motion
- Consider adding modal size presets for specific use cases
