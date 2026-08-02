// apps/web/src/lib/services/agentic-chat/tools/webvisit/index.test.ts
import { describe, expect, it, vi } from 'vitest';
import { performWebVisit } from './index';

describe('performWebVisit revalidation', () => {
	it('forwards HTTP validators and represents a 304 without parsing content', async () => {
		const fetchFn = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			expect(headers.get('if-none-match')).toBe('"content-v3"');
			expect(headers.get('if-modified-since')).toBe('Sat, 01 Aug 2026 12:00:00 GMT');
			return new Response(null, {
				status: 304,
				headers: { etag: '"content-v3"' }
			});
		});

		const result = await performWebVisit(
			{ url: 'https://93.184.216.34/research' },
			fetchFn as typeof fetch,
			{
				ifNoneMatch: '"content-v3"',
				ifModifiedSince: 'Sat, 01 Aug 2026 12:00:00 GMT'
			}
		);

		expect(result.status_code).toBe(304);
		expect(result.text).toBe('');
		expect(result.info).toMatchObject({
			not_modified: true,
			bytes: 0,
			etag: '"content-v3"'
		});
	});
});
