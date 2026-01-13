<!-- apps/web/src/lib/components/ontology/EntityActivityLog.svelte -->
<!--
	Entity Activity Log Component

	A compact activity log display for entity modals (tasks, goals, plans, etc.).
	Shows recent changes to the specific entity in a terminal-style format.
	Designed to fit in modal sidebars.

	Props:
	- entityType: The type of entity ('task', 'goal', 'plan', etc.)
	- entityId: The ID of the entity
	- autoLoad: Whether to load immediately on mount (default: true)

	Usage:
	<EntityActivityLog entityType="task" entityId={taskId} />
-->
<script lang="ts">
	import { Plus, Pencil, Trash2, LoaderCircle, History, Clock } from 'lucide-svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import type { ProjectLogEntityType } from '@buildos/shared-types';

	// ============================================================
	// TYPES
	// ============================================================
	interface LogEntry {
		id: string;
		entity_type: string;
		entity_id: string;
		action: string;
		before_data: any;
		after_data: any;
		changed_by: string | null;
		changed_by_name: string | null;
		created_at: string;
		change_source: string | null;
	}

	interface LogsResponse {
		logs: LogEntry[];
		total: number;
		hasMore: boolean;
	}

	// ============================================================
	// PROPS
	// ============================================================
	interface Props {
		entityType: ProjectLogEntityType;
		entityId: string;
		autoLoad?: boolean;
	}

	let { entityType, entityId, autoLoad = true }: Props = $props();

	// ============================================================
	// STATE
	// ============================================================
	let isLoading = $state(false);
	let isLoadingMore = $state(false);
	let logs = $state<LogEntry[]>([]);
	let total = $state(0);
	let hasMore = $state(false);
	let hasLoaded = $state(false);
	let error = $state<string | null>(null);

	const INITIAL_LIMIT = 5; // Smaller limit for sidebar

	// ============================================================
	// EFFECTS
	// ============================================================
	$effect(() => {
		if (autoLoad && entityType && entityId && !hasLoaded) {
			loadLogs();
		}
	});

	// Reset when entity changes
	$effect(() => {
		if (entityType && entityId) {
			hasLoaded = false;
			logs = [];
			total = 0;
			hasMore = false;
			error = null;
			if (autoLoad) {
				loadLogs();
			}
		}
	});

	// ============================================================
	// FUNCTIONS
	// ============================================================
	async function loadLogs(offset = 0, append = false) {
		if (!entityType || !entityId) return;

		if (!append) {
			isLoading = true;
		} else {
			isLoadingMore = true;
		}
		error = null;

		try {
			const response = await fetch(
				`/api/onto/entities/${entityType}/${entityId}/logs?limit=${INITIAL_LIMIT}&offset=${offset}`
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
			console.error('[EntityActivityLog] Failed to load:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/entities/${entityType}/${entityId}/logs`,
				method: 'GET',
				entityType,
				entityId,
				operation: 'entity_activity_log_load',
				metadata: { offset, limit: INITIAL_LIMIT }
			});
			error = err instanceof Error ? err.message : 'Failed to load activity';
		} finally {
			isLoading = false;
			isLoadingMore = false;
		}
	}

	function handleLoadMore() {
		if (!isLoadingMore && hasMore) {
			loadLogs(logs.length, true);
		}
	}

	export function refresh() {
		hasLoaded = false;
		loadLogs();
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
		const diffMins = Math.floor(diffMs / (1000 * 60));
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		// Ultra compact for sidebar
		if (diffMins < 1) {
			return 'now';
		} else if (diffMins < 60) {
			return `${diffMins}m`;
		} else if (diffHours < 24) {
			return `${diffHours}h`;
		} else if (diffDays < 7) {
			return `${diffDays}d`;
		} else {
			return date.toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric'
			});
		}
	}

	function getSourceBadge(source: string | null): string {
		switch (source) {
			case 'chat':
				return 'chat';
			case 'form':
				return 'form';
			case 'brain_dump':
				return 'brain dump';
			case 'api':
				return 'API';
			default:
				return '';
		}
	}

	function getChangeSummary(log: LogEntry): string {
		// Try to extract a meaningful summary of what changed
		if (log.action === 'created') {
			return 'Created';
		}
		if (log.action === 'deleted') {
			return 'Deleted';
		}

		// For updates, try to summarize what fields changed
		const before = log.before_data;
		const after = log.after_data;

		if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
			return 'Updated';
		}

		const changedFields: string[] = [];
		const importantFields = [
			'title',
			'name',
			'state_key',
			'priority',
			'description',
			'due_at',
			'start_at'
		];

		for (const field of importantFields) {
			if (before[field] !== after[field]) {
				// Format field name nicely
				const fieldName = field.replace(/_/g, ' ').replace(/key$/i, '').trim();
				changedFields.push(fieldName);
			}
		}

		if (changedFields.length === 0) {
			return 'Updated';
		}

		if (changedFields.length === 1) {
			return `${changedFields[0]}`;
		}

		if (changedFields.length === 2) {
			return `${changedFields[0]}, ${changedFields[1]}`;
		}

		return `${changedFields[0]} +${changedFields.length - 1}`;
	}
</script>

<Card variant="elevated">
	<CardHeader variant="default">
		<h3
			class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"
		>
			<History class="w-3.5 h-3.5" />
			Activity
			{#if hasLoaded && total > 0}
				<span class="font-normal normal-case text-muted-foreground/70">
					({total})
				</span>
			{/if}
		</h3>
	</CardHeader>
	<CardBody padding="none">
		{#if isLoading}
			<div class="flex items-center justify-center py-6">
				<LoaderCircle class="w-4 h-4 text-muted-foreground animate-spin" />
			</div>
		{:else if error}
			<div class="px-3 py-2 text-xs text-red-600 dark:text-red-400">
				{error}
			</div>
		{:else if logs.length === 0}
			<div class="px-3 py-4 text-center">
				<Clock class="w-5 h-5 text-muted-foreground/50 mx-auto mb-1.5" />
				<p class="text-xs text-muted-foreground">No activity yet</p>
			</div>
		{:else}
			<!-- Compact log entries -->
			<div class="divide-y divide-border/50">
				{#each logs as log}
					{@const ActionIcon = getActionIcon(log.action)}
					{@const sourceBadge = getSourceBadge(log.change_source)}
					<div class="px-3 py-2 hover:bg-muted/30 transition-colors">
						<div class="flex items-start gap-2">
							<!-- Action icon -->
							<span class="shrink-0 mt-0.5 {getActionColor(log.action)}">
								<ActionIcon class="w-3 h-3" />
							</span>

							<!-- Content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-baseline justify-between gap-2">
									<span class="text-xs font-medium text-foreground truncate">
										{getChangeSummary(log)}
									</span>
									<span
										class="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums"
									>
										{formatTimestamp(log.created_at)}
									</span>
								</div>
								<div class="flex items-center gap-1.5 mt-0.5">
									{#if log.changed_by_name}
										<span class="text-[10px] text-muted-foreground truncate">
											{log.changed_by_name}
										</span>
									{/if}
									{#if sourceBadge}
										<span
											class="text-[10px] px-1 py-0.5 rounded bg-muted/50 text-muted-foreground/70"
										>
											{sourceBadge}
										</span>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Load More -->
			{#if hasMore}
				<div class="px-3 py-2 border-t border-border/50">
					<button
						onclick={handleLoadMore}
						disabled={isLoadingMore}
						class="w-full text-[10px] text-muted-foreground hover:text-accent py-1.5 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 rounded hover:bg-accent/5 pressable"
					>
						{#if isLoadingMore}
							<LoaderCircle class="w-3 h-3 animate-spin" />
							Loading...
						{:else}
							Show more ({total - logs.length})
						{/if}
					</button>
				</div>
			{/if}
		{/if}
	</CardBody>
</Card>
