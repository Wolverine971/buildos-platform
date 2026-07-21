// apps/worker/tests/agentRunAttemptKeys.test.ts
//
// Budgeted-reservation attempt keys must include the job's retry ordinal so a
// queue retry of the SAME job reserves fresh budget instead of colliding with the
// prior attempt's ledger entry (duplicate_attempt), while remaining stable within
// a single job run per iteration/stage/tool call.
import { describe, expect, it } from 'vitest';
import {
	deepResearchAttemptKey,
	toolAttemptKey,
	turnAttemptKey
} from '../src/workers/agent-run/agentRunWorker';

const JOB = 'agent_run_abc';

describe('agent run attempt keys', () => {
	it('embeds the job retry ordinal in every key shape', () => {
		expect(turnAttemptKey(JOB, 0, 3)).toBe(`llm:${JOB}:a0:turn:3`);
		expect(deepResearchAttemptKey(JOB, 0, 'synthesis')).toBe(
			`llm:${JOB}:a0:deep-research:synthesis`
		);
		expect(toolAttemptKey(JOB, 0, 2, 'util.web.search')).toBe(
			`tool:${JOB}:a0:2:util.web.search`
		);
	});

	it('changes the key across a retry of the same job (fresh reservation)', () => {
		expect(turnAttemptKey(JOB, 0, 3)).not.toBe(turnAttemptKey(JOB, 1, 3));
		expect(deepResearchAttemptKey(JOB, 0, 'plan')).not.toBe(
			deepResearchAttemptKey(JOB, 1, 'plan')
		);
		expect(toolAttemptKey(JOB, 0, 2, 'util.web.search')).not.toBe(
			toolAttemptKey(JOB, 1, 2, 'util.web.search')
		);
	});

	it('is stable within a single job run per iteration / stage / tool call', () => {
		expect(turnAttemptKey(JOB, 2, 5)).toBe(turnAttemptKey(JOB, 2, 5));
		expect(turnAttemptKey(JOB, 2, 5)).not.toBe(turnAttemptKey(JOB, 2, 6));
		expect(deepResearchAttemptKey(JOB, 2, 'plan')).not.toBe(
			deepResearchAttemptKey(JOB, 2, 'synthesis')
		);
		expect(toolAttemptKey(JOB, 2, 3, 'util.web.search')).not.toBe(
			toolAttemptKey(JOB, 2, 4, 'util.web.search')
		);
	});
});
