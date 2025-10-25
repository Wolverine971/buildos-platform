<!-- apps/web/src/lib/components/admin/notifications/CorrelationViewerModal.svelte -->
<script lang="ts">
	import { Copy, AlertCircle, CheckCircle, Clock, Info } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

	interface SystemLog {
		id: string;
		correlation_id: string;
		request_id: string | null;
		level: LogLevel;
		message: string;
		namespace: string | null;
		metadata: Record<string, any> | null;
		error_stack: string | null;
		created_at: string;
	}

	interface CorrelationData {
		correlation_id: string;
		logs: SystemLog[];
		logs_by_namespace: Record<string, SystemLog[]>;
		notification_event?: {
			id: string;
			event_type: string;
			event_source: string;
			payload: Record<string, any>;
		} | null;
		deliveries: Array<{
			id: string;
			channel: string;
			status: string;
			recipient_user_id: string;
		}>;
		timeline: {
			start: string;
			end: string;
			duration: number;
			log_count: number;
			error_count: number;
			warn_count: number;
		};
		namespaces: string[];
	}

	interface Props {
		isOpen?: boolean;
		correlationId: string;
		data?: CorrelationData | null;
		loading?: boolean;
		onClose?: () => void;
	}

	let { isOpen = false, correlationId, data = null, loading = false, onClose }: Props = $props();

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleTimeString();
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
		return `${(ms / 60000).toFixed(2)}m`;
	}

	function getLevelColor(level: LogLevel): string {
		switch (level) {
			case 'debug':
				return 'text-gray-600 dark:text-gray-400';
			case 'info':
				return 'text-blue-600 dark:text-blue-400';
			case 'warn':
				return 'text-yellow-600 dark:text-yellow-400';
			case 'error':
				return 'text-red-600 dark:text-red-400';
			case 'fatal':
				return 'text-purple-600 dark:text-purple-400';
			default:
				return 'text-gray-600';
		}
	}

	function getLevelBgColor(level: LogLevel): string {
		switch (level) {
			case 'debug':
				return 'bg-gray-100 dark:bg-gray-900';
			case 'info':
				return 'bg-blue-50 dark:bg-blue-950';
			case 'warn':
				return 'bg-yellow-50 dark:bg-yellow-950';
			case 'error':
				return 'bg-red-50 dark:bg-red-950';
			case 'fatal':
				return 'bg-purple-50 dark:bg-purple-950';
			default:
				return 'bg-gray-100';
		}
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
	}

	function getStatusBadgeColor(status: string): string {
		const colors: Record<string, string> = {
			pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
			sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
			delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
			failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
		};
		return colors[status] || 'bg-gray-100 text-gray-800';
	}
</script>

<Modal {isOpen} onClose={onClose || (() => {})}  size="xl">
	<div slot="header" class="p-4 sm:p-5 md:p-6 border-b border-gray-200 dark:border-gray-700">
		<h2 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
			Correlation Tracking
		</h2>
		<div class="flex items-center gap-2 mt-2">
			<span class="text-sm text-gray-500 dark:text-gray-400 font-mono truncate">
				{correlationId}
			</span>
			<button
				onclick={() => copyToClipboard(correlationId)}
				class="flex-shrink-0 p-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors"
				aria-label="Copy correlation ID"
			>
				<Copy class="w-4 h-4" />
			</button>
		</div>
	</div>

	<div class="p-4 sm:p-5 md:p-6">
			{#if loading}
				<div class="flex items-center justify-center h-64">
					<div
						class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"
					></div>
				</div>
			{:else if !data}
				<div class="text-center text-gray-500 dark:text-gray-400 py-12">
					No correlation data available
				</div>
			{:else}
				<div class="space-y-6">
					<!-- Timeline Summary -->
					<div class="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<Clock class="w-5 h-5 text-blue-600 dark:text-blue-400" />
								<span class="font-medium text-gray-900 dark:text-white"
									>Timeline</span
								>
							</div>
							<div class="text-sm text-gray-700 dark:text-gray-300">
								Duration: {formatDuration(data.timeline.duration)}
							</div>
						</div>
						<div class="grid grid-cols-3 gap-4 mt-4">
							<div>
								<div class="text-xs text-gray-600 dark:text-gray-400">
									Total Logs
								</div>
								<div class="text-lg font-semibold text-gray-900 dark:text-white">
									{data.timeline.log_count}
								</div>
							</div>
							<div>
								<div class="text-xs text-gray-600 dark:text-gray-400">Errors</div>
								<div class="text-lg font-semibold text-red-600 dark:text-red-400">
									{data.timeline.error_count}
								</div>
							</div>
							<div>
								<div class="text-xs text-gray-600 dark:text-gray-400">Warnings</div>
								<div
									class="text-lg font-semibold text-yellow-600 dark:text-yellow-400"
								>
									{data.timeline.warn_count}
								</div>
							</div>
						</div>
					</div>

					<!-- Notification Event -->
					{#if data.notification_event}
						<div
							class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
						>
							<div class="flex items-center gap-2 mb-4">
								<Info class="w-5 h-5 text-purple-600 dark:text-purple-400" />
								<span class="font-medium text-gray-900 dark:text-white"
									>Notification Event</span
								>
							</div>
							<div class="space-y-2">
								<div class="flex justify-between gap-4">
									<span class="text-sm text-gray-700 dark:text-gray-300"
										>Type:</span
									>
									<span class="text-sm font-medium text-gray-900 dark:text-white">
										{data.notification_event.event_type}
									</span>
								</div>
								<div class="flex justify-between gap-4">
									<span class="text-sm text-gray-700 dark:text-gray-300"
										>Source:</span
									>
									<span class="text-sm font-medium text-gray-900 dark:text-white">
										{data.notification_event.event_source}
									</span>
								</div>
							</div>
						</div>
					{/if}

					<!-- Deliveries -->
					{#if data.deliveries && data.deliveries.length > 0}
						<div
							class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
						>
							<div class="flex items-center gap-2 mb-4">
								<CheckCircle class="w-5 h-5 text-green-600 dark:text-green-400" />
								<span class="font-medium text-gray-900 dark:text-white">
									Deliveries ({data.deliveries.length})
								</span>
							</div>
							<div class="space-y-2">
								{#each data.deliveries as delivery}
									<div
										class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
									>
										<div class="flex items-center gap-3">
											<span
												class="text-sm font-medium text-gray-900 dark:text-white"
											>
												{delivery.channel.toUpperCase()}
											</span>
											<span
												class="inline-flex items-center px-2 py-0.5 rounded text-xs {getStatusBadgeColor(
													delivery.status
												)}"
											>
												{delivery.status}
											</span>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Logs by Namespace -->
					<div class="space-y-4">
						<div class="flex items-center gap-2">
							<AlertCircle class="w-5 h-5 text-gray-600 dark:text-gray-400" />
							<span class="font-medium text-gray-900 dark:text-white"
								>Log Timeline</span
							>
						</div>

						{#each data.namespaces as namespace}
							{#if data.logs_by_namespace[namespace]}
								<div
									class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
								>
									<div
										class="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
									>
										<span
											class="text-sm font-mono text-gray-700 dark:text-gray-300"
										>
											{namespace}
										</span>
									</div>
									<div class="divide-y divide-gray-100 dark:divide-gray-800">
										{#each data.logs_by_namespace[namespace] as log}
											<div
												class="p-3 {getLevelBgColor(
													log.level
												)} hover:bg-opacity-75 transition-colors"
											>
												<div class="flex items-start justify-between">
													<div class="flex-1">
														<div
															class="flex items-center gap-2 mb-1"
														>
															<span
																class="text-xs text-gray-500 dark:text-gray-400 font-mono"
															>
																{formatDate(log.created_at)}
															</span>
															<span
																class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium {getLevelColor(
																	log.level
																)}"
															>
																{log.level.toUpperCase()}
															</span>
														</div>
														<p
															class="text-sm text-gray-900 dark:text-white"
														>
															{log.message}
														</p>
														{#if log.metadata && Object.keys(log.metadata).length > 0}
															<pre
																class="mt-2 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 overflow-x-auto">{JSON.stringify(
																	log.metadata,
																	null,
																	2
																)}</pre>
														{/if}
														{#if log.error_stack}
															<pre
																class="mt-2 text-xs bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 border border-red-200 dark:border-red-800 rounded p-2 overflow-x-auto">{log.error_stack}</pre>
														{/if}
													</div>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						{/each}
					</div>
				</div>
			{/if}
		</div>

	<div slot="footer" class="p-4 sm:p-5 md:p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
		<Button onclick={onClose} variant="secondary">Close</Button>
	</div>
</Modal>
