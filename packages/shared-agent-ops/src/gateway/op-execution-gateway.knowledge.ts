// packages/shared-agent-ops/src/gateway/op-execution-gateway.knowledge.ts
//
// The five personal knowledge graph ops (tasker 160), shared by agentic chat and the remote
// MCP connector:
//
//   knowledge.search  → search_knowledge       knowledge.record → record_knowledge
//   knowledge.get     → get_knowledge_entity   knowledge.enrich → enrich_knowledge
//   knowledge.query   → query_knowledge
//
// The graph is the user's own: public entities plus this user's private rows. It is not
// project-scoped, so none of these handlers consult project scope. Every handler builds its
// KnowledgeStore from the AUTHENTICATED user id on the execution context, never from tool
// arguments; the store filters visibility in code, so the service-role client is safe here.
//
// Chat reads call the `run*` functions directly (agentic-chat-runtime knowledge-reads.ts) so
// chat and MCP return the same shapes. Results are compact on purpose: models read them.
import {
	KNOWLEDGE_UUID_PATTERN,
	KnowledgeStore,
	getKnowledgePredicate,
	isKnowledgeKind,
	startKnowledgeEnrichment,
	type KnowledgeDataClient,
	type KnowledgeEntityDetail,
	type KnowledgeFactView,
	type KnowledgeKind,
	type KnowledgeQueryResult,
	type KnowledgeQueryStep,
	type KnowledgeQuerySpec,
	type KnowledgeSourceType,
	type KnowledgeWriteBatch,
	type KnowledgeWriteEntity,
	type KnowledgeWriteFact,
	type KnowledgeWriteSource
} from '../knowledge';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import type { ToolExecutionContext } from './op-execution-gateway.types';

export const KNOWLEDGE_SEARCH_LIMIT_DEFAULT = 10;
export const KNOWLEDGE_SEARCH_LIMIT_MAX = 25;
export const KNOWLEDGE_QUERY_LIMIT_DEFAULT = 50;
export const KNOWLEDGE_QUERY_LIMIT_MAX = 100;
export const KNOWLEDGE_RECORD_MAX_ENTITIES = 50;
export const KNOWLEDGE_RECORD_MAX_FACTS = 200;
export const KNOWLEDGE_RECORD_MAX_SOURCES = 20;
export const KNOWLEDGE_ENRICH_MAX_ENTITIES = 10;
export const KNOWLEDGE_ENRICH_INSTRUCTIONS_MAX = 500;
/** Facts and incoming relationships returned by get_knowledge_entity. */
const ENTITY_FACT_LIMIT = 80;
const ENTITY_INCOMING_LIMIT = 40;
const ENTITY_LINK_LIMIT = 20;

/** Source types a model may cite. `import` and `task` are reserved for BuildOS itself. */
export const KNOWLEDGE_TOOL_SOURCE_TYPES = [
	'web',
	'youtube',
	'user',
	'chat',
	'document',
	'agent'
] as const satisfies readonly KnowledgeSourceType[];

export type KnowledgeOpVia = 'chat' | 'mcp';

const UUID = KNOWLEDGE_UUID_PATTERN;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invalid(message: string): ExternalToolGatewayError {
	return new ExternalToolGatewayError('VALIDATION_ERROR', message);
}

function optionalString(value: unknown, field: string, max = 2000): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'string') throw invalid(`${field} must be a string`);
	const trimmed = value.trim();
	if (trimmed.length > max) throw invalid(`${field} must be at most ${max} characters`);
	return trimmed || undefined;
}

function requiredString(value: unknown, field: string, max = 2000): string {
	const parsed = optionalString(value, field, max);
	if (!parsed) throw invalid(`${field} is required`);
	return parsed;
}

function boundedLimit(value: unknown, fallback: number, max: number): number {
	if (value === undefined || value === null) return fallback;
	const number = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(number)) throw invalid('limit must be a number');
	return Math.min(Math.max(Math.trunc(number), 1), max);
}

function kindList(value: unknown, field: string): KnowledgeKind[] | undefined {
	if (value === undefined || value === null) return undefined;
	if (!Array.isArray(value)) throw invalid(`${field} must be an array`);
	const kinds: KnowledgeKind[] = [];
	for (const entry of value) {
		if (!isKnowledgeKind(entry))
			throw invalid(`${field} has an unknown kind: ${String(entry)}`);
		if (!kinds.includes(entry)) kinds.push(entry);
	}
	return kinds.length ? kinds : undefined;
}

function entityId(value: unknown, field: string): string {
	if (typeof value !== 'string' || !UUID.test(value.trim())) {
		throw invalid(`${field} must be a knowledge entity id (UUID)`);
	}
	return value.trim().toLowerCase();
}

function arrayArg(value: unknown, field: string, max: number): unknown[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) throw invalid(`${field} must be an array`);
	if (value.length > max) throw invalid(`${field} must contain at most ${max} item(s)`);
	return value;
}

/** KnowledgeStoreError → gateway error. Matched by name: the store may come from another bundle. */
function toGatewayError(error: unknown): unknown {
	if (error instanceof ExternalToolGatewayError) return error;
	if (error instanceof Error && error.name === 'KnowledgeStoreError') {
		const code = (error as Error & { code?: string }).code;
		if (code === 'INVALID')
			return new ExternalToolGatewayError('VALIDATION_ERROR', error.message);
		if (code === 'NOT_FOUND') return new ExternalToolGatewayError('NOT_FOUND', error.message);
		return new ExternalToolGatewayError('INTERNAL', error.message);
	}
	return error;
}

async function guard<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch (error) {
		throw toGatewayError(error);
	}
}

function trustedUserId(context: {
	userId: string;
	projectScopeMode?: ToolExecutionContext['projectScopeMode'];
}): string {
	if (typeof context.userId !== 'string' || !UUID.test(context.userId)) {
		throw new ExternalToolGatewayError('FORBIDDEN', 'Knowledge tools need a signed-in user.');
	}
	// The graph holds the user's whole contact book. An agent limited to chosen projects
	// must not read or write it.
	if (context.projectScopeMode === 'selected') {
		throw new ExternalToolGatewayError(
			'FORBIDDEN',
			'This connection is limited to selected projects, so it cannot use your knowledge base.'
		);
	}
	return context.userId;
}

function compactEntity(entity: {
	id: string;
	kind: KnowledgeKind;
	name: string;
	summary?: string | null;
	is_self?: boolean;
}): Record<string, unknown> {
	return {
		id: entity.id,
		kind: entity.kind,
		name: entity.name,
		...(entity.summary ? { summary: entity.summary } : {}),
		...(entity.is_self ? { is_user: true } : {})
	};
}

function nonEmpty(value: Record<string, unknown> | null | undefined) {
	return value && Object.keys(value).length > 0 ? value : undefined;
}

// ---------------------------------------------------------------------------
// Reads

export async function runKnowledgeSearch(
	client: KnowledgeDataClient,
	userId: string,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const query = requiredString(args.query, 'query', 300);
	const kinds = kindList(args.kinds, 'kinds');
	const limit = boundedLimit(
		args.limit,
		KNOWLEDGE_SEARCH_LIMIT_DEFAULT,
		KNOWLEDGE_SEARCH_LIMIT_MAX
	);
	const store = new KnowledgeStore(client, userId);
	const hits = await guard(() => store.search(query, { ...(kinds ? { kinds } : {}), limit }));
	return {
		query,
		results: hits.map((hit) => ({ ...compactEntity(hit), matched_on: hit.matched_on })),
		total: hits.length,
		...(hits.length === 0
			? {
					message:
						'Nothing in the knowledge graph matches. It may simply not be recorded yet.'
				}
			: {})
	};
}

function sourceRefs(
	sources: KnowledgeFactView['sources']
): Array<Record<string, unknown>> | undefined {
	const refs = sources
		.map((source) => ({
			type: source.type,
			...(source.url ? { url: source.url } : {}),
			...(!source.url && source.title ? { title: source.title } : {})
		}))
		.slice(0, 3);
	return refs.length ? refs : undefined;
}

/** One fact; the store already labels incoming relationships with the inverse label. */
function compactFact(fact: KnowledgeFactView): Record<string, unknown> {
	const sources = sourceRefs(fact.sources);
	return {
		predicate: fact.predicate,
		label: fact.label,
		...(fact.value !== null ? { value: fact.value } : {}),
		...(fact.entity
			? { entity: { id: fact.entity.id, kind: fact.entity.kind, name: fact.entity.name } }
			: {}),
		...(nonEmpty(fact.qualifiers) ? { qualifiers: fact.qualifiers } : {}),
		...(fact.status !== 'active' ? { status: fact.status } : {}),
		...(fact.valid_from ? { valid_from: fact.valid_from } : {}),
		...(fact.valid_to ? { valid_to: fact.valid_to } : {}),
		...(sources ? { sources } : {})
	};
}

/** What a model needs from one entity: who/what it is, its facts, and what points at it. */
export function compactKnowledgeEntityDetail(
	detail: KnowledgeEntityDetail
): Record<string, unknown> {
	const facts = detail.facts.slice(0, ENTITY_FACT_LIMIT);
	const incoming = detail.incoming.slice(0, ENTITY_INCOMING_LIMIT);
	const latestResearch = detail.enrichment[0];
	return {
		entity: {
			...compactEntity(detail.entity),
			...(detail.entity.enriched_at ? { researched_at: detail.entity.enriched_at } : {})
		},
		known_by_me: detail.known_by_me,
		facts: facts.map(compactFact),
		...(detail.facts.length > facts.length ? { facts_truncated: true } : {}),
		incoming: incoming.map(compactFact),
		...(detail.incoming_truncated || detail.incoming.length > incoming.length
			? { incoming_truncated: true }
			: {}),
		linked_records: detail.links
			.slice(0, ENTITY_LINK_LIMIT)
			.map((link) => ({ kind: link.record_kind, id: link.record_id })),
		...(latestResearch
			? {
					research: {
						status: latestResearch.status,
						facts_added: latestResearch.facts_added,
						...(latestResearch.summary ? { summary: latestResearch.summary } : {}),
						...(latestResearch.error ? { error: latestResearch.error } : {})
					}
				}
			: {})
	};
}

export async function runKnowledgeGet(
	client: KnowledgeDataClient,
	userId: string,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const id = entityId(args.entity_id, 'entity_id');
	const store = new KnowledgeStore(client, userId);
	const detail = await guard(() => store.getEntity(id));
	if (!detail) throw new ExternalToolGatewayError('NOT_FOUND', 'Knowledge entry not found');
	return compactKnowledgeEntityDetail(detail);
}

function parseQuerySpec(args: Record<string, unknown>): KnowledgeQuerySpec {
	if (!isRecord(args.start)) throw invalid('start is required');
	const start = args.start;
	const entityIds = arrayArg(start.entity_ids, 'start.entity_ids', 50).map((id, index) =>
		entityId(id, `start.entity_ids[${index}]`)
	);
	const search = optionalString(start.search, 'start.search', 300);
	const startKinds = kindList(start.kinds, 'start.kinds');
	if (
		!entityIds.length &&
		!search &&
		!startKinds &&
		start.known_by_me !== true &&
		start.owned_by_me !== true
	) {
		throw invalid('start needs entity_ids, search, kinds, known_by_me, or owned_by_me');
	}
	const follow = arrayArg(args.follow, 'follow', 2).map((step, index) => {
		if (!isRecord(step)) throw invalid(`follow[${index}] must be an object`);
		const predicate = requiredString(step.predicate, `follow[${index}].predicate`, 80);
		const def = getKnowledgePredicate(predicate);
		if (!def || def.valueType !== 'entity') {
			throw invalid(`follow[${index}].predicate "${predicate}" is not a relationship`);
		}
		const direction = step.direction ?? 'out';
		if (direction !== 'out' && direction !== 'in') {
			throw invalid(`follow[${index}].direction must be out or in`);
		}
		const kinds = kindList(step.kinds, `follow[${index}].kinds`);
		const parsed: KnowledgeQueryStep = { predicate, direction, ...(kinds ? { kinds } : {}) };
		return parsed;
	});
	const where = isRecord(args.where)
		? {
				...(args.where.known_by_me === true ? { known_by_me: true } : {}),
				...(args.where.owned_by_me === true ? { owned_by_me: true } : {})
			}
		: undefined;
	const fields = arrayArg(args.fields, 'fields', 12).map((field, index) => {
		const key = requiredString(field, `fields[${index}]`, 80);
		if (!getKnowledgePredicate(key))
			throw invalid(`fields[${index}] "${key}" is not a known field`);
		return key;
	});
	return {
		start: {
			...(entityIds.length ? { entity_ids: entityIds } : {}),
			...(search ? { search } : {}),
			...(startKinds ? { kinds: startKinds } : {}),
			...(start.known_by_me === true ? { known_by_me: true } : {}),
			...(start.owned_by_me === true ? { owned_by_me: true } : {})
		},
		...(follow.length ? { follow } : {}),
		...(nonEmpty(where) ? { where } : {}),
		...(fields.length ? { fields } : {}),
		limit: boundedLimit(args.limit, KNOWLEDGE_QUERY_LIMIT_DEFAULT, KNOWLEDGE_QUERY_LIMIT_MAX)
	};
}

function compactQueryResult(result: KnowledgeQueryResult): Record<string, unknown> {
	return {
		rows: result.rows.map((row) => {
			const fields = Object.fromEntries(
				Object.entries(row.fields)
					.filter(([, values]) => values.length > 0)
					.map(([key, values]) => [
						key,
						values.map((value) =>
							nonEmpty(value.qualifiers) || value.status !== 'active'
								? {
										value: value.value,
										...(nonEmpty(value.qualifiers)
											? { qualifiers: value.qualifiers }
											: {}),
										...(value.status !== 'active'
											? { status: value.status }
											: {})
									}
								: value.value
						)
					])
			);
			return {
				...compactEntity(row.entity),
				...(row.path.length
					? {
							via: row.path.map((step) => ({
								predicate: step.predicate,
								direction: step.direction,
								entity: {
									id: step.entity.id,
									kind: step.entity.kind,
									name: step.entity.name
								},
								...(nonEmpty(step.qualifiers)
									? { qualifiers: step.qualifiers }
									: {})
							}))
						}
					: {}),
				...(Object.keys(fields).length ? { fields } : {})
			};
		}),
		...(Object.keys(result.coverage).length ? { coverage: result.coverage } : {}),
		start_count: result.start_count,
		total: result.rows.length,
		...(result.truncated ? { truncated: true } : {}),
		...(result.notes.length ? { notes: result.notes } : {})
	};
}

export async function runKnowledgeQuery(
	client: KnowledgeDataClient,
	userId: string,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const spec = parseQuerySpec(args);
	const store = new KnowledgeStore(client, userId);
	return compactQueryResult(await guard(() => store.query(spec)));
}

// ---------------------------------------------------------------------------
// Writes

function parseRecordBatch(args: Record<string, unknown>): KnowledgeWriteBatch {
	if (args.links !== undefined) throw invalid('links are not supported here');
	const entities = arrayArg(args.entities, 'entities', KNOWLEDGE_RECORD_MAX_ENTITIES).map(
		(raw, index): KnowledgeWriteEntity => {
			if (!isRecord(raw)) throw invalid(`entities[${index}] must be an object`);
			const path = `entities[${index}]`;
			if (!isKnowledgeKind(raw.kind)) throw invalid(`${path}.kind is not a known kind`);
			const keys = arrayArg(raw.keys, `${path}.keys`, 10).map((key, keyIndex) => {
				if (!isRecord(key)) throw invalid(`${path}.keys[${keyIndex}] must be an object`);
				return {
					type: requiredString(key.type, `${path}.keys[${keyIndex}].type`, 40),
					value: requiredString(key.value, `${path}.keys[${keyIndex}].value`, 500)
				} as NonNullable<KnowledgeWriteEntity['keys']>[number];
			});
			const summary = optionalString(raw.summary, `${path}.summary`, 1000);
			return {
				ref: requiredString(raw.ref, `${path}.ref`, 80),
				...(raw.id !== undefined && raw.id !== null
					? { id: entityId(raw.id, `${path}.id`) }
					: {}),
				...(raw.self === true ? { self: true } : {}),
				kind: raw.kind,
				name: requiredString(raw.name, `${path}.name`, 300),
				...(summary ? { summary } : {}),
				...(keys.length ? { keys } : {})
			};
		}
	);
	const sources = arrayArg(args.sources, 'sources', KNOWLEDGE_RECORD_MAX_SOURCES).map(
		(raw, index): KnowledgeWriteSource => {
			if (!isRecord(raw)) throw invalid(`sources[${index}] must be an object`);
			const path = `sources[${index}]`;
			if (!(KNOWLEDGE_TOOL_SOURCE_TYPES as readonly unknown[]).includes(raw.type)) {
				throw invalid(
					`${path}.type must be one of: ${KNOWLEDGE_TOOL_SOURCE_TYPES.join(', ')}`
				);
			}
			const url = optionalString(raw.url, `${path}.url`, 2000);
			const title = optionalString(raw.title, `${path}.title`, 300);
			return {
				ref: requiredString(raw.ref, `${path}.ref`, 80),
				type: raw.type as KnowledgeSourceType,
				...(url ? { url } : {}),
				...(title ? { title } : {})
			};
		}
	);
	const sourceRefSet = new Set(sources.map((source) => source.ref));
	const facts = arrayArg(args.facts, 'facts', KNOWLEDGE_RECORD_MAX_FACTS).map(
		(raw, index): KnowledgeWriteFact => {
			if (!isRecord(raw)) throw invalid(`facts[${index}] must be an object`);
			const path = `facts[${index}]`;
			const predicate = requiredString(raw.predicate, `${path}.predicate`, 80);
			if (!getKnowledgePredicate(predicate))
				throw invalid(`${path}.predicate "${predicate}" is unknown`);
			const object = optionalString(raw.object, `${path}.object`, 80);
			let value: string | number | undefined;
			if (typeof raw.value === 'number' && Number.isFinite(raw.value)) value = raw.value;
			else value = optionalString(raw.value, `${path}.value`, 4000);
			if (
				raw.qualifiers !== undefined &&
				raw.qualifiers !== null &&
				!isRecord(raw.qualifiers)
			) {
				throw invalid(`${path}.qualifiers must be an object`);
			}
			const factSources = arrayArg(raw.sources, `${path}.sources`, 10).map(
				(ref, refIndex) => {
					const parsed = requiredString(ref, `${path}.sources[${refIndex}]`, 80);
					if (!sourceRefSet.has(parsed)) {
						throw invalid(
							`${path}.sources[${refIndex}] "${parsed}" is not a ref in sources`
						);
					}
					return parsed;
				}
			);
			const quote = optionalString(raw.quote, `${path}.quote`, 1000);
			const validFrom = optionalString(raw.valid_from, `${path}.valid_from`, 40);
			const validTo = optionalString(raw.valid_to, `${path}.valid_to`, 40);
			return {
				subject: requiredString(raw.subject, `${path}.subject`, 80),
				predicate,
				...(object ? { object } : {}),
				...(value !== undefined ? { value } : {}),
				...(isRecord(raw.qualifiers) && Object.keys(raw.qualifiers).length
					? { qualifiers: raw.qualifiers }
					: {}),
				...(validFrom ? { valid_from: validFrom } : {}),
				...(validTo ? { valid_to: validTo } : {}),
				...(factSources.length ? { sources: factSources } : {}),
				...(quote ? { quote } : {})
			};
		}
	);
	if (!entities.length && !facts.length)
		throw invalid('Give at least one entity or fact to record');
	return { entities, facts, ...(sources.length ? { sources } : {}) };
}

export async function runKnowledgeRecord(
	client: KnowledgeDataClient,
	userId: string,
	args: Record<string, unknown>,
	options: { via: KnowledgeOpVia; runId?: string }
): Promise<Record<string, unknown>> {
	const batch = parseRecordBatch(args);
	const store = new KnowledgeStore(client, userId);
	const receipt = await guard(() =>
		store.record(batch, {
			via: options.via,
			...(options.runId ? { runId: options.runId } : {})
		})
	);
	const saved = receipt.facts.added + receipt.facts.superseded + receipt.facts.suggested;
	const created = receipt.entities.filter((entity) => entity.matched === 'created').length;
	const message =
		receipt.entities.length === 0 && saved === 0 && receipt.problems.length > 0
			? 'Nothing was saved to the knowledge graph.'
			: `Saved to the knowledge graph: ${receipt.entities.length} ${receipt.entities.length === 1 ? 'entry' : 'entries'} (${created} new), ${saved} new ${saved === 1 ? 'fact' : 'facts'}${receipt.facts.existing ? `, ${receipt.facts.existing} already known` : ''}.`;
	return {
		knowledge: {
			entities: receipt.entities.map((entity) => ({
				ref: entity.ref,
				id: entity.id,
				kind: entity.kind,
				name: entity.name,
				matched: entity.matched
			})),
			facts: receipt.facts,
			sources: receipt.sources,
			...(receipt.merge_candidates ? { possible_duplicates: receipt.merge_candidates } : {}),
			...(receipt.problems.length ? { problems: receipt.problems.slice(0, 30) } : {})
		},
		message
	};
}

export async function runKnowledgeEnrich(
	admin: KnowledgeDataClient,
	userId: string,
	args: Record<string, unknown>,
	options: { via: KnowledgeOpVia }
): Promise<Record<string, unknown>> {
	const ids = arrayArg(args.entity_ids, 'entity_ids', KNOWLEDGE_ENRICH_MAX_ENTITIES).map(
		(id, index) => entityId(id, `entity_ids[${index}]`)
	);
	if (!ids.length) throw invalid('entity_ids needs at least one entity id');
	const fields = arrayArg(args.fields, 'fields', 12).map((field, index) => {
		const key = requiredString(field, `fields[${index}]`, 80);
		if (!getKnowledgePredicate(key))
			throw invalid(`fields[${index}] "${key}" is not a known field`);
		return key;
	});
	const instructions = optionalString(
		args.instructions,
		'instructions',
		KNOWLEDGE_ENRICH_INSTRUCTIONS_MAX
	);
	const run = await guard(() =>
		startKnowledgeEnrichment(admin, userId, {
			entityIds: ids,
			...(fields.length ? { fields } : {}),
			...(instructions ? { instructions } : {}),
			trigger: options.via
		})
	);
	const names = run.targets.map((target) => target.name);
	return {
		knowledge_run: {
			id: run.runId,
			status: 'queued',
			targets: run.targets.map((target) => ({
				entity_id: target.entity_id,
				kind: target.kind,
				name: target.name,
				fields: target.fields
			})),
			...(run.skipped.length ? { skipped: run.skipped } : {}),
			budget_usd: run.budget_usd
		},
		message: `Started background research on ${names.length === 1 ? names[0] : `${names.length} entries`}. New facts appear on each entry when it finishes, usually within a few minutes.`
	};
}

// ---------------------------------------------------------------------------
// Gateway handlers (EXTERNAL_OP_HANDLERS). `via` comes from the execution context, never
// from arguments: an external agent call carries callerId; internal chat never does.

export function knowledgeViaForContext(
	context: Pick<ToolExecutionContext, 'callerId'>
): KnowledgeOpVia {
	return context.callerId ? 'mcp' : 'chat';
}

export async function searchKnowledge(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	return runKnowledgeSearch(context.admin, trustedUserId(context), args);
}

export async function getKnowledgeEntity(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	return runKnowledgeGet(context.admin, trustedUserId(context), args);
}

export async function queryKnowledge(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	return runKnowledgeQuery(context.admin, trustedUserId(context), args);
}

export async function recordKnowledge(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	return runKnowledgeRecord(context.admin, trustedUserId(context), args, {
		via: knowledgeViaForContext(context)
	});
}

export async function enrichKnowledge(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	return runKnowledgeEnrich(context.admin, trustedUserId(context), args, {
		via: knowledgeViaForContext(context)
	});
}
