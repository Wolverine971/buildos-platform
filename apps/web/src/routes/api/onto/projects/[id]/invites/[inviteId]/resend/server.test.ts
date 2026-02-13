// apps/web/src/routes/api/onto/projects/[id]/invites/[inviteId]/resend/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const sendEmailMock = vi.fn();

vi.mock('$lib/services/email-service', () => ({
	EmailService: vi.fn().mockImplementation(() => ({
		sendEmail: sendEmailMock
	}))
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1')
}));

vi.mock('../../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

vi.mock('$env/static/public', () => ({
	PUBLIC_APP_URL: 'http://localhost:5173'
}));

vi.mock('$app/environment', () => ({
	dev: true
}));

import { POST } from './+server';

const createEvent = (): RequestEvent => {
	const supabase = {
		rpc: vi.fn(),
		from: vi.fn()
	};

	return {
		params: { id: 'project-1', inviteId: 'invite-1' },
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: 'user-1', email: 'owner@example.com', name: 'Owner' }
			})
		}
	} as unknown as RequestEvent;
};

beforeEach(() => {
	sendEmailMock.mockReset();
});

describe('POST /api/onto/projects/[id]/invites/[inviteId]/resend', () => {
	it('returns bad request when invite already accepted', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: true, error: null });

		const inviteRow = {
			id: 'invite-1',
			invitee_email: 'invitee@example.com',
			role_key: 'viewer',
			access: 'read',
			status: 'accepted'
		};

		const select = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({ data: inviteRow, error: null })
				})
			})
		});

		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_project_invites') {
				return { select };
			}
			return {};
		});

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('already been accepted');
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_access', {
			p_project_id: 'project-1',
			p_required_access: 'write'
		});
	});

	it('resends invite and emails the recipient', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: true, error: null });

		const inviteRow = {
			id: 'invite-1',
			invitee_email: 'invitee@example.com',
			role_key: 'editor',
			access: 'write',
			status: 'pending'
		};

		const selectInvites = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({ data: inviteRow, error: null })
				})
			})
		});

		const updateInvites = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				in: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue({
						maybeSingle: vi.fn().mockResolvedValue({
							data: { id: 'invite-1', status: 'pending' },
							error: null
						})
					})
				})
			})
		});

		const selectProject = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				is: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({
						data: { id: 'project-1', name: 'Project Alpha' },
						error: null
					})
				})
			})
		});

		const insertLog = vi.fn().mockResolvedValue({ error: null });

		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_project_invites') {
				return { select: selectInvites, update: updateInvites };
			}
			if (table === 'onto_projects') {
				return { select: selectProject };
			}
			if (table === 'onto_project_logs') {
				return { insert: insertLog };
			}
			return {};
		});

		sendEmailMock.mockResolvedValue({ success: true });

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(updateInvites).toHaveBeenCalled();
		expect(sendEmailMock).toHaveBeenCalled();

		const emailArgs = sendEmailMock.mock.calls[0][0];
		expect(emailArgs.to).toBe('invitee@example.com');
	});

	it('returns accepted when invite is accepted during concurrent resend', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: true, error: null });

		const inviteSelectMaybeSingle = vi
			.fn()
			.mockResolvedValueOnce({
				data: {
					id: 'invite-1',
					invitee_email: 'invitee@example.com',
					role_key: 'editor',
					access: 'write',
					status: 'pending'
				},
				error: null
			})
			.mockResolvedValueOnce({
				data: { status: 'accepted' },
				error: null
			});

		const selectInvites = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					maybeSingle: inviteSelectMaybeSingle
				})
			})
		});

		const updateInvites = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				in: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue({
						maybeSingle: vi.fn().mockResolvedValue({
							data: null,
							error: null
						})
					})
				})
			})
		});

		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_project_invites') {
				return { select: selectInvites, update: updateInvites };
			}
			return {};
		});

		sendEmailMock.mockResolvedValue({ success: true });

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('already been accepted');
		expect(sendEmailMock).not.toHaveBeenCalled();
	});
});
