<!-- apps/web/src/lib/components/ontology/ProjectImageLibrary.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { Eye, RefreshCw } from 'lucide-svelte';
	import type { OntologyImageAsset } from './image-assets/types';

	interface Props {
		projectId: string;
		limit?: number;
		compact?: boolean;
		pickerMode?: boolean;
		selectLabel?: string;
		offset?: number;
		excludedAssetIds?: string[];
		emptyMessage?: string;
		showHeader?: boolean;
		title?: string;
		ocrStatus?: string | null;
		onSelectAsset?: (asset: OntologyImageAsset) => void;
		onOpenAsset?: (asset: OntologyImageAsset) => void;
		onAssetsLoaded?: (assets: OntologyImageAsset[]) => void;
	}

	let {
		projectId,
		limit = 100,
		compact = false,
		pickerMode = false,
		selectLabel = 'Select',
		offset = 0,
		excludedAssetIds = [],
		emptyMessage = 'No project images available.',
		showHeader = false,
		title = 'Project images',
		ocrStatus = null,
		onSelectAsset,
		onOpenAsset,
		onAssetsLoaded
	}: Props = $props();

	let assets = $state<OntologyImageAsset[]>([]);
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);

	const excludedIds = $derived.by(() => new Set(excludedAssetIds.map((id) => id.toLowerCase())));

	const visibleAssets = $derived.by(() =>
		assets.filter((asset) => !excludedIds.has(asset.id.toLowerCase()))
	);

	function assetTitle(asset: OntologyImageAsset): string {
		return (
			asset.caption?.trim() ||
			asset.alt_text?.trim() ||
			asset.original_filename?.trim() ||
			asset.id
		);
	}

	async function loadAssets() {
		if (!projectId) return;
		loading = true;
		errorMessage = null;
		try {
			const params = new URLSearchParams({
				project_id: projectId,
				limit: String(limit),
				offset: String(offset)
			});
			if (ocrStatus) {
				params.set('ocr_status', ocrStatus);
			}
			const response = await fetch(`/api/onto/assets?${params.toString()}`);
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to load project images');
			}

			assets = Array.isArray(payload?.data?.assets) ? payload.data.assets : [];
			onAssetsLoaded?.(assets);
		} catch (loadError) {
			errorMessage =
				loadError instanceof Error ? loadError.message : 'Failed to load project images';
			toastService.error(errorMessage);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (!projectId) return;
		void loadAssets();
	});
</script>

<section class="space-y-2">
	{#if showHeader}
		<div class="flex items-center justify-between gap-2">
			<h3 class="text-sm font-semibold text-foreground">{title}</h3>
			<div class="flex items-center gap-1.5">
				<span class="text-xs text-muted-foreground">{visibleAssets.length}</span>
				<Button
					size="sm"
					variant="ghost"
					class="h-6 px-1.5"
					onclick={() => void loadAssets()}
					title="Refresh image library"
				>
					<RefreshCw class="h-3.5 w-3.5" />
				</Button>
			</div>
		</div>
	{/if}

	{#if loading}
		<p class="text-xs text-muted-foreground">Loading images...</p>
	{:else if errorMessage}
		<p class="text-xs text-destructive">{errorMessage}</p>
	{:else if visibleAssets.length === 0}
		<p class="text-xs text-muted-foreground">{emptyMessage}</p>
	{:else}
		<div class="space-y-2">
			{#each visibleAssets.slice(0, compact ? 10 : visibleAssets.length) as asset}
				<div
					class="flex items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1.5"
				>
					<div class="min-w-0 flex items-center gap-2">
						<img
							src={`/api/onto/assets/${asset.id}/render?width=${compact ? 72 : 120}`}
							alt={asset.alt_text ?? 'Image preview'}
							class="h-9 w-9 rounded border border-border object-cover"
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
							onclick={() => onOpenAsset?.(asset)}
							title="View image details"
						>
							<Eye class="h-3.5 w-3.5" />
						</Button>
						{#if pickerMode}
							<Button
								size="sm"
								variant="secondary"
								class="h-6 px-2 text-[11px]"
								onclick={() => onSelectAsset?.(asset)}
							>
								{selectLabel}
							</Button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>
