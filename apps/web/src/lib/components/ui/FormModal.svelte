<!-- apps/web/src/lib/components/ui/FormModal.svelte -->
<!--
	FormModal Component

	High-level form-specialized modal built on top of Modal.svelte:
	- Automatic form generation from config
	- Built-in validation and error handling
	- 9+ field types (text, textarea, select, date, tags, etc.)
	- Loading states and button management
	- Deep cloning to prevent data mutations
	- Mobile-responsive button layout

	Documentation:
	- 📖 Modal Documentation Hub: /apps/web/docs/technical/components/modals/README.md
	- 🚀 Quick Reference Guide: /apps/web/docs/technical/components/modals/QUICK_REFERENCE.md
	- 🎨 Visual Diagrams: /apps/web/docs/technical/components/modals/VISUAL_GUIDE.md
	- 🔬 Technical Analysis: /apps/web/docs/technical/components/modals/TECHNICAL_ANALYSIS.md
	- 📚 Form Types: /apps/web/src/lib/types/form.ts

	Field Types Supported:
	- text: Single-line text input
	- textarea: Multi-line text (with optional markdown support)
	- select: Dropdown selection
	- date: Date picker
	- datetime: Date and time picker
	- number: Numeric input
	- tags: Comma-separated tags
	- checkbox: Boolean toggle
	- radio: Radio button group

	Props:
	- title: string - Modal title
	- config: FormConfig - Field configuration object
	- initialData?: Record<string, any> - Initial form values
	- onSubmit: (data) => Promise<{success, error?}> - Submit handler
	- onCancel?: () => void - Cancel handler
	- onDelete?: () => Promise<void> - Delete handler
	- submitLabel?: string - Submit button text
	- cancelLabel?: string - Cancel button text
	- deleteLabel?: string - Delete button text
	- isOpen?: boolean - Control visibility
	- loading?: boolean - Loading state
	- error?: string - Error message
	- hideForm?: boolean - Hide form (for custom content)

	Slots:
	- header - Custom header content
	- before-form - Content before form fields
	- after-form - Content after fields, before buttons
	- default - Replace entire form content

	Usage Examples:
	- Ontology Modals: /apps/web/src/lib/components/ontology/*CreateModal.svelte
	- Quick Reference: /apps/web/docs/technical/components/modals/QUICK_REFERENCE.md

	Related:
	- Base Modal: /apps/web/src/lib/components/ui/Modal.svelte
	- Form Config Type: /apps/web/src/lib/types/form.ts
-->
<script lang="ts">
	import {
		AlertCircle,
		Copy,
		Calendar,
		Tag,
		FileText,
		Sparkles,
		Type,
		Hash,
		X
	} from 'lucide-svelte';
	import Modal from './Modal.svelte';
	import MarkdownToggleField from './MarkdownToggleField.svelte';
	import FormField from './FormField.svelte';
	import TextInput from './TextInput.svelte';
	import Textarea from './Textarea.svelte';
	import Select from './Select.svelte';
	import Button from './Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { FormConfig } from '$lib/types/form';
	import type { Snippet } from 'svelte';

	let {
		isOpen,
		title,
		submitText,
		loadingText,
		formConfig,
		initialData = {},
		onSubmit,
		onDelete = null,
		onClose,
		size = 'md',
		customClasses = '',
		header,
		beforeForm,
		afterForm
	}: {
		isOpen: boolean;
		title: string;
		submitText: string;
		loadingText: string;
		formConfig: FormConfig;
		initialData?: Record<string, any>;
		onSubmit: (data: Record<string, any>) => Promise<void>;
		onDelete?: ((id: string) => Promise<void>) | null;
		onClose: () => void;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		customClasses?: string;
		header?: Snippet;
		beforeForm?: Snippet;
		afterForm?: Snippet;
	} = $props();

	let loading = $state(false);
	let errors = $state<string[]>([]);
	let formData = $state<Record<string, any>>({});
	let lastOpenState = $state(false);
	let hasInitialized = $state(false);

	// Deep clone helper that preserves dates and handles edge cases
	function deepClone(obj: any): any {
		if (obj === null || obj === undefined) return obj;
		if (obj instanceof Date) return new Date(obj.getTime());
		if (Array.isArray(obj)) return obj.map((item) => deepClone(item));
		if (typeof obj === 'object') {
			const cloned: Record<string, any> = {};
			for (const key in obj) {
				if (obj.hasOwnProperty(key)) {
					cloned[key] = deepClone(obj[key]);
				}
			}
			return cloned;
		}
		return obj;
	}

	// Initialize form data when modal opens OR when initialData changes
	$effect(() => {
		if (isOpen) {
			// Check if we need to initialize or re-initialize
			const hasData = Object.keys(initialData).length > 0;
			const isFirstOpen = !lastOpenState;
			const dataChanged = hasData && !hasInitialized;

			if (isFirstOpen || dataChanged) {
				// Deep clone initial data to avoid mutations
				formData = deepClone(initialData);
				errors = [];
				hasInitialized = hasData;
			}
		}

		// Reset initialization flag when modal closes
		if (!isOpen && lastOpenState) {
			hasInitialized = false;
		}

		// Track open state changes
		lastOpenState = isOpen;
	});

	async function handleDelete() {
		if ((!formData.id && !initialData.id) || !onDelete) {
			return;
		}

		loading = true;
		errors = [];

		try {
			const idToDelete = formData.id || initialData.id;
			await onDelete(idToDelete);
			// onClose();
		} catch (error) {
			errors = [(error as Error).message || 'Failed to delete.'];
		} finally {
			loading = false;
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		loading = true;
		errors = [];

		// Validate required fields
		const validationErrors: string[] = [];
		for (const [field, config] of Object.entries(formConfig)) {
			if (config.required) {
				const value = formData[field];
				const isEmpty =
					value === undefined ||
					value === null ||
					value === '' ||
					(Array.isArray(value) && value.length === 0) ||
					(typeof value === 'string' && !value.trim());

				if (isEmpty) {
					validationErrors.push(`${config.label} is required`);
				}
			}
		}

		if (validationErrors.length > 0) {
			errors = validationErrors;
			loading = false;
			return;
		}

		try {
			// Create a clean copy of form data
			const submitData = { ...formData };

			// Include ID if it exists
			if (initialData.id) {
				submitData.id = initialData.id;
			}

			await onSubmit(submitData);
			onClose();
		} catch (error) {
			errors = [(error as Error).message || 'An error occurred'];
		} finally {
			loading = false;
		}
	}

	function handleTagsInput(field: string, value: string) {
		const tags = value
			.split(',')
			.map((tag) => tag.trim())
			.filter((tag) => tag);
		formData[field] = tags;
	}

	function handleDateTimeChange(field: string, event: Event) {
		const input = event.target as HTMLInputElement;
		const value = input.value;

		if (value) {
			// Store as ISO string without rounding
			const date = new Date(value);
			formData[field] = date.toISOString();
		} else {
			formData[field] = '';
		}
	}

	function handleClose() {
		if (!loading) {
			onClose();
		}
	}

	function roundToNearestFifteen(date: Date): Date {
		const minutes = date.getMinutes();
		const remainder = minutes % 15;

		// Round to nearest (not always up)
		const roundedMinutes = remainder < 8 ? minutes - remainder : minutes + (15 - remainder);

		const newDate = new Date(date);
		newDate.setMinutes(roundedMinutes, 0, 0);

		return newDate;
	}

	function getFieldValue(field: string): string {
		const value = formData[field];
		const fieldType = formConfig[field]?.type;

		if (fieldType === 'tags' && Array.isArray(value)) {
			return value.join(', ');
		}

		if (fieldType === 'date' && value) {
			// Handle date fields - ensure proper format YYYY-MM-DD
			// If the value is already in YYYY-MM-DD format, return it as-is
			if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
				return value;
			}

			// For other date formats, parse carefully to avoid timezone issues
			const date = new Date(value + 'T12:00:00'); // Use noon to avoid timezone boundary issues
			if (!isNaN(date.getTime())) {
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, '0');
				const day = String(date.getDate()).padStart(2, '0');
				return `${year}-${month}-${day}`;
			}
		}

		if ((fieldType === 'datetime' || fieldType === 'datetime-local') && value) {
			const date = new Date(value);
			if (!isNaN(date.getTime())) {
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, '0');
				const day = String(date.getDate()).padStart(2, '0');
				const hours = String(date.getHours()).padStart(2, '0');
				const minutes = String(date.getMinutes()).padStart(2, '0');
				return `${year}-${month}-${day}T${hours}:${minutes}`;
			}
		}

		return value?.toString() || '';
	}

	// Handle markdown field updates
	function handleMarkdownUpdate(field: string, newValue: string) {
		formData[field] = newValue;
		formData = { ...formData }; // Trigger reactivity
	}

	// Handle standard field changes
	function handleFieldChange(field: string, value: any) {
		formData[field] = value;
		formData = { ...formData }; // Trigger reactivity
	}

	// Get icon for field type/name
	function getFieldIcon(field: string, config: any) {
		if (field === 'context') return FileText;
		if (field === 'executive_summary') return Sparkles;
		if (field.includes('date')) return Calendar;
		if (field === 'tags' || config.type === 'tags') return Tag;
		if (config.type === 'number') return Hash;
		return Type;
	}

	// Copy field value to clipboard
	async function copyFieldValue(field: string) {
		const value = formData[field];
		if (!value) {
			toastService.add({
				type: 'info',
				message: `No ${formConfig[field]?.label?.toLowerCase() || 'content'} to copy`
			});
			return;
		}

		try {
			await navigator.clipboard.writeText(value);
			toastService.add({
				type: 'success',
				message: `${formConfig[field]?.label || 'Content'} copied to clipboard`
			});
		} catch (error) {
			toastService.add({
				type: 'error',
				message: 'Failed to copy to clipboard'
			});
		}
	}
</script>

<Modal {isOpen} onClose={handleClose} title="" {size} {customClasses} closeOnBackdrop={true}>
	{#snippet header()}
		<!-- Inkprint compact header -->
		<div>
			{#if header}
				{@render header()}
			{:else}
				<div class="sm:hidden">
					<div class="modal-grab-handle"></div>
				</div>
				{#if title}
					<div
						class="flex h-12 items-center justify-between gap-2 px-3 sm:px-4 border-b border-border bg-muted/30"
					>
						<h2 class="text-sm font-semibold text-foreground truncate">
							{title}
						</h2>
						<!-- Inkprint close button -->
						<button
							type="button"
							onclick={handleClose}
							disabled={loading}
							class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:border-red-400/50 dark:hover:text-red-400"
							aria-label="Close modal"
						>
							<X class="h-4 w-4" />
						</button>
					</div>
				{/if}
			{/if}
		</div>
	{/snippet}

	{#snippet children()}
		{#if beforeForm}
			{@render beforeForm()}
		{/if}
		<form onsubmit={handleSubmit} class="flex flex-col flex-1 min-h-0">
			{#if errors.length > 0}
				<div
					class="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mx-3 sm:mx-4 mb-3 tx tx-static tx-weak"
				>
					<div class="flex items-start gap-2">
						<AlertCircle
							class="w-4 h-4 text-destructive mt-0.5 flex-shrink-0"
						/>
						<div class="text-xs sm:text-sm text-destructive">
							{#each errors as error}
								<p>{error}</p>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<div
				class="space-y-2 sm:space-y-3 overflow-y-auto px-3 sm:px-4 py-3 sm:py-4 flex-1 min-h-0 bg-muted/30"
			>
				{#each Object.entries(formConfig) as [field, config] (field)}
					{@const FieldIcon = getFieldIcon(field, config)}

					<!-- Inkprint field card - flat design with semantic texture -->
					<div
						class="bg-card border border-border rounded-lg p-3 sm:p-4 shadow-ink tx tx-frame tx-weak"
					>
						<!-- Compact label with icon -->
						<div class="flex items-center justify-between mb-2">
							<div class="flex items-center gap-1.5">
								<FieldIcon class="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground hidden sm:block" />
								<label
									for={`field-${field}`}
									class="text-xs sm:text-sm font-semibold text-foreground uppercase tracking-wider"
								>
									{config.label}
									{#if config.required}
										<span class="text-destructive ml-0.5">*</span>
									{/if}
								</label>
							</div>
							{#if config.copyButton && field === 'context'}
								<Button
									type="button"
									onclick={() => copyFieldValue(field)}
									variant="outline"
									size="sm"
									class="flex items-center gap-1 text-xs"
								>
									<Copy class="w-3 h-3" />
									<span class="hidden sm:inline">Copy</span>
								</Button>
							{/if}
						</div>
						{#if config.description}
							<p class="text-xs text-muted-foreground mb-2">
								{config.description}
							</p>
						{/if}

						<!-- Field content without FormField wrapper to avoid duplicate labels -->
						<div>
							{#if config.type === 'textarea'}
								{#if config.markdown}
									<!-- Markdown textarea (copy button already handled above for context) -->
									<MarkdownToggleField
										value={formData[field] || ''}
										onUpdate={(newValue) =>
											handleMarkdownUpdate(field, newValue)}
										placeholder={config.placeholder || ''}
										rows={config.rows || 3}
										disabled={loading}
									/>
								{:else}
									<!-- Regular textarea -->
									<Textarea
										id={`field-${field}`}
										value={formData[field] || ''}
										oninput={(e) => handleFieldChange(field, e.detail)}
										rows={config.rows || 3}
										disabled={loading}
										placeholder={config.placeholder || ''}
										size="md"
									/>
								{/if}
							{:else if config.type === 'select'}
								<Select
									id={`field-${field}`}
									value={formData[field] || ''}
									onchange={(e) =>
										handleFieldChange(
											field,
											e.detail || (e.target as HTMLSelectElement)?.value
										)}
									disabled={loading}
									size="md"
								>
									<option value="">Select {config.label}</option>
									{#each config.options || [] as option}
										{#if typeof option === 'object' && 'value' in option && 'label' in option}
											<option value={option.value}>
												{option.label}
											</option>
										{:else if typeof option === 'string'}
											<option value={option}>
												{option.charAt(0).toUpperCase() +
													option.slice(1).replace('_', ' ')}
											</option>
										{/if}
									{/each}
								</Select>
							{:else if config.type === 'date'}
								<TextInput
									id={`field-${field}`}
									type="date"
									value={getFieldValue(field)}
									oninput={(e) => handleFieldChange(field, e.detail)}
									disabled={loading}
									size="md"
								/>
							{:else if config.type === 'datetime' || config.type === 'datetime-local'}
								<TextInput
									id={`field-${field}`}
									type="datetime-local"
									value={getFieldValue(field)}
									oninput={(e) => handleDateTimeChange(field, e)}
									disabled={loading}
									size="md"
								/>
							{:else if config.type === 'number'}
								<TextInput
									id={`field-${field}`}
									type="number"
									value={getFieldValue(field)}
									oninput={(e) => {
										const target = e.target as HTMLInputElement | null;
										handleFieldChange(
											field,
											e.detail || target?.valueAsNumber || target?.value
										);
									}}
									min={config.min}
									max={config.max}
									disabled={loading}
									placeholder={config.placeholder || ''}
									size="md"
								/>
							{:else if config.type === 'checkbox'}
								<div class="flex items-center">
									<input
										id={`field-${field}`}
										type="checkbox"
										checked={formData[field] || false}
										aria-invalid={false}
										aria-required={config.required || false}
										aria-describedby={config.description
											? `field-${field}-description`
											: undefined}
										onchange={(e) => {
											const target = e.target as HTMLInputElement | null;
											handleFieldChange(
												field,
												target?.checked ?? target?.value ?? false
											);
										}}
										disabled={loading}
										class="h-4 w-4 text-accent focus:ring-ring border-border rounded bg-card disabled:opacity-50"
									/>
									{#if config.description}
										<label
											id={`field-${field}-description`}
											for={`field-${field}`}
											class="ml-2 text-xs sm:text-sm text-muted-foreground"
										>
											{config.description}
										</label>
									{/if}
								</div>
							{:else if config.type === 'tags'}
								<TextInput
									id={`field-${field}`}
									type="text"
									value={getFieldValue(field)}
									oninput={(e) => handleTagsInput(field, e.detail)}
									disabled={loading}
									placeholder={config.placeholder ||
										'Enter tags separated by commas'}
									size="md"
								/>
							{:else}
								<TextInput
									id={`field-${field}`}
									type="text"
									value={getFieldValue(field)}
									oninput={(e) => handleFieldChange(field, e.detail)}
									disabled={loading}
									placeholder={config.placeholder || ''}
									size="md"
								/>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<!-- Add after-form slot here, before the action buttons -->
			{#if afterForm}
				{@render afterForm()}
			{/if}

			<div
				class="flex flex-col gap-2 sm:gap-3 pt-3 pb-4 sm:pb-3 px-3 sm:px-4 border-t border-border bg-muted/30 safe-area-bottom flex-shrink-0"
			>
				<!-- Mobile Layout: Stack buttons with proper hierarchy -->
				<div class="sm:hidden space-y-2">
					<!-- Primary action at top for mobile -->
					<Button
						type="submit"
						disabled={loading}
						variant="primary"
						size="lg"
						{loading}
						class="w-full font-semibold shadow-sm"
					>
						{loading ? loadingText : submitText}
					</Button>

					<!-- Secondary actions in a row -->
					<div class="grid grid-cols-2 gap-2">
						<Button
							type="button"
							onclick={handleClose}
							disabled={loading}
							variant="ghost"
							size="md"
							class="w-full"
						>
							Cancel
						</Button>
						{#if (formData.id || initialData.id) && onDelete}
							<Button
								type="button"
								onclick={handleDelete}
								disabled={loading}
								variant="danger"
								size="md"
								class="w-full"
							>
								Delete
							</Button>
						{/if}
					</div>
				</div>

				<!-- Desktop Layout: Original horizontal layout -->
				<div class="hidden sm:flex sm:justify-between sm:items-center">
					{#if (formData.id || initialData.id) && onDelete}
						<Button
							type="button"
							onclick={handleDelete}
							disabled={loading}
							variant="danger"
							size="md"
						>
							Delete
						</Button>
					{:else}
						<div></div>
					{/if}

					<div class="flex gap-3">
						<Button
							type="button"
							onclick={handleClose}
							disabled={loading}
							variant="outline"
							size="md"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={loading}
							variant="primary"
							size="md"
							{loading}
						>
							{loading ? loadingText : submitText}
						</Button>
					</div>
				</div>
			</div>
		</form>
	{/snippet}
</Modal>

<style>
	/* Safe area support for iOS */
	.safe-area-bottom {
		padding-bottom: max(1rem, env(safe-area-inset-bottom));
	}

	/* Mobile form input optimization */
	@media (max-width: 640px) {
		:global(.modal-content) {
			max-height: calc(
				100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 2rem
			);
		}
	}
</style>
