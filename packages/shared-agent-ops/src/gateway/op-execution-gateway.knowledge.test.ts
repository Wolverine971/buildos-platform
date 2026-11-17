// packages/shared-agent-ops/src/gateway/op-execution-gateway.knowledge.test.ts
//
// The knowledge.* gateway ops (tasker 160): every handler builds its store from the
// authenticated user on the execution context and ignores any user id in arguments;
// record/enrich say where the write came from (MCP when an external caller is on the
// context, chat otherwise); arguments are bounded before anything reaches the store.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeInstances: Array<{ userId: string; db: unknown }> = [];
const record = vi.fn();
const search = vi.fn();
const query = vi.fn();
const getEntity = vi.fn();
const startKnowledgeEnrichment = vi.fn();

vi.mock('../knowledge', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../knowledge')>();
	class FakeKnowledgeStore {
		constructor(
			readonly db: unknown,
			readonly userId: string
		) {
			storeInstances.push({ userId, db });
		}
		record = record;
		search = search;
		query = query;
		getEntity = getEntity;
	}
	return {
		...actual,
		KnowledgeStore: FakeKnowledgeStore,
		startKnowledgeEnrichment: (...args: unknown[]) => startKnowledgeEnrichment(...args)
	};
});

import { EXTERNAL_OP_HANDLERS } from './op-execution-gateway.external';
import { extractWriteEntityMeta } from './op-execution-gateway.responses';
import type { ToolExecutionContext } from './op-execution-gateway.types';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const ENTITY = '33333333-3333-4333-8333-333333333333';
const RUN = '44444444-4444-4444-8444-444444444444';
const admin = { from: vi.fn(), rpc: vi.fn() };

function chatContext(): ToolExecutionContext {
	return {
		admin,
		userId: USER,
		chatSessionId: 'chat-session',
		scope: { mode: 'read_write', allowed_ops: ['knowledge.record'] }
	};
}

function mcpContext(): ToolExecutionContext {
	return {
		admin,
		userId: USER,
		callerId: 'caller-1',
		callSessionId: 'call-session',
		// Knowledge ops ignore project scope entirely: an empty project list must not matter.
		scope: { mode: 'read_write', project_ids: [], write_project_ids: [] }
	};
}

const RECEIPT = {
	entities: [{ ref: 'sam', id: ENTITY, kind: 'person', name: 'Sam Lee', matched: 'created' }],
	facts: { added: 2, existing: 1, superseded: 0, suggested: 0 },
	sources: 1,
	links: 0,
	merge_candidates: 0,
	problems: []
};

const BATCH = {
	entities: [{ ref: 'sam', kind: 'person', name: 'Sam Lee' }],
	facts: [
		{
			subject: 'sam',
			predicate: 'headline',
			value: 'CTO at Acme',
			sources: ['s1'],
			quote: 'Sam Lee, CTO'
		}
	],
	sources: [{ ref: 's1', type: 'web', url: 'https://acme.example/team' }]
};

beforeEach(() => {
	storeInstances.length = 0;
	record.mockReset().mockResolvedValue(RECEIPT);
	search.mockReset().mockResolvedValue([]);
	query.mockReset();
	getEntity.mockReset();
	startKnowledgeEnrichment.mockReset();
});

describe('knowledge.record', () => {
	it('records as the context user via chat, ignoring a user id in the arguments', async () => {
		const result = await EXTERNAL_OP_HANDLERS['knowledge.record'](chatContext(), {
			...BATCH,
			user_id: OTHER_USER,
			userId: OTHER_USER
		});

		expect(storeInstances).toEqual([{ userId: USER, db: admin }]);
		expect(record).toHaveBeenCalledTimes(1);
		const [batch, options] = record.mock.calls[0]!;
		expect(options).toEqual({ via: 'chat' });
		expect(batch).toEqual({
			entities: [{ ref: 'sam', kind: 'person', name: 'Sam Lee' }],
			facts: BATCH.facts,
			sources: BATCH.sources
		});
		expect(JSON.stringify(batch)).not.toContain(OTHER_USER);
		expect(result).toMatchObject({
			knowledge: { entities: [{ id: ENTITY, name: 'Sam Lee', matched: 'created' }] },
			message: expect.stringContaining('Saved to the knowledge graph')
		});
		expect(extractWriteEntityMeta({ op: 'knowledge.record', result })).toEqual({
			entityKind: 'knowledge_entity',
			entityId: ENTITY,
			entityTitle: 'Sam Lee'
		});
	});

	it('records via mcp when an external caller made the call', async () => {
		await EXTERNAL_OP_HANDLERS['knowledge.record'](mcpContext(), BATCH);

		expect(storeInstances[0]?.userId).toBe(USER);
		expect(record.mock.calls[0]![1]).toEqual({ via: 'mcp' });
	});

	it('refuses links, unknown predicates, dangling source refs and oversized batches', async () => {
		const handler = EXTERNAL_OP_HANDLERS['knowledge.record'];
		await expect(handler(chatContext(), { ...BATCH, links: [] })).rejects.toMatchObject({
			code: 'VALIDATION_ERROR'
		});
		await expect(
			handler(chatContext(), {
				...BATCH,
				facts: [{ subject: 'sam', predicate: 'favorite_color', value: 'blue' }]
			})
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
		await expect(
			handler(chatContext(), {
				...BATCH,
				facts: [{ subject: 'sam', predicate: 'headline', value: 'x', sources: ['nope'] }]
			})
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
		await expect(
			handler(chatContext(), {
				entities: Array.from({ length: 51 }, (_, i) => ({
					ref: `e${i}`,
					kind: 'person',
					name: `P ${i}`
				})),
				facts: []
			})
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
		expect(record).not.toHaveBeenCalled();
	});

	it('maps a store refusal to a validation error', async () => {
		const refusal = Object.assign(new Error('Unknown kind "robot".'), {
			name: 'KnowledgeStoreError',
			code: 'INVALID'
		});
		record.mockRejectedValueOnce(refusal);
		await expect(
			EXTERNAL_OP_HANDLERS['knowledge.record'](chatContext(), BATCH)
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: 'Unknown kind "robot".' });
	});

	it('refuses a context without a real user id', async () => {
		await expect(
			EXTERNAL_OP_HANDLERS['knowledge.record']({ ...chatContext(), userId: '' }, BATCH)
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		expect(storeInstances).toEqual([]);
	});
});

describe('knowledge.enrich', () => {
	it('starts research for the context user with the right trigger', async () => {
		startKnowledgeEnrichment.mockResolvedValue({
			runId: RUN,
			targets: [{ entity_id: ENTITY, name: 'Sam Lee', kind: 'person', fields: ['headline'] }],
			skipped: [],
			budget_usd: 0.03
		});

		const viaMcp = await EXTERNAL_OP_HANDLERS['knowledge.enrich'](mcpContext(), {
			entity_ids: [ENTITY],
			fields: ['headline'],
			instructions: 'Focus on current role',
			user_id: OTHER_USER
		});
		expect(startKnowledgeEnrichment).toHaveBeenLastCalledWith(admin, USER, {
			entityIds: [ENTITY],
			fields: ['headline'],
			instructions: 'Focus on current role',
			trigger: 'mcp'
		});
		expect(viaMcp).toMatchObject({
			knowledge_run: { id: RUN, status: 'queued', targets: [{ name: 'Sam Lee' }] },
			message: expect.stringContaining('Sam Lee')
		});
		expect(extractWriteEntityMeta({ op: 'knowledge.enrich', result: viaMcp })).toEqual({
			entityKind: 'knowledge_run',
			entityId: RUN
		});

		await EXTERNAL_OP_HANDLERS['knowledge.enrich'](chatContext(), { entity_ids: [ENTITY] });
		expect(startKnowledgeEnrichment).toHaveBeenLastCalledWith(admin, USER, {
			entityIds: [ENTITY],
			trigger: 'chat'
		});
	});

	it('caps a run at 10 entries and refuses non-ids', async () => {
		const handler = EXTERNAL_OP_HANDLERS['knowledge.enrich'];
		await expect(
			handler(chatContext(), { entity_ids: Array.from({ length: 11 }, () => ENTITY) })
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
		await expect(handler(chatContext(), { entity_ids: ['Sam Lee'] })).rejects.toMatchObject({
			code: 'VALIDATION_ERROR'
		});
		expect(startKnowledgeEnrichment).not.toHaveBeenCalled();
	});
});

describe('knowledge reads', () => {
	it('searches as the context user with a bounded limit', async () => {
		search.mockResolvedValue([
			{
				id: ENTITY,
				kind: 'person',
				name: 'Sam Lee',
				summary: null,
				scope: 'private',
				is_self: false,
				image_url: null,
				matched_on: 'email',
				score: 0.9
			}
		]);
		const result = await EXTERNAL_OP_HANDLERS['knowledge.search'](mcpContext(), {
			query: 'sam@acme.example',
			kinds: ['person'],
			limit: 500
		});
		expect(storeInstances[0]?.userId).toBe(USER);
		expect(search).toHaveBeenCalledWith('sam@acme.example', { kinds: ['person'], limit: 25 });
		expect(result).toEqual({
			query: 'sam@acme.example',
			results: [{ id: ENTITY, kind: 'person', name: 'Sam Lee', matched_on: 'email' }],
			total: 1
		});
	});

	it('passes a parsed query spec and refuses a property as a follow step', async () => {
		query.mockResolvedValue({
			rows: [
				{
					entity: {
						id: ENTITY,
						kind: 'person',
						name: 'Sam Lee',
						summary: null,
						scope: 'private',
						is_self: false,
						image_url: null
					},
					path: [],
					fields: {
						headline: [
							{ value: 'CTO', qualifiers: {}, status: 'active', source_count: 1 }
						],
						email: []
					}
				}
			],
			coverage: { headline: { known: 1, missing: 0 } },
			start_count: 1,
			truncated: false,
			notes: []
		});
		const result = await EXTERNAL_OP_HANDLERS['knowledge.query'](chatContext(), {
			start: { search: 'Acme', kinds: ['org'] },
			follow: [{ predicate: 'works_at', direction: 'in', kinds: ['person'] }],
			where: { known_by_me: true },
			fields: ['headline', 'email']
		});
		expect(query).toHaveBeenCalledWith({
			start: { search: 'Acme', kinds: ['org'] },
			follow: [{ predicate: 'works_at', direction: 'in', kinds: ['person'] }],
			where: { known_by_me: true },
			fields: ['headline', 'email'],
			limit: 50
		});
		expect(result).toMatchObject({
			rows: [{ id: ENTITY, name: 'Sam Lee', fields: { headline: ['CTO'] } }],
			total: 1
		});

		await expect(
			EXTERNAL_OP_HANDLERS['knowledge.query'](chatContext(), {
				start: { search: 'Acme' },
				follow: [{ predicate: 'headline' }]
			})
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
	});

	it('returns NOT_FOUND for an entry the user cannot see', async () => {
		getEntity.mockResolvedValue(null);
		await expect(
			EXTERNAL_OP_HANDLERS['knowledge.get'](mcpContext(), { entity_id: ENTITY })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
		expect(storeInstances[0]?.userId).toBe(USER);
	});
});
