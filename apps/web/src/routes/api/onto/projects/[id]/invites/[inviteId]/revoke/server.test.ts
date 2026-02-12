// apps/web/src/routes/api/onto/projects/[id]/invites/[inviteId]/revoke/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1')
}));

vi.mock('../../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
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
				user: { id: 'user-1', email: 'owner@example.com' }
			})
		}
	} as unknown as RequestEvent;
};

describe('POST /api/onto/projects/[id]/invites/[inviteId]/revoke', () => {
	it('returns forbidden when admin access is missing', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: false, error: null });

		const response = await POST(event);
		expect(response.status).toBe(403);
	});

	it('revokes a pending invite', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: true, error: null });

		const inviteRow = {
			id: 'invite-1',
			invitee_email: 'invitee@example.com',
			status: 'pending'
		};

		const select = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({ data: inviteRow, error: null })
				})
			})
		});

		const update = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue({
						maybeSingle: vi.fn().mockResolvedValue({
							data: { id: 'invite-1', status: 'revoked' },
							error: null
						})
					})
				})
			})
		});

		const insert = vi.fn().mockResolvedValue({ error: null });

		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_project_invites') {
				return { select, update };
			}
			if (table === 'onto_project_logs') {
				return { insert };
			}
			return {};
		});

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(update).toHaveBeenCalledWith({ status: 'revoked' });
	});

	it('returns accepted when invite is accepted during concurrent revoke', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: true, error: null });

		const inviteSelectMaybeSingle = vi
			.fn()
			.mockResolvedValueOnce({
				data: {
					id: 'invite-1',
					invitee_email: 'invitee@example.com',
					status: 'pending'
				},
				error: null
			})
			.mockResolvedValueOnce({
				data: { status: 'accepted' },
				error: null
			});

		const select = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					maybeSingle: inviteSelectMaybeSingle
				})
			})
		});

		const update = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
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
				return { select, update };
			}
			return {};
		});

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('already been accepted');
	});
});
