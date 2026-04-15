// apps/web/src/lib/services/agentic-chat-lite/prompt/types.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import type { MasterPromptContext } from '$lib/services/agentic-chat-v2/master-prompt-builder';

export const LITE_PROMPT_VARIANT = 'lite_seed_v1' as const;

export type LitePromptVariant = typeof LITE_PROMPT_VARIANT;
export type LitePromptSectionKind = 'static' | 'dynamic' | 'mixed';

export type LitePromptSectionId =
	| 'identity_mission'
	| 'focus_purpose'
	| 'location_loaded_context'
	| 'timeline_recent_activity'
	| 'operating_strategy'
	| 'capabilities_skills_tools'
	| 'context_inventory_retrieval'
	| 'safety_data_rules';

export type LitePromptSection = {
	id: LitePromptSectionId;
	title: string;
	kind: LitePromptSectionKind;
	source: string;
	content: string;
	slots?: Record<string, unknown>;
	chars: number;
	estimatedTokens: number;
};

export type LitePromptRetrievalMap = {
	loaded: string[];
	omitted: string[];
	fetchWhenNeeded: string[];
	notes: string[];
};

export type LitePromptRetrievalMapInput = Partial<LitePromptRetrievalMap>;

export type LitePromptFocus = {
	contextType: ChatContextType;
	productSurface: string;
	conversationPosition: string;
	projectId: string | null;
	projectName: string | null;
	entityId: string | null;
	focusEntityType: string | null;
	focusEntityId: string | null;
	focusEntityName: string | null;
};

export type LitePromptDataSummary = {
	kind: 'empty' | 'text' | 'json';
	hasData: boolean;
	topLevelKeys: string[];
	arrayCounts: Record<string, number>;
	objectKeys: string[];
	textChars?: number;
	contextMeta?: Record<string, unknown> | null;
};

export type LitePromptTimelineItem = {
	kind: string;
	id: string | null;
	title: string;
	state: string | null;
	date: string | null;
	relative: string | null;
};

export type LitePromptProjectDigest = {
	projectName: string | null;
	projectState: string | null;
	projectDescription: string | null;
	nextStep: string | null;
	primaryGoal: string | null;
	activePlan: string | null;
	counts: Record<string, number>;
	priorityTasks: string[];
	overdueItems: LitePromptTimelineItem[];
	dueSoonItems: LitePromptTimelineItem[];
	upcomingItems: LitePromptTimelineItem[];
	recentChanges: LitePromptTimelineItem[];
	statusLines: string[];
};

export type LitePromptTimelineSummary = {
	generatedAt: string;
	timezone: string;
	scope: string;
	facts: string[];
	statusLines: string[];
	overdueLines: string[];
	upcomingLines: string[];
	recentChangeLines: string[];
};

export type LitePromptContextInventory = {
	focus: LitePromptFocus;
	dataSummary: LitePromptDataSummary;
	timeline: LitePromptTimelineSummary;
	retrievalMap: LitePromptRetrievalMap;
	projectDigest: LitePromptProjectDigest | null;
};

export type LitePromptToolsSummary = {
	contextType: ChatContextType;
	discoveryTools: string[];
	directTools: string[];
	totalTools: number;
};

export type LitePromptEnvelope = {
	promptVariant: LitePromptVariant;
	systemPrompt: string;
	sections: LitePromptSection[];
	contextInventory: LitePromptContextInventory;
	toolsSummary: LitePromptToolsSummary;
};

export type LitePromptInput = MasterPromptContext & {
	now?: Date | string | null;
	timezone?: string | null;
	productSurface?: string | null;
	conversationPosition?: string | null;
	retrievalMap?: LitePromptRetrievalMapInput | null;
	tools?: ChatToolDefinition[] | null;
};
