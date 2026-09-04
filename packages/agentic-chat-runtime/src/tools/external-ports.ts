// packages/agentic-chat-runtime/src/tools/external-ports.ts
//
// Host-injected ports for the two external read surfaces the shared read tools
// still cannot reach on their own: Google Calendar and Gmail.
//
// The runtime stays provider-free on purpose — nothing here imports googleapis,
// OAuth types, or a Supabase table shape. Web injects an adapter over its
// server-only services; the worker injects an adapter over the shared
// `@buildos/shared-agent-ops/calendar/...` services. Both sides therefore
// authorize against `AgenticChatSharedReadContextV1.userId`, which is the
// trusted claim, because the worker reads with a service-role client that has
// no RLS to fall back on.

// ============================================
// CALENDAR
// ============================================

/**
 * Zero calendar coverage and one-missing-calendar must never read the same to
 * the model: `unavailable` means nothing was read (never assert availability),
 * `degraded` means some sources are missing from the result.
 */
export type AgenticChatCalendarReadCoverageV1 = 'complete' | 'degraded' | 'unavailable';

/** How the host actually read: multi-source fan-out, legacy single OAuth account, or not at all. */
export type AgenticChatCalendarReadModeV1 = 'none' | 'legacy_single_account' | 'source_aware';

/** Per-source failure, reported instead of being folded into a single `partial` boolean. */
export interface AgenticChatCalendarSourceFailureV1 {
	/** Provider calendar id, used as the human-facing calendar name in warnings. */
	calendar: string;
	calendar_source_id: string;
	connection_id: string;
	/** e.g. `reconnect_required`, `timeout`, `rate_limited`, `provider_error`. */
	reason_code: string;
}

export interface AgenticChatCalendarEventTimeV1 {
	/** RFC3339 timestamp for timed events. */
	dateTime?: string | null;
	/** `YYYY-MM-DD` for all-day events. */
	date?: string | null;
	timeZone?: string | null;
}

/** One (calendarSourceId, providerEventId) pair that contributed to an aggregated event. */
export interface AgenticChatCalendarSourceEventIdentityV1 {
	calendarSourceId: string;
	providerEventId: string;
}

export interface AgenticChatCalendarEventV1 {
	/** Host-stable identity for the aggregated event. */
	id: string | null;
	providerEventId: string | null;
	calendarSourceId: string | null;
	connectionId: string | null;
	providerCalendarId: string | null;
	calendarSummary?: string | null;
	connectionLabel?: string | null;
	summary?: string | null;
	description?: string | null;
	location?: string | null;
	status?: string | null;
	htmlLink?: string | null;
	start?: AgenticChatCalendarEventTimeV1 | null;
	end?: AgenticChatCalendarEventTimeV1 | null;
	/** Same event seen on more than one connected source; drives dedupe on the read side. */
	contributingSourceEvents?: AgenticChatCalendarSourceEventIdentityV1[];
	/**
	 * The untouched provider payload, for hosts that echo the raw event back to
	 * the model. The runtime never inspects it.
	 */
	raw?: unknown;
}

export interface AgenticChatCalendarListEventsInputV1 {
	/** MUST equal the read context's trusted `userId`. */
	userId: string;
	/** RFC3339 lower bound; the host applies its own default when omitted. */
	timeMin?: string;
	/** RFC3339 upper bound; the host applies its own default when omitted. */
	timeMax?: string;
	timeZone?: string;
	maxResults?: number;
	/** Free-text provider query. */
	query?: string;
	/** Exactly one calendar source (a project calendar or an explicit selection). */
	calendarSourceId?: string;
	/** Explicit provider calendar id. Omit both ids to fan out across every enabled read source. */
	calendarId?: string;
	/** Wall-clock budget for the fan-out; the host clamps it. */
	budgetMs?: number;
}

export interface AgenticChatCalendarListEventsResultV1 {
	events: AgenticChatCalendarEventV1[];
	mode: AgenticChatCalendarReadModeV1;
	coverage: AgenticChatCalendarReadCoverageV1;
	sourceCount: number;
	successfulSourceCount: number;
	failedSourceCount: number;
	/** True when at least one source failed but some data still came back. */
	partial: boolean;
	sourceFailures: AgenticChatCalendarSourceFailureV1[];
}

export interface AgenticChatCalendarGetEventInputV1 {
	/** MUST equal the read context's trusted `userId`. */
	userId: string;
	/** Provider event id (the `external_event_id` a list result exposed). */
	providerEventId: string;
	calendarSourceId?: string;
	calendarId?: string;
}

export interface AgenticChatCalendarGetEventResultV1 {
	event: AgenticChatCalendarEventV1 | null;
	calendarSourceId: string | null;
	connectionId: string | null;
	providerCalendarId: string | null;
	/**
	 * Why nothing could be read, when `event` is null because the host could not
	 * reach the provider at all (`not_connected`, `not_configured`,
	 * `reconnect_required`). A genuine provider failure still throws; this is the
	 * "there is no calendar to ask" case, which the read tool reports as
	 * `coverage: 'unavailable'` instead of a tool error.
	 */
	reasonCode?: string | null;
}

export interface AgenticChatProjectCalendarInputV1 {
	/** MUST equal the read context's trusted `userId`. */
	userId: string;
	projectId: string;
}

/** A project's calendar mapping — the row the read side needs, not the full API payload. */
export interface AgenticChatProjectCalendarV1 {
	id: string | null;
	projectId: string;
	calendarId: string | null;
	calendarSourceId: string | null;
	calendarName: string | null;
	syncEnabled: boolean;
	syncMode: 'actor_projection' | 'member_fanout';
	/**
	 * The untouched stored row, for hosts that echo the whole `project_calendars`
	 * record back to the model (sync status, color, timestamps). The runtime
	 * never inspects it; it only forwards it when present.
	 */
	raw?: unknown;
}

/**
 * The read-only calendar surface the shared tools need. Every method authorizes
 * against the caller-supplied `userId`; hosts must reject a `userId` that does
 * not match the read context.
 */
export interface AgenticChatCalendarReadPortV1 {
	/** Events in a window, across the user's calendar sources, with per-source failure reporting. */
	listEvents(
		input: AgenticChatCalendarListEventsInputV1
	): Promise<AgenticChatCalendarListEventsResultV1>;
	/** One event by provider id. */
	getEvent(
		input: AgenticChatCalendarGetEventInputV1
	): Promise<AgenticChatCalendarGetEventResultV1>;
	/** The project's calendar mapping, or null when the project has none. */
	getProjectCalendar(
		input: AgenticChatProjectCalendarInputV1
	): Promise<AgenticChatProjectCalendarV1 | null>;
}

// ============================================
// EMAIL
// ============================================

export type AgenticChatEmailAccountStatusV1 =
	| 'active'
	| 'reconnect_required'
	| 'disabled'
	| 'error';

export interface AgenticChatEmailAccountV1 {
	connectionId: string;
	emailAddress: string;
	accountLabel: string;
	status: AgenticChatEmailAccountStatusV1;
	readEnabled: boolean;
}

export interface AgenticChatEmailMessageSummaryV1 {
	connectionId: string;
	messageId: string;
	threadId: string | null;
	subject: string | null;
	from: string | null;
	/** RFC3339 timestamp when the host could parse one. */
	date: string | null;
	/** Untrusted external text; hosts delimit it before it reaches the model. */
	snippet: string | null;
}

export interface AgenticChatEmailMessageV1 extends AgenticChatEmailMessageSummaryV1 {
	to: string[];
	cc: string[];
	/** Untrusted external text; hosts delimit it before it reaches the model. */
	body: string | null;
	bodyTruncated: boolean;
}

export interface AgenticChatEmailAccountFailureV1 {
	connectionId: string;
	/** e.g. `reconnect_required`, `rate_limited`, `provider_error`. */
	reason_code: string;
}

export interface AgenticChatEmailSearchInputV1 {
	/** MUST equal the read context's trusted `userId`. */
	userId: string;
	/** Omit to search every readable account. */
	connectionIds?: string[];
	query?: string;
	maxResults?: number;
	cursor?: string;
}

export interface AgenticChatEmailSearchResultV1 {
	messages: AgenticChatEmailMessageSummaryV1[];
	nextCursor: string | null;
	/** Accounts that failed; search still returns results from the healthy ones. */
	accountFailures: AgenticChatEmailAccountFailureV1[];
}

export interface AgenticChatEmailGetMessageInputV1 {
	/** MUST equal the read context's trusted `userId`. */
	userId: string;
	connectionId: string;
	messageId: string;
}

/**
 * Minimal read-only email surface. Deliberately narrow — the chat-lane concerns
 * (per-turn call caps, character budgets, untrusted-content delimiters, deep
 * links) stay on the host side, and the tool-facing shape grows in A7.
 */
export interface AgenticChatEmailReadPortV1 {
	listAccounts(input: { userId: string }): Promise<AgenticChatEmailAccountV1[]>;
	searchMessages(input: AgenticChatEmailSearchInputV1): Promise<AgenticChatEmailSearchResultV1>;
	getMessage(input: AgenticChatEmailGetMessageInputV1): Promise<AgenticChatEmailMessageV1 | null>;
}
