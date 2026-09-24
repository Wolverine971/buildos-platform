// packages/agentic-chat-runtime/src/tools/tool-storage-projection.ts
//
// What durable storage keeps of a read tool's result. Every read tool has a
// storage class:
//
//  - `workspace`: the user's own BuildOS records (projects, tasks, documents,
//    BuildOS calendar events, account/connection metadata). Stored as is, as a
//    derived copy that expires with the tool ledger and turn events.
//  - `pass_through`: content BuildOS reads on the user's behalf (Gmail, Google
//    Calendar events it did not create, web pages). The model reads the full
//    result in memory for the current turn; storage keeps only a content-free
//    trace built from structured fields: ids, times, counts, statuses, URLs,
//    titles of web pages, and content hashes.
//
// Sinks: `chat_tool_executions.result`, the `tool_result` turn event (and so
// `chat_turn_stream_state.projection`), terminal records, and admin views of
// older rows. Keyed on tool_name only; nothing here reads the text it drops.
// Tool arguments are stored as written.
import { redactAgenticChatEmailToolResultForStorageV1 } from './email-reads';

export type AgenticChatToolStorageClassV1 = 'workspace' | 'pass_through';

/** One entry per read tool. The guard test fails when a read tool is missing. */
export const AGENTIC_CHAT_TOOL_STORAGE_CLASSES_V1: Readonly<
	Record<string, AgenticChatToolStorageClassV1>
> = Object.freeze({
	// BuildOS workspace reads.
	list_onto_projects: 'workspace',
	list_onto_tasks: 'workspace',
	list_onto_goals: 'workspace',
	list_onto_plans: 'workspace',
	list_onto_documents: 'workspace',
	list_onto_milestones: 'workspace',
	list_onto_risks: 'workspace',
	search_onto_projects: 'workspace',
	search_onto_tasks: 'workspace',
	search_onto_goals: 'workspace',
	search_onto_plans: 'workspace',
	search_onto_documents: 'workspace',
	search_onto_milestones: 'workspace',
	search_onto_risks: 'workspace',
	search_all_projects: 'workspace',
	search_buildos: 'workspace',
	search_project: 'workspace',
	search_ontology: 'workspace',
	explore_project: 'workspace',
	get_onto_project_details: 'workspace',
	get_onto_project_graph: 'workspace',
	get_onto_document_details: 'workspace',
	get_onto_goal_details: 'workspace',
	get_onto_plan_details: 'workspace',
	get_onto_milestone_details: 'workspace',
	get_onto_risk_details: 'workspace',
	get_onto_task_details: 'workspace',
	list_task_documents: 'workspace',
	get_document_outline: 'workspace',
	read_document_section: 'workspace',
	get_document_tree: 'workspace',
	get_document_path: 'workspace',
	search_onto_assets: 'workspace',
	get_onto_asset: 'workspace',
	get_workspace_overview: 'workspace',
	get_project_overview: 'workspace',
	get_entity_relationships: 'workspace',
	get_linked_entities: 'workspace',
	get_user_profile_overview: 'workspace',
	search_user_contacts: 'workspace',
	list_user_contact_candidates: 'workspace',
	get_field_info: 'workspace',
	get_buildos_overview: 'workspace',
	get_buildos_usage_guide: 'workspace',
	list_corsair_mcp_tools: 'workspace',
	// The BuildOS project_calendars mapping row, not calendar content.
	get_project_calendar: 'workspace',
	// Connection plumbing: account ids, labels, statuses.
	get_external_account_status: 'workspace',
	request_email_account_connection: 'workspace',
	list_email_accounts: 'workspace',
	// Read on the user's behalf.
	search_email_messages: 'pass_through',
	get_email_message: 'pass_through',
	scan_email_inbox: 'pass_through',
	list_calendar_events: 'pass_through',
	get_calendar_event_details: 'pass_through',
	web_search: 'pass_through',
	web_visit: 'pass_through',
	web_navigate: 'pass_through'
});

export const AGENTIC_CHAT_PASS_THROUGH_TOOL_NAMES_V1: readonly string[] = Object.freeze(
	Object.entries(AGENTIC_CHAT_TOOL_STORAGE_CLASSES_V1)
		.filter(([, storageClass]) => storageClass === 'pass_through')
		.map(([toolName]) => toolName)
);

export const AGENTIC_CHAT_CALENDAR_REDACTION_NOTICE_V1 =
	'Google Calendar event details are not stored; they were available to the assistant only during the turn.';
export const AGENTIC_CHAT_WEB_REDACTION_NOTICE_V1 =
	'Web content is not stored; it was available to the assistant only during the turn.';
export const AGENTIC_CHAT_EMAIL_REDACTION_NOTICE_V1 =
	'Email content is not stored; it was available to the assistant only during the turn.';

/** A projector's answer for a result that is workspace data after all. */
const KEEP = Symbol('keep');

function normalizeToolName(toolName: unknown): string {
	return typeof toolName === 'string' ? toolName.trim().toLowerCase() : '';
}

/** Null for tools that are not read tools (controls, writes, unknown names). */
export function getAgenticChatToolStorageClassV1(
	toolName: unknown
): AgenticChatToolStorageClassV1 | null {
	return AGENTIC_CHAT_TOOL_STORAGE_CLASSES_V1[normalizeToolName(toolName)] ?? null;
}

export function isAgenticChatPassThroughToolNameV1(toolName: unknown): boolean {
	return getAgenticChatToolStorageClassV1(toolName) === 'pass_through';
}

const REDACTION_NOTICE_BY_TOOL: Readonly<Record<string, string>> = Object.freeze({
	search_email_messages: AGENTIC_CHAT_EMAIL_REDACTION_NOTICE_V1,
	get_email_message: AGENTIC_CHAT_EMAIL_REDACTION_NOTICE_V1,
	scan_email_inbox: AGENTIC_CHAT_EMAIL_REDACTION_NOTICE_V1,
	list_calendar_events: AGENTIC_CHAT_CALENDAR_REDACTION_NOTICE_V1,
	get_calendar_event_details: AGENTIC_CHAT_CALENDAR_REDACTION_NOTICE_V1,
	web_search: AGENTIC_CHAT_WEB_REDACTION_NOTICE_V1,
	web_visit: AGENTIC_CHAT_WEB_REDACTION_NOTICE_V1,
	web_navigate: AGENTIC_CHAT_WEB_REDACTION_NOTICE_V1
});

export function redactionNoticeForAgenticChatToolV1(toolName: unknown): string {
	return (
		REDACTION_NOTICE_BY_TOOL[normalizeToolName(toolName)] ??
		'This content is not stored; it was available to the assistant only during the turn.'
	);
}

/** True for a stored trace (`content_redacted: true` at the top level). */
export function isAgenticChatToolResultContentRedactedV1(value: unknown): boolean {
	return isRecord(value) && value.content_redacted === true;
}

/**
 * The value durable storage keeps for a read tool's result. Workspace tools,
 * controls, and unknown names return `result` unchanged (same reference);
 * pass-through tools return a content-free trace marked `content_redacted`.
 * Idempotent: an existing trace is returned as is.
 */
export function projectAgenticChatToolResultForStorageV1(
	toolName: unknown,
	result: unknown
): unknown {
	const normalized = normalizeToolName(toolName);
	if (AGENTIC_CHAT_TOOL_STORAGE_CLASSES_V1[normalized] !== 'pass_through') return result;
	if (result === null || result === undefined) return result;
	if (isAgenticChatToolResultContentRedactedV1(result)) return result;
	if (!isRecord(result)) return minimalTrace(normalized);
	const projected =
		normalized === 'list_calendar_events'
			? projectCalendarList(result)
			: normalized === 'get_calendar_event_details'
				? projectCalendarDetail(result)
				: normalized === 'web_search'
					? projectWebSearch(result)
					: normalized === 'web_visit'
						? projectWebVisit(result)
						: normalized === 'web_navigate'
							? projectWebNavigate(result)
							: redactAgenticChatEmailToolResultForStorageV1(normalized, result);
	// get_calendar_event_details of a BuildOS-created event is workspace data.
	if (projected === KEEP) return result;
	const trace = projected ?? minimalTrace(normalized);
	// Keeps the repeat-read telemetry (`result->>'served_from_turn_memo'`).
	return result.served_from_turn_memo === true
		? { served_from_turn_memo: true, ...trace }
		: trace;
}

export type AgenticChatToolProgressV1 = {
	message: string;
	data: Record<string, unknown>;
};

/**
 * What a stored `tool_progress` event keeps. For web_navigate the description
 * is rebuilt by code from the structured step, so page text (link labels, page
 * titles) never reaches the event, the stream projection, or current_activity.
 */
export function projectAgenticChatToolProgressForStorageV1(
	toolName: unknown,
	progress: AgenticChatToolProgressV1
): AgenticChatToolProgressV1 {
	if (normalizeToolName(toolName) !== 'web_navigate') return progress;
	if (isRecord(progress.data) && progress.data.content_redacted === true) return progress;
	const data: Record<string, unknown> = isRecord(progress.data) ? progress.data : {};
	const projected = pickDefined(data, [
		'kind',
		'page',
		'url',
		'source',
		'links',
		'ms',
		'reason',
		'provider',
		'why',
		'answer',
		'needs_browser',
		'probability',
		'outcome',
		'pages'
	]);
	const next = isRecord(data.next) ? pickDefined(data.next, ['url', 'probability']) : null;
	if (next) projected.next = next;
	if (Array.isArray(data.alternatives)) {
		projected.alternatives = asRecordArray(data.alternatives).map((alternative) =>
			pickDefined(alternative, ['probability'])
		);
	}
	projected.content_redacted = true;
	return { message: describeNavigationStep(projected), data: projected };
}

// ============================================
// PROJECTORS
// ============================================

function minimalTrace(toolName: string): Record<string, unknown> {
	return {
		content_redacted: true,
		tool_name: toolName,
		redaction_notice: redactionNoticeForAgenticChatToolV1(toolName)
	};
}

function projectCalendarRow(row: Record<string, unknown>): Record<string, unknown> {
	// BuildOS-created events are workspace rows and keep every field.
	if (row.source !== 'google') return row;
	const event: Record<string, unknown> = isRecord(row.event) ? row.event : {};
	return {
		...pickDefined(row, [
			'source',
			'is_synced',
			'external_event_id',
			'calendar_source_id',
			'connection_id',
			'provider_calendar_id',
			'onto_event_id',
			'start_at',
			'end_at'
		]),
		all_day: allDayFlag(event)
	};
}

function projectCalendarList(result: Record<string, unknown>): Record<string, unknown> {
	const trace: Record<string, unknown> = {
		...pickDefined(result, [
			'calendar_read_failed',
			'error_code',
			'coverage',
			'reason_code',
			'query_scope',
			'google_event_count',
			'ontology_event_count',
			'merged_event_count',
			'pagination'
		])
	};
	if (isRecord(result.queried_range)) {
		trace.queried_range = pickDefined(result.queried_range, [
			'time_min',
			'time_max',
			'timezone',
			'default_time_min_applied',
			'default_time_max_applied'
		]);
	}
	if (isRecord(result.google_read)) trace.google_read = projectGoogleRead(result.google_read);
	trace.events = asRecordArray(result.events).map(projectCalendarRow);
	if (Array.isArray(result.warnings)) trace.warning_count = result.warnings.length;
	return {
		...trace,
		content_redacted: true,
		redaction_notice: AGENTIC_CHAT_CALENDAR_REDACTION_NOTICE_V1
	};
}

function projectGoogleRead(read: Record<string, unknown>): Record<string, unknown> {
	return {
		...pickDefined(read, [
			'mode',
			'source_count',
			'successful_source_count',
			'failed_source_count',
			'partial',
			'coverage'
		]),
		source_failures: asRecordArray(read.source_failures).map((failure) =>
			pickDefined(failure, ['calendar', 'calendar_source_id', 'connection_id', 'reason_code'])
		)
	};
}

function projectCalendarDetail(
	result: Record<string, unknown>
): Record<string, unknown> | typeof KEEP {
	if (result.source === 'ontology') return KEEP;
	const event = isRecord(result.event) ? result.event : null;
	const trace: Record<string, unknown> = {
		...pickDefined(result, [
			'source',
			'calendar_read_failed',
			'error_code',
			'coverage',
			'reason_code',
			'calendar_source_id',
			'connection_id',
			'provider_calendar_id',
			'external_event_id'
		]),
		event_found: event !== null
	};
	if (event) {
		const start: Record<string, unknown> = isRecord(event.start) ? event.start : {};
		const end: Record<string, unknown> = isRecord(event.end) ? event.end : {};
		trace.start_at = firstString(start.dateTime, start.date);
		trace.end_at = firstString(end.dateTime, end.date);
		trace.all_day = allDayFlag(event);
	}
	return {
		...trace,
		content_redacted: true,
		redaction_notice: AGENTIC_CHAT_CALENDAR_REDACTION_NOTICE_V1
	};
}

function projectWebSearch(result: Record<string, unknown>): Record<string, unknown> {
	const results = asRecordArray(result.results);
	const trace: Record<string, unknown> = {
		result_count: results.length,
		results: results.map((row) => pickDefined(row, ['url', 'title', 'page_final_url']))
	};
	if (isRecord(result.info)) {
		trace.info = pickDefined(result.info, [
			'provider',
			'search_depth',
			'max_results',
			'fetched_at',
			'cache_status',
			'provider_credits',
			'billing'
		]);
	}
	return {
		...trace,
		content_redacted: true,
		redaction_notice: AGENTIC_CHAT_WEB_REDACTION_NOTICE_V1
	};
}

function projectWebVisit(result: Record<string, unknown>): Record<string, unknown> {
	const trace: Record<string, unknown> = {
		...pickDefined(result, [
			'url',
			'final_url',
			'status_code',
			'content_type',
			'title',
			'truncated',
			'visit_id',
			'page_version_id',
			'page_version_number',
			'content_hash'
		]),
		...contentFingerprint(result.content)
	};
	if (isRecord(result.info) && typeof result.info.fetched_at === 'string') {
		trace.fetched_at = result.info.fetched_at;
	}
	return {
		...trace,
		content_redacted: true,
		redaction_notice: AGENTIC_CHAT_WEB_REDACTION_NOTICE_V1
	};
}

function projectWebNavigate(result: Record<string, unknown>): Record<string, unknown> {
	const trace: Record<string, unknown> = pickDefined(result, [
		'outcome',
		'start_url',
		'visited_urls'
	]);
	if (isRecord(result.answer_page)) {
		trace.answer_page = {
			...pickDefined(result.answer_page, [
				'url',
				'title',
				'source',
				'answer_probability',
				'truncated'
			]),
			...contentFingerprint(result.answer_page.content)
		};
	}
	trace.path = asRecordArray(result.path).map((entry) => {
		const row = pickDefined(entry, ['step', 'url', 'title', 'source', 'answer_probability']);
		if (isRecord(entry.clicked))
			row.clicked = pickDefined(entry.clicked, ['url', 'probability']);
		// The error detail can quote the site; the fixed marker keeps the step readable.
		if (entry.error !== undefined && entry.error !== null) row.error = 'step_failed';
		return row;
	});
	if (Array.isArray(result.failures)) {
		trace.failures = asRecordArray(result.failures).map((failure) =>
			pickDefined(failure, ['url', 'reason'])
		);
	}
	if (isRecord(result.stats)) trace.stats = result.stats;
	return {
		...trace,
		content_redacted: true,
		redaction_notice: AGENTIC_CHAT_WEB_REDACTION_NOTICE_V1
	};
}

function contentFingerprint(content: unknown): Record<string, unknown> {
	if (typeof content !== 'string') return {};
	return { content_sha256: sha256Hex(content), content_chars: Array.from(content).length };
}

function allDayFlag(event: Record<string, unknown>): boolean | null {
	const start = isRecord(event.start) ? event.start : null;
	if (!start) return null;
	if (typeof start.dateTime === 'string' && start.dateTime) return false;
	return typeof start.date === 'string' && start.date ? true : null;
}

// ============================================
// WEB NAVIGATION STEP DESCRIPTIONS (code-authored)
// ============================================

const LOAD_FAILURE_TEXT: Record<string, string> = {
	robots: 'robots.txt asks bots to skip it',
	blocked: 'the site blocked the request',
	not_found: 'page not found',
	network: 'it did not respond',
	unsupported: 'not a readable page'
};

function describeNavigationStep(data: Record<string, unknown>): string {
	const where = shortUrl(data.url);
	const ms = typeof data.ms === 'number' ? ` · ${data.ms}ms` : '';
	switch (data.kind) {
		case 'opened':
			return `Opened ${where || 'page'}${typeof data.links === 'number' ? ` · ${data.links} links` : ''}${ms}${data.source === 'tavily_extract' ? ' · via Tavily' : ''}`;
		case 'load_failed':
			return `Couldn't open ${where || 'page'}: ${LOAD_FAILURE_TEXT[String(data.reason)] ?? 'load failed'}`;
		case 'escalating':
			return `Retrying ${where || 'page'} with Tavily`;
		case 'decided': {
			const answer = typeof data.answer === 'number' ? data.answer : 0;
			const verdict = answer >= 0.5 ? 'answer is here' : 'not here';
			const next = isRecord(data.next)
				? ` → next link (${percent(data.next.probability)})`
				: '';
			const dead = answer < 0.5 && !isRecord(data.next) ? ', no promising links' : '';
			return `Jev: ${verdict} (${percent(answer)})${next}${dead}${ms}`;
		}
		case 'backtracking':
			return `Dead end, backtracking (${percent(data.probability)})`;
		case 'decision_failed':
			return 'Navigation model unavailable; stopping with what was found';
		case 'finished': {
			const pages = typeof data.pages === 'number' ? ` · ${data.pages} pages` : '';
			const seconds =
				typeof data.ms === 'number' ? ` in ${(data.ms / 1000).toFixed(1)}s` : '';
			const outcome =
				data.outcome === 'found'
					? 'Found it'
					: data.outcome === 'best_guess'
						? 'Closest match'
						: 'No page answered the goal';
			return `${outcome}${pages}${seconds}`;
		}
		default:
			return 'Web navigation step';
	}
}

function shortUrl(value: unknown): string {
	if (typeof value !== 'string') return '';
	try {
		const parsed = new URL(value);
		const path = `${parsed.pathname}${parsed.search}`.replace(/\/$/, '');
		const shown = `${parsed.hostname.replace(/^www\./, '')}${path}`;
		return shown.length > 70 ? `${shown.slice(0, 67)}…` : shown;
	} catch {
		return '';
	}
}

function percent(value: unknown): string {
	return typeof value === 'number' && Number.isFinite(value)
		? `${Math.round(value * 100)}%`
		: '?';
}

// ============================================
// HELPERS
// ============================================

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pickDefined(
	record: Record<string, unknown>,
	keys: readonly string[]
): Record<string, unknown> {
	const output: Record<string, unknown> = {};
	for (const key of keys) {
		if (record[key] !== undefined) output[key] = record[key];
	}
	return output;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

function firstString(...values: unknown[]): string | null {
	for (const value of values) {
		if (typeof value === 'string' && value) return value;
	}
	return null;
}

// Synchronous SHA-256 so this module stays importable from browser bundles
// (the tools barrel reaches client code) and from both server hosts.
const SHA256_K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function sha256Hex(text: string): string {
	const bytes = new TextEncoder().encode(text);
	const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
	padded.set(bytes);
	padded[bytes.length] = 0x80;
	const view = new DataView(padded.buffer);
	const bitLength = bytes.length * 8;
	view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
	view.setUint32(padded.length - 4, bitLength >>> 0);
	// Uint32Array arithmetic wraps every assignment modulo 2^32.
	const hash = new Uint32Array([
		0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
		0x5be0cd19
	]);
	const w = new Uint32Array(64);
	const s = new Uint32Array(8);
	const rotr = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));
	for (let offset = 0; offset < padded.length; offset += 64) {
		for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
		for (let i = 16; i < 64; i++) {
			const x = w[i - 15]!;
			const y = w[i - 2]!;
			w[i] =
				w[i - 16]! +
				(rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) +
				w[i - 7]! +
				(rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10));
		}
		s.set(hash);
		for (let i = 0; i < 64; i++) {
			const [a, b, c, d, e, f, g, h] = s as unknown as [
				number,
				number,
				number,
				number,
				number,
				number,
				number,
				number
			];
			const t1 =
				(h +
					(rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) +
					((e & f) ^ (~e & g)) +
					SHA256_K[i]! +
					w[i]!) >>>
				0;
			const t2 =
				((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
			s.set([t1 + t2, a, b, c, d + t1, e, f, g]);
		}
		for (let i = 0; i < 8; i++) hash[i] = hash[i]! + s[i]!;
	}
	return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('');
}
