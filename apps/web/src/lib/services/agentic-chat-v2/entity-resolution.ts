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

export type ExplicitEntityMention = {
	entityType: RecentEntityType;
	id: string;
	name?: string;
};

const UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const ENTITY_CHIP_REGEX = new RegExp(
	String.raw`\[\[(project|task|goal|plan|document|milestone|risk):(${UUID_PATTERN})\|([^\]]+)\]\]`,
	'g'
);
const PROJECT_ID_REGEX = new RegExp(
	String.raw`\*\*([^*]+?)\*\*.*?ID:\s*\`(${UUID_PATTERN})\``,
	'g'
);
const NAMED_UUID_REGEX = new RegExp(
	String.raw`\*\*([^*]+?)\*\*\s*\(\s*\`(${UUID_PATTERN})\`\s*\)`,
	'g'
);

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

function inferEntityTypeFromLine(line: string): RecentEntityType {
	const normalized = line.toLowerCase();
	if (normalized.includes('document')) return 'document';
	if (normalized.includes('goal')) return 'goal';
	if (normalized.includes('plan')) return 'plan';
	if (normalized.includes('milestone')) return 'milestone';
	if (normalized.includes('risk')) return 'risk';
	if (normalized.includes('project')) return 'project';
	return 'task';
}

function pushMention(
	target: ExplicitEntityMention[],
	entityType: RecentEntityType,
	id: string,
	name?: string | null
): void {
	const normalizedId = normalizeText(id);
	if (!normalizedId) return;
	const normalizedName = normalizeText(name ?? null) ?? undefined;
	const existing = target.find(
		(item) => item.entityType === entityType && item.id === normalizedId
	);
	if (existing) {
		if (!existing.name && normalizedName) {
			existing.name = normalizedName;
		}
		return;
	}

	target.push({
		entityType,
		id: normalizedId,
		name: normalizedName
	});
}

export function extractExplicitEntityMentionsFromText(text: string): ExplicitEntityMention[] {
	if (!normalizeText(text)) return [];

	const mentions: ExplicitEntityMention[] = [];
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter(Boolean);

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;

		for (const match of line.matchAll(ENTITY_CHIP_REGEX)) {
			const [, entityType, id, name] = match;
			if (!entityType || !id || !name) continue;
			pushMention(mentions, entityType as RecentEntityType, id, name);
		}

		for (const match of line.matchAll(PROJECT_ID_REGEX)) {
			const [, name, id] = match;
			if (!name || !id) continue;
			pushMention(mentions, 'project', id, name);
		}

		for (const match of line.matchAll(NAMED_UUID_REGEX)) {
			const [, name, id] = match;
			if (!name || !id) continue;
			pushMention(mentions, inferEntityTypeFromLine(line), id, name);
		}
	}

	return mentions;
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
