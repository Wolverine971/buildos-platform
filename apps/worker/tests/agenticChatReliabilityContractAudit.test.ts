// apps/worker/tests/agenticChatReliabilityContractAudit.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1,
	AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1
} from '../src/workers/agentic-chat/mutationToolCatalog';
import { agenticChatGenerationWriteFenceArgsV1 } from '../src/workers/agentic-chat/writeFence';

const AGENTIC_CHAT_SOURCE_DIR = fileURLToPath(
	new URL('../src/workers/agentic-chat/', import.meta.url)
);

const FENCED_WRITE_MODULE_USAGE_COUNTS = Object.freeze({
	effectControl: 3,
	executionControl: 3,
	executionObservation: 1,
	promptSnapshot: 1,
	researchCapture: 2,
	statedFutureCapture: 1,
	supabaseStreamPublisherAdapters: 2,
	toolExecution: 3
});

const REVIEWED_MUTATION_ADAPTER_FILES = Object.freeze([
	'createOntoDocumentMutationAdapter.ts',
	'createOntoProjectMutationAdapter.ts',
	'createOntoTaskMutationAdapter.ts',
	'delegateTaskMutationAdapter.ts',
	'gatewayDocumentRelationshipMutationAdapter.ts',
	'gatewayEdgeMutationAdapter.ts',
	'gatewayEntityMutationAdapter.ts',
	'gatewayProjectMutationAdapter.ts',
	'moveOntoTaskMutationAdapter.ts',
	'tagOntoEntityPingMutationAdapter.ts',
	'updateOntoTaskMutationAdapter.ts'
]);

describe('Agentic Chat Phase 5 reliability contract audit', () => {
	it('builds the exact generation-and-ownership RPC fence as one indivisible envelope', () => {
		expect(
			agenticChatGenerationWriteFenceArgsV1({
				turnRunId: 'turn-1',
				queueJobId: 'job-1',
				processingToken: 'token-1',
				executionGeneration: 7
			})
		).toEqual({
			p_turn_run_id: 'turn-1',
			p_queue_job_id: 'job-1',
			p_processing_token: 'token-1',
			p_execution_generation: 7
		});
	});

	it('keeps every current-generation durable writer on the shared fence envelope', () => {
		for (const [moduleName, expectedUsageCount] of Object.entries(
			FENCED_WRITE_MODULE_USAGE_COUNTS
		)) {
			const source = readFileSync(`${AGENTIC_CHAT_SOURCE_DIR}/${moduleName}.ts`, 'utf8');
			const usageCount =
				source.match(/agenticChatGenerationWriteFenceArgsV1\(/g)?.length ?? 0;
			expect(usageCount, `${moduleName}.ts write-fence usage drift`).toBe(expectedUsageCount);
		}
	});

	it('keeps every reviewed mutation adapter behind the common stable-effect boundary', () => {
		const discovered = readdirSync(AGENTIC_CHAT_SOURCE_DIR)
			.filter((fileName) => /MutationAdapter\.ts$/.test(fileName))
			.sort();
		expect(discovered).toEqual([...REVIEWED_MUTATION_ADAPTER_FILES].sort());
		for (const fileName of discovered) {
			const source = readFileSync(`${AGENTIC_CHAT_SOURCE_DIR}/${fileName}`, 'utf8');
			expect(source, `${fileName} bypasses the stable effect boundary`).toMatch(
				/assertMutationAdapterBoundary\(/
			);
		}
		expect(AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.reviewedToolNames).toHaveLength(21);
	});

	it('limits automatic uncertain-commit replay to the reviewed idempotent downstreams', () => {
		const retryable = Object.entries(AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1)
			.filter(([, spec]) => spec.downstreamIdempotencySupported)
			.map(([toolName]) => toolName)
			.sort();
		expect(retryable).toEqual(['create_onto_task', 'create_task_document']);
		expect(Object.keys(AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1)).toHaveLength(21);
	});
});
