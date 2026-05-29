// apps/web/src/lib/services/agentic-chat-v2/tool-project-id.ts
/**
 * Project-id injection helpers for the FastChat v2 stream route.
 *
 * Pure functions — no logging, no IO. They decide whether a tool requires a
 * `project_id` argument and, when the turn is scoped to a project, inject it
 * into outgoing tool calls that omitted it. Extracted from the route file so
 * the orchestration spine stays focused on flow.
 */

import type { ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';
import { extractTools } from '$lib/services/agentic-chat/tools/core/tools.config';

export function toolDefinitionRequiresProjectId(tool: ChatToolDefinition | undefined): boolean {
	if (!tool) return false;
	const params = tool.function?.parameters as
		| { required?: string[]; properties?: Record<string, unknown> }
		| undefined;
	const requiredParams = Array.isArray(params?.required) ? params?.required : [];
	return requiredParams.includes('project_id');
}

export function getToolsRequiringProjectId(tools: ChatToolDefinition[]): Set<string> {
	const required = new Set<string>();
	for (const tool of tools) {
		const name = tool.function?.name;
		if (!name) continue;
		if (toolDefinitionRequiresProjectId(tool)) {
			required.add(name);
		}
	}
	return required;
}

export function toolCallRequiresProjectId(
	toolName: string,
	toolsRequiringProjectId: Set<string>
): boolean {
	if (toolsRequiringProjectId.has(toolName)) return true;
	return toolDefinitionRequiresProjectId(extractTools([toolName])[0]);
}

export function maybeInjectProjectId(
	toolCall: ChatToolCall,
	projectId: string | undefined,
	toolsRequiringProjectId: Set<string>
): ChatToolCall {
	if (!projectId) return toolCall;
	if (!toolCallRequiresProjectId(toolCall.function.name, toolsRequiringProjectId)) {
		return toolCall;
	}

	let args: Record<string, unknown> = {};
	const rawArgs = toolCall.function.arguments;
	if (rawArgs) {
		try {
			args = JSON.parse(rawArgs);
		} catch {
			return toolCall;
		}
	}

	const existing =
		typeof (args as Record<string, unknown>).project_id === 'string'
			? String((args as Record<string, unknown>).project_id).trim()
			: '';
	if (existing) return toolCall;

	return {
		...toolCall,
		function: {
			...toolCall.function,
			arguments: JSON.stringify({ ...args, project_id: projectId })
		}
	};
}
