<!-- apps/web/src/lib/components/ontology/DocumentVersionHistoryPanel.svelte -->
<!--
	Document Version History Panel

	A panel for browsing and managing document versions.
	Displays version list with filtering, selection, and actions.

	Props:
	- documentId: The document to show versions for
	- projectId: The project ID (for permission checking)
	- isAdmin: Whether user has admin access (for restore)
	- onDiffRequested: Callback when user wants to view diff
	- onRestoreRequested: Callback when user wants to restore a version
-->
<script lang="ts">
	import {
		History,
		LoaderCircle,
		Clock,
		RotateCcw,
		GitCompare,
		ChevronDown,
		ChevronUp,
		User,
		Filter,
		Search,
		AlertCircle,
		RefreshCw
	} from 'lucide-svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	// ============================================================
	// TYPES
	// ============================================================
	export interface VersionListItem {
		id: string;
		number: number;
		created_by: string;
		created_by_name: string | null;
		created_at: string;
		snapshot_hash: string | null;
		window: { started_at: string; ended_at: string } | null;
		change_count: number;
		change_source: string | null;
		is_merged: boolean;
		is_restore: boolean;
		restored_by_user_id: string | null;
		restore_of_version: number | null;
	}

	interface VersionListResponse {
		versions: VersionListItem[];
		total: number;
		hasMore: boolean;
		nextCursor: number | null;
	}

	// ============================================================
	// PROPS
	// ============================================================
	interface Props {
		documentId: string;
		projectId: string;
		isAdmin?: boolean;
		/** @deprecated Use onCompareRequested for inline comparison mode */
		onDiffRequested?: (version: VersionListItem, compareMode: 'previous' | 'current') => void;
		onRestoreRequested?: (version: VersionListItem, latestVersionNumber: number) => void;
		/** New: triggers inline comparison mode in the DocumentModal content area */
		onCompareRequested?: (versionNumber: number, latestVersionNumber: number) => void;
	}

	let {
		documentId,
		projectId,
		isAdmin = false,
		onDiffRequested,
		onRestoreRequested,
		onCompareRequested
	}: Props = $props();

	// ============================================================
	// STATE
	// ============================================================
	let isLoading = $state(false);
	let isLoadingMore = $state(false);
	let versions = $state<VersionListItem[]>([]);
	let total = $state(0);
	let hasMore = $state(false);
	let nextCursor = $state<number | null>(null);
	let hasLoaded = $state(false);
	let error = $state<string | null>(null);

	let selectedVersion = $state<VersionListItem | null>(null);
	let showFilters = $state(false);

	// Filters
	let timeFilter = $state<'24h' | '7d' | 'all'>('all');
	let searchQuery = $state('');

	const INITIAL_LIMIT = 20;

	// ============================================================
	// DERIVED
	// ============================================================
	const lastUpdated = $derived.by(() => {
		if (versions.length === 0) return null;
		// Find the most recent version
		const latest = versions[0];
		return latest?.window?.ended_at || latest?.created_at || null;
	});

	const filteredVersions = $derived.by(() => {
		let filtered = versions;

		// Apply search filter (client-side)
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter(
				(v) =>
					v.created_by_name?.toLowerCase().includes(query) ||
					v.change_source?.toLowerCase().includes(query) ||
					`v${v.number}`.includes(query)
			);
		}

		return filtered;
	});

	// ============================================================
	// EFFECTS
	// ============================================================
	$effect(() => {
		if (documentId && !hasLoaded) {
			loadVersions();
		}
	});

	// Reset when document changes
	$effect(() => {
		if (documentId) {
			hasLoaded = false;
			versions = [];
			total = 0;
			hasMore = false;
			nextCursor = null;
			error = null;
			selectedVersion = null;
			loadVersions();
		}
	});

	// ============================================================
	// FUNCTIONS
	// ============================================================
	async function loadVersions(cursor?: number | null, append = false) {
		if (!documentId) return;

		if (!append) {
			isLoading = true;
		} else {
			isLoadingMore = true;
		}
		error = null;

		try {
			const params = new URLSearchParams();
			params.set('limit', String(INITIAL_LIMIT));

			if (cursor) {
				params.set('cursor', String(cursor));
			}

			// Apply time filter to API
			if (timeFilter !== 'all') {
				const now = new Date();
				const from = new Date();
				if (timeFilter === '24h') {
					from.setHours(from.getHours() - 24);
				} else if (timeFilter === '7d') {
					from.setDate(from.getDate() - 7);
				}
				params.set('from', from.toISOString());
			}

			const response = await fetch(`/api/onto/documents/${documentId}/versions?${params}`);
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to fetch versions');
			}

			const data = payload.data as VersionListResponse;

			if (append) {
				versions = [...versions, ...data.versions];
			} else {
				versions = data.versions;
			}
			total = data.total;
			hasMore = data.hasMore;
			nextCursor = data.nextCursor;
			hasLoaded = true;
		} catch (err) {
			console.error('[VersionHistoryPanel] Failed to load:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/documents/${documentId}/versions`,
				method: 'GET',
				projectId,
				entityType: 'document',
				entityId: documentId,
				operation: 'version_history_load'
			});
			error = err instanceof Error ? err.message : 'Failed to load versions';
		} finally {
			isLoading = false;
			isLoadingMore = false;
		}
	}

	function handleLoadMore() {
		if (!isLoadingMore && hasMore && nextCursor) {
			loadVersions(nextCursor, true);
		}
	}

	function handleRetry() {
		error = null;
		loadVersions();
	}

	function handleVersionSelect(version: VersionListItem) {
		selectedVersion = selectedVersion?.id === version.id ? null : version;
	}

	function handleViewDiff(mode: 'previous' | 'current') {
		if (selectedVersion) {
			onDiffRequested?.(selectedVersion, mode);
		}
	}

	function handleCompare() {
		if (selectedVersion && versions.length > 0) {
			const latestNum = versions[0]?.number ?? 0;
			onCompareRequested?.(selectedVersion.number, latestNum);
		}
	}

	function handleRestore() {
		if (selectedVersion && versions.length > 0) {
			const latestNum = versions[0]?.number ?? 0;
			onRestoreRequested?.(selectedVersion, latestNum);
		}
	}

	function handleTimeFilterChange(filter: '24h' | '7d' | 'all') {
		timeFilter = filter;
		hasLoaded = false;
		versions = [];
		loadVersions();
	}

	export function refresh() {
		hasLoaded = false;
		loadVersions();
	}

	function formatTimestamp(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / (1000 * 60));
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffMins < 1) return 'now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function formatWindowLabel(window: { started_at: string; ended_at: string } | null): string {
		if (!window) return '';
		const start = new Date(window.started_at);
		const end = new Date(window.ended_at);
		const diffMs = end.getTime() - start.getTime();
		const diffMins = Math.round(diffMs / (1000 * 60));

		if (diffMins < 1) return '';
		if (diffMins < 60) return `~${diffMins}m window`;
		const hours = Math.round(diffMins / 60);
		return `~${hours}h window`;
	}

	function getSourceLabel(source: string | null): string {
		switch (source) {
			case 'chat':
				return 'Chat';
			case 'form':
				return 'Form';
			case 'brain_dump':
				return 'Brain Dump';
			case 'api':
				return 'API';
			case 'agent':
				return 'Agent';
			default:
				return '';
		}
	}
</script>

<Card variant="elevated">
	<CardHeader variant="default">
		<div class="flex items-center justify-between w-full">
			<h3
				class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"
			>
				<History class="w-3.5 h-3.5" />
				Versions
				{#if hasLoaded && total > 0}
					<span class="font-normal normal-case text-muted-foreground/70">({total})</span>
				{/if}
			</h3>
			<button
				type="button"
				onclick={() => (showFilters = !showFilters)}
				class="p-1 rounded hover:bg-muted/80 transition-colors pressable"
				aria-label="Toggle filters"
			>
				<Filter
					class="w-3.5 h-3.5 {showFilters ? 'text-accent' : 'text-muted-foreground'}"
				/>
			</button>
		</div>
		{#if lastUpdated}
			<p class="text-[10px] text-muted-foreground/70 mt-0.5">
				Last updated {formatTimestamp(lastUpdated)}
			</p>
		{/if}
	</CardHeader>

	{#if showFilters}
		<div class="px-3 py-2 border-b border-border/50 bg-muted space-y-2">
			<!-- Time filter -->
			<div class="flex items-center gap-1">
				<button
					type="button"
					onclick={() => handleTimeFilterChange('24h')}
					class="px-2 py-1 text-[10px] rounded transition-colors {timeFilter === '24h'
						? 'bg-accent text-accent-foreground'
						: 'bg-muted text-muted-foreground hover:bg-muted'}"
				>
					24h
				</button>
				<button
					type="button"
					onclick={() => handleTimeFilterChange('7d')}
					class="px-2 py-1 text-[10px] rounded transition-colors {timeFilter === '7d'
						? 'bg-accent text-accent-foreground'
						: 'bg-muted text-muted-foreground hover:bg-muted'}"
				>
					7d
				</button>
				<button
					type="button"
					onclick={() => handleTimeFilterChange('all')}
					class="px-2 py-1 text-[10px] rounded transition-colors {timeFilter === 'all'
						? 'bg-accent text-accent-foreground'
						: 'bg-muted text-muted-foreground hover:bg-muted'}"
				>
					All
				</button>
			</div>
			<!-- Search -->
			<div class="relative">
				<Search
					class="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground"
				/>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search versions..."
					class="w-full pl-6 pr-2 py-1 text-[10px] bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent/50"
				/>
			</div>
		</div>
	{/if}

	<CardBody padding="none">
		{#if isLoading}
			<div class="flex items-center justify-center py-6">
				<LoaderCircle class="w-4 h-4 text-muted-foreground animate-spin" />
			</div>
		{:else if error}
			<div class="px-3 py-4 text-center">
				<AlertCircle class="w-5 h-5 text-destructive mx-auto mb-2" />
				<p class="text-xs text-destructive mb-2">{error}</p>
				<button
					type="button"
					onclick={handleRetry}
					class="inline-flex items-center gap-1 text-[10px] text-accent hover:underline"
				>
					<RefreshCw class="w-3 h-3" />
					Retry
				</button>
			</div>
		{:else if filteredVersions.length === 0}
			<div class="px-3 py-4 text-center">
				<Clock class="w-5 h-5 text-muted-foreground/50 mx-auto mb-1.5" />
				<p class="text-xs text-muted-foreground">No versions yet</p>
				<p class="text-[10px] text-muted-foreground/70 mt-1">
					First save creates version history
				</p>
			</div>
		{:else}
			<!-- Version list -->
			<div class="divide-y divide-border/50 max-h-64 overflow-y-auto">
				{#each filteredVersions as version (version.id)}
					{@const isSelected = selectedVersion?.id === version.id}
					{@const sourceLabel = getSourceLabel(version.change_source)}
					{@const windowLabel = formatWindowLabel(version.window)}
					<button
						type="button"
						onclick={() => handleVersionSelect(version)}
						class="w-full text-left px-3 py-2 transition-all pressable {isSelected
							? 'bg-accent/10 border-l-2 border-accent'
							: 'hover:bg-muted/60 border-l-2 border-transparent'}"
					>
						<div class="flex items-start gap-2">
							<!-- Version number -->
							<span
								class="shrink-0 text-[10px] font-mono font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded"
							>
								v{version.number}
							</span>

							<!-- Content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-baseline justify-between gap-2">
									<span
										class="text-xs text-foreground truncate flex items-center gap-1"
									>
										{#if version.created_by_name}
											<User class="w-3 h-3 text-muted-foreground shrink-0" />
											{version.created_by_name}
										{:else}
											Unknown
										{/if}
									</span>
									<span
										class="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums"
									>
										{formatTimestamp(
											version.window?.ended_at || version.created_at
										)}
									</span>
								</div>
								<div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
									{#if version.is_merged && version.change_count > 1}
										<span
											class="text-[10px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400"
										>
											{version.change_count} edits
										</span>
									{/if}
									{#if version.is_restore}
										<span
											class="text-[10px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400"
										>
											Restored from v{version.restore_of_version}
										</span>
									{/if}
									{#if sourceLabel}
										<span
											class="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground/70"
										>
											{sourceLabel}
										</span>
									{/if}
									{#if windowLabel}
										<span class="text-[10px] text-muted-foreground/50"
											>{windowLabel}</span
										>
									{/if}
								</div>
							</div>
						</div>
					</button>
				{/each}
			</div>

			<!-- Load More -->
			{#if hasMore}
				<div class="px-3 py-2 border-t border-border/50">
					<button
						type="button"
						onclick={handleLoadMore}
						disabled={isLoadingMore}
						class="w-full text-[10px] text-muted-foreground hover:text-accent py-1.5 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 rounded hover:bg-accent/5 pressable"
					>
						{#if isLoadingMore}
							<LoaderCircle class="w-3 h-3 animate-spin" />
							Loading...
						{:else}
							Show older versions
						{/if}
					</button>
				</div>
			{/if}

			<!-- Selected version actions -->
			{#if selectedVersion}
				<div class="px-3 py-2 border-t border-border bg-muted/50 space-y-1.5">
					<div class="text-[10px] text-muted-foreground flex items-center gap-1.5">
						<span class="font-medium text-foreground">v{selectedVersion.number}</span>
						{#if selectedVersion.snapshot_hash}
							<span class="font-mono text-muted-foreground/40" title="Snapshot hash">
								#{selectedVersion.snapshot_hash.slice(0, 8)}
							</span>
						{/if}
					</div>
					<div class="flex items-center gap-1.5">
						{#if onCompareRequested}
							<button
								type="button"
								onclick={handleCompare}
								class="flex-1 inline-flex items-center justify-center gap-1.5 h-7 px-2.5 text-[10px] font-medium rounded-md border border-border bg-card text-foreground shadow-ink pressable transition-all hover:border-accent/50 hover:text-accent"
							>
								<GitCompare class="w-3 h-3" />
								See Changes
							</button>
						{:else}
							<Button
								variant="secondary"
								size="sm"
								onclick={() => handleViewDiff('previous')}
								disabled={selectedVersion.number === 1}
								class="text-[10px] h-7 px-2 flex-1"
							>
								<GitCompare class="w-3 h-3 mr-1" />
								vs Previous
							</Button>
							<Button
								variant="secondary"
								size="sm"
								onclick={() => handleViewDiff('current')}
								disabled={selectedVersion.number === versions[0]?.number}
								class="text-[10px] h-7 px-2 flex-1"
							>
								<GitCompare class="w-3 h-3 mr-1" />
								vs Current
							</Button>
						{/if}
					</div>
					{#if isAdmin && selectedVersion.number !== versions[0]?.number}
						<button
							type="button"
							onclick={handleRestore}
							class="w-full inline-flex items-center justify-center gap-1.5 h-7 px-2 text-[10px] font-medium rounded-md text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors pressable"
						>
							<RotateCcw class="w-3 h-3" />
							Restore this version
						</button>
					{/if}
				</div>
			{/if}
		{/if}
	</CardBody>
</Card>
