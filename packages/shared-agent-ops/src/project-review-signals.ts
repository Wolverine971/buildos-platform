// packages/shared-agent-ops/src/project-review-signals.ts
//
// Shared constants and pure helpers for debounced project-review signals. The
// web app records the signal; the worker consumes the queued wakeup.

export const PROJECT_REVIEW_SIGNAL_DEBOUNCE_MS = 60_000;
export const PROJECT_REVIEW_SIGNAL_QUEUE_MODE = 'debounced_review_signal';
export const PROJECT_REVIEW_SIGNAL_TRIGGER_REASON = 'burst';

const MAX_SIGNAL_ARRAY_ITEMS = 100;
const MAX_SIGNAL_OPERATIONS = 25;

export type ProjectReviewSignalQueueMode = typeof PROJECT_REVIEW_SIGNAL_QUEUE_MODE;

export type ProjectReviewSignalStatus =
	| 'pending'
	| 'processing'
	| 'completed'
	| 'superseded'
	| 'failed';

export type ProjectReviewSignalOperation = {
	operationId?: string | null;
	origin?: string | null;
	operationKind?: string | null;
	entityCount?: number | null;
};

export type ProjectReviewSignalMetadata = {
	sources?: string[];
	actions?: string[];
	entityTypes?: string[];
	operations?: ProjectReviewSignalOperation[];
	lastSignal?: {
		source?: string | null;
		action?: string | null;
		entityType?: string | null;
		entityId?: string | null;
		operationId?: string | null;
		origin?: string | null;
		operationKind?: string | null;
		entityCount?: number | null;
	};
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNonNegativeNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function projectReviewSignalDedupKey(projectId: string): string {
	return `project-review-signal:${projectId}`;
}

export function buildProjectReviewSignalDueAt(
	now: Date = new Date(),
	debounceMs = PROJECT_REVIEW_SIGNAL_DEBOUNCE_MS
): Date {
	return new Date(now.getTime() + debounceMs);
}

export function mergeUniqueStrings(
	values: Array<string | null | undefined>,
	limit = MAX_SIGNAL_ARRAY_ITEMS
): string[] {
	return Array.from(
		new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))
	)
		.sort()
		.slice(0, limit);
}

function readStringArray(value: unknown): string[] {
	return Array.isArray(value) ? mergeUniqueStrings(value.map((item) => asString(item))) : [];
}

function readOperation(value: unknown): ProjectReviewSignalOperation | null {
	const record = asRecord(value);
	if (!record) return null;
	const operation: ProjectReviewSignalOperation = {
		operationId: asString(record.operationId) ?? asString(record.operation_id),
		origin: asString(record.origin),
		operationKind: asString(record.operationKind) ?? asString(record.operation_kind),
		entityCount: asNonNegativeNumber(record.entityCount ?? record.entity_count)
	};
	if (!operation.operationId && !operation.origin && !operation.operationKind) return null;
	return operation;
}

function readLastSignal(value: unknown): ProjectReviewSignalMetadata['lastSignal'] {
	const record = asRecord(value);
	if (!record) return undefined;
	return {
		source: asString(record.source),
		action: asString(record.action),
		entityType: asString(record.entityType ?? record.entity_type),
		entityId: asString(record.entityId ?? record.entity_id),
		operationId: asString(record.operationId ?? record.operation_id),
		origin: asString(record.origin),
		operationKind: asString(record.operationKind ?? record.operation_kind),
		entityCount: asNonNegativeNumber(record.entityCount ?? record.entity_count)
	};
}

export function readProjectReviewSignalMetadata(value: unknown): ProjectReviewSignalMetadata {
	const record = asRecord(value);
	if (!record) return {};
	return {
		sources: readStringArray(record.sources),
		actions: readStringArray(record.actions),
		entityTypes: readStringArray(record.entityTypes ?? record.entity_types),
		operations: Array.isArray(record.operations)
			? record.operations
					.map(readOperation)
					.filter((operation): operation is ProjectReviewSignalOperation => !!operation)
					.slice(0, MAX_SIGNAL_OPERATIONS)
			: [],
		lastSignal: readLastSignal(record.lastSignal ?? record.last_signal)
	};
}

function operationKey(operation: ProjectReviewSignalOperation): string {
	if (operation.operationId) return `id:${operation.operationId}`;
	return `anon:${operation.origin ?? ''}:${operation.operationKind ?? ''}`;
}

function mergeOperations(
	existing: ProjectReviewSignalOperation[],
	incoming: ProjectReviewSignalOperation | null
): ProjectReviewSignalOperation[] {
	const byKey = new Map<string, ProjectReviewSignalOperation>();
	for (const operation of existing) {
		byKey.set(operationKey(operation), operation);
	}
	if (incoming && (incoming.operationId || incoming.origin || incoming.operationKind)) {
		const key = operationKey(incoming);
		const current = byKey.get(key);
		byKey.set(key, {
			operationId: incoming.operationId ?? current?.operationId ?? null,
			origin: incoming.origin ?? current?.origin ?? null,
			operationKind: incoming.operationKind ?? current?.operationKind ?? null,
			entityCount: Math.max(incoming.entityCount ?? 0, current?.entityCount ?? 0) || null
		});
	}
	return Array.from(byKey.values()).slice(0, MAX_SIGNAL_OPERATIONS);
}

export function mergeProjectReviewSignalMetadata(params: {
	existing?: unknown;
	source?: string | null;
	action?: string | null;
	entityType?: string | null;
	entityId?: string | null;
	operation?: ProjectReviewSignalOperation | null;
}): ProjectReviewSignalMetadata {
	const existing = readProjectReviewSignalMetadata(params.existing);
	return {
		sources: mergeUniqueStrings([...(existing.sources ?? []), params.source]),
		actions: mergeUniqueStrings([...(existing.actions ?? []), params.action]),
		entityTypes: mergeUniqueStrings([...(existing.entityTypes ?? []), params.entityType]),
		operations: mergeOperations(existing.operations ?? [], params.operation ?? null),
		lastSignal: {
			source: params.source ?? null,
			action: params.action ?? null,
			entityType: params.entityType ?? null,
			entityId: params.entityId ?? null,
			operationId: params.operation?.operationId ?? null,
			origin: params.operation?.origin ?? null,
			operationKind: params.operation?.operationKind ?? null,
			entityCount: params.operation?.entityCount ?? null
		}
	};
}
