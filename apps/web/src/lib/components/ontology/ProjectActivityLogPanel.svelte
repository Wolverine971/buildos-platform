<!-- apps/web/src/lib/components/ontology/ProjectActivityLogPanel.svelte -->
<!--
	Project Activity Log Panel

	Displays a log-file style view of recent project activity.
	Shows entity changes with timestamps, actions, and clickable entity links.
	Supports pagination with "Load More" button.

	Loaded asynchronously when the panel is expanded.
-->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import {
		History,
		ChevronDown,
		Plus,
		Pencil,
		Trash2,
		Loader2,
		ExternalLink,
		Clock
	} from 'lucide-svelte';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import type { ProjectLogEntryWithMeta, ProjectLogEntityType } from '@buildos/shared-types';

	// ============================================================
	// TYPES
	// ============================================================
	type EnrichedLogEntry = ProjectLogEntryWithMeta;

	interface LogsResponse {
		logs: EnrichedLogEntry[];
		total: number;
		hasMore: boolean;
	}

	// ============================================================
	// PROPS
	// ============================================================
	interface Props {
		projectId: string;
		onEntityClick?: (entityType: ProjectLogEntityType, entityId: string) => void;
	}

	let { projectId, onEntityClick }: Props = $props();

	// ============================================================
	// STATE
	// ============================================================
	let isExpanded = $state(false);
	let isLoading = $state(false);
	let isLoadingMore = $state(false);
	let logs = $state<EnrichedLogEntry[]>([]);
	let total = $state(0);
	let hasMore = $state(false);
	let hasLoaded = $state(false);
	let error = $state<string | null>(null);

	const INITIAL_LIMIT = 10;

	// ============================================================
	// FUNCTIONS
	// ============================================================
	async function loadLogs(offset = 0, append = false) {
		if (!append) {
			isLoading = true;
		} else {
			isLoadingMore = true;
		}
		error = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${projectId}/logs?limit=${INITIAL_LIMIT}&offset=${offset}`
			);
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to fetch logs');
			}

			const data = payload.data as LogsResponse;

			if (append) {
				logs = [...logs, ...data.logs];
			} else {
				logs = data.logs;
			}
			total = data.total;
			hasMore = data.hasMore;
			hasLoaded = true;
		} catch (err) {
			console.error('[ActivityLog] Failed to load:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${projectId}/logs`,
				method: 'GET',
				projectId,
				entityType: 'project',
				operation: 'project_logs_load',
				metadata: { offset, limit: INITIAL_LIMIT }
			});
			error = err instanceof Error ? err.message : 'Failed to load activity log';
		} finally {
			isLoading = false;
			isLoadingMore = false;
		}
	}

	function handleToggle() {
		isExpanded = !isExpanded;
		if (isExpanded && !hasLoaded) {
			loadLogs();
		}
	}

	function handleLoadMore() {
		if (!isLoadingMore && hasMore) {
			loadLogs(logs.length, true);
		}
	}

	function handleEntityClick(log: EnrichedLogEntry) {
		if (onEntityClick && log.entity_type !== 'edge') {
			onEntityClick(log.entity_type as ProjectLogEntityType, log.entity_id);
		}
	}

	function getActionIcon(action: string) {
		switch (action) {
			case 'created':
				return Plus;
			case 'updated':
				return Pencil;
			case 'deleted':
				return Trash2;
			default:
				return Pencil;
		}
	}

	function getActionColor(action: string): string {
		switch (action) {
			case 'created':
				return 'text-emerald-500';
			case 'updated':
				return 'text-blue-500';
			case 'deleted':
				return 'text-red-500';
			default:
				return 'text-muted-foreground';
		}
	}

	function formatTimestamp(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) {
			return date.toLocaleTimeString(undefined, {
				hour: '2-digit',
				minute: '2-digit'
			});
		} else if (diffDays === 1) {
			return (
				'Yesterday ' +
				date.toLocaleTimeString(undefined, {
					hour: '2-digit',
					minute: '2-digit'
				})
			);
		} else if (diffDays < 7) {
			return date.toLocaleDateString(undefined, {
				weekday: 'short',
				hour: '2-digit',
				minute: '2-digit'
			});
		} else {
			return date.toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		}
	}

	function formatEntityType(type: string): string {
		return type.charAt(0).toUpperCase() + type.slice(1);
	}

	function formatEventLabel(event: string): string {
		const labels: Record<string, string> = {
			invite_created: 'invite created',
			invite_resent: 'invite resent',
			invite_revoked: 'invite revoked',
			member_role_updated: 'member role updated',
			member_removed: 'member removed'
		};

		return labels[event] || event.replace(/_/g, ' ');
	}

	function getEventLabel(log: EnrichedLogEntry): string | null {
		const data = log.after_data ?? log.before_data;
		if (!data || typeof data !== 'object') {
			return null;
		}

		const event = (data as Record<string, unknown>).event;
		if (!event || typeof event !== 'string') {
			return null;
		}

		return formatEventLabel(event);
	}

	function getSourceBadge(source: string | null): string {
		switch (source) {
			case 'chat':
				return 'via chat';
			case 'form':
				return 'via form';
			case 'brain_dump':
				return 'via brain dump';
			case 'api':
				return 'via API';
			default:
				return '';
		}
	}
</script>

<div
	class="bg-card/60 border border-border rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
>
	<button
		onclick={handleToggle}
		class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/5 transition-colors pressable"
	>
		<div class="flex items-start gap-3">
			<div class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
				<History class="w-4 h-4 text-foreground" />
			</div>
			<div class="min-w-0">
				<p class="text-sm font-semibold text-foreground">Activity Log</p>
				<p class="text-xs text-muted-foreground">
					{#if hasLoaded}
						{total} {total === 1 ? 'entry' : 'entries'}
					{:else}
						Recent changes
					{/if}
				</p>
			</div>
		</div>
		<ChevronDown
			class="w-4 h-4 text-muted-foreground transition-transform {isExpanded
				? 'rotate-180'
				: ''}"
		/>
	</button>

	{#if isExpanded}
		<div class="border-t border-border" transition:slide={{ duration: 200 }}>
			{#if isLoading}
				<div class="flex items-center justify-center py-8">
					<Loader2 class="w-5 h-5 text-muted-foreground animate-spin" />
				</div>
			{:else if error}
				<div class="px-4 py-3 text-sm text-red-600 dark:text-red-400">
					{error}
				</div>
			{:else if logs.length === 0}
				<div class="px-4 py-4 text-center">
					<div
						class="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center mx-auto mb-2"
					>
						<Clock class="w-5 h-5 text-muted-foreground" />
					</div>
					<p class="text-sm text-muted-foreground">No activity yet</p>
					<p class="text-xs text-muted-foreground/70 mt-0.5">Changes will appear here</p>
				</div>
			{:else}
				<!-- Log entries - styled like a terminal/log file -->
				<div class="font-mono text-xs divide-y divide-border/50">
					{#each logs as log}
						{@const ActionIcon = getActionIcon(log.action)}
						{@const isClickable = log.entity_type !== 'edge' && onEntityClick}
						{@const eventLabel = getEventLabel(log)}
						{#if isClickable}
							<button
								type="button"
								class="group flex items-start gap-2 px-4 py-2 hover:bg-muted/60 cursor-pointer text-left w-full"
								onclick={() => handleEntityClick(log)}
							>
								<!-- Timestamp -->
								<span class="text-muted-foreground shrink-0 w-24 tabular-nums">
									{formatTimestamp(log.created_at)}
								</span>

								<!-- Action icon -->
								<span class="shrink-0 {getActionColor(log.action)}">
									<ActionIcon class="w-3.5 h-3.5" />
								</span>

								<!-- Content -->
								<span class="flex-1 min-w-0">
									<span class="text-muted-foreground">{log.action}</span>
									<span class="mx-1 text-foreground font-medium">
										{formatEntityType(log.entity_type)}:
									</span>
									<span class="text-foreground truncate">
										{log.entity_name || log.entity_id.slice(0, 8)}
									</span>
									{#if log.changed_by_name}
										<span class="text-muted-foreground/70 ml-1">
											by {log.changed_by_name}
										</span>
									{/if}
									{#if eventLabel}
										<span class="text-muted-foreground/70 ml-1">
											- {eventLabel}
										</span>
									{/if}
									{#if log.change_source}
										<span class="text-muted-foreground/60 ml-1">
											({getSourceBadge(log.change_source)})
										</span>
									{/if}
								</span>

								<!-- Link indicator -->
								<ExternalLink
									class="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
								/>
							</button>
						{:else}
							<div class="group flex items-start gap-2 px-4 py-2">
								<!-- Timestamp -->
								<span class="text-muted-foreground shrink-0 w-24 tabular-nums">
									{formatTimestamp(log.created_at)}
								</span>

								<!-- Action icon -->
								<span class="shrink-0 {getActionColor(log.action)}">
									<ActionIcon class="w-3.5 h-3.5" />
								</span>

								<!-- Content -->
								<span class="flex-1 min-w-0">
									<span class="text-muted-foreground">{log.action}</span>
									<span class="mx-1 text-foreground font-medium">
										{formatEntityType(log.entity_type)}:
									</span>
									<span class="text-foreground truncate">
										{log.entity_name || log.entity_id.slice(0, 8)}
									</span>
									{#if log.changed_by_name}
										<span class="text-muted-foreground/70 ml-1">
											by {log.changed_by_name}
										</span>
									{/if}
									{#if eventLabel}
										<span class="text-muted-foreground/70 ml-1">
											- {eventLabel}
										</span>
									{/if}
									{#if log.change_source}
										<span class="text-muted-foreground/60 ml-1">
											({getSourceBadge(log.change_source)})
										</span>
									{/if}
								</span>
							</div>
						{/if}
					{/each}
				</div>

				<!-- Load More -->
				{#if hasMore}
					<div class="px-4 py-2 border-t border-border">
						<button
							onclick={handleLoadMore}
							disabled={isLoadingMore}
							class="w-full text-xs text-muted-foreground hover:text-accent py-2 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 rounded-md hover:bg-accent/5 pressable"
						>
							{#if isLoadingMore}
								<Loader2 class="w-3 h-3 animate-spin" />
								Loading...
							{:else}
								Load more ({total - logs.length} remaining)
							{/if}
						</button>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>
