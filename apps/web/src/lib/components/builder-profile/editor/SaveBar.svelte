<!-- apps/web/src/lib/components/builder-profile/editor/SaveBar.svelte -->
<!-- The Save button at the foot of a group, with "Unsaved changes" / "Saved" and the
     server's message when the save fails. -->
<script lang="ts">
	import { Check } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		label,
		dirty,
		busy,
		saved,
		error,
		note = '',
		onsave
	}: {
		label: string;
		dirty: boolean;
		busy: boolean;
		saved: boolean;
		error: string | null;
		note?: string;
		onsave: () => void;
	} = $props();
</script>

<div class="space-y-2 border-t border-border pt-3">
	<div class="flex flex-wrap items-center gap-3">
		<Button variant="primary" size="sm" loading={busy} disabled={!dirty || busy} onclick={onsave}
			>{label}</Button
		>
		<span class="text-xs" aria-live="polite">
			{#if busy}
				<span class="text-muted-foreground">Saving…</span>
			{:else if saved && !dirty}
				<span class="inline-flex items-center gap-1 text-success"
					><Check class="h-3.5 w-3.5" aria-hidden="true" />Saved</span
				>
			{:else if dirty}
				<span class="text-muted-foreground">Unsaved changes</span>
			{/if}
		</span>
		{#if note}
			<span class="text-xs text-muted-foreground">{note}</span>
		{/if}
	</div>
	{#if error}
		<p class="text-sm text-destructive" role="alert">{error}</p>
	{/if}
</div>
