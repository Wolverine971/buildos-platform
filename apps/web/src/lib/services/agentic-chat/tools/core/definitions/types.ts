// apps/web/src/lib/services/agentic-chat/tools/core/definitions/types.ts
/**
 * Shared Types for Tool Definitions
 *
 * Types used across tool definition modules.
 */

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
 * Context scopes for tool availability
 */
export type ToolContextScope =
	| 'base'
	| 'global'
	| 'project_create'
	| 'project'
	| 'project_audit'
	| 'project_forecast';

/**
 * Metadata describing tool capabilities and usage
 */
export interface ToolMetadata {
	summary: string;
	capabilities: string[];
	contexts: ToolContextScope[];
	category: 'search' | 'read' | 'write' | 'utility';
	timeoutMs?: number;
}
