// apps/web/src/lib/services/agentic-chat/tools/registry/tool-search.ts
import { getCapabilityByPath, listCapabilities } from './capability-catalog';
import { getToolRegistry, type RegistryOp } from './tool-registry';
import { listAllSkills } from '../skills/registry';

export type ToolSearchOptions = {
	query?: string;
	capability?: string;
	group?: 'onto' | 'util' | 'cal';
	kind?: 'read' | 'write';
	entity?: string;
	limit?: number;
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

function computeMatchScore(entry: RegistryOp, query: string, relatedSkillIds: string[]): number {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return 1;

	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	const haystack = [
		entry.op,
		entry.tool_name,
		entry.description,
		entry.group,
		entry.kind,
		entry.entity,
		entry.action,
		...relatedSkillIds
	]
		.filter((value): value is string => typeof value === 'string' && value.length > 0)
		.join(' ')
		.toLowerCase();

	let score = 0;
	if (entry.op.toLowerCase() === normalizedQuery) score += 200;
	if (entry.op.toLowerCase().includes(normalizedQuery)) score += 100;
	if (entry.tool_name.toLowerCase().includes(normalizedQuery)) score += 60;

	for (const token of tokens) {
		if (haystack.includes(token)) {
			score += 20;
		}
	}

	return score;
}

export function searchToolRegistry(options: ToolSearchOptions = {}): Record<string, unknown> {
	const registry = getToolRegistry();
	const capability = resolveCapabilityReference(options.capability);
	const capabilityPrefixes = capability?.directPaths ?? [];
	const query = typeof options.query === 'string' ? options.query.trim() : '';
	const limit = Math.max(1, Math.min(25, options.limit ?? 8));

	const matches = Object.values(registry.ops)
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
				score: computeMatchScore(entry, query, relatedSkillIds)
			};
		})
		.filter(({ score }) => score > 0)
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			if (a.entry.kind !== b.entry.kind) return a.entry.kind.localeCompare(b.entry.kind);
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
		next_step:
			'Pick the best candidate op, then call tool_schema({ op: "<canonical op>" }) before buildos_call for first-time or complex writes.'
	};
}

export function listCapabilitySummaries(): Array<{ id: string; name: string; summary: string }> {
	return listCapabilities('available').map((capability) => ({
		id: capability.id,
		name: capability.name,
		summary: capability.summary
	}));
}
