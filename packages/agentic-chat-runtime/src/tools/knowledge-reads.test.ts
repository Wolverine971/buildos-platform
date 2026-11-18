// packages/agentic-chat-runtime/src/tools/knowledge-reads.test.ts
//
// The knowledge graph reads on the chat read lane (tasker 160). The worker reads with a
// service-role client, so the turn's trusted user id is the only identity: the store must be
// built from context.userId, never from arguments. Results use the same compact shapes the MCP
// knowledge.* ops return.
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import {
	executeAgenticChatSharedReadToolV1,
	isAgenticChatSharedReadToolNameV1
} from './shared-read-dispatch';
import { AGENTIC_CHAT_TOOL_STORAGE_CLASSES_V1 } from './tool-storage-projection';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const SAM = '33333333-3333-4333-8333-333333333333';

/** A PostgREST stand-in: every table read is empty; rpc answers knowledge_search. */
function fakeClient(searchRows: Array<Record<string, unknown>> = []) {
	const rpc = vi.fn(async (fn: string, _args: Record<string, unknown>) =>
		fn === 'knowledge_search'
			? { data: searchRows, error: null }
			: { data: null, error: { message: `unexpected rpc ${fn}` } }
	);
	const chain: any = new Proxy(
		{},
		{
			get(_target, prop) {
				if (prop === 'then') {
					return (resolve: (value: unknown) => void) =>
						resolve({ data: [], error: null });
				}
				if (prop === 'maybeSingle' || prop === 'single') {
					return async () => ({ data: null, error: null });
				}
				return () => chain;
			}
		}
	);
	const from = vi.fn(() => chain);
	return { client: { rpc, from }, rpc, from };
}

function context(client: unknown): AgenticChatSharedReadContextV1 {
	return {
		client: client as AgenticChatSharedReadContextV1['client'],
		access: {} as AgenticChatSharedReadContextV1['access'],
		userId: USER,
		timezone: null
	};
}

describe('knowledge reads', () => {
	it('are registered shared reads stored as the user’s own data', () => {
		for (const name of ['search_knowledge', 'get_knowledge_entity', 'query_knowledge']) {
			expect(isAgenticChatSharedReadToolNameV1(name), name).toBe(true);
			expect(AGENTIC_CHAT_TOOL_STORAGE_CLASSES_V1[name], name).toBe('workspace');
		}
	});

	it('searches as the turn user and ignores a user id in the arguments', async () => {
		const { client, rpc } = fakeClient([
			{
				entity_id: SAM,
				kind: 'person',
				name: 'Sam Lee',
				summary: 'CTO at Acme',
				scope: 'private',
				is_self: false,
				matched_on: 'name',
				score: 1
			}
		]);

		const result = await executeAgenticChatSharedReadToolV1({
			toolName: 'search_knowledge',
			context: context(client),
			arguments: { query: 'Sam', kinds: ['person'], user_id: OTHER_USER } as never
		});

		expect(rpc).toHaveBeenCalledTimes(1);
		expect(rpc.mock.calls[0]![1]).toMatchObject({
			p_query: 'Sam',
			p_kinds: ['person'],
			p_limit: 10,
			p_viewer: USER
		});
		expect(result).toEqual({
			query: 'Sam',
			results: [
				{
					id: SAM,
					kind: 'person',
					name: 'Sam Lee',
					summary: 'CTO at Acme',
					matched_on: 'name'
				}
			],
			total: 1
		});
	});

	it('refuses a get without a real entry id before touching the database', async () => {
		const { client, rpc, from } = fakeClient();
		await expect(
			executeAgenticChatSharedReadToolV1({
				toolName: 'get_knowledge_entity',
				context: context(client),
				arguments: { entity_id: 'Sam Lee' }
			})
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
		expect(rpc).not.toHaveBeenCalled();
		expect(from).not.toHaveBeenCalled();
	});

	it('queries from a search as the turn user and says when nothing matched', async () => {
		const { client, rpc } = fakeClient([]);
		const result = await executeAgenticChatSharedReadToolV1({
			toolName: 'query_knowledge',
			context: context(client),
			arguments: {
				start: { search: 'Palantir', kinds: ['org'] },
				follow: [{ predicate: 'works_at', direction: 'in', kinds: ['person'] }],
				where: { known_by_me: true }
			}
		});
		expect(rpc.mock.calls[0]![1]).toMatchObject({ p_query: 'Palantir', p_viewer: USER });
		expect(result).toMatchObject({ rows: [], total: 0 });
		expect(JSON.stringify(result)).toContain('Palantir');
	});

	it('refuses to follow a property instead of a relationship', async () => {
		const { client, rpc } = fakeClient();
		await expect(
			executeAgenticChatSharedReadToolV1({
				toolName: 'query_knowledge',
				context: context(client),
				arguments: { start: { search: 'Acme' }, follow: [{ predicate: 'email' }] }
			})
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
		expect(rpc).not.toHaveBeenCalled();
	});
});

describe('shared-project knowledge lens on the chat read lane (tasker 168)', () => {
	const PROJECT = '44444444-4444-4444-8444-444444444444';

	function lensClient() {
		const rpc = vi.fn(async (fn: string, _args: Record<string, unknown>) => {
			if (fn === 'people_layer_effective_agent_access') return { data: 'read', error: null };
			if (fn === 'knowledge_project_lens') return { data: { entries: [] }, error: null };
			return { data: null, error: { message: `unexpected rpc ${fn}` } };
		});
		const chain: any = new Proxy(
			{},
			{
				get(_target, prop) {
					if (prop === 'then') {
						return (resolve: (value: unknown) => void) =>
							resolve({ data: [{ id: SAM }], error: null });
					}
					if (prop === 'maybeSingle' || prop === 'single') {
						return async () => ({ data: { id: SAM, name: 'Launch' }, error: null });
					}
					return () => chain;
				}
			}
		);
		return { client: { rpc, from: vi.fn(() => chain) }, rpc };
	}

	it('is a pass-through shared read that checks project access and reads as the turn user', async () => {
		expect(isAgenticChatSharedReadToolNameV1('get_project_knowledge_lens')).toBe(true);
		expect(AGENTIC_CHAT_TOOL_STORAGE_CLASSES_V1.get_project_knowledge_lens).toBe(
			'pass_through'
		);
		const { client, rpc } = lensClient();
		const assertProjectAccess = vi.fn(async () => undefined);
		const result = await executeAgenticChatSharedReadToolV1({
			toolName: 'get_project_knowledge_lens',
			context: {
				...context(client),
				access: {
					assertProjectAccess
				} as unknown as AgenticChatSharedReadContextV1['access']
			},
			arguments: { project_id: PROJECT, record_kind: 'task', p_viewer: OTHER_USER } as never
		});
		expect(assertProjectAccess).toHaveBeenCalledWith(PROJECT, 'read');
		const lensCall = rpc.mock.calls.find(([fn]) => fn === 'knowledge_project_lens');
		expect(lensCall![1]).toMatchObject({ p_project: PROJECT, p_viewer: USER });
		expect(result).toMatchObject({ project: { id: PROJECT, name: 'Launch' }, total: 0 });
	});

	it('stops when the turn cannot read the project', async () => {
		const { client, rpc } = lensClient();
		const assertProjectAccess = vi.fn(async () => {
			throw Object.assign(new Error('Project not found'), { code: 'NOT_FOUND' });
		});
		await expect(
			executeAgenticChatSharedReadToolV1({
				toolName: 'get_project_knowledge_lens',
				context: {
					...context(client),
					access: {
						assertProjectAccess
					} as unknown as AgenticChatSharedReadContextV1['access']
				},
				arguments: { project_id: PROJECT }
			})
		).rejects.toThrow('Project not found');
		expect(rpc).not.toHaveBeenCalled();
	});
});
