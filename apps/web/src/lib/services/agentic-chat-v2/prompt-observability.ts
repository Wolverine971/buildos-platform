// apps/web/src/lib/services/agentic-chat-v2/prompt-observability.ts
import { createHash } from 'node:crypto';
import type {
	ChatToolCall,
	ChatToolDefinition,
	ChatToolResult,
	Database,
	Json
} from '@buildos/shared-types';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import { getToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-registry';
import { estimateTokensFromText } from './context-usage';
import { buildPromptCostBreakdown, type PromptCostBreakdown } from './prompt-cost-breakdown';
import { FASTCHAT_PROMPT_VARIANT, type FastChatPromptVariant } from './prompt-variant';
import type { FastChatHistoryMessage } from './types';

export const FASTCHAT_PROMPT_SNAPSHOT_VERSION = 'fastchat_prompt_v1';

type JsonRecord = Record<string, Json | undefined>;

export type PromptSnapshotRow = Database['public']['Tables']['chat_prompt_snapshots']['Insert'];

export type PromptSnapshotSections = {
	prompt_variant?: FastChatPromptVariant | string | null;
	context_type?: string | null;
	entity_id?: string | null;
	project_id?: string | null;
	project_name?: string | null;
	focus_entity_type?: string | null;
	focus_entity_id?: string | null;
	focus_entity_name?: string | null;
	has_agent_state?: boolean;
	has_conversation_summary?: boolean;
	data_keys?: string[] | null;
	cost_breakdown?: Json | null;
	tool_surface_report?: Json | null;
	lite_sections?: Json | null;
	lite_context_inventory?: Json | null;
	lite_tools_summary?: Json | null;
};

export type FastChatToolCallMeta = {
	toolName: string;
	helpPath: string | null;
	canonicalOp: string | null;
	args: Json;
	argsParseError: string | null;
};

function stableNormalize(value: unknown, seen = new WeakSet<object>()): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((item) => stableNormalize(item, seen));
	}
	if (typeof value === 'object') {
		if (seen.has(value as object)) return '[Circular]';
		seen.add(value as object);
		const output: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			output[key] = stableNormalize((value as Record<string, unknown>)[key], seen);
		}
		return output;
	}
	return String(value);
}

function stableStringify(value: unknown): string {
	return JSON.stringify(stableNormalize(value));
}

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function toJsonValue(value: unknown): Json | null {
	if (value === undefined) return null;
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return value as Json;
	}
	if (Array.isArray(value) || typeof value === 'object') {
		return JSON.parse(JSON.stringify(value)) as Json;
	}
	return String(value) as Json;
}

function toJsonRecord(value: Record<string, unknown>): Json {
	return JSON.parse(JSON.stringify(value)) as Json;
}

function parseToolArguments(rawArgs: unknown): { args: Json; error: string | null } {
	if (rawArgs === undefined || rawArgs === null || rawArgs === '') {
		return { args: {} as Json, error: null };
	}

	if (typeof rawArgs === 'string') {
		try {
			const parsed = JSON.parse(rawArgs);
			return { args: (toJsonValue(parsed) ?? ({} as Json)) as Json, error: null };
		} catch {
			return {
				args: { raw: rawArgs } as Json,
				error: 'Tool arguments must be valid JSON.'
			};
		}
	}

	return {
		args: (toJsonValue(rawArgs) ?? ({} as Json)) as Json,
		error: null
	};
}

function buildRenderedPromptDump(params: {
	streamRunId: string;
	sessionId: string;
	contextType: string;
	entityId?: string | null;
	projectId?: string | null;
	promptVariant?: FastChatPromptVariant | string | null;
	systemPrompt: string;
	modelMessages: FastChatHistoryMessage[];
	tools?: ChatToolDefinition[];
	liteSections?: unknown;
	liteContextInventory?: unknown;
	liteToolsSummary?: unknown;
	toolSurfaceReport?: unknown;
}): string {
	const toolNames = (params.tools ?? []).map((tool) => tool.function?.name).filter(Boolean);
	const lines: string[] = [
		'========================================',
		'FASTCHAT V2 PROMPT SNAPSHOT',
		`Stream run: ${params.streamRunId}`,
		`Session:    ${params.sessionId}`,
		`Context:    ${params.contextType}`,
		`Entity ID:  ${params.entityId ?? 'none'}`,
		`Project ID: ${params.projectId ?? 'none'}`,
		`Prompt variant: ${params.promptVariant ?? FASTCHAT_PROMPT_VARIANT}`,
		`Tools (${toolNames.length}): ${toolNames.join(', ') || 'none'}`,
		`Message count: ${params.modelMessages.length}`,
		`System prompt length: ${params.systemPrompt.length} chars (~${estimateTokensFromText(params.systemPrompt)} tokens)`,
		'========================================',
		'',
		'────────────────────────────────────────',
		'SYSTEM PROMPT',
		'────────────────────────────────────────',
		params.systemPrompt,
		''
	];

	const liteSectionLines = formatLiteSectionDump(params.liteSections);
	if (liteSectionLines.length > 0) {
		lines.push(
			'────────────────────────────────────────',
			'LITE SECTION BREAKDOWN',
			'────────────────────────────────────────',
			...liteSectionLines,
			''
		);
	}

	const liteMetadataLines = formatLiteMetadataDump({
		contextInventory: params.liteContextInventory,
		toolsSummary: params.liteToolsSummary,
		toolSurfaceReport: params.toolSurfaceReport
	});
	if (liteMetadataLines.length > 0) {
		lines.push(
			'────────────────────────────────────────',
			'LITE METADATA',
			'────────────────────────────────────────',
			...liteMetadataLines,
			''
		);
	}

	lines.push(
		'────────────────────────────────────────',
		'MODEL MESSAGES',
		'────────────────────────────────────────'
	);

	params.modelMessages.forEach((entry, index) => {
		lines.push(`[${index + 1}] role=${entry.role}`);
		lines.push(entry.content);
		if (entry.tool_call_id) {
			lines.push(`tool_call_id=${entry.tool_call_id}`);
		}
		if (Array.isArray(entry.tool_calls) && entry.tool_calls.length > 0) {
			lines.push(`tool_calls=${stableStringify(entry.tool_calls)}`);
		}
		lines.push('');
	});

	return lines.join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function formatLiteSectionDump(sections: unknown): string[] {
	if (!Array.isArray(sections) || sections.length === 0) return [];

	return sections.map((section, index) => {
		const record = isRecord(section) ? section : {};
		const id = typeof record.id === 'string' ? record.id : `section_${index + 1}`;
		const title = typeof record.title === 'string' ? record.title : id;
		const kind = typeof record.kind === 'string' ? record.kind : 'unknown';
		const source = typeof record.source === 'string' ? record.source : 'unknown';
		const chars = typeof record.chars === 'number' ? record.chars : 0;
		const tokens = typeof record.estimatedTokens === 'number' ? record.estimatedTokens : 0;
		return `${index + 1}. ${id} - ${title} [${kind}, ${source}] ${chars} chars (~${tokens} tokens)`;
	});
}

function formatJsonPreview(label: string, value: unknown): string[] {
	if (value === undefined || value === null) return [];
	return [`${label}:`, stableStringify(value)];
}

function formatLiteMetadataDump(params: {
	contextInventory?: unknown;
	toolsSummary?: unknown;
	toolSurfaceReport?: unknown;
}): string[] {
	return [
		...formatJsonPreview('Context inventory', params.contextInventory),
		...formatJsonPreview('Tools summary', params.toolsSummary),
		...formatJsonPreview('Tool surface report', params.toolSurfaceReport)
	];
}

export function buildPromptSnapshotSections(params: {
	promptVariant?: FastChatPromptVariant | string | null;
	contextType: string;
	entityId?: string | null;
	projectId?: string | null;
	projectName?: string | null;
	focusEntityType?: string | null;
	focusEntityId?: string | null;
	focusEntityName?: string | null;
	agentState?: string | null;
	conversationSummary?: string | null;
	data?: Record<string, unknown> | string | null;
	promptCostBreakdown?: PromptCostBreakdown | null;
	toolSurfaceReport?: unknown | null;
	liteSections?: unknown | null;
	liteContextInventory?: unknown | null;
	liteToolsSummary?: unknown | null;
}): PromptSnapshotSections {
	const sections: PromptSnapshotSections = {
		prompt_variant: params.promptVariant ?? FASTCHAT_PROMPT_VARIANT,
		context_type: params.contextType,
		entity_id: params.entityId ?? null,
		project_id: params.projectId ?? null,
		project_name: params.projectName ?? null,
		focus_entity_type: params.focusEntityType ?? null,
		focus_entity_id: params.focusEntityId ?? null,
		focus_entity_name: params.focusEntityName ?? null,
		has_agent_state: Boolean(params.agentState),
		has_conversation_summary: Boolean(params.conversationSummary),
		data_keys:
			params.data && typeof params.data === 'object' && !Array.isArray(params.data)
				? Object.keys(params.data).sort()
				: null,
		cost_breakdown: params.promptCostBreakdown
			? (toJsonValue(params.promptCostBreakdown) as Json)
			: null
	};
	if (params.toolSurfaceReport) {
		sections.tool_surface_report = toJsonValue(params.toolSurfaceReport) as Json;
	}
	if (params.liteSections) {
		sections.lite_sections = toJsonValue(params.liteSections) as Json;
	}
	if (params.liteContextInventory) {
		sections.lite_context_inventory = toJsonValue(params.liteContextInventory) as Json;
	}
	if (params.liteToolsSummary) {
		sections.lite_tools_summary = toJsonValue(params.liteToolsSummary) as Json;
	}
	return sections;
}

export function buildPromptSnapshotRow(params: {
	turnRunId: string;
	sessionId: string;
	userId: string;
	streamRunId: string;
	contextType: string;
	entityId?: string | null;
	projectId?: string | null;
	promptVariant?: FastChatPromptVariant | string | null;
	systemPrompt: string;
	history: FastChatHistoryMessage[];
	message: string;
	tools?: ChatToolDefinition[];
	requestPayload?: Record<string, unknown> | null;
	promptSections?: PromptSnapshotSections | null;
	promptCostBreakdown?: PromptCostBreakdown | null;
	contextPayload?: Record<string, unknown> | string | null;
	toolSurfaceReport?: unknown | null;
	liteSections?: unknown | null;
	liteContextInventory?: unknown | null;
	liteToolsSummary?: unknown | null;
}): PromptSnapshotRow {
	const modelMessages: FastChatHistoryMessage[] = [
		{ role: 'system', content: params.systemPrompt },
		...params.history,
		{ role: 'user', content: params.message }
	];
	const messagesJson = toJsonValue(modelMessages) ?? ([] as Json);
	const toolsJson = params.tools?.length ? (toJsonValue(params.tools) as Json) : null;
	const requestPayloadJson =
		params.requestPayload && Object.keys(params.requestPayload).length > 0
			? (toJsonRecord(params.requestPayload) as Json)
			: null;
	const contextPayloadJson =
		params.contextPayload && typeof params.contextPayload === 'string'
			? (params.contextPayload as Json)
			: params.contextPayload && typeof params.contextPayload === 'object'
				? (toJsonRecord(params.contextPayload as Record<string, unknown>) as Json)
				: null;
	const renderedDumpText = buildRenderedPromptDump({
		streamRunId: params.streamRunId,
		sessionId: params.sessionId,
		contextType: params.contextType,
		entityId: params.entityId,
		projectId: params.projectId,
		promptVariant: params.promptVariant ?? FASTCHAT_PROMPT_VARIANT,
		systemPrompt: params.systemPrompt,
		modelMessages,
		tools: params.tools,
		liteSections: params.liteSections,
		liteContextInventory: params.liteContextInventory,
		liteToolsSummary: params.liteToolsSummary,
		toolSurfaceReport: params.toolSurfaceReport
	});
	const messageChars = modelMessages.reduce(
		(sum, entry) => sum + (entry.content?.length ?? 0),
		0
	);
	const costBreakdown =
		params.promptCostBreakdown ??
		buildPromptCostBreakdown({
			systemPrompt: params.systemPrompt,
			history: params.history,
			userMessage: params.message,
			tools: params.tools
		});
	const approxPromptTokens = estimateTokensFromText(
		modelMessages.map((entry) => entry.content).join('\n')
	);
	const promptSectionsWithCost =
		params.promptSections && Object.keys(params.promptSections).length > 0
			? ({
					prompt_variant:
						params.promptSections.prompt_variant ??
						params.promptVariant ??
						FASTCHAT_PROMPT_VARIANT,
					...params.promptSections,
					cost_breakdown:
						params.promptSections.cost_breakdown ?? (toJsonValue(costBreakdown) as Json)
				} satisfies PromptSnapshotSections)
			: ({
					prompt_variant: params.promptVariant ?? FASTCHAT_PROMPT_VARIANT,
					cost_breakdown: toJsonValue(costBreakdown) as Json
				} satisfies PromptSnapshotSections);
	const promptSectionsWithCostJson = toJsonRecord(
		promptSectionsWithCost as Record<string, unknown>
	) as Json;

	return {
		turn_run_id: params.turnRunId,
		session_id: params.sessionId,
		user_id: params.userId,
		snapshot_version: FASTCHAT_PROMPT_SNAPSHOT_VERSION,
		prompt_variant: params.promptVariant ?? FASTCHAT_PROMPT_VARIANT,
		system_prompt: params.systemPrompt,
		model_messages: messagesJson,
		tool_definitions: toolsJson,
		request_payload: requestPayloadJson,
		prompt_sections: promptSectionsWithCostJson,
		context_payload: contextPayloadJson,
		rendered_dump_text: renderedDumpText,
		system_prompt_sha256: sha256(params.systemPrompt),
		messages_sha256: sha256(stableStringify(modelMessages)),
		tools_sha256: toolsJson ? sha256(stableStringify(params.tools)) : null,
		system_prompt_chars: params.systemPrompt.length,
		message_chars: messageChars,
		approx_prompt_tokens: approxPromptTokens
	};
}

export function extractFastChatToolCallMeta(toolCall: ChatToolCall): FastChatToolCallMeta {
	const toolName = toolCall.function?.name?.trim() ?? '';
	const parsed = parseToolArguments(toolCall.function?.arguments);
	const argsRecord =
		parsed.args && typeof parsed.args === 'object' && !Array.isArray(parsed.args)
			? (parsed.args as JsonRecord)
			: null;
	const rawOp = typeof argsRecord?.op === 'string' ? argsRecord.op : null;
	const schemaOp = toolName === 'tool_schema' && rawOp ? normalizeGatewayOpName(rawOp) : null;
	const directOp = getToolRegistry().byToolName[toolName]?.op ?? null;

	return {
		toolName,
		helpPath: schemaOp,
		canonicalOp: directOp ?? schemaOp,
		args: parsed.args,
		argsParseError: parsed.error
	};
}

export function buildToolCallEventPayload(toolCall: ChatToolCall): Json {
	const meta = extractFastChatToolCallMeta(toolCall);
	return {
		tool_name: meta.toolName,
		tool_call_id: toolCall.id,
		help_path: meta.helpPath,
		canonical_op: meta.canonicalOp,
		args: meta.args,
		args_parse_error: meta.argsParseError
	} as Json;
}

export function buildToolResultEventPayload(toolCall: ChatToolCall, result: ChatToolResult): Json {
	const meta = extractFastChatToolCallMeta(toolCall);
	return {
		tool_name: meta.toolName,
		tool_call_id: toolCall.id,
		help_path: meta.helpPath,
		canonical_op: meta.canonicalOp,
		success: result.success === true,
		error: typeof result.error === 'string' ? result.error : null,
		duration_ms:
			typeof result.duration_ms === 'number' && Number.isFinite(result.duration_ms)
				? result.duration_ms
				: null,
		args_parse_error: meta.argsParseError
	} as Json;
}

function isOverviewOp(op: string | null): boolean {
	return op === 'util.workspace.overview' || op === 'util.project.overview';
}

function isExactOpHelpPath(path: string | null): boolean {
	if (!path) return false;
	return path.includes('.') && !path.endsWith('.skill') && !path.startsWith('capabilities.');
}

export function deriveFirstLane(params: {
	firstHelpPath?: string | null;
	firstHelpSequence?: number | null;
	firstSkillPath?: string | null;
	firstSkillSequence?: number | null;
	firstCanonicalOp?: string | null;
	firstOpSequence?: number | null;
}): 'overview' | 'skill_first' | 'direct_exact_op' | 'unknown' {
	if (isOverviewOp(params.firstCanonicalOp ?? null)) {
		return 'overview';
	}

	const skillSequence =
		typeof params.firstSkillSequence === 'number'
			? params.firstSkillSequence
			: Number.POSITIVE_INFINITY;
	const opSequence =
		typeof params.firstOpSequence === 'number'
			? params.firstOpSequence
			: Number.POSITIVE_INFINITY;
	if (params.firstSkillPath && skillSequence <= opSequence) {
		return 'skill_first';
	}

	const helpSequence =
		typeof params.firstHelpSequence === 'number'
			? params.firstHelpSequence
			: Number.POSITIVE_INFINITY;
	if (isExactOpHelpPath(params.firstHelpPath ?? null) && helpSequence <= opSequence) {
		return 'direct_exact_op';
	}

	return 'unknown';
}
