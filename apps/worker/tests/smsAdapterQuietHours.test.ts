// apps/worker/tests/smsAdapterQuietHours.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkQuietHours } from '../src/lib/utils/smsPreferenceChecks';

const mocks = vi.hoisted(() => ({ safety: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock('@buildos/supabase-client', () => ({
	createServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc })
}));
vi.mock('../src/workers/notification/preferenceChecker', () => ({
	checkUserPreferences: vi.fn(async () => ({ allowed: true }))
}));
vi.mock('../src/lib/utils/smsPreferenceChecks', async (importOriginal) => ({
	...(await importOriginal<typeof import('../src/lib/utils/smsPreferenceChecks')>()),
	performSMSSafetyChecks: mocks.safety
}));
import { sendSMSNotification } from '../src/workers/notification/smsAdapter';

describe('SMS adapter quiet hours', () => {
	beforeEach(() => vi.clearAllMocks());
	it.each([
		['2026-10-20T02:00:00Z', '2026-10-20T12:00:00.000Z'],
		['2026-11-01T04:30:00Z', '2026-11-01T13:00:00.000Z']
	])('returns a structured deferral across midnight/DST from %s', async (now, until) => {
		const quietHours = checkQuietHours(
			new Date(now),
			'21:00:00',
			'08:00:00',
			'America/New_York'
		);
		mocks.safety.mockResolvedValueOnce({
			allowed: false,
			reason: quietHours.reason,
			rescheduleTime: quietHours.rescheduleTime,
			checks: { phoneVerification: true, quietHours, rateLimit: { allowed: true } }
		});
		const logger: any = {
			child: () => logger,
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn()
		};
		const result = await sendSMSNotification(
			{
				id: 'delivery-1',
				recipient_user_id: 'user-1',
				channel: 'sms',
				status: 'pending',
				channel_identifier: '+12125550123',
				payload: { title: 'Title', body: 'Body', event_type: 'brief.completed' }
			} as any,
			logger
		);
		expect(result).toMatchObject({
			success: false,
			outcome: 'deferred',
			deferred_until: until
		});
		expect(mocks.from).not.toHaveBeenCalled();
		expect(mocks.rpc).not.toHaveBeenCalled();
	});
});
