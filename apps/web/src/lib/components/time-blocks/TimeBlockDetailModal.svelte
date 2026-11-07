<!-- apps/web/src/lib/components/time-blocks/TimeBlockDetailModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EntityModalDetailsDrawer from '$lib/components/ontology/EntityModalDetailsDrawer.svelte';
	import type { TimeBlockWithProject, TimeBlockSuggestion } from '@buildos/shared-types';
	import { format } from 'date-fns';
	import { Calendar, Clock, Zap, PencilLine } from '$lib/icons/lucide';

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
		block.block_type === 'project' ? (block.project?.name ?? 'Project block') : 'Build block'
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
		} catch {
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
			parts.push(
				`${suggestion.priority.charAt(0).toUpperCase()}${suggestion.priority.slice(1)} priority`
			);
		}

		return parts.length > 0 ? parts.join(' · ') : null;
	}

	function handleDelete() {
		if (confirm('Delete this time block? This will also remove it from your calendar.')) {
			onDelete();
		}
	}
</script>

<Modal isOpen={true} {onClose} size="lg" title={blockTitle}>
	<div class="px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
		<div
			class="relative grid grid-cols-1 gap-y-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-y-5 lg:overflow-x-clip"
		>
			<section
				class="order-2 flex min-w-0 flex-col gap-4 lg:order-none lg:col-start-1 lg:row-start-1 lg:pr-1"
			>
				<div class="rounded-xl border border-border bg-card shadow-ink tx tx-frame tx-weak">
					<div
						class="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 sm:px-6 py-4"
					>
						<div class="space-y-2">
							<h2 class="text-lg font-medium text-foreground">
								{dayOfWeek}, {monthDay}
							</h2>
							<div class="flex flex-wrap items-center gap-2 text-sm text-foreground">
								<Clock class="h-4 w-4 text-muted-foreground" />
								<span class="font-medium text-foreground">{timeRange}</span>
								{#if durationDisplay}
									<span class="text-muted-foreground">·</span>
									<span class="text-muted-foreground">{durationDisplay}</span>
								{/if}
							</div>
							<div class="text-xs text-muted-foreground">
								{timezoneDisplay}
							</div>
						</div>
						<div class="flex flex-wrap gap-2">
							<span
								class="inline-flex items-center rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground"
							>
								{block.block_type === 'project' ? 'Project focus' : 'Build session'}
							</span>
							{#if block.block_type === 'build'}
								<span
									class="inline-flex items-center rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground"
								>
									Flexible window
								</span>
							{/if}
							{#if block.block_type === 'project' && block.project?.name}
								<span
									class="inline-flex items-center rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground"
								>
									{block.project.name}
								</span>
							{/if}
						</div>
					</div>
					<div class="px-4 sm:px-6 py-4 sm:py-6 space-y-5">
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div class="rounded-xl border border-border bg-card p-4 space-y-1">
								<span class="text-xs font-medium text-muted-foreground">Start</span>
								<p class="text-sm font-medium text-foreground">
									{startDateSummary}
								</p>
								<p class="text-xs text-muted-foreground">
									Started {formatRelativeTime(block.start_time)}
								</p>
							</div>
							<div class="rounded-xl border border-border bg-card p-4 space-y-1">
								<span class="text-xs font-medium text-muted-foreground">End</span>
								<p class="text-sm font-medium text-foreground">
									{endDateSummary}
								</p>
								<p class="text-xs text-muted-foreground">
									Ends {formatRelativeTime(block.end_time)}
								</p>
							</div>
						</div>
						{#if block.calendar_event_link}
							<a
								href={block.calendar_event_link}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground/20 hover:bg-muted/50"
							>
								<Calendar class="h-4 w-4 text-muted-foreground" />
								<span>Open calendar event</span>
							</a>
						{/if}
					</div>
				</div>

				<div class="rounded-xl border border-border bg-card shadow-ink tx tx-frame tx-weak">
					<div
						class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 sm:px-6 py-4"
					>
						<h3 class="flex items-center gap-2 text-base font-medium text-foreground">
							Focus suggestions
							{#if suggestionCount > 0}
								<span class="font-mono tabular-nums text-xs text-muted-foreground">
									{suggestionCount}
								</span>
							{/if}
						</h3>
						{#if block.suggestions_generated_at}
							<span class="text-xs text-muted-foreground">
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
										class="rounded-xl border border-border bg-card p-4 tx tx-frame tx-weak"
									>
										<div class="flex gap-3">
											<div
												class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-muted font-mono tabular-nums text-xs text-muted-foreground"
											>
												{index + 1}
											</div>
											<div class="flex-1 space-y-1">
												<div class="flex flex-wrap items-center gap-2">
													<h4 class="text-sm font-medium text-foreground">
														{suggestion.title}
													</h4>
													{#if suggestionMeta(suggestion)}
														<span class="text-xs text-muted-foreground">
															{suggestionMeta(suggestion)}
														</span>
													{/if}
												</div>
												<p class="text-sm leading-relaxed text-foreground">
													{suggestion.reason}
												</p>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div
								class="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-muted/50 p-5 text-sm text-foreground"
							>
								<p class="font-medium text-foreground">No suggestions yet</p>
								<p class="text-xs leading-relaxed text-muted-foreground">
									Generate focus ideas to make the most of this block.
								</p>
								{#if onRegenerate}
									<Button
										variant="primary"
										size="sm"
										onclick={onRegenerate}
										disabled={isRegenerating}
										loading={isRegenerating}
										class="sm:hidden"
									>
										<Zap class="h-4 w-4" />
										<span
											>{isRegenerating
												? 'Generating…'
												: 'Generate suggestions'}</span
										>
									</Button>
								{/if}
							</div>
						{/if}
					</div>
				</div>

				{#if block.suggestions_summary}
					<div
						class="rounded-xl border border-border bg-card shadow-ink px-5 py-5 text-sm leading-relaxed text-foreground tx tx-frame tx-weak"
					>
						<p class="mb-2 text-xs font-medium text-muted-foreground">Summary</p>
						<p>{block.suggestions_summary}</p>
					</div>
				{/if}
			</section>

			<EntityModalDetailsDrawer
				panelLabel="Time block details"
				mobileDetailsFirst
				class="flex flex-col gap-4"
			>
				<div
					class="rounded-xl border border-border bg-card shadow-ink px-4 sm:px-5 py-5 space-y-4 tx tx-frame tx-weak"
				>
					<div class="flex items-center justify-between">
						<h3 class="text-xs font-medium text-muted-foreground">Session</h3>
						<span class="inline-flex items-center gap-2 text-xs text-muted-foreground">
							<span
								class="h-1.5 w-1.5 rounded-full {isEditMode
									? 'bg-foreground'
									: 'bg-muted-foreground/50'}"
							></span>
							{isEditMode ? 'Editing' : 'Viewing'}
						</span>
					</div>
					{#if onUpdate}
						<Button
							variant={isEditMode ? 'outline' : 'primary'}
							size="sm"
							class="w-full justify-center"
							onclick={() => (isEditMode ? exitEditMode() : enterEditMode())}
						>
							<PencilLine class="h-4 w-4" />
							<span>{isEditMode ? 'Close editor' : 'Edit session'}</span>
						</Button>
					{/if}
					{#if onRegenerate}
						<Button
							variant="secondary"
							size="sm"
							class="w-full justify-center"
							onclick={onRegenerate}
							loading={isRegenerating}
							disabled={isRegenerating}
						>
							<Zap class="h-4 w-4" />
							<span
								>{isRegenerating ? 'Regenerating…' : 'Regenerate suggestions'}</span
							>
						</Button>
					{/if}
				</div>

				{#if isEditMode}
					<div
						class="rounded-xl border border-border bg-card shadow-ink px-4 sm:px-5 py-5 space-y-4 tx tx-frame tx-weak"
					>
						<h4 class="text-xs font-medium text-muted-foreground">Edit details</h4>
						{#if validationErrors.length > 0 || saveError}
							<div
								class="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
							>
								{#each validationErrors as error}
									<p>{error}</p>
								{/each}
								{#if saveError}
									<p>{saveError}</p>
								{/if}
							</div>
						{/if}
						<div class="space-y-4 text-sm text-foreground">
							<div class="space-y-2">
								<label
									class="text-xs font-medium text-muted-foreground"
									for="edit-start">Start date & time</label
								>
								<input
									id="edit-start"
									type="datetime-local"
									bind:value={editFormData.start_time}
									class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring"
								/>
							</div>
							<div class="space-y-2">
								<label
									class="text-xs font-medium text-muted-foreground"
									for="edit-end">End date & time</label
								>
								<input
									id="edit-end"
									type="datetime-local"
									bind:value={editFormData.end_time}
									class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring"
								/>
							</div>
							<div class="space-y-2">
								<label
									class="text-xs font-medium text-muted-foreground"
									for="edit-timezone">Timezone</label
								>
								<select
									id="edit-timezone"
									bind:value={editFormData.timezone}
									class="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring"
								>
									{#each TIMEZONES as tz (tz)}
										<option value={tz}>{tz}</option>
									{/each}
								</select>
							</div>
							<label class="flex items-center gap-2 text-sm text-foreground">
								<input
									type="checkbox"
									bind:checked={editFormData.regenerate_suggestions}
									class="h-4 w-4 rounded border-border text-accent focus:ring-ring"
								/>
								<span>Regenerate suggestions after saving</span>
							</label>
							<div
								class="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
							>
								New duration: <span class="font-mono tabular-nums"
									>{calculateDuration(
										editFormData.start_time,
										editFormData.end_time
									)}</span
								> minutes
							</div>
						</div>
					</div>
				{/if}

				<div
					class="rounded-xl border border-border bg-card shadow-ink px-4 sm:px-5 py-5 space-y-3 tx tx-frame tx-weak"
				>
					<h4 class="text-xs font-medium text-muted-foreground">Calendar sync</h4>
					<div class="flex items-center gap-2 text-xs text-muted-foreground">
						<span
							class="h-1.5 w-1.5 rounded-full {block.sync_status === 'synced'
								? 'bg-success'
								: 'bg-warning'}"
						></span>
						<span>
							{block.sync_status === 'synced' ? 'Synced to calendar' : 'Pending sync'}
						</span>
					</div>
				</div>

				<div
					class="rounded-xl border border-border bg-card shadow-ink px-4 sm:px-5 py-5 space-y-4 tx tx-frame tx-weak"
				>
					<h4 class="text-xs font-medium text-muted-foreground">Overview</h4>
					<div class="space-y-2 text-xs text-muted-foreground">
						<div class="flex items-center justify-between gap-3">
							<span>Focus type</span>
							<span class="text-right font-medium text-foreground">
								{block.block_type === 'project'
									? 'Project session'
									: 'Build session'}
							</span>
						</div>
						{#if durationDisplay}
							<div class="flex items-center justify-between gap-3">
								<span>Duration</span>
								<span class="text-right font-medium text-foreground">
									{durationDisplay}
								</span>
							</div>
						{/if}
						<div class="flex items-start justify-between gap-3">
							<span>Starts</span>
							<span class="text-right font-medium text-foreground">
								{startDateSummary}
							</span>
						</div>
						<div class="flex items-start justify-between gap-3">
							<span>Ends</span>
							<span class="text-right font-medium text-foreground">
								{endDateSummary}
							</span>
						</div>
						<div class="flex items-start justify-between gap-3">
							<span>Timezone</span>
							<span class="text-right font-medium text-foreground">
								{timezoneDisplay}
							</span>
						</div>
						<div class="flex items-start justify-between gap-3">
							<span>Suggestions</span>
							<span class="text-right font-medium text-foreground">
								{suggestionCount > 0 ? `${suggestionCount} ready` : 'None yet'}
							</span>
						</div>
						{#if block.block_type === 'project' && block.project?.name}
							<div class="flex items-start justify-between gap-3">
								<span>Project</span>
								<span class="text-right font-medium text-foreground">
									{block.project.name}
								</span>
							</div>
						{/if}
					</div>
				</div>

				<div
					class="rounded-xl border border-border bg-card shadow-ink px-4 sm:px-5 py-5 space-y-3 tx tx-frame tx-weak"
				>
					<h4 class="text-xs font-medium text-muted-foreground">Activity</h4>
					<div class="space-y-2 text-xs text-muted-foreground">
						<div>Created {formatRelativeTime(block.created_at)}</div>
						{#if block.updated_at !== block.created_at}
							<div>Updated {formatRelativeTime(block.updated_at)}</div>
						{/if}
					</div>
				</div>
			</EntityModalDetailsDrawer>
		</div>
	</div>

	{#snippet footer()}
		<div
			class="flex flex-col sm:flex-row gap-3 sm:justify-between px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-border bg-muted/30"
		>
			{#if isEditMode}
				<div class="flex flex-col sm:flex-row gap-3 w-full sm:justify-end">
					<Button
						variant="outline"
						size="sm"
						class="w-full sm:w-auto"
						onclick={exitEditMode}
						disabled={isSaving}
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						size="sm"
						class="w-full sm:w-auto"
						onclick={handleSaveChanges}
						loading={isSaving}
						disabled={validationErrors.length > 0 || isSaving}
					>
						Save changes
					</Button>
				</div>
			{:else}
				<div class="flex flex-col sm:flex-row gap-3 w-full sm:justify-between">
					<Button
						variant="danger"
						size="sm"
						class="w-full sm:w-auto"
						onclick={handleDelete}
					>
						Delete block
					</Button>
					<Button variant="outline" size="sm" class="w-full sm:w-auto" onclick={onClose}>
						Close
					</Button>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>
