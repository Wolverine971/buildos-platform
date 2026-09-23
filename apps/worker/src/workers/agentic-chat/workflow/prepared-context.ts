// apps/worker/src/workers/agentic-chat/workflow/prepared-context.ts
import { createHash } from 'node:crypto';
import {
	AGENTIC_CHAT_PROJECT_REVIEW_PAYLOAD_V2,
	AGENTIC_CHAT_PROJECT_REVIEW_PREPARATION_V2,
	AGENTIC_CHAT_WORKFLOW_LIMITS,
	type AgenticChatPreparedWorkflowContextV1,
	type AgenticChatRawWorkflowInputV4,
	type AgenticChatWorkflowEvidenceVersionV1,
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import type { MasterPromptContext } from '@buildos/agentic-chat-runtime/context';
import {
	type ContextEvidenceV1,
	contextEvidenceRecords
} from '@buildos/agentic-chat-runtime/context-finder';

/**
 * Tasker 86: turn one authorized project context read into the immutable,
 * request-bound prepared-context checkpoint (contract section 6), and turn an
 * accepted checkpoint plus frozen history into the provider-neutral model input.
 * Everything here is pure; the worker store owns the fenced RPC.
 */
export const AGENTIC_CHAT_WORKFLOW_PREPARATION_VERSION = 'agentic_chat_workflow_preparation_v1';
export const AGENTIC_CHAT_WORKFLOW_CONTEXT_PAYLOAD_VERSION =
	'agentic_chat_prepared_context_payload_v1';

const MAX_STRING_CHARS = 5_000;
const TRUNCATION_MARKER = '\n[Truncated]';
const MAX_DEPTH = 6;
// accept_agentic_chat_workflow_context_v1 rejects a payload whose jsonb text
// rendering exceeds 320 KiB. Keep a margin for numeric re-rendering.
const MAX_JSONB_TEXT_BYTES = 327_680 - 4_096;
const MODEL_HISTORY_MESSAGES = 6;
const MODEL_HISTORY_MESSAGE_CHARS = 1_500;

type CollectionKey =
	| 'goals'
	| 'milestones'
	| 'plans'
	| 'tasks'
	| 'documents'
	| 'events'
	| 'risks'
	| 'relationships'
	| 'activity'
	| 'prior_suggestions';
const COLLECTIONS: ReadonlyArray<readonly [CollectionKey, string]> = [
	['goals', 'goal'],
	['milestones', 'milestone'],
	['plans', 'plan'],
	['tasks', 'task'],
	['documents', 'document'],
	['events', 'event']
];
const REVIEW_COLLECTIONS: ReadonlyArray<readonly [CollectionKey, string]> = [
	...COLLECTIONS,
	['risks', 'risk'],
	['relationships', 'relationship'],
	['activity', 'activity'],
	['prior_suggestions', 'prior suggestion']
];
const REVIEW_DROP_ORDER: readonly CollectionKey[] = [
	'events',
	'activity',
	'prior_suggestions',
	'plans',
	'goals',
	'tasks',
	'milestones',
	'relationships',
	'documents',
	'risks'
];
/** Leave headroom for history, instructions and escaped JSON inside the provider's 128 KiB request. */
export const PROJECT_REVIEW_CONTEXT_MAX_BYTES_V2 = 64_000;
/** Least central records leave first when the checkpoint must shrink. */
const DROP_ORDER: readonly CollectionKey[] = [
	'events',
	'documents',
	'plans',
	'milestones',
	'goals',
	'tasks'
];

export type AgenticChatWorkflowContextErrorCode = 'context_unavailable' | 'context_too_large';

export class AgenticChatWorkflowContextError extends Error {
	constructor(
		readonly code: AgenticChatWorkflowContextErrorCode,
		message: string
	) {
		super(message);
		this.name = 'AgenticChatWorkflowContextError';
	}
}

export type AgenticChatWorkflowContextCoverageV1 = {
	includedRecords: number;
	omittedRecords: number;
	truncatedStrings: number;
};

/** A checkpoint ready for `accept_agentic_chat_workflow_context_v1`. */
export type BuiltAgenticChatWorkflowContextV1 = {
	preparationVersion:
		| typeof AGENTIC_CHAT_WORKFLOW_PREPARATION_VERSION
		| typeof AGENTIC_CHAT_PROJECT_REVIEW_PREPARATION_V2;
	contextIdentity: AgenticChatPreparedWorkflowContextV1['contextIdentity'];
	evidenceVersions: AgenticChatWorkflowEvidenceVersionV1[];
	payload: JsonObject;
	/** Canonical UTF-8 bytes; the SQL bound is 256 KiB. */
	payloadBytes: number;
	/** Upper bound on the jsonb text rendering the RPC also checks. */
	jsonbTextBytes: number;
	contextHash: string;
	coverage: AgenticChatWorkflowContextCoverageV1;
};

type RecordEntry = { kind: string; record: Record<string, JsonValue> };

export function buildAgenticChatWorkflowContextV1(input: {
	projectReviewV2?: boolean;
	documentOrganization?: boolean;
	documentReadTools?: boolean;
	/** Jev-selected excerpts for this question (published specialists that request them). */
	selectedEvidence?: ContextEvidenceV1;
	context: MasterPromptContext;
	userId: string;
	projectId: string;
	accessCheckedAt: string;
	contextLoadedAt: string;
}): BuiltAgenticChatWorkflowContextV1 {
	const data = input.context.data;
	// The project RPC is the authorization boundary; a fallback shape is not
	// evidence that the actor may read this project.
	if (
		input.context.contextLoadSource !== 'rpc' ||
		!data ||
		typeof data !== 'object' ||
		!isRecord(data.project) ||
		data.project.id !== input.projectId
	) {
		throw new AgenticChatWorkflowContextError(
			'context_unavailable',
			'Project context is unavailable or access was denied'
		);
	}
	const counters = { truncatedStrings: 0 };
	const sanitize = (value: unknown) => toSafeJson(value, 0, counters);

	const project = sanitizeRecord(
		data.project,
		sanitize,
		input.documentOrganization ? [] : ['doc_structure']
	);
	if (!project) {
		throw new AgenticChatWorkflowContextError(
			'context_unavailable',
			'Project context has no usable project record'
		);
	}
	const collections = new Map<CollectionKey, RecordEntry[]>();
	const recipeCollections = input.projectReviewV2 ? REVIEW_COLLECTIONS : COLLECTIONS;
	for (const [key, kind] of recipeCollections) {
		const rows = Array.isArray(data[key]) ? (data[key] as unknown[]) : [];
		collections.set(
			key,
			rows.flatMap((row) => {
				const record = sanitizeRecord(row, sanitize);
				return record ? [{ kind, record }] : [];
			})
		);
	}
	const startHere = isRecord(data.start_here) ? sanitizeRecord(data.start_here, sanitize) : null;
	const contextMeta = isRecord(data.context_meta) ? sanitize(data.context_meta) : null;

	const documentStructure = input.documentOrganization ? sanitize(data.doc_structure) : null;
	// Bounded by the finder (14K chars of excerpts, 2K each), so the 5K string cap never cuts it.
	const selectedEvidence = input.selectedEvidence ? sanitize(input.selectedEvidence) : null;
	const selectedRecords = input.selectedEvidence
		? contextEvidenceRecords(input.selectedEvidence).map(({ kind, id, version, title }) => ({
				kind,
				record: { id, title, updated_at: version } as Record<string, JsonValue>
			}))
		: [];
	let omittedRecords = 0;
	const build = () => {
		const evidence = buildEvidence({
			project,
			startHere,
			collections,
			selected: selectedRecords,
			observedAt: input.contextLoadedAt
		});
		const payload: JsonObject = {
			version: input.projectReviewV2
				? AGENTIC_CHAT_PROJECT_REVIEW_PAYLOAD_V2
				: AGENTIC_CHAT_WORKFLOW_CONTEXT_PAYLOAD_VERSION,
			projectId: input.projectId,
			timezone: typeof input.context.timezone === 'string' ? input.context.timezone : null,
			loadedAt: input.contextLoadedAt,
			data: {
				...(input.documentOrganization
					? {
							doc_structure: documentStructure,
							documentReviewScope: selectedEvidence
								? 'selected_evidence holds excerpts ranked for this question across the whole project: listed sections or openings, not whole documents; read its note and coverage. The document inventory below is bounded. Saved document-read results contain the openings of documents you request.'
								: input.documentReadTools
									? 'Bounded document inventory; full text is absent from this initial context. Only explicit saved document-read results contain text. Inspect context_meta and coverage for inventory limits and each read result for excerpt limits.'
									: 'Bounded inventory of document titles and summaries; full document bodies are not loaded. Inspect context_meta for source limits and coverage for further truncation.'
						}
					: {}),
				...(selectedEvidence ? { selected_evidence: selectedEvidence } : {}),
				project,
				start_here: startHere,
				goals: records(collections.get('goals')),
				milestones: records(collections.get('milestones')),
				plans: records(collections.get('plans')),
				tasks: records(collections.get('tasks')),
				documents: records(collections.get('documents')),
				events: records(collections.get('events')),
				context_meta: contextMeta,
				...(input.projectReviewV2
					? {
							risks: records(collections.get('risks')),
							relationships: records(collections.get('relationships')),
							activity: records(collections.get('activity')),
							prior_suggestions: records(collections.get('prior_suggestions'))
						}
					: {})
			},
			coverage: {
				includedRecords: evidence.length,
				omittedRecords,
				truncatedStrings: counters.truncatedStrings,
				evidenceLimit: AGENTIC_CHAT_WORKFLOW_LIMITS.evidenceMaxEntries,
				...(input.projectReviewV2
					? {
							families: Object.fromEntries(
								recipeCollections.map(([key]) => {
									const source =
										isRecord(data.review_coverage) &&
										isRecord(data.review_coverage[key])
											? data.review_coverage[key]
											: null;
									const included = collections.get(key)?.length ?? 0;
									const supplied = Array.isArray(data[key])
										? data[key].length
										: 0;
									const total =
										typeof source?.total === 'number' &&
										Number.isSafeInteger(source.total) &&
										source.total >= supplied
											? source.total
											: supplied;
									return [
										key,
										{
											status: !Array.isArray(data[key])
												? 'unavailable'
												: total > included
													? 'truncated'
													: included
														? 'loaded'
														: 'empty',
											included,
											total,
											omitted: total - included
										}
									];
								})
							)
						}
					: {})
			}
		};
		const canonical = canonicalizeAgenticChatJson(payload);
		return {
			evidence,
			payload,
			canonical,
			payloadBytes: utf8Bytes(canonical),
			jsonbTextBytes: estimateJsonbTextBytes(payload, utf8Bytes(canonical))
		};
	};

	let built = build();
	while (
		built.evidence.length > AGENTIC_CHAT_WORKFLOW_LIMITS.evidenceMaxEntries ||
		built.payloadBytes >
			(input.projectReviewV2
				? PROJECT_REVIEW_CONTEXT_MAX_BYTES_V2
				: AGENTIC_CHAT_WORKFLOW_LIMITS.contextMaxBytes) ||
		built.jsonbTextBytes > MAX_JSONB_TEXT_BYTES
	) {
		const dropOrder: readonly CollectionKey[] = input.projectReviewV2
			? REVIEW_DROP_ORDER
			: input.documentOrganization
				? ['events', 'tasks', 'plans', 'milestones', 'goals', 'documents']
				: DROP_ORDER;
		const source = dropOrder
			.map((key) => collections.get(key)!)
			.find((entries) => entries.length > 0);
		if (!source) {
			throw new AgenticChatWorkflowContextError(
				'context_too_large',
				'Project context exceeds the prepared-context bound'
			);
		}
		source.pop();
		omittedRecords += 1;
		built = build();
	}

	return {
		preparationVersion: input.projectReviewV2
			? AGENTIC_CHAT_PROJECT_REVIEW_PREPARATION_V2
			: AGENTIC_CHAT_WORKFLOW_PREPARATION_VERSION,
		contextIdentity: {
			userId: input.userId,
			projectId: input.projectId,
			accessCheckedAt: input.accessCheckedAt,
			contextLoadedAt: input.contextLoadedAt,
			// The pilot always takes the supported fresh load; cache is never authority.
			cacheRefUsed: null
		},
		evidenceVersions: built.evidence,
		payload: built.payload,
		payloadBytes: built.payloadBytes,
		jsonbTextBytes: built.jsonbTextBytes,
		contextHash: sha256Hex(built.canonical),
		coverage: {
			includedRecords: built.evidence.length,
			omittedRecords,
			truncatedStrings: counters.truncatedStrings
		}
	};
}

/** Recomputes the worker-owned hash of an accepted payload (the database only binds it). */
export function hashAgenticChatWorkflowContextPayloadV1(payload: JsonObject): {
	contextHash: string;
	payloadBytes: number;
} {
	const canonical = canonicalizeAgenticChatJson(payload);
	return { contextHash: sha256Hex(canonical), payloadBytes: utf8Bytes(canonical) };
}

export type AgenticChatWorkflowEvidenceEntryV1 = {
	recordKind: string;
	version: string;
	label: string;
};

/**
 * The provider-neutral input every workflow role receives. It is derived only
 * from the accepted checkpoint and the frozen admission history; nothing here
 * re-reads live project rows.
 */
export type AgenticChatWorkflowModelInputV1 = {
	version: 'agentic_chat_workflow_model_input_v1';
	contextId: string;
	contextHash: string;
	requestHash: string;
	question: string;
	history: Array<{ role: 'user' | 'assistant'; content: string }>;
	/** Accepted payload as compact JSON, exactly the evidence the checkpoint bound. */
	evidenceText: string;
	/** Record id to its accepted version and a short display label, for evidence references. */
	evidence: ReadonlyMap<string, AgenticChatWorkflowEvidenceEntryV1>;
	/** Shared user message for every role; roles add their own system instructions. */
	sharedUserContent: string;
	sharedUserContentBytes: number;
};

export function buildAgenticChatWorkflowModelInputV1(input: {
	request: AgenticChatRawWorkflowInputV4;
	context: AgenticChatPreparedWorkflowContextV1;
}): AgenticChatWorkflowModelInputV1 {
	const { request, context } = input;
	if (
		context.requestId !== request.request.requestId ||
		context.requestHash !== request.requestHash ||
		context.turnRunId !== request.request.turnRunId
	) {
		throw new Error('Prepared context is not bound to this workflow request');
	}
	const history = request.history.slice(-MODEL_HISTORY_MESSAGES).map((message) => ({
		role: message.role,
		content: message.content.slice(0, MODEL_HISTORY_MESSAGE_CHARS)
	}));
	const evidenceText = JSON.stringify(context.payload);
	const labels = collectRecordLabels(context.payload);
	const evidence = new Map<string, AgenticChatWorkflowEvidenceEntryV1>();
	for (const entry of context.evidenceVersions) {
		evidence.set(entry.id, {
			recordKind: entry.kind,
			version: entry.version,
			label: labels.get(entry.id) ?? `${entry.kind}: ${entry.id}`
		});
	}
	const question = request.request.reviewIntent.objective;
	const sharedUserContent = `USER QUESTION\n${question}\n\nFROZEN CONVERSATION (context only)\n${JSON.stringify(history)}\n\nPROJECT EVIDENCE\n${evidenceText}`;
	return {
		version: 'agentic_chat_workflow_model_input_v1',
		contextId: context.contextId,
		contextHash: context.contextHash,
		requestHash: context.requestHash,
		question,
		history,
		evidenceText,
		evidence,
		sharedUserContent,
		sharedUserContentBytes: utf8Bytes(sharedUserContent)
	};
}

function buildEvidence(input: {
	project: Record<string, JsonValue>;
	startHere: Record<string, JsonValue> | null;
	collections: Map<CollectionKey, RecordEntry[]>;
	/** Jev-selected records outside the bounded inventory become citable too. */
	selected?: RecordEntry[];
	observedAt: string;
}): AgenticChatWorkflowEvidenceVersionV1[] {
	const ordered: RecordEntry[] = [
		{ kind: 'project', record: input.project },
		...(input.startHere ? [{ kind: 'start_here', record: input.startHere }] : []),
		...[...input.collections.values()].flat(),
		...(input.selected ?? [])
	];
	const seen = new Set<string>();
	const evidence: AgenticChatWorkflowEvidenceVersionV1[] = [];
	for (const { kind, record } of ordered) {
		const id = record.id;
		if (typeof id !== 'string' || id.length < 1 || id.length > 128 || seen.has(id)) continue;
		seen.add(id);
		evidence.push({ kind, id, version: recordVersion(record), observedAt: input.observedAt });
	}
	return evidence;
}

/** The record's own write version; content-addressed only when the row has no timestamp. */
function recordVersion(record: Record<string, JsonValue>): string {
	for (const key of ['updated_at', 'created_at'] as const) {
		const value = record[key];
		if (typeof value === 'string' && value.length >= 1 && value.length <= 128) return value;
	}
	return `sha256:${sha256Hex(canonicalizeAgenticChatJson(record)).slice(0, 32)}`;
}

export function collectRecordLabels(payload: JsonObject): Map<string, string> {
	const labels = new Map<string, string>();
	const data = payload.data;
	if (!isRecord(data)) return labels;
	const add = (kind: string, value: unknown) => {
		if (!isRecord(value) || typeof value.id !== 'string' || labels.has(value.id)) return;
		const name = [value.title, value.name].find(
			(candidate): candidate is string =>
				typeof candidate === 'string' && candidate.trim().length > 0
		);
		const text = (name ?? value.id).trim().replace(/\s+/g, ' ');
		labels.set(value.id, `${kind}: ${text.length > 80 ? `${text.slice(0, 79)}…` : text}`);
	};
	add('project', data.project);
	add('start here', data.start_here);
	for (const [key, kind] of REVIEW_COLLECTIONS) {
		const rows = data[key];
		if (Array.isArray(rows)) for (const row of rows) add(kind, row);
	}
	const selected = data.selected_evidence;
	if (isRecord(selected))
		for (const key of ['full', 'summaries'] as const) {
			const rows = selected[key];
			if (Array.isArray(rows))
				for (const row of rows)
					if (isRecord(row) && typeof row.kind === 'string') add(row.kind, row);
		}
	return labels;
}

function records(entries: RecordEntry[] | undefined): JsonValue[] {
	return (entries ?? []).map((entry) => entry.record);
}

function sanitizeRecord(
	value: unknown,
	sanitize: (value: unknown) => JsonValue,
	omitKeys: readonly string[] = []
): Record<string, JsonValue> | null {
	if (!isRecord(value)) return null;
	const copy: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (!omitKeys.includes(key)) copy[key] = entry;
	}
	const safe = sanitize(copy);
	return isRecord(safe) ? (safe as Record<string, JsonValue>) : null;
}

/**
 * Plain, bounded JSON that Postgres jsonb accepts byte-for-byte: no NUL, no
 * lone surrogates, finite numbers only, bounded depth and string length.
 */
function toSafeJson(
	value: unknown,
	depth: number,
	counters: { truncatedStrings: number }
): JsonValue {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string') {
		const cleaned = value
			.replaceAll('\u0000', '')
			.replace(
				/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
				'\uFFFD'
			);
		if (cleaned.length <= MAX_STRING_CHARS) return cleaned;
		counters.truncatedStrings += 1;
		// Never split a surrogate pair at the cut.
		let cut = MAX_STRING_CHARS;
		const code = cleaned.charCodeAt(cut - 1);
		if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
		return `${cleaned.slice(0, cut)}${TRUNCATION_MARKER}`;
	}
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'boolean') return value;
	if (depth >= MAX_DEPTH || typeof value !== 'object') return null;
	if (Array.isArray(value)) return value.map((entry) => toSafeJson(entry, depth + 1, counters));
	const result: Record<string, JsonValue> = {};
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		if (entry === undefined || typeof entry === 'function' || key.includes('\u0000')) continue;
		result[key] = toSafeJson(entry, depth + 1, counters);
	}
	return result;
}

/**
 * An upper bound on the jsonb::text rendering the checkpoint RPC measures. It adds
 * the `": "` and `", "` spaces, and expands exponent-form numbers the way Postgres
 * numeric prints them (`1e+21` is 22 digits there). String escapes match JSON.
 */
function estimateJsonbTextBytes(value: JsonValue, canonicalBytes: number): number {
	let extra = 0;
	const visit = (entry: JsonValue) => {
		if (typeof entry === 'number') {
			extra += numericTextExpansion(entry);
			return;
		}
		if (Array.isArray(entry)) {
			extra += Math.max(0, entry.length - 1);
			for (const item of entry) visit(item);
			return;
		}
		if (entry !== null && typeof entry === 'object') {
			const members = Object.values(entry).filter((item) => item !== undefined);
			extra += members.length + Math.max(0, members.length - 1);
			for (const item of members) visit(item as JsonValue);
		}
	};
	visit(value);
	return canonicalBytes + extra;
}

/** Extra bytes Postgres numeric output needs over JSON's exponent form (bounded above). */
function numericTextExpansion(value: number): number {
	const json = JSON.stringify(value);
	const match = /^(-?)(\d)(?:\.(\d+))?e([+-])(\d+)$/.exec(json);
	if (!match) return 0;
	const [, sign, , fraction = '', , exponent] = match;
	// Plain decimal digits: sign, "0." or leading digit, |exponent| places, fraction digits.
	const expanded = sign!.length + 2 + Number(exponent) + fraction.length;
	return Math.max(0, expanded - json.length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function utf8Bytes(value: string): number {
	return Buffer.byteLength(value, 'utf8');
}

function sha256Hex(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}
