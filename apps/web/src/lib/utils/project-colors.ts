// src/lib/utils/project-colors.ts
import { GOOGLE_CALENDAR_COLORS, type GoogleColorId } from '$lib/config/calendar-colors';

/**
 * Get the color configuration for a project based on its calendar settings
 * @param project - Project object with potential color settings
 * @returns Color configuration with hex, bg, and text classes
 */
export function getProjectColor(project: any) {
	// First check if project has a project_calendar with color_id

	if (project?.project_calendars?.length > 0) {
		const calendar = project.project_calendars[0];
		if (calendar.color_id && GOOGLE_CALENDAR_COLORS[calendar.color_id as GoogleColorId]) {
			return GOOGLE_CALENDAR_COLORS[calendar.color_id as GoogleColorId];
		}
	}

	// Fallback to project's direct calendar_color_id
	if (
		project?.calendar_color_id &&
		GOOGLE_CALENDAR_COLORS[project.calendar_color_id as GoogleColorId]
	) {
		return GOOGLE_CALENDAR_COLORS[project.calendar_color_id as GoogleColorId];
	}

	// If no color is set, use a default based on project name hash
	return getDefaultProjectColor(project?.name || project?.id || '');
}

/**
 * Get project color from just the color_id
 * @param colorId - Google Calendar color ID
 * @returns Color configuration with hex, bg, and text classes
 */
export function getColorById(colorId: string | null | undefined) {
	if (colorId && GOOGLE_CALENDAR_COLORS[colorId as GoogleColorId]) {
		return GOOGLE_CALENDAR_COLORS[colorId as GoogleColorId];
	}
	return GOOGLE_CALENDAR_COLORS['16']; // Default to Eucalyptus
}

/**
 * Generate a consistent default color based on a string (name or id)
 * @param input - String to hash for color selection
 * @returns Color configuration
 */
function getDefaultProjectColor(input: string) {
	if (!input) {
		return GOOGLE_CALENDAR_COLORS['16']; // Default to Eucalyptus
	}

	// Generate hash from string
	let hash = 0;
	for (let i = 0; i < input.length; i++) {
		hash = (hash << 5) - hash + input.charCodeAt(i);
		hash = hash & hash; // Convert to 32bit integer
	}

	// Use the hash to pick a color (1-24)
	const colorIds = Object.keys(GOOGLE_CALENDAR_COLORS);
	const index = Math.abs(hash) % colorIds.length;
	const colorId = colorIds[index] as GoogleColorId;

	return GOOGLE_CALENDAR_COLORS[colorId];
}

/**
 * Get Tailwind classes for a project's color
 * @param project - Project object with potential color settings
 * @returns Object with background and text color classes
 */
export function getProjectColorClasses(project: any) {
	const color = getProjectColor(project);
	return {
		bg: color.bg,
		text: color.text,
		hex: color.hex
	};
}

/**
 * Get color classes from color ID directly
 * @param colorId - Google Calendar color ID
 * @returns Object with background and text color classes
 */
export function getColorClasses(colorId: string | null | undefined) {
	const color = getColorById(colorId);
	return {
		bg: color.bg,
		text: color.text,
		hex: color.hex
	};
}
