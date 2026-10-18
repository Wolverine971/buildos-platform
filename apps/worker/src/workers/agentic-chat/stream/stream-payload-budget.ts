// apps/worker/src/workers/agentic-chat/stream/stream-payload-budget.ts
//
// Byte budgets for what a turn writes into the UI stream: each durable event
// row and the reconcile projection. Postgres caps a semantic payload at
// 256 KiB and a projection at 512 KiB (`pg_column_size` of the jsonb value),
// while a read may return up to 480 KiB. Before these budgets one large read
// threw at enqueue and failed the whole turn (pipeline audit B4), and every
// event resent the full projection (turn dac81d9d wrote ~7 MB of JSON).
//
// Everything here is pure and deterministic: the same payload always compacts
// to the same value, so a replayed transition still matches its stored row
// (`persist_agentic_chat_semantic_event*` reject a conflicting replay).
import {
	PROPOSAL_CARD_RAIL,
	PROPOSAL_CARD_READY_STATUS
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import {
	AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_MAX_BYTES,
	AGENTIC_CHAT_STREAM_PROJECTION_MAX_BYTES,
	type JsonObject,
	type JsonValue
} from '@buildos/shared-types';

/**
 * Estimated stored bytes allowed for one durable event payload. Well under the
 * 256 KiB database bound: the estimate is conservative, but jsonb and JSON text
 * sizes differ, so keep real headroom.
 */
export const AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_BUDGET_BYTES = 160 * 1024;
/** Tool events (call, result, progress) carry a compact summary in the projection. */
export const AGENTIC_CHAT_UI_PROJECTION_TOOL_ENTRY_BUDGET_BYTES = 16 * 1024;
/** Other events (session, context snapshots) stay whole unless very large. */
export const AGENTIC_CHAT_UI_PROJECTION_ENTRY_BUDGET_BYTES = 64 * 1024;
/**
 * Whole-projection budget. The terminal finalize RPC appends a context event
 * (≤ 256 KiB) and timing to this projection and then enforces 512 KiB, so the
 * worker's part stays below half of that bound.
 */
export const AGENTIC_CHAT_UI_PROJECTION_BUDGET_BYTES = 192 * 1024;

const TOOL_EVENT_TYPES = new Set(['tool_call', 'tool_result', 'tool_progress']);

if (
	AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_BUDGET_BYTES >= AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_MAX_BYTES ||
	AGENTIC_CHAT_UI_PROJECTION_BUDGET_BYTES * 2 > AGENTIC_CHAT_STREAM_PROJECTION_MAX_BYTES
) {
	throw new Error('Agentic Chat stream budgets must stay inside the database bounds');
}

/**
 * Upper estimate of a JSON value's stored size: at least its JSON text length
 * (with escapes) and at least its jsonb binary size (4-byte entry headers,
 * container headers, alignment padding, numeric digits). Cheap enough to run
 * on every event; never stringifies.
 */
export function estimateStreamJsonBytes(value: unknown): number {
	if (value === null || value === undefined || typeof value === 'boolean') return 8;
	if (typeof value === 'number') return 12 + String(value).length;
	if (typeof value === 'string') return 6 + escapedJsonStringBytes(value);
	if (Array.isArray(value)) {
		let total = 12;
		for (const item of value) total += 1 + estimateStreamJsonBytes(item);
		return total;
	}
	if (typeof value === 'object') {
		let total = 12;
		for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
			if (child === undefined) continue;
			total += 8 + escapedJsonStringBytes(key) + estimateStreamJsonBytes(child);
		}
		return total;
	}
	return 8;
}

/** \b \t \n \f \r: two-byte escapes; other control characters take six (\u00XX). */
const SHORT_JSON_ESCAPES = new Set([0x08, 0x09, 0x0a, 0x0c, 0x0d]);

/** UTF-8 bytes of the string as JSON.stringify writes it (without the quotes). */
function escapedJsonStringBytes(value: string): number {
	let extra = 0;
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code === 0x22 || code === 0x5c) extra += 1;
		else if (code < 0x20) extra += SHORT_JSON_ESCAPES.has(code) ? 1 : 5;
	}
	return Buffer.byteLength(value, 'utf8') + extra;
}

type CompactionLevel = {
	maxString: number;
	maxArray: number;
	maxKeys: number;
	maxDepth: number;
};

/**
 * Progressively tighter shapes. Types are preserved at every level (a string
 * stays a string, an array an array), so a browser consumer that walks the
 * value never meets a type it did not expect: it just sees less of it.
 */
const COMPACTION_LEVELS: readonly CompactionLevel[] = [
	{ maxString: 4_000, maxArray: 100, maxKeys: 200, maxDepth: 12 },
	{ maxString: 1_000, maxArray: 40, maxKeys: 100, maxDepth: 8 },
	{ maxString: 300, maxArray: 15, maxKeys: 60, maxDepth: 6 },
	{ maxString: 120, maxArray: 5, maxKeys: 30, maxDepth: 4 },
	{ maxString: 60, maxArray: 2, maxKeys: 12, maxDepth: 2 }
];

const TRUNCATION_SUFFIX = '…';

export type StreamCompactionResultV1<T> = {
	value: T;
	compacted: boolean;
	/** Estimated bytes before compaction. */
	originalBytes: number;
	/** Estimated bytes after compaction. */
	bytes: number;
};

/**
 * Shrinks a JSON value until its estimate fits `budgetBytes`, keeping its
 * shape. Returns the input itself when it already fits. When even the tightest
 * level does not fit, containers come back empty (`{}` / `[]`) and strings cut
 * to a short prefix: callers always get a bounded value of the same type.
 */
export function compactStreamJsonValue<T extends JsonValue>(
	value: T,
	budgetBytes: number
): StreamCompactionResultV1<T> {
	const originalBytes = estimateStreamJsonBytes(value);
	if (originalBytes <= budgetBytes) {
		return { value, compacted: false, originalBytes, bytes: originalBytes };
	}
	for (const level of COMPACTION_LEVELS) {
		const shrunk = shrinkJson(value, level, 0) as T;
		const bytes = estimateStreamJsonBytes(shrunk);
		if (bytes <= budgetBytes) return { value: shrunk, compacted: true, originalBytes, bytes };
	}
	const emptied = emptyOfSameType(value) as T;
	return {
		value: emptied,
		compacted: true,
		originalBytes,
		bytes: estimateStreamJsonBytes(emptied)
	};
}

function shrinkJson(value: unknown, level: CompactionLevel, depth: number): unknown {
	if (typeof value === 'string') return truncateString(value, level.maxString);
	if (value === null || typeof value !== 'object') return value;
	if (depth >= level.maxDepth) return Array.isArray(value) ? [] : {};
	if (Array.isArray(value)) {
		return value.slice(0, level.maxArray).map((item) => shrinkJson(item, level, depth + 1));
	}
	const result: Record<string, unknown> = {};
	let kept = 0;
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		if (child === undefined) continue;
		if (kept >= level.maxKeys) break;
		result[key] = shrinkJson(child, level, depth + 1);
		kept += 1;
	}
	return result;
}

function emptyOfSameType(value: unknown): unknown {
	if (typeof value === 'string') return truncateString(value, 32);
	if (Array.isArray(value)) return [];
	if (value !== null && typeof value === 'object') return {};
	return value;
}

function truncateString(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	let end = maxLength;
	// Never leave a lone high surrogate at the cut.
	const last = value.charCodeAt(end - 1);
	if (last >= 0xd800 && last <= 0xdbff) end -= 1;
	return value.slice(0, end) + TRUNCATION_SUFFIX;
}

/**
 * Marker written next to a compacted part of an event. It names the field and
 * how large it was, so the history view, admin tools, and the browser can say
 * "trimmed for the live view" rather than show a silently shorter value. The
 * full result always remains in the tool-execution ledger row.
 */
export type AgenticChatStreamCompactionMarkerV1 = {
	version: 1;
	fields: string[];
	original_bytes: number;
};

export const AGENTIC_CHAT_STREAM_COMPACTION_MARKER_KEY = 'stream_compaction';

/**
 * Fits one semantic event payload into `budgetBytes`. Tool events shrink their
 * bulky field first (a result's inner `result`, then `affected_entities`; a
 * call's argument JSON; progress `data`), leaving routing fields such as
 * `tool_call_id`, `tool_name`, `success`, and `error` intact. Any other event,
 * or a tool event that still does not fit, is compacted as a whole except its
 * `type`. Identity and envelope fields are added by the caller afterwards.
 */
export function fitAgenticChatStreamPayloadV1(
	payload: JsonObject,
	budgetBytes: number
): StreamCompactionResultV1<JsonObject> {
	const originalBytes = estimateStreamJsonBytes(payload);
	if (originalBytes <= budgetBytes) {
		return { value: payload, compacted: false, originalBytes, bytes: originalBytes };
	}
	const type = typeof payload.type === 'string' ? payload.type : null;
	const targeted =
		type === 'tool_result'
			? fitToolResultPayload(payload, budgetBytes, originalBytes)
			: type === 'tool_call'
				? fitToolCallPayload(payload, budgetBytes, originalBytes)
				: type === 'tool_progress'
					? fitFieldPayload(payload, ['data'], budgetBytes, originalBytes)
					: null;
	if (targeted) {
		const bytes = estimateStreamJsonBytes(targeted);
		if (bytes <= budgetBytes) return { value: targeted, compacted: true, originalBytes, bytes };
	}
	return fitWholePayload(payload, budgetBytes, originalBytes);
}

/**
 * Budget for one projection entry of this event type. A tool result carrying a
 * ready proposal card keeps the larger budget: a browser that reconciles
 * mid-turn renders the card from this entry and digests what it shows, so a
 * clipped card would vanish or have its Apply refused as changed.
 */
export function agenticChatProjectionEntryBudgetV1(eventType: string, payload?: JsonValue): number {
	if (!TOOL_EVENT_TYPES.has(eventType)) return AGENTIC_CHAT_UI_PROJECTION_ENTRY_BUDGET_BYTES;
	return eventType === 'tool_result' && payload !== undefined && carriesReadyProposalCard(payload)
		? AGENTIC_CHAT_UI_PROJECTION_ENTRY_BUDGET_BYTES
		: AGENTIC_CHAT_UI_PROJECTION_TOOL_ENTRY_BUDGET_BYTES;
}

/** The browser's card lookup (proposal-cards.ts findCardEnvelope): structured rail + status only. */
function carriesReadyProposalCard(value: JsonValue | undefined, depth = 0): boolean {
	if (depth > 5 || !isJsonObject(value)) return false;
	if (value.card_rail === PROPOSAL_CARD_RAIL && value.status === PROPOSAL_CARD_READY_STATUS) {
		return true;
	}
	return (
		carriesReadyProposalCard(value.result, depth + 1) ||
		carriesReadyProposalCard(value.data, depth + 1)
	);
}

function marker(fields: string[], originalBytes: number): JsonObject {
	return {
		version: 1,
		fields,
		original_bytes: originalBytes
	} satisfies AgenticChatStreamCompactionMarkerV1;
}

function fitToolResultPayload(
	payload: JsonObject,
	budgetBytes: number,
	originalBytes: number
): JsonObject | null {
	const result = payload.result;
	if (!isJsonObject(result)) return null;
	const fields: string[] = [];
	let next: JsonObject = { ...result };
	// Room left for the two bulky fields once everything else and the marker fit.
	const room =
		budgetBytes -
		estimateStreamJsonBytes({
			...payload,
			result: { ...next, result: null, affected_entities: [] }
		}) -
		160;
	// Entity refs get at most a quarter of the room; the tool output gets the rest.
	const entities = next.affected_entities;
	if (entities !== undefined && entities !== null) {
		const fitted = compactStreamJsonValue(entities, Math.max(64, Math.floor(room / 4)));
		if (fitted.compacted) {
			next = { ...next, affected_entities: fitted.value };
			fields.push('result.affected_entities');
		}
	}
	const inner = next.result;
	if (inner !== undefined && inner !== null) {
		const entitiesBytes = estimateStreamJsonBytes(next.affected_entities ?? null);
		const fitted = compactStreamJsonValue(inner, Math.max(64, room - entitiesBytes));
		if (fitted.compacted) {
			next = { ...next, result: fitted.value };
			fields.push('result.result');
		}
	}
	if (!fields.length) return null;
	return {
		...payload,
		result: next,
		[AGENTIC_CHAT_STREAM_COMPACTION_MARKER_KEY]: marker(fields, originalBytes)
	};
}

function fitToolCallPayload(
	payload: JsonObject,
	budgetBytes: number,
	originalBytes: number
): JsonObject | null {
	const toolCall = payload.tool_call;
	if (!isJsonObject(toolCall) || !isJsonObject(toolCall.function)) return null;
	const rawArguments = toolCall.function.arguments;
	if (typeof rawArguments !== 'string') return null;
	let parsed: JsonValue;
	try {
		parsed = JSON.parse(rawArguments) as JsonValue;
	} catch {
		return null;
	}
	const outsideBytes = estimateStreamJsonBytes({
		...payload,
		tool_call: { ...toolCall, function: { ...toolCall.function, arguments: '' } }
	});
	// Argument JSON is stored as a string, so its quotes and backslashes are
	// escaped once more: budget the parsed value at under half the room left.
	const argumentBudget = Math.max(64, Math.floor((budgetBytes - outsideBytes - 160) / 2));
	const fitted = compactStreamJsonValue(parsed, argumentBudget);
	if (!fitted.compacted) return null;
	return {
		...payload,
		tool_call: {
			...toolCall,
			function: { ...toolCall.function, arguments: JSON.stringify(fitted.value) }
		},
		[AGENTIC_CHAT_STREAM_COMPACTION_MARKER_KEY]: marker(
			['tool_call.function.arguments'],
			originalBytes
		)
	};
}

function fitFieldPayload(
	payload: JsonObject,
	fieldNames: string[],
	budgetBytes: number,
	originalBytes: number
): JsonObject | null {
	let next: JsonObject = { ...payload };
	const fields: string[] = [];
	for (const field of fieldNames) {
		const value = next[field];
		if (value === undefined || value === null) continue;
		const outsideBytes = estimateStreamJsonBytes({ ...next, [field]: null });
		const fitted = compactStreamJsonValue(
			value,
			Math.max(64, budgetBytes - outsideBytes - 160)
		);
		if (!fitted.compacted) continue;
		next = { ...next, [field]: fitted.value };
		fields.push(field);
	}
	if (!fields.length) return null;
	return { ...next, [AGENTIC_CHAT_STREAM_COMPACTION_MARKER_KEY]: marker(fields, originalBytes) };
}

function fitWholePayload(
	payload: JsonObject,
	budgetBytes: number,
	originalBytes: number
): StreamCompactionResultV1<JsonObject> {
	const { type, ...rest } = payload;
	const reserve = estimateStreamJsonBytes({ type: type ?? null }) + 160;
	const fitted = compactStreamJsonValue(rest as JsonObject, Math.max(64, budgetBytes - reserve));
	const value: JsonObject = {
		...fitted.value,
		...(type !== undefined ? { type } : {}),
		[AGENTIC_CHAT_STREAM_COMPACTION_MARKER_KEY]: marker(['*'], originalBytes)
	};
	return { value, compacted: true, originalBytes, bytes: estimateStreamJsonBytes(value) };
}

function isJsonObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
