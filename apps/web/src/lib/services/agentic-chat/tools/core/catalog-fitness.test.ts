// apps/web/src/lib/services/agentic-chat/tools/core/catalog-fitness.test.ts
import {
	AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY,
	CHAT_TOOL_DEFINITIONS,
	GATEWAY_SURFACE_PROFILE_NAMES,
	getGatewayDirectToolNamesForProfile,
	getGatewaySurfaceForProfile,
	getToolRegistry,
	TOOL_METADATA
} from '@buildos/agentic-chat-runtime/catalog';
import type { ChatToolDefinition } from '@buildos/shared-types';
import { describe, expect, it } from 'vitest';

const TOTAL_TOOL_VOCABULARY = AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY;

// These names are intentionally signed by the runtime metadata/policy but are
// not provider definitions in the canonical direct surface. search_buildos is
// a retained execution/schema alias. The two Libri metadata entries were
// deleted on 2026-09-02 (capability removed 2026-08-07, metadata was dead).
const EXPECTED_METADATA_ONLY_TOOL_NAMES = ['search_buildos'];

describe('agentic chat catalog fitness', () => {
	it('keeps direct definitions unique and metadata drift explicit', () => {
		const directNames = definitionNames(CHAT_TOOL_DEFINITIONS);
		const directNameSet = new Set(directNames);
		const metadataNames = Object.keys(TOOL_METADATA);
		const metadataNameSet = new Set(metadataNames);

		expect(new Set(directNames).size).toBe(directNames.length);
		expect(directNames.filter((name) => !metadataNameSet.has(name))).toEqual([]);
		expect(metadataNames.filter((name) => !directNameSet.has(name)).sort()).toEqual(
			EXPECTED_METADATA_ONLY_TOOL_NAMES
		);
	});

	it('keeps control and discovery names unique across the total vocabulary', () => {
		const allNames = definitionNames(TOTAL_TOOL_VOCABULARY);

		expect(new Set(allNames).size).toBe(allNames.length);
	});

	it('keeps registry ops collision-free', () => {
		const registry = getToolRegistry();
		const directNames = definitionNames(CHAT_TOOL_DEFINITIONS).sort();

		expect(Object.keys(registry.ops)).toHaveLength(directNames.length);
		expect(Object.keys(registry.byToolName).sort()).toEqual(directNames);
	});

	it('keeps every static surface reference inside the known vocabulary', () => {
		const knownNames = new Set(definitionNames(TOTAL_TOOL_VOCABULARY));

		for (const profile of GATEWAY_SURFACE_PROFILE_NAMES) {
			for (const name of getGatewayDirectToolNamesForProfile(profile)) {
				expect(
					knownNames.has(name),
					`${profile} references unknown direct tool ${name}`
				).toBe(true);
			}

			for (const name of definitionNames(getGatewaySurfaceForProfile(profile))) {
				expect(knownNames.has(name), `${profile} materialized unknown tool ${name}`).toBe(
					true
				);
			}
		}
	});

	it('keeps definitions JSON-compatible with top-level object parameter schemas', () => {
		for (const definition of TOTAL_TOOL_VOCABULARY) {
			const name = definition.function?.name ?? 'unknown';
			const serialized = JSON.stringify(definition);

			expect(serialized.length, `${name} must serialize`).toBeGreaterThan(0);
			expect(JSON.parse(serialized), `${name} must round-trip through JSON`).toEqual(
				definition
			);
			expect(definition.function?.parameters?.type, `${name} parameters`).toBe('object');
		}
	});

	it('keeps required parameters satisfiable and registry dispatch aligned', () => {
		const registry = getToolRegistry();
		for (const definition of TOTAL_TOOL_VOCABULARY) {
			checkSchema(definition.function.parameters, toolName(definition));
		}
		for (const definition of CHAT_TOOL_DEFINITIONS) {
			const name = toolName(definition);
			const entry = registry.byToolName[name]!;
			expect(entry.tool_name).toBe(name);
			expect(registry.ops[entry.op]).toBe(entry);
			expect(entry.parameters_schema).toEqual(definition.function.parameters);
		}
	});
	// Payload budgets and required capabilities live in tool-surface-size-report.test.ts.
	// Description wording and harmless definition reordering are not a compatibility contract.
});

function checkSchema(value: unknown, path: string): void {
	if (!value || typeof value !== 'object') return;
	const schema = value as Record<string, any>;
	if (schema.required) {
		expect(new Set(schema.required).size, `${path}: duplicate required keys`).toBe(
			schema.required.length
		);
		for (const key of schema.required) {
			expect(
				Object.hasOwn(schema.properties ?? {}, key),
				`${path}: required ${key} must be defined`
			).toBe(true);
		}
	}
	for (const [key, child] of Object.entries(schema.properties ?? {}))
		checkSchema(child, `${path}.${key}`);
	if (schema.items) checkSchema(schema.items, `${path}[]`);
	for (const branch of ['oneOf', 'anyOf', 'allOf']) {
		for (const child of schema[branch] ?? []) checkSchema(child, `${path}.${branch}`);
	}
}

function definitionNames(definitions: ChatToolDefinition[]): string[] {
	return definitions.map(toolName);
}

function toolName(definition: ChatToolDefinition): string {
	const name = definition.function?.name;
	if (!name) throw new Error('Agentic Chat tool definition is missing function.name');
	return name;
}
