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
