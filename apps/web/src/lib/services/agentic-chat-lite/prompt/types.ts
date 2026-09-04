// apps/web/src/lib/services/agentic-chat-lite/prompt/types.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import type { DomainSensingResult } from '$lib/services/agentic-chat/tools/domains/domain-sensing';
import type { SkillGatePreload } from '$lib/services/agentic-chat/tools/domains/skill-gate-preload';
import type { ProjectCreateExecutionWorkflow } from '@buildos/agentic-chat-runtime/catalog';
import type { LitePromptTurnSituation } from './situational-rules';

/**
 * Shared context shape used by both the Lite prompt builder and the data loaders
 * that feed it. Previously lived in `agentic-chat-v2/master-prompt-builder.ts`;
 * moved here as part of the lite prompt consolidation (docs/specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md).
 */
export type MasterPromptContext = {
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	projectName?: string | null;
	focusEntityType?: string | null;
	focusEntityId?: string | null;
	focusEntityName?: string | null;
	contextLoadSource?:
		| 'rpc'
		| 'rpc_null_fallback'
		| 'rpc_error_fallback'
		| 'fallback'
		| 'none'
		| 'unknown_cached';
	/**
	 * IANA zone the prompt clock renders in (from `users.timezone`). Loaders
	 * always set it; absent/invalid values fall back to UTC at render time.
	 */
	timezone?: string | null;
	conversationSummary?: string | null;
	entityResolutionHint?: string | null;
	data?: Record<string, unknown> | string | null;
};

export const LITE_PROMPT_VARIANT = 'lite_seed_v1' as const;

export type LitePromptVariant = typeof LITE_PROMPT_VARIANT;
export type LitePromptSectionKind = 'static' | 'dynamic' | 'mixed';

// 15 -> 11 sections (one-engine stage S7, 2026-09-04):
// - `active_domain_signals` retired. The candidate-domain / outcome-card /
//   skill-gate signal list is routing metadata the model never needed; the
//   skill-load rule it restated already lives in Operating Strategy. The one
//   payload that section carried for real - a server-preloaded skill playbook -
//   moved into `situational_rules`, the other per-turn overlay section.
// - `timeline_recent_activity` and `context_inventory_retrieval` folded into
//   `location_loaded_context`: one section that says what is loaded and what is
//   retrievable, instead of three that restated each other's fetch rule.
// - `daily_brief` retired with the surface merge; daily-brief context routes to
//   the `global` tool surface and its brief payload rides the loaded-context
//   index. The "you are in a daily-brief turn" sentence is already in
//   `focus_purpose` (purpose line + brief guardrails).
export type LitePromptSectionId =
	| 'identity_mission'
	| 'operating_strategy'
	| 'safety_data_rules'
	| 'capabilities_skills_tools'
	| 'situational_rules'
	| 'project_start_here'
	| 'focus_purpose'
	| 'location_loaded_context'
	| 'project_knowledge_map'
	| 'tool_surface_dynamic'
	| 'final_response_contract';

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
	/**
	 * Entity ids the Timeline lines already carry verbatim. The loaded-context
	 * JSON index skips these so each UUID renders once per prompt.
	 */
	renderedEntityIds: string[];
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

export type LitePromptScaffoldOptions = {
	staticSkillCatalog?: boolean;
	skillRoutingCoaching?: boolean;
	/** Whether this runtime can execute model-requested skill_search/skill_load calls. */
	dynamicSkillTools?: boolean;
	retiredModelCoaching?: boolean;
	domainSensing?: boolean;
	situationalRules?: boolean;
};

export type LiteProjectCreateWorkflow = ProjectCreateExecutionWorkflow;

export type LitePromptInput = MasterPromptContext & {
	now?: Date | string | null;
	timezone?: string | null;
	productSurface?: string | null;
	conversationPosition?: string | null;
	currentUserMessage?: string | null;
	priorDomainIds?: string[] | null;
	/** @deprecated Use priorOutcomeCardIds. */
	priorWorkCapabilityIds?: string[] | null;
	priorOutcomeCardIds?: string[] | null;
	domainSensingResult?: DomainSensingResult | null;
	skillGatePreload?: SkillGatePreload | null;
	turnSituation?: LitePromptTurnSituation | null;
	retrievalMap?: LitePromptRetrievalMapInput | null;
	tools?: ChatToolDefinition[] | null;
	scaffold?: LitePromptScaffoldOptions | null;
	/** Selects the project-create contract enforced by the active execution lane. */
	projectCreateWorkflow?: LiteProjectCreateWorkflow;
};
