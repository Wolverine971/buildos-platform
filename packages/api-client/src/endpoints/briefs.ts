// packages/api-client/src/endpoints/briefs.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type { DailyBriefParams, DailyBriefResponse } from '../types';

export function createBriefEndpoints(http: BuildOsHttp) {
	return {
		/**
		 * GET /api/daily-briefs — the newest brief for one date; `brief` is null when
		 * none exists yet. Defaults to today.
		 */
		forDate: (params: DailyBriefParams = {}, options?: RequestOptions) =>
			http.request<DailyBriefResponse>('/api/daily-briefs', {
				query: { date: params.date },
				...options
			})
	};
}

export type BriefEndpoints = ReturnType<typeof createBriefEndpoints>;
