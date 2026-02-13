<!-- apps/web/src/lib/components/tasks/RecurrenceSelector.svelte -->
<script lang="ts">
	import { RefreshCw, Calendar } from 'lucide-svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import { recurrencePatternBuilder } from '$lib/services/recurrence-pattern.service';
	import type { Database } from '@buildos/shared-types';

	type RecurrencePattern = Database['public']['Enums']['recurrence_pattern'];

	export let pattern: RecurrencePattern = 'daily';
	export let endDate: string | null = null;
	export let startDate: string;
	export let projectEndDate: string | null = null;
	export let onChange: (config: {
		pattern: RecurrencePattern;
		endDate: string | null;
		rrule: string;
		nextOccurrences: Date[];
	}) => void = () => {};

	let endOption: 'never' | 'date' = endDate ? 'date' : 'never';
	let nextOccurrences: Date[] = [];
	let rrule = '';

	$: {
		// Update end date based on end option
		if (endOption === 'never') {
			endDate = null;
		}
	}

	$: {
		// Calculate next occurrences when pattern or dates change
		if (startDate) {
			const config = {
				pattern: { type: pattern },
				startDate,
				endOption: endDate
					? { type: 'date' as const, value: endDate }
					: { type: 'never' as const }
			};
			rrule = recurrencePatternBuilder.buildRRule(config);
			nextOccurrences = recurrencePatternBuilder.calculateInstances(config, 5);

			// Notify parent of changes
			onChange({
				pattern,
				endDate,
				rrule,
				nextOccurrences
			});
		}
	}

	function formatDate(date: Date): string {
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<div
	class="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
>
	<div class="flex items-center space-x-2">
		<RefreshCw class="w-4 h-4 text-blue-600 dark:text-blue-400" />
		<span class="font-medium text-blue-900 dark:text-blue-100">Recurrence Settings</span>
	</div>

	<!-- Pattern Selection -->
	<div>
		<label for="recurrence-pattern" class="block text-sm font-medium text-foreground mb-1">
			Repeats
		</label>
		<Select id="recurrence-pattern" bind:value={pattern} size="sm">
			<option value="daily">Daily</option>
			<option value="weekdays">Weekdays (Mon-Fri)</option>
			<option value="weekly">Weekly</option>
			<option value="biweekly">Every 2 weeks</option>
			<option value="monthly">Monthly</option>
			<option value="quarterly">Quarterly</option>
			<option value="yearly">Yearly</option>
		</Select>
	</div>

	<!-- End Options -->
	<fieldset class="space-y-2">
		<legend class="block text-sm font-medium text-foreground mb-2">
			Ends
			{#if projectEndDate && endOption === 'never'}
				<span class="text-xs text-muted-foreground ml-2">
					(Will use project end: {new Date(projectEndDate).toLocaleDateString('en-US', {
						month: 'short',
						day: 'numeric',
						year: 'numeric'
					})})
				</span>
			{/if}
		</legend>
		<label class="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-muted">
			<input
				type="radio"
				name="recurrence-end"
				value="never"
				checked={endOption === 'never'}
				onchange={() => (endOption = 'never')}
				class="w-4 h-4 text-blue-600 border-border focus:ring-blue-500"
			/>
			<span class="text-sm text-foreground">Never</span>
		</label>

		<div class="space-y-2">
			<label class="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-muted">
				<input
					type="radio"
					name="recurrence-end"
					value="date"
					checked={endOption === 'date'}
					onchange={() => (endOption = 'date')}
					class="w-4 h-4 text-blue-600 border-border focus:ring-blue-500"
				/>
				<span class="text-sm text-foreground">On date</span>
			</label>

			{#if endOption === 'date'}
				<div class="ml-8 mt-1">
					<TextInput
						id="end-date"
						type="date"
						bind:value={endDate}
						min={startDate}
						max={projectEndDate || undefined}
						size="sm"
						placeholder="Select end date"
						class="w-full max-w-xs"
					/>
				</div>
			{/if}
		</div>
	</fieldset>

	<!-- Preview -->
	{#if nextOccurrences.length > 0}
		<div class="mt-4 p-3 bg-card rounded-md border border-border">
			<h4 class="text-sm font-medium text-foreground mb-2">Next occurrences:</h4>
			<ul class="text-sm text-muted-foreground space-y-1">
				{#each nextOccurrences as date}
					<li class="flex items-center space-x-2">
						<Calendar class="w-3 h-3 text-muted-foreground" />
						<span>{formatDate(date)}</span>
					</li>
				{/each}
			</ul>
			{#if !endDate}
				<p class="text-xs text-muted-foreground mt-2 italic">Continues indefinitely</p>
			{:else}
				<p class="text-xs text-muted-foreground mt-2 italic">
					Ends on {formatDate(new Date(endDate))}
				</p>
			{/if}
		</div>
	{/if}
</div>
