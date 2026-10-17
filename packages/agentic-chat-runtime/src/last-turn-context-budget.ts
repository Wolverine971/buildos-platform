// packages/agentic-chat-runtime/src/last-turn-context-budget.ts
// Continuity is optional recall, not a second copy of every record a turn read.
// Measure serialized characters, including JSON escaping, just like admission.
export const LAST_TURN_CONTEXT_MAX_CHARS = 32 * 1024;
// A completion draft still needs the database's timestamp. Both new drafts and
// old client packets use this budget so they remain safe to send on the next turn.
export const LAST_TURN_CONTEXT_BUDGET_CHARS = 30_000;

const ENTITY_LIST_KEYS = [
	'projects',
	'tasks',
	'plans',
	'goals',
	'documents',
	'milestones',
	'risks',
	'requirements'
] as const;
const LEGACY_LISTS = { task_ids: 'tasks', goal_ids: 'goals' } as const;
const LEGACY_SINGLES = {
	project_id: 'projects',
	plan_id: 'plans',
	document_id: 'documents'
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Leave small packets untouched. For broad reads, drop descriptions first,
 * keeping every ID and name if possible. Only then retain a bounded prefix of
 * each entity kind, preserving insertion order (explicit references come first
 * in the builder). Legacy IDs follow those same retained previews.
 *
 * Cleanup receipts are kept whole, never partially clipped. If the non-entity
 * metadata alone cannot fit, omit the optional hint entirely; the durable chat
 * and write receipts remain the source of truth. Never mutate persisted input.
 */
export function boundLastTurnContext<T extends object>(context: T): T | null {
	const fits = (value: object) => JSON.stringify(value).length <= LAST_TURN_CONTEXT_BUDGET_CHARS;
	if (fits(context)) return context;

	const original = context as Record<string, unknown>;
	if (!isRecord(original.entities)) return null;
	const entities = { ...original.entities };
	for (const key of ENTITY_LIST_KEYS) {
		const list = entities[key];
		if (!Array.isArray(list)) continue;
		entities[key] = list.map((item) => {
			if (!isRecord(item)) return item;
			const { description: _description, ...preview } = item;
			return preview;
		});
	}
	const compact = { ...context, entities };
	if (fits(compact)) return compact;

	const withLimit = (limit: number): T => {
		const retained = { ...entities };
		for (const key of ENTITY_LIST_KEYS) {
			if (Array.isArray(entities[key])) retained[key] = entities[key].slice(0, limit);
		}
		for (const [legacy, key] of Object.entries(LEGACY_LISTS)) {
			if (!Array.isArray(entities[legacy])) continue;
			retained[legacy] = Array.isArray(retained[key])
				? retained[key].flatMap((item) =>
						isRecord(item) && typeof item.id === 'string' ? [item.id] : []
					)
				: entities[legacy].slice(0, limit);
		}
		for (const [legacy, key] of Object.entries(LEGACY_SINGLES)) {
			const list = retained[key];
			if (
				Array.isArray(list) &&
				!list.some((item) => isRecord(item) && item.id === retained[legacy])
			) {
				delete retained[legacy];
			}
		}
		return { ...context, entities: retained, entity_references_truncated: true };
	};

	let best = withLimit(0);
	if (!fits(best)) return null;
	let low = 0;
	let high = Math.max(
		0,
		...[...ENTITY_LIST_KEYS, ...Object.keys(LEGACY_LISTS)].map((key) =>
			Array.isArray(entities[key]) ? entities[key].length : 0
		)
	);
	// Serialized size grows monotonically with retained prefixes. Binary search
	// avoids reserializing once per entity in very large inventories.
	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		const candidate = withLimit(middle);
		if (fits(candidate)) {
			best = candidate;
			low = middle;
		} else {
			high = middle - 1;
		}
	}
	return best;
}
