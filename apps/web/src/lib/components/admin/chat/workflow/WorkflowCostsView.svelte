<!-- apps/web/src/lib/components/admin/chat/workflow/WorkflowCostsView.svelte -->
<!-- Settled spend is authority; reservations and uncertain dispatches are exposure; Jev is separate telemetry. -->
<script lang="ts">
	import type { WorkflowAuditRun } from '$lib/services/admin/chat-workflow-audit-types';
	import {
		formatDateTime,
		formatDuration
	} from '$lib/services/admin/chat-session-audit-formatters';
	import CopyableId from './CopyableId.svelte';

	let { run, onSelectStep }: { run: WorkflowAuditRun; onSelectStep: (stepKey: string) => void } =
		$props();

	const usd = (micro: number | null | undefined) =>
		micro === null || micro === undefined ? 'unknown' : `$${(micro / 1_000_000).toFixed(6)}`;
	const usdPlain = (value: number | null | undefined) =>
		value === null || value === undefined ? 'unknown' : `$${value.toFixed(6)}`;
	const budgetPct = $derived(
		run.costs.budget_micro_usd
			? Math.min(100, (run.costs.settled_micro_usd / run.costs.budget_micro_usd) * 100)
			: null
	);
</script>

<div class="space-y-4">
	<p class="text-xs text-muted-foreground">{run.costs.note}</p>
	<div class="grid grid-cols-2 gap-2 text-xs md:grid-cols-3 xl:grid-cols-6">
		<div class="rounded-lg border border-border bg-background p-2">
			<div class="text-muted-foreground">Settled (paid)</div>
			<div class="text-sm font-semibold text-foreground">
				{usd(run.costs.settled_micro_usd)}
			</div>
		</div>
		<div class="rounded-lg border border-border bg-background p-2">
			<div class="text-muted-foreground">Budget</div>
			<div class="text-sm font-semibold text-foreground">
				{usd(run.costs.budget_micro_usd)}
			</div>
			{#if budgetPct !== null}<div class="mt-1 h-1.5 rounded bg-muted">
					<div class="h-1.5 rounded bg-accent" style={`width:${budgetPct}%`}></div>
				</div>{/if}
		</div>
		<div class="rounded-lg border border-border bg-background p-2">
			<div class="text-muted-foreground">Uncertain exposure</div>
			<div
				class={`text-sm font-semibold ${run.costs.uncertain_dispatch_count ? 'text-destructive' : 'text-foreground'}`}
			>
				{run.costs.uncertain_dispatch_count
					? usd(run.costs.uncertain_reserved_micro_usd)
					: 'none'}
			</div>
			{#if run.costs.uncertain_dispatch_count}<div class="text-2xs text-muted-foreground">
					{run.costs.uncertain_dispatch_count} dispatch(es), reserved not paid
				</div>{/if}
		</div>
		<div class="rounded-lg border border-border bg-background p-2">
			<div class="text-muted-foreground">Reserved outstanding</div>
			<div class="text-sm font-semibold text-foreground">
				{run.costs.reserved_outstanding_micro_usd
					? usd(run.costs.reserved_outstanding_micro_usd)
					: 'none'}
			</div>
		</div>
		<div class="rounded-lg border border-border bg-background p-2">
			<div class="text-muted-foreground">Physical dispatches</div>
			<div class="text-sm font-semibold text-foreground">
				{run.costs.physical_dispatches} / {run.costs.max_physical_dispatches ?? '?'}
			</div>
			<div class="text-2xs text-muted-foreground">{run.costs.released_count} released</div>
		</div>
		<div class="rounded-lg border border-dashed border-muted-foreground/50 bg-background p-2">
			<div class="text-muted-foreground">Jev selector (separate)</div>
			<div class="text-sm font-semibold text-foreground">
				{run.costs.selector ? usdPlain(run.costs.selector.cost_usd) : 'none'}
			</div>
			{#if run.costs.selector}<div class="text-2xs text-muted-foreground">
					{run.costs.selector.status} · {formatDuration(run.costs.selector.duration_ms)}
				</div>{/if}
		</div>
	</div>

	<div class="rounded-lg border border-border bg-background p-3 text-xs">
		<p class="font-semibold text-foreground">Usage log correlation</p>
		<p class="mt-1 text-muted-foreground">
			{run.costs.usage_logs.matched} usage row(s) matched a dispatch by provider request id ({usdPlain(
				run.costs.usage_logs.matched_cost_usd
			)}); {run.costs.usage_logs.unmatched} uncorrelated ({usdPlain(
				run.costs.usage_logs.unmatched_cost_usd
			)}). {run.costs.usage_logs.note}
		</p>
	</div>

	<div class="overflow-x-auto rounded-lg border border-border">
		<table class="w-full text-xs">
			<thead class="bg-muted/50 text-left text-muted-foreground">
				<tr
					><th class="px-2 py-1.5">Dispatch</th><th class="px-2 py-1.5">Step</th><th
						class="px-2 py-1.5">Attempt</th
					><th class="px-2 py-1.5">Phys.</th><th class="px-2 py-1.5">Kind</th><th
						class="px-2 py-1.5">Model</th
					><th class="px-2 py-1.5">State</th><th class="px-2 py-1.5">Reserved</th><th
						class="px-2 py-1.5">Actual</th
					><th class="px-2 py-1.5">Usage log</th><th class="px-2 py-1.5">Provider req</th
					><th class="px-2 py-1.5">Dispatched</th><th class="px-2 py-1.5">Duration</th
					></tr
				>
			</thead>
			<tbody>
				{#each run.dispatches as d (d.dispatch_id)}
					<tr class="border-t border-border">
						<td class="px-2 py-1"><CopyableId value={d.dispatch_id} /></td>
						<td class="px-2 py-1"
							>{#if d.step_key}<button
									type="button"
									class="text-foreground underline-offset-2 hover:underline"
									onclick={() => onSelectStep(d.step_key!)}>{d.step_key}</button
								>{/if}</td
						>
						<td class="px-2 py-1"><CopyableId value={d.step_attempt_id} /></td>
						<td class="px-2 py-1 text-foreground">{d.physical_attempt}</td>
						<td class="px-2 py-1 text-foreground">{d.dispatch_kind}</td>
						<td class="px-2 py-1 text-foreground">{d.model_requested}</td>
						<td class="px-2 py-1"
							><span
								class={`rounded px-1.5 py-0.5 ${d.cost_state === 'uncertain' ? 'bg-destructive/10 text-destructive' : d.cost_state === 'settled' ? 'bg-success/10 text-success' : d.cost_state === 'released' ? 'bg-muted text-muted-foreground' : 'bg-warning/10 text-warning'}`}
								>{d.cost_state}</span
							></td
						>
						<td class="px-2 py-1 text-muted-foreground">{usd(d.reserved_micro_usd)}</td>
						<td class="px-2 py-1 text-foreground"
							>{d.actual_micro_usd === null ? 'unknown' : usd(d.actual_micro_usd)}</td
						>
						<td class="px-2 py-1 text-muted-foreground"
							>{#if d.usage_log_id}<CopyableId value={d.usage_log_id} />
								{usdPlain(d.usage_log_cost_usd)}{:else}uncorrelated{/if}</td
						>
						<td class="px-2 py-1"><CopyableId value={d.provider_request_id} /></td>
						<td class="whitespace-nowrap px-2 py-1 text-muted-foreground"
							>{formatDateTime(d.dispatched_at ?? d.reserved_at)}</td
						>
						<td class="px-2 py-1 text-muted-foreground"
							>{formatDuration(d.duration_ms)}</td
						>
					</tr>
				{/each}
				{#if run.dispatches.length === 0}<tr
						><td colspan="13" class="px-2 py-3 text-center text-muted-foreground"
							>No dispatches recorded.</td
						></tr
					>{/if}
			</tbody>
		</table>
	</div>
</div>
