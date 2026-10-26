// apps/web/src/lib/server/email-campaigns/audience.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/supabase/admin', async () => {
	const { createFakeSupabase } = await import('./fake-supabase.test-helper');
	return {
		createAdminSupabaseClient: () => createFakeSupabase({ email_suppressions: [] }).client
	};
});

import {
	loadAudienceData,
	normalizeAudience,
	resolveAudienceFromData,
	searchPeople,
	segmentCountsFromData,
	segmentMembers,
	type AudienceData
} from './audience';
import { createFakeSupabase } from './fake-supabase.test-helper';

const NOW = new Date('2026-10-25T12:00:00.000Z');
const LONG_AGO = '2026-08-01T00:00:00.000Z';
const RECENT = '2026-10-20T00:00:00.000Z';

function user(overrides: Record<string, any>) {
	return {
		id: overrides.id,
		email: overrides.email,
		name: overrides.name ?? null,
		created_at: overrides.created_at ?? '2026-01-15T00:00:00.000Z',
		last_visit: overrides.last_visit ?? null,
		is_admin: overrides.is_admin ?? false,
		deletion_status: overrides.deletion_status ?? null,
		onboarding_intent: overrides.onboarding_intent ?? null
	};
}

function beta(overrides: Record<string, any>) {
	return {
		id: overrides.id,
		email: overrides.email,
		full_name: overrides.full_name ?? null,
		job_title: overrides.job_title ?? null,
		company_name: overrides.company_name ?? null,
		why_interested: overrides.why_interested ?? null,
		biggest_challenge: overrides.biggest_challenge ?? null,
		productivity_tools: overrides.productivity_tools ?? null,
		signup_status: overrides.signup_status ?? 'approved',
		created_at: overrides.created_at ?? '2025-07-10T00:00:00.000Z'
	};
}

function fixture(): AudienceData {
	return {
		users: [
			user({ id: 'u-none', email: 'None@Example.com', name: 'nora none' }),
			user({
				id: 'u-quiet',
				email: 'quiet@example.com',
				name: 'Quinn Quiet',
				last_visit: LONG_AGO,
				created_at: '2026-02-01T00:00:00.000Z'
			}),
			user({ id: 'u-active', email: 'active@example.com', last_visit: RECENT }),
			user({ id: 'u-admin', email: 'admin@example.com', is_admin: true }),
			user({ id: 'u-leaving', email: 'leaving@example.com', deletion_status: 'pending' }),
			user({ id: 'u-unsub', email: 'unsub@example.com' }),
			user({ id: 'u-brief-only', email: 'brief@example.com' }),
			user({ id: 'u-bounced', email: 'bounced@example.com' })
		],
		betaSignups: [
			beta({
				id: 'b-quiet',
				email: 'quiet@example.com',
				full_name: 'Quinn Q',
				why_interested: 'Too many tabs',
				created_at: '2025-07-09T00:00:00.000Z'
			}),
			beta({
				id: 'b-only',
				email: 'betaonly@example.com',
				full_name: 'Bea Only',
				biggest_challenge: 'prioritizing'
			}),
			beta({ id: 'b-rejected', email: 'nope@example.com', signup_status: 'rejected' }),
			beta({ id: 'b-typo', email: 'typo@example' })
		],
		projectsByUser: new Map([
			['u-quiet', { count: 2, lastTitle: 'Synapse server', lastUpdatedAt: '2026-07-01' }],
			['u-active', { count: 1, lastTitle: 'Live thing', lastUpdatedAt: '2026-10-19' }]
		]),
		suppressions: [
			{ email: 'unsub@example.com', scope: 'lifecycle', reason: 'unsubscribe' },
			{ email: 'brief@example.com', scope: 'daily_brief', reason: 'unsubscribe' },
			{ email: 'bounced@example.com', scope: 'daily_brief', reason: 'hard_bounce' }
		]
	};
}

describe('segmentMembers', () => {
	it('finds users with no project, quiet project owners, and beta signups without accounts', () => {
		const data = fixture();
		expect(segmentMembers('no_project', data, NOW).sort()).toEqual([
			'admin@example.com',
			'bounced@example.com',
			'brief@example.com',
			'leaving@example.com',
			'none@example.com',
			'unsub@example.com'
		]);
		expect(segmentMembers('went_quiet', data, NOW)).toEqual(['quiet@example.com']);
		expect(segmentMembers('beta_no_account', data, NOW).sort()).toEqual([
			'betaonly@example.com',
			'typo@example'
		]);
	});
});

describe('resolveAudienceFromData', () => {
	it('leaves out unsubscribed, bounced, admins, deleting accounts and invalid addresses', () => {
		const { people, exclusions } = resolveAudienceFromData(
			{ segments: ['no_project', 'beta_no_account'], people: [], removed_emails: [] },
			fixture(),
			NOW
		);

		expect(people.map((person) => person.email).sort()).toEqual([
			'betaonly@example.com',
			'brief@example.com',
			'none@example.com'
		]);
		const reasons = Object.fromEntries(exclusions.map((entry) => [entry.email, entry.reason]));
		expect(reasons).toEqual({
			'admin@example.com': 'admin',
			'bounced@example.com': 'bounced',
			'leaving@example.com': 'deleting_account',
			'unsub@example.com': 'unsubscribed',
			'typo@example': 'invalid_email'
		});
	});

	it('keeps each person once, preferring hand-added people, and honors removals', () => {
		const { people, exclusions } = resolveAudienceFromData(
			{
				segments: ['went_quiet', 'no_project'],
				people: [{ email: ' Quiet@Example.com ', name: 'Typed Name' }],
				removed_emails: ['NONE@example.com']
			},
			fixture(),
			NOW
		);

		const quiet = people.filter((person) => person.email === 'quiet@example.com');
		expect(quiet).toHaveLength(1);
		expect(quiet[0]?.segment).toBe('manual');
		expect(exclusions.find((entry) => entry.email === 'none@example.com')?.reason).toBe(
			'removed'
		);
	});

	it('builds merge facts from the account and the beta form', () => {
		const { people } = resolveAudienceFromData(
			{
				segments: ['went_quiet', 'no_project', 'beta_no_account'],
				people: [],
				removed_emails: []
			},
			fixture(),
			NOW
		);
		const quiet = people.find((person) => person.email === 'quiet@example.com');
		expect(quiet).toMatchObject({
			name: 'Quinn Quiet',
			first_name: 'Quinn',
			user_id: 'u-quiet',
			beta_signup_id: 'b-quiet',
			segment: 'went_quiet'
		});
		// The beta form came first, so they "signed up" then.
		expect(quiet?.context).toMatchObject({
			has_account: true,
			signed_up_at: '2025-07-09T00:00:00.000Z',
			signup_month: 'July 2025',
			project_count: 2,
			last_project: 'Synapse server',
			why_interested: 'Too many tabs'
		});

		const none = people.find((person) => person.email === 'none@example.com');
		expect(none?.first_name).toBe('Nora');
		expect(none?.context.project_count).toBe(0);

		const betaOnly = people.find((person) => person.email === 'betaonly@example.com');
		expect(betaOnly).toMatchObject({ user_id: null, beta_signup_id: 'b-only' });
		expect(betaOnly?.context).toMatchObject({
			has_account: false,
			project_count: null,
			biggest_challenge: 'prioritizing'
		});
	});

	it('resolves a pasted address nobody knows as a manual person', () => {
		const { people } = resolveAudienceFromData(
			{
				segments: [],
				people: [{ email: 'stranger@example.com', name: 'sam stranger' }],
				removed_emails: []
			},
			fixture(),
			NOW
		);
		expect(people).toEqual([
			expect.objectContaining({
				email: 'stranger@example.com',
				name: 'sam stranger',
				first_name: 'Sam',
				user_id: null,
				beta_signup_id: null,
				segment: 'manual'
			})
		]);
	});
});

describe('segmentCountsFromData', () => {
	it('counts each segment after exclusions', () => {
		const counts = segmentCountsFromData(fixture(), NOW);
		expect(counts.map((entry) => [entry.segment, entry.count])).toEqual([
			['went_quiet', 1],
			['no_project', 2],
			['beta_no_account', 1]
		]);
		expect(counts[0]?.label).toBe('Used it, went quiet');
	});
});

describe('normalizeAudience', () => {
	it('drops unknown segments and bad people, lowercases and dedupes', () => {
		expect(
			normalizeAudience({
				segments: ['no_project', 'everyone', 'no_project'],
				people: [
					{ email: 'A@x.com', name: '  Ann ' },
					{ email: 'a@x.com' },
					{ name: 'no email' },
					'junk'
				],
				removed_emails: ['B@X.com', 'b@x.com', 7]
			})
		).toEqual({
			segments: ['no_project'],
			people: [{ email: 'a@x.com', name: 'Ann', user_id: null, beta_signup_id: null }],
			removed_emails: ['b@x.com']
		});
		expect(normalizeAudience(null)).toEqual({ segments: [], people: [], removed_emails: [] });
	});
});

describe('loadAudienceData', () => {
	it('maps projects to their owners through actors', async () => {
		const { client } = createFakeSupabase({
			users: [user({ id: 'u1', email: 'one@example.com' })],
			onto_actors: [
				{ id: 'a1', user_id: 'u1' },
				{ id: 'a2', user_id: null }
			],
			onto_projects: [
				{
					created_by: 'a1',
					name: 'Older',
					updated_at: '2026-01-01',
					kind: 'project',
					deleted_at: null
				},
				{
					created_by: 'a1',
					name: 'Newer',
					updated_at: '2026-05-01',
					kind: 'project',
					deleted_at: null
				},
				{
					created_by: 'a1',
					name: 'Workspace',
					updated_at: '2026-09-01',
					kind: 'workspace',
					deleted_at: null
				},
				{
					created_by: 'a1',
					name: 'Gone',
					updated_at: '2026-09-02',
					kind: 'project',
					deleted_at: '2026-09-03'
				}
			],
			beta_signups: []
		});

		const data = await loadAudienceData(client, { readSuppressions: async () => [] });
		expect(data.projectsByUser.get('u1')).toEqual({
			count: 2,
			lastTitle: 'Newer',
			lastUpdatedAt: '2026-05-01'
		});
	});
});

describe('searchPeople', () => {
	it('merges a user and their beta signup into one result', async () => {
		const { client } = createFakeSupabase({
			users: [
				{ id: 'u1', email: 'Kay@Example.com', name: 'Kay Dee', created_at: '2026-01-01' }
			],
			beta_signups: [
				{
					id: 'b1',
					email: 'kay@example.com',
					full_name: 'Kay D',
					created_at: '2025-07-01'
				},
				{
					id: 'b2',
					email: 'kayla@example.com',
					full_name: 'Kayla',
					created_at: '2025-08-01'
				}
			]
		});

		const results = await searchPeople(client, 'kay');
		expect(results).toEqual([
			{
				email: 'kay@example.com',
				name: 'Kay Dee',
				user_id: 'u1',
				beta_signup_id: 'b1',
				kind: 'user',
				signed_up_at: '2026-01-01'
			},
			expect.objectContaining({ email: 'kayla@example.com', kind: 'beta_signup' })
		]);
		expect(await searchPeople(client, 'k')).toEqual([]);
	});
});
