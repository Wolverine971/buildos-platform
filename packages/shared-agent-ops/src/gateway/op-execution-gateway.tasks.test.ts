import { describe, expect, it } from 'vitest';
import { detectNoEffectTaskUpdate } from './op-execution-gateway.tasks';

describe('detectNoEffectTaskUpdate', () => {
	const existingTask = {
		id: '33333333-3333-4333-8333-333333333333',
		title: 'Existing task',
		description: null,
		type_key: 'task.default',
		state_key: 'todo',
		priority: 2,
		start_at: '2026-08-09T12:00:00.000Z',
		due_at: null,
		props: { retained: true }
	};

	it('detects scalar echoes with trimmed text and equivalent timestamps', () => {
		expect(
			detectNoEffectTaskUpdate(
				existingTask,
				{
					title: ' Existing task ',
					start_at: '2026-08-09T08:00:00-04:00',
					updated_at: 'ignored'
				},
				['title', 'start_at']
			)
		).toEqual({
			noEffect: true,
			comparedFields: ['title', 'start_at'],
			taskTitle: 'Existing task'
		});
	});

	it('allows a scalar update when at least one value changes', () => {
		expect(
			detectNoEffectTaskUpdate(
				existingTask,
				{ title: 'Existing task', state_key: 'in_progress' },
				['title', 'state_key']
			)
		).toMatchObject({ noEffect: false, comparedFields: ['title', 'state_key'] });
	});

	it('skips deep props and archival comparisons like the legacy executor', () => {
		expect(
			detectNoEffectTaskUpdate(existingTask, { props: existingTask.props }, ['props'])
		).toEqual({ noEffect: false, comparedFields: [] });
		expect(detectNoEffectTaskUpdate(existingTask, { archived_at: null }, ['archived'])).toEqual(
			{ noEffect: false, comparedFields: [] }
		);
	});
});
