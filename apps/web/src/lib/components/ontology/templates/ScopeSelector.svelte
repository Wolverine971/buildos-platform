<!-- apps/web/src/lib/components/ontology/templates/ScopeSelector.svelte -->
<script lang="ts">
	interface ScopeOption {
		value: string;
		label: string;
		description?: string;
	}

	interface Props {
		options: ScopeOption[];
		selected?: string | null;
		onSelect?: (value: string) => void;
		disabled?: boolean;
	}

	let { options = [], selected = null, onSelect, disabled = false }: Props = $props();

	function handleSelect(value: string) {
		if (disabled || value === selected) return;
		onSelect?.(value);
	}
</script>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
	{#each options as option}
		<button
			type="button"
			class={`rounded-2xl border px-5 py-4 text-left transition focus-visible:ring-2 focus-visible:ring-blue-500 ${
				option.value === selected
					? 'border-blue-500 bg-blue-50 dark:border-blue-400/60 dark:bg-blue-500/10 text-blue-900 dark:text-blue-50'
					: 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 hover:border-blue-400/70'
			}`}
			onclick={() => handleSelect(option.value)}
			{disabled}
		>
			<span class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
				{option.label}
			</span>
			<div class="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-50 break-words">
				{option.value}
			</div>
			{#if option.description}
				<p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
					{option.description}
				</p>
			{/if}
		</button>
	{/each}
</div>
