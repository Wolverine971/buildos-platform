// packages/shared-agent-ops/src/gateway/op-execution-gateway.pagination.ts
export function clampLimit(value: unknown, fallback: number, min = 1, max = 50): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.floor(value)));
}

export function normalizeOffset(value: unknown, fallback = 0): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(5000, Math.max(0, Math.floor(value)));
}

export function buildPaginationForRows(
	offset: number,
	limit: number,
	totalAvailable: number,
	returned: number
) {
	const nextOffset = offset + limit < totalAvailable ? offset + limit : null;
	return {
		offset,
		limit,
		returned,
		total_available: totalAvailable,
		has_more: nextOffset !== null,
		next_offset: nextOffset
	};
}
