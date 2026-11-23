// packages/agentic-chat-runtime/src/loop/external-content-policy.ts
//
// S1 of the wave-3 security brief (tasker 20): once a turn has read content a
// third party wrote, every write in that turn needs independent review. The
// rule lived in the web stream orchestrator's turn-security-policy.ts and was
// deleted with the legacy engine (35bbbd3c5). The worker restores it from
// structured signals only: the name of each tool the turn ran and the `source`
// field the shared calendar reads put on every event. Nothing here reads the
// words of an email, page, or event.
//
// What counts as external: text someone other than the user can put in front
// of the model without the user writing it.
//
// - Gmail message content (subjects, senders, snippets, bodies):
//   `search_email_messages`, `scan_email_inbox`, `get_email_message`. The
//   account tools (`list_email_accounts`, `get_external_account_status`,
//   `request_email_account_connection`) return connection plumbing only and
//   are not external (AGENTIC_CHAT_CONTENT_FREE_EMAIL_TOOL_NAMES_V1).
// - The public web: `web_search`, `web_visit`, `web_navigate`, and `explore_knowledge`
//   (guided search's outside hop, whose result is entries read off public pages).
//   `enrich_knowledge` is a write, but its chat result carries what its research run
//   read off the web; it is external when that result reports findings, pages, or
//   summaries (agenticChatWriteIngestsExternalContentV1).
// - Google Calendar events: anyone can put an event on the user's calendar (an
//   invite, a booking page) with an arbitrary title, description, and location.
//   The organizer field does not prove authorship: booking tools create
//   events the user "organizes" that hold the invitee's text. A calendar read
//   is external when its result carries a Google-sourced event. Events BuildOS
//   stores itself (`source: 'ontology'`) are the user's data.
//
// - Other members' knowledge entries (`get_project_knowledge_lens`, tasker 168): another
//   person's notes, quotes and researched facts about the names in a shared project, read
//   live from their private graph. An ask or save that follows needs review.
//
// Not external: the user's own BuildOS records (projects, tasks, documents,
// goals, plans, milestones, risks, assets, BuildOS calendar rows), field
// metadata, skills, and control tools. Content that came from outside and was
// later saved into a BuildOS record is not re-tainted when it is read back.
//
// Email and web taint by tool name whether or not the call succeeded, so an
// error or partial payload cannot slip past. A failed calendar read returns no
// event text and does not taint.
//
// A web read may also say that a page it returned was flagged by the web-content check
// (text written to steer an AI). The turn was already tainted by the tool's name; the flag
// is carried to the write review so it can be stricter about that page.

const EXTERNAL_CONTENT_TOOL_NAMES = [
	'search_email_messages',
	'scan_email_inbox',
	'get_email_message',
	'web_search',
	'web_visit',
	'web_navigate',
	// Guided search's outside hop (2026-11-22): names and summaries read off public pages.
	'explore_knowledge',
	'get_project_knowledge_lens'
] as const;

const CALENDAR_EVENT_READ_TOOL_NAMES = [
	'list_calendar_events',
	'get_calendar_event_details'
] as const;

/** Tools whose every result is externally authored content. */
export const AGENTIC_CHAT_EXTERNAL_CONTENT_TOOL_NAMES_V1 = Object.freeze([
	...EXTERNAL_CONTENT_TOOL_NAMES
]);

/** Calendar reads that are external when their result carries a provider event. */
export const AGENTIC_CHAT_CALENDAR_EVENT_READ_TOOL_NAMES_V1 = Object.freeze([
	...CALENDAR_EVENT_READ_TOOL_NAMES
]);

const EXTERNAL_CONTENT_TOOL_NAME_SET = new Set<string>(EXTERNAL_CONTENT_TOOL_NAMES);
const CALENDAR_EVENT_READ_TOOL_NAME_SET = new Set<string>(CALENDAR_EVENT_READ_TOOL_NAMES);

/**
 * Did this executed read put externally authored content in front of the
 * model? Call it once per completed read; a true answer taints the rest of the
 * turn.
 */
export function agenticChatReadIngestsExternalContentV1(input: {
	toolName: string;
	succeeded: boolean;
	result?: unknown;
}): boolean {
	const toolName = input.toolName.trim().toLowerCase();
	if (EXTERNAL_CONTENT_TOOL_NAME_SET.has(toolName)) return true;
	if (!CALENDAR_EVENT_READ_TOOL_NAME_SET.has(toolName) || !input.succeeded) return false;
	return calendarResultCarriesProviderEvent(toolName, input.result);
}

/**
 * Did this completed write hand the model web-derived content? `enrich_knowledge` is a write,
 * but in chat the gateway waits for its research run and returns what it read off public
 * pages (found details, page titles, per-entry summaries). Decided from the structured
 * `knowledge_run` fields only: a run that came back with no findings, pages, or summaries
 * (or that was only queued) put nothing from the web in front of the model.
 */
export function agenticChatWriteIngestsExternalContentV1(input: {
	toolName: string;
	succeeded: boolean;
	result?: unknown;
}): boolean {
	if (!input.succeeded) return false;
	if (input.toolName.trim().toLowerCase() !== 'enrich_knowledge') return false;
	if (!isRecord(input.result)) return false;
	const run = input.result.knowledge_run;
	if (!isRecord(run)) return false;
	const nonEmpty = (value: unknown) => Array.isArray(value) && value.length > 0;
	if (nonEmpty(run.found) || nonEmpty(run.pages)) return true;
	return (
		Array.isArray(run.targets) &&
		run.targets.some(
			(target) =>
				isRecord(target) &&
				typeof target.summary === 'string' &&
				target.summary.trim().length > 0
		)
	);
}

/**
 * Named among a turn's external-content sources when a web read returned a page the
 * web-content check flagged (text written to steer an AI). It is a marker, not a tool.
 */
export const AGENTIC_CHAT_FLAGGED_WEB_CONTENT_SOURCE_V1 = 'flagged_web_page';

/**
 * Did this read's result declare a flagged page? Reads the structured `content_warnings`
 * field the worker's web-content check writes; never the page text.
 */
export function agenticChatReadCarriesFlaggedWebContentV1(result: unknown): boolean {
	return (
		isRecord(result) &&
		Array.isArray(result.content_warnings) &&
		result.content_warnings.some((entry) => isRecord(entry) && typeof entry.url === 'string')
	);
}

function calendarResultCarriesProviderEvent(toolName: string, result: unknown): boolean {
	// An unreadable payload proves nothing about its source: fail closed.
	if (!isRecord(result)) return true;
	if (toolName === 'get_calendar_event_details') {
		if (result.source === 'ontology') return false;
		// A Google lookup that found nothing returns reason codes, not event text.
		return result.event !== null && result.event !== undefined;
	}
	const events = result.events;
	if (!Array.isArray(events)) return true;
	return events.some((event) => !isRecord(event) || event.source !== 'ontology');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
