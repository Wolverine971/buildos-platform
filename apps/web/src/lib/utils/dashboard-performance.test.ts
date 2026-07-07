// apps/web/src/lib/utils/dashboard-performance.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	DASHBOARD_PERFORMANCE_BUDGET_MS,
	DASHBOARD_PERFORMANCE_PREFIX,
	createDashboardPerformanceTracker
} from './dashboard-performance';

describe('dashboard performance tracker', () => {
	it('records prefixed marks and measures around dashboard actions', async () => {
		const mark = vi.fn();
		const measure = vi.fn();
		const tracker = createDashboardPerformanceTracker({
			performance: { mark, measure }
		});

		await expect(
			tracker.trackAction('modal.dashboard_inbox.open', async () => 'opened')
		).resolves.toBe('opened');

		expect(mark).toHaveBeenNthCalledWith(
			1,
			`${DASHBOARD_PERFORMANCE_PREFIX}.modal.dashboard_inbox.open.1.start`
		);
		expect(mark).toHaveBeenNthCalledWith(
			2,
			`${DASHBOARD_PERFORMANCE_PREFIX}.modal.dashboard_inbox.open.1.end`
		);
		expect(measure).toHaveBeenCalledWith(
			`${DASHBOARD_PERFORMANCE_PREFIX}.modal.dashboard_inbox.open`,
			`${DASHBOARD_PERFORMANCE_PREFIX}.modal.dashboard_inbox.open.1.start`,
			`${DASHBOARD_PERFORMANCE_PREFIX}.modal.dashboard_inbox.open.1.end`
		);
	});

	it('still measures rejected actions before rethrowing', async () => {
		const mark = vi.fn();
		const measure = vi.fn();
		const tracker = createDashboardPerformanceTracker({
			performance: { mark, measure }
		});
		const error = new Error('failed');

		await expect(
			tracker.trackAction('modal.overdue_triage.open', async () => {
				throw error;
			})
		).rejects.toBe(error);

		expect(mark).toHaveBeenCalledTimes(2);
		expect(measure).toHaveBeenCalledWith(
			`${DASHBOARD_PERFORMANCE_PREFIX}.modal.overdue_triage.open`,
			`${DASHBOARD_PERFORMANCE_PREFIX}.modal.overdue_triage.open.1.start`,
			`${DASHBOARD_PERFORMANCE_PREFIX}.modal.overdue_triage.open.1.end`
		);
	});

	it('does nothing when disabled or when the browser performance API is unavailable', async () => {
		const mark = vi.fn();
		const measure = vi.fn();
		const disabledTracker = createDashboardPerformanceTracker({
			enabled: false,
			performance: { mark, measure }
		});
		const unavailableTracker = createDashboardPerformanceTracker({
			performance: null
		});

		await disabledTracker.trackAction('refresh', () => undefined);
		await unavailableTracker.trackAction('route.calendar.open', () => undefined);

		expect(mark).not.toHaveBeenCalled();
		expect(measure).not.toHaveBeenCalled();
	});

	it('publishes budgets for every instrumented dashboard action', () => {
		expect(DASHBOARD_PERFORMANCE_BUDGET_MS).toMatchObject({
			mounted: 1500,
			refresh: 1200,
			'modal.daily_brief.open': 350,
			'modal.brief_chat.open': 500,
			'modal.dashboard_inbox.open': 500,
			'modal.overdue_triage.open': 500,
			'route.calendar.open': 1000
		});
	});
});
