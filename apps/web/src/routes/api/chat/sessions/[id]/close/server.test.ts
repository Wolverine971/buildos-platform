// apps/web/src/routes/api/chat/sessions/[id]/close/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

const mocks = vi.hoisted(() => ({ classify: vi.fn(), snapshot: vi.fn() }));
vi.mock('$lib/server/chat-classification.service', () => ({
	queueChatSessionClassification: mocks.classify
}));
vi.mock('$lib/server/project-context-snapshot.service', () => ({
	queueProjectContextSnapshot: mocks.snapshot
}));

const projectId = '170ad75c-cef6-4a4d-b927-6e4f81775408';
type CloseOptions = {
	activity?: boolean;
	accessible?: boolean;
	context?: string;
	session?: Record<string, unknown>;
	messages?: Array<{ id: string; created_at: string }>;
	payload?: Record<string, unknown>;
	saveError?: { message: string };
};

function closeHarness(options: CloseOptions = {}) {
	const session: Record<string, unknown> = {
		id: 'session',
		user_id: 'user',
		message_count: options.activity === false ? 0 : 1,
		context_type: options.context ?? 'project',
		entity_id: projectId,
		...options.session
	};
	const writes: Record<string, unknown>[] = [];
	const from = vi.fn((table: string) => {
		if (!['chat_sessions', 'chat_messages', 'onto_projects'].includes(table)) {
			throw new Error(`Unexpected table: ${table}`);
		}
		const rows =
			table === 'chat_sessions'
				? [session]
				: table === 'chat_messages'
					? (options.messages ?? []).map((message) => ({
							...message,
							session_id: 'session',
							user_id: 'user'
						}))
					: options.accessible === false
						? []
						: [{ id: projectId }];
		const filters: Array<[string, unknown]> = [];
		let update: Record<string, unknown> | null = null;
		let descending = false;
		const matching = () =>
			rows.filter((row) =>
				filters.every(([key, value]) => (row as Record<string, unknown>)[key] === value)
			);
		const query = {
			select: () => query,
			eq: (key: string, value: unknown) => {
				filters.push([key, value]);
				return query;
			},
			order: (_key: string, order: { ascending: boolean }) => {
				descending = !order.ascending;
				return query;
			},
			limit: async (limit: number) => ({
				data: matching()
					.sort((a, b) => {
						const order = String(
							(a as Record<string, unknown>).created_at
						).localeCompare(String((b as Record<string, unknown>).created_at));
						return descending ? -order : order;
					})
					.slice(0, limit),
				error: null
			}),
			// Reads are snapshots: a later write must not mutate the session object
			// the route already loaded, or a stale-context bug would pass unnoticed.
			single: async () => ({ data: structuredClone(matching()[0] ?? null), error: null }),
			maybeSingle: async () => ({
				data: structuredClone(matching()[0] ?? null),
				error: null
			}),
			update: (payload: Record<string, unknown>) => {
				update = payload;
				return query;
			},
			then: (resolve: (value: unknown) => unknown) => {
				if (update && !options.saveError) {
					for (const row of matching()) Object.assign(row, update);
					writes.push(update);
				}
				return Promise.resolve({ error: options.saveError ?? null }).then(resolve);
			}
		};
		return query;
	});
	return {
		session,
		writes,
		from,
		close: () =>
			POST({
				params: { id: 'session' },
				request: new Request('http://localhost/api/chat/sessions/session/close', {
					method: 'POST',
					body: JSON.stringify(options.payload ?? {})
				}),
				locals: {
					supabase: { from },
					safeGetSession: async () => ({ user: { id: 'user' } })
				}
			} as unknown as Parameters<typeof POST>[0])
	};
}

function close(options: CloseOptions = {}) {
	return closeHarness(options).close();
}

describe('chat-close project freshness', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.classify.mockResolvedValue({ queued: true });
		mocks.snapshot.mockResolvedValue({ queued: true });
	});
	it('queues a forced project refresh even when classification fails', async () => {
		mocks.classify.mockRejectedValue(new Error('classification unavailable'));
		const response = await close();
		expect(response.status).toBe(200);
		expect(mocks.snapshot).toHaveBeenCalledWith({
			projectId,
			userId: 'user',
			force: true,
			reason: 'chat_session_close',
			revisionKey: 'close-session-unknown'
		});
		expect((await response.json()).data.snapshotQueued).toBe(true);
	});
	it.each([{ activity: false }, { accessible: false }, { context: 'global' }])(
		'does not queue an irrelevant or inaccessible project: %j',
		async (options) => {
			await close(options);
			expect(mocks.snapshot).not.toHaveBeenCalled();
		}
	);
	it("cannot synthesize or change another user's session", async () => {
		const h = closeHarness({
			session: { user_id: 'another-user' },
			payload: { entity_id: null }
		});
		expect((await h.close()).status).toBe(404);
		expect(h.writes).toEqual([]);
		expect(mocks.classify).not.toHaveBeenCalled();
		expect(mocks.snapshot).not.toHaveBeenCalled();
	});

	it('does not enqueue work against a context change that failed to save', async () => {
		const h = closeHarness({
			payload: { context_type: 'global', entity_id: null },
			saveError: { message: 'write unavailable' }
		});
		expect((await h.close()).status).toBe(500);
		expect(h.session.entity_id).toBe(projectId);
		expect(mocks.classify).not.toHaveBeenCalled();
		expect(mocks.snapshot).not.toHaveBeenCalled();
	});

	it('uses recent messages when the session activity counters are stale', async () => {
		const response = await close({
			activity: false,
			session: { last_message_at: null },
			messages: [{ id: 'message-new', created_at: '2026-11-17T14:03:00.000Z' }]
		});
		expect(response.status).toBe(200);
		expect(mocks.classify).toHaveBeenCalledWith({ sessionId: 'session', userId: 'user' });
		expect(mocks.snapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				revisionKey: 'close-session-2026-11-17T14:03:00.000Z'
			})
		);
	});

	it('does not repeat synthesis until a message newer than the saved classification arrives', async () => {
		const h = closeHarness({
			session: {
				last_message_at: '2026-11-17T14:00:00.000Z',
				last_classified_at: '2026-11-17T14:00:00.000Z',
				auto_title: 'Garden planning',
				summary: 'Planned the garden.',
				chat_topics: ['gardening'],
				extracted_entities: { libri_candidates: [] }
			}
		});
		const first = await h.close();
		expect((await first.json()).data).toMatchObject({
			classificationQueueAttempted: false,
			snapshotQueued: false
		});
		expect(mocks.classify).not.toHaveBeenCalled();
		expect(mocks.snapshot).not.toHaveBeenCalled();

		h.session.last_message_at = '2026-11-17T14:01:00.000Z';
		const second = await h.close();
		expect((await second.json()).data.classificationQueued).toBe(true);
		expect(mocks.classify).toHaveBeenCalledTimes(1);
		expect(mocks.snapshot).toHaveBeenCalledTimes(1);
	});

	it('saves an explicit project detach before synthesis without refreshing the old project', async () => {
		const h = closeHarness({ payload: { entity_id: null } });
		mocks.classify.mockImplementationOnce(async () => {
			expect(h.session.entity_id).toBeNull();
			return { queued: true };
		});
		const response = await h.close();
		expect(response.status).toBe(200);
		expect(h.writes).toEqual([expect.objectContaining({ entity_id: null })]);
		expect(mocks.classify).toHaveBeenCalledTimes(1);
		expect(mocks.snapshot).not.toHaveBeenCalled();
	});
});
