// apps/mobile/src/lib/chat/bearer-fetch.ts
/**
 * The fetch the shared chat core (`@buildos/agentic-chat-client`) uses for its own requests:
 * turn discovery and reconciliation. It was written for the browser, so it asks for web-style
 * relative paths with `credentials: 'same-origin'`. On the phone those become absolute API
 * URLs carrying the session's bearer token and no cookies, the same rule as api-client.
 */
export function createBearerFetch(options: {
	baseUrl: string;
	getAccessToken: () => Promise<string | null>;
	fetchImpl?: typeof fetch;
}): typeof fetch {
	const base = options.baseUrl.replace(/\/+$/, '');
	const doFetch = options.fetchImpl ?? fetch;
	return async (input, init) => {
		const url =
			typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		const absolute = url.startsWith('/') ? `${base}${url}` : url;
		const token = await options.getAccessToken();
		const headers = new Headers(init?.headers);
		if (token) headers.set('authorization', `Bearer ${token}`);
		return doFetch(absolute, { ...init, headers, credentials: 'omit' });
	};
}
