// apps/web/src/lib/server/people/people-emails.test.ts
import { assert, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/email-service', () => ({
	EmailService: vi.fn().mockImplementation(function () {
		return { sendEmail: vi.fn() };
	})
}));
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: vi.fn() }));
vi.mock('$env/dynamic/private', () => ({ env: { PRIVATE_SUPABASE_SERVICE_KEY: 'test-secret' } }));
vi.mock('$env/static/public', () => ({ PUBLIC_APP_URL: 'https://build-os.com' }));
vi.mock('$app/environment', () => ({ dev: false }));

import {
	buildProjectInviteEmail,
	sendPeopleRequestApprovedEmail,
	sendPeopleRequestReceivedEmail,
	buildUpgradeApprovedEmail,
	buildRequestApprovedEmail,
	buildUpgradeRequestEmail
} from './people-emails';

const EM_DASH = '—';

/** A fake admin client: each table resolves to fixed rows, filters are ignored. */
function fakeAdmin(tables: Record<string, unknown>) {
	const from = vi.fn((table: string) => {
		const result = tables[table];
		if (result instanceof Error) throw result;
		const rows = Array.isArray(result) ? result : result ? [result] : [];
		const builder: Record<string, any> = {};
		for (const method of ['select', 'eq', 'in', 'is']) builder[method] = vi.fn(() => builder);
		builder.maybeSingle = vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null });
		builder.then = (resolve: (value: unknown) => unknown) =>
			Promise.resolve({ data: rows, error: null }).then(resolve);
		return builder;
	});
	return { from } as any;
}

const OWNER = {
	id: 'owner-1',
	name: 'DJ',
	username: 'dj',
	email: 'dj@example.com',
	deletion_status: null,
	access_restricted: false
};
const SAM = {
	id: 'sam-1',
	name: 'Sam Lee',
	username: 'sam',
	email: 'Sam@Example.com',
	deletion_status: null,
	access_restricted: false
};

describe('buildProjectInviteEmail', () => {
	it('reads plainly: who, what project, the role, the agents line, one button, the link, the expiry', () => {
		const email = buildProjectInviteEmail({
			inviterName: 'DJ',
			projectName: '9takes',
			projectDescription: 'A personality community',
			roleKey: 'editor',
			agentAccess: 'write',
			inviteUrl: 'https://build-os.com/invites/abc',
			expiresAt: '2026-10-30T12:00:00.000Z'
		});

		expect(email.subject).toBe('DJ invited you to 9takes on BuildOS');
		expect(email.text).toContain('Join as an editor. You’ll be able to add and change tasks');
		expect(email.text).toContain('add tasks and docs, and update what you created');
		expect(email.text).toContain('Join 9takes: https://build-os.com/invites/abc');
		expect(email.text).toContain('This invite works until October 30.');
		expect(email.html).toContain('>Join 9takes</a>');
		expect(email.html).toContain('Paste this link into your browser');
		expect(email.html).toContain('A personality community');
		expect(email.text + email.html).not.toContain(EM_DASH);
	});

	it('escapes names and marks reminders', () => {
		const email = buildProjectInviteEmail({
			inviterName: '<b>Eve</b>',
			projectName: 'Plan & Ship',
			roleKey: 'viewer',
			agentAccess: 'off',
			inviteUrl: 'https://build-os.com/invites/abc',
			expiresAt: '2026-10-30T12:00:00.000Z',
			reminder: true
		});
		expect(email.subject).toBe('Reminder: <b>Eve</b> invited you to Plan & Ship on BuildOS');
		expect(email.html).not.toContain('<b>Eve</b>');
		expect(email.html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
		expect(email.text).toContain('won’t be able to open this project');
	});
});

describe('sendPeopleRequestReceivedEmail', () => {
	const request = {
		id: 'req-1',
		from_user_id: 'sam-1',
		to_user_id: 'owner-1',
		role_requested: 'viewer',
		note: 'Click https://evil.example now',
		via: 'agent',
		status: 'pending',
		decision: null,
		expires_at: '2026-11-06T12:00:00.000Z'
	};

	it('emails the owner a review link, and never the note text', async () => {
		const sendEmail = vi.fn().mockResolvedValue({ success: true });
		const outcome = await sendPeopleRequestReceivedEmail('req-1', {
			admin: fakeAdmin({
				people_requests: request,
				users: [OWNER, SAM],
				email_suppressions: null
			}),
			mailer: { sendEmail },
			baseUrl: 'https://build-os.com'
		});

		expect(outcome).toBe('sent');
		const call = sendEmail.mock.calls[0];
		assert.isDefined(call, 'Expected an email to be sent');
		const [sent] = call;
		expect(sent.to).toBe('dj@example.com');
		expect(sent.subject).toBe('Sam Lee wants to see your projects');
		expect(sent.body).toContain('Sam Lee (@sam) asked to see your projects as a viewer.');
		expect(sent.body).toContain('Their AI agent sent the request for them.');
		expect(sent.body).toContain('They added a note.');
		expect(sent.body).toContain(
			'Review request: https://build-os.com/profile?tab=people#requests'
		);
		expect(sent.html).toContain('>Review request</a>');
		expect(sent.body + sent.html).not.toContain('evil.example');
		expect(sent.body + sent.html).not.toContain(EM_DASH);
		expect(sent.metadata).toEqual({ type: 'people_request_received', request_id: 'req-1' });
	});

	it('a rejoin request names the project and says a deny is final', async () => {
		const sendEmail = vi.fn().mockResolvedValue({ success: true });
		const outcome = await sendPeopleRequestReceivedEmail('req-1', {
			admin: fakeAdmin({
				people_requests: {
					...request,
					via: 'web',
					note: null,
					kind: 'rejoin',
					project_id: 'project-1'
				},
				onto_projects: { name: '9takes' },
				users: [OWNER, SAM],
				email_suppressions: null
			}),
			mailer: { sendEmail },
			baseUrl: 'https://build-os.com'
		});

		expect(outcome).toBe('sent');
		const call = sendEmail.mock.calls[0];
		assert.isDefined(call, 'Expected an email to be sent');
		const [sent] = call;
		expect(sent.subject).toBe('Sam Lee wants to rejoin 9takes');
		expect(sent.body).toContain('left 9takes or was removed, then opened your invite link');
		expect(sent.body).toContain('they can’t ask to rejoin this project again');
		expect(sent.body).toContain(
			'Review request: https://build-os.com/profile?tab=people#requests'
		);
		expect(sent.body + sent.html).not.toContain(EM_DASH);
	});

	it('skips answered requests, hard bounces, and closed accounts', async () => {
		const sendEmail = vi.fn().mockResolvedValue({ success: true });
		const answered = await sendPeopleRequestReceivedEmail('req-1', {
			admin: fakeAdmin({
				people_requests: { ...request, status: 'approved' },
				users: [OWNER, SAM]
			}),
			mailer: { sendEmail }
		});
		const bounced = await sendPeopleRequestReceivedEmail('req-1', {
			admin: fakeAdmin({
				people_requests: request,
				users: [OWNER, SAM],
				email_suppressions: { reason: 'hard_bounce' }
			}),
			mailer: { sendEmail }
		});
		const deleted = await sendPeopleRequestReceivedEmail('req-1', {
			admin: fakeAdmin({
				people_requests: request,
				users: [{ ...OWNER, deletion_status: 'processing' }, SAM]
			}),
			mailer: { sendEmail }
		});
		expect([answered, bounced, deleted]).toEqual(['skipped', 'skipped', 'skipped']);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('still mails someone who only unsubscribed from marketing', async () => {
		const sendEmail = vi.fn().mockResolvedValue({ success: true });
		const outcome = await sendPeopleRequestReceivedEmail('req-1', {
			admin: fakeAdmin({
				people_requests: request,
				users: [OWNER, SAM],
				email_suppressions: { reason: 'unsubscribe' }
			}),
			mailer: { sendEmail }
		});
		expect(outcome).toBe('sent');
	});

	it('never throws', async () => {
		const outcome = await sendPeopleRequestReceivedEmail('req-1', {
			admin: fakeAdmin({ people_requests: new Error('db down') }),
			mailer: { sendEmail: vi.fn() }
		});
		expect(outcome).toBe('failed');

		const sendFails = await sendPeopleRequestReceivedEmail('req-1', {
			admin: fakeAdmin({ people_requests: request, users: [OWNER, SAM] }),
			mailer: { sendEmail: vi.fn().mockResolvedValue({ success: false, error: 'SMTP' }) }
		});
		expect(sendFails).toBe('failed');
	});
});

describe('sendPeopleRequestApprovedEmail', () => {
	const approved = {
		id: 'req-1',
		from_user_id: 'sam-1',
		to_user_id: 'owner-1',
		role_requested: 'viewer',
		note: null,
		via: 'web',
		status: 'approved',
		decision: [{ project_id: 'p-1', role: 'viewer', agent_access: 'read' }],
		expires_at: null
	};

	it('tells the requester what was shared, with a button straight into the project', async () => {
		const sendEmail = vi.fn().mockResolvedValue({ success: true });
		const outcome = await sendPeopleRequestApprovedEmail('req-1', {
			admin: fakeAdmin({
				people_requests: approved,
				onto_projects: [{ id: 'p-1', name: '9takes' }],
				users: [OWNER, SAM]
			}),
			mailer: { sendEmail },
			baseUrl: 'https://build-os.com'
		});

		expect(outcome).toBe('sent');
		const call = sendEmail.mock.calls[0];
		assert.isDefined(call, 'Expected an email to be sent');
		const [sent] = call;
		expect(sent.to).toBe('sam@example.com');
		expect(sent.subject).toBe('DJ shared 9takes with you');
		expect(sent.body).toContain('You’re a viewer.');
		expect(sent.body).toContain('it can read this project for you');
		expect(sent.body).toContain('Open 9takes: https://build-os.com/projects/p-1?joined=1');
		expect(sent.body + sent.html).not.toContain(EM_DASH);
	});

	it('lists each project’s permissions and links to the approved project choices', async () => {
		const sendEmail = vi.fn().mockResolvedValue({ success: true });
		await sendPeopleRequestApprovedEmail('req-1', {
			admin: fakeAdmin({
				people_requests: {
					...approved,
					decision: [
						{ project_id: 'p-1', role: 'viewer', agent_access: 'read' },
						{ project_id: 'p-2', role: 'editor', agent_access: 'write' }
					]
				},
				onto_projects: [
					{ id: 'p-1', name: '9takes' },
					{ id: 'p-2', name: 'Cadre' }
				],
				users: [OWNER, SAM]
			}),
			mailer: { sendEmail },
			baseUrl: 'https://build-os.com'
		});
		const call = sendEmail.mock.calls[0];
		assert.isDefined(call, 'Expected an email to be sent');
		const [sent] = call;
		expect(sent.subject).toBe('DJ shared 2 projects with you');
		expect(sent.body).toContain('9takes: You’re a viewer.');
		expect(sent.body).toContain('it can read this project for you');
		expect(sent.body).toContain('Cadre: You’re an editor.');
		expect(sent.body).toContain('update what you created or are assigned to');
		expect(sent.body).toContain(
			'Choose a project: https://build-os.com/profile?tab=people#requests'
		);
	});

	it('opens an existing membership without claiming the person just joined', () => {
		const email = buildRequestApprovedEmail({
			owner: OWNER,
			projects: [
				{
					id: 'p-1',
					name: '9takes',
					role: 'editor',
					agent_access: 'off',
					status: 'already_member'
				}
			],
			baseUrl: 'https://build-os.com'
		});
		expect(email.text).toContain('Open 9takes: https://build-os.com/projects/p-1');
		expect(email.text + email.html).not.toContain('joined=1');
		expect(email.text).toContain('won’t be able to open this project');
	});

	it('skips a request that was not approved', async () => {
		const sendEmail = vi.fn();
		const outcome = await sendPeopleRequestApprovedEmail('req-1', {
			admin: fakeAdmin({ people_requests: { ...approved, status: 'declined' } }),
			mailer: { sendEmail }
		});
		expect(outcome).toBe('skipped');
		expect(sendEmail).not.toHaveBeenCalled();
	});
});

describe('upgrade emails (tasker 140)', () => {
	it('does not present earlier invite settlements as newly approved access', async () => {
		const sendEmail = vi.fn().mockResolvedValue({ success: true });
		const outcome = await sendPeopleRequestApprovedEmail('req-partial', {
			admin: fakeAdmin({
				people_requests: {
					id: 'req-partial',
					from_user_id: SAM.id,
					to_user_id: OWNER.id,
					status: 'approved',
					kind: 'upgrade',
					decision: [
						{
							project_id: 'p1',
							role: 'viewer',
							agent_access: 'read',
							need: 'agents_read',
							status: 'joined_elsewhere'
						},
						{
							project_id: 'p2',
							role: 'editor',
							agent_access: 'write',
							need: 'edit',
							status: 'already_member'
						}
					]
				},
				onto_projects: [
					{ id: 'p1', name: '9takes' },
					{ id: 'p2', name: 'Cadre' }
				],
				users: [OWNER, SAM]
			}),
			mailer: { sendEmail },
			baseUrl: 'https://build-os.com'
		});
		expect(outcome).toBe('sent');
		const [sent] = sendEmail.mock.calls[0]!;
		expect(sent.subject).toBe('DJ made you an editor of Cadre');
		expect(sent.body).toContain('https://build-os.com/projects/p2');
		expect(sent.body + sent.html).not.toContain('9takes');
		expect(sent.body + sent.html).not.toContain('joined=1');
	});

	it('lists mixed upgrades accurately and opens the approved project choices', () => {
		const email = buildUpgradeApprovedEmail({
			owner: OWNER,
			projects: [
				{ id: 'p1', name: '9takes', role: 'editor', agent_access: 'write', need: 'edit' },
				{
					id: 'p2',
					name: 'Cadre',
					role: 'viewer',
					agent_access: 'read',
					need: 'agents_read'
				}
			],
			baseUrl: 'https://build-os.com'
		});
		expect(email.subject).toBe('DJ updated your access to 2 projects');
		expect(email.text).toContain('9takes: You’re an editor.');
		expect(email.text).toContain('Cadre: You’re a viewer.');
		expect(email.text).toContain('/profile?tab=people#requests');
		expect(email.text + email.html).not.toContain('joined=1');
	});

	const requester = { name: 'DJ', username: 'djwayne' };

	it('tells the owner what the member’s agent asked for, and that nothing changes yet', () => {
		const email = buildUpgradeRequestEmail({
			requester,
			projectNames: ['9takes'],
			need: 'agents_write',
			agentLabel: 'Claude',
			hasNote: true,
			reviewUrl: 'https://build-os.com/profile?tab=people#requests',
			expiresAt: null
		});
		expect(email.subject).toBe('DJ wants their agents to make changes in 9takes');
		expect(email.text).toContain('Claude asked for them');
		expect(email.text).toContain('Nothing changes until you choose');
		expect(email.text).toContain('change what DJ created or is assigned to');
		expect(email.html).not.toContain('@example.com');

		const several = buildUpgradeRequestEmail({
			requester,
			projectNames: ['9takes', 'Cadre'],
			need: 'edit',
			agentLabel: null,
			hasNote: false,
			reviewUrl: 'https://build-os.com/profile?tab=people#requests',
			expiresAt: null
		});
		expect(several.subject).toBe(
			'DJ wants to edit 2 of your projects, with their agents able to make changes'
		);
	});

	it('tells the member their agent can pick up where it left off', () => {
		const email = buildUpgradeApprovedEmail({
			owner: { name: 'Sam', username: null },
			projects: [
				{
					id: 'p1',
					name: '9takes',
					role: 'editor',
					agent_access: 'write',
					need: 'agents_write'
				}
			],
			baseUrl: 'https://build-os.com'
		});
		expect(email.subject).toBe('Sam let your agents make changes in 9takes');
		expect(email.text).toContain('pick up where it left off');
		expect(email.text).toContain('https://build-os.com/projects/p1');
	});
});
