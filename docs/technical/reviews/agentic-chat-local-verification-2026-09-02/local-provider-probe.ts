// docs/technical/reviews/agentic-chat-local-verification-2026-09-02/local-provider-probe.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { buildLitePromptEnvelope } from '/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts';
import { AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY } from '@buildos/agentic-chat-runtime/catalog';
import { AgenticChatTurnProviderAdapter } from '/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/turn-provider.ts';
import { AgenticChatOpenRouterClient } from '/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts';
import { AgenticChatProviderCapacity } from '/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/provider-capacity.ts';
import { GPT_56_LUNA_MODEL } from '@buildos/smart-llm';

// Real prompt builder, provider adapter, state machine, and transport. All tool
// effects and usage observations stay in this process. No database client exists.
const secretLine = readFileSync('/Users/djwayne/buildos-platform/apps/web/.env', 'utf8')
	.split('\n')
	.find((l) => l.startsWith('PRIVATE_OPENROUTER_API_KEY='));
const apiKey = secretLine
	?.split('=')
	.slice(1)
	.join('=')
	.trim()
	.replace(/^(['"])(.*)\1$/, '$2');
assert(apiKey);
const projectId = '41000000-0000-4000-8000-000000000001';
const firstTaskId = '42000000-0000-4000-8000-000000000001';
const secondTaskId = '42000000-0000-4000-8000-000000000002';
const model = 'deepseek/deepseek-v4-flash';
const wanted = [
	'get_project_overview',
	'list_onto_tasks',
	'create_onto_task',
	'update_onto_task',
	'declare_turn_contract',
	'request_turn_clarification'
];
const definitions = wanted.map((name) => {
	const definition = AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY.find((t) => t.function.name === name);
	assert(definition, name);
	return definition;
});
const scenarios = [
	{
		id: 'text-only',
		message: 'Reply with exactly LOCAL SMOKE OK. Do not use tools.',
		check(r: any) {
			assert.equal(r.text.trim(), 'LOCAL SMOKE OK');
			assert.equal(r.calls.length, 0);
		}
	},
	{
		id: 'read-only',
		message:
			'How many tasks are open in this project, and what are their names? Check the actual task list. Do not change anything.',
		check(r: any) {
			assert(r.calls.some((s: any) => s.toolName === 'list_onto_tasks'));
			assert.equal(r.writes.length, 0);
			assert.match(r.text, /welcome email/i);
			assert.match(r.text, /landing page/i);
			assert.equal(r.requests.filter((s: any) => s.role.includes('review')).length, 0);
		}
	},
	{
		id: 'single-create',
		message:
			'Add a task titled Proofread launch checklist with priority 2 in this project. Do not change anything else.',
		check(r: any) {
			assert.equal(r.writes.length, 1);
			assert.equal(r.writes[0].arguments.title, 'Proofread launch checklist');
			assert.equal(r.writes[0].arguments.priority, 2);
			assert.equal(r.requests.filter((s: any) => s.role.includes('review')).length, 0);
		}
	},
	{
		id: 'exact-update',
		message: `Mark task ${firstTaskId} (Draft welcome email) done. Change only its state.`,
		check(r: any) {
			assert.equal(r.writes.length, 1);
			assert.equal(r.writes[0].arguments.task_id, firstTaskId);
			assert.equal(r.writes[0].arguments.state_key, 'done');
			assert.equal(r.requests.filter((s: any) => s.role.includes('review')).length, 0);
		}
	},
	{
		id: 'ambiguous-target',
		ambiguous: true,
		message: 'Mark the email task done.',
		check(r: any) {
			assert.equal(r.writes.length, 0);
			assert.match(r.text, /\?|which|clarif/i);
		}
	},
	{
		id: 'complex-four-creates',
		message:
			'Add exactly four independent tasks named Draft A, Draft B, Draft C, and Draft D in this project. Give each priority 3. Do not create any other entities.',
		check(r: any) {
			assert.equal(r.writes.length, 4);
			assert.deepEqual(r.writes.map((s: any) => s.arguments.title).sort(), [
				'Draft A',
				'Draft B',
				'Draft C',
				'Draft D'
			]);
			assert(r.calls.some((s: any) => s.toolName === 'approve_turn_contract_review'));
			assert(r.calls.some((s: any) => s.toolName === 'approve_mutation_batch_review'));
		}
	}
];
const reports: any[] = [];
for (const scenario of scenarios.filter(
	(s) => !process.env.LOCAL_SMOKE_ONLY || s.id === process.env.LOCAL_SMOKE_ONLY
)) {
	const started = Date.now();
	const usage: any[] = [];
	const requests: any[] = [];
	const calls: any[] = [];
	const writes: any[] = [];
	const tasks = [
		{
			id: firstTaskId,
			project_id: projectId,
			title: 'Draft welcome email',
			state_key: 'todo',
			priority: 3
		},
		{
			id: secondTaskId,
			project_id: projectId,
			title: scenario.ambiguous ? 'Send follow-up email' : 'Build landing page',
			state_key: 'todo',
			priority: 3
		}
	];
	const guardedFetch: typeof fetch = async (input, init) => {
		const url =
			typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		assert.equal(
			new URL(url).origin,
			'https://openrouter.ai',
			'Live probe may only contact its model provider'
		);
		return fetch(input, init);
	};
	const makeClient = (routeModel: string) =>
		new AgenticChatOpenRouterClient(
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
						model: routeModel,
						providerRouting: {
							allow_fallbacks: true,
							...(process.env.LOCAL_SMOKE_PRODUCTION_ROUTING === 'true'
								? {
										order:
											routeModel === model
												? ['deepinfra', 'deepseek', 'alibaba', 'cloudflare']
												: ['openai', 'azure']
									}
								: {})
						}
					}
				],
				httpReferer: 'https://build-os.com',
				appName: 'BuildOS Local In-Memory Smoke',
				fetchImpl: guardedFetch,
				requestTimeoutMs: 45000
			}
		);
	const instrument = (client: any) => ({
		rejectRepeatedInvalidToolResponse(input: any) {
			client.rejectRepeatedInvalidToolResponse?.(input);
		},
		stream(input: any) {
			requests.push({
				role: input.passRole ?? 'acting',
				round: input.logicalProviderRound,
				toolChoice: input.toolChoice,
				toolNames: input.tools.map((t: any) => t.function.name),
				chars: input.messages.reduce((n: number, m: any) => n + JSON.stringify(m).length, 0)
			});
			return client.stream(input);
		}
	});
	const provider = new AgenticChatTurnProviderAdapter(
		{
			client: instrument(makeClient(model)),
			semanticReviewer: instrument(makeClient(GPT_56_LUNA_MODEL)),
			capacity: new AgenticChatProviderCapacity({ configured: true, concurrency: 1 })
		},
		2000,
		16,
		{ createOntoTask: true, updateOntoTask: true }
	);
	const envelope = buildLitePromptEnvelope({
		contextType: 'project',
		projectId,
		entityId: projectId,
		projectName: 'Local newsletter fixture',
		currentUserMessage: scenario.message,
		now: '2026-09-02T21:00:00-04:00',
		timezone: 'America/New_York',
		tools: definitions,
		scaffold: { dynamicSkillTools: false },
		data: {
			project: {
				id: projectId,
				name: 'Local newsletter fixture',
				description: 'Launch a newsletter for new subscribers',
				state_key: 'active'
			},
			tasks
		}
	});
	const input: any = {
		claim: {
			outcome: 'claimed',
			executionMayStart: true,
			turnRunId: randomUUID(),
			queueJobId: randomUUID(),
			sessionId: randomUUID(),
			userId: randomUUID(),
			correlationId: randomUUID(),
			executionGeneration: 1,
			status: 'running',
			inputArtifactId: randomUUID(),
			userMessageId: randomUUID()
		},
		streamRunId: randomUUID(),
		clientTurnId: randomUUID(),
		requestPayload: {
			message: scenario.message,
			attachments: [],
			context: { type: 'project', entityId: projectId, projectId }
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
				surfaceProfile: 'project_write',
				systemPrompt: envelope.systemPrompt,
				promptSections: [],
				toolSurface: { surfaceProfile: 'project_write', toolNames: wanted, definitions }
			},
			createdAt: new Date().toISOString(),
			retainUntil: new Date(Date.now() + 86400000).toISOString(),
			contentHash: '0'.repeat(64)
		}
	};
	let invocation: any;
	let text = '';
	let finished = false;
	let error: any = null;
	try {
		invocation = await provider.prepare({
			executionInput: input,
			processingToken: randomUUID(),
			signal: AbortSignal.timeout(150000),
			budget: { deadlineAtMs: Date.now() + 145000 }
		});
		let stream = invocation.stream();
		for (let round = 1; round <= 16; round++) {
			const results: any[] = [];
			for await (const step of stream) {
				if (step.type === 'text_delta') text += step.text;
				if (step.type === 'finish') finished = true;
				if (!['read_tool', 'mutating_tool'].includes(step.type)) continue;
				calls.push(step);
				if (step.validationFailure) continue;
				let result: any = { status: 'declared' };
				if (step.toolName === 'list_onto_tasks')
					result = { tasks: structuredClone(tasks), total: tasks.length };
				else if (step.toolName === 'get_project_overview')
					result = {
						project: { id: projectId, name: 'Local newsletter fixture' },
						tasks: structuredClone(tasks),
						task_count: tasks.length
					};
				else if (step.toolName === 'request_turn_clarification')
					result = {
						status: 'clarification_required',
						question: step.arguments.question,
						requires_user_action: true
					};
				else if (step.toolName === 'approve_turn_contract_review')
					result = {
						status: 'turn_contract_review_approved',
						contract_sha256: step.arguments.contract_sha256
					};
				else if (step.toolName === 'approve_mutation_batch_review')
					result = {
						status: 'mutation_batch_review_approved',
						batch_sha256: step.arguments.batch_sha256
					};
				else if (step.toolName === 'create_onto_task') {
					assert.equal(step.arguments.project_id, projectId);
					const task = { id: randomUUID(), state_key: 'todo', ...step.arguments };
					tasks.push(task);
					result = { task, task_id: task.id, message: 'Task created successfully.' };
					writes.push(step);
				} else if (step.toolName === 'update_onto_task') {
					const task = tasks.find((t) => t.id === step.arguments.task_id);
					assert(task, 'Fixture mutation must target an existing task');
					Object.assign(task, step.arguments);
					result = { task: structuredClone(task), message: 'Task updated successfully.' };
					writes.push(step);
				} else
					assert(
						[
							'declare_turn_contract',
							'request_proposal_revision',
							'declare_read_only_turn',
							'cancel_turn_contract'
						].includes(step.toolName),
						'Unexpected tool ' + step.toolName
					);
				const isMutation = step.type === 'mutating_tool';
				results.push({
					providerToolCallId: step.providerToolCallId,
					toolName: step.toolName,
					arguments: step.arguments,
					execution: step.memoServed ?? {
						result,
						executionTimeMs: 1,
						tokensConsumed: null,
						affectedEntities: [],
						toolCategory: isMutation ? 'ontology_action' : 'utility',
						resultCount: isMutation ? null : 1,
						zeroResult: isMutation ? null : false,
						requiresUserAction: step.toolName === 'request_turn_clarification'
					},
					...(isMutation
						? {
								mutation: {
									effectId: randomUUID(),
									logicalOperationId: step.logicalOperationId,
									operationName: step.operationName,
									replayed: false
								}
							}
						: {})
				});
			}
			if (finished) break;
			assert(results.length, 'Provider stopped without finish or executable tools');
			stream = invocation.continueWithToolResults({ round: round + 1, results });
		}
		assert(finished, 'No terminal finish');
		assert(text.trim(), 'No assistant answer');
		scenario.check({ text, calls, writes, requests });
	} catch (e: any) {
		error = { message: e.message, code: e.code, stack: e.stack };
	} finally {
		invocation?.release();
	}
	const report = {
		id: scenario.id,
		passed: !error,
		elapsedMs: Date.now() - started,
		message: scenario.message,
		text,
		requests,
		calls,
		writes,
		usage,
		error
	};
	reports.push(report);
	writeFileSync(
		process.env.LOCAL_SMOKE_OUTPUT || '/tmp/agentic-local-live-20260903.json',
		JSON.stringify(
			{
				model,
				reviewer: GPT_56_LUNA_MODEL,
				scope: 'local provider and prompt source; in-memory tools; no Supabase or queue',
				reports
			},
			null,
			2
		)
	);
	console.info(
		JSON.stringify({
			id: report.id,
			passed: report.passed,
			elapsedMs: report.elapsedMs,
			text,
			tools: calls.map((s) => s.toolName),
			requests: requests.map((s) => s.role),
			error
		})
	);
}
process.exitCode = reports.some((r) => !r.passed) ? 1 : 0;
