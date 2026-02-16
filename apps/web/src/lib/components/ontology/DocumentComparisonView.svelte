<!-- apps/web/src/lib/components/ontology/DocumentComparisonView.svelte -->
<!--
	Main comparison mode container for document version diffs.
	Fetches version snapshots, computes diffs, renders toolbar + diff view.
	Supports unified and split view modes, version navigation, and compare target toggling.

	Caches fetched snapshots by version number during the session.
	Uses AbortController to prevent stale response races during rapid navigation.

	Inkprint design tokens. Svelte 5 runes.
-->
<script lang="ts">
	import { LoaderCircle, AlertCircle, RefreshCw } from 'lucide-svelte';
	import ComparisonToolbar from './ComparisonToolbar.svelte';
	import UnifiedDiffView from '$lib/components/ui/UnifiedDiffView.svelte';
	import DocumentSplitDiffView from './DocumentSplitDiffView.svelte';
	import {
		createDocumentDiff,
		type DocumentFieldDiff,
		type DiffStats
	} from '$lib/utils/document-diff';
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

	// Diff results
	let diffFields = $state<DocumentFieldDiff[]>([]);
	let totalStats = $state<DiffStats>({ added: 0, removed: 0, modified: 0 });

	// Snapshot cache (version number -> VersionDetail)
	let snapshotCache = $state<Map<number, VersionDetail>>(new Map());

	// AbortController for in-flight requests
	let currentAbortController: AbortController | null = null;

	// ============================================================
	// DERIVED
	// ============================================================
	const selectedVersion = $derived(
		toVersionNumber === 'current' ? fromVersionNumber : (toVersionNumber as number)
	);

	const compareTarget = $derived<'previous' | 'current'>(
		toVersionNumber === 'current' ? 'current' : 'previous'
	);

	const fromLabel = $derived(
		fromVersion
			? `v${fromVersion.number} by ${fromVersion.created_by_name || 'Unknown'}`
			: fromVersionNumber === null
				? 'Empty baseline'
				: 'Loading...'
	);

	const toLabel = $derived(
		toVersionNumber === 'current'
			? 'Current document'
			: toVersion
				? `v${toVersion.number} by ${toVersion.created_by_name || 'Unknown'}`
				: 'Loading...'
	);

	// ============================================================
	// EFFECTS
	// ============================================================
	$effect(() => {
		// Re-fetch when version numbers change
		const _from = fromVersionNumber;
		const _to = toVersionNumber;
		const _docId = documentId;
		if (_docId) {
			loadAndDiff();
		}
	});

	// Keyboard navigation
	$effect(() => {
		function handleKeydown(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				onExit();
			} else if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) {
				handlePrev();
			} else if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) {
				handleNext();
			}
		}

		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	// ============================================================
	// FUNCTIONS
	// ============================================================
	async function loadAndDiff() {
		// Abort any in-flight requests
		if (currentAbortController) {
			currentAbortController.abort();
		}
		const abortController = new AbortController();
		currentAbortController = abortController;

		isLoading = true;
		error = null;

		try {
			// Fetch "from" version (if not null)
			let fromSnapshot: DocumentSnapshot | null = null;
			if (fromVersionNumber !== null) {
				const fromDetail = await fetchVersion(fromVersionNumber, abortController.signal);
				if (abortController.signal.aborted) return;
				fromVersion = fromDetail;
				fromSnapshot = fromDetail?.snapshot ?? null;
			} else {
				fromVersion = null;
			}

			// Fetch "to" version (or use current document)
			let toSnapshot: {
				title: string | null;
				description: string | null;
				content: string | null;
				state_key: string | null;
			} | null = null;

			if (toVersionNumber === 'current') {
				toVersion = null;
				toSnapshot = currentDocument;
			} else {
				const toDetail = await fetchVersion(
					toVersionNumber as number,
					abortController.signal
				);
				if (abortController.signal.aborted) return;
				toVersion = toDetail;
				toSnapshot = toDetail?.snapshot
					? {
							title: toDetail.snapshot.title,
							description: toDetail.snapshot.description,
							content: toDetail.snapshot.content,
							state_key: toDetail.snapshot.state_key
						}
					: null;
			}

			// Compute diffs
			const result = createDocumentDiff(fromSnapshot, toSnapshot);
			if (abortController.signal.aborted) return;

			diffFields = result.fields;
			totalStats = result.totalStats;
		} catch (err) {
			if (abortController.signal.aborted) return;
			console.error('[DocumentComparisonView] Failed to load:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/documents/${documentId}/versions`,
				method: 'GET',
				projectId,
				entityType: 'document',
				entityId: documentId,
				operation: 'version_comparison_load'
			});
			error = err instanceof Error ? err.message : 'Failed to load version data';
		} finally {
			if (!abortController.signal.aborted) {
				isLoading = false;
			}
		}
	}

	async function fetchVersion(
		versionNumber: number,
		signal: AbortSignal
	): Promise<VersionDetail | null> {
		// Check cache first
		const cached = snapshotCache.get(versionNumber);
		if (cached) return cached;

		const response = await fetch(
			`/api/onto/documents/${documentId}/versions/${versionNumber}`,
			{ signal }
		);
		const payload = await response.json();

		if (!response.ok) {
			throw new Error(payload?.error || `Failed to fetch version ${versionNumber}`);
		}

		const detail = payload.data as VersionDetail;

		// Cache the result
		const next = new Map(snapshotCache);
		next.set(versionNumber, detail);
		snapshotCache = next;

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
		loadAndDiff();
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

<div class="flex flex-col h-full min-h-0">
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
				<div
					class="px-3 py-2 rounded-lg bg-rose-50/50 dark:bg-rose-900/10 border border-rose-200/50 dark:border-rose-800/30"
				>
					<p class="text-xs font-medium text-rose-600 dark:text-rose-400 mb-0.5">
						{fromVersionNumber === null
							? 'Empty baseline'
							: `Version ${fromVersionNumber}`}
					</p>
					{#if fromVersion}
						<p class="text-[10px] text-muted-foreground">
							{fromVersion.created_by_name || 'Unknown'} ·
							{formatDate(fromVersion.window?.ended_at || fromVersion.created_at)}
						</p>
						<div class="flex items-center gap-1.5 mt-0.5">
							{#if formatWindowLabel(fromVersion.window)}
								<span class="text-[10px] text-muted-foreground/50"
									>{formatWindowLabel(fromVersion.window)}</span
								>
							{/if}
							{#if fromVersion.is_merged && fromVersion.change_count > 1}
								<span
									class="text-[10px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400"
								>
									{fromVersion.change_count} edits
								</span>
							{/if}
							{#if getSourceLabel(fromVersion.change_source)}
								<span
									class="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground/70"
								>
									{getSourceLabel(fromVersion.change_source)}
								</span>
							{/if}
						</div>
					{:else if fromVersionNumber === null}
						<p class="text-[10px] text-muted-foreground/50">No previous version</p>
					{/if}
				</div>

				<!-- To version info -->
				<div
					class="px-3 py-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200/50 dark:border-emerald-800/30"
				>
					{#if toVersionNumber === 'current'}
						<p
							class="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-0.5"
						>
							Current document
						</p>
						<p class="text-[10px] text-muted-foreground/50">Live editor state</p>
					{:else if toVersion}
						<p
							class="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-0.5"
						>
							Version {toVersion.number}
						</p>
						<p class="text-[10px] text-muted-foreground">
							{toVersion.created_by_name || 'Unknown'} ·
							{formatDate(toVersion.window?.ended_at || toVersion.created_at)}
						</p>
						<div class="flex items-center gap-1.5 mt-0.5">
							{#if formatWindowLabel(toVersion.window)}
								<span class="text-[10px] text-muted-foreground/50"
									>{formatWindowLabel(toVersion.window)}</span
								>
							{/if}
							{#if toVersion.is_merged && toVersion.change_count > 1}
								<span
									class="text-[10px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400"
								>
									{toVersion.change_count} edits
								</span>
							{/if}
							{#if getSourceLabel(toVersion.change_source)}
								<span
									class="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground/70"
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
					class="flex items-center gap-3 px-3 py-1.5 mb-3 rounded bg-muted/50 border border-border/50 text-[10px] tabular-nums"
				>
					{#if totalStats.added > 0}
						<span class="text-emerald-600 dark:text-emerald-400">
							+{totalStats.added} line{totalStats.added === 1 ? '' : 's'} added
						</span>
					{/if}
					{#if totalStats.removed > 0}
						<span class="text-rose-600 dark:text-rose-400">
							&minus;{totalStats.removed} line{totalStats.removed === 1 ? '' : 's'} removed
						</span>
					{/if}
					{#if totalStats.modified > 0}
						<span class="text-amber-600 dark:text-amber-400">
							~{totalStats.modified} line{totalStats.modified === 1 ? '' : 's'} modified
						</span>
					{/if}

					<!-- Field-level change indicators -->
					{#each diffFields as field}
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
