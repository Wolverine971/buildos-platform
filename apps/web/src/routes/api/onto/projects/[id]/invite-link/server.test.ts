// apps/web/src/routes/api/onto/projects/[id]/invite-link/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';

vi.mock('$env/dynamic/private', () => ({ env: { PRIVATE_SUPABASE_SERVICE_KEY: 'test-secret' } }));
vi.mock('$env/static/public', () => ({ PUBLIC_APP_URL: 'https://build-os.com' }));
vi.mock('$app/environment', () => ({ dev: false }));

import { DELETE, GET, PATCH, POST } from './+server';
import { deriveInviteLinkToken, hashInviteToken } from '$lib/server/people/invite-links';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const LINK_ID = '22222222-2222-4222-8222-222222222222';

function linkRow(overrides: Record<string, unknown> = {}) {
	return {
		id: LINK_ID,
		project_id: PROJECT_ID,
		role_key: 'viewer',
		agent_access: 'read',
		expires_at: '2026-10-30T12:00:00.000Z',
		expired: false,
		join_count: 2,
		last_joined_at: '2026-10-24T12:00:00.000Z',
		created_at: '2026-10-23T12:00:00.000Z',
		...overrides
	};
}

function createEvent(
	body?: unknown,
	options: { origin?: string | null; user?: unknown; projectId?: string } = {}
): RequestEvent {
	const headers = new Headers();
	const origin = options.origin === undefined ? 'https://build-os.com' : options.origin;
	if (origin) headers.set('origin', origin);
	return {
		params: { id: options.projectId ?? PROJECT_ID },
		url: new URL(`https://build-os.com/api/onto/projects/${PROJECT_ID}/invite-link`),
		request: { headers, json: vi.fn().mockResolvedValue(body ?? {}) },
		locals: {
			supabase: { rpc: vi.fn() },
			safeGetSession: vi.fn().mockResolvedValue({
				user: options.user === undefined ? { id: 'owner-1' } : options.user
			})
		}
	} as unknown as RequestEvent;
}

const rpcOf = (event: RequestEvent) => (event.locals.supabase as any).rpc;

describe('GET /api/onto/projects/[id]/invite-link', () => {
	it('requires a session and a real project id', async () => {
		expect((await GET(createEvent(undefined, { user: null }))).status).toBe(401);
		expect((await GET(createEvent(undefined, { projectId: 'nope' }))).status).toBe(400);
	});

	it('returns null when there is no link', async () => {
		const event = createEvent();
		rpcOf(event).mockResolvedValue({ data: { link: null }, error: null });
		const payload = await (await GET(event)).json();
		expect(rpcOf(event)).toHaveBeenCalledWith('get_project_invite_link', {
			p_project_id: PROJECT_ID
		});
		expect(payload.data.link).toBeNull();
	});

	it('gives the owner the same copyable URL every time, rebuilt from the link id', async () => {
		const event = createEvent();
		rpcOf(event).mockResolvedValue({ data: { link: linkRow() }, error: null });
		const payload = await (await GET(event)).json();

		const token = deriveInviteLinkToken(LINK_ID, 'test-secret');
		expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
		expect(payload.data.link).toMatchObject({
			id: LINK_ID,
			role_key: 'viewer',
			agent_access: 'read',
			join_count: 2,
			url: `https://build-os.com/join/${token}`
		});
		// No hash or other internals leak through.
		expect(JSON.stringify(payload)).not.toContain(hashInviteToken(token));
	});

	it('passes the owner-only refusal through as a 403', async () => {
		const event = createEvent();
		rpcOf(event).mockResolvedValue({
			data: null,
			error: { code: '42501', message: 'Only the project owner can manage the invite link' }
		});
		const response = await GET(event);
		expect(response.status).toBe(403);
		expect((await response.json()).error).toBe(
			'Only the project owner can manage the invite link'
		);
	});
});

describe('POST /api/onto/projects/[id]/invite-link (create or reset)', () => {
	it('defaults to Viewer, agents Read, 7 days, and stores only the hash of a derived token', async () => {
		const event = createEvent({});
		rpcOf(event).mockImplementation(async (_name: string, args: Record<string, unknown>) => ({
			data: { link: linkRow({ id: args.p_link_id }), replaced: false },
			error: null
		}));

		const response = await POST(event);
		const payload = await response.json();
		expect(response.status).toBe(200);

		const [name, args] = rpcOf(event).mock.calls[0];
		expect(name).toBe('create_project_invite_link');
		expect(args).toMatchObject({
			p_project_id: PROJECT_ID,
			p_role_key: 'viewer',
			p_agent_access: 'read',
			p_expires_in_days: 7
		});
		const token = deriveInviteLinkToken(String(args.p_link_id), 'test-secret');
		expect(args.p_token_hash).toBe(hashInviteToken(token));
		expect(JSON.stringify(args)).not.toContain(token);
		expect(payload.data.link.url).toBe(`https://build-os.com/join/${token}`);
		expect(payload.data.replaced).toBe(false);
	});

	it('refuses agent Write on a Viewer link, a bad length, and cross-site calls before the RPC', async () => {
		const viewerWrite = createEvent({ role_key: 'viewer', agent_access: 'write' });
		expect((await POST(viewerWrite)).status).toBe(400);

		const tooLong = createEvent({ expires_in_days: 90 });
		expect((await POST(tooLong)).status).toBe(400);

		const crossSite = createEvent({}, { origin: 'https://evil.example' });
		expect((await POST(crossSite)).status).toBe(403);

		for (const event of [viewerWrite, tooLong, crossSite]) {
			expect(rpcOf(event)).not.toHaveBeenCalled();
		}
	});

	it('reports a reset', async () => {
		const event = createEvent({
			role_key: 'editor',
			agent_access: 'write',
			expires_in_days: 1
		});
		rpcOf(event).mockImplementation(async (_name: string, args: Record<string, unknown>) => ({
			data: {
				link: linkRow({ id: args.p_link_id, role_key: 'editor', agent_access: 'write' }),
				replaced: true
			},
			error: null
		}));
		const payload = await (await POST(event)).json();
		expect(rpcOf(event).mock.calls[0][1]).toMatchObject({
			p_role_key: 'editor',
			p_agent_access: 'write',
			p_expires_in_days: 1
		});
		expect(payload.data.replaced).toBe(true);
		expect(payload.data.link.role_key).toBe('editor');
	});
});

describe('PATCH /api/onto/projects/[id]/invite-link', () => {
	it('changes settings and keeps the URL; leaves expiry alone unless given', async () => {
		const event = createEvent({ role_key: 'editor', agent_access: 'read' });
		rpcOf(event).mockResolvedValue({
			data: { link: linkRow({ role_key: 'editor' }) },
			error: null
		});
		const payload = await (await PATCH(event)).json();
		expect(rpcOf(event)).toHaveBeenCalledWith('update_project_invite_link', {
			p_project_id: PROJECT_ID,
			p_role_key: 'editor',
			p_agent_access: 'read'
		});
		expect(payload.data.link.url).toBe(
			`https://build-os.com/join/${deriveInviteLinkToken(LINK_ID, 'test-secret')}`
		);
	});

	it('passes a new length through', async () => {
		const event = createEvent({
			role_key: 'viewer',
			agent_access: 'off',
			expires_in_days: '30'
		});
		rpcOf(event).mockResolvedValue({ data: { link: linkRow() }, error: null });
		await PATCH(event);
		expect(rpcOf(event).mock.calls[0][1]).toMatchObject({ p_expires_in_days: 30 });
	});
});

describe('DELETE /api/onto/projects/[id]/invite-link', () => {
	it('turns the link off', async () => {
		const event = createEvent();
		rpcOf(event).mockResolvedValue({ data: { turned_off: true }, error: null });
		const payload = await (await DELETE(event)).json();
		expect(rpcOf(event)).toHaveBeenCalledWith('turn_off_project_invite_link', {
			p_project_id: PROJECT_ID
		});
		expect(payload.data).toEqual({ turned_off: true, link: null });
	});
});
