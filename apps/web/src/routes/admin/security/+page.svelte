<!-- apps/web/src/routes/admin/security/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// Security logs state
	let securityLogs = $state<any[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Filters
	let eventTypeFilter = $state<string>('all');
	let wasBlockedFilter = $state<string>('all');
	let dateFilter = $state<string>('7days');

	// Pagination
	let currentPage = $state(1);
	let logsPerPage = 20;

	// Selected log for detail view
	let selectedLog = $state<any | null>(null);

	onMount(async () => {
		await loadSecurityLogs();
	});

	async function loadSecurityLogs() {
		loading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				eventType: eventTypeFilter,
				wasBlocked: wasBlockedFilter,
				dateFilter: dateFilter,
				page: currentPage.toString(),
				limit: logsPerPage.toString()
			});

			const response = await fetch(`/api/admin/security/logs?${params}`);

			if (!response.ok) {
				throw new Error('Failed to load security logs');
			}

			const result = await response.json();
			securityLogs = result.logs || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
			console.error('Error loading security logs:', err);
		} finally {
			loading = false;
		}
	}

	function formatDate(isoString: string): string {
		return new Date(isoString).toLocaleString();
	}

	function formatEventType(eventType: string): string {
		return eventType
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	function eventBadgeVariant(eventType: string): BadgeVariant {
		switch (eventType) {
			case 'prompt_injection_blocked':
				return 'error';
			case 'prompt_injection_detected':
				return 'warning';
			case 'prompt_injection_false_positive':
				return 'success';
			case 'rate_limit_exceeded':
				return 'error';
			default:
				return 'info';
		}
	}

	function severityBadgeVariant(severity: string): BadgeVariant {
		switch (severity) {
			case 'high':
				return 'error';
			case 'medium':
				return 'warning';
			case 'low':
				return 'info';
			default:
				return 'info';
		}
	}

	function viewDetails(log: any) {
		selectedLog = log;
	}

	function closeDetails() {
		selectedLog = null;
	}

	async function applyFilters() {
		currentPage = 1;
		await loadSecurityLogs();
	}
</script>

<div class="admin-page">
	<AdminPageHeader
		title="Security Logs"
		description="Monitor prompt injection attempts and rate-limit enforcement in real time"
		icon={ShieldCheck}
		backHref="/admin"
		backLabel="Dashboard"
	/>

	<div class="admin-panel p-5">
		<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
			<div class="space-y-2">
				<label class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
					Event Type
				</label>
				<Select bind:value={eventTypeFilter} size="md" on:change={applyFilters}>
					<option value="all">All Events</option>
					<option value="prompt_injection_blocked">Blocked</option>
					<option value="prompt_injection_detected">Detected</option>
					<option value="prompt_injection_false_positive">False Positives</option>
					<option value="rate_limit_exceeded">Rate Limit Exceeded</option>
				</Select>
			</div>

			<div class="space-y-2">
				<label class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
					Status
				</label>
				<Select bind:value={wasBlockedFilter} size="md" on:change={applyFilters}>
					<option value="all">All</option>
					<option value="true">Blocked</option>
					<option value="false">Allowed</option>
				</Select>
			</div>

			<div class="space-y-2">
				<label class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
					Time Period
				</label>
				<Select bind:value={dateFilter} size="md" on:change={applyFilters}>
					<option value="24hours">Last 24 Hours</option>
					<option value="7days">Last 7 Days</option>
					<option value="30days">Last 30 Days</option>
					<option value="all">All Time</option>
				</Select>
			</div>

			<div class="flex items-end">
				<Button variant="secondary" size="sm" icon={RefreshCw} on:click={applyFilters}>
					Refresh
				</Button>
			</div>
		</div>
	</div>

	{#if error}
		<AdminCard tone="danger" padding="sm" class="flex items-center gap-3 text-sm">
			<AlertTriangle class="h-4 w-4" />
			<span>{error}</span>
		</AdminCard>
	{/if}

	{#if loading}
		<AdminCard padding="md" class="flex items-center gap-3 text-sm text-slate-500">
			<RefreshCw class="h-4 w-4 animate-spin" />
			<span>Loading security logs...</span>
		</AdminCard>
	{:else if securityLogs.length > 0}
		<AdminCard padding="none" class="overflow-hidden">
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
					<thead class="bg-slate-50/80 dark:bg-slate-900/40">
						<tr
							class="text-left text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-slate-500"
						>
							<th class="px-5 py-3">Time</th>
							<th class="px-5 py-3">User ID</th>
							<th class="px-5 py-3">Event</th>
							<th class="px-5 py-3">Status</th>
							<th class="px-5 py-3">Patterns</th>
							<th class="px-5 py-3">LLM Confidence</th>
							<th class="px-5 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-200 dark:divide-slate-800">
						{#each securityLogs as log}
							<tr class="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
								<td
									class="whitespace-nowrap px-5 py-3 text-sm text-slate-600 dark:text-slate-300"
								>
									{formatDate(log.created_at)}
								</td>
								<td
									class="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400"
								>
									{log.user_id.slice(0, 8)}...
								</td>
								<td class="px-5 py-3">
									<Badge size="sm" variant={eventBadgeVariant(log.event_type)}>
										{formatEventType(log.event_type)}
									</Badge>
								</td>
								<td class="px-5 py-3">
									<Badge
										size="sm"
										variant={log.was_blocked ? 'error' : 'success'}
									>
										{log.was_blocked ? 'Blocked' : 'Allowed'}
									</Badge>
								</td>
								<td class="px-5 py-3">
									{#if log.regex_patterns && log.regex_patterns.length > 0}
										<div class="flex flex-wrap gap-1.5">
											{#each log.regex_patterns.slice(0, 2) as pattern}
												<Badge
													size="sm"
													variant={severityBadgeVariant(pattern.severity)}
												>
													{pattern.severity}
												</Badge>
											{/each}
											{#if log.regex_patterns.length > 2}
												<Badge size="sm" variant="info">
													+{log.regex_patterns.length - 2}
												</Badge>
											{/if}
										</div>
									{:else}
										<span class="text-slate-400">—</span>
									{/if}
								</td>
								<td class="px-5 py-3">
									{#if log.llm_validation}
										<Badge
											size="sm"
											variant={severityBadgeVariant(
												log.llm_validation.confidence
											)}
										>
											{log.llm_validation.confidence}
										</Badge>
									{:else}
										<span class="text-slate-400">N/A</span>
									{/if}
								</td>
								<td class="px-5 py-3 text-right">
									<Button
										variant="ghost"
										size="sm"
										on:click={() => viewDetails(log)}
									>
										View
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</AdminCard>
	{:else}
		<AdminCard padding="lg" class="text-center text-sm text-slate-500">
			<p>No security logs found for the selected filters.</p>
		</AdminCard>
	{/if}

	{#if selectedLog}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur"
		>
			<div class="admin-panel w-full max-w-4xl overflow-y-auto p-6">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
							Log Detail
						</p>
						<h3 class="text-lg font-semibold text-slate-900 dark:text-white">
							{formatEventType(selectedLog.event_type)}
						</h3>
					</div>
					<Button variant="ghost" size="sm" on:click={closeDetails}>Close</Button>
				</div>

				<div class="mt-6 space-y-5 text-sm">
					<div
						class="grid gap-4 rounded-lg bg-slate-100/60 p-4 dark:bg-slate-900/40 sm:grid-cols-2"
					>
						<div>
							<p class="text-xs uppercase text-slate-500">Time</p>
							<p class="font-semibold text-slate-900 dark:text-white">
								{formatDate(selectedLog.created_at)}
							</p>
						</div>
						<div>
							<p class="text-xs uppercase text-slate-500">User ID</p>
							<p class="font-mono text-xs text-slate-600 dark:text-slate-300">
								{selectedLog.user_id}
							</p>
						</div>
						<div>
							<p class="text-xs uppercase text-slate-500">Status</p>
							<Badge
								size="sm"
								variant={selectedLog.was_blocked ? 'error' : 'success'}
							>
								{selectedLog.was_blocked ? 'Blocked' : 'Allowed'}
							</Badge>
						</div>
						{#if selectedLog.regex_patterns?.length}
							<div>
								<p class="text-xs uppercase text-slate-500">Patterns</p>
								<div class="mt-1 flex flex-wrap gap-1.5">
									{#each selectedLog.regex_patterns as pattern}
										<Badge
											size="sm"
											variant={severityBadgeVariant(pattern.severity)}
										>
											{pattern.severity}
										</Badge>
									{/each}
								</div>
							</div>
						{/if}
					</div>

					<div class="space-y-2">
						<p class="text-xs uppercase text-slate-500">Flagged Content</p>
						<div
							class="rounded-lg bg-slate-900/5 p-4 text-xs font-mono dark:bg-slate-100/5"
						>
							<pre class="whitespace-pre-wrap">{selectedLog.content}</pre>
						</div>
					</div>

					{#if selectedLog.llm_validation}
						<div class="space-y-2">
							<p class="text-xs uppercase text-slate-500">LLM Validation</p>
							<div
								class="space-y-2 rounded-lg bg-slate-100/60 p-4 dark:bg-slate-900/40"
							>
								<div class="flex items-center gap-2">
									<span class="font-medium">Is Malicious:</span>
									<Badge
										size="sm"
										variant={selectedLog.llm_validation.isMalicious
											? 'error'
											: 'success'}
									>
										{selectedLog.llm_validation.isMalicious ? 'Yes' : 'No'}
									</Badge>
								</div>
								<div class="flex items-center gap-2">
									<span class="font-medium">Confidence:</span>
									<Badge
										size="sm"
										variant={severityBadgeVariant(
											selectedLog.llm_validation.confidence
										)}
									>
										{selectedLog.llm_validation.confidence}
									</Badge>
								</div>
								<div>
									<span class="font-medium">Reason:</span>
									<p
										class="mt-1 leading-relaxed text-slate-600 dark:text-slate-300"
									>
										{selectedLog.llm_validation.reason}
									</p>
								</div>
								{#if selectedLog.llm_validation.matchedPatterns?.length}
									<div>
										<span class="font-medium">Matched Patterns:</span>
										<ul
											class="mt-1 list-disc pl-5 text-slate-600 dark:text-slate-300"
										>
											{#each selectedLog.llm_validation.matchedPatterns as pattern}
												<li>{pattern}</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						</div>
					{/if}

					{#if selectedLog.metadata}
						<div class="space-y-2">
							<p class="text-xs uppercase text-slate-500">Metadata</p>
							<div
								class="rounded-lg bg-slate-900/5 p-4 text-xs font-mono dark:bg-slate-100/5"
							>
								<pre class="whitespace-pre-wrap">{JSON.stringify(
										selectedLog.metadata,
										null,
										2
									)}</pre>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
type BadgeVariant = 'success' | 'warning' | 'error' | 'info';
