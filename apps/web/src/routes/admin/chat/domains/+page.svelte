<!-- apps/web/src/routes/admin/chat/domains/+page.svelte -->
<script lang="ts">
	import {
		Archive,
		CheckCircle,
		Clock,
		Database,
		Eye,
		FileText,
		Filter,
		Network,
		PlayCircle,
		RefreshCw,
		Search,
		XCircle
	} from 'lucide-svelte';
	import { browser } from '$app/environment';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import type { DomainDemandAnalyticsPayload } from '$lib/services/admin/domain-demand-analytics';
	import type {
		DomainResearchQueueKind,
		DomainResearchQueuePriority,
		DomainResearchQueueStatus,
		DomainResearchQueueStoredRow
	} from '$lib/services/agentic-chat/tools/domains/domain-research-queue';

	type Timeframe = '24h' | '7d' | '30d';
	type QueueStatusFilter = DomainResearchQueueStatus | 'all';
	type QueueKindFilter = DomainResearchQueueKind | 'all';
	type QueuePriorityFilter = DomainResearchQueuePriority | 'all';

	type QueuePayload = {
		filters: {
			status: QueueStatusFilter;
			kind: QueueKindFilter;
			priority: QueuePriorityFilter;
			search: string;
			limit: number;
		};
		overview: {
			total_matching_rows: number;
			returned_rows: number;
			status_counts: Record<DomainResearchQueueStatus, number>;
		};
		rows: DomainResearchQueueStoredRow[];
	};

	const statusOptions: QueueStatusFilter[] = [
		'all',
		'queued',
		'researching',
		'draft_ready',
		'reviewing',
		'approved',
		'rejected',
		'archived'
	];
	const kindOptions: QueueKindFilter[] = [
		'all',
		'domain',
		'work_capability',
		'skill',
		'micro_skill',
		'resource'
	];
	const priorityOptions: QueuePriorityFilter[] = ['all', 'high', 'medium', 'low'];

	let isDomainLoading = $state(true);
	let isQueueLoading = $state(true);
	let isPromoting = $state(false);
	let error = $state<string | null>(null);
	let selectedTimeframe = $state<Timeframe>('7d');
	let selectedStatus = $state<QueueStatusFilter>('all');
	let selectedKind = $state<QueueKindFilter>('all');
	let selectedPriority = $state<QueuePriorityFilter>('all');
	let queueSearch = $state('');
	let showFilters = $state(true);
	let loadedAt = $state<Date | null>(null);
	let domainData = $state<DomainDemandAnalyticsPayload | null>(null);
	let queueData = $state<QueuePayload | null>(null);
	let updatingId = $state<string | null>(null);
	let domainLoadRequestId = 0;
	let queueLoadRequestId = 0;
	let queueSearchDebounce: ReturnType<typeof setTimeout> | null = null;

	let isLoading = $derived(isDomainLoading || isQueueLoading);
	let isInitialLoading = $derived(
		(isDomainLoading && !domainData) || (isQueueLoading && !queueData)
	);
	let queueRows = $derived(queueData?.rows ?? []);
	let topCandidates = $derived((domainData?.research_queue_candidates ?? []).slice(0, 8));
	let topBacklog = $derived((domainData?.research_backlog ?? []).slice(0, 8));

	$effect(() => {
		if (!browser) return;
		selectedTimeframe;
		loadDomainDemand();
	});

	$effect(() => {
		if (!browser) return;
		selectedStatus;
		selectedKind;
		selectedPriority;
		queueSearch;
		if (queueSearchDebounce) clearTimeout(queueSearchDebounce);
		queueSearchDebounce = setTimeout(
			() => {
				void loadQueue();
			},
			queueSearch.trim() ? 250 : 0
		);
		return () => {
			if (queueSearchDebounce) clearTimeout(queueSearchDebounce);
		};
	});

	async function loadDomainDemand() {
		if (!browser) return;
		const requestId = ++domainLoadRequestId;
		isDomainLoading = true;
		error = null;

		try {
			const domainParams = new URLSearchParams({
				timeframe: selectedTimeframe,
				limit: '5000'
			});

			const domainResponse = await fetch(`/api/admin/chat/domains?${domainParams}`);

			if (!domainResponse.ok) throw new Error('Failed to load domain demand');

			const domainJson = await domainResponse.json();
			if (!domainJson.success)
				throw new Error(domainJson.message || 'Failed to load domain demand');
			if (requestId !== domainLoadRequestId) return;

			domainData = domainJson.data;
			loadedAt = new Date();
		} catch (err) {
			if (requestId !== domainLoadRequestId) return;
			console.error('Error loading domain demand:', err);
			error = err instanceof Error ? err.message : 'Failed to load domain demand';
		} finally {
			if (requestId === domainLoadRequestId) isDomainLoading = false;
		}
	}

	async function loadQueue() {
		if (!browser) return;
		const requestId = ++queueLoadRequestId;
		isQueueLoading = true;
		error = null;

		try {
			const queueParams = new URLSearchParams({
				status: selectedStatus,
				kind: selectedKind,
				priority: selectedPriority,
				limit: '100'
			});
			if (queueSearch.trim()) queueParams.set('search', queueSearch.trim());

			const queueResponse = await fetch(
				`/api/admin/chat/domains/research-queue?${queueParams}`
			);
			if (!queueResponse.ok) throw new Error('Failed to load research queue');

			const queueJson = await queueResponse.json();
			if (!queueJson.success)
				throw new Error(queueJson.message || 'Failed to load research queue');
			if (requestId !== queueLoadRequestId) return;

			queueData = queueJson.data;
			loadedAt = new Date();
		} catch (err) {
			if (requestId !== queueLoadRequestId) return;
			console.error('Error loading domain research queue:', err);
			error = err instanceof Error ? err.message : 'Failed to load research queue';
		} finally {
			if (requestId === queueLoadRequestId) isQueueLoading = false;
		}
	}

	async function refreshDashboard() {
		await Promise.all([loadDomainDemand(), loadQueue()]);
	}

	async function promoteCandidates() {
		if (!browser || isPromoting) return;
		isPromoting = true;
		error = null;
		try {
			const response = await fetch('/api/admin/chat/domains/research-queue/promote', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					timeframe: selectedTimeframe,
					limit: 5000
				})
			});
			const payload = await response.json();
			if (!response.ok || !payload.success) {
				throw new Error(payload.message || 'Failed to promote queue candidates');
			}
			await refreshDashboard();
		} catch (err) {
			console.error('Error promoting domain research queue candidates:', err);
			error = err instanceof Error ? err.message : 'Failed to promote queue candidates';
		} finally {
			isPromoting = false;
		}
	}

	async function updateQueueItem(
		row: DomainResearchQueueStoredRow,
		updates: Partial<{
			status: DomainResearchQueueStatus;
			priority: DomainResearchQueuePriority;
		}>
	) {
		if (!browser || updatingId) return;
		updatingId = row.id;
		error = null;
		try {
			const response = await fetch(
				`/api/admin/chat/domains/research-queue/${encodeURIComponent(row.id)}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(updates)
				}
			);
			const payload = await response.json();
			if (!response.ok || !payload.success) {
				throw new Error(payload.message || 'Failed to update queue item');
			}
			await loadQueue();
		} catch (err) {
			console.error('Error updating domain research queue item:', err);
			error = err instanceof Error ? err.message : 'Failed to update queue item';
		} finally {
			updatingId = null;
		}
	}

	function resetFilters() {
		selectedStatus = 'all';
		selectedKind = 'all';
		selectedPriority = 'all';
		queueSearch = '';
	}

	function formatLabel(value: string): string {
		return value
			.split('_')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function formatNumber(value: number | null | undefined): string {
		if (value === null || value === undefined || !Number.isFinite(value)) return '-';
		return new Intl.NumberFormat().format(value);
	}

	function formatDateTime(value: string | null | undefined): string {
		if (!value) return '-';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '-';
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(date);
	}

	function statusClass(status: DomainResearchQueueStatus): string {
		switch (status) {
			case 'queued':
				return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
			case 'researching':
				return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
			case 'draft_ready':
				return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300';
			case 'reviewing':
				return 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300';
			case 'approved':
				return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
			case 'rejected':
				return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
			case 'archived':
				return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300';
			default:
				return 'border-border bg-muted text-muted-foreground';
		}
	}

	function priorityClass(priority: DomainResearchQueuePriority): string {
		switch (priority) {
			case 'high':
				return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
			case 'medium':
				return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
			case 'low':
				return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300';
			default:
				return 'border-border bg-muted text-muted-foreground';
		}
	}
</script>

<svelte:head>
	<title>Domains - Chat Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<AdminPageHeader
		title="Domains"
		description="Domain demand, coverage gaps, and review-gated research queue"
		icon={Network}
		showBack={true}
	>
		{#snippet actions()}
			<div class="flex flex-wrap items-center gap-3">
				<Button
					onclick={() => (showFilters = !showFilters)}
					variant="secondary"
					size="sm"
					icon={Filter}
					class="pressable"
				>
					Filters
				</Button>
				<Select
					bind:value={selectedTimeframe}
					onchange={(value) => (selectedTimeframe = String(value) as Timeframe)}
					size="md"
					aria-label="Select time range"
				>
					<option value="24h">Last 24 Hours</option>
					<option value="7d">Last 7 Days</option>
					<option value="30d">Last 30 Days</option>
				</Select>
				<Button
					onclick={promoteCandidates}
					disabled={isDomainLoading || isPromoting}
					variant="primary"
					size="sm"
					icon={Database}
					loading={isPromoting}
					class="pressable"
				>
					Promote
				</Button>
				<Button
					onclick={refreshDashboard}
					disabled={isLoading}
					variant="secondary"
					size="sm"
					icon={RefreshCw}
					loading={isLoading}
					class="pressable"
				>
					Refresh
				</Button>
			</div>
		{/snippet}
	</AdminPageHeader>

	{#if error}
		<div
			class="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-3 tx tx-static tx-weak"
			role="alert"
		>
			<div class="flex items-center gap-2">
				<XCircle class="h-5 w-5 shrink-0 text-red-500" />
				<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
			</div>
		</div>
	{/if}

	{#if showFilters}
		<div class="mb-6 rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grid tx-weak">
			<div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
				<TextInput
					bind:value={queueSearch}
					icon={Search}
					type="search"
					placeholder="Search queue"
					aria-label="Search queue"
				/>
				<Select
					bind:value={selectedStatus}
					onchange={(value) => (selectedStatus = String(value) as QueueStatusFilter)}
					size="sm"
					aria-label="Filter by status"
				>
					{#each statusOptions as status}
						<option value={status}
							>{status === 'all' ? 'All Statuses' : formatLabel(status)}</option
						>
					{/each}
				</Select>
				<Select
					bind:value={selectedKind}
					onchange={(value) => (selectedKind = String(value) as QueueKindFilter)}
					size="sm"
					aria-label="Filter by kind"
				>
					{#each kindOptions as kind}
						<option value={kind}
							>{kind === 'all' ? 'All Kinds' : formatLabel(kind)}</option
						>
					{/each}
				</Select>
				<Select
					bind:value={selectedPriority}
					onchange={(value) => (selectedPriority = String(value) as QueuePriorityFilter)}
					size="sm"
					aria-label="Filter by priority"
				>
					{#each priorityOptions as priority}
						<option value={priority}
							>{priority === 'all' ? 'All Priorities' : formatLabel(priority)}</option
						>
					{/each}
				</Select>
			</div>
			<div class="mt-3 flex flex-wrap items-center justify-between gap-3">
				<p class="text-xs text-muted-foreground">
					Source: domain_research_queue
					{#if loadedAt}
						<span>· Loaded {formatDateTime(loadedAt.toISOString())}</span>
					{/if}
				</p>
				<Button onclick={resetFilters} variant="secondary" size="sm" class="pressable">
					Reset Filters
				</Button>
			</div>
		</div>
	{/if}

	{#if isInitialLoading}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
			{#each Array(8) as _}
				<div class="animate-pulse rounded-lg border border-border bg-card p-4 shadow-ink">
					<div class="mb-3 h-4 w-2/3 rounded bg-muted"></div>
					<div class="mb-2 h-8 w-1/2 rounded bg-muted"></div>
					<div class="h-3 w-3/4 rounded bg-muted"></div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-xs font-semibold text-muted-foreground">Active Domains</p>
						<p class="mt-1 text-3xl font-bold text-foreground">
							{formatNumber(domainData?.overview.total_domains)}
						</p>
					</div>
					<Network class="h-7 w-7 shrink-0 text-sky-500" />
				</div>
				<p class="mt-2 text-xs text-muted-foreground">
					{formatNumber(domainData?.overview.total_domain_occurrences)} total occurrences
				</p>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-xs font-semibold text-muted-foreground">Backlog Items</p>
						<p class="mt-1 text-3xl font-bold text-foreground">
							{formatNumber(domainData?.overview.total_research_backlog_items)}
						</p>
					</div>
					<FileText class="h-7 w-7 shrink-0 text-amber-500" />
				</div>
				<p class="mt-2 text-xs text-muted-foreground">
					{formatNumber(domainData?.overview.total_coverage_gaps)} coverage gaps
				</p>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-xs font-semibold text-muted-foreground">Queue Candidates</p>
						<p class="mt-1 text-3xl font-bold text-foreground">
							{formatNumber(domainData?.research_queue_candidates.length)}
						</p>
					</div>
					<Database class="h-7 w-7 shrink-0 text-cyan-500" />
				</div>
				<p class="mt-2 text-xs text-muted-foreground">Promoted by stable queue key</p>
			</div>

			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-xs font-semibold text-muted-foreground">Queue Rows</p>
						<p class="mt-1 text-3xl font-bold text-foreground">
							{formatNumber(queueData?.overview.total_matching_rows)}
						</p>
					</div>
					<Clock class="h-7 w-7 shrink-0 text-indigo-500" />
				</div>
				<p class="mt-2 text-xs text-muted-foreground">
					{formatNumber(queueData?.overview.status_counts.queued)} queued,
					{formatNumber(queueData?.overview.status_counts.researching)} researching
				</p>
			</div>
		</div>

		<div class="mb-6 rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak">
			<div
				class="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"
			>
				<div>
					<h2 class="text-base font-semibold text-foreground">Research Queue</h2>
					<p class="text-xs text-muted-foreground">
						{formatNumber(queueData?.overview.returned_rows)} shown
					</p>
				</div>
				<Button
					onclick={promoteCandidates}
					disabled={isPromoting || isDomainLoading}
					variant="outline"
					size="sm"
					icon={Database}
					loading={isPromoting}
					class="pressable"
				>
					Promote Candidates
				</Button>
			</div>

			{#if queueRows.length === 0}
				<div class="p-8 text-center">
					<Database class="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
					<h3 class="text-lg font-semibold text-foreground">No queue rows</h3>
					<p class="mt-2 text-sm text-muted-foreground">
						No rows match the current filters.
					</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-border text-sm">
						<thead class="bg-muted/40">
							<tr
								class="text-left text-xs font-semibold uppercase text-muted-foreground"
							>
								<th class="px-4 py-3">Queue Item</th>
								<th class="px-4 py-3">Status</th>
								<th class="px-4 py-3">Signals</th>
								<th class="px-4 py-3">Last Seen</th>
								<th class="px-4 py-3">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each queueRows as row}
								<tr class="align-top">
									<td class="max-w-xl px-4 py-4">
										<div class="flex flex-wrap items-center gap-2">
											<span class="font-mono text-xs text-muted-foreground"
												>{row.queue_key}</span
											>
											<span
												class="rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
											>
												{formatLabel(row.kind)}
											</span>
										</div>
										<p class="mt-2 font-medium text-foreground">
											{row.summary}
										</p>
										<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">
											{row.user_need}
										</p>
										{#if row.domain_ids.length > 0}
											<div class="mt-2 flex flex-wrap gap-1">
												{#each row.domain_ids as domainId}
													<span
														class="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
													>
														{domainId}
													</span>
												{/each}
											</div>
										{/if}
									</td>
									<td class="px-4 py-4">
										<div class="flex flex-col gap-2">
											<span
												class="w-fit rounded border px-2 py-0.5 text-xs font-semibold {statusClass(
													row.status
												)}"
											>
												{formatLabel(row.status)}
											</span>
											<Select
												value={row.priority}
												onchange={(value) =>
													updateQueueItem(row, {
														priority: String(
															value
														) as DomainResearchQueuePriority
													})}
												size="sm"
												disabled={updatingId === row.id}
												aria-label="Update priority"
												class="min-w-32"
											>
												<option value="high">High</option>
												<option value="medium">Medium</option>
												<option value="low">Low</option>
											</Select>
											<span
												class="w-fit rounded border px-2 py-0.5 text-xs font-semibold {priorityClass(
													row.priority
												)}"
											>
												{formatLabel(row.priority)}
											</span>
										</div>
									</td>
									<td class="px-4 py-4 text-xs text-muted-foreground">
										<p>
											<span class="font-semibold text-foreground"
												>{formatNumber(row.occurrences)}</span
											> occurrences
										</p>
										<p>
											<span class="font-semibold text-foreground"
												>{formatNumber(row.source_user_count)}</span
											> users
										</p>
										<p>
											<span class="font-semibold text-foreground"
												>{formatNumber(row.source_session_ids.length)}</span
											> sessions
										</p>
									</td>
									<td class="px-4 py-4 text-xs text-muted-foreground">
										<p>{formatDateTime(row.last_seen_at)}</p>
										{#if row.claimed_by}
											<p class="mt-1">Claimed by {row.claimed_by}</p>
										{/if}
									</td>
									<td class="px-4 py-4">
										<div class="flex flex-wrap gap-2">
											{#if row.status === 'queued'}
												<Button
													onclick={() =>
														updateQueueItem(row, {
															status: 'researching'
														})}
													disabled={updatingId === row.id}
													variant="outline"
													size="sm"
													icon={PlayCircle}
													loading={updatingId === row.id}
												>
													Claim
												</Button>
											{/if}
											{#if row.status === 'researching'}
												<Button
													onclick={() =>
														updateQueueItem(row, {
															status: 'draft_ready'
														})}
													disabled={updatingId === row.id}
													variant="outline"
													size="sm"
													icon={FileText}
													loading={updatingId === row.id}
												>
													Draft
												</Button>
											{/if}
											{#if row.status === 'draft_ready'}
												<Button
													onclick={() =>
														updateQueueItem(row, {
															status: 'reviewing'
														})}
													disabled={updatingId === row.id}
													variant="outline"
													size="sm"
													icon={Eye}
													loading={updatingId === row.id}
												>
													Review
												</Button>
											{/if}
											{#if row.status === 'reviewing'}
												<Button
													onclick={() =>
														updateQueueItem(row, {
															status: 'approved'
														})}
													disabled={updatingId === row.id}
													variant="success"
													size="sm"
													icon={CheckCircle}
													loading={updatingId === row.id}
												>
													Approve
												</Button>
											{/if}
											{#if row.status !== 'archived' && row.status !== 'approved'}
												<Button
													onclick={() =>
														updateQueueItem(row, {
															status: 'archived'
														})}
													disabled={updatingId === row.id}
													variant="secondary"
													size="sm"
													icon={Archive}
													loading={updatingId === row.id}
												>
													Archive
												</Button>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
			<div class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak">
				<div class="border-b border-border p-4">
					<h2 class="text-base font-semibold text-foreground">Queue Candidates</h2>
					<p class="text-xs text-muted-foreground">
						{formatNumber(domainData?.research_queue_candidates.length)} derived from session
						backlog
					</p>
				</div>
				<div class="divide-y divide-border">
					{#each topCandidates as candidate}
						<div class="p-4">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-mono text-xs text-muted-foreground"
									>{candidate.queue_key}</span
								>
								<span
									class="rounded border px-2 py-0.5 text-xs font-semibold {priorityClass(
										candidate.priority
									)}"
								>
									{formatLabel(candidate.priority)}
								</span>
							</div>
							<p class="mt-2 text-sm font-medium text-foreground">
								{candidate.summary}
							</p>
							<p class="mt-1 text-xs text-muted-foreground">
								{formatNumber(candidate.occurrences)} occurrences · {formatNumber(
									candidate.source_user_count
								)} users
							</p>
						</div>
					{:else}
						<div class="p-6 text-sm text-muted-foreground">
							No queue candidates in this window.
						</div>
					{/each}
				</div>
			</div>

			<div class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak">
				<div class="border-b border-border p-4">
					<h2 class="text-base font-semibold text-foreground">Coverage Backlog</h2>
					<p class="text-xs text-muted-foreground">
						{formatNumber(domainData?.overview.total_research_backlog_items)} missing skill/resource
						signals
					</p>
				</div>
				<div class="divide-y divide-border">
					{#each topBacklog as backlog}
						<div class="p-4">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-mono text-xs text-muted-foreground"
									>{backlog.id}</span
								>
								<span
									class="rounded border px-2 py-0.5 text-xs font-semibold {priorityClass(
										backlog.priority
									)}"
								>
									{formatLabel(backlog.priority)}
								</span>
							</div>
							<p class="mt-2 text-sm font-medium text-foreground">
								{backlog.summary}
							</p>
							<p class="mt-1 text-xs text-muted-foreground">
								{formatNumber(backlog.total_occurrences)} occurrences · {formatNumber(
									backlog.unique_users
								)} users
							</p>
						</div>
					{:else}
						<div class="p-6 text-sm text-muted-foreground">
							No backlog signals in this window.
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>
