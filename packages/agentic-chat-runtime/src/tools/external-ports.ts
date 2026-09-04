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

export type AgenticChatEmailCapabilityStatusV1 = 'enabled' | 'disabled' | 'reconnect_required';

export interface AgenticChatEmailAccountV1 {
	connectionId: string;
	emailAddress: string;
	accountLabel: string;
	status: AgenticChatEmailAccountStatusV1;
	readEnabled: boolean;
	/** Stored `read` capability grant; `disabled` when the connection has no grant row. */
	readCapabilityStatus: AgenticChatEmailCapabilityStatusV1;
}

export interface AgenticChatEmailAccountsResultV1 {
	/** False when read-only Gmail OAuth is not configured in this environment at all. */
	available: boolean;
	maxConnections: number;
	accounts: AgenticChatEmailAccountV1[];
}

/**
 * Calendar connection health as `get_external_account_status` reports it. This
 * is deliberately not the calendar read port: the status tool answers "can this
 * exact address be read at all", which is a connection question, and it must
 * still answer it on a host that cannot reach the Google Calendar API.
 */
export interface AgenticChatCalendarAccountSourceV1 {
	readEnabled: boolean;
	/** Google access role for the source (`owner`, `writer`, `reader`, ...). */
	accessRole: string;
}

export interface AgenticChatCalendarAccountV1 {
	connectionId: string;
	emailAddress: string;
	accountLabel: string;
	status: AgenticChatEmailAccountStatusV1;
	sources: AgenticChatCalendarAccountSourceV1[];
}

export interface AgenticChatCalendarAccountsResultV1 {
	/** False when multi-account Google Calendar is not configured in this environment. */
	available: boolean;
	accounts: AgenticChatCalendarAccountV1[];
}

/**
 * Both external-account surfaces in one read. The calendar half is nullable on
 * purpose: the legacy web executor resolved it with `Promise.allSettled` so an
 * unavailable calendar never hid a healthy inbox answer.
 */
export interface AgenticChatExternalAccountsResultV1 {
	gmail: AgenticChatEmailAccountsResultV1;
	/** Null when the host could not read calendar connections at all. */
	calendar: AgenticChatCalendarAccountsResultV1 | null;
}

export type AgenticChatEmailSearchAccountStatusV1 =
	| 'success'
	| 'reconnect_required'
	| 'unavailable';

/** Per-account outcome of one multi-account search; a failed account never fails the search. */
export interface AgenticChatEmailSearchAccountV1 {
	connectionId: string;
	accountLabel: string;
	emailAddress: string;
	status: AgenticChatEmailSearchAccountStatusV1;
	messageCount: number;
	hasMore: boolean;
	/** Opaque host-issued pagination envelope, bound to this user/connection/query. */
	nextCursor: string | null;
}

export interface AgenticChatEmailMessageSummaryV1 {
	connectionId: string;
	accountLabel: string;
	emailAddress: string;
	messageId: string;
	threadId: string;
	/** Untrusted external text; the shared tools delimit it before the model sees it. */
	subject: string;
	/** Untrusted external text; the shared tools delimit it before the model sees it. */
	from: string;
	/** RFC3339 timestamp derived from the provider's internal date. */
	date: string;
	/** Untrusted external text; the shared tools delimit it before the model sees it. */
	snippet: string;
}

export interface AgenticChatEmailMessageV1 extends AgenticChatEmailMessageSummaryV1 {
	/** Untrusted external text. */
	to: string;
	/** Untrusted external text. */
	cc: string | null;
	/** Sanitized plain text, already size-capped by the host gateway. Untrusted. */
	body: string;
	bodyTruncated: boolean;
	hasUnsupportedAttachments: boolean;
	fetchedAt: string;
}

export interface AgenticChatEmailSearchInputV1 {
	/** MUST equal the read context's trusted `userId`. */
	userId: string;
	/** Exact connection ids the user owns. The tool never searches an implicit set. */
	connectionIds: string[];
	query: string;
	maxResults?: number;
	cursor?: string;
}

export interface AgenticChatEmailSearchResultV1 {
	accounts: AgenticChatEmailSearchAccountV1[];
	messages: AgenticChatEmailMessageSummaryV1[];
	fetchedAt: string;
}

export interface AgenticChatEmailGetMessageInputV1 {
	/** MUST equal the read context's trusted `userId`. */
	userId: string;
	connectionId: string;
	messageId: string;
}

/**
 * Classified failures the shared email tools can turn into safe, content-free
 * model-facing errors. Anything a host throws that is NOT one of these is
 * assumed to carry request details or credentials and is collapsed into a
 * single generic message.
 */
export type AgenticChatEmailReadErrorCodeV1 =
	| 'invalid_request'
	| 'not_configured'
	| 'connection_not_found'
	| 'reconnect_required'
	| 'read_capability_disabled'
	| 'message_not_found'
	| 'provider_response_too_large'
	| 'unsupported_message'
	| 'rate_limited'
	| 'provider_error';

export class AgenticChatEmailReadErrorV1 extends Error {
	constructor(
		public readonly code: AgenticChatEmailReadErrorCodeV1,
		message: string,
		public readonly connectionId: string | null = null
	) {
		super(message);
		this.name = 'AgenticChatEmailReadErrorV1';
	}
}

/**
 * Bundle boundaries break `instanceof` (web and the worker load their own copy
 * of this module), so classification matches by shape, exactly as the calendar
 * port does for `GoogleCalendarConnectionError`.
 */
export function asAgenticChatEmailReadErrorV1(error: unknown): {
	code: AgenticChatEmailReadErrorCodeV1;
	message: string;
	connectionId: string | null;
} | null {
	if (!error || typeof error !== 'object') return null;
	const candidate = error as {
		name?: unknown;
		code?: unknown;
		message?: unknown;
		connectionId?: unknown;
	};
	if (candidate.name !== 'AgenticChatEmailReadErrorV1') return null;
	if (typeof candidate.code !== 'string') return null;
	return {
		code: candidate.code as AgenticChatEmailReadErrorCodeV1,
		message: typeof candidate.message === 'string' ? candidate.message : '',
		connectionId: typeof candidate.connectionId === 'string' ? candidate.connectionId : null
	};
}

/**
 * The read-only email surface the shared tools need. Hosts own OAuth, the
 * provider transport, ownership checks, sanitization, size caps and rate
 * limiting; the shared tools own the chat-lane concerns (per-turn call cap,
 * character budget, untrusted-content delimiters, deep links) so web and the
 * worker produce identical payloads.
 *
 * Every method authorizes against the caller-supplied `userId`; hosts MUST
 * reject a `userId` that does not match the read context.
 */
export interface AgenticChatEmailReadPortV1 {
	/** Connected Gmail accounts. No provider call. */
	listAccounts(input: { userId: string }): Promise<AgenticChatEmailAccountsResultV1>;
	/** Gmail plus calendar connection health, for `get_external_account_status`. */
	listExternalAccounts(input: { userId: string }): Promise<AgenticChatExternalAccountsResultV1>;
	/** Bounded multi-account search across the exact connection ids supplied. */
	searchMessages(input: AgenticChatEmailSearchInputV1): Promise<AgenticChatEmailSearchResultV1>;
	/** One sanitized message. Throws `message_not_found` rather than returning null. */
	getMessage(input: AgenticChatEmailGetMessageInputV1): Promise<AgenticChatEmailMessageV1>;
}
