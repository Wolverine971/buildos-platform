<!-- apps/web/src/lib/components/inbox/InboxDismissFeedbackFields.svelte -->
<script lang="ts">
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
	<p class="micro-label text-muted-foreground">Dismiss feedback</p>
	<div class="mt-2 grid gap-2 sm:grid-cols-[minmax(10rem,13rem)_1fr]">
		<select
			id={`${idPrefix}-dismiss-reason`}
			value={reason}
			{disabled}
			onchange={handleReasonChange}
			class="h-9 rounded-md border border-border-strong bg-background px-2.5 text-xs text-foreground shadow-ink-inner outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
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
			class="min-h-9 resize-y rounded-md border border-border-strong bg-background px-2.5 py-2 text-xs text-foreground shadow-ink-inner outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
			aria-label="Dismiss note"
		></textarea>
	</div>
</div>
