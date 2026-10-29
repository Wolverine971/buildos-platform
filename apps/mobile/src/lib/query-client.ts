// apps/mobile/src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';
import { BuildOsApiError } from '@buildos/api-client';

export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30_000,
				// One retry for flaky connections; never retry an auth failure.
				retry: (failureCount, error) =>
					failureCount < 1 &&
					!(error instanceof BuildOsApiError && error.isUnauthorized())
			},
			mutations: {
				retry: false,
				gcTime: 0
			}
		}
	});
}
