// apps/web/src/lib/utils/ai-inbox-performance.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AI_INBOX_DATA_READY_BUDGET_MS,
	AI_INBOX_PERFORMANCE_PREFIX,
	createAiInboxPerformanceTracker
} from './ai-inbox-performance';

describe('AI Inbox performance tracker', () => {
	it('measures click-to-data readiness for the active entry point', () => {
		const mark = vi.fn();
		const measure = vi.fn();
		const tracker = createAiInboxPerformanceTracker({ performance: { mark, measure } });

		tracker.begin('navigation');
		tracker.complete();

		expect(mark).toHaveBeenNthCalledWith(
			1,
			`${AI_INBOX_PERFORMANCE_PREFIX}.open_to_data.navigation.1.start`
		);
		expect(mark).toHaveBeenNthCalledWith(
			2,
			`${AI_INBOX_PERFORMANCE_PREFIX}.open_to_data.navigation.1.end`
		);
		expect(measure).toHaveBeenCalledWith(
			`${AI_INBOX_PERFORMANCE_PREFIX}.open_to_data.navigation`,
			`${AI_INBOX_PERFORMANCE_PREFIX}.open_to_data.navigation.1.start`,
			`${AI_INBOX_PERFORMANCE_PREFIX}.open_to_data.navigation.1.end`
		);
	});

	it('does not record cancelled or duplicate completions', () => {
		const mark = vi.fn();
		const measure = vi.fn();
		const tracker = createAiInboxPerformanceTracker({ performance: { mark, measure } });

		tracker.begin('dashboard');
		tracker.cancel();
		tracker.complete();
		tracker.complete();

		expect(mark).toHaveBeenCalledTimes(1);
		expect(measure).not.toHaveBeenCalled();
	});

	it('is inert when the Performance API is unavailable', () => {
		const tracker = createAiInboxPerformanceTracker({ performance: null });

		expect(() => {
			tracker.begin('today');
			tracker.complete();
		}).not.toThrow();
	});

	it('publishes a data-ready budget for every entry point', () => {
		expect(AI_INBOX_DATA_READY_BUDGET_MS).toEqual({
			navigation: 800,
			dashboard: 800,
			today: 800
		});
	});
});
