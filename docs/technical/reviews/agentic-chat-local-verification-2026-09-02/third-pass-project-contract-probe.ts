// docs/technical/reviews/agentic-chat-local-verification-2026-09-02/third-pass-project-contract-probe.ts
// Run from apps/web: pnpm exec vite-node --config vitest.config.ts --mode test <this file>
// Paid model requests through the bounded coordinator. Synthetic intent; no mutation executor.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY } from '@buildos/agentic-chat-runtime/catalog';
import {
	parseDeclaredTurnContract,
	resolveTurnContractOutcome,
	provideAgenticChatLoopToolCatalog
} from '@buildos/agentic-chat-runtime/loop';
import { AgenticChatOpenRouterClient } from '../../../../apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts';
import { buildWorkerSemanticMutationOrdering } from '../../../../apps/worker/src/workers/agentic-chat/provider/review/turn-contract.ts';
import { AgenticChatTurnProviderAdapter } from '../../../../apps/worker/src/workers/agentic-chat/provider/turn-provider.ts';
import { AgenticChatProviderCapacity } from '../../../../apps/worker/src/workers/agentic-chat/provider/provider-capacity.ts';
import type {
	AgenticChatTurnProviderClientRequestV1,
	AgenticChatProviderStepV1
} from '../../../../apps/worker/src/workers/agentic-chat/provider/contracts.ts';
import type { AgenticChatWorkerExecutionInputV1 } from '../../../../apps/worker/src/workers/agentic-chat/turn/execution-input.ts';

provideAgenticChatLoopToolCatalog(() => ({ ops: {}, byToolName: {} }));
const secretLine = readFileSync(new URL('../../../../apps/web/.env', import.meta.url), 'utf8')
	.split('\n')
	.find((line) => line.startsWith('PRIVATE_OPENROUTER_API_KEY='));
const apiKey = secretLine
	?.split('=')
	.slice(1)
	.join('=')
	.trim()
	.replace(/^(['"])(.*)\1$/, '$2');
assert(apiKey);
const admittedTools = [
	'declare_turn_contract',
	'declare_read_only_turn',
	'request_turn_clarification',
	'create_onto_project',
	'create_onto_goal',
	'create_onto_task'
].map((name) => {
	const tool = AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY.find((entry) => entry.function.name === name);
	assert(tool, name);
	return tool;
});
const usage: unknown[] = [];
const requests: unknown[] = [];
// A targeted regression can require the known failing endpoint on its opening
// request. Later requests use the production client's unchanged routing policy.
const pinInitialDeepInfra = process.env.PROJECT_CONTRACT_PIN_DEEPINFRA === 'true';
const guardedFetch: typeof fetch = (input, init) => {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	assert.equal(new URL(url).origin, 'https://openrouter.ai');
	const body = JSON.parse(String(init?.body));
	if (pinInitialDeepInfra && requests.length === 0) {
		body.provider = { ...body.provider, order: ['deepinfra'], allow_fallbacks: false };
	}
	requests.push({
		model: body.model,
		provider: body.provider,
		toolChoice: body.tool_choice,
		tools: body.tools?.map((tool: { function: { name: string } }) => tool.function.name)
	});
	return fetch(input, { ...init, body: JSON.stringify(body) });
};
const client = new AgenticChatOpenRouterClient(
	{
		usage: {
			observe(observation) {
				usage.push({
					model: observation.modelUsed,
					provider: observation.provider,
					cost: observation.providerCost,
					promptTokens: observation.promptTokens,
					completionTokens: observation.completionTokens,
					status: observation.status
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
				model: 'deepseek/deepseek-v4-flash',
				providerRouting: {
					allow_fallbacks: true,
					order: ['deepinfra', 'deepseek', 'alibaba', 'cloudflare']
				}
			}
		],
		httpReferer: 'https://build-os.com',
		appName: 'BuildOS Local Project Contract Regression',
		fetchImpl: guardedFetch,
		requestTimeoutMs: 45000
	}
);
const request: AgenticChatTurnProviderClientRequestV1 = {
	messages: [
		{
			role: 'system',
			content: [
				'You are BuildOS. Declare the complete requested durable outcomes now. This stage exposes only declare_turn_contract; creation tools become available after approval.',
				buildWorkerSemanticMutationOrdering(admittedTools, 'project_create')
			].join('\n')
		},
		{
			role: 'user',
			content:
				'Create a project called "Weekly Audio Launch". Its goal is "Publish three episodes" by 2026-09-30. Add exactly three tasks: "Define format", "Outline first episode", and "Record pilot". Do not schedule calendar events or assign people.'
		}
	],
	tools: admittedTools.filter((tool) => tool.function.name === 'declare_turn_contract'),
	toolChoice: 'required',
	userId: randomUUID(),
	sessionId: randomUUID(),
	turnRunId: randomUUID(),
	streamRunId: randomUUID(),
	clientTurnId: randomUUID(),
	contextType: 'project_create',
	entityId: null,
	projectId: null,
	queueJobId: randomUUID(),
	processingToken: randomUUID(),
	executionGeneration: 1,
	providerRound: 'initial',
	logicalProviderRound: 1,
	passRole: 'acting',
	signal: AbortSignal.timeout(120000),
	budget: { deadlineAtMs: Date.now() + 115000 }
};
const started = Date.now();
const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
const adapter = new AgenticChatTurnProviderAdapter(
	{
		client,
		capacity,
		semanticReviewer: {
			stream() {
				throw new Error('Probe must stop at the declaration before review');
			}
		}
	},
	2000,
	16,
	{ createOntoProject: true, createOntoGoal: true, createOntoTask: true }
);
const executionInput = {
	claim: {
		outcome: 'claimed',
		executionMayStart: true,
		turnRunId: request.turnRunId,
		queueJobId: request.queueJobId,
		sessionId: request.sessionId,
		userId: request.userId,
		correlationId: randomUUID(),
		executionGeneration: 1,
		status: 'running',
		inputArtifactId: randomUUID(),
		userMessageId: randomUUID()
	},
	streamRunId: request.streamRunId,
	clientTurnId: request.clientTurnId,
	requestPayload: {
		message: request.messages[1]!.content,
		attachments: [],
		context: { type: 'project_create' }
	},
	timingBaseline: { rawHistoryCount: 0, historyForModelCount: 0 },
	artifact: {
		artifactVersion: 'agentic_chat_input_v2',
		historySource: 'admission_window',
		history: [],
		prepared: {
			sourcePreparedPromptId: null,
			contextPayload: {},
			conversationSummary: null,
			surfaceProfile: 'project_create',
			systemPrompt: request.messages[0]!.content,
			promptSections: [],
			toolSurface: {
				surfaceProfile: 'project_create',
				toolNames: admittedTools.map((tool) => tool.function.name),
				definitions: admittedTools
			}
		},
		createdAt: new Date().toISOString(),
		retainUntil: new Date(Date.now() + 86400000).toISOString(),
		contentHash: '0'.repeat(64)
	}
} as AgenticChatWorkerExecutionInputV1;
const invocation = await adapter.prepare({
	executionInput,
	processingToken: request.processingToken,
	signal: request.signal,
	budget: request.budget
});
const steps: AgenticChatProviderStepV1[] = [];
let failure: string | null = null;
try {
	for await (const step of invocation.stream()) {
		steps.push(step);
		assert.notEqual(
			step.type,
			'mutating_tool',
			'No mutation should be exposed before approval'
		);
	}
} catch (error) {
	failure = error instanceof Error ? error.message : String(error);
} finally {
	invocation.release();
}
const calls = steps.filter((step) => step.type === 'read_tool' && !step.validationFailure);
const issues = steps.filter((step) => step.type === 'read_tool' && step.validationFailure);
const contract =
	calls.length === 1 &&
	calls[0]?.type === 'read_tool' &&
	calls[0].toolName === 'declare_turn_contract'
		? parseDeclaredTurnContract(calls[0].arguments)
		: null;
const counts = contract?.outcomes.reduce<Record<string, number>>((result, outcome) => {
	result[outcome.entityKind] =
		(result[outcome.entityKind] ?? 0) + outcome.minimumSuccessfulEffects;
	return result;
}, {});
const projectId = '51000000-0000-4000-8000-000000000051';
const fixtureExecution = (
	name: string,
	args: Record<string, unknown>,
	result: Record<string, unknown>
) => {
	const id = randomUUID();
	return {
		toolCall: {
			id,
			type: 'function' as const,
			function: { name, arguments: JSON.stringify(args) }
		},
		result: { tool_call_id: id, success: true, result }
	};
};
const completion = resolveTurnContractOutcome({
	contract,
	toolExecutions: [
		fixtureExecution(
			'create_onto_project',
			{ project: { name: 'Weekly Audio Launch' }, entities: [], relationships: [] },
			{ project: { id: projectId, name: 'Weekly Audio Launch' } }
		),
		fixtureExecution(
			'create_onto_goal',
			{ project_id: projectId, name: 'Publish three episodes', target_date: '2026-09-30' },
			{ goal: { id: randomUUID(), name: 'Publish three episodes' } }
		),
		...['Define format', 'Outline first episode', 'Record pilot'].map((title) =>
			fixtureExecution(
				'create_onto_task',
				{ project_id: projectId, title },
				{ task: { id: randomUUID(), title } }
			)
		)
	]
});
const passed =
	!failure &&
	contract !== null &&
	completion.fulfilled &&
	counts?.project === 1 &&
	counts.goal === 1 &&
	counts.task === 3 &&
	Object.keys(counts).length === 3;
const report = {
	passed,
	pinInitialDeepInfra,
	at: new Date().toISOString(),
	durationMs: Date.now() - started,
	failure,
	validationFailures: issues,
	requests,
	calls,
	counts,
	completion,
	usage,
	capacity: capacity.getSnapshot()
};
writeFileSync(
	new URL(
		pinInitialDeepInfra
			? 'third-pass-project-contract-pinned-results.json'
			: 'third-pass-project-contract-results.json',
		import.meta.url
	),
	JSON.stringify(report, null, 2) + '\n'
);
console.log(
	JSON.stringify({
		passed,
		durationMs: report.durationMs,
		failure,
		counts,
		usage,
		validationFailures: issues.length,
		requests
	})
);
assert(
	passed,
	'Expected one valid project, one goal, and three task outcomes; see retained report'
);
