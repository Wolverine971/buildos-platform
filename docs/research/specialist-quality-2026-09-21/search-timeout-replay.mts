// docs/research/specialist-quality-2026-09-21/search-timeout-replay.mts
// Offline fault injection: no provider or database requests. Build dependencies first.
// Run: node --import tsx docs/research/specialist-quality-2026-09-21/search-timeout-replay.mts
// Set SEARCH_REPLAY_SOURCE_ROOT to replay a frozen worktree instead.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const sourceRoot =
	process.env.SEARCH_REPLAY_SOURCE_ROOT ?? fileURLToPath(new URL('../../../', import.meta.url));
const loadSource = (path: string) => import(pathToFileURL(resolve(sourceRoot, path)).href);
const { readSourceProvenance } = await loadSource(
	'packages/agentic-chat-runtime/src/provenance.mts'
);
const searchModule = await loadSource('packages/agentic-chat-runtime/src/tools/ontology-search.ts');
const embeddingModule = await loadSource(
	'packages/shared-agent-ops/src/embeddings/openai-embeddings.ts'
);
const { searchAllProjects } = (searchModule as any).default ?? searchModule;
const { createOpenAiEmbeddingsClient } = (embeddingModule as any).default ?? embeddingModule;
const compactionModule = await loadSource(
	'packages/agentic-chat-runtime/src/loop/tool-payload-compaction.ts'
);
const { buildToolPayloadForModel } = (compactionModule as any).default ?? compactionModule;
const calls: Array<{ name: string; atMs: number }> = [];
let finishEmbedding!: (value: any) => void;
let embeddingSignal: AbortSignal | undefined;
const started = performance.now();
const client = createOpenAiEmbeddingsClient({
	apiKey: 'injected-test-key',
	fetchImpl: async (_url, init) => {
		embeddingSignal = init?.signal as AbortSignal;
		return new Promise((resolve) => {
			finishEmbedding = resolve;
		});
	}
});
const context: any = {
	client: {
		rpc: (name: string) => {
			calls.push({ name, atMs: performance.now() - started });
			return Promise.resolve({
				data: [
					{
						id: 'fixture-document',
						type: 'document',
						title: 'Inspection checklist (synthetic fixture)',
						score: 0.9
					}
				],
				error: null
			});
		}
	},
	access: { getActorId: async () => '90000000-0000-4000-8000-000000000009' },
	userId: '91000000-0000-4000-8000-000000000009',
	timezone: null,
	embeddings: { embedQuery: (text: string, options: any) => client.embedOne(text, options) }
};
const result = await searchAllProjects(context, {
	query: 'construction completed inspection walkthrough',
	types: ['document']
});
const settledMs = performance.now() - started;
finishEmbedding({
	ok: true,
	status: 200,
	text: async () => '',
	json: async () => ({ data: [{ index: 0, embedding: [0.1] }] })
});
await new Promise((resolve) => setTimeout(resolve, 25));
const modelPayload = buildToolPayloadForModel(
	{
		id: 'call:replay',
		type: 'function',
		function: { name: 'search_all_projects', arguments: '{}' }
	},
	{ tool_call_id: 'call:replay', success: true, result },
	() => ({ args: {} })
);
if (modelPayload.search_coverage?.semantic !== 'timed_out')
	throw Error('Coverage lost in prompt compaction');
const evidence = {
	modelPayload,
	kind: 'local fault injection; synthetic data, no live provider or database',
	source: readSourceProvenance(sourceRoot),
	configuredBudgetMs: 5000,
	settledMs,
	embeddingFetchAborted: embeddingSignal?.aborted,
	calls,
	result
};
if (
	!embeddingSignal?.aborted ||
	result.search_coverage.semantic !== 'timed_out' ||
	calls.some((call) => call.name === 'onto_search_semantic')
)
	throw Error('Fault replay failed');
writeFileSync(
	new URL('./search-timeout-replay.json', import.meta.url),
	JSON.stringify(evidence, null, 2) + '\n'
);
console.log(JSON.stringify({ settledMs, aborted: embeddingSignal?.aborted, calls: calls.length }));
