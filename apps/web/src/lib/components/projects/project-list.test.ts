// apps/web/src/lib/components/projects/project-list.test.ts
import { describe, expect, it } from 'vitest';
import {
	addProjectCollaborationFlags,
	formatProjectResumeCue,
	formatProjectUpdatedLabel,
	getProjectListScopeLabel,
	matchesProjectListScope,
	nestProjectList,
	normalizeProjectListScope
} from './project-list';

describe('project resume cues', () => {
	it('shows entity and markdown link labels without their source markup', () => {
		expect(
			formatProjectResumeCue(
				'Review [[plan:abc-123|**Brand Foundation**]] and [the brief](/projects/123).'
			)
		).toBe('Review Brand Foundation and the brief.');
	});

	it('keeps literal prose and normalizes empty or multiline previews', () => {
		expect(formatProjectResumeCue(null)).toBe('');
		expect(formatProjectResumeCue('  Book a meeting\n with my business partner.  ')).toBe(
			'Book a meeting with my business partner.'
		);
	});
});

describe('project collaboration flags', () => {
	const projects = [
		{ id: 'owned-solo', owner_actor_id: 'owner-a', is_shared: false },
		{ id: 'owned-team', owner_actor_id: 'owner-a', is_shared: false },
		{ id: 'shared-with-me', owner_actor_id: 'owner-b', is_shared: true }
	];

	it('marks accepted multi-member projects without treating solo projects as collaborative', () => {
		const results = addProjectCollaborationFlags(projects, [
			{ project_id: 'owned-solo', actor_id: 'owner-a' },
			{ project_id: 'owned-team', actor_id: 'owner-a' },
			{ project_id: 'owned-team', actor_id: 'collaborator-c' },
			{ project_id: 'shared-with-me', actor_id: 'current-user' }
		]);

		expect(results.map(({ id, has_collaborators }) => ({ id, has_collaborators }))).toEqual([
			{ id: 'owned-solo', has_collaborators: false },
			{ id: 'owned-team', has_collaborators: true },
			{ id: 'shared-with-me', has_collaborators: true }
		]);
	});

	it('falls back to shared-with-me evidence when the membership lookup fails', () => {
		const results = addProjectCollaborationFlags(projects, null);
		expect(results.map((project) => project.has_collaborators)).toEqual([false, false, true]);
	});
});

describe('project list scope', () => {
	it('defaults to current work and preserves supported deep links', () => {
		expect(normalizeProjectListScope(null)).toBe('current');
		expect(normalizeProjectListScope('all')).toBe('all');
		expect(normalizeProjectListScope('completed')).toBe('completed');
		expect(normalizeProjectListScope('unknown')).toBe('current');
	});

	it('keeps planning and active in current work while historical states stay explicit', () => {
		expect(matchesProjectListScope('planning', 'current')).toBe(true);
		expect(matchesProjectListScope('active', 'current')).toBe(true);
		expect(matchesProjectListScope('paused', 'current')).toBe(false);
		expect(matchesProjectListScope('cancelled', 'all')).toBe(true);
		expect(matchesProjectListScope('completed', 'completed')).toBe(true);
		expect(getProjectListScopeLabel('completed')).toBe('Completed');
	});
});

describe('project update labels', () => {
	const now = new Date(2026, 7, 14, 12, 0, 0).getTime();

	it('uses compact relative labels for recent updates', () => {
		expect(
			formatProjectUpdatedLabel(new Date(now - 2 * 60 * 60 * 1000).toISOString(), now)
		).toBe('Updated 2h ago');
		expect(formatProjectUpdatedLabel(new Date(now - 30 * 60 * 1000).toISOString(), now)).toBe(
			'Updated 30m ago'
		);
	});

	it('uses a weekday for updates earlier in the same week', () => {
		const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
		const weekday = threeDaysAgo.toLocaleDateString(undefined, { weekday: 'long' });
		expect(formatProjectUpdatedLabel(threeDaysAgo.toISOString(), now)).toBe(
			`Updated ${weekday}`
		);
	});
});

describe('nestProjectList', () => {
	const project = (id: string, updated_at: string, parent_project_id: string | null = null) => ({
		id,
		name: id.toUpperCase(),
		updated_at,
		parent_project_id
	});

	it('groups sub-projects under their parent and sorts the parent by the newest activity', () => {
		const groups = nestProjectList([
			project('solo', '2026-09-20T00:00:00Z'),
			project('wayne', '2026-09-01T00:00:00Z'),
			project('redline', '2026-09-10T00:00:00Z', 'wayne'),
			project('cadre', '2026-09-25T00:00:00Z', 'wayne')
		]);

		expect(groups.map((group) => group.project.id)).toEqual(['wayne', 'solo']);
		expect(groups[0]!.children.map((child) => child.id)).toEqual(['cadre', 'redline']);
		expect(groups.every((group) => group.parentName === null)).toBe(true);
	});

	it('keeps a sub-project top-level when its parent is not in the list, labeled from the lookup', () => {
		const all = [
			project('wayne', '2026-09-01T00:00:00Z'),
			project('redline', '2026-09-10T00:00:00Z', 'wayne')
		];
		const groups = nestProjectList([all[1]!], { lookup: all });

		expect(groups).toEqual([{ project: all[1], children: [], parentName: 'WAYNE' }]);
		expect(nestProjectList([all[1]!])[0]!.parentName).toBeNull();
	});

	it('stays flat in search mode with parent labels on sub-projects', () => {
		const list = [
			project('redline', '2026-09-10T00:00:00Z', 'wayne'),
			project('wayne', '2026-09-01T00:00:00Z')
		];
		const groups = nestProjectList(list, { flat: true });

		expect(groups.map((group) => [group.project.id, group.parentName, group.children])).toEqual(
			[
				['redline', 'WAYNE', []],
				['wayne', null, []]
			]
		);
	});

	it('never nests more than one level or hides projects in a malformed chain or cycle', () => {
		const chain = nestProjectList([
			project('a', '2026-09-03T00:00:00Z'),
			project('b', '2026-09-02T00:00:00Z', 'a'),
			project('c', '2026-09-01T00:00:00Z', 'b')
		]);
		expect(chain.map((group) => group.project.id)).toEqual(['a', 'c']);
		expect(chain[0]!.children.map((child) => child.id)).toEqual(['b']);
		expect(chain[1]!.parentName).toBe('B');

		const cycle = nestProjectList([
			project('x', '2026-09-02T00:00:00Z', 'y'),
			project('y', '2026-09-01T00:00:00Z', 'x'),
			project('self', '2026-09-03T00:00:00Z', 'self')
		]);
		expect(cycle.map((group) => group.project.id)).toEqual(['self', 'x', 'y']);
		expect(cycle.every((group) => group.children.length === 0)).toBe(true);
		expect(cycle[0]!.parentName).toBeNull();
	});

	it('treats a missing parent field as a plain project', () => {
		const groups = nestProjectList([{ id: 'p', name: 'P', updated_at: 'not a date' }]);
		expect(groups).toEqual([
			{
				project: { id: 'p', name: 'P', updated_at: 'not a date' },
				children: [],
				parentName: null
			}
		]);
	});
});
