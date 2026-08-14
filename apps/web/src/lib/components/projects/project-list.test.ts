// apps/web/src/lib/components/projects/project-list.test.ts
import { describe, expect, it } from 'vitest';
import {
	addProjectCollaborationFlags,
	formatProjectUpdatedLabel,
	getProjectListScopeLabel,
	matchesProjectListScope,
	normalizeProjectListScope
} from './project-list';

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
