// apps/web/src/routes/api/onto/tasks/create/request-parser.ts
import type { toParentRefs } from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';

type ParentInput = NonNullable<Parameters<typeof toParentRefs>[0]>['parent'];
type ParentsInput = NonNullable<Parameters<typeof toParentRefs>[0]>['parents'];

export interface ParsedTaskCreateBody {
	project_id: unknown;
	title: unknown;
	description?: unknown;
	type_key?: unknown;
	priority: unknown;
	plan_id?: unknown;
	state_key: unknown;
	goal_id?: unknown;
	supporting_milestone_id?: unknown;
	start_at?: unknown;
	due_at?: unknown;
	props?: unknown;
	parent?: ParentInput;
	parents?: ParentsInput;
	connections?: ConnectionRef[];
	classificationSource: unknown;
}

export const parseTaskCreateBody = (body: Record<string, unknown>): ParsedTaskCreateBody => {
	const {
		project_id,
		title,
		description,
		type_key,
		priority = 3,
		plan_id,
		state_key = 'todo',
		goal_id,
		supporting_milestone_id,
		start_at,
		due_at,
		props,
		parent,
		parents,
		connections
	} = body;

	return {
		project_id,
		title,
		description,
		type_key,
		priority,
		plan_id,
		state_key,
		goal_id,
		supporting_milestone_id,
		start_at,
		due_at,
		props,
		parent: parent as ParentInput | undefined,
		parents: parents as ParentsInput | undefined,
		connections: (connections as ConnectionRef[] | undefined) ?? undefined,
		classificationSource: body.classification_source ?? body.classificationSource
	};
};
