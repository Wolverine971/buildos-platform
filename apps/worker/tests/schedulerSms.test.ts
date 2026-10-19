// apps/worker/tests/schedulerSms.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	enabled: false,
	schedule: vi.fn(),
	from: vi.fn(),
	refreshMetrics: vi.fn(),
	checkAlerts: vi.fn()
}));

vi.mock('node-cron', () => ({
	default: { schedule: mocks.schedule, validate: () => true }
}));
vi.mock('../src/config/sms', () => ({
	get SMS_SENDING_ENABLED() {
		return mocks.enabled;
	},
	SMS_SENDING_DISABLED_REASON: 'SMS disabled for test'
}));
vi.mock('../src/lib/supabase', () => ({
	supabase: { from: mocks.from, rpc: vi.fn() }
}));
vi.mock('../src/lib/queue', () => ({ queue: { add: vi.fn() } }));
vi.mock('@buildos/shared-utils', async (importOriginal) => ({
	...(await importOriginal<typeof import('@buildos/shared-utils')>()),
	smsMetricsService: { refreshMaterializedView: mocks.refreshMetrics },
	smsAlertsService: { checkAlerts: mocks.checkAlerts }
}));

import { startScheduler } from '../src/scheduler';

describe('SMS cron registration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mocks.refreshMetrics.mockResolvedValue(undefined);
		mocks.checkAlerts.mockResolvedValue([]);
	});
	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it('omits both SMS crons when disabled and preserves every other registration', () => {
		mocks.enabled = true;
		startScheduler();
		const enabledSchedules = mocks.schedule.mock.calls.map(([expression]) => expression);
		// The SMS callbacks follow the brief scheduler in the composition root.
		expect(enabledSchedules.slice(1, 3)).toEqual(['0 0 * * *', '0 * * * *']);
		mocks.schedule.mockClear();
		mocks.enabled = false;
		startScheduler();
		expect(mocks.schedule.mock.calls.map(([expression]) => expression)).toEqual([
			enabledSchedules[0],
			...enabledSchedules.slice(3)
		]);
		expect(mocks.from).not.toHaveBeenCalled();
		expect(mocks.refreshMetrics).not.toHaveBeenCalled();
	});

	it('keeps daily reminder scheduling and hourly metric refresh working when enabled', async () => {
		mocks.enabled = true;
		const query = {
			select: vi.fn(),
			eq: vi.fn(),
			then: (resolve: (value: { data: never[]; error: null }) => unknown) =>
				Promise.resolve({ data: [], error: null }).then(resolve)
		};
		query.select.mockReturnValue(query);
		query.eq.mockReturnValue(query);
		mocks.from.mockReturnValue(query);
		startScheduler();
		await mocks.schedule.mock.calls[1]![1]();
		await mocks.schedule.mock.calls[2]![1]();
		expect(mocks.from).toHaveBeenCalledWith('user_sms_preferences');
		expect(mocks.refreshMetrics).toHaveBeenCalledOnce();
		expect(mocks.checkAlerts).toHaveBeenCalledOnce();
	});
});
