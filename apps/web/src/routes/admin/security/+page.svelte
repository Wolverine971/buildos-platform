<!-- apps/web/src/routes/admin/security/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
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

	function getEventBadgeClass(eventType: string): string {
		switch (eventType) {
			case 'prompt_injection_blocked':
				return 'badge-error';
			case 'prompt_injection_detected':
				return 'badge-warning';
			case 'prompt_injection_false_positive':
				return 'badge-success';
			case 'rate_limit_exceeded':
				return 'badge-error';
			default:
				return 'badge-neutral';
		}
	}

	function getSeverityBadgeClass(severity: string): string {
		switch (severity) {
			case 'high':
				return 'badge-error';
			case 'medium':
				return 'badge-warning';
			case 'low':
				return 'badge-info';
			default:
				return 'badge-neutral';
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

<div class="container mx-auto p-6">
	<h1 class="text-3xl font-bold mb-4">Security Logs</h1>

	<!-- Filters -->
	<div class="card bg-base-200 p-4 mb-4">
		<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
			<div class="form-control">
				<label class="label" for="eventType">
					<span class="label-text">Event Type</span>
				</label>
				<select
					id="eventType"
					class="select select-bordered"
					bind:value={eventTypeFilter}
					onchange={applyFilters}
				>
					<option value="all">All Events</option>
					<option value="prompt_injection_blocked">Blocked</option>
					<option value="prompt_injection_detected">Detected</option>
					<option value="prompt_injection_false_positive">False Positives</option>
					<option value="rate_limit_exceeded">Rate Limit Exceeded</option>
				</select>
			</div>

			<div class="form-control">
				<label class="label" for="wasBlocked">
					<span class="label-text">Status</span>
				</label>
				<select
					id="wasBlocked"
					class="select select-bordered"
					bind:value={wasBlockedFilter}
					onchange={applyFilters}
				>
					<option value="all">All</option>
					<option value="true">Blocked</option>
					<option value="false">Allowed</option>
				</select>
			</div>

			<div class="form-control">
				<label class="label" for="dateFilter">
					<span class="label-text">Time Period</span>
				</label>
				<select
					id="dateFilter"
					class="select select-bordered"
					bind:value={dateFilter}
					onchange={applyFilters}
				>
					<option value="24hours">Last 24 Hours</option>
					<option value="7days">Last 7 Days</option>
					<option value="30days">Last 30 Days</option>
					<option value="all">All Time</option>
				</select>
			</div>

			<div class="form-control">
				<label class="label">
					<span class="label-text">&nbsp;</span>
				</label>
				<button class="btn btn-primary" onclick={applyFilters}>Refresh</button>
			</div>
		</div>
	</div>

	<!-- Loading State -->
	{#if loading}
		<div class="flex justify-center items-center py-12">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{/if}

	<!-- Error State -->
	{#if error}
		<div class="alert alert-error mb-4">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="stroke-current shrink-0 h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>{error}</span>
		</div>
	{/if}

	<!-- Security Logs Table -->
	{#if !loading && securityLogs.length > 0}
		<div class="overflow-x-auto">
			<table class="table table-zebra w-full">
				<thead>
					<tr>
						<th>Time</th>
						<th>User ID</th>
						<th>Event Type</th>
						<th>Status</th>
						<th>Patterns</th>
						<th>LLM Confidence</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each securityLogs as log}
						<tr>
							<td class="text-sm">{formatDate(log.created_at)}</td>
							<td class="font-mono text-xs">{log.user_id.slice(0, 8)}...</td>
							<td>
								<span class="badge {getEventBadgeClass(log.event_type)}">
									{formatEventType(log.event_type)}
								</span>
							</td>
							<td>
								{#if log.was_blocked}
									<span class="badge badge-error">Blocked</span>
								{:else}
									<span class="badge badge-success">Allowed</span>
								{/if}
							</td>
							<td>
								{#if log.regex_patterns && log.regex_patterns.length > 0}
									<div class="flex gap-1 flex-wrap">
										{#each log.regex_patterns.slice(0, 2) as pattern}
											<span
												class="badge {getSeverityBadgeClass(
													pattern.severity
												)} badge-sm"
											>
												{pattern.severity}
											</span>
										{/each}
										{#if log.regex_patterns.length > 2}
											<span class="badge badge-sm"
												>+{log.regex_patterns.length - 2}</span
											>
										{/if}
									</div>
								{:else}
									<span class="text-gray-500">-</span>
								{/if}
							</td>
							<td>
								{#if log.llm_validation}
									<span
										class="badge {getSeverityBadgeClass(
											log.llm_validation.confidence
										)}"
									>
										{log.llm_validation.confidence}
									</span>
								{:else}
									<span class="text-gray-500">N/A</span>
								{/if}
							</td>
							<td>
								<button
									class="btn btn-sm btn-ghost"
									onclick={() => viewDetails(log)}
								>
									View
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if !loading}
		<div class="text-center py-12 text-gray-500">
			<p>No security logs found for the selected filters.</p>
		</div>
	{/if}

	<!-- Detail Modal -->
	{#if selectedLog}
		<div class="modal modal-open">
			<div class="modal-box max-w-4xl">
				<h3 class="font-bold text-lg mb-4">Security Log Details</h3>

				<div class="space-y-4">
					<!-- Event Info -->
					<div>
						<h4 class="font-semibold mb-2">Event Information</h4>
						<div class="grid grid-cols-2 gap-2 text-sm">
							<div>
								<span class="font-medium">Event Type:</span>
								{formatEventType(selectedLog.event_type)}
							</div>
							<div>
								<span class="font-medium">Time:</span>
								{formatDate(selectedLog.created_at)}
							</div>
							<div>
								<span class="font-medium">User ID:</span>
								{selectedLog.user_id}
							</div>
							<div>
								<span class="font-medium">Status:</span>
								{selectedLog.was_blocked ? 'Blocked' : 'Allowed'}
							</div>
						</div>
					</div>

					<!-- Flagged Content -->
					<div>
						<h4 class="font-semibold mb-2">Flagged Content</h4>
						<div class="bg-base-200 p-3 rounded max-h-48 overflow-y-auto">
							<pre class="text-sm whitespace-pre-wrap">{selectedLog.content}</pre>
						</div>
					</div>

					<!-- Regex Patterns -->
					{#if selectedLog.regex_patterns && selectedLog.regex_patterns.length > 0}
						<div>
							<h4 class="font-semibold mb-2">
								Detected Patterns ({selectedLog.regex_patterns.length})
							</h4>
							<div class="space-y-2">
								{#each selectedLog.regex_patterns as pattern}
									<div class="bg-base-200 p-2 rounded text-sm">
										<div class="flex justify-between items-start mb-1">
											<span class="font-medium">{pattern.pattern}</span>
											<span
												class="badge {getSeverityBadgeClass(
													pattern.severity
												)} badge-sm"
											>
												{pattern.severity}
											</span>
										</div>
										<div class="text-xs text-gray-600">
											Matched: "{pattern.matchedText}" at position {pattern.position}
										</div>
										<div class="text-xs text-gray-500">
											Category: {pattern.category}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- LLM Validation -->
					{#if selectedLog.llm_validation}
						<div>
							<h4 class="font-semibold mb-2">LLM Validation Result</h4>
							<div class="bg-base-200 p-3 rounded space-y-2 text-sm">
								<div>
									<span class="font-medium">Is Malicious:</span>
									{selectedLog.llm_validation.isMalicious ? 'Yes' : 'No'}
								</div>
								<div>
									<span class="font-medium">Confidence:</span>
									<span
										class="badge {getSeverityBadgeClass(
											selectedLog.llm_validation.confidence
										)}"
									>
										{selectedLog.llm_validation.confidence}
									</span>
								</div>
								<div>
									<span class="font-medium">Reason:</span>
									<p class="mt-1">{selectedLog.llm_validation.reason}</p>
								</div>
								{#if selectedLog.llm_validation.matchedPatterns && selectedLog.llm_validation.matchedPatterns.length > 0}
									<div>
										<span class="font-medium">Matched Injection Patterns:</span>
										<ul class="list-disc list-inside mt-1">
											{#each selectedLog.llm_validation.matchedPatterns as pattern}
												<li>{pattern}</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Metadata -->
					{#if selectedLog.metadata}
						<div>
							<h4 class="font-semibold mb-2">Additional Metadata</h4>
							<div class="bg-base-200 p-3 rounded">
								<pre class="text-xs">{JSON.stringify(
										selectedLog.metadata,
										null,
										2
									)}</pre>
							</div>
						</div>
					{/if}
				</div>

				<div class="modal-action">
					<button class="btn" onclick={closeDetails}>Close</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.badge {
		@apply text-xs font-semibold px-2 py-1 rounded;
	}

	.badge-error {
		@apply bg-red-100 text-red-800;
	}

	.badge-warning {
		@apply bg-yellow-100 text-yellow-800;
	}

	.badge-success {
		@apply bg-green-100 text-green-800;
	}

	.badge-info {
		@apply bg-blue-100 text-blue-800;
	}

	.badge-neutral {
		@apply bg-gray-100 text-gray-800;
	}
</style>
