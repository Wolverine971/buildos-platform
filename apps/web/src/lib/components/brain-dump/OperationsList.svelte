<!-- apps/web/src/lib/components/brain-dump/OperationsList.svelte -->
<script lang="ts">
	import {
		Edit3,
		Trash2,
		AlertTriangle,
		Database,
		Layers,
		FileText,
		FolderOpen,
		ListTodo,
		RefreshCw,
		Target,
		Lightbulb
	} from 'lucide-svelte';
	import { renderMarkdown, stripMarkdown } from '$lib/utils/markdown';
	import type { ParsedOperation } from '$lib/types/brain-dump';
	import Button from '$components/ui/Button.svelte';

	export let operations: ParsedOperation[];
	export let onEditOperation: (operation: ParsedOperation) => void;
	export let onRemoveOperation: (operationId: string) => void;
	export let onToggleOperation: (operationId: string) => void;
	export let disabledOperations: Set<string> = new Set();

	const operationColors = {
		create: 'text-green-600 bg-green-50 border-green-200 dark:!text-green-400 dark:bg-green-900/20 dark:border-green-800',
		update: 'text-blue-600 bg-blue-50 border-blue-200 dark:!text-blue-400 dark:bg-blue-900/20 dark:border-blue-800',
		delete: 'text-red-600 bg-red-50 border-red-200 dark:!text-red-400 dark:bg-red-900/20 dark:border-red-800'
	};

	const tableIcons = {
		tasks: { icon: ListTodo, emoji: '✅' },
		projects: { icon: FolderOpen, emoji: '📁' },
		notes: { icon: FileText, emoji: '📝' },
		phases: { icon: Layers, emoji: '📊' },
		phase_tasks: { icon: Target, emoji: '🎯' }
	};

	// Get appropriate icon based on task type
	function getTaskIcon(operation: ParsedOperation) {
		if (operation.table === 'tasks' && operation.data.task_type === 'recurring') {
			return { icon: RefreshCw, emoji: '🔄' };
		}
		return tableIcons[operation.table] || { icon: Database, emoji: '📋' };
	}

	function getTableDisplayName(table: string, data?: any): string {
		if (table === 'tasks' && data?.task_type) {
			return data.task_type === 'recurring' ? 'Recurring Task' : 'One-off Task';
		}
		if (table === 'phase_tasks') {
			return 'Phase Assignment';
		}
		return table
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	function getOperationDescription(op: ParsedOperation): string {
		const displayName = getTableDisplayName(op.table, op.data);
		switch (op.operation) {
			case 'create':
				if (op.table === 'phase_tasks') {
					return `Assign task to phase`;
				}
				return `Create new ${displayName.toLowerCase()}`;
			case 'update':
				return `Update existing ${displayName.toLowerCase()}`;
			case 'delete':
				return `Delete ${displayName.toLowerCase()}`;
			default:
				return op.operation;
		}
	}

	function getMainFieldValue(op: ParsedOperation): { html: string; text: string } {
		// Handle phase_tasks
		if (op.table === 'phase_tasks') {
			const reason = op.data.assignment_reason || 'Assign task to phase';
			return { html: reason, text: reason };
		}

		// Handle projects with context
		if (op.table === 'projects') {
			// Check for context or executive_summary
			if (op.data.context && typeof op.data.context === 'string') {
				const contextPreview = stripMarkdown(op.data.context).substring(0, 150);
				const text = contextPreview + (op.data.context.length > 150 ? '...' : '');
				return { html: text, text };
			}
			if (op.data.executive_summary) {
				const summaryPreview = stripMarkdown(op.data.executive_summary).substring(0, 150);
				const text = summaryPreview + (op.data.executive_summary.length > 150 ? '...' : '');
				return { html: text, text };
			}
		}

		// Get the main display field based on table type
		const mainFields: Record<string, string[]> = {
			tasks: ['title', 'description'],
			projects: ['name', 'description'],
			notes: ['title', 'content'],
			phases: ['name', 'description']
		};

		const fields = mainFields[op.table] || ['name', 'title', 'description'];

		for (const field of fields) {
			if (op.data[field]) {
				const value = op.data[field];
				if (typeof value === 'string') {
					// For title fields, don't render markdown
					if (field === 'title' || field === 'name') {
						const text = value.substring(0, 100) + (value.length > 100 ? '...' : '');
						return { html: text, text };
					}
					// For content/description fields, render markdown
					const fullText = stripMarkdown(value);
					const truncatedText =
						fullText.substring(0, 150) + (fullText.length > 150 ? '...' : '');
					const html = renderMarkdown(
						value.substring(0, 300) + (value.length > 300 ? '...' : '')
					);
					return { html, text: truncatedText };
				}
				return { html: String(value), text: String(value) };
			}
		}

		return { html: 'No description', text: 'No description' };
	}

	// Get relevant metadata fields to display
	function getMetadataFields(operation: ParsedOperation): Array<[string, any]> {
		const excludeFields = ['id', 'user_id', 'created_at', 'updated_at', 'embedding'];

		if (operation.table === 'tasks') {
			// Show task-specific fields
			const fields: Array<[string, any]> = [];
			if (operation.data.task_type) fields.push(['type', operation.data.task_type]);
			if (operation.data.priority) fields.push(['priority', operation.data.priority]);
			if (operation.data.project_id) fields.push(['project', 'linked']);
			if (operation.data.start_date) {
				// Format datetime properly - show date and time
				const date = new Date(operation.data.start_date);
				const formatted = date.toLocaleString('en-US', {
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit',
					hour12: true
				});
				fields.push(['start', formatted]);
			}
			if (operation.data.recurrence_pattern)
				fields.push(['recurrence', operation.data.recurrence_pattern]);
			return fields.slice(0, 4);
		}

		if (operation.table === 'phases') {
			// Show phase-specific fields
			const fields: Array<[string, any]> = [];
			if (operation.data.order) fields.push(['order', `Phase ${operation.data.order}`]);
			if (operation.data.start_date) {
				const date = new Date(operation.data.start_date);
				const formatted = date.toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				});
				fields.push(['start', formatted]);
			}
			if (operation.data.end_date) {
				const date = new Date(operation.data.end_date);
				const formatted = date.toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				});
				fields.push(['end', formatted]);
			}
			return fields;
		}

		if (operation.table === 'notes') {
			// Show note category
			const fields: Array<[string, any]> = [];
			if (operation.data.category) fields.push(['category', operation.data.category]);
			if (operation.data.project_id) fields.push(['project', 'linked']);
			if (operation.data.tags?.length) fields.push(['tags', operation.data.tags.join(', ')]);
			return fields;
		}

		if (operation.table === 'projects') {
			// Show project-specific fields
			const fields: Array<[string, any]> = [];
			if (operation.data.status) fields.push(['status', operation.data.status]);
			if (operation.data.start_date) {
				const date = new Date(operation.data.start_date);
				const formatted = date.toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				});
				fields.push(['start', formatted]);
			}
			if (operation.data.end_date) {
				const date = new Date(operation.data.end_date);
				const formatted = date.toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				});
				fields.push(['end', formatted]);
			}
			if (operation.data.tags?.length) fields.push(['tags', operation.data.tags.join(', ')]);

			// Show context indicators
			if (operation.data.context) fields.push(['context', 'included']);
			if (operation.data.executive_summary) fields.push(['summary', 'included']);

			return fields.slice(0, 4);
		}

		// Default: show first few non-excluded fields
		return Object.entries(operation.data)
			.filter(([key]) => !excludeFields.includes(key))
			.slice(0, 3);
	}

	// Get category badge color
	function getCategoryColor(category: string): string {
		const colors = {
			situation: 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:!text-orange-400',
			mission: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:!text-purple-400',
			execution: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:!text-blue-400',
			operations: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:!text-green-400',
			coordination: 'bg-pink-100 text-pink-700 dark:bg-pink-900/20 dark:!text-pink-400',
			insight: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:!text-yellow-400',
			research: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:!text-indigo-400',
			idea: 'bg-teal-100 text-teal-700 dark:bg-teal-900/20 dark:!text-teal-400',
			observation: 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:!text-gray-400',
			question: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:!text-red-400'
		};
		return colors[category] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:!text-gray-400';
	}
</script>

{#if operations.length === 0}
	<div class="text-center py-8 text-gray-500 dark:!text-gray-400">
		<Lightbulb class="w-12 h-12 mx-auto mb-3 opacity-30" />
		<p>No operations parsed from the brain dump</p>
		<p class="text-sm mt-1">Try adding projects, tasks, or notes to your brain dump</p>
	</div>
{:else}
	<div class="space-y-4">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
			<h3 class="text-base sm:text-lg font-medium text-gray-900 dark:!text-white">
				Review Operations ({operations.filter((op) => !disabledOperations.has(op.id))
					.length} of
				{operations.length}
				enabled)
			</h3>
			<div class="text-xs sm:text-sm text-gray-500 dark:!text-gray-400">
				<span class="sm:hidden">Tap to edit • Uncheck to skip</span>
				<span class="hidden sm:inline">Click to edit, uncheck to skip</span>
			</div>
		</div>

		<div class="space-y-3">
			<!-- Regular operations -->
			{#each operations as operation}
				{@const fieldValue = getMainFieldValue(operation)}
				{@const iconData = getTaskIcon(operation)}
				{@const Icon = iconData.icon}
				<div
					class="border rounded-lg p-3 sm:p-4 transition-all {disabledOperations.has(
						operation.id
					)
						? 'opacity-50 bg-gray-50 dark:bg-gray-800'
						: 'bg-white dark:bg-gray-900'} {operationColors[operation.operation]}"
				>
					<div class="flex flex-col sm:flex-row sm:items-start gap-3">
						<!-- Mobile: Checkbox + Actions in header -->
						<div class="flex items-center justify-between sm:hidden">
							<div class="flex items-center">
								<input
									type="checkbox"
									checked={!disabledOperations.has(operation.id)}
									onchange={() => onToggleOperation(operation.id)}
									style="min-width: 24px !important; min-height: 24px !important;"
									class="w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 dark:checked:bg-blue-600 cursor-pointer"
								/>
							</div>
							<div class="flex items-center gap-1">
								<Button
									on:click={() => onEditOperation(operation)}
									disabled={disabledOperations.has(operation.id)}
									variant="ghost"
									size="sm"
									class="p-2"
									title="Edit operation"
									icon={Edit3}
								></Button>
								<Button
									on:click={() => onRemoveOperation(operation.id)}
									variant="ghost"
									size="sm"
									class="p-2 !text-gray-400 hover:!text-red-600 dark:hover:!text-red-400"
									title="Remove operation"
									icon={Trash2}
								></Button>
							</div>
						</div>

						<!-- Desktop: Checkbox -->
						<div class="hidden sm:flex items-center pt-1">
							<input
								type="checkbox"
								checked={!disabledOperations.has(operation.id)}
								onchange={() => onToggleOperation(operation.id)}
								class="w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 dark:checked:bg-blue-600 cursor-pointer"
							/>
						</div>

						<!-- Content -->
						<div class="flex-1 min-w-0">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
								<span class="text-xl sm:text-2xl">{iconData.emoji}</span>
								<Icon class="w-4 h-4 text-gray-400 hidden sm:inline-block" />
								<span class="font-medium text-sm flex-1 min-w-0">
									{getOperationDescription(operation)}
								</span>
								{#if operation.validation && !operation.validation.isValid}
									<span
										class="inline-flex items-center text-xs text-red-600 dark:!text-red-400 w-full sm:w-auto"
									>
										<AlertTriangle class="w-3 h-3 mr-1" />
										Missing: {operation.validation.missingFields?.join(', ')}
									</span>
								{/if}
							</div>

							<div
								class="text-sm text-gray-700 dark:!text-gray-300 mb-3 prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0"
							>
								<div class="line-clamp-2 sm:line-clamp-3">
									{@html fieldValue.html}
								</div>
							</div>

							<!-- Show metadata fields -->
							<div class="flex flex-wrap gap-1.5 sm:gap-2 text-xs">
								{#each getMetadataFields(operation) as [key, value]}
									<span
										class="inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md {key ===
											'category' ||
										value === 'situation' ||
										value === 'mission' ||
										value === 'execution' ||
										value === 'operations' ||
										value === 'coordination'
											? getCategoryColor(value)
											: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:!text-gray-400'}"
									>
										<span class="font-medium">{key}:</span>
										<span class="ml-1">
											{#if Array.isArray(value)}
												{value.join(', ')}
											{:else if typeof value === 'string' && value.length > 20}
												{stripMarkdown(value).substring(0, 20)}...
											{:else}
												{String(value)}
											{/if}
										</span>
									</span>
								{/each}

								{#if Object.keys(operation.data).length > 5}
									<span class="text-gray-500 dark:!text-gray-400">
										+{Object.keys(operation.data).length - 5}
									</span>
								{/if}
							</div>
						</div>

						<!-- Desktop: Actions -->
						<div class="hidden sm:flex items-center space-x-1">
							<Button
								on:click={() => onEditOperation(operation)}
								disabled={disabledOperations.has(operation.id)}
								variant="ghost"
								size="sm"
								icon={Edit3}
								title="Edit operation"
							/>
							<Button
								on:click={() => onRemoveOperation(operation.id)}
								variant="ghost"
								size="sm"
								icon={Trash2}
								class="hover:!text-red-600 dark:hover:!text-red-400 hover:!bg-red-50 dark:hover:!bg-red-900/20"
								title="Remove operation"
							/>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}
