// apps/web/src/lib/components/builder-profile/editor/builder-editor.test.ts
import { describe, expect, it } from 'vitest';
import type {
	BuilderEditorProject,
	BuilderEditorPlacement,
	BuilderProfileView
} from '$lib/builder-profile/types';
import {
	applySuggestedPitch,
	blankLinkRow,
	buildLinksPayload,
	buildProjectsPayload,
	draftProjectIds,
	headerChange,
	isBlankLinkRow,
	LIMITS,
	linkRowError,
	linkRowsFrom,
	moveItem,
	movePlacedRow,
	previewViewFor,
	projectActivityLine,
	projectRowErrors,
	projectsKey,
	rowsFromProjects,
	setRowLevel,
	sharedWithLabel,
	toggleGoal,
	URL_ERROR,
	type EditorLinkRow,
	type EditorProjectRow
} from './builder-editor';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function placement(overrides: Partial<BuilderEditorPlacement> = {}): BuilderEditorPlacement {
	return {
		level: 'listed',
		public_name: null,
		pitch: null,
		looking_for: null,
		link_url: null,
		goal_ids: [],
		show_next_milestone: true,
		this_week: null,
		audience: 'anyone',
		position: 0,
		...overrides
	};
}

function project(n: number, overrides: Partial<BuilderEditorProject> = {}): BuilderEditorProject {
	return {
		project_id: uuid(n),
		name: `Project ${n}`,
		description: null,
		glyphs: [],
		stage: null,
		state: null,
		member_count: 1,
		last_active_at: null,
		changes_year: 0,
		by_agents_year: 0,
		goals: [],
		next_milestone: null,
		placement: null,
		...overrides
	};
}

const ids = (rows: EditorProjectRow[]) => rows.map((r) => r.project.project_id);
const levels = (rows: EditorProjectRow[]) => rows.map((r) => r.level);

function linkRow(overrides: Partial<EditorLinkRow>): EditorLinkRow {
	return { ...blankLinkRow('link', 'k'), ...overrides };
}

describe('headerChange', () => {
	it('sends nothing when the cleaned text matches what is saved', () => {
		expect(headerChange('  Founder,   BuildOS ', 'Founder, BuildOS')).toBeUndefined();
		expect(headerChange('', null)).toBeUndefined();
	});

	it('sends the cleaned text, or null to clear', () => {
		expect(headerChange(' Writer  and producer ', 'Founder')).toBe('Writer and producer');
		expect(headerChange('   ', 'Founder')).toBeNull();
	});
});

describe('links', () => {
	it('splits saved links into socials and links, keeping order', () => {
		const split = linkRowsFrom([
			{ id: 'a', kind: 'link', url: 'https://a.com/', label: 'A', note: null, audience: 'anyone' },
			{ id: 'b', kind: 'social', url: 'https://x.com/dj', label: null, note: null, audience: 'anyone' },
			{ id: 'c', kind: 'link', url: 'https://c.com/', label: 'C', note: 'n', audience: 'collaborators' }
		]);
		expect(split.socials.map((r) => r.key)).toEqual(['b']);
		expect(split.links.map((r) => r.key)).toEqual(['a', 'c']);
		expect(split.links[1]).toMatchObject({ label: 'C', note: 'n', audience: 'collaborators' });
	});

	it('builds the PUT body: socials first, normalized URLs, blank rows dropped', () => {
		const socials = [
			linkRow({ key: 's1', kind: 'social', url: 'x.com/djwayne3', note: 'ignored for socials' })
		];
		const links = [
			linkRow({ key: 'l1', url: ' https://buildos.substack.com ', label: '  My   newsletter ', note: '' }),
			linkRow({ key: 'l2' }),
			linkRow({ key: 'l3', url: 'cal.com/dj', label: 'Book a call', note: 'Fridays', audience: 'collaborators' })
		];
		expect(buildLinksPayload(socials, links)).toEqual({
			links: [
				{ kind: 'social', url: 'https://x.com/djwayne3', audience: 'anyone' },
				{
					kind: 'link',
					url: 'https://buildos.substack.com/',
					label: 'My newsletter',
					audience: 'anyone'
				},
				{
					kind: 'link',
					url: 'https://cal.com/dj',
					label: 'Book a call',
					note: 'Fridays',
					audience: 'collaborators'
				}
			]
		});
	});

	it('rejects anything that is not an http(s) web address', () => {
		expect(linkRowError(linkRow({ url: 'javascript:alert(1)' }))).toBe(URL_ERROR);
		expect(linkRowError(linkRow({ url: 'mailto:dj@example.com' }))).toBe(URL_ERROR);
		expect(linkRowError(linkRow({ url: 'not a url' }))).toBe(URL_ERROR);
		expect(linkRowError(linkRow({ url: 'example.com/page' }))).toBeNull();
	});

	it('lets an untouched blank row be, but asks for a URL once there is a title', () => {
		expect(isBlankLinkRow(linkRow({}))).toBe(true);
		expect(linkRowError(linkRow({}))).toBeNull();
		expect(linkRowError(linkRow({ label: 'Newsletter' }))).toMatch(/Add a web address/);
	});
});

describe('project rows', () => {
	const goalA = { id: uuid(101), name: 'Fill the beta' };

	function sample(): EditorProjectRow[] {
		// GET returns placed first by position, then the rest by recent activity.
		return rowsFromProjects([
			project(1, { placement: placement({ position: 1, level: 'live' }) }),
			project(2, { placement: placement({ position: 0 }) }),
			project(3, { last_active_at: '2026-10-20T12:00:00Z' }),
			project(4, { last_active_at: '2026-10-22T12:00:00Z' })
		]);
	}

	it('starts from the saved placements, placed first in page order', () => {
		const rows = sample();
		expect(ids(rows)).toEqual([uuid(2), uuid(1), uuid(3), uuid(4)]);
		expect(levels(rows)).toEqual(['listed', 'live', 'hidden', 'hidden']);
	});

	it('drops saved goal ids that no longer belong to the project', () => {
		const [row] = rowsFromProjects([
			project(1, { goals: [goalA], placement: placement({ goal_ids: [goalA.id, uuid(999)] }) })
		]);
		expect(row?.goal_ids).toEqual([goalA.id]);
	});

	it('puts a newly shown project at the end of the page, and a hidden one back on top of the rest', () => {
		let rows = sample();
		rows = setRowLevel(rows, uuid(4), 'listed');
		expect(ids(rows)).toEqual([uuid(2), uuid(1), uuid(4), uuid(3)]);
		rows = setRowLevel(rows, uuid(2), 'hidden');
		expect(ids(rows)).toEqual([uuid(1), uuid(4), uuid(2), uuid(3)]);
		expect(levels(rows)).toEqual(['live', 'listed', 'hidden', 'hidden']);
	});

	it('switches Listed and Live in place', () => {
		const rows = setRowLevel(sample(), uuid(2), 'live');
		expect(ids(rows)).toEqual([uuid(2), uuid(1), uuid(3), uuid(4)]);
		expect(rows[0]?.level).toBe('live');
	});

	it('stops at the page limit', () => {
		const many = rowsFromProjects(
			Array.from({ length: LIMITS.projects + 1 }, (_, i) =>
				project(i + 1, { placement: i < LIMITS.projects ? placement({ position: i }) : null })
			)
		);
		const last = uuid(LIMITS.projects + 1);
		expect(setRowLevel(many, last, 'listed')).toBe(many);
	});

	it('moves projects only among the ones on the page', () => {
		const rows = sample();
		expect(ids(movePlacedRow(rows, uuid(2), 1))).toEqual([uuid(1), uuid(2), uuid(3), uuid(4)]);
		expect(movePlacedRow(rows, uuid(1), 1)).toBe(rows); // last placed can't drop into hidden
		expect(movePlacedRow(rows, uuid(2), -1)).toBe(rows);
		expect(movePlacedRow(rows, uuid(3), -1)).toBe(rows); // hidden rows don't move
	});

	it('caps goals at three', () => {
		const row = {
			...sample()[1]!,
			goal_ids: [uuid(101), uuid(102), uuid(103)]
		};
		expect(toggleGoal(row, uuid(104))).toEqual(row.goal_ids);
		expect(toggleGoal(row, uuid(102))).toEqual([uuid(101), uuid(103)]);
	});
});

describe('buildProjectsPayload', () => {
	it('sends placed projects in order and leaves hidden ones out', () => {
		const rows = rowsFromProjects([
			project(1, {
				goals: [
					{ id: uuid(101), name: 'Fill the beta' },
					{ id: uuid(102), name: 'Ship onboarding' }
				],
				placement: placement({
					level: 'live',
					position: 0,
					public_name: '  9takes ',
					pitch: 'Answer before you see anyone else.',
					link_url: '9takes.com',
					goal_ids: [uuid(101)],
					show_next_milestone: false,
					looking_for: 'Five beta testers',
					this_week: 'Shipped   the reply flow.',
					audience: 'anyone'
				})
			}),
			project(2, {
				placement: placement({
					level: 'listed',
					position: 1,
					this_week: 'Not for listed cards',
					looking_for: 'Not for listed cards',
					audience: 'collaborators'
				})
			}),
			project(3)
		]);
		expect(buildProjectsPayload(rows)).toEqual({
			projects: [
				{
					project_id: uuid(1),
					level: 'live',
					audience: 'anyone',
					public_name: '9takes',
					pitch: 'Answer before you see anyone else.',
					link_url: 'https://9takes.com/',
					goal_ids: [uuid(101)],
					show_next_milestone: false,
					looking_for: 'Five beta testers',
					this_week: 'Shipped the reply flow.'
				},
				{ project_id: uuid(2), level: 'listed', audience: 'collaborators' }
			]
		});
	});

	it('flags project links that are not web addresses', () => {
		let rows = rowsFromProjects([project(1, { placement: placement() }), project(2)]);
		rows = rows.map((r) => ({ ...r, link_url: 'ftp://files.example.com' }));
		expect(projectRowErrors(rows)).toEqual({ [uuid(1)]: URL_ERROR });
	});

	it('changes its key when anything that would be saved changes', () => {
		const rows = rowsFromProjects([project(1, { placement: placement() })]);
		const before = projectsKey(rows);
		expect(projectsKey(rows.map((r) => ({ ...r, pitch: 'New pitch' })))).not.toBe(before);
		// Typing in a Live-only field on a Listed card saves nothing, so nothing is unsaved.
		expect(projectsKey(rows.map((r) => ({ ...r, this_week: 'x' })))).toBe(before);
	});
});

describe('Draft my page', () => {
	it('drafts from the projects on the page, or else the five most recently active', () => {
		const placed = rowsFromProjects([project(1, { placement: placement() }), project(2)]);
		expect(draftProjectIds(placed)).toEqual([uuid(1)]);

		const none = rowsFromProjects(
			Array.from({ length: 7 }, (_, i) =>
				project(i + 1, { last_active_at: `2026-10-${String(10 + i).padStart(2, '0')}T12:00:00Z` })
			).concat(project(99))
		);
		expect(draftProjectIds(none)).toEqual([uuid(7), uuid(6), uuid(5), uuid(4), uuid(3)]);
	});

	it('using a pitch for a hidden project adds it as Listed with that pitch', () => {
		const rows = rowsFromProjects([project(1, { placement: placement() }), project(2)]);
		const next = applySuggestedPitch(rows, uuid(2), '  Songs from a dad rapper. ');
		expect(ids(next)).toEqual([uuid(1), uuid(2)]);
		expect(next[1]).toMatchObject({ level: 'listed', pitch: 'Songs from a dad rapper.' });
		expect(applySuggestedPitch(rows, uuid(42), 'x')).toBe(rows);
	});
});

describe('preview filter', () => {
	const view = {
		found: true,
		status: 'draft',
		viewer: { signed_in: true, is_owner: true, works_with: false, follows: false, ask_pending: false },
		profile: { handle: 'dj' },
		settings: { show_build_log: true, show_agent_split: true, show_writing: true, show_builds_with: true },
		links: [
			{ id: 'l1', kind: 'link', url: 'https://a.com', audience: 'anyone' },
			{ id: 'l2', kind: 'link', url: 'https://b.com', audience: 'collaborators' }
		],
		projects: [
			{ id: 'p1', level: 'listed', name: 'Public', audience: 'anyone' },
			{ id: 'p2', level: 'live', name: 'Inner', audience: 'collaborators' }
		],
		writing: [],
		builds_with: []
	} satisfies BuilderProfileView;

	it('shows Anyone only what is for anyone', () => {
		const anyone = previewViewFor(view, 'anyone');
		expect(anyone.links.map((l) => l.id)).toEqual(['l1']);
		expect(anyone.projects.map((p) => p.id)).toEqual(['p1']);
		expect(view.links).toHaveLength(2); // the original is untouched
	});

	it('shows people you work with everything', () => {
		expect(previewViewFor(view, 'collaborators')).toBe(view);
	});
});

describe('display helpers', () => {
	const now = new Date('2026-10-23T15:00:00Z');

	it('describes a project’s year', () => {
		expect(
			projectActivityLine(
				project(1, { changes_year: 128, by_agents_year: 51, last_active_at: '2026-10-20T12:00:00Z' }),
				now
			)
		).toBe('128 changes this year, 40% by agents · active 3 days ago');
		expect(projectActivityLine(project(2), now)).toBe('no activity yet');
	});

	it('warns about shared projects by how many others are in them', () => {
		expect(sharedWithLabel(project(1))).toBeNull();
		expect(sharedWithLabel(project(1, { member_count: 2 }))).toBe(
			'Shared with 1 person. Check the public name.'
		);
		expect(sharedWithLabel(project(1, { member_count: 4 }))).toMatch(/^Shared with 3 people/);
	});

	it('moves list items and ignores moves off the ends', () => {
		expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
		expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
		const same = ['a', 'b'];
		expect(moveItem(same, 0, -1)).toBe(same);
		expect(moveItem(same, 1, 1)).toBe(same);
	});
});
