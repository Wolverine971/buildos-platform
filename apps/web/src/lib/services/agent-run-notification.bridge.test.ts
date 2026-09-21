// apps/web/src/lib/services/agent-run-notification.bridge.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { notificationStore } from '$lib/stores/notification.store';
import { agentRunsStore, type AgentRunRow } from './agentRunsRealtime.service';
import {
	destroyAgentRunNotificationBridge,
	initAgentRunNotificationBridge
} from './agent-run-notification.bridge';

vi.mock('$lib/stores/toast.store', () => ({
	toastService: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

function run(status: AgentRunRow['status'], review = false): AgentRunRow {
	return {
		id: 'run-1',
		label: 'Review project',
		goal: 'Update project context',
		status,
		context_type: 'project',
		project_id: 'project-1',
		trigger: 'chat',
		scope_mode: 'read_write',
		review_required: true,
		created_at: '2026-09-21T12:00:00Z',
		updated_at: `2026-09-21T12:0${status === 'proposal_ready' ? 0 : 1}:00Z`,
		result: review
			? {
					proposed_changes: {
						run_id: 'run-1',
						status: 'pending',
						created_at: '2026-09-21T12:00:00Z',
						changes: [
							{
								id: 'change-1',
								op: 'onto.task.update',
								action: 'update',
								entity_type: 'task',
								after: { title: 'New title' }
							}
						]
					}
				}
			: null
	} as AgentRunRow;
}

describe('agent run review notifications', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		notificationStore.clear();
		agentRunsStore.set(new Map());
		initAgentRunNotificationBridge();
	});

	afterEach(() => {
		destroyAgentRunNotificationBridge();
		notificationStore.clear();
		agentRunsStore.set(new Map());
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('keeps an expanded failed review open after the terminal update timer expires', () => {
		agentRunsStore.set(new Map([['run-1', run('proposal_ready', true)]]));
		const id = [...get(notificationStore).notifications.keys()][0]!;
		notificationStore.expand(id);
		agentRunsStore.set(new Map([['run-1', run('partial', true)]]));
		vi.advanceTimersByTime(5000);
		expect(get(notificationStore).expandedId).toBe(id);
		expect(get(notificationStore).notifications.get(id)?.isMinimized).toBe(false);
	});

	it('still minimizes ordinary completed work after the terminal update timer expires', () => {
		agentRunsStore.set(new Map([['run-1', run('running')]]));
		const id = [...get(notificationStore).notifications.keys()][0]!;
		notificationStore.expand(id);
		agentRunsStore.set(new Map([['run-1', run('completed')]]));
		vi.advanceTimersByTime(5000);
		expect(get(notificationStore).expandedId).toBeNull();
		expect(get(notificationStore).notifications.get(id)?.isMinimized).toBe(true);
	});
});
