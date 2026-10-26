<!-- apps/web/src/lib/components/email-campaigns/MergeFieldChips.svelte -->
<script lang="ts">
	import { MERGE_FIELDS, type MergeFieldKey } from '$lib/email-campaigns/render';
	import { Plus } from 'lucide-svelte';

	let {
		disabled = false,
		oninsert
	}: {
		disabled?: boolean;
		oninsert: (token: string, key: MergeFieldKey) => void;
	} = $props();
</script>

<div class="flex flex-wrap items-center gap-1.5">
	<span class="micro-label mr-1">Fill in</span>
	{#each MERGE_FIELDS as field (field.key)}
		<button
			type="button"
			{disabled}
			class="inline-flex min-h-9 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0 pressable"
			title="Inserts {`{{${field.key}}}`} — falls back to “{field.fallback}” when unknown"
			onclick={() => oninsert(`{{${field.key}}}`, field.key)}
		>
			<Plus class="h-3 w-3" />
			{field.label}
		</button>
	{/each}
</div>
