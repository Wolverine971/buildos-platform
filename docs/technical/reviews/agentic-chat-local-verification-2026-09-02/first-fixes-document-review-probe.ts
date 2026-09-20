// docs/technical/reviews/agentic-chat-local-verification-2026-09-02/first-fixes-document-review-probe.ts
// Real model probe: run from apps/web with vite-node --config vitest.config.ts --mode test.
// Makes paid model calls with synthetic document data; has no database or queue client.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY } from '@buildos/agentic-chat-runtime/catalog';
import {
	parseDeclaredTurnContract,
	provideAgenticChatLoopToolCatalog
} from '@buildos/agentic-chat-runtime/loop';
import { canonicalizeAgenticChatJson } from '@buildos/shared-types';
import { GPT_56_LUNA_MODEL } from '@buildos/smart-llm';
import { AgenticChatOpenRouterClient } from '../../../../apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts';
import { buildTurnContractReviewRequest } from '../../../../apps/worker/src/workers/agentic-chat/provider/review/turn-contract.ts';
import {
	buildMutationBatchReviewRequest,
	mutationBatchSha256
} from '../../../../apps/worker/src/workers/agentic-chat/provider/review/mutation-batch.ts';
import {
	completeTurnContractReviewDecision,
	completeMutationBatchReviewDecision
} from '../../../../apps/worker/src/workers/agentic-chat/provider/review/decision-completion.ts';
import {
	appendToolCallDelta,
	createToolCallAccumulator,
	completeReviewerToolCalls
} from '../../../../apps/worker/src/workers/agentic-chat/provider/stream-tool-calls.ts';
import {
	contractSha256,
	validateCompletedProviderCalls
} from '../../../../apps/worker/src/workers/agentic-chat/provider/validation.ts';

// Local source and synthetic document evidence. Only the model endpoint is reachable;
// this probe has no database client, queue, or mutation executor.
provideAgenticChatLoopToolCatalog(() => ({ ops: {}, byToolName: {} }));
const secretLine = readFileSync(new URL('../../../../apps/web/.env', import.meta.url), 'utf8')
	.split('\n')
	.find((l) => l.startsWith('PRIVATE_OPENROUTER_API_KEY='));
const apiKey = secretLine
	?.split('=')
	.slice(1)
	.join('=')
	.trim()
	.replace(/^(['"])(.*)\1$/, '$2');
assert(apiKey);
const documentId = '41000000-0000-4000-8000-000000000041';
const projectId = '51000000-0000-4000-8000-000000000051';
const original =
	'# Launch checklist\n\n## Preflight\nConfirm backups and owner availability.\n\n## Rollback\nIf launch checks fail, restore the prior release, then notify the launch owner and record the failure.\n\n## Monitoring\nWatch error rates for 30 minutes.\n';
const replacement = original.replace(
	'If launch checks fail, restore the prior release, then notify the launch owner and record the failure.',
	'On failure, restore the prior release and notify the launch owner.'
);
const broadened = replacement.replace(
	'Watch error rates for 30 minutes.',
	'Skip monitoring after launch.'
);
const tools = [
	'declare_turn_contract',
	'request_turn_clarification',
	'declare_read_only_turn',
	'update_onto_document'
].map((name) => {
	const tool = AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY.find((t) => t.function.name === name);
	assert(tool, name);
	return tool;
});
const contract = parseDeclaredTurnContract({
	outcomes: [
		{
			action: 'update',
			entity_kind: 'document',
			target_ids: [documentId],
			required_fields: ['content'],
			description:
				'Change only the Rollback paragraph to the exact requested sentence. Preserve Preflight, Monitoring, headings, and all other content.'
		}
	]
});
assert(contract);
const contractHash = contractSha256(contract);
const request: any = {
	messages: [
		{
			role: 'user',
			content: `In document ${documentId} (Launch checklist), replace only the Rollback paragraph with "On failure, restore the prior release and notify the launch owner." Preserve all other sections exactly.`
		},
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'read-original',
					type: 'function',
					function: {
						name: 'get_onto_document_details',
						arguments: JSON.stringify({ document_id: documentId })
					}
				}
			]
		},
		{
			role: 'tool',
			tool_call_id: 'read-original',
			content: JSON.stringify({
				document: {
					id: documentId,
					project_id: projectId,
					title: 'Launch checklist',
					content: original
				}
			})
		}
	],
	tools,
	toolChoice: 'auto',
	contextType: 'project',
	entityId: documentId,
	projectId,
	userId: randomUUID(),
	sessionId: randomUUID(),
	turnRunId: randomUUID(),
	streamRunId: randomUUID(),
	clientTurnId: randomUUID(),
	queueJobId: randomUUID(),
	processingToken: randomUUID(),
	executionGeneration: 1,
	providerRound: 'initial',
	logicalProviderRound: 1
};
const usage: any[] = [];
const guardedFetch: typeof fetch = async (input, init) => {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	assert.equal(new URL(url).origin, 'https://openrouter.ai');
	return fetch(input, init);
};
const client = new AgenticChatOpenRouterClient(
	{
		usage: {
			observe(o) {
				usage.push({
					model: o.modelUsed,
					provider: o.provider,
					role: o.passRole,
					cost: o.providerCost,
					promptTokens: o.promptTokens,
					completionTokens: o.completionTokens,
					status: o.status
				});
			}
		}
	},
	{
		routes: [
			{
				id: 'openrouter',
				kind: 'openrouter',
				baseUrl: 'https://openrouter.ai/api/v1',
				apiKey,
				model: GPT_56_LUNA_MODEL,
				providerRouting: { allow_fallbacks: true, order: ['openai', 'azure'] }
			}
		],
		httpReferer: 'https://build-os.com',
		appName: 'BuildOS Local Document Review Regression',
		fetchImpl: guardedFetch,
		requestTimeoutMs: 45000
	}
);
const reports: any[] = [];
for (const scenario of ['contract', 'preserved-replacement', 'broadened-replacement'].filter(
	(s) => !process.env.DOCUMENT_REVIEW_ONLY || s === process.env.DOCUMENT_REVIEW_ONLY
)) {
	const started = Date.now();
	const usageStart = usage.length;
	const actingRequest = {
		...request,
		turnRunId: randomUUID(),
		signal: AbortSignal.timeout(60000),
		budget: { deadlineAtMs: Date.now() + 58000 }
	};
	const args = {
		document_id: documentId,
		content: scenario === 'broadened-replacement' ? broadened : replacement,
		update_strategy: 'replace'
	};
	const calls = [
		{
			id: 'replace-1',
			name: 'update_onto_document',
			arguments: args,
			canonicalArguments: canonicalizeAgenticChatJson(args),
			canonicalProviderArguments: canonicalizeAgenticChatJson(args)
		}
	];
	const batchHash = mutationBatchSha256(calls);
	const batchRequest = {
		...actingRequest,
		messages: [
			...actingRequest.messages,
			{
				role: 'assistant',
				content: '',
				tool_calls: [
					{
						id: 'prior-contract-approval',
						type: 'function',
						function: {
							name: 'approve_turn_contract_review',
							arguments: JSON.stringify({
								contract_sha256: contractHash,
								reason: 'The user commissioned this exact document section edit.',
								reference_candidates: []
							})
						}
					}
				]
			},
			{
				role: 'tool',
				tool_call_id: 'prior-contract-approval',
				content: JSON.stringify({
					status: 'turn_contract_review_approved',
					contract_sha256: contractHash
				})
			}
		]
	};
	const reviewRequest =
		scenario === 'contract'
			? buildTurnContractReviewRequest(
					actingRequest,
					tools,
					contract,
					contractHash,
					true,
					true
				)
			: buildMutationBatchReviewRequest(
					{
						proposalSource: 'acting_model',
						batchSha256: batchHash,
						calls,
						authorization: {
							contract,
							contractSha256: contractHash,
							labelBindings: new Map()
						},
						reviewTools: tools,
						request: batchRequest,
						usage: null
					},
					true
				);
	const accumulator = createToolCallAccumulator();
	let finished = false;
	let finishedReason: string | null = null;
	let error: any = null;
	let decisions: any[] = [];
	try {
		for await (const event of client.stream(reviewRequest)) {
			if (event.type === 'tool_call') appendToolCallDelta(accumulator, event.toolCall);
			if (event.type === 'error') throw new Error(event.error);
			if (event.type === 'done') {
				finished = true;
				finishedReason = event.finishedReason ?? null;
			}
		}
		const base = {
			actingRequest,
			reviewRequest,
			toolCalls: accumulator,
			finished,
			finishedReason,
			fallbackReason: null
		};
		decisions =
			scenario === 'contract'
				? completeTurnContractReviewDecision({
						...base,
						admittedTools: tools,
						contract,
						contractReviewSha256: contractHash,
						allowRevision: true
					})
				: completeMutationBatchReviewDecision({
						...base,
						batchSha256: batchHash,
						allowRevision: true
					});
		assert.equal(decisions.length, 1);
		assert.equal(
			decisions[0].name,
			scenario === 'contract'
				? 'approve_turn_contract_review'
				: scenario === 'preserved-replacement'
					? 'approve_mutation_batch_review'
					: 'request_proposal_revision'
		);
	} catch (e: any) {
		error = { message: e.message, code: e.code };
	}
	const raw = completeReviewerToolCalls(accumulator, reviewRequest.tools, {
		finishedReason,
		completionBudgetExhausted: finishedReason === 'length'
	});
	const report = {
		scenario,
		passed: !error,
		elapsedMs: Date.now() - started,
		decisions,
		raw,
		validationIssues: validateCompletedProviderCalls(raw.calls, reviewRequest),
		expectedBatchSha256: batchHash,
		usage: usage.slice(usageStart),
		error
	};
	reports.push(report);
	writeFileSync(
		process.env.DOCUMENT_REVIEW_OUTPUT || '/tmp/agentic-first-fixes-document-review.json',
		JSON.stringify(
			{
				model: GPT_56_LUNA_MODEL,
				scope: 'Local reviewer request builders, decision validation, and model transport; synthetic document; no database writes.',
				original,
				replacement,
				broadened,
				reports
			},
			null,
			2
		)
	);
	console.info(JSON.stringify(report));
}
process.exitCode = reports.some((r) => !r.passed) ? 1 : 0;
