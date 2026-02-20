<!-- apps/web/src/lib/components/ontology/AssetDetailModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { Save, RefreshCw, Trash2, Unlink } from 'lucide-svelte';
	import type {
		AssetLinkRole,
		OntologyAssetLink,
		OntologyImageAsset
	} from './image-assets/types';

	interface Props {
		isOpen?: boolean;
		projectId: string;
		assetId: string | null;
		entityKind?: string | null;
		entityId?: string | null;
		linkRole?: AssetLinkRole;
		canEdit?: boolean;
		onUpdated?: () => void;
		onDeleted?: () => void;
		onClose?: () => void;
	}

	let {
		isOpen = $bindable(false),
		projectId,
		assetId,
		entityKind = null,
		entityId = null,
		linkRole = 'attachment',
		canEdit = true,
		onUpdated,
		onDeleted,
		onClose
	}: Props = $props();

	let loading = $state(false);
	let saving = $state(false);
	let queueing = $state(false);
	let deleting = $state(false);
	let unlinking = $state(false);
	let asset = $state<OntologyImageAsset | null>(null);
	let links = $state<OntologyAssetLink[]>([]);
	let formError = $state<string | null>(null);
	let lastLoadedId = $state<string | null>(null);

	let showDeleteConfirm = $state(false);
	let caption = $state('');
	let altText = $state('');
	let extractedText = $state('');
	let summary = $state('');

	function closeModal() {
		if (saving || deleting || queueing || unlinking) return;
		isOpen = false;
		onClose?.();
	}

	function hydrateFields(nextAsset: OntologyImageAsset) {
		caption = nextAsset.caption ?? '';
		altText = nextAsset.alt_text ?? '';
		extractedText = nextAsset.extracted_text ?? '';
		summary = nextAsset.extraction_summary ?? '';
	}

	async function loadAsset(id: string) {
		loading = true;
		formError = null;
		try {
			const response = await fetch(`/api/onto/assets/${id}`);
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to load image details');
			}
			asset = payload?.data?.asset ?? null;
			links = Array.isArray(payload?.data?.links) ? payload.data.links : [];
			if (!asset) {
				throw new Error('Asset not found');
			}
			if (asset.project_id !== projectId) {
				throw new Error('Asset does not belong to this project');
			}
			hydrateFields(asset);
			lastLoadedId = id;
		} catch (error) {
			formError = error instanceof Error ? error.message : 'Failed to load image details';
			toastService.error(formError);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (!isOpen || !assetId) return;
		if (lastLoadedId !== assetId) {
			void loadAsset(assetId);
		}
	});

	$effect(() => {
		if (!isOpen) {
			asset = null;
			links = [];
			lastLoadedId = null;
			formError = null;
		}
	});

	async function saveChanges() {
		if (!assetId || !canEdit) return;
		saving = true;
		formError = null;
		try {
			const [metadataResponse, ocrResponse] = await Promise.all([
				fetch(`/api/onto/assets/${assetId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						caption: caption.trim() || null,
						alt_text: altText.trim() || null
					})
				}),
				fetch(`/api/onto/assets/${assetId}/ocr`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						extracted_text: extractedText,
						extraction_summary: summary
					})
				})
			]);

			const [metadataPayload, ocrPayload] = await Promise.all([
				metadataResponse.json().catch(() => null),
				ocrResponse.json().catch(() => null)
			]);

			if (!metadataResponse.ok) {
				throw new Error(metadataPayload?.error ?? 'Failed to update image metadata');
			}
			if (!ocrResponse.ok) {
				throw new Error(ocrPayload?.error ?? 'Failed to update OCR text');
			}

			asset = ocrPayload?.data?.asset ?? metadataPayload?.data?.asset ?? asset;
			if (asset) hydrateFields(asset);
			onUpdated?.();
			toastService.success('Image details saved');
		} catch (error) {
			formError = error instanceof Error ? error.message : 'Failed to save image details';
			toastService.error(formError);
		} finally {
			saving = false;
		}
	}

	async function reprocessOcr(forceOverwrite = false) {
		if (!assetId || !canEdit) return;
		queueing = true;
		try {
			const response = await fetch(`/api/onto/assets/${assetId}/ocr/reprocess`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ force_overwrite: forceOverwrite })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to queue OCR reprocess');
			}
			toastService.success('OCR reprocess queued');
			onUpdated?.();
			if (assetId) {
				await loadAsset(assetId);
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to queue OCR reprocess';
			formError = message;
			toastService.error(message);
		} finally {
			queueing = false;
		}
	}

	async function unlinkFromEntity() {
		if (!assetId || !entityKind || !entityId) return;
		unlinking = true;
		try {
			const params = new URLSearchParams({
				entity_kind: entityKind,
				entity_id: entityId,
				role: linkRole
			});
			const response = await fetch(`/api/onto/assets/${assetId}/links?${params.toString()}`, {
				method: 'DELETE'
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to detach image');
			}
			toastService.success('Image detached');
			onUpdated?.();
			closeModal();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to detach image';
			formError = message;
			toastService.error(message);
		} finally {
			unlinking = false;
		}
	}

	async function handleDeleteConfirmed() {
		if (!assetId || !canEdit) return;
		deleting = true;
		try {
			const response = await fetch(`/api/onto/assets/${assetId}`, { method: 'DELETE' });
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to delete image');
			}
			toastService.success('Image deleted');
			showDeleteConfirm = false;
			onDeleted?.();
			onUpdated?.();
			closeModal();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to delete image';
			formError = message;
			toastService.error(message);
		} finally {
			deleting = false;
		}
	}

	const modalTitle = $derived(
		asset?.caption?.trim() ||
			asset?.alt_text?.trim() ||
			asset?.original_filename ||
			'Image details'
	);
</script>

<Modal bind:isOpen title={modalTitle} size="xl" onClose={closeModal}>
	{#snippet children()}
		<div class="space-y-3 px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
			{#if formError}
				<p
					class="rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive tx tx-static tx-weak"
				>
					{formError}
				</p>
			{/if}

			{#if loading}
				<p class="text-xs text-muted-foreground">Loading image details...</p>
			{:else if asset}
				<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
					<div class="space-y-2">
						<div
							class="rounded-lg border border-border bg-muted/20 p-2 shadow-ink-inner tx tx-frame tx-weak"
						>
							<img
								src={`/api/onto/assets/${asset.id}/render?width=1200`}
								alt={asset.alt_text ?? 'Image preview'}
								class="max-h-[28rem] w-full rounded object-contain"
							/>
						</div>
						<div
							class="flex items-center gap-3 rounded-lg border border-border bg-card px-2 py-1.5 tx tx-thread tx-weak"
						>
							<p class="micro-label text-muted-foreground">
								OCR: {asset.ocr_status || 'pending'}
							</p>
							<p class="micro-label text-muted-foreground">Links: {links.length}</p>
						</div>
					</div>

					<div class="space-y-2">
						<div class="space-y-1">
							<label
								for="asset-caption"
								class="text-[11px] font-medium text-muted-foreground">Caption</label
							>
							<div class="relative tx tx-grid tx-weak rounded-lg overflow-hidden">
								<input
									id="asset-caption"
									type="text"
									class="relative z-[2] w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-ring outline-none transition-colors"
									bind:value={caption}
									disabled={!canEdit || saving}
								/>
							</div>
						</div>

						<div class="space-y-1">
							<label
								for="asset-alt"
								class="text-[11px] font-medium text-muted-foreground"
								>Alt text</label
							>
							<div class="relative tx tx-grid tx-weak rounded-lg overflow-hidden">
								<input
									id="asset-alt"
									type="text"
									class="relative z-[2] w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-ring outline-none transition-colors"
									bind:value={altText}
									disabled={!canEdit || saving}
								/>
							</div>
						</div>

						<div class="space-y-1">
							<label
								for="asset-summary"
								class="text-[11px] font-medium text-muted-foreground">Summary</label
							>
							<div class="relative tx tx-grid tx-weak rounded-lg overflow-hidden">
								<textarea
									id="asset-summary"
									class="relative z-[2] min-h-16 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-ring outline-none resize-none transition-colors"
									bind:value={summary}
									disabled={!canEdit || saving}
								></textarea>
							</div>
						</div>

						<div class="space-y-1">
							<label
								for="asset-extracted"
								class="text-[11px] font-medium text-muted-foreground"
								>Extracted text</label
							>
							<div class="relative tx tx-grid tx-weak rounded-lg overflow-hidden">
								<textarea
									id="asset-extracted"
									class="relative z-[2] min-h-36 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-ring outline-none resize-none transition-colors"
									bind:value={extractedText}
									disabled={!canEdit || saving}
								></textarea>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<div
			class="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-border bg-muted/30"
		>
			<div class="flex items-center gap-2">
				{#if entityKind && entityId}
					<Button
						size="sm"
						variant="secondary"
						class="h-8 px-2 text-xs"
						onclick={unlinkFromEntity}
						disabled={unlinking || saving || deleting}
					>
						<Unlink class="h-3.5 w-3.5" />
						Detach
					</Button>
				{/if}
				{#if canEdit}
					<Button
						size="sm"
						variant="danger"
						class="h-8 px-2 text-xs"
						onclick={() => (showDeleteConfirm = true)}
						disabled={deleting || saving}
					>
						<Trash2 class="h-3.5 w-3.5" />
						Delete
					</Button>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				{#if canEdit}
					<Button
						size="sm"
						variant="secondary"
						class="h-8 px-2 text-xs"
						onclick={() => reprocessOcr(false)}
						disabled={queueing || saving}
					>
						<RefreshCw class="h-3.5 w-3.5" />
						Reprocess OCR
					</Button>
					<Button
						size="sm"
						variant="secondary"
						class="h-8 px-2 text-xs"
						onclick={saveChanges}
						disabled={saving || queueing}
					>
						<Save class="h-3.5 w-3.5" />
						Save
					</Button>
				{/if}
			</div>
		</div>
	{/snippet}
</Modal>

<ConfirmationModal
	isOpen={showDeleteConfirm}
	title="Delete image"
	confirmText="Delete image"
	confirmVariant="danger"
	loading={deleting}
	loadingText="Deleting..."
	icon="danger"
	onconfirm={handleDeleteConfirmed}
	oncancel={() => (showDeleteConfirm = false)}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			This will permanently delete this image and remove it from all linked entities.
		</p>
	{/snippet}
</ConfirmationModal>
