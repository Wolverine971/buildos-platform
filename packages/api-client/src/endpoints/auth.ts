// packages/api-client/src/endpoints/auth.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type { CurrentUser, HandoffRequest, HandoffResponse } from '../types';

export function createAuthEndpoints(http: BuildOsHttp) {
	return {
		/** GET /api/auth/user */
		me: (options?: RequestOptions) => http.request<CurrentUser>('/api/auth/user', options),

		/** POST /api/auth/handoff — one-time URL that signs the in-app browser into the web session. */
		createHandoff: (input: HandoffRequest = {}, options?: RequestOptions) =>
			http.request<HandoffResponse>('/api/auth/handoff', {
				method: 'POST',
				body: input,
				...options
			})
	};
}

export type AuthEndpoints = ReturnType<typeof createAuthEndpoints>;
