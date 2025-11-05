# BuildOS UI Components - Quick Reference Guide

## Essential Imports

```typescript
// Card System (Primary for layouts)
import { Card, CardHeader, CardBody, CardFooter } from '$lib/components/ui';

// Modals
import { Modal, FormModal } from '$lib/components/ui';

// Forms & Inputs
import { TextInput, Textarea, Select, FormField } from '$lib/components/ui';

// Buttons & Controls
import { Button, Badge, Alert } from '$lib/components/ui';

// Icons (Lucide)
import { Plus, Edit2, Trash2, ChevronDown } from 'lucide-svelte';
```

---

## Quick Component Recipes

### Simple Card

```svelte
<Card variant="elevated">
	<CardBody padding="md">
		<h3 class="text-lg font-semibold mb-2">Title</h3>
		<p class="text-sm text-gray-600 dark:text-gray-400">Content here</p>
	</CardBody>
</Card>
```

### Card with Header and Footer

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
		<Button size="sm" variant="primary">Action</Button>
	</CardFooter>
</Card>
```

### Interactive Card Grid

```svelte
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
	{#each items as item (item.id)}
		<Card variant="interactive" hoverable={true}>
			<CardBody padding="md">
				<h3 class="font-semibold mb-2">{item.name}</h3>
				<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">{item.description}</p>
				<div class="flex gap-2">
					<Button size="sm" variant="outline">Edit</Button>
					<Button size="sm" variant="danger">Delete</Button>
				</div>
			</CardBody>
		</Card>
	{/each}
</div>
```

### Form Modal (CRUD)

```svelte
<script lang="ts">
	const formConfig = {
		name: { label: 'Name', type: 'text', required: true },
		email: { label: 'Email', type: 'text', required: true },
		description: { label: 'Description', type: 'textarea', rows: 4 },
		status: { label: 'Status', type: 'select', options: ['active', 'inactive'] }
	};
</script>

<FormModal
	{isOpen}
	title="Edit Item"
	submitText="Save"
	loadingText="Saving..."
	{formConfig}
	{initialData}
	{onSubmit}
	onDelete={handleDelete}
	{onClose}
/>
```

### Button Variants

```svelte
<!-- Primary action (gradient) -->
<Button variant="primary" size="md">Save</Button>

<!-- Secondary action -->
<Button variant="secondary" size="md">Next</Button>

<!-- Destructive action -->
<Button variant="danger" size="md">Delete</Button>

<!-- Minimal action -->
<Button variant="ghost" size="md">Cancel</Button>

<!-- With icon -->
<Button variant="primary" size="md" icon={Plus} iconPosition="left">Add Item</Button>

<!-- Loading state -->
<Button variant="primary" {loading}>
	{loading ? 'Saving...' : 'Save'}
</Button>

<!-- Full width (mobile) -->
<Button variant="primary" size="md" fullWidth={true}>Submit</Button>
```

### Status Badges

```svelte
<!-- Status indicators -->
<Badge variant="success" size="md">Completed</Badge>
<Badge variant="warning" size="md">In Progress</Badge>
<Badge variant="error" size="md">Failed</Badge>
<Badge variant="info" size="md">v1.0</Badge>

<!-- With icon -->
<Badge variant="success" size="md">
	<svelte:fragment slot="icon">
		<CheckCircle class="w-3 h-3" />
	</svelte:fragment>
	Success
</Badge>
```

### Alert Messages

```svelte
<!-- Info alert -->
<Alert variant="info" title="Information" description="This is an info message" />

<!-- Success alert (with close button) -->
<Alert
  variant="success"
  title="Success"
  description="Operation completed successfully"
  closeable={true}
  onClose={() => /* handle close */}
/>

<!-- Error alert -->
<Alert variant="error" title="Error" description="Something went wrong" />

<!-- Warning alert -->
<Alert variant="warning">Be careful with this action!</Alert>
```

### Modal Dialog

```svelte
<Modal {isOpen} {onClose} title="Confirm Action" size="md">
	<div class="px-6 py-4">
		<p class="text-gray-600 dark:text-gray-400 mb-4">Are you sure you want to continue?</p>
	</div>
	<div slot="footer" class="flex justify-end gap-3 px-6 py-4 border-t">
		<Button variant="ghost" on:click={onClose}>Cancel</Button>
		<Button variant="danger" on:click={handleConfirm}>Confirm</Button>
	</div>
</Modal>
```

### Form Inputs with Validation

```svelte
<FormField label="Email" labelFor="email" required={true} error={emailError}>
	<TextInput
		id="email"
		type="email"
		value={email}
		on:input={(e) => (email = e.detail)}
		error={!!emailError}
		errorMessage={emailError}
		placeholder="Enter email"
	/>
</FormField>

<FormField label="Message" labelFor="message" hint="Supports markdown">
	<Textarea
		id="message"
		value={message}
		on:input={(e) => (message = e.detail)}
		rows={4}
		placeholder="Enter message..."
	/>
</FormField>

<FormField label="Category" labelFor="category" required={true}>
	<Select
		id="category"
		value={category}
		on:change={(e) => (category = e.detail)}
		placeholder="Select category"
	>
		<option value="tech">Technology</option>
		<option value="design">Design</option>
		<option value="business">Business</option>
	</Select>
</FormField>
```

### Responsive Grid

```svelte
<!-- 1 column mobile, 2 tablet, 3 desktop, 4 large -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
	{#each items as item}
		<Card>
			<CardBody>{item.name}</CardBody>
		</Card>
	{/each}
</div>
```

### Mobile-First Responsive

```svelte
<div class="px-4 sm:px-6 lg:px-8">
	<h1 class="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4 sm:mb-6 lg:mb-8">
		Responsive Heading
	</h1>

	<div class="hidden sm:block">
		<!-- Desktop content -->
	</div>

	<div class="sm:hidden">
		<!-- Mobile content -->
	</div>
</div>
```

---

## Common Patterns

### CRUD List with Edit Modal

```svelte
<script lang="ts">
	let items = $state([]);
	let showModal = $state(false);
	let selectedItem = $state(null);
	let loading = $state(false);

	const formConfig = {
		name: { label: 'Name', type: 'text', required: true },
		description: { label: 'Description', type: 'textarea' }
	};

	async function handleSubmit(data) {
		loading = true;
		try {
			if (selectedItem?.id) {
				await updateItem(data);
			} else {
				await createItem(data);
			}
			items = await fetchItems();
			showModal = false;
		} finally {
			loading = false;
		}
	}

	async function handleDelete(id) {
		if (confirm('Delete this item?')) {
			await deleteItem(id);
			items = await fetchItems();
			showModal = false;
		}
	}

	function openCreate() {
		selectedItem = null;
		showModal = true;
	}

	function openEdit(item) {
		selectedItem = item;
		showModal = true;
	}
</script>

<!-- List View -->
<div class="space-y-4">
	<Button variant="primary" on:click={openCreate}>Create New</Button>

	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
		{#each items as item (item.id)}
			<Card variant="interactive">
				<CardBody padding="md">
					<h3 class="font-semibold mb-2">{item.name}</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">{item.description}</p>
					<div class="flex gap-2">
						<Button size="sm" variant="outline" on:click={() => openEdit(item)}
							>Edit</Button
						>
						<Button size="sm" variant="danger" on:click={() => handleDelete(item.id)}
							>Delete</Button
						>
					</div>
				</CardBody>
			</Card>
		{/each}
	</div>
</div>

<!-- Edit Modal -->
<FormModal
	isOpen={showModal}
	title={selectedItem ? 'Edit Item' : 'Create Item'}
	submitText={selectedItem ? 'Update' : 'Create'}
	loadingText="Saving..."
	{formConfig}
	initialData={selectedItem || {}}
	onSubmit={handleSubmit}
	onDelete={selectedItem ? handleDelete : null}
	onClose={() => {
		showModal = false;
		selectedItem = null;
	}}
/>
```

---

## Styling Patterns

### Dark Mode

```svelte
<!-- Text -->
<p class="text-gray-900 dark:text-white">Primary text</p>

<!-- Background -->
<div class="bg-white dark:bg-gray-800">Content</div>

<!-- Border -->
<div class="border border-gray-200 dark:border-gray-700">Content</div>

<!-- Gradient -->
<div class="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30">
	Content
</div>
```

### Responsive Spacing

```svelte
<!-- Padding that adjusts at breakpoints -->
<div class="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">Content</div>

<!-- Margin that increases on desktop -->
<div class="mb-4 sm:mb-6 lg:mb-8">Content</div>

<!-- Gap in grids/flex -->
<div class="flex gap-3 sm:gap-4 lg:gap-6">
	<div>Item 1</div>
	<div>Item 2</div>
</div>
```

### Hover & Animations

```svelte
<!-- Lift effect -->
<div class="hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">Content</div>

<!-- Scale effect -->
<div class="hover:scale-105 transition-transform duration-200">Content</div>

<!-- Opacity transition -->
<div class="opacity-70 hover:opacity-100 transition-opacity duration-200">Content</div>
```

---

## Accessibility Checklist

For every component:

- [ ] Touch targets are at least 44x44px
- [ ] Text contrast is at least 4.5:1
- [ ] Form inputs have proper labels
- [ ] Error messages have role="alert"
- [ ] Keyboard navigation works
- [ ] Focus states are visible
- [ ] Dark mode is supported

---

## Performance Tips

1. **Use Card system** - predefined styling avoids CSS bloat
2. **Lazy load heavy components** - modals, grids
3. **Memoize expensive computations** - use $derived
4. **Minimize re-renders** - use proper state management
5. **Responsive images** - use picture or srcset
6. **Bundle size** - tree-shake unused icons

---

## Common Mistakes to Avoid

1. **Not supporting dark mode** - Always add `dark:` variants
2. **Forgetting responsive design** - Test on mobile!
3. **Contrast too low** - Use a contrast checker
4. **Missing ARIA labels** - Accessibility is not optional
5. **Touch targets too small** - Minimum 44x44px
6. **Hardcoded colors** - Use Tailwind classes
7. **Not handling loading states** - Always show feedback
8. **Forgetting error validation** - Display errors prominently

---

## Resources

- **Master Style Guide**: `/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md`
- **Component Patterns**: `/apps/web/docs/technical/components/UI_PATTERNS_AND_CONVENTIONS.md`
- **Tailwind Docs**: https://tailwindcss.com
- **Lucide Icons**: https://lucide.dev
- **WCAG Guidelines**: https://www.w3.org/WAI/WCAG21/quickref/
