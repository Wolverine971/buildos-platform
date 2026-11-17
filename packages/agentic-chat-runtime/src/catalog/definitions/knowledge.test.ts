// packages/agentic-chat-runtime/src/catalog/definitions/knowledge.test.ts
//
// Personal knowledge graph tools (tasker 160). The catalog copies the knowledge vocabulary so it
// stays import-free; this test pins every copy to the shared core, and checks the limits the
// tool schemas promise match the gateway runners that enforce them.
import { describe, expect, it } from 'vitest';
import {
	KNOWLEDGE_KINDS,
	KNOWLEDGE_PREDICATES,
	type KnowledgeKeyType,
	type KnowledgeSourceType
} from '@buildos/shared-agent-ops/knowledge';
import {
	KNOWLEDGE_ENRICH_INSTRUCTIONS_MAX,
	KNOWLEDGE_ENRICH_MAX_ENTITIES,
	KNOWLEDGE_QUERY_LIMIT_DEFAULT,
	KNOWLEDGE_QUERY_LIMIT_MAX,
	KNOWLEDGE_RECORD_MAX_ENTITIES,
	KNOWLEDGE_RECORD_MAX_FACTS,
	KNOWLEDGE_RECORD_MAX_SOURCES,
	KNOWLEDGE_SEARCH_LIMIT_DEFAULT,
	KNOWLEDGE_SEARCH_LIMIT_MAX,
	KNOWLEDGE_TOOL_SOURCE_TYPES as GATEWAY_SOURCE_TYPES
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import {
	KNOWLEDGE_TOOL_DEFINITIONS,
	KNOWLEDGE_TOOL_KEY_TYPES,
	KNOWLEDGE_TOOL_KINDS,
	KNOWLEDGE_TOOL_PREDICATES,
	KNOWLEDGE_TOOL_RELATIONSHIP_PREDICATES,
	KNOWLEDGE_TOOL_SOURCE_TYPES
} from './knowledge';
import { CHAT_TOOL_DEFINITIONS } from './index';
import { TOOL_METADATA } from '../metadata';
import { getToolRegistry } from '../registry';

const NAMES = [
	'search_knowledge',
	'get_knowledge_entity',
	'query_knowledge',
	'record_knowledge',
	'enrich_knowledge'
];

function params(name: string): Record<string, any> {
	return KNOWLEDGE_TOOL_DEFINITIONS.find((tool) => tool.function.name === name)!.function
		.parameters as Record<string, any>;
}

describe('knowledge tool catalog', () => {
	it('copies the shared knowledge vocabulary exactly', () => {
		expect([...KNOWLEDGE_TOOL_KINDS]).toEqual([...KNOWLEDGE_KINDS]);
		expect([...KNOWLEDGE_TOOL_PREDICATES]).toEqual(KNOWLEDGE_PREDICATES.map((def) => def.key));
		expect([...KNOWLEDGE_TOOL_RELATIONSHIP_PREDICATES]).toEqual(
			KNOWLEDGE_PREDICATES.filter((def) => def.valueType === 'entity').map((def) => def.key)
		);
		expect([...KNOWLEDGE_TOOL_SOURCE_TYPES]).toEqual([...GATEWAY_SOURCE_TYPES]);
		// Type-level pins: a renamed key or source type fails to compile here.
		const keyTypes: readonly KnowledgeKeyType[] = KNOWLEDGE_TOOL_KEY_TYPES;
		const sourceTypes: readonly KnowledgeSourceType[] = KNOWLEDGE_TOOL_SOURCE_TYPES;
		expect(keyTypes.length).toBeGreaterThan(0);
		expect(sourceTypes.length).toBeGreaterThan(0);
	});

	it('defines the five tools once, with metadata and knowledge.* ops', () => {
		expect(KNOWLEDGE_TOOL_DEFINITIONS.map((tool) => tool.function.name)).toEqual(NAMES);
		const catalogNames = CHAT_TOOL_DEFINITIONS.map((tool) => tool.function.name);
		const registry = getToolRegistry();
		for (const name of NAMES) {
			expect(
				catalogNames.filter((entry) => entry === name),
				name
			).toHaveLength(1);
			expect(TOOL_METADATA[name], name).toBeDefined();
			expect(registry.byToolName[name]?.op, name).toMatch(/^knowledge\./);
			// The graph is the user's, never a project: no tool takes a project id.
			expect(Object.keys(params(name).properties), name).not.toContain('project_id');
			expect(params(name).additionalProperties, name).toBe(false);
		}
		expect(TOOL_METADATA.record_knowledge!.category).toBe('write');
		expect(TOOL_METADATA.enrich_knowledge!.category).toBe('write');
		expect(registry.byToolName.record_knowledge!.kind).toBe('write');
		expect(registry.byToolName.query_knowledge!.kind).toBe('read');
	});

	it('promises the limits the gateway enforces', () => {
		const search = params('search_knowledge').properties;
		expect(search.limit.maximum).toBe(KNOWLEDGE_SEARCH_LIMIT_MAX);
		expect(search.limit.default).toBe(KNOWLEDGE_SEARCH_LIMIT_DEFAULT);
		const query = params('query_knowledge').properties;
		expect(query.limit.maximum).toBe(KNOWLEDGE_QUERY_LIMIT_MAX);
		expect(query.limit.default).toBe(KNOWLEDGE_QUERY_LIMIT_DEFAULT);
		expect(query.follow.maxItems).toBe(2);
		const record = params('record_knowledge').properties;
		expect(record.entities.maxItems).toBe(KNOWLEDGE_RECORD_MAX_ENTITIES);
		expect(record.facts.maxItems).toBe(KNOWLEDGE_RECORD_MAX_FACTS);
		expect(record.sources.maxItems).toBe(KNOWLEDGE_RECORD_MAX_SOURCES);
		expect(record).not.toHaveProperty('links');
		const enrich = params('enrich_knowledge').properties;
		expect(enrich.entity_ids.maxItems).toBe(KNOWLEDGE_ENRICH_MAX_ENTITIES);
		expect(enrich.instructions.maxLength).toBe(KNOWLEDGE_ENRICH_INSTRUCTIONS_MAX);
	});
});
