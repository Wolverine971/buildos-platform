<!-- apps/web/src/lib/components/ontology/TaskSeriesModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';

	interface Props {
		task: Record<string, any> | null;
		isOpen?: boolean;
		onClose?: () => void;
	}

	let { task, isOpen = $bindable(false), onClose }: Props = $props();

	const dispatch = createEventDispatcher<{
		success: { series_id: string };
	}>();

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

			dispatch('success', { series_id: result?.data?.series_id });
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
	title="Make Task Recurring"
	size="lg"
	onClose={() => {
		onClose?.();
	}}
>
	<div class="space-y-6">
		<div class="space-y-1">
			<label class="text-sm font-medium text-gray-700 dark:text-gray-200"> Timezone </label>
			<TextInput
				bind:value={timezone}
				placeholder="e.g. America/Los_Angeles"
				list="timezone-options"
				disabled={isSubmitting}
			/>
			<datalist id="timezone-options">
				{#each getTimezoneOptions(COMMON_TIMEZONES) as tz}
					<option value={tz} />
				{/each}
			</datalist>
			<p class="text-xs text-gray-500">Start and recurrence will follow this timezone.</p>
		</div>

		<div class="space-y-1">
			<label class="text-sm font-medium text-gray-700 dark:text-gray-200">
				Start date & time
			</label>
			<input
				type="datetime-local"
				class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
				bind:value={startAt}
				disabled={isSubmitting}
			/>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<div>
				<label class="text-sm font-medium text-gray-700 dark:text-gray-200">
					Frequency
				</label>
				<Select bind:value={frequency} disabled={isSubmitting}>
					<option value="DAILY">Daily</option>
					<option value="WEEKLY">Weekly</option>
					<option value="MONTHLY">Monthly</option>
				</Select>
			</div>

			<div>
				<label class="text-sm font-medium text-gray-700 dark:text-gray-200">
					Interval
				</label>
				<TextInput type="number" min="1" bind:value={interval} disabled={isSubmitting} />
			</div>

			<div>
				<label class="text-sm font-medium text-gray-700 dark:text-gray-200">
					Occurrences
				</label>
				<TextInput
					type="number"
					min="1"
					max="200"
					bind:value={count}
					disabled={isSubmitting}
				/>
			</div>
		</div>

		<div
			class="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/10 p-4 text-sm text-blue-900 dark:text-blue-100"
		>
			<p class="font-medium">Generated RRULE</p>
			<p class="font-mono text-xs break-all mt-1 text-blue-800 dark:text-blue-200">
				{buildRrule()}
			</p>
		</div>

		{#if error}
			<div
				class="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-200"
			>
				{error}
			</div>
		{/if}

		<div class="flex justify-end gap-3">
			<Button
				variant="ghost"
				type="button"
				onclick={() => onClose?.()}
				disabled={isSubmitting}
			>
				Cancel
			</Button>
			<Button variant="primary" type="button" onclick={handleSubmit} disabled={isSubmitting}>
				{#if isSubmitting}
					Creating...
				{:else}
					Make Recurring
				{/if}
			</Button>
		</div>
	</div>
</Modal>
