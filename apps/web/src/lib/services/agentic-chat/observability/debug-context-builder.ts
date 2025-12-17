// apps/web/src/lib/services/agentic-chat/observability/debug-context-builder.ts
/**
 * Debug Context Builder
 *
 * Builds observability information for debugging the agentic chat flow.
 * This allows developers to see the full context (prompts, tools, data)
 * for any chat session.
 */

import type { PlannerContext, DebugContextInfo } from '../shared/types';
import type { ProjectFocus, OntologyContext } from '$lib/types/agent-chat-enhancement';
import { getToolCategory } from '../tools/core/tools.config';

/**
 * Simple token estimation (approx 4 chars per token)
 */
function estimateTokens(text: string): number {
	if (!text) return 0;
	return Math.ceil(text.length / 4);
}

/**
 * Build debug context info from planner context.
 *
 * @param plannerContext - The built planner context
 * @param requestId - Unique request identifier
 * @param projectFocus - Optional project focus
 * @param ontologyContext - Optional raw ontology context
 * @returns Debug context info for streaming
 */
export function buildDebugContextInfo(params: {
	plannerContext: PlannerContext;
	requestId: string;
	projectFocus?: ProjectFocus | null;
	ontologyContext?: OntologyContext;
}): DebugContextInfo {
	const { plannerContext, requestId, projectFocus, ontologyContext } = params;

	// Calculate token counts
	const systemPromptTokens = estimateTokens(plannerContext.systemPrompt);
	const locationContextTokens = estimateTokens(plannerContext.locationContext);

	// Calculate tools tokens (rough estimate from JSON)
	const toolsJson = JSON.stringify(plannerContext.availableTools);
	const toolsTokens = estimateTokens(toolsJson);

	// Calculate conversation tokens
	const conversationTokens = plannerContext.conversationHistory.reduce((sum, msg) => {
		return sum + estimateTokens(typeof msg.content === 'string' ? msg.content : '');
	}, 0);

	// Build available tools list with categories
	const availableTools = plannerContext.availableTools.map((tool) => {
		const name = (tool as any).function?.name || (tool as any).name || 'unknown';
		const category = getToolCategory(name);
		return {
			name,
			category: category ?? undefined // Convert null to undefined for type compatibility
		};
	});

	// Build ontology snapshot
	let ontologySnapshot: DebugContextInfo['ontologySnapshot'];
	if (ontologyContext) {
		const metadata = ontologyContext.metadata || {};
		// entity_count is a Record<string, number>, not individual *_count fields
		const entityCount = metadata.entity_count || {};
		ontologySnapshot = {
			type: ontologyContext.type || 'unknown',
			entityCounts: {
				projects:
					entityCount.projects ?? entityCount.project ?? metadata.total_projects ?? 0,
				tasks: entityCount.tasks ?? entityCount.task ?? 0,
				goals: entityCount.goals ?? entityCount.goal ?? 0,
				plans: entityCount.plans ?? entityCount.plan ?? 0,
				documents: entityCount.documents ?? entityCount.document ?? 0
			}
		};

		// Add focus entity if present
		if (plannerContext.locationMetadata?.focusedEntityId) {
			ontologySnapshot.focusEntity = {
				type: plannerContext.locationMetadata.focusedEntityType || 'unknown',
				id: plannerContext.locationMetadata.focusedEntityId,
				name: plannerContext.locationMetadata.focusedEntityName || 'Unknown'
			};
		}
	}

	// Build project focus info
	let projectFocusInfo: DebugContextInfo['projectFocus'];
	if (projectFocus) {
		projectFocusInfo = {
			projectId: projectFocus.projectId,
			projectName: projectFocus.projectName,
			focusType: projectFocus.focusType,
			entityId: projectFocus.focusEntityId ?? undefined // Convert null to undefined for type compatibility
		};
	}

	const totalTokens =
		systemPromptTokens + locationContextTokens + toolsTokens + conversationTokens;

	return {
		requestId,
		timestamp: new Date().toISOString(),
		contextType: plannerContext.metadata.contextType,
		systemPrompt: plannerContext.systemPrompt,
		systemPromptTokens,
		locationContext: plannerContext.locationContext,
		locationContextTokens,
		availableTools,
		toolsTokens,
		ontologySnapshot,
		conversationTokens,
		totalTokens,
		projectFocus: projectFocusInfo
	};
}

/**
 * Check if debug mode is enabled.
 * Controlled by environment variable.
 */
export function isDebugModeEnabled(): boolean {
	// Check for debug flag in various places
	if (typeof process !== 'undefined') {
		return (
			process.env.DEBUG_AGENT_CONTEXT === 'true' ||
			process.env.VITE_DEBUG_AGENT_CONTEXT === 'true'
		);
	}
	return false;
}
