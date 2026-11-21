// apps/web/src/routes/api/onto/projects/[id]/entity-collaboration/server.test.ts
//
// Pinging or assigning a teammate. Members' email addresses are read on the server to deliver
// the ping and must never reach another member: the picker learns only whether email works.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT = '10000000-0000-4000-8000-000000000001';
const TASK = '20000000-0000-4000-8000-000000000002';
const SENDER_ACTOR = '30000000-0000-4000-8000-000000000003';
const TARGET_ACTOR = '40000000-0000-4000-8000-000000000004';
const NO_EMAIL_ACTOR = '50000000-0000-4000-8000-000000000005';
const TARGET_EMAIL = 'private-teammate@example.test';

const mocks = vi.hoisted(() => ({
	access: vi.fn(),
	sendEmail: vi.fn(),
	notify: vi.fn(),
	emails: vi.fn()
}));

vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$env/static/public', () => ({ PUBLIC_APP_URL: 'https://build-os.com' }));
vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: mocks.access
}));
vi.mock('$lib/services/email-service', () => ({
	EmailService: class {
		sendEmail = mocks.sendEmail;
	}
}));
vi.mock('$lib/server/tracked-in-app-notification.service', () => ({
	createTrackedInAppNotification: mocks.notify
}));
vi.mock('$lib/server/actor-emails', () => ({ loadActorEmails: mocks.emails }));
vi.mock('../../../shared/error-logging', () => ({ logOntologyApiError: vi.fn() }));

const MEMBERS = [
	{
		id: 'm1',
		project_id: PROJECT,
		actor_id: SENDER_ACTOR,
		role_key: 'editor',
		actor: { id: SENDER_ACTOR, user_id: 'sender-user', name: 'Sender' }
	},
	{
		id: 'm2',
		project_id: PROJECT,
		actor_id: TARGET_ACTOR,
		role_key: 'owner',
		actor: { id: TARGET_ACTOR, user_id: 'target-user', name: 'Target' }
	},
	{
		id: 'm3',
		project_id: PROJECT,
		actor_id: NO_EMAIL_ACTOR,
		role_key: 'viewer',
		actor: { id: NO_EMAIL_ACTOR, user_id: null, name: 'No Email' }
	}
];

/** A PostgREST-style query whose result depends on the table and on single vs. list reads. */
function fakeSupabase() {
	const from = (table: string) => {
		const filters: Record<string, unknown> = {};
		const single = () => {
			if (table === 'onto_tasks')
				return { id: TASK, project_id: PROJECT, title: 'Draft the launch plan' };
			if (table === 'onto_projects') return { name: 'Launch' };
			if (table === 'onto_actors')
				return { id: SENDER_ACTOR, user_id: 'sender-user', name: 'Sender' };
			if (table === 'onto_project_members')
				return MEMBERS.find((member) => member.actor_id === filters.actor_id) ?? null;
			return null;
		};
		const list = () => (table === 'onto_project_members' ? MEMBERS : []);
		const query: Record<string, unknown> = {
			select: () => query,
			eq: (key: string, value: unknown) => {
				filters[key] = value;
				return query;
			},
			is: () => query,
			order: () => query,
			delete: () => query,
			insert: async () => ({ error: null }),
			maybeSingle: async () => ({ data: single(), error: null }),
			then: (resolve: (value: unknown) => unknown) =>
				Promise.resolve({ data: list(), error: null }).then(resolve)
		};
		return query;
	};
	return { from };
}

vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: () => fakeSupabase() }));

import { GET, POST } from './+server';

function event(init: { method: 'GET' | 'POST'; search?: string; body?: unknown }) {
	const url = new URL(
		`https://build-os.com/api/onto/projects/${PROJECT}/entity-collaboration${init.search ?? ''}`
	);
	return {
		params: { id: PROJECT },
		url,
		request: new Request(url, {
			method: init.method,
			headers: { 'content-type': 'application/json' },
			body: init.body ? JSON.stringify(init.body) : undefined
		}),
		locals: { supabase: fakeSupabase() }
	} as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.access.mockResolvedValue({
		ok: true,
		projectId: PROJECT,
		actorId: SENDER_ACTOR,
		userId: 'sender-user'
	});
	mocks.sendEmail.mockResolvedValue({ success: true });
	mocks.notify.mockResolvedValue({ success: true });
	mocks.emails.mockImplementation(async (ids: string[]) => {
		const known = new Map([
			[TARGET_ACTOR, TARGET_EMAIL],
			[SENDER_ACTOR, 'sender@example.test']
		]);
		return new Map(ids.filter((id) => known.has(id)).map((id) => [id, known.get(id)!]));
	});
});

describe('entity collaboration and member email addresses', () => {
	it('tells the picker who can be emailed without sending any address', async () => {
		const response = await GET(
			event({ method: 'GET', search: `?entity_type=task&entity_id=${TASK}` }) as never
		);
		const text = await response.text();
		const members = JSON.parse(text).data.members as Array<Record<string, unknown>>;

		expect(response.status).toBe(200);
		expect(
			Object.fromEntries(members.map((member) => [member.actor_id, member.can_email]))
		).toEqual({ [SENDER_ACTOR]: true, [TARGET_ACTOR]: true, [NO_EMAIL_ACTOR]: false });
		expect(text).not.toContain('@example.test');
	});

	it('delivers an email ping to the address but never returns it to the sender', async () => {
		const response = await POST(
			event({
				method: 'POST',
				body: {
					entity_type: 'task',
					entity_id: TASK,
					actor_id: TARGET_ACTOR,
					action: 'ping',
					channel: 'email',
					message: 'Can you look at this?'
				}
			})
		);
		const text = await response.text();
		const data = JSON.parse(text).data;

		expect(response.status).toBe(200);
		expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: TARGET_EMAIL }));
		expect(data.delivered).toBe(true);
		expect(data.targetActor).toEqual({
			id: TARGET_ACTOR,
			user_id: 'target-user',
			name: 'Target'
		});
		expect(text).not.toContain(TARGET_EMAIL);
	});

	it('does not return the address on an in-app ping either', async () => {
		const response = await POST(
			event({
				method: 'POST',
				body: {
					entity_type: 'task',
					entity_id: TASK,
					actor_id: TARGET_ACTOR,
					action: 'ping',
					channel: 'in_app',
					message: 'Can you look at this?'
				}
			})
		);
		const text = await response.text();

		expect(response.status).toBe(200);
		expect(mocks.sendEmail).not.toHaveBeenCalled();
		expect(mocks.notify).toHaveBeenCalledOnce();
		expect(text).not.toContain('@example.test');
	});
});
