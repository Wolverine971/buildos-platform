// apps/web/src/lib/services/agentic-chat/tools/core/tool-definitions.ts
/**
 * Chat Tool Definitions
 *
 * Re-exports from the definitions/ subdirectory for backward compatibility.
 * New code should import directly from './definitions' or specific category files.
 *
 * @see ./definitions/index.ts - Main definitions index
 * @see ./definitions/ontology-read.ts - Read-only ontology tools
 * @see ./definitions/ontology-write.ts - Write/mutate ontology tools
 * @see ./definitions/utility.ts - Utility and external tools
 * @see ./definitions/field-metadata.ts - Entity field metadata
 * @see ./definitions/tool-metadata.ts - Tool capabilities metadata
 */

// Re-export everything for backward compatibility
export {
	// Types
	type FieldInfo,
	type ToolContextScope,
	type ToolMetadata,
	// Field metadata
	ENTITY_FIELD_INFO,
	// Tool metadata
	TOOL_METADATA,
	// Combined definitions array
	CHAT_TOOL_DEFINITIONS,
	// Individual arrays (for selective imports)
	ONTOLOGY_READ_TOOLS,
	ONTOLOGY_WRITE_TOOLS,
	UTILITY_TOOL_DEFINITIONS
} from './definitions';
