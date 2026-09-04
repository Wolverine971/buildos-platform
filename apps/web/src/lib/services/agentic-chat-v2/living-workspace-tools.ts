// apps/web/src/lib/services/agentic-chat-v2/living-workspace-tools.ts
//
// Split out of the deleted tool-selector.ts (one-engine stage S6, 2026-09-04).
// Launch surfaces are now stable per chat context; this is the one remaining
// per-turn surface adjustment, and it keys off persisted project configuration
// (a living-reference workspace), never off the user's message.
import type { ChatToolDefinition } from '@buildos/shared-types';
import { materializeGatewayTools } from '@buildos/agentic-chat-runtime/catalog';
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
