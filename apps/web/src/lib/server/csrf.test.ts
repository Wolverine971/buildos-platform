// apps/web/src/lib/server/csrf.test.ts
import { describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { createCrossSiteFormPostResponse } from './csrf';

function makeEvent(
	pathname: string,
	options: { method?: string; origin?: string; contentType?: string } = {}
): RequestEvent {
	const url = new URL(pathname, 'https://build-os.com');
	const headers = new Headers();
	if (options.origin !== undefined) headers.set('origin', options.origin);
	if (options.contentType !== undefined) headers.set('content-type', options.contentType);

	return {
		url,
		request: new Request(url, {
			method: options.method ?? 'POST',
			headers,
			body: options.method === 'GET' ? undefined : 'value=1'
		})
	} as RequestEvent;
}

describe('createCrossSiteFormPostResponse', () => {
	it('rejects cross-origin form mutations', () => {
		const response = createCrossSiteFormPostResponse(
			makeEvent('/auth/logout', {
				origin: 'https://attacker.example',
				contentType: 'application/x-www-form-urlencoded'
			})
		);

		expect(response?.status).toBe(403);
	});

	it('rejects form mutations with a missing Origin header', () => {
		const response = createCrossSiteFormPostResponse(
			makeEvent('/auth/logout', {
				contentType: 'application/x-www-form-urlencoded'
			})
		);

		expect(response?.status).toBe(403);
	});

	it('allows same-origin form mutations and non-form JSON requests', () => {
		expect(
			createCrossSiteFormPostResponse(
				makeEvent('/auth/logout', {
					origin: 'https://build-os.com',
					contentType: 'application/x-www-form-urlencoded'
				})
			)
		).toBeNull();

		expect(
			createCrossSiteFormPostResponse(
				makeEvent('/api/agent/v2/stream', { contentType: 'application/json' })
			)
		).toBeNull();
	});

	it('keeps native OAuth token and revocation form posts exempt', () => {
		for (const pathname of ['/oauth/token', '/oauth/revoke']) {
			expect(
				createCrossSiteFormPostResponse(
					makeEvent(pathname, {
						origin: 'https://native-client.example',
						contentType: 'application/x-www-form-urlencoded'
					})
				)
			).toBeNull();
		}
	});
});
