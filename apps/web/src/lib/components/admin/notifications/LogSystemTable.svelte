<!-- apps/web/src/lib/components/admin/notifications/LogSystemTable.svelte -->
<script lang="ts">
	import {
		Eye,
		Copy,
		ChevronDown,
		ChevronRight,
		AlertCircle,
		Info,
		AlertTriangle,
		XCircle,
		Bug
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

	type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

	interface SystemLog {
		id: string;
		correlation_id: string;
		request_id: string | null;
		user_id: string | null;
		notification_event_id: string | null;
		notification_delivery_id: string | null;
		level: LogLevel;
		message: string;
		namespace: string | null;
		metadata: Record<string, any> | null;
		error_stack: string | null;
		created_at: string;
		users?: {
			id: string;
			email: string;
			name?: string;
		} | null;
		notification_events?: {
			id: string;
			event_type: string;
		} | null;
		notification_deliveries?: {
			id: string;
			channel: string;
			status: string;
		} | null;
	}

	interface Props {
		logs: SystemLog[];
		loading?: boolean;
		onViewCorrelation?: (correlationId: string) => void;
		onCopyCorrelationId?: (correlationId: string) => void;
	}

	let { logs, loading = false, onViewCorrelation, onCopyCorrelationId }: Props = $props();

	let expandedRows = $state<Set<string>>(new Set());

	function toggleRow(logId: string) {
		const newExpanded = new Set(expandedRows);
		if (newExpanded.has(logId)) {
			newExpanded.delete(logId);
		} else {
			newExpanded.add(logId);
		}
		expandedRows = newExpanded;
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleTimeString() + ' ' + date.toLocaleDateString();
	}

	function formatShortDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleTimeString();
	}

	function getLevelIcon(level: LogLevel) {
		switch (level) {
			case 'debug':
				return Bug;
			case 'info':
				return Info;
			case 'warn':
				return AlertTriangle;
			case 'error':
				return AlertCircle;
			case 'fatal':
				return XCircle;
			default:
				return Info;
		}
	}

	function getLevelColor(level: LogLevel): string {
		switch (level) {
			case 'debug':
				return 'bg-muted text-foreground dark:text-muted-foreground';
			case 'info':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
			case 'warn':
				return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
			case 'error':
				return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
			case 'fatal':
				return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
			default:
				return 'bg-muted text-foreground';
		}
	}

	function getLevelTextColor(level: LogLevel): string {
		switch (level) {
			case 'debug':
				return 'text-muted-foreground';
			case 'info':
				return 'text-blue-600 dark:text-blue-400';
			case 'warn':
				return 'text-yellow-600 dark:text-yellow-400';
			case 'error':
				return 'text-red-600 dark:text-red-400';
			case 'fatal':
				return 'text-purple-600 dark:text-purple-400';
			default:
				return 'text-muted-foreground';
		}
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		onCopyCorrelationId?.(text);
	}

	function truncateCorrelationId(id: string): string {
		return id.substring(0, 8) + '...' + id.substring(id.length - 4);
	}
</script>

<div class="bg-card rounded-lg shadow overflow-hidden">
	{#if loading}
		<div class="p-6 space-y-3">
			{#each Array(10) as _}
				<div class="animate-pulse">
					<div class="h-12 bg-muted rounded"></div>
				</div>
			{/each}
		</div>
	{:else if logs.length === 0}
		<div class="p-6 text-center text-muted-foreground">No system logs found</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
				<thead class="bg-muted">
					<tr>
						<th class="px-4 py-3 w-8"></th>
						<th
							class="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Time
						</th>
						<th
							class="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Level
						</th>
						<th
							class="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Namespace
						</th>
						<th
							class="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Message
						</th>
						<th
							class="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Correlation ID
						</th>
						<th
							class="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="bg-card divide-y divide-gray-200 dark:divide-gray-700">
					{#each logs as log}
						{@const Level = getLevelIcon(log.level)}
						<tr
							class="hover:bg-muted transition-colors {log.level === 'error' ||
							log.level === 'fatal'
								? 'bg-red-50 dark:bg-red-950'
								: ''}"
						>
							<td class="px-4 py-3">
								<button
									onclick={() => toggleRow(log.id)}
									class="text-muted-foreground hover:text-muted-foreground dark:hover:text-muted-foreground"
								>
									{#if expandedRows.has(log.id)}
										<ChevronDown class="w-4 h-4" />
									{:else}
										<ChevronRight class="w-4 h-4" />
									{/if}
								</button>
							</td>
							<td
								class="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground"
								title={formatDate(log.created_at)}
							>
								{formatShortDate(log.created_at)}
							</td>
							<td class="px-4 py-3 whitespace-nowrap">
								<div class="flex items-center space-x-1">
									<Level class="w-4 h-4 {getLevelTextColor(log.level)}" />
									<span
										class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {getLevelColor(
											log.level
										)}"
									>
										{log.level.toUpperCase()}
									</span>
								</div>
							</td>
							<td class="px-4 py-3 text-xs font-mono text-muted-foreground">
								{log.namespace || 'N/A'}
							</td>
							<td class="px-4 py-3 text-sm text-foreground max-w-md">
								<div class="truncate" title={log.message}>
									{log.message}
								</div>
								{#if log.error_stack}
									<div class="text-xs text-red-600 dark:text-red-400 mt-1">
										Error: Click to view stack trace
									</div>
								{/if}
							</td>
							<td class="px-4 py-3 whitespace-nowrap">
								<button
									onclick={() => copyToClipboard(log.correlation_id)}
									class="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline"
									title="Click to copy: {log.correlation_id}"
								>
									{truncateCorrelationId(log.correlation_id)}
								</button>
							</td>
							<td class="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
								<div class="flex justify-end space-x-2">
									{#if onViewCorrelation}
										<Button
											size="sm"
											variant="ghost"
											onclick={() => onViewCorrelation?.(log.correlation_id)}
											icon={Eye}
										>
											View
										</Button>
									{/if}
									<Button
										size="sm"
										variant="ghost"
										onclick={() => copyToClipboard(log.correlation_id)}
										icon={Copy}
									>
										Copy
									</Button>
								</div>
							</td>
						</tr>

						<!-- Expanded Row - Full Context -->
						{#if expandedRows.has(log.id)}
							<tr class="bg-muted">
								<td colspan="7" class="px-4 py-4">
									<div class="space-y-3">
										<!-- Full Message -->
										<div>
											<div class="text-xs font-medium text-foreground mb-1">
												Message:
											</div>
											<div class="text-sm text-foreground">
												{log.message}
											</div>
										</div>

										<!-- Context Information -->
										<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
											<div>
												<div
													class="text-xs font-medium text-foreground mb-1"
												>
													User:
												</div>
												<div class="text-xs text-muted-foreground">
													{log.users?.name || log.users?.email || 'N/A'}
												</div>
											</div>
											<div>
												<div
													class="text-xs font-medium text-foreground mb-1"
												>
													Event ID:
												</div>
												<div
													class="text-xs font-mono text-muted-foreground"
												>
													{log.notification_event_id
														? truncateCorrelationId(
																log.notification_event_id
															)
														: 'N/A'}
												</div>
											</div>
											<div>
												<div
													class="text-xs font-medium text-foreground mb-1"
												>
													Delivery ID:
												</div>
												<div
													class="text-xs font-mono text-muted-foreground"
												>
													{log.notification_delivery_id
														? truncateCorrelationId(
																log.notification_delivery_id
															)
														: 'N/A'}
												</div>
											</div>
											<div>
												<div
													class="text-xs font-medium text-foreground mb-1"
												>
													Request ID:
												</div>
												<div
													class="text-xs font-mono text-muted-foreground"
												>
													{log.request_id || 'N/A'}
												</div>
											</div>
										</div>

										<!-- Metadata -->
										{#if log.metadata && Object.keys(log.metadata).length > 0}
											<div>
												<div
													class="text-xs font-medium text-foreground mb-1"
												>
													Metadata:
												</div>
												<pre
													class="bg-card border border-border rounded p-3 text-xs overflow-x-auto">{JSON.stringify(
														log.metadata,
														null,
														2
													)}</pre>
											</div>
										{/if}

										<!-- Error Stack -->
										{#if log.error_stack}
											<div>
												<div
													class="text-xs font-medium text-red-700 dark:text-red-300 mb-1"
												>
													Error Stack Trace:
												</div>
												<pre
													class="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded p-3 text-xs overflow-x-auto text-red-900 dark:text-red-100">{log.error_stack}</pre>
											</div>
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
