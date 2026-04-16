// apps/web/src/lib/services/agentic-chat-lite/preview/build-lite-prompt-preview.ts
import type { ChatContextType, Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import {
	buildMasterPrompt,
	loadFastChatPromptContext,
	normalizeFastContextType,
	selectFastChatTools
} from '$lib/services/agentic-chat-v2';
import {
	buildPromptCostBreakdown,
	type PromptCostBreakdown
} from '$lib/services/agentic-chat-v2/prompt-cost-breakdown';
import {
	buildToolSurfaceSizeReport,
	TOOL_SURFACE_REPORT_CONTEXTS,
	type ToolSurfaceSizeReport
} from '$lib/services/agentic-chat-v2/tool-surface-size-report';
import {
	buildLitePromptEnvelope,
	LITE_PROMPT_VARIANT,
	type LitePromptContextInventory,
	type LitePromptSection,
	type LitePromptToolsSummary,
	type LitePromptVariant
} from '$lib/services/agentic-chat-lite/prompt';

type LitePromptPreviewProjectFocusInput = {
	projectId?: string | null;
	projectName?: string | null;
	focusType?: string | null;
	focusEntityType?: string | null;
	focusEntityId?: string | null;
	focusEntityName?: string | null;
};

export type LitePromptPreviewRequest = {
	context_type?: string | null;
	entity_id?: string | null;
	project_focus?: LitePromptPreviewProjectFocusInput | null;
	projectFocus?: LitePromptPreviewProjectFocusInput | null;
	sample_message?: string | null;
	include_current_v2?: boolean | null;
	now?: Date | string | null;
	timezone?: string | null;
	product_surface?: string | null;
	conversation_position?: string | null;
};

export type LitePromptPreview = {
	prompt_variant: LitePromptVariant;
	lite: {
		system_prompt: string;
		sections: LitePromptSection[];
		context_inventory: LitePromptContextInventory;
		tools_summary: LitePromptToolsSummary;
		cost_breakdown: PromptCostBreakdown;
		tool_surface_report: ToolSurfaceSizeReport;
	};
	current_v2?: {
		system_prompt: string;
		cost_breakdown: PromptCostBreakdown;
	};
};

export class LitePromptPreviewInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LitePromptPreviewInputError';
	}
}

const VALID_CONTEXT_TYPES = new Set<ChatContextType>(TOOL_SURFACE_REPORT_CONTEXTS);
const PROJECT_FOCUS_TYPES = new Set<ProjectFocus['focusType']>([
	'project-wide',
	'task',
	'goal',
	'plan',
	'document',
	'milestone',
	'risk',
	'requirement'
]);

function trimOptionalString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function parseContextType(value: unknown): ChatContextType {
	const raw = trimOptionalString(value) ?? 'global';
	const normalized = normalizeFastContextType(raw);
	if (!VALID_CONTEXT_TYPES.has(normalized)) {
		throw new LitePromptPreviewInputError(`Unsupported context_type: ${raw}`);
	}
	return normalized;
}

function parseProjectFocusType(value: unknown): ProjectFocus['focusType'] | null {
	const raw = trimOptionalString(value);
	if (!raw) return null;
	if (!PROJECT_FOCUS_TYPES.has(raw as ProjectFocus['focusType'])) {
		throw new LitePromptPreviewInputError(`Unsupported project focus type: ${raw}`);
	}
	return raw as ProjectFocus['focusType'];
}

function normalizeProjectFocus(params: {
	contextType: ChatContextType;
	entityId: string | null;
	input?: LitePromptPreviewProjectFocusInput | null;
}): ProjectFocus | null {
	const input = params.input;
	if (!input) return null;

	const projectId =
		trimOptionalString(input.projectId) ??
		(params.contextType === 'project' ? params.entityId : null);
	if (!projectId) return null;

	const focusType =
		parseProjectFocusType(input.focusType) ??
		parseProjectFocusType(input.focusEntityType) ??
		'project-wide';
	const isEntityFocus = focusType !== 'project-wide';

	return {
		projectId,
		projectName: trimOptionalString(input.projectName) ?? '',
		focusType,
		focusEntityId: isEntityFocus ? trimOptionalString(input.focusEntityId) : null,
		focusEntityName: isEntityFocus ? trimOptionalString(input.focusEntityName) : null
	};
}

export async function buildLitePromptPreview(params: {
	supabase: SupabaseClient<Database>;
	userId: string;
	input: LitePromptPreviewRequest;
}): Promise<LitePromptPreview> {
	const contextType = parseContextType(params.input.context_type);
	const entityId = trimOptionalString(params.input.entity_id);
	const projectFocus = normalizeProjectFocus({
		contextType,
		entityId,
		input: params.input.project_focus ?? params.input.projectFocus ?? null
	});
	const sampleMessage = trimOptionalString(params.input.sample_message) ?? '';
	const tools = selectFastChatTools({ contextType, latestUserMessage: sampleMessage });
	const promptContext = await loadFastChatPromptContext({
		supabase: params.supabase,
		userId: params.userId,
		contextType,
		entityId,
		projectFocus
	});
	const liteEnvelope = buildLitePromptEnvelope({
		...promptContext,
		now: params.input.now ?? null,
		timezone: trimOptionalString(params.input.timezone),
		productSurface: trimOptionalString(params.input.product_surface),
		conversationPosition:
			trimOptionalString(params.input.conversation_position) ?? 'admin lite prompt preview',
		tools
	});
	const liteCostBreakdown = buildPromptCostBreakdown({
		systemPrompt: liteEnvelope.systemPrompt,
		history: [],
		userMessage: sampleMessage,
		tools
	});
	const toolSurfaceReport = buildToolSurfaceSizeReport({
		profile: 'current_request',
		contextType,
		tools
	});

	const preview: LitePromptPreview = {
		prompt_variant: LITE_PROMPT_VARIANT,
		lite: {
			system_prompt: liteEnvelope.systemPrompt,
			sections: liteEnvelope.sections,
			context_inventory: liteEnvelope.contextInventory,
			tools_summary: liteEnvelope.toolsSummary,
			cost_breakdown: liteCostBreakdown,
			tool_surface_report: toolSurfaceReport
		}
	};

	if (params.input.include_current_v2 === true) {
		const currentV2Prompt = buildMasterPrompt(promptContext);
		preview.current_v2 = {
			system_prompt: currentV2Prompt,
			cost_breakdown: buildPromptCostBreakdown({
				systemPrompt: currentV2Prompt,
				history: [],
				userMessage: sampleMessage,
				tools
			})
		};
	}

	return preview;
}
