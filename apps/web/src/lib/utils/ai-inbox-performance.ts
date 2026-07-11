// apps/web/src/lib/utils/ai-inbox-performance.ts
export const AI_INBOX_PERFORMANCE_PREFIX = 'buildos.ai_inbox';

export const AI_INBOX_DATA_READY_BUDGET_MS = {
	navigation: 800,
	dashboard: 800,
	today: 800
} as const;

export type AiInboxOpenSource = keyof typeof AI_INBOX_DATA_READY_BUDGET_MS;

type PerformanceApi = {
	mark?: (name: string) => void;
	measure?: (name: string, startMark: string, endMark: string) => void;
};

type TrackerOptions = {
	enabled?: boolean;
	performance?: PerformanceApi | null;
	prefix?: string;
};

export function createAiInboxPerformanceTracker({
	enabled = true,
	performance: performanceApi = (globalThis as { performance?: PerformanceApi }).performance,
	prefix = AI_INBOX_PERFORMANCE_PREFIX
}: TrackerOptions = {}) {
	let counter = 0;
	let active: { source: AiInboxOpenSource; start: string } | null = null;

	function mark(name: string) {
		if (!enabled || typeof performanceApi?.mark !== 'function') return;
		try {
			performanceApi.mark(name);
		} catch {
			// Performance guardrails must never affect the inbox interaction.
		}
	}

	function begin(source: AiInboxOpenSource) {
		counter += 1;
		const start = `${prefix}.open_to_data.${source}.${counter}.start`;
		active = { source, start };
		mark(start);
	}

	function complete() {
		const measurement = active;
		active = null;
		if (!measurement || !enabled || typeof performanceApi?.measure !== 'function') return;

		const end = `${prefix}.open_to_data.${measurement.source}.${counter}.end`;
		mark(end);
		try {
			performanceApi.measure(
				`${prefix}.open_to_data.${measurement.source}`,
				measurement.start,
				end
			);
		} catch {
			// Missing/duplicate marks are diagnostic-only failures.
		}
	}

	function cancel() {
		active = null;
	}

	return {
		budgets: AI_INBOX_DATA_READY_BUDGET_MS,
		begin,
		cancel,
		complete
	};
}

export const aiInboxPerformance = createAiInboxPerformanceTracker();
