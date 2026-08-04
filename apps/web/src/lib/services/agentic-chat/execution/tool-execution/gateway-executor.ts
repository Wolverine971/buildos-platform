import type { ToolExecutionResult } from '../../shared/types';
import { loadDomain, searchDomains } from '../../tools/domains/domain-load';
import { loadOutcomeCard, searchOutcomeCards } from '../../tools/outcome-cards';
import { loadResource, searchResources } from '../../tools/resources/resource-registry';
import { loadSkill } from '../../tools/skills/skill-load';
import { loadSkillReference } from '../../tools/skills/skill-reference-load';
import { searchSkills } from '../../tools/skills/skill-search';
import { getToolSchema } from '../../tools/registry/tool-schema';
import { searchToolRegistry } from '../../tools/registry/tool-search';
import {
	libriGetCapabilitySchema,
	libriOverview,
	libriSearchCapabilities
} from '../../tools/libri';
import type { ToolArguments } from './argument-values';

export interface GatewayExecutorDependencies {
	searchDomains: typeof searchDomains;
	loadDomain: typeof loadDomain;
	searchOutcomeCards: typeof searchOutcomeCards;
	loadOutcomeCard: typeof loadOutcomeCard;
	searchSkills: typeof searchSkills;
	searchResources: typeof searchResources;
	loadResource: typeof loadResource;
	loadSkill: typeof loadSkill;
	loadSkillReference: typeof loadSkillReference;
	searchToolRegistry: typeof searchToolRegistry;
	getToolSchema: typeof getToolSchema;
	libriOverview: typeof libriOverview;
	libriSearchCapabilities: typeof libriSearchCapabilities;
	libriGetCapabilitySchema: typeof libriGetCapabilitySchema;
	fetchFn: typeof fetch;
}

type GatewayHandler = (
	args: ToolArguments,
	dependencies: GatewayExecutorDependencies
) => unknown | Promise<unknown>;

const DEFAULT_DEPENDENCIES: GatewayExecutorDependencies = {
	searchDomains,
	loadDomain,
	searchOutcomeCards,
	loadOutcomeCard,
	searchSkills,
	searchResources,
	loadResource,
	loadSkill,
	loadSkillReference,
	searchToolRegistry,
	getToolSchema,
	libriOverview,
	libriSearchCapabilities,
	libriGetCapabilitySchema,
	fetchFn: fetch
};

const GATEWAY_TOOL_HANDLERS = {
	domain_search: (args, dependencies) =>
		dependencies.searchDomains({
			query: readString(args.query),
			limit: readNumber(args.limit)
		}),
	domain_load: (args, dependencies) =>
		dependencies.loadDomain(firstString(args.domain, args.id, args.domain_id) ?? ''),
	outcome_card_search: searchOutcomeCardsHandler,
	work_capability_search: searchOutcomeCardsHandler,
	outcome_card_load: loadOutcomeCardHandler,
	work_capability_load: loadOutcomeCardHandler,
	skill_search: (args, dependencies) =>
		dependencies.searchSkills({
			query: readString(args.query),
			domain: readString(args.domain),
			capability: readString(args.capability),
			limit: readNumber(args.limit)
		}),
	resource_search: (args, dependencies) =>
		dependencies.searchResources({
			query: readString(args.query),
			domain: readString(args.domain),
			skill: readString(args.skill),
			limit: readNumber(args.limit)
		}),
	resource_load: (args, dependencies) =>
		dependencies.loadResource(firstString(args.resource, args.id, args.resource_id) ?? ''),
	skill_load: (args, dependencies) =>
		dependencies.loadSkill(firstString(args.skill, args.id, args.path) ?? '', {
			format: args.format === 'full' || args.format === 'short' ? args.format : undefined,
			include_examples: args.include_examples !== false
		}),
	skill_reference_load: (args, dependencies) =>
		dependencies.loadSkillReference(
			firstString(args.skill, args.id, args.path) ?? '',
			firstString(args.reference, args.reference_id, args.module) ?? ''
		),
	tool_search: (args, dependencies) =>
		dependencies.searchToolRegistry({
			query: readString(args.query),
			capability: readString(args.capability),
			group: readToolGroup(args.group),
			kind: args.kind === 'read' || args.kind === 'write' ? args.kind : undefined,
			entity: readString(args.entity),
			limit: readNumber(args.limit),
			surface: 'chat'
		}),
	tool_schema: (args, dependencies) =>
		dependencies.getToolSchema(firstString(args.op, args.path) ?? '', {
			include_examples: args.include_examples !== false,
			include_schema: args.include_schema !== false
		}),
	libri_overview: (args, dependencies) =>
		dependencies.libriOverview(
			{
				refresh: args.refresh === true,
				includeDomains: args.includeDomains !== false
			},
			{ fetchFn: dependencies.fetchFn }
		),
	libri_search_capabilities: (args, dependencies) =>
		dependencies.libriSearchCapabilities(
			{
				domain: readString(args.domain),
				query: readString(args.query),
				resource: readString(args.resource),
				kind: args.kind === 'read' || args.kind === 'write' ? args.kind : undefined,
				limit: readNumber(args.limit),
				refresh: args.refresh === true
			},
			{ fetchFn: dependencies.fetchFn }
		),
	libri_get_capability_schema: (args, dependencies) =>
		dependencies.libriGetCapabilitySchema(
			{
				op: firstString(args.op, args.path) ?? '',
				includeExamples: args.includeExamples !== false,
				refresh: args.refresh === true
			},
			{ fetchFn: dependencies.fetchFn }
		)
} satisfies Record<string, GatewayHandler>;

export type GatewayToolName = keyof typeof GATEWAY_TOOL_HANDLERS;
export const GATEWAY_TOOL_NAMES = Object.freeze(
	Object.keys(GATEWAY_TOOL_HANDLERS) as GatewayToolName[]
);

export function isGatewayToolName(toolName: string): toolName is GatewayToolName {
	return Object.prototype.hasOwnProperty.call(GATEWAY_TOOL_HANDLERS, toolName);
}

export async function executeGatewayTool(
	toolName: string,
	args: ToolArguments,
	dependencyOverrides: Partial<GatewayExecutorDependencies> = {}
): Promise<ToolExecutionResult> {
	if (!isGatewayToolName(toolName)) {
		return {
			success: false,
			error: `Unknown gateway tool: ${toolName}`,
			errorType: 'validation_error',
			toolName,
			toolCallId: 'gateway'
		};
	}

	const dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencyOverrides };
	const data = await GATEWAY_TOOL_HANDLERS[toolName](args, dependencies);
	return { success: true, data, toolName, toolCallId: 'gateway' };
}

function searchOutcomeCardsHandler(
	args: ToolArguments,
	dependencies: GatewayExecutorDependencies
): unknown {
	return dependencies.searchOutcomeCards({
		query: readString(args.query),
		domain: readString(args.domain),
		buildosCapability: firstString(args.buildosCapability, args.buildos_capability),
		limit: readNumber(args.limit)
	});
}

function loadOutcomeCardHandler(
	args: ToolArguments,
	dependencies: GatewayExecutorDependencies
): unknown {
	return dependencies.loadOutcomeCard(
		firstString(
			args.outcomeCard,
			args.outcome_card,
			args.workCapability,
			args.work_capability,
			args.id
		) ?? ''
	);
}

function firstString(...values: unknown[]): string | undefined {
	return values.find((value): value is string => typeof value === 'string');
}

function readString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
	return typeof value === 'number' ? value : undefined;
}

function readToolGroup(
	value: unknown
): 'onto' | 'util' | 'cal' | 'email' | 'search' | 'x' | undefined {
	return value === 'onto' ||
		value === 'util' ||
		value === 'cal' ||
		value === 'email' ||
		value === 'search' ||
		value === 'x'
		? value
		: undefined;
}
