<!-- apps/web/src/lib/components/ontology/ImageAssetsPanel.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { Upload, Link2, Unlink, Eye } from 'lucide-svelte';
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

<section class="space-y-3">
	{#if showTitle}
		<div class="flex items-center justify-between">
			<h3 class="text-sm font-semibold text-foreground">{title}</h3>
			<span class="text-xs text-muted-foreground">{assets.length}</span>
		</div>
	{/if}

	{#if (showUploadButton && canEdit) || (hasEntityBinding && canEdit && !pickerMode)}
		<div class="flex flex-wrap items-center gap-2">
			{#if showUploadButton && canEdit}
				<Button
					size="sm"
					variant="secondary"
					class="h-7 px-2 text-xs"
					onclick={() => (showUploadModal = true)}
				>
					<Upload class="h-3.5 w-3.5" />
					Upload image
				</Button>
			{/if}

			{#if hasEntityBinding && canEdit && !pickerMode}
				<Button
					size="sm"
					variant="secondary"
					class="h-7 px-2 text-xs"
					onclick={() => (showAttachExisting = !showAttachExisting)}
				>
					<Link2 class="h-3.5 w-3.5" />
					Attach existing
				</Button>
			{/if}
		</div>
	{/if}

	{#if showAttachExisting && hasEntityBinding && !pickerMode}
		<div class="rounded-md border border-border bg-muted/30 p-2">
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
		<p class="text-xs text-muted-foreground">Loading images...</p>
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
		<p class="text-xs text-muted-foreground">No images yet.</p>
	{:else}
		<div class="space-y-2">
			{#each assets as asset}
				<div class="rounded-md border border-border bg-card p-2">
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0 flex items-center gap-2">
							<img
								src={`/api/onto/assets/${asset.id}/render?width=${compact ? 96 : 160}`}
								alt={asset.alt_text ?? 'Image preview'}
								class="h-10 w-10 rounded border border-border object-cover"
								loading="lazy"
							/>
							<div class="min-w-0">
								<p class="truncate text-xs font-medium text-foreground">
									{assetTitle(asset)}
								</p>
								<p class="text-[11px] text-muted-foreground">
									OCR: {asset.ocr_status || 'pending'}
								</p>
							</div>
						</div>
						<div class="flex items-center gap-1">
							<Button
								size="sm"
								variant="secondary"
								class="h-6 px-1.5"
								onclick={() => openAssetDetail(asset.id)}
								title="View image details"
							>
								<Eye class="h-3.5 w-3.5" />
							</Button>
							{#if hasEntityBinding && canEdit}
								<Button
									size="sm"
									variant="secondary"
									class="h-6 px-1.5"
									onclick={() => handleUnlink(asset.id)}
								>
									<Unlink class="h-3.5 w-3.5" />
								</Button>
							{/if}
						</div>
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
