// packages/api-client/src/endpoints/activity.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type { ActivityListParams, ActivityTimelinePage } from '../types';

export function createActivityEndpoints(http: BuildOsHttp) {
	return {
		/** GET /api/activity — one page of the notifications/activity timeline. */
		list: (params: ActivityListParams = {}, options?: RequestOptions) =>
			http.request<ActivityTimelinePage>('/api/activity', {
				query: {
					before: params.before,
					limit: params.limit,
					lanes:
						params.lanes && params.lanes.length > 0 ? params.lanes.join(',') : undefined
				},
				...options
			})
	};
}

export type ActivityEndpoints = ReturnType<typeof createActivityEndpoints>;
