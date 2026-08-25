// packages/agentic-chat-runtime/src/catalog/types.ts
/**
 * Shared Types for Tool Definitions
 *
 * Types used across tool definition modules.
 */

import type { ToolContextScope } from '@buildos/shared-types';

export type { ToolContextScope } from '@buildos/shared-types';

/**
 * Field information for entity schema documentation
 */
export interface FieldInfo {
	type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'enum';
	description: string;
	required?: boolean;
	enum_values?: string[];
	example?: string;
}

/**
 * Metadata describing tool capabilities and usage
 */
export interface ToolMetadata {
	summary: string;
	capabilities: string[];
	contexts: ToolContextScope[];
	category: 'search' | 'read' | 'write' | 'utility';
	timeoutMs?: number;
	chatDiscovery?: 'visible' | 'hidden';
}
