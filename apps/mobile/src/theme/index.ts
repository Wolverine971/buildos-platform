// apps/mobile/src/theme/index.ts
import type { TextStyle } from 'react-native';

import { inkprintLight, inkprintDark } from './inkprint.generated';

export { inkprintLight, inkprintDark };
export type { InkprintColorName } from './inkprint.generated';

import type { InkprintColorName } from './inkprint.generated';

/** One palette: every Inkprint color token as a hex string, light or dark. */
export type ThemeColors = Record<InkprintColorName, string>;

export type Scheme = 'light' | 'dark';

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// Web weight classes use 0.75rem = 12px. xs = chips and date stamps, tile = project tiles
// (22% of 62), sheet = the reader sheet's corners.
export const radius = { xs: 6, sm: 8, md: 12, tile: 14, lg: 16, sheet: 18 } as const;

// The web uses the system UI font, plus the system monospace for stamps and micro-labels
// (see `.micro-label` and `.stamp` in inkprint.css). React Native defaults to the system font,
// so `ui` stays undefined.
export const fontFamily = { ui: undefined, mono: 'Menlo' } as const;

export function getInkprint(scheme: 'light' | 'dark' | null | undefined): ThemeColors {
	return scheme === 'dark' ? inkprintDark : inkprintLight;
}

// ---------------------------------------------------------------------------------------------
// Type scale. The web's 650 weight has no native step: large titles use 700, the rest 600.

export const typeScale = {
	/** Page title, 26/650 tight ("Today", "Workspace"). */
	pageTitle: { fontSize: 26, lineHeight: 30, fontWeight: '700', letterSpacing: -0.8 },
	/** Project name in the project header, 21/650. */
	title: { fontSize: 21, lineHeight: 25, fontWeight: '700', letterSpacing: -0.42 },
	/** Reader sheet title, 17/650. */
	sheetTitle: { fontSize: 17, lineHeight: 21, fontWeight: '600', letterSpacing: -0.25 },
	/** Section heading ("Anytime today"), 15/650. */
	section: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
	/** List rows, 15/500. */
	row: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
	/** Markdown body, 15.5/1.55. */
	body: { fontSize: 15.5, lineHeight: 24 },
	/** Meta lines and asides, 13 muted. */
	meta: { fontSize: 13, lineHeight: 18 },
	/** Tile labels and project sub-heads, 12.5. */
	small: { fontSize: 12.5, lineHeight: 16 },
	/** Group heads in the project task list, 11.5/650 uppercase. */
	groupHead: {
		fontSize: 11.5,
		lineHeight: 14,
		fontWeight: '600',
		letterSpacing: 0.7,
		textTransform: 'uppercase'
	},
	/** The web's `.micro-label`: mono 11, uppercase, tracked. */
	microLabel: {
		fontFamily: fontFamily.mono,
		fontSize: 11,
		lineHeight: 14,
		letterSpacing: 1.3,
		textTransform: 'uppercase'
	},
	/** The web's `.stamp`: mono counts, dates and fact tags. */
	stamp: {
		fontFamily: fontFamily.mono,
		fontSize: 12,
		lineHeight: 16,
		fontVariant: ['tabular-nums']
	}
} satisfies Record<string, TextStyle>;

// ---------------------------------------------------------------------------------------------
// Colors beyond the generated tokens.

export type PulseName = 'moving' | 'shaping' | 'quiet' | 'parked';
export type PulseColors = Record<PulseName, string>;

// `--desk-shaping` in apps/web/src/lib/components/projects/desktop/desktop-colors.css.
const SHAPING = { light: '#7b42bd', dark: '#b488e7' } as const;

/** Project pulse colors, same meaning as the website's desktop tiles. */
export function pulseColors(scheme: Scheme): PulseColors {
	const colors = getInkprint(scheme);
	return {
		moving: colors.success,
		shaping: SHAPING[scheme],
		quiet: colors.warning,
		parked: colors.mutedForeground
	};
}

export type InkShadows = { ink: string; inkStrong: string };

/** `--shadow-ink` and `--shadow-ink-strong` as RN `boxShadow` strings. */
export function shadows(scheme: Scheme): InkShadows {
	return scheme === 'dark'
		? {
				ink: '0 1px 2px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.15)',
				inkStrong: '0 4px 12px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)'
			}
		: {
				ink: '0 1px 2px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04)',
				inkStrong: '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)'
			};
}

/** Parses `#rgb` or `#rrggbb` into 0–255 channels. */
export function parseHex(hex: string): [number, number, number] {
	const raw = hex.trim().replace(/^#/, '');
	const full =
		raw.length === 3
			? raw
					.split('')
					.map((c) => c + c)
					.join('')
			: raw;
	if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a hex color: ${hex}`);
	return [
		parseInt(full.slice(0, 2), 16),
		parseInt(full.slice(2, 4), 16),
		parseInt(full.slice(4, 6), 16)
	];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A hex token at an alpha: `withAlpha('#b85614', 0.16)` → `rgba(184, 86, 20, 0.16)`. */
export function withAlpha(hex: string, alpha: number): string {
	const [r, g, b] = parseHex(hex);
	return `rgba(${r}, ${g}, ${b}, ${Math.round(clamp01(alpha) * 1000) / 1000})`;
}

/** CSS `color-mix(in srgb, a weightA, b)` → `#rrggbb`. */
export function colorMix(a: string, b: string, weightA: number): string {
	const w = clamp01(weightA);
	const ca = parseHex(a);
	const cb = parseHex(b);
	return `#${ca
		.map((channel, i) =>
			Math.round(channel * w + cb[i] * (1 - w))
				.toString(16)
				.padStart(2, '0')
		)
		.join('')}`;
}

/** WCAG relative luminance of a hex color. */
function luminance(hex: string): number {
	const [r, g, b] = parseHex(hex).map((channel) => {
		const c = channel / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between two hex colors, 1–21. Small text needs 4.5. */
export function contrastRatio(a: string, b: string): number {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * `colorMix(ink, toward, weight)` starting at `weight` and pulling further toward `toward`
 * in 0.1 steps until the text reads at 4.5:1 on `background` (or `toward` itself).
 */
export function readableMix(
	ink: string,
	toward: string,
	background: string,
	weight: number
): string {
	for (let w = weight; w > 0.05; w = Math.round((w - 0.1) * 10) / 10) {
		const mixed = colorMix(ink, toward, w);
		if (contrastRatio(mixed, background) >= 4.5) return mixed;
	}
	return colorMix(ink, toward, 0);
}

/** The 2pt lip under a solid key: its own fill mixed 60% with black, like `.tx-button-accent`. */
export function lipOf(fill: string): string {
	return colorMix(fill, '#000000', 0.6);
}

// ---------------------------------------------------------------------------------------------
// Ink: everything a surface needs for one scheme, built once per scheme.

export type Ink = {
	scheme: Scheme;
	dark: boolean;
	colors: ThemeColors;
	shadows: InkShadows;
	pulse: PulseColors;
	/** Texture ink (`--tx-ink`): dark on light, light on dark. */
	txInk: string;
	/** Lip under outline (card) keys. */
	lip: string;
	/** Top inner highlight on raised surfaces (keys, tiles, sheet). */
	highlight: string;
	/** Hairline edge where the sheet meets the bench. */
	edge: string;
	/** Dimmed backdrop behind a JS-drawn sheet or modal. */
	scrim: string;
	/**
	 * Text on a destructive fill (the overdue badge). White like the web in light; the dark
	 * destructive is too light for white (3.7:1), so it takes the dark foreground token.
	 */
	onDestructive: string;
	/**
	 * Warning as small text ("Blocked", the WAITING stamp, the recording timer). The light
	 * warning token reads at under 3:1, so light pulls it 40% toward the foreground.
	 */
	warningText: string;
	/** Texture strengths: graph-paper lines, halftone dots, bench grain. */
	texture: { graph: number; halftone: number; grain: number };
};

function buildInk(scheme: Scheme): Ink {
	const colors = getInkprint(scheme);
	const dark = scheme === 'dark';
	return {
		scheme,
		dark,
		colors,
		shadows: shadows(scheme),
		pulse: pulseColors(scheme),
		txInk: colors.txInk,
		lip: dark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(24, 24, 27, 0.17)',
		highlight: dark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.55)',
		edge: dark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(24, 24, 27, 0.08)',
		scrim: dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.32)',
		onDestructive: dark ? colors.destructiveForeground : '#ffffff',
		warningText: dark ? colors.warning : colorMix(colors.warning, colors.foreground, 0.6),
		texture: dark
			? { graph: 0.045, halftone: 0.045, grain: 0.06 }
			: { graph: 0.05, halftone: 0.05, grain: 0.1 }
	};
}

const INK: Record<Scheme, Ink> = { light: buildInk('light'), dark: buildInk('dark') };

/** The shared, stable Ink object for a scheme (anything but 'dark' is light). */
export function getInk(scheme: Scheme | null | undefined): Ink {
	return scheme === 'dark' ? INK.dark : INK.light;
}
