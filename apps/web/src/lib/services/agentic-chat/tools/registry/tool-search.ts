// apps/web/src/lib/services/agentic-chat/tools/registry/tool-search.ts
import {
	getCapabilityByPath,
	listCapabilities,
	listCapabilityDirectoryItems
} from './capability-catalog';
import { getToolRegistry, type RegistryOp } from './tool-registry';
import { listAllSkills } from '../skills/registry';

export type ToolSearchOptions = {
	query?: string;
	capability?: string;
	group?: RegistryOp['group'];
	kind?: 'read' | 'write';
	entity?: string;
	limit?: number;
	surface?: 'chat' | 'external' | 'all';
};

type ToolSearchMatch = {
	op: string;
	summary: string;
	group: RegistryOp['group'];
	kind: RegistryOp['kind'];
	entity?: string;
	action?: string;
	tool_name: string;
	related_skills: string[];
};

type SearchableRegistryEntry = Pick<
	RegistryOp,
	'op' | 'tool_name' | 'description' | 'group' | 'kind' | 'entity' | 'action'
>;

const STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'for',
	'in',
	'is',
	'many',
	'my',
	'of',
	'on',
	'or',
	'the',
	'this',
	'to',
	'what',
	'with'
]);

const QUERY_SYNONYMS: Record<string, string[]> = {
	appointment: ['event'],
	change: ['update'],
	deadline: ['milestone', 'due'],
	display: ['list', 'get', 'search'],
	edit: ['update'],
	email: ['gmail', 'message'],
	find: ['search', 'list', 'get'],
	lookup: ['search', 'get', 'list'],
	mail: ['gmail', 'message'],
	meeting: ['event'],
	modify: ['update'],
	note: ['document'],
	remove: ['delete'],
	rename: ['update'],
	reschedule: ['update'],
	show: ['list', 'get', 'search'],
	todo: ['task'],
	view: ['get', 'list', 'search']
};

const WRITE_QUERY_TERMS = new Set([
	'archive',
	'create',
	'delete',
	'link',
	'move',
	'reorganize',
	'resolve',
	'set',
	'unlink',
	'update',
	'upsert'
]);

function summarize(description: string): string {
	const trimmed = description.trim();
	if (!trimmed) return '';
	const end = trimmed.indexOf('.');
	return end === -1 ? trimmed : trimmed.slice(0, end + 1);
}

function resolveCapabilityReference(reference?: string): ReturnType<typeof getCapabilityByPath> {
	if (!reference) return undefined;
	const trimmed = reference.trim();
	if (!trimmed) return undefined;
	return getCapabilityByPath(trimmed) ?? getCapabilityByPath(`capabilities.${trimmed}`);
}

function opMatchesCapability(op: string, capabilityPrefixes: string[]): boolean {
	return capabilityPrefixes.some((prefix) => op === prefix || op.startsWith(`${prefix}.`));
}

function getRelatedSkillIds(op: string): string[] {
	return listAllSkills()
		.filter((skill) => skill.relatedOps.includes(op))
		.map((skill) => skill.id)
		.sort((a, b) => a.localeCompare(b));
}

function normalizeWord(word: string): string {
	if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
	if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
	return word;
}

function rawTokens(value: string): string[] {
	return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function tokenize(value: string): string[] {
	return rawTokens(value).map(normalizeWord);
}

function queryTokenGroups(query: string): string[][] {
	return rawTokens(query)
		.filter((token) => !STOP_WORDS.has(token))
		.map((token) => normalizeWord(token))
		.map((token) =>
			Array.from(new Set([token, ...(QUERY_SYNONYMS[token] ?? []).flatMap(tokenize)]))
		);
}

export function toolSearchQueryHasWriteIntent(query: string): boolean {
	return queryTokenGroups(query).some((tokens) =>
		tokens.some((token) => WRITE_QUERY_TERMS.has(token))
	);
}

export function computeToolMatchScore(
	entry: SearchableRegistryEntry,
	query: string,
	relatedSkillIds: string[] = []
): number {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return 1;

	const tokenGroups = queryTokenGroups(normalizedQuery);
	if (tokenGroups.length === 0) return 0;

	const opWords = new Set(tokenize(entry.op));
	const toolNameWords = new Set(tokenize(entry.tool_name));
	const descriptionWords = new Set(tokenize(entry.description));
	const relatedSkillWords = new Set(relatedSkillIds.flatMap(tokenize));
	const metadataWords = new Set(
		[entry.group, entry.kind, entry.entity, entry.action]
			.filter((value): value is string => typeof value === 'string' && value.length > 0)
			.flatMap(tokenize)
	);

	let score = 0;
	if (entry.op.toLowerCase() === normalizedQuery) score += 200;
	if (entry.tool_name.toLowerCase() === normalizedQuery) score += 160;

	let matchedConcepts = 0;
	let strongMatchedConcepts = 0;

	for (const variants of tokenGroups) {
		if (variants.some((token) => opWords.has(token) || toolNameWords.has(token))) {
			score += 45;
			matchedConcepts += 1;
			strongMatchedConcepts += 1;
		} else if (variants.some((token) => descriptionWords.has(token))) {
			score += 20;
			matchedConcepts += 1;
			strongMatchedConcepts += 1;
		} else if (variants.some((token) => relatedSkillWords.has(token))) {
			score += 15;
			matchedConcepts += 1;
			strongMatchedConcepts += 1;
		} else if (variants.some((token) => metadataWords.has(token))) {
			score += 10;
			matchedConcepts += 1;
		}
	}

	// A single generic verb/noun hit is useful for a one-word query, but it is
	// noise for a multi-concept request (for example, "read Gmail inbox" should
	// not return every utility whose description happens to contain "read").
	const requiredConcepts = Math.min(2, tokenGroups.length);
	return matchedConcepts >= requiredConcepts && strongMatchedConcepts >= requiredConcepts
		? score
		: 0;
}

function listToolDirectory(entries: Array<Pick<RegistryOp, 'group' | 'entity'>>): {
	groups: Array<{ id: RegistryOp['group']; count: number }>;
	entities: Array<{ id: string; count: number }>;
} {
	const groupCounts = new Map<RegistryOp['group'], number>();
	const entityCounts = new Map<string, number>();

	for (const entry of entries) {
		groupCounts.set(entry.group, (groupCounts.get(entry.group) ?? 0) + 1);
		if (entry.entity) {
			entityCounts.set(entry.entity, (entityCounts.get(entry.entity) ?? 0) + 1);
		}
	}

	return {
		groups: Array.from(groupCounts, ([id, count]) => ({ id, count })).sort((a, b) =>
			a.id.localeCompare(b.id)
		),
		entities: Array.from(entityCounts, ([id, count]) => ({ id, count })).sort((a, b) =>
			a.id.localeCompare(b.id)
		)
	};
}

export function buildToolSearchNoMatchesPayload(
	entries: Array<Pick<RegistryOp, 'group' | 'entity'>>
): Record<string, unknown> {
	const capabilityPaths = new Map(
		listCapabilityDirectoryItems('available').map((capability) => [
			capability.id,
			capability.path
		])
	);
	return {
		message: 'No tools matched the query and filters.',
		tool_directory: listToolDirectory(entries),
		capabilities: listCapabilitySummaries().map((capability) => ({
			...capability,
			path: capabilityPaths.get(capability.id) ?? `capabilities.${capability.id}`
		}))
	};
}

export function searchToolRegistry(options: ToolSearchOptions = {}): Record<string, unknown> {
	const registry = getToolRegistry();
	const capability = resolveCapabilityReference(options.capability);
	const capabilityPrefixes = capability?.directPaths ?? [];
	const query = typeof options.query === 'string' ? options.query.trim() : '';
	const limit = Math.max(1, Math.min(25, options.limit ?? 8));
	const surface = options.surface ?? 'chat';
	const prefersWrites = toolSearchQueryHasWriteIntent(query);
	const searchableEntries = Object.values(registry.ops).filter(
		(entry) => surface !== 'chat' || entry.chat_discoverable !== false
	);

	const matches = searchableEntries
		.filter((entry) => {
			if (options.group && entry.group !== options.group) return false;
			if (options.kind && entry.kind !== options.kind) return false;
			if (options.entity && entry.entity !== options.entity) return false;
			if (
				capabilityPrefixes.length > 0 &&
				!opMatchesCapability(entry.op, capabilityPrefixes)
			) {
				return false;
			}
			return true;
		})
		.map((entry) => {
			const relatedSkillIds = getRelatedSkillIds(entry.op);
			return {
				entry,
				relatedSkillIds,
				score: computeToolMatchScore(entry, query, relatedSkillIds)
			};
		})
		.filter(({ score }) => score > 0)
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			if (prefersWrites && a.entry.kind !== b.entry.kind) {
				return a.entry.kind === 'write' ? -1 : 1;
			}
			return a.entry.op.localeCompare(b.entry.op);
		})
		.slice(0, limit)
		.map<ToolSearchMatch>(({ entry, relatedSkillIds }) => ({
			op: entry.op,
			summary: summarize(entry.description),
			group: entry.group,
			kind: entry.kind,
			entity: entry.entity,
			action: entry.action,
			tool_name: entry.tool_name,
			related_skills: relatedSkillIds
		}));

	const noMatches =
		matches.length === 0 ? buildToolSearchNoMatchesPayload(searchableEntries) : null;

	return {
		type: 'tool_search_results',
		version: registry.version,
		query: query || null,
		filters: {
			capability: capability?.path ?? null,
			group: options.group ?? null,
			kind: options.kind ?? null,
			entity: options.entity ?? null
		},
		total_matches: matches.length,
		matches,
		...(noMatches ? { no_matches: noMatches } : {}),
		next_step:
			matches.length > 0
				? 'Pick the best candidate op/tool. If it is not already loaded, this search makes the direct tool available for the next response. Call tool_schema({ op: "<canonical op>" }) before first-time or complex writes, then call the direct tool by name.'
				: 'Use the returned group/entity directory or capability IDs to browse with a narrower follow-up search. Omit query and pass group/entity to list a category.'
	};
}

export function listCapabilitySummaries(): Array<{ id: string; name: string; summary: string }> {
	return listCapabilities('available').map((capability) => ({
		id: capability.id,
		name: capability.name,
		summary: capability.summary
	}));
}
