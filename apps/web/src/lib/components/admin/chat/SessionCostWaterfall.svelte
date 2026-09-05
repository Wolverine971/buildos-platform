<!-- apps/web/src/lib/components/admin/chat/SessionCostWaterfall.svelte -->
<script lang="ts">
	import { DollarSign, Info } from '$lib/icons/lucide';
	import { sessionFlowBarPosition } from '$lib/services/admin/chat-session-flow-geometry';
	import type {
		SessionFlowEvent,
		SessionFlowProfile
	} from '$lib/services/admin/chat-session-flow-profile';

	type CostRow = {
		event: SessionFlowEvent;
		startCost: number;
		endCost: number;
	};

	let {
		profile,
		onSelect
	}: {
		profile: SessionFlowProfile;
		onSelect: (event: SessionFlowEvent) => void | Promise<void>;
	} = $props();

	let costRows = $derived.by(() => {
		let runningCost = 0;
		return profile.events
			.filter(
				(event) =>
					event.category === 'llm' ||
					event.category === 'tool' ||
					event.category === 'operation'
			)
			.map((event): CostRow => {
				const startCost = runningCost;
				if (event.costState === 'reported') runningCost += event.costUsd ?? 0;
				return { event, startCost, endCost: runningCost };
			});
	});
	let measuredCostScale = $derived(profile.reportedCostUsd);
	let costScale = $derived(measuredCostScale > 0 ? measuredCostScale : 1);
	let hasMaterialDifference = $derived(Math.abs(profile.costDifferenceUsd) > 0.000001);

	function formatCost(cost: number): string {
		if (cost === 0) return '$0.00';
		if (cost < 0.000001) return '<$0.000001';
		if (cost < 0.001) return `$${cost.toFixed(6)}`;
		if (cost < 0.1) return `$${cost.toFixed(4)}`;
		return `$${cost.toFixed(2)}`;
	}

	function eventCostLabel(event: SessionFlowEvent): string {
		if (event.costState === 'unmetered') return 'unmetered';
		if (event.costState === 'unknown') {
			return event.costUsd === null ? 'unknown' : `${formatCost(event.costUsd)} unverified`;
		}
		if (event.costState === 'estimated') return `${formatCost(event.costUsd ?? 0)} est.`;
		return formatCost(event.costUsd ?? 0);
	}

	function rowDescription(row: CostRow): string {
		const status = row.event.severity === 'error' ? ', error' : '';
		return `${row.event.label}${status}, this call ${eventCostLabel(row.event)}, cumulative reported spend ${formatCost(row.endCost)}. Select to open details.`;
	}
</script>

<div class="space-y-4 bg-muted/40 p-3 sm:p-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<div class="flex items-center gap-2 text-sm font-semibold text-foreground">
				<DollarSign class="h-4 w-4 shrink-0" />
				Cumulative cost waterfall
			</div>
			<div class="mt-1 text-xs text-muted-foreground">
				Provider-reported spend accumulates left to right. Estimates and unknown costs
				appear as markers and do not increase the reported total.
			</div>
		</div>
		<div class="flex flex-wrap gap-2 text-xs">
			<span
				class="rounded-full border border-border bg-background px-2.5 py-1 font-semibold text-foreground"
			>
				{formatCost(profile.reportedCostUsd)} reported
			</span>
			{#if profile.estimatedCostCount > 0}
				<span
					class="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-foreground"
				>
					{formatCost(profile.estimatedCostUsd)} estimated
				</span>
			{/if}
			{#if profile.unknownCostCount > 0}
				<span
					class="rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground"
				>
					{profile.unknownCostCount}
					{profile.unknownCostCount === 1 ? 'call' : 'calls'} with unknown cost source{profile.unknownCostUsd >
					0
						? ` · ${formatCost(profile.unknownCostUsd)} unverified`
						: ''}
				</span>
			{/if}
		</div>
	</div>
	<p class="text-2xs text-muted-foreground">
		Recorded session total: {formatCost(profile.totalCostUsd)} · Recorded event totals: {formatCost(
			profile.attributedCostUsd
		)}. These can include estimates or costs with an unknown source.
	</p>

	{#if hasMaterialDifference}
		<div
			class="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground"
		>
			<Info class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
			<span>
				Recorded event totals differ from the recorded session total by {formatCost(
					Math.abs(profile.costDifferenceUsd)
				)}. The chart axis includes only provider-reported spend.
			</span>
		</div>
	{/if}

	{#if costRows.length === 0}
		<div
			class="rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground"
		>
			No LLM, tool, or operation events were recorded for this session.
		</div>
	{:else}
		<div class="overflow-hidden rounded-lg border border-border bg-background">
			<div
				class="overflow-x-auto overscroll-x-contain rounded-md"
				role="region"
				aria-label="Cumulative reported cost chart. Scroll horizontally to inspect the full scale."
			>
				<div class="min-w-[840px] p-3">
					<div
						class="mb-1 grid grid-cols-[14rem_1fr_7rem_6rem] items-end gap-2 text-2xs text-muted-foreground"
						aria-hidden="true"
					>
						<span>Event</span>
						<div class="flex justify-between border-b border-border/70 pb-1">
							{#if measuredCostScale > 0}
								<span>$0</span>
								<span>{formatCost(measuredCostScale * 0.25)}</span>
								<span>{formatCost(measuredCostScale * 0.5)}</span>
								<span>{formatCost(measuredCostScale * 0.75)}</span>
								<span>{formatCost(measuredCostScale)}</span>
							{:else}
								<span>$0</span>
								<span>No reported spend</span>
							{/if}
						</div>
						<span class="text-right">This call</span>
						<span class="text-right">Reported total</span>
					</div>
					<div class="space-y-1">
						{#each costRows as row (row.event.id)}
							{@const position = sessionFlowBarPosition({
								start: row.startCost,
								length: row.endCost - row.startCost,
								total: costScale,
								minWidthPercent: 0.9,
								isPoint:
									row.event.costState !== 'reported' || row.event.costUsd === 0
							})}
							<button
								type="button"
								class="pressable grid min-h-11 w-full grid-cols-[14rem_1fr_7rem_6rem] items-center gap-2 rounded-md px-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
								title={rowDescription(row)}
								aria-label={rowDescription(row)}
								onclick={() => onSelect(row.event)}
							>
								<span
									class="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground"
								>
									<span class="shrink-0 text-muted-foreground"
										>T{row.event.turnIndex ?? '—'} ·</span
									>
									<span class="min-w-0">
										<span class="block truncate">
											{row.event.passRoleLabel ?? row.event.label}
										</span>
										{#if row.event.passRoleLabel}
											<span
												class="block truncate text-2xs font-normal text-muted-foreground"
											>
												{row.event.modelLabel}
											</span>
										{/if}
									</span>
									{#if row.event.severity === 'error'}
										<span
											class="shrink-0 text-2xs font-semibold text-destructive"
											>Error</span
										>
									{/if}
								</span>
								<span
									class="relative h-7 overflow-hidden rounded-md bg-muted/70 [background-image:linear-gradient(to_right,hsl(var(--border)/0.55)_1px,transparent_1px)] [background-size:25%_100%]"
									aria-hidden="true"
								>
									<span
										class={row.event.costState === 'reported' &&
										(row.event.costUsd ?? 0) > 0
											? 'absolute top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded-md border border-accent bg-accent px-1 text-left text-2xs font-semibold text-accent-foreground'
											: row.event.costState === 'reported'
												? 'absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-info bg-info'
												: row.event.costState === 'estimated'
													? 'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-warning bg-warning/40'
													: 'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-muted-foreground bg-background'}
										style:left={position.width
											? position.left
											: `clamp(8px, ${position.left}, calc(100% - 8px))`}
										style:width={position.width}
									>
										{#if row.event.costState === 'reported' && (row.event.costUsd ?? 0) > 0}
											<span class="block truncate"
												>{formatCost(row.event.costUsd ?? 0)}</span
											>
										{/if}
									</span>
								</span>
								<span class="text-right font-mono text-2xs text-muted-foreground">
									{eventCostLabel(row.event)}
								</span>
								<span class="text-right font-mono text-2xs text-foreground">
									{formatCost(row.endCost)}
								</span>
							</button>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<ul
		class="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-2xs text-muted-foreground"
		aria-label="Cost chart legend"
	>
		<li>
			<span class="mr-1 inline-block h-2 w-3 rounded-full bg-accent"></span>Provider-reported
			cost
		</li>
		<li><span class="mr-1 inline-block h-2 w-2 rounded-full bg-info"></span>Reported at $0</li>
		<li>
			<span class="mr-1 inline-block h-2 w-2 rotate-45 border border-warning bg-warning/40"
			></span>
			Estimated cost (excluded from reported total)
		</li>
		<li>
			<span
				class="mr-1 inline-block h-2 w-2 rotate-45 border border-muted-foreground bg-background"
			></span>
			Unknown source / unmetered
		</li>
	</ul>
</div>
