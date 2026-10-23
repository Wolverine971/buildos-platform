// apps/worker/tests/smsSendingSwitch.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe('notification SMS sending switch', () => {
	it('keeps the environment kill switch authoritative without a database read', async () => {
		vi.stubEnv('PRIVATE_SMS_SENDING_ENABLED', 'false');
		const { isNotificationSmsSendingEnabled } = await import('../src/config/sms');
		const rpc = vi.fn();
		expect(await isNotificationSmsSendingEnabled({ rpc } as any)).toBe(false);
		expect(rpc).not.toHaveBeenCalled();
	});

	it.each([true, false, null, 'true'])(
		'requires an explicit database boolean, received %j',
		async (value) => {
			vi.stubEnv('PRIVATE_SMS_SENDING_ENABLED', 'true');
			const { isNotificationSmsSendingEnabled } = await import('../src/config/sms');
			const rpc = vi.fn(async () => ({ data: value, error: null }));
			const client = { rpc };
			expect(await isNotificationSmsSendingEnabled(client as any)).toBe(value === true);
			expect(rpc).toHaveBeenCalledWith('get_notification_sms_sending_enabled');
			expect(rpc.mock.contexts[0]).toBe(client);
		}
	);

	it('retries a database outage instead of cancelling or sending', async () => {
		vi.stubEnv('PRIVATE_SMS_SENDING_ENABLED', 'true');
		const { isNotificationSmsSendingEnabled } = await import('../src/config/sms');
		await expect(
			isNotificationSmsSendingEnabled({
				rpc: vi.fn(async () => ({ data: null, error: { message: 'database unavailable' } }))
			} as any)
		).rejects.toThrow('database unavailable');
	});
});
