// apps/web/src/lib/utils/activity-log-summary.test.ts
import { describe, expect, it } from 'vitest';
import { buildActivityLogSummary } from './activity-log-summary';

describe('buildActivityLogSummary', () => {
	it('summarizes a direct state change', () => {
		const summary = buildActivityLogSummary({
			action: 'updated',
			entity_type: 'task',
			before_data: { title: 'Ship beta', state_key: 'todo' },
			after_data: { title: 'Ship beta', state_key: 'in_progress' }
		});

		expect(summary.title).toBe('State changed');
		expect(summary.description).toContain('State changed from "todo" to "in progress"');
		expect(summary.changes).toEqual([
			expect.objectContaining({
				path: 'state_key',
				label: 'State',
				beforeValue: 'todo',
				afterValue: 'in progress'
			})
		]);
	});

	it('summarizes nested props changes', () => {
		const summary = buildActivityLogSummary({
			action: 'updated',
			entity_type: 'goal',
			before_data: { name: 'Launch', props: { priority: 'medium' } },
			after_data: { name: 'Launch', props: { priority: 'high' } }
		});

		expect(summary.title).toBe('Priority changed');
		expect(summary.description).toContain('Priority changed from "medium" to "high"');
		expect(summary.changes[0]).toMatchObject({
			path: 'props.priority',
			label: 'Priority',
			beforeValue: 'medium',
			afterValue: 'high'
		});
	});

	it('explains sparse update logs instead of inventing a diff', () => {
		const summary = buildActivityLogSummary({
			action: 'updated',
			entity_type: 'document',
			before_data: null,
			after_data: null
		});

		expect(summary.title).toBe('Updated');
		expect(summary.hasFieldData).toBe(false);
		expect(summary.description).toContain('No field-level before/after data was stored');
	});

	it('summarizes project invite events', () => {
		const summary = buildActivityLogSummary({
			action: 'updated',
			entity_type: 'project',
			after_data: {
				event: 'invite_created',
				invitee_email: 'ada@example.com',
				role_key: 'editor',
				access: 'write'
			}
		});

		expect(summary.title).toBe('Invite created');
		expect(summary.eventLabel).toBe('invite created');
		expect(summary.description).toBe(
			'Invite sent to ada@example.com as editor with write access.'
		);
		expect(summary.changes).toHaveLength(3);
	});
});
