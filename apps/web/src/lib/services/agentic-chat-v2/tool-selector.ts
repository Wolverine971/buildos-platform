// apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import { getGatewaySurfaceForContextType } from '$lib/services/agentic-chat/tools/core/gateway-surface';

export function selectFastChatTools(params: {
	contextType: ChatContextType;
}): ChatToolDefinition[] {
	return getGatewaySurfaceForContextType(params.contextType);
}
