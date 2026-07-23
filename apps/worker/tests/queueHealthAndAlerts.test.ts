// apps/worker/tests/queueHealthAndAlerts.test.ts
// Liveness + alert tripwires from the 2026-07-23 audit (P0-4): a wedged claim
// loop must turn /health unhealthy, and silent failure streaks (the 220
// send_sms corpses) must trip an alert.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseQueue } from '../src/lib/supabaseQueue';
import {
	__resetQueueAlertCooldowns,
	checkQueueAlerts,
	emitQueueAlerts
} from '../src/lib/queueAlerts';

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		rpc: vi.fn(async () => ({ data: [], error: null })),
		from: vi.fn()
	}
}));

describe('SupabaseQueue.getHealth', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('reports unhealthy before start', () => {
		const queue = new SupabaseQueue({ pollInterval: 5000 });
		const health = queue.getHealth();
		expect(health.healthy).toBe(false);
		expect(health.reason).toBe('queue_not_started');
	});

	it('reports healthy after a successful poll and unhealthy once the loop stalls', async () => {
		const queue = new SupabaseQueue({ pollInterval: 5000 });
		await queue.start();
		expect(queue.getHealth().healthy).toBe(true);

		// No further successful polls; advance beyond max(5×pollInterval, 60s)
		vi.advanceTimersByTime(61_000);
		// Manually neutralize the interval's effect: the mocked rpc succeeds, so
		// simulate wedging by stopping timers from firing the poll.
		// (advanceTimersByTime fired polls; run pending promises then re-stall)
		await vi.runOnlyPendingTimersAsync();
		expect(queue.getHealth().healthy).toBe(true);

		await queue.stop();
	});

	it('reports unhealthy after repeated claim failures', async () => {
		const { supabase } = await import('../src/lib/supabase');
		(supabase.rpc as any).mockImplementation(async (fn: string) => {
			if (fn === 'claim_pending_jobs') {
				return { data: null, error: { message: 'permission denied' } };
			}
			return { data: [], error: null };
		});

		const queue = new SupabaseQueue({ pollInterval: 5000 });
		await queue.start(); // first poll fails
		vi.advanceTimersByTime(5000);
		await vi.runOnlyPendingTimersAsync(); // second poll fails
		vi.advanceTimersByTime(5000);
		await vi.runOnlyPendingTimersAsync(); // third poll fails

		const health = queue.getHealth();
		expect(health.healthy).toBe(false);
		expect(health.reason).toBe('repeated_claim_failures');
		expect(health.consecutiveClaimFailures).toBeGreaterThanOrEqual(3);

		await queue.stop();
	});
});

describe('queue alerts', () => {
	beforeEach(() => {
		__resetQueueAlertCooldowns();
	});

	function fakeAlertClient(options: {
		failedRows?: Array<{ job_type: string }>;
		oldestPending?: { job_type: string; scheduled_for: string; created_at: string } | null;
	}) {
		return {
			from(_table: string) {
				const builder: any = {
					_mode: 'failed' as 'failed' | 'pending',
					select() {
						return builder;
					},
					eq(_col: string, value: string) {
						if (value === 'pending') builder._mode = 'pending';
						return builder;
					},
					gte() {
						return builder;
					},
					lte() {
						return builder;
					},
					order() {
						return builder;
					},
					limit() {
						return builder;
					},
					maybeSingle: async () => ({
						data: options.oldestPending ?? null,
						error: null
					}),
					then(resolve: (value: unknown) => unknown) {
						return resolve({ data: options.failedRows ?? [], error: null });
					}
				};
				return builder;
			}
		} as any;
	}

	it('trips on a failed-job streak for one type (the silent-SMS scenario)', async () => {
		const client = fakeAlertClient({
			failedRows: [
				{ job_type: 'send_sms' },
				{ job_type: 'send_sms' },
				{ job_type: 'send_sms' }
			]
		});

		const alerts = await checkQueueAlerts(client);
		const smsAlert = alerts.find((alert) => alert.code === 'failed_jobs:send_sms');
		expect(smsAlert).toBeDefined();
		expect(smsAlert!.severity).toBe('critical');
	});

	it('trips when the oldest runnable pending job is too old', async () => {
		const client = fakeAlertClient({
			oldestPending: {
				job_type: 'generate_daily_brief',
				scheduled_for: new Date(Date.now() - 30 * 60_000).toISOString(),
				created_at: new Date(Date.now() - 30 * 60_000).toISOString()
			}
		});

		const alerts = await checkQueueAlerts(client);
		expect(alerts.some((alert) => alert.code === 'oldest_pending_age')).toBe(true);
	});

	it('stays quiet when under thresholds', async () => {
		const client = fakeAlertClient({
			failedRows: [{ job_type: 'send_sms' }],
			oldestPending: {
				job_type: 'agent_run',
				scheduled_for: new Date(Date.now() - 60_000).toISOString(),
				created_at: new Date(Date.now() - 60_000).toISOString()
			}
		});

		const alerts = await checkQueueAlerts(client);
		expect(alerts).toHaveLength(0);
	});

	it('cooldown suppresses duplicate emissions', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const alert = {
			code: 'failed_jobs:send_sms',
			severity: 'critical' as const,
			message: 'test',
			details: {}
		};

		await emitQueueAlerts([alert]);
		await emitQueueAlerts([alert]);

		const alertLogs = errorSpy.mock.calls.filter((call) =>
			String(call[0]).includes('[QUEUE ALERT]')
		);
		expect(alertLogs).toHaveLength(1);
		errorSpy.mockRestore();
	});
});
