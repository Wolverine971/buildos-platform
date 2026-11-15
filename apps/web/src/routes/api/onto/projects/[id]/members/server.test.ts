// apps/web/src/routes/api/onto/projects/[id]/members/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from './$types';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-current')
}));

vi.mock('../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

const { createAdminSupabaseClientMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn()
}));
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

import { GET } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

const createEvent = (): RequestEvent => {
	const supabase = {
		rpc: vi.fn(),
		from: vi.fn()
	};

	return {
		params: { id: PROJECT_ID },
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: 'user-1', email: 'member@example.com' }
			})
		}
	} as unknown as RequestEvent;
};

describe('GET /api/onto/projects/[id]/members', () => {
	it('returns active members sorted by role and created_at', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: true, error: null });

		const rows = [
			{
				id: 'm-viewer',
				project_id: PROJECT_ID,
				actor_id: 'actor-viewer',
				role_key: 'viewer',
				access: 'read',
				role_name: 'Observer',
				role_description: 'Observes project progress.',
				created_at: '2026-01-01T00:00:00.000Z'
			},
			{
				id: 'm-owner-late',
				project_id: PROJECT_ID,
				actor_id: 'actor-owner-2',
				role_key: 'owner',
				access: 'admin',
				role_name: 'Project Owner',
				role_description: 'Owns direction.',
				created_at: '2026-01-03T00:00:00.000Z'
			},
			{
				id: 'm-editor-late',
				project_id: PROJECT_ID,
				actor_id: 'actor-editor-2',
				role_key: 'editor',
				access: 'write',
				role_name: 'Collaborator',
				role_description: 'Contributes delivery.',
				created_at: '2026-01-02T00:00:00.000Z'
			},
			{
				id: 'm-owner-early',
				project_id: PROJECT_ID,
				actor_id: 'actor-owner-1',
				role_key: 'owner',
				access: 'admin',
				role_name: 'Project Owner',
				role_description: 'Owns decisions.',
				created_at: '2026-01-01T00:00:00.000Z'
			},
			{
				id: 'm-editor-early',
				project_id: PROJECT_ID,
				actor_id: 'actor-editor-1',
				role_key: 'editor',
				access: 'write',
				role_name: 'Collaborator',
				role_description: 'Executes workstreams.',
				created_at: '2026-01-01T12:00:00.000Z'
			}
		];

		const select = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				is: vi.fn().mockReturnValue({
					order: vi.fn().mockResolvedValue({ data: rows, error: null })
				})
			})
		});

		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_projects') {
				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							is: vi.fn().mockReturnValue({
								maybeSingle: vi.fn().mockResolvedValue({
									data: { id: PROJECT_ID },
									error: null
								})
							})
						})
					})
				};
			}
			if (table === 'onto_project_members') {
				return { select };
			}
			return {};
		});

		const usersIn = vi.fn().mockResolvedValue({ data: [], error: null });
		createAdminSupabaseClientMock.mockReturnValue({
			from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ in: usersIn }) })
		});

		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.actorId).toBe('actor-current');
		expect(payload.data.members.map((m: { id: string }) => m.id)).toEqual([
			'm-owner-early',
			'm-owner-late',
			'm-editor-early',
			'm-editor-late',
			'm-viewer'
		]);
		expect(payload.data.members[0]).toMatchObject({
			role_name: 'Project Owner',
			role_description: 'Owns decisions.'
		});
		// Each member carries what their agents may do here (owner-editable in the share modal).
		expect(select.mock.calls[0]?.[0]).toContain('agent_access');
		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: PROJECT_ID,
			p_required_access: 'read'
		});
	});

	it('rejects authenticated public-only readers', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: false, error: null });
		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_projects') {
				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							is: vi.fn().mockReturnValue({
								maybeSingle: vi.fn().mockResolvedValue({
									data: { id: PROJECT_ID },
									error: null
								})
							})
						})
					})
				};
			}
			return {};
		});

		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(403);
		expect(payload.error).toBe('Access denied');
		expect(supabase.from).not.toHaveBeenCalledWith('onto_project_members');
	});

	describe('privacy: emails stay with the owner', () => {
		const rows = [
			{
				id: 'm-owner',
				actor_id: 'actor-owner',
				role_key: 'owner',
				access: 'admin',
				created_at: '2026-01-01T00:00:00.000Z',
				actor: {
					id: 'actor-owner',
					user_id: 'user-owner',
					name: 'DJ'
				}
			},
			{
				id: 'm-current',
				actor_id: 'actor-current',
				role_key: 'editor',
				access: 'write',
				created_at: '2026-01-02T00:00:00.000Z',
				actor: {
					id: 'actor-current',
					user_id: 'user-1',
					name: 'Ian'
				}
			},
			{
				id: 'm-other',
				actor_id: 'actor-other',
				role_key: 'editor',
				access: 'write',
				created_at: '2026-01-03T00:00:00.000Z',
				actor: { id: 'actor-other', user_id: null, name: 'Phil' }
			}
		];

		// Emails live in onto_actors, readable only through the admin client.
		const defaultEmails: Record<string, string> = {
			'actor-owner': 'dj@example.com',
			'actor-current': 'ian@example.com',
			'actor-other': 'phil@example.com'
		};

		function wire(
			event: RequestEvent,
			memberRows: unknown[],
			emailsByActor: Record<string, string> = defaultEmails
		) {
			const supabase = event.locals.supabase as any;
			const memberSelect = vi.fn();
			supabase.rpc.mockResolvedValue({ data: true, error: null });
			supabase.from.mockImplementation((table: string) => {
				if (table === 'onto_projects') {
					return {
						select: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								is: vi.fn().mockReturnValue({
									maybeSingle: vi.fn().mockResolvedValue({
										data: { id: PROJECT_ID },
										error: null
									})
								})
							})
						})
					};
				}
				memberSelect.mockReturnValue({
					eq: vi.fn().mockReturnValue({
						is: vi.fn().mockReturnValue({
							order: vi.fn().mockResolvedValue({ data: memberRows, error: null })
						})
					})
				});
				return { select: memberSelect };
			});
			const usersIn = vi.fn().mockResolvedValue({
				data: [
					{ id: 'user-owner', username: 'djwayne' },
					{ id: 'user-1', username: null }
				],
				error: null
			});
			const usersSelect = vi.fn().mockReturnValue({ in: usersIn });
			const actorsIn = vi.fn().mockImplementation(async (_col: string, ids: string[]) => ({
				data: ids
					.filter((id) => emailsByActor[id])
					.map((id) => ({ id, email: emailsByActor[id] })),
				error: null
			}));
			const actorsSelect = vi.fn().mockReturnValue({ in: actorsIn });
			const adminFrom = vi
				.fn()
				.mockImplementation((table: string) =>
					table === 'onto_actors' ? { select: actorsSelect } : { select: usersSelect }
				);
			createAdminSupabaseClientMock.mockReturnValue({ from: adminFrom });
			return { usersSelect, usersIn, actorsSelect, actorsIn, memberSelect };
		}

		it('a non-owner sees names and handles, and only their own email', async () => {
			const event = createEvent();
			const { usersSelect, usersIn, actorsSelect, actorsIn, memberSelect } = wire(
				event,
				rows
			);

			const payload = await (await GET(event)).json();
			const byId = Object.fromEntries(payload.data.members.map((m: any) => [m.id, m]));

			expect(payload.data.viewer_is_owner).toBe(false);
			expect(byId['m-owner'].actor.email).toBeNull();
			expect(byId['m-other'].actor.email).toBeNull();
			expect(byId['m-current'].actor.email).toBe('ian@example.com');
			expect(byId['m-owner'].handle).toBe('djwayne');
			expect(byId['m-current'].handle).toBeNull();
			expect(JSON.stringify(payload)).not.toContain('dj@example.com');
			expect(JSON.stringify(payload)).not.toContain('phil@example.com');
			// The handle lookup reads usernames only, never emails.
			expect(usersSelect).toHaveBeenCalledWith('id, username');
			expect(usersIn).toHaveBeenCalledWith('id', ['user-owner', 'user-1']);
			// The signed-in members select no longer asks for email, and a non-owner
			// only looks up their own address.
			expect(memberSelect.mock.calls[0]?.[0]).not.toMatch(/\bemail\b/);
			expect(actorsSelect).toHaveBeenCalledWith('id, email');
			expect(actorsIn).toHaveBeenCalledWith('id', ['actor-current']);
		});

		it('the owner sees everyone’s email', async () => {
			const event = createEvent();
			const ownerRows = rows.map((row) =>
				row.id === 'm-owner'
					? { ...row, actor_id: 'actor-current' }
					: row.id === 'm-current'
						? { ...row, actor_id: 'actor-someone' }
						: row
			);
			wire(event, ownerRows, {
				'actor-current': 'dj@example.com',
				'actor-someone': 'ian@example.com',
				'actor-other': 'phil@example.com'
			});

			const payload = await (await GET(event)).json();
			const emails = payload.data.members.map((m: any) => m.actor.email);

			expect(payload.data.viewer_is_owner).toBe(true);
			expect(emails).toEqual(['dj@example.com', 'ian@example.com', 'phil@example.com']);
		});

		it('still lists members when the handle lookup fails', async () => {
			const event = createEvent();
			wire(event, rows);
			// Only the handle lookup (users) fails; emails (onto_actors) still load.
			const admin = createAdminSupabaseClientMock();
			createAdminSupabaseClientMock.mockReturnValue({
				from: vi.fn().mockImplementation((table: string) => {
					if (table === 'users') throw new Error('no service key');
					return admin.from(table);
				})
			});

			const response = await GET(event);
			const payload = await response.json();

			expect(response.status).toBe(200);
			expect(payload.data.members).toHaveLength(3);
			expect(payload.data.members.every((m: any) => m.handle === null)).toBe(true);
			createAdminSupabaseClientMock.mockReset();
		});
	});

	it('rejects invalid project ids', async () => {
		const event = createEvent();
		event.params.id = 'project-1';

		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toBe('Invalid project ID');
	});
});
