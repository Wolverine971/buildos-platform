// apps/worker/tests/scheduledWork.test.ts
import { describe, expect, it } from 'vitest';

import { describeScheduledWorkGate, resolveScheduledWorkGate } from '../src/config/scheduledWork';

// The general worker's real Railway service exposes these (names checked 2026-10-04).
const RAILWAY_PRODUCTION = {
	RAILWAY_ENVIRONMENT: 'production',
	RAILWAY_ENVIRONMENT_ID: 'a28f09cc-0000-0000-0000-000000000000',
	RAILWAY_ENVIRONMENT_NAME: 'production',
	RAILWAY_SERVICE_ID: '2d57bef9-0000-0000-0000-000000000000'
};

describe('scheduled work gate', () => {
	it('is off for a local worker, even one pointed at production with NODE_ENV=production', () => {
		expect(resolveScheduledWorkGate({}).enabled).toBe(false);
		expect(resolveScheduledWorkGate({ NODE_ENV: 'development' }).enabled).toBe(false);
		expect(resolveScheduledWorkGate({ NODE_ENV: 'production' }).enabled).toBe(false);
	});

	it('is on for a deployed Railway service', () => {
		const gate = resolveScheduledWorkGate(RAILWAY_PRODUCTION);
		expect(gate).toEqual({ enabled: true, reason: 'Railway environment "production"' });
	});

	it('accepts any one Railway runtime variable', () => {
		for (const key of ['RAILWAY_ENVIRONMENT_ID', 'RAILWAY_ENVIRONMENT', 'RAILWAY_SERVICE_ID']) {
			expect(resolveScheduledWorkGate({ [key]: 'x' }).enabled, key).toBe(true);
		}
		expect(resolveScheduledWorkGate({ RAILWAY_SERVICE_ID: '  ' }).enabled).toBe(false);
	});

	it('honors an explicit opt-in locally', () => {
		for (const value of ['true', 'TRUE', '1', ' true ']) {
			expect(
				resolveScheduledWorkGate({ WORKER_SCHEDULER_ENABLED: value }).enabled,
				value
			).toBe(true);
		}
	});

	it('honors an explicit kill switch on Railway', () => {
		for (const value of ['false', '0']) {
			const gate = resolveScheduledWorkGate({
				...RAILWAY_PRODUCTION,
				WORKER_SCHEDULER_ENABLED: value
			});
			expect(gate.enabled, value).toBe(false);
		}
	});

	it('ignores an unrecognized value and falls back to the deployment signal', () => {
		const local = resolveScheduledWorkGate({ WORKER_SCHEDULER_ENABLED: 'yes' });
		expect(local.enabled).toBe(false);
		expect(local.reason).toContain('ignored WORKER_SCHEDULER_ENABLED="yes"');
		expect(
			resolveScheduledWorkGate({ ...RAILWAY_PRODUCTION, WORKER_SCHEDULER_ENABLED: 'yes' })
				.enabled
		).toBe(true);
	});

	it('logs one line that says what is off and how to opt in', () => {
		const off = describeScheduledWorkGate(resolveScheduledWorkGate({}));
		expect(off).toContain('Scheduled work OFF');
		expect(off).toContain('Queue jobs are still claimed');
		expect(off).toContain('WORKER_SCHEDULER_ENABLED=true');
		expect(off).not.toContain('\n');

		const on = describeScheduledWorkGate(resolveScheduledWorkGate(RAILWAY_PRODUCTION));
		expect(on).toContain('Scheduled work ON (Railway environment "production")');
	});
});
