<!-- apps/web/src/lib/components/ontology/DocumentVersionRestoreModal.svelte -->
<!--
	Document Version Restore Modal

	A confirmation modal for restoring a document to a previous version.
	Requires explicit confirmation checkbox before allowing restore.

	Props:
	- isOpen: Whether the modal is open
	- documentId: The document ID
	- projectId: The project ID
	- version: The version to restore to
	- expectedUpdatedAt: The loaded document timestamp (for conflict protection)
	- onBeforeRestore: Save a recovery checkpoint and return its document timestamp
	- onClose: Callback when modal is closed
	- onRestored: Callback after successful restore
-->
<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { RotateCcw, AlertTriangle, LoaderCircle, User, Clock, Hash } from '$lib/icons/lucide';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	// ============================================================
	// TYPES
	// ============================================================
	interface VersionInfo {
		number: number;
		created_by_name: string | null;
		created_at: string;
		window: { started_at: string; ended_at: string } | null;
		snapshot_hash: string | null;
	}

	// ============================================================
	// PROPS
	// ============================================================
	interface Props {
		isOpen: boolean;
		documentId: string;
		projectId: string;
		version: VersionInfo;
		expectedUpdatedAt: string | null;
		onBeforeRestore?: () => Promise<string | null>;
		onRestoreStateChange?: (restoring: boolean) => void;
		onClose?: () => void;
		onRestored?: () => void | Promise<void>;
	}

	let {
		isOpen = $bindable(false),
		documentId,
		projectId,
		version,
		expectedUpdatedAt,
		onBeforeRestore,
		onRestoreStateChange,
		onClose,
		onRestored
	}: Props = $props();

	// ============================================================
	// STATE
	// ============================================================
	let isRestoring = $state(false);
	let confirmed = $state(false);
	let error = $state<string | null>(null);
	let disposed = false;
	let controller: AbortController | null = null;
	let refreshingRestoredDocument = false;
	onDestroy(() => {
		disposed = true;
		controller?.abort();
		if (!refreshingRestoredDocument) onRestoreStateChange?.(false);
	});

	// ============================================================
	// EFFECTS
	// ============================================================
	$effect(() => {
		// A confirmation belongs to this document and version, including when a
		// caller reuses the component for another target while a request is pending.
		const identity = [isOpen, documentId, projectId, version.number, version.snapshot_hash];
		void identity;
		untrack(() => {
			controller?.abort();
			controller = null;
			if (isRestoring && !refreshingRestoredDocument) onRestoreStateChange?.(false);
			isRestoring = false;
			refreshingRestoredDocument = false;
			confirmed = false;
			error = null;
		});
	});

	// ============================================================
	// FUNCTIONS
	// ============================================================
	async function handleRestore() {
		if (!isOpen || !confirmed || isRestoring) return;
		const target = {
			documentId,
			projectId,
			number: version.number,
			hash: version.snapshot_hash
		};
		const request = new AbortController();
		controller?.abort();
		controller = request;
		const isCurrent = () =>
			!disposed &&
			isOpen &&
			!request.signal.aborted &&
			controller === request &&
			documentId === target.documentId &&
			projectId === target.projectId &&
			version.number === target.number &&
			version.snapshot_hash === target.hash;
		isRestoring = true;
		onRestoreStateChange?.(true);
		error = null;

		try {
			const saveToken = onBeforeRestore ? await onBeforeRestore() : expectedUpdatedAt;
			if (!isCurrent()) return;
			if (!saveToken) {
				throw new Error(
					'The current document could not be saved to history. Resolve its save warning before restoring.'
				);
			}
			const response = await fetch(
				`/api/onto/documents/${target.documentId}/versions/${target.number}/restore`,
				{
					method: 'POST',
					signal: request.signal,
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						expected_updated_at: saveToken,
						...(target.hash ? { expected_snapshot_hash: target.hash } : {})
					})
				}
			);
			const payload = await response.json();
			if (!isCurrent()) return;
			if (!response.ok) {
				throw new Error(
					payload?.error ||
						(response.status === 409
							? 'The document changed. Close this dialog and review it again before restoring.'
							: 'Failed to restore version')
				);
			}
			if (payload?.data?.document?.id !== target.documentId) {
				throw new Error(
					'The restore result could not be confirmed. Reload the document to check its saved state.'
				);
			}
			const warning = payload?.data?.version_warning;
			if (typeof warning === 'string' && warning.trim()) toastService.warning(warning);
			else toastService.success(`Document restored to version ${target.number}`);
			refreshingRestoredDocument = true;
			await onRestored?.();
			if (isCurrent()) {
				isRestoring = false;
				onRestoreStateChange?.(false);
				isOpen = false;
			}
		} catch (err) {
			if (!isCurrent()) return;
			void logOntologyClientError(err, {
				endpoint: `/api/onto/documents/${target.documentId}/versions/${target.number}/restore`,
				method: 'POST',
				projectId: target.projectId,
				entityType: 'document',
				entityId: target.documentId,
				operation: 'version_restore',
				metadata: { versionNumber: target.number }
			});
			error = err instanceof Error ? err.message : 'Failed to restore version';
		} finally {
			if (isCurrent()) {
				isRestoring = false;
				onRestoreStateChange?.(false);
			}
		}
	}

	function handleClose() {
		if (!isRestoring) {
			isOpen = false;
			onClose?.();
		}
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<Modal
	bind:isOpen
	onClose={handleClose}
	onBeforeClose={() => !isRestoring}
	size="sm"
	closeOnBackdrop={!isRestoring}
	closeOnEscape={!isRestoring}
>
	{#snippet header()}
		<div
			class="flex-shrink-0 bg-warning/10 border-b border-warning/30 px-4 py-3 flex items-center gap-3"
		>
			<div
				class="flex h-10 w-10 items-center justify-center rounded-full bg-warning/15 text-warning"
			>
				<RotateCcw class="w-5 h-5" />
			</div>
			<div>
				<h2 class="text-base font-semibold text-foreground">Restore Version</h2>
				<p class="text-xs text-muted-foreground">This will overwrite current content</p>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="p-4 space-y-4">
			<!-- Warning -->
			<div
				class="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30"
			>
				<AlertTriangle class="w-5 h-5 text-warning shrink-0 mt-0.5" />
				<div class="text-sm text-warning">
					<p class="font-medium mb-1">This action will overwrite the current document.</p>
					<p class="text-warning">
						Your current edits will be saved to history first. The document will then be
						replaced with version
						{version.number}. The restore will also be recorded in history.
					</p>
				</div>
			</div>

			<!-- Version details -->
			<div class="rounded-lg border border-border bg-muted p-3 space-y-2">
				<h3 class="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">
					Target Version
				</h3>
				<div class="space-y-1.5 text-sm">
					<div class="flex items-center gap-2 text-muted-foreground">
						<Hash class="w-4 h-4" />
						<span>
							Version <span class="font-mono font-semibold text-foreground"
								>{version.number}</span
							>
						</span>
					</div>
					<div class="flex items-center gap-2 text-muted-foreground">
						<User class="w-4 h-4" />
						<span>{version.created_by_name || 'Unknown author'}</span>
					</div>
					<div class="flex items-center gap-2 text-muted-foreground">
						<Clock class="w-4 h-4" />
						<span>
							{formatDate(version.window?.ended_at || version.created_at)}
						</span>
					</div>
					{#if version.snapshot_hash}
						<div class="flex items-center gap-2 text-muted-foreground/70">
							<span class="font-mono text-xs">
								Hash: {version.snapshot_hash.slice(0, 12)}...
							</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- Confirmation checkbox -->
			<label class="flex items-start gap-3 cursor-pointer group">
				<input
					type="checkbox"
					bind:checked={confirmed}
					disabled={isRestoring}
					class="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent/50 disabled:opacity-50"
				/>
				<span
					class="text-sm text-muted-foreground group-hover:text-foreground transition-colors"
				>
					I understand this will overwrite the current document content with version
					{version.number}
				</span>
			</label>

			<!-- Error message -->
			{#if error}
				<div
					class="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30"
				>
					<AlertTriangle class="w-4 h-4 text-destructive shrink-0 mt-0.5" />
					<span class="text-sm text-destructive">{error}</span>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<div
			class="flex items-center justify-end gap-3 px-3 sm:px-4 py-3 border-t border-border bg-muted/30"
		>
			<Button variant="ghost" size="sm" onclick={handleClose} disabled={isRestoring}>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				onclick={handleRestore}
				disabled={!confirmed || isRestoring}
				class="bg-warning hover:bg-warning/90 text-warning-foreground"
			>
				{#if isRestoring}
					<LoaderCircle class="w-4 h-4 mr-1.5 animate-spin" />
					Restoring...
				{:else}
					<RotateCcw class="w-4 h-4 mr-1.5" />
					Restore Version
				{/if}
			</Button>
		</div>
	{/snippet}
</Modal>
