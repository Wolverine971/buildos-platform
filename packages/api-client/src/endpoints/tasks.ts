// packages/api-client/src/endpoints/tasks.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type {
	TaskCreateInput,
	TaskDeleteInput,
	TaskDeleteResponse,
	TaskDetailResponse,
	TaskUpdateInput,
	TaskWriteResponse
} from '../types';

const encode = encodeURIComponent;

export function createTaskEndpoints(http: BuildOsHttp) {
	return {
		/** GET /api/onto/tasks/[id] — the task, its assignees, linked entities and read details. */
		get: (taskId: string, options?: RequestOptions) =>
			http.request<TaskDetailResponse>(`/api/onto/tasks/${encode(taskId)}`, options),

		/** POST /api/onto/tasks/create */
		create: (input: TaskCreateInput, options?: RequestOptions) =>
			http.request<TaskWriteResponse>('/api/onto/tasks/create', {
				method: 'POST',
				body: input,
				...options
			}),

		/** PATCH /api/onto/tasks/[id] — send only the fields that changed. */
		update: (taskId: string, patch: TaskUpdateInput, options?: RequestOptions) =>
			http.request<TaskWriteResponse>(`/api/onto/tasks/${encode(taskId)}`, {
				method: 'PATCH',
				body: patch,
				...options
			}),

		/** DELETE /api/onto/tasks/[id] — soft delete, or archive with `{ archive: true }`. */
		remove: (taskId: string, input: TaskDeleteInput = {}, options?: RequestOptions) =>
			http.request<TaskDeleteResponse>(`/api/onto/tasks/${encode(taskId)}`, {
				method: 'DELETE',
				body: input,
				...options
			})
	};
}

export type TaskEndpoints = ReturnType<typeof createTaskEndpoints>;
