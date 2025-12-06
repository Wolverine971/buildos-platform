<!-- apps/web/src/lib/components/calendar/CalendarTaskEditModal.svelte -->
<script lang="ts">
	import { Save, AlertCircle } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import MarkdownToggleField from '$lib/components/ui/MarkdownToggleField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		generateCalendarTaskFieldConfig,
		validateCalendarTask,
		getFieldGroups,
		type SuggestedTask,
		type CalendarTaskFieldConfig
	} from '$lib/utils/calendar-task-field-config';

	interface Props {
		isOpen: boolean;
		task: SuggestedTask | null;
		onSave: (task: SuggestedTask) => void;
		onClose: () => void;
	}

	let { isOpen, task, onSave, onClose }: Props = $props();

	let editedTask = $state<Partial<SuggestedTask>>({});
	let errors = $state<string[]>([]);

	// Field configurations
	let fieldConfigs = $derived(generateCalendarTaskFieldConfig(editedTask));
	let fieldGroups = $derived(getFieldGroups());

	// Initialize edited task when task prop changes
	$effect(() => {
		if (task) {
			editedTask = { ...task };
		}
	});

	// Helper: Check if field should be displayed
	function shouldDisplayField(field: string): boolean {
		const config = fieldConfigs[field];
		if (!config) return false;

		// Check conditional display logic
		if (config.conditionalDisplay) {
			return config.conditionalDisplay(editedTask);
		}

		return true;
	}

	// Helper: Format date for datetime-local input
	function formatDateTimeLocal(isoString: string | undefined): string {
		if (!isoString) return '';
		try {
			// Convert ISO string to YYYY-MM-DDTHH:MM format
			return new Date(isoString).toISOString().slice(0, 16);
		} catch {
			return '';
		}
	}

	// Helper: Format date for date input
	function formatDate(isoString: string | undefined): string {
		if (!isoString) return '';
		try {
			// Convert ISO string to YYYY-MM-DD format
			return new Date(isoString).toISOString().slice(0, 10);
		} catch {
			return '';
		}
	}

	// Handlers
	function handleSave() {
		errors = validateCalendarTask(editedTask);

		if (errors.length > 0) {
			// Scroll to top to show errors
			return;
		}

		onSave(editedTask as SuggestedTask);
	}

	function handleTagsInput(event: Event) {
		const input = event.target as HTMLInputElement;
		const tags = input.value
			.split(',')
			.map((tag) => tag.trim())
			.filter((tag) => tag);
		editedTask.tags = tags;
	}

	function handleMarkdownUpdate(field: string, newValue: string) {
		editedTask = { ...editedTask, [field]: newValue };
	}

	function handleDateTimeChange(field: string, event: Event) {
		const input = event.target as HTMLInputElement;
		const value = input.value;
		if (value) {
			// Convert to ISO string
			editedTask = { ...editedTask, [field]: new Date(value).toISOString() };
		} else {
			editedTask = { ...editedTask, [field]: undefined };
		}
	}

	function handleDateChange(field: string, event: Event) {
		const input = event.target as HTMLInputElement;
		const value = input.value;
		if (value) {
			// Keep as YYYY-MM-DD format
			editedTask = { ...editedTask, [field]: value };
		} else {
			editedTask = { ...editedTask, [field]: undefined };
		}
	}

	// Render field based on type
	function renderField(field: string, config: CalendarTaskFieldConfig) {
		const fieldId = `calendar-task-${field}`;
		const value = editedTask[field as keyof SuggestedTask];

		return {
			id: fieldId,
			config,
			value
		};
	}
</script>

<Modal {isOpen} {onClose} title="Edit Task" size="lg" closeOnBackdrop={true}>
	{#snippet children()}
		<!-- Form Content -->
		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSave();
			}}
			class="px-4 sm:px-6 py-4 space-y-4"
		>
			<!-- Error Display -->
			{#if errors.length > 0}
				<div
					class="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-md"
					role="alert"
				>
					<div class="flex items-start gap-2">
						<AlertCircle
							class="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0"
						/>
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium text-rose-800 dark:text-rose-200 mb-1">
								Please fix the following errors:
							</p>
							<ul class="text-xs text-rose-700 dark:text-rose-300 space-y-0.5">
								{#each errors as error}
									<li>• {error}</li>
								{/each}
							</ul>
						</div>
					</div>
				</div>
			{/if}
			{#each fieldGroups as group}
				{@const groupFields = group.fields.filter((f) => shouldDisplayField(f))}

				{#if groupFields.length > 0}
					<div class="space-y-3">
						<!-- Group Header -->
						<h4
							class="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2"
						>
							{group.label}
						</h4>

						<!-- Group Fields -->
						{#each groupFields as field}
							{@const config = fieldConfigs[field]}
							{@const fieldId = `calendar-task-${field}`}
							{@const value = editedTask[field as keyof SuggestedTask]}

							<div class="space-y-1">
								{#if config.type === 'textarea'}
									<!-- Textarea Field -->
									<label
										for={fieldId}
										class="block text-xs font-medium text-gray-700 dark:text-gray-300"
									>
										{config.label}
										{#if config.required}
											<span class="text-rose-500 ml-0.5">*</span>
										{/if}
									</label>
									{#if config?.markdown}
										<MarkdownToggleField
											value={(value as string) || ''}
											onUpdate={(newValue) =>
												handleMarkdownUpdate(field, newValue)}
											placeholder={config.placeholder || ''}
											rows={config.rows || 3}
										/>
									{:else}
										<Textarea
											id={fieldId}
											bind:value={editedTask[field as keyof SuggestedTask]}
											rows={config?.rows || 3}
											placeholder={config?.placeholder || ''}
											size="sm"
											class="text-sm"
										/>
									{/if}
								{:else if config.type === 'select'}
									<!-- Select Field -->
									<label
										for={fieldId}
										class="block text-xs font-medium text-gray-700 dark:text-gray-300"
									>
										{config.label}
										{#if config.required}
											<span class="text-rose-500 ml-0.5">*</span>
										{/if}
									</label>
									<Select
										id={fieldId}
										bind:value={editedTask[field as keyof SuggestedTask]}
										size="sm"
										class="text-sm"
									>
										<option value="">Select {config.label}</option>
										{#each config.options || [] as option}
											<option value={option}>
												{option
													.replace(/_/g, ' ')
													.replace(/\b\w/g, (l) => l.toUpperCase())}
											</option>
										{/each}
									</Select>
								{:else if config.type === 'datetime-local'}
									<!-- DateTime Field -->
									<label
										for={fieldId}
										class="block text-xs font-medium text-gray-700 dark:text-gray-300"
									>
										{config.label}
										{#if config.required}
											<span class="text-rose-500 ml-0.5">*</span>
										{/if}
									</label>
									<TextInput
										id={fieldId}
										type="datetime-local"
										value={formatDateTimeLocal(value as string)}
										onchange={(e) => handleDateTimeChange(field, e)}
										size="sm"
										class="text-sm"
									/>
								{:else if config.type === 'date'}
									<!-- Date Field -->
									<label
										for={fieldId}
										class="block text-xs font-medium text-gray-700 dark:text-gray-300"
									>
										{config.label}
										{#if config.required}
											<span class="text-rose-500 ml-0.5">*</span>
										{/if}
									</label>
									<TextInput
										id={fieldId}
										type="date"
										value={formatDate(value as string)}
										onchange={(e) => handleDateChange(field, e)}
										size="sm"
										class="text-sm"
									/>
								{:else if config.type === 'number'}
									<!-- Number Field -->
									<label
										for={fieldId}
										class="block text-xs font-medium text-gray-700 dark:text-gray-300"
									>
										{config.label}
										{#if config.required}
											<span class="text-rose-500 ml-0.5">*</span>
										{/if}
									</label>
									<TextInput
										id={fieldId}
										type="number"
										bind:value={editedTask[field as keyof SuggestedTask]}
										min={config.min}
										max={config.max}
										placeholder={config.placeholder || ''}
										size="sm"
										class="text-sm"
									/>
								{:else if config.type === 'tags'}
									<!-- Tags Field -->
									<label
										for={fieldId}
										class="block text-xs font-medium text-gray-700 dark:text-gray-300"
									>
										{config.label}
										{#if config.required}
											<span class="text-rose-500 ml-0.5">*</span>
										{/if}
									</label>
									<TextInput
										id={fieldId}
										value={Array.isArray(value) ? value.join(', ') : ''}
										oninput={(e) => handleTagsInput(e)}
										placeholder={config.placeholder ||
											'Enter tags separated by commas'}
										size="sm"
										class="text-sm"
									/>
									<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
										Separate tags with commas
									</p>
								{:else if config.readonly}
									<!-- Read-only Field -->
									<label
										for={fieldId}
										class="block text-xs font-medium text-gray-700 dark:text-gray-300"
									>
										{config.label}
									</label>
									<div
										class="px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-gray-600 dark:text-gray-400"
									>
										{value || 'Not linked'}
									</div>
								{:else}
									<!-- Text Field (default) -->
									<label
										for={fieldId}
										class="block text-xs font-medium text-gray-700 dark:text-gray-300"
									>
										{config.label}
										{#if config.required}
											<span class="text-rose-500 ml-0.5">*</span>
										{/if}
									</label>
									<TextInput
										id={fieldId}
										bind:value={editedTask[field as keyof SuggestedTask]}
										placeholder={config.placeholder || ''}
										size="sm"
										class="text-sm"
									/>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			{/each}
		</form>
	{/snippet}
	{#snippet footer()}
		<!-- Footer -->
		<div
			class="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700"
		>
			<Button onclick={onClose} variant="outline" size="sm" class="min-w-[80px]">
				Cancel
			</Button>
			<Button onclick={handleSave} variant="primary" size="sm" class="min-w-[100px]">
				<Save class="w-3.5 h-3.5 mr-1.5" />
				Save Changes
			</Button>
		</div>
	{/snippet}
</Modal>
