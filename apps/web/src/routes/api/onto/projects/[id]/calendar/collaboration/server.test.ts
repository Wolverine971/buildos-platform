// apps/web/src/routes/api/onto/projects/[id]/calendar/collaboration/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const { getProjectCalendarCollaborationMock, ProjectCalendarServiceMock } = vi.hoisted(() => ({
	getProjectCalendarCollaborationMock: vi.fn(),
	ProjectCalendarServiceMock: vi.fn().mockImplementation(() => ({
		getProjectCalendarCollaboration: getProjectCalendarCollaborationMock
	}))
}));

vi.mock('$lib/services/project-calendar.service', () => ({
	ProjectCalendarService: ProjectCalendarServiceMock
}));

import { GET } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function createSupabase(options?: { hasAccess?: boolean }) {
	const hasAccess = options?.hasAccess ?? true;

	const maybeSingle = vi.fn().mockResolvedValue({
		data: { id: PROJECT_ID },
		error: null
	});
	const isFn = vi.fn().mockReturnValue({ maybeSingle });
	const eqFn = vi.fn().mockReturnValue({ is: isFn });
	const selectFn = vi.fn().mockReturnValue({ eq: eqFn });

	return {
		rpc: vi.fn().mockImplementation((fn: string) => {
			if (fn === 'ensure_actor_for_user') {
				return Promise.resolve({ data: 'actor-1', error: null });
			}
			if (fn === 'current_actor_has_project_access') {
				return Promise.resolve({ data: hasAccess, error: null });
			}
			throw new Error(`Unexpected RPC ${fn}`);
		}),
		from: vi.fn((table: string) => {
			if (table === 'onto_projects') {
				return { select: selectFn };
			}
			throw new Error(`Unexpected table ${table}`);
		})
	};
}

function createEvent(
	supabase: ReturnType<typeof createSupabase>,
	options?: { user?: boolean }
): RequestEvent {
	const hasUser = options?.user ?? true;
	return {
		params: { id: PROJECT_ID },
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: hasUser ? { id: USER_ID, email: 'editor@example.com' } : null
			})
		}
	} as unknown as RequestEvent;
}

describe('GET /api/onto/projects/[id]/calendar/collaboration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns unauthorized when session is missing', async () => {
		const event = createEvent(createSupabase(), { user: false });
		const response = await GET(event);
		expect(response.status).toBe(401);
	});

	it('returns forbidden when actor has no write access', async () => {
		const supabase = createSupabase({ hasAccess: false });
		const event = createEvent(supabase);

		const response = await GET(event);
		expect(response.status).toBe(403);
		expect(getProjectCalendarCollaborationMock).not.toHaveBeenCalled();
	});

	it('delegates to ProjectCalendarService when authorized', async () => {
		const expectedPayload = {
			success: true,
			data: {
				sync_mode: 'actor_projection',
				total_members: 1,
				mapped_members: 1,
				active_sync_members: 1,
				pending_invite_count: 0,
				pending_invites: [],
				members: []
			}
		};
		getProjectCalendarCollaborationMock.mockResolvedValueOnce(
			new Response(JSON.stringify(expectedPayload), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const supabase = createSupabase({ hasAccess: true });
		const event = createEvent(supabase);

		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toMatchObject(expectedPayload);
		expect(ProjectCalendarServiceMock).toHaveBeenCalledWith(supabase);
		expect(getProjectCalendarCollaborationMock).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
	});
});

