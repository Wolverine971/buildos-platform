<!-- apps/web/src/lib/components/ontology/AssetDetailModal.svelte -->
<!--
	Image viewer: the image large, its name (editable inline), a meta line, and a
	Download button. Rare actions (re-read text, detach, delete) live in the ⋯ menu.
	With `assetIds`, arrows + a thumbnail strip step through the caller's images
	(also ← → keys and swipe); clicking the image zooms into that spot.
	OCR text, summary, and alt text still exist for search and agents; they are
	deliberately not shown here.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import Modal from '$lib/components/ui/Modal.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import {
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		Download,
		Folder,
		MoreHorizontal,
		Pencil,
		RefreshCw,
		Trash2,
		Unlink,
		X
	} from '$lib/icons/lucide';
	import type {
		AssetLinkRole,
		OntologyAssetLink,
		OntologyImageAsset
	} from './image-assets/types';

	interface Props {
		isOpen?: boolean;
		projectId: string;
		assetId: string | null;
		/**
		 * The images the viewer can step through, in display order. Arrows and a
		 * thumbnail strip appear when it holds 2+ images including the open one.
		 */
		assetIds?: string[] | null;
		entityKind?: string | null;
		entityId?: string | null;
		linkRole?: AssetLinkRole;
		canEdit?: boolean;
		/**
		 * Documents this image can be filed under (document tree). When set, the
		 * meta line shows an "In document" picker that moves the image's document
		 * attachment link; null placement means the tree's Images shelf.
		 */
		documentOptions?: Array<{ id: string; title: string; depth: number }> | null;
		onUpdated?: () => void;
		onDeleted?: () => void;
		onClose?: () => void;
	}

	let {
		isOpen = $bindable(false),
		projectId,
		assetId,
		assetIds = null,
		entityKind = null,
		entityId = null,
		linkRole = 'attachment',
		canEdit = true,
		documentOptions = null,
		onUpdated,
		onDeleted,
		onClose
	}: Props = $props();

	type AssetDetails = { asset: OntologyImageAsset; links: OntologyAssetLink[] };

	// Follows the caller's assetId; the arrows and thumbnails move it locally.
	let currentId = $derived(assetId);

	let saving = $state(false);
	let queueing = $state(false);
	let deleting = $state(false);
	let unlinking = $state(false);
	let placing = $state(false);
	let asset = $state<OntologyImageAsset | null>(null);
	let links = $state<OntologyAssetLink[]>([]);
	let formError = $state<string | null>(null);
	let lastLoadedId = $state<string | null>(null);
	let loadedImageId = $state<string | null>(null);
	let removedIds = $state<ReadonlySet<string>>(new Set());

	let showDeleteConfirm = $state(false);
	let showMenu = $state(false);
	let menuRef = $state<HTMLDivElement | null>(null);
	let nameInput = $state<HTMLInputElement | null>(null);
	let stripRef = $state<HTMLDivElement | null>(null);
	let caption = $state('');

	// Click-to-zoom: a click zooms into that spot, a mouse pans while zoomed, and
	// another click zooms back out. Nothing happens on plain hover.
	let zoomed = $state(false);
	let zoomScale = $state(2);
	let zoomOrigin = $state({ x: 50, y: 50 });
	let swipeStart: { x: number; y: number } | null = null;

	// Details already fetched this session, plus in-flight fetches (neighbor prefetch
	// and navigation share one request). Cleared when the viewer closes.
	const detailsCache = new Map<string, AssetDetails>();
	const detailsInflight = new Map<string, Promise<AssetDetails>>();
	const prefetchedImages = new Set<string>();

	// One look for every control so Download, ⋯, close and the arrows read as a set.
	const controlButton =
		'relative inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-muted-foreground shadow-ink pressable tx-button transition-colors hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
	const menuItemBase =
		'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
	const menuItem = `${menuItemBase} text-foreground hover:bg-muted`;
	const dangerMenuItem = `${menuItemBase} text-destructive hover:bg-destructive/10`;

	const imageSrc = (id: string) => `/api/onto/assets/${id}/render?width=2500`;
	const thumbnailSrc = (id: string) => `/api/onto/assets/${id}/render?width=192`;

	const gallery = $derived((assetIds ?? []).filter((id) => id && !removedIds.has(id)));
	const galleryIndex = $derived(currentId ? gallery.indexOf(currentId) : -1);
	const hasGallery = $derived(gallery.length > 1 && galleryIndex !== -1);
	// Header and actions only ever describe the image on screen.
	const shownAsset = $derived(asset && asset.id === currentId ? asset : null);
	const imageLoaded = $derived(Boolean(currentId) && loadedImageId === currentId);

	// A write acting on the image on screen holds the viewer on it: no closing and no stepping
	// (arrows, keys, swipe, thumbnails) until it settles. Renames capture their id, so they
	// don't lock; stepping away is how a pending rename gets committed.
	const locked = $derived(deleting || queueing || unlinking || placing);

	function closeModal() {
		if (locked) return;
		isOpen = false;
		onClose?.();
	}

	function fetchDetails(id: string): Promise<AssetDetails> {
		const pending = detailsInflight.get(id);
		if (pending) return pending;
		const request = (async () => {
			const response = await fetch(`/api/onto/assets/${id}`);
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to load image details');
			}
			const nextAsset: OntologyImageAsset | null = payload?.data?.asset ?? null;
			if (!nextAsset) throw new Error('Asset not found');
			if (nextAsset.project_id !== projectId) {
				throw new Error('Asset does not belong to this project');
			}
			const entry: AssetDetails = {
				asset: nextAsset,
				links: Array.isArray(payload?.data?.links) ? payload.data.links : []
			};
			detailsCache.set(id, entry);
			return entry;
		})();
		detailsInflight.set(id, request);
		void request.catch(() => undefined).finally(() => detailsInflight.delete(id));
		return request;
	}

	function showDetails(id: string, entry: AssetDetails) {
		asset = entry.asset;
		links = entry.links;
		caption = entry.asset.caption ?? '';
		lastLoadedId = id;
		formError = null;
	}

	async function loadAsset(id: string, options: { force?: boolean } = {}) {
		if (options.force) detailsCache.delete(id);
		const cached = detailsCache.get(id);
		if (cached) {
			showDetails(id, cached);
			return;
		}
		try {
			const entry = await fetchDetails(id);
			if (currentId === id) showDetails(id, entry);
		} catch (error) {
			if (currentId === id) {
				formError = error instanceof Error ? error.message : 'Failed to load image details';
				toastService.error(formError);
			}
		}
	}

	$effect(() => {
		if (!browser || !isOpen || !currentId) return;
		if (lastLoadedId !== currentId) {
			void loadAsset(currentId);
		}
	});

	// Warm both neighbors (pixels + details) so the arrows feel instant.
	$effect(() => {
		if (!browser || !isOpen || !hasGallery) return;
		const count = gallery.length;
		const neighbors = new Set([
			gallery[(galleryIndex + 1) % count],
			gallery[(galleryIndex - 1 + count) % count]
		]);
		for (const id of neighbors) {
			if (!id || id === currentId) continue;
			if (!prefetchedImages.has(id)) {
				prefetchedImages.add(id);
				new Image().src = imageSrc(id);
			}
			if (!detailsCache.has(id)) void fetchDetails(id).catch(() => undefined);
		}
	});

	// Keep the active thumbnail centered in the strip.
	$effect(() => {
		if (!stripRef || galleryIndex < 0) return;
		const thumb = stripRef.querySelector<HTMLElement>(`[data-index="${galleryIndex}"]`);
		if (!thumb) return;
		stripRef.scrollTo?.({
			left: thumb.offsetLeft - stripRef.clientWidth / 2 + thumb.clientWidth / 2,
			behavior: 'smooth'
		});
	});

	$effect(() => {
		if (!isOpen) {
			asset = null;
			links = [];
			lastLoadedId = null;
			loadedImageId = null;
			formError = null;
			showMenu = false;
			zoomed = false;
			removedIds = new Set();
			currentId = assetId;
			detailsCache.clear();
			prefetchedImages.clear();
		}
	});

	function goTo(id: string | undefined) {
		if (!id || id === currentId || locked) return;
		// Blurring commits a pending rename for the image being left.
		if (nameInput && document.activeElement === nameInput) nameInput.blur();
		showMenu = false;
		zoomed = false;
		currentId = id;
	}

	function step(delta: number) {
		if (!hasGallery) return;
		const count = gallery.length;
		goTo(gallery[(galleryIndex + delta + count) % count]);
	}

	/** After a delete/detach, show the next image instead of closing the gallery. */
	function dropCurrentAndAdvance(removedId: string) {
		detailsCache.delete(removedId);
		if (hasGallery) {
			const next = gallery[(galleryIndex + 1) % gallery.length];
			removedIds = new Set([...removedIds, removedId]);
			goTo(next);
			return;
		}
		closeModal();
	}

	/** Save the name on blur/Enter; a blank name falls back to the file name. */
	async function commitName() {
		const current = shownAsset;
		if (!current || !canEdit) return;
		const id = current.id;
		const nextCaption = caption.trim() || null;
		if (nextCaption === (current.caption?.trim() || null)) {
			caption = current.caption ?? '';
			return;
		}
		saving = true;
		formError = null;
		try {
			const response = await fetch(`/api/onto/assets/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ caption: nextCaption })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to rename image');
			}
			const updated: OntologyImageAsset = payload?.data?.asset ?? {
				...current,
				caption: nextCaption
			};
			const cached = detailsCache.get(id);
			if (cached) detailsCache.set(id, { ...cached, asset: updated });
			if (asset?.id === id) {
				asset = updated;
				caption = updated.caption ?? '';
			}
			onUpdated?.();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to rename image';
			if (asset?.id === id) {
				formError = message;
				caption = asset.caption ?? '';
			}
			toastService.error(message);
		} finally {
			saving = false;
		}
	}

	function handleNameKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			nameInput?.blur();
		} else if (event.key === 'Escape') {
			// Revert instead of closing the viewer (Modal skips handled Escapes).
			event.preventDefault();
			caption = shownAsset?.caption ?? '';
			nameInput?.blur();
		}
	}

	function startRename() {
		showMenu = false;
		nameInput?.focus();
		nameInput?.select();
	}

	async function reprocessOcr() {
		showMenu = false;
		const id = currentId;
		if (!id || !canEdit) return;
		queueing = true;
		try {
			const response = await fetch(`/api/onto/assets/${id}/ocr/reprocess`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ force_overwrite: false })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to re-read image text');
			}
			toastService.success('Re-reading image text');
			onUpdated?.();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to re-read image text';
			formError = message;
			toastService.error(message);
		} finally {
			queueing = false;
		}
	}

	async function unlinkFromEntity() {
		showMenu = false;
		const id = currentId;
		if (!id || !entityKind || !entityId) return;
		unlinking = true;
		try {
			const params = new URLSearchParams({
				entity_kind: entityKind,
				entity_id: entityId,
				role: linkRole
			});
			const response = await fetch(`/api/onto/assets/${id}/links?${params.toString()}`, {
				method: 'DELETE'
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to detach image');
			}
			toastService.success('Image detached');
			onUpdated?.();
			unlinking = false;
			dropCurrentAndAdvance(id);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to detach image';
			formError = message;
			toastService.error(message);
		} finally {
			unlinking = false;
		}
	}

	async function handleDeleteConfirmed() {
		const id = currentId;
		if (!id || !canEdit) return;
		deleting = true;
		try {
			const response = await fetch(`/api/onto/assets/${id}`, { method: 'DELETE' });
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to delete image');
			}
			toastService.success('Image deleted');
			showDeleteConfirm = false;
			onDeleted?.();
			onUpdated?.();
			deleting = false;
			dropCurrentAndAdvance(id);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to delete image';
			formError = message;
			toastService.error(message);
		} finally {
			deleting = false;
		}
	}

	const SHELF_PLACEMENT = '';
	const documentAttachmentLinks = $derived(
		links.filter((link) => link.entity_kind === 'document' && link.role === 'attachment')
	);
	// Match the tree: a link to a document the tree doesn't show counts as the shelf.
	const placementLinks = $derived(
		links.filter(
			(link) =>
				link.entity_kind === 'document' &&
				(!documentOptions || documentOptions.some((option) => option.id === link.entity_id))
		)
	);
	const currentDocumentId = $derived(
		placementLinks.find((link) => link.role === 'attachment')?.entity_id ??
			placementLinks[0]?.entity_id ??
			null
	);

	/** File the image under one document (or back on the shelf) via attachment links. */
	async function moveToDocument(nextDocumentId: string | null) {
		const id = currentId;
		// Capture this image's links now: `links` follows whatever image is on screen, and
		// deleting another image's links would leave this one attached to two documents.
		const previousLinks = documentAttachmentLinks;
		if (!id || asset?.id !== id || !canEdit || nextDocumentId === currentDocumentId) return;
		placing = true;
		formError = null;
		try {
			if (nextDocumentId) {
				const response = await fetch(`/api/onto/assets/${id}/links`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						entity_kind: 'document',
						entity_id: nextDocumentId,
						role: 'attachment'
					})
				});
				const payload = await response.json().catch(() => null);
				if (!response.ok) {
					throw new Error(payload?.error ?? 'Failed to move image');
				}
			}
			// Inline links mark embeds inside a document's content; only attachments move.
			for (const link of previousLinks) {
				if (link.entity_id === nextDocumentId) continue;
				const params = new URLSearchParams({
					entity_kind: 'document',
					entity_id: link.entity_id,
					role: 'attachment'
				});
				const response = await fetch(`/api/onto/assets/${id}/links?${params.toString()}`, {
					method: 'DELETE'
				});
				if (!response.ok) {
					const payload = await response.json().catch(() => null);
					throw new Error(payload?.error ?? 'Failed to move image');
				}
			}
			const destination = nextDocumentId
				? (documentOptions?.find((option) => option.id === nextDocumentId)?.title ??
					'document')
				: 'Images shelf';
			toastService.success(`Moved to ${destination}`);
			onUpdated?.();
			await loadAsset(id, { force: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to move image';
			formError = message;
			toastService.error(message);
			await loadAsset(id, { force: true });
		} finally {
			placing = false;
		}
	}

	function formatBytes(bytes: number | null | undefined): string | null {
		if (!bytes || bytes <= 0) return null;
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatType(contentType: string | null | undefined): string | null {
		const subtype = contentType?.split('/')[1]?.split('+')[0]?.toLowerCase();
		if (!subtype) return null;
		return subtype === 'jpeg' ? 'JPG' : subtype.toUpperCase();
	}

	const fallbackName = $derived(
		shownAsset?.alt_text?.trim() || shownAsset?.original_filename?.trim() || 'Untitled image'
	);
	const displayName = $derived(shownAsset?.caption?.trim() || fallbackName);
	const metaParts = $derived(
		shownAsset
			? [
					formatType(shownAsset.content_type),
					shownAsset.width && shownAsset.height
						? `${shownAsset.width} × ${shownAsset.height}`
						: null,
					formatBytes(shownAsset.file_size_bytes)
				].filter((part): part is string => Boolean(part))
			: []
	);
	const placementTitle = $derived(
		currentDocumentId
			? (documentOptions?.find((option) => option.id === currentDocumentId)?.title ??
					'Document')
			: 'Images shelf'
	);
	const hasMenu = $derived(canEdit || Boolean(entityKind && entityId));
	const busy = $derived(saving || deleting || queueing || unlinking || placing);

	function handleWindowClick(event: MouseEvent) {
		if (showMenu && menuRef && !menuRef.contains(event.target as Node)) {
			showMenu = false;
		}
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (!isOpen || !hasGallery || locked || showDeleteConfirm || event.defaultPrevented) {
			return;
		}
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		const target = event.target;
		if (
			target instanceof Element &&
			target.closest('input, textarea, select, [contenteditable="true"]')
		) {
			return;
		}
		event.preventDefault();
		step(event.key === 'ArrowRight' ? 1 : -1);
	}

	const clampPercent = (fraction: number) => Math.min(100, Math.max(0, fraction * 100));

	/** Pointer position on the unscaled image, as transform-origin percentages. */
	function pointOnImage(event: MouseEvent, image: HTMLImageElement) {
		const stage = image.offsetParent?.getBoundingClientRect();
		if (!stage) return zoomOrigin;
		// offset* ignore the zoom transform, so the point maps onto the unscaled image.
		return {
			x: clampPercent(
				(event.clientX - stage.left - image.offsetLeft) / Math.max(1, image.offsetWidth)
			),
			y: clampPercent(
				(event.clientY - stage.top - image.offsetTop) / Math.max(1, image.offsetHeight)
			)
		};
	}

	/** Zoom into the clicked spot, far enough to show real pixels (2×–4×); click again to leave. */
	function toggleZoom(event: MouseEvent) {
		if (zoomed) {
			zoomed = false;
			return;
		}
		const image = event.currentTarget as HTMLImageElement;
		zoomScale = Math.min(4, Math.max(2, image.naturalWidth / Math.max(1, image.offsetWidth)));
		zoomOrigin = pointOnImage(event, image);
		zoomed = true;
	}

	/** While zoomed, a mouse pans by moving across the image. */
	function panZoom(event: PointerEvent) {
		if (!zoomed || event.pointerType !== 'mouse') return;
		zoomOrigin = pointOnImage(event, event.currentTarget as HTMLImageElement);
	}

	function handleStagePointerDown(event: PointerEvent) {
		if (event.pointerType === 'mouse') return;
		swipeStart = { x: event.clientX, y: event.clientY };
	}

	function handleStagePointerUp(event: PointerEvent) {
		if (!swipeStart) return;
		// A zoomed image is being inspected; swiping must not change images under it.
		if (zoomed || locked) {
			swipeStart = null;
			return;
		}
		const dx = event.clientX - swipeStart.x;
		const dy = event.clientY - swipeStart.y;
		swipeStart = null;
		if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
			step(dx < 0 ? 1 : -1);
		}
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

{#snippet galleryBar()}
	<!-- Arrows hug the strip; with many images the strip grows until they reach the edges. -->
	<div
		class="relative z-10 flex justify-center border-t border-border bg-muted px-3 py-2 sm:px-4"
	>
		<div class="flex min-w-0 max-w-full items-center gap-2">
			<button
				type="button"
				class="{controlButton} w-11"
				onclick={() => step(-1)}
				disabled={locked}
				aria-label="Previous image"
				title="Previous (←)"
			>
				<ChevronLeft class="h-5 w-5" />
			</button>

			<div
				bind:this={stripRef}
				class="relative min-w-0 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				<div class="flex w-max gap-1.5 px-0.5">
					{#each gallery as id, index (id)}
						{@const active = index === galleryIndex}
						<button
							type="button"
							data-index={index}
							class="h-11 w-11 shrink-0 overflow-hidden rounded-md border bg-card transition-[opacity,box-shadow,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-12 sm:w-12 {active
								? 'border-accent opacity-100 ring-2 ring-accent/40'
								: 'border-border opacity-50 hover:opacity-100'}"
							onclick={() => goTo(id)}
							disabled={locked}
							aria-label={`Show image ${index + 1} of ${gallery.length}`}
							aria-current={active ? 'true' : undefined}
						>
							<img
								src={thumbnailSrc(id)}
								alt=""
								loading="lazy"
								decoding="async"
								class="h-full w-full object-cover"
							/>
						</button>
					{/each}
				</div>
			</div>

			<button
				type="button"
				class="{controlButton} w-11"
				onclick={() => step(1)}
				disabled={locked}
				aria-label="Next image"
				title="Next (→)"
			>
				<ChevronRight class="h-5 w-5" />
			</button>
		</div>
	</div>
{/snippet}

<Modal
	bind:isOpen
	size="full"
	onClose={closeModal}
	ariaLabel={shownAsset ? displayName : 'Image'}
	footer={hasGallery ? galleryBar : undefined}
>
	{#snippet header()}
		<div
			class="relative z-10 flex flex-shrink-0 items-center gap-2 border-b border-border bg-muted px-3 py-2 sm:px-4"
		>
			<div class="min-w-0 flex-1">
				{#if shownAsset && canEdit}
					<div class="group relative flex items-center">
						<input
							bind:this={nameInput}
							bind:value={caption}
							type="text"
							aria-label="Image name"
							placeholder={fallbackName}
							disabled={deleting}
							onblur={commitName}
							onkeydown={handleNameKeydown}
							class="w-full truncate rounded-md border border-transparent bg-transparent py-0.5 pl-1.5 pr-7 -ml-1.5 text-base font-semibold text-foreground outline-none transition-colors placeholder:text-foreground hover:border-border focus:border-accent focus:bg-background focus:ring-1 focus:ring-ring"
						/>
						<Pencil
							class="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-0"
						/>
					</div>
				{:else if shownAsset}
					<h2 class="truncate text-base font-semibold text-foreground">{displayName}</h2>
				{:else}
					<div class="my-1 h-4 w-48 max-w-full animate-pulse rounded bg-card"></div>
				{/if}

				<div
					class="mt-0.5 flex min-h-4 min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground"
				>
					{#if hasGallery}
						<span class="font-medium tabular-nums text-foreground"
							>{galleryIndex + 1} / {gallery.length}</span
						>
					{/if}
					{#if shownAsset}
						{#each metaParts as part, index (index)}
							{#if index > 0 || hasGallery}<span aria-hidden="true">·</span>{/if}
							<span class="tabular-nums">{part}</span>
						{/each}
						{#if documentOptions}
							{#if metaParts.length > 0 || hasGallery}<span aria-hidden="true">·</span
								>{/if}
							<!-- Visible label hugs the current placement; the native select sits
								 invisibly on top so the picker stays accessible and platform-native. -->
							<span
								class="relative inline-flex min-w-0 items-center gap-1 rounded px-1 -mx-1 font-medium text-foreground transition-colors hover:bg-card focus-within:ring-1 focus-within:ring-ring"
							>
								<Folder class="h-3 w-3 shrink-0 text-muted-foreground" />
								<span class="max-w-[14rem] truncate">{placementTitle}</span>
								<ChevronDown class="h-3 w-3 shrink-0 text-muted-foreground" />
								<select
									aria-label="In document"
									class="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
									value={currentDocumentId ?? SHELF_PLACEMENT}
									disabled={!canEdit || busy}
									onchange={(event) =>
										moveToDocument(
											event.currentTarget.value === SHELF_PLACEMENT
												? null
												: event.currentTarget.value
										)}
								>
									<option value={SHELF_PLACEMENT}>Images shelf</option>
									{#each documentOptions as option (option.id)}
										<option value={option.id}
											>{'  '.repeat(option.depth)}{option.title}</option
										>
									{/each}
								</select>
							</span>
						{/if}
					{/if}
				</div>
			</div>

			<div class="flex shrink-0 items-center gap-1.5">
				{#if shownAsset}
					<a
						href={`/api/onto/assets/${shownAsset.id}/render?download=1`}
						download
						class="{controlButton} px-3 text-sm font-semibold"
						aria-label="Download image"
						title="Download"
					>
						<Download class="h-4 w-4" />
						<span class="hidden sm:inline">Download</span>
					</a>
				{/if}

				{#if shownAsset && hasMenu}
					<div
						class="relative"
						bind:this={menuRef}
						onkeydown={(event) => {
							if (event.key === 'Escape' && showMenu) {
								event.preventDefault();
								showMenu = false;
							}
						}}
						role="presentation"
					>
						<button
							type="button"
							class="{controlButton} w-11"
							onclick={() => (showMenu = !showMenu)}
							disabled={busy}
							aria-label="More image actions"
							aria-haspopup="menu"
							aria-expanded={showMenu}
							title="More"
						>
							<MoreHorizontal class="h-4 w-4" />
						</button>

						{#if showMenu}
							<div
								class="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-ink-strong tx tx-frame tx-weak"
								role="menu"
							>
								{#if canEdit}
									<button
										type="button"
										class={menuItem}
										role="menuitem"
										onclick={startRename}
									>
										<Pencil
											class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
										/>
										Rename
									</button>
									<button
										type="button"
										class={menuItem}
										role="menuitem"
										onclick={reprocessOcr}
										disabled={queueing}
									>
										<RefreshCw
											class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
										/>
										Re-read image text
									</button>
								{/if}
								{#if entityKind && entityId}
									<button
										type="button"
										class={menuItem}
										role="menuitem"
										onclick={unlinkFromEntity}
										disabled={unlinking}
									>
										<Unlink
											class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
										/>
										Detach from {entityKind}
									</button>
								{/if}
								{#if canEdit}
									<div class="my-1 border-t border-border/60"></div>
									<button
										type="button"
										class={dangerMenuItem}
										role="menuitem"
										onclick={() => {
											showMenu = false;
											showDeleteConfirm = true;
										}}
									>
										<Trash2 class="h-3.5 w-3.5 shrink-0" />
										Delete image
									</button>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<button
					type="button"
					onclick={closeModal}
					class="{controlButton} w-11 hover:border-destructive/50 hover:text-destructive"
					aria-label="Close dialog"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		{#if formError}
			<p
				class="mx-3 mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive sm:mx-4"
			>
				{formError}
			</p>
		{/if}

		<!-- A fixed-height stage in gallery mode keeps the arrows still while stepping. -->
		<div
			class="relative z-[2] flex items-center justify-center overflow-hidden bg-muted/30 p-3 sm:p-6 {hasGallery
				? 'h-[min(60dvh,46rem)]'
				: 'min-h-[16rem]'} {imageLoaded ? '' : 'animate-pulse'}"
			aria-busy={!imageLoaded}
			onpointerdown={handleStagePointerDown}
			onpointerup={handleStagePointerUp}
			onpointercancel={() => (swipeStart = null)}
			role="presentation"
		>
			{#if currentId}
				{#key currentId}
					<!-- Click-to-zoom is a visual aid; keyboard users get the full image already. -->
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
					<img
						src={imageSrc(currentId)}
						alt={shownAsset?.alt_text?.trim() || (shownAsset ? displayName : '')}
						width={shownAsset?.width ?? undefined}
						height={shownAsset?.height ?? undefined}
						draggable="false"
						onload={() => (loadedImageId = currentId)}
						onerror={() => (loadedImageId = currentId)}
						onpointermove={panZoom}
						onclick={toggleZoom}
						style:transform={zoomed ? `scale(${zoomScale})` : 'scale(1)'}
						style:transform-origin={`${zoomOrigin.x}% ${zoomOrigin.y}%`}
						class="h-auto w-auto max-w-full select-none rounded-md object-contain shadow-ink transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none {hasGallery
							? 'max-h-full'
							: 'max-h-[68dvh]'} {zoomed
							? 'cursor-zoom-out'
							: 'cursor-zoom-in'} {imageLoaded ? 'opacity-100' : 'opacity-0'}"
					/>
				{/key}
			{/if}
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
