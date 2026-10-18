// apps/web/src/routes/api/chat/sessions/[id]/pending-change/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { DELETE } from './+server';

const SESSION = 'f6b4c208-0912-4ca6-a0c9-fbe8b2b19cf0';
const PROJECT = '445dd429-db93-4878-90a9-b3ab1627a9f2';
const DOC = '1cad2618-3188-43ac-98ff-e715a8a8013d';
const KEY = '6b335d49-378a-4817-9e59-9a2ec182c1e4@2026-09-23T19:41:33.910Z';

const PENDING = {
	version: 1,
	contract: {
		version: 1,
		source: 'declared',
		outcomes: [
			{
				id: 'implicit_8',
				action: 'update',
				entityKind: 'document',
				targetIds: [DOC],
				requiredFields: ['edits'],
				minimumSuccessfulEffects: 1
			}
		]
	},
	contextType: 'project',
	projectId: PROJECT,
	originatingTurnRunId: '6b335d49-378a-4817-9e59-9a2ec182c1e4',
	createdAt: '2026-09-23T19:41:33.910Z',
	finishedReason: 'mutation_unfulfilled'
};

function harness(
	options: {
		pending?: unknown;
		activeTurns?: unknown[];
		mergeError?: unknown;
	} = {}
) {
	const sessionRow = {
		id: SESSION,
		context_type: 'project',
		entity_id: PROJECT,
		agent_metadata: {
			fastchat_pending_turn_contract:
				options.pending === undefined ? PENDING : options.pending,
			focus: null
		}
	};
	const sessionQuery = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockResolvedValue({ data: sessionRow, error: null })
	};
	const turnQuery = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue({ data: options.activeTurns ?? [], error: null })
	};
	const titleQuery = {
		select: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue({
			data: [{ id: DOC, title: 'Chapter 3 outline', project_id: PROJECT }],
			error: null
		})
	};
	const supabase = {
		from: vi.fn((table: string) => {
			if (table === 'chat_sessions') return sessionQuery;
			if (table === 'chat_turn_runs') return turnQuery;
			return titleQuery;
		}),
		rpc: vi.fn().mockResolvedValue({ data: {}, error: options.mergeError ?? null })
	};
	const call = (key: string | null = KEY) =>
		DELETE({
			params: { id: SESSION },
			url: new URL(
				`http://localhost/api/chat/sessions/${SESSION}/pending-change${key ? `?key=${encodeURIComponent(key)}` : ''}`
			),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as never);
	return { supabase, sessionQuery, turnQuery, call };
}

describe('DELETE /api/chat/sessions/[id]/pending-change', () => {
	it('clears exactly the shown commission with one atomic metadata merge', async () => {
		const { supabase, sessionQuery, turnQuery, call } = harness();
		const response = await call();

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			success: true,
			data: { dismissed: true, pendingChange: null }
		});
		expect(sessionQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
		expect(turnQuery.in).toHaveBeenCalledWith('status', ['queued', 'running']);
		expect(supabase.rpc).toHaveBeenCalledWith('merge_chat_session_agent_metadata', {
			p_session_id: SESSION,
			p_patch: { fastchat_pending_turn_contract: null }
		});
	});

	it('refuses a stale key and returns the commission now on the session', async () => {
		const { supabase, call } = harness();
		const response = await call('older-turn@2026-09-20T00:00:00.000Z');

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			success: false,
			details: {
				pendingChange: { key: KEY, items: ['Update doc "Chapter 3 outline"'] }
			}
		});
		expect(supabase.rpc).not.toHaveBeenCalled();
	});

	it('waits for a running reply, which already carries the commission', async () => {
		const { supabase, call } = harness({ activeTurns: [{ id: 'turn-running' }] });
		const response = await call();

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			error: 'Wait for the current reply to finish, then dismiss.'
		});
		expect(supabase.rpc).not.toHaveBeenCalled();
	});

	it('is a no-op when nothing is owed, and requires a key', async () => {
		const empty = harness({ pending: null });
		const response = await empty.call();
		await expect(response.json()).resolves.toMatchObject({
			data: { dismissed: false, pendingChange: null }
		});
		expect(empty.supabase.rpc).not.toHaveBeenCalled();

		expect((await harness().call(null)).status).toBe(400);
	});
});
