// apps/web/src/routes/api/onto/projects/[id]/invites/server.test.ts
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';
import type { RequestEvent } from './$types';

const { sendEmailMock, createAdminSupabaseClientMock } = vi.hoisted(() => ({
	sendEmailMock: vi.fn(),
	createAdminSupabaseClientMock: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1')
}));

vi.mock('../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

vi.mock('$lib/services/email-service', () => ({
	EmailService: vi.fn().mockImplementation(function () {
		return { sendEmail: sendEmailMock };
	})
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$env/static/public', () => ({
	PUBLIC_APP_URL: 'http://localhost:5173'
}));

vi.mock('$app/environment', () => ({
	dev: true
}));

import { GET, POST } from './+server';

/** A query builder whose every filter returns itself and that resolves to `result`. */
function query(result: unknown) {
	const builder: Record<string, any> = {};
	for (const method of ['select', 'eq', 'is', 'ilike', 'limit', 'in', 'order', 'insert']) {
		builder[method] = vi.fn(() => builder);
	}
	builder.maybeSingle = vi.fn().mockResolvedValue(result);
	builder.single = vi.fn().mockResolvedValue(result);
	builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
		Promise.resolve(result).then(resolve, reject);
	return builder;
}

const createEvent = (body?: Record<string, unknown>): RequestEvent => {
	const supabase = {
		rpc: vi.fn(),
		from: vi.fn()
	};

	return {
		params: { id: 'project-1' },
		request: {
			json: vi.fn().mockResolvedValue(body ?? {})
		},
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: 'user-1', email: 'owner@example.com', name: 'Owner' }
			})
		}
	} as unknown as RequestEvent;
};

/** Wires the happy path for POST and returns the builders to inspect. */
function wireInviteTables(supabase: any) {
	const tables = {
		onto_projects: query({ data: { id: 'project-1', name: 'Project Alpha' }, error: null }),
		onto_actors: query({ data: null, error: null }),
		onto_project_invites: query({ data: { id: 'invite-1' }, error: null }),
		onto_project_logs: query({ error: null })
	};
	supabase.rpc.mockResolvedValue({ data: true, error: null });
	supabase.from.mockImplementation((table: keyof typeof tables) => tables[table] ?? query({}));
	return tables;
}

beforeEach(() => {
	sendEmailMock.mockReset();
	sendEmailMock.mockResolvedValue({ success: true });
	createAdminSupabaseClientMock.mockReset();
});

describe('/api/onto/projects/[id]/invites access checks', () => {
	it('GET returns forbidden when write access is missing', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: false, error: null });

		const response = await GET(event);
		expect(response.status).toBe(403);
		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: 'project-1',
			p_required_access: 'write'
		});
	});

	it('POST is owner-only: editors can no longer re-share', async () => {
		const event = createEvent({ email: 'new-user@example.com', role_key: 'editor' });
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: false, error: null });

		const response = await POST(event);
		const payload = await response.json();
		expect(response.status).toBe(403);
		expect(payload.error).toBe('Only the project owner can invite people');
		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: 'project-1',
			p_required_access: 'admin'
		});
		expect(sendEmailMock).not.toHaveBeenCalled();
	});
});

describe('GET /api/onto/projects/[id]/invites', () => {
	it('shows handle invites by handle and never returns the email behind them', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;
		supabase.rpc.mockResolvedValue({ data: true, error: null });
		const invitesQuery = query({
			data: [
				{
					id: 'i1',
					invitee_email: 'sam@example.com',
					invitee_handle: 'sam',
					agent_access: 'read'
				},
				{
					id: 'i2',
					invitee_email: 'lee@example.com',
					invitee_handle: null,
					agent_access: 'off'
				}
			],
			error: null
		});
		supabase.from.mockReturnValue(invitesQuery);

		const payload = await (await GET(event)).json();

		expect(invitesQuery.select.mock.calls[0]?.[0]).toContain('invitee_handle');
		expect(invitesQuery.select.mock.calls[0]?.[0]).toContain('agent_access');
		expect(payload.data.invites).toEqual([
			{ id: 'i1', invitee_email: null, invitee_handle: 'sam', agent_access: 'read' },
			{
				id: 'i2',
				invitee_email: 'lee@example.com',
				invitee_handle: null,
				agent_access: 'off'
			}
		]);
		expect(JSON.stringify(payload)).not.toContain('sam@example.com');
	});
});

describe('POST /api/onto/projects/[id]/invites', () => {
	it('invites by email with the agent setting (Read by default)', async () => {
		const event = createEvent({ email: 'Lee@Example.com', role_key: 'viewer' });
		const tables = wireInviteTables(event.locals.supabase);

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(tables.onto_project_invites.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				invitee_email: 'lee@example.com',
				invitee_user_id: null,
				invitee_handle: null,
				agent_access: 'read',
				role_key: 'viewer',
				access: 'read'
			})
		);
		expect(payload.data).toMatchObject({
			invitee_email: 'lee@example.com',
			invitee_handle: null,
			agent_access: 'read',
			email_sent: true
		});
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();

		// The email: plain subject, one button to the invite, the agents line, the expiry.
		const email = sendEmailMock.mock.calls[0]?.[0];
		expect(email.subject).toBe('Owner invited you to Project Alpha on BuildOS');
		expect(email.body).toContain('Join as a viewer.');
		expect(email.body).toContain('it can read this project for you');
		expect(email.body).toContain('This invite works until');
		expect(email.body).not.toContain('\u2014');
		expect(email.html).toContain(payload.data.invite_url);

		// The link comes back once for "Copy invite link"; only its hash is stored.
		const url: string = payload.data.invite_url;
		expect(url).toMatch(/^http:\/\/localhost:5173\/invites\/[0-9a-f]{64}$/);
		const stored = tables.onto_project_invites.insert.mock.calls[0]?.[0];
		expect(stored.token_hash).toBe(
			createHash('sha256')
				.update(url.split('/').pop() ?? '')
				.digest('hex')
		);
		expect(JSON.stringify(stored)).not.toContain(url.split('/').pop());
	});

	it('keeps the invite when the email fails, so the owner can copy the link instead', async () => {
		const event = createEvent({ email: 'lee@example.com', role_key: 'viewer' });
		wireInviteTables(event.locals.supabase);
		sendEmailMock.mockResolvedValue({ success: false, error: 'SMTP down' });

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.email_sent).toBe(false);
		expect(payload.data.invite_url).toMatch(/\/invites\/[0-9a-f]{64}$/);
	});

	it('invites by handle: emails the person, but returns and logs only the handle', async () => {
		const event = createEvent({
			invitee_handle: '@Sam',
			role_key: 'editor',
			agent_access: 'write'
		});
		const tables = wireInviteTables(event.locals.supabase);
		const usersQuery = query({
			data: {
				id: 'user-sam',
				username: 'sam',
				email: 'sam@example.com',
				name: 'Sam',
				access_restricted: false
			},
			error: null
		});
		createAdminSupabaseClientMock.mockReturnValue({ from: vi.fn(() => usersQuery) });

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(usersQuery.ilike).toHaveBeenCalledWith('username', 'sam');
		expect(usersQuery.eq).toHaveBeenCalledWith('discoverability', 'handle');
		expect(tables.onto_actors.eq).toHaveBeenCalledWith('user_id', 'user-sam');
		expect(tables.onto_project_invites.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				invitee_email: 'sam@example.com',
				invitee_user_id: 'user-sam',
				invitee_handle: 'sam',
				agent_access: 'write',
				role_key: 'editor'
			})
		);
		// The email goes out exactly as for an email invite.
		expect(sendEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({ to: 'sam@example.com' })
		);
		expect(payload.data).toMatchObject({
			invitee_email: null,
			invitee_handle: 'sam',
			agent_access: 'write'
		});
		expect(JSON.stringify(payload)).not.toContain('sam@example.com');
		const logged = tables.onto_project_logs.insert.mock.calls[0]?.[0]?.after_data;
		expect(logged).toMatchObject({ event: 'invite_created', invitee_handle: 'sam' });
		expect(JSON.stringify(logged)).not.toContain('sam@example.com');
	});

	it('answers an unknown and an unfindable handle the same way', async () => {
		const event = createEvent({ invitee_handle: 'ghost', role_key: 'viewer' });
		wireInviteTables(event.locals.supabase);
		createAdminSupabaseClientMock.mockReturnValue({
			from: vi.fn(() => query({ data: null, error: null }))
		});

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(404);
		expect(payload.error).toContain('No one with that handle can be found');
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('refuses Write for a Viewer before doing anything', async () => {
		const event = createEvent({
			email: 'lee@example.com',
			role_key: 'viewer',
			agent_access: 'write'
		});
		const supabase = event.locals.supabase as any;

		const response = await POST(event);

		expect(response.status).toBe(400);
		expect((await response.json()).error).toContain('Agents can only write');
		expect(supabase.rpc).not.toHaveBeenCalled();
	});

	it('rejects an unknown agent setting and a malformed handle', async () => {
		const badAccess = createEvent({ email: 'lee@example.com', agent_access: 'admin' });
		expect((await POST(badAccess)).status).toBe(400);

		const badHandle = createEvent({ invitee_handle: '@a b' });
		expect((await POST(badHandle)).status).toBe(400);
	});

	it('will not invite yourself by handle', async () => {
		const event = createEvent({ invitee_handle: 'owner', role_key: 'viewer' });
		wireInviteTables(event.locals.supabase);
		createAdminSupabaseClientMock.mockReturnValue({
			from: vi.fn(() =>
				query({
					data: { id: 'user-1', username: 'owner', email: 'owner@example.com' },
					error: null
				})
			)
		});

		const response = await POST(event);
		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe('You cannot invite yourself');
	});
});
