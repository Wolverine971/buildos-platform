// apps/web/src/routes/api/onto/task-entities/task-entities-api.test.ts
import { describe, expect, it } from 'vitest';
import { GET } from './+server';
import { PATCH } from './[entityId]/+server';

const TASK_A = '11111111-1111-4111-8111-111111111111';
const TASK_B = '22222222-2222-4222-8222-222222222222';
const ENTITY = '33333333-3333-4333-8333-333333333333';

/** A user-scoped client stand-in: records each query and answers per table. */
function locals(answers: Record<string, { data: unknown; error: unknown }>, signedIn = true) {
	const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
	const supabase = {
		from(table: string) {
			const answer = answers[table] ?? { data: [], error: null };
			const query: Record<string, unknown> = {};
			for (const method of ['select', 'in', 'eq', 'order', 'update']) {
				query[method] = (...args: unknown[]) => {
					calls.push({ table, method, args });
					return query;
				};
			}
			query.maybeSingle = async () => answer;
			query.then = (resolve: (value: unknown) => unknown) =>
				Promise.resolve(answer).then(resolve);
			return query;
		}
	};
	return {
		calls,
		locals: {
			supabase,
			safeGetSession: async () => (signedIn ? { user: { id: 'user-1' } } : { user: null })
		}
	};
}

const getEvent = (query: string, context: ReturnType<typeof locals>) =>
	({ url: new URL(`http://x/api/onto/task-entities?${query}`), locals: context.locals }) as never;

const patchEvent = (entityId: string, body: unknown, context: ReturnType<typeof locals>) =>
	({
		params: { entityId },
		request: new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }),
		locals: context.locals
	}) as never;

describe('GET /api/onto/task-entities', () => {
	it('loads entities and read state for several tasks in one request', async () => {
		const context = locals({
			onto_task_entities: {
				data: [{ id: ENTITY, task_id: TASK_A, kind: 'phone' }],
				error: null
			},
			onto_task_entity_state: {
				data: [{ task_id: TASK_A, outcome: 'extracted' }],
				error: null
			}
		});
		const response = await GET(getEvent(`task_ids=${TASK_A},${TASK_B},${TASK_A}`, context));
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.data).toEqual({
			entities: [{ id: ENTITY, task_id: TASK_A, kind: 'phone' }],
			states: [{ task_id: TASK_A, outcome: 'extracted' }]
		});
		const inCall = context.calls.find(
			(call) => call.table === 'onto_task_entities' && call.method === 'in'
		);
		expect(inCall?.args).toEqual(['task_id', [TASK_A, TASK_B]]);
	});

	it('rejects missing, malformed and signed-out requests', async () => {
		expect((await GET(getEvent('', locals({})))).status).toBe(400);
		expect((await GET(getEvent('task_ids=not-a-uuid', locals({})))).status).toBe(400);
		expect((await GET(getEvent(`task_ids=${TASK_A}`, locals({}, false)))).status).toBe(401);
	});
});

describe('PATCH /api/onto/task-entities/[entityId]', () => {
	it('changes only the status, through the caller’s own client', async () => {
		const context = locals({
			onto_task_entities: { data: { id: ENTITY, status: 'dismissed' }, error: null }
		});
		const response = await PATCH(patchEvent(ENTITY, { status: 'dismissed' }, context));
		expect(response.status).toBe(200);
		const update = context.calls.find((call) => call.method === 'update');
		expect(Object.keys(update?.args[0] as object).sort()).toEqual([
			'status',
			'status_changed_at',
			'updated_at'
		]);
		expect((update?.args[0] as { status: string }).status).toBe('dismissed');
	});

	it('answers 404 when RLS hides the row, and 400 for an unknown status', async () => {
		const hidden = locals({ onto_task_entities: { data: null, error: null } });
		expect((await PATCH(patchEvent(ENTITY, { status: 'confirmed' }, hidden))).status).toBe(404);
		expect((await PATCH(patchEvent(ENTITY, { status: 'deleted' }, locals({})))).status).toBe(
			400
		);
		expect((await PATCH(patchEvent('nope', { status: 'confirmed' }, locals({})))).status).toBe(
			400
		);
	});
});
