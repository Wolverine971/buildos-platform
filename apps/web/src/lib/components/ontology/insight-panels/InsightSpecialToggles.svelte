<!-- apps/web/src/lib/components/ontology/insight-panels/InsightSpecialToggles.svelte -->
<!--
	InsightSpecialToggles.svelte

	Special toggle checkboxes for showing completed/deleted items.
	Displayed at the bottom of expanded insight panels.
-->
<script lang="ts">
	import type { SpecialToggle } from './insight-panel-config';

	// Props
	let {
		toggles: toggleConfig,
		values,
		counts = {},
		onchange
	}: {
		toggles: SpecialToggle[];
		values: Record<string, boolean>;
		counts?: Record<string, number>;
		onchange: (toggleId: string, value: boolean) => void;
	} = $props();
</script>

{#if toggleConfig.length > 0}
	<div
		class="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-t border-border bg-muted/20"
	>
		{#each toggleConfig as toggle}
			{@const count = counts[toggle.id] ?? 0}
			{@const isChecked = values[toggle.id] ?? toggle.defaultValue}
			<label
				class="flex items-center gap-1.5 cursor-pointer group"
				title={toggle.description}
			>
				<input
					type="checkbox"
					checked={isChecked}
					onchange={(e) => onchange(toggle.id, e.currentTarget.checked)}
					class="w-3 h-3 rounded border-border text-accent focus:ring-accent/50 focus:ring-offset-0 cursor-pointer"
				/>
				<span
					class="text-[10px] sm:text-xs text-muted-foreground group-hover:text-foreground transition-colors"
				>
					{toggle.label}
					{#if count > 0}
						<span class="text-muted-foreground/70">({count})</span>
					{/if}
				</span>
			</label>
		{/each}
	</div>
{/if}
