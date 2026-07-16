import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_POLICY_VERSIONS } from '$lib/legal/policy-versions';

const { createLegalAcceptanceIntentMock } = vi.hoisted(() => ({
	createLegalAcceptanceIntentMock: vi.fn()
}));

vi.mock('$lib/server/legal-acceptance', () => ({
	createLegalAcceptanceIntent: createLegalAcceptanceIntentMock
}));

import { POST } from './+server';

function createRequest(body: Record<string, unknown>) {
	return new Request('https://build-os.com/api/legal/acceptance-intent', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

describe('POST /api/legal/acceptance-intent', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createLegalAcceptanceIntentMock.mockResolvedValue({
			token: 'intent-token',
			acceptedAt: '2026-07-16T12:00:00.000Z',
			expiresAt: '2026-07-16T12:15:00.000Z'
		});
	});

	it('records the current versions and sets an HttpOnly OAuth cookie', async () => {
		const cookies = { set: vi.fn() };
		const request = createRequest({
			surface: 'google_signup',
			accepted: true,
			termsVersion: CURRENT_POLICY_VERSIONS.terms,
			privacyVersion: CURRENT_POLICY_VERSIONS.privacy
		});

		const response = await POST({ request, cookies, url: new URL(request.url) } as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.versions).toEqual(CURRENT_POLICY_VERSIONS);
		expect(createLegalAcceptanceIntentMock).toHaveBeenCalledWith(
			expect.objectContaining({ request }),
			'google_signup'
		);
		expect(cookies.set).toHaveBeenCalledWith(
			'buildos_legal_acceptance',
			'intent-token',
			expect.objectContaining({ httpOnly: true, sameSite: 'lax', secure: true })
		);
	});

	it('rejects stale policy versions', async () => {
		const request = createRequest({
			surface: 'email_signup',
			accepted: true,
			termsVersion: 'old-version',
			privacyVersion: CURRENT_POLICY_VERSIONS.privacy
		});

		const response = await POST({
			request,
			cookies: { set: vi.fn() },
			url: new URL(request.url)
		} as any);

		expect(response.status).toBe(400);
		expect(createLegalAcceptanceIntentMock).not.toHaveBeenCalled();
	});
});
