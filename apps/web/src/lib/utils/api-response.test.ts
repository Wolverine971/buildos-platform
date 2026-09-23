// apps/web/src/lib/utils/api-response.test.ts
import { describe, expect, it } from 'vitest';
import { ApiResponse } from './api-response';

describe('ApiResponse cache headers', () => {
	it('keeps cached JSON private unless the caller opts into a shared cache', () => {
		const response = ApiResponse.success({ tasks: [] }, undefined, { maxAge: 60 });
		expect(response.headers.get('Cache-Control')).toBe('private, max-age=60');

		expect(ApiResponse.cached({ tasks: [] }).headers.get('Cache-Control')).toBe(
			'private, max-age=300'
		);
	});

	it('marks a response public only when explicitly requested', () => {
		const response = ApiResponse.cached({ page: 'public' }, undefined, 300, {
			public: true,
			staleWhileRevalidate: 3600
		});
		expect(response.headers.get('Cache-Control')).toBe(
			'public, max-age=300, stale-while-revalidate=3600'
		);
	});
});
