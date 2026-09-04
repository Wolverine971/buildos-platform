// apps/web/src/lib/config/calendar-colors.ts
// Re-export shim: the Google Calendar color table now lives in shared-agent-ops
// so the shared project-calendar write service can resolve `hex_color` the same
// way web does. Existing `$lib/config/calendar-colors` importers are unchanged.
export {
	DEFAULT_CALENDAR_COLOR,
	GOOGLE_CALENDAR_COLORS,
	type GoogleColorId
} from '@buildos/shared-agent-ops/calendar/calendar-colors';
