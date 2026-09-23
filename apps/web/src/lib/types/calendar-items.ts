// apps/web/src/lib/types/calendar-items.ts
import type { GoogleCalendarConnectionsPayload } from './google-calendar-integration';

export type CalendarItemType = 'event' | 'task';
export type CalendarItemKind = 'event' | 'range' | 'start' | 'due';

export interface CalendarItem {
	calendar_item_id: string;
	item_type: CalendarItemType;
	item_kind: CalendarItemKind;
	source_table: string;
	title: string | null;
	start_at: string;
	end_at: string | null;
	all_day: boolean | null;
	timezone: string | null;
	project_id: string | null;
	owner_entity_type: string | null;
	owner_entity_id: string | null;
	task_id: string | null;
	event_id: string | null;
	state_key: string | null;
	type_key: string | null;
	props: Record<string, unknown> | null;
	calendar_source_id?: string | null;
	calendar_source_ids?: string[];
	calendar_source_label?: string | null;
	calendar_connection_label?: string | null;
	calendar_source_color?: string | null;
	created_at: string;
	updated_at: string;
}

export type DashboardCalendarDisplayPreferences = {
	show_events: boolean;
	show_task_scheduled: boolean;
	show_task_start: boolean;
	show_task_due: boolean;
};

export type DashboardCalendarMeta = {
	preferences: DashboardCalendarDisplayPreferences;
	/** null when the user has no multi-account Google Calendar access. */
	connections: GoogleCalendarConnectionsPayload | null;
	connectionsError: boolean;
};

/** GET /api/calendar/dashboard — every layer in range, plus meta when `meta=1`. */
export type DashboardCalendarPayload = {
	items: CalendarItem[];
	meta?: DashboardCalendarMeta;
};
