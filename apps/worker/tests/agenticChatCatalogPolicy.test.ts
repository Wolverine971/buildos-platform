// apps/worker/tests/agenticChatCatalogPolicy.test.ts
import {
	AGENTIC_CHAT_STANDARD_CONTROL_TOOL_NAMES_V1,
	AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY,
	CHAT_TOOL_DEFINITIONS
} from '@buildos/agentic-chat-runtime/catalog';
import { AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1 } from '@buildos/agentic-chat-runtime/tools';
import { describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_DEFERRED_MUTATION_TOOLS_V1,
	AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1
} from '../src/workers/agentic-chat/mutationToolCatalog';
import {
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1,
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME
} from '../src/workers/agentic-chat/tools/execution-adapter';

const canonicalDefinitionByName = new Map(
	AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY.map((definition) => [definition.function.name, definition])
);
const directDefinitionByName = new Map(
	CHAT_TOOL_DEFINITIONS.map((definition) => [definition.function.name, definition])
);

describe('Agentic Chat worker/catalog policy compatibility', () => {
	it('keeps production read names catalog-backed or explicitly worker-owned', () => {
		const workerReviewControls = [
			APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
			APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
			REQUEST_PROPOSAL_REVISION_TOOL_NAME
		].sort();
		const explicitlyNonDefinitionNames = [...workerReviewControls, 'search_buildos'].sort();
		const nonCatalogNames = AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1.filter(
			(name) => !canonicalDefinitionByName.has(name)
		).sort();

		expect(nonCatalogNames).toEqual(explicitlyNonDefinitionNames);
		for (const name of AGENTIC_CHAT_STANDARD_CONTROL_TOOL_NAMES_V1) {
			expect(canonicalDefinitionByName.has(name), `${name} standard control`).toBe(true);
		}
	});

	it('keeps shared read implementations attached to canonical definitions', () => {
		const metadataOnlyCompatibilityAliases = AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1.filter(
			(name) => !directDefinitionByName.has(name)
		).sort();

		expect(metadataOnlyCompatibilityAliases).toEqual(['search_buildos']);
	});

	it('keeps reviewed worker mutation arguments inside canonical schemas', () => {
		for (const [toolName, spec] of Object.entries(AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1)) {
			const definition = directDefinitionByName.get(toolName);
			expect(definition, `${toolName} canonical definition`).toBeDefined();
			const canonicalProperties = definition?.function.parameters.properties ?? {};

			expect(
				spec.reviewedArgumentNames.filter(
					(name) => !Object.hasOwn(canonicalProperties, name)
				),
				`${toolName} reviewed arguments`
			).toEqual([]);
			expect(
				spec.requiredNames.filter((name) => !spec.reviewedArgumentNames.includes(name)),
				`${toolName} required arguments`
			).toEqual([]);
		}
	});

	it('keeps every deferred worker mutation attached to a canonical definition', () => {
		for (const toolName of Object.keys(AGENTIC_CHAT_DEFERRED_MUTATION_TOOLS_V1)) {
			expect(directDefinitionByName.has(toolName), `${toolName} deferred mutation`).toBe(
				true
			);
		}
	});
});
