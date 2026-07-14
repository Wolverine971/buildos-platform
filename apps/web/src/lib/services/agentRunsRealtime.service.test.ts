// apps/web/src/lib/services/agentRunsRealtime.service.test.ts
import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentRunStatus } from '@buildos/shared-types';
import {
	activeAgentRunCount,
	agentRunNeedsInputCount,
	agentRunsStore,
	agentWorkAttentionCount,
	mergeAgentRunRows,
	workingAgentRunCount,
	type AgentRunRow
} from './agentRunsRealtime.service';

function run(id: string, status: AgentRunStatus): AgentRunRow {
	return { id, status } as AgentRunRow;
}

function row(overrides: Partial<AgentRunRow>): AgentRunRow {
	return {
		id: 'run-1',
		status: 'running',
		updated_at: '2026-07-14T12:00:00.000Z',
		...overrides
	} as AgentRunRow;
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

describe('mergeAgentRunRows', () => {
	it('preserves the enriched project when a raw realtime row arrives', () => {
		const current = row({ project: { id: 'project-1', name: 'Author Training' } });
		const realtime = row({
			status: 'proposal_ready',
			updated_at: '2026-07-14T12:01:00.000Z'
		});

		expect(mergeAgentRunRows(current, realtime)).toMatchObject({
			status: 'proposal_ready',
			project: { id: 'project-1', name: 'Author Training' }
		});
	});

	it('accepts an explicit project value from an enriched endpoint row', () => {
		const current = row({ project: { id: 'project-1', name: 'Old name' } });
		const endpoint = row({ project: { id: 'project-1', name: 'New name' } });

		expect(mergeAgentRunRows(current, endpoint).project).toEqual({
			id: 'project-1',
			name: 'New name'
		});
	});
});
