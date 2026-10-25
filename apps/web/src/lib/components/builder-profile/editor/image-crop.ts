// apps/web/src/lib/components/builder-profile/editor/image-crop.ts
// Pure crop math for the profile photo / cover crop dialog. The crop lives in source-pixel
// space (zoom + crop center), so the on-screen preview and the exported file use one rect.

export type CropShape = 'avatar' | 'cover';

/** Size of the exported file for each shape. */
export const CROP_OUTPUT: Record<CropShape, { width: number; height: number }> = {
	avatar: { width: 512, height: 512 },
	cover: { width: 1500, height: 500 }
};

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const DECODE_FAILED_MESSAGE = "This browser can't open that image. Try a JPG or PNG.";

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

/** `zoom` is a multiple of the cover-fit scale; `cx`/`cy` is the crop center in source pixels. */
export type CropView = { zoom: number; cx: number; cy: number };

/** The source rect to pass to drawImage(img, sx, sy, sw, sh, ...). */
export type SourceRect = { sx: number; sy: number; sw: number; sh: number };

/** Width / height of the frame and output for a shape (1 for avatar, 3 for cover). */
export function cropAspect(shape: CropShape): number {
	const { width, height } = CROP_OUTPUT[shape];
	return width / height;
}

/** A friendly reason a picked file can't be cropped, or null if it's worth decoding. */
export function imageFileProblem(file: { type: string; size: number }): string | null {
	// An empty type means the browser doesn't know (e.g. .heic on Windows), so let decode decide.
	if (file.type && !file.type.startsWith('image/')) return "That file isn't an image.";
	if (file.size > MAX_IMAGE_BYTES) return 'That image is over 20 MB. Pick a smaller one.';
	return null;
}

/** Smallest scale (frame px per image px) at which the image covers the frame with no gaps. */
export function coverScale(image: Size, frame: Size): number {
	return Math.max(frame.width / image.width, frame.height / image.height);
}

export function clampZoom(zoom: number): number {
	if (!Number.isFinite(zoom)) return MIN_ZOOM;
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Size of the visible region, in source pixels, for a frame of `aspect` at `zoom`. */
export function visibleSize(image: Size, aspect: number, zoom: number): Size {
	// Every frame of this aspect sees the same region; a frame 1 unit tall keeps the math short.
	const scale = coverScale(image, { width: aspect, height: 1 }) * clampZoom(zoom);
	// min() absorbs float drift at zoom 1, where one side equals the image exactly.
	return {
		width: Math.min(image.width, aspect / scale),
		height: Math.min(image.height, 1 / scale)
	};
}

/** Zoom 1 (cover fit), centered on the image. */
export function centeredView(image: Size): CropView {
	return { zoom: MIN_ZOOM, cx: image.width / 2, cy: image.height / 2 };
}

/** Pull the crop back inside the image so the frame never shows empty space. */
export function clampView(view: CropView, image: Size, aspect: number): CropView {
	const zoom = clampZoom(view.zoom);
	const { width, height } = visibleSize(image, aspect, zoom);
	return {
		zoom,
		cx: clamp(view.cx, width / 2, image.width - width / 2),
		cy: clamp(view.cy, height / 2, image.height - height / 2)
	};
}

/** The source rect under the frame. Used for both the preview and the exported file. */
export function cropRect(view: CropView, image: Size, aspect: number): SourceRect {
	const { zoom, cx, cy } = clampView(view, image, aspect);
	const { width, height } = visibleSize(image, aspect, zoom);
	return {
		sx: clamp(cx - width / 2, 0, image.width - width),
		sy: clamp(cy - height / 2, 0, image.height - height),
		sw: width,
		sh: height
	};
}

/** Move the image with a drag of `delta` screen pixels on a frame `frameWidth` pixels wide. */
export function panBy(
	view: CropView,
	delta: Point,
	frameWidth: number,
	image: Size,
	aspect: number
): CropView {
	if (!(frameWidth > 0)) return clampView(view, image, aspect);
	const sourcePerPixel = visibleSize(image, aspect, view.zoom).width / frameWidth;
	// Dragging right shows more of the left side, so the crop center moves the other way.
	return clampView(
		{
			zoom: view.zoom,
			cx: view.cx - delta.x * sourcePerPixel,
			cy: view.cy - delta.y * sourcePerPixel
		},
		image,
		aspect
	);
}

/**
 * Change zoom while the image point under `focus` stays put. `focus` is a spot in the frame
 * as fractions (0..1) of its width and height; the default is the frame center.
 */
export function zoomAt(
	view: CropView,
	zoom: number,
	image: Size,
	aspect: number,
	focus: Point = { x: 0.5, y: 0.5 }
): CropView {
	const nextZoom = clampZoom(zoom);
	const before = visibleSize(image, aspect, view.zoom);
	const after = visibleSize(image, aspect, nextZoom);
	const fx = focus.x - 0.5;
	const fy = focus.y - 0.5;
	return clampView(
		{
			zoom: nextZoom,
			cx: view.cx + fx * (before.width - after.width),
			cy: view.cy + fy * (before.height - after.height)
		},
		image,
		aspect
	);
}

function clamp(value: number, min: number, max: number): number {
	if (min >= max || !Number.isFinite(value)) return (min + max) / 2;
	return Math.min(max, Math.max(min, value));
}
