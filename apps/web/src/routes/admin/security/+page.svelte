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
				<label
					for="security-event-type-filter"
					class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
				>
					Event Type
				</label>
				<Select
					id="security-event-type-filter"
					bind:value={eventTypeFilter}
					size="md"
					onchange={applyFilters}
				>
					<option value="all">All Events</option>
					<option value="prompt_injection_blocked">Blocked</option>
					<option value="prompt_injection_detected">Detected</option>
					<option value="prompt_injection_false_positive">False Positives</option>
					<option value="rate_limit_exceeded">Rate Limit Exceeded</option>
				</Select>
			</div>

			<div class="space-y-2">
				<label
					for="security-status-filter"
					class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
				>
					Status
				</label>
				<Select
					id="security-status-filter"
					bind:value={wasBlockedFilter}
					size="md"
					onchange={applyFilters}
				>
					<option value="all">All</option>
					<option value="true">Blocked</option>
					<option value="false">Allowed</option>
				</Select>
			</div>

			<div class="space-y-2">
				<label
					for="security-date-filter"
					class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
				>
					Time Period
				</label>
				<Select
					id="security-date-filter"
					bind:value={dateFilter}
					size="md"
					onchange={applyFilters}
				>
					<option value="24hours">Last 24 Hours</option>
					<option value="7days">Last 7 Days</option>
					<option value="30days">Last 30 Days</option>
					<option value="all">All Time</option>
				</Select>
			</div>

			<div class="flex items-end">
				<Button variant="secondary" size="sm" icon={RefreshCw} onclick={applyFilters}>
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
		<AdminCard padding="md" class="flex items-center gap-3 text-sm text-muted-foreground">
			<RefreshCw class="h-4 w-4 animate-spin" />
			<span>Loading security logs...</span>
		</AdminCard>
	{:else if securityLogs.length > 0}
		<AdminCard padding="none" class="overflow-hidden">
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
					<thead class="bg-slate-50/80/40">
						<tr
							class="text-left text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-muted-foreground"
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
									class="whitespace-nowrap px-5 py-3 text-sm text-muted-foreground"
								>
									{formatDate(log.created_at)}
								</td>
								<td class="px-5 py-3 font-mono text-xs text-muted-foreground">
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
										<span class="text-muted-foreground">—</span>
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
										<span class="text-muted-foreground">N/A</span>
									{/if}
								</td>
								<td class="px-5 py-3 text-right">
									<Button
										variant="ghost"
										size="sm"
										onclick={() => viewDetails(log)}
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
		<AdminCard padding="lg" class="text-center text-sm text-muted-foreground">
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
						<p
							class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
						>
							Log Detail
						</p>
						<h3 class="text-lg font-semibold text-foreground">
							{formatEventType(selectedLog.event_type)}
						</h3>
					</div>
					<Button variant="ghost" size="sm" onclick={closeDetails}>Close</Button>
				</div>

				<div class="mt-6 space-y-5 text-sm">
					<div class="grid gap-4 rounded-lg bg-slate-100/60 p-4/40 sm:grid-cols-2">
						<div>
							<p class="text-xs uppercase text-muted-foreground">Time</p>
							<p class="font-semibold text-foreground">
								{formatDate(selectedLog.created_at)}
							</p>
						</div>
						<div>
							<p class="text-xs uppercase text-muted-foreground">User ID</p>
							<p class="font-mono text-xs text-muted-foreground">
								{selectedLog.user_id}
							</p>
						</div>
						<div>
							<p class="text-xs uppercase text-muted-foreground">Status</p>
							<Badge
								size="sm"
								variant={selectedLog.was_blocked ? 'error' : 'success'}
							>
								{selectedLog.was_blocked ? 'Blocked' : 'Allowed'}
							</Badge>
						</div>
						{#if selectedLog.regex_patterns?.length}
							<div>
								<p class="text-xs uppercase text-muted-foreground">Patterns</p>
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
						<p class="text-xs uppercase text-muted-foreground">Flagged Content</p>
						<div class="rounded-lg bg-slate-900/5 p-4 text-xs font-mono/5">
							<pre class="whitespace-pre-wrap">{selectedLog.content}</pre>
						</div>
					</div>

					{#if selectedLog.llm_validation}
						<div class="space-y-2">
							<p class="text-xs uppercase text-muted-foreground">LLM Validation</p>
							<div class="space-y-2 rounded-lg bg-slate-100/60 p-4/40">
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
									<p class="mt-1 leading-relaxed text-muted-foreground">
										{selectedLog.llm_validation.reason}
									</p>
								</div>
								{#if selectedLog.llm_validation.matchedPatterns?.length}
									<div>
										<span class="font-medium">Matched Patterns:</span>
										<ul class="mt-1 list-disc pl-5 text-muted-foreground">
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
							<p class="text-xs uppercase text-muted-foreground">Metadata</p>
							<div class="rounded-lg bg-slate-900/5 p-4 text-xs font-mono/5">
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
