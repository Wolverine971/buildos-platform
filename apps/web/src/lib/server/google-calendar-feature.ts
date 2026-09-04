// apps/web/src/lib/server/google-calendar-feature.ts
// Re-export shim: the flag now lives in shared-agent-ops so the worker reads
// the same allowlist semantics. Web keeps this path for its existing importers.
export {
	MULTI_CALENDAR_ENABLED_ENV,
	MULTI_CALENDAR_USER_IDS_ENV,
	isMultiCalendarUserAllowed
} from '@buildos/shared-agent-ops/calendar/google-calendar-feature';
