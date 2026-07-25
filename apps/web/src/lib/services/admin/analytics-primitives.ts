// apps/web/src/lib/services/admin/analytics-primitives.ts
export const ADMIN_ANALYTICS_DEFAULT_PAGE_SIZE = 1_000;
export const ADMIN_ANALYTICS_DEFAULT_MAX_ROWS = 50_000;

export function numberValue(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

export function textValue(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function dateMs(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = new Date(value).getTime();
	return Number.isFinite(parsed) ? parsed : null;
}

export function averageValues(values: readonly number[]): number {
	return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function averageTotal(total: number, count: number): number {
	return count > 0 ? total / count : 0;
}

/** Nearest-rank percentile with finite-value filtering and a zero empty-set policy. */
export function percentile(values: readonly number[], target: number): number {
	const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
	if (sorted.length === 0) return 0;
	const boundedTarget = Math.min(100, Math.max(0, target));
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil((boundedTarget / 100) * sorted.length) - 1)
	);
	return sorted[index] ?? 0;
}

/** User analytics historically distinguishes an empty percentile from a zero value. */
export function roundedPercentileOrNull(values: readonly number[], target: number): number | null {
	if (!values.some((value) => Number.isFinite(value))) return null;
	return Math.round(percentile(values, target));
}

type AnalyticsPageResult = {
	data?: unknown;
	error?: unknown;
};

export type FetchAllAnalyticsRowsOptions = {
	pageSize?: number;
	maxRows?: number;
};

export async function fetchAllRows<T>(
	queryFactory: (from: number, to: number) => PromiseLike<AnalyticsPageResult>,
	options: FetchAllAnalyticsRowsOptions = {}
): Promise<{ rows: T[]; truncated: boolean }> {
	const pageSize = options.pageSize ?? ADMIN_ANALYTICS_DEFAULT_PAGE_SIZE;
	const maxRows = options.maxRows ?? ADMIN_ANALYTICS_DEFAULT_MAX_ROWS;
	if (!Number.isInteger(pageSize) || pageSize <= 0) {
		throw new RangeError('Analytics page size must be a positive integer');
	}
	if (!Number.isInteger(maxRows) || maxRows <= 0) {
		throw new RangeError('Analytics maximum rows must be a positive integer');
	}

	const rows: T[] = [];
	for (let from = 0; from < maxRows; from += pageSize) {
		const requestedPageSize = Math.min(pageSize, maxRows - from);
		const to = from + requestedPageSize - 1;
		const { data, error } = await queryFactory(from, to);
		if (error) throw error;

		const pageRows = Array.isArray(data) ? (data as T[]) : [];
		rows.push(...pageRows);
		if (pageRows.length < requestedPageSize) {
			return { rows, truncated: false };
		}
	}

	return { rows, truncated: true };
}
