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
	KNOWLEDGE_CONTACT_PREDICATES,
	KNOWLEDGE_UUID_PATTERN,
	KnowledgeStore,
	getKnowledgePredicate,
	isKnowledgeKind,
	normalizeKnowledgeValue,
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
import {
	isKnowledgeConnectionQuery,
	runKnowledgeConnectionsQuery
} from './op-execution-gateway.knowledge-connections';
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

/**
 * How much of a person's contact details a caller may see. BuildOS's own chat sees them; a
 * connected AI tool only when its key opted in to `knowledge.contacts`.
 */
export type KnowledgeReadOptions = { hideContacts?: boolean };

const CONTACTS_HIDDEN_NOTE =
	"People's contact details (phone, email, address, birthday, notes) are not shared with connected AI tools. The user can allow them for this connection in BuildOS: Profile → Agent keys → Share contact details.";

function isHiddenContact(kind: string, predicate: string, options: KnowledgeReadOptions): boolean {
	return (
		Boolean(options.hideContacts) &&
		kind === 'person' &&
		KNOWLEDGE_CONTACT_PREDICATES.has(predicate)
	);
}

export async function runKnowledgeSearch(
	client: KnowledgeDataClient,
	userId: string,
	args: Record<string, unknown>,
	options: KnowledgeReadOptions = {}
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
		results: hits.map((hit) => ({
			...compactEntity(hit),
			// The caller typed the value, but which contact field matched stays private.
			matched_on: isHiddenContact(hit.kind, hit.matched_on, options)
				? 'contact detail'
				: hit.matched_on
		})),
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
	detail: KnowledgeEntityDetail,
	options: KnowledgeReadOptions = {}
): Record<string, unknown> {
	const visibleFacts = detail.facts.filter(
		(fact) => !isHiddenContact(detail.entity.kind, fact.predicate, options)
	);
	const hiddenContacts = detail.facts.length - visibleFacts.length;
	const facts = visibleFacts.slice(0, ENTITY_FACT_LIMIT);
	const incoming = detail.incoming.slice(0, ENTITY_INCOMING_LIMIT);
	const latestResearch = detail.enrichment[0];
	return {
		entity: {
			...compactEntity(detail.entity),
			...(detail.entity.enriched_at ? { researched_at: detail.entity.enriched_at } : {})
		},
		known_by_me: detail.known_by_me,
		facts: facts.map(compactFact),
		...(visibleFacts.length > facts.length ? { facts_truncated: true } : {}),
		...(hiddenContacts
			? { contact_details_hidden: hiddenContacts, contact_details_note: CONTACTS_HIDDEN_NOTE }
			: {}),
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
	args: Record<string, unknown>,
	options: KnowledgeReadOptions = {}
): Promise<Record<string, unknown>> {
	const id = entityId(args.entity_id, 'entity_id');
	const store = new KnowledgeStore(client, userId);
	const detail = await guard(() => store.getEntity(id));
	if (!detail) throw new ExternalToolGatewayError('NOT_FOUND', 'Knowledge entry not found');
	return compactKnowledgeEntityDetail(detail, options);
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

function compactQueryResult(
	result: KnowledgeQueryResult,
	options: KnowledgeReadOptions = {}
): Record<string, unknown> {
	let hiddenContacts = 0;
	return {
		rows: result.rows.map((row) => {
			const fields = Object.fromEntries(
				Object.entries(row.fields)
					.filter(([, values]) => values.length > 0)
					.filter(([key, values]) => {
						if (!isHiddenContact(row.entity.kind, key, options)) return true;
						hiddenContacts += values.length;
						return false;
					})
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
		...(result.notes.length || hiddenContacts
			? {
					notes: [...result.notes, ...(hiddenContacts ? [CONTACTS_HIDDEN_NOTE] : [])]
				}
			: {})
	};
}

export async function runKnowledgeQuery(
	client: KnowledgeDataClient,
	userId: string,
	args: Record<string, unknown>,
	options: KnowledgeReadOptions = {}
): Promise<Record<string, unknown>> {
	// People filters and group_by (tasker 166) are answered by one connections read.
	if (isKnowledgeConnectionQuery(args))
		return runKnowledgeConnectionsQuery(client, userId, args, options);
	const spec = parseQuerySpec(args);
	const store = new KnowledgeStore(client, userId);
	return compactQueryResult(await guard(() => store.query(spec)), options);
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
// Knowledge in shared projects (tasker 168; 20261118300000_knowledge_project_sharing.sql)
//
//   knowledge.project_lens   → get_project_knowledge_lens
//   knowledge.request_access → request_knowledge_access
//
// Everyone keeps a private graph. Inside a project with other members, the lens shows what
// OTHER current members' entries hold about the names on this project's tasks/docs: public or
// project-sourced facts, plus whatever the owner granted this viewer. The database decides
// every rule (membership, per-fact level, live grants); these runners pass p_viewer = the
// trusted user id (service role) and label every fact with who shared it, so a model says
// "DJ's People say…" and never presents it as the user's own knowledge.
//
// Agents may ASK the owner for more (knowledge_request_share, via 'agent'); approve, decline
// and revoke are revoked from service_role in the migration, so no agent can grant.

export const KNOWLEDGE_LENS_RECORD_LIMIT = 100;
const LENS_ENTRY_LIMIT = 60;
const LENS_FACT_LIMIT = 30;
const LENS_RECORD_ID_LIMIT = 10;
const LENS_QUOTE_LIMIT = 3;

export const KNOWLEDGE_LENS_GUIDANCE =
	"Other members' notes, not the user's. Attribute every fact to its shared_by person (\"DJ's People say…\"). Never present it as the user's own knowledge and never save it with record_knowledge. hidden counts details the owner has not shared; request_knowledge_access asks them (only when the user wants it).";

type LensRecordKind = 'task' | 'document';

type RawLensFact = {
	id?: unknown;
	predicate?: unknown;
	value?: unknown;
	object_name?: unknown;
	object_kind?: unknown;
	qualifiers?: unknown;
	source_url?: unknown;
	via?: unknown;
};

type RawLensEntry = {
	owner?: { user_id?: unknown; name?: unknown } | null;
	entity?: { id?: unknown; kind?: unknown; name?: unknown; summary?: unknown } | null;
	record_ids?: unknown;
	quotes?: unknown;
	facts?: unknown;
	hidden?: { contact?: unknown; other?: unknown } | null;
	ask?: { status?: unknown; created_at?: unknown } | null;
	grant?: { what?: unknown; duration?: unknown; expires_at?: unknown } | null;
};

type RpcError = { message?: string; code?: string } | null;

function uuidArg(value: unknown, field: string): string {
	if (typeof value !== 'string' || !UUID.test(value.trim())) {
		throw invalid(`${field} must be a UUID`);
	}
	return value.trim().toLowerCase();
}

function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function count(value: unknown): number {
	const number = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function rpcFailure(error: NonNullable<RpcError>, fallback: string): ExternalToolGatewayError {
	if (error.code === '42501') {
		return new ExternalToolGatewayError(
			'FORBIDDEN',
			'The user is not a current member of this project, so its shared knowledge is not visible.'
		);
	}
	if (error.code === '22023') {
		return new ExternalToolGatewayError('VALIDATION_ERROR', error.message || fallback);
	}
	return new ExternalToolGatewayError('INTERNAL', fallback);
}

/**
 * The shared-project knowledge ops are project-scoped, unlike the personal graph ops. The
 * viewer is always the authenticated user on the context (never an argument). A connection
 * limited to chosen projects may use the lens on those projects only, and never the ask.
 * Any connection whose scope lists projects must name one of them.
 */
function trustedProjectViewer(
	context: Pick<ToolExecutionContext, 'userId' | 'projectScopeMode' | 'scope'>,
	projectId: string,
	op: 'knowledge.project_lens' | 'knowledge.request_access'
): string {
	if (typeof context.userId !== 'string' || !UUID.test(context.userId)) {
		throw new ExternalToolGatewayError('FORBIDDEN', 'Knowledge tools need a signed-in user.');
	}
	const projectIds = Array.isArray(context.scope?.project_ids)
		? context.scope.project_ids.map((id) => String(id).toLowerCase())
		: null;
	if (context.projectScopeMode === 'selected') {
		if (op !== 'knowledge.project_lens') {
			throw new ExternalToolGatewayError(
				'FORBIDDEN',
				'This connection is limited to selected projects, so it can read what other members share there but cannot send asks. The user can press Ask on the card in BuildOS.'
			);
		}
		if (!projectIds) {
			throw new ExternalToolGatewayError(
				'FORBIDDEN',
				'This connection is limited to selected projects and none are selected.'
			);
		}
	}
	if (projectIds && !projectIds.includes(projectId)) {
		throw new ExternalToolGatewayError('FORBIDDEN', 'This connection cannot see that project.');
	}
	return context.userId;
}

/**
 * Refuses when the project's owner turned this member's agents off there (same rule as
 * people_layer_effective_agent_access). No member row (e.g. no actor yet) is left to the
 * lens's own membership check.
 */
async function assertMemberAgentsAllowed(
	client: KnowledgeDataClient,
	userId: string,
	projectId: string
): Promise<void> {
	const db = client as any;
	const { data: actor, error: actorError } = await db
		.from('onto_actors')
		.select('id')
		.eq('user_id', userId)
		.maybeSingle();
	if (actorError) throw new ExternalToolGatewayError('INTERNAL', 'Could not check agent access');
	if (!actor?.id) return;
	const { data, error } = await db.rpc('people_layer_effective_agent_access', {
		p_project_id: projectId,
		p_actor_id: actor.id
	});
	if (error) throw new ExternalToolGatewayError('INTERNAL', 'Could not check agent access');
	if (data === 'off') {
		throw new ExternalToolGatewayError(
			'FORBIDDEN',
			"The project's owner turned off agents for this person in this project, so agents cannot read or ask about what other members know there. Only the owner can turn it back on."
		);
	}
}

async function recentRecordIds(
	client: KnowledgeDataClient,
	kind: LensRecordKind,
	projectId: string
): Promise<string[]> {
	const { data, error } = await (client as any)
		.from(kind === 'task' ? 'onto_tasks' : 'onto_documents')
		.select('id')
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false })
		.limit(KNOWLEDGE_LENS_RECORD_LIMIT);
	if (error)
		throw new ExternalToolGatewayError('INTERNAL', `Could not list the project's ${kind}s`);
	return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

function compactLensFact(
	raw: RawLensFact,
	sharedBy: string,
	projectScope: string
): Record<string, unknown> | null {
	const predicate = text(raw.predicate);
	if (!predicate) return null;
	const value = text(raw.value);
	const objectName = text(raw.object_name);
	if (!value && !objectName) return null;
	const qualifiers = isRecord(raw.qualifiers) ? nonEmpty(raw.qualifiers) : undefined;
	const sourceUrl = text(raw.source_url);
	return {
		predicate,
		...(value ? { value } : {}),
		...(objectName
			? {
					object: {
						name: objectName,
						...(text(raw.object_kind) ? { kind: raw.object_kind } : {})
					}
				}
			: {}),
		...(qualifiers ? { qualifiers } : {}),
		...(sourceUrl ? { source_url: sourceUrl } : {}),
		shared_by: sharedBy,
		scope: raw.via === 'grant' ? 'grant' : projectScope
	};
}

function compactLensEntry(raw: RawLensEntry, projectScope: string): Record<string, unknown> | null {
	const entityId = text(raw.entity?.id);
	const name = text(raw.entity?.name);
	if (!entityId || !name) return null;
	const sharedBy = text(raw.owner?.name) ?? 'Another member';
	const facts = (Array.isArray(raw.facts) ? (raw.facts as RawLensFact[]) : [])
		.map((fact) => compactLensFact(fact, sharedBy, projectScope))
		.filter((fact): fact is Record<string, unknown> => fact !== null);
	const recordIds = Array.isArray(raw.record_ids)
		? raw.record_ids.filter((id): id is string => typeof id === 'string')
		: [];
	const quotes = Array.isArray(raw.quotes)
		? raw.quotes
				.filter((quote): quote is string => typeof quote === 'string' && !!quote.trim())
				.slice(0, LENS_QUOTE_LIMIT)
		: [];
	const hidden = { contact: count(raw.hidden?.contact), other: count(raw.hidden?.other) };
	const askStatus = text(raw.ask?.status);
	const grant = raw.grant
		? {
				what: text(raw.grant.what) ?? 'contact',
				duration: text(raw.grant.duration) ?? 'membership',
				...(text(raw.grant.expires_at) ? { expires_at: raw.grant.expires_at } : {})
			}
		: null;
	const hasHidden = hidden.contact + hidden.other > 0;
	return {
		entity: {
			id: entityId,
			kind: text(raw.entity?.kind) ?? 'person',
			name,
			...(text(raw.entity?.summary) ? { summary: raw.entity!.summary } : {})
		},
		shared_by: sharedBy,
		facts: facts.slice(0, LENS_FACT_LIMIT),
		...(facts.length > LENS_FACT_LIMIT ? { facts_truncated: true } : {}),
		...(hasHidden ? { hidden } : {}),
		...(askStatus
			? {
					ask: {
						status: askStatus,
						...(text(raw.ask?.created_at) ? { asked_at: raw.ask!.created_at } : {})
					}
				}
			: {}),
		...(grant ? { grant } : {}),
		// One ask per entry at a time; a recent no stays quiet for 30 days.
		can_ask: hasHidden && !askStatus,
		on_records: recordIds.slice(0, LENS_RECORD_ID_LIMIT),
		...(quotes.length ? { quotes } : {})
	};
}

export async function runKnowledgeProjectLens(
	client: KnowledgeDataClient,
	userId: string,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const projectId = uuidArg(args.project_id, 'project_id');
	const kindArg = args.record_kind;
	if (kindArg !== undefined && kindArg !== null && kindArg !== 'task' && kindArg !== 'document') {
		throw invalid('record_kind must be task or document');
	}
	const explicitIds = arrayArg(args.record_ids, 'record_ids', KNOWLEDGE_LENS_RECORD_LIMIT).map(
		(id, index) => uuidArg(id, `record_ids[${index}]`)
	);
	if (explicitIds.length && !kindArg) throw invalid('record_ids needs record_kind');
	const kinds: LensRecordKind[] = kindArg ? [kindArg as LensRecordKind] : ['task', 'document'];
	const db = client as any;

	const [{ data: project, error: projectError }] = await Promise.all([
		db.from('onto_projects').select('id, name').eq('id', projectId).maybeSingle(),
		assertMemberAgentsAllowed(client, userId, projectId)
	]);
	if (projectError) throw new ExternalToolGatewayError('INTERNAL', 'Could not load the project');
	if (!project) throw new ExternalToolGatewayError('NOT_FOUND', 'Project not found');
	const projectName = text(project.name) ?? 'this project';
	const projectScope = `project:${projectName}`;

	const recordSets = await Promise.all(
		kinds.map(async (kind) => ({
			kind,
			ids: explicitIds.length ? explicitIds : await recentRecordIds(client, kind, projectId)
		}))
	);
	// The lens checks membership itself, so it runs at least once even with no records.
	const lensSets = recordSets.filter((set) => set.ids.length > 0);
	const lenses = await Promise.all(
		(lensSets.length ? lensSets : [{ kind: kinds[0]!, ids: [] as string[] }]).map(
			async (set) => {
				const { data, error } = await db.rpc('knowledge_project_lens', {
					p_project: projectId,
					p_record_kind: set.kind,
					p_record_ids: set.ids,
					p_viewer: userId
				});
				if (error) throw rpcFailure(error, 'Could not read shared knowledge');
				return isRecord(data) && Array.isArray(data.entries)
					? (data.entries as RawLensEntry[])
					: [];
			}
		)
	);

	// One row per (owner, entity): the same entry may sit on both tasks and documents.
	const byKey = new Map<string, Record<string, unknown>>();
	for (const raw of lenses.flat()) {
		const entry = compactLensEntry(raw, projectScope);
		if (!entry) continue;
		const key = `${text(raw.owner?.user_id) ?? ''}|${(entry.entity as { id: string }).id}`;
		const existing = byKey.get(key);
		if (existing) {
			existing.on_records = [
				...new Set([
					...(existing.on_records as string[]),
					...(entry.on_records as string[])
				])
			].slice(0, LENS_RECORD_ID_LIMIT);
			continue;
		}
		byKey.set(key, entry);
	}
	const entries = [...byKey.values()];
	const recordsChecked = recordSets.reduce((sum, set) => sum + set.ids.length, 0);
	return {
		project: { id: projectId, name: projectName },
		record_kind: kinds.length === 1 ? kinds[0] : 'task+document',
		records_checked: recordsChecked,
		guidance: KNOWLEDGE_LENS_GUIDANCE,
		entries: entries.slice(0, LENS_ENTRY_LIMIT),
		total: entries.length,
		...(entries.length > LENS_ENTRY_LIMIT ? { truncated: true } : {}),
		...(entries.length === 0
			? {
					message:
						recordsChecked === 0
							? 'This project has no tasks or documents to look at yet.'
							: 'No other member has shared anything about the names on these records.'
				}
			: {})
	};
}

const ASK_MESSAGES: Record<string, string> = {
	sent: 'Asked. Nothing is shared until they choose; if they say yes, it shows on the card wherever the name appears in the project.',
	already_waiting:
		'An ask is already waiting with them for this entry (added to it). Nothing is shared until they answer.',
	owner_said_no:
		'They said no to this recently, so no new ask was sent. Do not ask again for now.',
	already_shared:
		'This is already shared with the user. Read get_project_knowledge_lens again to see it.',
	not_found:
		"Only names another current member linked to this project's tasks or documents can be asked about. Check the entity_id from get_project_knowledge_lens.",
	nothing_to_ask:
		'Nothing about this entry is held back from the user, so there is nothing to ask for.',
	rate_limited:
		'Too many asks right now (at most 2 about one entry and 5 to one person a day). Wait for answers first.'
};

export async function runKnowledgeRequestAccess(
	client: KnowledgeDataClient,
	userId: string,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const entity = entityId(args.entity_id, 'entity_id');
	const projectId = uuidArg(args.project_id, 'project_id');
	const what = args.what ?? 'contact';
	if (what !== 'contact' && what !== 'all') throw invalid('what must be contact or all');

	await assertMemberAgentsAllowed(client, userId, projectId);
	const { data, error } = await (client as any).rpc('knowledge_request_share', {
		p_entity: entity,
		p_project: projectId,
		p_what: what,
		p_viewer: userId,
		p_via: 'agent'
	});
	if (error) throw rpcFailure(error, 'Could not send the ask');

	const outcome = isRecord(data) ? data : {};
	const raw = typeof outcome.status === 'string' ? outcome.status : 'not_found';
	const shareId = typeof outcome.id === 'string' ? outcome.id : null;
	const status =
		raw === 'requested'
			? outcome.merged === true
				? 'already_waiting'
				: 'sent'
			: raw === 'declined'
				? 'owner_said_no'
				: raw;
	return {
		knowledge_ask: {
			status,
			entity_id: entity,
			project_id: projectId,
			what,
			...(shareId ? { id: shareId } : {}),
			// Only a brand-new ask notifies the owner (the web host sends the email).
			new_request: status === 'sent'
		},
		message: ASK_MESSAGES[status] ?? 'The ask could not be sent.'
	};
}

/**
 * A stable, content-free key for a granted value: the predicate's value type plus a 32-bit
 * hash of the normalized value. Chat storage keeps these keys instead of the granted values,
 * and the wrap-up capture drops a candidate fact whose key matches (a value the turn only
 * learned from someone else's grant must not be copied into the user's own graph). Structured
 * value comparison only; a rare hash collision just skips one capture.
 */
export function knowledgeGrantValueKey(predicate: string, value: string | number): string | null {
	const def = getKnowledgePredicate(predicate);
	const valueType = def && def.valueType !== 'entity' ? def.valueType : 'text';
	const normalized = normalizeKnowledgeValue(valueType, value);
	if (!normalized) return null;
	const key =
		valueType === 'text' || valueType === 'json' ? normalized.toLowerCase() : normalized;
	let hash = 2166136261;
	for (let i = 0; i < key.length; i += 1) {
		hash ^= key.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return `${valueType}:${(hash >>> 0).toString(16)}`;
}

/** Keys of every granted (scope 'grant') fact value in a get_project_knowledge_lens result. */
export function lensGrantedValueKeys(result: unknown): string[] {
	if (!isRecord(result) || !Array.isArray(result.entries)) return [];
	const keys = new Set<string>();
	for (const entry of result.entries) {
		if (!isRecord(entry) || !Array.isArray(entry.facts)) continue;
		for (const fact of entry.facts) {
			if (!isRecord(fact) || fact.scope !== 'grant') continue;
			if (typeof fact.predicate !== 'string' || typeof fact.value !== 'string') continue;
			const key = knowledgeGrantValueKey(fact.predicate, fact.value);
			if (key) keys.add(key);
		}
	}
	return [...keys];
}

// ---------------------------------------------------------------------------
// Gateway handlers (EXTERNAL_OP_HANDLERS). `via` comes from the execution context, never
// from arguments: an external agent call carries callerId; internal chat never does.

export function knowledgeViaForContext(
	context: Pick<ToolExecutionContext, 'callerId'>
): KnowledgeOpVia {
	return context.callerId ? 'mcp' : 'chat';
}

/**
 * A connected AI tool (an external caller) sees people's contact details only when its key
 * opted in to `knowledge.contacts`; BuildOS's own chat carries no callerId and sees them.
 */
export function knowledgeReadOptionsForContext(
	context: Pick<ToolExecutionContext, 'callerId' | 'scope'>
): KnowledgeReadOptions {
	if (!context.callerId) return {};
	const allowed = (context.scope?.allowed_ops ?? []) as readonly string[];
	return { hideContacts: !allowed.includes('knowledge.contacts') };
}

export async function searchKnowledge(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	return runKnowledgeSearch(
		context.admin,
		trustedUserId(context),
		args,
		knowledgeReadOptionsForContext(context)
	);
}

export async function getKnowledgeEntity(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	return runKnowledgeGet(
		context.admin,
		trustedUserId(context),
		args,
		knowledgeReadOptionsForContext(context)
	);
}

export async function queryKnowledge(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	return runKnowledgeQuery(
		context.admin,
		trustedUserId(context),
		args,
		knowledgeReadOptionsForContext(context)
	);
}

export async function recordKnowledge(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	return runKnowledgeRecord(context.admin, trustedUserId(context), args, {
		via: knowledgeViaForContext(context)
	});
}

/**
 * Paid web research starts only from the person in BuildOS: Find more on a card, or asking in
 * BuildOS chat (DJ, 2026-11-18). A connected AI tool (callerId) or a background run with no
 * chat session is refused, whatever its key or policy lists.
 */
export async function enrichKnowledge(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	if (context.callerId || !context.chatSessionId) {
		throw new ExternalToolGatewayError(
			'FORBIDDEN',
			'Research runs only when the person starts it in BuildOS: Find more on the entry, or asking in BuildOS chat. Tell the user they can do that.'
		);
	}
	return runKnowledgeEnrich(context.admin, trustedUserId(context), args, {
		via: knowledgeViaForContext(context)
	});
}

export async function projectKnowledgeLens(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const projectId = uuidArg(args.project_id, 'project_id');
	const viewer = trustedProjectViewer(context, projectId, 'knowledge.project_lens');
	return runKnowledgeProjectLens(context.admin, viewer, { ...args, project_id: projectId });
}

export async function requestKnowledgeAccess(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const projectId = uuidArg(args.project_id, 'project_id');
	const viewer = trustedProjectViewer(context, projectId, 'knowledge.request_access');
	return runKnowledgeRequestAccess(context.admin, viewer, { ...args, project_id: projectId });
}
