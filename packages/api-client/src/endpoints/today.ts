// packages/api-client/src/endpoints/today.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type { TodayParams, TodayResponse } from '../types';

export function createTodayEndpoints(http: BuildOsHttp) {
	return {
		/** GET /api/today — today's events, tasks and overdue count in the user's timezone. */
		get: (params: TodayParams = {}, options?: RequestOptions) =>
			http.request<TodayResponse>('/api/today', {
				query: { timezone: params.timezone },
				...options
			})
	};
}

export type TodayEndpoints = ReturnType<typeof createTodayEndpoints>;
