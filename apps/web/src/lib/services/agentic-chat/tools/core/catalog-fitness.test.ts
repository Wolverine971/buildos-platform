// apps/web/src/lib/services/agentic-chat/tools/core/catalog-fitness.test.ts
import { createHash } from 'node:crypto';
import {
	AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY,
	CHAT_TOOL_DEFINITIONS,
	GATEWAY_SURFACE_PROFILE_NAMES,
	getGatewayDirectToolNamesForProfile,
	getGatewaySurfaceForContextType,
	getGatewaySurfaceForProfile,
	getToolRegistry,
	TOOL_METADATA
} from '@buildos/agentic-chat-runtime/catalog';
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import { describe, expect, it } from 'vitest';
import {
	buildCanonicalToolSurfaceSizeReports,
	buildGatewayProfileToolSurfaceSizeReports
} from '../../../agentic-chat-v2/tool-surface-size-report';

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

	it('pins the pre-move vocabulary, registry version, and ordered static surfaces', () => {
		expect(buildCatalogBaseline()).toMatchSnapshot();
	});
});

function buildCatalogBaseline() {
	const registry = getToolRegistry();
	const canonicalReports = buildCanonicalToolSurfaceSizeReports();
	const profileReports = buildGatewayProfileToolSurfaceSizeReports();

	return {
		registryVersion: registry.version,
		metadataOnlyToolNames: EXPECTED_METADATA_ONLY_TOOL_NAMES,
		catalogSerializedSha256: sha256(JSON.stringify(TOTAL_TOOL_VOCABULARY)),
		definitions: [...TOTAL_TOOL_VOCABULARY]
			.sort((a, b) => toolName(a).localeCompare(toolName(b)))
			.map((definition) => {
				const serialized = JSON.stringify(definition);
				return {
					name: toolName(definition),
					serialized,
					serializedChars: serialized.length,
					serializedSha256: sha256(serialized)
				};
			}),
		contextSurfaces: canonicalReports.map((report) => {
			const definitions = getGatewaySurfaceForContextType(
				report.contextType as ChatContextType
			);
			return baselineSurface(report.profile, report.contextType, definitions, report);
		}),
		staticProfiles: profileReports.map((report) => {
			const definitions = getGatewaySurfaceForProfile(
				report.profile as (typeof GATEWAY_SURFACE_PROFILE_NAMES)[number]
			);
			return baselineSurface(report.profile, report.contextType, definitions, report);
		})
	};
}

function baselineSurface(
	profile: string,
	contextType: string,
	definitions: ChatToolDefinition[],
	report: { toolCount: number; totalChars: number; estimatedTokens: number }
) {
	const serializedDefinitions = JSON.stringify(definitions);
	return {
		profile,
		contextType,
		toolNames: definitionNames(definitions),
		toolCount: report.toolCount,
		totalChars: report.totalChars,
		estimatedTokens: report.estimatedTokens,
		serializedDefinitionsSha256: sha256(serializedDefinitions)
	};
}

function definitionNames(definitions: ChatToolDefinition[]): string[] {
	return definitions.map(toolName);
}

function toolName(definition: ChatToolDefinition): string {
	const name = definition.function?.name;
	if (!name) throw new Error('Agentic Chat tool definition is missing function.name');
	return name;
}

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}
