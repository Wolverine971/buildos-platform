// apps/web/src/lib/types/today.ts
// Shared shapes for the /today agenda feed (server service + client view).
import type { CalendarItem } from '$lib/types/calendar-items';

export type TodayTaskBucket = 'due_today' | 'starts_today' | 'in_progress';

export interface TodayTask {
	id: string;
	project_id: string;
	project_name: string;
	title: string;
	description: string | null;
	state_key: string;
	due_at: string | null;
	start_at: string | null;
	priority: number | null;
	updated_at: string;
	bucket: TodayTaskBucket;
}

export interface TodayFeed {
	/** YYYY-MM-DD in the user's timezone */
	date: string;
	timezone: string;
	dayStart: string;
	dayEnd: string;
	events: CalendarItem[];
	tasks: TodayTask[];
	overdueCount: number;
	/** Names for every non-paused project the user can see, keyed by project id */
	projectNames: Record<string, string>;
}

export type WhatChangedActorKind = 'you' | 'member' | 'external_agent' | 'agent' | 'system';

/** One collapsed receipt: the latest change to an entity within the window. */
export interface WhatChangedEntry {
	/** id of the newest underlying onto_project_logs row */
	id: string;
	project_id: string;
	project_name: string;
	entity_type: string;
	entity_id: string;
	entity_name: string;
	/** Collapsed verdict for the window: created > deleted > updated */
	action: 'created' | 'updated' | 'deleted';
	change_source: string | null;
	actor_kind: WhatChangedActorKind;
	/** Display label: "You", "Agent chat", external caller name, member name */
	actor_label: string;
	/** Number of raw log rows collapsed into this entry */
	occurrences: number;
	latest_at: string;
}

export interface WhatChangedFeed {
	/** The clamped window start actually used by the query (ISO) */
	since: string;
	entries: WhatChangedEntry[];
	/** Raw (pre-collapse) log rows seen in the window */
	totalLogCount: number;
	/** True when the raw fetch hit its limit — the window may be incomplete */
	truncated: boolean;
}
