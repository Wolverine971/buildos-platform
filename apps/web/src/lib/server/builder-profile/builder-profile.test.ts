// apps/web/src/lib/server/builder-profile/builder-profile.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
	activityIsStale,
	askToJoin,
	BuilderProfileError,
	follow,
	loadBuilderProject,
	parseLinks,
	parsePlacements,
	parseWritingPicks,
	recordEvent,
	replaceLinks,
	replaceWriting
} from './builder-profile.service';
import { decideDraft, draftPage, draftWeeklyUpdates } from './builder-profile-drafts';

// A tiny stand-in for the Supabase query builder: every chain resolves to the result
// queued for its table (in call order), and calls are recorded.
function fakeClient(options: {
	tables?: Record<string, Array<{ data?: unknown; error?: unknown; count?: number | null }>>;
	rpc?: Record<string, (args: any) => { data?: unknown; error?: unknown }>;
}) {
	const calls: { table: string; op: string; args: unknown[] }[] = [];
	const queues = Object.fromEntries(
		Object.entries(options.tables ?? {}).map(([k, v]) => [k, [...v]])
	);
	const from = (table: string) => {
		const result = () => {
			const next = queues[table]?.shift() ?? { data: [], error: null };
			return {
				data: next.data ?? null,
				error: next.error ?? null,
				count: next.count ?? null
			};
		};
		let settled: { data: unknown; error: unknown; count: number | null } | null = null;
		const chain: any = {};
		for (const op of [
			'select',
			'eq',
			'in',
			'is',
			'gte',
			'lt',
			'or',
			'order',
			'limit',
			'insert',
			'update',
			'delete',
			'upsert'
		]) {
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
			{
				kind: 'link',
				url: 'https://9takes.com',
				label: ' 9takes ',
				audience: 'collaborators'
			}
		]);
		expect(links).toEqual([
			{
				kind: 'social',
				url: 'https://x.com/djwayne3',
				label: null,
				note: null,
				audience: 'anyone'
			},
			{
				kind: 'link',
				url: 'https://9takes.com/',
				label: '9takes',
				note: null,
				audience: 'collaborators'
			}
		]);
	});

	it('refuses unsafe or too many links', () => {
		expect(() => parseLinks([{ kind: 'link', url: 'javascript:alert(1)' }])).toThrow(
			BuilderProfileError
		);
		expect(() =>
			parseLinks(Array.from({ length: 31 }, () => ({ url: 'https://a.co' })))
		).toThrow(/up to 30/);
	});
});

describe('replaceLinks', () => {
	it.each([false, true])(
		'lets the database generate link IDs (existing IDs: %s)',
		async (existing) => {
			// The save claims the next links counter first (count = rows that matched).
			const fetch = vi.fn<typeof globalThis.fetch>(
				async () => new Response(null, { status: 204, headers: { 'content-range': '*/1' } })
			);
			const admin = createClient('https://builder-links.test', 'offline-test-key', {
				global: { fetch },
				auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
			});
			const links = parseLinks([
				{ kind: 'social', url: 'x.com/djwayne3' },
				{
					kind: 'link',
					url: 'https://9takes.com',
					label: '9takes',
					audience: 'collaborators'
				}
			]);
			await expect(
				replaceLinks({
					admin,
					userId: PROJECT,
					links: existing ? links.map((link) => ({ ...link, id: OTHER })) : links,
					baseRev: 3
				})
			).resolves.toEqual({ rev: 4 });

			const linkCalls = fetch.mock.calls.filter(([url]) =>
				new URL(String(url)).pathname.endsWith('/builder_profile_links')
			);
			expect(linkCalls).toHaveLength(2);
			const [claimUrl, claimOptions] = fetch.mock.calls.find(
				([, options]) => options?.method === 'PATCH'
			)!;
			expect(new URL(String(claimUrl)).searchParams.get('links_rev')).toBe('eq.3');
			expect(JSON.parse(String(claimOptions?.body))).toEqual({ links_rev: 4 });
			const [deleteUrl, deleteOptions] = linkCalls[0]!;
			expect(deleteOptions?.method).toBe('DELETE');
			expect(new URL(String(deleteUrl)).searchParams.get('user_id')).toBe(`eq.${PROJECT}`);
			const [insertUrl, insertOptions] = linkCalls[1]!;
			expect(insertOptions?.method).toBe('POST');
			expect(new URL(String(insertUrl)).pathname).toBe('/rest/v1/builder_profile_links');
			// Inspect the real client's column list: JSON alone drops undefined properties,
			// but an `id: undefined` key still becomes an explicit null in a bulk insert.
			expect(
				new URL(String(insertUrl)).searchParams.get('columns')?.split(',')
			).not.toContain('"id"');
			expect(JSON.parse(String(insertOptions?.body))).toEqual(
				links.map((link, position) => ({ ...link, user_id: PROJECT, position }))
			);
		}
	);

	it('clears all links without sending an empty insert', async () => {
		const { client, calls } = fakeClient({
			tables: { builder_profiles: [{ data: null }, { count: 1 }] }
		});
		await replaceLinks({ admin: client, userId: PROJECT, links: [], baseRev: 0 });
		expect(calls.filter((call) => call.table === 'builder_profile_links')).toEqual([
			{ table: 'builder_profile_links', op: 'delete', args: [] },
			{ table: 'builder_profile_links', op: 'eq', args: ['user_id', PROJECT] }
		]);
	});

	it('does not insert when deleting the previous links fails, and gives the counter back', async () => {
		const error = { message: 'Delete failed' };
		const { client, calls } = fakeClient({
			tables: {
				builder_profiles: [{ data: null }, { count: 1 }, { data: null }],
				builder_profile_links: [{ error }]
			}
		});
		await expect(
			replaceLinks({
				admin: client,
				userId: PROJECT,
				links: parseLinks([{ url: '9takes.com' }]),
				baseRev: 2
			})
		).rejects.toEqual(error);
		expect(calls.some((call) => call.op === 'insert')).toBe(false);
		const updates = calls.filter((c) => c.table === 'builder_profiles' && c.op === 'update');
		expect(updates.map((c) => c.args[0])).toEqual([{ links_rev: 3 }, { links_rev: 2 }]);
	});

	it('refuses a save from a tab that missed another tab’s save (409)', async () => {
		const { client, calls } = fakeClient({
			tables: { builder_profiles: [{ data: null }, { count: 0 }] }
		});
		const failure = replaceLinks({
			admin: client,
			userId: PROJECT,
			links: parseLinks([{ url: '9takes.com' }]),
			baseRev: 5
		});
		await expect(failure).rejects.toBeInstanceOf(BuilderProfileError);
		await expect(failure).rejects.toMatchObject({ status: 409 });
		expect(calls.some((call) => call.table === 'builder_profile_links')).toBe(false);
	});
});

describe('parsePlacements', () => {
	it('reads levels, goals and text, defaulting audience to anyone', () => {
		const [p] = parsePlacements([
			{ project_id: PROJECT, level: 'live', pitch: ' Enneagram ', goal_ids: [OTHER] }
		]);
		expect(p).toMatchObject({
			project_id: PROJECT,
			level: 'live',
			pitch: 'Enneagram',
			goal_ids: [OTHER],
			audience: 'anyone'
		});
	});

	it('refuses duplicates, bad ids, more than 3 goals and long text', () => {
		expect(() => parsePlacements([{ project_id: PROJECT }, { project_id: PROJECT }])).toThrow(
			/twice/
		);
		expect(() => parsePlacements([{ project_id: 'nope' }])).toThrow(/Unknown project/);
		expect(() =>
			parsePlacements([{ project_id: PROJECT, goal_ids: [OTHER, OTHER, OTHER, OTHER] }])
		).toThrow(/3 goals/);
		expect(() => parsePlacements([{ project_id: PROJECT, pitch: 'x'.repeat(201) }])).toThrow(
			/200/
		);
	});
});

describe('parsePlacements reply_url', () => {
	it('keeps a reply link or email on Live projects only', () => {
		const [live, listed, email] = parsePlacements([
			{ project_id: PROJECT, level: 'live', reply_url: 'calendly.com/dj/beta' },
			{ project_id: OTHER, level: 'listed', reply_url: 'https://ignored.com' },
			{
				project_id: '11111111-1111-4111-8111-111111111111',
				level: 'live',
				reply_url: 'dj@example.com'
			}
		]);
		expect(live!.reply_url).toBe('https://calendly.com/dj/beta');
		expect(listed!.reply_url).toBeNull();
		expect(email!.reply_url).toBe('mailto:dj@example.com');
	});

	it('refuses a reply address that is neither a link nor an email', () => {
		expect(() =>
			parsePlacements([
				{ project_id: PROJECT, level: 'live', reply_url: 'javascript:alert(1)' }
			])
		).toThrow(/web address or an email/);
	});
});

describe('loadBuilderProject', () => {
	const page = {
		found: true,
		status: 'published',
		viewer: {
			signed_in: false,
			is_owner: false,
			works_with: false,
			follows: false,
			ask_pending: false
		},
		profile: { handle: 'djwayne', name: 'DJ Wayne' },
		settings: {
			show_build_log: true,
			show_agent_split: true,
			show_writing: true,
			show_builds_with: true
		},
		projects: [{ id: PROJECT, level: 'live', name: '9takes', audience: 'anyone' }]
	};

	it('reads the page and the project through one RPC, filling empty lists', async () => {
		const { client, rpc } = fakeClient({
			rpc: {
				get_builder_project: () => ({
					data: { found: true, page, project: page.projects[0], activity: null }
				})
			}
		});
		const result = await loadBuilderProject(client, 'djwayne', '9takes');
		expect(rpc).toHaveBeenCalledWith('get_builder_project', {
			p_handle: 'djwayne',
			p_slug: '9takes'
		});
		expect(result.found).toBe(true);
		if (!result.found) return;
		expect(result.project.name).toBe('9takes');
		expect(result.page.links).toEqual([]);
		expect(result.page.writing).toEqual([]);
		expect(result.updates).toEqual([]);
		expect(result.writing).toEqual([]);
		expect(result.built_by).toEqual([]);
		expect(result.activity).toBeUndefined();
	});

	it('is not found when the RPC finds nothing or returns no project', async () => {
		const none = fakeClient({
			rpc: { get_builder_project: () => ({ data: { found: false } }) }
		});
		expect(await loadBuilderProject(none.client, 'djwayne', 'radar')).toEqual({ found: false });
		const bare = fakeClient({
			rpc: { get_builder_project: () => ({ data: { found: true, page } }) }
		});
		expect(await loadBuilderProject(bare.client, 'djwayne', '9takes')).toEqual({
			found: false
		});
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
		viewer: {
			signed_in: true,
			is_owner: false,
			works_with: false,
			follows: false,
			ask_pending: false
		},
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
	const target = [
		{ user_id: 'owner', username: 'djwayne', status: 'published', activity_refreshed_at: null }
	];

	it('sends an ordinary people request naming the project and counts the ask', async () => {
		const admin = fakeClient({
			rpc: {
				get_builder_profile: () => ({ data: publishedView() }),
				builder_profile_target: () => ({ data: target })
			}
		});
		const user = fakeClient({
			rpc: { create_people_request: () => ({ data: { status: 'pending' } }) }
		});
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
		expect(admin.rpc).toHaveBeenCalledWith('bump_builder_profile_stat', {
			p_user_id: 'owner',
			p_kind: 'ask'
		});
	});

	it('only asks about live projects, and maps waiting asks', async () => {
		const admin = fakeClient({
			rpc: { get_builder_profile: () => ({ data: publishedView() }) }
		});
		const user = fakeClient({
			rpc: {
				create_people_request: () => ({
					data: { status: 'pending', already_pending: true }
				})
			}
		});
		await expect(
			askToJoin({
				supabase: user.client,
				admin: admin.client,
				viewerId: 'v',
				handle: 'djwayne',
				projectId: OTHER,
				note: null
			})
		).rejects.toThrow(/isn’t on this page/);
		await expect(
			askToJoin({
				supabase: user.client,
				admin: admin.client,
				viewerId: 'v',
				handle: 'djwayne',
				projectId: PROJECT,
				note: null
			})
		).resolves.toBe('already_waiting');
	});

	it('treats an owner who turned findability off as unavailable', async () => {
		const admin = fakeClient({
			rpc: { get_builder_profile: () => ({ data: publishedView() }) }
		});
		const user = fakeClient({
			rpc: { create_people_request: () => ({ data: { status: 'not_found' } }) }
		});
		await expect(
			askToJoin({
				supabase: user.client,
				admin: admin.client,
				viewerId: 'v',
				handle: 'djwayne',
				projectId: PROJECT,
				note: null
			})
		).resolves.toBe('unavailable');
	});
});

describe('follow', () => {
	it('refuses drafts and yourself', async () => {
		const draft = fakeClient({
			rpc: {
				builder_profile_target: () => ({
					data: [{ user_id: 'o', username: 'x', status: 'draft' }]
				})
			}
		});
		await expect(
			follow({ admin: draft.client, viewerId: 'v', handle: 'x', projectId: null, on: true })
		).rejects.toThrow(/not found/);
		const self = fakeClient({
			rpc: {
				builder_profile_target: () => ({
					data: [{ user_id: 'v', username: 'x', status: 'published' }]
				})
			}
		});
		await expect(
			follow({ admin: self.client, viewerId: 'v', handle: 'x', projectId: null, on: true })
		).rejects.toThrow(/yourself/);
	});

	it('follows a person and counts it once', async () => {
		const admin = fakeClient({
			tables: { builder_follows: [{ data: [{ id: 'f1' }] }] },
			rpc: {
				builder_profile_target: () => ({
					data: [{ user_id: 'o', username: 'x', status: 'published' }]
				})
			}
		});
		await expect(
			follow({ admin: admin.client, viewerId: 'v', handle: 'x', projectId: null, on: true })
		).resolves.toEqual({
			following: true
		});
		expect(admin.rpc).toHaveBeenCalledWith('bump_builder_profile_stat', {
			p_user_id: 'o',
			p_kind: 'follow'
		});
	});
});

describe('drafts', () => {
	const owned = {
		data: [
			{
				project: {
					id: PROJECT,
					name: '9takes',
					description: 'Enneagram',
					icon_emoji: null,
					facet_stage: 'execution',
					state_key: 'active',
					kind: 'project'
				}
			}
		]
	};

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
			getJSONResponse: vi.fn().mockResolvedValue({
				headline: 'Founder, BuildOS',
				bio: 'I build things.',
				pitches: [
					{ project_id: PROJECT, pitch: 'Enneagram talk, answer first.' },
					{ project_id: OTHER, pitch: 'Not asked for.' }
				]
			})
		};
		const result = await draftPage({
			llm,
			admin: admin.client,
			userId: 'u',
			projectIds: [PROJECT]
		});
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
					{
						data: [
							{
								project_id: PROJECT,
								level: 'live',
								public_name: null,
								pitch: null,
								project: { name: '9takes', deleted_at: null, archived_at: null }
							}
						]
					}
				],
				onto_tasks: [{ data: [] }],
				builder_profile_activity_daily: [{ data: [] }]
			}
		});
		const llm = { getJSONResponse: vi.fn() };
		await expect(
			draftWeeklyUpdates({ llm, admin: admin.client, userId: 'u' })
		).resolves.toEqual({ created: 0, drafts: [], reason: 'nothing_moved' });
		expect(llm.getJSONResponse).not.toHaveBeenCalled();
	});

	it('says it had nothing to say (not that nothing moved) when the model drafts no line', async () => {
		const admin = fakeClient({
			tables: {
				builder_profile_projects: [
					{
						data: [
							{
								project_id: PROJECT,
								level: 'listed',
								public_name: null,
								pitch: null,
								project: { name: '9takes', deleted_at: null, archived_at: null }
							}
						]
					}
				],
				onto_tasks: [{ data: [{ project_id: PROJECT, title: 'Ship the beta' }] }],
				builder_profile_activity_daily: [{ data: [] }]
			}
		});
		const llm = { getJSONResponse: vi.fn().mockResolvedValue({ now: null, projects: [] }) };
		await expect(
			draftWeeklyUpdates({ llm, admin: admin.client, userId: 'u' })
		).resolves.toEqual({ created: 0, drafts: [], reason: 'nothing_to_say' });
		expect(admin.calls.some((c) => c.table === 'builder_profile_updates')).toBe(false);
	});

	it('writes a Now line and lines only for live projects with done work', async () => {
		const admin = fakeClient({
			tables: {
				builder_profile_projects: [
					{
						data: [
							{
								project_id: PROJECT,
								level: 'live',
								public_name: null,
								pitch: null,
								project: { name: '9takes', deleted_at: null, archived_at: null }
							},
							{
								project_id: OTHER,
								level: 'listed',
								public_name: null,
								pitch: null,
								project: { name: 'Radar', deleted_at: null, archived_at: null }
							}
						]
					}
				],
				onto_tasks: [
					{
						data: [
							{ project_id: PROJECT, title: 'Outreach: a podcaster — pitch sent' },
							{ project_id: OTHER, title: 'Scan' }
						]
					}
				],
				builder_profile_activity_daily: [{ data: [] }],
				builder_profile_updates: [
					{ data: null },
					{
						data: [
							{
								id: 'p1',
								project_id: PROJECT,
								body: 'Reached out to a few podcasts.',
								status: 'drafted',
								week_of: '2026-11-09',
								created_at: 't'
							},
							{
								id: 'n1',
								project_id: null,
								body: 'Getting 9takes ready for beta.',
								status: 'drafted',
								week_of: '2026-11-09',
								created_at: 't'
							}
						]
					}
				]
			}
		});
		const llm = {
			getJSONResponse: vi.fn().mockResolvedValue({
				now: 'Getting 9takes ready for beta.',
				projects: [
					{ project_id: PROJECT, line: 'Reached out to a few podcasts.' },
					{ project_id: OTHER, line: 'Listed projects get no line.' }
				]
			})
		};
		// The new drafts come back (Now line first) so the editor needn't reload everything.
		const result = await draftWeeklyUpdates({ llm, admin: admin.client, userId: 'u' });
		expect(result.created).toBe(2);
		expect(result.drafts.map((d) => [d.id, d.project_name])).toEqual([
			['n1', null],
			['p1', '9takes']
		]);
		const insert = admin.calls.find(
			(c) => c.table === 'builder_profile_updates' && c.op === 'insert'
		);
		expect((insert?.args[0] as any[]).map((r) => [r.project_id, r.body])).toEqual([
			[null, 'Getting 9takes ready for beta.'],
			[PROJECT, 'Reached out to a few podcasts.']
		]);
	});

	it('publishing a drafted Now line updates the page', async () => {
		const admin = fakeClient({
			tables: {
				builder_profile_updates: [
					{ data: { id: 'd1', project_id: null, body: 'Draft.', status: 'drafted' } },
					{ data: null }
				],
				builder_profiles: [{ data: null }]
			}
		});
		await decideDraft({
			admin: admin.client,
			userId: 'u',
			draftId: 'd1',
			action: 'publish',
			body: 'Edited line.'
		});
		const pageUpdate = admin.calls.find(
			(c) => c.table === 'builder_profiles' && c.op === 'update'
		);
		expect(pageUpdate?.args[0]).toMatchObject({ now_text: 'Edited line.' });
	});
});

describe('Writing picks', () => {
	const PAGE = '11111111-2222-4333-8444-555555555555';
	const STRANGER = '99999999-2222-4333-8444-555555555555';

	it('refuses bad, repeated or too many ids', () => {
		expect(parseWritingPicks([PAGE])).toEqual([PAGE]);
		expect(() => parseWritingPicks('x')).toThrow(BuilderProfileError);
		expect(() => parseWritingPicks([PAGE, PAGE])).toThrow(/twice/);
		expect(() => parseWritingPicks(['nope'])).toThrow(/Unknown page/);
	});

	it('only saves the owner’s own live public pages, in order', async () => {
		const pages = {
			data: [
				{
					id: PAGE,
					title: 'Sorting',
					slug: 'dj-sorting',
					slug_prefix: 'dj',
					slug_base: 'sorting',
					published_at: '2026-11-01',
					project: { name: 'BuildOS', deleted_at: null }
				}
			]
		};
		const ok = fakeClient({
			tables: {
				onto_actors: [{ data: { id: 'actor' } }],
				onto_public_pages: [pages],
				builder_profile_writing: [{ data: [] }, { data: null }, { data: null }]
			}
		});
		await replaceWriting({ admin: ok.client, userId: 'u', pageIds: [PAGE] });
		const insert = ok.calls.find(
			(c) => c.table === 'builder_profile_writing' && c.op === 'insert'
		);
		expect(insert?.args[0]).toEqual([{ user_id: 'u', page_id: PAGE, position: 0 }]);

		const bad = fakeClient({
			tables: {
				onto_actors: [{ data: { id: 'actor' } }],
				onto_public_pages: [pages],
				builder_profile_writing: [{ data: [] }]
			}
		});
		await expect(
			replaceWriting({ admin: bad.client, userId: 'u', pageIds: [STRANGER] })
		).rejects.toMatchObject({ status: 403 });
		expect(bad.calls.some((c) => c.op === 'delete' || c.op === 'insert')).toBe(false);
	});
});

describe('recordEvent', () => {
	it('passes the visitor key and project, and reports a repeat visit as not counted', async () => {
		const admin = fakeClient({
			rpc: {
				builder_profile_target: () => ({
					data: [{ user_id: 'owner', username: 'dj', status: 'published' }]
				}),
				bump_builder_profile_stat: () => ({ data: false })
			}
		});
		await expect(
			recordEvent({
				admin: admin.client,
				handle: 'dj',
				kind: 'project_view',
				viewerId: null,
				visitorKey: 'k',
				subject: PROJECT
			})
		).resolves.toBe(false);
		expect(admin.rpc).toHaveBeenCalledWith('bump_builder_profile_stat', {
			p_user_id: 'owner',
			p_kind: 'project_view',
			p_visitor: 'k',
			p_subject: PROJECT
		});
	});
});
