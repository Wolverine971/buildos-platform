// apps/web/src/lib/components/projects/project-list.test.ts
import { describe, expect, it } from 'vitest';
import {
	addProjectCollaborationFlags,
	formatProjectResumeCue,
	getProjectListScopeLabel,
	matchesProjectListScope,
	mergeProjectSummaries,
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

describe('merging a refreshed project list', () => {
	const row = (id: string, name: string, open = 1) => ({
		id,
		name,
		signals: { open_tasks: open, mix: [open, 0] }
	});

	it('keeps the held object for every project that came back the same', () => {
		const held = [row('a', 'Alpha'), row('b', 'Beta'), row('c', 'Gamma')];
		// A fresh read: every row is a new object; only Beta's content differs.
		const merged = mergeProjectSummaries(held, [
			row('a', 'Alpha'),
			row('b', 'Beta', 4),
			row('c', 'Gamma')
		]);
		expect(merged[0]).toBe(held[0]);
		expect(merged[2]).toBe(held[2]);
		expect(merged[1]).not.toBe(held[1]);
		expect(merged[1]).toEqual(row('b', 'Beta', 4));
	});

	it('returns the held list itself when nothing changed', () => {
		const held = [row('a', 'Alpha'), row('b', 'Beta')];
		expect(mergeProjectSummaries(held, [row('a', 'Alpha'), row('b', 'Beta')])).toBe(held);
	});

	it('follows the server for added, removed and reordered projects', () => {
		const held = [row('a', 'Alpha'), row('b', 'Beta')];
		const merged = mergeProjectSummaries(held, [row('c', 'Gamma'), row('a', 'Alpha')]);
		expect(merged.map((project) => project.id)).toEqual(['c', 'a']);
		expect(merged[1]).toBe(held[0]);
	});
});
