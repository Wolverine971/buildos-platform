// apps/web/src/lib/services/agentic-chat-v2/people-synthesis-timeout.regression.test.ts
// Recovery regression for the 2026-07-22 people-identification incident.
//
// Successful project reads are followed by forced no-tool synthesis and both
// stream attempts fail. The orchestrator must still terminate with a typed,
// visible degraded completion assembled from the evidence already collected.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import { materializeGatewayTools } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { streamFastChat } from './stream-orchestrator/index';
import {
	buildPeopleIncidentSearchResult,
	PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT
} from './test-fixtures/people-synthesis-timeout-2026-07-22';

function tools(names: string[]): ChatToolDefinition[] {
	return materializeGatewayTools([], names).tools;
}

function toolCall(name: string, args: Record<string, unknown>, id: string): ChatToolCall {
	return {
		id,
		type: 'function',
		function: { name, arguments: JSON.stringify(args) }
	};
}

async function runIncidentFailureScenario(params: {
	synthesisTextByAttempt?: string[];
	emptyEvidence?: boolean;
}) {
	let toolRound = 0;
	let synthesisAttempt = 0;
	const visibleDeltas: string[] = [];
	const llm = {
		streamText: vi.fn(async function* (args: { tools?: unknown[] }) {
			const hasTools = Array.isArray(args.tools) && args.tools.length > 0;
			if (!hasTools) {
				synthesisAttempt += 1;
				const partial = params.synthesisTextByAttempt?.[synthesisAttempt - 1];
				if (partial) yield { type: 'text', content: partial };
				yield {
					type: 'error',
					error: `LLM stream pass timed out after ${PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.observed.attemptTimeoutMs}ms`
				};
				return;
			}

			const search = PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.searches[toolRound];
			if (!search) throw new Error(`Unexpected tool round ${toolRound + 1}`);
			toolRound += 1;
			yield {
				type: 'tool_call',
				tool_call: toolCall(
					'search_project',
					{
						query: search.query,
						project_id: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.projectId
					},
					`people-search:${toolRound}`
				)
			};
			yield { type: 'done', finished_reason: 'tool_calls' };
		})
	} as any;

	let executedReadCount = 0;
	const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
		if (params.emptyEvidence) {
			executedReadCount += 1;
			return {
				tool_call_id: call.id,
				success: true,
				result: { results: [], total_returned: 0, maybe_more: false }
			};
		}
		const result = buildPeopleIncidentSearchResult(executedReadCount, call.id);
		executedReadCount += 1;
		return result;
	});

	const resultPromise = streamFastChat({
		llm,
		userId: 'synthetic-user',
		sessionId: 'synthetic-session',
		contextType: 'project',
		entityId: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.projectId,
		projectId: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.projectId,
		history: [],
		message: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.message,
		tools: tools(['skill_search', 'search_project']),
		toolExecutor,
		onDelta: async (content) => {
			visibleDeltas.push(content);
		}
	});
	await vi.runAllTimersAsync();
	return {
		result: await resultPromise,
		visibleDeltas,
		executedReadCount,
		synthesisAttempt
	};
}

describe('people synthesis timeout recovery (incident 2026-07-22, Phase 1)', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('returns deterministic evidence after successful reads and two synthesis timeouts', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);

		let toolRound = 0;
		let synthesisAttempt = 0;
		const synthesisRoutes: Array<Record<string, unknown>> = [];
		const visibleDeltas: string[] = [];
		const turnPhases: string[] = [];
		const llm = {
			streamText: vi.fn(async function* (args: {
				tools?: unknown[];
				models?: string[];
				providerRouting?: Record<string, unknown>;
				maxTokens?: number;
			}) {
				const hasTools = Array.isArray(args.tools) && args.tools.length > 0;
				if (!hasTools) {
					synthesisAttempt += 1;
					synthesisRoutes.push({
						models: args.models,
						providerRouting: args.providerRouting,
						maxTokens: args.maxTokens
					});
					yield {
						type: 'error',
						error: `LLM stream pass timed out after ${PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.observed.attemptTimeoutMs}ms`
					};
					return;
				}

				const search = PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.searches[toolRound];
				if (!search) throw new Error(`Unexpected tool round ${toolRound + 1}`);
				toolRound += 1;
				yield {
					type: 'tool_call',
					tool_call: toolCall(
						'search_project',
						{
							query: search.query,
							project_id: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.projectId
						},
						`people-search:${toolRound}`
					)
				};
				yield { type: 'done', finished_reason: 'tool_calls' };
			})
		} as any;

		let executedReadCount = 0;
		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			const result = buildPeopleIncidentSearchResult(executedReadCount, call.id);
			executedReadCount += 1;
			return result;
		});

		const resultPromise = streamFastChat({
			llm,
			userId: 'synthetic-user',
			sessionId: 'synthetic-session',
			contextType: 'project',
			entityId: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.projectId,
			projectId: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.projectId,
			history: [],
			message: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.message,
			tools: tools(['skill_search', 'search_project']),
			forcedSynthesisRouting: {
				variant: 'dedicated',
				models: ['family-a/model', 'family-b/model', 'family-c/model'],
				ignoredProviderSlugs: ['digitalocean'],
				maxTokens: 6000
			},
			toolExecutor,
			onDelta: async (content) => {
				visibleDeltas.push(content);
			},
			onPhase: async (phase) => {
				turnPhases.push(phase);
			}
		});
		await vi.runAllTimersAsync();
		const result = await resultPromise;

		expect(toolExecutor).toHaveBeenCalledTimes(
			PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.searches.length
		);
		expect(executedReadCount).toBe(PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.searches.length);
		expect(synthesisAttempt).toBe(PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.observed.streamAttempts);
		expect(synthesisRoutes).toEqual([
			{
				models: ['family-a/model', 'family-b/model', 'family-c/model'],
				providerRouting: { ignore: ['digitalocean'] },
				maxTokens: 6000
			},
			{
				models: ['family-b/model', 'family-c/model', 'family-a/model'],
				providerRouting: { ignore: ['digitalocean'] },
				maxTokens: 6000
			}
		]);
		expect(result.completionOutcome).toMatchObject({
			status: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.expectedRecoveryTerminal.outcome,
			answerSource: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.expectedRecoveryTerminal.answerSource,
			recovery: {
				outcome: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.expectedCurrentTerminal.outcome,
				evidenceToolExecutionCount: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.searches.length,
				measurements: {
					passRole: 'forced_synthesis',
					forcedNoToolSynthesis: true,
					attempts: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.observed.streamAttempts,
					maxAttempts: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.observed.streamAttempts,
					retryCount: 1,
					timeoutMs: PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.observed.attemptTimeoutMs,
					terminalEventReceived: false,
					assistantTextCharsReceived: 0,
					reasoningCharsReceived: 0,
					toolCallsReceived: 0,
					retryable: true,
					attemptsExhausted: true
				}
			}
		});
		expect(result.finishedReason).toBe('synthesis_recovered');
		expect(result.llmPasses).toHaveLength(
			PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.searches.length + 1
		);
		expect(result.llmPasses?.at(-1)).toMatchObject({
			passRole: 'forced_synthesis',
			forcedSynthesisRoutingVariant: 'dedicated',
			ignoredProviderSlugs: ['digitalocean'],
			maxTokens: 6000,
			retryModelRotation: true,
			attemptRoutes: [
				{
					attempt: 1,
					models: ['family-a/model', 'family-b/model', 'family-c/model']
				},
				{
					attempt: 2,
					models: ['family-b/model', 'family-c/model', 'family-a/model']
				}
			],
			terminalOutcome: 'timed_out',
			attempts: 2,
			streamRetryCount: 1,
			recoveredAsDegradedCompletion: true
		});
		expect(result.finalizationGuard).toMatchObject({
			applied: true,
			reason: 'empty_after_reads'
		});
		for (const candidate of ['Brian Hicks', 'Anton Gorshkov', 'Adam Eklund']) {
			expect(result.finalAssistantText).toContain(candidate);
		}
		for (const ambiguousName of PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.expectedRecoveryTerminal
			.mustQualifyAmbiguousNames) {
			expect(result.finalAssistantText).toMatch(
				new RegExp(`${ambiguousName}[^;.]*(ambiguous)`, 'i')
			);
		}
		expect(visibleDeltas.join('')).toContain('Brian Hicks');
		expect(result.orchestrationInterventions.synthesisTransportRecovery).toBe(true);
		expect(turnPhases).toEqual(['planning', 'gathering', 'synthesizing', 'recovering']);
	});

	it('preserves the longest usable partial answer across failed synthesis attempts', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const firstPartial = 'Brian Hicks appears to be the primary contact.';
		const recoveredPartial =
			'Relevant people include Brian Hicks, Anton Gorshkov, and Adam Eklund; Ryan and Curri remain ambiguous mentions.';

		const { result, visibleDeltas } = await runIncidentFailureScenario({
			synthesisTextByAttempt: [firstPartial, recoveredPartial]
		});

		expect(result.completionOutcome).toMatchObject({
			status: 'completed_degraded',
			answerSource: 'partial_model',
			recovery: {
				outcome: 'timed_out',
				measurements: {
					assistantTextCharsReceived: firstPartial.length + recoveredPartial.length
				}
			}
		});
		expect(result.finalAssistantText).toBe(recoveredPartial);
		expect(visibleDeltas.join('')).toBe(recoveredPartial);
		expect(result.finalizationGuard?.applied).not.toBe(true);
		expect(result.finishedReason).toBe('synthesis_recovered');
	});

	it('returns a precise no-evidence result instead of a generic stream error', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);

		const { result, visibleDeltas, executedReadCount } = await runIncidentFailureScenario({
			emptyEvidence: true
		});

		expect(executedReadCount).toBe(PEOPLE_SYNTHESIS_TIMEOUT_INCIDENT.searches.length);
		expect(result.completionOutcome).toMatchObject({
			status: 'completed_degraded',
			answerSource: 'precise_no_evidence',
			recovery: { outcome: 'timed_out' }
		});
		expect(result.finishedReason).toBe('synthesis_empty');
		expect(result.finalAssistantText).toContain('synthesis stream failed');
		expect(result.finalAssistantText).toContain('no safe deterministic evidence summary');
		expect(visibleDeltas.join('')).toBe(result.finalAssistantText);
	});

	it('rejects an unusable fragment and synthesizes from evidence instead', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);

		const { result, visibleDeltas } = await runIncidentFailureScenario({
			synthesisTextByAttempt: ['Here are', 'People:']
		});

		expect(result.completionOutcome).toMatchObject({
			status: 'completed_degraded',
			answerSource: 'deterministic_evidence',
			recovery: {
				measurements: {
					assistantTextCharsReceived: 'Here are'.length + 'People:'.length
				}
			}
		});
		expect(result.finalAssistantText).toContain('Brian Hicks');
		expect(result.finalAssistantText).not.toContain('Here are');
		expect(visibleDeltas.join('')).toBe(result.finalAssistantText);
	});
});
