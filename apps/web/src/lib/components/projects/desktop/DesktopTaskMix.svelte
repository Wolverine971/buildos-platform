<!-- apps/web/src/lib/components/projects/desktop/DesktopTaskMix.svelte -->
<!--
	A project's open tasks as one bar split by where they stand (overdue, in
	progress, scheduled, backlog), with the counts spelled out under it. The
	same colors as the tile's T bar.
-->
<script lang="ts">
	import './desktop-colors.css';
	import { TASK_BUCKETS, TASK_BUCKET_LABEL, type TaskBucket } from './desktop-signals';

	let { mix }: { mix: Record<TaskBucket, number> } = $props();

	const open = $derived(TASK_BUCKETS.reduce((total, bucket) => total + mix[bucket], 0));
	const shown = $derived(TASK_BUCKETS.filter((bucket) => mix[bucket] > 0));
</script>

<div class="grid gap-1.5">
	<div class="bar" aria-hidden="true">
		{#each shown as bucket (bucket)}
			<span class="seg {bucket}" style:width="{(mix[bucket] / open) * 100}%"></span>
		{/each}
	</div>
	<p class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
		{#if open === 0}
			<span>No open tasks</span>
		{:else}
			{#each shown as bucket (bucket)}
				<span class="inline-flex items-center gap-1.5">
					<i class="dot {bucket}"></i>
					<span class="font-semibold tabular-nums text-foreground">{mix[bucket]}</span>
					{TASK_BUCKET_LABEL[bucket].toLowerCase()}
				</span>
			{/each}
		{/if}
	</p>
</div>

<style>
	.bar {
		display: flex;
		height: 6px;
		border-radius: 99px;
		overflow: hidden;
		background: hsl(var(--foreground) / 0.1);
	}
	.seg {
		display: block;
		height: 100%;
	}
	.dot {
		display: inline-block;
		width: 8px;
		height: 8px;
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
</style>
