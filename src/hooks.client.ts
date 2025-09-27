// src/hooks.client.ts
import type { HandleClientError } from '@sveltejs/kit';
import { browser } from '$app/environment';

// CSRF token handling remains the same
if (browser) {
	const originalFetch = window.fetch;

	window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof Request
					? input.url
					: input.toString();

		if (url.startsWith('/api/') || (url.startsWith('/') && !url.startsWith('//'))) {
			const method = init?.method?.toUpperCase() || 'GET';

			if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
				const metaTag = document.querySelector('meta[name="csrf-token"]');
				const csrfToken = metaTag?.getAttribute('content');

				if (csrfToken) {
					const modifiedInit = { ...init };
					const headers = new Headers(modifiedInit.headers || {});

					if (!headers.has('x-csrf-token')) {
						headers.set('x-csrf-token', csrfToken);
					}

					modifiedInit.headers = headers;
					return originalFetch(input, modifiedInit);
				}
			}
		}

		return originalFetch(input, init);
	};
}

export const handleError: HandleClientError = ({ error, event }) => {
	const errorId = Math.random().toString(36).substr(2, 9);

	console.error(`[${errorId}] Client error:`, {
		message: error.message,
		url: event.url?.pathname,
		timestamp: new Date().toISOString()
	});

	return {
		message: 'Something went wrong',
		errorId
	};
};
