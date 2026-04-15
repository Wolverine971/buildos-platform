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
}): ChatToolDefinition[] {
	if (params.surfaceProfile) {
		return getGatewaySurfaceForProfile(params.surfaceProfile);
	}
	return getGatewaySurfaceForContextType(params.contextType);
}
