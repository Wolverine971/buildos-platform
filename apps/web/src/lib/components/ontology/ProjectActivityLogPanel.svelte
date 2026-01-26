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
	import { History, ChevronDown, Plus, Pencil, Trash2, LoaderCircle, Clock } from 'lucide-svelte';
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

			const data = payload.data as LogsResponse | undefined;
			if (!data) {
				throw new Error('Invalid response: missing data');
			}

			// Sort logs by most recent first
			const sortByMostRecent = (entries: EnrichedLogEntry[]) =>
				entries.sort(
					(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
				);

			if (append) {
				logs = sortByMostRecent([...logs, ...(data.logs ?? [])]);
			} else {
				logs = sortByMostRecent(data.logs ?? []);
			}
			total = data.total ?? 0;
			hasMore = data.hasMore ?? false;
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
		if (isNaN(date.getTime())) {
			return 'Unknown';
		}
		const month = date.getMonth() + 1;
		const day = date.getDate();
		const hours = date.getHours();
		const minutes = date.getMinutes().toString().padStart(2, '0');
		const ampm = hours >= 12 ? 'p' : 'a';
		const hour12 = hours % 12 || 12;
		return `${month}/${day} ${hour12}:${minutes}${ampm}`;
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
	class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
>
	<button
		onclick={handleToggle}
		class="w-full flex items-center justify-between gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-muted transition-colors pressable"
	>
		<div class="flex items-center gap-2 sm:gap-3">
			<div
				class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center"
			>
				<History class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
			</div>
			<div class="min-w-0">
				<p class="text-xs sm:text-sm font-semibold text-foreground">Activity Log</p>
				<p class="text-[10px] sm:text-xs text-muted-foreground">
					{#if hasLoaded}
						{total} {total === 1 ? 'entry' : 'entries'}
					{:else}
						Recent changes
					{/if}
				</p>
			</div>
		</div>
		<ChevronDown
			class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {isExpanded
				? 'rotate-180'
				: ''}"
		/>
	</button>

	{#if isExpanded}
		<div class="border-t border-border" transition:slide={{ duration: 120 }}>
			{#if isLoading}
				<div class="flex items-center justify-center py-4 sm:py-6">
					<LoaderCircle
						class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground animate-spin"
					/>
				</div>
			{:else if error}
				<div
					class="px-3 sm:px-4 py-3 text-xs sm:text-sm text-destructive tx tx-static tx-weak"
				>
					{error}
				</div>
			{:else if logs.length === 0}
				<div class="px-3 sm:px-4 py-3 sm:py-4 text-center tx tx-bloom tx-weak">
					<div
						class="w-8 h-8 sm:w-10 sm:h-10 rounded-md sm:rounded-lg bg-muted flex items-center justify-center mx-auto mb-2"
					>
						<Clock class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
					</div>
					<p class="text-xs sm:text-sm text-muted-foreground">No activity yet</p>
					<p
						class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block"
					>
						Changes will appear here
					</p>
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
								class="group flex items-start gap-2 px-4 py-2 hover:bg-muted cursor-pointer text-left w-full pressable"
								onclick={() => handleEntityClick(log)}
							>
								<!-- Timestamp + Source -->
								<span class="shrink-0 w-20 flex flex-col">
									<span class="text-muted-foreground/70 text-[10px] tabular-nums">
										{formatTimestamp(log.created_at)}
									</span>
									{#if log.change_source}
										<span class="text-muted-foreground/50 text-[10px]">
											{getSourceBadge(log.change_source)}
										</span>
									{/if}
								</span>

								<!-- Divider -->
								<span class="shrink-0 w-px h-4 bg-border/60"></span>

								<!-- Content: {Person} {action} {data} -->
								<span class="flex-1 min-w-0">
									<span class="text-foreground font-medium">
										{log.changed_by_name || 'Someone'}
									</span>
									<span class="text-muted-foreground ml-1">{log.action}</span>
									<span class="mx-1 text-foreground font-medium">
										{formatEntityType(log.entity_type)}:
									</span>
									<span class="text-foreground truncate">
										{log.entity_name || log.entity_id.slice(0, 8)}
									</span>
									{#if eventLabel}
										<span class="text-muted-foreground/70 ml-1">
											- {eventLabel}
										</span>
									{/if}
								</span>

								<!-- Action icon -->
								<span class="shrink-0 {getActionColor(log.action)}">
									<ActionIcon class="w-3.5 h-3.5" />
								</span>
							</button>
						{:else}
							<div class="group flex items-start gap-2 px-4 py-2">
								<!-- Timestamp + Source -->
								<span class="shrink-0 w-20 flex flex-col">
									<span class="text-muted-foreground/70 text-[10px] tabular-nums">
										{formatTimestamp(log.created_at)}
									</span>
									{#if log.change_source}
										<span class="text-muted-foreground/50 text-[10px]">
											{getSourceBadge(log.change_source)}
										</span>
									{/if}
								</span>

								<!-- Divider -->
								<span class="shrink-0 w-px h-4 bg-border/60"></span>

								<!-- Content: {Person} {action} {data} -->
								<span class="flex-1 min-w-0">
									<span class="text-foreground font-medium">
										{log.changed_by_name || 'Someone'}
									</span>
									<span class="text-muted-foreground ml-1">{log.action}</span>
									<span class="mx-1 text-foreground font-medium">
										{formatEntityType(log.entity_type)}:
									</span>
									<span class="text-foreground truncate">
										{log.entity_name || log.entity_id.slice(0, 8)}
									</span>
									{#if eventLabel}
										<span class="text-muted-foreground/70 ml-1">
											- {eventLabel}
										</span>
									{/if}
								</span>

								<!-- Action icon -->
								<span class="shrink-0 {getActionColor(log.action)}">
									<ActionIcon class="w-3.5 h-3.5" />
								</span>
							</div>
						{/if}
					{/each}
				</div>

				<!-- Load More -->
				{#if hasMore}
					<div class="px-3 sm:px-4 py-2 border-t border-border">
						<button
							onclick={handleLoadMore}
							disabled={isLoadingMore}
							class="w-full text-[10px] sm:text-xs text-muted-foreground hover:text-accent py-1.5 sm:py-2 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 sm:gap-2 rounded-md hover:bg-accent/5 pressable"
						>
							{#if isLoadingMore}
								<LoaderCircle class="w-3 h-3 animate-spin" />
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
