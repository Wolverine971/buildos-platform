<!-- apps/web/src/lib/components/admin/chat/KnowledgeSpendPanel.svelte -->
<!--
	Today's knowledge spend per person against the caps (chat wrap-up, "Find more" research).
	Admin only: users never see caps. Threshold alerts arrive as admin notifications from the
	worker's spend sweep (knowledgeSpendAlerts.ts).
-->
<script lang="ts">
	import { requireApiData } from '$lib/utils/api-client-helpers';

	type Row = {
		userId: string;
		name: string | null;
		email: string | null;
		wrapUpUsd: number;
		wrapUpCapUsd: number;
		researchUsd: number;
		researchCapUsd: number;
	};
	type Day = { since: string; totalUsd: number; totalAlertUsd: number; users: Row[] };

	let { refreshKey = 0 }: { refreshKey?: number } = $props();

	let day = $state<Day | null>(null);
	let error = $state<string | null>(null);
	let loading = $state(true);

	$effect(() => {
		void refreshKey;
		let cancelled = false;
		loading = true;
		error = null;
		fetch('/api/admin/knowledge-spend')
			.then((response) => requireApiData<Day>(response, 'Failed to load knowledge spend'))
			.then((data) => {
				if (!cancelled) day = data;
			})
			.catch((err) => {
				if (!cancelled) error = err instanceof Error ? err.message : String(err);
			})
			.finally(() => {
				if (!cancelled) loading = false;
			});
		return () => {
			cancelled = true;
		};
	});

	const usd = (value: number) => `$${value.toFixed(value < 0.1 ? 4 : 2)}`;
	const share = (value: number, cap: number) => (cap > 0 ? Math.min(value / cap, 1) : 0);
	const cellsOf = (row: Row) => [
		{ label: 'wrap-up', spent: row.wrapUpUsd, cap: row.wrapUpCapUsd },
		{ label: 'research', spent: row.researchUsd, cap: row.researchCapUsd }
	];
</script>

<section class="rounded-lg border border-border bg-card p-4 shadow-ink" aria-labelledby="ks-title">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h3 id="ks-title" class="text-base font-semibold text-foreground">Knowledge spend today</h3>
		{#if day}
			<p class="text-xs text-muted-foreground">
				{usd(day.totalUsd)} of {usd(day.totalAlertUsd)} alert line · since {day.since.slice(
					11,
					16
				)} UTC · users never see caps
			</p>
		{/if}
	</div>

	{#if loading && !day}
		<p class="mt-3 text-sm text-muted-foreground">Loading…</p>
	{:else if error}
		<p class="mt-3 text-sm text-destructive">{error}</p>
	{:else if day && day.users.length === 0}
		<p class="mt-3 text-sm text-muted-foreground">No knowledge spend yet today.</p>
	{:else if day}
		<div class="mt-3 overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="text-left text-xs text-muted-foreground">
						<th class="py-1.5 pr-3 font-medium">Person</th>
						<th class="py-1.5 pr-3 font-medium">Chat wrap-up</th>
						<th class="py-1.5 font-medium">Research</th>
					</tr>
				</thead>
				<tbody>
					{#each day.users as row (row.userId)}
						<tr class="border-t border-border">
							<td class="py-2 pr-3 text-foreground">
								{row.name || row.email || row.userId.slice(0, 8)}
							</td>
							{#each cellsOf(row) as { label, spent, cap } (label)}
								<td class="py-2 pr-3">
									<div class="flex items-center gap-2">
										<div
											class="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
											aria-hidden="true"
										>
											<div
												class="h-full rounded-full {spent >= cap
													? 'bg-destructive'
													: 'bg-accent'}"
												style="width: {share(spent, cap) * 100}%"
											></div>
										</div>
										<span
											class="font-mono text-xs tabular-nums {spent >= cap
												? 'text-destructive'
												: 'text-muted-foreground'}"
										>
											{usd(spent)} / {usd(cap)}{spent >= cap
												? ' · capped'
												: ''}
										</span>
									</div>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
