// apps/web/src/lib/types/activity-timeline.ts
//
// Shared shape for the /notifications activity timeline: one continuous,
// reverse-chronological feed of everything that happened across a user's
// projects — pings the user was paged on, agent/review work that ran in the
// background, the user's own edits, and system jobs.

/**
 * Which "lane" an entry belongs to. Lanes are the coarse filter the timeline
 * exposes, and drive the left rail colour so a scan tells you who did the work.
 *
 * - `ping`   — the user was actually notified (email/SMS/push/in-app delivery)
 * - `agent`  — background agent work: review passes, audits, agent runs, MCP callers
 * - `you`    — the user's own edits, chats, captures
 * - `system` — scheduled/system jobs: briefs, calendar analysis, failures
 */
export type ActivityLane = 'ping' | 'agent' | 'you' | 'system';

/** Who performed the work. Drives the icon and the "by ..." label. */
export type ActivityActor = 'you' | 'agent' | 'chat' | 'external_agent' | 'teammate' | 'system';

/** Rendering hint, not a literal job status — `warn` covers partial/needs-review. */
export type ActivityStatus = 'ok' | 'warn' | 'error' | 'pending';

/**
 * Discriminates the card body. Kept as a string union rather than free text so
 * the component can switch on it without defensive fallbacks everywhere.
 */
export type ActivityKind =
	| 'notification'
	| 'project_audit'
	| 'loop_run'
	| 'agent_run'
	| 'entity_changes'
	| 'chat_session'
	| 'braindump'
	| 'voice_note'
	| 'brief'
	| 'calendar_analysis';

export interface ActivityStat {
	label: string;
	value: string | number;
}

/** One collapsed row inside a grouped entry (e.g. a single task edit). */
export interface ActivityChild {
	id: string;
	label: string;
	detail?: string | null;
	at: string;
	entity_type?: string | null;
	entity_id?: string | null;
	project_id?: string | null;
	/** Repeat edits to the same entity collapse; >1 renders as "×N". */
	occurrences?: number;
}

export interface ActivityEntry {
	id: string;
	lane: ActivityLane;
	kind: ActivityKind;
	/** ISO timestamp the entry sorts and paginates on. */
	occurred_at: string;
	title: string;
	body: string | null;
	project_id: string | null;
	project_name: string | null;
	actor: ActivityActor;
	actor_label: string;
	status: ActivityStatus;
	stats: ActivityStat[];
	href: string | null;
	children: ActivityChild[];
	/** Number of raw records collapsed into this entry (1 when not grouped). */
	count: number;
}

export interface ActivityTimelinePage {
	entries: ActivityEntry[];
	/**
	 * ISO timestamp to pass back as `before` for the next page. `null` once the
	 * feed is exhausted — the client stops observing the sentinel when it's null.
	 */
	nextCursor: string | null;
	hasMore: boolean;
	/** Sources whose query failed; the rest of the page is still usable. */
	degraded: string[];
}

export const ACTIVITY_LANES: { key: ActivityLane; label: string }[] = [
	{ key: 'ping', label: 'Notifications' },
	{ key: 'agent', label: 'Agent work' },
	{ key: 'you', label: 'Your edits' },
	{ key: 'system', label: 'System' }
];
