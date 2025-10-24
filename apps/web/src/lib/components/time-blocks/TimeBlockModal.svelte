<!-- apps/web/src/lib/components/time-blocks/TimeBlockModal.svelte -->
<!--
	TimeBlockModal Component

	Modal for creating and editing time blocks with calendar integration and AI suggestions.
	Follows TaskModal's two-column layout pattern but adapted for time blocks.
	Uses FormModal for consistent modal structure.
-->
<script lang="ts">
	import FormModal from '$lib/components/ui/FormModal.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { Calendar, Clock, Zap, Trash2 } from 'lucide-svelte';
	import { format } from 'date-fns';
	import type { TimeBlockWithProject } from '@buildos/shared-types';
	import { toastService } from '$lib/stores/toast.store';

	// Props using Svelte 5 runes
	type Props = {
		isOpen: boolean;
		block?: TimeBlockWithProject | null;
		projects: Array<{
			id: string;
			name: string;
			calendar_color_id: string | null;
		}>;
		onClose: () => void;
		onCreate?: (block: TimeBlockWithProject) => void;
		onUpdate?: (block: TimeBlockWithProject) => void;
		onDelete?: (blockId: string) => void;
	};

	let {
		isOpen = false,
		block = null,
		projects = [],
		onClose,
		onCreate,
		onUpdate,
		onDelete
	}: Props = $props();

	// Local state (Svelte 5 runes)
	let blockType = $state<'project' | 'build'>(block?.block_type || 'project');
	let selectedProjectId = $state<string | null>(block?.project_id || null);
	let startDateTime = $state<string>('');
	let endDateTime = $state<string>('');
	let isSubmitting = $state(false);
	let isRegenerating = $state(false);

	// Derived values
	const isEditing = $derived(!!block);
	const modalTitle = $derived(isEditing ? 'Edit Focus Session' : 'Schedule Focus Session');
	const submitText = $derived(isEditing ? 'Save Changes' : 'Create Focus Session');
	const loadingText = $derived('Saving...');

	// Calculate duration
	const durationMinutes = $derived.by(() => {
		if (!startDateTime || !endDateTime) return 0;
		const start = new Date(startDateTime);
		const end = new Date(endDateTime);
		if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
		return Math.floor((end.getTime() - start.getTime()) / 1000 / 60);
	});

	// Format duration for display
	const durationDisplay = $derived.by(() => {
		if (durationMinutes === 0) return '';
		const hours = Math.floor(durationMinutes / 60);
		const mins = durationMinutes % 60;
		if (hours === 0) return `${mins}m`;
		if (mins === 0) return `${hours}h`;
		return `${hours}h ${mins}m`;
	});

	// Initialize values when block changes
	$effect(() => {
		if (block) {
			blockType = block.block_type;
			selectedProjectId = block.project_id;
			startDateTime = formatDateTimeForInput(block.start_time);
			endDateTime = formatDateTimeForInput(block.end_time);
		} else if (!isOpen) {
			// Reset when modal closes
			blockType = 'project';
			selectedProjectId = null;
			startDateTime = '';
			endDateTime = '';
		}
	});

	// Auto-adjust end time if it's before start time
	$effect(() => {
		if (!startDateTime || !endDateTime) return;

		const start = new Date(startDateTime);
		const end = new Date(endDateTime);

		// Check if dates are valid and end is before start
		if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end <= start) {
			// Set end time to 30 minutes after start time
			const newEnd = new Date(start.getTime() + 30 * 60 * 1000);
			endDateTime = formatDateTimeForInput(newEnd.toISOString());
		}
	});

	// Helper functions
	function formatDateTimeForInput(dateString: string): string {
		if (!dateString) return '';
		try {
			const date = new Date(dateString);
			if (isNaN(date.getTime())) return '';
			return format(date, "yyyy-MM-dd'T'HH:mm");
		} catch {
			return '';
		}
	}

	function formatRelativeTime(dateString: string): string {
		if (!dateString) return '';
		try {
			const date = new Date(dateString);
			const now = new Date();
			const diffMs = now.getTime() - date.getTime();
			const diffMins = Math.floor(diffMs / 60000);

			if (diffMins < 1) return 'just now';
			if (diffMins < 60) return `${diffMins}m ago`;

			const diffHours = Math.floor(diffMins / 60);
			if (diffHours < 24) return `${diffHours}h ago`;

			const diffDays = Math.floor(diffHours / 24);
			if (diffDays < 7) return `${diffDays}d ago`;

			return format(date, 'MMM d, yyyy');
		} catch {
			return '';
		}
	}

	// Validation
	function validate(): string | null {
		if (blockType === 'project' && !selectedProjectId) {
			return 'Please select a project';
		}

		if (!startDateTime || !endDateTime) {
			return 'Please select start and end times';
		}

		if (durationMinutes < 15) {
			return 'Focus session must be at least 15 minutes';
		}

		if (durationMinutes > 600) {
			return 'Focus session cannot exceed 10 hours';
		}

		return null;
	}

	// Submit handler
	async function handleSubmit(formData: Record<string, any>): Promise<void> {
		const error = validate();
		if (error) {
			throw new Error(error);
		}

		const params = {
			block_type: blockType,
			project_id: blockType === 'project' ? selectedProjectId : null,
			start_time: new Date(startDateTime).toISOString(),
			end_time: new Date(endDateTime).toISOString(),
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
		};

		if (isEditing && onUpdate && block) {
			// Update existing block
			const response = await fetch(`/api/time-blocks/blocks/${block.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(params)
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					errorData.error || errorData.message || 'Failed to update time block'
				);
			}

			const { data } = await response.json();
			onUpdate(data.time_block);
		} else if (!isEditing && onCreate) {
			// Create new block
			const response = await fetch('/api/time-blocks/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(params)
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					errorData.error || errorData.message || 'Failed to create time block'
				);
			}

			const { data } = await response.json();
			onCreate(data.time_block);
		}
	}

	// Regenerate AI suggestions
	async function handleRegenerate() {
		if (!block) return;

		isRegenerating = true;
		try {
			const response = await fetch(`/api/time-blocks/blocks/${block.id}/suggestions`, {
				method: 'POST'
			});

			if (!response.ok) {
				throw new Error('Failed to regenerate suggestions');
			}

			const { data } = await response.json();
			if (onUpdate) {
				onUpdate(data.time_block);
			}
			toastService.success('Suggestions regenerated');
		} catch (error) {
			console.error('Failed to regenerate suggestions:', error);
			toastService.error('Failed to regenerate suggestions');
		} finally {
			isRegenerating = false;
		}
	}

	// Delete handler
	async function handleDelete(blockId: string): Promise<void> {
		if (!block || !onDelete) return;

		if (!confirm('Delete this focus session? This will also remove it from your calendar.')) {
			return;
		}

		const response = await fetch(`/api/time-blocks/delete/${block.id}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			throw new Error('Failed to delete time block');
		}

		onDelete(block.id);
	}

	// Empty form config - we handle fields manually
	const formConfig = {};
	const initialData = block || {};
</script>

<FormModal
	{isOpen}
	title={modalTitle}
	{submitText}
	{loadingText}
	{formConfig}
	{initialData}
	onSubmit={handleSubmit}
	onDelete={isEditing && onDelete ? handleDelete : null}
	{onClose}
	size="xl"
>
	<div
		slot="after-form"
		class="flex flex-col flex-1 min-h-0 space-y-3 sm:space-y-4 pt-4 px-4 sm:px-6 lg:px-8"
	>
		<!-- Main Content Area -->
		<div class="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 min-h-[40vh] flex-1">
			<!-- Content Section (Takes most space) -->
			<div
				class="lg:col-span-3 flex flex-col space-y-4 h-full min-h-0 bg-gradient-to-br from-white to-gray-50/30 dark:from-gray-800 dark:to-gray-900/30 rounded-xl p-4 sm:p-5 border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow"
			>
				<!-- Block Type Selector -->
				<div
					class="bg-gradient-to-r from-purple-50/50 to-blue-50/50
							dark:from-purple-900/20 dark:to-blue-900/20
							-m-4 sm:-m-5 mb-0 p-4 sm:p-5 rounded-t-xl
							border-b border-gray-200/50 dark:border-gray-700/50"
				>
					<FormField label="Session Type" labelFor="block-type" required>
						<div class="flex gap-3">
							<button
								type="button"
								class="flex-1 p-3 rounded-lg border-2 transition-all
									   {blockType === 'project'
									? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
									: 'border-gray-300 dark:border-gray-600 hover:border-gray-400'}"
								onclick={() => (blockType = 'project')}
							>
								<div class="flex items-center gap-2">
									<div
										class="w-4 h-4 rounded-full border-2
											   {blockType === 'project' ? 'border-blue-500 bg-blue-500' : 'border-gray-400'}"
									/>
									<span class="font-semibold text-sm">Project Focus</span>
								</div>
								<p class="text-xs text-gray-600 dark:text-gray-300 mt-1">
									Work on a specific project
								</p>
							</button>

							<button
								type="button"
								class="flex-1 p-3 rounded-lg border-2 transition-all
									   {blockType === 'build'
									? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
									: 'border-gray-300 dark:border-gray-600 hover:border-gray-400'}"
								onclick={() => (blockType = 'build')}
							>
								<div class="flex items-center gap-2">
									<div
										class="w-4 h-4 rounded-full border-2
											   {blockType === 'build' ? 'border-purple-500 bg-purple-500' : 'border-gray-400'}"
									/>
									<span class="font-semibold text-sm">Build Block</span>
								</div>
								<p class="text-xs text-gray-600 dark:text-gray-300 mt-1">
									Flexible deep work time
								</p>
							</button>
						</div>
					</FormField>
				</div>

				<!-- Project Selector (conditional) -->
				{#if blockType === 'project'}
					<FormField label="Project" labelFor="project" required>
						<Select id="project" bind:value={selectedProjectId} size="lg">
							<option value="">Select a project...</option>
							{#each projects as project}
								<option value={project.id}>{project.name}</option>
							{/each}
						</Select>
					</FormField>
				{/if}

				<!-- Time Selection -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<FormField label="Start Time" labelFor="start-time" required>
						<TextInput
							id="start-time"
							type="datetime-local"
							bind:value={startDateTime}
							size="lg"
						/>
					</FormField>

					<FormField label="End Time" labelFor="end-time" required>
						<TextInput
							id="end-time"
							type="datetime-local"
							bind:value={endDateTime}
							min={startDateTime}
							size="lg"
						/>
					</FormField>
				</div>

				<!-- Duration Display -->
				{#if durationMinutes > 0}
					<div
						class="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20
							   border border-blue-200 dark:border-blue-700"
					>
						<div class="flex items-center gap-2 text-sm">
							<Clock class="w-4 h-4 text-blue-600 dark:text-blue-400" />
							<span class="font-medium text-blue-900 dark:text-blue-100">
								Duration: {durationDisplay}
							</span>
						</div>
					</div>
				{/if}

				<!-- AI Suggestions Section (edit mode only) -->
				{#if isEditing && block}
					<div class="mt-6">
						<div class="flex items-center justify-between mb-3">
							<h3 class="text-sm font-semibold text-gray-900 dark:text-white">
								<span class="mr-1.5">💡</span>Focus Suggestions
							</h3>
							<button
								type="button"
								class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400
									   flex items-center gap-1"
								onclick={handleRegenerate}
								disabled={isRegenerating}
							>
								<Zap class="w-3 h-3" />
								{isRegenerating ? 'Regenerating...' : 'Regenerate'}
							</button>
						</div>

						{#if block.ai_suggestions && block.ai_suggestions.length > 0}
							<div class="space-y-2">
								{#each block.ai_suggestions as suggestion, index}
									<div
										class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50
											   border border-gray-200 dark:border-gray-700"
									>
										<div class="flex items-start gap-3">
											<span
												class="flex-shrink-0 w-6 h-6 rounded-full
													   bg-blue-500 text-white text-xs
													   flex items-center justify-center font-bold"
											>
												{index + 1}
											</span>
											<div class="flex-1">
												<h4
													class="text-sm font-medium text-gray-900 dark:text-white"
												>
													{suggestion.title}
												</h4>
												<p
													class="text-xs text-gray-600 dark:text-gray-300 mt-1"
												>
													{suggestion.reason}
												</p>
												{#if suggestion.project_name || suggestion.estimated_minutes}
													<div
														class="flex items-center gap-2 mt-2 text-xs text-gray-500"
													>
														{#if suggestion.project_name}
															<span>{suggestion.project_name}</span>
														{/if}
														{#if suggestion.estimated_minutes}
															{#if suggestion.project_name}
																<span>•</span>
															{/if}
															<span
																>{suggestion.estimated_minutes} min</span
															>
														{/if}
														{#if suggestion.priority}
															<span>•</span>
															<span class="uppercase"
																>{suggestion.priority}</span
															>
														{/if}
													</div>
												{/if}
											</div>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-sm text-gray-500 dark:text-gray-400">
								No suggestions yet. Click "Regenerate" to get AI-powered focus
								suggestions.
							</p>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Metadata Sidebar -->
			<div
				class="lg:col-span-1 bg-gradient-to-br from-gray-50/50 to-gray-100/30 dark:from-gray-800/50 dark:to-gray-900/30 rounded-xl p-3 sm:p-4 space-y-3 sm:space-y-4 border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow lg:max-h-full lg:overflow-y-auto"
			>
				<!-- Calendar Sync Status -->
				{#if isEditing && block}
					<div class="space-y-2">
						<h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500">
							Calendar Sync
						</h4>
						<div class="flex items-center gap-2">
							<div
								class="w-2 h-2 rounded-full
									   {block.sync_status === 'synced' ? 'bg-green-500' : 'bg-yellow-500'}"
							/>
							<span class="text-xs text-gray-600 dark:text-gray-300">
								{block.sync_status === 'synced' ? 'Synced' : 'Pending'}
							</span>
						</div>
						{#if block.calendar_event_link}
							<a
								href={block.calendar_event_link}
								target="_blank"
								rel="noopener noreferrer"
								class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400
									   flex items-center gap-1"
							>
								<Calendar class="w-3 h-3" />
								Open in Calendar
							</a>
						{/if}
					</div>
				{/if}

				<!-- Metadata -->
				<div class="space-y-2">
					<h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500">
						Session Info
					</h4>
					<div class="text-xs space-y-1">
						<div class="flex justify-between">
							<span class="text-gray-500">Type</span>
							<span class="font-medium text-gray-900 dark:text-white">
								{blockType === 'project' ? 'Project' : 'Build'}
							</span>
						</div>
						{#if durationMinutes > 0}
							<div class="flex justify-between">
								<span class="text-gray-500">Duration</span>
								<span class="font-medium text-gray-900 dark:text-white">
									{durationDisplay}
								</span>
							</div>
						{/if}
					</div>
				</div>

				<!-- Activity (edit mode only) -->
				{#if isEditing && block}
					<div class="space-y-2">
						<h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500">
							Activity
						</h4>
						<div class="text-xs text-gray-600 dark:text-gray-300 space-y-1">
							<div>Created {formatRelativeTime(block.created_at)}</div>
							{#if block.updated_at !== block.created_at}
								<div>Updated {formatRelativeTime(block.updated_at)}</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</FormModal>
