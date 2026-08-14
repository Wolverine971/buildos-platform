// apps/web/src/lib/components/projects/project-list.test.ts
import { describe, expect, it } from 'vitest';
import {
	formatProjectUpdatedLabel,
	getProjectListScopeLabel,
	matchesProjectListScope,
	normalizeProjectListScope
} from './project-list';

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
