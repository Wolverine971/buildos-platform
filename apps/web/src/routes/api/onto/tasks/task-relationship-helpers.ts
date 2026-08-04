// apps/web/src/routes/api/onto/tasks/task-relationship-helpers.ts
import {
	prepareRelationshipMutationPlan,
	type AutoOrganizeConnectionsRequest
} from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import type { EntityKind } from '$lib/services/ontology/edge-direction';

type TaskUpdateRelationshipInput = {
	supabase: AutoOrganizeConnectionsRequest['supabase'];
	projectId: string;
	taskId: string;
	connections: ConnectionRef[];
	hasPlanInput: boolean;
	hasGoalInput: boolean;
	hasMilestoneInput: boolean;
	hasParentInput: boolean;
	hasConnectionsInput: boolean;
};

export async function prepareTaskUpdateRelationshipPlan({
	supabase,
	projectId,
	taskId,
	connections,
	hasPlanInput,
	hasGoalInput,
	hasMilestoneInput,
	hasParentInput,
	hasConnectionsInput
}: TaskUpdateRelationshipInput) {
	const hasContainmentInput =
		hasPlanInput || hasGoalInput || hasParentInput || hasConnectionsInput;
	const hasSemanticInput = hasMilestoneInput;
	if (!hasContainmentInput && !hasSemanticInput) return null;

	const explicitKinds: EntityKind[] = [];
	if (hasConnectionsInput) {
		explicitKinds.push('goal', 'milestone');
	} else {
		if (hasGoalInput) explicitKinds.push('goal');
		if (hasMilestoneInput) explicitKinds.push('milestone');
	}

	return prepareRelationshipMutationPlan({
		supabase,
		projectId,
		entity: { kind: 'task', id: taskId },
		connections,
		options: {
			mode: 'replace',
			explicitKinds,
			skipContainment: !hasContainmentInput && hasSemanticInput
		},
		referencesValidated: true
	});
}
