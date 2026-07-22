// apps/web/src/hooks.client.ts
import type { HandleClientError } from '@sveltejs/kit';
import { browser } from '$app/environment';
import {
	isAbortLikeClientError,
	isClientErrorReportEndpoint,
	reportClientError,
	reportClientHttpError,
	shouldTrackFailedClientResponse
} from '$lib/utils/client-error-reporting';
import {
	isRecoverableRouteLoadError,
	recoverFromRouteLoadError
} from '$lib/utils/client-route-recovery';

let rawBrowserFetch: typeof window.fetch | null = null;

function resolveRequestDetails(input: RequestInfo | URL): {
	url: string;
	pathname: string | null;
	sameOrigin: boolean;
	method?: string;
} {
	if (!browser) {
		return {
			url: typeof input === 'string' ? input : input.toString(),
			pathname: null,
			sameOrigin: false
		};
	}

	const rawUrl =
		typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();

	try {
		const parsed = new URL(rawUrl, window.location.origin);
		return {
			url: parsed.toString(),
			pathname: parsed.pathname,
			sameOrigin: parsed.origin === window.location.origin,
			method: input instanceof Request ? input.method : undefined
		};
	} catch {
		return {
			url: rawUrl,
			pathname: rawUrl.startsWith('/') ? rawUrl : null,
			sameOrigin: rawUrl.startsWith('/'),
			method: input instanceof Request ? input.method : undefined
		};
	}
}

function recoverRouteLoad(error: unknown): boolean {
	if (!browser) return false;

	try {
		return recoverFromRouteLoadError(error, {
			route: `${window.location.pathname}${window.location.search}`,
			storage: window.sessionStorage,
			reload: () => window.location.reload(),
			refreshModule: async (moduleUrl) => {
				const assetUrl = new URL(moduleUrl, window.location.href);
				if (
					assetUrl.origin !== window.location.origin ||
					!assetUrl.pathname.startsWith('/_app/immutable/')
				) {
					return;
				}

				const response = await (rawBrowserFetch ?? window.fetch)(assetUrl, {
					cache: 'reload',
					credentials: 'same-origin'
				});
				if (!response.ok) {
					throw new Error(`Failed to refresh route module (${response.status})`);
				}
				await response.arrayBuffer();
			}
		});
	} catch {
		return false;
	}
}

// CSRF token handling remains the same
if (browser) {
	const originalFetch = window.fetch.bind(window);
	rawBrowserFetch = originalFetch;

	window.addEventListener('vite:preloadError', (event) => {
		const error = (event as Event & { payload?: unknown }).payload;
		if (!isRecoverableRouteLoadError(error)) return;

		event.preventDefault();
		void reportClientError(
			{
				kind: 'runtime',
				error,
				endpoint: window.location.pathname,
				method: 'CLIENT',
				url: window.location.href,
				metadata: {
					source: 'hooks.client.vitePreloadError',
					recovery: 'reload'
				}
			},
			originalFetch
		);
		recoverRouteLoad(error);
	});

	window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const request = resolveRequestDetails(input);
		const method = (init?.method || request.method || 'GET').toUpperCase();
		let requestInit = init;

		if (
			request.pathname &&
			(request.pathname.startsWith('/api/') || request.pathname.startsWith('/')) &&
			!request.pathname.startsWith('//')
		) {
			if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
				const metaTag = document.querySelector('meta[name="csrf-token"]');
				const csrfToken = metaTag?.getAttribute('content');

				if (csrfToken) {
					requestInit = { ...init };
					const headers = new Headers(requestInit.headers || {});

					if (!headers.has('x-csrf-token')) {
						headers.set('x-csrf-token', csrfToken);
					}

					requestInit.headers = headers;
				}
			}
		}

		try {
			const response = await originalFetch(input, requestInit);

			if (
				request.sameOrigin &&
				!isClientErrorReportEndpoint(request.pathname) &&
				shouldTrackFailedClientResponse(request.pathname, response.status)
			) {
				void reportClientHttpError(
					{
						response: response.clone(),
						endpoint: request.pathname ?? undefined,
						method,
						url: request.url,
						metadata: {
							source: 'hooks.client.fetch',
							sameOrigin: request.sameOrigin
						}
					},
					originalFetch
				);
			}

			return response;
		} catch (error) {
			if (
				request.sameOrigin &&
				!isClientErrorReportEndpoint(request.pathname) &&
				!isAbortLikeClientError(error)
			) {
				void reportClientError(
					{
						kind: 'fetch_network',
						error,
						endpoint: request.pathname ?? undefined,
						method,
						url: request.url,
						metadata: {
							source: 'hooks.client.fetch',
							sameOrigin: request.sameOrigin
						}
					},
					originalFetch
				);
			}

			throw error;
		}
	};
}

export const handleError: HandleClientError = ({ error, event }) => {
	const errorId = Math.random().toString(36).substr(2, 9);
	const errorMessage = error instanceof Error ? error.message : String(error);
	const shouldRecoverRoute = browser && isRecoverableRouteLoadError(error);
	let didStartRouteRecovery = false;

	console.error(`[${errorId}] Client error:`, {
		message: errorMessage,
		url: event.url?.pathname,
		timestamp: new Date().toISOString()
	});

	if (browser && rawBrowserFetch) {
		void reportClientError(
			{
				kind: 'runtime',
				error,
				endpoint: event.url?.pathname,
				method: 'CLIENT',
				url: event.url?.toString(),
				metadata: {
					source: 'hooks.client.handleError',
					errorId
				}
			},
			rawBrowserFetch
		);
	}

	if (shouldRecoverRoute) {
		didStartRouteRecovery = recoverRouteLoad(error);
	}

	return {
		message: didStartRouteRecovery ? 'Updating BuildOS…' : 'Something went wrong',
		errorId
	};
};
