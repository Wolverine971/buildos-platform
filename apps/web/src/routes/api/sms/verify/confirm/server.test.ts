// apps/web/src/routes/api/sms/verify/confirm/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { checkVerificationMock } = vi.hoisted(() => ({ checkVerificationMock: vi.fn() }));

vi.mock('$env/static/private', () => ({
	PRIVATE_TWILIO_ACCOUNT_SID: 'AC-test',
	PRIVATE_TWILIO_AUTH_TOKEN: 'token',
	PRIVATE_TWILIO_MESSAGING_SERVICE_SID: 'MG-test',
	PRIVATE_TWILIO_VERIFY_SERVICE_SID: 'VA-test'
}));

vi.mock('$env/dynamic/private', () => ({ env: { PRIVATE_SMS_SENDING_ENABLED: 'false' } }));

vi.mock('@buildos/twilio-service', () => ({
	TwilioClient: vi.fn(function () {
		return { checkVerification: checkVerificationMock };
	})
}));

import { POST } from './+server';

function createEvent() {
	const upsert = vi.fn(async () => ({ error: null }));
	return {
		upsert,
		event: {
			request: new Request('http://localhost/api/sms/verify/confirm', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ phoneNumber: '+15555550100', code: '123456' })
			}),
			locals: {
				safeGetSession: vi.fn(async () => ({ session: { user: { id: 'user-1' } } })),
				supabase: { from: vi.fn(() => ({ upsert })), rpc: vi.fn() }
			}
		} as any
	};
}

describe('POST /api/sms/verify/confirm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('answers a wrong or expired code with a friendly 400', async () => {
		checkVerificationMock.mockResolvedValue(false);
		const { event, upsert } = createEvent();

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toBe(
			'That code is invalid or has expired. Request a new code and try again.'
		);
		expect(upsert).not.toHaveBeenCalled();
	});

	it('answers a Twilio outage with a retryable 503 and never leaks its message', async () => {
		checkVerificationMock.mockRejectedValue(
			new Error('Authenticate: Twilio internal account AC-test error 20003')
		);
		const { event, upsert } = createEvent();

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(503);
		expect(payload.code).toBe('SERVICE_UNAVAILABLE');
		expect(JSON.stringify(payload)).not.toContain('20003');
		expect(upsert).not.toHaveBeenCalled();
	});

	it('marks the phone verified when the code is approved', async () => {
		checkVerificationMock.mockResolvedValue(true);
		const { event, upsert } = createEvent();

		const response = await POST(event);

		expect(response.status).toBe(200);
		expect(upsert).toHaveBeenCalledWith(
			expect.objectContaining({ user_id: 'user-1', phone_verified: true }),
			{ onConflict: 'user_id' }
		);
	});
});
