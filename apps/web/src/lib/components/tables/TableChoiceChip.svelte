<!-- apps/web/src/lib/components/tables/TableChoiceChip.svelte -->
<!--
	A choice value as a tinted chip (or just its color dot). Text stays in ink
	for contrast; the color is a second channel (dot + tint), never the only one.
	Choice colors map onto Inkprint status tokens where one exists; purple, pink
	and teal are local tokens tuned for both themes.
-->
<script lang="ts">
	import type { TableChoiceColor } from '@buildos/shared-agent-ops/tables';

	let {
		label,
		color = 'gray',
		variant = 'chip',
		size = 'sm'
	}: {
		label?: string;
		color?: TableChoiceColor;
		variant?: 'chip' | 'dot';
		size?: 'sm' | 'md';
	} = $props();
</script>

{#if variant === 'dot'}
	<span class="choice-dot" data-color={color} aria-hidden="true"></span>
{:else}
	<span
		class="choice-chip inline-flex max-w-full items-center gap-1.5 rounded-full {size === 'md'
			? 'px-2.5 py-1 text-sm'
			: 'px-2 py-0.5 text-xs'} font-medium leading-tight"
		data-color={color}
		title={label}
	>
		<span class="choice-dot" data-color={color} aria-hidden="true"></span>
		<span class="truncate">{label}</span>
	</span>
{/if}

<style>
	.choice-chip,
	.choice-dot {
		--choice: var(--muted-foreground);
	}
	[data-color='blue'] {
		--choice: var(--info);
	}
	[data-color='green'] {
		--choice: var(--success);
	}
	[data-color='yellow'] {
		--choice: var(--warning);
	}
	[data-color='orange'] {
		--choice: var(--accent);
	}
	[data-color='red'] {
		--choice: var(--destructive);
	}
	[data-color='purple'] {
		--choice: 268 40% 48%;
	}
	[data-color='pink'] {
		--choice: 332 50% 46%;
	}
	[data-color='teal'] {
		--choice: 176 50% 31%;
	}
	:global(.dark) [data-color='purple'] {
		--choice: 268 50% 70%;
	}
	:global(.dark) [data-color='pink'] {
		--choice: 332 58% 68%;
	}
	:global(.dark) [data-color='teal'] {
		--choice: 176 45% 52%;
	}
	.choice-chip {
		color: hsl(var(--foreground));
		background-color: hsl(var(--choice) / 0.12);
		box-shadow: inset 0 0 0 1px hsl(var(--choice) / 0.32);
	}
	.choice-dot {
		display: inline-block;
		flex-shrink: 0;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 9999px;
		background-color: hsl(var(--choice));
	}
</style>
