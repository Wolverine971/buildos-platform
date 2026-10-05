// packages/agentic-chat-runtime/src/catalog/definitions/tables.test.ts
//
// BuildOS Tables (2026-10-04). The catalog copies the table contract enums so it
// stays import-free; this test pins every copy to the shared core module, and
// guards the schema rules weak tool-calling models depend on (no oneOf, no
// array-in-union types, closed objects).
import { describe, expect, it } from 'vitest';
import {
	TABLE_AGGREGATE_FNS,
	TABLE_COLUMN_TYPES,
	TABLE_FILTER_OPS,
	TABLE_LIMITS
} from '@buildos/shared-agent-ops/tables';
import {
	TABLE_TOOL_AGGREGATE_FNS,
	TABLE_TOOL_COLUMN_TYPES,
	TABLE_TOOL_DEFINITIONS,
	TABLE_TOOL_FILTER_OPS,
	TABLE_TOOL_LIMITS,
	TABLE_TOOL_NAMES
} from './tables';
import { CHAT_TOOL_DEFINITIONS } from './index';
import { TOOL_METADATA } from '../metadata';

function walk(
	schema: unknown,
	visit: (node: Record<string, unknown>, path: string) => void,
	path = '$'
) {
	if (!schema || typeof schema !== 'object') return;
	if (Array.isArray(schema)) {
		schema.forEach((entry, index) => walk(entry, visit, `${path}[${index}]`));
		return;
	}
	const node = schema as Record<string, unknown>;
	visit(node, path);
	for (const [key, value] of Object.entries(node)) walk(value, visit, `${path}.${key}`);
}

describe('table tool catalog', () => {
	it('copies the shared table contract exactly', () => {
		expect([...TABLE_TOOL_COLUMN_TYPES]).toEqual([...TABLE_COLUMN_TYPES]);
		expect([...TABLE_TOOL_FILTER_OPS]).toEqual([...TABLE_FILTER_OPS]);
		expect([...TABLE_TOOL_AGGREGATE_FNS]).toEqual([...TABLE_AGGREGATE_FNS]);
		expect(TABLE_TOOL_LIMITS).toEqual({
			maxColumns: TABLE_LIMITS.maxColumns,
			maxAgentRowsPerCall: TABLE_LIMITS.maxAgentRowsPerCall,
			maxAgentReadRows: TABLE_LIMITS.maxAgentReadRows,
			defaultAgentReadRows: TABLE_LIMITS.defaultAgentReadRows
		});
	});

	it('defines the five table tools once, in the chat catalog, with metadata', () => {
		expect(TABLE_TOOL_DEFINITIONS.map((tool) => tool.function.name)).toEqual([
			...TABLE_TOOL_NAMES
		]);
		const catalogNames = CHAT_TOOL_DEFINITIONS.map((tool) => tool.function.name);
		for (const name of TABLE_TOOL_NAMES) {
			expect(
				catalogNames.filter((entry) => entry === name),
				name
			).toHaveLength(1);
			expect(TOOL_METADATA[name], name).toBeDefined();
		}
		expect(TOOL_METADATA.get_onto_table_details!.category).toBe('read');
		expect(TOOL_METADATA.read_table_rows!.category).toBe('read');
		expect(TOOL_METADATA.update_onto_table_rows!.category).toBe('write');
	});

	it('keeps every table schema closed and free of oneOf / array-in-union types', () => {
		for (const tool of TABLE_TOOL_DEFINITIONS) {
			walk(tool.function.parameters, (node, path) => {
				expect(node.oneOf, `${tool.function.name} ${path}`).toBeUndefined();
				expect(node.anyOf, `${tool.function.name} ${path}`).toBeUndefined();
				if (Array.isArray(node.type)) {
					expect(node.type, `${tool.function.name} ${path}`).not.toContain('array');
					expect(node.type, `${tool.function.name} ${path}`).not.toContain('object');
				}
			});
			expect(tool.function.parameters.additionalProperties, tool.function.name).toBe(false);
		}
	});

	it('requires the table id on every table tool except create', () => {
		for (const tool of TABLE_TOOL_DEFINITIONS) {
			const required = (tool.function.parameters.required ?? []) as string[];
			if (tool.function.name === 'create_onto_table') {
				expect(required).toEqual(['project_id', 'title']);
			} else {
				expect(required, tool.function.name).toContain('table_id');
			}
		}
	});

	it('caps row batches and reads at the shared agent limits', () => {
		const rows = TABLE_TOOL_DEFINITIONS.find(
			(tool) => tool.function.name === 'update_onto_table_rows'
		)!.function.parameters.properties as Record<string, { maxItems?: number }>;
		expect(rows.add?.maxItems).toBe(TABLE_LIMITS.maxAgentRowsPerCall);
		expect(rows.update?.maxItems).toBe(TABLE_LIMITS.maxAgentRowsPerCall);
		expect(rows.delete?.maxItems).toBe(TABLE_LIMITS.maxAgentRowsPerCall);
		const read = TABLE_TOOL_DEFINITIONS.find(
			(tool) => tool.function.name === 'read_table_rows'
		)!.function.parameters.properties as Record<string, { maximum?: number; default?: number }>;
		expect(read.limit?.maximum).toBe(TABLE_LIMITS.maxAgentReadRows);
		expect(read.limit?.default).toBe(TABLE_LIMITS.defaultAgentReadRows);
	});
});
