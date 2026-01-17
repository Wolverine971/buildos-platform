<!-- apps/web/src/lib/components/ontology/DocumentVersionDiffDrawer.svelte -->
<!--
	Document Version Diff Drawer

	A modal/drawer for viewing diffs between document versions.
	Supports comparing to previous version or current document state.

	Props:
	- isOpen: Whether the drawer is open
	- documentId: The document ID
	- versionNumber: The selected version number
	- compareMode: 'previous' or 'current'
	- currentDocument: Current document state (for comparing to current)
	- onClose: Callback when drawer is closed
-->
<script lang="ts">
	import {
		X,
		LoaderCircle,
		AlertCircle,
		GitCompare,
		ArrowRight,
		ToggleLeft
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import DiffView from '$lib/components/ui/DiffView.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { createFieldDiff, type FieldDiff } from '$lib/utils/diff';
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
		snapshot_hash: string | null;
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
		isOpen: boolean;
		documentId: string;
		projectId: string;
		versionNumber: number;
		compareMode: 'previous' | 'current';
		currentDocument?: {
			title: string | null;
			description: string | null;
			content: string | null;
			state_key: string | null;
		} | null;
		onClose?: () => void;
	}

	let {
		isOpen = $bindable(false),
		documentId,
		projectId,
		versionNumber,
		compareMode,
		currentDocument = null,
		onClose
	}: Props = $props();

	// ============================================================
	// STATE
	// ============================================================
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedVersion = $state<VersionDetail | null>(null);
	let compareVersion = $state<VersionDetail | null>(null);
	let diffs = $state<FieldDiff[]>([]);
	let activeCompareMode = $state<'previous' | 'current'>(compareMode);

	// ============================================================
	// DERIVED
	// ============================================================
	const fromLabel = $derived.by(() => {
		if (activeCompareMode === 'previous') {
			return compareVersion ? `Version ${compareVersion.number}` : 'Previous';
		}
		return selectedVersion ? `Version ${selectedVersion.number}` : 'Selected';
	});

	const toLabel = $derived.by(() => {
		if (activeCompareMode === 'previous') {
			return selectedVersion ? `Version ${selectedVersion.number}` : 'Selected';
		}
		return 'Current Document';
	});

	// ============================================================
	// EFFECTS
	// ============================================================
	$effect(() => {
		if (isOpen && documentId && versionNumber) {
			activeCompareMode = compareMode;
			loadVersions();
		}
	});

	// ============================================================
	// FUNCTIONS
	// ============================================================
	async function loadVersions() {
		isLoading = true;
		error = null;
		diffs = [];

		try {
			// Fetch the selected version
			const selectedResponse = await fetch(
				`/api/onto/documents/${documentId}/versions/${versionNumber}`
			);
			const selectedPayload = await selectedResponse.json();

			if (!selectedResponse.ok) {
				throw new Error(selectedPayload?.error || 'Failed to fetch version');
			}

			selectedVersion = selectedPayload.data as VersionDetail;

			if (activeCompareMode === 'previous' && versionNumber > 1) {
				// Fetch the previous version
				const prevResponse = await fetch(
					`/api/onto/documents/${documentId}/versions/${versionNumber - 1}`
				);
				const prevPayload = await prevResponse.json();

				if (!prevResponse.ok) {
					throw new Error(prevPayload?.error || 'Failed to fetch previous version');
				}

				compareVersion = prevPayload.data as VersionDetail;
			} else {
				compareVersion = null;
			}

			computeDiffs();
		} catch (err) {
			console.error('[DiffDrawer] Failed to load versions:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/documents/${documentId}/versions/${versionNumber}`,
				method: 'GET',
				projectId,
				entityType: 'document',
				entityId: documentId,
				operation: 'version_diff_load'
			});
			error = err instanceof Error ? err.message : 'Failed to load version data';
		} finally {
			isLoading = false;
		}
	}

	function computeDiffs() {
		const diffResults: FieldDiff[] = [];

		let oldSnapshot: DocumentSnapshot | null = null;
		let newSnapshot: DocumentSnapshot | null = null;

		if (activeCompareMode === 'previous') {
			oldSnapshot = compareVersion?.snapshot ?? null;
			newSnapshot = selectedVersion?.snapshot ?? null;
		} else {
			// Compare to current document
			oldSnapshot = selectedVersion?.snapshot ?? null;
			newSnapshot = currentDocument
				? {
						title: currentDocument.title,
						description: currentDocument.description,
						content: currentDocument.content,
						state_key: currentDocument.state_key,
						props: {},
						type_key: null,
						project_id: null
					}
				: null;
		}

		if (!oldSnapshot && !newSnapshot) {
			diffs = [];
			return;
		}

		// Compare title
		const titleDiff = createFieldDiff(
			'title',
			'Title',
			oldSnapshot?.title ?? '',
			newSnapshot?.title ?? ''
		);
		if (titleDiff.hasChanges) {
			diffResults.push(titleDiff);
		}

		// Compare description
		const descDiff = createFieldDiff(
			'description',
			'Description',
			oldSnapshot?.description ?? '',
			newSnapshot?.description ?? ''
		);
		if (descDiff.hasChanges) {
			diffResults.push(descDiff);
		}

		// Compare state
		const stateDiff = createFieldDiff(
			'state_key',
			'State',
			oldSnapshot?.state_key ?? '',
			newSnapshot?.state_key ?? ''
		);
		if (stateDiff.hasChanges) {
			diffResults.push(stateDiff);
		}

		// Compare content (main body)
		const contentDiff = createFieldDiff(
			'content',
			'Content',
			oldSnapshot?.content ?? '',
			newSnapshot?.content ?? ''
		);
		if (contentDiff.hasChanges) {
			diffResults.push(contentDiff);
		}

		diffs = diffResults;
	}

	function handleToggleMode() {
		activeCompareMode = activeCompareMode === 'previous' ? 'current' : 'previous';
		loadVersions();
	}

	function handleClose() {
		isOpen = false;
		onClose?.();
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<Modal bind:isOpen onClose={handleClose} size="lg" customClasses="lg:!max-w-4xl">
	{#snippet header()}
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-4 py-3 flex items-center justify-between gap-2"
		>
			<div class="flex items-center gap-3 min-w-0">
				<div
					class="flex h-9 w-9 items-center justify-center rounded bg-accent/10 text-accent"
				>
					<GitCompare class="w-5 h-5" />
				</div>
				<div class="min-w-0">
					<h2 class="text-sm font-semibold leading-tight text-foreground">
						Version Comparison
					</h2>
					<p class="text-xs text-muted-foreground mt-0.5">
						{#if activeCompareMode === 'previous'}
							Comparing version {versionNumber} to version {versionNumber - 1}
						{:else}
							Comparing version {versionNumber} to current document
						{/if}
					</p>
				</div>
			</div>
			<button
				type="button"
				onclick={handleClose}
				class="flex h-9 w-9 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-red-500/50 hover:text-red-500"
				aria-label="Close"
			>
				<X class="w-5 h-5" />
			</button>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="p-4 overflow-y-auto" style="max-height: calc(100vh - 200px);">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<LoaderCircle class="w-6 h-6 animate-spin text-muted-foreground" />
				</div>
			{:else if error}
				<div class="text-center py-8">
					<AlertCircle class="w-8 h-8 text-destructive mx-auto mb-2" />
					<p class="text-sm text-destructive">{error}</p>
					<Button variant="ghost" size="sm" onclick={() => loadVersions()} class="mt-3">
						Try again
					</Button>
				</div>
			{:else}
				<!-- Mode toggle -->
				<div class="flex items-center justify-between mb-4 pb-3 border-b border-border">
					<div class="flex items-center gap-2 text-sm">
						<span class="font-medium text-rose-600 dark:text-rose-400">{fromLabel}</span
						>
						<ArrowRight class="w-4 h-4 text-muted-foreground" />
						<span class="font-medium text-emerald-600 dark:text-emerald-400"
							>{toLabel}</span
						>
					</div>
					{#if versionNumber > 1 && currentDocument}
						<Button
							variant="ghost"
							size="sm"
							onclick={handleToggleMode}
							class="text-xs"
						>
							<ToggleLeft class="w-4 h-4 mr-1" />
							{activeCompareMode === 'previous'
								? 'Compare to Current'
								: 'Compare to Previous'}
						</Button>
					{/if}
				</div>

				<!-- Version metadata -->
				{#if selectedVersion}
					<div class="grid grid-cols-2 gap-4 mb-4 text-xs">
						<!-- From version info -->
						<div
							class="p-3 rounded-lg bg-rose-50/50 dark:bg-rose-900/10 border border-rose-200/50 dark:border-rose-800/50"
						>
							<p class="font-medium text-rose-600 dark:text-rose-400 mb-1">
								{fromLabel}
							</p>
							{#if activeCompareMode === 'previous' && compareVersion}
								<p class="text-muted-foreground">
									{compareVersion.created_by_name || 'Unknown'} ·
									{formatDate(
										compareVersion.window?.ended_at || compareVersion.created_at
									)}
								</p>
							{:else if activeCompareMode === 'current'}
								<p class="text-muted-foreground">
									{selectedVersion.created_by_name || 'Unknown'} ·
									{formatDate(
										selectedVersion.window?.ended_at ||
											selectedVersion.created_at
									)}
								</p>
							{/if}
						</div>
						<!-- To version info -->
						<div
							class="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200/50 dark:border-emerald-800/50"
						>
							<p class="font-medium text-emerald-600 dark:text-emerald-400 mb-1">
								{toLabel}
							</p>
							{#if activeCompareMode === 'previous'}
								<p class="text-muted-foreground">
									{selectedVersion.created_by_name || 'Unknown'} ·
									{formatDate(
										selectedVersion.window?.ended_at ||
											selectedVersion.created_at
									)}
								</p>
							{:else}
								<p class="text-muted-foreground">Current state</p>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Diff view -->
				<DiffView {diffs} fromVersionLabel={fromLabel} toVersionLabel={toLabel} />
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<div
			class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30"
		>
			<Button variant="secondary" size="sm" onclick={handleClose}>Close</Button>
		</div>
	{/snippet}
</Modal>
