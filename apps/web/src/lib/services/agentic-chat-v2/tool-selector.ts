// apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import {
	getGatewaySurfaceForContextType,
	getGatewaySurfaceForProfile,
	materializeGatewayTools,
	resolveGatewaySurfaceProfileForContextType,
	type GatewaySurfaceProfileName
} from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { type FastChatTurnIntent } from './turn-intent';
import { looksLikeWebResearchTurn } from '$lib/services/agentic-chat-lite/prompt/situational-rules';
import {
	LIVING_REFERENCE_MODE,
	type AgentWorkspaceMetadata
} from '$lib/services/agentic-chat/project-domain-profiles';

export type LivingWorkspaceToolSelection = {
	tools: ChatToolDefinition[];
	implicitCapture: boolean;
	commissionedWriteMinimumCount: number;
};

/**
 * A living-reference project always exposes the document tools its standing
 * agreement may require. Whether the current message actually commissions a
 * capture is decided by the semantic disposition gate, not by message regex.
 */
export function applyLivingWorkspaceToolProfile(params: {
	tools: ChatToolDefinition[];
	workspace: AgentWorkspaceMetadata | null | undefined;
	latestUserMessage?: string | null;
	turnIntent?: FastChatTurnIntent | null;
}): LivingWorkspaceToolSelection {
	if (params.workspace?.mode !== LIVING_REFERENCE_MODE) {
		return {
			tools: params.tools,
			implicitCapture: false,
			commissionedWriteMinimumCount: 0
		};
	}
	const materialized = materializeGatewayTools(params.tools, [
		'create_onto_document',
		'update_onto_document'
	]).tools;
	return {
		tools: materialized,
		implicitCapture: false,
		commissionedWriteMinimumCount: 0
	};
}

export function selectFastChatTools(params: {
	contextType: ChatContextType;
	surfaceProfile?: GatewaySurfaceProfileName;
	latestUserMessage?: string | null;
	turnIntent?: FastChatTurnIntent | null;
	leanDiscovery?: boolean;
	allowLegacySurfaceFallback?: boolean;
}): ChatToolDefinition[] {
	let tools: ChatToolDefinition[];
	if (params.surfaceProfile) {
		tools = getGatewaySurfaceForProfile(params.surfaceProfile, {
			leanDiscovery: params.leanDiscovery
		});
	} else {
		const routedProfile = resolveFastChatSurfaceProfileForTurn({
			contextType: params.contextType,
			latestUserMessage: params.latestUserMessage,
			turnIntent: params.turnIntent,
			allowLegacySurfaceFallback: params.allowLegacySurfaceFallback
		});
		tools = routedProfile
			? getGatewaySurfaceForProfile(routedProfile, {
					leanDiscovery: params.leanDiscovery
				})
			: getGatewaySurfaceForContextType(params.contextType, {
					leanDiscovery: params.leanDiscovery
				});
	}
	// Do not let an explicit broader profile or message-shape enrichment expand
	// the bounded project-create surface. It admits only semantic controls plus
	// shell/goal/task creation; pasted source material can contain research,
	// delegation, or relationship language without commissioning those tools.
	if (params.contextType === 'project_create') {
		return getGatewaySurfaceForProfile('project_create_minimal');
	}
	const crossProjectTools = looksLikeCrossProjectTaskMove(
		params.contextType,
		[
			params.latestUserMessage,
			params.turnIntent?.source === 'pending_continuation'
				? params.turnIntent.originalRequestText
				: null
		]
			.filter(
				(value): value is string => typeof value === 'string' && value.trim().length > 0
			)
			.join('\n')
	)
		? ['move_onto_task']
		: [];
	const delegatedResearchTools = looksLikeDelegatedResearchTurn(
		[
			params.latestUserMessage,
			params.turnIntent?.source === 'pending_continuation'
				? params.turnIntent.originalRequestText
				: null
		]
			.filter(
				(value): value is string => typeof value === 'string' && value.trim().length > 0
			)
			.join('\n')
	)
		? ['delegate_task']
		: [];
	// tasker/39 stage 3: turns that plainly ask for web research get web tools
	// at launch (and with them the situational research rules), instead of
	// spending a discovery round finding web_search first.
	const webResearchTools = looksLikeWebResearchTurn(params.latestUserMessage)
		? ['web_search', 'web_visit']
		: [];
	return materializeGatewayTools(tools, [
		...crossProjectTools,
		...delegatedResearchTools,
		...webResearchTools
	]).tools;
}

export function resolveFastChatSurfaceProfileForTurn(params: {
	contextType: ChatContextType;
	latestUserMessage?: string | null;
	turnIntent?: FastChatTurnIntent | null;
	allowLegacySurfaceFallback?: boolean;
}): GatewaySurfaceProfileName {
	// Project turns always receive the same common read/write capability bundle.
	// The model's tool call is the semantic decision; lexical intent inference is
	// retained elsewhere for telemetry and compatibility, not tool authority.
	if (params.contextType === 'project' || params.contextType === 'ontology') {
		return 'project_write_document';
	}
	return resolveGatewaySurfaceProfileForContextType(params.contextType);
}

function looksLikeCrossProjectTaskMove(
	contextType: ChatContextType,
	latestUserMessage?: string | null
): boolean {
	if (contextType !== 'project' && contextType !== 'ontology' && contextType !== 'global') {
		return false;
	}
	const text = latestUserMessage?.trim() ?? '';
	if (!text || !/\b(?:task|todo|item)\b/i.test(text)) return false;

	return (
		/\bwrong\s+project\b/i.test(text) ||
		/\b(?:move|moves|moved|moving|transfer|transfers|transferred|transferring|relocate|relocates|relocated|relocating)\b[\s\S]{0,100}\b(?:task|todo|item)\b[\s\S]{0,120}\b(?:to|into|between|another|different)\b[\s\S]{0,60}\bprojects?\b/i.test(
			text
		) ||
		/\b(?:task|todo|item)\b[\s\S]{0,100}\b(?:move|moves|moved|moving|transfer|transfers|transferred|transferring|relocate|relocates|relocated|relocating)\b[\s\S]{0,120}\b(?:to|into|between|another|different)\b[\s\S]{0,60}\bprojects?\b/i.test(
			text
		)
	);
}

function looksLikeDelegatedResearchTurn(latestUserMessage?: string | null): boolean {
	const text = latestUserMessage?.trim() ?? '';
	if (!text) return false;
	return (
		/\bdeep[-\s]?research\b/i.test(text) ||
		/\b(?:delegate|delegation|sub-?agents?|background agent|research swarm)\b/i.test(text) ||
		/\b(?:research|investigate|analy[sz]e)\b[\s\S]{0,100}\b(?:in the background|take your time|get back to me|report back)\b/i.test(
			text
		)
	);
}
