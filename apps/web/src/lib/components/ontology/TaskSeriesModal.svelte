<!-- apps/web/src/lib/components/ontology/TaskSeriesModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { X, RefreshCw } from 'lucide-svelte';

	let {
		task,
		isOpen = $bindable(false),
		onClose,
		onSuccess
	}: {
		task: Record<string, any> | null;
		isOpen?: boolean;
		onClose?: () => void;
		onSuccess?: (data: { series_id: string }) => void;
	} = $props();

	const COMMON_TIMEZONES = [
		'UTC',
		'America/New_York',
		'America/Chicago',
		'America/Denver',
		'America/Los_Angeles',
		'Europe/London',
		'Europe/Berlin',
		'Europe/Paris',
		'Asia/Singapore',
		'Asia/Tokyo',
		'Australia/Sydney'
	];

	const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

	let timezone = $state(defaultTimezone);
	let startAt = $state(getDefaultStart(task));
	let frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' = $state('WEEKLY');
	let interval: number | string = $state(1);
	let count: number | string = $state(8);
	let isSubmitting = $state(false);
	let error = $state('');

	$effect(() => {
		if (task && task.due_at) {
			startAt = formatForInput(task.due_at);
		} else if (!task && !startAt) {
			startAt = formatForInput(new Date().toISOString());
		}
	});

	function formatForInput(value: string) {
		const date = new Date(value);
		if (isNaN(date.getTime())) {
			return '';
		}
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
			date.getDate()
		).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(
			date.getMinutes()
		).padStart(2, '0')}`;
	}

	function getDefaultStart(currentTask?: Record<string, any> | null) {
		if (!currentTask) {
			return formatForInput(new Date().toISOString());
		}
		if (currentTask.due_at) {
			return formatForInput(currentTask.due_at);
		}
		if (currentTask.created_at) {
			return formatForInput(currentTask.created_at);
		}
		return formatForInput(new Date().toISOString());
	}

	function buildRrule() {
		const safeInterval = Math.max(1, Number(interval) || 1);
		const safeCount = Math.max(1, Number(count) || 1);
		const parts = [`FREQ=${frequency}`];
		if (safeInterval > 1) {
			parts.push(`INTERVAL=${safeInterval}`);
		}
		parts.push(`COUNT=${safeCount}`);
		return parts.join(';');
	}

	function getTimezoneOptions(base: string[]) {
		if (typeof Intl.supportedValuesOf === 'function') {
			return Intl.supportedValuesOf('timeZone');
		}
		return base;
	}

	async function handleSubmit() {
		if (!task) return;
		if (!startAt) {
			error = 'Start date is required';
			return;
		}

		error = '';
		isSubmitting = true;

		try {
			const payload = {
				timezone,
				start_at: new Date(startAt).toISOString(),
				rrule: buildRrule(),
				max_instances: Math.max(1, Number(count) || 1),
				regenerate_on_update: false
			};

			const response = await fetch(`/api/onto/tasks/${task.id}/series`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload)
			});

			const result = await response.json();
			if (!response.ok) {
				throw new Error(result?.error || 'Failed to make task recurring');
			}

			onSuccess?.({ series_id: result?.data?.series_id });
			onClose?.();
			isOpen = false;
		} catch (err) {
			console.error('Failed to create series', err);
			error = err instanceof Error ? err.message : 'Failed to make task recurring';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<Modal
	bind:isOpen
	size="lg"
	onClose={() => {
		onClose?.();
	}}
	showCloseButton={false}
>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="p-1.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0"
				>
					<RefreshCw class="w-4 h-4" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						Make Task Recurring
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5 truncate">
						{task?.title || 'Create recurring schedule'}
					</p>
				</div>
			</div>
			<!-- Inkprint close button -->
			<button
				type="button"
				onclick={() => onClose?.()}
				disabled={isSubmitting}
				class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:border-red-400/50 dark:hover:text-red-400"
				aria-label="Close modal"
			>
				<X class="h-4 w-4" />
			</button>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="space-y-4 sm:space-y-6">
			<div class="space-y-1">
				<label for="task-series-timezone" class="text-sm font-medium text-muted-foreground">
					Timezone
				</label>
				<TextInput
					id="task-series-timezone"
					bind:value={timezone}
					placeholder="e.g. America/Los_Angeles"
					list="timezone-options"
					disabled={isSubmitting}
				/>
				<datalist id="timezone-options">
					{#each getTimezoneOptions(COMMON_TIMEZONES) as tz}
						<option value={tz}></option>
					{/each}
				</datalist>
				<p class="text-xs text-muted-foreground">
					Start and recurrence will follow this timezone.
				</p>
			</div>

			<div class="space-y-1">
				<label for="task-series-start" class="text-sm font-medium text-muted-foreground">
					Start date & time
				</label>
				<input
					id="task-series-start"
					type="datetime-local"
					class="w-full rounded border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					bind:value={startAt}
					disabled={isSubmitting}
				/>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div>
					<label
						for="task-series-frequency"
						class="text-sm font-medium text-muted-foreground"
					>
						Frequency
					</label>
					<Select
						id="task-series-frequency"
						bind:value={frequency}
						disabled={isSubmitting}
					>
						<option value="DAILY">Daily</option>
						<option value="WEEKLY">Weekly</option>
						<option value="MONTHLY">Monthly</option>
					</Select>
				</div>

				<div>
					<label
						for="task-series-interval"
						class="text-sm font-medium text-muted-foreground"
					>
						Interval
					</label>
					<TextInput
						id="task-series-interval"
						type="number"
						min="1"
						bind:value={interval}
						disabled={isSubmitting}
					/>
				</div>

				<div>
					<label
						for="task-series-occurrences"
						class="text-sm font-medium text-muted-foreground"
					>
						Occurrences
					</label>
					<TextInput
						id="task-series-occurrences"
						type="number"
						min="1"
						max="200"
						bind:value={count}
						disabled={isSubmitting}
					/>
				</div>
			</div>

			<div
				class="rounded border border-accent/30 bg-accent/10 p-4 text-sm text-foreground tx tx-bloom tx-weak"
			>
				<p class="font-medium">Generated RRULE</p>
				<p class="font-mono text-xs break-all mt-1 text-accent">
					{buildRrule()}
				</p>
			</div>

			{#if error}
				<div
					class="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
				>
					{error}
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<div
			class="flex flex-row items-center justify-end gap-2 sm:gap-4 p-2 sm:p-4 border-t border-border bg-muted/30 tx tx-grain tx-weak"
		>
			<Button
				variant="ghost"
				size="sm"
				type="button"
				onclick={() => onClose?.()}
				disabled={isSubmitting}
				class="text-xs sm:text-sm px-2 sm:px-4"
			>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				type="button"
				onclick={handleSubmit}
				disabled={isSubmitting}
				class="text-xs sm:text-sm px-2 sm:px-4"
			>
				<RefreshCw class="w-3 h-3 sm:w-4 sm:h-4" />
				<span class="hidden sm:inline"
					>{isSubmitting ? 'Creating...' : 'Make Recurring'}</span
				>
				<span class="sm:hidden">{isSubmitting ? '...' : 'Recurring'}</span>
			</Button>
		</div>
	{/snippet}
</Modal>
