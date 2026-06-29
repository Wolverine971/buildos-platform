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

	let hasActions = $derived(!!(onViewDetails || onRetry));

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

	function getEventTypeBadgeColor(_eventType: string): string {
		// Event type is a category, not a state — use a single neutral badge.
		return 'bg-muted text-foreground dark:text-muted-foreground';
	}

	function getStatusBadgeColor(status: string): string {
		const statusColors: Record<string, string> = {
			pending: 'bg-warning/10 text-warning',
			sent: 'bg-info/10 text-info',
			delivered: 'bg-success/10 text-success',
			failed: 'bg-destructive/10 text-destructive',
			bounced: 'bg-accent/10 text-accent',
			opened: 'bg-info/10 text-info',
			clicked: 'bg-accent/10 text-accent'
		};
		return statusColors[status] || 'bg-muted text-foreground';
	}
</script>

<div class="bg-card rounded-lg shadow-ink border border-border overflow-hidden">
	{#if loading}
		<div class="p-3 space-y-2">
			{#each Array(5) as _}
				<div class="animate-pulse motion-reduce:animate-none">
					<div class="h-16 bg-muted rounded-md"></div>
				</div>
			{/each}
		</div>
	{:else if events.length === 0}
		<div class="p-4 text-center text-sm text-muted-foreground">No events found</div>
	{:else}
		<!-- Mobile card list -->
		<div class="block lg:hidden divide-y divide-border">
			{#each events as event (event.id)}
				<div class="p-3 space-y-3">
					<div class="flex items-start justify-between gap-2">
						<span
							class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getEventTypeBadgeColor(
								event.event_type
							)}"
						>
							{formatEventType(event.event_type)}
						</span>
						<button
							type="button"
							onclick={() => toggleRow(event.id)}
							class="rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-shrink-0"
							aria-label={expandedRows.has(event.id)
								? 'Collapse payload'
								: 'Expand payload'}
						>
							{#if expandedRows.has(event.id)}
								<ChevronDown class="w-5 h-5" />
							{:else}
								<ChevronRight class="w-5 h-5" />
							{/if}
						</button>
					</div>
					<div class="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
						<div>
							<div class="text-xs text-muted-foreground uppercase tracking-wider">
								User
							</div>
							{#if event.users}
								<div class="font-medium text-foreground">
									{event.users.name || 'N/A'}
								</div>
								<div class="text-xs text-muted-foreground truncate">
									{event.users.email}
								</div>
							{:else}
								<div class="text-muted-foreground">N/A</div>
							{/if}
						</div>
						<div>
							<div class="text-xs text-muted-foreground uppercase tracking-wider">
								Deliveries
							</div>
							<div class="font-medium text-foreground">{event.delivery_count}</div>
						</div>
						<div class="col-span-2">
							<div
								class="text-xs text-muted-foreground uppercase tracking-wider mb-1"
							>
								Status Breakdown
							</div>
							<div class="flex flex-wrap gap-1">
								{#each Object.entries(event.status_breakdown) as [status, count]}
									<span
										class="inline-flex items-center px-2 py-0.5 rounded-md text-xs {getStatusBadgeColor(
											status
										)}"
									>
										{status}: {count}
									</span>
								{/each}
							</div>
						</div>
						<div class="col-span-2">
							<div class="text-xs text-muted-foreground uppercase tracking-wider">
								Created At
							</div>
							<div class="text-muted-foreground">{formatDate(event.created_at)}</div>
						</div>
					</div>
					{#if expandedRows.has(event.id)}
						<div class="space-y-2">
							<div class="text-sm font-medium text-foreground">Payload:</div>
							<pre
								class="bg-card border border-border rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(
									event.payload,
									null,
									2
								)}</pre>
							{#if event.metadata && Object.keys(event.metadata).length > 0}
								<div class="text-sm font-medium text-foreground">Metadata:</div>
								<pre
									class="bg-card border border-border rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(
										event.metadata,
										null,
										2
									)}</pre>
							{/if}
						</div>
					{/if}
					{#if hasActions}
						<div class="flex flex-wrap gap-2">
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
					{/if}
				</div>
			{/each}
		</div>

		<!-- Desktop table -->
		<div class="hidden lg:block overflow-x-auto">
			<table class="min-w-full divide-y divide-border">
				<thead class="bg-muted">
					<tr>
						<th class="px-3 py-2 w-8"></th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Event Type
						</th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							User
						</th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Deliveries
						</th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Status Breakdown
						</th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Created At
						</th>
						{#if hasActions}
							<th
								class="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider"
							>
								Actions
							</th>
						{/if}
					</tr>
				</thead>
				<tbody class="bg-card divide-y divide-border">
					{#each events as event (event.id)}
						<tr class="hover:bg-muted transition-colors">
							<td class="px-3 py-2.5">
								<button
									type="button"
									onclick={() => toggleRow(event.id)}
									class="rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									{#if expandedRows.has(event.id)}
										<ChevronDown class="w-4 h-4" />
									{:else}
										<ChevronRight class="w-4 h-4" />
									{/if}
								</button>
							</td>
							<td class="px-3 py-2.5 whitespace-nowrap">
								<span
									class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getEventTypeBadgeColor(
										event.event_type
									)}"
								>
									{formatEventType(event.event_type)}
								</span>
							</td>
							<td class="px-3 py-2.5 whitespace-nowrap text-sm text-foreground">
								{#if event.users}
									<div>
										<div class="font-medium">
											{event.users.name || 'N/A'}
										</div>
										<div class="text-xs text-muted-foreground">
											{event.users.email}
										</div>
									</div>
								{:else}
									<span class="text-muted-foreground">N/A</span>
								{/if}
							</td>
							<td
								class="px-3 py-2.5 whitespace-nowrap text-sm font-medium text-foreground"
							>
								{event.delivery_count}
							</td>
							<td class="px-3 py-2.5">
								<div class="flex flex-wrap gap-1">
									{#each Object.entries(event.status_breakdown) as [status, count]}
										<span
											class="inline-flex items-center px-2 py-0.5 rounded-md text-xs {getStatusBadgeColor(
												status
											)}"
										>
											{status}: {count}
										</span>
									{/each}
								</div>
							</td>
							<td class="px-3 py-2.5 whitespace-nowrap text-sm text-muted-foreground">
								{formatDate(event.created_at)}
							</td>
							{#if hasActions}
								<td
									class="px-3 py-2.5 whitespace-nowrap text-right text-sm font-medium"
								>
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
							{/if}
						</tr>

						<!-- Expanded Row - Payload Details -->
						{#if expandedRows.has(event.id)}
							<tr class="bg-muted">
								<td colspan="7" class="px-3 py-2.5">
									<div class="space-y-2">
										<div class="text-sm font-medium text-foreground">
											Payload:
										</div>
										<pre
											class="bg-card border border-border rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(
												event.payload,
												null,
												2
											)}</pre>
										{#if event.metadata && Object.keys(event.metadata).length > 0}
											<div class="text-sm font-medium text-foreground">
												Metadata:
											</div>
											<pre
												class="bg-card border border-border rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(
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
