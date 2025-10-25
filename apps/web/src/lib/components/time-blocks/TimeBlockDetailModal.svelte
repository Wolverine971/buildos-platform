<!-- apps/web/src/lib/components/time-blocks/TimeBlockDetailModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { TimeBlockWithProject, TimeBlockSuggestion } from '@buildos/shared-types';
	import { format } from 'date-fns';
	import { Calendar, Clock, Zap, PencilLine } from 'lucide-svelte';

	let {
		block,
		isRegenerating = false,
		onClose,
		onDelete,
		onRegenerate,
		onUpdate
	}: {
		block: TimeBlockWithProject;
		isRegenerating?: boolean;
		onClose: () => void;
		onDelete: () => void;
		onRegenerate: () => void;
		onUpdate?: (params: any) => Promise<void>;
	} = $props();

	let isEditMode = $state(false);
	let isSaving = $state(false);
	let validationErrors = $state<string[]>([]);
	let saveError = $state<string | null>(null);

	let editFormData = $state({
		start_time: '',
		end_time: '',
		timezone: '',
		regenerate_suggestions: false
	});

	const TIMEZONES = [
		'America/New_York',
		'America/Chicago',
		'America/Denver',
		'America/Los_Angeles',
		'America/Anchorage',
		'Pacific/Honolulu',
		'Europe/London',
		'Europe/Paris',
		'Europe/Berlin',
		'Europe/Istanbul',
		'Asia/Dubai',
		'Asia/Bangkok',
		'Asia/Shanghai',
		'Asia/Tokyo',
		'Asia/Hong_Kong',
		'Asia/Singapore',
		'Australia/Sydney',
		'Australia/Melbourne',
		'Pacific/Auckland'
	];

	const startDate = $derived(new Date(block.start_time));
	const endDate = $derived(new Date(block.end_time));
	const dayOfWeek = $derived(startDate.toLocaleDateString('en-US', { weekday: 'long' }));
	const monthDay = $derived(
		startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
	);
	const startTime = $derived(
		startDate.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		})
	);
	const endTime = $derived(
		endDate.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		})
	);
	const timeRange = $derived(`${startTime} - ${endTime}`);
	const startDateDisplay = $derived(format(startDate, "MMM d, yyyy 'at' h:mm a"));
	const endDateDisplay = $derived(format(endDate, "MMM d, yyyy 'at' h:mm a"));
	const blockTitle = $derived(
		block.block_type === 'project' ? (block.project?.name ?? 'Project Block') : 'Build Block'
	);
	const timezoneDisplay = $derived(
		block.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
	);
	const durationDisplay = $derived.by(() => {
		const minutes = block.duration_minutes;
		if (!minutes || minutes <= 0) return '';
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		if (hours && mins) return `${hours}h ${mins}m`;
		if (hours) return `${hours}h`;
		return `${mins}m`;
	});
	const startDateSummary = $derived.by(() => {
		try {
			return format(startDate, 'EEE, MMM d | h:mm a');
		} catch {
			return startDateDisplay;
		}
	});
	const endDateSummary = $derived.by(() => {
		try {
			return format(endDate, 'EEE, MMM d | h:mm a');
		} catch {
			return endDateDisplay;
		}
	});
	const suggestions = $derived(getSuggestions());
	const suggestionCount = $derived(suggestions.length);

	function formatDateTimeForInput(date: Date | string | null): string {
		if (!date) return '';
		try {
			const dateObj = typeof date === 'string' ? new Date(date) : date;
			if (isNaN(dateObj.getTime())) return '';
			return format(dateObj, "yyyy-MM-dd'T'HH:mm");
		} catch (error) {
			console.warn('Failed to format datetime for input:', date, error);
			return '';
		}
	}

	function parseDateTimeFromInput(value: string): Date | null {
		if (!value) return null;
		try {
			const parsed = new Date(value);
			return isNaN(parsed.getTime()) ? null : parsed;
		} catch (error) {
			console.warn('Failed to parse datetime from input:', value, error);
			return null;
		}
	}

	function calculateDuration(startStr: string, endStr: string): number {
		if (!startStr || !endStr) return 0;
		const start = new Date(startStr);
		const end = new Date(endStr);
		if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
		return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
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

	function enterEditMode() {
		editFormData = {
			start_time: formatDateTimeForInput(block.start_time),
			end_time: formatDateTimeForInput(block.end_time),
			timezone: block.timezone || 'America/New_York',
			regenerate_suggestions: false
		};
		validationErrors = [];
		saveError = null;
		isEditMode = true;
	}

	function exitEditMode() {
		isEditMode = false;
		validationErrors = [];
		saveError = null;
		editFormData = {
			start_time: '',
			end_time: '',
			timezone: '',
			regenerate_suggestions: false
		};
	}

	function validateForm(): string[] {
		const errors: string[] = [];

		if (!editFormData.start_time || !editFormData.end_time) {
			return errors;
		}

		try {
			const start = new Date(editFormData.start_time);
			const end = new Date(editFormData.end_time);

			if (isNaN(start.getTime()) || isNaN(end.getTime())) {
				errors.push('Invalid date format');
				return errors;
			}

			const durationMs = end.getTime() - start.getTime();
			const durationMin = durationMs / (1000 * 60);

			if (durationMin < 15) {
				errors.push('Time block must be at least 15 minutes');
			}
			if (durationMin > 600) {
				errors.push('Time block cannot exceed 600 minutes (10 hours)');
			}
			if (end <= start) {
				errors.push('End time must be after start time');
			}
		} catch (error) {
			errors.push('Invalid date or time');
		}

		return errors;
	}

	async function handleSaveChanges() {
		const errors = validateForm();
		if (errors.length > 0) {
			validationErrors = errors;
			return;
		}

		isSaving = true;
		saveError = null;

		try {
			const start = parseDateTimeFromInput(editFormData.start_time);
			const end = parseDateTimeFromInput(editFormData.end_time);

			if (!start || !end) {
				throw new Error('Invalid date/time');
			}

			if (onUpdate) {
				await onUpdate({
					start_time: start,
					end_time: end,
					timezone: editFormData.timezone,
					regenerate_suggestions: editFormData.regenerate_suggestions
				});
			}

			exitEditMode();
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'Failed to save changes';
		} finally {
			isSaving = false;
		}
	}

	$effect(() => {
		if (isEditMode && editFormData.start_time && editFormData.end_time) {
			validationErrors = validateForm();
		}
	});

	function getSuggestions(): TimeBlockSuggestion[] {
		return Array.isArray(block.ai_suggestions) ? block.ai_suggestions : [];
	}

	function suggestionMeta(suggestion: TimeBlockSuggestion): string | null {
		const parts: string[] = [];

		if (block.block_type === 'build' && suggestion.project_name) {
			parts.push(suggestion.project_name);
		}

		if (suggestion.estimated_minutes) {
			parts.push(`${suggestion.estimated_minutes} min`);
		}

		if (suggestion.priority) {
			parts.push(suggestion.priority.toUpperCase());
		}

		return parts.length > 0 ? parts.join(' / ') : null;
	}

	function handleDelete() {
		if (confirm('Delete this time block? This will also remove it from your calendar.')) {
			onDelete();
		}
	}
</script>

<Modal isOpen={true} {onClose} size="lg" title={blockTitle}>
	<div class="px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
		<div class="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-5">
			<section class="lg:col-span-3 order-2 flex flex-col gap-4 lg:order-1 lg:pr-1">
				<div
					class="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/85 dark:bg-slate-900/70 shadow-sm backdrop-blur-sm transition-all hover:shadow-md"
				>
					<div
						class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 dark:border-slate-700/60 px-4 sm:px-6 py-4"
					>
						<div class="space-y-2">
							<p
								class="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500"
							>
								Session Overview
							</p>
							<h2 class="text-lg font-semibold text-slate-900 dark:text-white">
								{dayOfWeek}, {monthDay}
							</h2>
							<div
								class="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
							>
								<Clock class="h-4 w-4 text-blue-500 dark:text-blue-300" />
								<span class="font-semibold text-slate-900 dark:text-white"
									>{timeRange}</span
								>
								{#if durationDisplay}
									<span class="text-slate-400">|</span>
									<span>{durationDisplay}</span>
								{/if}
							</div>
							<div
								class="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
							>
								{timezoneDisplay}
							</div>
						</div>
						<div class="flex flex-wrap gap-2">
							<span
								class="inline-flex items-center rounded-full bg-slate-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800/70 dark:text-slate-200"
							>
								{block.block_type === 'project' ? 'Project focus' : 'Build session'}
							</span>
							{#if block.block_type === 'build'}
								<span
									class="inline-flex items-center rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
								>
									Flexible window
								</span>
							{/if}
							{#if block.block_type === 'project' && block.project?.name}
								<span
									class="inline-flex items-center rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
								>
									{block.project.name}
								</span>
							{/if}
						</div>
					</div>
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
									{startDateSummary}
								</p>
								<p class="text-xs text-slate-500 dark:text-slate-400">
									Started {formatRelativeTime(block.start_time)}
								</p>
							</div>
							<div
								class="rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/60 p-4 space-y-1.5"
							>
								<span
									class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
									>End</span
								>
								<p class="text-sm font-semibold text-slate-900 dark:text-white">
									{endDateSummary}
								</p>
								<p class="text-xs text-slate-500 dark:text-slate-400">
									Ends {formatRelativeTime(block.end_time)}
								</p>
							</div>
						</div>
						{#if block.calendar_event_link}
							<a
								href={block.calendar_event_link}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-blue-200/60 bg-blue-50/70 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:border-blue-400/40 dark:hover:bg-blue-500/20"
							>
								<Calendar class="h-4 w-4" />
								<span>Open calendar event</span>
							</a>
						{/if}
					</div>
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
								{suggestionCount > 0
									? `${suggestionCount} curated ideas`
									: 'Personalized guidance'}
							</h3>
						</div>
						{#if block.suggestions_generated_at}
							<span
								class="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
							>
								Updated {format(
									new Date(block.suggestions_generated_at),
									'MMM d, h:mm a'
								)}
							</span>
						{/if}
					</div>
					<div class="px-4 sm:px-6 py-4 sm:py-6">
						{#if suggestionCount > 0}
							<div class="space-y-3">
								{#each suggestions as suggestion, index}
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
													{#if suggestionMeta(suggestion)}
														<span
															class="inline-flex items-center rounded-full bg-slate-100/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200/60 dark:bg-slate-800/70 dark:text-slate-200 dark:ring-white/10"
														>
															{suggestionMeta(suggestion)}
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
									Generate tailored focus ideas to make the most of this block.
								</p>
								{#if onRegenerate}
									<Button
										variant="primary"
										size="sm"
										on:click={onRegenerate}
										disabled={isRegenerating}
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

				{#if block.suggestions_summary}
					<div
						class="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/85 dark:bg-slate-900/70 shadow-sm backdrop-blur-sm px-5 py-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
					>
						<p
							class="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400"
						>
							AI Summary
						</p>
						<p>{block.suggestions_summary}</p>
					</div>
				{/if}
			</section>

			<aside class="lg:col-span-1 order-1 flex flex-col gap-4 lg:order-2">
				<div
					class="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/85 dark:bg-slate-900/70 shadow-sm backdrop-blur-sm px-4 sm:px-5 py-5 space-y-4"
				>
					<div class="flex items-center justify-between">
						<h3
							class="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400"
						>
							Session Controls
						</h3>
						<span
							class="inline-flex items-center gap-1 rounded-full bg-slate-100/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800/70 dark:text-slate-300"
						>
							{isEditMode ? 'Editing' : 'Viewing'}
						</span>
					</div>
					{#if onUpdate}
						<Button
							variant={isEditMode ? 'outline' : 'primary'}
							size="sm"
							class="w-full justify-center"
							on:click={() => (isEditMode ? exitEditMode() : enterEditMode())}
						>
							<PencilLine class="h-4 w-4" />
							<span>{isEditMode ? 'Close Editor' : 'Edit Session'}</span>
						</Button>
					{/if}
					{#if onRegenerate}
						<Button
							variant="secondary"
							size="sm"
							class="w-full justify-center"
							on:click={onRegenerate}
							loading={isRegenerating}
							disabled={isRegenerating}
						>
							<Zap class="h-4 w-4" />
							<span
								>{isRegenerating
									? 'Regenerating...'
									: 'Regenerate Suggestions'}</span
							>
						</Button>
					{/if}
					<p class="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
						Keep this block aligned with your schedule. Toggle editing to adjust timing
						or refresh suggestions.
					</p>
				</div>

				{#if isEditMode}
					<div
						class="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/85 dark:bg-slate-900/70 shadow-sm backdrop-blur-sm px-4 sm:px-5 py-5 space-y-4"
					>
						<h4
							class="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400"
						>
							Edit details
						</h4>
						{#if validationErrors.length > 0 || saveError}
							<div
								class="space-y-2 rounded-xl border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
							>
								{#each validationErrors as error}
									<p>{error}</p>
								{/each}
								{#if saveError}
									<p>{saveError}</p>
								{/if}
							</div>
						{/if}
						<div class="space-y-4 text-sm text-slate-600 dark:text-slate-300">
							<div class="space-y-2">
								<label
									class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
									for="edit-start">Start date & time</label
								>
								<input
									id="edit-start"
									type="datetime-local"
									bind:value={editFormData.start_time}
									class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
								/>
							</div>
							<div class="space-y-2">
								<label
									class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
									for="edit-end">End date & time</label
								>
								<input
									id="edit-end"
									type="datetime-local"
									bind:value={editFormData.end_time}
									class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
								/>
							</div>
							<div class="space-y-2">
								<label
									class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
									for="edit-timezone">Timezone</label
								>
								<select
									id="edit-timezone"
									bind:value={editFormData.timezone}
									class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
								>
									{#each TIMEZONES as tz}
										<option value={tz}>{tz}</option>
									{/each}
								</select>
							</div>
							<label
								class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
							>
								<input
									type="checkbox"
									bind:checked={editFormData.regenerate_suggestions}
									class="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
								/>
								<span>Regenerate suggestions after saving</span>
							</label>
							<div
								class="rounded-lg border border-slate-200/60 bg-slate-50/70 px-3 py-2 text-xs text-slate-500 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300"
							>
								New duration: {calculateDuration(
									editFormData.start_time,
									editFormData.end_time
								)} minutes
							</div>
						</div>
					</div>
				{/if}

				<div
					class="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/85 dark:bg-slate-900/70 shadow-sm backdrop-blur-sm px-4 sm:px-5 py-5 space-y-3"
				>
					<h4
						class="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400"
					>
						Calendar Sync
					</h4>
					<div class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
						<div
							class="h-2.5 w-2.5 rounded-full {block.sync_status === 'synced'
								? 'bg-emerald-500'
								: 'bg-amber-500'}"
						></div>
						<span class="font-medium">
							{block.sync_status === 'synced' ? 'Synced to calendar' : 'Pending sync'}
						</span>
					</div>
				</div>

				<div
					class="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/85 dark:bg-slate-900/70 shadow-sm backdrop-blur-sm px-4 sm:px-5 py-5 space-y-4"
				>
					<h4
						class="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400"
					>
						Overview
					</h4>
					<div class="space-y-2 text-xs text-slate-600 dark:text-slate-300">
						<div class="flex items-center justify-between gap-3">
							<span>Focus type</span>
							<span class="text-right font-semibold text-slate-900 dark:text-white">
								{block.block_type === 'project'
									? 'Project session'
									: 'Build session'}
							</span>
						</div>
						{#if durationDisplay}
							<div class="flex items-center justify-between gap-3">
								<span>Duration</span>
								<span
									class="text-right font-semibold text-slate-900 dark:text-white"
								>
									{durationDisplay}
								</span>
							</div>
						{/if}
						<div class="flex items-start justify-between gap-3">
							<span>Starts</span>
							<span class="text-right font-semibold text-slate-900 dark:text-white">
								{startDateSummary}
							</span>
						</div>
						<div class="flex items-start justify-between gap-3">
							<span>Ends</span>
							<span class="text-right font-semibold text-slate-900 dark:text-white">
								{endDateSummary}
							</span>
						</div>
						<div class="flex items-start justify-between gap-3">
							<span>Timezone</span>
							<span class="text-right font-semibold text-slate-900 dark:text-white">
								{timezoneDisplay}
							</span>
						</div>
						<div class="flex items-start justify-between gap-3">
							<span>Suggestions</span>
							<span class="text-right font-semibold text-slate-900 dark:text-white">
								{suggestionCount > 0 ? `${suggestionCount} ready` : 'None yet'}
							</span>
						</div>
						{#if block.block_type === 'project' && block.project?.name}
							<div class="flex items-start justify-between gap-3">
								<span>Project</span>
								<span
									class="text-right font-semibold text-slate-900 dark:text-white"
								>
									{block.project.name}
								</span>
							</div>
						{/if}
					</div>
				</div>

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
			</aside>
		</div>
	</div>

	<div
		class="flex flex-col sm:flex-row gap-3 sm:justify-between px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
		slot="footer"
	>
		{#if isEditMode}
			<div class="flex flex-col sm:flex-row gap-3 w-full sm:justify-end">
				<Button
					variant="outline"
					size="sm"
					class="w-full sm:w-auto"
					on:click={exitEditMode}
					disabled={isSaving}
				>
					Cancel
				</Button>
				<Button
					variant="primary"
					size="sm"
					class="w-full sm:w-auto"
					on:click={handleSaveChanges}
					loading={isSaving}
					disabled={validationErrors.length > 0 || isSaving}
				>
					Save Changes
				</Button>
			</div>
		{:else}
			<div class="flex flex-col sm:flex-row gap-3 w-full sm:justify-between">
				<Button variant="danger" size="sm" class="w-full sm:w-auto" on:click={handleDelete}>
					Delete Block
				</Button>
				<Button variant="outline" size="sm" class="w-full sm:w-auto" on:click={onClose}>
					Close
				</Button>
			</div>
		{/if}
	</div>
</Modal>
