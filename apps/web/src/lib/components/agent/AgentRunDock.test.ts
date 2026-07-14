// apps/web/src/lib/components/agent/AgentRunDock.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import AgentRunDock from './AgentRunDock.svelte';
import type { AgentRunRow } from '$lib/services/agentRunsRealtime.service';

function runRow(): AgentRunRow {
	return {
		id: 'run-1',
		label: 'Update project START HERE',
		goal: 'Review proposed Start Here updates captured from the completed chat.',
		status: 'proposal_ready',
		trigger: 'chat',
		context_type: 'project',
		project_id: 'project-1',
		project: { id: 'project-1', name: 'Author Training' },
		scope_mode: 'read_write',
		review_required: true,
		allowed_ops: null,
		result: null,
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
					before: { title: 'START HERE' },
					after: { content: 'Updated content' },
					rationale: 'Capture durable decisions from the chat.'
				}
			]
		},
		metrics: null,
		error: null,
		instructions: null,
		expected_output: null,
		budgets: {},
		user_id: 'user-1',
		parent_session_id: 'session-1',
		parent_message_id: null,
		parent_run_id: null,
		operative_id: null,
		source_suggestion_id: null,
		source_decision: null,
		created_at: '2026-07-14T12:00:00.000Z',
		updated_at: '2026-07-14T12:01:00.000Z',
		started_at: '2026-07-14T12:00:01.000Z',
		completed_at: null
	} as AgentRunRow;
}

describe('AgentRunDock', () => {
	afterEach(cleanup);

	it('shows project, action, target, preview, and friendly status', async () => {
		const onOpen = vi.fn();
		render(AgentRunDock, { props: { runs: [runRow()], activeCount: 1, onOpen } });

		const button = screen.getByRole('button', {
			name: 'Open Author Training: Update document · START HERE. Ready for review'
		});
		expect(screen.getByText('Update document · START HERE')).toBeInTheDocument();
		expect(screen.getByText('Ready for review')).toBeInTheDocument();
		expect(screen.getByText(/Author Training · Capture durable decisions/)).toBeInTheDocument();

		await fireEvent.click(button);
		expect(onOpen).toHaveBeenCalledWith('run-1');
	});
});
