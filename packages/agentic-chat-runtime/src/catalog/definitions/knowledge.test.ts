// packages/agentic-chat-runtime/src/catalog/definitions/knowledge.test.ts
//
// Personal knowledge graph tools (tasker 160). The catalog copies the knowledge vocabulary so it
// stays import-free; this test pins every copy to the shared core, and checks the limits the
// tool schemas promise match the gateway runners that enforce them.
import { describe, expect, it } from 'vitest';
import {
	KNOWLEDGE_CONNECTION_EMPLOYMENT,
	KNOWLEDGE_CONNECTION_FACETS,
	KNOWLEDGE_CONNECTION_MAX_TERMS,
	KNOWLEDGE_CONNECTION_PLACE_OF,
	KNOWLEDGE_CONNECTION_RECORD_KINDS,
	KNOWLEDGE_KINDS,
	KNOWLEDGE_PREDICATES,
	type KnowledgeKeyType,
	type KnowledgeSourceType
} from '@buildos/shared-agent-ops/knowledge';
import {
	KNOWLEDGE_CONNECTION_WHERE_KEYS,
	KNOWLEDGE_ENRICH_INSTRUCTIONS_MAX,
	KNOWLEDGE_ENRICH_MAX_ENTITIES,
	KNOWLEDGE_LENS_RECORD_LIMIT,
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
/** Knowledge in shared projects (tasker 168): project-scoped by design. */
const SHARED_PROJECT_NAMES = ['get_project_knowledge_lens', 'request_knowledge_access'];

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

	it('defines the seven tools once, with metadata and knowledge.* ops', () => {
		expect(KNOWLEDGE_TOOL_DEFINITIONS.map((tool) => tool.function.name)).toEqual([
			...NAMES,
			...SHARED_PROJECT_NAMES
		]);
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

	it("scopes the shared-project tools to one project and labels them as other members' notes", () => {
		const catalogNames = CHAT_TOOL_DEFINITIONS.map((tool) => tool.function.name);
		const registry = getToolRegistry();
		for (const name of SHARED_PROJECT_NAMES) {
			expect(
				catalogNames.filter((entry) => entry === name),
				name
			).toHaveLength(1);
			expect(params(name).required, name).toContain('project_id');
			expect(params(name).additionalProperties, name).toBe(false);
			// The viewer is always the trusted user: no tool argument names a user.
			expect(Object.keys(params(name).properties).join(' '), name).not.toMatch(/user/);
		}
		expect(registry.byToolName.get_project_knowledge_lens!.op).toBe('knowledge.project_lens');
		expect(registry.byToolName.get_project_knowledge_lens!.kind).toBe('read');
		expect(registry.byToolName.request_knowledge_access!.op).toBe('knowledge.request_access');
		expect(TOOL_METADATA.request_knowledge_access!.category).toBe('write');
		const lens = KNOWLEDGE_TOOL_DEFINITIONS.find(
			(tool) => tool.function.name === 'get_project_knowledge_lens'
		)!.function.description;
		expect(lens).toMatch(/shared_by/);
		expect(lens).toMatch(/never present it as the user's own/);
		expect(params('get_project_knowledge_lens').properties.record_ids.maxItems).toBe(
			KNOWLEDGE_LENS_RECORD_LIMIT
		);
		expect(params('request_knowledge_access').properties.what.enum).toEqual(['contact', 'all']);
	});

	it("pins query_knowledge's people filters to the connections read", () => {
		const query = params('query_knowledge').properties;
		const where = query.where.properties;
		// Every key that switches the gateway to the people path is in the schema, and nothing
		// else is, so a model can't send a filter the gateway silently ignores.
		expect(Object.keys(where).sort()).toEqual(
			[...KNOWLEDGE_CONNECTION_WHERE_KEYS, 'known_by_me', 'owned_by_me'].sort()
		);
		expect(query.group_by.enum).toEqual([...KNOWLEDGE_CONNECTION_FACETS]);
		expect(where.employment.enum).toEqual([...KNOWLEDGE_CONNECTION_EMPLOYMENT]);
		expect(where.place_of.enum).toEqual([...KNOWLEDGE_CONNECTION_PLACE_OF]);
		expect(where.in_records.items.enum).toEqual([...KNOWLEDGE_CONNECTION_RECORD_KINDS]);
		for (const key of ['company', 'title', 'industry', 'place', 'bridge_to'])
			expect(where[key].maxItems, key).toBe(KNOWLEDGE_CONNECTION_MAX_TERMS);
		expect(query.where.additionalProperties).toBe(false);
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
