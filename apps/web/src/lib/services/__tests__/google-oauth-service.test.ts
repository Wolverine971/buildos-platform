// src/lib/services/__tests__/google-oauth-service.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/static/private', () => ({
	PRIVATE_GOOGLE_CLIENT_ID: 'test-client-id',
	PRIVATE_GOOGLE_CLIENT_SECRET: 'test-client-secret'
}));

import { GoogleOAuthService } from '../google-oauth-service';

describe('GoogleOAuthService calendar auth state', () => {
	it('encodes and decodes calendar state payloads', () => {
		const state = {
			userId: 'user-123',
			redirectPath: '/projects/abc',
			nonce: 'abc123'
		};

		const encoded = GoogleOAuthService.encodeCalendarState(state);
		expect(typeof encoded).toBe('string');

		const decoded = GoogleOAuthService.decodeCalendarState(encoded);
		expect(decoded).toMatchObject({
			userId: state.userId,
			redirectPath: state.redirectPath,
			nonce: state.nonce
		});
	});

	it('decodes legacy userId-only state values', () => {
		const decoded = GoogleOAuthService.decodeCalendarState('legacy-user-id');
		expect(decoded).toEqual({ userId: 'legacy-user-id', redirectPath: undefined, nonce: null });
	});

	it('includes redirect path when generating calendar auth URLs', () => {
		const service = new GoogleOAuthService({} as any);
		const url = service.generateCalendarAuthUrl('https://example.com/callback', 'user-123', {
			redirectPath: '/projects/abc?tab=overview'
		});

		const parsed = new URL(url);
		expect(parsed.searchParams.get('client_id')).toBe('test-client-id');

		const encodedState = parsed.searchParams.get('state');
		expect(encodedState).toBeTruthy();

		const decodedState = GoogleOAuthService.decodeCalendarState(encodedState);
		expect(decodedState).toMatchObject({
			userId: 'user-123',
			redirectPath: '/projects/abc?tab=overview'
		});
	});
});
