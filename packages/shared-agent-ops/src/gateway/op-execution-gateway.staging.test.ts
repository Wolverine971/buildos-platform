// packages/shared-agent-ops/src/gateway/op-execution-gateway.staging.test.ts
import { describe, expect, it } from 'vitest';
import { stageGatewayWriteOp } from './op-execution-gateway.staging';

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const GOAL_ID = '00000000-0000-4000-8000-000000000002';

describe('review-mode gateway staging validation', () => {
	it('rejects a placeholder edge endpoint before recording an uncommittable proposal', async () => {
		const result = await stageGatewayWriteOp({
			admin: {} as never,
			userId: '00000000-0000-4000-8000-000000000003',
			scope: {
				mode: 'read_write',
				project_ids: [PROJECT_ID],
				write_project_ids: [PROJECT_ID],
				allowed_ops: ['onto.edge.link']
			},
			op: 'onto.edge.link',
			args: {
				project_id: PROJECT_ID,
				from_type: 'task',
				from_id: 'PLACEHOLDER_FOR_TASK_ID',
				to_type: 'goal',
				to_id: GOAL_ID,
				relationship: 'contributes_to'
			}
		});

		expect(result).toEqual({
			ok: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: 'src_id must be a valid UUID'
			}
		});
	});

	it('stores canonical task fields so the approved proposal can commit verbatim', async () => {
		const result = await stageGatewayWriteOp({
			admin: {} as never,
			userId: '00000000-0000-4000-8000-000000000003',
			scope: {
				mode: 'read_write',
				project_ids: [PROJECT_ID],
				write_project_ids: [PROJECT_ID],
				allowed_ops: ['onto.task.create']
			},
			op: 'onto.task.create',
			args: {
				project_id: PROJECT_ID,
				name: 'Build the content calendar',
				state_key: 'draft'
			}
		});

		expect(result).toMatchObject({
			ok: true,
			change: {
				op: 'onto.task.create',
				action: 'create',
				after: {
					project_id: PROJECT_ID,
					title: 'Build the content calendar',
					state_key: 'todo'
				}
			}
		});
	});
});
