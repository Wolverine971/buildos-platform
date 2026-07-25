// apps/web/src/lib/utils/time-block-colors.ts
import type { TimeBlockWithProject } from '@buildos/shared-types';

export const GOOGLE_CALENDAR_COLOR_MAP: Record<string, string> = {
	'1': '#7986CB',
	'2': '#33B679',
	'3': '#8E24AA',
	'4': '#E67C73',
	'5': '#F6BF26',
	'6': '#F4511E',
	'7': '#039BE5',
	'8': '#3F51B5',
	'9': '#0B8043',
	'10': '#D50000',
	'11': '#9E69AF'
};

export const BUILD_BLOCK_COLOR_HEX = '#f97316';
export const DEFAULT_PROJECT_COLOR_HEX = '#4c6ef5';
export const DATA_DARK_FOREGROUND_HEX = '#18181b';
export const DATA_LIGHT_FOREGROUND_HEX = '#ffffff';

function relativeLuminance(hex: string): number | null {
	const normalized = /^#[\da-f]{3}$/i.test(hex)
		? `#${[...hex.slice(1)].map((channel) => channel.repeat(2)).join('')}`
		: hex;
	const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(normalized);
	if (!match) return null;

	const channels = match.slice(1, 4).map((channel) => {
		const value = Number.parseInt(channel, 16) / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	const [red = 0, green = 0, blue = 0] = channels;

	return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(first: number, second: number): number {
	const lighter = Math.max(first, second);
	const darker = Math.min(first, second);
	return (lighter + 0.05) / (darker + 0.05);
}

/** Pick the higher-contrast fixed foreground for an external hex data color. */
export function getDataColorForeground(backgroundHex: string): string {
	const background = relativeLuminance(backgroundHex);
	const dark = relativeLuminance(DATA_DARK_FOREGROUND_HEX);
	const light = 1;
	if (background === null || dark === null) return DATA_LIGHT_FOREGROUND_HEX;

	return contrastRatio(background, dark) >= contrastRatio(background, light)
		? DATA_DARK_FOREGROUND_HEX
		: DATA_LIGHT_FOREGROUND_HEX;
}

export function getProjectColorHex(colorId?: string | null): string {
	if (!colorId) {
		return DEFAULT_PROJECT_COLOR_HEX;
	}

	return GOOGLE_CALENDAR_COLOR_MAP[colorId] ?? DEFAULT_PROJECT_COLOR_HEX;
}

export function resolveProjectColor(value?: string | null): string {
	if (!value) {
		return DEFAULT_PROJECT_COLOR_HEX;
	}

	if (value.startsWith('#')) {
		return value;
	}

	return getProjectColorHex(value);
}

export function resolveBlockAccentColor(
	block: Pick<TimeBlockWithProject, 'block_type' | 'project'>
): string {
	if (block.block_type === 'build') {
		return BUILD_BLOCK_COLOR_HEX;
	}

	return getProjectColorHex(block.project?.calendar_color_id ?? null);
}
