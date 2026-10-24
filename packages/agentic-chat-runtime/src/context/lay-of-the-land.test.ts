// packages/agentic-chat-runtime/src/context/lay-of-the-land.test.ts
import { describe, expect, it, vi } from 'vitest';
import { loadGlobalLayOfTheLand, toRecentConversation } from './lay-of-the-land';

describe('toRecentConversation', () => {
	const base = {
		id: 's1',
		title: null,
		auto_title: null,
		summary: null,
		context_type: 'project',
		entity_id: 'p1',
		last_message_at: '2026-10-20T00:56:00Z',
		updated_at: '2026-10-20T00:56:00Z'
	};

	it('uses a real title and the summary’s first sentence', () => {
		expect(
			toRecentConversation({
				...base,
				auto_title: 'Daily schedule overview',
				summary:
					'The user asked what they need to do today. The assistant listed their calendar events.'
			})
		).toMatchObject({
			title: 'Daily schedule overview',
			topic: 'The user asked what they need to do today.',
			topic_source: 'summary'
		});
	});

	it('falls back to the user’s own opening message and drops placeholder titles', () => {
		expect(
			toRecentConversation({
				...base,
				title: 'New Chat',
				chat_messages: [{ content: '  Okay, so what all is overdue\nover here?  ' }]
			})
		).toMatchObject({
			title: null,
			topic: 'Okay, so what all is overdue over here?',
			topic_source: 'first_message'
		});
	});

	it('skips a chat with nothing to say about it', () => {
		expect(toRecentConversation({ ...base, chat_messages: [] })).toBeNull();
	});
});

type Call = { table: string; filters: Array<[string, string, unknown]> };

/** Records each query and answers by table. */
function fakeSupabase(answers: Record<string, { data: unknown; count?: number; error?: unknown }>) {
	const calls: Call[] = [];
	const from = vi.fn((table: string) => {
		const call: Call = { table, filters: [] };
		calls.push(call);
		const builder: Record<string, unknown> = {};
		const chain =
			(name: string) =>
			(...args: unknown[]) => {
				call.filters.push([name, String(args[0]), args[1]]);
				return builder;
			};
		for (const name of ['select', 'eq', 'neq', 'gte', 'is', 'order', 'limit']) {
			builder[name] = chain(name);
		}
		builder.then = (resolve: (value: unknown) => unknown) => {
			const answer = answers[table] ?? { data: [] };
			return resolve({
				data: answer.data,
				count: answer.count ?? null,
				error: answer.error ?? null
			});
		};
		return builder;
	});
	return { client: { from } as never, calls };
}

describe('loadGlobalLayOfTheLand', () => {
	it('reads recent chats and the Workspace shelf', async () => {
		const { client, calls } = fakeSupabase({
			chat_sessions: {
				data: [
					{
						id: 's1',
						title: null,
						auto_title: '9takes project status',
						summary: null,
						context_type: 'project',
						entity_id: 'p9',
						last_message_at: '2026-10-18T21:22:00Z',
						updated_at: '2026-10-18T21:22:00Z',
						chat_messages: [{ content: 'ok what do we need to do here?' }]
					}
				]
			},
			onto_documents: {
				data: [
					{
						id: 'd1',
						title: 'AI Taste Buds pricing',
						type_key: 'document.note',
						created_at: '2026-10-21T00:00:00Z'
					}
				],
				count: 1
			},
			onto_tasks: {
				data: [
					{
						id: 't1',
						title: 'Call back about the gun action',
						created_at: '2026-10-22T00:00:00Z',
						due_at: '2026-10-24T00:00:00Z'
					}
				],
				count: 3
			},
			workspace_suggestions: {
				data: [
					{
						id: 'g1',
						kind: 'graduate',
						proposed_name: 'Taste Buds',
						target_project_id: null,
						reason: 'Three notes about one product idea.',
						items: [{}, {}, {}]
					},
					{ id: 'x', kind: 'mystery', items: [] }
				]
			}
		});
		const result = await loadGlobalLayOfTheLand({
			supabase: client,
			userId: 'u1',
			workspaceId: Promise.resolve('ws-1'),
			now: new Date('2026-10-23T20:00:00Z')
		});
		expect(result.recent_conversations).toEqual([
			expect.objectContaining({ session_id: 's1', title: '9takes project status' })
		]);
		expect(result.workspace_shelf).toEqual({
			loose_total: 4,
			items: [
				expect.objectContaining({
					entity: 'task',
					id: 't1',
					due_at: '2026-10-24T00:00:00Z'
				}),
				expect.objectContaining({ entity: 'document', kind: 'note', id: 'd1' })
			],
			open_suggestions: [
				{
					id: 'g1',
					kind: 'graduate',
					proposed_name: 'Taste Buds',
					target_project_id: null,
					item_count: 3,
					reason: 'Three notes about one product idea.'
				}
			]
		});
		const sessions = calls.find((call) => call.table === 'chat_sessions')!;
		expect(sessions.filters).toContainEqual(['eq', 'user_id', 'u1']);
		expect(sessions.filters).toContainEqual(['eq', 'chat_messages.role', 'user']);
	});

	it('degrades piece by piece and reports what failed', async () => {
		const onError = vi.fn();
		const { client } = fakeSupabase({
			chat_sessions: { data: null, error: new Error('boom') }
		});
		const result = await loadGlobalLayOfTheLand({
			supabase: client,
			userId: 'u1',
			workspaceId: Promise.resolve(null),
			onError
		});
		expect(result).toEqual({ recent_conversations: [], workspace_shelf: null });
		expect(onError).toHaveBeenCalledWith(
			'query.global.recent_conversations',
			expect.any(Error)
		);
	});
});
