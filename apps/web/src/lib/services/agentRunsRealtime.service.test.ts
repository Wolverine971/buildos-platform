import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentRunStatus } from '@buildos/shared-types';
import {
	activeAgentRunCount,
	agentRunNeedsInputCount,
	agentRunsStore,
	agentWorkAttentionCount,
	workingAgentRunCount,
	type AgentRunRow
} from './agentRunsRealtime.service';

function run(id: string, status: AgentRunStatus): AgentRunRow {
	return { id, status } as AgentRunRow;
}

describe('agent run navigation counts', () => {
	afterEach(() => {
		agentRunsStore.set(new Map());
	});

	it('keeps proposal reviews out of working and Work-attention badges', () => {
		agentRunsStore.set(
			new Map([
				['queued', run('queued', 'queued')],
				['running', run('running', 'running')],
				['paused', run('paused', 'paused')],
				['input', run('input', 'needs_input')],
				['proposal', run('proposal', 'proposal_ready')],
				['complete', run('complete', 'completed')]
			])
		);

		expect(get(activeAgentRunCount)).toBe(5);
		expect(get(workingAgentRunCount)).toBe(3);
		expect(get(agentRunNeedsInputCount)).toBe(1);
		expect(get(agentWorkAttentionCount)).toBe(4);
	});
});
