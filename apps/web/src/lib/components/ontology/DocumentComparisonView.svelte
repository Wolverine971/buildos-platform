<!-- apps/web/src/lib/components/ontology/DocumentComparisonView.svelte -->
<!--
	Main comparison mode container for document version diffs.
	Fetches version snapshots, computes diffs, renders toolbar + diff view.
	Supports unified and split view modes, version navigation, and compare target toggling.

	Caches sealed snapshots by document and version during the session.
	Uses AbortController to prevent stale response races during rapid navigation.

	Inkprint design tokens. Svelte 5 runes.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import { LoaderCircle, AlertCircle, RefreshCw } from '$lib/icons/lucide';
	import ComparisonToolbar from './ComparisonToolbar.svelte';
	import UnifiedDiffView from '$lib/components/ui/UnifiedDiffView.svelte';
	import DocumentSplitDiffView from './DocumentSplitDiffView.svelte';
	import { createDocumentDiff } from '$lib/utils/document-diff';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import type { DocumentSnapshot } from '$lib/services/ontology/versioning.service';

	// ============================================================
	// TYPES
	// ============================================================
	interface VersionDetail {
		id: string;
		number: number;
		created_by: string;
		created_by_name: string | null;
		created_at: string;
		snapshot: DocumentSnapshot | null;
		window: { started_at: string; ended_at: string } | null;
		change_count: number;
		change_source: string | null;
		is_merged: boolean;
		is_restore: boolean;
	}

	// ============================================================
	// PROPS
	// ============================================================
	interface Props {
		documentId: string;
		projectId: string;
		fromVersionNumber: number | null;
		toVersionNumber: number | 'current';
		currentDocument: {
			title: string | null;
			description: string | null;
			content: string | null;
			state_key: string | null;
		};
		latestVersionNumber: number;
		refreshKey?: number;
		onExit: () => void;
		onNavigate: (fromVersion: number | null, toVersion: number | 'current') => void;
	}

	let {
		documentId,
		projectId,
		fromVersionNumber,
		toVersionNumber,
		currentDocument,
		latestVersionNumber,
		refreshKey = 0,
		onExit,
		onNavigate
	}: Props = $props();

	// ============================================================
	// STATE
	// ============================================================
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let viewMode = $state<'unified' | 'split'>('unified');

	// Fetched version data
	let fromVersion = $state<VersionDetail | null>(null);
	let toVersion = $state<VersionDetail | null>(null);

	// Current editor changes recompute the diff without fetching history again.
	const diff = $derived(
		createDocumentDiff(
			fromVersion?.snapshot ?? null,
			toVersionNumber === 'current' ? currentDocument : (toVersion?.snapshot ?? null)
		)
	);
	const diffFields = $derived(diff.fields);
	const totalStats = $derived(diff.totalStats);
	// Nonreactive: only request handlers consume this cache.
	const snapshotCache = new Map<string, VersionDetail>();
	let currentAbortController: AbortController | null = null;

	const selectedVersion = $derived(
		toVersionNumber === 'current' ? fromVersionNumber : toVersionNumber
	);
	const compareTarget = $derived<'previous' | 'current'>(
		toVersionNumber === 'current' ? 'current' : 'previous'
	);

	$effect(() => {
		const request = {
			documentId,
			projectId,
			fromVersionNumber,
			toVersionNumber,
			latestVersionNumber,
			refreshKey
		};
		if (!browser) return;
		untrack(() => void loadAndDiff(request));
		return () => {
			currentAbortController?.abort();
			currentAbortController = null;
		};
	});

	// Handle shortcuts only inside this region, so typing in filters or a stacked
	// restore dialog cannot navigate history or dismiss the document underneath it.
	function handleKeydown(event: KeyboardEvent) {
		if (
			event.defaultPrevented ||
			event.metaKey ||
			event.ctrlKey ||
			event.altKey ||
			event.shiftKey
		)
			return;
		if (
			event.target instanceof Element &&
			event.target.closest('input, textarea, select, [contenteditable="true"]')
		)
			return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onExit();
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			event.stopPropagation();
			if (event.key === 'ArrowLeft') handlePrev();
			else handleNext();
		}
	}

	type ComparisonRequest = {
		documentId: string;
		projectId: string;
		fromVersionNumber: number | null;
		toVersionNumber: number | 'current';
		latestVersionNumber: number;
		refreshKey: number;
	};

	async function loadAndDiff(request: ComparisonRequest) {
		currentAbortController?.abort();
		const controller = new AbortController();
		currentAbortController = controller;
		const isCurrent = () =>
			currentAbortController === controller &&
			!controller.signal.aborted &&
			documentId === request.documentId &&
			projectId === request.projectId &&
			fromVersionNumber === request.fromVersionNumber &&
			toVersionNumber === request.toVersionNumber &&
			latestVersionNumber === request.latestVersionNumber &&
			refreshKey === request.refreshKey;
		isLoading = true;
		error = null;
		fromVersion = null;
		toVersion = null;
		try {
			const [from, to] = await Promise.all([
				request.fromVersionNumber === null
					? null
					: fetchVersion(
							request,
							request.fromVersionNumber,
							controller.signal,
							isCurrent
						),
				request.toVersionNumber === 'current'
					? null
					: fetchVersion(request, request.toVersionNumber, controller.signal, isCurrent)
			]);
			if (!isCurrent()) return;
			fromVersion = from;
			toVersion = to;
		} catch (err) {
			if (!isCurrent()) return;
			console.error('[DocumentComparisonView] Failed to load:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/documents/${request.documentId}/versions`,
				method: 'GET',
				projectId: request.projectId,
				entityType: 'document',
				entityId: request.documentId,
				operation: 'version_comparison_load'
			});
			error = err instanceof Error ? err.message : 'Failed to load version data';
		} finally {
			if (isCurrent()) {
				isLoading = false;
				currentAbortController = null;
			}
		}
	}

	async function fetchVersion(
		request: ComparisonRequest,
		number: number,
		signal: AbortSignal,
		isCurrent: () => boolean
	): Promise<VersionDetail | null> {
		const key = `${request.projectId}/${request.documentId}/${number}`;
		// The newest version can still absorb saves; never reuse its snapshot.
		const cacheable = number < request.latestVersionNumber;
		const cached = cacheable ? snapshotCache.get(key) : null;
		if (cached) return cached;
		const response = await fetch(
			`/api/onto/documents/${request.documentId}/versions/${number}`,
			{ signal }
		);
		const payload = await response.json();
		if (!isCurrent()) return null;
		if (!response.ok) throw new Error(payload?.error || `Failed to fetch version ${number}`);
		const detail = payload.data as VersionDetail;
		if (detail?.number !== number || !detail.snapshot)
			throw new Error(`Version ${number} has no available snapshot`);
		if (cacheable) snapshotCache.set(key, detail);
		return detail;
	}

	function handlePrev() {
		if (!selectedVersion || selectedVersion <= 1 || isLoading) return;
		const newSelected = selectedVersion - 1;
		navigateToVersion(newSelected);
	}

	function handleNext() {
		if (!selectedVersion || selectedVersion >= latestVersionNumber || isLoading) return;
		const newSelected = selectedVersion + 1;
		navigateToVersion(newSelected);
	}

	function navigateToVersion(newSelected: number) {
		if (compareTarget === 'previous') {
			const from = newSelected === 1 ? null : newSelected - 1;
			onNavigate(from, newSelected);
		} else {
			onNavigate(newSelected, 'current');
		}
	}

	function handleToggleTarget(target: 'previous' | 'current') {
		if (!selectedVersion || isLoading) return;
		if (target === compareTarget) return;

		if (target === 'previous') {
			const from = selectedVersion === 1 ? null : selectedVersion - 1;
			onNavigate(from, selectedVersion);
		} else {
			onNavigate(selectedVersion, 'current');
		}
	}

	function handleToggleViewMode() {
		viewMode = viewMode === 'unified' ? 'split' : 'unified';
	}

	function handleRetry() {
		error = null;
		void loadAndDiff({
			documentId,
			projectId,
			fromVersionNumber,
			toVersionNumber,
			latestVersionNumber,
			refreshKey
		});
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
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
				return 'Captured Context';
			case 'api':
				return 'API';
			case 'agent':
				return 'Agent';
			default:
				return '';
		}
	}
</script>

<div
	class="flex flex-col h-full min-h-0"
	role="region"
	aria-label="Document version comparison"
	tabindex="-1"
	{@attach (node) => {
		node.focus({ preventScroll: true });
		node.addEventListener('keydown', handleKeydown);
		return () => node.removeEventListener('keydown', handleKeydown);
	}}
>
	<!-- Comparison Toolbar -->
	<ComparisonToolbar
		fromVersion={fromVersionNumber}
		toVersion={toVersionNumber}
		{latestVersionNumber}
		{viewMode}
		{isLoading}
		onPrev={handlePrev}
		onNext={handleNext}
		onToggleTarget={handleToggleTarget}
		onToggleViewMode={handleToggleViewMode}
		{onExit}
	/>

	<!-- Content area -->
	<div class="flex-1 overflow-y-auto p-3">
		{#if isLoading}
			<div class="flex items-center justify-center py-12">
				<LoaderCircle class="w-5 h-5 animate-spin text-muted-foreground" />
			</div>
		{:else if error}
			<div class="text-center py-8">
				<AlertCircle class="w-6 h-6 text-destructive mx-auto mb-2" />
				<p class="text-sm text-destructive mb-3">{error}</p>
				<button
					type="button"
					onclick={handleRetry}
					class="inline-flex items-center gap-1.5 text-xs text-accent hover:underline pressable"
				>
					<RefreshCw class="w-3 h-3" />
					Try again
				</button>
			</div>
		{:else}
			<!-- Version metadata cards -->
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
				<!-- From version info -->
				<div class="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30">
					<p class="text-xs font-medium text-destructive mb-0.5">
						{fromVersionNumber === null
							? 'Empty baseline'
							: `Version ${fromVersionNumber}`}
					</p>
					{#if fromVersion}
						<p class="text-2xs text-muted-foreground">
							{fromVersion.created_by_name || 'Unknown'} ·
							{formatDate(fromVersion.window?.ended_at || fromVersion.created_at)}
						</p>
						<div class="flex items-center gap-1.5 mt-0.5">
							{#if formatWindowLabel(fromVersion.window)}
								<span class="text-2xs text-muted-foreground/50"
									>{formatWindowLabel(fromVersion.window)}</span
								>
							{/if}
							{#if fromVersion.is_merged && fromVersion.change_count > 1}
								<span class="text-2xs px-1 py-0.5 rounded bg-info/10 text-info">
									{fromVersion.change_count} edits
								</span>
							{/if}
							{#if getSourceLabel(fromVersion.change_source)}
								<span
									class="text-2xs px-1 py-0.5 rounded bg-muted text-muted-foreground/70"
								>
									{getSourceLabel(fromVersion.change_source)}
								</span>
							{/if}
						</div>
					{:else if fromVersionNumber === null}
						<p class="text-2xs text-muted-foreground/50">No previous version</p>
					{/if}
				</div>

				<!-- To version info -->
				<div class="px-3 py-2 rounded-lg bg-success/10 border border-success/30">
					{#if toVersionNumber === 'current'}
						<p class="text-xs font-medium text-success mb-0.5">Current document</p>
						<p class="text-2xs text-muted-foreground/50">Live editor state</p>
					{:else if toVersion}
						<p class="text-xs font-medium text-success mb-0.5">
							Version {toVersion.number}
						</p>
						<p class="text-2xs text-muted-foreground">
							{toVersion.created_by_name || 'Unknown'} ·
							{formatDate(toVersion.window?.ended_at || toVersion.created_at)}
						</p>
						<div class="flex items-center gap-1.5 mt-0.5">
							{#if formatWindowLabel(toVersion.window)}
								<span class="text-2xs text-muted-foreground/50"
									>{formatWindowLabel(toVersion.window)}</span
								>
							{/if}
							{#if toVersion.is_merged && toVersion.change_count > 1}
								<span class="text-2xs px-1 py-0.5 rounded bg-info/10 text-info">
									{toVersion.change_count} edits
								</span>
							{/if}
							{#if getSourceLabel(toVersion.change_source)}
								<span
									class="text-2xs px-1 py-0.5 rounded bg-muted text-muted-foreground/70"
								>
									{getSourceLabel(toVersion.change_source)}
								</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<!-- Summary stats bar -->
			{#if totalStats.added > 0 || totalStats.removed > 0 || totalStats.modified > 0}
				<div
					class="flex items-center gap-3 px-3 py-1.5 mb-3 rounded bg-muted/50 border border-border/50 text-2xs tabular-nums"
				>
					{#if totalStats.added > 0}
						<span class="text-success">
							+{totalStats.added} line{totalStats.added === 1 ? '' : 's'} added
						</span>
					{/if}
					{#if totalStats.removed > 0}
						<span class="text-destructive">
							&minus;{totalStats.removed} line{totalStats.removed === 1 ? '' : 's'} removed
						</span>
					{/if}
					{#if totalStats.modified > 0}
						<span class="text-warning">
							~{totalStats.modified} line{totalStats.modified === 1 ? '' : 's'} modified
						</span>
					{/if}

					<!-- Field-level change indicators -->
					{#each diffFields as field (field.field)}
						{#if field.field === 'title'}
							<span class="text-muted-foreground/60">Title changed</span>
						{:else if field.field === 'state_key'}
							<span class="text-muted-foreground/60">State changed</span>
						{:else if field.field === 'description'}
							<span class="text-muted-foreground/60">Description changed</span>
						{/if}
					{/each}
				</div>
			{/if}

			<!-- Diff view -->
			{#if viewMode === 'unified'}
				<UnifiedDiffView fields={diffFields} />
			{:else}
				<DocumentSplitDiffView
					fields={diffFields}
					fromLabel={fromVersionNumber === null ? 'Empty' : `v${fromVersionNumber}`}
					toLabel={toVersionNumber === 'current' ? 'Current' : `v${toVersionNumber}`}
				/>
			{/if}
		{/if}
	</div>
</div>
