// apps/web/src/lib/services/agentic-chat-v2/entity-resolution.ts
import type { LastTurnContext, LastTurnEntityPreview } from '@buildos/shared-types';
import { normalizeExactEntityId } from './exact-entity-id';

export type RecentEntityType =
	| 'project'
	| 'task'
	| 'goal'
	| 'plan'
	| 'document'
	| 'milestone'
	| 'risk';

const ENTITY_LABELS: Record<RecentEntityType, string> = {
	project: 'project',
	task: 'task',
	goal: 'goal',
	plan: 'plan',
	document: 'document',
	milestone: 'milestone',
	risk: 'risk'
};

const ENTITY_LIST_KEYS: Array<{
	entityType: RecentEntityType;
	key: keyof LastTurnContext['entities'];
	limit: number;
}> = [
	{ entityType: 'task', key: 'tasks', limit: 6 },
	{ entityType: 'project', key: 'projects', limit: 2 },
	{ entityType: 'goal', key: 'goals', limit: 3 },
	{ entityType: 'plan', key: 'plans', limit: 3 },
	{ entityType: 'document', key: 'documents', limit: 3 },
	{ entityType: 'milestone', key: 'milestones', limit: 2 },
	{ entityType: 'risk', key: 'risks', limit: 2 }
];

function normalizeText(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	return normalized.length > 0 ? normalized : null;
}

function formatPreviewList(
	entityType: RecentEntityType,
	items: LastTurnEntityPreview[] | undefined,
	limit: number
): string[] {
	if (!Array.isArray(items) || items.length === 0) return [];
	return items
		.map((item) => {
			const id = normalizeExactEntityId(item.id);
			if (!id) return null;
			const label = ENTITY_LABELS[entityType];
			const name = normalizeText(item.name) ?? '(unnamed)';
			return `- ${label}: ${name} (${id})`;
		})
		.filter((line): line is string => Boolean(line))
		.slice(0, limit);
}

export function buildEntityResolutionHint(lastTurnContext?: LastTurnContext | null): string | null {
	if (!lastTurnContext?.entities) return null;

	const lines: string[] = [];
	for (const entry of ENTITY_LIST_KEYS) {
		const items = lastTurnContext.entities[entry.key] as LastTurnEntityPreview[] | undefined;
		lines.push(...formatPreviewList(entry.entityType, items, entry.limit));
	}

	if (lines.length === 0) return null;

	return [
		'Recent exact referents from the prior turn:',
		...lines,
		'If the user clearly refers to one of these entities, reuse its exact id instead of searching again.'
	].join('\n');
}
