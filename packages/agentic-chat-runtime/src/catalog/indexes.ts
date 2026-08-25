// packages/agentic-chat-runtime/src/catalog/indexes.ts
/** Immutable indexes over the canonical direct-tool vocabulary. */

import type { ChatToolDefinition } from '@buildos/shared-types';
import { CHAT_TOOL_DEFINITIONS } from './definitions';

const TOOL_DEFINITION_MAP = new Map(
	CHAT_TOOL_DEFINITIONS.map((tool) => [tool.function.name, tool])
);

export function extractTools(names: readonly string[]): ChatToolDefinition[] {
	return names
		.map((name) => TOOL_DEFINITION_MAP.get(name))
		.filter((tool): tool is ChatToolDefinition => Boolean(tool));
}

/** Handles canonical function names plus the legacy direct-name shape. */
export function resolveToolName(tool: ChatToolDefinition | null | undefined): string {
	if (!tool) return 'unknown';
	const functionName = tool.function?.name;
	if (typeof functionName === 'string' && functionName.trim().length > 0) {
		return functionName.trim();
	}

	const legacyName = (tool as unknown as { name?: unknown }).name;
	if (typeof legacyName === 'string' && legacyName.trim().length > 0) {
		return legacyName.trim();
	}
	return 'unknown';
}

export function extractToolNamesFromDefinitions(tools: readonly ChatToolDefinition[]): string[] {
	const names = new Set<string>();
	for (const tool of tools) {
		const name = resolveToolName(tool);
		if (name !== 'unknown') names.add(name);
	}
	return Array.from(names);
}
