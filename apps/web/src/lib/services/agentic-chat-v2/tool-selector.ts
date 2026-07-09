// apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import {
	getGatewaySurfaceForContextType,
	getGatewaySurfaceForProfile,
	resolveGatewaySurfaceProfileForContextType,
	type GatewaySurfaceProfileName
} from '$lib/services/agentic-chat/tools/core/gateway-surface';
import type { FastChatTurnIntent } from './turn-intent';

export function selectFastChatTools(params: {
	contextType: ChatContextType;
	surfaceProfile?: GatewaySurfaceProfileName;
	latestUserMessage?: string | null;
	turnIntent?: FastChatTurnIntent | null;
}): ChatToolDefinition[] {
	if (params.surfaceProfile) {
		return getGatewaySurfaceForProfile(params.surfaceProfile);
	}
	const routedProfile = resolveFastChatSurfaceProfileForTurn({
		contextType: params.contextType,
		latestUserMessage: params.latestUserMessage,
		turnIntent: params.turnIntent
	});
	if (routedProfile) return getGatewaySurfaceForProfile(routedProfile);
	return getGatewaySurfaceForContextType(params.contextType);
}

export function resolveFastChatSurfaceProfileForTurn(params: {
	contextType: ChatContextType;
	latestUserMessage?: string | null;
	turnIntent?: FastChatTurnIntent | null;
}): GatewaySurfaceProfileName {
	const intentProfile = resolveSurfaceProfileForTurnIntent(params.contextType, params.turnIntent);
	if (intentProfile) return intentProfile;
	const routedProfile = resolveProjectSurfaceProfileForTurn(
		params.contextType,
		params.latestUserMessage
	);
	return routedProfile ?? resolveGatewaySurfaceProfileForContextType(params.contextType);
}

function resolveSurfaceProfileForTurnIntent(
	contextType: ChatContextType,
	turnIntent?: FastChatTurnIntent | null
): GatewaySurfaceProfileName | null {
	if (!turnIntent?.requiresWrite) return null;
	if (contextType === 'project_create') return 'project_create_minimal';
	if (contextType !== 'project' && contextType !== 'ontology') return null;
	if (turnIntent.entityKind === 'document') return 'project_document';
	if (turnIntent.entityKind === 'event') return 'project_calendar';
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
