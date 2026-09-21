<!-- apps/web/src/lib/components/admin/chat/workflow/WorkflowTimelineView.svelte -->
<!-- Lane bars over wall-clock time, then the ordered event table with attempts, recovery and parallelism. -->
<script lang="ts">
	import type { WorkflowAuditRun } from '$lib/services/admin/chat-workflow-audit-types';
	import {
		formatDateTime,
		formatDuration
	} from '$lib/services/admin/chat-session-audit-formatters';

	let { run, onSelectStep }: { run: WorkflowAuditRun; onSelectStep: (stepKey: string) => void } =
		$props();

	const start = $derived(
		Date.parse(run.timing.turn_started_at ?? run.timing.workflow_created_at ?? '') || null
	);
	const end = $derived(Date.parse(run.timing.finished_at ?? run.timing.captured_at) || null);
	const span = $derived(start !== null && end !== null ? Math.max(1, end - start) : null);

	function bar(
		startedAt: string | null,
		endedAt: string | null
	): { left: number; width: number } | null {
		if (start === null || span === null || !startedAt) return null;
		const s = Date.parse(startedAt);
		const e = endedAt ? Date.parse(endedAt) : (end ?? s);
		if (!Number.isFinite(s)) return null;
		const left = Math.max(0, Math.min(100, ((s - start) / span) * 100));
		const width = Math.max(0.5, Math.min(100 - left, ((Math.max(e, s) - s) / span) * 100));
		return { left, width };
	}
	const severityClass = (severity: string) =>
		severity === 'error'
			? 'text-destructive'
			: severity === 'warning'
				? 'text-warning'
				: severity === 'success'
					? 'text-success'
					: 'text-muted-foreground';
	type Bar = { left: number; width: number };
	const dispatchBars = $derived(
		run.dispatches
			.map((d) => ({
				d,
				bar: bar(d.reserved_at, d.settled_at ?? d.uncertain_at ?? d.dispatched_at)
			}))
			.filter(
				(entry): entry is { d: (typeof run.dispatches)[number]; bar: Bar } =>
					entry.bar !== null
			)
	);
</script>

<div class="space-y-4">
	<div class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
		<div class="rounded-lg border border-border bg-background p-2">
			<div class="text-muted-foreground">Wall clock</div>
			<div class="text-sm font-semibold text-foreground">
				{run.timing.wall_clock_ms === null
					? 'unknown'
					: formatDuration(run.timing.wall_clock_ms)}{run.timing.running
					? ' (so far)'
					: ''}
			</div>
		</div>
		<div class="rounded-lg border border-border bg-background p-2">
			<div class="text-muted-foreground">Queue + preparation</div>
			<div class="text-sm font-semibold text-foreground">
				{run.timing.queue_and_preparation_ms === null
					? 'not recorded'
					: formatDuration(run.timing.queue_and_preparation_ms)}
			</div>
		</div>
		<div class="rounded-lg border border-border bg-background p-2">
			<div class="text-muted-foreground">Sum of agent lanes</div>
			<div class="text-sm font-semibold text-foreground">
				{formatDuration(run.timing.sum_of_lane_ms)}
			</div>
			<div class="text-2xs text-muted-foreground">not wall-clock</div>
		</div>
		<div class="rounded-lg border border-border bg-background p-2">
			<div class="text-muted-foreground">Parallel overlap</div>
			<div class="text-sm font-semibold text-foreground">
				{run.timing.parallel_overlap_ms === null
					? 'n/a'
					: formatDuration(run.timing.parallel_overlap_ms)}
			</div>
		</div>
	</div>

	{#if span !== null}
		<div class="rounded-lg border border-border bg-background p-3">
			<div class="mb-2 flex justify-between text-2xs text-muted-foreground">
				<span
					>{formatDateTime(
						run.timing.turn_started_at ?? run.timing.workflow_created_at
					)}</span
				><span
					>{run.timing.finished_at
						? formatDateTime(run.timing.finished_at)
						: `captured ${formatDateTime(run.timing.captured_at)}`}</span
				>
			</div>
			<ol class="space-y-1.5">
				{#each run.timing.lanes as lane (lane.step_key)}
					{@const b = bar(lane.started_at, lane.ended_at)}
					<li class="grid grid-cols-[9rem_1fr_5rem] items-center gap-2 text-xs">
						<button
							type="button"
							class="truncate text-left text-foreground underline-offset-2 hover:underline"
							onclick={() => onSelectStep(lane.step_key)}>{lane.label}</button
						>
						<div class="relative h-4 rounded bg-muted">
							{#if b}<div
									class="absolute inset-y-0 rounded bg-accent/60"
									style={`left:${b.left}%;width:${b.width}%`}
									title={`${formatDateTime(lane.started_at)} → ${formatDateTime(lane.ended_at)}`}
								></div>{/if}
							{#each dispatchBars.filter((x) => x.d.step_key === lane.step_key) as entry (entry.d.dispatch_id)}
								<div
									class={`absolute inset-y-1 rounded-sm ${entry.d.cost_state === 'uncertain' ? 'bg-destructive/70' : entry.d.cost_state === 'released' ? 'bg-muted-foreground/40' : 'bg-foreground/50'}`}
									style={`left:${entry.bar.left}%;width:${entry.bar.width}%`}
									title={`${entry.d.dispatch_kind} · ${entry.d.model_requested} · ${entry.d.cost_state}`}
								></div>
							{/each}
						</div>
						<span class="text-right text-muted-foreground"
							>{lane.started_at
								? formatDuration(lane.duration_ms)
								: 'not started'}</span
						>
					</li>
				{/each}
			</ol>
			<p class="mt-2 text-2xs text-muted-foreground">
				Light bars are step claims; dark segments are physical provider requests (red =
				uncertain settlement, grey = released reservation).
			</p>
		</div>
	{/if}

	<div class="overflow-x-auto rounded-lg border border-border">
		<table class="w-full text-xs">
			<thead class="bg-muted/50 text-left text-muted-foreground">
				<tr
					><th class="px-2 py-1.5">At</th><th class="px-2 py-1.5">Lane</th><th
						class="px-2 py-1.5">Event</th
					><th class="px-2 py-1.5">Detail</th><th class="px-2 py-1.5">Ends</th><th
						class="px-2 py-1.5">Parallel with</th
					><th class="px-2 py-1.5">Gen</th></tr
				>
			</thead>
			<tbody>
				{#each run.timeline as entry (entry.id)}
					<tr class="border-t border-border align-top">
						<td class="whitespace-nowrap px-2 py-1 text-muted-foreground"
							>{formatDateTime(entry.at)}</td
						>
						<td class="px-2 py-1"
							>{#if entry.step_key}<button
									type="button"
									class="text-foreground underline-offset-2 hover:underline"
									onclick={() => onSelectStep(entry.step_key!)}
									>{entry.lane}</button
								>{:else}<span class="text-foreground">{entry.lane}</span>{/if}</td
						>
						<td class={`px-2 py-1 font-medium ${severityClass(entry.severity)}`}
							>{entry.kind === 'recovery'
								? '↻ '
								: entry.kind === 'attempt'
									? '↺ '
									: ''}{entry.title}</td
						>
						<td class="px-2 py-1 text-muted-foreground">{entry.detail ?? ''}</td>
						<td class="whitespace-nowrap px-2 py-1 text-muted-foreground"
							>{entry.end_at ? formatDateTime(entry.end_at) : ''}</td
						>
						<td class="px-2 py-1 text-muted-foreground"
							>{entry.parallel_with.join(', ')}</td
						>
						<td class="px-2 py-1 text-muted-foreground">{entry.generation ?? ''}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
