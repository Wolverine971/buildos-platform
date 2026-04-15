// apps/web/src/lib/components/agent/agent-chat-operation-activity.ts
import type { ActivityEntry } from './agent-chat.types';

type OperationActivityFormat = {
	message: string;
	activityStatus: ActivityEntry['status'];
};

interface UpsertOperationActivityOptions {
	createId?: () => string;
	now?: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function getOperationActivityKey(operation: unknown): string | null {
	if (!isRecord(operation)) return null;
	const action = readTrimmedString(operation.action) ?? 'work';
	const entityType = readTrimmedString(operation.entity_type) ?? 'item';
	const entityIdentity =
		readTrimmedString(operation.entity_id) ?? readTrimmedString(operation.entity_name);
	if (!entityIdentity) return null;
	return `${action}:${entityType}:${entityIdentity}`;
}

function getActivityOperationKey(activity: ActivityEntry): string | null {
	const metadata = activity.metadata;
	if (!isRecord(metadata)) return null;
	const existingKey = readTrimmedString(metadata.operationActivityKey);
	if (existingKey) return existingKey;
	return getOperationActivityKey(metadata.operation);
}

function findLastPendingOperationIndex(activities: ActivityEntry[], key: string): number {
	for (let index = activities.length - 1; index >= 0; index -= 1) {
		const activity = activities[index]!;
		if (activity.activityType !== 'operation') continue;
		if (activity.status !== 'pending') continue;
		if (getActivityOperationKey(activity) === key) {
			return index;
		}
	}

	return -1;
}

function buildOperationActivityEntry(
	operation: Record<string, unknown>,
	format: OperationActivityFormat,
	options: UpsertOperationActivityOptions = {}
): ActivityEntry {
	const operationActivityKey = getOperationActivityKey(operation);
	return {
		id: options.createId?.() ?? crypto.randomUUID(),
		content: format.message,
		timestamp: options.now ?? new Date(),
		activityType: 'operation',
		status: format.activityStatus,
		metadata: {
			operation,
			...(operationActivityKey ? { operationActivityKey } : {}),
			...(readTrimmedString(operation.status)
				? { operationStatus: readTrimmedString(operation.status) }
				: {})
		}
	};
}

export function upsertOperationActivityEntries(
	activities: ActivityEntry[],
	operation: Record<string, unknown>,
	format: OperationActivityFormat,
	options: UpsertOperationActivityOptions = {}
): ActivityEntry[] {
	const operationActivityKey = getOperationActivityKey(operation);
	if (!operationActivityKey) {
		return [...activities, buildOperationActivityEntry(operation, format, options)];
	}

	const existingIndex = findLastPendingOperationIndex(activities, operationActivityKey);
	if (existingIndex === -1) {
		return [...activities, buildOperationActivityEntry(operation, format, options)];
	}

	const existingActivity = activities[existingIndex]!;
	const updatedActivity: ActivityEntry = {
		...existingActivity,
		content: format.message,
		status: format.activityStatus,
		metadata: {
			...existingActivity.metadata,
			operation,
			operationActivityKey,
			...(readTrimmedString(operation.status)
				? { operationStatus: readTrimmedString(operation.status) }
				: {})
		}
	};

	const nextActivities = [...activities];
	nextActivities[existingIndex] = updatedActivity;
	return nextActivities;
}
