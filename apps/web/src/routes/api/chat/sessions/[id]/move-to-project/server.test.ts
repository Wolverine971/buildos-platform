// apps/web/src/routes/api/chat/sessions/[id]/move-to-project/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

const mocks = vi.hoisted(() => ({ access: vi.fn(), activeRuns: [] as Array<{ id: string }> }));
vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: mocks.access
}));
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: () => ({
		from: () => {
			const query = {
				select: vi.fn(),
				eq: vi.fn(),
				in: vi.fn(),
				limit: vi.fn(async () => ({ data: mocks.activeRuns, error: null }))
			};
			for (const name of ['select', 'eq', 'in'] as const) query[name].mockReturnValue(query);
			return query;
		}
	})
}));

const sessionId = '0f2d8a3e-6b1c-4d5e-9f7a-1b2c3d4e5f60';
const projectId = '170ad75c-cef6-4a4d-b927-6e4f81775408';

function move(session: { context_type: string; entity_id: string | null } | null) {
	const update = vi.fn();
	const from = vi.fn(() => {
		const query = {
			select: vi.fn(),
			update: vi.fn((values: unknown) => {
				update(values);
				return query;
			}),
			eq: vi.fn(),
			maybeSingle: vi.fn(async () => ({
				data: session ? { id: sessionId, ...session } : null,
				error: null
			})),
			then: (resolve: (value: unknown) => void) => resolve({ error: null })
		};
		for (const name of ['select', 'eq'] as const) query[name].mockReturnValue(query);
		return query;
	});
	const response = POST({
		params: { id: sessionId },
		request: new Request(`http://localhost/api/chat/sessions/${sessionId}/move-to-project`, {
			method: 'POST',
			body: JSON.stringify({ project_id: projectId })
		}),
		locals: { supabase: { from }, safeGetSession: async () => ({ user: { id: 'user' } }) }
	} as unknown as Parameters<typeof POST>[0]);
	return { response, update };
}

describe('move a workspace chat into a project', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.activeRuns = [];
		mocks.access.mockResolvedValue({ ok: true, projectId, userId: 'user', actorId: 'a' });
	});

	it('moves a global chat into the project, keeping the session', async () => {
		const { response, update } = move({ context_type: 'global', entity_id: null });
		expect((await response).status).toBe(200);
		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({ context_type: 'project', entity_id: projectId })
		);
	});

	it('refuses without project access', async () => {
		mocks.access.mockResolvedValue({
			ok: false,
			response: new Response(null, { status: 403 })
		});
		const { response, update } = move({ context_type: 'global', entity_id: null });
		expect((await response).status).toBe(403);
		expect(update).not.toHaveBeenCalled();
	});

	it('leaves project and brief chats alone', async () => {
		const { response, update } = move({ context_type: 'daily_brief', entity_id: 'b' });
		expect((await response).status).toBe(409);
		expect(update).not.toHaveBeenCalled();
	});

	it('waits for a running reply to finish', async () => {
		mocks.activeRuns = [{ id: 'run' }];
		const { response, update } = move({ context_type: 'global', entity_id: null });
		expect((await response).status).toBe(409);
		expect(update).not.toHaveBeenCalled();
	});

	it('is a no-op when the chat is already in that project', async () => {
		const { response, update } = move({ context_type: 'project', entity_id: projectId });
		expect((await response).status).toBe(200);
		expect(update).not.toHaveBeenCalled();
	});
});
