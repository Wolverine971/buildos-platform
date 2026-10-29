// apps/mobile/tests/kit.test.ts
import { describe, expect, it } from 'vitest';

import {
	boltCycleMs,
	crossedPullTrigger,
	GRAIN,
	grainDots,
	grainPaths,
	hitSlopFor,
	KEY_SPRING,
	mulberry32,
	pullProgress,
	RING,
	ringScale,
	ringSpread,
	springStats
} from '@/components/kit/math';
import {
	colorMix,
	contrastRatio,
	getInk,
	inkprintDark,
	inkprintLight,
	lipOf,
	parseHex,
	pulseColors,
	readableMix,
	shadows,
	withAlpha
} from '@/theme';

const luminance = (hex: string) => {
	const [r, g, b] = parseHex(hex);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe('seeded grain', () => {
	it('mulberry32 is deterministic and stays in [0, 1)', () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		const values = Array.from({ length: 500 }, () => a());
		expect(values).toEqual(Array.from({ length: 500 }, () => b()));
		expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...values)).toBeLessThan(1);
		expect(mulberry32(43)()).not.toBe(mulberry32(42)());
	});

	it('lays out the same 260 dots every time, inside the tile', () => {
		const dots = grainDots();
		expect(dots).toHaveLength(GRAIN.count);
		expect(grainDots()).toEqual(dots);
		for (const dot of dots) {
			expect(dot.r).toBeGreaterThanOrEqual(GRAIN.rMin);
			expect(dot.r).toBeLessThanOrEqual(GRAIN.rMax);
			expect(dot.a).toBeGreaterThanOrEqual(0.5);
			expect(dot.a).toBeLessThanOrEqual(1);
			// Small slack for 2-decimal rounding; no dot is clipped at a tile seam.
			expect(dot.x - dot.r).toBeGreaterThanOrEqual(-0.01);
			expect(dot.y - dot.r).toBeGreaterThanOrEqual(-0.01);
			expect(dot.x + dot.r).toBeLessThanOrEqual(GRAIN.tile + 0.01);
			expect(dot.y + dot.r).toBeLessThanOrEqual(GRAIN.tile + 0.01);
		}
	});

	it('spreads dots across the whole tile (no clumps or empty quadrants)', () => {
		const half = GRAIN.tile / 2;
		const quadrants = [0, 0, 0, 0];
		for (const dot of grainDots()) quadrants[(dot.x < half ? 0 : 1) + (dot.y < half ? 0 : 2)]++;
		for (const count of quadrants) expect(count).toBeGreaterThan(40);
	});

	it('draws the tile as three compound paths, one circle per dot', () => {
		const dots = grainDots();
		const paths = grainPaths(dots);
		expect(paths).toHaveLength(3);
		const circles = paths.reduce((n, part) => n + (part.d.match(/M/g)?.length ?? 0), 0);
		expect(circles).toBe(dots.length);
		expect(paths.map((p) => p.a)).toEqual([...paths.map((p) => p.a)].sort((x, y) => x - y));
		for (const part of paths) {
			expect(part.a).toBeGreaterThan(0.5);
			expect(part.a).toBeLessThanOrEqual(1);
		}
	});
});

describe('pull to refresh', () => {
	it('charges the bolt from 10pt to 90pt of pull', () => {
		expect(pullProgress(0)).toBe(0);
		expect(pullProgress(120)).toBe(0);
		expect(pullProgress(-10)).toBe(0);
		expect(pullProgress(-50)).toBeCloseTo(0.5);
		expect(pullProgress(-90)).toBe(1);
		expect(pullProgress(-160)).toBe(1);
	});

	it('ticks once, on the frame the pull reaches the trigger', () => {
		expect(crossedPullTrigger(-80, -95)).toBe(true);
		expect(crossedPullTrigger(-89.9, -90)).toBe(true);
		expect(crossedPullTrigger(-95, -120)).toBe(false);
		expect(crossedPullTrigger(-95, -80)).toBe(false);
		expect(crossedPullTrigger(0, -40)).toBe(false);
	});
});

describe('recording ring', () => {
	it('grows the halo spread from 2pt to 8pt with the voice level', () => {
		expect(ringSpread(0)).toBe(RING.min);
		expect(ringSpread(1)).toBe(RING.max);
		expect(ringSpread(0.5)).toBe(5);
		expect(ringSpread(-1)).toBe(RING.min);
		expect(ringSpread(4)).toBe(RING.max);
		expect(ringSpread(Number.NaN)).toBe(RING.min);
	});

	it('scales a max-size halo so its edge sits at the spread', () => {
		expect(ringScale(1, 44)).toBe(1);
		expect(ringScale(0, 44)).toBeCloseTo(48 / 60);
		expect(ringScale(0.5, 44) * (44 + 2 * RING.max)).toBeCloseTo(44 + 2 * 5);
	});
});

describe('touch targets', () => {
	it('grows small controls to 44pt and leaves big ones alone', () => {
		expect(hitSlopFor(38, 38)).toEqual({ top: 3, bottom: 3, left: 3, right: 3 });
		expect(hitSlopFor(40, 42)).toEqual({ top: 1, bottom: 1, left: 2, right: 2 });
		expect(hitSlopFor(32, 32)).toEqual({ top: 6, bottom: 6, left: 6, right: 6 });
		expect(hitSlopFor(120, 50)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
	});
});

describe('key motion', () => {
	it('springs back like the website key: ~14% overshoot near 105ms, settled by ~420ms', () => {
		const stats = springStats(KEY_SPRING);
		expect(stats.dampingRatio).toBeGreaterThan(0.45);
		expect(stats.dampingRatio).toBeLessThan(0.65);
		expect(stats.overshoot).toBeGreaterThan(0.1);
		expect(stats.overshoot).toBeLessThan(0.18);
		expect(stats.peakMs).toBeGreaterThan(90);
		expect(stats.peakMs).toBeLessThan(120);
		expect(stats.settleMs).toBeGreaterThan(360);
		expect(stats.settleMs).toBeLessThan(460);
	});

	it('reports no overshoot for an overdamped spring', () => {
		expect(springStats({ stiffness: 100, damping: 40, mass: 1 }).overshoot).toBe(0);
	});

	it('keeps the spinner cycle calm (about 1.6s)', () => {
		expect(boltCycleMs()).toBeGreaterThan(1400);
		expect(boltCycleMs()).toBeLessThan(1900);
	});
});

describe('theme colors', () => {
	it('parses short and long hex, and rejects anything else', () => {
		expect(parseHex('#abc')).toEqual([170, 187, 204]);
		expect(parseHex('#B85614')).toEqual([184, 86, 20]);
		expect(() => parseHex('rgba(0,0,0,1)')).toThrow();
		expect(() => parseHex('#12345')).toThrow();
	});

	it('writes tokens at an alpha', () => {
		expect(withAlpha('#b85614', 0.16)).toBe('rgba(184, 86, 20, 0.16)');
		expect(withAlpha('#ffffff', 2)).toBe('rgba(255, 255, 255, 1)');
	});

	it('mixes like CSS color-mix in srgb', () => {
		expect(colorMix('#ffffff', '#000000', 0.5)).toBe('#808080');
		expect(colorMix('#b85614', '#000000', 1)).toBe('#b85614');
		expect(colorMix('#b85614', '#ffffff', 0)).toBe('#ffffff');
	});

	it('darkens a solid key lip to 60% of its fill, in both schemes', () => {
		expect(lipOf('#b85614')).toBe('#6e340c');
		for (const palette of [inkprintLight, inkprintDark]) {
			const lip = lipOf(palette.accent);
			// Per-channel rounding moves luminance by under one step.
			expect(Math.abs(luminance(lip) - luminance(palette.accent) * 0.6)).toBeLessThan(1);
			expect(luminance(lip)).toBeLessThan(luminance(palette.accent));
		}
	});

	it('maps project pulse to the website desktop colors', () => {
		expect(pulseColors('light')).toEqual({
			moving: inkprintLight.success,
			shaping: '#7b42bd',
			quiet: inkprintLight.warning,
			parked: inkprintLight.mutedForeground
		});
		expect(pulseColors('dark').shaping).toBe('#b488e7');
		expect(pulseColors('dark').moving).toBe(inkprintDark.success);
	});

	it('writes ink shadows as two-layer boxShadow strings, heavier in dark', () => {
		for (const scheme of ['light', 'dark'] as const) {
			const { ink, inkStrong } = shadows(scheme);
			expect(ink.split('rgba(')).toHaveLength(3);
			expect(inkStrong.split('rgba(')).toHaveLength(3);
		}
		expect(shadows('dark').ink).toContain('0.2)');
		expect(shadows('light').ink).toContain('0.06)');
	});

	it('builds one stable Ink per scheme', () => {
		expect(getInk('dark')).toBe(getInk('dark'));
		expect(getInk(null)).toBe(getInk('light'));
		expect(getInk('dark').dark).toBe(true);
		expect(getInk('dark').colors).toBe(inkprintDark);
		expect(getInk('light').texture.grain).toBe(0.1);
		expect(getInk('dark').texture.grain).toBe(0.06);
		expect(getInk('light').txInk).toBe(inkprintLight.txInk);
	});
});

describe('text contrast (WCAG AA, 4.5:1 for small text)', () => {
	const AA = 4.5;

	it('measures contrast like WCAG', () => {
		expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
		expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
		expect(contrastRatio('#b68c0c', '#fbfaf9')).toBeCloseTo(2.99, 2);
	});

	it('warning text reads on the sheet, the card and muted in both schemes', () => {
		for (const ink of [getInk('light'), getInk('dark')]) {
			for (const surface of [ink.colors.background, ink.colors.card, ink.colors.muted]) {
				expect(contrastRatio(ink.warningText, surface)).toBeGreaterThanOrEqual(AA);
			}
		}
		// Light pulls the token 40% toward the foreground; dark keeps it.
		expect(getInk('light').warningText).toBe('#765d12');
		expect(getInk('dark').warningText).toBe(inkprintDark.warning);
	});

	it('the overdue badge text reads on the destructive fill in both schemes', () => {
		for (const ink of [getInk('light'), getInk('dark')]) {
			expect(contrastRatio(ink.onDestructive, ink.colors.destructive)).toBeGreaterThanOrEqual(
				AA
			);
		}
		expect(getInk('light').onDestructive).toBe('#ffffff');
	});

	it('the reader state pill (state color 70% toward the foreground) reads on muted', () => {
		for (const colors of [inkprintLight, inkprintDark]) {
			for (const tone of ['success', 'destructive', 'foreground'] as const) {
				const text = colorMix(colors[tone], colors.foreground, 0.7);
				expect(contrastRatio(text, colors.muted)).toBeGreaterThanOrEqual(AA);
			}
		}
	});

	it('the capture hint (muted foreground, no fade) reads on the card', () => {
		for (const colors of [inkprintLight, inkprintDark]) {
			expect(contrastRatio(colors.mutedForeground, colors.card)).toBeGreaterThanOrEqual(AA);
		}
	});

	it('readableMix keeps the starting mix when it reads, and pulls further when not', () => {
		const card = inkprintLight.card;
		expect(readableMix(inkprintLight.foreground, inkprintLight.foreground, card, 0.8)).toBe(
			inkprintLight.foreground
		);
		const quiet = readableMix(inkprintLight.warning, inkprintLight.foreground, card, 0.8);
		expect(contrastRatio(quiet, card)).toBeGreaterThanOrEqual(AA);
		expect(contrastRatio(colorMix(inkprintLight.warning, inkprintLight.foreground, 0.8), card))
			.toBeLessThan(AA);
		// Nothing reads: falls back to the target color itself.
		expect(readableMix('#777777', '#808080', '#7a7a7a', 0.8)).toBe('#808080');
	});
});
