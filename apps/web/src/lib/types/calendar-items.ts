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

/** Just enough of a project to label calendar items and the side panel. */
export type DashboardCalendarProjectSummary = {
	id: string;
	name: string;
	state_key: string;
	description: string | null;
	facet_stage: string | null;
	facet_scale: string | null;
};

/** GET /api/calendar/dashboard — every layer in range, plus meta when `meta=1`. */
export type DashboardCalendarPayload = {
	items: CalendarItem[];
	/** Projects referenced by `items`, keyed by id. */
	projects?: Record<string, DashboardCalendarProjectSummary>;
	meta?: DashboardCalendarMeta;
};

export type CalendarLinkedEntity = {
	id: string;
	name?: string;
	title?: string;
	state_key?: string;
	type_key?: string;
	due_at?: string;
	edge_rel?: string;
};

export type CalendarLinkedEntities = {
	plans: CalendarLinkedEntity[];
	goals: CalendarLinkedEntity[];
	milestones: CalendarLinkedEntity[];
	documents: CalendarLinkedEntity[];
	dependentTasks: CalendarLinkedEntity[];
};

/** What the calendar side panel loads for a clicked item beyond the calendar row. */
export type CalendarItemDetail =
	| {
			type: 'task';
			data: Record<string, any>;
			linkedEntities: CalendarLinkedEntities | null;
	  }
	| { type: 'event'; data: Record<string, any> };
