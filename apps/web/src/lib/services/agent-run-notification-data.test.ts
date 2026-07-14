// apps/web/src/lib/services/agent-run-notification-data.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildAgentRunCardPreview,
	buildAgentRunNotificationData
} from './agent-run-notification-data';
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

	it('builds a project, action, target, and rationale preview from a proposed change', () => {
		const data = buildAgentRunNotificationData(
			runRow({
				status: 'proposal_ready',
				project: { id: 'project-1', name: 'Author Training' },
				change_set: {
					run_id: 'run-1',
					status: 'pending',
					created_at: '2026-07-14T12:00:00.000Z',
					changes: [
						{
							id: 'change-1',
							op: 'onto.document.update',
							entity_type: 'document',
							entity_id: 'document-1',
							action: 'update',
							before: { title: 'START HERE', project_id: 'project-1' },
							after: { document_id: 'document-1', content: 'New orientation notes' },
							rationale: 'Capture durable decisions and open questions from the chat.'
						}
					]
				}
			})
		);

		expect(data).toMatchObject({
			projectName: 'Author Training',
			activityLabel: 'Update document',
			targetLabel: 'START HERE',
			preview: 'Capture durable decisions and open questions from the chat.',
			entityType: 'document'
		});
	});

	it('identifies project audits when no entity operation is available yet', () => {
		const preview = buildAgentRunCardPreview(
			runRow({
				label: 'Complete Project Audit',
				goal: 'Inspect project health and recommend the next useful action.',
				allowed_ops: null,
				result: null,
				project: { id: 'project-1', name: 'Launch Alpha' },
				status: 'running'
			})
		);

		expect(preview).toEqual({
			projectName: 'Launch Alpha',
			activityLabel: 'Project audit',
			targetLabel: null,
			preview: 'Inspect project health and recommend the next useful action.',
			entityType: 'audit'
		});
	});
});
