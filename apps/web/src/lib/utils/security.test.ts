// apps/web/src/lib/utils/security.test.ts
import { describe, expect, it } from 'vitest';

import { constantTimeCompare, isAuthorizedCronRequest } from './security';

describe('security helpers', () => {
	it('compares equal strings safely', () => {
		expect(constantTimeCompare('abc123', 'abc123')).toBe(true);
		expect(constantTimeCompare('abc123', 'abc124')).toBe(false);
		expect(constantTimeCompare('short', 'longer')).toBe(false);
	});

	it('authorizes cron requests against any configured secret', () => {
		const request = new Request('https://build-os.com/api/cron/welcome-sequence', {
			headers: {
				authorization: 'Bearer secret-two'
			}
		});

		expect(isAuthorizedCronRequest(request, ['secret-one', 'secret-two'])).toBe(true);
		expect(isAuthorizedCronRequest(request, ['secret-one', 'secret-three'])).toBe(false);
	});
});
