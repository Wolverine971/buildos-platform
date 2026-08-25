// apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import {
	getGatewaySurfaceForContextType,
	getGatewaySurfaceForProfile,
	materializeGatewayTools,
	resolveGatewaySurfaceProfileForContextType,
	type GatewaySurfaceProfileName,
	type ProjectCreateExecutionWorkflow
} from '@buildos/agentic-chat-runtime/catalog';
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
	projectCreateWorkflow?: ProjectCreateExecutionWorkflow;
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
	// either project-create lane. Web persists one compound ProjectSpec; the
	// reviewed worker admits semantic controls plus shell/goal/task creation.
	if (params.contextType === 'project_create') {
		return getGatewaySurfaceForProfile(
			params.projectCreateWorkflow === 'reviewed_shell'
				? 'project_create_minimal'
				: 'project_create_compound'
		);
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
	// External-account tools are intentionally legacy-only during the worker
	// cutover. Materialize them at launch when the request is explicit so worker
	// admission can deterministically renegotiate instead of accepting a turn
	// whose bounded tool surface cannot satisfy the request.
	const externalEmailReadTools = looksLikeExternalEmailReadTurn(params.latestUserMessage)
		? ['list_email_accounts', 'search_email_messages', 'get_email_message']
		: [];
	const externalCalendarTools = looksLikeExternalCalendarTurn(params.latestUserMessage)
		? ['list_calendar_events']
		: [];
	return materializeGatewayTools(tools, [
		...crossProjectTools,
		...delegatedResearchTools,
		...webResearchTools,
		...externalEmailReadTools,
		...externalCalendarTools
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

function looksLikeExternalEmailReadTurn(latestUserMessage?: string | null): boolean {
	const text = latestUserMessage?.trim() ?? '';
	if (!text) return false;
	if (/\b(?:gmail|inbox|mailbox)\b/i.test(text)) return true;
	if (!/\be-?mail(?:s|ed|ing)?\b/i.test(text)) return false;
	return /\b(?:account|connected|search|find|look|check|read|open|list|show|scan|message|inbox|what|who|when)\b/i.test(
		text
	);
}

function looksLikeExternalCalendarTurn(latestUserMessage?: string | null): boolean {
	const text = latestUserMessage?.trim() ?? '';
	if (!text) return false;
	if (/\bcalendar\b/i.test(text)) return true;
	return (
		/\b(?:event|appointment)\b/i.test(text) &&
		/\b(?:schedule|reschedule|move|create|update|cancel|delete|list|show|find|check|today|tomorrow|week|month)\b/i.test(
			text
		)
	);
}
