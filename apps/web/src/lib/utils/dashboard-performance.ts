// apps/web/src/lib/utils/dashboard-performance.ts

export const DASHBOARD_PERFORMANCE_PREFIX = 'buildos.dashboard';

export const DASHBOARD_PERFORMANCE_BUDGET_MS = {
	mounted: 1500,
	refresh: 1200,
	'modal.daily_brief.open': 350,
	'modal.brief_chat.open': 500,
	'modal.dashboard_inbox.open': 500,
	'modal.overdue_triage.open': 500,
	'route.calendar.open': 1000
} as const;

export type DashboardPerformanceEventName = keyof typeof DASHBOARD_PERFORMANCE_BUDGET_MS;

type DashboardPerformanceApi = {
	mark?: (name: string) => void;
	measure?: (name: string, startMark: string, endMark: string) => void;
};

type DashboardPerformanceTrackerOptions = {
	enabled?: boolean;
	performance?: DashboardPerformanceApi | null;
	prefix?: string;
};

export function createDashboardPerformanceTracker({
	enabled = true,
	performance: performanceApi = (globalThis as { performance?: DashboardPerformanceApi })
		.performance,
	prefix = DASHBOARD_PERFORMANCE_PREFIX
}: DashboardPerformanceTrackerOptions = {}) {
	let counter = 0;

	function prefixed(name: string): string {
		return `${prefix}.${name}`;
	}

	function mark(name: string) {
		if (!enabled || typeof performanceApi?.mark !== 'function') return;
		try {
			performanceApi.mark(prefixed(name));
		} catch {
			// Performance marks are guardrails only; never let them affect UX.
		}
	}

	function measure(name: DashboardPerformanceEventName, start: string, end: string) {
		if (!enabled || typeof performanceApi?.measure !== 'function') return;
		try {
			performanceApi.measure(prefixed(name), prefixed(start), prefixed(end));
		} catch {
			// Some test/browser environments reject duplicate or missing marks.
		}
	}

	async function trackAction<T>(
		name: DashboardPerformanceEventName,
		action: () => Promise<T> | T
	): Promise<T> {
		counter += 1;
		const key = `${name}.${counter}`;
		const start = `${key}.start`;
		const end = `${key}.end`;
		mark(start);
		try {
			return await action();
		} finally {
			mark(end);
			measure(name, start, end);
		}
	}

	return {
		budgets: DASHBOARD_PERFORMANCE_BUDGET_MS,
		mark,
		measure,
		trackAction
	};
}
