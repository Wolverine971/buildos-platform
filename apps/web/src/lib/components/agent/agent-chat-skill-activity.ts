// apps/web/src/lib/components/agent/agent-chat-skill-activity.ts
import type { SkillActivityEvent } from '@buildos/shared-types';
import type { ActivityEntry } from './agent-chat.types';

type SkillActivityMetadata = {
	skillActivity: SkillActivityEvent;
	skillPath: string;
	skillVia: SkillActivityEvent['via'];
	skillAction: SkillActivityEvent['action'];
};

interface UpsertSkillActivityOptions {
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

export function extractSkillPathFromSkillLoadArgs(argsJson: unknown): string | null {
	let args = argsJson;
	if (typeof argsJson === 'string') {
		try {
			args = JSON.parse(argsJson);
		} catch {
			return null;
		}
	}
	if (!isRecord(args)) return null;
	return (
		readTrimmedString(args.skill) ?? readTrimmedString(args.id) ?? readTrimmedString(args.path)
	);
}

export function buildSkillLoadActivityEvent(
	action: SkillActivityEvent['action'],
	argsJson: unknown
): SkillActivityEvent | null {
	const path = extractSkillPathFromSkillLoadArgs(argsJson);
	if (!path) return null;
	return {
		type: 'skill_activity',
		action,
		path,
		via: 'skill_load'
	};
}

export function formatSkillActivityContent(event: SkillActivityEvent): string {
	return event.action === 'requested'
		? `Loading skill ${event.path}`
		: `Skill ${event.path} loaded`;
}

function buildSkillActivityEntry(
	event: SkillActivityEvent,
	options: UpsertSkillActivityOptions = {}
): ActivityEntry {
	return {
		id: options.createId?.() ?? crypto.randomUUID(),
		content: formatSkillActivityContent(event),
		timestamp: options.now ?? new Date(),
		activityType: 'general',
		status: event.action === 'requested' ? 'pending' : 'completed',
		metadata: {
			skillActivity: event,
			skillPath: event.path,
			skillVia: event.via,
			skillAction: event.action
		} satisfies SkillActivityMetadata
	};
}

function getSkillActivityMetadata(activity: ActivityEntry): SkillActivityMetadata | null {
	const metadata = activity.metadata;
	if (!metadata || typeof metadata !== 'object') return null;
	if (typeof metadata.skillPath !== 'string' || typeof metadata.skillVia !== 'string') {
		const toolName =
			typeof metadata.toolName === 'string'
				? metadata.toolName
				: typeof metadata.originalToolName === 'string'
					? metadata.originalToolName
					: null;
		if (toolName !== 'skill_load') return null;
		const skillPath = extractSkillPathFromSkillLoadArgs(
			metadata.arguments ?? metadata.rawArguments
		);
		if (!skillPath) return null;
		const metadataSkillAction =
			metadata.skillAction === 'loaded' || metadata.skillAction === 'requested'
				? metadata.skillAction
				: null;
		const skillAction =
			metadata.status === 'completed' ? 'loaded' : (metadataSkillAction ?? 'requested');
		return {
			skillActivity: {
				type: 'skill_activity',
				action: skillAction,
				path: skillPath,
				via: 'skill_load'
			},
			skillPath,
			skillVia: 'skill_load',
			skillAction
		};
	}

	return metadata as SkillActivityMetadata;
}

function findLastMatchingSkillActivityIndex(
	activities: ActivityEntry[],
	event: SkillActivityEvent
): number {
	for (let index = activities.length - 1; index >= 0; index -= 1) {
		const metadata = getSkillActivityMetadata(activities[index]!);
		if (!metadata) continue;
		if (metadata.skillPath === event.path && metadata.skillVia === event.via) {
			return index;
		}
	}

	return -1;
}

export function upsertSkillActivityEntries(
	activities: ActivityEntry[],
	event: SkillActivityEvent,
	options: UpsertSkillActivityOptions = {}
): ActivityEntry[] {
	const existingIndex = findLastMatchingSkillActivityIndex(activities, event);
	const existingActivity = existingIndex >= 0 ? activities[existingIndex] : undefined;
	const existingMetadata = existingActivity ? getSkillActivityMetadata(existingActivity) : null;

	const shouldAppendNewEntry =
		existingIndex === -1 ||
		(event.action === 'requested' && existingMetadata?.skillAction === 'loaded');

	if (shouldAppendNewEntry) {
		return [...activities, buildSkillActivityEntry(event, options)];
	}

	const updatedActivity: ActivityEntry = {
		...existingActivity!,
		content: formatSkillActivityContent(event),
		status: event.action === 'requested' ? 'pending' : 'completed',
		metadata: {
			...existingActivity!.metadata,
			skillActivity: event,
			skillPath: event.path,
			skillVia: event.via,
			skillAction: event.action
		} satisfies SkillActivityMetadata
	};

	const nextActivities = [...activities];
	nextActivities[existingIndex] = updatedActivity;
	return nextActivities;
}
