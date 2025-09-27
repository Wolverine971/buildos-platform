<!-- src/lib/components/project/SynthesisOperationModal.svelte -->
<script lang="ts">
	import { X, Save, AlertCircle, Eye, Edit } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { renderMarkdown, hasMarkdownFormatting } from '$lib/utils/markdown';
	import type { ParsedOperation } from '$lib/types/brain-dump';

	export let isOpen: boolean;
	export let operation: ParsedOperation | null;
	export let onSave: (operation: ParsedOperation) => void;
	export let onClose: () => void;

	let editedData: Record<string, any> = {};
	let editedReasoning: string = '';
	let errors: string[] = [];
	let previewMode: Record<string, boolean> = {};

	// Updated field configurations to match current tasks schema
	const fieldConfigs: Record<string, Record<string, any>> = {
		tasks: {
			title: { type: 'text', required: true, label: 'Title', placeholder: 'Task title...' },
			description: {
				type: 'textarea',
				label: 'Description',
				placeholder: 'Brief description of the task...',
				markdown: true
			},
			details: {
				type: 'textarea',
				label: 'Details',
				placeholder: 'Detailed information about the task...',
				markdown: true
			},
			// task_steps: {
			// 	type: 'textarea',
			// 	label: 'Task Steps',
			// 	placeholder: 'Steps to complete this task...',
			// 	markdown: true
			// },
			status: {
				type: 'select',
				options: ['backlog', 'in_progress', 'done', 'blocked'],
				label: 'Status'
			},
			priority: {
				type: 'select',
				options: ['low', 'medium', 'high'],
				label: 'Priority'
			},
			task_type: {
				type: 'select',
				options: ['one_off', 'recurring'],
				label: 'Task Type'
			},
			start_date: { type: 'date', label: 'Start Date' },
			// completed_at: { type: 'datetime-local', label: 'Completed At' },
			duration_minutes: {
				type: 'number',
				label: 'Duration (Minutes)',
				placeholder: 'Estimated duration in minutes'
			},
			parent_task_id: {
				type: 'text',
				label: 'Parent Task ID',
				placeholder: 'ID of parent task (if subtask)'
			},
			dependencies: {
				type: 'textarea',
				label: 'Dependencies',
				placeholder: 'Task IDs this task depends on (one per line)'
			},
			// recurrence_pattern: {
			// 	type: 'text',
			// 	label: 'Recurrence Pattern',
			// 	placeholder: 'e.g., daily, weekly, monthly'
			// },
			// recurrence_ends: { type: 'date', label: 'Recurrence Ends' },
			outdated: { type: 'checkbox', label: 'Mark as Outdated' }
		}
	};

	$: if (operation) {
		editedData = { ...operation.data };
		editedReasoning = operation.reasoning || '';
		previewMode = {};

		// Ensure dependencies is properly formatted for display
		if (editedData.dependencies && Array.isArray(editedData.dependencies)) {
			editedData.dependencies = editedData.dependencies.join('\n');
		}
	}

	function handleSave() {
		if (!operation) return;

		errors = [];

		// Validate required fields
		const config = fieldConfigs[operation.table] || {};
		for (const [field, fieldConfig] of Object.entries(config)) {
			if (fieldConfig.required && !editedData[field]) {
				errors.push(`${fieldConfig.label || field} is required`);
			}
		}

		if (errors.length > 0) return;

		// Process dependencies field
		const processedData = { ...editedData };
		if (processedData.dependencies && typeof processedData.dependencies === 'string') {
			// Convert string to array, filtering out empty lines
			processedData.dependencies = processedData.dependencies
				.split('\n')
				.map((dep) => dep.trim())
				.filter((dep) => dep.length > 0);
		}

		// Convert duration to number if provided
		if (processedData.duration_minutes) {
			processedData.duration_minutes = parseInt(processedData.duration_minutes);
		}

		onSave({
			...operation,
			data: processedData,
			reasoning: editedReasoning
		});
	}

	function getFieldConfig(table: string, field: string) {
		return fieldConfigs[table]?.[field] || { type: 'text', label: field };
	}

	function getTableFields(table: string): string[] {
		// If we have a field config, use those fields in order
		if (fieldConfigs[table]) {
			return Object.keys(fieldConfigs[table]);
		}

		// Otherwise, show all fields from the data, excluding system fields
		return Object.keys(editedData).filter(
			(key) => !['id', 'user_id', 'project_id', 'created_at', 'updated_at'].includes(key)
		);
	}

	function getOperationTypeInfo(operation: ParsedOperation) {
		const type = operation.operation;
		const table = operation.table;

		if (type === 'create') {
			return {
				color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800',
				label: `Create New ${table.replace('_', ' ')}`
			};
		} else if (type === 'update') {
			return {
				color: 'text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 border-primary-200 dark:border-primary-800',
				label: `Update Existing ${table.replace('_', ' ')}`
			};
		} else if (type === 'delete') {
			return {
				color: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800',
				label: `Delete ${table.replace('_', ' ')}`
			};
		}

		return {
			color: 'text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800',
			label: `${type} ${table}`
		};
	}
</script>

<Modal {isOpen} {onClose} title="Edit Synthesis Operation" size="xl">
	{#if operation}
		{@const operationInfo = getOperationTypeInfo(operation)}
		<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 space-y-4 sm:space-y-6">
			<!-- Operation Info -->
			<div class="border rounded-lg p-3 sm:p-4 {operationInfo.color}">
				<div class="flex items-center justify-between">
					<div>
						<h3 class="font-medium">{operationInfo.label}</h3>
						<p class="text-xs sm:text-sm opacity-75 mt-1">
							{operation.reasoning || 'No reasoning provided'}
						</p>
					</div>
					<div class="text-xs sm:text-sm opacity-75">
						{operation.table}
					</div>
				</div>
			</div>

			{#if errors.length > 0}
				<div
					class="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-lg p-3 sm:p-4"
				>
					<div class="flex items-start space-x-2">
						<AlertCircle class="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5" />
						<div class="text-xs sm:text-sm text-rose-700 dark:text-rose-300">
							{#each errors as error}
								<p>{error}</p>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Reasoning Field -->
			<FormField
				label="Reasoning"
				labelFor="editReason"
				hint="(why this operation is needed)"
			>
				<Textarea
					id="editReason"
					bind:value={editedReasoning}
					rows={2}
					placeholder="Explain why this operation is necessary..."
					size="md"
				/>
			</FormField>

			<!-- Data Fields -->
			<div class="border-t border-gray-200 dark:border-gray-700 pt-4">
				<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
					{operation.operation === 'create' ? 'New' : 'Updated'} Data
				</h4>

				<div
					class="space-y-4 sm:space-y-5 max-h-80 sm:max-h-96 overflow-y-auto px-1 sm:px-2"
				>
					{#each getTableFields(operation.table) as field}
						{@const config = getFieldConfig(operation.table, field)}
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
							>
								{config.label}
								{#if config.required}
									<span class="text-rose-500 dark:text-rose-400">*</span>
								{/if}
							</label>

							{#if config.type === 'textarea'}
								<div class="space-y-2">
									{#if config.markdown || hasMarkdownFormatting(editedData[field])}
										<div class="flex justify-end">
											<Button
												type="button"
												on:click={() =>
													(previewMode[field] = !previewMode[field])}
												variant="ghost"
												size="sm"
												class="text-xs"
											>
												{#if previewMode[field]}
													<Edit class="w-3 h-3" />
													<span>Edit</span>
												{:else}
													<Eye class="w-3 h-3" />
													<span>Preview</span>
												{/if}
											</Button>
										</div>
									{/if}

									{#if previewMode[field]}
										<div
											class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm
											       bg-gray-50 dark:bg-gray-900/50 min-h-[100px]
											       prose prose-sm dark:prose-invert max-w-none overflow-auto"
										>
											{#if editedData[field]}
												{@html renderMarkdown(editedData[field])}
											{:else}
												<span
													class="text-gray-400 dark:text-gray-500 italic"
													>No content</span
												>
											{/if}
										</div>
									{:else}
										<Textarea
											bind:value={editedData[field]}
											rows={3}
											placeholder={config.placeholder || ''}
											size="md"
											class="text-sm"
										/>
									{/if}
								</div>
							{:else if config.type === 'select'}
								<Select
									bind:value={editedData[field]}
									on:change={(e) => (editedData[field] = e.detail)}
									size="md"
									class="text-xs sm:text-sm"
								>
									<option value="">Select {config.label}</option>
									{#each config.options as option}
										<option value={option}>{option}</option>
									{/each}
								</Select>
							{:else if config.type === 'date'}
								<TextInput
									type="date"
									bind:value={editedData[field]}
									size="md"
									class="text-xs sm:text-sm"
								/>
							{:else if config.type === 'datetime-local'}
								<TextInput
									type="datetime-local"
									bind:value={editedData[field]}
									size="md"
									class="text-sm"
								/>
							{:else if config.type === 'number'}
								<TextInput
									type="number"
									bind:value={editedData[field]}
									placeholder={config.placeholder || ''}
									size="md"
								/>
							{:else if config.type === 'checkbox'}
								<label class="flex items-center">
									<input
										type="checkbox"
										bind:checked={editedData[field]}
										class="h-5 w-5 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 cursor-pointer dark:bg-gray-700 dark:checked:bg-primary-600"
									/>
									<span class="ml-2 text-sm text-gray-600 dark:text-gray-400"
										>{config.label}</span
									>
								</label>
							{:else}
								<TextInput
									bind:value={editedData[field]}
									placeholder={config.placeholder || ''}
									size="md"
								/>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<!-- Actions -->
			<div
				class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700"
			>
				<Button on:click={onClose} variant="outline" size="md" class="w-full sm:w-auto">
					Cancel
				</Button>
				<Button on:click={handleSave} variant="primary" size="md" class="w-full sm:w-auto">
					<Save class="w-4 h-4 mr-2" />
					Save Changes
				</Button>
			</div>
		</div>
	{/if}
</Modal>
