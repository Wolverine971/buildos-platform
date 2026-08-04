// apps/web/src/routes/api/onto/tasks/task-relationship-helpers.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prepareRelationshipMutationPlanMock = vi.fn();

vi.mock('$lib/services/ontology/auto-organizer.service', () => ({
	prepareRelationshipMutationPlan: prepareRelationshipMutationPlanMock
}));

const baseInput = {
	supabase: {} as any,
	projectId: 'project-1',
	taskId: 'task-1',
	connections: [],
	hasPlanInput: false,
	hasGoalInput: false,
	hasMilestoneInput: false,
	hasParentInput: false,
	hasConnectionsInput: false
};

describe('prepareTaskUpdateRelationshipPlan', () => {
	beforeEach(() => {
		prepareRelationshipMutationPlanMock.mockReset();
		prepareRelationshipMutationPlanMock.mockResolvedValue({ planned: true });
	});

	it('skips relationship planning for ordinary task field updates', async () => {
		const { prepareTaskUpdateRelationshipPlan } = await import('./task-relationship-helpers');

		await expect(prepareTaskUpdateRelationshipPlan(baseInput)).resolves.toBeNull();
		expect(prepareRelationshipMutationPlanMock).not.toHaveBeenCalled();
	});

	it('replaces explicit goal and milestone kinds for a connections payload', async () => {
		const { prepareTaskUpdateRelationshipPlan } = await import('./task-relationship-helpers');
		const connections = [{ kind: 'goal' as const, id: 'goal-1' }];

		await prepareTaskUpdateRelationshipPlan({
			...baseInput,
			connections,
			hasConnectionsInput: true
		});

		expect(prepareRelationshipMutationPlanMock).toHaveBeenCalledWith({
			supabase: baseInput.supabase,
			projectId: 'project-1',
			entity: { kind: 'task', id: 'task-1' },
			connections,
			options: {
				mode: 'replace',
				explicitKinds: ['goal', 'milestone'],
				skipContainment: false
			},
			referencesValidated: true
		});
	});

	it('preserves containment for a semantic-only milestone update', async () => {
		const { prepareTaskUpdateRelationshipPlan } = await import('./task-relationship-helpers');

		await prepareTaskUpdateRelationshipPlan({
			...baseInput,
			hasMilestoneInput: true
		});

		expect(prepareRelationshipMutationPlanMock).toHaveBeenCalledWith(
			expect.objectContaining({
				options: {
					mode: 'replace',
					explicitKinds: ['milestone'],
					skipContainment: true
				}
			})
		);
	});
});
