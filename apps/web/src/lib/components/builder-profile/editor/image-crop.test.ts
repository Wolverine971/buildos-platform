// apps/web/src/lib/components/builder-profile/editor/image-crop.test.ts
import { assert, describe, expect, it } from 'vitest';
import {
	CROP_OUTPUT,
	MAX_IMAGE_BYTES,
	MAX_ZOOM,
	MIN_ZOOM,
	centeredView,
	clampView,
	clampZoom,
	coverScale,
	cropAspect,
	cropRect,
	imageFileProblem,
	panBy,
	visibleSize,
	zoomAt,
	type CropView,
	type Size
} from './image-crop';

const SQUARE = 1;
const COVER = 3;
const landscape: Size = { width: 4000, height: 3000 };
const portrait: Size = { width: 1200, height: 1600 };

function expectRect(actual: ReturnType<typeof cropRect>, expected: ReturnType<typeof cropRect>) {
	expect(actual.sx).toBeCloseTo(expected.sx, 6);
	expect(actual.sy).toBeCloseTo(expected.sy, 6);
	expect(actual.sw).toBeCloseTo(expected.sw, 6);
	expect(actual.sh).toBeCloseTo(expected.sh, 6);
}

describe('output sizes', () => {
	it('exports a 512 square avatar and a 1500x500 cover', () => {
		expect(CROP_OUTPUT.avatar).toEqual({ width: 512, height: 512 });
		expect(CROP_OUTPUT.cover).toEqual({ width: 1500, height: 500 });
		expect(cropAspect('avatar')).toBe(1);
		expect(cropAspect('cover')).toBe(3);
	});
});

describe('imageFileProblem', () => {
	it('rejects files that say they are not images', () => {
		expect(imageFileProblem({ type: 'application/pdf', size: 1000 })).toBe(
			"That file isn't an image."
		);
	});

	it('rejects images over 20 MB but allows exactly 20 MB', () => {
		expect(imageFileProblem({ type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 })).toBe(
			'That image is over 20 MB. Pick a smaller one.'
		);
		expect(imageFileProblem({ type: 'image/jpeg', size: MAX_IMAGE_BYTES })).toBeNull();
	});

	it('lets an unknown type through to the decoder (e.g. .heic on Windows)', () => {
		expect(imageFileProblem({ type: '', size: 1000 })).toBeNull();
		expect(imageFileProblem({ type: 'image/heic', size: 1000 })).toBeNull();
	});
});

describe('coverScale', () => {
	it('is bound by the height for a wide image in a square frame', () => {
		expect(coverScale(landscape, { width: 300, height: 300 })).toBeCloseTo(0.1);
	});

	it('is bound by the width for a tall image in a 3:1 frame', () => {
		expect(coverScale(portrait, { width: 600, height: 200 })).toBeCloseTo(0.5);
	});

	it('is exact when the image already matches the frame', () => {
		expect(coverScale({ width: 1500, height: 500 }, { width: 600, height: 200 })).toBeCloseTo(
			0.4
		);
	});

	it('always covers the frame on both axes', () => {
		const frame = { width: 360, height: 120 };
		for (const image of [landscape, portrait, { width: 50, height: 9000 }]) {
			const scale = coverScale(image, frame);
			expect(image.width * scale).toBeGreaterThanOrEqual(frame.width - 1e-9);
			expect(image.height * scale).toBeGreaterThanOrEqual(frame.height - 1e-9);
		}
	});
});

describe('visibleSize', () => {
	it('shows the largest centered square at zoom 1', () => {
		const size = visibleSize(landscape, SQUARE, 1);
		expect(size.width).toBeCloseTo(3000);
		expect(size.height).toBeCloseTo(3000);
	});

	it('shows the full width of a tall image for a cover', () => {
		const size = visibleSize(portrait, COVER, 1);
		expect(size.width).toBeCloseTo(1200);
		expect(size.height).toBeCloseTo(400);
	});

	it('halves the visible region at zoom 2', () => {
		const size = visibleSize(landscape, SQUARE, 2);
		expect(size.width).toBeCloseTo(1500);
		expect(size.height).toBeCloseTo(1500);
	});

	it('never exceeds the image, even with float drift', () => {
		const odd = { width: 1000, height: 333 };
		const size = visibleSize(odd, COVER, 1);
		expect(size.width).toBeLessThanOrEqual(odd.width);
		expect(size.height).toBeLessThanOrEqual(odd.height);
	});

	it('clamps zoom to the 1x-3x range', () => {
		expect(visibleSize(landscape, SQUARE, 10)).toEqual(
			visibleSize(landscape, SQUARE, MAX_ZOOM)
		);
		expect(visibleSize(landscape, SQUARE, 0.2)).toEqual(
			visibleSize(landscape, SQUARE, MIN_ZOOM)
		);
	});
});

describe('clampZoom', () => {
	it('keeps zoom between the limits and treats junk as 1x', () => {
		expect(clampZoom(0.5)).toBe(MIN_ZOOM);
		expect(clampZoom(2)).toBe(2);
		expect(clampZoom(7)).toBe(MAX_ZOOM);
		expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
	});
});

describe('clampView', () => {
	it('leaves a centered view alone', () => {
		const view = centeredView(landscape);
		expect(clampView(view, landscape, SQUARE)).toEqual(view);
	});

	it('pulls a crop that runs off the edge back inside the image', () => {
		const clamped = clampView({ zoom: 1, cx: -500, cy: 99999 }, landscape, SQUARE);
		expect(clamped.cx).toBeCloseTo(1500); // half the visible 3000px width
		expect(clamped.cy).toBeCloseTo(1500); // no vertical room at zoom 1
	});

	it('pins the center on an axis with no room to move', () => {
		const clamped = clampView({ zoom: 1, cx: 0, cy: 0 }, portrait, COVER);
		expect(clamped.cx).toBeCloseTo(600);
		expect(clamped.cy).toBeCloseTo(200);
	});
});

describe('cropRect', () => {
	it('maps a centered avatar on a landscape photo to the middle square', () => {
		expectRect(cropRect(centeredView(landscape), landscape, SQUARE), {
			sx: 500,
			sy: 0,
			sw: 3000,
			sh: 3000
		});
	});

	it('maps a centered cover on a portrait photo to the middle band', () => {
		expectRect(cropRect(centeredView(portrait), portrait, COVER), {
			sx: 0,
			sy: 600,
			sw: 1200,
			sh: 400
		});
	});

	it('keeps the frame aspect and stays inside the image for any view', () => {
		// Deterministic pseudo-random views so the test never flakes.
		let seed = 42;
		const rand = () => {
			seed = (seed * 1664525 + 1013904223) % 2 ** 32;
			return seed / 2 ** 32;
		};
		const images: Size[] = [landscape, portrait, { width: 641, height: 479 }];
		for (let i = 0; i < 300; i++) {
			const image = images[i % images.length];
			assert.isDefined(image);
			const aspect = i % 2 ? COVER : SQUARE;
			const view: CropView = {
				zoom: rand() * 4,
				cx: rand() * image.width * 1.6 - image.width * 0.3,
				cy: rand() * image.height * 1.6 - image.height * 0.3
			};
			const rect = cropRect(view, image, aspect);
			expect(rect.sw / rect.sh).toBeCloseTo(aspect, 6);
			expect(rect.sx).toBeGreaterThanOrEqual(0);
			expect(rect.sy).toBeGreaterThanOrEqual(0);
			expect(rect.sx + rect.sw).toBeLessThanOrEqual(image.width + 1e-6);
			expect(rect.sy + rect.sh).toBeLessThanOrEqual(image.height + 1e-6);
		}
	});
});

describe('panBy', () => {
	it('moves the crop opposite to the drag, in source pixels', () => {
		// 3000 visible source px across a 300px frame: 10 source px per screen px.
		const start = centeredView(landscape);
		const moved = panBy(start, { x: 30, y: 0 }, 300, landscape, SQUARE);
		expect(moved.cx).toBeCloseTo(2000 - 300);
		expect(moved.cy).toBeCloseTo(1500);
	});

	it('stops at the image edge', () => {
		const moved = panBy(centeredView(landscape), { x: 5000, y: 0 }, 300, landscape, SQUARE);
		expect(cropRect(moved, landscape, SQUARE).sx).toBeCloseTo(0);
	});

	it('does nothing on an axis with no room to move', () => {
		const start = centeredView(landscape);
		expect(panBy(start, { x: 0, y: 80 }, 300, landscape, SQUARE).cy).toBeCloseTo(1500);
	});

	it('pans further per pixel when zoomed out than when zoomed in', () => {
		const zoomedIn = { ...centeredView(landscape), zoom: 2 };
		const moved = panBy(zoomedIn, { x: 0, y: 30 }, 300, landscape, SQUARE);
		// 1500 visible px over 300 screen px: 5 source px per screen px.
		expect(moved.cy).toBeCloseTo(1500 - 150);
	});

	it('ignores a frame that has not been measured yet', () => {
		const start = centeredView(landscape);
		expect(panBy(start, { x: 50, y: 50 }, 0, landscape, SQUARE)).toEqual(start);
	});
});

describe('zoomAt', () => {
	it('zooms around the frame center by default', () => {
		const zoomed = zoomAt(centeredView(landscape), 2, landscape, SQUARE);
		expect(zoomed.zoom).toBe(2);
		expect(zoomed.cx).toBeCloseTo(2000);
		expect(zoomed.cy).toBeCloseTo(1500);
	});

	it('keeps the image point under the focus in place', () => {
		const start = centeredView(landscape);
		const focus = { x: 0.75, y: 0.25 };
		const before = cropRect(start, landscape, SQUARE);
		const zoomed = zoomAt(start, 2, landscape, SQUARE, focus);
		const after = cropRect(zoomed, landscape, SQUARE);
		expect(after.sx + focus.x * after.sw).toBeCloseTo(before.sx + focus.x * before.sw);
		expect(after.sy + focus.y * after.sh).toBeCloseTo(before.sy + focus.y * before.sh);
	});

	it('re-clamps when zooming out near an edge', () => {
		const zoomedIn = panBy(
			zoomAt(centeredView(landscape), 3, landscape, SQUARE),
			{ x: 9999, y: 9999 },
			300,
			landscape,
			SQUARE
		);
		const zoomedOut = zoomAt(zoomedIn, 1, landscape, SQUARE);
		expectRect(cropRect(zoomedOut, landscape, SQUARE), { sx: 0, sy: 0, sw: 3000, sh: 3000 });
	});

	it('clamps the requested zoom', () => {
		expect(zoomAt(centeredView(portrait), 9, portrait, COVER).zoom).toBe(MAX_ZOOM);
		expect(zoomAt(centeredView(portrait), 0, portrait, COVER).zoom).toBe(MIN_ZOOM);
	});
});
