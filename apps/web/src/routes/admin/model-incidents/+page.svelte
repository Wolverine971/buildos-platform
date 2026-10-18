<!-- apps/web/src/routes/admin/model-incidents/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import { Download, Timer, TriangleAlert, CircleCheck, Clock } from '$lib/icons/lucide';
	import { seconds } from '$lib/services/admin/model-incidents/story';

	let { data }: { data: PageData } = $props();

	const overview = $derived(data.overview);
	const filters = $derived(data.filters);

	function hrefWith(changes: Record<string, string | number | null>): string {
		const params = new URLSearchParams($page.url.searchParams);
		for (const [key, value] of Object.entries(changes)) {
			if (value === null || value === '') params.delete(key);
			else params.set(key, String(value));
		}
		const query = params.toString();
		return `/admin/model-incidents${query ? `?${query}` : ''}`;
	}

	const exportHref = $derived(
		`/admin/model-incidents/export${$page.url.search ? $page.url.search : ''}`
	);

	function relative(iso: string): string {
		const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes} min ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 36) return `${hours} h ago`;
		return `${Math.round(hours / 24)} d ago`;
	}

	function ending(incident: PageData['incidents'][number]): string {
		const eventual = incident.eventual;
		if (!eventual) return 'Ended with the attempt';
		if (eventual.status === 'running') return 'Left running, no end saved';
		if (eventual.completed) return `Finished on its own at ${seconds(eventual.totalMs)}`;
		if (eventual.endedBy === 'deadline') return `Still going at ${seconds(eventual.totalMs)}`;
		if (eventual.endedBy === 'response_error')
			return `Rejected at ${seconds(eventual.totalMs)}`;
		return `${eventual.endedBy ?? 'Ended'} at ${seconds(eventual.totalMs)}`;
	}

	const peakDay = $derived(Math.max(1, ...overview.byDay.map((day) => day.stalls + day.errors)));
	const peakReason = $derived(Math.max(1, ...overview.byReason.map((entry) => entry.count)));
	const peakProvider = $derived(Math.max(1, ...overview.byProvider.map((entry) => entry.count)));

	const tiles = $derived([
		{ label: 'Incidents', value: overview.total, icon: Timer, tone: 'text-foreground' },
		{ label: 'Stalls', value: overview.stalls, icon: Clock, tone: 'text-warning' },
		{ label: 'Errors', value: overview.errors, icon: TriangleAlert, tone: 'text-destructive' },
		{
			label: 'Finished late',
			value: overview.finishedLate,
			icon: CircleCheck,
			tone: 'text-success',
			hint:
				overview.finishedLateMedianMs !== null
					? `median ${seconds(overview.finishedLateMedianMs)}`
					: 'left running, then done'
		}
	]);
</script>

<svelte:head>
	<title>Model Incidents · Admin</title>
</svelte:head>

<div class="space-y-6">
	<AdminPageHeader
		title="Model Incidents"
		description="Stalled and failed model calls from chat and background jobs, kept for 14 days. Open one to see what happened, or export it for Claude Code or Codex."
		icon={Timer}
	>
		{#snippet actions()}
			<a
				href={exportHref}
				download
				class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium shadow-ink pressable hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<Download class="h-4 w-4" />
				Export {overview.total === 1 ? '1 incident' : `${overview.total} incidents`}
			</a>
		{/snippet}
	</AdminPageHeader>

	<!-- Filters -->
	<div class="flex flex-wrap items-center gap-3">
		<div
			class="inline-flex rounded-lg border border-border bg-card p-0.5"
			role="group"
			aria-label="Window"
		>
			{#each data.dayChoices as days (days)}
				<a
					href={hrefWith({ days: days === 7 ? null : days })}
					aria-current={filters.days === days ? 'page' : undefined}
					class="rounded-md px-3 py-1.5 text-sm {filters.days === days
						? 'bg-accent text-accent-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					>{days === 1 ? '24 h' : `${days} d`}</a
				>
			{/each}
		</div>
		<div
			class="inline-flex rounded-lg border border-border bg-card p-0.5"
			role="group"
			aria-label="Kind"
		>
			{#each [{ value: null, label: 'All' }, { value: 'stall', label: 'Stalls' }, { value: 'error', label: 'Errors' }] as choice (choice.label)}
				<a
					href={hrefWith({ kind: choice.value })}
					aria-current={filters.kind === choice.value ? 'page' : undefined}
					class="rounded-md px-3 py-1.5 text-sm {filters.kind === choice.value
						? 'bg-accent text-accent-foreground'
						: 'text-muted-foreground hover:text-foreground'}">{choice.label}</a
				>
			{/each}
		</div>
		<label class="flex items-center gap-2 text-sm">
			<span class="micro-label">Source</span>
			<select
				class="rounded-lg border border-border-strong bg-card px-2 py-1.5 text-sm"
				value={filters.lane ?? ''}
				onchange={(event) => goto(hrefWith({ lane: event.currentTarget.value || null }))}
			>
				<option value="">All sources</option>
				{#each data.facets.lanes as lane (lane)}
					<option value={lane}>{lane}</option>
				{/each}
			</select>
		</label>
		<label class="flex items-center gap-2 text-sm">
			<span class="micro-label">Provider</span>
			<select
				class="rounded-lg border border-border-strong bg-card px-2 py-1.5 text-sm"
				value={filters.provider ?? ''}
				onchange={(event) =>
					goto(hrefWith({ provider: event.currentTarget.value || null }))}
			>
				<option value="">All providers</option>
				{#each data.facets.providers as provider (provider)}
					<option value={provider}>{provider}</option>
				{/each}
			</select>
		</label>
		{#if filters.passRole}
			<a
				href={hrefWith({ pass_role: null })}
				class="text-sm text-accent underline-offset-4 hover:underline"
				>Clear step filter ({filters.passRole})</a
			>
		{/if}
	</div>

	<!-- What's going on -->
	<section class="rounded-xl border border-border bg-card p-5 shadow-ink tx tx-frame tx-weak">
		<p class="micro-label mb-2">What's going on</p>
		<p class="text-base leading-relaxed text-foreground">{overview.sentences.join(' ')}</p>
		{#if data.truncated}
			<p class="mt-2 text-sm text-muted-foreground">
				Showing the newest 500. Narrow the window or filters to see the rest.
			</p>
		{/if}
	</section>

	<!-- Tiles -->
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		{#each tiles as tile (tile.label)}
			<div class="rounded-xl border border-border bg-card p-4 shadow-ink">
				<div class="flex items-center gap-2">
					<tile.icon class="h-4 w-4 {tile.tone}" />
					<span class="micro-label">{tile.label}</span>
				</div>
				<p class="mt-2 text-2xl font-semibold stamp">{tile.value}</p>
				{#if tile.hint}<p class="text-xs text-muted-foreground">{tile.hint}</p>{/if}
			</div>
		{/each}
	</div>

	{#if overview.total}
		<div class="grid gap-4 lg:grid-cols-3">
			<!-- Per day -->
			<section class="rounded-xl border border-border bg-card p-4 shadow-ink">
				<p class="micro-label mb-3">Per day</p>
				<div class="flex h-28 items-end gap-1" role="img" aria-label="Incidents per day">
					{#each overview.byDay as day (day.day)}
						<div
							class="flex flex-1 flex-col justify-end gap-0.5"
							title="{day.day}: {day.stalls} stalls, {day.errors} errors"
						>
							{#if day.errors}
								<div
									class="rounded-t-sm bg-destructive/70"
									style="height: {(day.errors / peakDay) * 96}px"
								></div>
							{/if}
							{#if day.stalls}
								<div
									class="bg-warning/70 {day.errors ? '' : 'rounded-t-sm'}"
									style="height: {(day.stalls / peakDay) * 96}px"
								></div>
							{/if}
							{#if !day.stalls && !day.errors}<div class="h-px bg-border"></div>{/if}
						</div>
					{/each}
				</div>
				<div class="mt-2 flex justify-between text-2xs text-muted-foreground stamp">
					<span>{overview.byDay[0]?.day.slice(5)}</span>
					<span>{overview.byDay.at(-1)?.day.slice(5)}</span>
				</div>
				<div class="mt-2 flex gap-4 text-xs text-muted-foreground">
					<span class="flex items-center gap-1.5"
						><span class="h-2.5 w-2.5 rounded-sm bg-warning/70"></span>Stalls</span
					>
					<span class="flex items-center gap-1.5"
						><span class="h-2.5 w-2.5 rounded-sm bg-destructive/70"></span>Errors</span
					>
				</div>
			</section>

			<!-- By reason -->
			<section class="rounded-xl border border-border bg-card p-4 shadow-ink">
				<p class="micro-label mb-3">What went wrong</p>
				<ul class="space-y-2">
					{#each overview.byReason.slice(0, 6) as entry (entry.key)}
						<li class="text-sm">
							<div class="flex justify-between gap-2">
								<span class="truncate" title={entry.key}>{entry.label}</span>
								<span class="stamp text-muted-foreground">{entry.count}</span>
							</div>
							<div class="mt-1 h-1.5 rounded-full bg-muted">
								<div
									class="h-1.5 rounded-full bg-accent/70"
									style="width: {(entry.count / peakReason) * 100}%"
								></div>
							</div>
						</li>
					{/each}
				</ul>
			</section>

			<!-- By provider -->
			<section class="rounded-xl border border-border bg-card p-4 shadow-ink">
				<p class="micro-label mb-3">Where it happened</p>
				<ul class="space-y-2">
					{#each overview.byProvider.slice(0, 6) as entry (entry.key)}
						<li class="text-sm">
							<div class="flex justify-between gap-2">
								{#if entry.key}
									<a
										href={hrefWith({ provider: entry.key })}
										class="truncate hover:text-accent">{entry.label}</a
									>
								{:else}
									<span class="truncate text-muted-foreground">{entry.label}</span
									>
								{/if}
								<span class="stamp text-muted-foreground">{entry.count}</span>
							</div>
							<div class="mt-1 h-1.5 rounded-full bg-muted">
								<div
									class="h-1.5 rounded-full bg-accent/70"
									style="width: {(entry.count / peakProvider) * 100}%"
								></div>
							</div>
						</li>
					{/each}
				</ul>
				{#if overview.bySource.length > 1}
					<p class="micro-label mb-2 mt-4">Which job</p>
					<ul class="space-y-1 text-sm">
						{#each overview.bySource.slice(0, 5) as entry (entry.key)}
							<li class="flex justify-between gap-2">
								<span class="truncate">{entry.label}</span>
								<span class="stamp text-muted-foreground">{entry.count}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>
	{/if}

	<!-- Incidents -->
	<section class="rounded-xl border border-border bg-card shadow-ink">
		{#if data.incidents.length}
			<ul class="divide-y divide-border">
				{#each data.incidents as incident (incident.id)}
					<li>
						<a
							href="/admin/model-incidents/{incident.id}"
							class="flex flex-col gap-1 px-4 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-start sm:gap-4"
						>
							<div
								class="flex shrink-0 items-center gap-2 sm:w-32 sm:flex-col sm:items-start sm:gap-0.5"
							>
								<span
									class="rounded px-1.5 py-0.5 text-2xs font-medium {incident.kind ===
									'stall'
										? 'bg-warning/15 text-foreground'
										: 'bg-destructive/10 text-destructive'}"
									>{incident.kind === 'stall' ? 'Stall' : 'Error'}</span
								>
								<span
									class="text-xs text-muted-foreground stamp"
									title={incident.createdAt}>{relative(incident.createdAt)}</span
								>
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-foreground">
									{incident.headline}
								</p>
								<p class="text-xs text-muted-foreground">
									{incident.source} · {incident.model}{incident.provider
										? ` on ${incident.provider}`
										: ''}{incident.httpStatus
										? ` · HTTP ${incident.httpStatus}`
										: ''}{incident.attempt && incident.attempt > 1
										? ` · attempt ${incident.attempt}`
										: ''}
								</p>
								{#if incident.topFinding}
									<p class="mt-1 text-xs text-muted-foreground line-clamp-2">
										{incident.topFinding.text}
									</p>
								{/if}
							</div>
							<div
								class="shrink-0 text-xs text-muted-foreground sm:w-48 sm:text-right"
							>
								<p>
									<span class="stamp">{seconds(incident.durationMs)}</span> attempt
								</p>
								<p>{ending(incident)}</p>
								{#if incident.userEmail}<p class="truncate">
										{incident.userEmail}
									</p>{/if}
							</div>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="px-4 py-10 text-center text-sm text-muted-foreground">
				Nothing stalled or failed in this window.
			</p>
		{/if}
	</section>
</div>
