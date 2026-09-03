// apps/web/src/lib/server/google-calendar-target.service.ts
// Source selection is host-independent; keep the existing web import path.
export {
	GoogleCalendarTargetService,
	GoogleCalendarTargetError,
	type CalendarTargetCapability,
	type CalendarTarget,
	type CalendarProjectTarget,
	type CalendarEventTarget,
	type CalendarExternalEventTarget
} from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';
