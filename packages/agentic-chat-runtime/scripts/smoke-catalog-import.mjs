// packages/agentic-chat-runtime/scripts/smoke-catalog-import.mjs
import assert from 'node:assert/strict';
import * as catalog from '@buildos/agentic-chat-runtime/catalog';

assert.ok(catalog.CHAT_TOOL_DEFINITIONS.length > 0);
assert.strictEqual(catalog.AGENTIC_CHAT_TOOL_DEFINITIONS, catalog.CHAT_TOOL_DEFINITIONS);
assert.deepEqual(
	catalog.AGENTIC_CHAT_STANDARD_CONTROL_TOOL_DEFINITIONS_V1.map(
		(definition) => definition.function.name
	),
	[...catalog.AGENTIC_CHAT_STANDARD_CONTROL_TOOL_NAMES_V1]
);
assert.equal(
	catalog.AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY.length,
	catalog.CHAT_TOOL_DEFINITIONS.length +
		catalog.GATEWAY_TOOL_DEFINITIONS.length +
		catalog.AGENTIC_CHAT_STANDARD_CONTROL_TOOL_DEFINITIONS_V1.length
);
assert.ok(Object.keys(catalog.TOOL_METADATA).length > 0);
