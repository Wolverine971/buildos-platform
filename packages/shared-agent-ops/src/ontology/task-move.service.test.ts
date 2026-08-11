// packages/shared-agent-ops/src/ontology/task-move.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	TaskMoveServiceError,
	buildTaskMoveToolResult,
	compactTaskMoveResultForToolContext,
	moveOntoTaskAtomic
} from './task-move.service';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const TASK_ID = '20000000-0000-4000-8000-000000000002';
const SOURCE_ID = '30000000-0000-4000-8000-000000000003';
const DESTINATION_ID = '40000000-0000-4000-8000-000000000004';

function movedResult() {
	return {
		status: 'moved' as const,
		requires_user_action: false,
		task: {
			id: TASK_ID,
			title: 'Move me',
			project_id: DESTINATION_ID,
			description: 'Large body',
			props: { internal: true }
		},
		task_before: {
			id: TASK_ID,
			title: 'Move me',
			project_id: SOURCE_ID,
			props: { goal_id: 'old-goal' }
		},
		source_project: { id: SOURCE_ID, name: 'Source' },
		destination_project: { id: DESTINATION_ID, name: 'Destination' },
		impact: { relationships_to_detach: 1 },
		applied: { relationships_detached: 1 }
	};
}

describe('task move service', () => {
	it('uses the worker bridge, records both project diffs, and builds the legacy receipt', async () => {
		const rpc = vi.fn(async () => ({ data: movedResult(), error: null }));
		const logUpdate = vi.fn(async () => undefined);
		const result = await moveOntoTaskAtomic({
			client: { rpc } as never,
			taskId: TASK_ID,
			expectedSourceProjectId: SOURCE_ID,
			destinationProjectId: DESTINATION_ID,
			confirmationToken: null,
			caller: { kind: 'worker', userId: USER_ID },
			activity: {
				changedBy: USER_ID,
				changeSource: 'chat',
				chatSessionId: 'session-1',
				logUpdate: logUpdate as never
			}
		});

		expect(rpc).toHaveBeenCalledWith('onto_task_move_atomic_for_user', {
			p_user_id: USER_ID,
			p_task_id: TASK_ID,
			p_expected_source_project_id: SOURCE_ID,
			p_destination_project_id: DESTINATION_ID,
			p_confirmation_token: null
		});
		expect(logUpdate).toHaveBeenCalledTimes(2);
		expect((logUpdate.mock.calls[0] as unknown[])[4]).toMatchObject({
			project_id: SOURCE_ID,
			moved_to_project_id: DESTINATION_ID,
			props: { goal_id: 'old-goal' }
		});
		expect(buildTaskMoveToolResult(result)).toEqual({
			status: 'moved',
			requires_user_action: false,
			task: { id: TASK_ID, title: 'Move me', project_id: DESTINATION_ID },
			source_project: { id: SOURCE_ID, name: 'Source' },
			destination_project: { id: DESTINATION_ID, name: 'Destination' },
			impact: { relationships_to_detach: 1 },
			applied: { relationships_detached: 1 },
			message: 'Moved task "Move me" to "Destination"',
			context_shift: {
				new_context: 'project',
				entity_id: DESTINATION_ID,
				entity_name: 'Destination',
				entity_type: 'project',
				message: 'Focused the destination project "Destination" after moving the task.'
			}
		});
	});

	it('returns a compact authenticated preview without mutation activity', async () => {
		const preview = {
			status: 'confirmation_required' as const,
			requires_user_action: true,
			confirmation_token: 'preview-token',
			message: 'Confirm exact cleanup.',
			task: {
				id: TASK_ID,
				title: 'Move me',
				project_id: SOURCE_ID,
				description: 'Large body'
			},
			source_project: { id: SOURCE_ID, name: 'Source' },
			destination_project: { id: DESTINATION_ID, name: 'Destination' },
			impact: { relationships_to_detach: 1 }
		};
		const rpc = vi.fn(async () => ({ data: preview, error: null }));
		const logUpdate = vi.fn();
		const result = await moveOntoTaskAtomic({
			client: { rpc } as never,
			taskId: TASK_ID,
			expectedSourceProjectId: SOURCE_ID,
			destinationProjectId: DESTINATION_ID,
			caller: { kind: 'authenticated' },
			activity: { changedBy: USER_ID, logUpdate: logUpdate as never }
		});

		expect(rpc).toHaveBeenCalledWith('onto_task_move_atomic', {
			p_task_id: TASK_ID,
			p_expected_source_project_id: SOURCE_ID,
			p_destination_project_id: DESTINATION_ID,
			p_confirmation_token: null
		});
		expect(logUpdate).not.toHaveBeenCalled();
		expect(compactTaskMoveResultForToolContext(result).task).toEqual({
			id: TASK_ID,
			title: 'Move me',
			project_id: SOURCE_ID
		});
		expect(buildTaskMoveToolResult(result)).toMatchObject({
			status: 'confirmation_required',
			requires_user_action: true,
			confirmation_token: 'preview-token',
			message: 'Confirm exact cleanup.'
		});
	});

	it('maps authoritative rollback errors to typed failures', async () => {
		const rpc = vi.fn(async () => ({
			data: null,
			error: { message: 'task_move_impact_changed', code: 'P0001' }
		}));

		await expect(
			moveOntoTaskAtomic({
				client: { rpc } as never,
				taskId: TASK_ID,
				expectedSourceProjectId: SOURCE_ID,
				destinationProjectId: DESTINATION_ID,
				caller: { kind: 'authenticated' }
			})
		).rejects.toMatchObject({
			name: 'TaskMoveServiceError',
			code: 'impact_changed'
		} satisfies Partial<TaskMoveServiceError>);
	});

	it('rejects a malformed success before it reaches callers', async () => {
		const rpc = vi.fn(async () => ({
			data: {
				...movedResult(),
				task: { id: TASK_ID, project_id: SOURCE_ID }
			},
			error: null
		}));

		await expect(
			moveOntoTaskAtomic({
				client: { rpc } as never,
				taskId: TASK_ID,
				expectedSourceProjectId: SOURCE_ID,
				destinationProjectId: DESTINATION_ID,
				caller: { kind: 'worker', userId: USER_ID }
			})
		).rejects.toMatchObject({ code: 'invalid_response' });
	});
});
