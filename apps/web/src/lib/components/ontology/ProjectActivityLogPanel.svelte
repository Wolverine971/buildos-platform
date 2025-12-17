<!-- apps/web/src/lib/components/ontology/ProjectActivityLogPanel.svelte -->
<!--
	Project Activity Log Panel

	Displays a log-file style view of recent project activity.
	Shows entity changes with timestamps, actions, and clickable entity links.
	Supports pagination with "Load More" button.

	Loaded asynchronously when the panel is expanded.
-->
<script lang="ts">
	import {
		History,
		ChevronDown,
		Plus,
		Pencil,
		Trash2,
		Loader2,
		ExternalLink
	} from 'lucide-svelte';
	import type { ProjectLogEntry, ProjectLogEntityType } from '@buildos/shared-types';

	// ============================================================
	// TYPES
	// ============================================================
	interface EnrichedLogEntry extends ProjectLogEntry {
		entity_name?: string;
	}

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
		class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
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
		<div class="border-t border-border">
			{#if isLoading}
				<div class="flex items-center justify-center py-8">
					<Loader2 class="w-5 h-5 text-muted-foreground animate-spin" />
				</div>
			{:else if error}
				<div class="px-4 py-3 text-sm text-red-500">
					{error}
				</div>
			{:else if logs.length === 0}
				<p class="px-4 py-3 text-sm text-muted-foreground">No activity recorded yet</p>
			{:else}
				<!-- Log entries - styled like a terminal/log file -->
				<div class="font-mono text-xs divide-y divide-border/50">
					{#each logs as log}
						{@const ActionIcon = getActionIcon(log.action)}
						{@const isClickable = log.entity_type !== 'edge' && onEntityClick}
						<div
							class="group flex items-start gap-2 px-4 py-2 {isClickable
								? 'hover:bg-muted/60 cursor-pointer'
								: ''}"
							role={isClickable ? 'button' : undefined}
							tabindex={isClickable ? 0 : undefined}
							onclick={() => isClickable && handleEntityClick(log)}
							onkeydown={(e) =>
								e.key === 'Enter' && isClickable && handleEntityClick(log)}
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
								{#if log.change_source}
									<span class="text-muted-foreground/60 ml-1">
										({getSourceBadge(log.change_source)})
									</span>
								{/if}
							</span>

							<!-- Link indicator -->
							{#if isClickable}
								<ExternalLink
									class="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
								/>
							{/if}
						</div>
					{/each}
				</div>

				<!-- Load More -->
				{#if hasMore}
					<div class="px-4 py-2 border-t border-border">
						<button
							onclick={handleLoadMore}
							disabled={isLoadingMore}
							class="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
