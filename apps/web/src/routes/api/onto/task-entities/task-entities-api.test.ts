// apps/web/src/routes/api/onto/task-entities/task-entities-api.test.ts
import { describe, expect, it } from 'vitest';
import { GET } from './+server';
import { PATCH } from './[entityId]/+server';
import { GET as GET_RELATED } from './related/+server';

const TASK_A = '11111111-1111-4111-8111-111111111111';
const TASK_B = '22222222-2222-4222-8222-222222222222';
const ENTITY = '33333333-3333-4333-8333-333333333333';

type Answer = { data: unknown; error: unknown };

/**
 * A user-scoped client stand-in: records each query and answers per table. A list of answers
 * is used in order, one per query on that table.
 */
function locals(answers: Record<string, Answer | Answer[]>, signedIn = true) {
	const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
	const used: Record<string, number> = {};
	const supabase = {
		from(table: string) {
			const entry = answers[table];
			const index = used[table] ?? 0;
			used[table] = index + 1;
			const answer = (Array.isArray(entry) ? entry[index] : entry) ?? {
				data: [],
				error: null
			};
			const query: Record<string, unknown> = {};
			for (const method of ['select', 'in', 'eq', 'neq', 'is', 'limit', 'order', 'update']) {
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

describe('GET /api/onto/task-entities/related', () => {
	const TASK_C = '44444444-4444-4444-8444-444444444444';
	const related = (query: string, context: ReturnType<typeof locals>) =>
		GET_RELATED({
			url: new URL(`http://x/api/onto/task-entities/related?${query}`),
			locals: context.locals
		} as never);

	it('lists other tasks naming the same person and the numbers they tie to them', async () => {
		const context = locals({
			onto_task_entities: [
				{
					data: [
						{ task_id: TASK_B, updated_at: '2026-10-07T12:00:00Z' },
						{ task_id: TASK_C, updated_at: '2026-10-06T12:00:00Z' }
					],
					error: null
				},
				{
					data: [
						{
							task_id: TASK_B,
							kind: 'phone',
							value: '+14103606761',
							display: '410-360-6761',
							about: 'Casey  Fenske',
							role: 'primary'
						},
						{
							task_id: TASK_B,
							kind: 'phone',
							value: '+14105550000',
							display: '410-555-0000',
							about: 'Angela',
							role: 'primary'
						},
						{
							task_id: TASK_C,
							kind: 'email',
							value: 'me@example.com',
							display: 'me@example.com',
							about: 'Casey Fenske',
							role: 'owner_self'
						}
					],
					error: null
				}
			],
			onto_tasks: {
				data: [
					{ id: TASK_C, title: 'Older', project_id: 'p1', state_key: 'done' },
					{ id: TASK_B, title: 'Newer', project_id: 'p1', state_key: 'todo' }
				],
				error: null
			},
			onto_projects: { data: [{ id: 'p1', name: 'Wayne Strategies' }], error: null }
		});
		const response = await related(`kind=person&key=casey fenske&task_id=${TASK_A}`, context);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.data.tasks.map((task: { id: string }) => task.id)).toEqual([TASK_B, TASK_C]);
		expect(body.data.tasks[0].project_name).toBe('Wayne Strategies');
		expect(body.data.contacts).toEqual([
			{ kind: 'phone', value: '+14103606761', display: '410-360-6761', task_id: TASK_B }
		]);
		expect(body.data.total).toBe(2);
		const exclude = context.calls.find(
			(call) => call.method === 'neq' && call.args[0] === 'task_id'
		);
		expect(exclude?.args).toEqual(['task_id', TASK_A]);
	});

	it('answers empty without further reads when nothing else names it', async () => {
		const context = locals({ onto_task_entities: { data: [], error: null } });
		const response = await related(`kind=org&key=dauntless dogs&task_id=${TASK_A}`, context);
		expect((await response.json()).data).toEqual({ tasks: [], contacts: [], total: 0 });
		expect(context.calls.some((call) => call.table === 'onto_tasks')).toBe(false);
	});

	it('rejects other kinds, bad ids and signed-out requests', async () => {
		expect((await related(`kind=phone&key=x&task_id=${TASK_A}`, locals({}))).status).toBe(400);
		expect((await related('kind=person&key=x&task_id=nope', locals({}))).status).toBe(400);
		expect((await related(`kind=person&key=&task_id=${TASK_A}`, locals({}))).status).toBe(400);
		expect(
			(await related(`kind=person&key=x&task_id=${TASK_A}`, locals({}, false))).status
		).toBe(401);
	});
});
