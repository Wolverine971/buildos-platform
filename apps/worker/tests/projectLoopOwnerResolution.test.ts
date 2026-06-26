import { describe, expect, it } from 'vitest';
import { mapProjectLoopOwnerUserIds } from '../src/workers/project-loop/ownerResolution';

describe('project loop owner resolution', () => {
	it('maps current actor-owned projects to queueable user ids', () => {
		const result = mapProjectLoopOwnerUserIds(
			[
				{ id: 'project-1', created_by: 'actor-1' },
				{ id: 'project-2', created_by: 'actor-2' }
			],
			[
				{ id: 'actor-1', user_id: 'user-1' },
				{ id: 'actor-2', user_id: 'missing-user' }
			],
			[{ id: 'user-1' }]
		);

		expect([...result.entries()]).toEqual([['project-1', 'user-1']]);
	});

	it('keeps legacy user-owned projects queueable', () => {
		const result = mapProjectLoopOwnerUserIds(
			[{ id: 'project-legacy', created_by: 'user-legacy' }],
			[],
			[{ id: 'user-legacy' }]
		);

		expect(result.get('project-legacy')).toBe('user-legacy');
	});

	it('does not map projects whose owner cannot resolve to a real user', () => {
		const result = mapProjectLoopOwnerUserIds(
			[
				{ id: 'project-missing-actor', created_by: 'actor-missing' },
				{ id: 'project-system-actor', created_by: 'actor-system' },
				{ id: 'project-null', created_by: null }
			],
			[{ id: 'actor-system', user_id: null }],
			[]
		);

		expect(result.size).toBe(0);
	});
});
