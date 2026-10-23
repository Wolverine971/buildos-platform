// apps/web/src/routes/api/onto/invite-links/join/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';

const { adminRpcMock, adminFromMock } = vi.hoisted(() => ({
	adminRpcMock: vi.fn(),
	adminFromMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: vi.fn(() => ({ rpc: adminRpcMock, from: adminFromMock }))
}));
vi.mock('$env/dynamic/private', () => ({ env: { PRIVATE_SUPABASE_SERVICE_KEY: 'test-secret' } }));
vi.mock('$env/static/public', () => ({ PUBLIC_APP_URL: 'https://build-os.com' }));
vi.mock('$app/environment', () => ({ dev: false }));

import { POST } from './+server';
import { hashInviteToken } from '$lib/server/people/invite-links';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

function createEvent(body: unknown, options: { user?: unknown; origin?: string | null } = {}) {
	const headers = new Headers();
	const origin = options.origin === undefined ? 'https://build-os.com' : options.origin;
	if (origin) headers.set('origin', origin);
	const upsert = vi.fn().mockResolvedValue({ error: null });
	return {
		url: new URL('https://build-os.com/api/onto/invite-links/join'),
		request: { headers, json: vi.fn().mockResolvedValue(body) },
		locals: {
			supabase: {
				rpc: vi.fn(),
				from: vi.fn(() => ({ upsert }))
			},
			safeGetSession: vi.fn().mockResolvedValue({
				user:
					options.user === undefined
						? { id: 'sam-1', name: 'Sam', email: 'sam@example.com' }
						: options.user
			})
		}
	} as unknown as RequestEvent & { locals: { supabase: { rpc: any; from: any } } };
}

const adminUpsert = vi.fn();

beforeEach(() => {
	adminRpcMock.mockReset();
	adminRpcMock.mockResolvedValue({ error: null });
	adminUpsert.mockReset();
	adminUpsert.mockResolvedValue({ error: null });
	adminFromMock.mockReset();
	adminFromMock.mockImplementation((table: string) => {
		if (table === 'onto_actors') {
			return {
				select: () => ({
					eq: () => ({
						maybeSingle: vi
							.fn()
							.mockResolvedValue({ data: { user_id: 'owner-1' }, error: null })
					})
				})
			};
		}
		return { upsert: adminUpsert };
	});
});

describe('POST /api/onto/invite-links/join', () => {
	it('requires a session and a same-site origin', async () => {
		expect((await POST(createEvent({ token: TOKEN }, { user: null }))).status).toBe(401);
		expect(
			(await POST(createEvent({ token: TOKEN }, { origin: 'https://evil.example' }))).status
		).toBe(403);
	});

	it('answers not found for a malformed token without calling the database', async () => {
		const event = createEvent({ token: 'short' });
		const payload = await (await POST(event)).json();
		expect(payload.data.status).toBe('not_found');
		expect(event.locals.supabase.rpc).not.toHaveBeenCalled();
	});

	it('joins with the hash of the token, follows activity, and tells the owner', async () => {
		const event = createEvent({ token: TOKEN });
		event.locals.supabase.rpc.mockImplementation(async (name: string) => {
			if (name === 'accept_project_invite_link') {
				return {
					data: {
						status: 'joined',
						project_id: 'project-1',
						project_name: '9takes',
						role_key: 'viewer',
						agent_access: 'read',
						owner_actor_id: 'owner-actor-1'
					},
					error: null
				};
			}
			if (name === 'get_project_notification_settings') {
				return { data: [{ effective_enabled: true }], error: null };
			}
			return { data: null, error: null };
		});

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(event.locals.supabase.rpc).toHaveBeenCalledWith('accept_project_invite_link', {
			p_token_hash: hashInviteToken(TOKEN)
		});
		expect(payload.data).toEqual({
			status: 'joined',
			project_id: 'project-1',
			project_name: '9takes',
			role_key: 'viewer',
			agent_access: 'read'
		});
		// The owner's actor id stays on the server.
		expect(JSON.stringify(payload)).not.toContain('owner-actor-1');

		expect(adminRpcMock).toHaveBeenCalledWith(
			'emit_notification_event',
			expect.objectContaining({
				p_event_type: 'project.invite.accepted',
				p_target_user_id: 'owner-1',
				p_payload: expect.objectContaining({
					title: 'Sam joined 9takes',
					body: 'Sam joined with your invite link as a viewer.'
				})
			})
		);
		expect(adminUpsert).toHaveBeenCalledWith(
			expect.objectContaining({ user_id: 'owner-1', event_type: 'project.invite.accepted' }),
			{ onConflict: 'user_id,event_type', ignoreDuplicates: true }
		);
	});

	it('still reports the join when the follow-ups fail', async () => {
		const event = createEvent({ token: TOKEN });
		event.locals.supabase.rpc.mockImplementation(async (name: string) => {
			if (name === 'accept_project_invite_link') {
				return {
					data: { status: 'joined', project_id: 'project-1', owner_actor_id: 'a' },
					error: null
				};
			}
			throw new Error('settings down');
		});
		adminRpcMock.mockResolvedValue({ error: { message: 'emit failed' } });

		const payload = await (await POST(event)).json();
		expect(payload.data.status).toBe('joined');
	});

	it.each(['already_member', 'removed', 'expired', 'reset', 'turned_off', 'not_found'])(
		'passes %s through without follow-ups',
		async (status) => {
			const event = createEvent({ token: TOKEN });
			event.locals.supabase.rpc.mockResolvedValue({
				data: { status, project_id: status === 'already_member' ? 'project-1' : undefined },
				error: null
			});
			const payload = await (await POST(event)).json();
			expect(payload.data.status).toBe(status);
			expect(adminRpcMock).not.toHaveBeenCalled();
		}
	);
});
