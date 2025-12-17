// apps/web/src/lib/services/agentic-chat/tools/core/definitions/index.ts
/**
 * Tool Definitions Index
 *
 * Central export point for all tool definitions.
 * Combines ontology read, write, and utility tools into a single array.
 */

import type { ChatToolDefinition } from '@buildos/shared-types';

// Types
export type { FieldInfo, ToolContextScope, ToolMetadata } from './types';

// Field metadata
export { ENTITY_FIELD_INFO } from './field-metadata';

// Tool metadata
export { TOOL_METADATA } from './tool-metadata';

// Individual tool definition arrays (for selective imports)
export { ONTOLOGY_READ_TOOLS } from './ontology-read';
export { ONTOLOGY_WRITE_TOOLS } from './ontology-write';
export { UTILITY_TOOL_DEFINITIONS } from './utility';

// Import for combination
import { ONTOLOGY_READ_TOOLS } from './ontology-read';
import { ONTOLOGY_WRITE_TOOLS } from './ontology-write';
import { UTILITY_TOOL_DEFINITIONS } from './utility';

/**
 * Complete set of tools available to the chat system.
 * Tools are organized by category for the progressive disclosure pattern.
 */
export const CHAT_TOOL_DEFINITIONS: ChatToolDefinition[] = [
	...ONTOLOGY_READ_TOOLS,
	...ONTOLOGY_WRITE_TOOLS,
	...UTILITY_TOOL_DEFINITIONS
];
