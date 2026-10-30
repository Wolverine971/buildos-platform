<!-- apps/web/src/lib/components/projects/desktop/ReaderChip.svelte -->
<!--
	A fact in the reader that changes in one click: the chip opens a small picker
	under it (options or a date) and closes on a pick, Esc or a click away.
	Read-only viewers get the plain chip.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronDown } from '$lib/icons/lucide';

	let {
		label,
		title,
		late = false,
		empty = false,
		editable = true,
		disabled = false,
		picker
	}: {
		label: string;
		/** What the chip changes, for screen readers and the tooltip ("Due date"). */
		title: string;
		late?: boolean;
		/** Nothing set yet: the chip reads as an invitation ("+ Due date"). */
		empty?: boolean;
		editable?: boolean;
		disabled?: boolean;
		picker: Snippet<[close: () => void]>;
	} = $props();

	let open = $state(false);
	let wrap = $state<HTMLElement | null>(null);
	let button = $state<HTMLButtonElement | null>(null);

	function close() {
		open = false;
	}

	function toggle() {
		open = !open;
	}

	// A click anywhere else closes it.
	$effect(() => {
		if (!open) return;
		const away = (event: PointerEvent) => {
			if (wrap && event.target instanceof Node && !wrap.contains(event.target)) open = false;
		};
		document.addEventListener('pointerdown', away, true);
		return () => document.removeEventListener('pointerdown', away, true);
	});

	function keydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !open) return;
		// The reader closes on Esc too; this Esc only closes the picker.
		event.stopPropagation();
		event.preventDefault();
		open = false;
		button?.focus();
	}
</script>

{#if editable}
	<span class="wrap" bind:this={wrap} onkeydown={keydown} role="presentation">
		<button
			bind:this={button}
			type="button"
			class="chip"
			class:late
			class:empty
			aria-haspopup="dialog"
			aria-expanded={open}
			aria-label="{title}: {label}"
			title="Change {title.toLowerCase()}"
			{disabled}
			onclick={toggle}
		>
			<span class="truncate">{label}</span>
			<ChevronDown class="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
		</button>
		{#if open}
			<div class="pop" role="dialog" aria-label={title}>
				{@render picker(close)}
			</div>
		{/if}
	</span>
{:else}
	<span class="chip static" class:late>{label}</span>
{/if}

<style>
	.wrap {
		position: relative;
		display: inline-flex;
	}
	.chip {
		display: inline-flex;
		max-width: 100%;
		align-items: center;
		gap: 4px;
		min-height: 26px;
		border-radius: 6px;
		border: 1px solid hsl(var(--border));
		padding: 2px 6px 2px 7px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
		white-space: nowrap;
		color: hsl(var(--muted-foreground));
	}
	button.chip:hover:not(:disabled),
	button.chip[aria-expanded='true'] {
		border-color: hsl(var(--border-strong));
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}
	button.chip:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.chip.static {
		min-height: 0;
	}
	.chip.empty {
		border-style: dashed;
	}
	.chip.late {
		color: hsl(var(--destructive));
	}
	.pop {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 30;
		display: grid;
		gap: 2px;
		min-width: 200px;
		max-width: min(280px, calc(100vw - 32px));
		border-radius: 10px;
		border: 1px solid hsl(var(--border-strong));
		background: hsl(var(--card));
		padding: 4px;
		box-shadow: 0 8px 24px hsl(0 0% 0% / 0.18);
		animation: pop 120ms ease-out;
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(-3px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pop {
			animation: none;
		}
	}
	/* The picker's rows, written by the reader. */
	.pop :global(.opt) {
		display: flex;
		width: 100%;
		min-height: 32px;
		align-items: center;
		gap: 8px;
		border-radius: 7px;
		padding: 4px 8px;
		text-align: left;
		font-size: 13px;
		color: hsl(var(--foreground));
	}
	.pop :global(.opt:hover),
	.pop :global(.opt:focus-visible) {
		background: hsl(var(--muted));
		outline: none;
	}
	.pop :global(.opt[aria-pressed='true']) {
		font-weight: 600;
	}
	.pop :global(.opt .opt-note) {
		margin-left: auto;
		font-size: 11.5px;
		color: hsl(var(--muted-foreground));
	}
	.pop :global(.opt.clear) {
		color: hsl(var(--muted-foreground));
	}
	.pop :global(.sep) {
		height: 1px;
		margin: 3px 4px;
		background: hsl(var(--border));
	}
	.pop :global(.pick-day) {
		display: flex;
		gap: 4px;
		padding: 2px;
	}
	.pop :global(.pick-day .set) {
		flex: none;
		min-height: 32px;
		border-radius: 7px;
		border: 1px solid hsl(var(--border-strong));
		padding: 0 10px;
		font-size: 12.5px;
		font-weight: 600;
		color: hsl(var(--foreground));
	}
	.pop :global(.pick-day .set:hover) {
		background: hsl(var(--muted));
	}
	.pop :global(input[type='date']) {
		min-width: 0;
		flex: 1;
		min-height: 32px;
		border-radius: 7px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--background));
		padding: 2px 8px;
		font-size: 13px;
		color: hsl(var(--foreground));
		color-scheme: light dark;
	}
</style>
