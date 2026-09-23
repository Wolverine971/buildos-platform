// packages/twilio-service/src/client.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const twilioMocks = vi.hoisted(() => {
	const messagesCreate = vi.fn();
	const verificationCreate = vi.fn();
	const verificationCheckCreate = vi.fn();
	const messages = Object.assign(vi.fn(), { create: messagesCreate });
	const client = {
		messages,
		verify: {
			v2: {
				services: vi.fn(() => ({
					verifications: { create: verificationCreate },
					verificationChecks: { create: verificationCheckCreate }
				}))
			}
		}
	};

	return {
		client,
		messagesCreate,
		verificationCreate,
		verificationCheckCreate,
		twilioFactory: vi.fn(() => client)
	};
});

vi.mock('twilio', () => ({ default: twilioMocks.twilioFactory }));

import { TwilioClient } from './client';

const baseConfig = {
	accountSid: 'AC_test',
	authToken: 'test-token',
	messagingServiceSid: 'MG_test',
	verifyServiceSid: 'VA_test'
};

describe('TwilioClient sending gate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('blocks SMS delivery by default before calling Twilio', async () => {
		const client = new TwilioClient(baseConfig);

		await expect(client.sendSMS({ to: '+15551234567', body: 'Hello' })).rejects.toThrow(
			'SMS sending is disabled'
		);
		expect(twilioMocks.messagesCreate).not.toHaveBeenCalled();
	});

	it('blocks phone-verification texts by default before calling Twilio', async () => {
		const client = new TwilioClient(baseConfig);

		await expect(client.verifyPhoneNumber('+15551234567')).rejects.toThrow(
			'SMS sending is disabled'
		);
		expect(twilioMocks.verificationCreate).not.toHaveBeenCalled();
	});

	it('allows SMS delivery only when explicitly enabled', async () => {
		twilioMocks.messagesCreate.mockResolvedValueOnce({ sid: 'SM_test' });
		const client = new TwilioClient({ ...baseConfig, sendingEnabled: true });

		await client.sendSMS({ to: '+15551234567', body: 'Hello' });

		expect(twilioMocks.messagesCreate).toHaveBeenCalledOnce();
	});
});

function twilioError(code: number, status: number): Error & { code: number; status: number } {
	return Object.assign(new Error(`Twilio error ${code}`), { code, status });
}

describe('TwilioClient recipient formatting', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('keeps the country code of an international number with 10 national digits', async () => {
		twilioMocks.messagesCreate.mockResolvedValueOnce({ sid: 'SM_test' });
		const client = new TwilioClient({ ...baseConfig, sendingEnabled: true });

		await client.sendSMS({ to: '+65 9123 4567', body: 'Hello' });

		expect(twilioMocks.messagesCreate).toHaveBeenCalledWith(
			expect.objectContaining({ to: '+6591234567' })
		);
	});
});

describe('TwilioClient error mapping', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('maps 21610 to an opted-out error and keeps the Twilio code and status', async () => {
		twilioMocks.messagesCreate.mockRejectedValueOnce(twilioError(21610, 400));
		const client = new TwilioClient({ ...baseConfig, sendingEnabled: true });

		const error = await client
			.sendSMS({ to: '+15551234567', body: 'Hello' })
			.catch((caught: unknown) => caught as Error & { code?: number; status?: number });

		expect(error?.message).toMatch(/opted out/i);
		expect(error?.message).not.toMatch(/maximum length/i);
		expect(error).toMatchObject({ code: 21610, status: 400 });
	});

	it('keeps the Twilio code on a mapped invalid-number error', async () => {
		twilioMocks.messagesCreate.mockRejectedValueOnce(twilioError(21211, 400));
		const client = new TwilioClient({ ...baseConfig, sendingEnabled: true });

		await expect(client.sendSMS({ to: '+15551234567', body: 'Hello' })).rejects.toMatchObject({
			code: 21211,
			status: 400
		});
	});

	it('treats a missing verification (20404) as an invalid code', async () => {
		twilioMocks.verificationCheckCreate.mockRejectedValueOnce(twilioError(20404, 404));
		const client = new TwilioClient(baseConfig);

		await expect(client.checkVerification('+15551234567', '123456')).resolves.toBe(false);
	});

	it('does not disguise a Twilio outage as an invalid code', async () => {
		twilioMocks.verificationCheckCreate.mockRejectedValueOnce(twilioError(20500, 500));
		const client = new TwilioClient(baseConfig);

		await expect(client.checkVerification('+15551234567', '123456')).rejects.toMatchObject({
			code: 20500
		});
	});
});
