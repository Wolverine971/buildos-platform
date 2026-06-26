<!-- apps/web/src/lib/components/admin/chat/TimelineFilters.svelte -->
<script lang="ts">
	import { Search } from 'lucide-svelte';
	import { eventTypeLabel } from '$lib/services/admin/chat-session-audit-timeline';
	import type { AuditTimelineType as TimelineType } from '$lib/services/admin/chat-session-audit-types';

	let {
		eventTypeFilters,
		showOnlyErrors = $bindable(false),
		timelineSearch = $bindable(''),
		resetTimelineFilters,
		toggleEventType
	}: {
		eventTypeFilters: Record<TimelineType, boolean>;
		showOnlyErrors: boolean;
		timelineSearch: string;
		resetTimelineFilters: () => void;
		toggleEventType: (type: TimelineType) => void;
	} = $props();
</script>

<div class="rounded-lg border border-border bg-card p-2.5 space-y-2">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<div class="text-xs font-semibold text-foreground/60 uppercase tracking-wide">
				Timeline Filters
			</div>
			<div class="mt-1 text-xs text-muted-foreground">
				Search the complete audit event stream.
			</div>
		</div>
		<button
			type="button"
			class="text-xs font-medium text-muted-foreground transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
			onclick={resetTimelineFilters}
		>
			Reset filters
		</button>
	</div>
	<div class="flex flex-wrap items-center gap-1.5">
		{#each Object.keys(eventTypeFilters) as rawType}
			{@const type = rawType as TimelineType}
			<button
				type="button"
				class="px-2 py-1 rounded-full border text-xs font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {eventTypeFilters[
					type
				]
					? 'border-accent bg-accent/15 text-foreground'
					: 'border-border bg-background text-foreground/50 hover:text-foreground/70'}"
				onclick={() => toggleEventType(type)}
			>
				{eventTypeLabel(type)}
			</button>
		{/each}
		<button
			type="button"
			class="px-2 py-1 rounded-full border text-xs font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {showOnlyErrors
				? 'border-destructive/60 bg-destructive/15 text-destructive'
				: 'border-border bg-background text-foreground/50 hover:text-foreground/70'}"
			onclick={() => (showOnlyErrors = !showOnlyErrors)}
		>
			Errors Only
		</button>
	</div>
	<div class="relative">
		<Search
			class="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
		/>
		<input
			type="text"
			bind:value={timelineSearch}
			placeholder="Search timeline events, payloads, tool names..."
			class="w-full text-sm pl-8 pr-3 py-1.5 border border-border bg-background rounded-lg shadow-ink-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus:border-accent text-foreground"
		/>
	</div>
</div>
