// apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import { getGatewaySurfaceForContextType } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import {
	getToolsForContextType,
	resolveToolName
} from '$lib/services/agentic-chat/tools/core/tools.config';
import { isToolGatewayEnabled } from '$lib/services/agentic-chat/tools/registry/gateway-config';
import { normalizeFastContextType } from './prompt-builder';

const PROJECT_CALENDAR_TOOL_NAMES = new Set(['get_project_calendar', 'set_project_calendar']);

function isProjectContext(contextType: ChatContextType): boolean {
	return (
		contextType === 'project' ||
		contextType === 'project_audit' ||
		contextType === 'project_forecast' ||
		contextType === 'ontology'
	);
}

function isCalendarContext(contextType: ChatContextType): boolean {
	return contextType === 'calendar';
}

export function selectFastChatTools(params: {
	contextType: ChatContextType;
}): ChatToolDefinition[] {
	if (isToolGatewayEnabled()) {
		return getGatewaySurfaceForContextType(params.contextType);
	}

	const normalized = normalizeFastContextType(params.contextType);
	let tools = getToolsForContextType(normalized as Exclude<ChatContextType, 'general'>, {
		includeWriteTools: true
	});

	// Broad contexts inherit project tools from shared config, but project calendar mapping
	// only makes sense when the agent is already operating in a project or calendar scope.
	if (!isProjectContext(normalized) && !isCalendarContext(normalized)) {
		tools = tools.filter((tool) => !PROJECT_CALENDAR_TOOL_NAMES.has(resolveToolName(tool)));
	}

	return tools;
}
