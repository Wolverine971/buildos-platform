// apps/web/src/lib/services/agentic-chat-v2/empty-synthesis-retry.regression.test.ts
//
// REGRESSION - Empty no-tool synthesis recovery (incident 2026-06-23, Fix C).
//
// Repair plan: apps/web/docs/technical/audits/AGENTIC_CHAT_EMPTY_SYNTHESIS_REPAIR_PLAN_2026-06-23.md
//
// Incident shape (session 2af546cf-40a2-4db4-bf81-b88952c4a532):
//   - A project read loop forced a no-tool synthesis pass.
//   - That synthesis pass returned finished_reason=stop with NO visible text.
//   - The orchestrator did not retry (the old retry guard only fired for
//     finished_reason=tool_calls or suppressed tool calls), so it fell through to
//     markToolLimitReached('round') and the finalization guard persisted the
//     generic "I gathered the requested context..." (empty_after_reads) fallback.
//
// Fix C makes an empty synthesis pass retryable exactly once. These tests drive
// the real streamFastChat round loop and assert the recovered behavior.

import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import { streamFastChat } from './stream-orchestrator/index';
import { materializeGatewayTools } from '$lib/services/agentic-chat/tools/core/gateway-surface';

const PROJECT_UUID = '4cfdbed1-840a-4fe4-9751-77c7884daa70';
// The guide-suite task id from the incident trace (type: task).
const GUIDE_SUITE_TASK_ID = '82dfb1b6-e39d-48cb-8c32-d13c3e620daa';

function tools(names: string[]): ChatToolDefinition[] {
	return materializeGatewayTools([], names).tools;
}

function toolCall(name: string, args: Record<string, unknown>, id: string): ChatToolCall {
	return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

// Typed search payload shaped like the real /api/onto/search response for the
// incident: a guide-suite task cluster, no document hit.
const GUIDE_SUITE_SEARCH_RESULT = {
	query: 'user guide suite',
	search_scope: 'project',
	project_id: PROJECT_UUID,
	total_returned: 4,
	maybe_more: false,
	results: [
		{
			id: GUIDE_SUITE_TASK_ID,
			type: 'task',
			title: 'Create User Guide Suite (ADHD/TPM/Writers/Devs)',
			state_key: 'todo'
		},
		{
			id: '11111111-1111-4111-8111-111111111111',
			type: 'task',
			title: 'Create detailed BuildOS guide for people with ADHD',
			state_key: 'todo'
		},
		{
			id: '22222222-2222-4222-8222-222222222222',
			type: 'task',
			title: 'Create detailed BuildOS guides for Writers [MERGED]',
			state_key: 'done'
		},
		{
			id: '33333333-3333-4333-8333-333333333333',
			type: 'task',
			title: 'Create detailed BuildOS guides for Tech Project Managers [MERGED]',
			state_key: 'done'
		}
	],
	total: 4,
	message: 'Found 4 BuildOS matches. Use get_onto_*_details to load full records.'
};

const RECOVERED_ANSWER =
	'I found this as a task cluster, not a document. The parent task "Create User Guide ' +
	'Suite (ADHD/TPM/Writers/Devs)" is still todo. The ADHD guide is a todo child task; the ' +
	'Writers and Tech Project Managers guides are done/merged. TPM here means Technical Project Manager.';

/**
 * Drives streamFastChat through a project read loop that forces a no-tool
 * synthesis pass (repeated search_project op). The synthesis pass(es) emit empty
 * text for the first `emptyNoToolPasses` attempts, then a real answer.
 */
async function runIncidentLoop(opts: {
	emptyNoToolPasses: number;
	recoveredAnswer?: string;
}): Promise<{
	finishedReason: string;
	finalText: string;
	forcedSynthesisPassCount: number;
	finalizationGuardApplied: boolean;
	finalizationGuardReason?: string;
}> {
	let noToolPass = 0;
	let toolRound = 0;

	const llm = {
		streamText: vi.fn(async function* (args: { tools?: unknown[] }) {
			const hasTools = Array.isArray(args.tools) && args.tools.length > 0;
			if (!hasTools) {
				noToolPass += 1;
				if (noToolPass <= opts.emptyNoToolPasses) {
					// Incident mode: model "finishes" but produces no visible answer.
					yield { type: 'done', finished_reason: 'stop' };
					return;
				}
				yield { type: 'text', content: opts.recoveredAnswer ?? RECOVERED_ANSWER };
				yield { type: 'done', finished_reason: 'stop' };
				return;
			}
			// Tools-enabled pass: keep searching (still finding the same cluster).
			// Repeating the same read OP across rounds forces synthesis at round 3
			// (matches the golden read-loop test). The query varies per round so the
			// args-based round fingerprint differs and the byte-identical repetition
			// guard stays dormant; it is the semantic repeated-op detector we want.
			toolRound += 1;
			yield {
				type: 'tool_call',
				tool_call: toolCall(
					'search_project',
					{ query: `user guide suite ${toolRound}`, project_id: PROJECT_UUID },
					`search:${toolRound}`
				)
			};
			yield { type: 'done', finished_reason: 'tool_calls' };
		})
	} as any;

	const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
		return {
			tool_call_id: call.id,
			result: GUIDE_SUITE_SEARCH_RESULT,
			success: true
		};
	});

	const result = await streamFastChat({
		llm,
		userId: 'user_1',
		sessionId: 'session_1',
		contextType: 'project',
		entityId: PROJECT_UUID,
		projectId: PROJECT_UUID,
		history: [],
		message:
			'I need to create a user guide suite for all these people. I do not remember what I ' +
			'was doing with this task. Also, tell me what TPM is.',
		// project_basic launch surface plus a discovery tool so gatewayModeActive is
		// true and the gateway read-loop detectors run (as they do in production).
		tools: tools(['skill_search', 'search_project']),
		toolExecutor,
		onDelta: async () => {}
	});

	const passes = (result.llmPasses ?? []) as Array<{ forcedNoToolSynthesis?: boolean }>;
	const forcedSynthesisPassCount = passes.filter((p) => p?.forcedNoToolSynthesis === true).length;

	return {
		finishedReason: result.finishedReason ?? '',
		finalText: result.finalAssistantText ?? '',
		forcedSynthesisPassCount,
		finalizationGuardApplied: result.finalizationGuard?.applied === true,
		finalizationGuardReason: result.finalizationGuard?.reason
	};
}

describe('empty no-tool synthesis retry (incident 2026-06-23, Fix C)', () => {
	it('retries an empty synthesis pass once and emits the recovered answer', async () => {
		const out = await runIncidentLoop({ emptyNoToolPasses: 1 });

		// The empty stop synthesis was retried, and the second pass answered.
		// (We assert on stable substrings rather than exact equality: the synthesized
		// text still passes through enforceMutationOutcomeIntegrity, which may reword
		// document/state claims; that pipeline is out of scope for Fix C.)
		expect(out.finishedReason).toBe('stop');
		expect(out.finalText.length).toBeGreaterThan(40);
		// The user's direct definition question is answered from the retry synthesis.
		expect(out.finalText).toContain('Technical Project Manager');
		// The recovered answer carries real read evidence, not the generic fallback.
		expect(out.finalText).toContain('task cluster');

		// Exactly two forced synthesis passes: the empty one plus the single retry.
		expect(out.forcedSynthesisPassCount).toBe(2);

		// No generic fallback was persisted.
		expect(out.finalizationGuardApplied).toBe(false);
		expect(out.finalText).not.toContain('I gathered the requested context');
	});

	it('does not retry more than once when every synthesis pass is empty', async () => {
		const out = await runIncidentLoop({ emptyNoToolPasses: 5 });

		// One retry only: the empty pass plus exactly one retry pass.
		expect(out.forcedSynthesisPassCount).toBe(2);

		// Both empty, so the finalization guard still produces the bounded fallback.
		expect(out.finishedReason).toBe('tool_round_limit');
		expect(out.finalizationGuardApplied).toBe(true);
		expect(out.finalizationGuardReason).toBe('empty_after_reads');
	});
});

describe('typed search result routing (incident 2026-06-23, Fix A/B)', () => {
	it('repairs a document-detail call made with a known task id and routes to task details', async () => {
		let streamInvocation = 0;
		const executedToolNames: string[] = [];
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_project',
							{ query: 'user guide suite', project_id: PROJECT_UUID },
							'search:user-guide-suite'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				if (streamInvocation === 2) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'get_document_outline',
							{ document_id: GUIDE_SUITE_TASK_ID },
							'outline:wrong-kind'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				if (streamInvocation === 3) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'get_onto_task_details',
							{ task_id: GUIDE_SUITE_TASK_ID },
							'task-details:guide-suite'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield {
					type: 'text',
					content:
						'I found this as a task, not a document. The parent task is still todo. TPM means Technical Project Manager.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			executedToolNames.push(call.function.name);
			if (call.function.name === 'search_project') {
				return {
					tool_call_id: call.id,
					result: GUIDE_SUITE_SEARCH_RESULT,
					success: true
				};
			}
			if (call.function.name === 'get_onto_task_details') {
				return {
					tool_call_id: call.id,
					result: {
						task: {
							id: GUIDE_SUITE_TASK_ID,
							type: 'task',
							title: 'Create User Guide Suite (ADHD/TPM/Writers/Devs)',
							state_key: 'todo'
						}
					},
					success: true
				};
			}
			return {
				tool_call_id: call.id,
				result: { status: 'unexpected_tool' },
				success: false,
				error: `Unexpected executor call: ${call.function.name}`
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: PROJECT_UUID,
			projectId: PROJECT_UUID,
			history: [],
			message:
				'I need to create a user guide suite for all these people. I do not remember what I was doing.',
			tools: tools(['skill_search', 'search_project', 'get_document_outline']),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(executedToolNames).toEqual(['search_project', 'get_onto_task_details']);
		expect(executedToolNames).not.toContain('get_document_outline');
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toContain('task, not a document');
		expect(result.finalAssistantText).toContain('Technical Project Manager');
	});
});
