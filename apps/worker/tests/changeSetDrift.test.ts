// apps/worker/tests/changeSetDrift.test.ts
import { describe, expect, it } from 'vitest';
import { commitChangeSet } from '@buildos/shared-agent-ops';
import type { ChangeSet } from '@buildos/shared-types';

const RUN_ID = 'run-1';
const USER_ID = '00000000-0000-4000-8000-000000000000';

type FakeState = {
	run: Record<string, unknown>;
	currentTask: Record<string, unknown> | null;
	inserts: Array<{ table: string; payload: Record<string, unknown> }>;
	finalRunUpdate: Record<string, unknown> | null;
};

class FakeQuery {
	private updatePayload: Record<string, unknown> | null = null;
	private selected = false;

	constructor(
		private readonly table: string,
		private readonly state: FakeState
	) {}

	select(_columns?: string) {
		this.selected = true;
		return this;
	}

	update(payload: Record<string, unknown>) {
		this.updatePayload = payload;
		return this;
	}

	eq(_column: string, _value: unknown) {
		return this;
	}

	async maybeSingle() {
		if (this.table === 'agent_runs' && !this.updatePayload) {
			return { data: this.state.run, error: null };
		}
		if (this.table === 'agent_runs' && this.updatePayload?.status === 'running') {
			return { data: { id: this.state.run.id }, error: null };
		}
		if (this.table === 'onto_tasks') {
			return { data: this.state.currentTask, error: null };
		}
		return { data: null, error: null };
	}

	async insert(payload: Record<string, unknown>) {
		this.state.inserts.push({ table: this.table, payload });
		return { error: null };
	}

	then<TResult1 = { error: null }, TResult2 = never>(
		onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
	): Promise<TResult1 | TResult2> {
		if (this.table === 'agent_runs' && this.updatePayload && !this.selected) {
			this.state.finalRunUpdate = this.updatePayload;
		}
		return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
	}
}

function createFakeAdmin(state: FakeState) {
	return {
		from(table: string) {
			return new FakeQuery(table, state);
		}
	} as any;
}

describe('commitChangeSet drift detection', () => {
	it('fails an approved update when the current row no longer matches the reviewed snapshot', async () => {
		const beforeTask = {
			id: 'task-1',
			project_id: 'project-1',
			title: 'Reviewed title',
			description: null,
			type_key: null,
			state_key: null,
			priority: null,
			start_at: null,
			due_at: null,
			completed_at: null,
			props: null,
			created_at: '2026-06-01T00:00:00Z',
			updated_at: '2026-06-01T00:00:00Z',
			archived_at: null,
			deleted_at: null
		};
		const changeSet: ChangeSet = {
			run_id: RUN_ID,
			status: 'pending',
			created_at: '2026-06-19T00:00:00Z',
			changes: [
				{
					id: 'change-1',
					op: 'onto.task.update',
					entity_type: 'task',
					entity_id: 'task-1',
					action: 'update',
					before: beforeTask,
					after: { task_id: 'task-1', title: 'Agent title' },
					rationale: 'Update the task title',
					decision: 'pending'
				}
			]
		};
		const state: FakeState = {
			run: {
				id: RUN_ID,
				user_id: USER_ID,
				status: 'proposal_ready',
				change_set: changeSet,
				allowed_ops: ['onto.task.update'],
				context_type: 'global',
				project_id: null,
				result: {}
			},
			currentTask: { ...beforeTask, title: 'User edited title' },
			inserts: [],
			finalRunUpdate: null
		};

		const outcome = await commitChangeSet({
			admin: createFakeAdmin(state),
			runId: RUN_ID,
			userId: USER_ID
		});

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.result.applied).toBe(0);
		expect(outcome.result.failed).toBe(1);
		expect(outcome.result.run_status).toBe('partial');
		expect(outcome.result.change_set.changes[0].error).toContain('stale');
		expect(state.inserts).toHaveLength(1);
		expect(state.inserts[0]).toMatchObject({
			table: 'agent_tool_executions',
			payload: {
				success: false,
				tool_name: 'onto.task.update',
				proposed_change_id: 'change-1',
				entity_kind: 'task',
				entity_id: 'task-1'
			}
		});
		expect(state.finalRunUpdate?.status).toBe('partial');
	});
});
