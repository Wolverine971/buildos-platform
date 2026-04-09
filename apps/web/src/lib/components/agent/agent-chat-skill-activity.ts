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

export function formatSkillActivityContent(event: SkillActivityEvent): string {
	return `${event.action === 'requested' ? 'Skill requested' : 'Skill loaded'}: ${event.path}`;
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
		return null;
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
