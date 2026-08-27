// packages/shared-types/src/payloadTransformer.test.ts
import { describe, expect, it, vi } from 'vitest';
import { safeTransformEventPayload, transformEventPayload } from './payloadTransformer';

describe('notification payload transformer', () => {
	it('builds tracked notification content from a JSON-safe event payload', () => {
		const transformed = transformEventPayload('task.assigned', {
			task_id: 'task-1',
			task_title: 'Confirm launch copy',
			project_id: 'project-1',
			project_name: 'Launch'
		});

		expect(transformed).toMatchObject({
			title: 'Task assigned to you',
			body: 'You were assigned Confirm launch copy in Launch.',
			action_url: '/projects/project-1/tasks/task-1',
			data: {
				event_type: 'task.assigned',
				task_id: 'task-1',
				project_id: 'project-1'
			}
		});
	});

	it('rejects values that cannot cross the JSON notification boundary', () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const transformed = safeTransformEventPayload('task.assigned', {
			task_id: 'task-1',
			onClick: () => undefined
		});

		expect(transformed).toEqual({
			success: false,
			error: 'Notification event payload must be a JSON object'
		});
		expect(errorLog).toHaveBeenCalledOnce();
		errorLog.mockRestore();
	});
});
