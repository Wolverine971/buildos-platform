// apps/worker/tests/agenticChatReliabilityContractAudit.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1,
	AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1
} from '../src/workers/agentic-chat/mutations/tool-catalog';
import { agenticChatGenerationWriteFenceArgsV1 } from '../src/workers/agentic-chat/turn/write-fence';

const AGENTIC_CHAT_SOURCE_DIR = fileURLToPath(
	new URL('../src/workers/agentic-chat/', import.meta.url)
);

const FENCED_WRITE_MODULE_USAGE_COUNTS = Object.freeze({
	'effects/effect-control': 3,
	// Tasker 87 added the fenced read-only workflow recovery (`recoverWorkflow`).
	'turn/execution-control': 4,
	'effects/execution-observation': 1,
	'effects/prompt-snapshot': 1,
	'effects/research-capture': 2,
	// effects/stated-future-capture no longer writes (regex trigger retired 2026-09-23).
	'stream/supabase-stream-publisher-adapters': 2,
	'tools/tool-execution': 3
});

// One table-driven adapter plus the two writes whose execution row still names
// a constructor. Adding a reviewed write must not add a file here.
const REVIEWED_MUTATION_ADAPTER_FILES = Object.freeze([
	'create-onto-project-adapter.ts',
	'delegate-task-adapter.ts',
	'table-adapter.ts'
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
		const discovered = readdirSync(`${AGENTIC_CHAT_SOURCE_DIR}/mutations`)
			.filter((fileName) => /-adapter\.ts$/.test(fileName))
			.sort();
		expect(discovered).toEqual([...REVIEWED_MUTATION_ADAPTER_FILES].sort());
		for (const fileName of discovered) {
			const source = readFileSync(`${AGENTIC_CHAT_SOURCE_DIR}/mutations/${fileName}`, 'utf8');
			expect(source, `${fileName} bypasses the stable effect boundary`).toMatch(
				/assertMutationAdapterBoundary\(/
			);
		}
		// 21 -> 25 on 2026-09-04: the four calendar writes are table rows, so they
		// add no adapter file; they cross the same boundary through the table.
		// 25 -> 26 on 2026-09-22: update_onto_asset is a table row too.
		expect(AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.reviewedToolNames).toHaveLength(26);
	});

	it('limits automatic uncertain-commit replay to the reviewed idempotent downstreams', () => {
		const retryable = Object.entries(AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1)
			.filter(([, spec]) => spec.downstreamIdempotencySupported)
			.map(([toolName]) => toolName)
			.sort();
		expect(retryable).toEqual(['create_onto_task', 'create_task_document']);
		expect(Object.keys(AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1)).toHaveLength(26);
	});
});
