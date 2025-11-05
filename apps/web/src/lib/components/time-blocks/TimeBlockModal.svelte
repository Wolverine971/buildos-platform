<!-- apps/web/src/lib/components/time-blocks/TimeBlockModal.svelte -->
<!--
	TimeBlockModal Component

	High-density, responsive modal for creating and editing time blocks.
	Matches the TaskModal design language with a two-column layout, rich metadata,
	and edit controls that live in the sidebar.
-->
<script lang="ts">
	import FormModal from '$lib/components/ui/FormModal.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { Calendar, Clock, Zap, PencilLine } from 'lucide-svelte';
	import { format } from 'date-fns';
	import type { TimeBlockWithProject } from '@buildos/shared-types';
	import { toastService } from '$lib/stores/toast.store';

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

	let blockType = $state<'project' | 'build'>(block?.block_type || 'project');
	let selectedProjectId = $state<string | null>(block?.project_id || null);
	let startDateTime = $state<string>('');
	let endDateTime = $state<string>('');
	let isRegenerating = $state(false);
	let editingEnabled = $state(false);
	let lastViewedBlockId = $state<string | null>(null);

	const isEditing = $derived(!!block);
	const isViewMode = $derived(isEditing && !editingEnabled);
	const sessionTypeLabel = $derived(blockType === 'project' ? 'Project Focus' : 'Build Session');
	const modalTitle = $derived(
		!isEditing
			? 'Schedule Focus Session'
			: editingEnabled
				? 'Edit Focus Session'
				: 'Focus Session Overview'
	);
	const submitText = $derived(
		!isEditing ? 'Create Focus Session' : editingEnabled ? 'Save Changes' : 'Enable Editing'
	);
	const loadingText = $derived(
		isEditing && !editingEnabled ? 'Preparing editor...' : 'Saving...'
	);

	const timezoneDisplay = $derived(
		block?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
	);

	const durationMinutes = $derived.by(() => {
		if (!startDateTime || !endDateTime) return 0;
		const start = new Date(startDateTime);
		const end = new Date(endDateTime);
		if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
		return Math.floor((end.getTime() - start.getTime()) / 1000 / 60);
	});

	const durationDisplay = $derived.by(() => {
		if (durationMinutes === 0) return '';
		const hours = Math.floor(durationMinutes / 60);
		const mins = durationMinutes % 60;
		if (hours === 0) return `${mins}m`;
		if (mins === 0) return `${hours}h`;
		return `${hours}h ${mins}m`;
	});

	const startDateSummary = $derived.by(() => {
		const value = startDateTime || block?.start_time;
		if (!value) return '';
		try {
			return format(new Date(value), 'EEE, MMM d | h:mm a');
		} catch {
			return '';
		}
	});

	const endDateSummary = $derived.by(() => {
		const value = endDateTime || block?.end_time;
		if (!value) return '';
		try {
			return format(new Date(value), 'EEE, MMM d | h:mm a');
		} catch {
			return '';
		}
	});

	$effect(() => {
		if (block) {
			blockType = block.block_type;
			selectedProjectId = block.project_id;
			startDateTime = formatDateTimeForInput(block.start_time);
			endDateTime = formatDateTimeForInput(block.end_time);
		} else if (!isOpen) {
			blockType = 'project';
			selectedProjectId = null;
			startDateTime = '';
			endDateTime = '';
		}
	});

	$effect(() => {
		if (!isOpen) {
			editingEnabled = false;
			lastViewedBlockId = null;
			return;
		}

		const currentId = block?.id ?? null;

		if (!block) {
			editingEnabled = true;
		} else if (currentId !== lastViewedBlockId) {
			editingEnabled = false;
		}

		lastViewedBlockId = currentId;
	});

	$effect(() => {
		if (!startDateTime || !endDateTime) return;

		const start = new Date(startDateTime);
		const end = new Date(endDateTime);

		if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end <= start) {
			const newEnd = new Date(start.getTime() + 30 * 60 * 1000);
			endDateTime = formatDateTimeForInput(newEnd.toISOString());
		}
	});

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

	async function handleSubmit(formData: Record<string, any>): Promise<void> {
		if (isEditing && !editingEnabled) {
			editingEnabled = true;
			return;
		}

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
			const response = await fetch(`/api/time-blocks/blocks/${block.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(params)
			});

			const result = await response.json().catch(() => ({}));

			if (!result?.success) {
				throw new Error(result?.error?.[0] || 'Failed to update time block');
			}

			onUpdate(result.data?.time_block);
		} else if (!isEditing && onCreate) {
			const response = await fetch('/api/time-blocks/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(params)
			});

			const result = await response.json().catch(() => ({}));

			if (!result?.success) {
				throw new Error(result?.error?.[0] || 'Failed to create time block');
			}

			onCreate(result.data?.time_block);
		}
	}

	async function handleRegenerate() {
		if (!block) return;

		isRegenerating = true;
		try {
			const response = await fetch(`/api/time-blocks/blocks/${block.id}/suggestions`, {
				method: 'POST'
			});

			const result = await response.json().catch(() => ({}));

			if (!result?.success) {
				throw new Error(result?.error?.[0] || 'Failed to regenerate suggestions');
			}

			if (onUpdate) {
				onUpdate(result.data?.time_block);
			}
			toastService.success('Suggestions regenerated');
		} catch (error) {
			console.error('Failed to regenerate suggestions:', error);
			toastService.error('Failed to regenerate suggestions');
		} finally {
			isRegenerating = false;
		}
	}

	async function handleDelete(blockId: string): Promise<void> {
		if (!block || !onDelete) return;

		if (!confirm('Delete this focus session? This will also remove it from your calendar.')) {
			return;
		}

		const response = await fetch(`/api/time-blocks/delete/${block.id}`, {
			method: 'DELETE'
		});

		const result = await response.json().catch(() => ({}));

		if (!result?.success) {
			throw new Error(result?.error?.[0] || 'Failed to delete time block');
		}

		onDelete(block.id);
	}

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
		class="flex flex-col flex-1 min-h-0 gap-4 sm:gap-5 pt-4 pb-2 px-4 sm:px-6 lg:px-8"
	>
		<div class="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-5 min-h-[38vh]">
			<section class="lg:col-span-3 flex flex-col gap-4 lg:pr-1">
				<div
					class="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/85 dark:bg-slate-900/70 shadow-sm backdrop-blur-sm transition-all hover:shadow-md"
				>
					<div
						class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 dark:border-slate-700/60 px-4 sm:px-6 py-4"
					>
						<div class="space-y-1">
							<p
								class="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500"
							>
								Session Setup
							</p>
							<h2 class="text-base font-semibold text-slate-900 dark:text-white">
								{sessionTypeLabel}
							</h2>
						</div>
						{#if durationDisplay}
							<div
								class="inline-flex items-center gap-1.5 rounded-full bg-blue-50/80 px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm ring-1 ring-blue-200/60 dark:bg-blue-500/15 dark:text-blue-200 dark:ring-blue-500/30"
							>
								<Clock class="w-3.5 h-3.5" />
								<span>{durationDisplay}</span>
							</div>
						{/if}
					</div>

					{#if isViewMode}
						<div class="px-4 sm:px-6 py-4 sm:py-6 space-y-5">
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div
									class="rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/60 p-4 space-y-1.5"
								>
									<span
										class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
										>Start</span
									>
									<p class="text-sm font-semibold text-slate-900 dark:text-white">
										{startDateSummary || 'Not scheduled'}
									</p>
									{#if block?.start_time}
										<p class="text-xs text-slate-500 dark:text-slate-400">
											Started {formatRelativeTime(block.start_time)}
										</p>
									{/if}
								</div>
								<div
									class="rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/60 p-4 space-y-1.5"
								>
									<span
										class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
										>End</span
									>
									<p class="text-sm font-semibold text-slate-900 dark:text-white">
										{endDateSummary || 'Not scheduled'}
									</p>
									{#if block?.end_time}
										<p class="text-xs text-slate-500 dark:text-slate-400">
											Ends {formatRelativeTime(block.end_time)}
										</p>
									{/if}
								</div>
							</div>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div
									class="rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/60 p-4 space-y-1.5"
								>
									<span
										class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
										>Focus type</span
									>
									<p class="text-sm font-semibold text-slate-900 dark:text-white">
										{blockType === 'project'
											? 'Project session'
											: 'Build session'}
									</p>
								</div>
								<div
									class="rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/60 p-4 space-y-1.5"
								>
									<span
										class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
										>Timezone</span
									>
									<p class="text-sm font-semibold text-slate-900 dark:text-white">
										{timezoneDisplay}
									</p>
								</div>
								{#if blockType === 'project' && block?.project?.name}
									<div
										class="rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/60 p-4 space-y-1.5 sm:col-span-2"
									>
										<span
											class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
											>Project</span
										>
										<p
											class="text-sm font-semibold text-slate-900 dark:text-white"
										>
											{block.project.name}
										</p>
									</div>
								{/if}
							</div>
						</div>
					{:else}
						<div class="px-4 sm:px-6 py-4 sm:py-6 space-y-6">
							<FormField label="Session Type" labelFor="block-type" required>
								<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
									<button
										type="button"
										class="group rounded-xl border-2 p-3 sm:p-4 text-left transition-all duration-200 {blockType ===
										'project'
											? 'border-blue-500 bg-blue-50/80 dark:border-blue-400 dark:bg-blue-950/40 shadow-md'
											: 'border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'}"
										onclick={() => (blockType = 'project')}
									>
										<div class="flex items-center gap-2">
											<div
												class="h-2.5 w-2.5 rounded-full border-2 {blockType ===
												'project'
													? 'border-blue-500 bg-blue-500'
													: 'border-slate-400'}"
											></div>
											<span
												class="text-sm font-semibold text-slate-900 dark:text-white"
												>Project focus</span
											>
										</div>
										<p class="mt-2 text-xs text-slate-600 dark:text-slate-300">
											Connect this session to one of your projects.
										</p>
									</button>
									<button
										type="button"
										class="group rounded-xl border-2 p-3 sm:p-4 text-left transition-all duration-200 {blockType ===
										'build'
											? 'border-purple-500 bg-purple-50/80 dark:border-purple-400 dark:bg-purple-950/40 shadow-md'
											: 'border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'}"
										onclick={() => (blockType = 'build')}
									>
										<div class="flex items-center gap-2">
											<div
												class="h-2.5 w-2.5 rounded-full border-2 {blockType ===
												'build'
													? 'border-purple-500 bg-purple-500'
													: 'border-slate-400'}"
											></div>
											<span
												class="text-sm font-semibold text-slate-900 dark:text-white"
												>Build session</span
											>
										</div>
										<p class="mt-2 text-xs text-slate-600 dark:text-slate-300">
											Flexible time to push high-impact work forward.
										</p>
									</button>
								</div>
							</FormField>
							{#if blockType === 'project'}
								<FormField label="Project" labelFor="project" required>
									<Select
										id="project"
										bind:value={selectedProjectId}
										size="lg"
										class="w-full text-sm"
									>
										<option value="">Select a project...</option>
										{#each projects as project}
											<option value={project.id}>{project.name}</option>
										{/each}
									</Select>
								</FormField>
							{/if}
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<FormField label="Start" labelFor="start-time" required>
									<TextInput
										id="start-time"
										type="datetime-local"
										bind:value={startDateTime}
										size="lg"
									/>
								</FormField>
								<FormField label="End" labelFor="end-time" required>
									<TextInput
										id="end-time"
										type="datetime-local"
										bind:value={endDateTime}
										min={startDateTime}
										size="lg"
									/>
								</FormField>
							</div>
							{#if durationMinutes > 0}
								<div
									class="rounded-xl border border-blue-200/60 bg-blue-50/80 px-4 py-3 text-sm text-blue-800 shadow-sm dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200"
								>
									<div class="flex items-center gap-2">
										<Clock class="h-4 w-4" />
										<span class="font-semibold"
											>Duration: {durationDisplay}</span
										>
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<div
					class="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/85 dark:bg-slate-900/70 shadow-sm backdrop-blur-sm transition-all hover:shadow-md"
				>
					<div
						class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 dark:border-slate-700/60 px-4 sm:px-6 py-4"
					>
						<div>
							<p
								class="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500"
							>
								Focus Suggestions
							</p>
							<h3 class="text-base font-semibold text-slate-900 dark:text-white">
								{isEditing && block?.ai_suggestions?.length
									? `${block.ai_suggestions.length} curated ideas`
									: 'Personalized ideas'}
							</h3>
						</div>
						{#if isEditing && block}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onclick={handleRegenerate}
								loading={isRegenerating}
								class="hidden sm:inline-flex"
							>
								<Zap class="h-4 w-4" />
								<span>{isRegenerating ? 'Regenerating...' : 'Refresh'}</span>
							</Button>
						{/if}
					</div>
					<div class="px-4 sm:px-6 py-4 sm:py-6">
						{#if block?.ai_suggestions && block.ai_suggestions.length > 0}
							<div class="space-y-3">
								{#each block.ai_suggestions as suggestion, index}
									<div
										class="group relative overflow-hidden rounded-xl border border-slate-200/60 bg-white/85 p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/70"
									>
										<div
											class="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/0 via-purple-500/0 to-blue-500/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-blue-400/5 dark:to-purple-400/5"
										></div>
										<div class="relative flex gap-3">
											<div
												class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 text-sm font-bold text-white shadow-lg"
											>
												{index + 1}
											</div>
											<div class="flex-1 space-y-1.5">
												<div class="flex flex-wrap items-center gap-2">
													<h4
														class="text-sm font-semibold text-slate-900 dark:text-white"
													>
														{suggestion.title}
													</h4>
													{#if suggestion.project_name || suggestion.priority || suggestion.estimated_minutes}
														<span
															class="inline-flex flex-wrap items-center gap-1 rounded-full bg-slate-100/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200/60 dark:bg-slate-800/70 dark:text-slate-200 dark:ring-white/10"
														>
															{#if suggestion.project_name}
																<span
																	>{suggestion.project_name}</span
																>
															{/if}
															{#if suggestion.estimated_minutes}
																{#if suggestion.project_name}
																	<span class="text-slate-400"
																		>/</span
																	>
																{/if}
																<span
																	>{suggestion.estimated_minutes} min</span
																>
															{/if}
															{#if suggestion.priority}
																{#if suggestion.project_name || suggestion.estimated_minutes}
																	<span class="text-slate-400"
																		>/</span
																	>
																{/if}
																<span>{suggestion.priority}</span>
															{/if}
														</span>
													{/if}
												</div>
												<p
													class="text-sm leading-relaxed text-slate-600 dark:text-slate-300"
												>
													{suggestion.reason}
												</p>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div
								class="flex flex-col items-start gap-3 rounded-xl border border-dashed border-slate-200/60 bg-slate-50/60 p-5 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300"
							>
								<p class="font-semibold text-slate-700 dark:text-slate-200">
									No suggestions yet
								</p>
								<p
									class="text-xs leading-relaxed text-slate-500 dark:text-slate-400"
								>
									Save this session or regenerate to receive tailored focus ideas.
								</p>
								{#if isEditing && block}
									<Button
										type="button"
										variant="primary"
										size="sm"
										onclick={handleRegenerate}
										loading={isRegenerating}
										class="sm:hidden"
									>
										<Zap class="h-4 w-4" />
										<span
											>{isRegenerating
												? 'Generating...'
												: 'Generate Suggestions'}</span
										>
									</Button>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</section>

			<aside class="lg:col-span-1 flex flex-col gap-4">
				<div
					class="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/85 dark:bg-slate-900/70 shadow-sm backdrop-blur-sm px-4 sm:px-5 py-5 space-y-4"
				>
					<div class="flex items-center justify-between">
						<h3
							class="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400"
						>
							Session Controls
						</h3>
						{#if isEditing}
							<span
								class="inline-flex items-center gap-1 rounded-full bg-slate-100/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800/70 dark:text-slate-300"
							>
								{editingEnabled ? 'Editing' : 'Viewing'}
							</span>
						{/if}
					</div>
					{#if isEditing}
						<Button
							variant={editingEnabled ? 'outline' : 'primary'}
							size="sm"
							class="w-full justify-center"
							onclick={() => (editingEnabled = !editingEnabled)}
						>
							<PencilLine class="h-4 w-4" />
							<span>{editingEnabled ? 'Exit Edit Mode' : 'Edit Session'}</span>
						</Button>
						<p class="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
							{editingEnabled
								? 'Adjust session details and timing, then save your changes.'
								: 'Enable editing to adjust timing, project context, or session type.'}
						</p>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							class="w-full justify-center"
							onclick={handleRegenerate}
							loading={isRegenerating}
							disabled={!block}
						>
							<Zap class="h-4 w-4" />
							<span
								>{isRegenerating
									? 'Regenerating...'
									: 'Regenerate Suggestions'}</span
							>
						</Button>
					{:else}
						<p class="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
							Craft the perfect block: set the type, project, and timing, then add it
							to your schedule.
						</p>
					{/if}
				</div>

				{#if isEditing && block}
					<div
						class="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/85 dark:bg-slate-900/70 shadow-sm backdrop-blur-sm px-4 sm:px-5 py-5 space-y-3"
					>
						<h4
							class="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400"
						>
							Calendar Sync
						</h4>
						<div
							class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"
						>
							<div
								class="h-2.5 w-2.5 rounded-full {block.sync_status === 'synced'
									? 'bg-emerald-500'
									: 'bg-amber-500'}"
							></div>
							<span class="font-medium">
								{block.sync_status === 'synced'
									? 'Synced to calendar'
									: 'Pending sync'}
							</span>
						</div>
						{#if block.calendar_event_link}
							<a
								href={block.calendar_event_link}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
							>
								<Calendar class="h-4 w-4" />
								<span>Open calendar event</span>
							</a>
						{/if}
					</div>
				{/if}

				<div
					class="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/85 dark:bg-slate-900/70 shadow-sm backdrop-blur-sm px-4 sm:px-5 py-5 space-y-4"
				>
					<div class="space-y-3 text-xs text-slate-600 dark:text-slate-300">
						<div class="flex items-center justify-between gap-3">
							<span
								class="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-[0.32em]"
							>
								Overview
							</span>
						</div>
						<div class="space-y-2">
							<div class="flex items-center justify-between gap-3">
								<span>Focus type</span>
								<span
									class="text-right font-semibold text-slate-900 dark:text-white"
								>
									{blockType === 'project' ? 'Project session' : 'Build session'}
								</span>
							</div>
							{#if durationMinutes > 0}
								<div class="flex items-center justify-between gap-3">
									<span>Duration</span>
									<span
										class="text-right font-semibold text-slate-900 dark:text-white"
									>
										{durationDisplay}
									</span>
								</div>
							{/if}
							{#if startDateSummary}
								<div class="flex items-start justify-between gap-3">
									<span>Starts</span>
									<span
										class="text-right font-semibold text-slate-900 dark:text-white"
									>
										{startDateSummary}
									</span>
								</div>
							{/if}
							{#if endDateSummary}
								<div class="flex items-start justify-between gap-3">
									<span>Ends</span>
									<span
										class="text-right font-semibold text-slate-900 dark:text-white"
									>
										{endDateSummary}
									</span>
								</div>
							{/if}
							<div class="flex items-start justify-between gap-3">
								<span>Timezone</span>
								<span
									class="text-right font-semibold text-slate-900 dark:text-white"
								>
									{timezoneDisplay}
								</span>
							</div>
						</div>
					</div>
					{#if blockType === 'project' && (block?.project?.name || selectedProjectId)}
						<div
							class="rounded-xl border border-slate-200/60 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300"
						>
							<span class="font-semibold text-slate-700 dark:text-slate-200">
								Project
							</span>
							<p class="mt-1 text-sm font-medium text-slate-900 dark:text-white">
								{#if block?.project?.name}
									{block.project.name}
								{:else if selectedProjectId}
									{#each projects as project}
										{#if project.id === selectedProjectId}
											{project.name}
										{/if}
									{/each}
								{:else}
									Not selected
								{/if}
							</p>
						</div>
					{/if}
				</div>

				{#if isEditing && block}
					<div
						class="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/85 dark:bg-slate-900/70 shadow-sm backdrop-blur-sm px-4 sm:px-5 py-5 space-y-3"
					>
						<h4
							class="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400"
						>
							Activity
						</h4>
						<div class="space-y-2 text-xs text-slate-600 dark:text-slate-300">
							<div>Created {formatRelativeTime(block.created_at)}</div>
							{#if block.updated_at !== block.created_at}
								<div>Updated {formatRelativeTime(block.updated_at)}</div>
							{/if}
						</div>
					</div>
				{/if}
			</aside>
		</div>
	</div>
</FormModal>
