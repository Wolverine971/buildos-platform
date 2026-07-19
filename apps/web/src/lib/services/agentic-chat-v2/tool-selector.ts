// apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import {
	getGatewaySurfaceForContextType,
	getGatewaySurfaceForProfile,
	materializeGatewayTools,
	resolveGatewaySurfaceProfileForContextType,
	type GatewaySurfaceProfileName
} from '$lib/services/agentic-chat/tools/core/gateway-surface';
import {
	getAutonomousWriteToolNamesForTurnIntent,
	getWriteToolNamesForTurnIntent,
	type FastChatTurnIntent
} from './turn-intent';

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
	const autonomousWriteTools = params.turnIntent
		? getAutonomousWriteToolNamesForTurnIntent(params.turnIntent)
		: [];
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
	return materializeGatewayTools(tools, [
		...autonomousWriteTools,
		...crossProjectTools,
		...delegatedResearchTools
	]).tools;
}

export function resolveFastChatSurfaceProfileForTurn(params: {
	contextType: ChatContextType;
	latestUserMessage?: string | null;
	turnIntent?: FastChatTurnIntent | null;
	allowLegacySurfaceFallback?: boolean;
}): GatewaySurfaceProfileName {
	const intentProfile = resolveSurfaceProfileForTurnIntent(params.contextType, params.turnIntent);
	if (intentProfile) return intentProfile;
	const routedProfile =
		params.allowLegacySurfaceFallback === false
			? null
			: resolveProjectSurfaceProfileForTurn(params.contextType, params.latestUserMessage);
	return routedProfile ?? resolveGatewaySurfaceProfileForContextType(params.contextType);
}

function resolveSurfaceProfileForTurnIntent(
	contextType: ChatContextType,
	turnIntent?: FastChatTurnIntent | null
): GatewaySurfaceProfileName | null {
	if (!turnIntent?.requiresWrite) return null;
	if (contextType === 'project_create') return 'project_create_minimal';
	if (contextType !== 'project' && contextType !== 'ontology') return null;
	const expectedWriteTools = getWriteToolNamesForTurnIntent(turnIntent);
	const hasDocumentOperation = expectedWriteTools.some((name) => name.includes('document'));
	const hasNonDocumentOperation = expectedWriteTools.some((name) => !name.includes('document'));
	if (hasDocumentOperation && hasNonDocumentOperation) return 'project_write_document';
	if (hasDocumentOperation) return 'project_document';
	if (
		expectedWriteTools.length > 0 &&
		expectedWriteTools.every((name) => name.includes('calendar_event'))
	) {
		return 'project_calendar';
	}
	return 'project_write';
}

function resolveProjectSurfaceProfileForTurn(
	contextType: ChatContextType,
	latestUserMessage?: string | null
): GatewaySurfaceProfileName | null {
	if (contextType !== 'project' && contextType !== 'ontology') {
		return null;
	}

	const text = latestUserMessage?.trim().toLowerCase() ?? '';
	if (!text) return null;

	const documentWriteTurn = looksLikeProjectDocumentWriteTurn(text);
	const mutationTurn = looksLikeProjectMutationTurn(text);

	// Mixed turns (e.g. "Chapter 2 complete — draft chapter 3 and save progress
	// notes") need both task writes and document workspace tools. Neither single
	// surface covers that, so prior runs fell back to tool_search for the
	// missing half. Route to the union surface instead.
	if (documentWriteTurn && mutationTurn) {
		return 'project_write_document';
	}
	if (documentWriteTurn) {
		return 'project_document';
	}
	if (mutationTurn) {
		return 'project_write';
	}

	return null;
}

function looksLikeProjectDocumentWriteTurn(text: string): boolean {
	return /\b(?:append|capture|save|add|create|make|build|update|revise|draft|write|organize|move)\b[\s\S]{0,80}\b(?:document|doc|notes?|research|outline|brief|context|summary|log|chapter|scene)\b/i.test(
		text
	);
}

function looksLikeProjectMutationTurn(text: string): boolean {
	return /\b(?:finished|complete|completed|done|progress|update|updated|add|create|capture|save|todo|task|revise|draft|wrote|mark|marked|move|blocked|in progress)\b/i.test(
		text
	);
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
