// packages/agentic-chat-runtime/src/loop/context-gathering-ledger.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall } from '@buildos/shared-types';
import {
	ContextGatheringLedger,
	type ContextGatheringObservation
} from './context-gathering-ledger';
import type { RoundToolPattern } from './round-analysis';
import type { FastToolExecution } from './shared';
import { provideAgenticChatLoopToolCatalog } from './tool-catalog';

provideAgenticChatLoopToolCatalog(() => ({
	ops: {},
	byToolName: {
		get_project_overview: {
			op: 'get_project_overview',
			tool_name: 'get_project_overview',
			kind: 'read'
		},
		search_project: { op: 'search_project', tool_name: 'search_project', kind: 'read' },
		web_search: { op: 'web_search', tool_name: 'web_search', kind: 'read' },
		update_onto_task: { op: 'update_onto_task', tool_name: 'update_onto_task', kind: 'write' }
	}
}));

function readExecution(
	toolName: string,
	args: Record<string, unknown>,
	result: unknown
): FastToolExecution {
	const toolCall: ChatToolCall = {
		id: `${toolName}:${JSON.stringify(args)}`,
		type: 'function',
		function: { name: toolName, arguments: JSON.stringify(args) }
	};
	return { toolCall, result: { tool_call_id: toolCall.id, success: true, result } };
}

const READ_PATTERN: RoundToolPattern = {
	readOps: ['get_project_overview'],
	researchOps: [],
	hasWriteOps: false
};
const MIXED_RESEARCH_PATTERN: RoundToolPattern = {
	readOps: ['get_project_overview'],
	researchOps: ['web_search'],
	hasWriteOps: false
};
const WRITE_PATTERN: RoundToolPattern = { readOps: [], researchOps: [], hasWriteOps: true };
const CONTROL_PATTERN: RoundToolPattern = { readOps: [], researchOps: [], hasWriteOps: false };

/** Drives the ledger the way turn-provider does: `toolRounds` counts read rounds since the last write. */
function driver(maxToolRounds = 12) {
	const ledger = new ContextGatheringLedger();
	let readRounds = 0;
	return {
		observe(
			pattern: RoundToolPattern,
			executions: FastToolExecution[] = [],
			liveContextUsage?: { status: 'ok' | 'near_limit' | 'over_budget' }
		): ContextGatheringObservation {
			if (pattern.hasWriteOps) readRounds = 0;
			else if (pattern.readOps.length > 0) readRounds += 1;
			return ledger.observeToolRound({
				roundExecutions: executions,
				roundPattern: pattern,
				toolRounds: readRounds,
				maxToolRounds,
				modelPayloadChars: 100,
				liveContextUsage: liveContextUsage
					? {
							estimatedTokens: 0,
							tokenBudget: 1,
							usagePercent: 0,
							tokensRemaining: 1,
							...liveContextUsage
						}
					: undefined
			});
		}
	};
}

// Fresh evidence every round keeps the novelty ladder open, so only the
// count floor can move the status.
function freshRead(round: number): FastToolExecution[] {
	return [
		readExecution(
			'get_project_overview',
			{ project_id: `project-${round}` },
			{ project: { id: `project-${round}` } }
		)
	];
}

describe('ContextGatheringLedger', () => {
	it('escalates on the read-round count floor when every round adds new evidence', () => {
		const turn = driver();
		const statuses: string[] = [];
		const messages: string[] = [];
		for (let round = 1; round <= 9; round += 1) {
			const observation = turn.observe(READ_PATTERN, freshRead(round));
			statuses.push(observation.status.status);
			if (observation.message) messages.push(observation.message);
		}
		expect(statuses).toEqual([
			'open',
			'open',
			'narrowing',
			'narrowing',
			'narrowing',
			'saturated',
			'saturated',
			'must_synthesize',
			'must_synthesize'
		]);
		// One message per level, none repeated, no counters.
		expect(messages).toEqual([
			expect.stringMatching(/^Context gathering: narrowing\./),
			expect.stringMatching(/^Context gathering: saturated\./),
			expect.stringMatching(/^Context gathering: must synthesize\./)
		]);
		for (const message of messages) expect(message).not.toMatch(/\d/);
		expect(messages.at(-1)).toContain('do not gather more context');
	});

	it('takes the higher of the novelty ladder and the count floor', () => {
		const turn = driver();
		const repeat = () => freshRead(1);
		expect(turn.observe(READ_PATTERN, repeat()).status.status).toBe('open');
		expect(turn.observe(READ_PATTERN, repeat()).status.status).toBe('narrowing');
		expect(turn.observe(READ_PATTERN, repeat()).status.status).toBe('saturated');
		const fourth = turn.observe(READ_PATTERN, repeat());
		expect(fourth.status.status).toBe('must_synthesize');
		expect(fourth.forceSynthesis).toBe(true);
	});

	it('never steps the status down between write rounds', () => {
		const turn = driver();
		turn.observe(READ_PATTERN, freshRead(1));
		turn.observe(READ_PATTERN, freshRead(1));
		turn.observe(READ_PATTERN, freshRead(1));
		expect(turn.observe(READ_PATTERN, freshRead(1)).status.status).toBe('must_synthesize');
		// New evidence after the hard stop does not reopen gathering, and the
		// message is not repeated.
		const later = turn.observe(READ_PATTERN, freshRead(2));
		expect(later.status.status).toBe('must_synthesize');
		expect(later.forceSynthesis).toBe(true);
		expect(later.message).toBeNull();
		// A control round leaves it where it is.
		expect(turn.observe(CONTROL_PATTERN).status.status).toBe('must_synthesize');
	});

	it('resets the whole ladder on a write round', () => {
		const turn = driver();
		for (let round = 1; round <= 8; round += 1) turn.observe(READ_PATTERN, freshRead(round));
		expect(turn.observe(WRITE_PATTERN).status.status).toBe('open');
		const afterWrite = turn.observe(READ_PATTERN, freshRead(9));
		expect(afterWrite.status.status).toBe('open');
		expect(afterWrite.forceSynthesis).toBe(false);
		expect(afterWrite.message).toBeNull();
		// The ladder can be climbed, and announced, again.
		turn.observe(READ_PATTERN, freshRead(10));
		expect(turn.observe(READ_PATTERN, freshRead(11)).message).toMatch(
			/^Context gathering: narrowing\./
		);
	});

	it('counts mixed read+research rounds toward the floor without a novelty signal', () => {
		const turn = driver();
		turn.observe(MIXED_RESEARCH_PATTERN, freshRead(1));
		turn.observe(MIXED_RESEARCH_PATTERN, freshRead(1));
		const third = turn.observe(MIXED_RESEARCH_PATTERN, freshRead(1));
		expect(third.status.status).toBe('narrowing');
		expect(third.status.lowNoveltyRounds).toBe(0);
		expect(third.status.reasons).toEqual(['3 read rounds without a write']);
	});

	it('forces synthesis when the configured round budget runs out', () => {
		const turn = driver(3);
		const first = turn.observe(READ_PATTERN, freshRead(1));
		expect(first.status.status).toBe('must_synthesize');
		expect(first.forceSynthesis).toBe(true);
		expect(first.status.reasons).toContain('2 tool rounds remain');
	});

	it('forces synthesis from an over-budget context snapshot on the first read round', () => {
		const turn = driver();
		const first = turn.observe(READ_PATTERN, freshRead(1), { status: 'over_budget' });
		expect(first.status.status).toBe('must_synthesize');
		expect(first.message).toMatch(/^Context gathering: must synthesize\./);
	});
});
