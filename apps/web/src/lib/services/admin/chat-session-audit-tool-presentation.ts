// apps/web/src/lib/services/admin/chat-session-audit-tool-presentation.ts
export type ToolPayloadKind = 'request' | 'response';

export type ToolPayloadFact = {
	key: string;
	label: string;
	value: string;
};

export type ToolPayloadItem = {
	key: string;
	title: string;
	detail: string;
	meta: string;
};

export type ToolPayloadOverview = {
	hasContent: boolean;
	headline: string;
	facts: ToolPayloadFact[];
	collectionLabel: string;
	items: ToolPayloadItem[];
	remainingItems: number;
};

const REQUEST_HEADLINE_KEYS = ['message', 'query', 'prompt', 'instruction', 'summary', 'text'];
const RESPONSE_HEADLINE_KEYS = [
	'error',
	'message',
	'summary',
	'answer',
	'content',
	'text',
	'status'
];
const REQUEST_FACT_KEYS = [
	'op',
	'canonical_op',
	'action',
	'group',
	'kind',
	'entity',
	'entity_type',
	'entity_id',
	'project_id',
	'filters',
	'limit'
];
const RESPONSE_FACT_KEYS = [
	'total_matches',
	'total_results',
	'total',
	'count',
	'result_count',
	'status',
	'type',
	'query'
];
const COLLECTION_KEYS = [
	'matches',
	'results',
	'items',
	'messages',
	'accounts',
	'projects',
	'tasks',
	'entities',
	'rows',
	'data'
];
const ITEM_TITLE_KEYS = ['title', 'name', 'subject', 'op', 'tool_name', 'label', 'email', 'id'];
const ITEM_DETAIL_KEYS = ['summary', 'description', 'snippet', 'message', 'content', 'action'];
const ITEM_META_KEYS = ['group', 'kind', 'entity', 'entity_type', 'status', 'from', 'sender'];
const INTERNAL_FACT_KEYS = new Set([
	'version',
	'tool_call_id',
	'tool_execution_id',
	'message_id',
	'event_id',
	'turn_run_id',
	'stream_run_id',
	'client_turn_id',
	'sequence_index',
	'created_at',
	'updated_at'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function compactText(value: unknown, maxLength = 320): string {
	if (value === null) return 'null';
	if (value === undefined) return '';
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number')
		return Number.isFinite(value) ? value.toLocaleString() : String(value);

	let text: string;
	if (typeof value === 'string') {
		text = value;
	} else {
		try {
			text = JSON.stringify(value);
		} catch {
			text = String(value);
		}
	}

	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function humanizeKey(value: string): string {
	const words = value.replace(/[._-]+/g, ' ').trim();
	return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : 'Value';
}

function parseJsonString(value: string): unknown {
	const trimmed = value.trim();
	if (!trimmed) return value;
	if (!['{', '[', '"'].includes(trimmed.charAt(0))) return value;

	try {
		return JSON.parse(trimmed);
	} catch {
		return value;
	}
}

function decodedJsonString(value: string): string {
	try {
		return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
	} catch {
		return value.replace(/\\"/g, '"').replace(/\\n/g, ' ');
	}
}

function partialStringField(source: string, key: string): string {
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = source.match(new RegExp(`"${escapedKey}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
	return match?.[1] ? decodedJsonString(match[1]) : '';
}

function partialNumberField(source: string, key: string): number | null {
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = source.match(new RegExp(`"${escapedKey}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
	if (!match?.[1]) return null;
	const value = Number(match[1]);
	return Number.isFinite(value) ? value : null;
}

function partialRecordFromJsonPreview(value: string): Record<string, unknown> | null {
	const trimmed = value.trim();
	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

	const record: Record<string, unknown> = {};
	for (const key of [
		'type',
		'query',
		'message',
		'summary',
		'status',
		'group',
		'kind',
		'entity',
		'op',
		'action'
	]) {
		const field = partialStringField(trimmed, key);
		if (field) record[key] = field;
	}
	for (const key of [
		'total_matches',
		'total_results',
		'total',
		'count',
		'result_count',
		'limit'
	]) {
		const field = partialNumberField(trimmed, key);
		if (field !== null) record[key] = field;
	}

	const matches: Record<string, unknown>[] = [];
	for (const fragment of trimmed.match(/\{[^{}]+\}/g) ?? []) {
		try {
			const parsed = JSON.parse(fragment);
			if (!isRecord(parsed)) continue;
			if (!firstText(parsed, ITEM_TITLE_KEYS)) continue;
			matches.push(parsed);
		} catch {
			// A persisted preview can end midway through its final record. Complete records still parse.
		}
	}
	if (matches.length > 0) record.matches = matches;

	return Object.keys(record).length > 0 ? record : null;
}

export function normalizeToolPayloadValue(value: unknown): unknown {
	let current = value;
	for (let depth = 0; depth < 3 && typeof current === 'string'; depth += 1) {
		const parsed = parseJsonString(current);
		if (parsed === current) break;
		current = parsed;
	}
	return current;
}

export function toolPayloadFullText(value: unknown): string {
	const normalized = normalizeToolPayloadValue(value);
	if (typeof normalized === 'string') return normalized;
	try {
		return JSON.stringify(normalized, null, 2);
	} catch {
		return String(normalized);
	}
}

function firstText(
	record: Record<string, unknown>,
	keys: string[]
): { key: string; value: string } | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value !== 'string' && typeof value !== 'number') continue;
		const text = compactText(value);
		if (text) return { key, value: text };
	}
	return null;
}

function collectionFromRecord(
	record: Record<string, unknown>
): { key: string; values: unknown[] } | null {
	for (const key of COLLECTION_KEYS) {
		const value = record[key];
		if (Array.isArray(value)) return { key, values: value };
	}

	const nestedData = record.data;
	if (isRecord(nestedData)) {
		for (const key of COLLECTION_KEYS) {
			const value = nestedData[key];
			if (Array.isArray(value)) return { key, values: value };
		}
	}

	for (const [key, value] of Object.entries(record)) {
		if (Array.isArray(value)) return { key, values: value };
	}
	return null;
}

function itemFromValue(value: unknown, collectionKey: string, index: number): ToolPayloadItem {
	if (!isRecord(value)) {
		return {
			key: `${collectionKey}:${index}`,
			title: compactText(value, 180) || `Item ${index + 1}`,
			detail: '',
			meta: ''
		};
	}

	const titleEntry = firstText(value, ITEM_TITLE_KEYS);
	const detailEntry = firstText(
		value,
		ITEM_DETAIL_KEYS.filter((key) => key !== titleEntry?.key)
	);
	const meta = ITEM_META_KEYS.map((key) => compactText(value[key], 80))
		.filter(Boolean)
		.filter((entry, entryIndex, entries) => entries.indexOf(entry) === entryIndex)
		.slice(0, 3)
		.join(' · ');

	return {
		key: `${collectionKey}:${compactText(value.id ?? value.tool_call_id, 80) || 'item'}:${index}`,
		title: titleEntry?.value || `${humanizeKey(collectionKey)} ${index + 1}`,
		detail: detailEntry?.value || '',
		meta
	};
}

function selectedFacts(
	record: Record<string, unknown>,
	preferredKeys: string[],
	headlineKey: string | null,
	collectionKey: string | null
): ToolPayloadFact[] {
	const keys = [
		...preferredKeys,
		...Object.keys(record).filter((key) => {
			const value = record[key];
			return (
				typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
			);
		})
	];
	const seen = new Set<string>();
	const facts: ToolPayloadFact[] = [];

	for (const key of keys) {
		if (
			seen.has(key) ||
			key === headlineKey ||
			key === collectionKey ||
			INTERNAL_FACT_KEYS.has(key)
		) {
			continue;
		}
		seen.add(key);
		const value = record[key];
		if (value === undefined || value === null || value === '') continue;
		if (typeof value === 'object' && key !== 'filters') continue;
		const label = humanizeKey(key);
		const displayValue = compactText(value, key === 'filters' ? 180 : 120);
		if (!displayValue) continue;
		facts.push({ key, label, value: displayValue });
		if (facts.length === 6) break;
	}

	return facts;
}

export function buildToolPayloadOverview(
	value: unknown,
	kind: ToolPayloadKind
): ToolPayloadOverview {
	const normalized = normalizeToolPayloadValue(value);
	if (normalized === undefined || normalized === null || normalized === '') {
		return {
			hasContent: false,
			headline: '',
			facts: [],
			collectionLabel: '',
			items: [],
			remainingItems: 0
		};
	}

	if (typeof normalized === 'string') {
		const partialRecord = partialRecordFromJsonPreview(normalized);
		if (partialRecord) return buildToolPayloadOverview(partialRecord, kind);
	}

	if (Array.isArray(normalized)) {
		const items = normalized
			.slice(0, 4)
			.map((item, index) => itemFromValue(item, 'items', index));
		return {
			hasContent: true,
			headline: `${normalized.length.toLocaleString()} item${normalized.length === 1 ? '' : 's'}`,
			facts: [],
			collectionLabel: 'Items',
			items,
			remainingItems: Math.max(0, normalized.length - items.length)
		};
	}

	if (!isRecord(normalized)) {
		return {
			hasContent: true,
			headline: compactText(normalized),
			facts: [],
			collectionLabel: '',
			items: [],
			remainingItems: 0
		};
	}

	const collection = collectionFromRecord(normalized);
	const headlineEntry = firstText(
		normalized,
		kind === 'request' ? REQUEST_HEADLINE_KEYS : RESPONSE_HEADLINE_KEYS
	);
	const query = compactText(normalized.query, 160);
	const total =
		Number(
			normalized.total_matches ??
				normalized.total_results ??
				normalized.total ??
				normalized.count
		) ||
		collection?.values.length ||
		0;
	let headline = headlineEntry?.value || '';
	let headlineKey = headlineEntry?.key ?? null;
	if (kind === 'response' && query && total > 0) {
		headline = `${total.toLocaleString()} result${total === 1 ? '' : 's'} for “${query}”`;
		headlineKey = 'query';
	} else if (!headline && collection) {
		headline = `${total.toLocaleString()} ${humanizeKey(collection.key).toLowerCase()}`;
	}

	const items = (collection?.values ?? [])
		.slice(0, 4)
		.map((item, index) => itemFromValue(item, collection?.key ?? 'items', index));
	const facts = selectedFacts(
		normalized,
		kind === 'request' ? REQUEST_FACT_KEYS : RESPONSE_FACT_KEYS,
		headlineKey,
		collection?.key ?? null
	);

	if (!headline && facts.length === 0 && items.length === 0) {
		headline = compactText(normalized);
	}

	return {
		hasContent: true,
		headline,
		facts,
		collectionLabel: collection ? humanizeKey(collection.key) : '',
		items,
		remainingItems: Math.max(0, (collection?.values.length ?? 0) - items.length)
	};
}
