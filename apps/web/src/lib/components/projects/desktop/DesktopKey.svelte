<!-- apps/web/src/lib/components/projects/desktop/DesktopKey.svelte -->
<!--
	What the tile colors and bars mean, in one strip above the desktop. Each item's
	tooltip gives the rule behind it.
-->
<script lang="ts">
	import './desktop-colors.css';
	import { PULSES, PULSE_META, TASK_BUCKETS, TASK_BUCKET_LABEL } from './desktop-signals';
</script>

<div
	class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground"
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
	<span
		class="inline-flex items-center gap-1.5"
		title="D: documents, longer than your other projects' means more"
	>
		<em class="letter">D</em><i class="bar docs"></i>Docs
	</span>
	<span class="flex flex-wrap items-center gap-x-3 gap-y-1">
		<span
			class="inline-flex items-center gap-1.5"
			title="T: open tasks, longer means more than your other projects"
		>
			<em class="letter">T</em>Tasks:
		</span>
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
	<span class="inline-flex items-center gap-1.5" title="Red count: overdue tasks">
		<i class="badge">3</i>overdue count
	</span>
</div>

<style>
	.swatch {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 3px;
		border: 1px solid hsl(var(--c) / 0.6);
		background: hsl(var(--card));
		background-image: linear-gradient(hsl(var(--c) / 0.3), hsl(var(--c) / 0.3));
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
	.letter {
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-style: normal;
		font-weight: 600;
		font-size: 10px;
	}
	.bar {
		display: inline-block;
		width: 16px;
		height: 5px;
		border-radius: 99px;
	}
	.docs {
		background: hsl(var(--desk-docs) / 0.75);
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
	.badge {
		display: inline-grid;
		place-items: center;
		min-width: 15px;
		height: 14px;
		padding: 0 3px;
		border-radius: 7px;
		background: hsl(var(--desk-overdue));
		color: hsl(0 0% 100%);
		font-size: 9px;
		font-style: normal;
		font-weight: 600;
	}
</style>
