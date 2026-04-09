// apps/web/src/lib/utils/overdue-triage-selection.test.ts
import { describe, expect, it } from 'vitest';

import type { OverdueProjectBatch } from '$lib/types/overdue-triage';

import { resolveNextOverdueProjectSelection } from './overdue-triage-selection';

function makeBatch(projectId: string): OverdueProjectBatch {
	return {
		project_id: projectId,
		project_name: `Project ${projectId}`,
		project_state_key: 'active',
		project_is_shared: false,
		project_is_collaborative: false,
		lane: 'other',
		overdue_count: 1,
		assigned_to_me_count: 0,
		oldest_due_at: '2026-04-01T12:00:00.000Z',
		oldest_assigned_due_at: null,
		project_updated_at: '2026-04-01T12:00:00.000Z',
		tasks: []
	};
}

describe('resolveNextOverdueProjectSelection', () => {
	it('preserves the current project when an async update completes for another project', () => {
		const batches = [makeBatch('alpha'), makeBatch('beta'), makeBatch('gamma')];

		expect(resolveNextOverdueProjectSelection(batches, 'beta', 'alpha')).toBe('beta');
	});

	it('falls back to the requested project when the current selection no longer exists', () => {
		const batches = [makeBatch('alpha'), makeBatch('gamma')];

		expect(resolveNextOverdueProjectSelection(batches, 'beta', 'alpha')).toBe('alpha');
	});

	it('falls back to the first remaining project when neither preferred option exists', () => {
		const batches = [makeBatch('gamma')];

		expect(resolveNextOverdueProjectSelection(batches, 'beta', 'alpha')).toBe('gamma');
		expect(resolveNextOverdueProjectSelection([], 'beta', 'alpha')).toBeNull();
	});
});
