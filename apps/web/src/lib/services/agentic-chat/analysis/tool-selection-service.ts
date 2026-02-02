// apps/web/src/lib/services/agentic-chat/analysis/tool-selection-service.ts
/**
 * Tool Selection Service
 *
 * What this file is:
 * - The SINGLE SOURCE OF TRUTH for tool pool determination.
 * - A tool-routing layer that chooses the final tool list for a request.
 *
 * Purpose:
 * - Determine default tool pool based on context type and focus.
 * - Start from the default context tool pool, then add/trim based on intent.
 * - Prefer StrategyAnalyzer output; fall back to heuristics when needed.
 *
 * Why / when to use:
 * - Use before plan generation so the planner sees only relevant tools.
 * - Use on context refreshes after a context shift.
 *
 * Architecture note:
 * - This service OWNS all default pool logic. Do not determine default tools elsewhere.
 * - agent-context-service.ts should pass ALL_TOOLS and let this service filter.
 */

import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import type { PlannerContext, ServiceContext } from '../shared/types';
import type {
	LastTurnContext,
	StrategyAnalysis,
	ProjectFocus
} from '$lib/types/agent-chat-enhancement';
import { ChatStrategy } from '$lib/types/agent-chat-enhancement';
import { StrategyAnalyzer } from './strategy-analyzer';
import {
	ALL_TOOLS,
	extractTools,
	resolveToolName,
	extractToolNamesFromDefinitions,
	getDefaultToolsForContextType,
	isWriteToolName
} from '$lib/services/agentic-chat/tools/core/tools.config';
import { normalizeContextType } from '../../../../routes/api/agent/stream/utils/context-utils';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('ToolSelectionService');

export type ToolSelectionMode = 'llm' | 'heuristic' | 'default';

export interface ToolSelectionMetadata {
	mode: ToolSelectionMode;
	defaultToolNames: string[];
	selectedToolNames: string[];
	addedTools: string[];
	removedTools: string[];
	strategy: StrategyAnalysis['primary_strategy'];
	confidence: number;
}

export interface ToolSelectionResult {
	tools: ChatToolDefinition[];
	analysis: StrategyAnalysis;
	metadata: ToolSelectionMetadata;
}

export class ToolSelectionService {
	constructor(private strategyAnalyzer: StrategyAnalyzer) {}

	/**
	 * Get the default tool pool for a given context type.
	 * This is the CANONICAL method for determining default tools.
	 */
	getDefaultToolPool(contextType: ChatContextType): ChatToolDefinition[] {
		const normalized = normalizeContextType(contextType);
		const defaultTools = getDefaultToolsForContextType(normalized);
		const pool = defaultTools.length > 0 ? defaultTools : ALL_TOOLS;
		return this.applyReadOnlyContextFilter(pool, normalized);
	}

	/**
	 * Filter tools based on project focus (element-level context).
	 * When focused on a specific entity type, deprioritize unrelated write tools.
	 */
	filterToolsForFocus(
		tools: ChatToolDefinition[],
		focus: ProjectFocus | null | undefined
	): ChatToolDefinition[] {
		if (!focus || focus.focusType === 'project-wide') {
			return tools;
		}

		const focusType = focus.focusType;
		const otherTypes = [
			'task',
			'goal',
			'plan',
			'document',
			'milestone',
			'risk',
			'requirement'
		].filter((type) => type !== focusType);

		return tools.filter((tool) => {
			const toolName = resolveToolName(tool).toLowerCase();
			if (!toolName || toolName === 'unknown') return true;

			// Always keep list/get tools (read operations)
			if (toolName.startsWith('list_') || toolName.startsWith('get_')) return true;

			// Always keep project-level tools
			if (toolName.includes('project')) return true;

			// Keep tools matching the focus type
			if (toolName.includes(`_${focusType}`)) return true;

			// Filter out write tools for other entity types
			return !otherTypes.some((type) => toolName.includes(`_${type}`));
		});
	}

	private shouldApplyFocusFilter(
		message: string,
		focus: ProjectFocus | null | undefined
	): boolean {
		if (!focus || focus.focusType === 'project-wide') {
			return false;
		}

		const mentioned = this.detectEntityMentions(message);
		if (mentioned.size === 0) {
			return true;
		}

		if (!mentioned.has(focus.focusType)) {
			return false;
		}

		return mentioned.size === 1;
	}

	private detectEntityMentions(message: string): Set<string> {
		const text = message?.toLowerCase() ?? '';
		if (!text) return new Set();

		const entityTokens: Record<string, string[]> = {
			task: ['task', 'tasks'],
			goal: ['goal', 'goals'],
			plan: ['plan', 'plans'],
			document: ['document', 'documents', 'doc', 'docs'],
			milestone: ['milestone', 'milestones'],
			risk: ['risk', 'risks'],
			requirement: ['requirement', 'requirements', 'req', 'reqs']
		};

		const mentions = new Set<string>();
		for (const [entity, tokens] of Object.entries(entityTokens)) {
			for (const token of tokens) {
				const pattern = new RegExp(`\\b${token}\\b`, 'i');
				if (pattern.test(text)) {
					mentions.add(entity);
					break;
				}
			}
		}
		return mentions;
	}

	/**
	 * Main entry point: Select tools based on context, focus, and user intent.
	 * This service owns all default pool logic - don't determine defaults elsewhere.
	 */
	async selectTools(params: {
		message: string;
		plannerContext: PlannerContext;
		serviceContext: ServiceContext;
		lastTurnContext?: LastTurnContext;
		toolCatalog?: ChatToolDefinition[];
	}): Promise<ToolSelectionResult> {
		const {
			message,
			plannerContext,
			serviceContext,
			lastTurnContext,
			toolCatalog = ALL_TOOLS
		} = params;

		const llmSelectionDisabled =
			typeof process !== 'undefined' &&
			['true', '1', 'yes'].includes(
				String(process.env.AGENTIC_CHAT_DISABLE_TOOL_SELECTION_LLM ?? '').toLowerCase()
			);

		const normalizedContextType = normalizeContextType(serviceContext.contextType);
		const analysisContext =
			serviceContext.contextType === normalizedContextType
				? serviceContext
				: { ...serviceContext, contextType: normalizedContextType };

		// STEP 1: Compute default pool from context type (canonical source)
		const contextDefaultTools = this.getDefaultToolPool(normalizedContextType);

		// STEP 2: Apply focus filtering (skip when tool selection is preselected)
		const applyFocusFilter =
			!llmSelectionDisabled &&
			this.shouldApplyFocusFilter(message, analysisContext.projectFocus);
		const focusFilteredTools = applyFocusFilter
			? this.filterToolsForFocus(contextDefaultTools, analysisContext.projectFocus)
			: contextDefaultTools;

		// STEP 3: Extract names for comparison
		const defaultToolNames = extractToolNamesFromDefinitions(focusFilteredTools);
		const readOnlyCatalog = this.applyReadOnlyContextFilter(toolCatalog, normalizedContextType);
		const toolCatalogNames = new Set(extractToolNamesFromDefinitions(readOnlyCatalog));
		const defaultSet = new Set(defaultToolNames);

		if (llmSelectionDisabled) {
			let selectedToolNames = defaultToolNames.filter((name) => toolCatalogNames.has(name));
			selectedToolNames = this.ensureProjectCreationTool(
				selectedToolNames,
				normalizedContextType
			);
			const tools = extractTools(selectedToolNames);
			const analysis = this.buildDefaultAnalysis(
				ChatStrategy.PLANNER_STREAM,
				'Tool selection LLM disabled via AGENTIC_CHAT_DISABLE_TOOL_SELECTION_LLM.'
			);
			const removedTools = defaultToolNames.filter((name) => !toolCatalogNames.has(name));
			this.logSelectionSummary({
				contextType: normalizedContextType,
				mode: 'default',
				defaultToolNames,
				selectedToolNames,
				addedTools: [],
				removedTools,
				strategy: analysis.primary_strategy
			});

			return {
				tools,
				analysis,
				metadata: {
					mode: 'default',
					defaultToolNames,
					selectedToolNames,
					addedTools: [],
					removedTools,
					strategy: analysis.primary_strategy,
					confidence: analysis.confidence
				}
			};
		}

		let analysis: StrategyAnalysis;
		let selectedToolNames: string[] = [];
		let mode: ToolSelectionMode = 'default';

		if (normalizedContextType === 'project_create') {
			analysis = this.buildDefaultAnalysis(
				ChatStrategy.PROJECT_CREATION,
				'Tool selection skipped for project_create context.'
			);
			selectedToolNames = defaultToolNames.filter((name) => toolCatalogNames.has(name));
		} else {
			const analysisPlannerContext = {
				...plannerContext,
				availableTools: readOnlyCatalog
			};

			analysis = await this.strategyAnalyzer.analyzeUserIntent(
				message,
				analysisPlannerContext,
				analysisContext,
				lastTurnContext,
				undefined,
				{
					toolCatalog: readOnlyCatalog,
					defaultToolNames
				}
			);
		}

		// Use is_fallback flag instead of fragile string matching
		const isFallbackSelection = analysis.tool_selection?.is_fallback === true;

		if (
			!selectedToolNames.length &&
			analysis.tool_selection?.selected_tools?.length &&
			!isFallbackSelection
		) {
			selectedToolNames = analysis.tool_selection.selected_tools;
			mode = 'llm';
		} else if (!selectedToolNames.length && analysis.required_tools?.length) {
			selectedToolNames = analysis.required_tools;
			mode = 'heuristic';
		} else if (!selectedToolNames.length) {
			selectedToolNames = this.strategyAnalyzer.estimateRequiredTools(
				message,
				defaultToolNames
			);
			mode = selectedToolNames.length ? 'heuristic' : 'default';
		}

		selectedToolNames = this.normalizeToolNames(selectedToolNames, toolCatalogNames);
		selectedToolNames = this.filterReadOnlyToolNames(selectedToolNames, normalizedContextType);
		if (selectedToolNames.length === 0) {
			selectedToolNames = defaultToolNames.filter((name) => toolCatalogNames.has(name));
			selectedToolNames = this.filterReadOnlyToolNames(
				selectedToolNames,
				normalizedContextType
			);
			mode = 'default';
		}

		if (mode !== 'llm') {
			selectedToolNames = selectedToolNames.filter((name) => defaultSet.has(name));
			selectedToolNames = this.filterExternalTools(selectedToolNames, message);
			if (selectedToolNames.length === 0) {
				selectedToolNames = defaultToolNames.filter((name) => toolCatalogNames.has(name));
				selectedToolNames = this.filterReadOnlyToolNames(
					selectedToolNames,
					normalizedContextType
				);
				mode = 'default';
			}
		}

		selectedToolNames = this.ensureProjectCreationTool(
			selectedToolNames,
			normalizedContextType
		);

		const selectedSet = new Set(selectedToolNames);
		const addedTools = selectedToolNames.filter((name) => !defaultSet.has(name));
		const removedTools = defaultToolNames.filter((name) => !selectedSet.has(name));

		const tools = extractTools(selectedToolNames);

		this.logSelectionSummary({
			contextType: normalizedContextType,
			mode,
			defaultToolNames,
			selectedToolNames,
			addedTools,
			removedTools,
			strategy: analysis.primary_strategy
		});

		return {
			tools,
			analysis,
			metadata: {
				mode,
				defaultToolNames,
				selectedToolNames,
				addedTools,
				removedTools,
				strategy: analysis.primary_strategy,
				confidence: analysis.confidence
			}
		};
	}

	private logSelectionSummary(params: {
		contextType: ChatContextType;
		mode: ToolSelectionMode;
		defaultToolNames: string[];
		selectedToolNames: string[];
		addedTools: string[];
		removedTools: string[];
		strategy: StrategyAnalysis['primary_strategy'];
	}): void {
		const {
			contextType,
			mode,
			defaultToolNames,
			selectedToolNames,
			addedTools,
			removedTools,
			strategy
		} = params;
		const selectedWriteCount = selectedToolNames.filter((name) => isWriteToolName(name)).length;
		const removedWriteCount = removedTools.filter((name) => isWriteToolName(name)).length;

		logger.debug('Tool selection result', {
			contextType,
			mode,
			strategy,
			defaultCount: defaultToolNames.length,
			selectedCount: selectedToolNames.length,
			addedCount: addedTools.length,
			removedCount: removedTools.length,
			selectedWriteCount,
			removedWriteCount
		});

		if (defaultToolNames.length >= 20 && selectedToolNames.length <= 4) {
			logger.info('Tool selection heavily reduced', {
				contextType,
				mode,
				strategy,
				defaultCount: defaultToolNames.length,
				selectedCount: selectedToolNames.length,
				selectedTools: selectedToolNames.slice(0, 8),
				selectedWriteCount,
				removedWriteCount
			});
		}
	}

	private normalizeToolNames(names: string[], allowed: Set<string>): string[] {
		const normalized: string[] = [];
		const seen = new Set<string>();
		const lookup = new Map<string, string>();
		for (const name of allowed) {
			lookup.set(name.toLowerCase(), name);
		}
		for (const name of names) {
			if (typeof name !== 'string') continue;
			const trimmed = name.trim();
			if (!trimmed) continue;
			const canonical = lookup.get(trimmed.toLowerCase());
			if (!canonical || seen.has(canonical)) continue;
			seen.add(canonical);
			normalized.push(canonical);
		}
		return normalized;
	}

	private ensureProjectCreationTool(names: string[], contextType: ChatContextType): string[] {
		if (contextType !== 'project_create') {
			return names;
		}
		if (!names.includes('create_onto_project')) {
			return [...names, 'create_onto_project'];
		}
		return names;
	}

	private isReadOnlyContext(contextType: ChatContextType): boolean {
		return contextType === 'project_audit' || contextType === 'project_forecast';
	}

	private applyReadOnlyContextFilter(
		tools: ChatToolDefinition[],
		contextType: ChatContextType
	): ChatToolDefinition[] {
		if (!this.isReadOnlyContext(contextType)) {
			return tools;
		}
		return tools.filter((tool) => !isWriteToolName(resolveToolName(tool)));
	}

	private filterReadOnlyToolNames(names: string[], contextType: ChatContextType): string[] {
		if (!this.isReadOnlyContext(contextType)) {
			return names;
		}
		return names.filter((name) => !isWriteToolName(name));
	}

	private buildDefaultAnalysis(strategy: ChatStrategy, reasoning: string): StrategyAnalysis {
		return {
			primary_strategy: strategy,
			confidence: 0.4,
			reasoning,
			needs_clarification: false,
			estimated_steps: 0,
			required_tools: [],
			can_complete_directly: false
		};
	}

	private filterExternalTools(names: string[], message: string): string[] {
		const needsWebSearch =
			/\b(search|research|look up|find online|web|internet|latest|current|news)\b/i.test(
				message
			);
		const needsBuildosDocs = /\b(buildos|usage|guide|docs|documentation|help|how does)\b/i.test(
			message
		);

		return names.filter((name) => {
			if (name === 'web_search' && !needsWebSearch) return false;
			if (
				(name === 'get_buildos_overview' || name === 'get_buildos_usage_guide') &&
				!needsBuildosDocs
			) {
				return false;
			}
			return true;
		});
	}
}
