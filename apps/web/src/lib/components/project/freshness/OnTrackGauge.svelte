<!-- apps/web/src/lib/components/project/freshness/OnTrackGauge.svelte -->
<!--
	On-track gauge for a goal or milestone (Tasker 88 freshness radar).
	A three-step meter plus a word, so the state never depends on color alone.
	`unknown` renders as an empty, muted meter: the radar lacked evidence to judge.
-->
<script lang="ts">
	import type { FreshnessGauge } from '@buildos/shared-types';

	let {
		gauge,
		size = 'sm',
		showLabel = true,
		subject = null,
		class: className = ''
	}: {
		gauge: FreshnessGauge;
		size?: 'xs' | 'sm';
		showLabel?: boolean;
		/** Entity title for the accessible name, e.g. "Launch milestone". */
		subject?: string | null;
		class?: string;
	} = $props();

	const META: Record<FreshnessGauge, { label: string; level: number; tone: string }> = {
		on_track: { label: 'On track', level: 3, tone: 'bg-success' },
		at_risk: { label: 'At risk', level: 2, tone: 'bg-warning' },
		off_track: { label: 'Off track', level: 1, tone: 'bg-destructive' },
		unknown: { label: 'Unknown', level: 0, tone: 'bg-muted-foreground/40' }
	};

	const meta = $derived(META[gauge] ?? META.unknown);
	const accessibleName = $derived(
		`${subject ? `${subject}: ` : ''}${meta.label.toLowerCase()} (model estimate)`
	);
</script>

<span
	class="inline-flex shrink-0 items-center gap-1.5 {className}"
	role="img"
	aria-label={accessibleName}
	title="On-track estimate: {meta.label}. A model estimate from your recent updates."
	data-gauge={gauge}
>
	<span class="flex items-end gap-px" aria-hidden="true">
		{#each [1, 2, 3] as step (step)}
			<span
				class="w-1 rounded-sm {step <= meta.level
					? meta.tone
					: 'bg-muted-foreground/20'} {size === 'xs'
					? step === 1
						? 'h-1.5'
						: step === 2
							? 'h-2'
							: 'h-2.5'
					: step === 1
						? 'h-2'
						: step === 2
							? 'h-2.5'
							: 'h-3'}"
			></span>
		{/each}
	</span>
	{#if showLabel}
		<span
			class="font-medium text-muted-foreground {size === 'xs' ? 'text-2xs' : 'text-xs'}"
			aria-hidden="true">{meta.label}</span
		>
	{/if}
</span>
