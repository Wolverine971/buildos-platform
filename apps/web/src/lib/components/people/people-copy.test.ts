// apps/web/src/lib/components/people/people-copy.test.ts
import { describe, expect, it } from 'vitest';
import {
	agentAccessAllowed,
	agentAccessDescription,
	agentAccessLabel,
	fitAgentAccessToRole,
	isAgentAccess,
	matchProjectHint,
	outgoingStatusLabel,
	requestOutcomeMessage
} from './people-copy';
import { personName, readFoundPerson, readPeopleRequests } from './people-types';

describe('agent access rules', () => {
	it('allows Write only for people who can edit', () => {
		expect(agentAccessAllowed('editor', 'write')).toBe(true);
		expect(agentAccessAllowed('owner', 'write')).toBe(true);
		expect(agentAccessAllowed('viewer', 'write')).toBe(false);
		expect(agentAccessAllowed('viewer', 'read')).toBe(true);
		expect(agentAccessAllowed('viewer', 'off')).toBe(true);
	});

	it('drops Write to Read when the role becomes Viewer', () => {
		expect(fitAgentAccessToRole('viewer', 'write')).toBe('read');
		expect(fitAgentAccessToRole('viewer', 'off')).toBe('off');
		expect(fitAgentAccessToRole('editor', 'write')).toBe('write');
	});

	it('labels and describes each setting in plain words', () => {
		expect(agentAccessLabel('off')).toBe('Off');
		expect(agentAccessLabel('read')).toBe('Read');
		expect(agentAccessLabel('write')).toBe('Write');
		expect(agentAccessDescription('read')).toBe('Their agents can read this project.');
		expect(agentAccessDescription('off')).toContain('can’t open');
		expect(agentAccessDescription('write')).toContain('created or is assigned to');
		expect(isAgentAccess('write')).toBe(true);
		expect(isAgentAccess('admin')).toBe(false);
	});
});

describe('requestOutcomeMessage', () => {
	it('maps every create_people_request status to a plain message', () => {
		expect(requestOutcomeMessage({ status: 'pending' }, 'Sam')).toEqual({
			tone: 'success',
			message: 'Request sent. Sam will see it in BuildOS and choose what to share with you.'
		});
		expect(
			requestOutcomeMessage({ status: 'pending', already_pending: true }, 'Sam').tone
		).toBe('info');
		expect(requestOutcomeMessage({ status: 'not_found' }, 'Sam').message).toContain(
			'No one with that handle'
		);
		expect(requestOutcomeMessage({ status: 'self' }, 'Sam').message).toBe(
			'That’s your own handle.'
		);
		expect(requestOutcomeMessage({ status: 'declined_recently' }, 'Sam').message).toContain(
			'30 days'
		);
		expect(
			requestOutcomeMessage({ status: 'rate_limited', reason: 'too_many_pending' }, 'Sam')
				.message
		).toContain('10 requests');
		expect(
			requestOutcomeMessage({ status: 'rate_limited', reason: 'agent_daily_limit' }, 'Sam')
				.message
		).toContain('tomorrow');
		expect(requestOutcomeMessage({ status: 'agent_requests_off' }, 'Sam').message).toContain(
			'agents'
		);
		expect(requestOutcomeMessage({ status: 'weird' }, 'Sam').tone).toBe('error');
	});

	it('never uses em dashes in copy', () => {
		const statuses = [
			'pending',
			'not_found',
			'self',
			'agent_requests_off',
			'declined_recently',
			'rate_limited'
		];
		for (const status of statuses) {
			expect(requestOutcomeMessage({ status }, 'Sam').message).not.toContain('—');
		}
		for (const access of ['off', 'read', 'write']) {
			expect(agentAccessDescription(access)).not.toContain('—');
		}
	});

	it('labels outgoing statuses', () => {
		expect(outgoingStatusLabel('pending')).toBe('Waiting for an answer');
		expect(outgoingStatusLabel('approved')).toBe('Shared with you');
		expect(outgoingStatusLabel('expired')).toBe('Expired');
	});
});

describe('matchProjectHint', () => {
	const projects = [
		{ id: 'a', name: '9takes' },
		{ id: 'b', name: '9takes Marketing' },
		{ id: 'c', name: 'BuildOS' }
	];

	it('prefers exact (case-insensitive) matches', () => {
		expect(matchProjectHint(projects, ' 9Takes ')).toEqual(['a']);
	});

	it('falls back to names and hints that contain each other', () => {
		expect(matchProjectHint(projects, 'marketing')).toEqual(['b']);
		expect(matchProjectHint(projects, 'the buildos project')).toEqual(['c']);
	});

	it('pre-checks nothing without a usable hint', () => {
		expect(matchProjectHint(projects, null)).toEqual([]);
		expect(matchProjectHint(projects, ' ')).toEqual([]);
		expect(matchProjectHint(projects, 'xy')).toEqual([]);
	});
});

describe('people readers', () => {
	it('reads list_people_requests output and drops malformed rows', () => {
		const result = readPeopleRequests({
			incoming: [
				{
					id: 'r1',
					created_at: '2026-10-23T00:00:00Z',
					expires_at: '2026-11-06T00:00:00Z',
					role_requested: 'editor',
					project_hint: '9takes',
					note: 'Hi',
					via: 'agent',
					via_agent_label: 'Claude',
					from: { name: 'Sam', handle: 'sam', email: null }
				},
				{ id: 'missing-created-at' },
				'nonsense'
			],
			outgoing: [
				{
					id: 'o1',
					created_at: '2026-10-22T00:00:00Z',
					status: 'blocked',
					role_requested: 'viewer',
					to: { name: null, handle: 'dj' }
				}
			]
		});
		expect(result.incoming).toHaveLength(1);
		expect(result.incoming[0]).toMatchObject({
			id: 'r1',
			role_requested: 'editor',
			via: 'agent',
			via_agent_label: 'Claude',
			from: { name: 'Sam', handle: 'sam', email: null }
		});
		// Unknown statuses read as waiting, never as something the DB didn't say.
		expect(result.outgoing[0]?.status).toBe('pending');
	});

	it('reads a found person and ignores not-found results', () => {
		expect(readFoundPerson({ found: false, handle: 'sam' })).toBeNull();
		expect(
			readFoundPerson({
				found: true,
				is_self: false,
				handle: 'sam',
				name: 'Sam',
				bio: null,
				accepts_agent_requests: true,
				relationship: { pending_request: true, projects_shared_with_you: 2 }
			})
		).toEqual({
			handle: 'sam',
			name: 'Sam',
			bio: null,
			is_self: false,
			accepts_agent_requests: true,
			relationship: { pending_request: true, projects_shared_with_you: 2 }
		});
	});

	it('names people by name, then handle, then email', () => {
		expect(personName({ name: 'Sam', handle: 'sam' })).toBe('Sam');
		expect(personName({ name: null, handle: 'sam' })).toBe('@sam');
		expect(personName({ name: ' ', handle: null, email: 'sam@example.com' })).toBe(
			'sam@example.com'
		);
		expect(personName({})).toBe('Someone');
	});
});

describe('invite wording', () => {
	it('says what the invited person can do, plainly and without em dashes', async () => {
		const copy = await import('./people-copy');
		const lines = [
			copy.inviteeRoleSentence('viewer'),
			copy.inviteeRoleSentence('editor'),
			copy.inviteeAgentSentence('off'),
			copy.inviteeAgentSentence('read'),
			copy.inviteeAgentSentence('write'),
			copy.inviteLinkSummary({
				role_key: 'viewer',
				agent_access: 'read',
				expires_at: '2026-10-30T12:00:00.000Z'
			}),
			...['expired', 'reset', 'turned_off', 'removed', 'not_found'].flatMap((status) => {
				const problem = copy.inviteLinkProblem(status, '9takes');
				return [problem.title, problem.message];
			})
		];
		for (const line of lines) expect(line).not.toContain('—');

		expect(
			copy.inviteLinkSummary({
				role_key: 'viewer',
				agent_access: 'read',
				expires_at: '2026-10-30T12:00:00.000Z'
			})
		).toBe(
			'Anyone with this link can join as a viewer until Oct 30. Their agents can read it.'
		);
		expect(copy.roleWithArticle('editor')).toBe('an editor');
		expect(copy.inviteLinkProblem('removed', '9takes').title).toBe(
			'You were removed from 9takes'
		);
		expect(
			copy.inviteLinkSummary({
				role_key: 'editor',
				agent_access: 'write',
				expires_at: '2026-10-30T12:00:00.000Z',
				expired: true
			})
		).toContain('stopped working on Oct 30');
	});
});
