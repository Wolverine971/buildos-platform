// apps/web/src/lib/components/agent/project-creation-recovery.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentChatSessionSnapshot } from './agent-chat-session';
import { checkProjectCreation, projectCreationProgress } from './project-creation-recovery';

const { probe, load } = vi.hoisted(() => ({ probe: vi.fn(), load: vi.fn() }));
vi.mock('./agent-chat-session', () => ({
	probeActiveTurnRun: probe,
	loadAgentChatSessionSnapshot: load
}));

function snapshot(entities: unknown[] = [], active = false): AgentChatSessionSnapshot {
	return {
		activeTurnRun: active ? { id: 'turn' } : null,
		messages: [{ type: 'created_entities', data: { entities } }]
	} as AgentChatSessionSnapshot;
}

describe('project creation recovery', () => {
	beforeEach(() => vi.clearAllMocks());
	it('uses only saved project creation evidence and deduplicates receipts', () => {
		expect(
			projectCreationProgress(
				snapshot([
					{ kind: 'task', id: 'task', projectId: 'other-project' },
					{ kind: 'project', id: 'project' },
					{ kind: 'project', id: 'project' },
					{ kind: 'project', id: '' },
					null
				])
			)
		).toEqual({ status: 'saved', projectIds: ['project'] });
	});
	it('does not treat a question, update, or empty session as a created project', () => {
		expect(
			projectCreationProgress(snapshot([{ kind: 'task', id: 'task', projectId: 'existing' }]))
		).toEqual({ status: 'review' });
	});
	it('waits for an active restored turn even when partial creation already exists', () => {
		expect(
			projectCreationProgress(snapshot([{ kind: 'project', id: 'project' }], true))
		).toEqual({ status: 'working' });
	});
	it('probes cheaply while work is active and forwards cancellation', async () => {
		probe.mockResolvedValue({ hasActiveTurnRun: true });
		const { signal } = new AbortController();
		expect(await checkProjectCreation('session', signal)).toEqual({ status: 'working' });
		expect(probe).toHaveBeenCalledWith('session', { signal });
		expect(load).not.toHaveBeenCalled();
	});
	it('does not interpret an unavailable worker probe as completion', async () => {
		probe.mockResolvedValue(null);
		await expect(
			checkProjectCreation('session', new AbortController().signal)
		).rejects.toThrow();
		expect(load).not.toHaveBeenCalled();
	});
	it('loads the persisted result after the worker finishes, without resubmitting', async () => {
		probe.mockResolvedValue({ hasActiveTurnRun: false });
		load.mockResolvedValue(snapshot([{ kind: 'project', id: 'project' }]));
		const { signal } = new AbortController();
		expect(await checkProjectCreation('session', signal)).toEqual({
			status: 'saved',
			projectIds: ['project']
		});
		expect(load).toHaveBeenCalledWith('session', { signal });
	});
});
