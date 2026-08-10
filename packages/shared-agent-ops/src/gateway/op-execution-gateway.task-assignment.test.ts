import { describe, expect, it, vi } from 'vitest';
import { resolveGatewayTaskAssignees } from './op-execution-gateway.task-assignment';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const SAM_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ID = '44444444-4444-4444-8444-444444444444';

function adminWithMembers(members: unknown[]) {
	return {
		from: vi.fn(() => ({
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					is: vi.fn(async () => ({ data: members, error: null }))
				}))
			}))
		}))
	};
}

describe('resolveGatewayTaskAssignees', () => {
	it('merges active explicit actors and normalized handles', async () => {
		const admin = adminWithMembers([
			{
				actor_id: SAM_ID,
				actor: { id: SAM_ID, name: 'Sam Person', email: 'sam@example.com' }
			}
		]);

		await expect(
			resolveGatewayTaskAssignees({
				admin,
				projectId: PROJECT_ID,
				projectOwnerActorId: OWNER_ID,
				args: {
					assignee_actor_ids: [OWNER_ID],
					assignee_handles: ['@sam']
				}
			})
		).resolves.toEqual({
			hasInput: true,
			assigneeActorIds: [OWNER_ID, SAM_ID]
		});
	});

	it('rejects removed or cross-project actor IDs before the atomic RPC', async () => {
		const admin = adminWithMembers([]);

		await expect(
			resolveGatewayTaskAssignees({
				admin,
				projectId: PROJECT_ID,
				projectOwnerActorId: OWNER_ID,
				args: { assignee_actor_ids: [OTHER_ID] }
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: `Assignees must be active project members: ${OTHER_ID}`
		});
	});

	it('clears assignees without an unnecessary member-directory query', async () => {
		const admin = adminWithMembers([]);

		await expect(
			resolveGatewayTaskAssignees({
				admin,
				projectId: PROJECT_ID,
				projectOwnerActorId: OWNER_ID,
				args: { assignee_actor_ids: [] }
			})
		).resolves.toEqual({ hasInput: true, assigneeActorIds: [] });
		expect(admin.from).not.toHaveBeenCalled();
	});
});
