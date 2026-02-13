<!-- apps/web/src/lib/components/admin/notifications/LogEventTable.svelte -->
<script lang="ts">
	import { Eye, RotateCw, ChevronDown, ChevronRight } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface NotificationEvent {
		id: string;
		event_type: string;
		event_source: string;
		actor_user_id: string;
		payload: Record<string, any>;
		metadata?: Record<string, any>;
		created_at: string;
		users?: {
			id: string;
			email: string;
			name?: string;
		};
		delivery_count: number;
		status_breakdown: Record<string, number>;
	}

	interface Props {
		events: NotificationEvent[];
		loading?: boolean;
		onViewDetails?: (eventId: string) => void;
		onRetry?: (eventId: string) => void;
	}

	let { events, loading = false, onViewDetails, onRetry }: Props = $props();

	let expandedRows = $state<Set<string>>(new Set());

	function toggleRow(eventId: string) {
		const newExpanded = new Set(expandedRows);
		if (newExpanded.has(eventId)) {
			newExpanded.delete(eventId);
		} else {
			newExpanded.add(eventId);
		}
		expandedRows = newExpanded;
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleString();
	}

	function formatEventType(eventType: string): string {
		return eventType
			.replace(/_/g, ' ')
			.split(' ')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	function getEventTypeBadgeColor(eventType: string): string {
		if (eventType.includes('brief'))
			return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
		if (eventType.includes('task'))
			return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
		if (eventType.includes('project'))
			return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
		if (eventType.includes('system'))
			return 'bg-muted text-foreground dark:text-muted-foreground';
		return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
	}

	function getStatusBadgeColor(status: string): string {
		const statusColors: Record<string, string> = {
			pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
			sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
			delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
			failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
			bounced: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
			opened: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
			clicked: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
		};
		return statusColors[status] || 'bg-muted text-foreground';
	}
</script>

<div class="bg-card rounded-lg shadow overflow-hidden">
	{#if loading}
		<div class="p-6 space-y-3">
			{#each Array(5) as _}
				<div class="animate-pulse">
					<div class="h-16 bg-muted rounded"></div>
				</div>
			{/each}
		</div>
	{:else if events.length === 0}
		<div class="p-6 text-center text-muted-foreground">No events found</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
				<thead class="bg-muted">
					<tr>
						<th class="px-6 py-3 w-8"></th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Event Type
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							User
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Deliveries
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Status Breakdown
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Created At
						</th>
						<th
							class="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Actions
						</th>
					</tr>
				</thead>
				<tbody
					class="bg-card divide-y divide-gray-200 dark:divide-gray-700"
				>
					{#each events as event}
						<tr class="hover:bg-muted transition-colors">
							<td class="px-6 py-4">
								<button
									onclick={() => toggleRow(event.id)}
									class="text-muted-foreground hover:text-muted-foreground dark:hover:text-muted-foreground"
								>
									{#if expandedRows.has(event.id)}
										<ChevronDown class="w-4 h-4" />
									{:else}
										<ChevronRight class="w-4 h-4" />
									{/if}
								</button>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<span
									class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getEventTypeBadgeColor(
										event.event_type
									)}"
								>
									{formatEventType(event.event_type)}
								</span>
							</td>
							<td
								class="px-6 py-4 whitespace-nowrap text-sm text-foreground"
							>
								{#if event.users}
									<div>
										<div class="font-medium">
											{event.users.name || 'N/A'}
										</div>
										<div class="text-xs text-muted-foreground">{event.users.email}</div>
									</div>
								{:else}
									<span class="text-muted-foreground">N/A</span>
								{/if}
							</td>
							<td
								class="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground"
							>
								{event.delivery_count}
							</td>
							<td class="px-6 py-4">
								<div class="flex flex-wrap gap-1">
									{#each Object.entries(event.status_breakdown) as [status, count]}
										<span
											class="inline-flex items-center px-2 py-0.5 rounded text-xs {getStatusBadgeColor(
												status
											)}"
										>
											{status}: {count}
										</span>
									{/each}
								</div>
							</td>
							<td
								class="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground"
							>
								{formatDate(event.created_at)}
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
								<div class="flex justify-end space-x-2">
									{#if onViewDetails}
										<Button
											size="sm"
											variant="ghost"
											onclick={() => onViewDetails?.(event.id)}
											icon={Eye}
										>
											View
										</Button>
									{/if}
									{#if onRetry}
										<Button
											size="sm"
											variant="ghost"
											onclick={() => onRetry?.(event.id)}
											icon={RotateCw}
										>
											Retry
										</Button>
									{/if}
								</div>
							</td>
						</tr>

						<!-- Expanded Row - Payload Details -->
						{#if expandedRows.has(event.id)}
							<tr class="bg-muted">
								<td colspan="7" class="px-6 py-4">
									<div class="space-y-2">
										<div
											class="text-sm font-medium text-foreground"
										>
											Payload:
										</div>
										<pre
											class="bg-card border border-border rounded p-3 text-xs overflow-x-auto">{JSON.stringify(
												event.payload,
												null,
												2
											)}</pre>
										{#if event.metadata && Object.keys(event.metadata).length > 0}
											<div
												class="text-sm font-medium text-foreground"
											>
												Metadata:
											</div>
											<pre
												class="bg-card border border-border rounded p-3 text-xs overflow-x-auto">{JSON.stringify(
													event.metadata,
													null,
													2
												)}</pre>
										{/if}
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
