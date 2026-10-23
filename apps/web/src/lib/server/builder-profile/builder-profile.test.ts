// apps/web/src/lib/server/builder-profile/builder-profile.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	activityIsStale,
	askToJoin,
	BuilderProfileError,
	follow,
	parseLinks,
	parsePlacements
} from './builder-profile.service';
import { decideDraft, draftPage, draftWeeklyUpdates } from './builder-profile-drafts';

// A tiny stand-in for the Supabase query builder: every chain resolves to the result
// queued for its table (in call order), and calls are recorded.
function fakeClient(options: {
	tables?: Record<string, Array<{ data?: unknown; error?: unknown }>>;
	rpc?: Record<string, (args: any) => { data?: unknown; error?: unknown }>;
}) {
	const calls: { table: string; op: string; args: unknown[] }[] = [];
	const queues = Object.fromEntries(
		Object.entries(options.tables ?? {}).map(([k, v]) => [k, [...v]])
	);
	const from = (table: string) => {
		const result = () => {
			const next = queues[table]?.shift() ?? { data: [], error: null };
			return { data: next.data ?? null, error: next.error ?? null };
		};
		let settled: { data: unknown; error: unknown } | null = null;
		const chain: any = {};
		for (const op of ['select', 'eq', 'in', 'is', 'gte', 'order', 'limit', 'insert', 'update', 'delete', 'upsert']) {
			chain[op] = (...args: unknown[]) => {
				calls.push({ table, op, args });
				return chain;
			};
		}
		chain.maybeSingle = () => {
			settled ??= result();
			const data = Array.isArray(settled.data) ? (settled.data[0] ?? null) : settled.data;
			return Promise.resolve({ data, error: settled.error });
		};
		chain.then = (resolve: any, reject: any) => {
			settled ??= result();
			return Promise.resolve(settled).then(resolve, reject);
		};
		return chain;
	};
	const rpc = vi.fn(async (name: string, args: any) => {
		const handler = options.rpc?.[name];
		const out = handler ? handler(args) : { data: null };
		return { data: out.data ?? null, error: out.error ?? null };
	});
	return { client: { from, rpc } as any, calls, rpc };
}

const PROJECT = '05c40ed8-9dbe-4893-bd64-8aeec90eab40';
const OTHER = '7bb400ff-e299-40b0-9a4b-e6081f2e6ef8';

describe('parseLinks', () => {
	it('normalizes URLs and keeps order', () => {
		const links = parseLinks([
			{ kind: 'social', url: 'x.com/djwayne3' },
			{ kind: 'link', url: 'https://9takes.com', label: ' 9takes ', audience: 'collaborators' }
		]);
		expect(links).toEqual([
			{ kind: 'social', url: 'https://x.com/djwayne3', label: null, note: null, audience: 'anyone' },
			{ kind: 'link', url: 'https://9takes.com/', label: '9takes', note: null, audience: 'collaborators' }
		]);
	});

	it('refuses unsafe or too many links', () => {
		expect(() => parseLinks([{ kind: 'link', url: 'javascript:alert(1)' }])).toThrow(BuilderProfileError);
		expect(() => parseLinks(Array.from({ length: 31 }, () => ({ url: 'https://a.co' })))).toThrow(
			/up to 30/
		);
	});
});

describe('parsePlacements', () => {
	it('reads levels, goals and text, defaulting audience to anyone', () => {
		const [p] = parsePlacements([
			{ project_id: PROJECT, level: 'live', pitch: ' Enneagram ', goal_ids: [OTHER] }
		]);
		expect(p).toMatchObject({ project_id: PROJECT, level: 'live', pitch: 'Enneagram', goal_ids: [OTHER], audience: 'anyone' });
	});

	it('refuses duplicates, bad ids, more than 3 goals and long text', () => {
		expect(() => parsePlacements([{ project_id: PROJECT }, { project_id: PROJECT }])).toThrow(/twice/);
		expect(() => parsePlacements([{ project_id: 'nope' }])).toThrow(/Unknown project/);
		expect(() =>
			parsePlacements([{ project_id: PROJECT, goal_ids: [OTHER, OTHER, OTHER, OTHER] }])
		).toThrow(/3 goals/);
		expect(() => parsePlacements([{ project_id: PROJECT, pitch: 'x'.repeat(201) }])).toThrow(/200/);
	});
});

describe('activityIsStale', () => {
	it('refreshes after about 20 hours', () => {
		const now = Date.parse('2026-10-23T12:00:00Z');
		expect(activityIsStale(null, now)).toBe(true);
		expect(activityIsStale('2026-10-23T00:00:00Z', now)).toBe(false);
		expect(activityIsStale('2026-10-22T10:00:00Z', now)).toBe(true);
	});
});

function publishedView(overrides: Record<string, unknown> = {}) {
	return {
		found: true,
		status: 'published',
		viewer: { signed_in: true, is_owner: false, works_with: false, follows: false, ask_pending: false },
		profile: { handle: 'djwayne', name: 'DJ Wayne' },
		settings: {},
		links: [],
		projects: [
			{ id: PROJECT, level: 'live', name: '9takes', audience: 'anyone' },
			{ id: OTHER, level: 'listed', name: 'Radar', audience: 'anyone' }
		],
		writing: [],
		builds_with: [],
		...overrides
	};
}

describe('askToJoin', () => {
	const target = [{ user_id: 'owner', username: 'djwayne', status: 'published', activity_refreshed_at: null }];

	it('sends an ordinary people request naming the project and counts the ask', async () => {
		const admin = fakeClient({
			rpc: { get_builder_profile: () => ({ data: publishedView() }), builder_profile_target: () => ({ data: target }) }
		});
		const user = fakeClient({ rpc: { create_people_request: () => ({ data: { status: 'pending' } }) } });
		const outcome = await askToJoin({
			supabase: user.client,
			admin: admin.client,
			viewerId: 'viewer',
			handle: 'djwayne',
			projectId: PROJECT,
			note: 'I can help with beta.'
		});
		expect(outcome).toBe('sent');
		expect(user.rpc).toHaveBeenCalledWith('create_people_request', {
			p_handle: 'djwayne',
			p_role: 'viewer',
			p_project_hint: '9takes',
			p_note: 'From your page, about 9takes: I can help with beta.'
		});
		expect(admin.rpc).toHaveBeenCalledWith('bump_builder_profile_stat', { p_user_id: 'owner', p_kind: 'ask' });
	});

	it('only asks about live projects, and maps waiting asks', async () => {
		const admin = fakeClient({ rpc: { get_builder_profile: () => ({ data: publishedView() }) } });
		const user = fakeClient({
			rpc: { create_people_request: () => ({ data: { status: 'pending', already_pending: true } }) }
		});
		await expect(
			askToJoin({ supabase: user.client, admin: admin.client, viewerId: 'v', handle: 'djwayne', projectId: OTHER, note: null })
		).rejects.toThrow(/isn’t on this page/);
		await expect(
			askToJoin({ supabase: user.client, admin: admin.client, viewerId: 'v', handle: 'djwayne', projectId: PROJECT, note: null })
		).resolves.toBe('already_waiting');
	});

	it('treats an owner who turned findability off as unavailable', async () => {
		const admin = fakeClient({ rpc: { get_builder_profile: () => ({ data: publishedView() }) } });
		const user = fakeClient({ rpc: { create_people_request: () => ({ data: { status: 'not_found' } }) } });
		await expect(
			askToJoin({ supabase: user.client, admin: admin.client, viewerId: 'v', handle: 'djwayne', projectId: PROJECT, note: null })
		).resolves.toBe('unavailable');
	});
});

describe('follow', () => {
	it('refuses drafts and yourself', async () => {
		const draft = fakeClient({
			rpc: { builder_profile_target: () => ({ data: [{ user_id: 'o', username: 'x', status: 'draft' }] }) }
		});
		await expect(follow({ admin: draft.client, viewerId: 'v', handle: 'x', projectId: null, on: true })).rejects.toThrow(
			/not found/
		);
		const self = fakeClient({
			rpc: { builder_profile_target: () => ({ data: [{ user_id: 'v', username: 'x', status: 'published' }] }) }
		});
		await expect(follow({ admin: self.client, viewerId: 'v', handle: 'x', projectId: null, on: true })).rejects.toThrow(
			/yourself/
		);
	});

	it('follows a person and counts it once', async () => {
		const admin = fakeClient({
			tables: { builder_follows: [{ data: [{ id: 'f1' }] }] },
			rpc: { builder_profile_target: () => ({ data: [{ user_id: 'o', username: 'x', status: 'published' }] }) }
		});
		await expect(follow({ admin: admin.client, viewerId: 'v', handle: 'x', projectId: null, on: true })).resolves.toEqual({
			following: true
		});
		expect(admin.rpc).toHaveBeenCalledWith('bump_builder_profile_stat', { p_user_id: 'o', p_kind: 'follow' });
	});
});

describe('drafts', () => {
	const owned = { data: [{ project: { id: PROJECT, name: '9takes', description: 'Enneagram', icon_emoji: null, facet_stage: 'execution', state_key: 'active', kind: 'project' } }] };

	it('drafts page text and drops pitches for projects that were not asked about', async () => {
		const admin = fakeClient({
			tables: {
				onto_actors: [{ data: { id: 'actor' } }],
				onto_project_members: [owned],
				users: [{ data: { name: 'DJ Wayne', bio: null } }],
				onto_goals: [{ data: [] }]
			}
		});
		const llm = {
			getJSONResponse: vi.fn(async () => ({
				headline: 'Founder, BuildOS',
				bio: 'I build things.',
				pitches: [
					{ project_id: PROJECT, pitch: 'Enneagram talk, answer first.' },
					{ project_id: OTHER, pitch: 'Not asked for.' }
				]
			}))
		};
		const result = await draftPage({ llm, admin: admin.client, userId: 'u', projectIds: [PROJECT] });
		expect(result).toEqual({
			headline: 'Founder, BuildOS',
			bio: 'I build things.',
			pitches: [{ project_id: PROJECT, pitch: 'Enneagram talk, answer first.' }]
		});
		const prompt = (llm.getJSONResponse.mock.calls[0] as any)[0];
		expect(prompt.operationType).toBe('builder_profile_draft_page');
		expect(prompt.systemPrompt).toMatch(/Never name clients/);
	});

	it('skips the model entirely when nothing moved this week', async () => {
		const admin = fakeClient({
			tables: {
				builder_profile_projects: [
					{ data: [{ project_id: PROJECT, level: 'live', public_name: null, pitch: null, project: { name: '9takes', deleted_at: null, archived_at: null } }] }
				],
				onto_tasks: [{ data: [] }],
				builder_profile_activity_daily: [{ data: [] }]
			}
		});
		const llm = { getJSONResponse: vi.fn() };
		await expect(draftWeeklyUpdates({ llm, admin: admin.client, userId: 'u' })).resolves.toEqual({ created: 0 });
		expect(llm.getJSONResponse).not.toHaveBeenCalled();
	});

	it('writes a Now line and lines only for live projects with done work', async () => {
		const admin = fakeClient({
			tables: {
				builder_profile_projects: [
					{
						data: [
							{ project_id: PROJECT, level: 'live', public_name: null, pitch: null, project: { name: '9takes', deleted_at: null, archived_at: null } },
							{ project_id: OTHER, level: 'listed', public_name: null, pitch: null, project: { name: 'Radar', deleted_at: null, archived_at: null } }
						]
					}
				],
				onto_tasks: [{ data: [{ project_id: PROJECT, title: 'Outreach: a podcaster — pitch sent' }, { project_id: OTHER, title: 'Scan' }] }],
				builder_profile_activity_daily: [{ data: [] }],
				builder_profile_updates: [{ data: null }, { data: null }]
			}
		});
		const llm = {
			getJSONResponse: vi.fn(async () => ({
				now: 'Getting 9takes ready for beta.',
				projects: [
					{ project_id: PROJECT, line: 'Reached out to a few podcasts.' },
					{ project_id: OTHER, line: 'Listed projects get no line.' }
				]
			}))
		};
		await expect(draftWeeklyUpdates({ llm, admin: admin.client, userId: 'u' })).resolves.toEqual({ created: 2 });
		const insert = admin.calls.find((c) => c.table === 'builder_profile_updates' && c.op === 'insert');
		expect((insert?.args[0] as any[]).map((r) => [r.project_id, r.body])).toEqual([
			[null, 'Getting 9takes ready for beta.'],
			[PROJECT, 'Reached out to a few podcasts.']
		]);
	});

	it('publishing a drafted Now line updates the page', async () => {
		const admin = fakeClient({
			tables: {
				builder_profile_updates: [{ data: { id: 'd1', project_id: null, body: 'Draft.', status: 'drafted' } }, { data: null }],
				builder_profiles: [{ data: null }]
			}
		});
		await decideDraft({ admin: admin.client, userId: 'u', draftId: 'd1', action: 'publish', body: 'Edited line.' });
		const pageUpdate = admin.calls.find((c) => c.table === 'builder_profiles' && c.op === 'update');
		expect(pageUpdate?.args[0]).toMatchObject({ now_text: 'Edited line.' });
	});
});
