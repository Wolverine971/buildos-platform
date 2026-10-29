// packages/api-client/src/endpoints/projects.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type {
	DesktopResponse,
	ProjectFullParams,
	ProjectFullResponse,
	ProjectListParams,
	ProjectListResponse,
	ProjectTasksParams,
	ProjectTasksResponse
} from '../types';

const encode = encodeURIComponent;

export function createProjectEndpoints(http: BuildOsHttp) {
	return {
		/** GET /api/onto/projects — lightweight summaries for lists and pickers. */
		list: (params: ProjectListParams = {}, options?: RequestOptions) =>
			http.request<ProjectListResponse>('/api/onto/projects', {
				query: { search: params.search, limit: params.limit, include: params.include },
				...options
			}),

		/** GET /api/onto/projects/[id]/full — the project and everything in it. */
		full: (projectId: string, params: ProjectFullParams = {}, options?: RequestOptions) =>
			http.request<ProjectFullResponse>(`/api/onto/projects/${encode(projectId)}/full`, {
				query: { profile: params.profile },
				...options
			}),

		/** GET /api/onto/projects/[id]/tasks — one task bucket, paginated. */
		tasks: (projectId: string, params: ProjectTasksParams, options?: RequestOptions) =>
			http.request<ProjectTasksResponse>(`/api/onto/projects/${encode(projectId)}/tasks`, {
				query: {
					bucket: params.bucket,
					limit: params.limit,
					offset: params.offset,
					asOf: params.asOf
				},
				...options
			}),

		/**
		 * GET /api/projects/desktop — every project as a tile (pulse, bars, task mix, emoji,
		 * parent) plus the Workspace's loose items, in one request.
		 */
		desktop: (options?: RequestOptions) =>
			http.request<DesktopResponse>('/api/projects/desktop', { ...options })
	};
}

export type ProjectEndpoints = ReturnType<typeof createProjectEndpoints>;
