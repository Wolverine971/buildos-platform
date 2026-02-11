// apps/web/src/lib/utils/sanitize-data.ts
import type { Task } from '$lib/types/project';

export const sanitizeTaskData = (task: Task): Partial<Task> => {
	let sanitizedData = {
		id: task.id,
		title: task.title,
		description: task.description,
		status: task.status,
		priority: task.priority,
		task_type: task.task_type,
		start_date: task.start_date,
		duration_minutes: task.duration_minutes,
		deleted_at: task.deleted_at || null,
		created_at: task.created_at,
		updated_at: task.updated_at,
		completed_at: task.completed_at,
		project_id: task.project_id,
		user_id: task.user_id,
		parent_task_id: task.parent_task_id,
		dependencies: task.dependencies,
		recurrence_pattern: task.recurrence_pattern,
		recurrence_ends: task.recurrence_ends,
		details: task.details
	};

	Object.keys(sanitizedData).forEach((key) => {
		if ((sanitizedData as Record<string, any>)[key] === undefined) {
			delete (sanitizedData as Record<string, any>)[key];
		}
	});

	return sanitizedData;
};
