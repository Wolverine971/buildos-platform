// apps/web/src/lib/services/agent-run-notification-data.test.ts
import { describe, expect, it } from 'vitest';
import { buildAgentRunNotificationData } from './agent-run-notification-data';
import type { AgentRunRow } from './agentRunsRealtime.service';

function runRow(overrides: Partial<AgentRunRow> = {}): AgentRunRow {
	return {
		id: 'run-1',
		user_id: 'user-1',
		trigger: 'chat',
		label: 'Update project START HERE',
		goal: 'Review proposed Start Here updates captured from the completed chat.',
		instructions: null,
		expected_output: null,
		context_type: 'project',
		project_id: 'project-1',
		scope_mode: 'read_write',
		allowed_ops: null,
		review_required: true,
		status: 'partial',
		result: {
			summary: 'Review proposed Start Here updates captured from the completed chat.',
			answer: 'A Start Here document update is staged for review.'
		},
		metrics: null,
		change_set: null,
		error: null,
		budgets: {},
		parent_session_id: 'chat-session-1',
		parent_message_id: null,
		parent_run_id: null,
		operative_id: null,
		source_suggestion_id: null,
		source_decision: null,
		created_at: '2026-06-28T19:16:00.000Z',
		updated_at: '2026-06-28T19:18:00.000Z',
		started_at: '2026-06-28T19:16:05.000Z',
		completed_at: '2026-06-28T19:18:00.000Z',
		...overrides
	} as AgentRunRow;
}

describe('buildAgentRunNotificationData', () => {
	it('includes the parent chat session so status modals can reopen chat', () => {
		const data = buildAgentRunNotificationData(runRow());

		expect(data).toMatchObject({
			runId: 'run-1',
			trigger: 'chat',
			contextType: 'project',
			projectId: 'project-1',
			parentSessionId: 'chat-session-1'
		});
	});
});
