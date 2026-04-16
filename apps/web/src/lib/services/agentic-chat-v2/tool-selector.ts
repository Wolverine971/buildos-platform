// apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import {
	getGatewaySurfaceForContextType,
	getGatewaySurfaceForProfile,
	type GatewaySurfaceProfileName
} from '$lib/services/agentic-chat/tools/core/gateway-surface';

export function selectFastChatTools(params: {
	contextType: ChatContextType;
	surfaceProfile?: GatewaySurfaceProfileName;
	latestUserMessage?: string | null;
}): ChatToolDefinition[] {
	if (params.surfaceProfile) {
		return getGatewaySurfaceForProfile(params.surfaceProfile);
	}
	const routedProfile = resolveSurfaceProfileForTurn(
		params.contextType,
		params.latestUserMessage
	);
	if (routedProfile) {
		return getGatewaySurfaceForProfile(routedProfile);
	}
	return getGatewaySurfaceForContextType(params.contextType);
}

function resolveSurfaceProfileForTurn(
	contextType: ChatContextType,
	latestUserMessage?: string | null
): GatewaySurfaceProfileName | null {
	if (contextType !== 'project' && contextType !== 'ontology') {
		return null;
	}

	const text = latestUserMessage?.trim().toLowerCase() ?? '';
	if (!text) return null;

	if (looksLikeProjectDocumentWriteTurn(text)) {
		return 'project_document';
	}
	if (looksLikeProjectMutationTurn(text)) {
		return 'project_write';
	}

	return null;
}

function looksLikeProjectDocumentWriteTurn(text: string): boolean {
	return /\b(?:append|capture|save|add|create|update|revise|draft|write|organize|move)\b[\s\S]{0,80}\b(?:document|doc|notes?|research|outline|brief|context|summary|log|chapter|scene)\b/i.test(
		text
	);
}

function looksLikeProjectMutationTurn(text: string): boolean {
	return /\b(?:finished|complete|completed|done|progress|update|updated|add|create|capture|save|todo|task|revise|draft|wrote|mark|marked|move|blocked|in progress)\b/i.test(
		text
	);
}
