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
	- latestVersionNumber: The current latest version number (for conflict check)
	- onClose: Callback when modal is closed
	- onRestored: Callback after successful restore
-->
<script lang="ts">
	import { RotateCcw, AlertTriangle, LoaderCircle, User, Clock, Hash } from 'lucide-svelte';
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
		latestVersionNumber: number;
		onClose?: () => void;
		onRestored?: () => void;
	}

	let {
		isOpen = $bindable(false),
		documentId,
		projectId,
		version,
		latestVersionNumber,
		onClose,
		onRestored
	}: Props = $props();

	// ============================================================
	// STATE
	// ============================================================
	let isRestoring = $state(false);
	let confirmed = $state(false);
	let error = $state<string | null>(null);

	// ============================================================
	// EFFECTS
	// ============================================================
	$effect(() => {
		if (isOpen) {
			// Reset state when modal opens
			confirmed = false;
			error = null;
		}
	});

	// ============================================================
	// FUNCTIONS
	// ============================================================
	async function handleRestore() {
		if (!confirmed || isRestoring) return;

		isRestoring = true;
		error = null;

		try {
			const response = await fetch(
				`/api/onto/documents/${documentId}/versions/${version.number}/restore`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						expected_version: latestVersionNumber
					})
				}
			);

			const payload = await response.json();

			if (!response.ok) {
				if (response.status === 409) {
					// Version conflict
					throw new Error(
						'The document has been modified since you opened this dialog. Please close and try again.'
					);
				}
				throw new Error(payload?.error || 'Failed to restore version');
			}

			toastService.success(`Document restored to version ${version.number}`);
			isOpen = false;
			onRestored?.();
		} catch (err) {
			console.error('[RestoreModal] Failed to restore:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/documents/${documentId}/versions/${version.number}/restore`,
				method: 'POST',
				projectId,
				entityType: 'document',
				entityId: documentId,
				operation: 'version_restore',
				metadata: { versionNumber: version.number }
			});
			error = err instanceof Error ? err.message : 'Failed to restore version';
		} finally {
			isRestoring = false;
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

<Modal bind:isOpen onClose={handleClose} size="sm" closeOnBackdrop={!isRestoring}>
	{#snippet header()}
		<div
			class="flex-shrink-0 bg-amber-50/50 dark:bg-amber-900/10 border-b border-amber-200/50 dark:border-amber-800/50 px-4 py-3 flex items-center gap-3"
		>
			<div
				class="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
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
				class="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/50"
			>
				<AlertTriangle
					class="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
				/>
				<div class="text-sm text-amber-800 dark:text-amber-200">
					<p class="font-medium mb-1">This action will overwrite the current document.</p>
					<p class="text-amber-700 dark:text-amber-300">
						The document content will be replaced with the content from version
						{version.number}. A new version will be created to track this restore.
					</p>
				</div>
			</div>

			<!-- Version details -->
			<div class="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
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
				<span class="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
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
			class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30"
		>
			<Button
				variant="ghost"
				size="sm"
				onclick={handleClose}
				disabled={isRestoring}
			>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="sm"
				onclick={handleRestore}
				disabled={!confirmed || isRestoring}
				class="bg-amber-600 hover:bg-amber-700 text-white"
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
