<!-- apps/web/src/lib/components/builder-profile/editor/ImageCropDialog.svelte -->
<!-- Crop step for the profile photo (square, round mask) and cover (3:1) before upload.
     Drag, pinch, wheel, slider or keys to frame it; confirm hands the parent a WebP (JPEG on
     older Safari) at CROP_OUTPUT size. Uploading is the parent's job. -->
<script module lang="ts">
	import {
		CROP_OUTPUT,
		DECODE_FAILED_MESSAGE,
		MAX_ZOOM,
		MIN_ZOOM,
		centeredView,
		cropAspect,
		cropRect,
		imageFileProblem,
		panBy,
		zoomAt,
		type CropShape,
		type CropView,
		type Point,
		type Size
	} from './image-crop';

	/** A decoded image plus how to free it. */
	type LoadedImage = Size & { image: CanvasImageSource; release: () => void };

	/** Decode with EXIF rotation applied; falls back to <img> where createImageBitmap can't. */
	async function loadImage(blob: Blob): Promise<LoadedImage> {
		if (typeof createImageBitmap === 'function') {
			try {
				const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
				if (bitmap.width > 0 && bitmap.height > 0) {
					return {
						image: bitmap,
						width: bitmap.width,
						height: bitmap.height,
						release: () => bitmap.close()
					};
				}
				bitmap.close();
			} catch {
				// Older engines reject the options bag or the format; try <img> next.
			}
		}
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.src = url;
		try {
			await img.decode();
			if (!img.naturalWidth || !img.naturalHeight) throw new Error('Image has no size');
		} catch (error) {
			URL.revokeObjectURL(url);
			throw error;
		}
		return {
			image: img,
			width: img.naturalWidth,
			height: img.naturalHeight,
			release: () => URL.revokeObjectURL(url)
		};
	}

	function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
		return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
	}

	/** Draw the crop at output size and encode it: WebP, or JPEG where WebP isn't supported. */
	async function renderCrop(img: LoadedImage, view: CropView, shape: CropShape): Promise<Blob> {
		const { width, height } = CROP_OUTPUT[shape];
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas 2D is unavailable');
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		const r = cropRect(view, img, width / height);
		ctx.drawImage(img.image, r.sx, r.sy, r.sw, r.sh, 0, 0, width, height);

		const webp = await canvasToBlob(canvas, 'image/webp', 0.88);
		if (webp?.type === 'image/webp') return webp;
		// Older Safari hands back PNG for WebP. JPEG has no transparency, so paint white underneath.
		ctx.globalCompositeOperation = 'destination-over';
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, width, height);
		const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.9);
		if (!jpeg) throw new Error('Could not encode the crop');
		return jpeg;
	}
</script>

<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { CircleAlert, LoaderCircle, ZoomIn, ZoomOut } from '$lib/icons/lucide';

	type Props = {
		/** When non-null the dialog is open and shows this file. */
		file: File | null;
		shape: CropShape;
		onconfirm: (blob: Blob) => void | Promise<void>;
		oncancel: () => void;
		/** The parent is uploading: buttons lock and confirm reads "Saving…". */
		busy?: boolean;
	};

	let { file, shape, onconfirm, oncancel, busy = false }: Props = $props();

	const ZOOM_STEP = 0.2;
	const KEY_PAN_PX = 10;
	const SAVE_FAILED_MESSAGE = "Couldn't save that. Try again.";
	const uid = $props.id();
	const zoomId = `${uid}-zoom`;

	// The file being cropped. "Choose another" overrides it here; a new `file` prop resets it.
	let current = $derived(file);
	let source = $state.raw<LoadedImage | null>(null);
	let view = $state.raw<CropView>({ zoom: MIN_ZOOM, cx: 0, cy: 0 });
	let loadError = $state<string | null>(null);
	let saveError = $state<string | null>(null);
	let exporting = $state(false);
	let gesturing = $state(false);
	let frameWidth = $state(0);
	let frameEl = $state<HTMLDivElement | null>(null);
	let canvas = $state<HTMLCanvasElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	const aspect = $derived(cropAspect(shape));
	const isAvatar = $derived(shape === 'avatar');
	const problem = $derived(current ? (imageFileProblem(current) ?? loadError) : null);
	const working = $derived(busy || exporting);
	const interactive = $derived(!!source && !problem && !working);

	// Decode the file. Re-runs (freeing the previous image) whenever the file changes.
	$effect(() => {
		const target = current;
		source = null;
		loadError = null;
		saveError = null;
		if (!target || imageFileProblem(target)) return;

		let cancelled = false;
		let loaded: LoadedImage | null = null;
		loadImage(target).then(
			(image) => {
				if (cancelled) return image.release();
				loaded = image;
				view = centeredView(image);
				source = image;
			},
			() => {
				if (!cancelled) loadError = DECODE_FAILED_MESSAGE;
			}
		);
		return () => {
			cancelled = true;
			loaded?.release();
		};
	});

	// Paint the preview with the same crop rect the export uses, at screen resolution.
	$effect(() => {
		const el = canvas;
		const img = source;
		const width = frameWidth;
		const crop = view;
		const frameAspect = aspect;
		// No clearing here: the template hides the canvas until an image is ready, so a
		// closing dialog keeps its last frame through the fade-out.
		if (!el || !img || width <= 0) return;
		const ctx = el.getContext('2d');
		if (!ctx) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 3);
		const w = Math.round(width * dpr);
		const h = Math.round((width / frameAspect) * dpr);
		if (el.width !== w || el.height !== h) {
			el.width = w;
			el.height = h;
		}
		// Resizing resets context state, so set smoothing after it.
		ctx.imageSmoothingQuality = 'medium';
		ctx.clearRect(0, 0, w, h);
		const r = cropRect(crop, img, frameAspect);
		ctx.drawImage(img.image, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
	});

	/** A viewport point as fractions of the frame (the zoom focus). */
	function frameFraction(point: Point): Point {
		const rect = frameEl?.getBoundingClientRect();
		if (!rect || !rect.width || !rect.height) return { x: 0.5, y: 0.5 };
		return { x: (point.x - rect.left) / rect.width, y: (point.y - rect.top) / rect.height };
	}

	function zoomTo(zoom: number, focus?: Point) {
		if (!source) return;
		view = zoomAt(view, zoom, source, aspect, focus);
	}

	function pan(delta: Point) {
		if (!source) return;
		view = panBy(view, delta, frameWidth, source, aspect);
	}

	// Pointers down on the frame: one drags, two pinch. Plain Map; nothing renders from it.
	const pointers = new Map<number, Point>();

	function onPointerDown(event: PointerEvent) {
		if (!interactive) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		frameEl?.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		gesturing = true;
	}

	function onPointerMove(event: PointerEvent) {
		const prev = pointers.get(event.pointerId);
		if (!prev || !interactive) return;
		const next = { x: event.clientX, y: event.clientY };
		pointers.set(event.pointerId, next);
		if (pointers.size === 1) {
			pan({ x: next.x - prev.x, y: next.y - prev.y });
			return;
		}
		// Pinch: zoom by the change in finger spread around the midpoint, then follow the midpoint.
		const other = [...pointers].find(([id]) => id !== event.pointerId)?.[1];
		if (!other) return;
		const spreadBefore = Math.hypot(prev.x - other.x, prev.y - other.y);
		const spreadAfter = Math.hypot(next.x - other.x, next.y - other.y);
		const midBefore = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
		const midAfter = { x: (next.x + other.x) / 2, y: (next.y + other.y) / 2 };
		if (spreadBefore > 0) {
			zoomTo(view.zoom * (spreadAfter / spreadBefore), frameFraction(midAfter));
		}
		pan({ x: midAfter.x - midBefore.x, y: midAfter.y - midBefore.y });
	}

	function onPointerEnd(event: PointerEvent) {
		pointers.delete(event.pointerId);
		if (pointers.size === 0) gesturing = false;
	}

	function onWheel(event: WheelEvent) {
		if (!interactive) return;
		event.preventDefault();
		// Line/page deltas (Firefox) to pixels. Trackpad pinch arrives as ctrl+wheel, small deltas.
		const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
		const sensitivity = event.ctrlKey ? 0.01 : 0.0015;
		const factor = Math.exp(-event.deltaY * unit * sensitivity);
		zoomTo(view.zoom * factor, frameFraction({ x: event.clientX, y: event.clientY }));
	}

	function onKeyDown(event: KeyboardEvent) {
		if (!interactive) return;
		const step = event.shiftKey ? KEY_PAN_PX * 4 : KEY_PAN_PX;
		switch (event.key) {
			case 'ArrowLeft':
				pan({ x: -step, y: 0 });
				break;
			case 'ArrowRight':
				pan({ x: step, y: 0 });
				break;
			case 'ArrowUp':
				pan({ x: 0, y: -step });
				break;
			case 'ArrowDown':
				pan({ x: 0, y: step });
				break;
			case '+':
			case '=':
				zoomTo(view.zoom + ZOOM_STEP);
				break;
			case '-':
			case '_':
				zoomTo(view.zoom - ZOOM_STEP);
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	function pickAnother(event: Event & { currentTarget: HTMLInputElement }) {
		const picked = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (picked) current = picked;
	}

	function cancel() {
		if (!working) oncancel();
	}

	async function confirm() {
		if (!source || working) return;
		exporting = true;
		saveError = null;
		try {
			const blob = await renderCrop(source, view, shape);
			await onconfirm(blob);
		} catch (error) {
			// The parent can throw an Error carrying the server's message.
			saveError =
				error instanceof Error && error.message ? error.message : SAVE_FAILED_MESSAGE;
		} finally {
			exporting = false;
		}
	}

	const zoomButtonClass =
		'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none';
</script>

<Modal
	isOpen={file !== null}
	onClose={oncancel}
	onBeforeClose={() => !working}
	title={isAvatar ? 'Position your photo' : 'Position your cover'}
	size={isAvatar ? 'sm' : 'md'}
	closeOnBackdrop={false}
	enableGestures={false}
>
	<div class="flex flex-col gap-4 px-4 py-4 sm:px-6">
		<input
			bind:this={fileInput}
			type="file"
			accept="image/*"
			hidden
			tabindex="-1"
			onchange={pickAnother}
		/>

		{#if problem}
			<div
				role="alert"
				class="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground"
			>
				<CircleAlert class="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
				<p>{problem}</p>
			</div>
		{:else}
			<div class={isAvatar ? 'mx-auto w-full max-w-[360px]' : 'w-full'}>
				<!-- Focusable drag surface; arrow keys and +/- are handled below. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
				<div
					bind:this={frameEl}
					bind:clientWidth={frameWidth}
					role="application"
					aria-label="Drag to position. Use arrow keys to move and plus or minus to zoom."
					aria-busy={!source}
					tabindex="0"
					data-autofocus
					class="relative w-full touch-none select-none overflow-hidden rounded-lg bg-muted ring-1 ring-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card {isAvatar
						? 'aspect-square'
						: 'aspect-[3/1]'} {interactive
						? gesturing
							? 'cursor-grabbing'
							: 'cursor-grab'
						: ''}"
					onpointerdown={onPointerDown}
					onpointermove={onPointerMove}
					onpointerup={onPointerEnd}
					onpointercancel={onPointerEnd}
					onlostpointercapture={onPointerEnd}
					onwheel={onWheel}
					onkeydown={onKeyDown}
				>
					<canvas
						bind:this={canvas}
						class="absolute inset-0 h-full w-full {source ? '' : 'invisible'}"
						aria-hidden="true"
					></canvas>

					{#if !source}
						<div
							class="absolute inset-0 flex items-center justify-center text-muted-foreground"
						>
							<LoaderCircle
								class="h-6 w-6 animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
							<span class="sr-only">Loading image…</span>
						</div>
					{/if}

					<!-- Rule-of-thirds guides while dragging. -->
					<div
						aria-hidden="true"
						class="pointer-events-none absolute inset-0 transition-opacity duration-150 motion-reduce:transition-none {gesturing
							? 'opacity-100'
							: 'opacity-0'}"
					>
						<span class="crop-guide absolute inset-y-0 left-1/3 w-px"></span>
						<span class="crop-guide absolute inset-y-0 left-2/3 w-px"></span>
						<span class="crop-guide absolute inset-x-0 top-1/3 h-px"></span>
						<span class="crop-guide absolute inset-x-0 top-2/3 h-px"></span>
					</div>

					{#if isAvatar}
						<div
							aria-hidden="true"
							class="crop-circle pointer-events-none absolute inset-0 rounded-full"
						></div>
					{/if}
				</div>
			</div>

			<div class="flex items-center gap-2">
				<button
					type="button"
					class={zoomButtonClass}
					aria-label="Zoom out"
					disabled={!interactive || view.zoom <= MIN_ZOOM}
					onclick={() => zoomTo(view.zoom - ZOOM_STEP)}
				>
					<ZoomOut class="h-5 w-5" aria-hidden="true" />
				</button>
				<label for={zoomId} class="sr-only">Zoom</label>
				<input
					id={zoomId}
					type="range"
					min={MIN_ZOOM}
					max={MAX_ZOOM}
					step="0.01"
					value={view.zoom}
					aria-valuetext="{Math.round(view.zoom * 100)}%"
					disabled={!interactive}
					oninput={(event) => zoomTo(Number(event.currentTarget.value))}
					class="h-11 min-w-0 flex-1 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
				/>
				<button
					type="button"
					class={zoomButtonClass}
					aria-label="Zoom in"
					disabled={!interactive || view.zoom >= MAX_ZOOM}
					onclick={() => zoomTo(view.zoom + ZOOM_STEP)}
				>
					<ZoomIn class="h-5 w-5" aria-hidden="true" />
				</button>
			</div>

			<p class="text-center text-xs text-muted-foreground">
				Drag to reposition. Pinch or scroll to zoom.
			</p>

			{#if saveError}
				<p
					role="alert"
					class="flex items-center justify-center gap-2 text-sm text-foreground"
				>
					<CircleAlert class="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
					{saveError}
				</p>
			{/if}
		{/if}
	</div>

	{#snippet footer()}
		<div
			class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-4 py-3"
		>
			<Button variant="ghost" onclick={cancel} disabled={working}>Cancel</Button>
			{#if problem}
				<Button variant="primary" onclick={() => fileInput?.click()} disabled={working}>
					Choose another
				</Button>
			{:else}
				<Button variant="primary" onclick={confirm} disabled={!source} loading={working}>
					{working ? 'Saving…' : isAvatar ? 'Use photo' : 'Use cover'}
				</Button>
			{/if}
		</div>
	{/snippet}
</Modal>

<style>
	/* These sit on the photo, not on paper, so they stay the same in light and dark mode
	   (same black scrim the Modal backdrop uses). */
	.crop-circle {
		box-shadow:
			0 0 0 9999px rgb(0 0 0 / 0.5),
			inset 0 0 0 1px rgb(255 255 255 / 0.7);
	}

	.crop-guide {
		background-color: rgb(255 255 255 / 0.45);
	}
</style>
