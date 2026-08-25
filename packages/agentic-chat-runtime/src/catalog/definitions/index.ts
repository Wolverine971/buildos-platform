import type { ChatToolDefinition } from '@buildos/shared-types';
import { CALENDAR_TOOL_DEFINITIONS } from './calendar';
import {
	CANCEL_TURN_CONTRACT_TOOL_DEFINITION,
	DECLARE_READ_ONLY_TURN_TOOL_DEFINITION,
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
	TURN_CONTRACT_TOOL_DEFINITION
} from './controls';
import { GATEWAY_TOOL_DEFINITIONS } from './discovery';
import { EMAIL_TOOL_DEFINITIONS } from './email';
import { ONTOLOGY_READ_TOOLS } from './ontology-read';
import { ONTOLOGY_WRITE_TOOLS } from './ontology-write';
import { UTILITY_TOOL_DEFINITIONS } from './utility';

export * from './calendar';
export * from './controls';
export * from './discovery';
export * from './email';
export * from './ontology-read';
export * from './ontology-write';
export * from './utility';

/**
 * Canonical direct tools, preserving the legacy provider order exactly.
 * Discovery tools and semantic controls remain deliberately separate.
 */
export const CHAT_TOOL_DEFINITIONS: ChatToolDefinition[] = [
	...ONTOLOGY_READ_TOOLS,
	...ONTOLOGY_WRITE_TOOLS,
	...UTILITY_TOOL_DEFINITIONS,
	...CALENDAR_TOOL_DEFINITIONS,
	...EMAIL_TOOL_DEFINITIONS
];

export const AGENTIC_CHAT_TOOL_DEFINITIONS = CHAT_TOOL_DEFINITIONS;

/** Integrity-test vocabulary only; this is not an admitted provider surface. */
export const AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY: ChatToolDefinition[] = [
	...CHAT_TOOL_DEFINITIONS,
	...GATEWAY_TOOL_DEFINITIONS,
	TURN_CONTRACT_TOOL_DEFINITION,
	DECLARE_READ_ONLY_TURN_TOOL_DEFINITION,
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
	CANCEL_TURN_CONTRACT_TOOL_DEFINITION
];
