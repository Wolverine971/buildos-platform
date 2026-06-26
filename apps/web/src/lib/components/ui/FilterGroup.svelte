<!-- apps/web/src/lib/components/ui/FilterGroup.svelte -->
<!--
	FilterGroup - Reusable filter button group

	Extracted from projects +page.svelte to eliminate 4 copies of identical
	filter button styling and logic.

	Features:
	- Inkprint design system compliant
	- Multi-select toggle buttons
	- Responsive gap spacing
	- Pressable interaction feedback

	Usage:
	<FilterGroup
		label="State"
		options={availableStates}
		selected={selectedStates}
		onToggle={(state) => (selectedStates = toggleValue(selectedStates, state))}
	/>
-->
<script lang="ts">
	interface Props {
		label: string;
		options: string[];
		selected: string[];
		onToggle: (value: string) => void;
	}

	let { label, options, selected, onToggle }: Props = $props();

	function isSelected(value: string): boolean {
		return selected.includes(value);
	}

	function getButtonClasses(value: string): string {
		const base =
			'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold transition pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset';
		// Filter-selection tier: accent-tint (matches the status count strip), kept
		// distinct from the solid-accent fill used by mode toggles (view/ownership).
		return isSelected(value)
			? `${base} border-accent/40 bg-accent/15 text-accent`
			: `${base} border-border text-muted-foreground hover:border-accent hover:bg-muted/50 hover:text-foreground`;
	}
</script>

{#if options.length > 0}
	<div class="flex flex-col gap-1.5">
		<p class="micro-label">{label}</p>
		<div class="flex flex-wrap gap-1.5">
			{#each options as option (option)}
				<button
					type="button"
					class={getButtonClasses(option)}
					onclick={() => onToggle(option)}
				>
					{option}
				</button>
			{/each}
		</div>
	</div>
{/if}
