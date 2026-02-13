<!-- apps/web/src/lib/components/brain-dump/OperationEditModal.svelte -->
<script lang="ts">
	import { Save, AlertCircle, Plus, Trash2, Code, Database } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import MarkdownToggleField from '$lib/components/ui/MarkdownToggleField.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		generateFieldConfig,
		getFieldConfig,
		getTableFields,
		type FieldConfig
	} from '$lib/utils/field-config-generator';
	import type { ParsedOperation } from '$lib/types/brain-dump';

	interface Props {
		isOpen: boolean;
		operation: ParsedOperation | null;
		onSave: (operation: ParsedOperation) => void;
		onClose: () => void;
	}

	let { isOpen, operation, onSave, onClose }: Props = $props();

	let editedData = $state<Record<string, any>>({});
	let errors = $state<string[]>([]);
	let jsonViewMode = $state<Record<string, boolean>>({});
	let jsonTextValues = $state<Record<string, string>>({});

	// Dynamic field configurations based on database schema and operation type using $derived
	let fieldConfigs = $derived(
		operation
			? generateFieldConfig(
					operation.table,
					getCustomOverrides(),
					operation.operation as 'create' | 'update'
				)
			: {}
	);

	// Custom overrides for specific tables/fields
	function getCustomOverrides(): Record<string, Partial<FieldConfig>> {
		if (!operation) return {};

		const overrides: Record<string, Partial<FieldConfig>> = {};

		switch (operation.table) {
			case 'tasks':
				overrides.title = {
					placeholder: 'Enter a clear, actionable task title'
				};
				overrides.description = {
					placeholder: 'Brief description of what needs to be done'
				};
				overrides.project_id = {
					label: 'Project',
					placeholder: 'Select or enter project ID'
				};
				overrides.duration_minutes = {
					placeholder: '60'
				};
				break;

			case 'notes':
				overrides.title = {
					placeholder: 'Note title (optional if content is provided)'
				};
				overrides.content = {
					placeholder: 'Note content (required if no title)',
					type: 'textarea',
					rows: 5
				};
				overrides.project_id = {
					label: 'Linked Project',
					placeholder: 'Optional: Link to a project'
				};
				break;

			case 'projects':
				overrides.name = {
					placeholder: 'Enter project name (required)'
				};
				overrides.slug = {
					placeholder: 'url-friendly-name (auto-generated from name if empty)'
				};
				overrides.description = {
					placeholder: 'One-line description of the project'
				};
				overrides.context = {
					type: 'textarea',
					label: 'Project Context',
					placeholder:
						'Enter project context in markdown format...\n\n## Goals\nDescribe your goals here\n\n## Current Status\nDescribe current status here',
					rows: 8,
					markdown: true
				};
				overrides.executive_summary = {
					type: 'textarea',
					label: 'Executive Summary',
					placeholder: 'Brief overview of the project goals and current status',
					rows: 3,
					markdown: true
				};
				break;
		}

		return overrides;
	}

	// Initialize edited data when operation changes using $effect
	$effect(() => {
		if (operation) {
			editedData = { ...operation.data };
			jsonViewMode = {};
		}
	});

	// Initialize JSON text values separately after fieldConfigs is ready using $effect
	$effect(() => {
		if (operation && fieldConfigs && Object.keys(fieldConfigs).length > 0) {
			for (const [field, config] of Object.entries(fieldConfigs)) {
				if (config.type === 'jsonb' && editedData[field]) {
					jsonTextValues[field] = JSON.stringify(editedData[field], null, 2);
				}
			}
		}
	});

	// Helper function to check if a field has data
	function fieldHasData(field: string): boolean {
		const value = editedData[field];

		if (value === null || value === undefined || value === '') {
			return false;
		}

		if (Array.isArray(value) && value.length === 0) {
			return false;
		}

		if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
			return false;
		}

		if (typeof value === 'boolean' || typeof value === 'number') {
			return true;
		}

		return true;
	}

	// Get fields to display - show all fields if there are errors, otherwise only fields with data using $derived
	let fieldsToDisplay = $derived(
		operation
			? operation.error
				? getTableFields(operation.table) // Show all fields if there are errors
				: getTableFields(operation.table).filter(
						(field) => fieldHasData(field) || fieldConfigs[field]?.required
					)
			: []
	);

	function handleSave() {
		if (!operation) return;

		errors = [];

		// Special validation for notes table (either title or content required)
		if (operation.table === 'notes' && operation.operation === 'create') {
			if (!editedData.title && !editedData.content) {
				errors.push('Notes must have either a title or content');
			}
		}

		// Validate required fields using dynamic config
		for (const [field, fieldConfig] of Object.entries(fieldConfigs)) {
			if (fieldConfig.required && !editedData[field]) {
				// Special case for slug - auto-generate if missing
				if (field === 'slug' && operation.table === 'projects' && editedData.name) {
					editedData.slug = editedData.name
						.toLowerCase()
						.trim()
						.replace(/[^a-z0-9\s-]/g, '')
						.replace(/\s+/g, '-')
						.replace(/-+/g, '-')
						.replace(/^-+|-+$/g, '');
				} else {
					errors.push(`${fieldConfig.label || field} is required`);
				}
			}
		}

		// Validate JSON fields if in JSON view mode
		for (const [field, config] of Object.entries(fieldConfigs)) {
			if (config.type === 'jsonb' && jsonViewMode[field] && jsonTextValues[field]) {
				try {
					const parsed = JSON.parse(jsonTextValues[field]);
					editedData[field] = parsed;
				} catch (e) {
					errors.push(`${config.label || field} contains invalid JSON`);
				}
			}
		}

		if (errors.length > 0) return;

		// Clear any existing error before saving
		const updatedOperation = {
			...operation,
			data: editedData,
			enabled: true,
			error: undefined
		};

		onSave(updatedOperation);
	}

	function handleTagsInput(field: string, event: Event) {
		const input = event.target as HTMLInputElement;
		const tags = input.value
			.split(',')
			.map((tag) => tag.trim())
			.filter((tag) => tag);
		editedData[field] = tags;
	}

	function handleBooleanInput(field: string, event: Event) {
		const input = event.target as HTMLInputElement;
		editedData[field] = input.checked;
	}

	// Handle markdown updates for fields
	function handleMarkdownUpdate(field: string, newValue: string) {
		editedData[field] = newValue;
		editedData = { ...editedData };
	}

	// Get field configuration for a specific field
	function getFieldConfigForField(field: string): FieldConfig {
		return fieldConfigs[field] || getFieldConfig(operation!.table, field);
	}

	// JSONB field handlers
	function addJsonbField(field: string) {
		if (!editedData[field]) {
			editedData[field] = {};
		}

		const newKey = `new_field_${Date.now()}`;
		editedData[field] = { ...editedData[field], [newKey]: '' };
	}

	function removeJsonbField(field: string, key: string) {
		if (editedData[field] && editedData[field][key] !== undefined) {
			const newData = { ...editedData[field] };
			delete newData[key];
			editedData[field] = newData;
		}
	}

	function updateJsonbKey(field: string, oldKey: string, newKey: string) {
		if (editedData[field] && editedData[field][oldKey] !== undefined && newKey.trim()) {
			const value = editedData[field][oldKey];
			const newData = { ...editedData[field] };
			delete newData[oldKey];
			newData[newKey.trim()] = value;
			editedData[field] = newData;
		}
	}

	function updateJsonbValue(field: string, key: string, value: string) {
		if (!editedData[field]) {
			editedData[field] = {};
		}
		editedData[field] = { ...editedData[field], [key]: value };
	}

	function toggleJsonView(field: string) {
		jsonViewMode[field] = !jsonViewMode[field];

		if (jsonViewMode[field]) {
			jsonTextValues[field] = JSON.stringify(editedData[field] || {}, null, 2);
		} else {
			try {
				if (jsonTextValues[field]) {
					editedData[field] = JSON.parse(jsonTextValues[field]);
				}
			} catch (e) {
				console.warn('Invalid JSON, keeping current data');
			}
		}
	}

	function handleJsonTextChange(field: string, event: Event) {
		const input = event.target as HTMLTextAreaElement;
		jsonTextValues[field] = input.value;
	}
</script>

<Modal {isOpen} {onClose} title="Edit Operation" size="lg">
	{#snippet header()}
		<!-- Compact Header -->
		<div class="px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<Database class="w-5 h-5 text-primary-600 dark:text-primary-400" />
					<div>
						<h3 class="text-base font-semibold text-foreground">Edit Operation</h3>
						<div class="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
							<span class="px-1.5 py-0.5 bg-muted rounded text-xs">
								{operation?.operation}
							</span>
							<span>•</span>
							<span class="font-mono">{operation?.table}</span>
						</div>
					</div>
				</div>
				<Button
					onclick={onClose}
					variant="ghost"
					size="sm"
					class="!p-1.5 -mr-1.5"
					aria-label="Close modal"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</Button>
			</div>

			<!-- Compact Error Display -->
			{#if errors.length > 0}
				<div
					class="mx-4 mt-3 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-md"
					role="alert"
				>
					<div class="flex items-start gap-2">
						<AlertCircle
							class="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0"
						/>
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium text-rose-800 dark:text-rose-200 mb-1">
								Validation errors:
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
		</div>
	{/snippet}
	{#snippet children()}
		{#if operation}
			<!-- Operation Type Banner -->
			{#if operation.error}
				<div
					class="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700"
				>
					<p class="text-sm text-amber-800 dark:text-amber-200">
						<strong>Fix Required Fields:</strong>
						{operation.error}
					</p>
				</div>
			{:else}
				<div
					class="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-700"
				>
					<p class="text-sm text-primary-800 dark:text-primary-200">
						<strong
							>{operation.operation === 'create' ? 'Creating New' : 'Updating'}
							{operation.table}</strong
						>
						{#if operation.operation === 'create'}
							- Fields marked with <span class="text-rose-500">*</span> are required
						{:else}
							- All fields are optional for updates
						{/if}
					</p>
				</div>
			{/if}

			<!-- Compact Form -->
			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSave();
				}}
				class="px-4 sm:px-6 py-4 space-y-3 sm:space-y-4"
			>
				{#if fieldsToDisplay.length === 0}
					<div class="text-center py-8">
						<div
							class="mx-auto w-10 h-10 bg-muted rounded-full flex items-center justify-center mb-3"
						>
							<Database class="w-5 h-5 text-muted-foreground" />
						</div>
						<p class="text-muted-foreground text-sm">No data fields to display</p>
					</div>
				{:else}
					{#each fieldsToDisplay as field}
						{@const config = getFieldConfigForField(field)}
						{@const fieldId = `field-${operation.table}-${field}`}

						<div class="space-y-2">
							{#if config.type === 'textarea'}
								<!-- Compact Textarea -->
								<div>
									<label
										for={fieldId}
										class="block text-xs font-medium text-foreground mb-1"
									>
										{config.label}
										{#if config.required}
											<span class="text-rose-500 ml-0.5">*</span>
										{/if}
									</label>
									{#if config.markdown}
										<MarkdownToggleField
											value={editedData[field] || ''}
											onUpdate={(newValue) =>
												handleMarkdownUpdate(field, newValue)}
											placeholder={config.placeholder || ''}
											rows={Math.min(config.rows || 3, 4)}
										/>
									{:else}
										<Textarea
											id={fieldId}
											bind:value={editedData[field]}
											rows={Math.min(config.rows || 3, 4)}
											placeholder={config.placeholder || ''}
											size="sm"
											class="text-sm"
										/>
									{/if}
								</div>
							{:else if config.type === 'jsonb'}
								<!-- Compact JSONB field -->
								<fieldset>
									<div class="flex items-center justify-between mb-1">
										<legend class="text-xs font-medium text-foreground">
											{config.label}
											{#if config.required}
												<span class="text-rose-500 ml-0.5">*</span>
											{/if}
										</legend>
										<Button
											type="button"
											onclick={() => toggleJsonView(field)}
											variant="ghost"
											size="sm"
											class="text-xs text-muted-foreground hover:text-muted-foreground dark:hover:text-muted-foreground !p-1"
										>
											{#if jsonViewMode[field]}
												<span class="flex items-center space-x-1">
													<span>Form View</span>
												</span>
											{:else}
												<span class="flex items-center space-x-1">
													<Code class="w-3 h-3" />
													<span>JSON View</span>
												</span>
											{/if}
										</Button>
									</div>

									{#if jsonViewMode[field]}
										<!-- Compact JSON Editor -->
										<div class="bg-muted rounded-md border border-border">
											<div class="px-2 py-1.5 border-b border-border">
												<div
													class="flex items-center gap-1 text-xs text-muted-foreground"
												>
													<Code class="w-3 h-3" />
													<span>JSON</span>
												</div>
											</div>
											<Textarea
												id="json-{fieldId}"
												value={jsonTextValues[field] || '{}'}
												oninput={(e) => handleJsonTextChange(field, e)}
												rows={5}
												class="font-mono text-xs border-0 bg-transparent resize-none focus:ring-0 p-2"
												placeholder="Enter valid JSON..."
												size="sm"
											/>
										</div>
									{:else}
										<!-- Compact Form View -->
										<div
											class="bg-muted rounded-md border border-border p-2 space-y-2"
										>
											{#if editedData[field] && typeof editedData[field] === 'object'}
												{#each Object.entries(editedData[field]) as [key, value], index}
													{@const entryId = `jsonb-entry-${fieldId}-${index}`}
													<div class="flex gap-2 items-start group">
														<TextInput
															id="key-{entryId}"
															type="text"
															value={key}
															onblur={(e) =>
																updateJsonbKey(
																	field,
																	key,
																	e.target.value
																)}
															size="sm"
															placeholder="Key"
															class="font-mono text-xs w-24"
														/>
														<TextInput
															id="value-{entryId}"
															type="text"
															{value}
															oninput={(e) =>
																updateJsonbValue(
																	field,
																	key,
																	e.target.value
																)}
															placeholder="Value"
															size="sm"
															class="flex-1 text-xs"
														/>
														<Button
															type="button"
															onclick={() =>
																removeJsonbField(field, key)}
															variant="ghost"
															size="sm"
															class="!p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
															aria-label="Remove field {key}"
														>
															<Trash2 class="w-3 h-3" />
														</Button>
													</div>
												{/each}
											{/if}
											<Button
												type="button"
												onclick={() => addJsonbField(field)}
												variant="outline"
												size="sm"
												class="w-full justify-center text-xs !py-1"
											>
												<Plus class="w-3 h-3 mr-1" />
												Add Field
											</Button>
										</div>
									{/if}
								</fieldset>
							{:else}
								<!-- Compact Other field types -->
								<div>
									<label
										for={fieldId}
										class="block text-xs font-medium text-foreground mb-1"
									>
										{config.label}
										{#if config.required}
											<span class="text-rose-500 ml-0.5">*</span>
										{/if}
									</label>

									{#if config.type === 'select'}
										<Select
											id={fieldId}
											bind:value={editedData[field]}
											size="sm"
											onchange={(e) => (editedData[field] = e)}
											class="text-sm"
										>
											<option value="">Select {config.label}</option>
											{#each config.options || [] as option}
												<option value={option}>{option}</option>
											{/each}
										</Select>
									{:else if config.type === 'date'}
										<TextInput
											id={fieldId}
											type="date"
											bind:value={editedData[field]}
											size="sm"
											class="text-sm"
										/>
									{:else if config.type === 'datetime-local'}
										<TextInput
											id={fieldId}
											type="datetime-local"
											value={editedData[field]
												? new Date(editedData[field])
														.toISOString()
														.slice(0, 16)
												: ''}
											onchange={(e) => {
												const value = e.target.value;
												editedData[field] = value
													? new Date(value).toISOString()
													: null;
											}}
											size="sm"
											class="text-sm"
										/>
									{:else if config.type === 'number'}
										<TextInput
											id={fieldId}
											type="number"
											bind:value={editedData[field]}
											min={config.min}
											max={config.max}
											placeholder={config.placeholder || ''}
											size="sm"
											class="text-sm"
										/>
									{:else if config.type === 'boolean'}
										<div
											class="flex items-center gap-2 p-2 bg-muted rounded-md border border-border"
										>
											<input
												id={fieldId}
												type="checkbox"
												checked={editedData[field] || false}
												onchange={(e) => handleBooleanInput(field, e)}
												class="h-3.5 w-3.5 text-primary-600 focus:ring-primary-500 border-border rounded"
											/>
											<label
												for={fieldId}
												class="text-xs text-foreground cursor-pointer"
											>
												{config.placeholder || `Enable ${config.label}`}
											</label>
										</div>
									{:else if config.type === 'tags'}
										<div>
											<TextInput
												id={fieldId}
												value={Array.isArray(editedData[field])
													? editedData[field].join(', ')
													: ''}
												oninput={(e) => handleTagsInput(field, e)}
												placeholder={config.placeholder ||
													'Enter tags separated by commas'}
												size="sm"
												class="text-sm"
											/>
											<p class="text-xs text-muted-foreground mt-1">
												Separate tags with commas
											</p>
										</div>
									{:else}
										<TextInput
											id={fieldId}
											bind:value={editedData[field]}
											placeholder={config.placeholder || ''}
											size="sm"
											class="text-sm"
										/>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</form>
		{/if}
	{/snippet}
	{#snippet footer()}
		<!-- Compact Footer -->
		<div class="flex items-center justify-between px-4 py-3 bg-muted border-t border-border">
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
