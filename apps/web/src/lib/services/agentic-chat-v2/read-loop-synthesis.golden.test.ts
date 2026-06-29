// apps/web/src/lib/services/agentic-chat-v2/read-loop-synthesis.golden.test.ts
//
// GOLDEN CHARACTERIZATION TESTS — Tier 3 item 8 (read-loop / force-synthesis).
//
// These tests lock in *when a no-tool synthesis pass is forced today*, driving the
// real streamFastChat round loop. They are the behavior-preservation contract for any
// future consolidation of the three overlapping force-synthesis detectors
// (read-loop-escalation, context-gathering-ledger, deterministic-supervisor).
//
// The numbers asserted here are a SNAPSHOT of current behavior, not a spec. If a
// consolidation changes them, that is a deliberate decision to review against the
// weak-model reliability bar — not something to silently re-baseline.
//
// Observable: streamFastChat returns `llmPasses` (each pass carries
// `forcedNoToolSynthesis` when tools were withheld) and `toolRounds`. A forced
// synthesis pass is the orchestrator telling the model "stop calling tools, answer now."

import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import { streamFastChat } from './stream-orchestrator/index';
import { materializeGatewayTools } from '$lib/services/agentic-chat/tools/core/gateway-surface';

const PROJECT_UUID = '4cfdbed1-840a-4fe4-9751-77c7884daa70';
const TASK_UUID = '881823a4-e74e-48d2-bf3e-b77db7e47b5f';

function tools(names: string[]): ChatToolDefinition[] {
	return materializeGatewayTools([], names).tools;
}

function toolCall(name: string, args: Record<string, unknown>, id: string): ChatToolCall {
	return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

type RoundPlan = {
	// Tool the model calls on this tools-enabled pass.
	call: ChatToolCall;
	// Result payload the executor returns for that call.
	result: unknown;
	success?: boolean;
};

/**
 * Drives streamFastChat through a scripted sequence of tool rounds. On each
 * tools-enabled pass it issues the planned tool call for that round; on a
 * tools-withheld (forced synthesis) pass it emits a final answer. Returns the
 * round at which synthesis was forced plus the raw passes for inspection.
 */
async function runScriptedLoop(opts: {
	launchTools: string[];
	plan: (round: number) => RoundPlan;
	safetyCap?: number;
}): Promise<{
	toolRounds: number;
	forcedSynthesisPassIndex: number;
	totalPasses: number;
	finalText: string;
}> {
	const safetyCap = opts.safetyCap ?? 25;
	let round = 0;
	const plansByCallId = new Map<string, RoundPlan>();

	const llm = {
		streamText: vi.fn(async function* (args: { tools?: unknown[] }) {
			const hasTools = Array.isArray(args.tools) && args.tools.length > 0;
			if (!hasTools) {
				// Forced no-tool synthesis pass (or natural final pass).
				yield { type: 'text', content: 'Final synthesized answer.' };
				yield { type: 'done', finished_reason: 'stop' };
				return;
			}
			round += 1;
			if (round > safetyCap) {
				yield { type: 'text', content: 'safety cap reached' };
				yield { type: 'done', finished_reason: 'stop' };
				return;
			}
			const plan = opts.plan(round);
			plansByCallId.set(plan.call.id, plan);
			yield { type: 'tool_call', tool_call: plan.call };
			yield { type: 'done', finished_reason: 'tool_calls' };
		})
	} as any;

	const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
		const plan = plansByCallId.get(call.id);
		return {
			tool_call_id: call.id,
			result: plan?.result ?? { ok: true },
			success: plan?.success ?? true
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
		message: 'Look into this project.',
		tools: tools(opts.launchTools),
		toolExecutor,
		onDelta: async () => {}
	});

	const passes = (result.llmPasses ?? []) as Array<{ forcedNoToolSynthesis?: boolean }>;
	const forcedSynthesisPassIndex = passes.findIndex((p) => p?.forcedNoToolSynthesis === true);

	return {
		toolRounds: result.toolRounds ?? 0,
		forcedSynthesisPassIndex,
		totalPasses: passes.length,
		finalText: result.finalAssistantText ?? ''
	};
}

// Distinct read tools so we can vary the per-round op-set and avoid the
// "same read op repeated" trigger when we want to isolate other detectors.
const READ_TOOLS = [
	'search_onto_projects',
	'search_all_projects',
	'get_project_overview',
	'get_workspace_overview'
];

function rotatingReadCall(round: number): ChatToolCall {
	const name = READ_TOOLS[(round - 1) % READ_TOOLS.length];
	return toolCall(name, { query: `q${round}` }, `read:${round}`);
}

// Search-only rotation: alternating ops (so the repeated-op trigger stays dormant)
// AND no detail "get_*" reads (so re-opening an already-seen id can't reset the
// low-novelty counter). Lets the ledger's low-novelty path fire in isolation.
const SEARCH_TOOLS = ['search_onto_projects', 'search_all_projects'];

function rotatingSearchCall(round: number): ChatToolCall {
	const name = SEARCH_TOOLS[(round - 1) % SEARCH_TOOLS.length];
	return toolCall(name, { query: `q${round}` }, `read:${round}`);
}

function novelId(round: number): string {
	return `00000000-0000-4000-8000-${String(round).padStart(12, '0')}`;
}

describe('force-synthesis golden behavior (Tier 3 item 8 baseline)', () => {
	// Trigger: repeatedReadOpSetCount >= 3 (index.ts ~1388). The model repeats the
	// SAME read op 3 rounds running — the most common real-world read loop.
	it('repeating the same read op forces synthesis at round 3', async () => {
		const out = await runScriptedLoop({
			launchTools: ['skill_search', 'search_onto_projects'],
			plan: (round) => ({
				call: toolCall('search_onto_projects', { query: `q${round}` }, `read:${round}`),
				result: { id: novelId(round) } // novelty irrelevant: repeated-op fires first
			})
		});

		expect(out.forcedSynthesisPassIndex).toBeGreaterThanOrEqual(0);
		expect(out.toolRounds).toBe(3);
		expect(out.finalText).toBe('Final synthesized answer.');
	});

	// Trigger: context-gathering ledger low-novelty path (lowNoveltyRounds >= 3).
	// Search-only varied ops + same id every round => no new evidence after round 1.
	it('gateway loop with LOW-NOVELTY search results forces synthesis via the ledger at round 4', async () => {
		const out = await runScriptedLoop({
			launchTools: ['skill_search', ...SEARCH_TOOLS],
			plan: (round) => ({
				call: rotatingSearchCall(round),
				result: { id: '11111111-1111-4111-8111-111111111111' } // same id every round
			})
		});

		expect(out.forcedSynthesisPassIndex).toBeGreaterThanOrEqual(0);
		expect(out.toolRounds).toBe(4);
		expect(out.finalText).toBe('Final synthesized answer.');
	});

	// Trigger: read-round count cap (escalation must_synthesize / supervisor readRounds).
	// Varied ops + novel ids keep repeated-op and low-novelty dormant.
	it('gateway loop with varied ops and NOVEL results forces synthesis at the read-round cap', async () => {
		const out = await runScriptedLoop({
			launchTools: ['skill_search', ...READ_TOOLS],
			plan: (round) => ({ call: rotatingReadCall(round), result: { id: novelId(round) } })
		});

		expect(out.forcedSynthesisPassIndex).toBeGreaterThanOrEqual(0);
		expect(out.toolRounds).toBe(8);
		expect(out.finalText).toBe('Final synthesized answer.');
	});

	// Only the always-on deterministic supervisor can force synthesis (no discovery
	// tool => gatewayModeActive false => ledger + escalation OFF).
	it('NON-gateway read loop forces synthesis via the supervisor alone', async () => {
		const out = await runScriptedLoop({
			launchTools: [...READ_TOOLS],
			plan: (round) => ({ call: rotatingReadCall(round), result: { id: novelId(round) } })
		});

		expect(out.forcedSynthesisPassIndex).toBeGreaterThanOrEqual(0);
		expect(out.toolRounds).toBe(8);
		expect(out.finalText).toBe('Final synthesized answer.');
	});

	// A write flips hasWriteAttempt (sticky) and resets the read-only counters, so the
	// gateway read-loop detectors stop running for the rest of the turn. Synthesis then
	// comes only from the always-on supervisor — later than the pure read loop.
	it('a write round resets read-loop pressure (gateway block sticky-disabled after a write)', async () => {
		const out = await runScriptedLoop({
			launchTools: ['skill_search', ...READ_TOOLS, 'update_onto_task'],
			plan: (round) => {
				if (round === 3) {
					return {
						call: toolCall(
							'update_onto_task',
							{ task_id: TASK_UUID, state_key: 'in_progress' },
							`write:${round}`
						),
						result: { ok: true, id: TASK_UUID }
					};
				}
				return { call: rotatingReadCall(round), result: { id: novelId(round) } };
			}
		});

		// Fires much later than the pure read loop (8): the write at round 3 reset the
		// counters and sticky-disabled the gateway read-loop block, so only the
		// always-on supervisor remains to force synthesis.
		expect(out.forcedSynthesisPassIndex).toBeGreaterThanOrEqual(0);
		expect(out.toolRounds).toBe(15);
		expect(out.finalText).toBe('Final synthesized answer.');
	});
});
