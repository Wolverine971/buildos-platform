// packages/shared-utils/src/index.test.ts
import { afterEach, describe, it, expect, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => {
	const insert = vi.fn(async () => ({ data: null, error: null as unknown }));
	const rpc = vi.fn(async () => ({ data: null, error: null as unknown }));
	const client = { from: vi.fn(() => ({ insert })), rpc };
	return { insert, rpc, client };
});

vi.mock('@buildos/supabase-client', () => ({
	createServiceClient: () => supabaseMocks.client
}));

import { SMSAlertsService } from './metrics/smsAlerts.service';
import { SMSMetricsService } from './metrics/smsMetrics.service';
import { createLogger } from './logging/logger';

afterEach(() => {
	vi.restoreAllMocks();
	supabaseMocks.insert.mockClear();
	supabaseMocks.rpc.mockClear();
});

describe('shared-utils', () => {
	it('should export utilities', () => {
		// Placeholder test - actual tests should be added as needed
		expect(true).toBe(true);
	});
});

describe('SMS alert history', () => {
	const alert = {
		alert_type: 'delivery_rate_critical',
		severity: 'critical',
		metric_value: 42,
		threshold_value: 90,
		message: 'SMS delivery rate is 42.0%',
		notification_channels: ['slack', 'pagerduty', 'email']
	};

	it('does not claim a notification was sent while every sender is a stub', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const service = new SMSAlertsService() as any;

		const delivered = await service.sendNotification(alert);
		await service.recordAlert(alert, delivered);

		expect(delivered).toBe(false);
		expect(supabaseMocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({ notification_sent: false })
		);
	});
});

describe('best-effort writes surface PostgREST errors', () => {
	it('does not report an SMS metric as recorded when the RPC returns an error', async () => {
		supabaseMocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc down' } });
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await expect(new SMSMetricsService().recordScheduled('user-1', 2)).resolves.toBeUndefined();

		expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Recorded 2 scheduled SMS'));
		expect(error).toHaveBeenCalledWith(
			'[SMSMetrics] Error recording scheduled count:',
			expect.objectContaining({ message: 'rpc down' })
		);
	});

	it('logs a failed notification_logs insert instead of dropping it silently', async () => {
		supabaseMocks.insert.mockResolvedValueOnce({
			data: null,
			error: { message: 'insert denied' }
		});
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const logger = createLogger('test', supabaseMocks.client as any, {
			enableConsole: false,
			minLevel: 'debug'
		});

		logger.info('hello');

		await vi.waitFor(() => {
			expect(error).toHaveBeenCalledWith(
				'[Logger] Database logging failed:',
				expect.objectContaining({ message: 'insert denied' })
			);
		});
	});
});
