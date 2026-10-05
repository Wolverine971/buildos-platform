// apps/web/src/routes/api/account/settings/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	createSupabaseServerMock,
	scheduleAccountDeletionMock,
	cancelSubscriptionsMock,
	notifyOwnershipReceivedMock,
	notifyMembersProjectDeletedMock
} = vi.hoisted(() => ({
	createSupabaseServerMock: vi.fn(),
	scheduleAccountDeletionMock: vi.fn(),
	cancelSubscriptionsMock: vi.fn(),
	notifyOwnershipReceivedMock: vi.fn(),
	notifyMembersProjectDeletedMock: vi.fn()
}));

vi.mock('$lib/server/project-sharing-notifications', () => ({
	notifyOwnershipReceived: notifyOwnershipReceivedMock,
	notifyMembersProjectDeleted: notifyMembersProjectDeletedMock
}));

vi.mock('$lib/supabase/index', () => ({
	createSupabaseServer: createSupabaseServerMock
}));

vi.mock('$lib/server/account-deletion', () => ({
	scheduleAccountDeletion: scheduleAccountDeletionMock,
	cancelDeletionSubscriptions: cancelSubscriptionsMock
}));

import { DELETE } from './+server';

describe('DELETE /api/account/settings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('schedules the purge, starts subscription cancellation, and signs out', async () => {
		const signOut = vi.fn().mockResolvedValue({ error: null });
		createSupabaseServerMock.mockReturnValue({
			auth: { signOut },
			rpc: vi.fn().mockResolvedValue({ data: [], error: null })
		});
		scheduleAccountDeletionMock.mockResolvedValue({
			requestId: 'request-1',
			requestedAt: '2026-07-16T12:00:00.000Z',
			scheduledFor: '2026-08-15T11:00:00.000Z'
		});
		cancelSubscriptionsMock.mockResolvedValue({ completed: true, subscriptionCount: 1 });

		const response = await DELETE({
			request: new Request('http://localhost', { method: 'DELETE' }),
			cookies: {},
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({
					user: { id: 'user-1', email: 'user@example.com' }
				})
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.scheduledFor).toBe('2026-08-15T11:00:00.000Z');
		expect(scheduleAccountDeletionMock).toHaveBeenCalledWith('user-1');
		expect(cancelSubscriptionsMock).toHaveBeenCalledWith(
			{
				id: 'request-1',
				user_id: 'user-1',
				billing_subscription_ids: []
			},
			{ immediately: false }
		);
		expect(signOut).toHaveBeenCalledOnce();
	});

	it('requires an authenticated user', async () => {
		const response = await DELETE({
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: null })
			}
		} as any);

		expect(response.status).toBe(401);
		expect(scheduleAccountDeletionMock).not.toHaveBeenCalled();
	});

	describe('shared projects', () => {
		const sharedProjects = [
			{
				project_id: 'p1',
				project_name: 'Apollo',
				members: [{ member_id: 'm1', actor_id: 'a1' }]
			},
			{ project_id: 'p2', project_name: 'Gemini', members: [] }
		];

		const callDelete = (supabase: any, body?: unknown) => {
			createSupabaseServerMock.mockReturnValue(supabase);
			return DELETE({
				request: new Request('http://localhost', {
					method: 'DELETE',
					body: body === undefined ? undefined : JSON.stringify(body)
				}),
				cookies: {},
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({
						user: { id: 'user-1', email: 'user@example.com' }
					})
				}
			} as any);
		};

		const makeSupabase = (rpcImpl?: (name: string, args: any) => any) => ({
			auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
			rpc: vi.fn(async (name: string, args: any) => {
				if (name === 'list_my_shared_owned_onto_projects') {
					return { data: sharedProjects, error: null };
				}
				return rpcImpl ? rpcImpl(name, args) : { data: {}, error: null };
			})
		});

		beforeEach(() => {
			scheduleAccountDeletionMock.mockResolvedValue({
				requestId: 'request-1',
				requestedAt: '2026-07-16T12:00:00.000Z',
				scheduledFor: '2026-08-15T11:00:00.000Z'
			});
			cancelSubscriptionsMock.mockResolvedValue({ completed: true });
		});

		it('returns 409 with the projects when a decision is missing', async () => {
			const supabase = makeSupabase();
			const response = await callDelete(supabase, {
				shared_projects: [{ project_id: 'p2', action: 'delete' }]
			});
			const payload = await response.json();

			expect(response.status).toBe(409);
			expect(payload.code).toBe('shared_projects_decision_required');
			expect(JSON.stringify(payload)).toContain('Apollo');
			expect(supabase.rpc).toHaveBeenCalledTimes(1);
			expect(scheduleAccountDeletionMock).not.toHaveBeenCalled();
		});

		it('returns 409 when a handoff member is not a listed candidate', async () => {
			const response = await callDelete(makeSupabase(), {
				shared_projects: [
					{ project_id: 'p1', action: 'handoff', member_id: 'someone-else' },
					{ project_id: 'p2', action: 'delete' }
				]
			});

			expect(response.status).toBe(409);
			expect(scheduleAccountDeletionMock).not.toHaveBeenCalled();
		});

		it('applies handoff and delete decisions, then schedules deletion', async () => {
			const supabase = makeSupabase((name) =>
				name === 'transfer_onto_project_ownership'
					? { data: { new_owner_user_id: 'user-2' }, error: null }
					: { data: null, error: null }
			);
			const response = await callDelete(supabase, {
				shared_projects: [
					{ project_id: 'p1', action: 'handoff', member_id: 'm1' },
					{ project_id: 'p2', action: 'delete' }
				]
			});

			expect(response.status).toBe(200);
			expect(supabase.rpc).toHaveBeenCalledWith('transfer_onto_project_ownership', {
				p_project_id: 'p1',
				p_new_owner_member_id: 'm1',
				p_leave: true
			});
			expect(supabase.rpc).toHaveBeenCalledWith('soft_delete_onto_project', {
				p_project_id: 'p2'
			});
			expect(notifyOwnershipReceivedMock).toHaveBeenCalledWith(
				expect.objectContaining({ projectId: 'p1', newOwnerUserId: 'user-2' })
			);
			expect(notifyMembersProjectDeletedMock).toHaveBeenCalledWith(
				expect.objectContaining({
					projectId: 'p2',
					reason: 'account_deleted',
					restorableUntil: null
				})
			);
			expect(scheduleAccountDeletionMock).toHaveBeenCalledWith('user-1');
		});

		it('returns 500 and does not schedule when an RPC fails', async () => {
			const supabase = makeSupabase((name) =>
				name === 'soft_delete_onto_project'
					? { data: null, error: { message: 'boom' } }
					: { data: { new_owner_user_id: 'user-2' }, error: null }
			);
			const response = await callDelete(supabase, {
				shared_projects: [
					{ project_id: 'p1', action: 'handoff', member_id: 'm1' },
					{ project_id: 'p2', action: 'delete' }
				]
			});
			const payload = await response.json();

			expect(response.status).toBe(500);
			expect(payload.code).toBe('shared_project_update_failed');
			expect(payload.error).toContain('Gemini');
			expect(scheduleAccountDeletionMock).not.toHaveBeenCalled();
		});
	});
});
