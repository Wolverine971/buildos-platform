// apps/web/src/lib/types/calendar-items.ts
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
	created_at: string;
	updated_at: string;
}
