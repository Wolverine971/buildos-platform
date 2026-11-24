<!-- apps/web/src/routes/admin/research-costs/+page.svelte -->
<script lang="ts">
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import ErrorBoundary from '$lib/components/ui/ErrorBoundary.svelte';
	import { Coins } from '$lib/icons/lucide';
	import {
		RECENT_LOOKUPS,
		formatResearchUsd,
		researchCostGroupOf,
		type ResearchCostDay
	} from '$lib/services/admin/research-costs/research-costs';

	let { data }: { data: PageData } = $props();

	const summary = $derived(data.summary);
	const usd = formatResearchUsd;

	function hrefWith(days: number): string {
		const params = new URLSearchParams(page.url.searchParams);
		if (days === 30) params.delete('days');
		else params.set('days', String(days));
		const query = params.toString();
		return `/admin/research-costs${query ? `?${query}` : ''}`;
	}

	// Days are UTC days (the worker's clock), so they are labelled in UTC too.
	const dayFormat = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	const timeFormat = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});

	function dayLabel(date: string): string {
		return dayFormat.format(new Date(`${date}T00:00:00Z`));
	}

	function lookupCount(count: number): string {
		return count === 1 ? '1 lookup' : `${count.toLocaleString()} lookups`;
	}

	function percent(share: number): string {
		return `${Math.round(share * 100)}%`;
	}

	type DayMeasure = {
		key: 'usd' | 'lookups';
		title: string;
		value: (day: ResearchCostDay) => number;
	};
	const dayMeasures: DayMeasure[] = [
		{ key: 'usd', title: 'Spent per day', value: (day) => day.usd },
		{ key: 'lookups', title: 'Lookups per day', value: (day) => day.lookups }
	];

	function measureText(measure: DayMeasure, value: number): string {
		return measure.key === 'usd' ? usd(value) : value.toLocaleString();
	}

	const activeDays = $derived(summary.daily.filter((day) => day.lookups > 0));
	const splitTotal = $derived(
		summary.split ? summary.split.searchUsd + summary.split.modelUsd : 0
	);
	const splitRows = $derived(
		summary.split
			? [
					{ key: 'search', label: 'Web searches', usd: summary.split.searchUsd },
					{ key: 'model', label: 'Model calls', usd: summary.split.modelUsd }
				]
			: []
	);

	const KIND_NAMES: Record<string, string> = {
		person: 'A person',
		org: 'A company',
		other: 'An entry'
	};
</script>

<svelte:head>
	<title>Research Costs · Admin</title>
</svelte:head>

<div class="space-y-6">
	<AdminPageHeader
		title="Research Costs"
		description="What it costs to look someone or something up with Find more: per lookup, per day, and what a month would cost."
		icon={Coins}
	/>

	<!-- The answer: what does a lookup cost? -->
	<section class="rounded-xl border border-border bg-card p-5 shadow-ink tx tx-frame tx-weak">
		<h2 class="text-xl font-semibold leading-snug text-foreground">{data.answer.headline}</h2>
		<p class="mt-1 text-sm text-muted-foreground">{data.answer.detail}</p>
		{#if data.truncated}
			<p class="mt-2 text-sm text-muted-foreground">
				Showing the newest lookups only. Pick a shorter window to count every one.
			</p>
		{/if}
	</section>

	<!-- Window -->
	<div
		class="inline-flex rounded-lg border border-border bg-card p-0.5"
		role="group"
		aria-label="Time window"
	>
		{#each data.dayChoices as days (days)}
			<a
				href={hrefWith(days)}
				aria-current={data.days === days ? 'page' : undefined}
				class="rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {data.days ===
				days
					? 'bg-accent text-accent-foreground'
					: 'text-muted-foreground hover:text-foreground'}">{days} days</a
			>
		{/each}
	</div>

	{#if summary.lookups > 0}
		<ErrorBoundary area="admin-research-costs">
			<!-- Headline numbers -->
			<dl class="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<div class="rounded-xl border border-border bg-card p-4 shadow-ink">
					<dt class="text-sm text-muted-foreground">A lookup right now</dt>
					<dd class="mt-1 text-2xl font-semibold tabular-nums text-foreground">
						{usd(summary.recent.averageUsd)}
					</dd>
					<dd class="mt-1 text-xs text-muted-foreground">
						Average of the newest {Math.min(summary.recent.lookups, RECENT_LOOKUPS)}
					</dd>
				</div>
				<div class="rounded-xl border border-border bg-card p-4 shadow-ink">
					<dt class="text-sm text-muted-foreground">Usual cost</dt>
					<dd class="mt-1 text-2xl font-semibold tabular-nums text-foreground">
						{usd(summary.typicalUsd)}
					</dd>
					<dd class="mt-1 text-xs text-muted-foreground">
						Half of the lookups in this window cost less
					</dd>
				</div>
				<div class="rounded-xl border border-border bg-card p-4 shadow-ink">
					<dt class="text-sm text-muted-foreground">Most expensive</dt>
					<dd class="mt-1 text-2xl font-semibold tabular-nums text-foreground">
						{usd(summary.worstUsd)}
					</dd>
					<dd class="mt-1 text-xs text-muted-foreground">
						The limit is {usd(summary.capUsd)} a lookup. {summary.nearCap === 0
							? 'None used more than half of it.'
							: `${summary.nearCap} used more than half of it.`}
					</dd>
				</div>
				<div class="rounded-xl border border-border bg-card p-4 shadow-ink">
					<dt class="text-sm text-muted-foreground">Spent in {summary.days} days</dt>
					<dd class="mt-1 text-2xl font-semibold tabular-nums text-foreground">
						{usd(summary.totalUsd)}
					</dd>
					<dd class="mt-1 text-xs text-muted-foreground">
						{lookupCount(summary.lookups)}, {summary.details.toLocaleString()}
						{summary.details === 1 ? 'detail' : 'details'} saved
					</dd>
				</div>
			</dl>

			<!-- Day by day -->
			<section class="rounded-xl border border-border bg-card p-5 shadow-ink">
				<h2 class="text-base font-semibold text-foreground">Day by day</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Each bar is one day (UTC). Point at a bar for its numbers.
				</p>
				<div class="mt-4 grid gap-6 lg:grid-cols-2">
					{#each dayMeasures as measure (measure.key)}
						{@const peak = Math.max(0, ...summary.daily.map(measure.value))}
						<figure>
							<figcaption class="flex items-baseline justify-between gap-3 text-sm">
								<span class="font-medium text-foreground">{measure.title}</span>
								<span class="text-muted-foreground">
									Busiest day: {measureText(measure, peak)}
								</span>
							</figcaption>
							<div
								class="mt-9 flex h-32 items-end gap-0.5 border-b border-border"
								role="img"
								aria-label="{measure.title}, last {summary.days} days. Busiest day {measureText(
									measure,
									peak
								)}. The table below lists every day."
							>
								{#each summary.daily as day (day.date)}
									{@const value = measure.value(day)}
									<div
										class="group relative flex h-full min-w-0 flex-1 items-end"
									>
										{#if value > 0}
											<div
												class="mx-auto w-full max-w-8 rounded-t bg-accent group-hover:opacity-80"
												style:height="{Math.max((value / peak) * 100, 3)}%"
											></div>
										{/if}
										<div
											class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-ink group-hover:block"
										>
											<span class="font-medium">{dayLabel(day.date)}</span>:
											{lookupCount(day.lookups)}, {usd(day.usd)}
										</div>
									</div>
								{/each}
							</div>
							<div class="mt-1 flex justify-between text-xs text-muted-foreground">
								<span>{dayLabel(summary.daily[0]!.date)}</span>
								<span
									>{dayLabel(summary.daily[summary.daily.length - 1]!.date)}</span
								>
							</div>
						</figure>
					{/each}
				</div>
				<details class="mt-4">
					<summary
						class="cursor-pointer text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						Show the days as a table
					</summary>
					<div class="mt-3 overflow-x-auto">
						<table class="w-full min-w-[20rem] text-sm">
							<thead>
								<tr class="border-b border-border text-left text-muted-foreground">
									<th scope="col" class="py-2 pr-4 font-medium">Day</th>
									<th scope="col" class="py-2 pr-4 text-right font-medium"
										>Lookups</th
									>
									<th scope="col" class="py-2 text-right font-medium">Spent</th>
								</tr>
							</thead>
							<tbody>
								{#each [...activeDays].reverse() as day (day.date)}
									<tr class="border-b border-border/60">
										<th
											scope="row"
											class="py-2 pr-4 text-left font-normal text-foreground"
										>
											{dayLabel(day.date)}
										</th>
										<td
											class="py-2 pr-4 text-right tabular-nums text-foreground"
										>
											{day.lookups}
										</td>
										<td class="py-2 text-right tabular-nums text-foreground">
											{usd(day.usd)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</details>
			</section>

			<!-- People against companies -->
			<section class="rounded-xl border border-border bg-card p-5 shadow-ink">
				<h2 class="text-base font-semibold text-foreground">People and companies</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					What a lookup costs by what was researched, and what the money bought.
				</p>
				<div class="mt-3 overflow-x-auto">
					<table class="w-full min-w-[40rem] text-sm">
						<thead>
							<tr class="border-b border-border text-left text-muted-foreground">
								<th scope="col" class="py-2 pr-4 font-medium">Researched</th>
								<th scope="col" class="py-2 pr-4 text-right font-medium">Lookups</th
								>
								<th scope="col" class="py-2 pr-4 text-right font-medium">Usual</th>
								<th scope="col" class="py-2 pr-4 text-right font-medium">Average</th
								>
								<th scope="col" class="py-2 pr-4 text-right font-medium"
									>Most expensive</th
								>
								<th scope="col" class="py-2 pr-4 text-right font-medium"
									>Details saved</th
								>
								<th scope="col" class="py-2 pr-4 text-right font-medium"
									>Per detail</th
								>
								<th scope="col" class="py-2 text-right font-medium"
									>Found nothing</th
								>
							</tr>
						</thead>
						<tbody>
							{#each summary.groups as group (group.key)}
								<tr class="border-b border-border/60">
									<th
										scope="row"
										class="py-2 pr-4 text-left font-medium text-foreground"
									>
										{group.label}
									</th>
									<td class="py-2 pr-4 text-right tabular-nums text-foreground">
										{group.lookups}
									</td>
									<td class="py-2 pr-4 text-right tabular-nums text-foreground">
										{usd(group.typicalUsd)}
									</td>
									<td class="py-2 pr-4 text-right tabular-nums text-foreground">
										{usd(group.averageUsd)}
									</td>
									<td class="py-2 pr-4 text-right tabular-nums text-foreground">
										{usd(group.worstUsd)}
									</td>
									<td class="py-2 pr-4 text-right tabular-nums text-foreground">
										{group.details}
									</td>
									<td class="py-2 pr-4 text-right tabular-nums text-foreground">
										{group.usdPerDetail === null
											? 'None saved'
											: usd(group.usdPerDetail)}
									</td>
									<td class="py-2 text-right tabular-nums text-foreground">
										{group.foundNothing}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if summary.foundNothing.lookups > 0}
					<p class="mt-3 text-sm text-muted-foreground">
						{lookupCount(summary.foundNothing.lookups)} saved nothing and cost
						{usd(summary.foundNothing.usd)} in total.
					</p>
				{/if}
			</section>

			<div class="grid gap-6 lg:grid-cols-2">
				<!-- Where the money goes -->
				<section class="rounded-xl border border-border bg-card p-5 shadow-ink">
					<h2 class="text-base font-semibold text-foreground">Where the money goes</h2>
					{#if summary.split}
						<p class="mt-1 text-sm text-muted-foreground">
							Recorded for {summary.split.lookups} of {lookupCount(summary.lookups)}.
							A lookup ran {summary.split.searchesPerLookup.toFixed(1)} searches over
							{summary.split.roundsPerLookup.toFixed(1)} rounds on average.
						</p>
						<ul class="mt-4 space-y-3">
							{#each splitRows as row (row.key)}
								{@const share = splitTotal > 0 ? row.usd / splitTotal : 0}
								<li>
									<div class="flex items-baseline justify-between gap-3 text-sm">
										<span class="text-foreground">{row.label}</span>
										<span class="tabular-nums text-foreground">
											{usd(row.usd)}
											<span class="text-muted-foreground"
												>({percent(share)})</span
											>
										</span>
									</div>
									<div class="mt-1 h-2 rounded-full bg-muted">
										<div
											class="h-2 rounded-full bg-accent"
											style:width="{Math.max(
												share * 100,
												share > 0 ? 2 : 0
											)}%"
										></div>
									</div>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="mt-1 text-sm text-muted-foreground">
							No lookup in this window recorded its split between web searches and
							model calls. Recording started on Nov 23, 2026, so it fills in from the
							next lookup.
						</p>
						<p class="mt-3 text-sm text-muted-foreground">
							In test runs a full lookup spent about $0.005 on five web searches and
							about $0.002 on model calls.
						</p>
					{/if}
					<p class="mt-4 text-xs text-muted-foreground">
						A search is held at $0.008 when it starts and corrected to what it was
						billed, about $0.001. If that correction never arrives the held amount
						stays, so a lookup can read higher than it really cost.
					</p>
				</section>

				<!-- What a month would cost -->
				<section class="rounded-xl border border-border bg-card p-5 shadow-ink">
					<h2 class="text-base font-semibold text-foreground">What a month would cost</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						At the pace of the last {summary.pace.overDays} days: about
						{Math.round(summary.pace.lookupsPerMonth).toLocaleString()} lookups and
						{usd(summary.pace.usdPerMonth)} a month.
					</p>
					<div class="mt-3 overflow-x-auto">
						<table class="w-full min-w-[18rem] text-sm">
							<thead>
								<tr class="border-b border-border text-left text-muted-foreground">
									<th scope="col" class="py-2 pr-4 font-medium"
										>Lookups a month</th
									>
									<th scope="col" class="py-2 pr-4 text-right font-medium"
										>Expected</th
									>
									<th scope="col" class="py-2 text-right font-medium"
										>At the limit</th
									>
								</tr>
							</thead>
							<tbody>
								{#each summary.projection as row (row.lookupsPerMonth)}
									<tr class="border-b border-border/60">
										<th
											scope="row"
											class="py-2 pr-4 text-left font-normal text-foreground"
										>
											{row.lookupsPerMonth.toLocaleString()}
										</th>
										<td
											class="py-2 pr-4 text-right tabular-nums text-foreground"
										>
											{usd(row.expectedUsd)}
										</td>
										<td
											class="py-2 text-right tabular-nums text-muted-foreground"
										>
											{usd(row.worstCaseUsd)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="mt-3 text-xs text-muted-foreground">
						Expected uses what a lookup costs right now. At the limit assumes every
						lookup spends the full {usd(summary.capUsd)} it is allowed.
					</p>
				</section>
			</div>

			<div class="grid gap-6 lg:grid-cols-2">
				<!-- How it was started -->
				<section class="rounded-xl border border-border bg-card p-5 shadow-ink">
					<h2 class="text-base font-semibold text-foreground">Started from</h2>
					<ul class="mt-3 divide-y divide-border/60 text-sm">
						{#each summary.byTrigger as row (row.trigger)}
							<li class="flex items-baseline justify-between gap-3 py-2">
								<span class="text-foreground">{row.label}</span>
								<span class="tabular-nums text-muted-foreground">
									{lookupCount(row.lookups)}, {usd(row.usd)}
								</span>
							</li>
						{/each}
					</ul>
				</section>

				<!-- Who ran it -->
				<section class="rounded-xl border border-border bg-card p-5 shadow-ink">
					<h2 class="text-base font-semibold text-foreground">Who ran research</h2>
					<ul class="mt-3 divide-y divide-border/60 text-sm">
						{#each data.people as person (person.userId)}
							<li class="flex items-baseline justify-between gap-3 py-2">
								<span class="min-w-0 truncate text-foreground">
									{person.email ?? 'Someone without an email'}{person.you
										? ' (you)'
										: ''}
								</span>
								<span class="shrink-0 tabular-nums text-muted-foreground">
									{lookupCount(person.lookups)}, {usd(person.usd)}
								</span>
							</li>
						{/each}
					</ul>
				</section>
			</div>

			<!-- The most expensive lookups -->
			<section class="rounded-xl border border-border bg-card p-5 shadow-ink">
				<h2 class="text-base font-semibold text-foreground">Most expensive lookups</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Names are shown for your own lookups only. Who someone else researched stays
					theirs.
				</p>
				<div class="mt-3 overflow-x-auto">
					<table class="w-full min-w-[36rem] text-sm">
						<thead>
							<tr class="border-b border-border text-left text-muted-foreground">
								<th scope="col" class="py-2 pr-4 font-medium">Researched</th>
								<th scope="col" class="py-2 pr-4 font-medium">By</th>
								<th scope="col" class="py-2 pr-4 font-medium">When</th>
								<th scope="col" class="py-2 pr-4 text-right font-medium"
									>Searches</th
								>
								<th scope="col" class="py-2 pr-4 text-right font-medium"
									>Details saved</th
								>
								<th scope="col" class="py-2 text-right font-medium">Cost</th>
							</tr>
						</thead>
						<tbody>
							{#each data.costliest as row (row.id)}
								<tr class="border-b border-border/60">
									<th
										scope="row"
										class="py-2 pr-4 text-left font-normal text-foreground"
									>
										{row.entityName ?? KIND_NAMES[researchCostGroupOf(row)]}
										{#if row.entityName}
											<span class="text-muted-foreground">
												· {KIND_NAMES[researchCostGroupOf(row)]?.replace(
													/^An? /,
													''
												)}
											</span>
										{/if}
									</th>
									<td
										class="max-w-[14rem] truncate py-2 pr-4 text-muted-foreground"
									>
										{row.email ?? 'Not recorded'}
									</td>
									<td class="whitespace-nowrap py-2 pr-4 text-muted-foreground">
										{timeFormat.format(new Date(row.at))}
									</td>
									<td class="py-2 pr-4 text-right tabular-nums text-foreground">
										{row.split ? row.split.searches : 'Not recorded'}
									</td>
									<td class="py-2 pr-4 text-right tabular-nums text-foreground">
										{row.factsAdded}
									</td>
									<td class="py-2 text-right tabular-nums text-foreground">
										{usd(row.costUsd)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		</ErrorBoundary>
	{/if}
</div>
