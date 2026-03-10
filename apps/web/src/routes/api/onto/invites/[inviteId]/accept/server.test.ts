// apps/web/src/routes/api/onto/invites/[inviteId]/accept/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1')
}));

vi.mock('../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { POST } from './+server';

function createEvent(overrides?: Partial<RequestEvent>): RequestEvent {
	const supabase = {
		rpc: vi.fn(),
		from: vi.fn()
	};

	return {
		params: { inviteId: 'invite-1' },
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: {
					id: 'user-1',
					email: 'invitee@example.com',
					name: 'Invitee'
				}
			})
		},
		...overrides
	} as unknown as RequestEvent;
}

function createProjectTable() {
	return {
		select: vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				maybeSingle: vi.fn().mockResolvedValue({
					data: { id: 'project-1', name: 'Project Alpha' },
					error: null
				})
			})
		})
	};
}

function createMembersTable() {
	return {
		select: vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					is: vi.fn().mockResolvedValue({
						data: [],
						error: null
					})
				})
			})
		})
	};
}

function createNotificationSubscriptionsTable() {
	return {
		upsert: vi.fn().mockResolvedValue({ error: null }),
		select: vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				in: vi.fn().mockResolvedValue({
					data: [],
					error: null
				})
			})
		})
	};
}

describe('POST /api/onto/invites/[inviteId]/accept', () => {
	it('returns unauthorized when there is no user session', async () => {
		const event = createEvent({
			locals: {
				supabase: { rpc: vi.fn(), from: vi.fn() },
				safeGetSession: vi.fn().mockResolvedValue({ user: null })
			}
		} as Partial<RequestEvent>);

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(401);
		expect(payload.error).toContain('Authentication');
	});

	it('returns bad request when invite id is missing', async () => {
		const event = createEvent({ params: { inviteId: '   ' } } as Partial<RequestEvent>);

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('Invite ID');
	});

	it('uses pending-invite context so inviter notifications do not depend on direct invite reads', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;
		const tablesUsed: string[] = [];
		const projectTable = createProjectTable();
		const membersTable = createMembersTable();
		const notificationSubscriptionsTable = createNotificationSubscriptionsTable();

		supabase.rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
			if (fn === 'get_pending_project_invite_context') {
				return Promise.resolve({
					data: {
						invite_id: 'invite-1',
						project_id: 'project-1',
						project_name: 'Project Alpha',
						invited_by_user_id: 'inviter-user-1'
					},
					error: null
				});
			}

			if (fn === 'accept_project_invite_by_id') {
				return Promise.resolve({
					data: {
						project_id: 'project-1',
						role_key: 'viewer',
						access: 'read'
					},
					error: null
				});
			}

			if (fn === 'get_project_notification_settings') {
				return Promise.resolve({
					data: [{ effective_enabled: false }],
					error: null
				});
			}

			if (fn === 'emit_notification_event') {
				return Promise.resolve({ data: null, error: null });
			}

			throw new Error(`Unexpected RPC: ${fn} ${JSON.stringify(args)}`);
		});

		supabase.from.mockImplementation((table: string) => {
			tablesUsed.push(table);
			if (table === 'onto_projects') return projectTable;
			if (table === 'onto_project_members') return membersTable;
			if (table === 'notification_subscriptions') return notificationSubscriptionsTable;
			throw new Error(`Unexpected table: ${table}`);
		});

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data).toMatchObject({
			projectId: 'project-1',
			role_key: 'viewer',
			access: 'read'
		});
		expect(supabase.rpc).toHaveBeenCalledWith('get_pending_project_invite_context', {
			p_invite_id: 'invite-1'
		});
		expect(supabase.rpc).toHaveBeenCalledWith('accept_project_invite_by_id', {
			p_invite_id: 'invite-1'
		});
		expect(supabase.rpc).toHaveBeenCalledWith(
			'emit_notification_event',
			expect.objectContaining({
				p_target_user_id: 'inviter-user-1',
				p_event_type: 'project.invite.accepted'
			})
		);
		expect(tablesUsed).not.toContain('onto_project_invites');
		expect(tablesUsed).not.toContain('onto_project_logs');
	});

	it('returns a 400 when invite acceptance fails', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockImplementation((fn: string) => {
			if (fn === 'get_pending_project_invite_context') {
				return Promise.resolve({ data: null, error: { message: 'Invite not found' } });
			}

			if (fn === 'accept_project_invite_by_id') {
				return Promise.resolve({ data: null, error: { message: 'Invite not found' } });
			}

			throw new Error(`Unexpected RPC: ${fn}`);
		});

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('Invite not found');
	});
});
