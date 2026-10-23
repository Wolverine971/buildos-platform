// apps/web/src/routes/api/people/requests/[requestId]/decide/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';

const {
	grantProjectsForUserMock,
	upsertMock,
	createAdminSupabaseClientMock,
	sendApprovedEmailMock
} = vi.hoisted(() => {
	const upsertMock = vi.fn();
	return {
		grantProjectsForUserMock: vi.fn(),
		sendApprovedEmailMock: vi.fn(),
		upsertMock,
		createAdminSupabaseClientMock: vi.fn(() => ({
			from: vi.fn(() => ({ upsert: upsertMock }))
		}))
	};
});

vi.mock('$lib/server/agent-call/caller-provisioning.service', () => ({
	CallerProvisioningService: vi.fn().mockImplementation(function () {
		return { grantProjectsForUser: grantProjectsForUserMock };
	})
}));

vi.mock('$lib/server/security-event-logger', () => ({
	getSecurityEventLogOptions: vi.fn(() => ({}))
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$lib/server/people/people-emails', () => ({
	sendPeopleRequestApprovedEmail: sendApprovedEmailMock
}));

import { POST } from './+server';

const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_A = '33333333-3333-4333-8333-333333333333';
const PROJECT_B = '44444444-4444-4444-8444-444444444444';

function createEvent(
	body: unknown,
	options: { origin?: string | null; requestId?: string; user?: unknown } = {}
): RequestEvent {
	const headers = new Headers();
	const origin = options.origin === undefined ? 'http://localhost' : options.origin;
	if (origin) headers.set('origin', origin);
	return {
		params: { requestId: options.requestId ?? REQUEST_ID },
		url: new URL(`http://localhost/api/people/requests/${REQUEST_ID}/decide`),
		platform: undefined,
		request: { headers, json: vi.fn().mockResolvedValue(body) },
		locals: {
			supabase: { rpc: vi.fn() },
			safeGetSession: vi.fn().mockResolvedValue({
				user: options.user === undefined ? { id: 'owner-1' } : options.user
			})
		}
	} as unknown as RequestEvent;
}

const rpcOf = (event: RequestEvent) => (event.locals.supabase as any).rpc;

beforeEach(() => {
	grantProjectsForUserMock.mockReset();
	upsertMock.mockReset();
	upsertMock.mockResolvedValue({ error: null });
	createAdminSupabaseClientMock.mockClear();
	sendApprovedEmailMock.mockReset();
	sendApprovedEmailMock.mockResolvedValue('sent');
});

describe('POST /api/people/requests/[requestId]/decide', () => {
	it('requires a session and a same-site origin', async () => {
		expect((await POST(createEvent({ decision: 'decline' }, { user: null }))).status).toBe(401);
		const crossSite = createEvent({ decision: 'decline' }, { origin: 'https://evil.example' });
		expect((await POST(crossSite)).status).toBe(403);
		expect(rpcOf(crossSite)).not.toHaveBeenCalled();
	});

	it('validates the decision and grants before calling the RPC', async () => {
		const cases = [
			createEvent({ decision: 'maybe' }),
			createEvent({ decision: 'approve', grants: [] }),
			createEvent({ decision: 'approve', grants: [{ project_id: 'not-a-uuid' }] }),
			createEvent({
				decision: 'approve',
				grants: [{ project_id: PROJECT_A, role: 'viewer', agent_access: 'write' }]
			}),
			createEvent({ decision: 'decline' }, { requestId: 'nope' })
		];
		for (const event of cases) {
			expect((await POST(event)).status).toBe(400);
			expect(rpcOf(event)).not.toHaveBeenCalled();
		}
	});

	it('declines without touching agents or subscriptions', async () => {
		const event = createEvent({ decision: 'decline' });
		rpcOf(event).mockResolvedValue({ data: { status: 'declined' }, error: null });

		const payload = await (await POST(event)).json();

		expect(rpcOf(event)).toHaveBeenCalledWith('decide_people_request', {
			p_request_id: REQUEST_ID,
			p_decision: 'decline',
			p_grants: []
		});
		expect(payload.data).toEqual({ status: 'declined' });
		expect(grantProjectsForUserMock).not.toHaveBeenCalled();
		expect(upsertMock).not.toHaveBeenCalled();
		expect(sendApprovedEmailMock).not.toHaveBeenCalled();
	});

	it('approves, grants the asking agent the projects its person can reach, and subscribes them', async () => {
		const event = createEvent({
			decision: 'approve',
			grants: [
				{ project_id: PROJECT_A, role: 'editor', agent_access: 'write' },
				{ project_id: PROJECT_B, role: 'viewer', agent_access: 'off' }
			]
		});
		rpcOf(event).mockResolvedValue({
			data: {
				status: 'approved',
				projects: [
					{ project_id: PROJECT_A, role: 'editor', agent_access: 'write' },
					{ project_id: PROJECT_B, role: 'viewer', agent_access: 'off' }
				],
				requester_user_id: 'requester-1',
				via_caller_id: 'caller-1',
				via_oauth_grant_id: null
			},
			error: null
		});
		grantProjectsForUserMock.mockResolvedValue({ granted_project_ids: [PROJECT_A] });

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.status).toBe('approved');
		expect(payload.data.agent_grant).toBe('granted');
		// Off means the agent doesn't get that project.
		expect(grantProjectsForUserMock).toHaveBeenCalledWith('requester-1', 'caller-1', [
			PROJECT_A
		]);
		expect(upsertMock).toHaveBeenCalledWith(
			expect.objectContaining({
				user_id: 'requester-1',
				event_type: 'project.activity.batched',
				is_active: true
			}),
			{ onConflict: 'user_id,event_type', ignoreDuplicates: true }
		);
		// The requester hears by email what was shared.
		expect(sendApprovedEmailMock).toHaveBeenCalledWith(REQUEST_ID);
		expect(payload.data.email).toBe('sent');
		// The owner never sees the requester's ids or connector ids.
		expect(payload.data.requester_user_id).toBeUndefined();
		expect(payload.data.via_caller_id).toBeUndefined();
	});

	it('still succeeds when the agent grant fails', async () => {
		const event = createEvent({
			decision: 'approve',
			grants: [{ project_id: PROJECT_A, role: 'viewer', agent_access: 'read' }]
		});
		rpcOf(event).mockResolvedValue({
			data: {
				status: 'approved',
				projects: [{ project_id: PROJECT_A, role: 'viewer', agent_access: 'read' }],
				requester_user_id: 'requester-1',
				via_caller_id: 'caller-1'
			},
			error: null
		});
		grantProjectsForUserMock.mockRejectedValue(new Error('Connector not found'));

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.agent_grant).toBe('failed');
	});

	it('skips the agent grant for requests sent from the web', async () => {
		const event = createEvent({
			decision: 'approve',
			grants: [{ project_id: PROJECT_A }]
		});
		rpcOf(event).mockResolvedValue({
			data: {
				status: 'approved',
				projects: [{ project_id: PROJECT_A, role: 'viewer', agent_access: 'read' }],
				requester_user_id: 'requester-1',
				via_caller_id: null
			},
			error: null
		});

		const payload = await (await POST(event)).json();

		// Missing role and agent setting default to Viewer + Read.
		expect(rpcOf(event)).toHaveBeenCalledWith('decide_people_request', {
			p_request_id: REQUEST_ID,
			p_decision: 'approve',
			p_grants: [{ project_id: PROJECT_A, role: 'viewer', agent_access: 'read' }]
		});
		expect(payload.data.agent_grant).toBe('none');
		expect(grantProjectsForUserMock).not.toHaveBeenCalled();
	});

	it('maps RPC refusals to plain errors', async () => {
		const event = createEvent({
			decision: 'approve',
			grants: [{ project_id: PROJECT_A, role: 'viewer', agent_access: 'read' }]
		});
		rpcOf(event).mockResolvedValue({
			data: null,
			error: { code: '42501', message: 'You can only share projects you own' }
		});

		const response = await POST(event);
		expect(response.status).toBe(403);
		expect((await response.json()).error).toBe('You can only share projects you own');
	});

	describe('upgrade requests (tasker 140)', () => {
		const CALLER_A = '55555555-5555-4555-8555-555555555555';
		const CALLER_B = '66666666-6666-4666-8666-666666666666';

		it('sends what the owner saw, connects only the agents that asked, saves standing approval', async () => {
			const event = createEvent({
				decision: 'approve',
				items: [
					{ project_id: PROJECT_A, need: 'agents_write', allow: true },
					{ project_id: PROJECT_B, need: 'agents_read', allow: true }
				],
				editor_agents_write_project_ids: [PROJECT_A]
			});
			rpcOf(event).mockImplementation(async (name: string) =>
				name === 'decide_people_request'
					? {
							data: {
								status: 'approved',
								kind: 'upgrade',
								projects: [
									{
										project_id: PROJECT_A,
										role: 'editor',
										agent_access: 'write',
										need: 'agents_write',
										caller_ids: [CALLER_A, CALLER_B]
									},
									{
										project_id: PROJECT_B,
										role: 'viewer',
										agent_access: 'read',
										need: 'agents_read',
										caller_ids: [CALLER_B]
									}
								],
								requester_user_id: 'member-1'
							},
							error: null
						}
					: { data: { editor_agents_write: true }, error: null }
			);
			grantProjectsForUserMock.mockResolvedValue({ granted_project_ids: [] });

			const response = await POST(event);
			expect(response.status).toBe(200);
			const payload = await response.json();
			expect(payload.data).toMatchObject({
				status: 'approved',
				kind: 'upgrade',
				agent_grant: 'granted',
				standing_approval: 'saved'
			});
			// The requester's connection ids never reach the owner.
			expect(JSON.stringify(payload)).not.toContain(CALLER_A);
			expect(rpcOf(event)).toHaveBeenCalledWith('decide_people_request', {
				p_request_id: REQUEST_ID,
				p_decision: 'approve',
				p_grants: [
					{ project_id: PROJECT_A, need: 'agents_write', allow: true },
					{ project_id: PROJECT_B, need: 'agents_read', allow: true }
				]
			});
			expect(rpcOf(event)).toHaveBeenCalledWith('set_project_editor_agents_write', {
				p_project_id: PROJECT_A,
				p_enabled: true
			});
			expect(grantProjectsForUserMock).toHaveBeenCalledTimes(2);
			expect(grantProjectsForUserMock).toHaveBeenCalledWith('member-1', CALLER_A, [
				PROJECT_A
			]);
			expect(grantProjectsForUserMock).toHaveBeenCalledWith('member-1', CALLER_B, [
				PROJECT_A,
				PROJECT_B
			]);
		});

		it('connects no agent for projects asked from the web without one', async () => {
			const event = createEvent({
				decision: 'approve',
				items: [{ project_id: PROJECT_A, need: 'edit' }]
			});
			rpcOf(event).mockResolvedValue({
				data: {
					status: 'approved',
					kind: 'upgrade',
					projects: [
						{
							project_id: PROJECT_A,
							role: 'editor',
							agent_access: 'write',
							caller_ids: []
						}
					],
					requester_user_id: 'member-1'
				},
				error: null
			});

			const response = await POST(event);
			expect((await response.json()).data.agent_grant).toBe('none');
			expect(grantProjectsForUserMock).not.toHaveBeenCalled();
		});

		it('returns 409 when the request changed after the owner opened it', async () => {
			const event = createEvent({
				decision: 'approve',
				items: [{ project_id: PROJECT_A, need: 'agents_read', allow: true }]
			});
			rpcOf(event).mockResolvedValue({
				data: null,
				error: {
					code: 'PT409',
					message:
						'This request changed after you opened it. Look again before you allow it.'
				}
			});

			const response = await POST(event);
			expect(response.status).toBe(409);
			expect(grantProjectsForUserMock).not.toHaveBeenCalled();
		});

		it('turns away an approval from a page loaded before items were sent', async () => {
			const event = createEvent({ decision: 'approve', project_ids: [PROJECT_A] });
			expect((await POST(event)).status).toBe(409);
			expect(rpcOf(event)).not.toHaveBeenCalled();
		});

		it('rejects malformed items before calling the RPC', async () => {
			for (const body of [
				{ decision: 'approve', items: [{ project_id: 'nope', need: 'edit' }] },
				{ decision: 'approve', items: [{ project_id: PROJECT_A, need: 'owner' }] },
				{
					decision: 'approve',
					items: [{ project_id: PROJECT_A, need: 'edit', allow: 'yes' }]
				},
				{ decision: 'approve', items: [] },
				{
					decision: 'approve',
					items: [{ project_id: PROJECT_A, need: 'edit' }],
					editor_agents_write_project_ids: 'x'
				}
			]) {
				const event = createEvent(body);
				expect((await POST(event)).status, JSON.stringify(body)).toBe(400);
				expect(rpcOf(event)).not.toHaveBeenCalled();
			}
		});
	});
});
