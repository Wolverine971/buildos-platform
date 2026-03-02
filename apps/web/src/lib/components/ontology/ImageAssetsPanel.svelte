<!-- apps/web/src/lib/components/ontology/ImageAssetsPanel.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { Upload, Link2, Unlink, Eye, ImageIcon } from 'lucide-svelte';
	import ImageUploadModal from './ImageUploadModal.svelte';
	import ProjectImageLibrary from './ProjectImageLibrary.svelte';
	import AssetDetailModal from './AssetDetailModal.svelte';
	import type { AssetLinkRole, OntologyImageAsset } from './image-assets/types';

	interface Props {
		projectId: string;
		entityKind?: string | null;
		entityId?: string | null;
		showTitle?: boolean;
		title?: string;
		canEdit?: boolean;
		compact?: boolean;
		linkRole?: AssetLinkRole;
		filterScope?: 'entity' | 'project';
		pickerMode?: boolean;
		selectLabel?: string;
		showUploadButton?: boolean;
		onSelectAsset?: (asset: OntologyImageAsset) => void;
		onChanged?: () => void;
	}

	let {
		projectId,
		entityKind = null,
		entityId = null,
		showTitle = true,
		title = 'Images',
		canEdit = true,
		compact = false,
		linkRole = 'attachment',
		filterScope = 'entity',
		pickerMode = false,
		selectLabel = 'Insert',
		showUploadButton = true,
		onSelectAsset,
		onChanged
	}: Props = $props();

	let assets = $state<OntologyImageAsset[]>([]);
	let loading = $state(false);
	let showAttachExisting = $state(false);
	let showUploadModal = $state(false);
	let showAssetDetailModal = $state(false);
	let activeAssetId = $state<string | null>(null);

	const hasEntityBinding = $derived(Boolean(entityKind && entityId));
	const isEntityFiltered = $derived(Boolean(hasEntityBinding && filterScope === 'entity'));

	function assetTitle(asset: OntologyImageAsset): string {
		return (
			asset.caption?.trim() ||
			asset.alt_text?.trim() ||
			asset.original_filename?.trim() ||
			asset.id
		);
	}

	async function fetchAssets() {
		loading = true;
		try {
			const params = new URLSearchParams({ project_id: projectId, limit: '100' });
			if (isEntityFiltered && entityKind && entityId) {
				params.set('entity_kind', entityKind);
				params.set('entity_id', entityId);
				params.set('role', linkRole);
			}

			const response = await fetch(`/api/onto/assets?${params.toString()}`);
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to load images');
			}

			assets = Array.isArray(payload?.data?.assets) ? payload.data.assets : [];
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Failed to load images');
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (!projectId) return;
		void fetchAssets();
	});

	async function linkAsset(assetId: string, role: AssetLinkRole = linkRole) {
		if (!entityKind || !entityId) return;
		const response = await fetch(`/api/onto/assets/${assetId}/links`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				entity_kind: entityKind,
				entity_id: entityId,
				role
			})
		});
		const payload = await response.json().catch(() => null);
		if (!response.ok) {
			throw new Error(payload?.error ?? 'Failed to attach image');
		}
	}

	async function handleAttachExisting(asset: OntologyImageAsset) {
		try {
			await linkAsset(asset.id);
			toastService.success('Image attached');
			showAttachExisting = false;
			await fetchAssets();
			onChanged?.();
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Failed to attach image');
		}
	}

	async function handleSelectAsset(asset: OntologyImageAsset) {
		try {
			if (entityKind && entityId && canEdit) {
				await linkAsset(asset.id, linkRole);
			}
			onSelectAsset?.(asset);
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Failed to select image');
		}
	}

	async function handleUnlink(assetId: string) {
		if (!entityKind || !entityId) return;
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
			await fetchAssets();
			onChanged?.();
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Failed to detach image');
		}
	}

	async function handleUploadComplete(asset: OntologyImageAsset) {
		await fetchAssets();
		onChanged?.();
		if (pickerMode) {
			onSelectAsset?.(asset);
		}
	}

	async function handleAssetMutated() {
		await fetchAssets();
		onChanged?.();
	}

	function openAssetDetail(assetId: string) {
		activeAssetId = assetId;
		showAssetDetailModal = true;
	}

	export function openUploadModal() {
		showUploadModal = true;
	}
</script>

<section class="space-y-2">
	{#if showTitle}
		<div class="flex items-center justify-between px-0.5">
			<h3 class="text-sm font-semibold text-foreground">{title}</h3>
			{#if assets.length > 0}
				<span class="micro-label text-muted-foreground">{assets.length}</span>
			{/if}
		</div>
	{/if}

	{#if (showUploadButton && canEdit) || (hasEntityBinding && canEdit && !pickerMode)}
		<div class="flex flex-wrap items-center gap-1.5">
			{#if showUploadButton && canEdit}
				<Button
					size="sm"
					variant="outline"
					class="h-7 px-2 text-xs pressable"
					onclick={() => (showUploadModal = true)}
				>
					<Upload class="h-3.5 w-3.5" />
					Upload
				</Button>
			{/if}

			{#if hasEntityBinding && canEdit && !pickerMode}
				<Button
					size="sm"
					variant="outline"
					class="h-7 px-2 text-xs pressable"
					onclick={() => (showAttachExisting = !showAttachExisting)}
				>
					<Link2 class="h-3.5 w-3.5" />
					Attach existing
				</Button>
			{/if}
		</div>
	{/if}

	{#if showAttachExisting && hasEntityBinding && !pickerMode}
		<div class="rounded-lg border border-border bg-muted/30 p-2 tx tx-thread tx-weak">
			<ProjectImageLibrary
				{projectId}
				pickerMode={true}
				{compact}
				selectLabel="Attach"
				excludedAssetIds={assets.map((asset) => asset.id)}
				emptyMessage="No available project images to attach."
				onSelectAsset={handleAttachExisting}
				onOpenAsset={(asset) => openAssetDetail(asset.id)}
			/>
		</div>
	{/if}

	{#if loading}
		<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
			{#each { length: compact ? 2 : 4 } as _}
				<div class="rounded-lg border border-border bg-muted overflow-hidden">
					<div class="aspect-[4/3] animate-pulse bg-muted"></div>
					<div class="px-2 py-1.5 space-y-1 border-t border-border">
						<div class="h-3 w-3/4 rounded bg-muted-foreground/10 animate-pulse"></div>
						<div class="h-2.5 w-1/2 rounded bg-muted-foreground/10 animate-pulse"></div>
					</div>
				</div>
			{/each}
		</div>
	{:else if pickerMode}
		<ProjectImageLibrary
			{projectId}
			pickerMode={true}
			{compact}
			{selectLabel}
			emptyMessage="No project images available yet."
			onSelectAsset={handleSelectAsset}
			onOpenAsset={(asset) => openAssetDetail(asset.id)}
		/>
	{:else if assets.length === 0}
		<div
			class="flex flex-col items-center justify-center py-6 border-2 border-dashed border-border rounded-lg"
		>
			<ImageIcon class="w-6 h-6 text-muted-foreground mb-2" />
			<p class="text-xs text-muted-foreground">No images yet</p>
			{#if showUploadButton && canEdit}
				<Button
					size="sm"
					variant="outline"
					class="mt-3 h-7 px-3 text-xs pressable"
					onclick={() => (showUploadModal = true)}
				>
					<Upload class="h-3.5 w-3.5" />
					Upload first image
				</Button>
			{/if}
		</div>
	{:else}
		<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
			{#each assets as asset (asset.id)}
				<div
					class="group rounded-lg border border-border overflow-hidden shadow-ink tx tx-thread tx-weak wt-paper
						hover:border-accent/50 hover:shadow-ink-strong transition-all"
				>
					<button
						class="block w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
						onclick={() => openAssetDetail(asset.id)}
					>
						<img
							src={`/api/onto/assets/${asset.id}/render?width=240`}
							alt={asset.alt_text ?? 'Image preview'}
							class="aspect-[4/3] w-full object-cover bg-muted"
							loading="lazy"
						/>
					</button>
					<div class="px-2 py-1.5 border-t border-border bg-card">
						<div class="flex items-center justify-between gap-1">
							<p class="truncate text-xs font-medium text-foreground min-w-0">
								{assetTitle(asset)}
							</p>
							<div
								class="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
							>
								<button
									class="rounded p-0.5 hover:bg-muted transition-colors"
									onclick={() => openAssetDetail(asset.id)}
									title="View details"
								>
									<Eye class="h-3.5 w-3.5 text-muted-foreground" />
								</button>
								{#if hasEntityBinding && canEdit}
									<button
										class="rounded p-0.5 hover:bg-muted transition-colors"
										onclick={() => handleUnlink(asset.id)}
										title="Detach image"
									>
										<Unlink class="h-3.5 w-3.5 text-muted-foreground" />
									</button>
								{/if}
							</div>
						</div>
						<p class="text-[10px] text-muted-foreground mt-0.5">
							{asset.ocr_status === 'complete' ? 'OCR complete' : asset.ocr_status || 'pending'}
						</p>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>

<ImageUploadModal
	bind:isOpen={showUploadModal}
	{projectId}
	{entityKind}
	{entityId}
	{linkRole}
	onUploaded={handleUploadComplete}
	onClose={() => (showUploadModal = false)}
/>

<AssetDetailModal
	bind:isOpen={showAssetDetailModal}
	{projectId}
	assetId={activeAssetId}
	{entityKind}
	{entityId}
	{linkRole}
	{canEdit}
	onUpdated={() => void handleAssetMutated()}
	onDeleted={() => void handleAssetMutated()}
	onClose={() => {
		showAssetDetailModal = false;
		activeAssetId = null;
	}}
/>
