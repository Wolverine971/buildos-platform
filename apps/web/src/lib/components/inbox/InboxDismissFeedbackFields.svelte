<!-- apps/web/src/lib/components/inbox/InboxDismissFeedbackFields.svelte -->
<script lang="ts">
	import { untrack } from 'svelte';
	import { ChevronDown } from '$lib/icons/lucide';

	type FeedbackReason = 'not_relevant' | 'wrong_evidence' | 'intentional' | 'too_risky' | 'other';

	type FeedbackReasonOption = {
		value: '' | FeedbackReason;
		label: string;
	};

	let {
		idPrefix,
		reason = '',
		note = '',
		disabled = false,
		onReasonChange,
		onNoteChange
	}: {
		idPrefix: string;
		reason?: string;
		note?: string;
		disabled?: boolean;
		onReasonChange?: (value: string) => void;
		onNoteChange?: (value: string) => void;
	} = $props();

	let open = $state(untrack(() => Boolean(reason || note)));
	const propsId = $props.id();
	const fieldsId = $derived(`${idPrefix}-dismiss-feedback-${propsId}`);

	const reasonOptions: FeedbackReasonOption[] = [
		{ value: '', label: 'Dismiss reason' },
		{ value: 'not_relevant', label: 'Not relevant' },
		{ value: 'wrong_evidence', label: 'Wrong evidence' },
		{ value: 'intentional', label: 'Intentional as-is' },
		{ value: 'too_risky', label: 'Too risky' },
		{ value: 'other', label: 'Other' }
	];

	function handleReasonChange(event: Event) {
		onReasonChange?.((event.currentTarget as HTMLSelectElement).value);
	}

	function handleNoteInput(event: Event) {
		onNoteChange?.((event.currentTarget as HTMLTextAreaElement).value);
	}
</script>

<div class="mt-3 rounded-md border border-border bg-muted/20 p-2">
	<button
		type="button"
		{disabled}
		aria-expanded={open}
		aria-controls={fieldsId}
		onclick={() => (open = !open)}
		class="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-md px-2 text-left transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60"
	>
		<span class="flex min-w-0 items-center gap-2">
			<ChevronDown
				class="h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none {open
					? 'rotate-0'
					: '-rotate-90'}"
			/>
			<span class="truncate text-xs font-medium text-foreground">
				{open ? 'Hide dismiss feedback' : 'Add dismiss feedback'}
			</span>
		</span>
		<span class="micro-label shrink-0 text-muted-foreground">
			{reason || note ? 'Saved' : 'Optional'}
		</span>
	</button>

	{#if open}
		<div id={fieldsId} class="mt-2 grid gap-2 sm:grid-cols-[minmax(10rem,13rem)_1fr]">
			<select
				id={`${idPrefix}-dismiss-reason`}
				value={reason}
				{disabled}
				onchange={handleReasonChange}
				class="h-11 rounded-md border border-border-strong bg-background px-2.5 text-xs text-foreground shadow-ink-inner outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60"
				aria-label="Dismiss reason"
			>
				{#each reasonOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
			<textarea
				id={`${idPrefix}-dismiss-note`}
				value={note}
				rows="1"
				{disabled}
				oninput={handleNoteInput}
				placeholder="Optional note"
				class="min-h-11 resize-y rounded-md border border-border-strong bg-background px-2.5 py-2.5 text-xs text-foreground shadow-ink-inner outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60"
				aria-label="Dismiss note"
			></textarea>
		</div>
	{/if}
</div>
