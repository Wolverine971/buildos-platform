<!-- apps/web/src/lib/components/projects/desktop/DesktopKey.svelte -->
<!--
	What the tile colors and the bar mean, in one quiet strip above the desktop. Each
	item's tooltip gives the rule behind it. Unslop pass: the D bar and the red count left
	the tiles, so they leave the key too.
-->
<script lang="ts">
	import './desktop-colors.css';
	import { PULSES, PULSE_META, TASK_BUCKETS, TASK_BUCKET_LABEL } from './desktop-signals';
</script>

<div
	class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
	aria-label="What the colors mean"
	role="group"
>
	<span class="flex flex-wrap items-center gap-x-3 gap-y-1">
		{#each PULSES as pulse (pulse)}
			<span
				class="inline-flex items-center gap-1.5"
				title="{PULSE_META[pulse].label}: {PULSE_META[pulse].rule}"
			>
				<i class="swatch pulse-{pulse}"></i>{PULSE_META[pulse].label}
			</span>
		{/each}
	</span>
	<span class="divider" aria-hidden="true"></span>
	<span
		class="flex flex-wrap items-center gap-x-3 gap-y-1"
		title="The bar is open tasks, longer means more than your other projects"
	>
		<span>Tasks</span>
		{#each TASK_BUCKETS as bucket (bucket)}
			<span
				class="inline-flex items-center gap-1.5"
				title={bucket === 'backlog'
					? 'Backlog: no date yet, or blocked'
					: TASK_BUCKET_LABEL[bucket]}
			>
				<i class="bar {bucket}"></i>{TASK_BUCKET_LABEL[bucket].toLowerCase()}
			</span>
		{/each}
	</span>
</div>

<style>
	.swatch {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 4px;
		border: 1px solid hsl(var(--c) / 0.5);
		background: hsl(var(--card));
		background-image: linear-gradient(hsl(var(--c) / 0.24), hsl(var(--c) / 0.24));
	}
	.pulse-moving {
		--c: var(--desk-moving);
	}
	.pulse-shaping {
		--c: var(--desk-shaping);
	}
	.pulse-quiet {
		--c: var(--desk-quiet);
	}
	.pulse-parked {
		--c: var(--desk-parked);
	}
	.divider {
		width: 1px;
		height: 12px;
		background: hsl(var(--foreground) / 0.12);
	}
	.bar {
		display: inline-block;
		width: 12px;
		height: 4px;
		border-radius: 2px;
	}
	.overdue {
		background: hsl(var(--desk-overdue));
	}
	.in_progress {
		background: hsl(var(--desk-in-progress));
	}
	.scheduled {
		background: hsl(var(--desk-scheduled));
	}
	.backlog {
		background: hsl(var(--desk-backlog));
	}
	@media (max-width: 639px) {
		.divider {
			display: none;
		}
	}
</style>
