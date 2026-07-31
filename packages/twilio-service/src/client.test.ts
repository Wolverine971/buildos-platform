import { beforeEach, describe, expect, it, vi } from 'vitest';

const twilioMocks = vi.hoisted(() => {
	const messagesCreate = vi.fn();
	const verificationCreate = vi.fn();
	const messages = Object.assign(vi.fn(), { create: messagesCreate });
	const client = {
		messages,
		verify: {
			v2: {
				services: vi.fn(() => ({
					verifications: { create: verificationCreate }
				}))
			}
		}
	};

	return {
		client,
		messagesCreate,
		verificationCreate,
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
