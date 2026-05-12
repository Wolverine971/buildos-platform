<!-- apps/web/src/lib/components/profile/_shared/CheckboxField.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Check } from 'lucide-svelte';

	let {
		checked = $bindable(false),
		label,
		description = '',
		disabled = false,
		name = '',
		value = '',
		labelHtml
	}: {
		checked?: boolean;
		label: string;
		description?: string;
		disabled?: boolean;
		name?: string;
		value?: string;
		labelHtml?: Snippet;
	} = $props();
</script>

<label
	class="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:border-accent/40 hover:bg-muted/30 cursor-pointer transition-colors duration-200 {disabled
		? 'opacity-60 cursor-not-allowed pointer-events-none'
		: ''}"
>
	<span class="relative inline-flex flex-shrink-0 mt-0.5">
		<input
			type="checkbox"
			bind:checked
			{disabled}
			{name}
			{value}
			class="peer appearance-none w-4 h-4 rounded border border-border bg-background checked:bg-accent checked:border-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 transition-colors duration-200 disabled:opacity-50"
		/>
		<Check
			class="w-3 h-3 text-accent-foreground absolute top-0.5 left-0.5 pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity duration-150"
		/>
	</span>
	<span class="flex-1 min-w-0">
		<span class="block text-sm font-medium text-foreground leading-snug">
			{#if labelHtml}
				{@render labelHtml()}
			{:else}
				{label}
			{/if}
		</span>
		{#if description}
			<span class="block text-xs text-muted-foreground mt-0.5 leading-relaxed">
				{description}
			</span>
		{/if}
	</span>
</label>
