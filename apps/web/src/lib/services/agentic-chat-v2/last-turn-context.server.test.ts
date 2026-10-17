// apps/web/src/lib/services/agentic-chat-v2/last-turn-context.server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { LAST_TURN_CONTEXT_BUDGET_CHARS } from './last-turn-context';
import { loadSessionLastTurnContext } from './last-turn-context.server';

const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';

/** Records the query and answers maybeSingle with the given result. */
function client(result: { data: unknown; error: unknown } | Error) {
	const calls: Array<[string, ...unknown[]]> = [];
	const builder: Record<string, unknown> = {};
	for (const method of ['select', 'eq', 'order', 'limit']) {
		builder[method] = (...args: unknown[]) => {
			calls.push([method, ...args]);
			return builder;
		};
	}
	builder.maybeSingle = async () => {
		if (result instanceof Error) throw result;
		return result;
	};
	return {
		calls,
		client: {
			from: vi.fn((table: string) => {
				calls.push(['from', table]);
				return builder;
			})
		} as never
	};
}

const load = (fake: ReturnType<typeof client>) =>
	loadSessionLastTurnContext({ client: fake.client, userId: USER_ID, sessionId: SESSION_ID });

describe('loadSessionLastTurnContext', () => {
	it('reads the newest continuity event for this user and session', async () => {
		const context = {
			summary: 'Reviewed the launch plan',
			entities: { projects: [{ id: SESSION_ID, name: 'Launch' }] },
			context_type: 'global',
			data_accessed: ['list_onto_projects'],
			timestamp: '2026-10-17T04:00:00.000Z'
		};
		const fake = client({
			data: { payload: { type: 'last_turn_context', context } },
			error: null
		});
		await expect(load(fake)).resolves.toEqual(context);
		expect(fake.calls).toEqual([
			['from', 'chat_turn_events'],
			['select', 'payload'],
			['eq', 'session_id', SESSION_ID],
			['eq', 'user_id', USER_ID],
			['eq', 'event_type', 'last_turn_context'],
			['order', 'created_at', { ascending: false }],
			['limit', 1]
		]);
	});

	it('bounds an oversized packet written before the per-kind cap', async () => {
		const tasks = Array.from({ length: 200 }, (_, i) => ({
			id: `da000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
			name: `Task ${i}`,
			description: 'D'.repeat(140)
		}));
		const fake = client({
			data: {
				payload: {
					context: {
						summary: 'Big inventory',
						entities: { tasks },
						context_type: 'global',
						data_accessed: []
					}
				}
			},
			error: null
		});
		const result = await load(fake);
		expect(JSON.stringify(result).length).toBeLessThanOrEqual(LAST_TURN_CONTEXT_BUDGET_CHARS);
		expect(result?.summary).toBe('Big inventory');
	});

	it('returns null when the session has no continuity or the payload is malformed', async () => {
		await expect(load(client({ data: null, error: null }))).resolves.toBeNull();
		await expect(
			load(client({ data: { payload: { context: 'not an object' } }, error: null }))
		).resolves.toBeNull();
		await expect(load(client({ data: { payload: null }, error: null }))).resolves.toBeNull();
	});

	it('never blocks a turn: read errors and throws return null', async () => {
		await expect(
			load(client({ data: null, error: { message: 'timeout' } }))
		).resolves.toBeNull();
		await expect(load(client(new Error('network down')))).resolves.toBeNull();
	});
});
