// apps/worker/src/workers/brief/builderFollowsBriefSection.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	type BuilderFollowsBriefClient,
	fetchBuilderFollowsBriefSection,
	formatBuilderFollowsSection
} from './builderFollowsBriefSection';
import type { BuilderFollowsBriefLine } from './ontologyBriefTypes';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type Query = ReturnType<BuilderFollowsBriefClient['from']>;
type QueryResult = Awaited<Query>;

const valueAt = (row: Row, path: string): unknown =>
	path.split('.').reduce<unknown>((value, key) => (value as Row | null)?.[key], row);

/** In-memory stand-in for the Supabase query builder: applies the filters the code sends. */
function fakeClient(tables: Tables, failing: string[] = []) {
	const calls: string[] = [];
	const client: BuilderFollowsBriefClient = {
		from(table: string) {
			calls.push(table);
			let rows = [...(tables[table] ?? [])];
			let head = false;
			const result = (): QueryResult =>
				failing.includes(table)
					? { data: null, error: { message: `${table} is down` } }
					: head
						? { data: null, error: null, count: rows.length }
						: { data: rows, error: null };
			const query: Query = {
				select: (_columns, options) => {
					head = options?.head ?? false;
					return query;
				},
				eq: (column, value) => {
					rows = rows.filter((row) => valueAt(row, column) === value);
					return query;
				},
				in: (column, values) => {
					rows = rows.filter((row) => values.includes(valueAt(row, column) as string));
					return query;
				},
				is: (column, value) => {
					rows = rows.filter((row) => (valueAt(row, column) ?? null) === value);
					return query;
				},
				gte: (column, value) => {
					rows = rows.filter((row) => String(valueAt(row, column) ?? '') >= value);
					return query;
				},
				order: (column, options) => {
					rows.sort((a, b) => {
						const diff = String(valueAt(a, column)).localeCompare(
							String(valueAt(b, column))
						);
						return options.ascending ? diff : -diff;
					});
					return query;
				},
				limit: (count) => {
					rows = rows.slice(0, count);
					return query;
				},
				then: (onfulfilled, onrejected) =>
					Promise.resolve(result()).then(onfulfilled, onrejected)
			};
			return query;
		}
	};
	return { client, calls };
}

const since = new Date('2026-10-22T12:00:00Z');
const project = (name: string, overrides: Row = {}) => ({
	name,
	kind: 'project',
	deleted_at: null,
	archived_at: null,
	...overrides
});
const update = (
	id: string,
	userId: string,
	projectId: string | null,
	decidedAt: string,
	overrides: Row = {}
): Row => ({
	id,
	user_id: userId,
	project_id: projectId,
	body: `Line ${id}`,
	status: 'published',
	decided_at: decidedAt,
	project: projectId ? project(`${projectId} internal name`) : null,
	...overrides
});
const placement = (userId: string, projectId: string, overrides: Row = {}): Row => ({
	user_id: userId,
	project_id: projectId,
	level: 'live',
	public_name: null,
	audience: 'anyone',
	...overrides
});
const member = (actorId: string, projectId: string, roleKey = 'owner', deletedAt = null) => ({
	project_id: projectId,
	actor_id: actorId,
	role_key: roleKey,
	removed_at: null,
	onto_projects: { deleted_at: deletedAt }
});

/**
 * reader follows Sam (whole person), Priya's Fading Crown project only, Drafty (page not
 * published) and Mover (whole person, whose projects drop off the page).
 */
function baseTables(): Tables {
	return {
		builder_follows: [
			{ follower_user_id: 'reader', target_user_id: 'sam', project_id: null },
			{ follower_user_id: 'reader', target_user_id: 'priya', project_id: 'p-crown' },
			{ follower_user_id: 'reader', target_user_id: 'drafty', project_id: null },
			{ follower_user_id: 'reader', target_user_id: 'mover', project_id: null },
			{ follower_user_id: 'someone-else', target_user_id: 'sam', project_id: null }
		],
		builder_profile_updates: [
			update('sam-now', 'sam', null, '2026-10-23T09:00:00Z'),
			update('sam-taste', 'sam', 'p-taste', '2026-10-23T10:00:00Z'),
			update('sam-old', 'sam', 'p-taste', '2026-10-21T10:00:00Z'),
			update('sam-draft', 'sam', 'p-taste', '2026-10-23T10:30:00Z', { status: 'drafted' }),
			update('priya-crown', 'priya', 'p-crown', '2026-10-23T08:00:00Z'),
			update('priya-other', 'priya', 'p-other', '2026-10-23T08:30:00Z'),
			update('priya-now', 'priya', null, '2026-10-23T07:00:00Z'),
			update('drafty-now', 'drafty', null, '2026-10-23T11:00:00Z'),
			update('mover-gone', 'mover', 'p-gone', '2026-10-23T06:00:00Z'),
			update('mover-listed', 'mover', 'p-listed', '2026-10-23T06:10:00Z'),
			update('mover-archived', 'mover', 'p-archived', '2026-10-23T06:20:00Z', {
				project: project('Archived', { archived_at: '2026-10-22T00:00:00Z' })
			}),
			update('mover-handed-off', 'mover', 'p-handed-off', '2026-10-23T06:30:00Z'),
			update('reader-draft-1', 'reader', null, '2026-10-23T00:00:00Z', {
				status: 'drafted'
			})
		],
		builder_profiles: [
			{ user_id: 'sam', status: 'published' },
			{ user_id: 'priya', status: 'published' },
			{ user_id: 'drafty', status: 'draft' },
			{ user_id: 'mover', status: 'published' }
		],
		users: [
			{ id: 'sam', name: 'Sam Rivera', username: 'SamR' },
			{ id: 'priya', name: null, username: 'priya' },
			{ id: 'drafty', name: 'Drafty', username: 'drafty' },
			{ id: 'mover', name: 'Mo', username: 'mo' }
		],
		builder_profile_projects: [
			placement('sam', 'p-taste', { public_name: 'Taste Buds' }),
			placement('priya', 'p-crown'),
			placement('priya', 'p-other'),
			placement('mover', 'p-listed', { level: 'listed' }),
			placement('mover', 'p-archived'),
			placement('mover', 'p-handed-off')
		],
		onto_actors: [
			{ id: 'a-reader', user_id: 'reader' },
			{ id: 'a-sam', user_id: 'sam' },
			{ id: 'a-priya', user_id: 'priya' },
			{ id: 'a-mover', user_id: 'mover' }
		],
		onto_project_members: [
			member('a-sam', 'p-taste'),
			member('a-priya', 'p-crown'),
			member('a-priya', 'p-other'),
			member('a-mover', 'p-gone'),
			member('a-mover', 'p-listed'),
			member('a-mover', 'p-archived'),
			// Mover handed this project to someone else and is now only an editor.
			member('a-mover', 'p-handed-off', 'editor')
		]
	};
}

const ids = (lines: BuilderFollowsBriefLine[] | undefined) => lines?.map((line) => line.updateId);

describe('fetchBuilderFollowsBriefSection', () => {
	it('takes every line from a followed person, and only that project from a project follow', async () => {
		const { client } = fakeClient(baseTables());
		const section = await fetchBuilderFollowsBriefSection(client, 'reader', since);

		expect(ids(section?.lines)).toEqual(['sam-taste', 'sam-now', 'priya-crown']);
		expect(section?.lineCount).toBe(3);
		expect(section?.lines[0]).toEqual({
			updateId: 'sam-taste',
			authorUserId: 'sam',
			authorLabel: 'Sam Rivera',
			username: 'SamR',
			projectLabel: 'Taste Buds',
			body: 'Line sam-taste',
			publishedAt: '2026-10-23T10:00:00Z'
		});
		expect(section?.lines[1].projectLabel).toBeNull();
		// No name: falls back to the handle. No public name: the project's own name.
		expect(section?.lines[2]).toMatchObject({
			authorLabel: '@priya',
			projectLabel: 'p-crown internal name'
		});
	});

	it('drops everything from a person whose page is no longer published', async () => {
		const tables = baseTables();
		tables.builder_profiles = tables.builder_profiles.map((row) =>
			row.user_id === 'sam' ? { ...row, status: 'draft' } : row
		);
		const section = await fetchBuilderFollowsBriefSection(
			fakeClient(tables).client,
			'reader',
			since
		);
		expect(ids(section?.lines)).toEqual(['priya-crown']);
	});

	it('drops project lines once the project leaves the page, is archived, or changes hands', async () => {
		const tables = baseTables();
		// mover-gone (no placement), mover-listed (not live), mover-archived and
		// mover-handed-off are already excluded; now take Taste Buds off Sam's page too.
		tables.builder_profile_projects = tables.builder_profile_projects.filter(
			(row) => row.project_id !== 'p-taste'
		);
		const section = await fetchBuilderFollowsBriefSection(
			fakeClient(tables).client,
			'reader',
			since
		);
		expect(ids(section?.lines)).toEqual(['sam-now', 'priya-crown']);
		expect(ids(section?.lines)).not.toContain('mover-gone');
	});

	it('shows a collaborators-only card only to someone who works with its owner', async () => {
		const tables = baseTables();
		tables.builder_profile_projects = tables.builder_profile_projects.map((row) =>
			row.project_id === 'p-taste' ? { ...row, audience: 'collaborators' } : row
		);
		const stranger = await fetchBuilderFollowsBriefSection(
			fakeClient(tables).client,
			'reader',
			since
		);
		expect(ids(stranger?.lines)).toEqual(['sam-now', 'priya-crown']);

		tables.onto_project_members.push(
			member('a-sam', 'p-shared', 'owner'),
			member('a-reader', 'p-shared', 'editor')
		);
		const collaborator = await fetchBuilderFollowsBriefSection(
			fakeClient(tables).client,
			'reader',
			since
		);
		expect(ids(collaborator?.lines)).toEqual(['sam-taste', 'sam-now', 'priya-crown']);
	});

	it('counts the reader’s own drafted lines', async () => {
		const tables = baseTables();
		tables.builder_profile_updates.push(
			update('reader-draft-2', 'reader', null, '2026-10-23T00:00:00Z', { status: 'drafted' }),
			update('reader-skipped', 'reader', null, '2026-10-23T00:00:00Z', { status: 'skipped' })
		);
		const section = await fetchBuilderFollowsBriefSection(
			fakeClient(tables).client,
			'reader',
			since
		);
		expect(section?.draftedCount).toBe(2);
	});

	it('returns null and makes no further reads when there is nothing to show', async () => {
		const { client, calls } = fakeClient({});
		expect(await fetchBuilderFollowsBriefSection(client, 'reader', since)).toBeNull();
		expect(calls.sort()).toEqual(['builder_follows', 'builder_profile_updates']);
	});

	it('fails closed on a read error but still shows the drafts nudge', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const { client } = fakeClient(baseTables(), ['builder_profiles']);
		const section = await fetchBuilderFollowsBriefSection(client, 'reader', since);
		expect(section).toEqual({ lines: [], lineCount: 0, draftedCount: 1 });
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});

const line = (overrides: Partial<BuilderFollowsBriefLine> = {}): BuilderFollowsBriefLine => ({
	updateId: 'u1',
	authorUserId: 'sam',
	authorLabel: 'Sam Rivera',
	username: 'SamR',
	projectLabel: 'Taste Buds',
	body: 'Shipped the pricing page and booked three tester calls.',
	publishedAt: '2026-10-23T10:00:00Z',
	...overrides
});

describe('formatBuilderFollowsSection', () => {
	it('says nothing when both parts are empty', () => {
		expect(formatBuilderFollowsSection(null)).toBe('');
		expect(formatBuilderFollowsSection({ lines: [], lineCount: 0, draftedCount: 0 })).toBe('');
	});

	it('renders lines from people you follow and the drafts nudge', () => {
		const markdown = formatBuilderFollowsSection({
			lines: [
				line(),
				line({
					updateId: 'u2',
					authorLabel: '@priya',
					username: 'priya',
					projectLabel: null,
					body: 'Rewriting the onboarding flow before the beta opens.'
				})
			],
			lineCount: 2,
			draftedCount: 3
		});
		expect(markdown).toBe(
			'## From People You Follow\n\n' +
				'- [Sam Rivera](/@samr) · **Taste Buds** — Shipped the pricing page and booked three tester calls.\n' +
				'- [@priya](/@priya) · **Now** — Rewriting the onboarding flow before the beta opens.\n\n' +
				'## Your Page\n\n' +
				'Your page has 3 drafted updates waiting. Publish, edit or skip them in [Profile → People & agents](/profile?tab=people#your-page).\n\n'
		);
	});

	it('renders the drafts nudge alone, in the singular', () => {
		expect(formatBuilderFollowsSection({ lines: [], lineCount: 0, draftedCount: 1 })).toBe(
			'## Your Page\n\n' +
				'Your page has 1 drafted update waiting. Publish, edit or skip it in [Profile → People & agents](/profile?tab=people#your-page).\n\n'
		);
	});

	it('keeps other people’s text literal and counts lines past the cap', () => {
		const markdown = formatBuilderFollowsSection({
			lines: [
				line({
					authorLabel: 'Sam [admin]',
					projectLabel: '*Taste* Buds',
					body: 'See [my site](https://evil.example) ![x](https://pixel.example) <img src=x>'
				})
			],
			lineCount: 4,
			draftedCount: 0
		});
		expect(markdown).toContain(
			'- [Sam \\[admin\\]](/@samr) · **\\*Taste\\* Buds** — See \\[my site\\](https://evil.example) !\\[x\\](https://pixel.example) \\<img src=x>'
		);
		expect(markdown).toContain('- ... and 3 more\n');
		expect(markdown).not.toContain('## Your Page');
	});
});
