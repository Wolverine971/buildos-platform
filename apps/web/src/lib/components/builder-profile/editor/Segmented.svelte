<!-- apps/web/src/lib/components/builder-profile/editor/Segmented.svelte -->
<!-- A row of pressed/unpressed buttons for one choice (Hidden / Listed / Live,
     Anyone / People I work with). Each button carries aria-pressed. -->
<script lang="ts" generics="T extends string">
	type Option = { value: T; label: string; disabled?: boolean; title?: string };

	let {
		options,
		value,
		label,
		idPrefix,
		class: className = '',
		onchange
	}: {
		options: Option[];
		value: T;
		/** Names the group for screen readers. */
		label: string;
		/** When set, each button gets id `${idPrefix}-${value}` (so focus can follow a moved row). */
		idPrefix?: string;
		class?: string;
		onchange: (value: T) => void;
	} = $props();
</script>

<div
	role="group"
	aria-label={label}
	class="inline-flex max-w-full overflow-hidden rounded-md border border-border-strong bg-background {className}"
>
	{#each options as option (option.value)}
		{@const pressed = option.value === value}
		<button
			type="button"
			id={idPrefix ? `${idPrefix}-${option.value}` : undefined}
			aria-pressed={pressed}
			disabled={option.disabled && !pressed}
			title={option.title}
			onclick={() => {
				if (!pressed) onchange(option.value);
			}}
			class="min-h-11 whitespace-nowrap border-r border-border px-3 text-sm font-medium transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none {pressed
				? 'bg-foreground text-background'
				: 'text-foreground hover:bg-muted'}"
		>
			{option.label}
		</button>
	{/each}
</div>
