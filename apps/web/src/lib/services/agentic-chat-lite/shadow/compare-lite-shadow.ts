// apps/web/src/lib/services/agentic-chat-lite/shadow/compare-lite-shadow.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import { extractToolNamesFromDefinitions } from '$lib/services/agentic-chat/tools/core/tools.config';
import { normalizeFastContextType, selectFastChatTools } from '$lib/services/agentic-chat-v2';
import {
	buildPromptCostBreakdown,
	type PromptCostBreakdown
} from '$lib/services/agentic-chat-v2/prompt-cost-breakdown';
import {
	buildToolSurfaceSizeReport,
	type ToolSurfaceSizeReport
} from '$lib/services/agentic-chat-v2/tool-surface-size-report';
import type { MasterPromptContext } from '$lib/services/agentic-chat-v2/master-prompt-builder';
import type { FastChatHistoryMessage } from '$lib/services/agentic-chat-v2/types';
import {
	buildLitePromptEnvelope,
	LITE_PROMPT_VARIANT,
	type LitePromptContextInventory,
	type LitePromptSection,
	type LitePromptToolsSummary,
	type LitePromptVariant
} from '$lib/services/agentic-chat-lite/prompt';

export type LiteShadowPromptSnapshotInput = {
	id?: string | null;
	turn_run_id?: string | null;
	snapshot_version?: string | null;
	prompt_variant?: string | null;
	system_prompt: string;
	model_messages?: unknown;
	tool_definitions?: unknown;
	request_payload?: unknown;
	prompt_sections?: unknown;
	context_payload?: unknown;
	created_at?: string | null;
};

export type LiteShadowSectionCost = {
	id: string;
	chars: number;
	estimatedTokens: number;
};

export type LiteShadowToolNameComparison = {
	v2: string[];
	lite: string[];
	kept: string[];
	added_in_lite: string[];
	removed_from_lite: string[];
};

export type LiteShadowSizeDeltas = {
	system_prompt_chars: number;
	system_prompt_tokens: number;
	tool_definition_chars: number;
	tool_definition_tokens: number;
	provider_payload_chars: number;
	provider_payload_tokens: number;
};

export type LiteShadowComparison = {
	prompt_variant: LitePromptVariant;
	snapshot: {
		id: string | null;
		turn_run_id: string | null;
		snapshot_version: string | null;
	};
	context: {
		context_type: ChatContextType;
		entity_id: string | null;
		project_id: string | null;
		project_name: string | null;
		focus_entity_type: string | null;
		focus_entity_id: string | null;
		focus_entity_name: string | null;
		data_keys: string[];
	};
	v2: {
		system_prompt: string;
		cost_breakdown: PromptCostBreakdown;
		tool_surface_report: ToolSurfaceSizeReport;
		section_costs: LiteShadowSectionCost[];
	};
	lite: {
		system_prompt: string;
		sections: LitePromptSection[];
		context_inventory: LitePromptContextInventory;
		tools_summary: LitePromptToolsSummary;
		cost_breakdown: PromptCostBreakdown;
		tool_surface_report: ToolSurfaceSizeReport;
	};
	deltas: LiteShadowSizeDeltas;
	tool_names: LiteShadowToolNameComparison;
	context_key_comparison: {
		v2_data_keys: string[];
		lite_data_keys: string[];
		kept: string[];
		added_in_lite: string[];
		missing_from_lite: string[];
	};
	gaps: string[];
};

type SnapshotContext = {
	promptContext: MasterPromptContext;
	dataKeys: string[];
	gaps: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function trimOptionalString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function readPathString(record: Record<string, unknown> | null, keys: string[]): string | null {
	if (!record) return null;
	for (const key of keys) {
		const value = trimOptionalString(record[key]);
		if (value) return value;
	}
	return null;
}

function normalizeContextPayload(value: unknown, gaps: string[]): MasterPromptContext['data'] {
	if (value === undefined || value === null) {
		gaps.push('snapshot.context_payload is missing; lite rendered from scope metadata only.');
		return null;
	}
	if (typeof value === 'string') return value;
	if (isRecord(value)) return cloneJson(value);
	gaps.push('snapshot.context_payload was not an object or string; lite ignored it.');
	return null;
}

function parseToolDefinitions(value: unknown, gaps: string[]): ChatToolDefinition[] {
	if (value === undefined || value === null) {
		gaps.push(
			'snapshot.tool_definitions is missing; v2 tool comparison uses an empty surface.'
		);
		return [];
	}
	if (!Array.isArray(value)) {
		gaps.push(
			'snapshot.tool_definitions is not an array; v2 tool comparison uses an empty surface.'
		);
		return [];
	}
	return value.filter(
		(tool): tool is ChatToolDefinition => isRecord(tool) && isRecord(tool.function)
	);
}

function parseModelMessages(value: unknown): FastChatHistoryMessage[] {
	if (!Array.isArray(value)) return [];
	const messages: FastChatHistoryMessage[] = [];

	for (const entry of value) {
		if (!isRecord(entry)) continue;
		const role = trimOptionalString(entry.role);
		if (role !== 'system' && role !== 'user' && role !== 'assistant' && role !== 'tool') {
			continue;
		}

		const message: FastChatHistoryMessage = {
			role,
			content: typeof entry.content === 'string' ? entry.content : ''
		};
		const toolCallId = trimOptionalString(entry.tool_call_id);
		if (toolCallId) {
			message.tool_call_id = toolCallId;
		}
		if (Array.isArray(entry.tool_calls)) {
			message.tool_calls = cloneJson(
				entry.tool_calls
			) as FastChatHistoryMessage['tool_calls'];
		}
		messages.push(message);
	}

	return messages;
}

function splitHistoryAndUserMessage(modelMessages: FastChatHistoryMessage[]): {
	history: FastChatHistoryMessage[];
	userMessage: string;
} {
	const messages = modelMessages.filter((entry) => entry.role !== 'system');
	const lastUserIndex = [...messages].reverse().findIndex((entry) => entry.role === 'user');
	if (lastUserIndex < 0) {
		return { history: messages, userMessage: '' };
	}
	const userIndex = messages.length - 1 - lastUserIndex;
	return {
		history: messages.filter((_, index) => index !== userIndex),
		userMessage: messages[userIndex]?.content ?? ''
	};
}

function extractSectionCosts(promptSections: unknown): LiteShadowSectionCost[] {
	const sections = isRecord(promptSections) ? promptSections : null;
	const costBreakdown = isRecord(sections?.cost_breakdown) ? sections.cost_breakdown : null;
	const sectionCosts = isRecord(costBreakdown?.sections) ? costBreakdown.sections : null;
	if (!sectionCosts) return [];

	return Object.entries(sectionCosts)
		.map(([id, raw]) => {
			if (!isRecord(raw)) return null;
			const chars = typeof raw.chars === 'number' ? raw.chars : 0;
			const estimatedTokens =
				typeof raw.est_tokens === 'number'
					? raw.est_tokens
					: typeof raw.estimatedTokens === 'number'
						? raw.estimatedTokens
						: 0;
			return { id, chars, estimatedTokens };
		})
		.filter((entry): entry is LiteShadowSectionCost => Boolean(entry))
		.sort((a, b) => b.chars - a.chars || a.id.localeCompare(b.id));
}

function compareNames(v2Tools: ChatToolDefinition[], liteTools: ChatToolDefinition[]) {
	const v2 = extractToolNamesFromDefinitions(v2Tools).sort();
	const lite = extractToolNamesFromDefinitions(liteTools).sort();
	const v2Set = new Set(v2);
	const liteSet = new Set(lite);
	return {
		v2,
		lite,
		kept: v2.filter((name) => liteSet.has(name)),
		added_in_lite: lite.filter((name) => !v2Set.has(name)),
		removed_from_lite: v2.filter((name) => !liteSet.has(name))
	};
}

function compareKeys(v2DataKeys: string[], liteDataKeys: string[]) {
	const v2Set = new Set(v2DataKeys);
	const liteSet = new Set(liteDataKeys);
	return {
		v2_data_keys: v2DataKeys,
		lite_data_keys: liteDataKeys,
		kept: v2DataKeys.filter((key) => liteSet.has(key)),
		added_in_lite: liteDataKeys.filter((key) => !v2Set.has(key)),
		missing_from_lite: v2DataKeys.filter((key) => !liteSet.has(key))
	};
}

function buildSnapshotContext(snapshot: LiteShadowPromptSnapshotInput): SnapshotContext {
	const gaps: string[] = [];
	const promptSections = isRecord(snapshot.prompt_sections) ? snapshot.prompt_sections : null;
	const requestPayload = isRecord(snapshot.request_payload) ? snapshot.request_payload : null;
	const projectFocus = isRecord(requestPayload?.projectFocus)
		? requestPayload.projectFocus
		: isRecord(requestPayload?.project_focus)
			? requestPayload.project_focus
			: null;

	if (!promptSections) {
		gaps.push(
			'snapshot.prompt_sections is missing; context scope inferred from request payload.'
		);
	}

	const contextType = normalizeFastContextType(
		readPathString(promptSections, ['context_type']) ??
			readPathString(requestPayload, ['context_type', 'contextType']) ??
			'global'
	);
	const data = normalizeContextPayload(snapshot.context_payload, gaps);
	const dataKeys = Array.isArray(promptSections?.data_keys)
		? promptSections.data_keys.filter((key): key is string => typeof key === 'string').sort()
		: data && typeof data === 'object' && !Array.isArray(data)
			? Object.keys(data).sort()
			: [];
	const focusEntityType =
		readPathString(promptSections, ['focus_entity_type']) ??
		readPathString(projectFocus, ['focusEntityType', 'focusType']);

	return {
		promptContext: {
			contextType,
			entityId:
				readPathString(promptSections, ['entity_id']) ??
				readPathString(requestPayload, ['entity_id', 'entityId']),
			projectId:
				readPathString(promptSections, ['project_id']) ??
				readPathString(requestPayload, ['project_id', 'projectId']) ??
				readPathString(projectFocus, ['projectId']),
			projectName:
				readPathString(promptSections, ['project_name']) ??
				readPathString(projectFocus, ['projectName']),
			focusEntityType: focusEntityType === 'project-wide' ? null : focusEntityType,
			focusEntityId:
				readPathString(promptSections, ['focus_entity_id']) ??
				readPathString(projectFocus, ['focusEntityId']),
			focusEntityName:
				readPathString(promptSections, ['focus_entity_name']) ??
				readPathString(projectFocus, ['focusEntityName']),
			data
		},
		dataKeys,
		gaps
	};
}

function computeDeltas(params: {
	v2Cost: PromptCostBreakdown;
	liteCost: PromptCostBreakdown;
	v2Tools: ToolSurfaceSizeReport;
	liteTools: ToolSurfaceSizeReport;
}): LiteShadowSizeDeltas {
	return {
		system_prompt_chars:
			params.liteCost.system_prompt.chars - params.v2Cost.system_prompt.chars,
		system_prompt_tokens:
			params.liteCost.system_prompt.est_tokens - params.v2Cost.system_prompt.est_tokens,
		tool_definition_chars: params.liteTools.totalChars - params.v2Tools.totalChars,
		tool_definition_tokens: params.liteTools.estimatedTokens - params.v2Tools.estimatedTokens,
		provider_payload_chars:
			params.liteCost.provider_payload_estimate.chars -
			params.v2Cost.provider_payload_estimate.chars,
		provider_payload_tokens:
			params.liteCost.provider_payload_estimate.est_tokens -
			params.v2Cost.provider_payload_estimate.est_tokens
	};
}

export function buildLiteShadowComparison(params: {
	promptSnapshot: LiteShadowPromptSnapshotInput;
	now?: Date | string | null;
	timezone?: string | null;
}): LiteShadowComparison {
	const { promptSnapshot } = params;
	const snapshotContext = buildSnapshotContext(promptSnapshot);
	const modelMessages = parseModelMessages(promptSnapshot.model_messages);
	const { history, userMessage } = splitHistoryAndUserMessage(modelMessages);
	const gaps = [...snapshotContext.gaps];
	const v2Tools = parseToolDefinitions(promptSnapshot.tool_definitions, gaps);
	const liteTools = selectFastChatTools({
		contextType: snapshotContext.promptContext.contextType
	});
	const liteEnvelope = buildLitePromptEnvelope({
		...snapshotContext.promptContext,
		now: params.now ?? promptSnapshot.created_at ?? null,
		timezone: params.timezone ?? null,
		conversationPosition: `shadow comparison from prompt snapshot ${promptSnapshot.id ?? 'unknown'}`,
		tools: liteTools
	});
	const v2Cost = buildPromptCostBreakdown({
		systemPrompt: promptSnapshot.system_prompt,
		history,
		userMessage,
		tools: v2Tools
	});
	const liteCost = buildPromptCostBreakdown({
		systemPrompt: liteEnvelope.systemPrompt,
		history,
		userMessage,
		tools: liteTools
	});
	const v2ToolSurfaceReport = buildToolSurfaceSizeReport({
		profile: 'snapshot_v2',
		contextType: snapshotContext.promptContext.contextType,
		tools: v2Tools
	});
	const liteToolSurfaceReport = buildToolSurfaceSizeReport({
		profile: 'lite_seed_v1_current',
		contextType: snapshotContext.promptContext.contextType,
		tools: liteTools
	});

	return {
		prompt_variant: LITE_PROMPT_VARIANT,
		snapshot: {
			id: promptSnapshot.id ?? null,
			turn_run_id: promptSnapshot.turn_run_id ?? null,
			snapshot_version: promptSnapshot.snapshot_version ?? null
		},
		context: {
			context_type: snapshotContext.promptContext.contextType,
			entity_id: snapshotContext.promptContext.entityId ?? null,
			project_id: snapshotContext.promptContext.projectId ?? null,
			project_name: snapshotContext.promptContext.projectName ?? null,
			focus_entity_type: snapshotContext.promptContext.focusEntityType ?? null,
			focus_entity_id: snapshotContext.promptContext.focusEntityId ?? null,
			focus_entity_name: snapshotContext.promptContext.focusEntityName ?? null,
			data_keys: snapshotContext.dataKeys
		},
		v2: {
			system_prompt: promptSnapshot.system_prompt,
			cost_breakdown: v2Cost,
			tool_surface_report: v2ToolSurfaceReport,
			section_costs: extractSectionCosts(promptSnapshot.prompt_sections)
		},
		lite: {
			system_prompt: liteEnvelope.systemPrompt,
			sections: liteEnvelope.sections,
			context_inventory: liteEnvelope.contextInventory,
			tools_summary: liteEnvelope.toolsSummary,
			cost_breakdown: liteCost,
			tool_surface_report: liteToolSurfaceReport
		},
		deltas: computeDeltas({
			v2Cost,
			liteCost,
			v2Tools: v2ToolSurfaceReport,
			liteTools: liteToolSurfaceReport
		}),
		tool_names: compareNames(v2Tools, liteTools),
		context_key_comparison: compareKeys(
			snapshotContext.dataKeys,
			liteEnvelope.contextInventory.dataSummary.topLevelKeys
		),
		gaps
	};
}

function formatSigned(value: number): string {
	return value > 0 ? `+${value}` : String(value);
}

function formatList(values: string[], fallback = 'none'): string {
	return values.length > 0 ? values.join(', ') : fallback;
}

export function formatLiteShadowComparisonReport(comparison: LiteShadowComparison): string {
	const lines = [
		'Lite Prompt Shadow Comparison',
		`Snapshot: ${comparison.snapshot.id ?? 'unknown'} (${comparison.snapshot.snapshot_version ?? 'unknown'})`,
		`Prompt variant: ${comparison.prompt_variant}`,
		`Context: ${comparison.context.context_type}`,
		`Project: ${comparison.context.project_name ?? comparison.context.project_id ?? 'none'}`,
		`Focus: ${comparison.context.focus_entity_type ?? 'none'} ${comparison.context.focus_entity_name ?? comparison.context.focus_entity_id ?? ''}`.trim(),
		'',
		'Size deltas (lite - v2):',
		`- System prompt: ${formatSigned(comparison.deltas.system_prompt_chars)} chars (${formatSigned(comparison.deltas.system_prompt_tokens)} est tokens)`,
		`- Tool definitions: ${formatSigned(comparison.deltas.tool_definition_chars)} chars (${formatSigned(comparison.deltas.tool_definition_tokens)} est tokens)`,
		`- Provider payload estimate: ${formatSigned(comparison.deltas.provider_payload_chars)} chars (${formatSigned(comparison.deltas.provider_payload_tokens)} est tokens)`,
		'',
		'Tool names:',
		`- Kept: ${formatList(comparison.tool_names.kept)}`,
		`- Added in lite: ${formatList(comparison.tool_names.added_in_lite)}`,
		`- Removed from lite: ${formatList(comparison.tool_names.removed_from_lite)}`,
		'',
		'Context keys:',
		`- Kept: ${formatList(comparison.context_key_comparison.kept)}`,
		`- Added in lite: ${formatList(comparison.context_key_comparison.added_in_lite)}`,
		`- Missing from lite: ${formatList(comparison.context_key_comparison.missing_from_lite)}`,
		'',
		'Lite sections:',
		...comparison.lite.sections.map(
			(section) =>
				`- ${section.id}: ${section.chars} chars (~${section.estimatedTokens} tokens)`
		)
	];

	if (comparison.gaps.length > 0) {
		lines.push('', 'Gaps:', ...comparison.gaps.map((gap) => `- ${gap}`));
	}

	return lines.join('\n');
}
