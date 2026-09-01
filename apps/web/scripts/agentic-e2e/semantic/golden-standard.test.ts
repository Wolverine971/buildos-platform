// apps/web/scripts/agentic-e2e/semantic/golden-standard.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
	GOLDEN_SCENARIOS,
	gradeGoldenRun,
	type GoldenChange,
	type GoldenExecution
} from './golden-standard';

function uuid(index: number): string {
	return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function entityMap(): Map<string, string> {
	const keys = new Set(
		Object.values(GOLDEN_SCENARIOS).flatMap((scenario) => [
			...scenario.requiredReadKeys,
			...scenario.requiredUpdateKeys,
			...scenario.allowedExistingTouchKeys,
			...scenario.decoyKeys
		])
	);
	return new Map([...keys].map((key, index) => [key, uuid(index + 1)]));
}

function execution(
	params: Partial<GoldenExecution> & Pick<GoldenExecution, 'id'>
): GoldenExecution {
	return {
		tool_category: 'read',
		gateway_op: 'onto.search',
		arguments: {},
		result: {},
		success: true,
		mutation_mode: null,
		proposed_change_id: null,
		created_at: '2026-08-31T12:00:00.000001Z',
		...params
	};
}

function stagedExecutions(changes: GoldenChange[]): GoldenExecution[] {
	return changes.map((change, index) =>
		execution({
			id: `write-${String(index).padStart(2, '0')}`,
			tool_category: 'write',
			gateway_op: change.op,
			arguments: change.after ?? {},
			result: { staged: true },
			mutation_mode: 'stage',
			proposed_change_id: change.id,
			created_at: `2026-08-31T12:00:01.${String(index).padStart(6, '0')}Z`
		})
	);
}

describe('semantic golden-standard grader', () => {
	it('passes a fully grounded GS-1 proposal', () => {
		const scenario = GOLDEN_SCENARIOS.gs1;
		const entities = entityMap();
		const projectId = uuid(999);
		const changes: GoldenChange[] = scenario.requiredUpdateKeys.map((key, index) => ({
			id: `change-${index}`,
			op: `onto.${key.slice(0, key.indexOf(':'))}.update`,
			entity_type: key.slice(0, key.indexOf(':')),
			entity_id: entities.get(key),
			action: 'update',
			before: { id: entities.get(key), updated_at: '2026-08-31T11:00:00Z' },
			after: {
				id: entities.get(key),
				direction:
					'bike commuter positioning: waterproof office pack, field-notes voice, no discount offers'
			},
			decision: 'pending'
		}));
		const executions = [
			execution({
				id: 'read-all',
				result: {
					results: scenario.requiredReadKeys.map((key) => ({ id: entities.get(key) }))
				}
			}),
			...stagedExecutions(changes)
		];
		const grade = gradeGoldenRun({
			scenario,
			projectId,
			entityIds: entities,
			run: {
				id: uuid(800),
				status: 'proposal_ready',
				review_required: true,
				scope_mode: 'read_write',
				project_id: projectId,
				change_set: { status: 'pending', changes }
			},
			executions,
			liveStateUnchanged: true
		});

		assert.equal(
			grade.pass,
			true,
			grade.checks
				.filter((entry) => !entry.pass)
				.map((entry) => entry.detail)
				.join('\n')
		);
	});

	it('passes a nested GS-2 campaign with three plan/goal-linked tasks', () => {
		const scenario = GOLDEN_SCENARIOS.gs2;
		const entities = entityMap();
		const projectId = uuid(999);
		const planId = entities.get('plan:Q2 demand push')!;
		const goalId = entities.get('goal:Grow direct sales to 40% of revenue')!;
		const campaignParentId = entities.get('document:Campaigns')!;
		const changes: GoldenChange[] = [
			{
				id: 'campaign-change',
				op: 'onto.document.create',
				entity_type: 'document',
				action: 'create',
				after: {
					project_id: projectId,
					parent_document_id: campaignParentId,
					title: 'City Miles Instagram Series',
					content:
						'Six-week bike commuter campaign for a waterproof office pack: three Reels and two carousel posts weekly in the field-notes voice, with no discount codes.'
				},
				decision: 'pending'
			},
			...[
				'Build six-week content calendar',
				'Recruit commuter creator partners',
				'Report saves and profile visits'
			].map(
				(title, index): GoldenChange => ({
					id: `task-change-${index}`,
					op: 'onto.task.create',
					entity_type: 'task',
					action: 'create',
					after: { project_id: projectId, title, plan_id: planId, goal_id: goalId },
					decision: 'pending'
				})
			)
		];
		const executions = [
			execution({
				id: 'read-all',
				result: {
					results: scenario.requiredReadKeys.map((key) => ({ id: entities.get(key) }))
				}
			}),
			execution({
				id: 'campaign-initial-draft',
				tool_category: 'write',
				gateway_op: 'onto.document.create',
				arguments: {
					project_id: projectId,
					title: 'City Miles Instagram Series'
				},
				result: { staged: true, proposed_change_replaced: false },
				mutation_mode: 'stage',
				proposed_change_id: 'campaign-change',
				created_at: '2026-08-31T12:00:00.500000Z'
			}),
			...stagedExecutions(changes)
		];
		const grade = gradeGoldenRun({
			scenario,
			projectId,
			entityIds: entities,
			run: {
				id: uuid(801),
				status: 'proposal_ready',
				review_required: true,
				scope_mode: 'read_write',
				project_id: projectId,
				change_set: { status: 'pending', changes }
			},
			executions,
			liveStateUnchanged: true
		});

		assert.equal(
			grade.pass,
			true,
			grade.checks
				.filter((entry) => !entry.pass)
				.map((entry) => entry.detail)
				.join('\n')
		);
		assert.match(
			grade.checks.find((entry) => entry.id === 'staged_only')?.detail ?? '',
			/5 staged receipts cover 4\/4 changes/
		);
	});

	it('fails when a proposal references a decoy or writes before reading', () => {
		const scenario = GOLDEN_SCENARIOS.gs1;
		const entities = entityMap();
		const projectId = uuid(999);
		const key = scenario.requiredUpdateKeys[0]!;
		const change: GoldenChange = {
			id: 'unsafe-change',
			op: 'onto.document.update',
			entity_type: 'document',
			entity_id: entities.get(key),
			action: 'update',
			after: {
				document_id: entities.get(key),
				linked_decoy: entities.get('document:Fulfillment runbook')
			}
		};
		const duplicate = { ...change, id: 'unsafe-duplicate' };
		const grade = gradeGoldenRun({
			scenario,
			projectId,
			entityIds: entities,
			run: {
				id: uuid(802),
				status: 'proposal_ready',
				review_required: true,
				scope_mode: 'read_write',
				project_id: projectId,
				change_set: { status: 'pending', changes: [change, duplicate] }
			},
			executions: stagedExecutions([change, duplicate]),
			liveStateUnchanged: true
		});

		assert.equal(grade.pass, false);
		assert.equal(grade.checks.find((entry) => entry.id === 'zero_decoys')?.pass, false);
		assert.equal(grade.checks.find((entry) => entry.id === 'grounding')?.pass, false);
		assert.equal(
			grade.checks.find((entry) => entry.id === 'no_duplicate_updates')?.pass,
			false
		);
	});

	it('fails when a staged relationship contains a placeholder instead of a UUID', () => {
		const scenario = GOLDEN_SCENARIOS.gs2;
		const entities = entityMap();
		const projectId = uuid(999);
		const change: GoldenChange = {
			id: 'placeholder-edge',
			op: 'onto.edge.link',
			entity_type: 'edge',
			action: 'create',
			after: {
				project_id: projectId,
				src_kind: 'task',
				src_id: 'PLACEHOLDER_FOR_TASK_ID',
				dst_kind: 'goal',
				dst_id: entities.get('goal:Grow direct sales to 40% of revenue'),
				rel: 'supports_goal'
			}
		};
		const grade = gradeGoldenRun({
			scenario,
			projectId,
			entityIds: entities,
			run: {
				id: uuid(803),
				status: 'proposal_ready',
				review_required: true,
				scope_mode: 'read_write',
				project_id: projectId,
				change_set: { status: 'pending', changes: [change] }
			},
			executions: stagedExecutions([change]),
			liveStateUnchanged: true
		});

		assert.equal(grade.pass, false);
		assert.equal(grade.checks.find((entry) => entry.id === 'valid_id_references')?.pass, false);
	});
});
